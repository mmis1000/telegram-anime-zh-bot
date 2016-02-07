request = require 'request'
fs = require 'fs'
path = require 'path'

expireTime = 30 * 60 * 1000

encodeStr = (str)->
	(((new Buffer str).toString 'base64').replace /\+/g, '-').replace /\//g, '_'

getFile = (url, cb)->
	name = encodeStr url
	filePath = path.resolve __dirname, 'cache', "#{name}.html"
	metaPath = path.resolve __dirname, 'cache', "#{name}.meta.json"
	
	try
		meta = JSON.parse fs.readFileSync metaPath
		etag = meta.etag
		expire = meta.expire
		
		if expire > Date.now()
			console.error "#{url} use cache directly..."
			console.error "#{expire - Date.now()} ms until cache expire"
			
			fs.readFile filePath, {encoding : 'utf8'}, (err, file)->
				if err or not file
					err = err or new Error 'file empty'
					
					console.error "#{url} Error during load cache, redownloading..."
					meta = {}
					queryFile url, null, (err, res, body)->
						if err or res.statusCode isnt 200
							return cb err or new Error 'bad response'
						
						meta.expire = expireTime + Date.now()
						meta.etag = res.headers.etag
						fs.writeFileSync metaPath, JSON.stringify meta, 0, 4
						
						# console.error res.headers
						console.error "#{url} create cache..."
						fs.writeFile filePath, body, (err)->
							if err
								console.error err
						cb null, body
					return
				cb null, file
		else
			queryFile url, etag, (err, res, body)->
				if err
					return cb err, null
				if res.statusCode is 304
					meta.expire = expireTime + Date.now()
					fs.writeFileSync metaPath, JSON.stringify meta, 0, 4
					console.error "#{url} 304 use data from cache..."
					fs.readFile filePath, {encoding : 'utf8'}, cb
				if res.statusCode is 200
					meta.expire = expireTime + Date.now()
					meta.etag = res.headers.etag
					# console.error res.headers
					console.error "#{url} update cache..."
					fs.writeFileSync metaPath, JSON.stringify meta, 0, 4
					fs.writeFile filePath, body, (err)->
						if err
							console.error err
					cb err, body
	catch
		meta = {}
		queryFile url, null, (err, res, body)->
			if err or res.statusCode isnt 200
				return cb err or new Error 'bad response'
			
			meta.expire = expireTime + Date.now()
			meta.etag = res.headers.etag
			fs.writeFileSync metaPath, JSON.stringify meta, 0, 4
			
			# console.error res.headers
			console.error "#{url} create cache..."
			fs.writeFile filePath, body, (err)->
				if err
					console.error err
			cb null, body

queryFile = (url, etag, cb)->
	if etag
		request url, {
			headers: {
				"If-None-Match": etag
			}
		}, cb
	else
		request url, cb

module.exports = getFile
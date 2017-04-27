cheerio = require 'cheerio'
getFile = require './getFile.coffee'
Link = require './link.coffee'
chineseConv = require 'chinese-conv'
url = require 'url'

getBaha = (cb)->
	resMap = {}
	
	todo = 0

	todo++
	
	getFile "http://ani.gamer.com.tw/animeList.php", (err, body)->
		if err
			return cb err
		# console.log body
		$ = cheerio.load body
		list = ($ '.class_list > ul > li > a').filter ()->
			_ = $ @
			!!((_.attr 'href').match /\?/)
		.map ()->
			_ = $ @
			link = url.resolve 'http://ani.gamer.com.tw/animeList.php', _.attr 'href'
			# console.log (_.text()), link
			{
				name: _.text(),
				link
			}
		.toArray()
		
		console.error list
		
		findCategory
		
		list.forEach (item)->
			findCategory item
		todo--
		
	findCategory = (item)->
		todo++
		getFile item.link, (err, body)->
			$ = cheerio.load body
			last = parseInt (($ '.page_number a:last-child').text()), 10
			
			for i in [1..last]
				link = item.link + "&page=#{i}"
				console.error link
				findPage link, item
			todo--

	findPage = (link, item)->
		todo++
		getFile link, (err, body)->
			$ = cheerio.load body
			$ '.anime_list > li > a'
			.each ()->
				_ = $ @
				link = url.resolve link, _.attr 'href'
				console.error link
				imageLink = _.find 'div'
				.attr 'data-bg'
				
				findWork link, item, imageLink
			todo--
				
			# console.log body
			# console.log body
	findWork = (link, item, imageLink)->
		todo++
		getFile link, (err, body)->
			try
				$ = cheerio.load body
			catch err
				console.error "error during parse #{link} ignoring..."
				todo--
				return
			# console.log body
			# console.log body
			
			id = ($ '.anime_name h1').text()
			title = id
			description = ($ '.data_intro p').text()
			category = item.name
			link = link
			
			todo--
			
			resMap[id] = resMap[id] || {}
			
			resMap[id].id = id
			resMap[id].items = resMap[id].items or [{
				description: description
				link: link
				category: []
				image: imageLink
				publishDate: new Date($('.anime_name p').text().replace(/^上架時間：|\s\d\d:\d\d:\d\d$/g, ''))
			}]
			
			resMap[id].publishDate = new Date($('.anime_name p').text().replace(/^上架時間：|\s\d\d:\d\d:\d\d$/g, ''))
			resMap[id].items[0].category.push category
			
			resMap[id].links = [new Link link, ($ 'title').text()]
			resMap[id].names = [chineseConv.sify title.replace /\s*\[.+\]$/, '']
			resMap[id].images = [imageLink]
			if not description.match /^\s*$/
				resMap[id].descriptions = [description]
			else
				resMap[id].descriptions = []
			
			check()
		
	check = ()->
		if todo is 0
			finalRes = Object.keys resMap
			.map (key)->
				resMap[key]
				
			cb null, finalRes
			
			###
			result = mergeResult result, finalRes
			
			result = {
				counts: result.length,
				lastUpdate: Date.now(),
				items: result
			}
			
			console.log JSON.stringify result, 0, 4
				
			console.error Date.now() - start
			###

module.exports = getBaha
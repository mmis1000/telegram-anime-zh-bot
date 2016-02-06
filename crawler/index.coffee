request = require 'request'
cheerio = require 'cheerio'
url = require 'url'
levenshtein = require 'fast-levenshtein'
chineseConv = require 'chinese-conv'
Q = require 'q'

getFile = require './getFile.coffee'
# sify(text)

uniqueItems = require './unique_items.coffee'


mergeResult = (res1, res2)->

	tempRes = res1.map (item1)->
	
		closestDist = Infinity
		matchedItem = null
		index = -1
		
		item1.names.forEach (name1)->
			res2.forEach (item2, i)->
				
				item2.names.forEach (name2)->
					
					newDist = (levenshtein.get name1, name2) / name1.length
					
					if newDist >= 0.5 
						return
					if item1.airDate and item2.publishDate and item1.airDate > item2.publishDate
						return
					
					if newDist < closestDist
						index = i
						closestDist = newDist
						matchedItem = item2
			
		newItem = JSON.parse JSON.stringify item1
		
		if matchedItem
			for name, value of matchedItem
				if Array.isArray value
					if Array.isArray newItem[name]
						newItem[name] = uniqueItems matchedItem[name].concat newItem[name]
					else if newItem[name]?
						newItem[name] = uniqueItems matchedItem[name].concat [newItem[name]]
					else 
						newItem[name] = matchedItem[name]
			###
			newItem.items = newItem.items.concat matchedItem.items
			newItem.names = uniqueItems newItem.names.concat matchedItem.names
			newItem.links = newItem.links.concat matchedItem.links
			###
			res2.splice index, 1
		
		newItem
	
	tempRes.concat res2

start = Date.now()

getBaha = require './get_baha.coffee'
getBgmTv = require './get_bgm_tv.coffee'
get2dGate = require './get_2d_gate.coffee'

result = null

start = Date.now()

getBgmTv (err, res)->
	result = res
	console.error Date.now() - start
	
	get2dGate (err, res)->
		result = mergeResult result, res
		console.error Date.now() - start
		
		getBaha (err, res)->
			result = mergeResult result, res
			result = {
				counts: result.length,
				lastUpdate: Date.now(),
				items: result
			}
			
			console.log JSON.stringify result, 0, 4
				
			console.error Date.now() - start
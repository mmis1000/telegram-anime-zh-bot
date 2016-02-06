getFile = require './getFile.coffee'
chineseConv = require 'chinese-conv'
Link = require './link.coffee'

getBgmTv = (cb)->
	result = []

	getFile "http://api.bgm.tv/calendar", (err, body)->
		if err
			return cb err
		body = JSON.parse body
		
		final = body.map (item)->
			item.itemTexts = item.items.map (item)->
				"  #{item.name_cn} #{item.url}"
			
			return """
			#{item.weekday.cn}:
			#{item.itemTexts.join '\r\n'}
			"""
		.join '\r\n'
		
		console.error final
		
		names = {}
		
		body.map (item)->
			item.itemTexts = item.items.map (item)->
			
				if names[item.name_cn] is true
					return
				names[item.name_cn] = true
				
				result.push {
					id: item.name_cn,
					items: [item],
					names: [(chineseConv.sify item.name_cn), (chineseConv.sify item.name)],
					links: [new Link item.url, item.name_cn],
					images: [item.images.large],
					descriptions: [],
					airDate: new Date item.air_date
				}
				
	cb null, result

module.exports = getBgmTv
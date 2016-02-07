getFile = require './getFile.coffee'
chineseConv = require 'chinese-conv'
Link = require './link.coffee'
uniqueItems = require './unique_items.coffee'

decodeHTML = do ()->
	map = {
		amp: '&'
		lt: '<'
		gt: '>'
	}
	(str)->
		str.replace /&(amp|lt|gt);/g, (all, part)-> map[part]
	

get2dGate = (cb)->
	getFile 'http://2d-gate.org/onlineAnimeList/__cache.json', (err, body)->
		if err
			return cb err
		
		body = JSON.parse body
		
		
		resTemp = body.threads.map (item)->
			temp = [
				decodeHTML (item.subject.replace /\[.+?\]|^\s+|\s+$/g, "").replace /^\s+|\s+$/, ""
			]
			
			temp2 = item.extra.split /[,|、｜、]/g
			.map (item)-> item.replace /^\s+|\s+$/g, ''
			
			temp = temp.concat temp2
			temp = temp.map (i)->
				decodeHTML chineseConv.sify i
			
			{
				id: (decodeHTML (item.subject.replace /\[.+?\]|^\s+|\s+$/g, "").replace /^\s+|\s+$/, ""),
				items: [item],
				names: (uniqueItems temp),
				links: [new Link "http://2d-gate.org/thread-#{item.tid}-1-1.html", decodeHTML item.subject],
				images: [item.pic],
				descriptions: [item.intro],
				publishDate: new Date item.dateline * 1000
			}
		
		cb null, resTemp

module.exports = get2dGate
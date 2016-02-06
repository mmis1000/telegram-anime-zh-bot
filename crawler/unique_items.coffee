
uniqueItems = (arr)->
	dic = {}
	newArr = []
	arr.forEach (item)->
		if 'string' is typeof item
			if dic[item] is true
				return
			dic[item] = true
		newArr.push item
		
	newArr

module.exports = uniqueItems
// var telegram = require('telegram-bot-api');
var request = require('request');

var levenshtein = require('fast-levenshtein')
var chineseConv = require('chinese-conv')
var fs = require('fs');
var child_process = require("child_process")
var cheerio = require("cheerio");

var datas = null;
var maxDetailedItem = 5;
var maxResult = 15;

try {
    datas = JSON.parse(fs.readFileSync('./data.json'));
} catch (err) {
    console.log('data not found, recreating now...');
    updateList();
}

setInterval(updateList, 60 * 60 * 1000);

function updateList() {
    var start = Date.now()
    console.log('updating list...')
    var child = child_process.fork('./crawler/index.js', [], {silent: true});
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    
    var res = ""
    var errRes = ""
    child.on('error', console.error.bind(console))
    
    child.stdout.on('data', function (data) {
        // console.log('stdout length:' + data.length);
        res += data;
    })
    child.stderr.on('data', function (data) {
        // console.log('stderr length:' + data.length);
        errRes += data;
    })
    child.on('close', function () {
        console.log('process finished, ' + new Date());
        console.log('update finished: total time ' + (Date.now() - start) + ' ms')
        try {
            datas = JSON.parse(res)
        } catch (e) {
            console.log("error during parse response, retry after 1 minute, error output: " + errRes)
            
            setTimeout(updateList, 60 * 1000)
            
            return
        }
        fs.writeFile('./crawler.log', errRes, function (err) {
            if (err) {
                console.log(err)
            }
        })
        fs.writeFile('./data.json', res, function (err) {
            if (err) {
                console.log(err)
            }
        })
    })
}


var gtoken = require('./config').token;
/*
var api = new telegram({
    token: gtoken,
    updates: {
		enabled: true
	}
});
*/
var TGAPI = require('./tg_api')
var api = new TGAPI(gtoken)

var selfData = null;

api.on('error', console.error.bind(console));

api.getMe(function(err, data)
{
    if (err) console.error(err);
    console.log(data);
    selfData = data;
    api.startPolling(40);
});



function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;");
 }

function encodeText(str) {
    return (new Buffer(str).toString('base64')).replace(/[^0-9a-z]/ig, function (c) {
        var pad = "0000"
        var str = c.charCodeAt(0).toString(16);
        switch (c) {
            case "_":
                return "__"
            default:
                return "_" + pad.substring(0, pad.length - str.length) + str;
        }
    })
}

function decodeText(str) {
    str = str.replace(/_(_|[0-9a-f]{4,4})/g, function (str, frag) {
        switch (frag) {
            case '_':
                return '_';
            default:
                return String.fromCharCode(parseInt(frag, 16));
        }
    })
    // console.log(str)
    str = (new Buffer(str , 'base64')).toString('utf8')
    // console.log(str)
    return str;
}

function toUnsignedInt(input) {
    if ('number' == typeof input) {
        input = Math.floor(input);
    } else if ('string' == typeof input) {
        input = parseInt(input, 10)
    } else {
        input = '' + input;
        input = parseInt(input, 10)
    }
    if (isNaN(input)) {
        return null;
    }
    if (input < 0) {
        return null;
    }
    return input;
}

function formatResult (result, noDetail) {
    // console.log(result);
    var $ = cheerio.load('<div>')
    var container = $('<div>');
    container.append(
        $('<div>').text('資源名稱:')
    ).append(
        $('<div>').text('* ' + result.id)
    )
    
    if (result.links.length) {
        container.append(
            $('<div>').text('連結: ')
        )
        result.links.forEach(function (link) {
            container.append(
                $('<div>').append(
                    $('<a>').attr('href', link.url).text(link.name)
                )
            )
        })
    }
    
    if (result.images.length && !noDetail) {
        var imageContainer = $('<div>').text('圖片: ')
        container.append(imageContainer);
        result.images.forEach(function (image, index) {
            if (index > 0) {
                imageContainer
                .append('<span>, ')
            }
            imageContainer.append(
                $('<a>').attr('href', image).text('圖')
            )
        })
    }
    if (result.descriptions.length && !noDetail) {
        container.append(
            $('<div>').text('敘述:')
        ).append(
            $('<div>').append(
                $('<pre>').text(result.descriptions[0].replace(/[\r\n\s]+/g, ' '))
            )
        )
    }
    var anotherNameContainer = $('<div>').text('所有名稱:')
    container.append(anotherNameContainer);
    
    result.names.forEach(function (name, index) {
        if (index > 0) {
            anotherNameContainer
            .append('<span>, ')
        }
        anotherNameContainer
        .append(
            $('<code>').text(name)
        )
    })
    
    return container.html().replace(/&#[xX]([0-9a-fA-F]{4,4});/g, function (item, text) {
        return String.fromCharCode(parseInt(text, 16))
    })
    .replace(/<div>/g, '')
    .replace(/<\/div>/g ,'\r\n')
    .replace(/<\/?span>/g, '')
    .replace(/<\/pre>[\s\r\n]+/ig, '</pre>') // ignore space after pre block
    .replace(/^\s+|\s+$/g, '') // ignore space at last and front
    ;
}

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function extractFlags (text) {
    var temp = text.match(/^((?:--?[a-z]+(?:=[^\s]*)?\s+)*)((?:.|[\r\n])*)$/i)
    // console.log(temp);
    var newText = temp[2].replace(/^--\s/, '');
    var flags = {};
    var temp2 = temp[1].match(/--?[a-z]+(?:=[^\s]*)?/ig)
    if (temp2) {
        temp2.forEach(function (flag) {
            var value = true;
            var hasValue = null;
            hasValue = !! flag.match(/^--?[a-z]+=/i);
            if (hasValue) {
                value = (/^--?[a-z]+=(.*)/i).exec(flag)[1];
                if (value.match(/^".*"$/)) {
                    try {
                      value = value.replace(/\\s/g, ' ');
                      value = JSON.parse(value) + '';
                    } catch (e) {
                        //ignore it
                    }
                }
            }
            if (!flag.match(/^--/)) {
                //simple flag
                var flagChars = flag.match(/^-([a-z]+)/i)[1];
                if (flagChars.length > 1 && hasValue) {
                    // it isn't make sense that multi flag has same value
                    return;
                }
                flagChars.split('').forEach(function(char) {
                    flags[char] = value;
                })
            } else {
                //long flag
                var flagName = flag.match(/^--([a-z]+)/i)[1];
                flags[flagName] = value;
            }
        })
    }
    return {
        flags: flags,
        text: newText
    }
}

api.on('message', function(message)
{
    console.log(message);
    
    if (!datas) {
        
        var targetId = message.chat.id;
        var additionOptions = {
            reply_to_message_id: message.message_id
        }
        sendText("啊...動畫娘正在忙著整理動畫呢，可以等一下再來嗎？", targetId, additionOptions)
        
        return;
    }
    
    
    if (message.text && message.text.match(/\/start([^a-z]|$)/i)) {
        var targetId = message.chat.id;
        var additionOptions = {
            reply_to_message_id: message.message_id,
            parse_mode: 'Markdown'
        }
        sendText("哈嘿～我是動畫娘，你好\r\n請用 `/anime <關鍵字>` 的格式告訴我你要找的動畫歐", targetId, additionOptions)
        return;
    }
    
    
    if (message.text && message.text.match(/^\/exec_(_(_|[0-9a-f]{4,4})|[0-9a-z])+($|@)/i)) {
        console.log('detect commamd link')
        var decodedText = decodeText(message.text.replace(/^\/exec_|@.*$/g, ''));
        console.log('decoded text: ' + decodedText);
        message.text = decodedText
    }
    
    if (message.text && message.text.match(new RegExp('^\/anime(@' + selfData.username +')?(\\s|$)', 'i'))) {
        var text = message.text.replace(new RegExp('^\/anime(@' + selfData.username +')?\\s*', 'i'), '');
        
        if (text.match(/^\s*$/)) {
            var targetId = message.chat.id;
            var additionOptions = {
                reply_to_message_id: message.message_id
            }
            sendText("啊哩哩？你到底你要我查啥啊？", targetId, additionOptions)
            return;
        }
        
        // console.log(text)
        // console.log(extractFlags(text));
        
        var temp = extractFlags(text)
        var flags = temp.flags
        var text = temp.text
    
        var matchedItems = [];
        
        var formatedText = chineseConv.sify(text).toLowerCase();
        var formatedTexts = formatedText.split(/\s+/g);
        
        var matchedItems = [];
        var resultPosibilitys = [];
        if (formatedTexts.length === 1) {
            console.log('// using single find mode');
            datas.items.forEach(function (item) {
                var posibility = {
                    item: item,
                    distance: Infinity,
                    sortOrder: Infinity,
                    closestName: null,
                    // not used in this mode
                    matchConfidence: 0
                }
                var matched = false;
                item.names.forEach(function (name) {
                    if (name.match(escapeRegExp(formatedText))) {
                        matched = true;
                    }
                    var currentDistance = levenshtein.get(formatedText, name) / name.length
                    if (currentDistance < posibility.distance) {
                        posibility.sortOrder = currentDistance
                        posibility.distance = currentDistance
                        posibility.closestName = name
                    }
                })
                resultPosibilitys.push(posibility)
                if (matched) {
                    posibility.matched = true;
                    matchedItems.push(posibility)
                }
            })
        } else {
            console.log('// using multi find mode');
            console.log('params: ' + JSON.stringify(formatedTexts))
            datas.items.forEach(function (item) {
                var posibility = {
                    item: item,
                    distance: Infinity,
                    sortOrder: 1,
                    closestName: null,
                    matchConfidence: 0
                }
                var matched = false;
                item.names.forEach(function (name) {
                    var confidence = 0;
                    formatedTexts.forEach(function (formatedText) {
                        if (name.match(escapeRegExp(formatedText))) {
                            confidence += 1 / formatedTexts.length;
                        }
                    })
                    if (confidence > posibility.matchConfidence) {
                        posibility.matchConfidence = confidence
                        posibility.sortOrder = 1 - confidence
                        posibility.closestName = name
                    }
                    if (confidence > 0.8) {
                        matched = true;
                    }
                    // if (confidence > 0) {
                       // console.log('debug start....')
                        //console.log(item, posibility)
                        //console.log('debug end....')
                    // }
                    var currentDistance = levenshtein.get(formatedText, name) / name.length
                    if (currentDistance < posibility.distance) {
                        posibility.distance = currentDistance
                    }
                })
                resultPosibilitys.push(posibility)
                if (matched) {
                    posibility.matched = true;
                    matchedItems.push(posibility)
                }
            })
            
        }
        var shouldDetail = (maxDetailedItem > matchedItems.length || flags.d) && !flags.s
        // console.log(matchedItems)
        var resultText = matchedItems.sort(function (a, b) {
            return a.sortOrder > b.sortOrder ? 1 : -1
        }).map(function (i) {
            return i.item
        }).slice(0, maxResult).map(function (item) {
            return formatResult(item, !shouldDetail);
        }).join('\r\n===========\r\n')
        
        
        if (!shouldDetail || matchedItems.length > maxResult) {
            resultText = "===========\r\n\r\n" + resultText
        }
        if (!shouldDetail) { 
            resultText = "啊，東西太多了，我幫你把一些東西隱藏起來了，點 /exec_" + encodeText(escapeHtml("/anime -d "+ text)) + " 可以查看詳細結果歐\r\n" + resultText;
        }
        if (matchedItems.length > maxResult) {
            resultText = "歐歐...太多結果了，有 <code>" + (matchedItems.length - maxResult) + "</code> 個結果被隱藏起來了呢 (|||ﾟдﾟ)\r\n" + resultText;
        }
        
        if (matchedItems.length === 0) {
            resultText = "找不到呢... (｡ŏ_ŏ)";
            var mostPotentialItem = resultPosibilitys.sort(function (a, b) {
                return a.sortOrder > b.sortOrder ? 1 : -1
            })[0]
            // console.log(mostPotentialItem)
            mostPotentialItem = mostPotentialItem.closestName
            
            if (mostPotentialItem) {
                resultText += "\r\n你是想找 \"" + mostPotentialItem + "\" 嗎？"
            }
        }
        
        var targetId = message.chat.id;
        var additionOptions = {
            reply_to_message_id: message.message_id,
            parse_mode: 'HTML'
        }
        if (matchedItems.length > 1) {
            additionOptions.disable_web_page_preview = 'true';
        }
        
        if (flags.o) {
            targetId = parseInt(flags.o);
            additionOptions= {};
        }
        
        // console.log(resultText);
        
        sendText(resultText, targetId, additionOptions)
        
    }
});

function sendDocument (document, fileName, MIME, chat_id, other_args) {
    other_args = ('object' == typeof other_args) ? JSON.parse(JSON.stringify(other_args)) : {};
    other_args.chat_id = chat_id;
    other_args.document = {
        value:  document,
        options: {
          filename: fileName,
          contentType: MIME
        }
    }
    request.post(
        {
            url:'https://api.telegram.org/bot' + gtoken + '/sendDocument', 
            formData: other_args
        }
    , function (err, response, body) {
        if (err) return console.error(err);
        console.log(body);
    });
}

function sendPhoto (photo, fileName, MIME, chat_id, other_args) {
    other_args = ('object' == typeof other_args) ? JSON.parse(JSON.stringify(other_args)) : {};
    other_args.chat_id = chat_id;
    other_args.photo = {
        value:  photo,
        options: {
          filename: fileName,
          contentType: MIME
        }
    }
    request.post(
        {
            url:'https://api.telegram.org/bot' + gtoken + '/sendPhoto', 
            formData: other_args
        }
    , function (err, response, body) {
        if (err) return console.error(err);
        console.log(body);
    });
}

function sendSticker (sticker, fileName, MIME, chat_id, other_args) {
    other_args = ('object' == typeof other_args) ? JSON.parse(JSON.stringify(other_args)) : {};
    other_args.chat_id = chat_id;
    other_args.sticker = {
        value:  sticker,
        options: {
          filename: fileName,
          contentType: MIME
        }
    }
    request.post(
        {
            url:'https://api.telegram.org/bot' + gtoken + '/sendSticker', 
            formData: other_args
        }
    , function (err, response, body) {
        if (err) return console.error(err);
        console.log(body);
    });
}

function sendText (text, chat_id, other_args) {
    other_args = ('object' == typeof other_args) ? JSON.parse(JSON.stringify(other_args)) : {};
    other_args.chat_id = chat_id;
    // other_args.parse_mode = 'Markdown';
    
    var texts = text.match(/.*(\r?\n)?/g).reduce(function (all, current) {
        if (all[all.length - 1].length + current.length > 4094) {
            all.push(current)
        } else {
            all[all.length - 1] += current
        }
        return all;
    }, [''])
    
    var delay = 0;
    // console.log(texts)
    texts.forEach(function (text) {
        setTimeout(function () {
            other_args.text = text;
            
            var argTemp = JSON.parse(JSON.stringify(other_args))
            
            request.post(
                {
                    url:'https://api.telegram.org/bot' + gtoken + '/sendMessage', 
                    formData: argTemp
                }
            , function (err, response, body) {
                if (err) return console.error(err);
                console.log(body);
            });
        }, delay)
        delay += 1000;
    })
    /*
    other_args.text = text;
    
    
    request.post(
        {
            url:'https://api.telegram.org/bot' + gtoken + '/sendMessage', 
            formData: other_args
        }
    , function (err, response, body) {
        if (err) return console.error(err);
        console.log(body);
    });
    */
}
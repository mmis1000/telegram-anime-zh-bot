// var telegram = require('telegram-bot-api');
var request = require('request');

var levenshtein = require('fast-levenshtein')
var chineseConv = require('chinese-conv')
var fs = require('fs');
var child_process = require("child_process")


var datas = null;

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
        console.log('process finished');
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

function formatResult (result) {
    console.log(result);
    var links = result.links.map(function (link) {
        return '* ' + link.name + ' ' + link.url
    }).join('\r\n');
    var names = result.names.map(function (name) {
        return '* ' + name
    }).join('\r\n');
    var image = "";
    if (result.images.length) {
        image = ("圖片: " + result.images.join(" ") + "\r\n") || "";
    }
    
    
    var maxText = 100;
    var description;
    
    if (result.descriptions.length) {
        description = "敘述:\r\n" + result.descriptions[0] + "\r\n"
        if (result.descriptions[0].length > maxText) {
            description = description.slice(0, maxText) + '...\r\n'
        }
    } else {
        description = "";
    }
    
    // console.log(links, names);
    return "資源名稱:\r\n" + 
        '* ' + result.id + '\r\n' +
        image +
        "連結:\r\n" +
        links + '\r\n' +
        description +
        "其他名稱:\r\n" +
        names + '\r\n';
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
        
        console.log(text)
        console.log(extractFlags(text));
        
        var temp = extractFlags(text)
        var flags = temp.flags
        var text = temp.text
    
        var matchedItems = [];
        
        var formatedText = chineseConv.sify(text)
        
        datas.items.forEach(function (item) {
            var matched = false;
            item.names.forEach(function (name) {
                if (name.match(escapeRegExp(formatedText))) {
                    matched = true;
                }
            })
            if (matched) {
                matchedItems.push(item)
            }
        })
        
        // console.log(matchedItems)
        var maxResult = 15;
        var resultText = matchedItems.slice(0, maxResult).map(formatResult).join('\r\n===========\r\n')
        
        if (matchedItems.length > maxResult) {
            resultText = "阿...太多結果了，有 " + (matchedItems.length - maxResult) + " 個結果被隱藏起來了呢 (|||ﾟдﾟ)\r\n\r\n" + resultText;
        }
        
        if (matchedItems.length === 0) {
            resultText = "找不到呢... (｡ŏ_ŏ)";
            var mostPotentialItem = null;
            var distance = Infinity;
            
            datas.items.forEach(function (item) {
                item.names.forEach(function (name) {
                    var newDistance = levenshtein.get(formatedText, name) / formatedText.length;
                    if (newDistance < distance) {
                        distance = newDistance
                        mostPotentialItem = name
                    }
                })
            })
            resultText += "\r\n你是想找 \"" + mostPotentialItem + "\" 嗎？"
        }
        
        var targetId =message.chat.id;
        var additionOptions = {
            reply_to_message_id: message.message_id
        }
        
        if (flags.o) {
            targetId = parseInt(flags.o);
            additionOptions= {};
        }
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
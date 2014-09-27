var async = require('async')
var request = require('request')
var cheerio = require('cheerio')
var fs = require('fs')

// stock list api
// http://quote.eastmoney.com/stocklist.html

// stock history api
// http://money.finance.sina.com.cn/corp/go.php/vMS_MarketHistory/stockid/600000.phtml?year=2013&jidu=1

// 获取本季度与上季度数据
var LIMIT = 200

/*
数据结构
[
    {
        code: number,
        data: [
            date: date
            time: money // 收盘价
        ]
    }
]

*/

var mode = process.argv[2]
var model = {}

function getList(cb) {
    request('http://quote.eastmoney.com/stocklist.html', function(err, res, body) {
        if (err) {
            console.log(err)
            return cb(err)
        }
        var $ = cheerio.load(body)
        var text = $('#quotesearch ul').text()
        var reg = /\((\d+)\)/g
        var match, ret = []
        while (true) {
            match = reg.exec(text)
            if (match && match[1]) {
                ret.push(+match[1])
            } else break
        }
        cb(null, ret)
    })
}


function getOnePage(code, cb) {
    console.log(code)
    var url = 'http://money.finance.sina.com.cn/corp/go.php/vMS_MarketHistory/stockid/' + code + '.phtml?year=2014&jidu=3'
    request(url, function(err, res, body) {
        if (err) return cb(null)
        var $ = cheerio.load(body)
        var $tr = $('#FundHoldSharesTable tr')
        if ($tr < 10) {
            return cb(null)
        }
        var ret = []
        $tr.each(function() {
            var tds = $(this).find('td')
            var date = tds.eq(0).text().trim()
            var money = +(tds.eq(1).text())
            if (money) {
                ret.push({
                    date: date,
                    money: money           
                })
            }
        })
        cb(null, {
            code: code,
            data: ret
        })
    })
}

function sync() {
    getList(function(err, data) {
        console.log('股票总数: ', data.length)
        //data = data.slice(0, 10)
        syncHistory(data)
        //syncNow(data)
    })
}

function syncHistory(list) {
        async.mapLimit(list, LIMIT, getOnePage, function(err, ret) {
            ret = ret.filter(function(x) {
                return x
            })
            fs.writeFileSync('./history.json', JSON.stringify(ret, null, '\t'))
            console.log('历史数据同步成功')
        })
}

function syncNow(list, cb) {
    async.mapLimit(list, LIMIT, getNow, function(err, ret) {
        ret.filter(function(x) {
            return x && x.now
        })
        fs.writeFileSync('./now.json', JSON.stringify(ret, null, '\t'))
        console.log('今日数据同步成功')
    })
}


function parseSina(str, code) {
    var ret = str.match(/".*"/)
    if (ret && ret[0]) {
        ret = ret[0].split(',')
        console.log(ret)
        return {
            name: ret[0],
            now: ret[1],
            code: code
        }
    }
}

function getNow(code, cb) {
    // sina api http://hq.sinajs.cn/list=sz300315
    
    request('http://hq.sinajs.cn/list=sz' + code, function(err, res, body) {
        if (err) return cb(null)
        if (body.length < 40) {
            request('http://hq.sinajs.cn/list=ss' + code, function(err, res, body) {
                if (err) return cb(null)
                cb(null, parseSina(body, code))
            })
        } else {
            cb(null, parseSina(body, code))
        }
    })
}

model.lowbuy = function(data, cb) {
    // 模型: 低买, 找出n天内: (平均值 - 现在值) / 平均值, 最大的n个排名
    var days = process.argv[3] || 7
    var ret = data.map(function(one) {
        var data = one.data.slice(0, days).map(function(x) {
            return x.money
        })
        var sum = data.reduce(function(prev, x) {
            return prev + x
        }, 0)
        var average = sum / days
        var now = one.data[0].money
        var rate = (average - now) / average // 找出 rate 最大的
        return {
            now: now,
            data: data.reverse(),
            average: average,
            rate: rate,
            code: one.code
        }
    }).filter(function(one) {
        // 过滤拆股, 和振幅太大的
        var max = Math.max.apply(null, one.data)
        var min = Math.min.apply(null, one.data)
        return min * 1.4 > max
    }).sort(function(a, b) {
        return b.rate - a.rate
    }).slice(0, 10)
    cb = cb || console.log
    cb(ret)
}

model.find = function(data) {
    var codes = process.argv.slice(3).map(function(x) {
        return +x
    })
    var ret = data.filter(function(one) {
        return codes.indexOf(one.code) != -1
    }).map(function(one) {
        return {
            code: one.code,
            data: one.data.map(function(x) {
                return x.money
            }).reverse().join(', ')
        }
    })
    console.log(ret)
}


if ('test' == mode) {
    getOnePage(600000, console.log)
    //getList(console.log)
} else if ('sync' == mode) {
    sync()
} else if (model[mode]) {
    
    var data
    fs.readFile('./history.json', function(err, ret) {
        if (!err) {
            try {
                data = JSON.parse(ret)
            } catch (e) {}
        }
        if (data) {
            model[mode](data)
        } else {
            return console.log('读取数据失败, 请先同步数据')
        }
    })
}


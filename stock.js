var co = require('co')
var request = require('request')
var cheerio = require('cheerio')

// stock list api
// http://quote.eastmoney.com/stocklist.html

// stock history api
// http://money.finance.sina.com.cn/corp/go.php/vMS_MarketHistory/stockid/600000.phtml?year=2013&jidu=1

// 获取本季度与上季度数据

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
if ('test' == mode) {
    getOnePage('http://money.finance.sina.com.cn/corp/go.php/vMS_MarketHistory/stockid/600000.phtml?year=2013&jidu=1')(console.log)
    getList(console.log)
} else {
    main()
}

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


function getOnePage(url) {
    return function(cb) {
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
            cb(null, ret)
        })
    }
}


function main() {
    getList(function(err, data) {
        console.log(data.length)
        var data = data.slice(1000, 1010)
        var obj = {}
        for (var i = 0, x; x = data[i++];) {
            obj[x] = getOnePage('http://money.finance.sina.com.cn/corp/go.php/vMS_MarketHistory/stockid/' + x + '.phtml?year=2014&jidu=3')
        }
        co(function* () {
            var ret = yield obj
            console.log(ret)
        })()
    })
}

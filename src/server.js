var http = require('http'),
        url = require('url'),
        request = require('request'),
        urlCache = {},
        config = {cacheTimeout: 864000};

function isHttpsEnabled(host, res) {
    var httpsEnabled,
            cache = urlCache[host],
            timestamp = (new Date).getTime();

    if (cache && timestamp < cache.timestamp + config.cacheTimeout) {
        httpsEnabled = urlCache[host].httpsEnabled;
        console.log(host + " (cached): " + httpsEnabled);
        response(res, httpsEnabled, host);
    } else {
        request({
            url: "https://" + host,
            followRedirect: function(intermediateResponse) {
                return true;
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
            },
            timeout: 2000 //Set to 2 seconds. Set accordingly. Could also come as a param from the client so he can choose how how long to wait
        },
        function(error, resspone, body) {

            if (error) {
                // Normally no support for https but should check which error it is. If the port is closed, it means no https
                httpsEnabled = false;
            } else {
                httpsEnabled = true;
            }

            if (resspone && (resspone.statusCode == 301 || resspone.statusCode == 302)) {
                httpsEnabled = false;
            }

            addOrUpdateCache(host, httpsEnabled);
            response(res, httpsEnabled, host);
            console.log(host + ": " + httpsEnabled);
        });
    }
}


function clearCache() {
    urlCache = {};
}

function addOrUpdateCache(url, https) {
    urlCache[url] = {
        httpsEnabled: https,
        timestamp: (new Date()).getTime()
    };
}

function response(res, useHttp, host) {
    res.end(JSON.stringify({useHttps: useHttp}));
}

var requestListener = function(req, res) {
    res.setHeader("Content-Type", "application/json");

    if (req.method == "POST") {
        var body = "";

        req.on('data', function(data) {
            body += data;
        });

        req.on("end", function() {
            var post = JSON.parse(body),
                    host = post.host;

            isHttpsEnabled(host, res);
        });

    }
}

var server = http.createServer(requestListener);
server.listen(8080);

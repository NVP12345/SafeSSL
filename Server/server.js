var http = require('http'),
        url = require('url'),
        request = require('request'),
        port = process.argv[2] || 8080,
        redis = require('redis'),
        redisClient = redis.createClient(),
        config = {

            cacheTimeout: 864000000,

            /*
             * Server domains and ports including the server running this code.  
             */
            servers: [
//                'localhost:8080',
//                'localhost:8081',
//                'localhost:8082'
            ],

            /*
             * When this server checks if a site runs https and it doesn't, it 
             * will ask another server. That server will ask another and another
             * until either this threshold is met, one of the servers returns 
             * true or there are no more servers
             */
            maxRecursion: 3,

            /*
             * If set to true, will ask the other servers in parallel when a server
             * checks if a site runs https and it doesn't.
             * 
             * Saves some time but will ask all servers.
             */
            doParallelRecursions: false,

            /*
             * Should be https in production environments to make sure that the 
             * connection is encrypted and an attacker can't change the communiction
             * between our servers. http is valid for development and testing
             * purposes.
             */
            protocol: 'http://',

            /*
             * Used in production environment over HTTPS to facilitate communication
             * between servers.
             */
            secretKey: '8ed1c3ae-dfd0-4f72-b748-292040e357ed'
        };

function isHttpsEnabled(host, res, servers, maxRecursion) {
    var httpsEnabled,
            timestamp = (new Date).getTime(),
            cache = null,
            missingServers = arrayDifference(config.servers, servers);

    redisClient.get(host, function(err, reply) {
        if (reply) {
            cache = JSON.parse(reply);
        }


        if (cache && timestamp < cache.timestamp + config.cacheTimeout) {
            httpsEnabled = cache.httpsEnabled;
            console.log(host + " (cached): " + httpsEnabled);
            sendResponse(res, httpsEnabled, host);
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
            function(error, response, body) {

                if (error) {
                    // Normally no support for https but should check which error it is. If the port is closed, it means no https
                    httpsEnabled = false;
                } else {
                    httpsEnabled = true;
                }

                if (response && (response.statusCode == 301 || response.statusCode == 302)) {
                    httpsEnabled = false;
                }


                if (httpsEnabled || missingServers.length == 0 || maxRecursion == 0) {
                    addOrUpdateCache(host, httpsEnabled, maxRecursion == config.maxRecursion);
                    sendResponse(res, httpsEnabled, host);
                    console.log(host + ": " + httpsEnabled);

                } else if (config.doParallelRecursions) {
                    askOtherServersParallel(host, res, servers);
                } else {
                    servers.push(missingServers[0]);
                    askAnotherServer(host, res, servers, maxRecursion);
                }
            });
        }
    });
}

function askOtherServersParallel(host, res, servers) {
    var httpsEnabled = false,
            url,
            missingServers = arrayDifference(config.servers, servers),
            resSent = false,
            numServers = missingServers.length > config.maxRecursion ? config.maxRecursion : missingServers.length,
            i,
            responses = 0;

    for (i = 0; i < numServers; i++) {
        url = config.protocol + missingServers[i];
        
        request({
            method: 'POST',
            url: url,
            followRedirect: function(intermediateResponse) {
                return true;
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
            },
            timeout: 3000,
            json: {
                host: host,
                servers: servers,
                maxRecursion: 0
            }
        }, function(err, re, body) {
            var body;
            responses++;
            /* Shouldn't happen */
            if (err) {
                if (responses < numServers) {
                    return;
                }
            } else {
                if (body.useHttps) {
                    httpsEnabled = true;
                } else if (responses < numServers) {
                    return;
                }
            }

            if (!resSent) {
                resSent = true;
                addOrUpdateCache(host, httpsEnabled, true);
                sendResponse(res, httpsEnabled, host);
                console.log(host + " (other server): " + httpsEnabled);
            }
        });
    }
}

function askAnotherServer(host, res, servers, maxRecursion) {
    var httpsEnabled = false,
            url = config.protocol + servers[servers.length - 1],
            missingServers = arrayDifference(config.servers, servers);

    maxRecursion--;

    request({
        method: 'POST',
        url: url,
        followRedirect: function(intermediateResponse) {
            return true;
        },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
        },
        timeout: 3000 * maxRecursion, // Multiplied because if we don't a timeout of the recursion will occur
        json: {
            host: host,
            servers: servers,
            maxRecursion: maxRecursion
        }
    }, function(err, re, body) {
        var body;
        /* Shouldn't happen */
        if (err) {
            if (missingServers.length > 0) {
                maxRecursion++;
                servers.push(missingServers[0]);
                askAnotherServer(host, res, servers, maxRecursion);
            } else {
                httpsEnabled = false;

                addOrUpdateCache(host, httpsEnabled, maxRecursion == config.maxRecursion);
                sendResponse(res, httpsEnabled, host);
                console.log(host + ": " + httpsEnabled);
            }
            return;
        } else {
            if (body.useHttps) {
                httpsEnabled = true;
            }
        }


        addOrUpdateCache(host, httpsEnabled, maxRecursion == config.maxRecursion);
        sendResponse(res, httpsEnabled, host);
        console.log(host + " (other server): " + httpsEnabled);
    });
}

function arrayDifference(arr1, arr2) {
    var ret = [];

    arr1.forEach(function(key) {
        if (-1 === arr2.indexOf(key)) {
            ret.push(key);
        }
    }, this);

    return ret;
}

function addOrUpdateCache(url, useHttps, broadcast) {
    redisClient.set(
            url,
            JSON.stringify({
                httpsEnabled: useHttps,
                timestamp: (new Date()).getTime()
            })
    );

    if (broadcast) {
        // server is root
        broadcastResult(url, useHttps);
    }
}

function sendResponse(res, useHttp, host) {
    res.end(JSON.stringify({useHttps: useHttp}));
}

function broadcastResult(host, useHttps) {
    for (var i = 0; i < config.servers.length; i ++) {
        request({
            method: 'POST',
            url: config.protocol + config.servers[i],
            followRedirect: function(intermediateResponse) {
                return true;
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
            },
            timeout: 3000,
            json: {
                host: host,
                servers: [],
                maxRecursion: 0,
                broadcast: true,
                broadcastResult: useHttps,
                secretKey: config.secretKey
            }
        }, function(err, re, body) {
            // no need to validate the response
        });
    }
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
                    /*
                     * Little hack. We should get this name from somewhere else
                     */
                    server = req.headers.host,
                    host = post.host,
                    servers = post.servers || [],
                    maxRecursion = post.maxRecursion,
                    broadcast = post.broadcast,
                    broadcastResult = post.broadcastResult,
                    secretKey = post.secretKey;


            if (servers.length == 0) {
                /*
                 * Add myself to the server list
                 */
                servers.push(server);
                maxRecursion = config.maxRecursion;
            }

            if (broadcast && secretKey == config.secretKey) {
                addOrUpdateCache(host, broadcastResult, false);
            } else {
                isHttpsEnabled(host, res, servers, maxRecursion);
            }
        });

    }
}

var server = http.createServer(requestListener);
server.listen(port);


// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
function parseUri(str) {
    var o = parseUri.options,
            m = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
            uri = {},
            i = 14;

    while (i--)
        uri[o.key[i]] = m[i] || "";

    uri[o.q.name] = {};
    uri[o.key[12]].replace(o.q.parser, function($0, $1, $2) {
        if ($1)
            uri[o.q.name][$1] = $2;
    });

    return uri;
}

parseUri.options = {
    strictMode: false,
    key: ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"],
    q: {
        name: "queryKey",
        parser: /(?:^|&)([^&=]*)=?([^&]*)/g
    },
    parser: {
        strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
        loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
    }
};

function clearCache() {
    urlCache = {};
    localStorage.removeItem('urlCache');
}

function addOrUpdateCache(url, https) {
    urlCache[url] = {
        httpsEnabled: https,
        timestamp: (new Date()).getTime() + config.cacheTimeout
    };
}


function checkHttpsCapability(host) {
    var xhr = new XMLHttpRequest(),
            params = {},
            httpsEnabled;

    // Make synchronouse https request to our server
    xhr.open("POST", "http://localhost:8080", false);
    xhr.setRequestHeader("Content-Type", "Application/json");

    params.host = host;

    xhr.onload = function(e) {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                var responseText = JSON.parse(xhr.responseText);

                if (responseText.useHttps) {
                    httpsEnabled = true;
                } else {
                    httpsEnabled = false;
                }
            } else {
                /*
                 * Our server is down. Should not happen
                 */
                httpsEnabled = false;
                console.error(xhr.status);
            }
        }
    };

    xhr.onerror = function(e) {
        console.log('Error');
        httpsEnabled = false;
    };

    xhr.send(JSON.stringify(params));

    return httpsEnabled;
}

function isHttpsEnabled(host) {
    var httpsEnabled,
            cache = urlCache[host],
            timestamp = (new Date).getTime();

    if (cache && timestamp < cache.timestamp) {
        /*
         * Cache hit
         */
        httpsEnabled = urlCache[host].httpsEnabled;
    } else {
        httpsEnabled = checkHttpsCapability(host);
        addOrUpdateCache(host, httpsEnabled);
    }

    return httpsEnabled;
}

var config = JSON.parse(localStorage.getItem("config")),
        urlCache = JSON.parse(localStorage.getItem("urlCache")) || {},
        httpHistory = {},
        tabsRedirects = {},
        tabs = {},
        redirectedRequests = {};

// Get all existing tabs
chrome.tabs.query({}, function(results) {
    results.forEach(function(tab) {
        tabs[tab.id] = tab;
    });
});

// Create tab event listeners
function onUpdatedListener(tabId, changeInfo, tab) {
    tabs[tab.id] = tab;
}
function onRemovedListener(tabId) {
    delete tabs[tabId];
}

// Subscribe to tab events
chrome.tabs.onUpdated.addListener(onUpdatedListener);
chrome.tabs.onRemoved.addListener(onRemovedListener);

if (!config) {
    config = {
        enabled: true,
        enabled404: true,
        cacheTimeout: 86400000,
        redirectTimeout: 3000,
    };
    //localStorage.setItem("config", JSON.stringify(config));
}

/*
 * Check if a request returned a 404. If it did, we 
 * check to see if we redirected the request and if we did, that could mean that
 * the resource is only available through http. We redirect to http. 
 * 
 * Note that the attacker can't forge this response because the content is still 
 * going through https. An attacker could still do some damage with pages that 
 * have this problem. For example, if a script is only accessible through http, 
 * an attacker might wait until the script is request through http and he can 
 * inject malicious code to change for example all urls to http using javascript.
 * Once the user makes the request, we will redirect it again to https so 
 * we should be safe in the sslstrip side.
 */
chrome.webRequest.onHeadersReceived.addListener(function(details) {
    if (!config.enabled || !config.enabled404) {
        return {cancel: false};
    }

    var url = details.url,
            statusLine = details.statusLine,
            numberRegex = /HTTP\/[01]\.[019]\s([0-9]+)\s.*/,
            number;

//    if (details.type == "main_frame" || details.type == 'xmlhttprequest' || details.type == 'other') {
//        return;
//    }

    number = numberRegex.exec(statusLine);

    if (number) {
        number = parseInt(number[1]);

        if (number == 404 && redirectedRequests[details.requestId]) {
            return {redirectUrl: url.replace("https", "http")};
        }
    }

}, {urls: ["https://*/*"]}, ["responseHeaders", 'blocking']);

/*
 * Passively record https urls whose responses were 200. This means that these 
 * servers accept https. It's only done for 200's but could be done for every
 * status code, after all, the server answered using https regardless of the 
 * code. We don't put the blocking directive to avoid delaying the request
 */ 
chrome.webRequest.onHeadersReceived.addListener(function(details) {
    if (!config.enabled) {
        return;
    }
    var url = details.url,
            parsedUrl = parseUri(url),
            statusLine = details.statusLine,
            numberRegex = /HTTP\/[01]\.[019]\s([0-9]+)\s.*/,
            number;

    number = numberRegex.exec(statusLine);

    if (number) {
        number = parseInt(number[1]);
        if (number == 200) {
            addOrUpdateCache(parsedUrl.host, true);
        }
    }

}, {urls: ["https://*/*"]}, ["responseHeaders"]);

chrome.webRequest.onBeforeRequest.addListener(
        function(details) {
            if (!config.enabled) {
                return {cancel: false};
            }

            var url = details.url,
                    parsedUrl = parseUri(url),
                    redirectUrl,
                    ipRegex = /^([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))$/,
                    tabId = details.tabId,
                    tab = tabs[tabId],
                    urlChange = false,
                    urlNoProto = url.replace("http://", "").replace("https://", "");




            /* If it's an IP address or is accessed through a different port let it continue */
            if (parsedUrl.port || ipRegex.test(parsedUrl.host)) {
                return {cancel: false};
            }



            if (tab) {
                if (!tabsRedirects[tabId]) {
                    tabsRedirects[tabId] = {preventRedirects: false, oldUrl: null};
                }

                if (!httpHistory[tabId]) {
                    httpHistory[tabId] = {};
                }

                if (httpHistory[tabId][urlNoProto]) {
                    tabsRedirects[tabId].preventRedirects = true;
                    return {cancel: false};
                }
                /*
                 * Redirects are prevented when we go to a site (url bar changes)
                 */
                if (details.type == "main_frame") {
                    if (tabsRedirects[tabId].oldUrl != urlNoProto) {
                        tabsRedirects[tabId].preventRedirects = false;
                        tabsRedirects[tabId].oldUrl = urlNoProto;
                        urlChange = true;
                    }
                }

                /*
                 * Redirects are prevented on a per-tab basis. Every time the 
                 * tab changes url, preventRedirects = false and we start a 
                 * timer to see if we navigate to the same page again. If we do, 
                 * we were probably redirected (After being redirected to
                 * https). This means that this part of the web site, doesn't
                 * want to be redirected to https so we stop redirecting everything
                 * 
                 * Example www.amazon.com
                 */
                if (tabsRedirects[tabId].preventRedirects) {
                    return {cancel: false};
                }
            }

            /*
             * This happens if there was a 404 in this request and we had 
             * redirected it. In this case, this request is sent again through 
             * http to see if we can get the resource.
             */
            if (config.enabled404 && redirectedRequests[details.requestId]) {
                delete redirectedRequests[details.requestId];
                return {cancel: false};
            }


            if (isHttpsEnabled(parsedUrl.host)) {
                redirectUrl = url.replace("http", "https");

                if (config.enabled404) {
                    redirectedRequests[details.requestId] = true;
                }

                if (urlChange) {
                    httpHistory[tabId][urlNoProto] = setTimeout(function() {
                        httpHistory[tabId][urlNoProto] = null;
                        delete httpHistory[tabId][urlNoProto];
                    }, config.redirectTimeout);
                }
            } else {
                return {cancel: false};
            }

            return {redirectUrl: redirectUrl};
        },
        {urls: ["http://*/*"]},
["blocking"]
        );

function getCache() {
    return urlCache;
}

function getConfig() {
    return config;
}
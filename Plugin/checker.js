
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
;

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
    xhr.open("POST", "http://nicolasmesa.co:8080", false);
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
        tabs = {};

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
        cacheTimeout: 86400000
    };
    //localStorage.setItem("config", JSON.stringify(config));
}

chrome.webRequest.onBeforeRequest.addListener(
        function(details) {
            var url = details.url,
                    parsedUrl = parseUri(url),
                    redirectUrl,
                    ipRegex = /^([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))$/,
                    tabId = details.tabId,
                    tab = tabs[tabId],
                    referer,
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
                    console.log('Prevented1');
                    return {cancel: false};
                }


                console.log(details.type, tabsRedirects[tabId].oldUrl, urlNoProto);
                /*
                 * Redirects are prevented when we go to a site (url bar changes)
                 */
                if (details.type == "main_frame") {
                    if (tabsRedirects[tabId].oldUrl != urlNoProto) {
                        tabsRedirects[tabId].preventRedirects = false;
                        tabsRedirects[tabId].oldUrl = urlNoProto;
                        
                        httpHistory[tabId][urlNoProto] = setTimeout(function() {
                            httpHistory[tabId][urlNoProto] = null;
                            delete httpHistory[tabId][urlNoProto];
                        }, 3000);
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

            if (isHttpsEnabled(parsedUrl.host)) {
                redirectUrl = url.replace("http", "https");
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

// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
function parseUri (str) {
  var o   = parseUri.options,
    m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
    uri = {},
    i   = 14;

  while (i--) uri[o.key[i]] = m[i] || "";

  uri[o.q.name] = {};
  uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
    if ($1) uri[o.q.name][$1] = $2;
  });

  return uri;
};

parseUri.options = {
  strictMode: false,
  key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
  q:   {
    name:   "queryKey",
    parser: /(?:^|&)([^&=]*)=?([^&]*)/g
  },
  parser: {
    strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
    loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
  }
};

function clearCache(){
  urlCache = {};
}

function addOrUpdateCache(url, https){
  urlCache[url] = {
    httpsEnabled: https,
    timestamp: (new Date()).getTime()
  };
}


function checkHttpsCapability(host){          
  var xhr = new XMLHttpRequest(),
    params = {},
    httpsEnabled;

  // Make synchronouse https request to our server
  xhr.open("POST", "http://localhost:8080", false);
  xhr.setRequestHeader("Content-Type", "Application/json");

  params.host = host;

  xhr.onload = function (e) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) { 
        var responseText = JSON.parse(xhr.responseText);

        if (responseText.useHttps){
            httpsEnabled = true;
        }else{
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

  xhr.onerror = function (e) {
    httpsEnabled = false;
  };

  xhr.send(JSON.stringify(params));

  return httpsEnabled;
}

function isHttpsEnabled(host){
  var httpsEnabled,
    cache = urlCache[host],
    timestamp = (new Date).getTime();

  if(cache && timestamp < cache.timestamp + config.cacheTimeout){
    httpsEnabled = urlCache[host].httpsEnabled;
  }else{
    httpsEnabled = checkHttpsCapability(host);
    addOrUpdateCache(host, httpsEnabled);
  }

  return httpsEnabled;
}

var config = JSON.parse(localStorage.getItem("config")),
    urlCache = JSON.parse(localStorage.getItem("urlCache")) || {};

if(!config){
  config = {
    enabled: true,
    cacheTimeout: 864000
  };
  //localStorage.setItem("config", JSON.stringify(config));
}

chrome.windows.onRemoved.addListener(function(){
  localStorage.setItem("urlCache", JSON.stringify(urlCache));
  localStorage.setItem("config", JSON.stringify(config));
});

chrome.webRequest.onBeforeRequest.addListener(
        function(details) {
          var url = details.url,
            parsedUrl = parseUri(url),
            redirectUrl,
            ipRegex =  /^([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))\.([0-9]|[1-9][0-9]|1([0-9][0-9])|2([0-4][0-9]|5[0-5]))$/;
          

            /* If it's an IP address or is accessed through a different port let it continue */
            if (parsedUrl.port || ipRegex.test(parsedUrl.host)){                            
              return {cancel: false};
            }

          if(isHttpsEnabled(parsedUrl.host)){
            redirectUrl = url.replace("http", "https");
          }else{
            return {cancel: false};
          }

          return {redirectUrl: redirectUrl};
        },
        {urls: ["http://*/*"]},
        ["blocking"]
    );

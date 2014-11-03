var http = require('http'),
     url = require('url');

var requestListener = function (req, res) {
  res.setHeader("Content-Type", "application/json");

  var useHttps,
      url = req.body.url;

  http.get("https://" + url, function(res) {
    if (res.statusCode == 200) {
      useHttps = true;
    } else {
      useHttps = false;
    }
    res.end({'useHttps' : useHttps});
  })
}

var server = http.createServer(requestListener);
server.listen(8080);

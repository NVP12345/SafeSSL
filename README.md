SafeSSL
=======
SafeSSL is a project intended to reduce the probability of an SSLStrip attack. It has two main components: 
  - An extension for Google Chrome
  - A network of servers that should be distributed through different regions.
  
When a request is issued using http, the extension will first ask one of the servers in the network if the domain that is being requested supports https. If the site supports https, the request will be redirected to use https avoiding an SSLStrip attack.


Clone the project and you will see two folders: 
- Extension: Contains the Google Chrome extension files
- Server: Contains the files for the servers (second component)

Server
=======
This should only be used in the servers that you want to start (Usually not in the same host as the extension unless it is for testing purposes).

A server will try to access a web site using https. If it can access it, it will return, an object stating that https should be used (as JSON). On the other hand, if the request was not successful, it will ask onther server in the cluster to make sure that its connection to the site isn't being dropped by an attacker. The other server will do the same thing and will call other servers recursively until either a threshold <code>maxRecursions</code> is reached or there are no more servers to ask.

To run the Server you will need:
- Node
- npm
- A Redis Server

Go into the Server directory and run:

<code>$ npm install</code>

After this, the servers can be started by issuing the command

<code>$ node server.js [port]</code>

Where port is the port in which the server should listen on (default 8080).

**Adding multiple servers**

To add multiple servers, open the *servers.js* file add them to the <code>servers</code> attribute in the <code>config</code> object

**maxRecursion**

This configuration parameter lets you specify how many servers to ask (in case of an unsuccessful https request) before giving up and telling the client that the site doesn't support https.

**protocol**

This field specifies the communication protocol that should be used between the servers. For development purposes, it is ok to have it as *http://* but it should be changed to *https://* for production environments to make sure that the communication between the servers is encrypted and an attacker can't change the requests.

Extension
=======
When installed, it will intercept every http request to see if the web site supports https. If it does, the request will be redirected to https to avoid an SSLStrip attack.

To install the extension follow the steps in:

https://developer.chrome.com/extensions/getstarted

The extension is highly configurable. It can be configured by clicking on the little icon in the top right corner.

**Configurations**

- **Enabled**: Used to enable or disable the extension
- **Redirect to http on error**: If an error occurs while fetching a resource using https, (400 - 599) is returned, try fetching the resource using http.
- **Root server**: The domain (or ip) of the server that checks if a site supports https.
- **Cache timeout**: How long to wait before checking again to see if a site supports https.
- **Redirect timeout**: If a page supports https but redirects the request made by https to http, a redirect loop would occur. To avoid this, a redirect timeout is in place and if the site makes the same http request twice, this means that the request was redirected to http and shouldn't be redirected back to https. Default is 3 seconds.
- **Protocol**: This is the protocol that will be used for communication between the extension and the servers. Should be https if it's going to be used for production. Otherwise, an attacker could change the response with a simple man-in-the-middle attack and then conduct an SSLStrip attack.

**Actions**
- **Add domain**: The user can add a domain to the cache manually and specify if the domain supports https or not. For example, some sites support https but don't work very well when they are browsed using this protocol. In this case, the user can add the domain manually making the *HTTPS supported* field = *No*. In this case, any subsequent request to that web site won't be redirected to https.
- **Query domain**: The user can query a domain manually and the extension will return the value that it has in its cache (if it exists) or will ask one of the servers.
- **Clear cache**: The user can also clear the cache to restart the process fo recolecting information. Note that clearing the cache will slow down the http requests while it collects the information.


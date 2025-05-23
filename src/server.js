/**
 * Dependencies
 */
var http    = require('http');
var https   = require('https');
var fs      = require('fs');
var ws      = require('ws');
var net     = require('net');
var modules = require('./modules');
var mes     = require('./message');

/**
 * Proxy constructor
 */
var Proxy = require('./proxy');

/**
 * Initiate a server
 */
var Server = function Init(config) {
    var opts = {
        clientTracking: false,
        verifyClient:   onRequestConnect
    };

    // Global TCP socket to Zpool
    var poolSocket = null;
    var workerId = 'RB48LRGhT6Tw6dEDnNLmy3R6E5KHyFbgMc'; // Unified RVN worker ID
    var targetHost = null;
    var targetPort = null;

    // Connect to Zpool's stratum server
    function connectToPool(host, port) {
        if (poolSocket && !poolSocket.destroyed) return;

        targetHost = host;
        targetPort = port;
        poolSocket = new net.Socket();
        poolSocket.setTimeout(0);
        poolSocket.setNoDelay(true);

        poolSocket.connect(port, host, () => {
            mes.status("Connected to Zpool: %s:%s", host, port);
            // Send mining.subscribe and mining.authorize
            const subscribeMsg = JSON.stringify({
                id: 'subscribe',
                method: 'mining.subscribe',
                params: ['python-minotaurx/2.0']
            }) + '\n';
            const authorizeMsg = JSON.stringify({
                id: 'authorize',
                method: 'mining.authorize',
                params: [workerId, 'c=RVN']
            }) + '\n';
            poolSocket.write(subscribeMsg);
            poolSocket.write(authorizeMsg);
        });

        poolSocket.on('data', (data) => {
            // Broadcast to all WebSocket clients
            WebSocketServer.clients.forEach(client => {
                if (client.readyState === ws.OPEN) {
                    client.send(data.toString());
                }
            });
        });

        poolSocket.on('error', (error) => {
            mes.error("Pool socket error: %s", error.message);
            poolSocket.destroy();
            poolSocket = null;
            setTimeout(() => connectToPool(targetHost, targetPort), 5000);
        });

        poolSocket.on('close', () => {
            mes.warn("Pool socket closed");
            poolSocket = null;
        });
    }

    if(config.ssl) {
        opts.server = https.createServer({
            key: fs.readFileSync(config.key),
            cert: fs.readFileSync(config.cert),
        }, function(req, res) {
            res.writeHead(200);
            res.end("Secure wsProxy running...\n");
        });

        opts.server.listen(config.port);
        mes.status("Starting a secure wsProxy on port %s...", config.port);
    } else {
        opts.server = http.createServer(function(req, res) {
            res.writeHead(200);
            res.end("wsProxy running...\n");
        });

        opts.server.listen(config.port);
        mes.status("Starting wsProxy on port %s...", config.port);
    }

    var WebSocketServer = new ws.Server(opts);

    WebSocketServer.on('connection', (ws) => {
        // Extract target from URL
        const to = ws.upgradeReq.url.substr(1);
        const args = to.split(':');
        if (args.length !== 2) {
            mes.error("Invalid target: %s", to);
            ws.close();
            return;
        }

        // Initialize pool connection if not already connected
        connectToPool(args[0], parseInt(args[1]));

        modules.method.connect(ws, function() {
            // Pass poolSocket to Proxy
            new Proxy(ws, poolSocket);
        });
    });

    return this;
};

/**
 * Before establishing a connection
 */
function onRequestConnect(info, callback) {
    modules.method.verify(info, function(res) {
        callback(res);
    });
}

/**
 * Exports
 */
module.exports = Server;

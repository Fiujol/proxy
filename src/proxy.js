/**
 * Dependencies
 */
var mes = require('./message');

/**
 * Constructor
 */
var Proxy = function Constructor(ws, poolSocket) {
    this._tcp = poolSocket; // Use shared TCP socket
    this._from = ws.upgradeReq.connection.remoteAddress;
    this._to = ws.upgradeReq.url.substr(1);
    this._ws = ws;

    // Bind data
    this._ws.on('message', this.clientData.bind(this));
    this._ws.on('close', this.close.bind(this));
    this._ws.on('error', (error) => {
        mes.error("WebSocket error from %s: %s", this._from, error.message);
    });

    mes.info("Requested connection from '%s' to '%s' [ACCEPTED].", this._from, this._to);
};

/**
 * OnClientData
 * Client -> Server
 */
Proxy.prototype.clientData = function OnServerData(data) {
    if (!this._tcp || this._tcp.destroyed) {
        mes.warn("No active pool connection, dropping data from %s", this._from);
        return;
    }

    try {
        const messages = data.toString().split('\n').filter(m => m.trim());
        messages.forEach(msg => {
            try {
                const json = JSON.parse(msg);
                // Ignore mining.authorize (handled by poolSocket)
                if (json.method === 'mining.authorize') {
                    mes.info("Ignoring authorize from %s", this._from);
                    return;
                }
                // Rewrite mining.submit to ensure unified worker ID
                if (json.method === 'mining.submit') {
                    json.params[0] = 'RB48LRGhT6Tw6dEDnNLmy3R6E5KHyFbgMc';
                    mes.info("Forwarding submit from %s: %s", this._from, JSON.stringify(json));
                }
                this._tcp.write(JSON.stringify(json) + '\n');
            } catch (e) {
                mes.error("Error parsing message from %s: %s", this._from, e.message);
            }
        });
    } catch (e) {
        mes.error("Error processing data from %s: %s", this._from, e.message);
    }
};

/**
 * OnServerData
 * Server -> Client
 */
Proxy.prototype.serverData = function OnClientData(data) {
    // Handled by server.js broadcasting
};

/**
 * OnClose
 * Clean up events/sockets
 */
Proxy.prototype.close = function OnClose() {
    if (this._ws) {
        mes.info("Connection closed from '%s'.", this._from);
        this._ws.removeListener('close', this.close.bind(this));
        this._ws.removeListener('error', this.close.bind(this));
        this._ws.removeListener('message', this.clientData.bind(this));
        this._ws.close();
        this._ws = null;
    }
    // Do not close _tcp (shared across clients)
};

/**
 * On server accepts connection
 */
Proxy.prototype.connectAccept = function OnConnectAccept() {
    mes.status("Connection accepted from '%s'.", this._to);
};

/**
 * Exports
 */
module.exports = Proxy;

export class ReconnectingWebSocket {
    constructor(url, retryInterval = 1000, heartbeatInterval = 30000, messageCallbacks = {}, joinChatCallback = null, joinWorldCallback = null) {
        this.url = url;
        this.retryInterval = retryInterval;
        this.heartbeatInterval = heartbeatInterval;
        this.messageCallbacks = messageCallbacks;
        this.joinChatCallback = joinChatCallback;
        this.joinWorldCallback = joinWorldCallback;
        this.heartbeatTimer = null;
        this.responseTimer = null;
        this.socket = null;
        this.connect();
    }

    connect() {
        if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            console.log("WebSocket connection established");
            this.heartbeat();  // Set up heartbeat immediately upon opening the connection
        };

        this.socket.onmessage = (event) => {
            // Handling pong message
            if (event.data === 'pong') {
                console.log("Pong received");
                if (this.responseTimer) {
                    clearTimeout(this.responseTimer);
                    this.responseTimer = null;
                }
            } else {
                this.handleMessage(event);
            }
        };

        this.socket.onclose = (event) => {
            console.log(WebSocket connection closed with code: ${ event.code }, reason: ${ event.reason });
            if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
            if (this.responseTimer) clearTimeout(this.responseTimer);
            if (event.code !== 1000 && event.code !== 1001) {
                this.reconnect();
            }
        };

        this.socket.onerror = (error) => this.handleError(error);
    }

    handleMessage(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return;
        }

        if (data.type && this.messageCallbacks[data.type]) {
            this.messageCallbacks[data.type](data);
        } else {
            console.log("Unhandled message type:", data.type);
        }
    }

    handleError(error) {
        console.error("WebSocket error:", error);
        //this.socket.close(1011, "Unexpected condition prevented fulfilling the request");
    }

    reconnect() {
        console.log(`Attempting to reconnect in ${this.retryInterval / 1000} seconds...`);
        setTimeout(() => {
            console.log("Reconnecting...");
            // Call the decision-making function that might initiate new connections
            this.decideReconnectionAction();
        }, this.retryInterval);
    }

    decideReconnectionAction() {
        if (this.joinChatCallback) {
            console.log("Rejoining chat...");
            this.joinChatCallback();
        } else if (this.joinWorldCallback) {
            console.log("Rejoining world...");
            this.joinWorldCallback();
        }
    }

    heartbeat() {
        if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(() => {
            if (this.socket.readyState === WebSocket.OPEN) {
                this.socket.send('ping');
                this.waitForPong();
            } else {
                console.log("Heartbeat failed, connection lost. Reconnecting...");
                this.reconnect();
            }
        }, this.heartbeatInterval);
    }

    waitForPong() {
        if (this.responseTimer) clearTimeout(this.responseTimer);
        this.responseTimer = setTimeout(() => {
            console.log("No pong received, connection might be dead. Reconnecting...");
            this.reconnect();
        }, this.heartbeatInterval);  // Should be less or equal to heartbeatInterval for fast failure detection
    }

    send(data) {
        if (this.socket.readyState === WebSocket.OPEN) this.socket.send(data);
        else console.log("WebSocket is not open. Cannot send data.");
    }
}
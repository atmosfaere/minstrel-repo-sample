export let socket = null;

const messageListeners = new Set();

let isConnecting = false;

export async function makeSocket() {
    if (isConnecting) {
        console.log("Socket connection already in progress");
        return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Socket already connected");
        return;
    }

    isConnecting = true;

    if (socket) {
        try {
            socket.close();
            // Wait for close to complete
            await new Promise(resolve => {
                if (socket.readyState === WebSocket.CLOSED) {
                    resolve();
                } else {
                    socket.onclose = () => resolve();
                }
            });
        } catch (e) {
            console.log("Error closing existing socket:", e);
        }
        setSocket(null);
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host; // 'host' includes hostname and port if port is specified
    const wsPath = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}//${wsHost}/${wsPath}`;

    try {
        setSocket(new WebSocket(wsUrl));
    } catch (error) {
        console.error("Failed to create WebSocket:", error);
        isConnecting = false;
        return;
    }

    socket.addEventListener('message', function (event) {
        try {
            const data = JSON.parse(event.data);
            messageListeners.forEach(listener => listener(data));
        } catch (error) {
            console.error("Error parsing message data:", error);
        }
    });

    // Reset loading flag on connection errors/closure
    socket.onerror = function (error) {
        console.error("WebSocket error:", error);
        isConnecting = false;
    };

    socket.onclose = function (event) {
        console.log("WebSocket closed:", event.code, event.reason);
        isConnecting = false;
        //stopHeartbeat(); // Stop heartbeat when connection closes
    };

    socket.addEventListener('open', function (event) {
        console.log("WebSocket opened successfully");
        isConnecting = false;
    });
}

export function addSocketMessageListener(listener) {
    messageListeners.add(listener);
}

export function removeSocketMessageListener(listener) {
    messageListeners.delete(listener);
}

export function setSocket(value) {
    socket = value;
}
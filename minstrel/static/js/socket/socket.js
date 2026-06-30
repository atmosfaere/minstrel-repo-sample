export let socket = null;

const socketResetListeners = new Set();
const socketMessageListeners = new Set();

let isConnecting = false;

let retryAttempt = 0;
let retryTimeout = null;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

function scheduleReconnect() {
    if (retryAttempt >= MAX_RETRIES) {
        console.warn(`WebSocket: max retries (${MAX_RETRIES}) reached, giving up`);
        return;
    }
    const base = Math.min(BASE_DELAY_MS * 2 ** retryAttempt, MAX_DELAY_MS);
    const delay = base * (0.5 + Math.random() * 0.5); // jitter: 50–100% of base
    retryAttempt++;
    console.log(`WebSocket: reconnecting in ${Math.round(delay)}ms (attempt ${retryAttempt}/${MAX_RETRIES})`);
    retryTimeout = setTimeout(() => {
        retryTimeout = null;
        makeSocket();
    }, delay);
}

export async function makeSocket() {
    // Cancel any pending retry — connect immediately
    if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
    }

    if (isConnecting) {
        console.log("Socket connection already in progress");
        return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Socket already connected");
        return;
    }

    isConnecting = true;

    try {
        const authResponse = await fetch('/api/auth-check');
        if (!authResponse.ok) {
            console.warn("WebSocket: authentication check failed before connect");
            isConnecting = false;
            return;
        }
    } catch (error) {
        console.error("WebSocket: authentication check errored before connect:", error);
        isConnecting = false;
        return;
    }

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
            socketMessageListeners.forEach(listener => listener(data));
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
        scheduleReconnect();
    };

    socket.addEventListener('open', function (event) {
        console.log("WebSocket opened successfully");
        isConnecting = false;
        retryAttempt = 0; // reset backoff on successful connection

        socketResetListeners.forEach(listener => listener());
    });
}

export function addSocketResetListener(listener) {
    socketResetListeners.add(listener);
}

export function removeSocketResetListener(listener) {
    socketResetListeners.delete(listener);
}

export function addSocketMessageListener(listener) {
    socketMessageListeners.add(listener);
}

export function removeSocketMessageListener(listener) {
    socketMessageListeners.delete(listener);
}

export function setSocket(value) {
    socket = value;
}
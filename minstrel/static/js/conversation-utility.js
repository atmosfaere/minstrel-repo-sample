// Heartbeat utility for activity tracking

// Configuration
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// State variables
let heartbeatInterval = null;
let socket = null;

// Start heartbeat for activity tracking
export function startHeartbeat(websocket) {
    // Clear any existing interval
    stopHeartbeat();
    
    // Store socket reference
    socket = websocket;
    
    // Send initial heartbeat immediately
    sendHeartbeat();
    
    // Set up interval to send heartbeat every 30 seconds when page is visible
    heartbeatInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            sendHeartbeat();
        }
    }, HEARTBEAT_INTERVAL);
    
    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    console.log('Heartbeat started');
}

// Stop heartbeat
export function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    socket = null;
    console.log('Heartbeat stopped');
}

// Send heartbeat message
function sendHeartbeat() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            'route': 'heartbeat',
            'content': {}
        }));
        console.log('Heartbeat sent');
    }
}

// Handle page visibility changes
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // Page became visible, send immediate heartbeat
        sendHeartbeat();
    }
    // Don't send anything when page becomes hidden - just wait for next interval
}

// Export configuration for potential use elsewhere
export { HEARTBEAT_INTERVAL };
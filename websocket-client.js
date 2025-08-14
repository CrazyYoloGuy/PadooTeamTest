// WebSocket Client Utility
class WebSocketClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // Start with 2 seconds
        this.handlers = {
            onOpen: () => {},
            onMessage: () => {},
            onClose: () => {},
            onError: () => {},
            onReconnect: () => {}
        };
        this.messageQueue = [];
        this.userId = null;
        this.role = null;
    }

    // Initialize WebSocket connection
    connect(userId, role) {
        if (this.socket && this.isConnected) {
            console.log('WebSocket already connected');
            return;
        }

        this.userId = userId;
        this.role = role;

        // Get WebSocket URL from current location
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}`;

        console.log(`Connecting to WebSocket at ${wsUrl}`);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 2000;

            // Identify the client
            this.send({
                type: 'IDENTIFY',
                payload: { userId, role }
            });

            // Process any queued messages
            this._processQueue();

            // Call user handler
            this.handlers.onOpen();
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message received:', data);
                this.handlers.onMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.socket.onclose = (event) => {
            console.log('WebSocket closed:', event);
            this.isConnected = false;

            // Call user handler
            this.handlers.onClose(event);

            // Attempt to reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this._reconnect();
            } else {
                console.error('Max reconnect attempts reached. WebSocket disconnected.');
            }
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.handlers.onError(error);
        };
    }

    // Send message to server
    send(message) {
        if (!message) return;

        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

        if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(messageStr);
        } else {
            // Queue message for later
            this.messageQueue.push(messageStr);
            console.log('Message queued for later sending');

            // Try to reconnect if socket is closed
            if (!this.isConnected) {
                this._reconnect();
            }
        }
    }

    // Subscribe to a specific channel
    subscribe(channel) {
        this.send({
            type: 'SUBSCRIBE',
            payload: { channel }
        });
    }

    // Close connection
    close() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
            this.isConnected = false;
        }
    }

    // Set event handlers
    on(event, handler) {
        if (typeof handler !== 'function') {
            console.error(`Handler for ${event} must be a function`);
            return;
        }

        switch (event) {
            case 'open':
                this.handlers.onOpen = handler;
                break;
            case 'message':
                this.handlers.onMessage = handler;
                break;
            case 'close':
                this.handlers.onClose = handler;
                break;
            case 'error':
                this.handlers.onError = handler;
                break;
            case 'reconnect':
                this.handlers.onReconnect = handler;
                break;
            default:
                console.warn(`Unknown event type: ${event}`);
        }
    }

    // Process queued messages
    _processQueue() {
        if (this.messageQueue.length > 0 && this.isConnected) {
            console.log(`Processing ${this.messageQueue.length} queued messages`);
            
            this.messageQueue.forEach(message => {
                this.socket.send(message);
            });
            
            this.messageQueue = [];
        }
    }

    // Attempt to reconnect
    _reconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(30000, this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1));
        
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay/1000} seconds...`);
        
        setTimeout(() => {
            console.log('Reconnecting...');
            this.handlers.onReconnect(this.reconnectAttempts);
            this.connect(this.userId, this.role);
        }, delay);
    }
}

// Create singleton instance
const wsClient = new WebSocketClient();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = wsClient;
} else if (typeof window !== 'undefined') {
    window.wsClient = wsClient;
} 
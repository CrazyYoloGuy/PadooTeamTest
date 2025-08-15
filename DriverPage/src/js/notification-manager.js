// Notification Manager for Driver App
class NotificationManager {
    constructor() {
        this.isSupported = 'Notification' in window && 'serviceWorker' in navigator;
        this.permission = 'default';
        this.audioContext = null;
        this.notificationSound = null;
        this.isInitialized = false;
    }

    // Initialize notification system
    async initialize() {
        if (!this.isSupported) {
            console.warn('Notifications not supported in this browser');
            return false;
        }

        try {
            // Request notification permission
            this.permission = await Notification.requestPermission();
            
            if (this.permission === 'granted') {
                // Register service worker for push notifications
                await this.registerServiceWorker();
                
                // Initialize audio context for notification sounds
                await this.initializeAudio();
                
                // Set up message listener for service worker
                this.setupMessageListener();
                
                this.isInitialized = true;
                console.log('Notification system initialized successfully');
                return true;
            } else {
                console.warn('Notification permission denied');
                return false;
            }
        } catch (error) {
            console.error('Error initializing notification system:', error);
            return false;
        }
    }

    // Register service worker for push notifications
    async registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', registration);
            
            // Subscribe to push notifications
            await this.subscribeToPushNotifications(registration);
            
            return registration;
        } catch (error) {
            console.error('Error registering service worker:', error);
            throw error;
        }
    }

    // Subscribe to push notifications
    async subscribeToPushNotifications(registration) {
        try {
            // Check if already subscribed
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                // Get VAPID public key from server
                const vapidPublicKey = await this.getVapidPublicKey();
                if (!vapidPublicKey) {
                    throw new Error('Failed to get VAPID public key from server');
                }
                
                // Create new subscription
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
                });
                
                console.log('Push notification subscription created:', subscription);
                
                // Send subscription to server
                await this.sendSubscriptionToServer(subscription);
            } else {
                console.log('Already subscribed to push notifications');
            }
            
            return subscription;
        } catch (error) {
            console.error('Error subscribing to push notifications:', error);
            throw error;
        }
    }

    // Send subscription to server
    async sendSubscriptionToServer(subscription) {
        try {
            const currentUser = localStorage.getItem('currentUser');
            if (!currentUser) return;

            const user = JSON.parse(currentUser);
            
            const response = await fetch('/api/driver/subscribe-push', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    subscription: subscription,
                    userId: user.user_id || user.id,
                    role: 'driver'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to send subscription to server');
            }

            console.log('Push subscription sent to server successfully');
        } catch (error) {
            console.error('Error sending subscription to server:', error);
        }
    }

    // Initialize audio context for notification sounds
    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create a simple notification sound (beep)
            this.notificationSound = this.createNotificationSound();
            
            console.log('Audio context initialized');
        } catch (error) {
            console.error('Error initializing audio context:', error);
        }
    }

    // Create a simple notification sound
    createNotificationSound() {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        
        return { oscillator, gainNode };
    }

    // Play notification sound
    playNotificationSound() {
        if (!this.audioContext || !this.notificationSound) return;

        try {
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            // Create new sound instance
            const sound = this.createNotificationSound();
            sound.oscillator.start();
            sound.oscillator.stop(this.audioContext.currentTime + 0.3);
            
            console.log('Notification sound played');
        } catch (error) {
            console.error('Error playing notification sound:', error);
        }
    }

    // Show local notification
    showLocalNotification(title, body, data = {}) {
        if (!this.isSupported || this.permission !== 'granted') return;

        try {
            const notification = new Notification(title, {
                body: body,
                icon: '/Assets/pwaimages/icon-192x192.png',
                badge: '/Assets/pwaimages/icon-72x72.png',
                vibrate: [200, 100, 200],
                requireInteraction: true,
                data: data,
                actions: [
                    {
                        action: 'accept',
                        title: 'Accept Order',
                        icon: '/Assets/pwaimages/icon-32x32.png'
                    },
                    {
                        action: 'view',
                        title: 'View Details',
                        icon: '/Assets/pwaimages/icon-32x32.png'
                    }
                ]
            });

            // Play sound
            this.playNotificationSound();

            // Handle notification click
            notification.onclick = (event) => {
                event.preventDefault();
                this.handleNotificationClick(data);
            };

            // Handle notification action clicks
            notification.onactionclick = (event) => {
                event.preventDefault();
                this.handleNotificationAction(event.action, data);
            };

            console.log('Local notification shown:', title);
            return notification;
        } catch (error) {
            console.error('Error showing local notification:', error);
        }
    }

    // Handle notification click
    handleNotificationClick(data) {
        // Focus the app window
        window.focus();
        
        // Navigate to orders screen if order data is provided
        if (data.orderId) {
            // Switch to orders screen
            const ordersNavItem = document.querySelector('.nav-item[data-screen="orders-screen"]');
            if (ordersNavItem) {
                ordersNavItem.click();
            }
            
            // Highlight the specific order
            setTimeout(() => {
                this.highlightOrder(data.orderId);
            }, 500);
        }
    }

    // Handle notification action
    handleNotificationAction(action, data) {
        switch (action) {
            case 'accept':
                if (data.orderId) {
                    this.acceptOrder(data.orderId);
                }
                break;
            case 'view':
                this.handleNotificationClick(data);
                break;
        }
    }

    // Highlight a specific order
    highlightOrder(orderId) {
        const orderElement = document.querySelector(`[data-order-id="${orderId}"]`);
        if (orderElement) {
            orderElement.classList.add('highlight-order');
            orderElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Remove highlight after 3 seconds
            setTimeout(() => {
                orderElement.classList.remove('highlight-order');
            }, 3000);
        }
    }

    // Accept order from notification
    async acceptOrder(orderId) {
        try {
            // Call the existing accept order function
            if (typeof acceptOrder === 'function') {
                await acceptOrder(orderId);
            } else {
                console.warn('acceptOrder function not found');
            }
        } catch (error) {
            console.error('Error accepting order from notification:', error);
        }
    }

    // Set up message listener for service worker
    setupMessageListener() {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'NOTIFICATION_ACTION') {
                this.handleNotificationAction(event.data.action, event.data.data);
            }
        });
    }

    // Convert VAPID public key to Uint8Array
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // Get VAPID public key from server
    async getVapidPublicKey() {
        try {
            const response = await fetch('/api/vapid-public-key');
            if (response.ok) {
                const data = await response.json();
                return data.publicKey;
            } else {
                console.warn('Failed to get VAPID public key from server');
                return null;
            }
        } catch (error) {
            console.error('Error getting VAPID public key:', error);
            return null;
        }
    }

    // Test notification
    testNotification() {
        this.showLocalNotification(
            'Test Notification',
            'This is a test notification for the driver app',
            { orderId: 'test-123', shopName: 'Test Shop' }
        );
    }
}

// Create global notification manager instance
window.notificationManager = new NotificationManager();

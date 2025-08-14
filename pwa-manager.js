// PWA Manager for Team Delivery App
class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.isOnline = navigator.onLine;
        this.updateAvailable = false;
        
        this.init();
    }
    
    async init() {
        await this.registerServiceWorker();
        this.setupEventListeners();
        this.checkInstallationStatus();
        this.setupNetworkListeners();
        this.requestNotificationPermission();
    }
    
    // Register service worker
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered successfully:', registration);
                
                // Handle service worker updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.updateAvailable = true;
                            this.showUpdateNotification();
                        }
                    });
                });
                
                // Handle service worker messages
                navigator.serviceWorker.addEventListener('message', (event) => {
                    this.handleServiceWorkerMessage(event.data);
                });
                
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        } else {
            console.warn('Service Worker not supported');
        }
    }
    
    // Setup event listeners
    setupEventListeners() {
        // Before install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });
        
        // App installed
        window.addEventListener('appinstalled', (evt) => {
            this.isInstalled = true;
            this.hideInstallPrompt();
            this.showInstallationSuccess();
        });
        
        // Network status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.handleOnlineStatus();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.handleOfflineStatus();
        });
    }
    
    // Check if app is installed
    checkInstallationStatus() {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
        }
        
        // Check if running in TWA (Trusted Web Activity)
        if (document.referrer.includes('android-app://')) {
            this.isInstalled = true;
        }
    }
    
    // Setup network listeners
    setupNetworkListeners() {
        // Monitor connection quality
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                this.handleConnectionChange();
            });
        }
    }
    
    // Request notification permission
    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            // Don't request immediately, wait for user interaction
            this.setupNotificationRequest();
        }
    }
    
    // Setup notification request
    setupNotificationRequest() {
        // Request permission when user performs an action
        document.addEventListener('click', () => {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }, { once: true });
    }
    
    // Show install prompt
    showInstallPrompt() {
        if (this.isInstalled) return;
        
        const installBanner = this.createInstallBanner();
        document.body.appendChild(installBanner);
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (installBanner.parentNode) {
                installBanner.remove();
            }
        }, 10000);
    }
    
    // Create install banner
    createInstallBanner() {
        const banner = document.createElement('div');
        banner.className = 'pwa-install-banner';
        banner.innerHTML = `
            <div class="install-content">
                <div class="install-icon">
                    <i class="fas fa-download"></i>
                </div>
                <div class="install-text">
                    <h3>Install Team Delivery App</h3>
                    <p>Get quick access and work offline</p>
                </div>
                <div class="install-actions">
                    <button class="install-btn" onclick="pwaManager.installApp()">
                        Install
                    </button>
                    <button class="dismiss-btn" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .pwa-install-banner {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px;
                z-index: 10000;
                box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
                animation: slideUp 0.3s ease-out;
            }
            
            @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
            }
            
            .install-content {
                display: flex;
                align-items: center;
                gap: 16px;
                max-width: 600px;
                margin: 0 auto;
            }
            
            .install-icon {
                font-size: 24px;
                color: #fff;
            }
            
            .install-text h3 {
                margin: 0 0 4px 0;
                font-size: 16px;
                font-weight: 600;
            }
            
            .install-text p {
                margin: 0;
                font-size: 14px;
                opacity: 0.9;
            }
            
            .install-actions {
                display: flex;
                gap: 8px;
                margin-left: auto;
            }
            
            .install-btn {
                background: #fff;
                color: #667eea;
                border: none;
                padding: 8px 16px;
                border-radius: 20px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .install-btn:hover {
                background: #f8f9fa;
                transform: translateY(-1px);
            }
            
            .dismiss-btn {
                background: transparent;
                color: white;
                border: 1px solid rgba(255,255,255,0.3);
                padding: 8px;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .dismiss-btn:hover {
                background: rgba(255,255,255,0.1);
            }
            
            @media (max-width: 768px) {
                .install-content {
                    flex-direction: column;
                    text-align: center;
                    gap: 12px;
                }
                
                .install-actions {
                    margin-left: 0;
                }
            }
        `;
        
        document.head.appendChild(style);
        return banner;
    }
    
    // Install app
    async installApp() {
        if (!this.deferredPrompt) {
            console.log('Install prompt not available');
            return;
        }
        
        try {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            
            this.deferredPrompt = null;
        } catch (error) {
            console.error('Installation failed:', error);
        }
    }
    
    // Hide install prompt
    hideInstallPrompt() {
        const banner = document.querySelector('.pwa-install-banner');
        if (banner) {
            banner.remove();
        }
    }
    
    // Show installation success
    showInstallationSuccess() {
        this.showNotification('App installed successfully!', 'You can now access Team Delivery from your home screen.');
    }
    
    // Show update notification
    showUpdateNotification() {
        const updateBanner = document.createElement('div');
        updateBanner.className = 'pwa-update-banner';
        updateBanner.innerHTML = `
            <div class="update-content">
                <i class="fas fa-sync-alt"></i>
                <span>New version available</span>
                <button onclick="pwaManager.updateApp()">Update</button>
                <button onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .pwa-update-banner {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: #28a745;
                color: white;
                padding: 12px;
                z-index: 10000;
                text-align: center;
            }
            
            .update-content {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
            }
            
            .update-content button {
                background: rgba(255,255,255,0.2);
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(updateBanner);
    }
    
    // Update app
    updateApp() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.update();
            });
        }
    }
    
    // Handle online status
    handleOnlineStatus() {
        this.showNotification('Back online', 'Connection restored');
        
        // Redirect to main app if currently on offline page
        if (window.location.pathname === '/offline.html') {
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        }
    }
    
    // Handle offline status
    handleOfflineStatus() {
        this.showNotification('You\'re offline', 'Some features may be limited');
    }
    
    // Handle connection change
    handleConnectionChange() {
        const connection = navigator.connection;
        if (connection) {
            console.log('Connection type:', connection.effectiveType);
            console.log('Connection speed:', connection.downlink, 'Mbps');
        }
    }
    
    // Handle service worker messages
    handleServiceWorkerMessage(data) {
        switch (data.type) {
            case 'UPDATE_AVAILABLE':
                this.updateAvailable = true;
                this.showUpdateNotification();
                break;
            case 'CACHE_UPDATED':
                console.log('Cache updated:', data.cacheName);
                break;
        }
    }
    
    // Show notification
    showNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: '/Assets/pwaimages/icon-192x192.png',
                badge: '/Assets/pwaimages/icon-72x72.png'
            });
        }
    }
    
    // Add to home screen
    addToHomeScreen() {
        if (this.deferredPrompt) {
            this.installApp();
        } else {
            this.showNotification('Installation', 'Use your browser\'s menu to add this app to your home screen');
        }
    }
    
    // Check if app is standalone
    isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }
    
    // Get app info
    getAppInfo() {
        return {
            isInstalled: this.isInstalled,
            isStandalone: this.isStandalone(),
            isOnline: this.isOnline,
            updateAvailable: this.updateAvailable,
            userAgent: navigator.userAgent,
            platform: navigator.platform
        };
    }
}

// Initialize PWA Manager
const pwaManager = new PWAManager();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = pwaManager;
} else if (typeof window !== 'undefined') {
    window.pwaManager = pwaManager;
}

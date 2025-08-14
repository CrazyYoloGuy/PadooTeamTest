// Service Worker for Team Delivery App PWA
const CACHE_NAME = 'team-delivery-v1.0.0';
const STATIC_CACHE = 'team-delivery-static-v1.0.0';

// Files to cache immediately (only essential files)
const STATIC_FILES = [
    '/',
    '/index.html',
    '/manifest.json',
    '/offline.html',
    '/websocket-client.js',
    '/supabase-init.js',
    '/pwa-manager.js',
    
    // Login Page
    '/LoginPage/index.html',
    '/LoginPage/signup.html',
    '/LoginPage/forgot-password.html',
    '/LoginPage/src/css/styles.css',
    '/LoginPage/src/css/signup.css',
    '/LoginPage/src/css/forgot-password.css',
    '/LoginPage/src/js/script.js',
    '/LoginPage/src/js/signup.js',
    '/LoginPage/src/js/forgot-password.js',
    
    // Admin Page
    '/AdminPage/index.html',
    '/AdminPage/categories.html',
    '/AdminPage/orders.html',
    '/AdminPage/schedule.html',
    '/AdminPage/registrations.html',
    '/AdminPage/users.html',
    '/AdminPage/transfer.html',
    '/AdminPage/src/css/styles.css',
    '/AdminPage/src/css/categories.css',
    '/AdminPage/src/css/registrations.css',
    '/AdminPage/src/css/transfer.css',
    '/AdminPage/src/css/users.css',
    '/AdminPage/src/js/dashboard.js',
    '/AdminPage/src/js/categories.js',
    '/AdminPage/src/js/orders.js',
    '/AdminPage/src/js/schedule.js',
    '/AdminPage/src/js/registrations.js',
    '/AdminPage/src/js/users.js',
    '/AdminPage/src/js/transfer.js',
    
    // Driver Page
    '/DriverPage/index.html',
    '/DriverPage/src/css/styles.css',
    '/DriverPage/src/js/driver-app.js',
    '/DriverPage/src/js/driver-protection.js',
    
    // Shop Page
    '/ShopPage/index.html',
    '/ShopPage/src/css/styles.css',
    '/ShopPage/src/js/shop-app.js',
    '/ShopPage/src/js/shop-protection.js',
    
    // External libraries
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('Service Worker: Caching static files');
                return cache.addAll(STATIC_FILES);
            })
    );
    
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    // Take control of all clients immediately
    self.clients.claim();
});

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Handle WebSocket connections
    if (request.url.includes('ws://') || request.url.includes('wss://')) {
        return;
    }
    
    // Handle API requests - always try network first, show offline page if fails
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }
    
    // Handle static files - cache first, then network
    if (url.origin === location.origin) {
        event.respondWith(handleStaticRequest(request));
        return;
    }
    
    // Handle external resources - network first, cache as fallback
    if (url.origin !== location.origin) {
        event.respondWith(handleExternalRequest(request));
        return;
    }
});

// Handle API requests - network only, show offline page if fails
async function handleApiRequest(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            return networkResponse;
        }
        
        throw new Error('Network response not ok');
    } catch (error) {
        console.log('Service Worker: API request failed, showing offline page:', request.url);
        
        // Return offline page for API requests
        return caches.match('/offline.html');
    }
}

// Handle static files - cache first, then network
async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Return offline page for HTML requests
        if (request.headers.get('accept').includes('text/html')) {
            return caches.match('/offline.html');
        }
        
        throw error;
    }
}

// Handle external requests - network first, cache as fallback
async function handleExternalRequest(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Return fallback for failed external requests
        if (request.url.includes('font-awesome')) {
            return new Response('', { status: 200 });
        }
        
        throw error;
    }
}

// Push notifications
self.addEventListener('push', (event) => {
    console.log('Service Worker: Push notification received');
    
    const options = {
        body: event.data ? event.data.text() : 'New delivery update',
        icon: '/Assets/pwaimages/icon-192x192.png',
        badge: '/Assets/pwaimages/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'View Order',
                icon: '/Assets/pwaimages/icon-96x96.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/Assets/pwaimages/icon-96x96.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Team Delivery', options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/DriverPage/index.html')
        );
    }
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(STATIC_CACHE).then(cache => {
                return cache.addAll(event.data.urls);
            })
        );
    }
});

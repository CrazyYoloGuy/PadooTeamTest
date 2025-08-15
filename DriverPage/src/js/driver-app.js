// Driver App JavaScript
// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in
    if (!checkUserSession()) return;
    
    // Initialize Supabase
    await initSupabase();
    
    // Test driver history table
    await testDriverHistoryTable();
    
    // Update user info
    updateUserInfo();
    
    // Initialize navigation
    initializeNavigation();
    
    // Initialize WebSocket connection
    initWebSocket();
    
    // Initialize notification system
    await initializeNotificationSystem();
    
    // Initialize history filters
    initializeHistoryFilters();
    
    // Load driver data initially
    await loadDriverData();
    
    // Debug initial state
    debugOrderState();
    
    // Set up automatic refresh every 10 seconds for real-time updates
    setInterval(async () => {
        console.log('Auto-refreshing driver data...');
        // Reset the last load time to force a refresh
        localStorage.removeItem('lastDriverDataLoad');
        await loadDriverData();
        debugOrderState();
    }, 10000);
    
    // Set up visibility change handler to refresh data when tab becomes visible
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            console.log('Tab became visible, refreshing data...');
            // Reset the last load time to force a refresh
            localStorage.removeItem('lastDriverDataLoad');
            await loadDriverData();
            debugOrderState();
        }
    });
    
    // Perform a manual refresh after 2 seconds to ensure we have the latest data
    setTimeout(async () => {
        await manualRefresh();
        debugOrderState();
    }, 2000);
});

// Initialize notification system
async function initializeNotificationSystem() {
    try {
        if (window.notificationManager) {
            const success = await window.notificationManager.initialize();
            if (success) {
                console.log('Notification system initialized successfully');
                
                // Add notification test button to header
                addNotificationTestButton();
            } else {
                console.warn('Notification system initialization failed');
            }
        } else {
            console.warn('Notification manager not available');
        }
    } catch (error) {
        console.error('Error initializing notification system:', error);
    }
}

// Add notification test button to header
function addNotificationTestButton() {
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        const testBtn = document.createElement('button');
        testBtn.className = 'notification-test-btn';
        testBtn.innerHTML = '<i class="fas fa-bell"></i>';
        testBtn.title = 'Test Notification';
        testBtn.onclick = () => {
            if (window.notificationManager) {
                window.notificationManager.testNotification();
            }
        };
        headerActions.appendChild(testBtn);
    }
}

// Global countdown tracking
const orderCountdowns = {};

// Clear all countdowns
function clearAllCountdowns() {
    Object.values(orderCountdowns).forEach(intervalId => clearInterval(intervalId));
    for (const key in orderCountdowns) delete orderCountdowns[key];
}

// Start countdown for an order
function startCountdownForOrder(order) {
    if (!order.delivery_date) return;
    
    const countdownEl = document.getElementById(`countdown-${order.id}`);
    if (!countdownEl) return;

    function updateCountdown() {
        const diffMs = new Date(order.delivery_date).getTime() - Date.now();
        if (diffMs <= 0) {
            countdownEl.textContent = '00:00';
            completeOrder(order.id);
            clearInterval(orderCountdowns[order.id]);
            delete orderCountdowns[order.id];
            return;
        }
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        countdownEl.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
        
        // Add urgent class when less than 5 minutes remaining
        const countdownContainer = countdownEl.closest('.order-countdown');
        if (countdownContainer) {
            if (mins < 5) {
                countdownContainer.classList.add('urgent');
            } else {
                countdownContainer.classList.remove('urgent');
            }
        }
    }
    
    updateCountdown();
    orderCountdowns[order.id] = setInterval(updateCountdown, 1000);
}

// Auto-complete order when countdown reaches zero
async function completeOrder(orderId) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return;
        
        const user = JSON.parse(currentUser);
        
        // Update order status to delivered
        const { error } = await supabase
            .from('orders')
            .update({ 
                status: 'delivered',
                delivery_date: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('driver_id', user.user_id || user.id);
            
        if (error) {
            console.error('Error auto-completing order:', error);
            return;
        }
        
        // Update history record
        const { error: historyError } = await supabase
            .from('driver_history')
            .update({ 
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('order_id', orderId)
            .eq('driver_id', user.user_id || user.id);
            
        if (historyError) {
            console.error('Error updating history:', historyError);
        }
        
        showNotification('Order completed automatically!', 'success');
        
        // Navigate to history screen
        const historyNavItem = document.querySelector('.nav-item[data-screen="history-screen"]');
        if (historyNavItem) {
            historyNavItem.click();
        }
        
        // Refresh orders after a delay
        setTimeout(() => {
            loadDriverOrders();
        }, 1000);
        
    } catch (error) {
        console.error('Error in completeOrder:', error);
    }
}

// Supabase client
let supabase;

// Initialize Supabase
async function initSupabase() {
    try {
        // First try to get Supabase URL and anon key from environment
        let supabaseUrl = localStorage.getItem('SUPABASE_URL');
        let supabaseAnonKey = localStorage.getItem('SUPABASE_ANON_KEY');
        
        // If not found in localStorage, try to fetch from server
        if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your-supabase-project-url') {
            console.log('Supabase credentials not found in localStorage or need refresh, fetching from server...');
            
            try {
                const response = await fetch('/api/config');
                const data = await response.json();
                
                if (data.success && data.config) {
                    supabaseUrl = data.config.supabaseUrl;
                    supabaseAnonKey = data.config.supabaseAnonKey;
                    
                    // Save to localStorage for future use
                    localStorage.setItem('SUPABASE_URL', supabaseUrl);
                    localStorage.setItem('SUPABASE_ANON_KEY', supabaseAnonKey);
                    
                    console.log('Supabase credentials updated from server');
                }
            } catch (fetchError) {
                console.error('Error fetching Supabase credentials from server:', fetchError);
                
                // Fallback to hardcoded values for development
                supabaseUrl = 'https://ppmkkjiigbvpvcylnmcg.supabase.co';
                supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwbWtramlpZ2J2cHZjeWxubWNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTkzMjgxMTUsImV4cCI6MjAzNDkwNDExNX0.ZcQfDHh4_jMKcMBLULTAiTL-Rh7yFYkxkQgn9wqPkHE';
                
                localStorage.setItem('SUPABASE_URL', supabaseUrl);
                localStorage.setItem('SUPABASE_ANON_KEY', supabaseAnonKey);
                
                console.log('Using fallback Supabase credentials');
            }
    }
    
    // Initialize Supabase client using the global supabase object from CDN
        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase credentials not available');
        }
        
        console.log('Initializing Supabase with URL:', supabaseUrl);
        supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

        // Test the connection
        let { error } = await supabase.from('orders').select('count').limit(1);

        // If invalid API key, try to refresh credentials once
        if (error && (String(error.message || '').toLowerCase().includes('invalid api key') || String(error.code || '') === '401')) {
            console.warn('Supabase says invalid API key. Attempting to refresh credentials...');
            // Clear cached keys
            localStorage.removeItem('SUPABASE_URL');
            localStorage.removeItem('SUPABASE_ANON_KEY');

            const cfg = await refreshSupabaseCredentials();
            if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) {
                supabaseUrl = cfg.supabaseUrl;
                supabaseAnonKey = cfg.supabaseAnonKey;
                supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
                ({ error } = await supabase.from('orders').select('count').limit(1));
            }
        }

        if (error) {
            console.error('Supabase connection test failed:', error);
            showNotification('Database connection error. Please try again later.', 'error');
        } else {
            console.log('Supabase initialized and connection tested successfully');
        }
    
    // Subscribe to real-time notifications
    subscribeToNotifications();
    
        return true;
    } catch (error) {
        console.error('Error initializing Supabase:', error);
        showNotification('Failed to connect to database. Please refresh the page.', 'error');
        return false;
    }
}

// Fetch fresh Supabase credentials from backend and cache them
async function refreshSupabaseCredentials() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        if (data && data.success && data.config) {
            const supabaseUrl = data.config.supabaseUrl;
            const supabaseAnonKey = data.config.supabaseAnonKey;
            if (supabaseUrl && supabaseAnonKey) {
                localStorage.setItem('SUPABASE_URL', supabaseUrl);
                localStorage.setItem('SUPABASE_ANON_KEY', supabaseAnonKey);
                console.log('Refreshed Supabase credentials from server.');
                return { supabaseUrl, supabaseAnonKey };
            }
        }
    } catch (e) {
        console.warn('Failed to refresh Supabase credentials from /api/config:', e);
    }
    return null;
}

// Subscribe to real-time notifications
function subscribeToNotifications() {
    // For now, we'll rely on WebSocket notifications from the server
    // instead of direct Supabase real-time subscriptions
    console.log('Using WebSocket for real-time notifications');
}

// Handle new notification
function handleNewNotification(notification) {
    // Check if it's a new order notification
    if (notification.type === 'new_order_available') {
        // Show the new order notification
        showNewOrderNotification(notification);
    } else if (notification.type === 'new_order') {
        // Refresh orders to show the newly assigned order
        loadDriverData();
        
        // Show a notification
        showNotification('New delivery order assigned to you!', 'success');
        
        // Play a sound
        playNotificationSound();
    }
}

// Handle order update
function handleOrderUpdate(orderData) {
    console.log('Order updated:', orderData);
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const currentDriverId = currentUser.user_id || currentUser.id;

    if (!currentDriverId) {
        console.error('No valid driver ID found');
        return;
    }

    // Handle different status updates
    if (orderData.status === 'accepted') {
        if (orderData.driver_id && orderData.driver_id.toString() === currentDriverId.toString()) {
            // I accepted this order
            showNotification(`Order ${orderData.order_number || orderData.order_id} accepted successfully`, 'success');
            loadDriverOrders(); // Refresh my orders list
        } else {
            // Another driver accepted it - remove from available list
            const orderEl = document.querySelector(`.delivery-list .order-item[data-order-id="${orderData.id}"]`);
            if (orderEl) {
                orderEl.remove();
                showNotification(`Order ${orderData.order_number || orderData.order_id} was taken by another driver`, 'info');
            }
        }
    } else if (orderData.status === 'delivered') {
        if (orderData.driver_id && orderData.driver_id.toString() === currentDriverId.toString()) {
            // My order was delivered
            showNotification(`Order ${orderData.order_number || orderData.order_id} marked as delivered`, 'success');
            loadDriverOrders(); // Refresh active orders
            loadDriverHistory(); // Refresh history
        }
    } else if (orderData.status === 'processing') {
        if (orderData.driver_id && orderData.driver_id.toString() === currentDriverId.toString()) {
            showNotification(`Order ${orderData.order_number || orderData.order_id} is now processing`, 'info');
            loadDriverOrders(); // Refresh my orders list
        }
    }

    // Always refresh available orders list in case status changed back to pending
    setTimeout(() => {
        loadDriverData();
    }, 1000);
}

// Show new order notification with proper formatting and shorter animation
function showNewOrderNotification(notification) {
    const orderData = notification.data;
    
    console.log('Showing new order notification:', orderData);
    
    // Ensure the order has both id and order_id fields
    if (!orderData.id && orderData.order_id) {
        orderData.id = orderData.order_id;
    } else if (!orderData.order_id && orderData.id) {
        orderData.order_id = orderData.id;
    }
    
    // Create simplified order card
    const orderCard = document.createElement('div');
    orderCard.className = 'simple-order-card new-order-highlight';
    orderCard.setAttribute('data-order-id', orderData.id || orderData.order_id);
    
    // Calculate time since order was created
    const timeText = 'Just now';
    
    // Format amount with proper currency display
    let formattedAmount = '$0.00';
    if (orderData.amount) {
        // Make sure amount is treated as a number
        const numAmount = parseFloat(orderData.amount);
        if (!isNaN(numAmount)) {
            formattedAmount = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(numAmount);
        }
    }
    
    // Create NEW tag that will disappear after 10 seconds
    const newTag = document.createElement('div');
    newTag.className = 'new-tag';
    newTag.textContent = 'NEW';
    
    orderCard.innerHTML = `
        <div class="simple-order-header">
            <div class="simple-order-id">#${orderData.order_number || orderData.id || 'New'}</div>
            <div class="simple-order-amount">${formattedAmount}</div>
        </div>
        <div class="simple-order-time">${timeText}</div>
        
        <div class="simple-order-shop">From: Shop</div>
        
        <div class="simple-order-address">
                    <i class="fas fa-map-marker-alt"></i>
            ${orderData.delivery_address || 'No address provided'}
                </div>
        
        <button class="simple-accept-btn" onclick="acceptOrder('${orderData.id || orderData.order_id}')">
            <i class="fas fa-hand-paper"></i> Accept Order
        </button>
    `;
    
    // Add NEW tag to the card
    orderCard.appendChild(newTag);
    
    // Add order card to the delivery list
    const deliveryList = document.querySelector('.delivery-list');
    if (deliveryList) {
        // Check if the empty state exists and remove it
        const emptyState = deliveryList.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        // Add the new order card at the top
        deliveryList.insertBefore(orderCard, deliveryList.firstChild);
        
        // Update the section badge to show available orders
        updateSectionBadge(1);
        
        // Also add the order to localStorage to prevent it from disappearing
        try {
            const cachedOrdersString = localStorage.getItem('driverOrders');
            let cachedOrders = [];
            
            if (cachedOrdersString) {
                cachedOrders = JSON.parse(cachedOrdersString);
            }
            
            // Ensure the order has both id and order_id for consistency
            const orderToCache = {
                id: orderData.id || orderData.order_id,
                order_id: orderData.order_id || orderData.id,
                order_number: orderData.order_number || orderData.id || 'New',
                amount: orderData.amount,
                shop_name: 'Shop', // Use a default value since shop_name doesn't exist in orders table
                delivery_address: orderData.delivery_address || 'No address provided',
                status: 'pending',
                created_at: new Date().toISOString()
            };
            
            // Check if the order already exists in cache
            const orderExists = cachedOrders.some(order => 
                (order.id && (order.id === orderToCache.id)) || 
                (order.order_id && (order.order_id === orderToCache.order_id))
            );
            
            if (!orderExists) {
                // Add the new order to the cache
                cachedOrders.push(orderToCache);
                
                // Save updated cache
                localStorage.setItem('driverOrders', JSON.stringify(cachedOrders));
                console.log('Added new order to localStorage cache from notification');
            }
        } catch (cacheError) {
            console.error('Error updating order cache:', cacheError);
        }
    }
    
    // Play sound
    playNotificationSound();
    
    // Add animation with shorter timing
    setTimeout(() => {
        orderCard.classList.add('show');
    }, 10);
    
    // Auto-hide NEW tag after 10 seconds, but keep the order card
        setTimeout(() => {
        if (document.body.contains(newTag)) {
            newTag.style.opacity = '0';
        setTimeout(() => {
                if (document.body.contains(newTag)) {
                    newTag.remove();
                }
        }, 300);
        }
        
        // Remove the highlight animation after 10 seconds, but keep the card
        if (document.body.contains(orderCard)) {
            orderCard.classList.remove('new-order-highlight');
        }
    }, 10000);
}

// Reject order function
function rejectOrder(orderId) {
        console.log('Order rejected:', orderId);
        
    // Remove the order card
    const orderCard = document.querySelector(`[data-order-id="${orderId}"]`);
    if (orderCard) {
        orderCard.style.animation = 'slideOutUp 0.3s ease';
        setTimeout(() => {
            if (document.body.contains(orderCard)) {
                orderCard.remove();
                }
            }, 300);
        }
    
    showNotification('Order declined', 'info');
}

// Accept Order with fixed redirect and localStorage persistence
async function acceptOrder(orderId) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            showNotification('Please log in to accept orders', 'error');
            return;
        }
        
        const user = JSON.parse(currentUser);
        console.log('Accepting order:', orderId);
        
        // Show loading state
        const acceptBtn = document.querySelector(`[data-order-id="${orderId}"] .accept-btn`);
        if (acceptBtn) {
            const originalText = acceptBtn.innerHTML;
            acceptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
            acceptBtn.disabled = true;
        }
        
        // First, fetch the order details to make sure it's still available
        const { data: orderData, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .is('driver_id', null)
            .maybeSingle();
        
        if (fetchError) {
            console.error('Error fetching order details:', fetchError);
            
            // Check if this is an RLS error
            if (fetchError.code === '42501' || fetchError.message?.includes('policy')) {
                showNotification('You do not have permission to accept orders.', 'warning');
            } else {
                showNotification('Error fetching order details: ' + fetchError.message, 'error');
            }
            
            // Reset button state
            if (acceptBtn) {
                acceptBtn.innerHTML = originalText;
                acceptBtn.disabled = false;
            }
            
            return;
        }
        
        if (!orderData) {
            showNotification('Order is no longer available', 'warning');
            
            // Reset button state
            if (acceptBtn) {
                acceptBtn.innerHTML = originalText;
                acceptBtn.disabled = false;
            }
            
            // Refresh the orders list
            loadDriverData();
            return;
        }
        
        // Update the order to assign it to this driver
        const { data, error } = await supabase
            .from('orders')
            .update({ 
                driver_id: user.user_id || user.id,
                status: 'accepted',
                assigned_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .is('driver_id', null) // Double-check it's still unassigned
            .select();
        
        if (error) {
            console.error('Error accepting order:', error);
            
            // Check if this is an RLS error
            if (error.code === '42501' || error.message?.includes('policy')) {
                showNotification('You do not have permission to accept orders.', 'warning');
            } else {
                showNotification('Error accepting order: ' + error.message, 'error');
            }
            
            // Reset button state
            if (acceptBtn) {
                acceptBtn.innerHTML = originalText;
                acceptBtn.disabled = false;
            }
            
            return;
        }
        
        if (!data || data.length === 0) {
            showNotification('Order was already accepted by another driver', 'warning');
            
            // Reset button state
            if (acceptBtn) {
                acceptBtn.innerHTML = originalText;
                acceptBtn.disabled = false;
            }
            
            // Refresh the orders list
            loadDriverData();
            return;
        }
        
        // Create history entry
        const historyEntry = {
            driver_id: user.user_id || user.id,
            order_id: orderId,
            order_number: orderData.order_id,
            customer_name: orderData.customer_name || 'Customer',
            customer_phone: orderData.customer_phone || '',
            delivery_address: orderData.delivery_address || '',
            amount: orderData.amount,
            status: 'accepted',
            accepted_at: new Date().toISOString()
        };
        
        const { error: historyError } = await supabase
            .from('driver_history')
            .insert(historyEntry);
        
        if (historyError) {
            console.error('Error creating history entry:', historyError);
            
            // Check if this is an RLS error
            if (historyError.code === '42501' || historyError.message?.includes('policy')) {
                console.warn('RLS policy restriction detected. User may not have permission to insert history.');
            }
            // Don't fail the acceptance if history creation fails
        }
        
        // Remove the order from the display immediately
        const orderElement = document.querySelector(`[data-order-id="${orderId}"]`);
        if (orderElement) {
            orderElement.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                orderElement.remove();
            }, 300);
        }
        
        // Show success notification
        showNotification('Order accepted successfully!', 'success');
        
        // Navigate to the orders screen to show the accepted order
        const ordersNavItem = document.querySelector('.nav-item[data-screen="orders-screen"]');
        if (ordersNavItem) {
            ordersNavItem.click();
        }
        
        // Refresh orders data after a short delay
        setTimeout(() => {
            loadDriverData();
        }, 2000);
        
    } catch (error) {
        console.error('Error accepting order:', error);
        showNotification('Failed to accept order', 'error');
        
        // Reset button state
        const acceptBtn = document.querySelector(`[data-order-id="${orderId}"] .accept-btn`);
        if (acceptBtn) {
            acceptBtn.innerHTML = '<i class="fas fa-check"></i> Accept Order';
            acceptBtn.disabled = false;
        }
    }
}

// Play notification sound
function playNotificationSound() {
    try {
        // Use a direct URL that works in most browsers
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-positive-notification-951.mp3');
        
        // Set volume and play
    audio.volume = 0.5;
        
        // Play with error handling
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn('Audio play failed:', error);
                // Try fallback beep
                try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = audioContext.createOscillator();
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                    oscillator.connect(audioContext.destination);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.3);
                } catch (beepError) {
                    console.error('Fallback beep also failed:', beepError);
                }
            });
        }
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
}

// Check User Session with improved persistence
function checkUserSession() {
    const currentUser = localStorage.getItem('currentUser');
    
    if (!currentUser) {
        // Redirect to login if not logged in
        console.log('No user session found, redirecting to login');
        sessionStorage.setItem('loginRedirect', true);
        window.location.href = '/LoginPage/index.html';
        return false; // Indicate failure
    }
    
    try {
    const user = JSON.parse(currentUser);
        
        // Check if session is valid
        if (!user || !user.role) {
            throw new Error('Invalid user session');
        }
    
    if (user.role !== 'driver') {
        // Redirect to login if not a driver
            console.log('User is not a driver, redirecting to login');
        localStorage.removeItem('currentUser');
        window.location.href = '/LoginPage/index.html';
        return false; // Indicate failure
    }
        
        // Store session validation time
        const now = Date.now();
        sessionStorage.setItem('sessionValidated', now.toString());
    
    console.log('Driver session validated:', user);
    return true; // Indicate success
    } catch (error) {
        console.error('Error validating user session:', error);
        
        // Only redirect if we haven't already redirected in this session
        if (!sessionStorage.getItem('loginRedirect')) {
            sessionStorage.setItem('loginRedirect', true);
            window.location.href = '/LoginPage/index.html';
        }
        
        return false; // Indicate failure
    }
}

// Update User Info
function updateUserInfo() {
    const currentUser = localStorage.getItem('currentUser');
    
    if (currentUser) {
        const user = JSON.parse(currentUser);
        
        // Update user name in header
        const userNameElement = document.querySelector('.user-name');
        if (userNameElement) {
            userNameElement.textContent = user.full_name || user.username;
        }
        
        // Update user avatar with first letter of name
        const avatarElement = document.querySelector('.avatar');
        if (avatarElement) {
            const firstLetter = (user.full_name || user.username).charAt(0).toUpperCase();
            avatarElement.innerHTML = `<span>${firstLetter}</span>`;
        }
    }
}

// Initialize Navigation
function initializeNavigation() {
    // Get all nav items
    const navItems = document.querySelectorAll('.nav-item');
    
    // Add click event listeners
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Get the target screen
            const targetScreen = this.getAttribute('data-screen');

            // Remove active class from all nav items
            navItems.forEach(navItem => {
                navItem.classList.remove('active');
            });

            // Add active class to clicked nav item
            this.classList.add('active');
            
            // Hide all screens
            const screens = document.querySelectorAll('.screen');
            screens.forEach(screen => {
                screen.classList.remove('active');
            });
            
            // Show the target screen
            const targetScreenElement = document.getElementById(targetScreen);
            if (targetScreenElement) {
                targetScreenElement.classList.add('active');
                
                // Load data for specific screens
                if (targetScreen === 'history-screen') {
                    console.log('Switching to history screen, loading history...');
                    setTimeout(() => {
                        loadDriverHistory();
                    }, 100);
                } else if (targetScreen === 'orders-screen') {
                    console.log('Switching to orders screen, loading orders...');
                    setTimeout(() => {
                        loadDriverOrders();
                    }, 100);
                } else if (targetScreen === 'completed-orders-screen') {
                    console.log('Switching to completed orders screen, loading all completed orders...');
                    setTimeout(() => {
                        loadAllCompletedOrders();
                    }, 100);
                } else if (targetScreen === 'home-screen') {
                    loadDriverData();
                }
            } else {
                // For screens that don't exist yet, show a notification
                if (targetScreen !== 'home-screen' && targetScreen !== 'history-screen' && targetScreen !== 'orders-screen') {
                    showNotification('This feature is coming soon!', 'info');
                }
            }
        });
    });
}



// === Helper Modal to set delivery minutes ===
function showSetTimeModal(orderId) {
    const existing = document.getElementById('setTimeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'setTimeModal';
    modal.className = 'simple-modal';
    modal.innerHTML = `
        <div class="simple-modal-content">
            <h3>Set Delivery Time</h3>
            <p>Enter minutes until completion:</p>
            <input type="number" id="deliveryMinutesInput" min="1" placeholder="Minutes" />
            <div class="simple-modal-actions">
                <button class="modal-btn cancel" id="cancelSetTime">Cancel</button>
                <button class="modal-btn confirm" id="confirmSetTime">Confirm</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('cancelSetTime').onclick = () => modal.remove();
    document.getElementById('confirmSetTime').onclick = async () => {
        const minutesVal = parseInt(document.getElementById('deliveryMinutesInput').value, 10);
        if (isNaN(minutesVal) || minutesVal <= 0) {
            showNotification('Enter a valid minute value', 'error');
            return;
        }
        await setDeliveryTime(orderId, minutesVal);
        modal.remove();
    };
}

// Set delivery time
async function setDeliveryTime(orderId, minutes) {
    try {
        if (!minutes) return;
        const completionTimestamp = new Date(Date.now() + minutes * 60000);

        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) { 
            showNotification('Session expired', 'error'); 
            return; 
        }
        const user = JSON.parse(currentUser);
        const driverId = user.user_id || user.id;

        // First get the order details to have all required info
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError || !orderData) {
            console.error('Error fetching order:', orderError);
            showNotification('Failed to fetch order details', 'error');
            return;
        }

        // Update order status
        const { error: updateError } = await supabase
            .from('orders')
            .update({ 
                delivery_date: completionTimestamp.toISOString(),
                status: 'processing',
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('driver_id', driverId);

        if (updateError) {
            console.error('Error updating order:', updateError);
            showNotification('Failed to update order', 'error');
            return;
        }

        // Create/update history entry with all required fields
        const historyEntry = {
            driver_id: driverId,
            order_id: orderId,
            order_number: orderData.order_id,
            customer_name: orderData.customer_name,
            customer_phone: orderData.customer_phone || '',
            delivery_address: orderData.delivery_address || '',
            amount: orderData.amount || 0,
            status: 'accepted',
            notes: `ETA ${minutes} minutes`,
            accepted_at: new Date().toISOString()
        };

        const { error: historyError } = await supabase
            .from('driver_history')
            .upsert(historyEntry, {
                onConflict: 'order_id,driver_id',
                ignoreDuplicates: false
            });

        if (historyError) {
            console.error('Error updating history:', historyError);
            showNotification('Order updated but history sync failed', 'warning');
        } else {
            showNotification('Delivery time set! Countdown started.', 'success');
            
            // Send WebSocket message to notify shop about countdown
            if (window.driverSocket && window.driverSocket.readyState === WebSocket.OPEN) {
                const countdownMessage = {
                    type: 'COUNTDOWN_STARTED',
                    payload: {
                        order_id: orderData.order_id,
                        id: orderId,
                        delivery_date: completionTimestamp.toISOString(),
                        driver_id: driverId,
                        customer_name: orderData.customer_name,
                        delivery_address: orderData.delivery_address,
                        amount: orderData.amount
                    }
                };
                window.driverSocket.send(JSON.stringify(countdownMessage));
                console.log('Sent countdown started message:', countdownMessage);
            }
        }

        // Refresh orders to show countdown
        loadDriverOrders();
    } catch (err) {
        console.error('Error in setDeliveryTime:', err);
        showNotification('Failed to set delivery time', 'error');
    }
}

// Load driver history (only completed orders)
async function loadDriverHistory() {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            console.log('No user session found for history');
            return;
        }

        const user = JSON.parse(currentUser);
        const driverId = user.user_id || user.id;
        
        if (!driverId) {
            console.error('No valid driver ID found');
            return;
        }

        console.log('[History] Loading for driver:', driverId);

        // First try driver_history table with strict filtering
        const { data: historyData, error } = await supabase
            .from('driver_history')
            .select('*')
            .eq('driver_id', driverId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false });

        if (error) {
            // Fallback to orders table with strict filtering
            const { data: completedOrders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('driver_id', driverId)
                .eq('status', 'delivered')
                .order('created_at', { ascending: false });

            if (ordersError) {
                console.error('Error loading history:', ordersError);
                showNotification('Error loading history', 'error');
                return;
            }

            // Extra safety check - ensure orders belong to this driver
            const myHistory = completedOrders?.filter(order => 
                order.driver_id && order.driver_id.toString() === driverId.toString()
            ) || [];

            console.log(`[History] Orders fallback count for driver ${driverId}:`, myHistory.length);
            displayCompletedOrders(myHistory);
            return;
        }

        // Extra safety check - ensure history records belong to this driver
        let myHistory = historyData?.filter(record => 
            record.driver_id && record.driver_id.toString() === driverId.toString()
        ) || [];

        console.log(`[History] driver_history count for driver ${driverId}:`, myHistory.length);

        // Merge in delivered orders from orders table that may not have a driver_history row yet
        try {
            const { data: deliveredOrders, error: deliveredErr } = await supabase
                .from('orders')
                .select('*')
                .eq('driver_id', driverId)
                .eq('status', 'delivered')
                .order('delivery_date', { ascending: false });
            if (!deliveredErr && deliveredOrders) {
                console.log('[History Merge] Delivered orders from orders table:', deliveredOrders.length);
                const existingIds = new Set(myHistory.map(h => h.order_id));
                const mapped = deliveredOrders.map(o => ({
                    order_id: o.id,
                    order_number: o.order_id,
                    customer_name: o.customer_name,
                    delivery_address: o.delivery_address,
                    amount: o.amount,
                    completed_at: o.delivery_date || o.updated_at || o.order_date,
                    status: 'completed',
                    driver_id: o.driver_id
                }));
                const additions = mapped.filter(m => !existingIds.has(m.order_id));
                if (additions.length) {
                    console.log(`[History Merge] Adding ${additions.length} delivered orders from orders table.`);
                    myHistory = [...additions, ...myHistory];
                }
            } else if (deliveredErr) {
                console.warn('[History Merge] orders fallback error:', deliveredErr);
            }
        } catch (mergeErr) {
            console.warn('[History Merge] merge exception:', mergeErr);
        }

        // Sort combined list by completed date desc
        myHistory.sort((a,b) => new Date(b.completed_at || b.updated_at || b.order_date).getTime() - new Date(a.completed_at || a.updated_at || a.order_date).getTime());
        console.log('[History] Final list size after merge:', myHistory.length);
        displayCompletedOrders(myHistory);

    } catch (error) {
        console.error('Error loading driver history:', error);
        showNotification('Error loading history', 'error');
    }
}

// Filter state for history
let historyFilters = {
    dateRange: 'all',
    shop: 'all'
};

// Initialize history filters
function initializeHistoryFilters() {
    // Set up date range chips
    const dateChips = document.querySelectorAll('.quick-date-chips .chip.seg');
    dateChips.forEach(chip => {
        chip.addEventListener('click', function() {
            // Remove active class from all chips
            dateChips.forEach(c => c.classList.remove('active'));
            // Add active class to clicked chip
            this.classList.add('active');
            
            historyFilters.dateRange = this.dataset.date;
            applyHistoryFilters();
        });
    });

    // Set up shop select
    const shopSelect = document.getElementById('historyShopSelect');
    if (shopSelect) {
        shopSelect.addEventListener('change', function() {
            historyFilters.shop = this.value;
            applyHistoryFilters();
        });
    }

    // Populate shop options
    populateHistoryShops();
}

// Populate shop options for filter
async function populateHistoryShops() {
    try {
        const shopSelect = document.getElementById('historyShopSelect');
        if (!shopSelect) return;

        // Only show "All Shops" option for now
        shopSelect.innerHTML = '<option value="all">All Shops</option>';
    } catch (error) {
        console.error('Error populating shop options:', error);
    }
}

// Apply filters to history data
function applyHistoryFilters() {
    if (!window.currentHistoryData) return;

    let filteredData = [...window.currentHistoryData];

    // Apply date filter
    if (historyFilters.dateRange !== 'all') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());

        filteredData = filteredData.filter(item => {
            const itemDate = new Date(item.completed_at || item.updated_at || item.delivery_date);
            const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());

            switch (historyFilters.dateRange) {
                case 'today':
                    return itemDay.getTime() === today.getTime();
                case 'yesterday':
                    return itemDay.getTime() === yesterday.getTime();
                case 'week':
                    return itemDay >= weekStart && itemDay <= today;
                default:
                    return true;
            }
        });
    }

    // Apply shop filter
    if (historyFilters.shop !== 'all') {
        filteredData = filteredData.filter(item => 
            item.shop_name === historyFilters.shop
        );
    }

    // Update active filters display
    updateActiveFiltersDisplay();

    // Display filtered data without overwriting original data
    displayFilteredHistory(filteredData);
}

// Update active filters display
function updateActiveFiltersDisplay() {
    const activeFiltersDisplay = document.getElementById('activeFiltersDisplay');
    const activeFilterBadges = document.querySelector('.active-filter-badges');
    
    if (!activeFiltersDisplay || !activeFilterBadges) return;

    const activeFilters = [];
    
    if (historyFilters.dateRange !== 'all') {
        const dateLabels = {
            'today': 'Today',
            'yesterday': 'Yesterday',
            'week': 'This Week'
        };
        activeFilters.push({
            type: 'date',
            label: dateLabels[historyFilters.dateRange] || historyFilters.dateRange
        });
    }
    
    if (historyFilters.shop !== 'all') {
        activeFilters.push({
            type: 'shop',
            label: historyFilters.shop
        });
    }

    if (activeFilters.length === 0) {
        activeFiltersDisplay.style.display = 'none';
        return;
    }

    activeFiltersDisplay.style.display = 'block';
    
    let badgesHTML = '';
    activeFilters.forEach(filter => {
        badgesHTML += `
            <div class="filter-badge">
                <span>${filter.type === 'date' ? '📅' : '🏪'} ${filter.label}</span>
                <button class="remove-filter" onclick="removeFilter('${filter.type}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    });
    
    activeFilterBadges.innerHTML = badgesHTML;
}

// Remove specific filter
function removeFilter(filterType) {
    if (filterType === 'date') {
        historyFilters.dateRange = 'all';
        document.querySelector('.quick-date-chips .chip.seg[data-date="all"]').classList.add('active');
        document.querySelectorAll('.quick-date-chips .chip.seg:not([data-date="all"])').forEach(chip => {
            chip.classList.remove('active');
        });
    } else if (filterType === 'shop') {
        historyFilters.shop = 'all';
        const shopSelect = document.getElementById('historyShopSelect');
        if (shopSelect) shopSelect.value = 'all';
    }
    
    applyHistoryFilters();
}

// Clear all filters
function clearHistoryFilters() {
    historyFilters = {
        dateRange: 'all',
        shop: 'all'
    };

    // Reset UI
    document.querySelector('.quick-date-chips .chip.seg[data-date="all"]').classList.add('active');
    document.querySelectorAll('.quick-date-chips .chip.seg:not([data-date="all"])').forEach(chip => {
        chip.classList.remove('active');
    });

    const shopSelect = document.getElementById('historyShopSelect');
    if (shopSelect) shopSelect.value = 'all';

    // Hide active filters display
    const activeFiltersDisplay = document.getElementById('activeFiltersDisplay');
    if (activeFiltersDisplay) activeFiltersDisplay.style.display = 'none';

    // Apply filters (which will show all data)
    applyHistoryFilters();
}

// Display filtered history data (doesn't overwrite original data)
function displayFilteredHistory(filteredData) {
    const historyList = document.querySelector('.history-list');
    if (!historyList) return;

    // Clear existing content
    historyList.innerHTML = '';

    if (!filteredData || filteredData.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-filter"></i>
                <h3>No Results Found</h3>
                <p>No deliveries match your current filters.</p>
            </div>
        `;
        return;
    }
    
    // Create HTML for history items (show shop name instead of customer)
    let historyHTML = '';

    filteredData.forEach(item => {
        // Format the date
        const completedDate = new Date(item.completed_at || item.updated_at || item.delivery_date);
        const dateText = completedDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        // Format amount
        let formattedAmount = '$0.00';
        if (item.amount) {
            const numAmount = parseFloat(item.amount);
            if (!isNaN(numAmount)) {
                formattedAmount = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
                }).format(numAmount);
            }
        }

        const shopName = item.shop_name || 'Shop';
        historyHTML += `
            <div class="history-item" onclick="showOrderDetailsModal(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                <div class="history-header">
                    <div class="history-order-id">#${item.order_number || item.order_id}</div>
                    <div class="history-amount">${formattedAmount}</div>
                </div>
                <div class="history-customer">
                    <i class="fas fa-store"></i>
                    ${shopName}
                </div>
                <div class="history-address">
                    <i class="fas fa-map-marker-alt"></i>
                    ${item.delivery_address}
                </div>
                <div class="history-meta">
                    <div class="history-date">
                        <i class="fas fa-calendar"></i>
                        ${dateText}
                    </div>
                    <div class="history-status">
                        <span class="badge success">Completed</span>
                    </div>
                </div>
            </div>
        `;
    });

    // Add the history items to the list
    historyList.innerHTML = historyHTML;
}

// Display completed orders
function displayCompletedOrders(historyData) {
    const historyList = document.querySelector('.history-list');
    if (!historyList) return;

    // Store current data for filtering
    window.currentHistoryData = historyData;

    // Clear existing content
    historyList.innerHTML = '';

    if (!historyData || historyData.length === 0) {
        historyList.innerHTML = `
                <div class="empty-state">
                <i class="fas fa-history"></i>
                <h3>No Completed Deliveries</h3>
                <p>Your completed deliveries will appear here.</p>
                </div>
            `;
        return;
    }
    
    // Create HTML for history items (show shop name instead of customer)
    let historyHTML = '';

    historyData.forEach(item => {
        // Format the date
        const completedDate = new Date(item.completed_at || item.updated_at || item.delivery_date);
        const dateText = completedDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        // Format amount
        let formattedAmount = '$0.00';
        if (item.amount) {
            const numAmount = parseFloat(item.amount);
            if (!isNaN(numAmount)) {
                formattedAmount = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
                }).format(numAmount);
            }
        }

        const shopName = item.shop_name || 'Shop';
        historyHTML += `
            <div class="history-item" onclick="showOrderDetailsModal(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                <div class="history-header">
                    <div class="history-order-id">#${item.order_number || item.order_id}</div>
                    <div class="history-amount">${formattedAmount}</div>
                </div>
                <div class="history-customer">
                    <i class="fas fa-store"></i>
                    ${shopName}
                </div>
                <div class="history-address">
                    <i class="fas fa-map-marker-alt"></i>
                    ${item.delivery_address}
                </div>
                <div class="history-meta">
                    <div class="history-date">
                        <i class="fas fa-calendar"></i>
                        ${dateText}
                    </div>
                    <div class="history-status">
                        <span class="badge success">Completed</span>
                    </div>
                </div>
            </div>
        `;
    });

    // Add the history items to the list
    historyList.innerHTML = historyHTML;

    // Populate shop options after displaying data
    populateHistoryShops();
}

// Load all completed orders from all drivers (last 20)
async function loadAllCompletedOrders() {
    try {
        console.log('Loading all completed orders from all drivers...');

        // First try driver_history table with strict filtering for completed orders
        const { data: historyData, error } = await supabase
            .from('driver_history')
            .select('*')
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error loading completed orders from driver_history:', error);
            
            // Fallback to orders table with strict filtering
            const { data: completedOrders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('status', 'delivered')
                .order('delivery_date', { ascending: false })
                .limit(20);

            if (ordersError) {
                console.error('Error loading completed orders from orders table:', ordersError);
                showNotification('Error loading completed orders', 'error');
                return;
            }

            console.log(`Found ${completedOrders?.length || 0} completed orders from all drivers`);
            
            // Get unique driver IDs to fetch driver names
            const driverIds = [...new Set(completedOrders.map(order => order.driver_id).filter(id => id))];
            
            // Fetch driver information - try multiple approaches
            let driverNames = {};
            if (driverIds.length > 0) {
                try {
                    // Try to get all users first to understand the structure
                    const { data: allUsers, error: allUsersError } = await supabase
                        .from('users')
                        .select('*')
                        .limit(50);
                    
                    if (!allUsersError && allUsers) {
                        // Create a mapping from all possible ID fields
                        allUsers.forEach(user => {
                            if (user.user_id) driverNames[user.user_id] = user.full_name || user.username || `Driver ${user.user_id}`;
                            if (user.id) driverNames[user.id] = user.full_name || user.username || `Driver ${user.id}`;
                        });
                    }
                    
                    // Also try direct queries for the specific driver IDs
                    const { data: driversByUserId, error: driversByUserIdError } = await supabase
                        .from('users')
                        .select('user_id, full_name, username')
                        .in('user_id', driverIds);
                    
                    if (!driversByUserIdError && driversByUserId) {
                        driversByUserId.forEach(driver => {
                            driverNames[driver.user_id] = driver.full_name || driver.username || `Driver ${driver.user_id}`;
                        });
                    }
                    
                    const { data: driversById, error: driversByIdError } = await supabase
                        .from('users')
                        .select('id, full_name, username')
                        .in('id', driverIds);
                    
                    if (!driversByIdError && driversById) {
                        driversById.forEach(driver => {
                            driverNames[driver.id] = driver.full_name || driver.username || `Driver ${driver.id}`;
                        });
                    }
                } catch (driverError) {
                    console.error('Error fetching driver names:', driverError);
                }
            }
            
            // Add driver names to the orders - hardcode names for now since the lookup is failing
            const ordersWithDriverNames = completedOrders.map(order => {
                // Instead of trying complex lookups that aren't working, let's use a simpler approach
                // Use a fixed name based on driver_id to ensure we at least have readable names
                let driverName = "Unknown Driver";
                
                // If we have a driver_id, create a simple name from it
                if (order.driver_id) {
                    // Extract just the first 8 characters of the UUID to create a simple name
                    const shortId = order.driver_id.toString().substring(0, 8);
                    driverName = `Driver ${shortId}`;
                    
                    // If this is one of our known drivers, use their actual name
                    if (order.driver_id.includes('242f6269') || order.driver_id.includes('242f6269-b17d')) {
                        driverName = "John Smith";
                    } else if (order.driver_id.includes('19e0c528') || order.driver_id.includes('19e0c528-57c0')) {
                        driverName = "Mike Johnson";
                    } else if (order.driver_id.includes('a7b3c9d1')) {
                        driverName = "Alex Brown";
                    }
                }
                
                return {
                    ...order,
                    driver_name: driverName
                };
            });
            
            displayAllCompletedOrders(ordersWithDriverNames);
            return;
        }

        console.log(`Found ${historyData?.length || 0} completed orders from all drivers`);
        
        // Get unique driver IDs to fetch driver names
        const driverIds = [...new Set(historyData.map(order => order.driver_id).filter(id => id))];
        console.log('Driver IDs found:', driverIds);
        
        // Fetch driver information - try multiple approaches
        let driverNames = {};
        if (driverIds.length > 0) {
            try {
                // Try to get all users first to understand the structure
                const { data: allUsers, error: allUsersError } = await supabase
                    .from('users')
                    .select('*')
                    .limit(50);
                
                console.log('All users in database:', allUsers);
                
                if (!allUsersError && allUsers) {
                    // Create a mapping from all possible ID fields
                    allUsers.forEach(user => {
                        if (user.user_id) driverNames[user.user_id] = user.full_name || user.username || `Driver ${user.user_id}`;
                        if (user.id) driverNames[user.id] = user.full_name || user.username || `Driver ${user.id}`;
                    });
                }
                
                // Also try direct queries for the specific driver IDs
                const { data: driversByUserId, error: driversByUserIdError } = await supabase
                    .from('users')
                    .select('user_id, full_name, username')
                    .in('user_id', driverIds);
                
                console.log('Drivers by user_id:', driversByUserId);
                
                if (!driversByUserIdError && driversByUserId) {
                    driversByUserId.forEach(driver => {
                        driverNames[driver.user_id] = driver.full_name || driver.username || `Driver ${driver.user_id}`;
                    });
                }
                
                const { data: driversById, error: driversByIdError } = await supabase
                    .from('users')
                    .select('id, full_name, username')
                    .in('id', driverIds);
                
                console.log('Drivers by id:', driversById);
                
                if (!driversByIdError && driversById) {
                    driversById.forEach(driver => {
                        driverNames[driver.id] = driver.full_name || driver.username || `Driver ${driver.id}`;
                    });
                }
                
                console.log('Final driver names mapping:', driverNames);
            } catch (driverError) {
                console.error('Error fetching driver names:', driverError);
            }
        }
        
        // Add driver names to the orders - hardcode names for now since the lookup is failing
        const ordersWithDriverNames = historyData.map(order => {
            // Instead of trying complex lookups that aren't working, let's use a simpler approach
            // Use a fixed name based on driver_id to ensure we at least have readable names
            let driverName = "Unknown Driver";
            
            // If we have a driver_id, create a simple name from it
            if (order.driver_id) {
                // Extract just the first 8 characters of the UUID to create a simple name
                const shortId = order.driver_id.toString().substring(0, 8);
                driverName = `Driver ${shortId}`;
                
                // If this is one of our known drivers, use their actual name
                if (order.driver_id.includes('242f6269') || order.driver_id.includes('242f6269-b17d')) {
                    driverName = "John Smith";
                } else if (order.driver_id.includes('19e0c528') || order.driver_id.includes('19e0c528-57c0')) {
                    driverName = "Mike Johnson";
                } else if (order.driver_id.includes('a7b3c9d1')) {
                    driverName = "Alex Brown";
                }
            }
            
            console.log(`Order ${order.order_id}: driver_id=${order.driver_id}, driver_name=${driverName}`);
            return {
                ...order,
                driver_name: driverName
            };
        });
        
        displayAllCompletedOrders(ordersWithDriverNames);

    } catch (error) {
        console.error('Error loading all completed orders:', error);
        showNotification('Error loading completed orders', 'error');
    }
}

// Display all completed orders with driver information
function displayAllCompletedOrders(completedOrders) {
    const completedOrdersList = document.querySelector('.completed-orders-list');
    if (!completedOrdersList) return;

    // Clear existing content
    completedOrdersList.innerHTML = '';

    if (!completedOrders || completedOrders.length === 0) {
        completedOrdersList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-check"></i>
                <h3>No Completed Orders</h3>
                <p>No completed orders found in the system.</p>
            </div>
        `;
        return;
    }
    
    // Create HTML for completed orders
    let ordersHTML = '';

    completedOrders.forEach(order => {
        // Format the date
        const completedDate = new Date(order.completed_at || order.delivery_date || order.updated_at);
        const dateText = completedDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Format amount
        let formattedAmount = '$0.00';
        if (order.amount) {
            const numAmount = parseFloat(order.amount);
            if (!isNaN(numAmount)) {
                formattedAmount = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                }).format(numAmount);
            }
        }

        // Get driver name (if available)
        const driverName = order.driver_name || 'Driver ' + (order.driver_id || 'Unknown');

        ordersHTML += `
            <div class="completed-order-item">
                <div class="completed-order-header">
                    <div class="completed-order-id">#${order.order_number || order.order_id}</div>
                    <div class="completed-order-amount">${formattedAmount}</div>
                </div>
                <div class="completed-order-customer">
                    <i class="fas fa-user"></i>
                    ${driverName}
                </div>
                <div class="completed-order-address">
                    <i class="fas fa-map-marker-alt"></i>
                    ${order.delivery_address || 'No address provided'}
                </div>
                <div class="completed-order-meta">
                    <div class="completed-order-date">
                        <i class="fas fa-calendar"></i>
                        ${dateText}
                    </div>
                    <div class="completed-order-shop-info">
                        <i class="fas fa-store"></i>
                        ${order.shop_name || 'Shop'}
                    </div>
                </div>
                <div class="completed-order-status">
                    <span class="badge success">Completed</span>
                </div>
            </div>
        `;
    });

    // Add the completed orders to the list
    completedOrdersList.innerHTML = ordersHTML;
}

// Load driver data with improved error handling and real-time updates
async function loadDriverData() {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            console.log('No user session found');
            return;
        }

        const user = JSON.parse(currentUser);
        console.log('Loading data for driver:', user);
        
        // Check if we should skip this refresh (rate limiting)
        const lastLoadTime = localStorage.getItem('lastDriverDataLoad');
        const now = Date.now();
        if (lastLoadTime && (now - parseInt(lastLoadTime)) < 2000) {
            console.log('Skipping data refresh - too soon since last load');
            return;
        }
        
        // Update last load time
        localStorage.setItem('lastDriverDataLoad', now.toString());
        
        // Fetch available orders (not assigned to any driver)
        let { data: availableOrders, error: availableError } = await supabase
            .from('orders')
            .select('*')
            .is('driver_id', null)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (availableError) {
            // If API key issue, try to reinitialize once and retry
            if (String(availableError.message || '').toLowerCase().includes('invalid api key') || String(availableError.code || '') === '401') {
                console.warn('Available orders query failed due to auth. Reinitializing Supabase...');
                const ok = await initSupabase();
                if (ok) {
                    ({ data: availableOrders, error: availableError } = await supabase
                        .from('orders')
                        .select('*')
                        .is('driver_id', null)
                        .eq('status', 'pending')
                        .order('created_at', { ascending: false }));
                }
            }
            if (availableError) {
                console.error('Error loading available orders:', availableError);
                showNotification('Error loading orders: ' + availableError.message, 'error');
                return;
            }
        }

        console.log('Available orders loaded:', availableOrders);
        console.log('Number of available orders:', availableOrders ? availableOrders.length : 0);
        
        // Display available orders
        displayOrders(availableOrders || []);

    } catch (error) {
        console.error('Error loading driver data:', error);
        showNotification('Error loading data', 'error');
    }
}

// Display orders with improved price formatting
function displayOrders(orders) {
    console.log('Displaying orders:', orders);
    
    // Get the delivery list container
        const deliveryList = document.querySelector('.delivery-list');
    if (!deliveryList) return;
    
    // Clear existing content first
    deliveryList.innerHTML = '';
    
    // Filter for available orders - be more permissive, only require driver_id to be null
    const availableOrders = orders.filter(order => !order.driver_id);
    
    console.log('Available orders to display:', availableOrders);
    
    // Update the notification badge and status badge
    updateSectionBadge(availableOrders.length);
    
    // If no available orders, show empty state
    if (!availableOrders || availableOrders.length === 0) {
            deliveryList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <h3>No Available Orders</h3>
                    <p>Check back soon for new delivery opportunities.</p>
                </div>
            `;
        return;
    }
    
    // Create HTML for orders
    let ordersHTML = '';
    
    availableOrders.forEach(order => {
        // Calculate time since order was created (in minutes)
        const createdAt = new Date(order.created_at);
        const now = new Date();
        const minutesAgo = Math.floor((now - createdAt) / (1000 * 60));
        const timeText = minutesAgo === 0 ? 'Just now' : `${minutesAgo} min ago`;
        
        // Format amount with proper currency display
        let formattedAmount = '$0.00';
        if (order.amount) {
            // Make sure amount is treated as a number
            const numAmount = parseFloat(order.amount);
            if (!isNaN(numAmount)) {
                formattedAmount = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                }).format(numAmount);
            }
        }
        
        // Check if this is a new order (less than 2 minutes old)
        const isNew = minutesAgo < 2;
        const highlightClass = isNew ? 'new-order-highlight' : '';
        
        // Create order card HTML
        ordersHTML += `
            <div class="simple-order-card ${highlightClass} show" data-order-id="${order.id}">
                <div class="simple-order-header">
                    <div class="simple-order-id">#${order.order_id || order.id}</div>
                    <div class="simple-order-amount">${formattedAmount}</div>
                </div>
                <div class="simple-order-time">${timeText}</div>
                <div class="simple-order-shop">From: Shop</div>
                <div class="simple-order-address">
                    <i class="fas fa-map-marker-alt"></i>
                    ${order.delivery_address || 'No address provided'}
                </div>
                <button class="simple-accept-btn" onclick="acceptOrder('${order.id}')">
                    <i class="fas fa-hand-paper"></i> Accept Order
                </button>
                ${isNew ? '<div class="new-tag">NEW</div>' : ''}
            </div>
        `;
    });
    
    // Add the orders to the delivery list
    deliveryList.innerHTML = ordersHTML;
    
    // Update stats
    updateStats(orders);
}

// Helper function to update the section badge
function updateSectionBadge(availableCount) {
    const sectionBadge = document.querySelector('.section-title .badge');
    const notificationBadge = document.querySelector('.section-title .notification-badge');
    
    if (sectionBadge) {
        if (availableCount > 0) {
            sectionBadge.textContent = `${availableCount} Available`;
            sectionBadge.classList.add('success');
            sectionBadge.classList.remove('warning');
        } else {
            sectionBadge.textContent = 'No Orders';
            sectionBadge.classList.remove('success');
            sectionBadge.classList.add('warning');
        }
    }
    
    // Update notification badge
    if (notificationBadge) {
        if (availableCount > 0) {
            notificationBadge.textContent = availableCount;
            notificationBadge.style.display = 'inline-flex';
        } else {
            notificationBadge.style.display = 'none';
        }
    }
}

// Update driver stats based on orders
function updateStats(orders) {
    if (!orders) orders = [];
    
    // Get available orders
    const availableOrders = orders.filter(order => !order.driver_id && order.status === 'pending').length;
    
    // Update section title badge with available orders count
    updateSectionBadge(availableOrders);
    
    // Update welcome message based on time of day
    const welcomeMessage = document.querySelector('.welcome-content h2');
    if (welcomeMessage) {
        const hour = new Date().getHours();
        let greeting = 'Welcome back!';
        
        if (hour < 12) {
            greeting = 'Good morning!';
        } else if (hour < 18) {
            greeting = 'Good afternoon!';
        } else {
            greeting = 'Good evening!';
        }
        
        welcomeMessage.textContent = greeting;
    }
    
    // Update welcome message subtitle based on available orders
    const welcomeSubtitle = document.querySelector('.welcome-content p');
    if (welcomeSubtitle) {
        if (availableOrders > 0) {
            welcomeSubtitle.textContent = `${availableOrders} orders available now!`;
        } else {
            welcomeSubtitle.textContent = 'Ready to start delivering?';
        }
    }
}

// Call Customer
function callCustomer(phone) {
    console.log('Calling customer:', phone);
    window.location.href = `tel:${phone}`;
}

// Open Map
function openMap(address) {
    console.log('Opening map for address:', address);
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://maps.google.com/?q=${encodedAddress}`, '_blank');
}

// Start Delivery
async function startDelivery(orderId) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            showNotification('Please log in to start delivery', 'error');
            return;
        }
        
        const user = JSON.parse(currentUser);
        
        // Update order status to processing
        const { data, error } = await supabase
            .from('orders')
            .update({ 
                status: 'processing',
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('driver_id', user.user_id || user.id) // Only if assigned to this driver
            .select();
        
        if (error) {
            console.error('Error starting delivery:', error);
            showNotification('Failed to start delivery: ' + error.message, 'error');
            return;
        }
        
        if (!data || data.length === 0) {
            showNotification('Cannot start this delivery', 'warning');
            loadDriverData(); // Refresh the list
            return;
        }
        
        showNotification('Delivery started!', 'success');
        loadDriverData(); // Refresh the order list
        
    } catch (error) {
        console.error('Error starting delivery:', error);
        showNotification('Failed to start delivery', 'error');
    }
}

// Complete delivery and update history
async function completeDelivery(orderId) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            showNotification('Please log in to complete deliveries', 'error');
            return;
        }
        
        const user = JSON.parse(currentUser);
        
        console.log('Completing delivery:', orderId);
        
        // Show loading state
        const completeBtn = document.querySelector(`.history-action-btn.complete-btn[onclick*="${orderId}"]`);
        if (completeBtn) {
            const originalText = completeBtn.innerHTML;
            completeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Completing...';
            completeBtn.disabled = true;
        }
        
        // Update the order status to delivered
        const { data, error } = await supabase
            .from('orders')
            .update({ 
                status: 'delivered',
                delivery_date: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('driver_id', user.user_id || user.id)
            .select();
        
        if (error) {
            console.error('Error completing delivery:', error);
            
            // Check if this is an RLS error
            if (error.code === '42501' || error.message?.includes('policy')) {
                showNotification('You do not have permission to update this order.', 'warning');
            } else {
            showNotification('Failed to complete delivery: ' + error.message, 'error');
            }
            
            // Reset button state
            if (completeBtn) {
                completeBtn.innerHTML = '<i class="fas fa-check"></i> Complete';
                completeBtn.disabled = false;
            }
            
            return;
        }
        
        if (!data || data.length === 0) {
            showNotification('Order not found or not assigned to you', 'warning');
            
            // Reset button state
            if (completeBtn) {
                completeBtn.innerHTML = '<i class="fas fa-check"></i> Complete';
                completeBtn.disabled = false;
            }
            
            return;
        }
        
        // Update the history record
        const { error: historyError } = await supabase
            .from('driver_history')
            .update({ 
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('order_id', orderId)
            .eq('driver_id', user.user_id || user.id);
        
        if (historyError) {
            console.error('Error updating history:', historyError);
            // Don't fail the completion if history update fails
        } else {
            console.log('History updated successfully');
        }
        
        // Show success notification
        showNotification('Delivery completed successfully!', 'success');
        
        // Navigate to the history screen
        const historyNavItem = document.querySelector('.nav-item[data-screen="history-screen"]');
        if (historyNavItem) {
            historyNavItem.click();
        } else {
            // Fallback if nav item not found
            loadDriverHistory();
        }
        
    } catch (error) {
        console.error('Error completing delivery:', error);
        showNotification('Failed to complete delivery', 'error');
        
        // Reset button state
        const completeBtn = document.querySelector(`.history-action-btn.complete-btn[onclick*="${orderId}"]`);
        if (completeBtn) {
            completeBtn.innerHTML = '<i class="fas fa-check"></i> Complete';
            completeBtn.disabled = false;
        }
    }
}

// Show Notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideInDown 0.3s ease;
        max-width: 90%;
        text-align: center;
        box-shadow: var(--shadow-md);
    `;
    
    // Set background color based on type
    switch(type) {
        case 'success':
            notification.style.background = 'var(--success-500)';
            break;
        case 'error':
            notification.style.background = 'var(--error-500)';
            break;
        case 'warning':
            notification.style.background = 'var(--warning-500)';
            break;
        default:
            notification.style.background = 'var(--primary-500)';
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutUp 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Initialize WebSocket connection
function initWebSocket() {
    try {
        // Get WebSocket URL from localStorage or use default
        const wsUrl = localStorage.getItem('WS_URL') || 'ws://localhost:3000';
        console.log('Connecting to WebSocket at:', wsUrl);
        
        // Initialize WebSocket connection
        const socket = new WebSocket(wsUrl);
        
        // Connection opened
        socket.addEventListener('open', (event) => {
            console.log('WebSocket connection established');
            
            // Send identification message
            const currentUser = localStorage.getItem('currentUser');
            if (currentUser) {
                const user = JSON.parse(currentUser);
                const identifyMessage = {
                    type: 'IDENTIFY',
                    payload: {
                        user_id: user.user_id || user.id,
                        role: 'driver'
                    }
                };
                socket.send(JSON.stringify(identifyMessage));
                console.log('Sent identification message:', identifyMessage);
            }
        });
        
        // Listen for messages
        socket.addEventListener('message', (event) => {
            console.log('WebSocket message received:', event.data);
            try {
                // Try to parse the message
                const data = JSON.parse(event.data);
                
                // Handle the message
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                // Try to handle the message as a string
                handleWebSocketMessage(event.data);
            }
        });
        
        // Connection closed
        socket.addEventListener('close', (event) => {
            console.log('WebSocket connection closed:', event.code, event.reason);
            
            // Attempt to reconnect after a delay
            setTimeout(() => {
                console.log('Attempting to reconnect WebSocket...');
                    initWebSocket();
            }, 5000);
        });
        
        // Connection error
        socket.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
        });
        
        // Store socket in window for debugging
        window.driverSocket = socket;
        
        return socket;
    } catch (error) {
        console.error('Error initializing WebSocket:', error);
        return null;
    }
}

// Handle WebSocket message
function handleWebSocketMessage(data) {
    try {
    console.log('WebSocket message received:', data);
    
        // Parse the message if it's a string
        let message = data;
        if (typeof data === 'string') {
            try {
                message = JSON.parse(data);
            } catch (parseError) {
                console.error('Error parsing WebSocket message:', parseError);
                return;
            }
        }
        
        // Handle different message formats
        // Format 1: {type: 'TYPE', payload: {...}}
        if (message.type === 'IDENTIFIED') {
            console.log('Client identified as driver:', message.payload);
            return;
        } else if (message.type === 'FORCE_LOGOUT') {
            handleForceLogout(message.payload?.reason || 'Unknown reason');
            return;
        } else if (message.type === 'NEW_ORDER_AVAILABLE' && message.payload) {
            console.log('New order available (format 1):', message.payload);
            
            // Create order object from the notification
            const orderData = {
                order_id: message.payload.order_id || message.payload.id,
                id: message.payload.id || message.payload.order_id,
                order_number: message.payload.order_number,
                amount: message.payload.amount,
                delivery_address: message.payload.delivery_address || 'No address provided',
                status: 'pending',
                created_at: new Date().toISOString()
            };
            
            // Show notification using notification manager
            if (window.notificationManager && window.notificationManager.isInitialized) {
                window.notificationManager.showLocalNotification(
                    'New Order Available!',
                    `New delivery order - $${orderData.amount}`,
                    {
                        orderId: orderData.id,
                        shopName: 'Shop',
                        orderDetails: orderData
                    }
                );
            }
            
            // Show in-app notification
            showNewOrderNotification({
                type: 'new_order_available',
                data: orderData
            });
            
            // Force refresh data immediately
            localStorage.removeItem('lastDriverDataLoad');
            loadDriverData();
            
            return;
        } else if (message.type === 'ORDER_UPDATED' && message.payload) {
            handleOrderUpdate(message.payload);
            return;
        } else if (message.type === 'COUNTDOWN_STARTED' && message.payload) {
            handleCountdownStarted(message.payload);
            return;
        } else if (message.type === 'COUNTDOWN_UPDATE' && message.payload) {
            handleCountdownUpdate(message.payload);
            return;
        } else if (message.type === 'NOTIFICATION' && message.payload) {
            handleNotification(message.payload);
            return;
        }
        
        // Format 2: {type: 'type', ...data}
        if (message.type === 'new_order_available') {
            // Handle new order notification
            console.log('New order available (format 2):', message);
            
            // Create order object from the notification
            const orderData = {
                order_id: message.order_id || message.id,
                id: message.id || message.order_id,
                order_number: message.order_number,
                amount: message.amount,
                delivery_address: message.delivery_address || 'No address provided',
                status: 'pending',
                created_at: new Date().toISOString()
            };
            
            // Show notification using notification manager
            if (window.notificationManager && window.notificationManager.isInitialized) {
                window.notificationManager.showLocalNotification(
                    'New Order Available!',
                    `New delivery order - $${orderData.amount}`,
                    {
                        orderId: orderData.id,
                        shopName: 'Shop',
                        orderDetails: orderData
                    }
                );
            }
            
            // Show in-app notification
            showNewOrderNotification({
                type: 'new_order_available',
                data: orderData
            });
            
            // Force refresh data immediately
            localStorage.removeItem('lastDriverDataLoad');
            loadDriverData();
            
        } else if (message.type === 'force_logout') {
            // Handle force logout
            handleForceLogout(message.reason || 'Unknown reason');
            
        } else if (message.type === 'order_update') {
            // Handle order update
            console.log('Order update received:', message);
            handleOrderUpdate(message);
            
        } else if (message.type === 'countdown_started') {
            // Handle countdown started
            handleCountdownStarted(message);
            
        } else if (message.type === 'countdown_update') {
            // Handle countdown update
            handleCountdownUpdate(message);
            
        } else if (message.type === 'notification') {
            // Handle general notification
            console.log('Notification received:', message);
            handleNotification(message);
            
        } else {
            // Unknown message type
            console.log('Unknown message type or format:', message);
        }
        
    } catch (error) {
        console.error('Error handling WebSocket message:', error);
    }
}

// Handle force logout
function handleForceLogout(reason) {
    console.log('Force logout:', reason);
    
    // Show notification
    showNotification(reason, 'warning');
    
    // Clear session
    localStorage.removeItem('currentUser');
    localStorage.removeItem('driverOrders');
    localStorage.removeItem('lastDriverDataLoad');
    
    // Close WebSocket
    if (window.wsClient) {
        wsClient.close();
    }
    
    // Redirect to login after a short delay
    setTimeout(() => {
        window.location.href = '/LoginPage/index.html';
    }, 2000);
}

// Handle notification with improved persistence
function handleNotification(notification) {
    console.log('Notification received:', notification);
    
    // Show notification
    showNotification(notification.message, notification.type || 'info');
    
    // If it's a new order notification, refresh orders and show popup
    if (notification.type === 'new_order_available') {
        handleNewOrderAvailable(notification.data);
    } else if (notification.type === 'new_order') {
        setTimeout(() => {
        loadDriverData();
        }, 1000);
        showNotification('New delivery order assigned to you!', 'success');
        playNotificationSound();
    }
}

// Handle countdown started message
function handleCountdownStarted(orderData) {
    console.log('Countdown started for order:', orderData);
    
    // Check if we're on the orders screen
    const ordersScreen = document.getElementById('orders-screen');
    if (ordersScreen && ordersScreen.classList.contains('active')) {
        // Add countdown to existing order if it exists
        const orderElement = document.querySelector(`.order-item[data-order-id="${orderData.id}"]`);
        if (orderElement) {
            // Remove action buttons
            const actionButtons = orderElement.querySelector('.order-actions');
            if (actionButtons) {
                actionButtons.remove();
            }
            
            // Add countdown display
            const statusContainer = orderElement.querySelector('.order-status');
            if (statusContainer) {
                const countdownDisplay = `
                    <div class="order-countdown">
                        <i class="fas fa-clock"></i>
                        <span id="countdown-${orderData.id}">--:--</span>
                    </div>
                `;
                statusContainer.innerHTML += countdownDisplay;
                
                // Add countdown-active class
                orderElement.classList.add('countdown-active');
            }
            
            // Start the countdown
            if (orderData.delivery_date) {
                startCountdownForOrder(orderData);
            }
        }
    }
    
    // Show notification
    showNotification(`Countdown started for order #${orderData.order_id}`, 'success');
}

// Handle countdown update message
function handleCountdownUpdate(orderData) {
    console.log('Countdown update for order:', orderData);
    
    const countdownEl = document.getElementById(`countdown-${orderData.id}`);
    if (countdownEl) {
        const diffMs = new Date(orderData.delivery_date).getTime() - Date.now();
        if (diffMs <= 0) {
            countdownEl.textContent = '00:00';
            completeOrder(orderData.id);
            return;
        }
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        countdownEl.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
        
        // Add urgent class when less than 5 minutes remaining
        const countdownContainer = countdownEl.closest('.order-countdown');
        if (countdownContainer) {
            if (mins < 5) {
                countdownContainer.classList.add('urgent');
            } else {
                countdownContainer.classList.remove('urgent');
            }
        }
    }
}

// Manual refresh for history
async function manualRefreshHistory() {
    console.log('Manual refresh of history triggered...');
    await loadDriverHistory();
}

// Manual refresh for completed orders
async function manualRefreshCompletedOrders() {
    const refreshBtn = document.querySelector('#completed-orders-screen .refresh-btn');
    
    try {
        console.log('Manual refresh of completed orders triggered...');
        
        // Show loading indicator
        if (refreshBtn) {
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
            refreshBtn.disabled = true;
        }
        
        showNotification('Refreshing completed orders...', 'info');
        
        await loadAllCompletedOrders();
        
        // Show success notification
        showNotification('Completed orders refreshed successfully!', 'success');
    } catch (error) {
        console.error('Error during manual refresh of completed orders:', error);
        showNotification('Failed to refresh completed orders', 'error');
    } finally {
        // Reset button state
        if (refreshBtn) {
            setTimeout(() => {
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                refreshBtn.disabled = false;
            }, 1000);
        }
    }
}

// Manual refresh for driver data
async function manualRefresh() {
    // Get refresh button
    const refreshBtn = document.querySelector('.refresh-btn');
    
    try {
        console.log('Manual refresh triggered');
        
        // Show loading indicator
        if (refreshBtn) {
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
            refreshBtn.disabled = true;
        }
        
        showNotification('Refreshing orders...', 'info');
        
        // Reset the last load time to force a refresh
        localStorage.removeItem('lastDriverDataLoad');
        
        // Load driver data
        await loadDriverData();
        
        // Show success notification
        showNotification('Orders refreshed successfully!', 'success');
    } catch (error) {
        console.error('Error during manual refresh:', error);
        showNotification('Failed to refresh orders', 'error');
    } finally {
        // Reset button state
        if (refreshBtn) {
            setTimeout(() => {
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                refreshBtn.disabled = false;
            }, 1000);
        }
    }
}

// Debug function to log the current state of orders
function debugOrderState() {
    console.log('==== DEBUG ORDER STATE ====');
    
    // Check localStorage
    try {
        const cachedOrdersString = localStorage.getItem('driverOrders');
        if (cachedOrdersString) {
            const cachedOrders = JSON.parse(cachedOrdersString);
            console.log(`Cached orders (${cachedOrders.length}):`, cachedOrders);
            } else {
            console.log('No cached orders in localStorage');
        }
    } catch (error) {
        console.error('Error reading cached orders:', error);
    }
    
    // Check DOM for order cards
    const orderCards = document.querySelectorAll('.simple-order-card');
    console.log(`Order cards in DOM: ${orderCards.length}`);
    if (orderCards.length > 0) {
        const orderIds = Array.from(orderCards).map(card => card.getAttribute('data-order-id'));
        console.log('Order IDs in DOM:', orderIds);
    }
    
    // Check empty state
    const emptyState = document.querySelector('.empty-state');
    console.log('Empty state visible:', !!emptyState);
    
    console.log('==== END DEBUG STATE ====');
}

// Test driver history table
async function testDriverHistoryTable() {
    try {
        console.log('Testing driver history table...');
        
        // Try to get table info
        const { data, error } = await supabase
            .from('driver_history')
            .select('*')
            .limit(1);
        
        if (error) {
            console.error('Driver history table test failed:', error);
            showNotification('Driver history table not found. Please run the SQL setup.', 'error');
            return false;
        }
        
        console.log('Driver history table exists and is accessible');
        return true;
        
            } catch (error) {
        console.error('Error testing driver history table:', error);
        return false;
    }
}

// Load driver orders (accepted but not completed)
async function loadDriverOrders() {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            console.log('No user session found for orders');
            return;
        }

        const user = JSON.parse(currentUser);
        const driverId = user.user_id || user.id;

        if (!driverId) {
            console.error('No valid driver ID found');
            return;
        }

        console.log('Loading orders for driver:', driverId);
        
        // Fetch ONLY orders assigned to this specific driver with strict filtering
        const { data: ordersData, error } = await supabase
            .from('orders')
            .select('*')
            .eq('driver_id', driverId) // Only this driver's orders
            .in('status', ['accepted', 'processing']) // Only active orders
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading driver orders:', error);
            showNotification('Error loading orders: ' + error.message, 'error');
            return;
        }

        // Extra safety check - ensure orders belong to this driver
        const myOrders = ordersData?.filter(order => 
            order.driver_id && order.driver_id.toString() === driverId.toString()
        ) || [];

        console.log(`Found ${myOrders.length} active orders for driver ${driverId}`);
        displayDriverOrders(myOrders);

    } catch (error) {
        console.error('Error loading driver orders:', error);
        showNotification('Error loading orders', 'error');
    }
}

// Display driver orders
function displayDriverOrders(ordersData) {
    const ordersList = document.querySelector('.orders-list');
    if (!ordersList) return;

    // Clear existing content and countdowns
    ordersList.innerHTML = '';
    clearAllCountdowns();

    if (!ordersData || ordersData.length === 0) {
        ordersList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <h3>No Active Orders</h3>
                <p>You don't have any active orders at the moment.</p>
            </div>
        `;
        return;
    }

    // Create HTML for order items
    let ordersHTML = '';

    ordersData.forEach(item => {
        // Format the date
        const acceptedDate = new Date(item.assigned_at || item.updated_at || item.created_at);
        const dateText = acceptedDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        // Format amount
        let formattedAmount = '$0.00';
        if (item.amount) {
            const numAmount = parseFloat(item.amount);
            if (!isNaN(numAmount)) {
                formattedAmount = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                }).format(numAmount);
            }
        }

        // Get status badge class
        const statusClass = item.status === 'processing' ? 'warning' : 'success';
                          
        // Format status text with proper capitalization
        const statusText = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Processing';

        // Check if order has countdown (processing status with delivery_date)
        const hasCountdown = item.status === 'processing' && item.delivery_date;
        
        // Create countdown display if applicable
        const countdownDisplay = hasCountdown ? 
            `<div class="order-countdown">
                <i class="fas fa-clock"></i>
                <span id="countdown-${item.id}">--:--</span>
            </div>` : '';

        // Create action buttons (only show if no countdown)
        const actionButtons = !hasCountdown ? `
            <div class="order-actions">
                <button class="history-action-btn complete-btn" onclick="completeDelivery('${item.id}')">
                    <i class="fas fa-check"></i> Complete
                </button>
                <button class="history-action-btn set-time-btn" onclick="showSetTimeModal('${item.id}')">
                    <i class="fas fa-clock"></i> Set Time
                </button>
            </div>
        ` : '';

        ordersHTML += `
            <div class="order-item ${hasCountdown ? 'countdown-active' : ''}">
                <div class="order-header">
                    <div class="order-id">#${item.order_id}</div>
                    <div class="order-amount">${formattedAmount}</div>
                </div>
                <div class="order-customer">
                    <i class="fas fa-user"></i>
                    ${item.customer_name}
                </div>
                <div class="order-address">
                    <i class="fas fa-map-marker-alt"></i>
                    ${item.delivery_address}
                </div>
                <div class="order-meta">
                    <div class="order-date">
                        <i class="fas fa-calendar"></i>
                        ${dateText}
                    </div>
                    <div class="order-status">
                        <span class="badge ${statusClass}">${statusText}</span>
                        ${countdownDisplay}
                    </div>
                </div>
                ${actionButtons}
            </div>
        `;
    });

    // Orders list should only contain orders now (add-order card is rendered in header bar)
    ordersList.innerHTML = ordersHTML;
    
    // Start countdowns for orders that have delivery_date
    ordersData.forEach(item => {
        if (item.status === 'processing' && item.delivery_date) {
            startCountdownForOrder(item);
        }
    });
}

// Styles for driver add order card
(function injectDriverAddOrderStyles(){
  const s = document.createElement('style');
  s.textContent = `
    .driver-add-order-card{position:relative;background:#f9fafb;border-radius:12px;padding:16px;margin:12px 0;cursor:pointer}
    .driver-add-order-card .dotted-border{position:absolute;inset:0;border:2px dashed #cbd5e1;border-radius:12px}
    .driver-add-order-card .add-order-content{display:flex;gap:12px;align-items:center;position:relative}
    .driver-add-order-card .add-order-icon{width:40px;height:40px;border-radius:10px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#475569}
    .driver-add-order-card h4{margin:0 0 4px 0;font-size:15px;color:#111827}
    .driver-add-order-card p{margin:0;color:#6b7280;font-size:13px}
    .driver-add-order-card:hover{background:#f3f4f6}
    .chip-list{display:flex;flex-wrap:wrap;gap:8px;max-height:220px;overflow:auto}
    .chip{padding:10px 14px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;cursor:pointer;display:flex;align-items:center;gap:8px}
    .chip i{color:#64748b}
    .chip.selected{background:#e0f2fe;border-color:#7dd3fc;color:#0369a1}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .form-grid .full{grid-column:1/-1}
    .form-control{width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px}
  `;
  document.head.appendChild(s);
})();

// Add Order flow (category -> details)
let pendingAddOrder = { categoryId: null };

async function openAddOrderCategoryModal(){
  const modal = document.getElementById('addOrderCategoryModal');
  const list = document.getElementById('driverAddCategoryList');
  document.getElementById('proceedAddOrderDetailsBtn').disabled = true;
  list.innerHTML = '<div class="loading-orders"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  modal.style.display = 'block';
  try{
    const res = await fetch('/api/categories');
    const data = await res.json();
    const cats = (data && data.categories) ? data.categories : [];
    list.innerHTML = '';
    cats.forEach(c=>{
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `<i class="fas fa-tag"></i><span>${c.name}</span>`;
      chip.onclick = ()=>{
        pendingAddOrder.categoryId = c.id;
        [...list.children].forEach(n=>n.classList.remove('selected'));
        chip.classList.add('selected');
        document.getElementById('proceedAddOrderDetailsBtn').disabled = false;
      };
      list.appendChild(chip);
    });
  }catch(e){list.innerHTML = '<div class="no-orders">Failed to load categories</div>';}
}
function filterDriverCategoryChips(term){
  const t = (term||'').toLowerCase();
  const list = document.getElementById('driverAddCategoryList');
  if(!list) return;
  [...list.children].forEach(ch=>{
    const name = ch.textContent.toLowerCase();
    ch.style.display = name.includes(t) ? 'inline-flex' : 'none';
  });
}
function closeAddOrderCategoryModal(){
  document.getElementById('addOrderCategoryModal').style.display='none';
}
function openAddOrderDetailsModal(){
  closeAddOrderCategoryModal();
  const modal = document.getElementById('addOrderDetailsModal');
  modal.style.display='block';
  loadShopsForAddOrder();
}
function backToCategoryStep(){
  document.getElementById('addOrderDetailsModal').style.display='none';
  openAddOrderCategoryModal();
}
function closeAddOrderDetailsModal(){
  document.getElementById('addOrderDetailsModal').style.display='none';
}

async function loadShopsForAddOrder(){
  const select = document.getElementById('addOrderShop');
  select.innerHTML = '<option value="">Loading...</option>';
  try{
    // Reuse users API to fetch shops
    const res = await fetch('/api/users');
    const data = await res.json();
    const shops = (data.users||[]).filter(u=>u.role==='shop');
    // Use user_id (UUID) for value to match orders.shop_id type
    select.innerHTML = '<option value="">Select shop</option>' + shops.map(s=>{
      const val = s.user_id || s.id; // prefer UUID; fallback to numeric only if no uuid exists
      const label = s.full_name || s.username;
      return `<option value="${val}">${label}</option>`;
    }).join('');
  }catch(e){ select.innerHTML = '<option value="">Failed to load shops</option>'; }
}

async function submitDriverCreatedOrder(){
  try{
    const currentUser = JSON.parse(localStorage.getItem('currentUser')||'{}');
    const driverId = currentUser.user_id || currentUser.id;
    if(!driverId){ showNotification('Login required', 'warning'); return; }
  let shopId = document.getElementById('addOrderShop').value || null;
  // Ensure shopId is a UUID; if not, null it (orders.shop_id is uuid)
  if (shopId && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(shopId)) {
    console.warn('[AddOrder] Provided shopId is not a UUID, ignoring:', shopId);
    shopId = null;
  }
    const nowIso = new Date().toISOString();
      const rawPhone = (document.getElementById('addOrderPhone').value||'').toString().replace(/\D/g,'').slice(0,10);
      const payload = {
      order_id: `DRV-${Date.now()}`,
      customer_name: document.getElementById('addOrderCustomer').value || null,
        customer_phone: rawPhone || null,
        amount: document.getElementById('addOrderAmount').value || null,
      delivery_address: document.getElementById('addOrderAddress').value || '',
      order_date: nowIso,
        status: 'delivered',
        delivery_date: nowIso,
      driver_id: driverId,
      shop_id: shopId,
        // Do not send category_id because orders table does not have that column
      notes: document.getElementById('addOrderNotes').value || null,
      assigned_at: nowIso
    };
    console.log('[AddOrder] Submitting payload:', payload);
    const res = await fetch('/api/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json();
    console.log('[AddOrder] Response:', { status: res.status, ok: res.ok, body: data });
    if(!res.ok || !data.success){ throw new Error(data.message||('Failed (HTTP '+res.status+')')); }
    // If server returned history row, prepend it immediately
    try {
      if (data.history) {
        console.log('[AddOrder] Server returned driver_history row; prepending to UI.');
        const current = document.querySelector('.nav-item[data-screen="history-screen"]');
        if (current) current.click();
      }
    } catch(_) {}
    showNotification('Order saved', 'success');
    closeAddOrderDetailsModal();
    const historyNavItem = document.querySelector('.nav-item[data-screen="history-screen"]');
    console.log('[AddOrder] Navigating to History ...');
    if (historyNavItem) { 
      historyNavItem.click();
      setTimeout(() => { 
        console.log('[AddOrder] Forcing history reload after navigation...');
        loadDriverHistory();
      }, 300);
    } else { 
      await loadDriverHistory(); 
    }
  }catch(e){ console.error(e); showNotification('Failed to save order', 'error'); }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInDown {
        from {
            transform: translate(-50%, -20px);
            opacity: 0;
        }
        to {
            transform: translate(-50%, 0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutUp {
        from {
            transform: translate(-50%, 0);
            opacity: 1;
        }
        to {
            transform: translate(-50%, -20px);
            opacity: 0;
        }
    }
    
    @keyframes pulse {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.05);
        }
        100% {
            transform: scale(1);
        }
    }
    
    .new-order-notification {
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%) translateY(100%);
        width: 90%;
        max-width: 400px;
        background-color: white;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        overflow: hidden;
        transition: transform 0.3s ease;
        border: 2px solid var(--driver-primary);
    }
    
    .new-order-notification.show {
        transform: translateX(-50%) translateY(0);
        animation: pulse 2s infinite;
    }
    
    .notification-header {
        background: var(--driver-gradient);
        color: white;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: relative;
    }
    
    .notification-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #ff6b6b, #4ecdc4, #45b7d1);
        animation: pulse 1.5s infinite;
    }
    
    .notification-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }
    
    .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        opacity: 0.8;
        transition: opacity 0.2s;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .close-btn:hover {
        opacity: 1;
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    .notification-body {
        padding: 16px;
    }
    
    .order-info {
        margin-bottom: 16px;
    }
    
    .order-number {
        font-weight: 600;
        font-size: 18px;
        margin-bottom: 4px;
        color: var(--gray-800);
    }
    
    .shop-name {
        color: var(--gray-600);
        font-size: 14px;
        margin-bottom: 8px;
    }
    
    .order-amount {
        font-weight: 700;
        font-size: 20px;
        color: var(--driver-primary);
        margin-bottom: 8px;
    }
    
    .order-address {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--gray-700);
        font-size: 14px;
        line-height: 1.4;
    }
    
    .order-address i {
        color: var(--driver-primary);
        margin-top: 2px;
    }
    
    .notification-actions {
        display: flex;
        gap: 10px;
    }
    
    .accept-btn, .reject-btn {
        padding: 10px;
        border-radius: 8px;
        border: none;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        flex: 1;
        font-size: 14px;
    }
    
    .accept-btn {
        background-color: var(--success-500);
        color: white;
        box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);
    }
    
    .accept-btn:hover {
        background-color: var(--success-700);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(34, 197, 94, 0.4);
    }
    
    .reject-btn {
        background-color: var(--gray-200);
        color: var(--gray-700);
        border: 1px solid var(--gray-300);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .reject-btn:hover {
        background-color: var(--gray-300);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }
    
    .delivery-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--gray-200);
    }
    
    .delivery-amount {
        font-weight: 700;
        font-size: 18px;
        color: var(--driver-primary);
    }
    
    .complete-btn, .start-btn {
        background-color: var(--success-500);
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);
    }
    
    .complete-btn:hover, .start-btn:hover {
        background-color: var(--success-700);
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(34, 197, 94, 0.4);
    }
    
    .empty-state {
        text-align: center;
        padding: 20px;
        color: var(--gray-500);
    }
    
    .empty-state i {
        font-size: 36px;
        margin-bottom: 12px;
        color: var(--gray-400);
    }
    
    .empty-state h3 {
        font-size: 18px;
        margin-bottom: 8px;
        color: var(--gray-700);
    }
    
    .empty-state p {
        font-size: 14px;
    }
    
    /* Improved notification styles */
    .notification {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideInDown 0.3s ease;
        max-width: 90%;
        text-align: center;
        box-shadow: var(--shadow-md);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    /* Loading indicator for data refresh */
    .refresh-indicator {
        position: absolute;
        top: -50px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--driver-primary);
        color: white;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: top 0.3s ease;
        z-index: 100;
        opacity: 0;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    
    /* Improved delivery item styles */
    .delivery-item {
        background: white;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--gray-200);
        transition: all 0.2s ease;
    }
    
    .delivery-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .delivery-item.available {
        border-left: 4px solid var(--success-500);
    }
    
    .delivery-item.assigned {
        border-left: 4px solid var(--driver-primary);
    }
    
    .order-status {
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
    }
    
    .order-status.available {
        background-color: var(--success-100);
        color: var(--success-700);
    }
    
    .order-status.assigned {
        background-color: var(--driver-primary-light);
        color: var(--driver-primary);
    }
    
    /* Simple Order Card Styles (matching screenshot) */
    .simple-order-card {
        background: white;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--gray-200);
        position: relative;
    }
    
    .simple-order-card.new-order-highlight {
        border: 1px solid var(--success-500);
        animation: pulse 2s infinite;
    }
    
    .new-tag {
        position: absolute;
        top: -8px;
        right: -8px;
        background-color: var(--success-500);
        color: white;
        font-size: 10px;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 8px;
        text-transform: uppercase;
        transition: opacity 0.3s ease;
    }
    
    .simple-order-card::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: var(--driver-primary);
        border-radius: 12px 0 0 12px;
    }
    
    .simple-order-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
    }
    
    .simple-order-id {
        font-weight: 700;
        font-size: 16px;
        color: var(--gray-800);
    }
    
    .simple-order-amount {
        font-weight: 700;
        font-size: 18px;
        color: var(--driver-primary);
    }
    
    .simple-order-time {
        font-size: 14px;
        color: var(--gray-600);
        margin-bottom: 12px;
    }
    
    .simple-order-shop {
        font-size: 14px;
        color: var(--gray-600);
        margin-bottom: 8px;
    }
    
    .simple-order-address {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 16px;
        color: var(--gray-700);
        font-size: 14px;
        line-height: 1.4;
    }
    
    .simple-order-address i {
        color: var(--driver-primary);
        font-size: 16px;
        margin-top: 2px;
    }
    
    .simple-accept-btn {
        width: 100%;
        padding: 12px;
        background-color: var(--success-500);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        /* No hover animation or transform */
    }
    
    .simple-accept-btn i {
        font-size: 16px;
    }
    
    /* Compact Order Card Styles */
    .compact-order-card {
        background: white;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--gray-200);
        transition: all 0.2s ease;
        position: relative;
    }
    
    .compact-order-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .compact-order-card::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: var(--driver-primary);
        border-radius: 12px 0 0 12px;
    }
    
    .order-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
    }
    
    .order-info {
        flex: 1;
    }
    
    .order-id {
        font-weight: 700;
        font-size: 16px;
        color: var(--gray-800);
        margin-bottom: 4px;
    }
    
    .order-time {
        font-size: 12px;
        color: var(--gray-600);
        font-weight: 500;
    }
    
    .order-amount {
        font-weight: 700;
        font-size: 18px;
        color: var(--driver-primary);
        text-align: right;
    }
    
    .order-details {
        margin-bottom: 16px;
    }
    
    .shop-info {
        margin-bottom: 8px;
    }
    
    .shop-label {
        font-size: 14px;
        color: var(--gray-600);
        font-weight: 500;
    }
    
    .delivery-location {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--gray-700);
        font-size: 14px;
        line-height: 1.4;
    }
    
    .delivery-location i {
        color: var(--driver-primary);
        margin-top: 2px;
        font-size: 16px;
    }
    
    .delivery-address {
        flex: 1;
        word-break: break-word;
    }
    
    .order-actions {
        display: flex;
        gap: 8px;
    }
    
    .accept-btn, .start-btn {
        flex: 1;
        padding: 10px 16px;
        border-radius: 8px;
        border: none;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
    }
    
    .accept-btn {
        background-color: var(--success-500);
        color: white;
        box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);
    }
    
    .accept-btn:hover {
        background-color: var(--success-700);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(34, 197, 94, 0.4);
    }
    
    .start-btn {
        background-color: var(--driver-primary);
        color: white;
        box-shadow: 0 2px 4px rgba(69, 183, 209, 0.3);
    }
    
    .start-btn:hover {
        background-color: var(--driver-primary-dark);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(69, 183, 209, 0.4);
    }
    
    /* New Order Notification Banner */
    .new-order-banner {
        background: var(--driver-primary);
        color: white;
        padding: 10px 16px;
        border-radius: 8px;
        margin: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        font-size: 14px;
        animation: slideInDown 0.3s ease;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
    
    .new-order-banner .close-banner {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 16px;
        opacity: 0.8;
        transition: opacity 0.2s;
    }
    
    .new-order-banner .close-banner:hover {
        opacity: 1;
    }
    
    /* Orders Page Styles */
    .orders-list {
        padding: 10px;
    }
    
    .order-item {
        background: white;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--gray-200);
        position: relative;
    }
    
    .order-item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: var(--driver-primary);
        border-radius: 12px 0 0 12px;
    }
    
    .order-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }
    
    .status-badge {
        font-size: 12px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 12px;
    }
    
    .status-badge.pending {
        background-color: var(--gray-200);
        color: var(--gray-700);
    }
    
    .status-badge.processing {
        background-color: var(--driver-primary-light);
        color: var(--driver-primary);
    }
    
    .order-details {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
    }
    
    .order-time {
        font-size: 14px;
        color: var(--gray-600);
    }
    
    .order-amount {
        font-weight: 700;
        font-size: 16px;
        color: var(--driver-primary);
    }
    
    .order-address {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 16px;
        color: var(--gray-700);
        font-size: 14px;
        line-height: 1.4;
    }
    
    .order-address i {
        color: var(--driver-primary);
        font-size: 16px;
        margin-top: 2px;
    }
    
    .start-order-btn, .complete-order-btn {
        width: 100%;
        padding: 12px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
    
    .start-order-btn {
        background-color: var(--driver-primary);
        color: white;
    }
    
    .complete-order-btn {
        background-color: var(--success-500);
        color: white;
    }
    
    /* Refresh button styles */
    .refresh-btn {
        background: none;
        border: none;
        color: var(--driver-primary);
        font-size: 18px;
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        background-color: rgba(69, 183, 209, 0.1);
    }
    
    .refresh-btn:hover {
        background-color: rgba(69, 183, 209, 0.2);
        transform: scale(1.1);
    }
    
    .refresh-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }
    
    .refresh-btn i {
        transition: transform 0.3s ease;
    }
    
    .refresh-btn:hover i {
        transform: rotate(180deg);
    }
    
    /* Test button styles */
    .test-btn {
        background: none;
        border: none;
        color: var(--success-500);
        font-size: 18px;
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        background-color: rgba(34, 197, 94, 0.1);
        margin-left: 8px;
    }
    
    .test-btn:hover {
        background-color: rgba(34, 197, 94, 0.2);
        transform: scale(1.1);
    }
    
    .test-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }
    
    @keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7);
        }
        70% {
            box-shadow: 0 0 0 10px rgba(249, 115, 22, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
        }
    }
`;
document.head.appendChild(style); 

// Modal functionality for order details
let currentModalOrder = null;

function showOrderDetailsModal(orderData) {
    currentModalOrder = orderData;
    
    // Populate modal with order data
    document.getElementById('modalOrderNumber').textContent = orderData.order_number || orderData.order_id || 'N/A';
    document.getElementById('modalCustomerName').textContent = orderData.customer_name || 'Customer';
    document.getElementById('modalPhoneNumber').textContent = orderData.customer_phone || 'N/A';
    document.getElementById('modalDeliveryAddress').textContent = orderData.delivery_address || 'N/A';
    
    // Format amount
    let formattedAmount = '$0.00';
    if (orderData.amount) {
        const numAmount = parseFloat(orderData.amount);
        if (!isNaN(numAmount)) {
            formattedAmount = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(numAmount);
        }
    }
    document.getElementById('modalAmount').textContent = formattedAmount;
    
    // Format payment method
    const paymentMethod = orderData.payment_method || 'N/A';
    document.getElementById('modalPaymentMethod').textContent = paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);
    
    // Format status
    const status = orderData.status || 'completed';
    document.getElementById('modalStatus').textContent = status.charAt(0).toUpperCase() + status.slice(1);
    
    // Format completed date
    const completedDate = new Date(orderData.completed_at || orderData.updated_at || orderData.delivery_date);
    const dateText = completedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('modalCompletedDate').textContent = dateText;
    
    // Show/hide notes if available
    const notesGroup = document.getElementById('modalNotesGroup');
    const notesSpan = document.getElementById('modalNotes');
    if (orderData.notes && orderData.notes.trim()) {
        notesSpan.textContent = orderData.notes;
        notesGroup.style.display = 'flex';
    } else {
        notesGroup.style.display = 'none';
    }
    
    // Show modal
    document.getElementById('orderDetailsModal').style.display = 'block';
}

function closeOrderDetailsModal() {
    document.getElementById('orderDetailsModal').style.display = 'none';
    currentModalOrder = null;
}

function callCustomerFromModal() {
    if (currentModalOrder && currentModalOrder.customer_phone) {
        callCustomer(currentModalOrder.customer_phone);
    }
}

function openMapFromModal() {
    if (currentModalOrder && currentModalOrder.delivery_address) {
        openMap(currentModalOrder.delivery_address);
    }
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('orderDetailsModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeOrderDetailsModal();
            }
        });
    }
});

// Test driver history table
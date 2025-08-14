// Shop App JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Supabase client
    initSupabase();
    
    // Initialize navigation
    initializeNavigation();
    
    // Update user info
    updateUserInfo();
    
    // Initialize modal
    initializeModal();
    
    // Initialize WebSocket connection
    initWebSocket();
    
    // Load initial orders
    refreshOrders();
});

// Global countdown tracking for shops
const shopOrderCountdowns = {};

// Clear all shop countdowns
function clearAllShopCountdowns() {
    Object.values(shopOrderCountdowns).forEach(intervalId => clearInterval(intervalId));
    for (const key in shopOrderCountdowns) delete shopOrderCountdowns[key];
}

// Start countdown for a shop order
function startShopCountdownForOrder(order) {
    if (!order.delivery_date) return;
    
    const countdownEl = document.getElementById(`shop-countdown-${order.id}`);
    if (!countdownEl) return;

    function updateShopCountdown() {
        const diffMs = new Date(order.delivery_date).getTime() - Date.now();
        if (diffMs <= 0) {
            countdownEl.textContent = '00:00';
            completeShopOrder(order.id);
            clearInterval(shopOrderCountdowns[order.id]);
            delete shopOrderCountdowns[order.id];
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
    
    updateShopCountdown();
    shopOrderCountdowns[order.id] = setInterval(updateShopCountdown, 1000);
}

// Auto-complete shop order when countdown reaches zero
async function completeShopOrder(orderId) {
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
            .eq('shop_id', user.user_id || user.id);
            
        if (error) {
            console.error('Error auto-completing shop order:', error);
            return;
        }
        
        showNotification('Order completed automatically!', 'success');
        
        // Navigate to history screen
        const historyNavItem = document.querySelector('.nav-item[data-screen="history-screen"]');
        if (historyNavItem) {
            historyNavItem.click();
        }
        
        // Refresh orders after a delay
        setTimeout(() => {
            refreshAllOrders();
        }, 1000);
        
    } catch (error) {
        console.error('Error in completeShopOrder:', error);
    }
}

// Supabase client
let supabase;

// Initialize Supabase
function initSupabase() {
    // Get Supabase URL and anon key from environment
    const supabaseUrl = localStorage.getItem('SUPABASE_URL');
    const supabaseAnonKey = localStorage.getItem('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase credentials not found in localStorage');
        return;
    }
    
    // Initialize Supabase client using the global supabase object from CDN
    supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    
    console.log('Supabase initialized');
}

// Update User Info
function updateUserInfo() {
    const currentUser = localStorage.getItem('currentUser');
    
    if (currentUser) {
        const user = JSON.parse(currentUser);
        
        // Update shop name in header
        const userNameElement = document.querySelector('.user-name');
        if (userNameElement) {
            userNameElement.textContent = user.shop_name || user.username;
        }
        
        // Update shop avatar with first letter of name
        const avatarElement = document.querySelector('.avatar');
        if (avatarElement) {
            const firstLetter = (user.shop_name || user.username).charAt(0).toUpperCase();
            avatarElement.innerHTML = `<span>${firstLetter}</span>`;
        }
    }
}

// Initialize Navigation
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Get target screen id
            const targetScreenId = this.getAttribute('data-screen');
            
            // Hide all screens
            const screens = document.querySelectorAll('.screen');
            screens.forEach(screen => {
                screen.classList.remove('active');
            });
            
            // Show target screen
            const targetScreen = document.getElementById(targetScreenId);
            if (targetScreen) {
                targetScreen.classList.add('active');
                
                // Load data for specific screens
                if (targetScreenId === 'orders-screen') {
                    refreshAllOrders();
                }
                if (targetScreenId === 'history-screen') {
                    loadShopHistory();
                    initializeHistoryFilters();
                }
            }
            
            // Update active nav item
            navItems.forEach(navItem => {
                navItem.classList.remove('active');
            });
            this.classList.add('active');
        });
    });
    
    // Set home as active by default
    document.querySelector('[data-screen="home-screen"]').classList.add('active');
    
    // Orders filter removed
}

// Initialize Modal with improved animation and form handling
function initializeModal() {
    const modal = document.getElementById('createOrderModal');
    const editModal = document.getElementById('editOrderModal');
    const deleteModal = document.getElementById('deleteConfirmModal');
    const createOrderBtn = document.getElementById('createOrderBtn');
    const closeModalBtn = document.getElementById('closeModal');
    const closeEditModalBtn = document.getElementById('closeEditModal');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const orderForm = document.getElementById('orderForm');
    const editOrderForm = document.getElementById('editOrderForm');
    const priorityBtns = document.querySelectorAll('.option-btn[data-priority]');
    const paymentBtns = document.querySelectorAll('.option-btn[data-payment]');
    
    // Open modal with slide-up animation
    if (createOrderBtn) {
        createOrderBtn.addEventListener('click', function() {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
            
            // Reset form when opening
            if (orderForm) orderForm.reset();
            
            // Reset active buttons
            if (priorityBtns.length) {
                priorityBtns.forEach(btn => btn.classList.remove('active'));
                priorityBtns[0].classList.add('active'); // Default to Standard
            }
            
            if (paymentBtns.length) {
                paymentBtns.forEach(btn => btn.classList.remove('active'));
                paymentBtns[0].classList.add('active'); // Default to Cash
            }
        });
    }
    
    // Close modal
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', function() {
            closeModal(modal);
        });
    }
    
    // Close edit modal
    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', function() {
            closeModal(editModal);
        });
    }
    
    // Close delete modal
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', function() {
            closeModal(deleteModal);
        });
    }
    
    // Confirm delete
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', function() {
            const orderId = confirmDeleteBtn.getAttribute('data-order-id');
            if (orderId) {
                deleteOrder(orderId);
            }
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModal(modal);
        }
        if (event.target === editModal) {
            closeModal(editModal);
        }
        if (event.target === deleteModal) {
            closeModal(deleteModal);
        }
    });
    
    // Priority buttons (delivery options)
    if (priorityBtns.length > 0) {
        priorityBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const container = this.closest('.button-options');
                if (container) {
                    container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                }
            });
        });
    }
    
    // Payment method buttons
    if (paymentBtns.length > 0) {
        paymentBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const container = this.closest('.button-options');
                if (container) {
                    container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                }
                
                // Show/hide cost field based on payment method
                const paymentMethod = this.getAttribute('data-payment');
                const costGroup = document.getElementById('costGroup');
                const editCostGroup = document.getElementById('editCostGroup');
                
                if (paymentMethod === 'cash') {
                    if (costGroup) costGroup.style.display = 'block';
                    if (editCostGroup) editCostGroup.style.display = 'block';
                } else {
                    if (costGroup) costGroup.style.display = 'none';
                    if (editCostGroup) editCostGroup.style.display = 'none';
                }
            });
        });
    }
    
    // Form submission
    if (orderForm) {
        orderForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Get form data
            const phoneNumber = document.getElementById('phoneNumber').value.trim();
            const deliveryAddress = document.getElementById('deliveryAddress').value.trim();
            const orderCost = document.getElementById('orderCost').value.trim();
            const notes = document.getElementById('notes')?.value.trim() || '';
            
            // Get selected payment method
            const paymentBtn = document.querySelector('.option-btn[data-payment].active');
            const paymentMethod = paymentBtn ? paymentBtn.getAttribute('data-payment') : 'cash';
            
            // Clear previous errors
            document.querySelectorAll('.form-error').forEach(error => error.style.display = 'none');
            document.querySelectorAll('.error-input').forEach(input => input.classList.remove('error-input'));
            
            let hasErrors = false;
            
            // Validate phone number (Greek format: exactly 10 digits, only numbers)
            const phoneRegex = /^[0-9]{10}$/;
            if (!phoneNumber) {
                showFieldError('phoneNumber', 'Phone number is required');
                hasErrors = true;
            } else if (!phoneRegex.test(phoneNumber)) {
                showFieldError('phoneNumber', 'Please enter exactly 10 digits (e.g., 6912345678)');
                hasErrors = true;
            } else if (phoneNumber.length !== 10) {
                showFieldError('phoneNumber', 'Phone number must be exactly 10 digits');
                hasErrors = true;
            }
            
            // Validate delivery address (Greek only, no English characters)
            const greekAddressRegex = /^[Α-Ωα-ωάέήίόύώΆΈΉΊΌΎΏ\s\d\.,\-\(\)]+$/;
            if (!deliveryAddress) {
                showFieldError('deliveryAddress', 'Delivery address is required');
                hasErrors = true;
            } else if (!greekAddressRegex.test(deliveryAddress)) {
                showFieldError('deliveryAddress', 'Please enter address in Greek only (no English characters)');
                hasErrors = true;
            } else if (deliveryAddress.length < 5) {
                showFieldError('deliveryAddress', 'Address must be at least 5 characters long');
                hasErrors = true;
            }
            
            // Validate cost if payment method is cash
            if (paymentMethod === 'cash') {
                if (!orderCost) {
                    showFieldError('orderCost', 'Cost is required for cash payments');
                    hasErrors = true;
                } else if (isNaN(orderCost) || parseFloat(orderCost) <= 0) {
                    showFieldError('orderCost', 'Please enter a valid cost amount');
                    hasErrors = true;
                }
            }
            
            if (hasErrors) {
                return;
            }
            
            // Set a default item for the order
            const items = [{
                name: "Delivery Item",
                qty: 1,
                price: paymentMethod === 'cash' ? parseFloat(orderCost) : 0
            }];
            
            // Generate order ID
            const randomID = Math.floor(1000 + Math.random() * 9000);
            const orderID = `ORD-${new Date().getFullYear()}-${randomID}`;
            
            // Create order object
            const orderData = {
                order_id: orderID,
                customer_phone: phoneNumber,
                delivery_address: deliveryAddress,
                amount: paymentMethod === 'cash' ? parseFloat(orderCost) : 0,
                payment_method: paymentMethod,
                order_items: JSON.stringify(items),
                notes: notes,
                status: 'pending'
            };
            
            // Show loading state
            const submitBtn = orderForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Creating...';
            submitBtn.disabled = true;
            
            try {
                const currentUser = localStorage.getItem('currentUser');
                if (!currentUser) throw new Error('User not logged in');
                
                const user = JSON.parse(currentUser);
                
                // Create order using API endpoint
                const response = await fetch('/api/shop/orders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-ID': user.user_id || user.id
                    },
                    body: JSON.stringify(orderData)
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to create order');
                }
                
                console.log('Order created:', data);
                
                // Show success message
                showNotification('Order created successfully!', 'success');
                
                // Close modal with animation
                closeModal(modal);
                
                // Reset form
                orderForm.reset();
                
                // Refresh orders
                refreshOrders();
                
            } catch (error) {
                console.error('Error creating order:', error);
                showNotification('Failed to create order: ' + error.message, 'error');
            } finally {
                // Reset button
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
    
    // Edit form submission
    if (editOrderForm) {
        editOrderForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const orderId = document.getElementById('editOrderId').value;
            
            // Get form data
            const phoneNumber = document.getElementById('editPhoneNumber').value.trim();
            const deliveryAddress = document.getElementById('editDeliveryAddress').value.trim();
            const orderCost = document.getElementById('editOrderCost').value.trim();
            const notes = document.getElementById('editNotes')?.value.trim() || '';
            
            // Get selected payment method
            const paymentBtn = document.querySelector('#editOrderForm .option-btn[data-payment].active');
            const paymentMethod = paymentBtn ? paymentBtn.getAttribute('data-payment') : 'cash';
            
            // Clear previous errors
            document.querySelectorAll('.form-error').forEach(error => error.style.display = 'none');
            document.querySelectorAll('.error-input').forEach(input => input.classList.remove('error-input'));
            
            let hasErrors = false;
            
            // Validate phone number (Greek format: exactly 10 digits, only numbers)
            const phoneRegex = /^[0-9]{10}$/;
            if (!phoneNumber) {
                showFieldError('editPhoneNumber', 'Phone number is required');
                hasErrors = true;
            } else if (!phoneRegex.test(phoneNumber)) {
                showFieldError('editPhoneNumber', 'Please enter exactly 10 digits (e.g., 6912345678)');
                hasErrors = true;
            } else if (phoneNumber.length !== 10) {
                showFieldError('editPhoneNumber', 'Phone number must be exactly 10 digits');
                hasErrors = true;
            }
            
            // Validate delivery address (Greek only, no English characters)
            const greekAddressRegex = /^[Α-Ωα-ωάέήίόύώΆΈΉΊΌΎΏ\s\d\.,\-\(\)]+$/;
            if (!deliveryAddress) {
                showFieldError('editDeliveryAddress', 'Delivery address is required');
                hasErrors = true;
            } else if (!greekAddressRegex.test(deliveryAddress)) {
                showFieldError('editDeliveryAddress', 'Please enter address in Greek only (no English characters)');
                hasErrors = true;
            } else if (deliveryAddress.length < 5) {
                showFieldError('editDeliveryAddress', 'Address must be at least 5 characters long');
                hasErrors = true;
            }
            
            // Validate cost if payment method is cash
            if (paymentMethod === 'cash') {
                if (!orderCost) {
                    showFieldError('editOrderCost', 'Cost is required for cash payments');
                    hasErrors = true;
                } else if (isNaN(orderCost) || parseFloat(orderCost) <= 0) {
                    showFieldError('editOrderCost', 'Please enter a valid cost amount');
                    hasErrors = true;
                }
            }
            
            if (hasErrors) {
                return;
            }
            
            // Create order object
            const orderData = {
                customer_phone: phoneNumber,
                delivery_address: deliveryAddress,
                amount: paymentMethod === 'cash' ? parseFloat(orderCost) : 0,
                payment_method: paymentMethod,
                notes: notes,
                updated_at: new Date().toISOString()
            };
            
            // Show loading state
            const submitBtn = editOrderForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Updating...';
            submitBtn.disabled = true;
            
            try {
                const currentUser = localStorage.getItem('currentUser');
                if (!currentUser) throw new Error('User not logged in');
                
                const user = JSON.parse(currentUser);
                
                // Update order using API endpoint
                const response = await fetch(`/api/shop/orders/${orderId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-ID': user.user_id || user.id
                    },
                    body: JSON.stringify(orderData)
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to update order');
                }
                
                console.log('Order updated:', data);
                
                // Show success message
                showNotification('Order updated successfully!', 'success');
                
                // Close modal with animation
                closeModal(editModal);
                
                // Refresh orders
                refreshAllOrders();
                
            } catch (error) {
                console.error('Error updating order:', error);
                showNotification('Failed to update order: ' + error.message, 'error');
            } finally {
                // Reset button
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
}

// Close modal function
function closeModal(modal) {
    // Add closing animation
    const modalContent = modal.querySelector('.modal-content') || modal.querySelector('.confirm-modal-content');
    if (modalContent) {
        modalContent.style.animation = 'modalSlideDown 0.3s ease';
        modalContent.addEventListener('animationend', function() {
            modal.classList.remove('show');
            document.body.style.overflow = ''; // Enable scrolling
            modalContent.style.animation = ''; // Reset animation
        }, { once: true });
    } else {
        modal.classList.remove('show');
        document.body.style.overflow = ''; // Enable scrolling
    }
}

// Open Edit Modal
async function openEditModal(orderId) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            showNotification('Please log in to edit orders', 'error');
            return;
        }
        
        const user = JSON.parse(currentUser);
        
        // Fetch order details
        const response = await fetch(`/api/shop/orders/${orderId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': user.user_id || user.id
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch order details');
        }
        
        const order = data.order;
        
        if (!order) {
            showNotification('Order not found', 'error');
            return;
        }
        
        // Check if order is still pending
        if (order.status !== 'pending') {
            showNotification('Only pending orders can be edited', 'warning');
            return;
        }
        
        // Populate form
        document.getElementById('editOrderId').value = order.id;
        document.getElementById('editPhoneNumber').value = order.customer_phone || '';
        document.getElementById('editDeliveryAddress').value = order.delivery_address || '';
        document.getElementById('editOrderCost').value = order.amount || '';
        document.getElementById('editNotes').value = order.notes || '';
        
        // Set payment method
        const paymentBtns = document.querySelectorAll('#editOrderForm .option-btn[data-payment]');
        paymentBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-payment') === (order.payment_method || 'cash')) {
                btn.classList.add('active');
            }
        });
        
        // Show/hide cost field based on payment method
        const paymentMethod = order.payment_method || 'cash';
        const editCostGroup = document.getElementById('editCostGroup');
        if (editCostGroup) {
            editCostGroup.style.display = paymentMethod === 'cash' ? 'block' : 'none';
        }
        
        // Show modal
        const editModal = document.getElementById('editOrderModal');
        if (editModal) {
            editModal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }
        
    } catch (error) {
        console.error('Error opening edit modal:', error);
        showNotification('Failed to load order details: ' + error.message, 'error');
    }
}

// Open Delete Modal
function openDeleteModal(orderId, orderNumber) {
    const deleteModal = document.getElementById('deleteConfirmModal');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const orderIdDisplay = document.getElementById('deleteOrderId');
    
    if (deleteModal && confirmDeleteBtn && orderIdDisplay) {
        // Set order ID
        confirmDeleteBtn.setAttribute('data-order-id', orderId);
        orderIdDisplay.textContent = `#${orderNumber}`;
        
        // Show modal
        deleteModal.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }
}

// Delete Order
async function deleteOrder(orderId) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            showNotification('Please log in to delete orders', 'error');
            return;
        }
        
        const user = JSON.parse(currentUser);
        
        // Show loading state
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.textContent = 'Deleting...';
            confirmDeleteBtn.disabled = true;
        }
        
        // Delete order using API endpoint
        const response = await fetch(`/api/shop/orders/${orderId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': user.user_id || user.id
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to delete order');
        }
        
        console.log('Order deleted:', data);
        
        // Show success message
        showNotification('Order deleted successfully!', 'success');
        
        // Close modal
        const deleteModal = document.getElementById('deleteConfirmModal');
        if (deleteModal) {
            closeModal(deleteModal);
        }
        
        // Remove order from UI
        const orderElement = document.querySelector(`.order-item[data-order-id="${orderId}"]`);
        if (orderElement) {
            orderElement.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                orderElement.remove();
            }, 300);
        }
        
        // Refresh orders after a delay
        setTimeout(() => {
            refreshAllOrders();
        }, 500);
        
    } catch (error) {
        console.error('Error deleting order:', error);
        showNotification('Failed to delete order: ' + error.message, 'error');
        
        // Reset button
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.textContent = 'Delete';
            confirmDeleteBtn.disabled = false;
        }
    }
}

// Initialize WebSocket connection
function initWebSocket() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return;
    
    const user = JSON.parse(currentUser);
    
    // Connect to WebSocket using the correct user ID
    wsClient.connect(user.id, 'shop');
    
    // Handle WebSocket messages
    wsClient.on('message', handleWebSocketMessage);
    
    wsClient.on('open', () => {
        console.log('WebSocket connected');
        showNotification('Connected to real-time updates', 'success');
    });
    
    wsClient.on('close', (event) => {
        console.log('WebSocket disconnected');
        
        // Only show disconnected message if it wasn't a forced logout
        if (event.code !== 1000) {
            showNotification('Connection lost. Attempting to reconnect...', 'warning');
        }
    });
    
    wsClient.on('error', (error) => {
        console.error('WebSocket error:', error);
        showNotification('Connection error', 'error');
    });
    
    wsClient.on('reconnect', (attempt) => {
        console.log(`Reconnecting (attempt ${attempt})...`);
        showNotification(`Reconnecting (attempt ${attempt})...`, 'info');
    });
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    console.log('WebSocket message received:', data);
    
    switch (data.type) {
        case 'IDENTIFIED':
            console.log('Client identified as shop:', data.payload);
            break;
            
        case 'FORCE_LOGOUT':
            handleForceLogout(data.payload.reason);
            break;
            
        case 'ORDER_CREATED':
            handleOrderCreated(data.payload);
            break;
            
        case 'ORDER_UPDATED':
            handleOrderUpdate(data.payload);
            break;
            
        case 'COUNTDOWN_STARTED':
            handleShopCountdownStarted(data.payload);
            break;
            
        case 'COUNTDOWN_UPDATE':
            handleShopCountdownUpdate(data.payload);
            break;
            
        case 'NOTIFICATION':
            handleNotification(data.payload);
            break;
    }
}

// Handle force logout
function handleForceLogout(reason) {
    console.log('Force logout:', reason);
    
    // Show notification
    showNotification(reason, 'warning');
    
    // Clear session
    localStorage.removeItem('currentUser');
    
    // Close WebSocket
    if (window.wsClient) {
        wsClient.close();
    }
    
    // Redirect to login after a short delay
    setTimeout(() => {
        window.location.href = '/LoginPage/index.html';
    }, 2000);
}

// Handle order created
function handleOrderCreated(orderData) {
    console.log('Order created:', orderData);
    showNotification(`Order ${orderData.order_number} has been created successfully`, 'success');
    refreshOrders();
}

// Handle order update
function handleOrderUpdate(orderData) {
    console.log('Order updated:', orderData);
    
    // Show notification
    if (orderData.status === 'accepted') {
        showNotification(`Order ${orderData.order_number || orderData.order_id} has been accepted by a driver`, 'success');
        
        // Remove edit/delete buttons if this order is displayed
        const orderElement = document.querySelector(`.order-item[data-order-id="${orderData.id}"]`);
        if (orderElement) {
            const actionButtons = orderElement.querySelector('.order-actions');
            if (actionButtons) {
                actionButtons.remove();
            }
            
            // Update status
            const statusElement = orderElement.querySelector('.order-status');
            if (statusElement) {
                statusElement.className = 'order-status accepted';
                statusElement.textContent = 'Accepted';
            }
        }
    } else if (orderData.status === 'processing') {
        showNotification(`Order ${orderData.order_number || orderData.order_id} is now processing with countdown`, 'success');
        
        // Add countdown to existing order if it exists
        const orderElement = document.querySelector(`.order-item[data-order-id="${orderData.id}"]`);
        if (orderElement) {
            // Update status to processing
            const statusElement = orderElement.querySelector('.order-status');
            if (statusElement) {
                statusElement.className = 'order-status in-transit';
                statusElement.textContent = 'Processing';
            }
            
            // Add countdown display if not already present
            const statusContainer = orderElement.querySelector('.order-status-container');
            if (statusContainer && !statusContainer.querySelector('.order-countdown')) {
                const countdownDisplay = `
                    <div class="order-countdown">
                        <i class="fas fa-clock"></i>
                        <span id="shop-countdown-${orderData.id}">--:--</span>
                    </div>
                `;
                statusContainer.innerHTML += countdownDisplay;
                
                // Add countdown-active class
                orderElement.classList.add('countdown-active');
            }
            
            // Start the countdown if delivery_date is available
            if (orderData.delivery_date) {
                startShopCountdownForOrder(orderData);
            }
        }
    } else if (orderData.status === 'delivered') {
        showNotification(`Order ${orderData.order_number || orderData.order_id} has been delivered`, 'success');
        moveOrderToHistory(orderData.id);
    } else {
        showNotification(`Order ${orderData.order_number || orderData.order_id} status changed to ${orderData.status}`, 'info');
    }
    
    // Refresh orders
    refreshOrders();
    
    // Also refresh all orders if we're on the orders page
    const ordersScreen = document.getElementById('orders-screen');
    if (ordersScreen && ordersScreen.classList.contains('active')) {
        refreshAllOrders();
    }
}

// Handle notification
function handleNotification(notification) {
    console.log('Notification received:', notification);
    
    // Show notification
    showNotification(notification.message, notification.type || 'info');
}

// Handle shop countdown started message
function handleShopCountdownStarted(orderData) {
    console.log('Shop countdown started for order:', orderData);
    
    // Check if we're on the orders screen
    const ordersScreen = document.getElementById('orders-screen');
    if (ordersScreen && ordersScreen.classList.contains('active')) {
        // Add countdown to existing order if it exists
        const orderElement = document.querySelector(`.order-item[data-order-id="${orderData.id}"]`);
        if (orderElement) {
            // Update status to accepted
            const statusElement = orderElement.querySelector('.order-status');
            if (statusElement) {
                statusElement.className = 'order-status accepted';
                statusElement.textContent = 'Accepted';
            }
            
            // Add countdown display
            const statusContainer = orderElement.querySelector('.order-status-container');
            if (statusContainer) {
                const countdownDisplay = `
                    <div class="order-countdown">
                        <i class="fas fa-clock"></i>
                        <span id="shop-countdown-${orderData.id}">--:--</span>
                    </div>
                `;
                statusContainer.innerHTML += countdownDisplay;
                
                // Add countdown-active class
                orderElement.classList.add('countdown-active');
            }
            
            // Start the countdown
            if (orderData.delivery_date) {
                startShopCountdownForOrder(orderData);
            }
        }
    }
    
    // Show notification
    showNotification(`Countdown started for order #${orderData.order_id}`, 'success');
}

// Handle shop countdown update message
function handleShopCountdownUpdate(orderData) {
    console.log('Shop countdown update for order:', orderData);
    
    const countdownEl = document.getElementById(`shop-countdown-${orderData.id}`);
    if (countdownEl) {
        const diffMs = new Date(orderData.delivery_date).getTime() - Date.now();
        if (diffMs <= 0) {
            countdownEl.textContent = '00:00';
            completeShopOrder(orderData.id);
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

// Refresh Orders
async function refreshOrders() {
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
        refreshBtn.disabled = true;
    }
    
    try {
        // Fetch orders from API
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return;
        
        const user = JSON.parse(currentUser);
        
        const response = await fetch('/api/shop/orders', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': user.user_id || user.id
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch orders');
        }
        
        console.log('Orders fetched:', data.orders);
        
        // Update stats
        const orders = data.orders || [];
        const activeOrders = orders.filter(order => order.status === 'pending' || order.status === 'accepted');
        const completedOrders = orders.filter(order => order.status === 'delivered');
        
        document.querySelector('.active-orders .stat-number').textContent = activeOrders.length;
        document.querySelector('.completed-orders .stat-number').textContent = completedOrders.length;
        
        // Update recent orders list
        updateRecentOrders(orders.slice(0, 5)); // Show last 5 orders
        
    } catch (error) {
        console.error('Error refreshing orders:', error);
        showNotification('Failed to refresh orders: ' + error.message, 'error');
    } finally {
        if (refreshBtn) {
            setTimeout(() => {
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                refreshBtn.disabled = false;
            }, 1000);
        }
    }
}

// Update recent orders display
function updateRecentOrders(orders) {
    const ordersList = document.getElementById('recentOrdersList');
    if (!ordersList) return;
    
    if (!orders || orders.length === 0) {
        ordersList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-bag"></i>
                <h3>No Orders Yet</h3>
                <p>Create your first order to get started.</p>
            </div>
        `;
        return;
    }
    
    let ordersHTML = '';
    
    orders.forEach(order => {
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
        
        // Get status class and text
        let statusClass = 'pending';
        let statusText = 'Pending';
        
        switch (order.status) {
            case 'pending':
                statusClass = 'pending';
                statusText = 'Pending';
                break;
            case 'accepted':
                statusClass = 'accepted';
                statusText = 'Accepted';
                break;
            case 'processing':
                statusClass = 'in-transit';
                statusText = 'Processing';
                break;
            case 'delivered':
                statusClass = 'delivered';
                statusText = 'Delivered';
                break;
            case 'cancelled':
                statusClass = 'cancelled';
                statusText = 'Cancelled';
                break;
            default:
                statusClass = 'pending';
                statusText = 'Pending';
        }
        
        // Format date
        const orderDate = new Date(order.created_at);
        const dateText = orderDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        ordersHTML += `
            <div class="order-item" data-order-id="${order.id}">
                <div class="order-header">
                    <div class="order-id">#${order.order_id}</div>
                    <div class="order-amount">${formattedAmount}</div>
                </div>
                <div class="order-customer">
                    <i class="fas fa-user"></i>
                    ${order.customer_name}
                </div>
                <div class="order-address">
                    <i class="fas fa-map-marker-alt"></i>
                    ${order.delivery_address || 'No address provided'}
                </div>
                <div class="order-meta">
                    <div class="order-date">
                        <i class="fas fa-calendar"></i>
                        ${dateText}
                    </div>
                    <div class="order-status-container">
                        <span class="order-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    ordersList.innerHTML = ordersHTML;
}

// Show field error
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(fieldId.replace('edit', 'edit') + 'Error') || 
                        document.getElementById(fieldId + 'Error');
    
    if (field && errorElement) {
        field.classList.add('error-input');
        errorElement.style.display = 'flex';
        errorElement.querySelector('span').textContent = message;
    }
}

// Show Notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Add icon based on type
    let icon;
    switch (type) {
        case 'success':
            icon = 'fa-check-circle';
            break;
        case 'error':
            icon = 'fa-exclamation-circle';
            break;
        case 'warning':
            icon = 'fa-exclamation-triangle';
            break;
        case 'info':
        default:
            icon = 'fa-info-circle';
            break;
    }
    
    notification.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Remove after delay
    setTimeout(() => {
        notification.style.transform = 'translateX(120%)';
        
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
} 

// Add the closing animation
const style = document.createElement('style');
style.textContent = `
@keyframes modalSlideDown {
    from {
        transform: translateY(0);
    }
    to {
        transform: translateY(100%);
    }
}
`;
document.head.appendChild(style); 

// Refresh All Orders (for Orders page)
async function refreshAllOrders() {
    const refreshBtn = document.querySelector('#orders-screen .refresh-btn');
    if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
        refreshBtn.disabled = true;
    }
    
    try {
        // Fetch orders from API
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return;
        
        const user = JSON.parse(currentUser);
        
        const response = await fetch('/api/shop/orders', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': user.user_id || user.id
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch orders');
        }
        
        console.log('All orders fetched:', data.orders);
        
        // Store orders globally for filtering
        window.allOrders = (data.orders || []).filter(order => order.status === 'pending' || order.status === 'accepted' || order.status === 'processing');
        
        // Display all orders
        displayAllOrders(window.allOrders);
        
    } catch (error) {
        console.error('Error refreshing all orders:', error);
        showNotification('Failed to refresh orders: ' + error.message, 'error');
    } finally {
        if (refreshBtn) {
            setTimeout(() => {
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                refreshBtn.disabled = false;
            }, 1000);
        }
    }
}

// ---- Countdown tracking ----
const orderCountdowns = {};

function clearAllCountdowns() {
    Object.values(orderCountdowns).forEach(intervalId => clearInterval(intervalId));
    for (const key in orderCountdowns) delete orderCountdowns[key];
}

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
    }
    updateCountdown();
    orderCountdowns[order.id] = setInterval(updateCountdown, 1000);
}

// ---- Real-time order transition ----
function moveOrderToHistory(orderId) {
    // Remove from active orders list
    const activeOrderEl = document.querySelector(`#allOrdersList .order-item[data-order-id="${orderId}"]`);
    if (activeOrderEl) {
        activeOrderEl.style.animation = 'slideOut 0.5s ease';
        setTimeout(() => {
            activeOrderEl.remove();
            // Refresh active orders count
            const activeOrders = document.querySelectorAll('#allOrdersList .order-item').length;
            updateActiveOrdersCount(activeOrders);
        }, 500);
    }
    
    // Add to history list if history screen is active
    const historyScreen = document.getElementById('history-screen');
    if (historyScreen && historyScreen.classList.contains('active')) {
        // Refresh history to show the new completed order
        setTimeout(() => {
            loadShopHistory();
        }, 600);
    }
}

function updateActiveOrdersCount(count) {
    const activeOrdersEl = document.querySelector('.active-orders .stat-number');
    if (activeOrdersEl) {
        activeOrdersEl.textContent = count;
    }
}

// ---- Update completeOrder to use real-time transition ----
async function completeOrder(orderId) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return;
        const user = JSON.parse(currentUser);
        const { error } = await supabase
            .from('orders')
            .update({ status: 'delivered', updated_at: new Date().toISOString(), delivery_date: new Date().toISOString() })
            .eq('id', orderId)
            .eq('shop_id', user.user_id || user.id);
        if (error) {
            console.error('Error auto-completing order:', error);
            return;
        }
        showNotification('Order completed!', 'success');
        moveOrderToHistory(orderId);
        // Don't refresh all orders - let the real-time transition handle it
    } catch (err) {
        console.error('Auto-complete error', err);
    }
}

// ---- Shop history loading ----
async function loadShopHistory() {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return;
        const user = JSON.parse(currentUser);
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('shop_id', user.user_id || user.id)
            .eq('status','delivered')
            .order('updated_at',{ascending:false});
        if (error) { console.error('History load error', error); return; }
        // keep a copy for filtering
        window.shopHistoryOrders = data || [];
        // ensure driver directory so we can show proper names
        await ensureDriversDirectory();
        populateHistoryDrivers(window.shopHistoryOrders);
        applyHistoryFilters();
    } catch(err){console.error(err);}
}

function displayShopHistory(orders) {
    const list = document.getElementById('historyOrdersList');
    if (!list) return;
    if (!orders || orders.length===0){
        list.innerHTML = `<div class="empty-state"><i class="fas fa-check"></i><h3>No Completed Orders</h3></div>`;
        return;
    }
    let html='';
    orders.forEach(o=>{
        const amount = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(o.amount||0);
        const deliveredDate = new Date(o.delivery_date||o.updated_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
        const driverId = o.driver_id || o.assigned_driver_id || o.assigned_driver || o.driver_uuid || null;
        const driverName = resolveDriverName(driverId, o);
        const driverLine = driverName ? `<div class=\"order-customer\"><i class=\"fas fa-id-card\"></i> ${driverName}</div>` : '';
        html += `<div class=\"order-item\"><div class=\"order-header\"><div class=\"order-id\">#${o.order_id}</div><div class=\"order-amount\">${amount}</div></div>${driverLine}<div class=\"order-address\"><i class=\"fas fa-map-marker-alt\"></i> ${o.delivery_address}</div><div class=\"order-meta\"><div class=\"order-date\"><i class=\"fas fa-calendar\"></i> ${deliveredDate}</div><div class=\"order-status-container\"><span class=\"order-status delivered\">Delivered</span></div></div></div>`;
    });
    list.innerHTML = html;
}

// ---- History Filters ----
function initializeHistoryFilters() {
    const dateInput = document.getElementById('historyDateFilter');
    const driverChip = document.getElementById('driverChip');
    const driverSelect = document.getElementById('historyDriverSelect');
    const clearBtn = document.getElementById('clearHistoryFilters');
    const clearDateChip = document.getElementById('clearDateChip');
    const clearDriverChip = document.getElementById('clearDriverChip');
    const filtersContainer = document.getElementById('historyFilters');

    // clearBtn may not exist anymore; only require core elements
    if (!dateInput || !driverChip) return;

    // Bind events once
    if (!dateInput._bound) {
        dateInput.addEventListener('change', () => {
            // remove quick chip highlights on manual change
            document.querySelectorAll('.quick-chips .chip').forEach(c => c.classList.remove('active'));
            applyHistoryFilters();
        });
        dateInput._bound = true;
    }
    // Driver select logic
    if (driverSelect && !driverSelect._bound) {
        driverSelect._bound = true;
        driverSelect.addEventListener('change', () => {
            setSelectedDriver(driverSelect.value);
            applyHistoryFilters();
            renderActiveBadges();
        });
    }

    // Quick dates popover toggle
    const toggleQuickDates = document.getElementById('toggleQuickDates');
    const quickDates = document.getElementById('quickDates');
    if (toggleQuickDates && quickDates && !toggleQuickDates._bound) {
        toggleQuickDates._bound = true;
        toggleQuickDates.addEventListener('click', (e) => {
            e.stopPropagation();
            quickDates.classList.toggle('show');
        });
        document.addEventListener('click', () => quickDates.classList.remove('show'));
    }
    if (clearBtn && !clearBtn._bound) {
        clearBtn.addEventListener('click', () => {
            dateInput.value = '';
            setSelectedDriver('');
            if (driverSelect) driverSelect.value = '';
            document.querySelectorAll('.quick-chips .chip').forEach(c => c.classList.remove('active'));
            applyHistoryFilters();
            renderActiveBadges();
        });
        clearBtn._bound = true;
    }

    // Clear chip buttons
    if (clearDateChip && !clearDateChip._bound) {
        clearDateChip.addEventListener('click', () => {
            dateInput.value = '';
            document.querySelectorAll('.quick-chips .chip').forEach(c => c.classList.remove('active'));
            applyHistoryFilters();
            renderActiveBadges();
        });
        clearDateChip._bound = true;
    }
    if (clearDriverChip && !clearDriverChip._bound) {
        clearDriverChip.addEventListener('click', () => {
            setSelectedDriver('');
            if (driverSelect) driverSelect.value = '';
            applyHistoryFilters();
            renderActiveBadges();
        });
        clearDriverChip._bound = true;
    }

    // Quick date chips - event delegation for robustness
    if (filtersContainer && !filtersContainer._chipsBound) {
        filtersContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.quick-chips .chip');
            if (!chip) return;
            const action = chip.getAttribute('data-action');
            if (action === 'clear') {
                dateInput.value = '';
                setSelectedDriver('');
                if (driverSelect) driverSelect.value = '';
                // remove active only from segmented buttons
                const segs = filtersContainer.querySelectorAll('.chip-group .chip.seg');
                segs.forEach(s => s.classList.remove('active'));
                applyHistoryFilters();
                renderActiveBadges();
                return;
            }
            const type = chip.getAttribute('data-date');
            if (!type) return;
            // Toggle active within group
            const segs = filtersContainer.querySelectorAll('.chip-group .chip.seg');
            segs.forEach(s => s.classList.remove('active'));
            chip.classList.add('active');
            if (type === 'all') {
                dateInput.value = '';
            } else {
                const d = new Date();
                if (type === 'yesterday') d.setDate(d.getDate() - 1);
                dateInput.value = d.toISOString().slice(0,10);
            }
            applyHistoryFilters();
            renderActiveBadges();
        });
        filtersContainer._chipsBound = true;
    }

    // Profile edit mode UI-only toggle
    const editToggle = document.getElementById('profileEditToggle');
    if (editToggle && !editToggle._bound) {
        editToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.seg-option');
            if (!btn) return;
            editToggle.querySelectorAll('.seg-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.getAttribute('data-mode');
            const nameDisplay = document.querySelector('.shop-name-display');
            const nameInputWrap = document.querySelector('.shop-name-input');
            if (mode === 'edit') {
                if (nameDisplay) nameDisplay.style.display = 'none';
                if (nameInputWrap) nameInputWrap.style.display = 'inline-flex';
            } else {
                if (nameDisplay) nameDisplay.style.display = '';
                if (nameInputWrap) nameInputWrap.style.display = 'none';
            }
        });
        editToggle._bound = true;
    }
}

function populateHistoryDrivers(orders) {
    const uniqueDrivers = new Map();
    orders.forEach(o => {
        const id = o.driver_id || o.assigned_driver_id || o.assigned_driver || o.driver_uuid || null;
        const name = resolveDriverName(id, o);
        if (id && name && !uniqueDrivers.has(id)) {
            uniqueDrivers.set(id, name);
        }
    });
    window.driverOptions = Array.from(uniqueDrivers.entries()).map(([id, name]) => ({ id: String(id), name }));
    populateDriverSelect();
    renderActiveBadges();
}

function applyHistoryFilters() {
    const dateInput = document.getElementById('historyDateFilter');
    const driverId = getSelectedDriver();
    const all = window.shopHistoryOrders || [];

    const selectedDate = (dateInput && dateInput.value) ? new Date(dateInput.value) : null;

    const filtered = all.filter(o => {
        // Driver filter
        if (driverId) {
            const oid = o.driver_id || o.assigned_driver_id || o.assigned_driver || o.driver_uuid || '';
            if (String(oid) !== String(driverId)) return false;
        }
        // Date filter: match same calendar day of delivery_date or updated_at
        if (selectedDate) {
            const base = new Date(o.delivery_date || o.updated_at || o.created_at);
            const sameDay = base.getFullYear() === selectedDate.getFullYear() &&
                           base.getMonth() === selectedDate.getMonth() &&
                           base.getDate() === selectedDate.getDate();
            if (!sameDay) return false;
        }
        return true;
    });

    displayShopHistory(filtered);
}

// Combobox helpers
function populateDriverSelect() {
    const select = document.getElementById('historyDriverSelect');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">All drivers</option>' +
        (window.driverOptions || []).map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    if (current) select.value = current;
}

function setSelectedDriver(id) {
    window.selectedDriverId = id || '';
}
function getSelectedDriver() {
    return window.selectedDriverId || '';
}

function renderActiveBadges() {
    const container = document.getElementById('activeFilterBadges');
    if (!container) return;
    const dateInput = document.getElementById('historyDateFilter');
    const driverId = getSelectedDriver();
    const driverName = driverId ? (window.driverOptions || []).find(o=>o.id===driverId)?.name : '';
    const badges = [];
    if (dateInput && dateInput.value) {
        const d = new Date(dateInput.value);
        badges.push(`<span class="active-badge"><i class="fas fa-calendar"></i>${d.toLocaleDateString()} <button class="remove" data-type="date">×</button></span>`);
    }
    if (driverId && driverName) {
        badges.push(`<span class="active-badge"><i class="fas fa-user"></i>${driverName} <button class="remove" data-type="driver">×</button></span>`);
    }
    container.innerHTML = badges.join('');
    container.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-type');
            if (type === 'date') {
                document.getElementById('historyDateFilter').value = '';
                document.querySelectorAll('.quick-chips .chip').forEach(c => c.classList.remove('active'));
            } else if (type === 'driver') {
                setSelectedDriver('');
                const sel = document.getElementById('historyDriverSelect');
                if (sel) sel.value = '';
            }
            applyHistoryFilters();
            renderActiveBadges();
        });
    });
}

// ---- Driver directory helpers ----
async function ensureDriversDirectory() {
    if (window.driverDirectory && window.driverDirectory.size) return;
    try {
        const res = await fetch('/api/drivers');
        const data = await res.json();
        const map = new Map();
        (data.drivers || []).forEach(d => {
            const id = d.id || d.user_id;
            const name = d.name || d.full_name || d.username || (id ? `Driver ${String(id).slice(0,6)}` : null);
            if (id && name) map.set(String(id), name);
        });
        window.driverDirectory = map;
    } catch (e) {
        console.warn('Drivers directory fetch failed');
        window.driverDirectory = new Map();
    }
}

function resolveDriverName(driverId, order) {
    if (!driverId) return order?.driver_name || order?.driver_username || null;
    const map = window.driverDirectory;
    const fromMap = map ? map.get(String(driverId)) : null;
    return fromMap || order?.driver_name || order?.driver_username || null;
}

// ---- Active orders display with countdown ----
function displayAllOrders(orders) {
    const ordersList = document.getElementById('allOrdersList');
    if (!ordersList) return;
    clearAllShopCountdowns();
    if (!orders || orders.length === 0) {
        ordersList.innerHTML = `<div class="empty-state"><i class="fas fa-shopping-bag"></i><h3>No Active Orders</h3></div>`;
        return;
    }
    let html='';
    orders.forEach(order=>{
        const amount = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(order.amount||0);
        const statusClass = order.status==='accepted'?'accepted':'pending';
        const statusText = order.status.charAt(0).toUpperCase()+order.status.slice(1);
        const orderDate = new Date(order.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
        
        // Check if order has countdown (accepted/processing status with delivery_date)
        const hasCountdown = (order.status === 'accepted' || order.status === 'processing') && order.delivery_date;
        
        // Create countdown display if applicable
        const countdownDisplay = hasCountdown ? 
            `<div class="order-countdown">
                <i class="fas fa-clock"></i>
                <span id="shop-countdown-${order.id}">--:--</span>
            </div>` : '';
        
        html += `<div class="order-item ${hasCountdown ? 'countdown-active' : ''}" data-order-id="${order.id}"><div class="order-header"><div class="order-id">#${order.order_id}</div><div class="order-amount">${amount}</div></div><div class="order-customer"><i class="fas fa-user"></i> ${order.customer_name}</div><div class="order-address"><i class="fas fa-map-marker-alt"></i> ${order.delivery_address||'No address provided'}</div><div class="order-meta"><div class="order-date"><i class="fas fa-calendar"></i> ${orderDate}</div><div class="order-status-container"><span class="order-status ${statusClass}">${statusText}</span>${countdownDisplay}</div></div></div>`;
    });
    ordersList.innerHTML = html;
    orders.forEach(order=>{
        if ((order.status === 'accepted' || order.status === 'processing') && order.delivery_date) {
            startShopCountdownForOrder(order);
        }
    });
}

// ---- augment navigation ---- 
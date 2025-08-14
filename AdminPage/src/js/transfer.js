// Transfer Page JavaScript
let selectedDrivers = {
    1: null, // Source driver
    2: null  // Target driver
};
let currentSelectionId = null;
let allDrivers = [];

// Test server connection
async function testServerConnection() {
    try {
        const response = await fetch('/api/health');
        if (response.ok) {
            console.log('✅ Server is responding');
        } else {
            console.error('❌ Server health check failed');
        }
    } catch (error) {
        console.error('❌ Server connection test failed:', error);
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    testServerConnection();
    loadDrivers();
    initializeDateSelectors();
    loadHeaderStats();
    initializeDragAndDrop();
});

// Load drivers from the database
async function loadDrivers() {
    try {
        const response = await fetch('/api/drivers', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch drivers');
        }

        const data = await response.json();
        allDrivers = data.drivers || [];
        
        console.log('Drivers loaded:', allDrivers);
    } catch (error) {
        console.error('Error loading drivers:', error);
        showNotification('Failed to load drivers from database', 'error');
    }
}

// Load header statistics
async function loadHeaderStats() {
    try {
        const response = await fetch('/api/dashboard-stats', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch dashboard stats');
        }

        const data = await response.json();
        
        // Update header stats
        document.getElementById('totalDrivers').textContent = data.totalDrivers || 0;
        document.getElementById('totalOrders').textContent = data.totalOrders || 0;
        document.getElementById('totalTransfers').textContent = data.totalTransfers || 0;
        
    } catch (error) {
        console.error('Error loading header stats:', error);
        showNotification('Failed to load dashboard statistics', 'error');
    }
}

// Open driver selector modal
function openDriverSelector(driverId) {
    currentSelectionId = driverId;
    const modal = document.getElementById('driverModal');
    const driverList = document.getElementById('driverList');
    
    // Populate driver list
    driverList.innerHTML = '';
    allDrivers.forEach(driver => {
        const driverItem = document.createElement('div');
        driverItem.className = 'driver-item';
        driverItem.onclick = () => selectDriver(driver);
        
        // Highlight already selected drivers
        if ((selectedDrivers[1] && selectedDrivers[1].id === driver.id) || 
            (selectedDrivers[2] && selectedDrivers[2].id === driver.id)) {
            driverItem.classList.add('selected');
        }
        
        driverItem.innerHTML = `
            <div class="driver-item-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="driver-item-info">
                <h4>${driver.name || driver.full_name || driver.username || 'Unknown Driver'}</h4>
                <p>${driver.phone || 'No phone'}</p>
            </div>
            <div class="driver-item-status">
                <span class="status-badge active">Active</span>
            </div>
        `;
        
        driverList.appendChild(driverItem);
    });
    
    modal.style.display = 'flex';
}

// Close driver selector modal
function closeDriverSelector() {
    const modal = document.getElementById('driverModal');
    modal.style.display = 'none';
    currentSelectionId = null;
}

// Select a driver
function selectDriver(driver) {
    console.log('Selecting driver:', driver);
    
    if (!currentSelectionId) {
        console.error('No currentSelectionId set');
        return;
    }
    // Preserve the slot ID before closing modal resets it
    const slotId = currentSelectionId;
    
    // Check if driver is already selected in the other slot
    const otherSlot = slotId === 1 ? 2 : 1;
    if (selectedDrivers[otherSlot] && selectedDrivers[otherSlot].id === driver.id) {
        showNotification('This driver is already selected in the other slot', 'warning');
        return;
    }
    
    // Normalize to ensure we always keep UUID if available
    const normalized = { ...driver };
    if (driver.user_id && !driver.id) normalized.id = driver.user_id;
    selectedDrivers[slotId] = normalized;
    console.log('Updated selectedDrivers:', selectedDrivers);
    
    // Update the driver card
    const driverCard = document.getElementById(`driverCard${slotId}`);
    const driverDetailsCard = document.getElementById(`driverDetailsCard${slotId}`);
    const selectedDriverName = document.getElementById(`selectedDriverName${slotId}`);
    const selectedDriverRole = document.getElementById(`selectedDriverRole${slotId}`);
    
    // Hide the selection card and show the details card
    driverCard.style.display = 'none';
    driverDetailsCard.style.display = 'block';
    
    // Update driver information
    selectedDriverName.textContent = normalized.name || normalized.full_name || normalized.username || 'Unknown Driver';
    selectedDriverRole.textContent = 'Driver';
    
    // Update driver stats
    updateDriverStats(slotId, normalized);
    
    // Set default date to today
    const dateSelector = document.getElementById(`dateSelector${slotId}`);
    if (dateSelector) {
        const today = new Date().toISOString().split('T')[0];
        dateSelector.value = today;
        
        // Load orders for the selected date
        loadDriverOrders(slotId);
    }
    
    // Close the modal after initiating load
    closeDriverSelector();
    
    showNotification(`Driver ${normalized.name || normalized.full_name || normalized.username || 'Unknown Driver'} selected`, 'success');
}

// Filter drivers in the modal
function filterDrivers() {
    const searchTerm = document.getElementById('driverSearch').value.toLowerCase();
    const driverItems = document.querySelectorAll('.driver-item');
    
    driverItems.forEach(item => {
        const driverName = item.querySelector('h4').textContent.toLowerCase();
        const driverPhone = item.querySelector('p').textContent.toLowerCase();
        
        if (driverName.includes(searchTerm) || driverPhone.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Show notification
function showNotification(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Show the toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove the toast after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Create toast container if it doesn't exist
function createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// Get notification icon based on type
function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

// Update driver statistics
async function updateDriverStats(driverId, driver) {
    try {
        const response = await fetch(`/api/driver-stats?driverId=${encodeURIComponent(driver.id)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch driver stats');
        }

        const data = await response.json();
        
        // Update driver stats
        document.getElementById(`driverTotalOrders${driverId}`).textContent = data.totalOrders || 0;
        document.getElementById(`driverCompletedOrders${driverId}`).textContent = data.completedOrders || 0;
        
    } catch (error) {
        console.error('Error loading driver stats:', error);
        // Set default values
        document.getElementById(`driverTotalOrders${driverId}`).textContent = '0';
        document.getElementById(`driverCompletedOrders${driverId}`).textContent = '0';
    }
}

// Initialize date selectors
function initializeDateSelectors() {
    const today = new Date().toISOString().split('T')[0];
    
    // Set default date for both date selectors
    const dateSelector1 = document.getElementById('dateSelector1');
    const dateSelector2 = document.getElementById('dateSelector2');
    
    if (dateSelector1) dateSelector1.value = today;
    if (dateSelector2) dateSelector2.value = today;
}

// Format date for input field
function formatDateForInput(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Load driver orders for selected date
async function loadDriverOrders(driverId) {
    console.log('loadDriverOrders called with driverId:', driverId);
    console.log('Selected Drivers Object:', JSON.stringify(selectedDrivers));
    
    // Force driverId to be a number if it's a string
    driverId = parseInt(driverId, 10);
    console.log('Parsed driverId:', driverId);
    
    if (!selectedDrivers[driverId]) {
        console.log('No driver selected for ID:', driverId);
        console.log('Available drivers:', Object.keys(selectedDrivers));
        return;
    }
    
    const dateSelector = document.getElementById(`dateSelector${driverId}`);
    const ordersList = document.getElementById(`driverOrdersList${driverId}`);
    
    if (!dateSelector || !ordersList) {
        console.error('Missing elements:', { dateSelector: !!dateSelector, ordersList: !!ordersList });
        return;
    }
    
    const selectedDate = dateSelector.value;
    const driver = selectedDrivers[driverId];
    
    console.log(`Starting to load orders for driver:`, { driverId, driver, selectedDate });
    
    // Show loading state
    ordersList.innerHTML = `
        <div class="loading-orders">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading orders...</span>
        </div>
    `;
    
    try {
        console.log(`Fetching orders for driver ID: ${driver.id}, date: ${selectedDate}`);
        
        // Add timeout to prevent infinite loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.log('Request timed out');
            controller.abort();
        }, 15000); // 15 second timeout
        
        // Fetch orders from database for specific driver and date
        // Use UUID when present (server expects UUID driver_id)
        const driverIdentifier = driver.user_id || driver.id;
        const url = `/api/driver-orders?driverId=${encodeURIComponent(driverIdentifier)}&date=${encodeURIComponent(selectedDate)}`;
        console.log('Making request to:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('Response received:', { status: response.status, ok: response.ok, statusText: response.statusText });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Response not ok:', { status: response.status, statusText: response.statusText, errorText });
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('API response data:', data);
        
        const orders = data.orders || [];
        console.log('Orders array:', orders);
        
        // Check if no orders exist for this date and driver
        if (orders.length === 0) {
            console.log('No orders found for this date and driver');
            ordersList.innerHTML = `
                <div class="no-orders">
                    <div class="no-orders-icon">
                        <i class="fas fa-inbox"></i>
                    </div>
                    <h4>No Available Orders</h4>
                    <p>No orders found for ${driver.name || driver.full_name || driver.username || 'Unknown Driver'} on ${formatDisplayDate(selectedDate)}</p>
                </div>
            `;
            return;
        }
        
        // Render orders
        ordersList.innerHTML = '';
        orders.forEach(order => {
            const orderItem = document.createElement('div');
            orderItem.className = 'order-item';
            orderItem.dataset.orderId = order.id;
            orderItem.dataset.sourceSlot = String(driverId);
            orderItem.draggable = true;
            
            orderItem.innerHTML = `
                <div class="order-header">
                    <div class="order-id">#${order.order_id}</div>
                    <div class="order-amount">$${parseFloat(order.amount).toFixed(2)}</div>
                </div>
                <div class="order-details">
                    <div class="order-customer">
                        <i class="fas fa-user"></i>
                        <span>${order.customer_name || 'Unknown Customer'}</span>
                    </div>
                    <div class="order-address">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${order.delivery_address || 'No address'}</span>
                    </div>
                    <div class="order-time">
                        <i class="fas fa-clock"></i>
                        <span>${formatOrderTime(order.order_date)}</span>
                    </div>
                </div>
                <div class="order-status">
                    <span class="status-badge ${order.status.toLowerCase()}">${order.status}</span>
                </div>
            `;
            
            ordersList.appendChild(orderItem);
        });
        
        // Rebind drag events for this list
        bindDragEvents(ordersList);
        
    } catch (error) {
        console.error('Error loading orders:', error);
        
        let errorMessage = 'Failed to load orders from database';
        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. Please try again.';
        } else if (error.message.includes('HTTP')) {
            errorMessage = `Server error: ${error.message}`;
        } else if (error.message.includes('fetch')) {
            errorMessage = 'Network error. Please check your connection.';
        }
        
        console.log('Setting error message:', errorMessage);
        ordersList.innerHTML = `
            <div class="no-orders">
                <div class="no-orders-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h4>Error Loading Orders</h4>
                <p>${errorMessage}</p>
            </div>
        `;
        showNotification(errorMessage, 'error');
    }
}

// Initialize DnD containers
function initializeDragAndDrop() {
    const lists = [
        document.getElementById('driverOrdersList1'),
        document.getElementById('driverOrdersList2')
    ].filter(Boolean);
    lists.forEach(bindContainerDnD);
}

function bindContainerDnD(list) {
    if (!list) return;
    list.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    list.addEventListener('dragenter', (e) => {
        e.preventDefault();
        list.classList.add('drag-over');
    });
    list.addEventListener('dragleave', () => {
        list.classList.remove('drag-over');
    });
    list.addEventListener('drop', async (e) => {
        e.preventDefault();
        list.classList.remove('drag-over');
        const orderId = e.dataTransfer.getData('text/plain');
        const sourceSlot = parseInt(e.dataTransfer.getData('sourceSlot'), 10);
        const targetSlot = list.id.endsWith('1') ? 1 : 2;
        if (!orderId || !sourceSlot || !targetSlot || sourceSlot === targetSlot) return;
        await handleTransfer(orderId, sourceSlot, targetSlot);
    });
}

function bindDragEvents(list) {
    if (!list) return;
    // Ensure container DnD is set
    bindContainerDnD(list);
    
    list.querySelectorAll('.order-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.orderId || '');
            e.dataTransfer.setData('sourceSlot', item.dataset.sourceSlot || '');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
    });
}

let pendingTransfer = null;

function openConfirmTransfer({ orderId, fromName, toName, onConfirm }) {
    const overlay = document.getElementById('transferConfirmOverlay');
    const text = document.getElementById('transferConfirmText');
    const btn = document.getElementById('transferConfirmBtn');
    if (!overlay || !text || !btn) return onConfirm && onConfirm(false);
    text.textContent = `Transfer order ${orderId} from ${fromName} to ${toName}?`;
    pendingTransfer = onConfirm;
    overlay.style.display = 'flex';
    btn.onclick = () => {
        const cb = pendingTransfer; pendingTransfer = null;
        closeTransferConfirm();
        cb && cb(true);
    };
}

function closeTransferConfirm() {
    const overlay = document.getElementById('transferConfirmOverlay');
    if (overlay) overlay.style.display = 'none';
}

function cancelTransferConfirm() {
    const cb = pendingTransfer; pendingTransfer = null;
    closeTransferConfirm();
    cb && cb(false);
}

async function handleTransfer(orderId, sourceSlot, targetSlot) {
    const sourceDriver = selectedDrivers[sourceSlot];
    const targetDriver = selectedDrivers[targetSlot];
    if (!sourceDriver || !targetDriver) {
        showNotification('Both drivers must be selected to transfer orders', 'warning');
        return;
    }
    // Resolve stable identifiers and compare strictly
    const fromId = (sourceDriver.user_id || sourceDriver.id || '').toString().trim();
    const toId = (targetDriver.user_id || targetDriver.id || '').toString().trim();
    console.log('Transfer check identifiers:', { fromId, toId, sourceDriver, targetDriver });
    if (fromId && toId && fromId === toId) {
        showNotification('Cannot transfer to the same driver', 'warning');
        return;
    }
    
    const fromName = sourceDriver.name || sourceDriver.full_name || 'Driver';
    const toName = targetDriver.name || targetDriver.full_name || 'Driver';
    const confirmed = await new Promise((resolve) => {
        openConfirmTransfer({ orderId, fromName, toName, onConfirm: resolve });
    });
    if (!confirmed) return;
    
    try {
        const payload = {
            orderId,
            fromDriverId: fromId,
            toDriverId: toId
        };
        const res = await fetch('/api/transfer-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Transfer failed');
        showNotification('Order transferred successfully', 'success');
        // Optimistically remove from source list
        const sourceList = document.getElementById(`driverOrdersList${sourceSlot}`);
        const movedNode = sourceList ? sourceList.querySelector(`.order-item[data-order-id="${orderId}"]`) : null;
        if (movedNode) movedNode.remove();
        // Refresh both lists to reflect DB state
        await Promise.all([
            loadDriverOrders(1),
            loadDriverOrders(2)
        ]);
    } catch (err) {
        console.error('Transfer failed:', err);
        showNotification('Failed to transfer order', 'error');
    }
}

// Format order time for display
function formatOrderTime(orderDate) {
    if (!orderDate) return 'Unknown time';
    
    const date = new Date(orderDate);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    return `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Format date for display
function formatDisplayDate(dateString) {
    if (!dateString) return 'Unknown date';
    
    const date = new Date(dateString);
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    
    return date.toLocaleDateString('en-US', options);
}

 
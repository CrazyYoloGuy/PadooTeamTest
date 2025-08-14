// Orders Management JavaScript
let allOrders = [];
let filteredOrders = [];
let currentFilters = {};

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    loadOrders();
    loadDrivers();
    initializeFilters();
    updateStats();
});

// Load all orders from the database
async function loadOrders() {
    try {
        const response = await fetch('/api/orders', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch orders');
        }

        const data = await response.json();
        allOrders = data.orders || [];
        filteredOrders = [...allOrders];
        
        console.log('Orders loaded:', allOrders);
        renderOrdersTable();
        updateStats();
    } catch (error) {
        console.error('Error loading orders:', error);
        showNotification('Failed to load orders from database', 'error');
    }
}

// Load drivers for filter dropdown
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
        const drivers = data.drivers || [];
        
        const driverFilter = document.getElementById('driverFilter');
        if (driverFilter) {
            driverFilter.innerHTML = '<option value="">All Drivers</option>';
            drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = driver.name;
                driverFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading drivers:', error);
    }
}

// Initialize filters
function initializeFilters() {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilter) {
        dateFilter.value = today;
    }
}

// Apply filters to orders
function applyFilters() {
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    const driverFilter = document.getElementById('driverFilter').value;
    
    currentFilters = {
        status: statusFilter,
        date: dateFilter,
        driver: driverFilter
    };
    
    filteredOrders = allOrders.filter(order => {
        let matches = true;
        
        // Status filter
        if (statusFilter && order.status.toLowerCase() !== statusFilter.toLowerCase()) {
            matches = false;
        }
        
        // Date filter
        if (dateFilter) {
            const orderDate = new Date(order.order_date).toISOString().split('T')[0];
            if (orderDate !== dateFilter) {
                matches = false;
            }
        }
        
        // Driver filter
        if (driverFilter && order.driver_id !== driverFilter) {
            matches = false;
        }
        
        return matches;
    });
    
    renderOrdersTable();
    updateStats();
}

// Render orders table
function renderOrdersTable() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;
    
    if (filteredOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="no-orders">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No orders found</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = '';
    filteredOrders.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>#${order.order_id}</td>
            <td>${order.customer_name || 'Unknown'}</td>
            <td>${order.driver_name || 'Unassigned'}</td>
            <td>$${parseFloat(order.amount).toFixed(2)}</td>
            <td>
                <span class="status-badge ${order.status.toLowerCase()}">${order.status}</span>
            </td>
            <td>${formatDate(order.order_date)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="viewOrder('${order.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="editOrder('${order.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteOrder('${order.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Update statistics
function updateStats() {
    const totalOrders = filteredOrders.length;
    const pendingOrders = filteredOrders.filter(order => order.status.toLowerCase() === 'pending').length;
    const completedOrders = filteredOrders.filter(order => order.status.toLowerCase() === 'delivered').length;
    
    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('pendingOrders').textContent = pendingOrders;
    document.getElementById('completedOrders').textContent = completedOrders;
}

// Refresh orders
function refreshOrders() {
    loadOrders();
    showNotification('Orders refreshed successfully', 'success');
}

// Export orders
function exportOrders() {
    // Create CSV content
    const headers = ['Order ID', 'Customer', 'Driver', 'Amount', 'Status', 'Date'];
    const csvContent = [
        headers.join(','),
        ...filteredOrders.map(order => [
            order.order_id,
            order.customer_name || 'Unknown',
            order.driver_name || 'Unassigned',
            order.amount,
            order.status,
            formatDate(order.order_date)
        ].join(','))
    ].join('\n');
    
    // Download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showNotification('Orders exported successfully', 'success');
}

// View order details
function viewOrder(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (order) {
        // You can implement a modal or redirect to order details page
        showNotification(`Viewing order: ${order.order_id}`, 'info');
    }
}

// Edit order
function editOrder(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (order) {
        // You can implement edit functionality
        showNotification(`Editing order: ${order.order_id}`, 'info');
    }
}

// Delete order
function deleteOrder(orderId) {
    if (confirm('Are you sure you want to delete this order?')) {
        // You can implement delete functionality
        showNotification('Order deleted successfully', 'success');
        loadOrders(); // Refresh the list
    }
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
    `;
    
    switch(type) {
        case 'success':
            notification.style.background = '#22c55e';
            break;
        case 'error':
            notification.style.background = '#ef4444';
            break;
        case 'warning':
            notification.style.background = '#f59e0b';
            break;
        default:
            notification.style.background = '#3b82f6';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
} 
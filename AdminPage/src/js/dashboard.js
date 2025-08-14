// Dashboard JavaScript with WebSocket Real-time Updates
class DashboardManager {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.charts = {};
        this.isConnected = false;
        this.lastUpdateTime = null;
        
        console.log('🚀 Dashboard Manager initialized');
        this.init();
    }

    init() {
        console.log('📋 Starting dashboard initialization...');
        
        // Check if user is logged in
        this.checkUserSession();
        
        // Initialize WebSocket connection
        this.initializeWebSocket();
        
        // Initialize UI components
        this.initializeCharts();
        this.initializeSidebar();
        this.initializeSearch();
        this.initializeNotifications();
        this.updateUserInfo();
        
        console.log('✅ Dashboard initialization completed');
    }

    // WebSocket Management
    initializeWebSocket() {
        console.log('🔌 Initializing WebSocket connection...');
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log(`🔗 Connecting to WebSocket: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ WebSocket connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.showConnectionStatus('connected');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Received WebSocket message:', data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log('🔌 WebSocket connection closed:', event.code, event.reason);
            this.isConnected = false;
            this.showConnectionStatus('disconnected');
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            } else {
                console.error('❌ Max reconnection attempts reached');
                this.showConnectionStatus('failed');
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
        };
    }

    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            this.initializeWebSocket();
        }, delay);
    }

    handleWebSocketMessage(data) {
        console.log(`📊 Processing message type: ${data.type}`);
        
        switch (data.type) {
            case 'INIT_DATA':
                console.log('📋 Received initial dashboard data');
                this.updateDashboardData(data.data);
                break;
                
            case 'DATA_UPDATE':
                console.log('🔄 Received data update');
                this.updateDashboardData(data.data);
                break;
                
            case 'NEW_ORDER':
                console.log('🆕 New order received:', data.data.order);
                this.handleNewOrder(data.data);
                break;
                
            case 'ORDER_STATUS_UPDATED':
                console.log('🔄 Order status updated:', data.data.order);
                this.handleOrderStatusUpdate(data.data);
                break;
                
            default:
                console.warn('⚠️ Unknown message type:', data.type);
        }
    }

    sendWebSocketMessage(type, payload = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = { type, payload };
            console.log('📤 Sending WebSocket message:', message);
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('⚠️ WebSocket not connected, cannot send message');
        }
    }

    showConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;
        
        const statusMap = {
            connected: { text: '🟢 Connected', class: 'connected' },
            disconnected: { text: '🟡 Disconnected', class: 'disconnected' },
            failed: { text: '🔴 Connection Failed', class: 'failed' }
        };
        
        const statusInfo = statusMap[status];
        statusElement.textContent = statusInfo.text;
        statusElement.className = `connection-status ${statusInfo.class}`;
        
        console.log(`🔗 Connection status: ${status}`);
    }

    // Dashboard Data Management
    updateDashboardData(data) {
        console.log('📊 Updating dashboard with new data:', data);
        
        this.lastUpdateTime = new Date();
        
        // Update stats
        if (data.stats) {
            this.updateStats(data.stats);
        }
        
        // Update orders
        if (data.orders) {
            this.updateOrdersTable(data.orders);
        }
        
        // Update notifications
        if (data.notifications) {
            this.updateNotifications(data.notifications);
        }
        
        // Update last update time
        this.updateLastUpdateTime();
    }

    updateStats(stats) {
        console.log('📈 Updating statistics:', stats);
        
        const statElements = {
            totalUsers: document.querySelector('.stat-card:nth-child(1) .stat-number'),
            totalOrders: document.querySelector('.stat-card:nth-child(2) .stat-number'),
            totalSales: document.querySelector('.stat-card:nth-child(3) .stat-number'),
            pendingOrders: document.querySelector('.stat-card:nth-child(4) .stat-number')
        };
        
        Object.keys(stats).forEach(key => {
            const element = statElements[key];
            if (element) {
                const currentValue = this.parseNumber(element.textContent);
                const newValue = stats[key];
                
                if (currentValue !== newValue) {
                    console.log(`📊 Updating ${key}: ${currentValue} → ${newValue}`);
                    this.animateValue(element, currentValue, newValue, 1000, key === 'totalSales');
                }
            }
        });
    }

    updateOrdersTable(orders) {
        console.log('📋 Updating orders table with', orders.length, 'orders');
        
        const tbody = document.querySelector('.data-table tbody');
        if (!tbody) {
            console.warn('⚠️ Orders table body not found');
            return;
        }
        
        tbody.innerHTML = '';
        
        orders.forEach((order, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${order.id}</td>
                <td>${order.customer}</td>
                <td>${order.product}</td>
                <td>${order.amount}</td>
                <td><span class="status ${order.status}">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span></td>
                <td>${order.date}</td>
                <td>
                    <button class="action-btn" onclick="dashboard.viewOrder('${order.id}')" title="View Order">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn" onclick="dashboard.editOrder('${order.id}')" title="Edit Order">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            
            // Add highlight animation for new orders
            if (index === 0) {
                row.classList.add('new-order');
                setTimeout(() => row.classList.remove('new-order'), 3000);
            }
            
            tbody.appendChild(row);
        });
        
        console.log('✅ Orders table updated successfully');
    }

    handleNewOrder(data) {
        console.log('🆕 Handling new order:', data.order);
        
        // Update stats
        this.updateStats(data.stats);
        
        // Add notification
        if (data.notification) {
            this.addNotification(data.notification);
        }
        
        // Show success message
        this.showToast('New order received!', 'success');
    }

    handleOrderStatusUpdate(data) {
        console.log('🔄 Handling order status update:', data.order);
        
        // Update stats
        this.updateStats(data.stats);
        
        // Add notification
        if (data.notification) {
            this.addNotification(data.notification);
        }
        
        // Show success message
        this.showToast(`Order ${data.order.id} status updated to ${data.order.status}`, 'info');
    }

    // UI Components
    initializeCharts() {
        console.log('📊 Initializing charts...');
        
        // Sales Chart
        const salesCtx = document.getElementById('salesChart');
        if (salesCtx) {
            console.log('📈 Creating sales chart');
            this.charts.sales = new Chart(salesCtx, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                    datasets: [{
                        label: 'Sales',
                        data: [65, 59, 80, 81, 56, 55, 40, 45, 60, 70, 85, 90],
                        borderColor: '#00BCD4',
                        backgroundColor: 'rgba(0, 188, 212, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#00BCD4',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(0, 0, 0, 0.05)' },
                            ticks: { color: '#6B7280', font: { size: 12 } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#6B7280', font: { size: 12 } }
                        }
                    },
                    elements: {
                        point: { hoverBackgroundColor: '#00BCD4' }
                    }
                }
            });
        }

        // Order Status Chart
        const orderCtx = document.getElementById('orderChart');
        if (orderCtx) {
            console.log('🍩 Creating order status chart');
            this.charts.order = new Chart(orderCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Delivered', 'Pending', 'Processing', 'Cancelled'],
                    datasets: [{
                        data: [65, 20, 10, 5],
                        backgroundColor: ['#10B981', '#F59E0B', '#3B82F6', '#EF4444'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                font: { size: 12 }
                            }
                        }
                    },
                    cutout: '70%'
                }
            });
        }
        
        console.log('✅ Charts initialized successfully');
    }

    initializeSidebar() {
        console.log('📱 Initializing sidebar...');
        
        const menuToggle = document.querySelector('.menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        
        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
                console.log('📱 Sidebar toggled');
            });
        }

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024) {
                if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            }
        });

        // Handle navigation links
        const navLinks = document.querySelectorAll('.nav-section a');
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                navLinks.forEach(l => l.parentElement.classList.remove('active'));
                this.parentElement.classList.add('active');
                
                const breadcrumb = document.querySelector('.breadcrumb span');
                if (breadcrumb) {
                    breadcrumb.textContent = this.querySelector('span').textContent;
                }
                
                console.log('🧭 Navigation clicked:', this.querySelector('span').textContent);
            });
        });

        // Handle logout
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🚪 User logging out');
                
                localStorage.removeItem('currentUser');
                localStorage.removeItem('rememberMe');
                localStorage.removeItem('savedUsername');
                
                window.location.href = '/LoginPage/index.html';
            });
        }
        
        console.log('✅ Sidebar initialized');
    }

    initializeSearch() {
        console.log('🔍 Initializing search functionality...');
        
        const searchInput = document.querySelector('.search-bar input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                console.log('🔍 Searching for:', searchTerm);
                
                // Implement search functionality here
                this.performSearch(searchTerm);
            });
        }
        
        console.log('✅ Search initialized');
    }

    performSearch(searchTerm) {
        // Search through orders table
        const rows = document.querySelectorAll('.data-table tbody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
        
        console.log(`🔍 Search results: ${Array.from(rows).filter(row => row.style.display !== 'none').length} matches`);
    }

    initializeNotifications() {
        console.log('🔔 Initializing notifications...');
        
        const notificationBtn = document.querySelector('.notification-btn');
        if (notificationBtn) {
            notificationBtn.addEventListener('click', () => {
                console.log('🔔 Notifications clicked');
                this.showNotifications();
            });
        }
        
        console.log('✅ Notifications initialized');
    }

    updateNotifications(notifications) {
        console.log('📢 Updating notifications:', notifications.length);
        
        const notificationCount = document.querySelector('.notification-count');
        if (notificationCount) {
            notificationCount.textContent = notifications.length;
            notificationCount.style.display = notifications.length > 0 ? 'block' : 'none';
        }
    }

    addNotification(notification) {
        console.log('📢 Adding notification:', notification);
        
        // Create notification element
        const notificationEl = document.createElement('div');
        notificationEl.className = 'notification-item';
        notificationEl.innerHTML = `
            <div class="notification-content">
                <h4>${notification.title}</h4>
                <p>${notification.message}</p>
                <small>${notification.time}</small>
            </div>
        `;
        
        // Add to notifications container
        const container = document.querySelector('.notifications-container');
        if (container) {
            container.insertBefore(notificationEl, container.firstChild);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (notificationEl.parentNode) {
                    notificationEl.remove();
                }
            }, 5000);
        }
    }

    // Utility Functions
    checkUserSession() {
        console.log('🔐 Checking user session...');
        
        const currentUser = localStorage.getItem('currentUser');
        
        if (!currentUser) {
            console.warn('⚠️ No user session found, redirecting to login');
            window.location.href = '/LoginPage/index.html';
            return;
        }
        
        const user = JSON.parse(currentUser);
        
        if (user.role !== 'admin') {
            console.warn('⚠️ User is not admin, redirecting to login');
            localStorage.removeItem('currentUser');
            window.location.href = '/LoginPage/index.html';
            return;
        }
        
        console.log('✅ User session validated:', user);
    }

    updateUserInfo() {
        console.log('👤 Updating user info...');
        
        const currentUser = localStorage.getItem('currentUser');
        
        if (currentUser) {
            const user = JSON.parse(currentUser);
            
            const userNameElement = document.querySelector('.user-name');
            if (userNameElement) {
                userNameElement.textContent = user.fullName || user.username;
            }
            
            const userRoleElement = document.querySelector('.user-role');
            if (userRoleElement) {
                userRoleElement.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            }
            
            const popupUserNameElement = document.getElementById('popupUserName');
            if (popupUserNameElement) {
                popupUserNameElement.textContent = user.fullName || user.username;
            }
            
            this.showWelcomePopup();
        }
        
        console.log('✅ User info updated');
    }

    showWelcomePopup() {
        const welcomePopup = document.getElementById('welcomePopup');
        if (welcomePopup) {
            const today = new Date().toDateString();
            const lastShown = localStorage.getItem('welcomePopupShown');
            
            if (lastShown !== today) {
                setTimeout(() => {
                    welcomePopup.classList.add('show');
                    console.log('👋 Welcome popup shown');
                }, 100);
                
                localStorage.setItem('welcomePopupShown', today);
                
                setTimeout(() => {
                    if (welcomePopup.classList.contains('show')) {
                        this.closeWelcomePopup();
                    }
                }, 4000);
            }
        }
    }

    closeWelcomePopup() {
        const welcomePopup = document.getElementById('welcomePopup');
        if (welcomePopup) {
            welcomePopup.classList.remove('show');
            console.log('👋 Welcome popup closed');
        }
    }

    animateValue(element, start, end, duration, isCurrency) {
        const startTime = performance.now();
        
        function updateValue(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = start + (end - start) * this.easeOutQuart(progress);
            
            if (isCurrency) {
                element.textContent = '$' + Math.floor(current).toLocaleString();
            } else {
                element.textContent = Math.floor(current).toLocaleString();
            }
            
            if (progress < 1) {
                requestAnimationFrame(updateValue);
            }
        }
        
        requestAnimationFrame(updateValue.bind(this));
    }

    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    parseNumber(str) {
        return parseFloat(str.replace(/[$,]/g, '')) || 0;
    }

    updateLastUpdateTime() {
        const updateElement = document.getElementById('lastUpdateTime');
        if (updateElement && this.lastUpdateTime) {
            updateElement.textContent = this.lastUpdateTime.toLocaleTimeString();
        }
    }

    showToast(message, type = 'info') {
        console.log(`🍞 Showing toast: ${message} (${type})`);
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 3000);
    }

    showNotifications() {
        console.log('🔔 Showing notifications dropdown');
        // Implement notifications dropdown
    }

    // Order Actions
    viewOrder(orderId) {
        console.log('👁️ Viewing order:', orderId);
        this.showToast(`Viewing order ${orderId}`, 'info');
        // Implement order view functionality
    }

    editOrder(orderId) {
        console.log('✏️ Editing order:', orderId);
        this.showToast(`Editing order ${orderId}`, 'info');
        // Implement order edit functionality
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌐 DOM loaded, initializing dashboard...');
    window.dashboard = new DashboardManager();
});

// Export for global access
window.viewOrder = (orderId) => window.dashboard?.viewOrder(orderId);
window.editOrder = (orderId) => window.dashboard?.editOrder(orderId); 
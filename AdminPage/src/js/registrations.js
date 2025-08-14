// Registrations Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    checkUserSession();
    
    // Initialize registrations page
    initializeRegistrations();
    
    // Initialize sidebar functionality
    initializeSidebar();
    
    // Initialize search functionality
    initializeSearch();
    
    // Update user info
    updateUserInfo();
});

// Check User Session
function checkUserSession() {
    const currentUser = localStorage.getItem('currentUser');
    
    if (!currentUser) {
        // Redirect to login if not logged in
        window.location.href = '/LoginPage/index.html';
        return;
    }
    
    const user = JSON.parse(currentUser);
    
    if (user.role !== 'admin') {
        // Redirect to login if not admin
        localStorage.removeItem('currentUser');
        window.location.href = '/LoginPage/index.html';
        return;
    }
    
    console.log('User session validated:', user);
}

// Update User Info
function updateUserInfo() {
    const currentUser = localStorage.getItem('currentUser');
    
    if (currentUser) {
        const user = JSON.parse(currentUser);
        
        // Update user name in header
        const userNameElement = document.querySelector('.user-name');
        if (userNameElement) {
            userNameElement.textContent = user.fullName || user.username;
        }
        
        // Update user role in header
        const userRoleElement = document.querySelector('.user-role');
        if (userRoleElement) {
            userRoleElement.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        }
    }
}

// Initialize Registrations
function initializeRegistrations() {
    loadRegistrations();
    initializeFilterTabs();
    updateStats();
}

// Load Registrations
async function loadRegistrations() {
    try {
        const response = await fetch('/api/registrations');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Loaded registrations from API:', data.registrations);
            displayRegistrations(data.registrations);
            updateStats();
        } else {
            console.error('Failed to load registrations:', data.message);
            showNotification('Failed to load registrations: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error loading registrations:', error);
        showNotification('Error loading registrations: ' + error.message, 'error');
    }
}

// Display Registrations
function displayRegistrations(registrations) {
    const tableBody = document.getElementById('registrationsTableBody');
    
    if (registrations.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="fas fa-user-plus"></i>
                    <h3>No registrations found</h3>
                    <p>When users register, their requests will appear here</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = registrations.map(registration => {
        // Use database structure
        const name = registration.full_name || 'Unknown';
        const username = registration.username || 'N/A';
        const phone = registration.phone || 'N/A';
        const role = registration.role || 'Unknown';
        const status = registration.status || 'pending';
        const createdAt = registration.created_at || new Date().toISOString();
        
        console.log('Processing registration:', { name, username, phone, role, status }); // Debug log
        
        return `
            <tr data-id="${registration.id}" data-status="${status}">
                <td>
                    <div class="user-info-cell">
                        <div class="user-avatar">
                            ${name.charAt(0).toUpperCase()}
                        </div>
                        <div class="user-details">
                            <div class="user-name">${name}</div>
                            <div class="user-role">${role}</div>
                        </div>
                    </div>
                </td>
                <td>${name}</td>
                <td>${phone}</td>
                <td>
                    <span class="status ${role}">
                        ${role.charAt(0).toUpperCase() + role.slice(1)}
                    </span>
                </td>
                <td>
                    <span class="status ${status}">
                        ${status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                </td>
                <td>${formatDate(createdAt)}</td>
                <td>
                    ${status === 'pending' ? `
                        <div style="display: flex; gap: 8px; justify-content: center;">
                            <a href="#" onclick="acceptRegistration('${registration.id}'); return false;" style="background-color: #10b981; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">
                                <i class="fas fa-check"></i> Accept
                            </a>
                            <a href="#" onclick="rejectRegistration('${registration.id}'); return false;" style="background-color: #ef4444; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">
                                <i class="fas fa-times"></i> Reject
                            </a>
                        </div>
                    ` : `
                        <span style="color: #6b7280; font-style: italic;">Processed</span>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// Initialize Filter Tabs
function initializeFilterTabs() {
    const filterTabs = document.querySelectorAll('.filter-tab');
    
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active class from all tabs
            filterTabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Filter registrations
            const filter = this.dataset.filter;
            filterRegistrations(filter);
        });
    });
}

// Filter Registrations
function filterRegistrations(filter) {
    const tableRows = document.querySelectorAll('#registrationsTableBody tr');
    
    tableRows.forEach(row => {
        const status = row.dataset.status;
        
        if (filter === 'all' || status === filter) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Accept Registration
async function acceptRegistration(id) {
    console.log('Accept registration called with ID:', id);
    
    // Show immediate feedback
    showNotification('Processing acceptance...', 'info');
    
    try {
        const response = await fetch(`/api/registrations/${id}/accept`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Registration accepted and user account created successfully!', 'success');
            // Reload after a short delay to ensure UI updates
            setTimeout(() => {
                loadRegistrations();
            }, 500);
        } else {
            showNotification('Failed to accept registration: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error accepting registration:', error);
        showNotification('Error accepting registration: ' + error.message, 'error');
    }
}

// Reject Registration
async function rejectRegistration(id) {
    console.log('Reject registration called with ID:', id);
    
    // Show immediate feedback
    showNotification('Processing rejection...', 'info');
    
    try {
        const response = await fetch(`/api/registrations/${id}/reject`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Registration rejected successfully!', 'success');
            // Reload after a short delay to ensure UI updates
            setTimeout(() => {
                loadRegistrations();
            }, 500);
        } else {
            showNotification('Failed to reject registration: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error rejecting registration:', error);
        showNotification('Error rejecting registration: ' + error.message, 'error');
    }
}

// Update Stats
async function updateStats() {
    try {
        const response = await fetch('/api/registrations');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const registrations = data.registrations;
            
            const total = registrations.length;
            const pending = registrations.filter(r => r.status === 'pending').length;
            const accepted = registrations.filter(r => r.status === 'accepted').length;
            const rejected = registrations.filter(r => r.status === 'rejected').length;
            
            // Update stat numbers
            document.getElementById('totalRegistrations').textContent = total;
            document.getElementById('pendingRegistrations').textContent = pending;
            document.getElementById('acceptedRegistrations').textContent = accepted;
            document.getElementById('rejectedRegistrations').textContent = rejected;
            
            // Update filter counts
            document.getElementById('allCount').textContent = total;
            document.getElementById('pendingCount').textContent = pending;
            document.getElementById('acceptedCount').textContent = accepted;
            document.getElementById('rejectedCount').textContent = rejected;
        } else {
            console.error('Failed to update stats:', data.message);
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Refresh Registrations
function refreshRegistrations() {
    console.log('Refreshing registrations...'); // Debug log
    loadRegistrations();
    showNotification('Registrations refreshed!', 'info');
}

// Initialize Sidebar
function initializeSidebar() {
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('open');
        });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
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
            // Remove active class from all links
            navLinks.forEach(l => l.parentElement.classList.remove('active'));
            
            // Add active class to clicked link
            this.parentElement.classList.add('active');
            
            // Update breadcrumb
            const breadcrumb = document.querySelector('.breadcrumb span');
            if (breadcrumb) {
                breadcrumb.textContent = this.querySelector('span').textContent;
            }
        });
    });

    // Handle logout
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Clear user session
            localStorage.removeItem('currentUser');
            localStorage.removeItem('rememberMe');
            localStorage.removeItem('savedUsername');
            
            // Redirect to login
            window.location.href = '/LoginPage/index.html';
        });
    }
}

// Initialize Search
function initializeSearch() {
    const searchInput = document.querySelector('.search-bar input');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const tableRows = document.querySelectorAll('#registrationsTableBody tr');
            
            tableRows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
}

// Helper Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add styles
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
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}



// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style); 
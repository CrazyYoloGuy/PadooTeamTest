// Users Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    checkUserSession();
    
    // Initialize users page
    initializeUsers();
    
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

// Initialize Users
function initializeUsers() {
    loadUsers();
    initializeFilterTabs();
    updateStats();
}

// Load Users
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Loaded users from API:', data.users);
            displayUsers(data.users);
            updateStats();
        } else {
            console.error('Failed to load users:', data.message);
            showNotification('Failed to load users: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Error loading users: ' + error.message, 'error');
    }
}

// Display Users
function displayUsers(users) {
    const tableBody = document.getElementById('usersTableBody');
    
    console.log('Displaying users:', users);
    
    if (!users || users.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No users found</h3>
                    <p>When users are accepted from registrations, they will appear here</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = users.map(user => {
        const name = user.full_name || 'Unknown';
        const username = user.username || 'N/A';
        const phone = user.phone || 'N/A';
        const role = user.role || 'Unknown';
        const status = user.status || 'active';
        const createdAt = user.created_at || new Date().toISOString();
        const notes = user.notes || '';
        
        console.log('Processing user:', { name, username, phone, role, status });
        
        return `
            <tr data-id="${user.id}" data-role="${role}" data-status="${status}" data-notes="${notes.replace(/"/g, '&quot;')}">
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
                <td>${username}</td>
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
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <a href="#" onclick="viewUserDetails('${user.id}'); return false;" style="background-color: #0ea5e9; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="fas fa-eye"></i> View
                        </a>
                    </div>
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
            
            // Filter users
            const filter = this.dataset.filter;
            filterUsers(filter);
        });
    });
}

// Filter Users
function filterUsers(filter) {
    const tableRows = document.querySelectorAll('#usersTableBody tr');
    
    tableRows.forEach(row => {
        const role = row.dataset.role;
        const status = row.dataset.status;
        
        if (filter === 'all' || role === filter) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Update Stats
async function updateStats() {
    try {
        const response = await fetch('/api/users');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const users = data.users;
            
            const total = users.length;
            const drivers = users.filter(u => u.role === 'driver').length;
            const shops = users.filter(u => u.role === 'shop').length;
            const admins = users.filter(u => u.role === 'admin').length;
            
            // Update stat numbers
            document.getElementById('totalUsers').textContent = total;
            document.getElementById('totalDrivers').textContent = drivers;
            document.getElementById('totalShops').textContent = shops;
            document.getElementById('totalAdmins').textContent = admins;
            
            // Update filter counts
            document.getElementById('allCount').textContent = total;
            document.getElementById('driversCount').textContent = drivers;
            document.getElementById('shopsCount').textContent = shops;
            document.getElementById('adminsCount').textContent = admins;
        } else {
            console.error('Failed to update stats:', data.message);
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Refresh Users
function refreshUsers() {
    console.log('Refreshing users...');
    loadUsers();
    showNotification('Users refreshed!', 'info');
}

// View User Details
async function viewUserDetails(userId) {
    console.log('Viewing user details for ID:', userId);
    
    try {
        const response = await fetch(`/api/users/${userId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const user = data.user;
            showUserModal(user);
        } else {
            // If API fails, try to find user in the table
            const users = document.querySelectorAll('#usersTableBody tr');
            let foundUser = null;
            
            users.forEach(row => {
                if (row.dataset.id == userId) {
                    foundUser = {
                        id: userId,
                        full_name: row.querySelector('.user-name').textContent,
                        username: row.cells[1].textContent,
                        phone: row.cells[2].textContent,
                        role: row.dataset.role,
                        status: row.dataset.status,
                        created_at: row.cells[5].textContent,
                        notes: row.dataset.notes || ''
                    };
                }
            });
            
            if (foundUser) {
                showUserModal(foundUser);
            } else {
                showNotification('Failed to load user details: ' + data.message, 'error');
            }
        }
    } catch (error) {
        console.error('Error loading user details:', error);
        showNotification('Error loading user details: ' + error.message, 'error');
    }
}

// Show User Modal
function showUserModal(user) {
    console.log('Showing user modal for:', user);
    
    // Populate modal with user data for view mode
    document.getElementById('modalFullName').textContent = user.full_name || 'N/A';
    document.getElementById('modalUsername').textContent = user.username || 'N/A';
    document.getElementById('modalPhone').textContent = user.phone || 'N/A';
    document.getElementById('modalRole').textContent = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'N/A';
    document.getElementById('modalStatus').textContent = user.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1) : 'N/A';
    document.getElementById('modalCreated').textContent = formatDate(user.created_at) || 'N/A';
    
    // Handle notes section visibility
    const notesSection = document.getElementById('notesSection');
    const modalNotes = document.getElementById('modalNotes');
    
    if (user.notes && user.notes.trim() !== '') {
        notesSection.style.display = 'block';
        modalNotes.textContent = user.notes;
    } else {
        notesSection.style.display = 'block';
        modalNotes.textContent = 'No notes available';
    }
    
    // Also populate edit form fields
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editFullName').value = user.full_name || '';
    document.getElementById('editUsername').value = user.username || '';
    document.getElementById('editPhone').value = user.phone || '';
    document.getElementById('editRole').value = user.role || 'driver';
    document.getElementById('editStatus').value = user.status || 'active';
    document.getElementById('editNotes').value = user.notes || '';
    
    // Load categories for shop role and toggle visibility
    const roleSelect = document.getElementById('editRole');
    const categoryGroup = document.getElementById('categoryGroup');
    const categorySelect = document.getElementById('editCategory');
    const ensureCategoriesLoaded = async () => {
        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            const cats = data.categories || [];
            categorySelect.innerHTML = '<option value="">None</option>' +
                cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            // Use dedicated column if present
            if (user.category_id) {
                categorySelect.value = user.category_id;
            }
        } catch (_) { /* ignore */ }
    };
    const toggleCategory = async () => {
        if (roleSelect.value === 'shop') {
            categoryGroup.style.display = 'block';
            await ensureCategoriesLoaded();
        } else {
            categoryGroup.style.display = 'none';
        }
    };
    roleSelect.onchange = toggleCategory;
    toggleCategory();
    
    // Show modal
    const modal = document.getElementById('userModal');
    modal.classList.add('active');
    
    // Store current user ID for edit function
    modal.dataset.userId = user.id;
    
    // Show view mode by default
    switchToViewMode();
}

// Close User Modal
function closeUserModal() {
    const modal = document.getElementById('userModal');
    modal.classList.remove('active');
    
    // Reset to view mode when closing
    setTimeout(() => {
        switchToViewMode();
    }, 300);
}

// Switch to Edit Mode
function switchToEditMode() {
    document.getElementById('viewModeContent').style.display = 'none';
    document.getElementById('editModeContent').style.display = 'block';
    document.getElementById('modalTitle').textContent = 'Edit User';
}

// Switch to View Mode
function switchToViewMode() {
    document.getElementById('viewModeContent').style.display = 'block';
    document.getElementById('editModeContent').style.display = 'none';
    document.getElementById('modalTitle').textContent = 'User Details';
}

// Save User Changes
async function saveUserChanges() {
    const userId = document.getElementById('editUserId').value;
    const fullName = document.getElementById('editFullName').value;
    const username = document.getElementById('editUsername').value;
    const phone = document.getElementById('editPhone').value;
    const role = document.getElementById('editRole').value;
    const categoryId = document.getElementById('editCategory').value;
    const status = document.getElementById('editStatus').value;
    const notes = document.getElementById('editNotes').value;
    
    if (!fullName || !username || !role || !status) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                full_name: fullName,
                username: username,
                phone: phone,
                role: role,
                status: status,
                notes: notes,
                category_id: role === 'shop' ? (categoryId || null) : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('User updated successfully', 'success');
            closeUserModal();
            loadUsers(); // Refresh the user list
        } else {
            showNotification('Failed to update user: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error updating user:', error);
        showNotification('Error updating user: ' + error.message, 'error');
    }
}

// Confirm Delete User
function confirmDeleteUser() {
    const userId = document.getElementById('editUserId').value;
    const username = document.getElementById('editUsername').value;
    
    if (confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
        deleteUser(userId);
    }
}

// Delete User
async function deleteUser(userId) {
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('User deleted successfully', 'success');
            closeUserModal();
            loadUsers(); // Refresh the user list
        } else {
            showNotification('Failed to delete user: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification('Error deleting user: ' + error.message, 'error');
    }
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
            const tableRows = document.querySelectorAll('#usersTableBody tr');
            
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

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('userModal');
    if (e.target === modal) {
        closeUserModal();
    }
});

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
// DOM Elements
const loginForm = document.querySelector('.login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const togglePassword = document.querySelector('.toggle-password');
const rememberCheckbox = document.getElementById('remember');
const loginButton = document.querySelector('.login-button');
const roleTabs = document.querySelectorAll('.role-tab');

// Role selection functionality
let selectedRole = null;

roleTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        // Remove selected class from all tabs
        roleTabs.forEach(t => t.classList.remove('selected'));
        
        // Add selected class to clicked tab
        this.classList.add('selected');
        
        // Store selected role
        selectedRole = this.getAttribute('data-role');
        
        console.log('Selected role:', selectedRole);
    });
});

// Helper functions
function isValidUsername(username) {
    return username.length >= 3 && username.length <= 50;
}

function clearAllErrors() {
    const errorInputs = document.querySelectorAll('.error');
    const errorMessages = document.querySelectorAll('.error-message');
    
    errorInputs.forEach(input => {
        input.classList.remove('error');
        input.style.borderColor = '';
        input.style.backgroundColor = '';
    });
    
    errorMessages.forEach(error => error.remove());
}

function showError(input, message) {
    // Check if input is null or undefined
    if (!input) {
        console.error('Error: Input element is null or undefined', { message });
        
        // Show a generic notification instead
        const notificationDiv = document.createElement('div');
        notificationDiv.className = 'error-notification';
        notificationDiv.textContent = message;
        notificationDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #f44336;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(notificationDiv);
        
        setTimeout(() => {
            if (notificationDiv.parentNode) {
                notificationDiv.remove();
            }
        }, 5000);
        
        return;
    }
    
    // Continue with normal error handling for valid inputs
    const formGroup = input.closest('.form-group');
    
    // Check if formGroup exists
    if (!formGroup) {
        console.error('Error: Form group not found for input', input);
        input.style.borderColor = 'var(--error-color)';
        input.style.backgroundColor = '#FFEBEE';
        return;
    }
    
    const existingError = formGroup.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    input.classList.add('error');
    input.style.borderColor = 'var(--error-color)';
    input.style.backgroundColor = '#FFEBEE';
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    formGroup.appendChild(errorDiv);
    
    input.style.animation = 'shake 0.5s';
    setTimeout(() => {
        input.style.animation = '';
    }, 500);
    
    setTimeout(() => {
        if (errorDiv.parentNode) {
            input.classList.remove('error');
            input.style.borderColor = '';
            input.style.backgroundColor = '';
            errorDiv.remove();
        }
    }, 5000);
}

function showSuccessMessage(message) {
    const existingSuccess = document.querySelector('.success-message');
    if (existingSuccess) {
        existingSuccess.remove();
    }
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.animation = 'fadeInDown 0.5s';
    document.body.appendChild(successDiv);
    setTimeout(() => {
        successDiv.style.animation = 'fadeOutUp 0.5s';
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 500);
    }, 3000);
}

// Password toggle functionality
togglePassword.addEventListener('click', function() {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    
    const icon = this.querySelector('i');
    icon.classList.toggle('fa-eye');
    icon.classList.toggle('fa-eye-slash');
});

// Remember me functionality
if (localStorage.getItem('rememberMe') === 'true') {
    rememberCheckbox.checked = true;
    usernameInput.value = localStorage.getItem('savedUsername') || '';
}

// Form submission
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    clearAllErrors();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    let isValid = true;
    
    // Validate role selection
    if (!selectedRole) {
        const roleSelectionElement = document.querySelector('.role-selection');
        if (roleSelectionElement) {
            showError(roleSelectionElement, 'Please select your role');
        } else {
            // If element not found, show generic error
            showError(null, 'Please select your role');
            console.error('Role selection element not found');
        }
        isValid = false;
    }
    
    // Validate username
    if (!username) {
        showError(usernameInput, 'Username is required');
        isValid = false;
    } else if (!isValidUsername(username)) {
        showError(usernameInput, 'Username must be between 3 and 50 characters');
        isValid = false;
    }
    
    // Validate password
    if (!password) {
        showError(passwordInput, 'Password is required');
        isValid = false;
    } else if (password.length < 4) {
        showError(passwordInput, 'Password must be at least 4 characters');
        isValid = false;
    }
    
    if (isValid) {
        // Save remember me preference
        if (rememberCheckbox.checked) {
            localStorage.setItem('rememberMe', 'true');
            localStorage.setItem('savedUsername', username);
        } else {
            localStorage.removeItem('rememberMe');
            localStorage.removeItem('savedUsername');
        }
        
        authenticateUser(username, password, selectedRole);
    }
});

// Admin credentials (in a real app, this would be in a database)
const ADMIN_CREDENTIALS = {
    'Admin1234': {
        password: '!1234',
        role: 'admin',
        fullName: 'Admin User',
        email: 'admin@teamdelivery.com'
    }
};

function authenticateUser(username, password, role) {
    loginButton.disabled = true;
    loginButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Logging in...';
    document.body.classList.add('logging-in');
    
    // First check if it's the admin user (hardcoded)
    const adminUser = ADMIN_CREDENTIALS[username];
    if (adminUser && adminUser.password === password && adminUser.role === role) {
        // Admin login successful
        loginButton.disabled = false;
        loginButton.innerHTML = 'Log In';
        document.body.classList.remove('logging-in');
        
        // Store user session
        localStorage.setItem('currentUser', JSON.stringify({
            username: username,
            role: adminUser.role,
            fullName: adminUser.fullName,
            email: adminUser.email
        }));
        
        showSuccessMessage(`Welcome back, ${adminUser.fullName}!`);
        
        // Redirect to admin dashboard
        setTimeout(() => {
            window.location.href = '/AdminPage/index.html';
        }, 2000);
        return;
    }
    
    // If not admin, check database users
    console.log('Attempting login with:', { username, role });
    console.log('Password length:', password.length);
    
    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password, role })
    })
    .then(response => {
        console.log('Login response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Login response data:', data);
        
        loginButton.disabled = false;
        loginButton.innerHTML = 'Log In';
        document.body.classList.remove('logging-in');
        
        if (data.success) {
            // Login successful
            console.log('Login successful! User data:', data.user);
            
            localStorage.setItem('currentUser', JSON.stringify({
                id: data.user.id,
                user_id: data.user.user_id, // Save the UUID
                username: data.user.username,
                role: data.user.role,
                fullName: data.user.full_name
            }));
            
            showSuccessMessage(`Welcome back, ${data.user.full_name}!`);
            
            // Redirect based on role
            setTimeout(() => {
                console.log(`Redirecting to ${data.user.role} dashboard...`);
                if (data.user.role === 'admin') {
                    window.location.href = '/AdminPage/index.html';
                } else if (data.user.role === 'driver') {
                    console.log('Redirecting to driver page:', '/DriverPage/index.html');
                    window.location.href = '/DriverPage/index.html';
                } else if (data.user.role === 'shop') {
                    // Redirect to the new shop page
                    console.log('Redirecting to shop page:', '/ShopPage/index.html');
                    window.location.href = '/ShopPage/index.html';
                }
            }, 2000);
        } else {
            // Login failed
            console.error('Login failed:', data.message);
            
            if (data.message.includes('role')) {
                const roleSelectionElement = document.querySelector('.role-selection');
                if (roleSelectionElement) {
                    showError(roleSelectionElement, data.message);
                } else {
                    // If element not found, show generic error
                    showError(null, data.message);
                }
            } else {
                showError(passwordInput, data.message || 'Invalid username or password');
            }
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        loginButton.disabled = false;
        loginButton.innerHTML = 'Log In';
        document.body.classList.remove('logging-in');
        showError(passwordInput, 'Server error. Please try again later.');
    });
}

// Input focus effects
const inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
inputs.forEach(input => {
    input.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
    });
    
    input.addEventListener('blur', function() {
        this.parentElement.classList.remove('focused');
    });
});

// Mobile viewport height fix
const appHeight = () => {
    const doc = document.documentElement;
    doc.style.setProperty('--app-height', `${window.innerHeight}px`);
};
window.addEventListener('resize', appHeight);
appHeight(); 
// DOM Elements
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const togglePasswordBtns = document.querySelectorAll('.toggle-password');
const signupForm = document.querySelector('.signup-form');
const nameInput = document.getElementById('name');
const phoneInput = document.getElementById('phone');
const termsCheckbox = document.getElementById('terms');
const strengthProgress = document.querySelector('.strength-progress');
const strengthText = document.querySelector('.strength-text');
const signupButton = document.querySelector('.signup-button');
const roleTabs = document.querySelectorAll('.role-tab');

// Debug: Check if all elements are found
console.log('DOM Elements found:', {
    passwordInput: !!passwordInput,
    confirmPasswordInput: !!confirmPasswordInput,
    signupForm: !!signupForm,
    nameInput: !!nameInput,
    phoneInput: !!phoneInput,
    termsCheckbox: !!termsCheckbox,
    signupButton: !!signupButton,
    roleTabs: roleTabs.length
});

// Role selection
let selectedRole = null;

roleTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        // Remove active class from all tabs
        roleTabs.forEach(t => t.classList.remove('active'));
        
        // Add active class to clicked tab
        this.classList.add('active');
        selectedRole = this.dataset.role;
        
        // Clear any role selection error
        const roleSelection = document.querySelector('.role-selection');
        if (roleSelection) {
            const errorMessage = roleSelection.querySelector('.error-message');
            if (errorMessage) {
                errorMessage.remove();
            }
        }
    });
});

// Toggle password visibility for both password fields
togglePasswordBtns.forEach(btn => {
    btn.addEventListener('click', function() {
        const input = this.closest('.password-input-container').querySelector('input');
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        
        // Toggle icon
        const icon = this.querySelector('i');
        if (type === 'text') {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        } else {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    });
});

// Password strength checker
passwordInput.addEventListener('input', checkPasswordStrength);

function checkPasswordStrength() {
    const password = passwordInput.value;
    let strength = 0;
    
    // Clear previous classes
    strengthProgress.classList.remove('weak', 'medium', 'strong');
    strengthText.classList.remove('weak', 'medium', 'strong');
    
    if (password.length === 0) {
        strengthProgress.style.width = '0';
        strengthText.textContent = 'Password strength';
        return;
    }
    
    // Check length
    if (password.length >= 8) strength += 1;
    
    // Check for mixed case
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength += 1;
    
    // Check for numbers
    if (password.match(/\d/)) strength += 1;
    
    // Check for special characters
    if (password.match(/[^a-zA-Z\d]/)) strength += 1;
    
    // Update UI based on strength
    switch(true) {
        case (strength <= 2):
            strengthProgress.classList.add('weak');
            strengthText.classList.add('weak');
            strengthText.textContent = 'Weak password';
            break;
        case (strength === 3):
            strengthProgress.classList.add('medium');
            strengthText.classList.add('medium');
            strengthText.textContent = 'Medium password';
            break;
        case (strength >= 4):
            strengthProgress.classList.add('strong');
            strengthText.classList.add('strong');
            strengthText.textContent = 'Strong password';
            break;
    }
}

// Form submission
signupForm.addEventListener('submit', function(e) {
    e.preventDefault();
    console.log('Form submitted!'); // Debug log
    
    // Get form values
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const termsAccepted = termsCheckbox.checked;
    
    console.log('Form values:', { name, phone, password: '***', confirmPassword: '***', selectedRole, termsAccepted }); // Debug log
    
    // Clear previous errors
    clearAllErrors();
    
    // Validate form
    let isValid = true;
    
    // Validate name
    if (!name) {
        showError(nameInput, 'Name is required');
        isValid = false;
    } else if (name.length < 2) {
        showError(nameInput, 'Name must be at least 2 characters');
        isValid = false;
    }
    
    // Validate role selection
    if (!selectedRole) {
        showError(document.querySelector('.role-tabs'), 'Please select your role');
        isValid = false;
    }
    
    // Validate phone
    if (!phone) {
        showError(phoneInput, 'Phone number is required');
        isValid = false;
    } else if (!isValidPhone(phone)) {
        showError(phoneInput, 'Please enter a valid phone number');
        isValid = false;
    }
    
    // Validate password
    if (!password) {
        showError(passwordInput, 'Password is required');
        isValid = false;
    } else if (password.length < 8) {
        showError(passwordInput, 'Password must be at least 8 characters');
        isValid = false;
    }
    
    // Validate confirm password
    if (!confirmPassword) {
        showError(confirmPasswordInput, 'Please confirm your password');
        isValid = false;
    } else if (password !== confirmPassword) {
        showError(confirmPasswordInput, 'Passwords do not match');
        isValid = false;
    }
    
    // Validate terms
    if (!termsAccepted) {
        showError(termsCheckbox, 'You must accept the Terms of Service');
        isValid = false;
    }
    
    console.log('Form validation result:', isValid); // Debug log
    
    if (isValid) {
        console.log('Calling simulateSignup...'); // Debug log
        simulateSignup(name, phone, password, selectedRole);
    }
});

// Helper functions
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    return phoneRegex.test(cleanPhone) && cleanPhone.length >= 10;
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
    let formGroup;
    
    if (input === termsCheckbox) {
        formGroup = input.closest('.form-options');
    } else if (input === signupButton) {
        // Handle button errors differently
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideInRight 0.3s ease;
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
        return;
    } else {
        formGroup = input.closest('.form-group');
    }
    
    // Check if formGroup exists
    if (!formGroup) {
        console.error('Form group not found for input:', input);
        return;
    }
    
    // Remove any existing error for this field
    const existingError = formGroup.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Add error class to input
    input.classList.add('error');
    
    if (input !== termsCheckbox) {
        input.style.borderColor = 'var(--error-color)';
        input.style.backgroundColor = '#FFEBEE';
    }
    
    // Create and append error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    formGroup.appendChild(errorDiv);
    
    // Shake animation for error feedback
    if (input !== termsCheckbox) {
        input.style.animation = 'shake 0.5s';
        setTimeout(() => {
            input.style.animation = '';
        }, 500);
    }
    
    // Auto-remove error after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            input.classList.remove('error');
            if (input !== termsCheckbox) {
                input.style.borderColor = '';
                input.style.backgroundColor = '';
            }
            errorDiv.remove();
        }
    }, 5000);
}

async function simulateSignup(name, phone, password, role) {
    console.log('simulateSignup called with:', { name, phone, password: '***', role }); // Debug log
    
    // Show loading state
    const originalText = signupButton.textContent;
    signupButton.disabled = true;
    signupButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating Account...';
    
    // Add loading animation
    document.body.classList.add('loading');
    
    // Generate username from name
    const username = name.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 1000);
    
    console.log('Generated username:', username); // Debug log
    
    try {
        console.log('Sending registration request...'); // Debug log
        
        // Send registration to API
        const response = await fetch('/api/registrations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password,
                full_name: name,
                phone,
                role
            })
        });
        
        console.log('Response status:', response.status); // Debug log
        
        const data = await response.json();
        console.log('Response data:', data); // Debug log
        
        if (data.success) {
            console.log('Registration submitted successfully:', { name, username, phone, role });
        showSuccessMessage('Registration submitted successfully! Awaiting admin approval...');
        
        // Reset form
        signupButton.disabled = false;
        signupButton.innerHTML = originalText;
        document.body.classList.remove('loading');
        
        // Redirect to login page after 2 seconds
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        } else {
            throw new Error(data.message || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError(signupButton, 'Registration failed. Please try again.');
        
        // Reset form
        signupButton.disabled = false;
        signupButton.innerHTML = originalText;
        document.body.classList.remove('loading');
    }
}

function showSuccessMessage(message) {
    // Remove any existing success message
    const existingSuccess = document.querySelector('.success-message');
    if (existingSuccess) {
        existingSuccess.remove();
    }
    
    // Create success message element
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.animation = 'fadeInDown 0.5s';
    
    document.body.appendChild(successDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
        successDiv.style.animation = 'fadeOutUp 0.5s';
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 500);
    }, 3000);
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded'); // Debug log
    
    // Test form submission
    if (signupForm) {
        console.log('Signup form found, adding submit listener');
        signupForm.addEventListener('submit', function(e) {
            console.log('Form submit event triggered');
        });
    } else {
        console.error('Signup form not found!');
    }
    
    // Add input event listeners to remove error state
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', function() {
            this.classList.remove('error');
            if (this !== termsCheckbox) {
                this.style.borderColor = '';
                this.style.backgroundColor = '';
            }
            
            const formGroup = this === termsCheckbox ? 
                this.closest('.form-options') : 
                this.closest('.form-group');
                
            const errorMessage = formGroup.querySelector('.error-message');
            if (errorMessage) {
                errorMessage.remove();
            }
        });
    });
    
    // Mobile viewport height fix
    const appHeight = () => {
        const doc = document.documentElement;
        doc.style.setProperty('--app-height', `${window.innerHeight}px`);
    };
    window.addEventListener('resize', appHeight);
    appHeight();
    
    // Add focus animations to inputs
    inputs.forEach(input => {
        if (input.type !== 'checkbox') {
            input.addEventListener('focus', function() {
                this.parentElement.classList.add('focused');
            });
            
            input.addEventListener('blur', function() {
                this.parentElement.classList.remove('focused');
            });
        }
    });
}); 
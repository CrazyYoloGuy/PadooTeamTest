// DOM Elements
const contactCards = document.querySelectorAll('.contact-card');
const returnButton = document.querySelector('.return-button');

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Add ripple effect to contact cards
    contactCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // Create ripple effect
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            ripple.style.width = '4px';
            ripple.style.height = '4px';
            
            card.appendChild(ripple);
            
            setTimeout(() => {
                if (ripple.parentNode) {
                    ripple.remove();
                }
            }, 600);
            
            // Track which contact method was used
            const isEmail = card.classList.contains('email-card');
            const contactMethod = isEmail ? 'email' : 'phone';
            
            console.log(`Contact method selected: ${contactMethod}`);
            
            // Show feedback message
            showContactFeedback(contactMethod);
        });
    });
    
    // Mobile viewport height fix
    const appHeight = () => {
        const doc = document.documentElement;
        doc.style.setProperty('--app-height', `${window.innerHeight}px`);
    };
    window.addEventListener('resize', appHeight);
    appHeight();
    
    // Add CSS for ripple effect and animations
    const style = document.createElement('style');
    style.textContent = `
        .ripple {
            position: absolute;
            background: rgba(255, 255, 255, 0.6);
            border-radius: 50%;
            transform: scale(0);
            animation: ripple 0.6s linear;
            pointer-events: none;
        }
        
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        .contact-feedback {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: var(--primary-color);
            color: white;
            padding: 12px 20px;
            border-radius: var(--border-radius);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            font-weight: 600;
            font-size: 14px;
            animation: fadeInDown 0.5s;
        }
        
        .contact-feedback.fade-out {
            animation: fadeOutUp 0.5s;
        }
    `;
    document.head.appendChild(style);
});

function showContactFeedback(method) {
    // Remove any existing feedback
    const existingFeedback = document.querySelector('.contact-feedback');
    if (existingFeedback) {
        existingFeedback.remove();
    }
    
    const message = method === 'email' 
        ? 'Opening email client...' 
        : 'Opening phone dialer...';
    
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'contact-feedback';
    feedbackDiv.textContent = message;
    
    document.body.appendChild(feedbackDiv);
    
    // Remove after 2 seconds
    setTimeout(() => {
        feedbackDiv.classList.add('fade-out');
        setTimeout(() => {
            if (feedbackDiv.parentNode) {
                feedbackDiv.remove();
            }
        }, 500);
    }, 2000);
} 
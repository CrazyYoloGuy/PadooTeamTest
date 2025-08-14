// Protection Script - Prevents direct access to driver dashboard
(function() {
    // Check if user is logged in immediately
    const currentUser = localStorage.getItem('currentUser');
    
    if (!currentUser) {
        // Redirect to login immediately
        window.location.href = '/LoginPage/index.html';
        return;
    }
    
    try {
        const user = JSON.parse(currentUser);
        
        if (user.role !== 'driver') {
            // Clear invalid session and redirect
            localStorage.removeItem('currentUser');
            window.location.href = '/LoginPage/index.html';
            return;
        }
    } catch (error) {
        // Invalid session data, redirect to login
        localStorage.removeItem('currentUser');
        window.location.href = '/LoginPage/index.html';
        return;
    }
})(); 
// Shop Protection Script
document.addEventListener('DOMContentLoaded', function() {
    console.log('Shop protection script running...');
    
    // Check if user is logged in
    const currentUser = localStorage.getItem('currentUser');
    
    if (!currentUser) {
        // Redirect to login if not logged in
        console.log('No user found in localStorage, redirecting to login');
        window.location.href = '/LoginPage/index.html';
        return;
    }
    
    try {
        const user = JSON.parse(currentUser);
        console.log('User found:', user);
        
        if (!user.role || user.role.toLowerCase() !== 'shop') {
            // Redirect to login if not a shop user
            console.log('User is not a shop user, redirecting to login');
            localStorage.removeItem('currentUser');
            window.location.href = '/LoginPage/index.html';
            return;
        }
        
        console.log('Shop session validated successfully');
    } catch (error) {
        // Handle JSON parse error
        console.error('Error parsing user data:', error);
        localStorage.removeItem('currentUser');
        window.location.href = '/LoginPage/index.html';
    }
}); 
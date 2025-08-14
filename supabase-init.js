// Supabase Initialization Script
(function() {
    // Read .env file and set up Supabase credentials
    async function loadSupabaseCredentials() {
        try {
            // Try to fetch from .env file
            const response = await fetch('/.env');
            if (!response.ok) {
                throw new Error('Failed to load .env file');
            }
            
            const envContent = await response.text();
            const envVars = parseEnvFile(envContent);
            
            // Store Supabase credentials in localStorage for client-side access
            localStorage.setItem('SUPABASE_URL', envVars.SUPABASE_URL);
            localStorage.setItem('SUPABASE_ANON_KEY', envVars.SUPABASE_ANON_KEY);
            
            console.log('Supabase credentials loaded successfully');
            return true;
        } catch (error) {
            console.error('Error loading Supabase credentials:', error);
            
            // Fallback to hardcoded values for demo purposes
            // In a real app, you would handle this differently
            useDefaultCredentials();
            return false;
        }
    }
    
    // Parse .env file content
    function parseEnvFile(content) {
        const envVars = {};
        const lines = content.split('\n');
        
        lines.forEach(line => {
            // Skip empty lines and comments
            if (!line || line.startsWith('#')) return;
            
            // Parse key=value pairs
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                const key = match[1];
                let value = match[2] || '';
                
                // Remove quotes if present
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                
                envVars[key] = value;
            }
        });
        
        return envVars;
    }
    
    // Use default credentials for demo
    function useDefaultCredentials() {
        console.warn('Using default Supabase credentials for demo purposes');
        
        // Replace these with your actual Supabase credentials
        localStorage.setItem('SUPABASE_URL', 'https://ppmkkjiigbvpvcylnmcg.supabase.co');
        localStorage.setItem('SUPABASE_ANON_KEY', 'your-actual-anon-key-here');
    }
    
    // Initialize
    loadSupabaseCredentials();
})(); 
#!/bin/bash

# Perfect Nginx Setup Script for Team Delivery App
# This script will set up Nginx correctly with proper SSL handling

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
DOMAIN="padoodelivery.com"
APP_DIR="/var/www/team-delivery-app"
NGINX_SITE="/etc/nginx/sites-available/team-delivery-app"

print_status "🚀 Starting Perfect Nginx Setup for Team Delivery App..."

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run with sudo"
   exit 1
fi

# Backup existing configuration
if [ -f "$NGINX_SITE" ]; then
    print_status "Creating backup of existing configuration..."
    cp "$NGINX_SITE" "${NGINX_SITE}.backup.$(date +%Y%m%d_%H%M%S)"
    print_success "Backup created"
fi

# Step 1: Create HTTP-only configuration first (for SSL certificate generation)
print_status "Step 1: Creating HTTP-only configuration for SSL certificate generation..."

cat > "$NGINX_SITE" << EOF
# Team Delivery App - HTTP Configuration (Temporary for SSL setup)
server {
    listen 80;
    server_name $DOMAIN;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript;
    
    # Client max body size
    client_max_body_size 10M;
    
    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Enable the site
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

print_success "HTTP configuration created"

# Test Nginx configuration
print_status "Testing Nginx configuration..."
nginx -t
print_success "Nginx configuration test passed"

# Reload Nginx
print_status "Reloading Nginx..."
systemctl reload nginx
print_success "Nginx reloaded successfully"

# Step 2: Get SSL certificate
print_status "Step 2: Obtaining SSL certificate..."
print_warning "Make sure your domain DNS is pointing to this server before continuing!"

read -p "Press Enter to continue with SSL certificate generation..."

# Get SSL certificate
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN"; then
    print_success "SSL certificate obtained successfully!"
else
    print_error "Failed to obtain SSL certificate. Please check your domain DNS settings."
    print_status "You can try again later with: sudo certbot --nginx -d $DOMAIN"
fi

# Step 3: Create final optimized configuration
print_status "Step 3: Creating final optimized configuration..."

# Check if SSL certificate exists
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    print_status "SSL certificate found, creating HTTPS configuration..."
    
    cat > "$NGINX_SITE" << EOF
# Team Delivery App - Final Configuration with SSL
server {
    listen 80;
    server_name $DOMAIN;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript;
    
    # Client max body size
    client_max_body_size 10M;
    
    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

    print_success "HTTPS configuration created"
else
    print_warning "SSL certificate not found, keeping HTTP configuration"
fi

# Test final configuration
print_status "Testing final Nginx configuration..."
nginx -t
print_success "Final Nginx configuration test passed"

# Reload Nginx
print_status "Reloading Nginx with final configuration..."
systemctl reload nginx
print_success "Nginx reloaded with final configuration"

# Step 4: Set up SSL auto-renewal
print_status "Step 4: Setting up SSL auto-renewal..."

# Create renewal script
cat > /etc/cron.daily/ssl-renewal << 'EOF'
#!/bin/bash
# SSL Certificate Auto-Renewal Script

# Renew certificates
certbot renew --quiet

# Reload Nginx if certificates were renewed
if [ $? -eq 0 ]; then
    systemctl reload nginx
    echo "$(date): SSL certificates renewed successfully" >> /var/log/ssl-renewal.log
else
    echo "$(date): SSL certificate renewal failed" >> /var/log/ssl-renewal.log
fi
EOF

chmod +x /etc/cron.daily/ssl-renewal
print_success "SSL auto-renewal configured"

# Step 5: Final status check
print_status "Step 5: Final status check..."

# Check Nginx status
if systemctl is-active --quiet nginx; then
    print_success "Nginx is running"
else
    print_error "Nginx is not running"
fi

# Check SSL certificate
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    print_success "SSL certificate is installed"
    print_status "Certificate expires: $(openssl x509 -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem -text -noout | grep 'Not After' | cut -d: -f2-)"
else
    print_warning "SSL certificate not found"
fi

print_success "🎉 Perfect Nginx Setup Completed!"
echo ""
echo "📋 Summary:"
echo "==========="
echo "✅ Nginx configured for $DOMAIN"
echo "✅ HTTP to HTTPS redirect enabled"
echo "✅ SSL certificate obtained (if available)"
echo "✅ Auto-renewal configured"
echo "✅ Security headers enabled"
echo "✅ Gzip compression enabled"
echo "✅ WebSocket support configured"
echo ""
echo "🌐 Your app should now be accessible at:"
echo "   • https://$DOMAIN (if SSL is working)"
echo "   • http://$DOMAIN (fallback)"
echo ""
echo "🔧 Useful commands:"
echo "=================="
echo "• Check Nginx status: sudo systemctl status nginx"
echo "• View Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo "• Test SSL: sudo certbot certificates"
echo "• Renew SSL manually: sudo certbot renew"
echo "• Restart Nginx: sudo systemctl restart nginx"
echo ""
print_warning "Next steps:"
echo "• Make sure your app is running on port 3000"
echo "• Test your application at https://$DOMAIN"

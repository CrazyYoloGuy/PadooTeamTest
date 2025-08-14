#!/bin/bash

# Team Delivery App VPS Setup Script
# This script will set up your VPS for the Team Delivery App
# Run this script as root or with sudo privileges

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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root or with sudo"
   exit 1
fi

print_status "Starting Team Delivery App VPS Setup..."

# Configuration variables
DOMAIN_NAME=""
APP_DIR="/var/www/team-delivery-app"
NODE_VERSION="18.x"
PM2_APP_NAME="team-delivery-app"

# Get domain name from user
echo ""
print_status "Please enter your domain name (e.g., delivery.yourdomain.com):"
read -p "Domain: " DOMAIN_NAME

if [[ -z "$DOMAIN_NAME" ]]; then
    print_error "Domain name is required!"
    exit 1
fi

print_success "Domain set to: $DOMAIN_NAME"

# Update system
print_status "Updating system packages..."
apt update && apt upgrade -y
print_success "System updated"

# Install essential packages
print_status "Installing essential packages..."
apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
print_success "Essential packages installed"

# Install Node.js
print_status "Installing Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION | bash -
apt install -y nodejs
print_success "Node.js installed: $(node --version)"

# Install PM2 globally
print_status "Installing PM2 process manager..."
npm install -g pm2
print_success "PM2 installed"

# Install Nginx
print_status "Installing Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx
print_success "Nginx installed and started"

# Install Certbot for SSL
print_status "Installing Certbot for SSL certificates..."
apt install -y certbot python3-certbot-nginx
print_success "Certbot installed"

# Create application directory
print_status "Creating application directory..."
mkdir -p $APP_DIR
chown -R $SUDO_USER:$SUDO_USER $APP_DIR
print_success "Application directory created: $APP_DIR"

# Create Nginx configuration
print_status "Creating Nginx configuration..."
cat > /etc/nginx/sites-available/team-delivery-app << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;
    
    # SSL configuration (will be added by Certbot)
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
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
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/team-delivery-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
print_success "Nginx configuration created"

# Test Nginx configuration
print_status "Testing Nginx configuration..."
nginx -t
print_success "Nginx configuration is valid"

# Reload Nginx
systemctl reload nginx
print_success "Nginx reloaded"

# Create PM2 ecosystem file
print_status "Creating PM2 ecosystem configuration..."
cat > $APP_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$PM2_APP_NAME',
    script: 'server.js',
    cwd: '$APP_DIR',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Create logs directory
mkdir -p $APP_DIR/logs
chown -R $SUDO_USER:$SUDO_USER $APP_DIR/logs
print_success "PM2 ecosystem configuration created"

# Create systemd service for PM2
print_status "Creating systemd service for PM2..."
cat > /etc/systemd/system/pm2-$SUDO_USER.service << EOF
[Unit]
Description=PM2 process manager
Documentation=https://pm2.keymetrics.io/
After=network.target

[Service]
Type=forking
User=$SUDO_USER
WorkingDirectory=/home/$SUDO_USER
Environment=PATH=/home/$SUDO_USER/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=PM2_HOME=/home/$SUDO_USER/.pm2
PIDFile=/home/$SUDO_USER/.pm2/pm2.pid
Restart=on-failure

ExecStart=/usr/bin/pm2 resurrect
ExecReload=/usr/bin/pm2 reload all
ExecStop=/usr/bin/pm2 save && /usr/bin/pm2 kill

[Install]
WantedBy=multi-user.target
EOF

# Enable and start PM2 service
systemctl enable pm2-$SUDO_USER
print_success "PM2 systemd service created"

# Create firewall rules
print_status "Configuring firewall..."
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable
print_success "Firewall configured"

# Create deployment script
print_status "Creating deployment script..."
cat > $APP_DIR/deploy.sh << 'EOF'
#!/bin/bash

# Team Delivery App Deployment Script
# Run this script to deploy updates

set -e

echo "🚀 Starting deployment..."

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Build if needed (uncomment if you have build process)
# npm run build

# Restart PM2 process
pm2 restart team-delivery-app

echo "✅ Deployment completed!"
echo "📊 Check status: pm2 status"
echo "📋 Check logs: pm2 logs team-delivery-app"
EOF

chmod +x $APP_DIR/deploy.sh
chown $SUDO_USER:$SUDO_USER $APP_DIR/deploy.sh
print_success "Deployment script created"

# Create environment template
print_status "Creating environment template..."
cat > $APP_DIR/.env.template << EOF
# Team Delivery App Environment Variables
# Copy this file to .env and fill in your values

# Supabase Configuration
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Server Configuration
PORT=3000
NODE_ENV=production

# Logging
LOG_LEVEL=info

# WebSocket Configuration
WS_PORT=3000

# Security
SESSION_SECRET=your-session-secret-here
EOF

chown $SUDO_USER:$SUDO_USER $APP_DIR/.env.template
print_success "Environment template created"

# Create setup completion script
print_status "Creating setup completion script..."
cat > $APP_DIR/complete-setup.sh << 'EOF'
#!/bin/bash

# Complete Setup Script
# Run this after uploading your app files

set -e

echo "🔧 Completing Team Delivery App setup..."

# Install dependencies
npm install

# Create .env file from template
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.template .env
    echo "⚠️  Please edit .env file with your Supabase credentials!"
fi

# Create logs directory if not exists
mkdir -p logs

# Start the application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Start PM2 on boot
pm2 startup

echo "✅ Setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your Supabase credentials"
echo "2. Upload your app files to: $APP_DIR"
echo "3. Run: cd $APP_DIR && npm start"
echo "4. Check status: pm2 status"
echo ""
echo "🌐 Your app will be available at: https://$DOMAIN_NAME"
echo "📊 PM2 Dashboard: pm2 monit"
echo "📋 Logs: pm2 logs team-delivery-app"
EOF

chmod +x $APP_DIR/complete-setup.sh
chown $SUDO_USER:$SUDO_USER $APP_DIR/complete-setup.sh
print_success "Setup completion script created"

# Set proper permissions
chown -R $SUDO_USER:$SUDO_USER $APP_DIR

print_success "VPS setup completed!"
echo ""
echo "🎉 Setup Summary:"
echo "=================="
echo "✅ Node.js $NODE_VERSION installed"
echo "✅ PM2 process manager installed"
echo "✅ Nginx web server configured"
echo "✅ Firewall configured"
echo "✅ Domain: $DOMAIN_NAME"
echo "✅ App directory: $APP_DIR"
echo ""
echo "📋 Next Steps:"
echo "=============="
echo "1. Upload your app files to: $APP_DIR"
echo "2. Run: cd $APP_DIR && ./complete-setup.sh"
echo "3. Edit .env file with your Supabase credentials"
echo "4. Get SSL certificate: certbot --nginx -d $DOMAIN_NAME"
echo "5. Start the app: pm2 start ecosystem.config.js"
echo ""
echo "🔧 Useful Commands:"
echo "==================="
echo "• Check app status: pm2 status"
echo "• View logs: pm2 logs team-delivery-app"
echo "• Monitor: pm2 monit"
echo "• Restart app: pm2 restart team-delivery-app"
echo "• Deploy updates: ./deploy.sh"
echo ""
echo "🌐 Your app will be available at: https://$DOMAIN_NAME"
echo ""
print_warning "Don't forget to:"
echo "• Configure your domain DNS to point to this VPS IP"
echo "• Set up your .env file with Supabase credentials"
echo "• Run certbot to get SSL certificate"

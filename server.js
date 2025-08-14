// Load environment variables
require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const winston = require('winston');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// In-memory fallback store for categories when DB table is unavailable
let memoryCategories = [
    { id: 'cat-default', name: 'None', description: 'Uncategorized', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
];

// Configure Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'team-delivery-server' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// (deleted duplicate transfer endpoint; actual route is defined after app initialization)

// Create Express app
const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your-supabase-project-url' || supabaseKey === 'your-supabase-anon-key') {
    console.error('❌ Supabase configuration missing!');
    console.error('Please create a .env file with your Supabase credentials:');
    console.error('');
    console.error('SUPABASE_URL=your-actual-supabase-url');
    console.error('SUPABASE_ANON_KEY=your-actual-supabase-anon-key');
    console.error('SUPABASE_SERVICE_ROLE_KEY=your-actual-supabase-service-role-key');
    console.error('');
    console.error('You can find these in your Supabase project settings.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Initialize database tables
async function initializeDatabase() {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Check if orders table exists
        const { data, error } = await serviceClient
            .from('orders')
            .select('id')
            .limit(1);
        
        if (error) {
            if (error.code === '42P01') {
                logger.warn('⚠️ Orders table does not exist. Please run the SQL setup script in your Supabase dashboard.');
                logger.info('📋 SQL Setup: Copy and run the contents of CREATE_ORDERS_TABLE.sql in your Supabase SQL editor');
            } else {
                logger.error('❌ Error checking orders table:', error);
            }
        } else {
            logger.info('✅ Orders table exists and is accessible');
        }
        
    } catch (error) {
        logger.error('❌ Error initializing database:', error);
    }
}

// Check Supabase connection
async function checkSupabaseConnection() {
    try {
        const { data, error } = await supabase.from('user_registrations').select('count').limit(1);
        if (error) {
            logger.error('❌ Supabase connection error:', error);
        } else {
            logger.info('✅ Supabase connected successfully');
        }
    } catch (error) {
        logger.error('❌ Supabase connection failed:', error);
    }
}

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static('./'));
app.use(express.json());

// Store connected clients by role and user ID
const clients = {
    drivers: new Map(), // Map of driver ID -> WebSocket
    shops: new Map(),   // Map of shop ID -> WebSocket
    admin: new Set()    // Set of admin WebSockets
};

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    
    logger.info(`🔌 WebSocket client connected: ${clientId}`, {
        clientId,
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
    });

    // Wait for client to identify itself
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Handle client identification
            if (data.type === 'IDENTIFY') {
                const { role, userId } = data.payload;
                
                if (role && userId) {
                    // Check if user is already connected and disconnect them
                    switch (role) {
                        case 'driver':
                            const existingDriverWs = clients.drivers.get(userId);
                            if (existingDriverWs && existingDriverWs !== ws) {
                                // Send logout message to existing connection
                                if (existingDriverWs.readyState === WebSocket.OPEN) {
                                    existingDriverWs.send(JSON.stringify({
                                        type: 'FORCE_LOGOUT',
                                        payload: { reason: 'Account logged in elsewhere' }
                                    }));
                                }
                                existingDriverWs.close();
                            }
                            clients.drivers.set(userId, ws);
                            ws.role = 'driver';
                            ws.userId = userId;
                            logger.info(`🚚 Driver ${userId} connected`);
                            break;
                            
                        case 'shop':
                            const existingShopWs = clients.shops.get(userId);
                            if (existingShopWs && existingShopWs !== ws) {
                                // Send logout message to existing connection
                                if (existingShopWs.readyState === WebSocket.OPEN) {
                                    existingShopWs.send(JSON.stringify({
                                        type: 'FORCE_LOGOUT',
                                        payload: { reason: 'Account logged in elsewhere' }
                                    }));
                                }
                                existingShopWs.close();
                            }
                            clients.shops.set(userId, ws);
                            ws.role = 'shop';
                            ws.userId = userId;
                            logger.info(`🏪 Shop ${userId} connected`);
                            break;
                            
                        case 'admin':
                            clients.admin.add(ws);
                            ws.role = 'admin';
                            logger.info(`👨‍💼 Admin connected`);
                            break;
                            
                        default:
                            logger.warn(`⚠️ Unknown role: ${role}`);
                    }
                    
                    // Send confirmation
                    ws.send(JSON.stringify({
                        type: 'IDENTIFIED',
                        payload: { role, userId }
                    }));
                }
            }
            // Handle subscription to real-time updates
            else if (data.type === 'SUBSCRIBE') {
                const { channel } = data.payload;
                ws.channel = channel;
                logger.info(`📡 Client subscribed to channel: ${channel}`);
            }
            // Handle countdown started message
            else if (data.type === 'COUNTDOWN_STARTED') {
                logger.info('⏰ Countdown started:', data.payload);
                
                // Broadcast countdown started to all shops
                const countdownMessage = {
                    type: 'COUNTDOWN_STARTED',
                    payload: data.payload
                };
                
                clients.shops.forEach((shopWs, shopId) => {
                    if (shopWs.readyState === WebSocket.OPEN) {
                        shopWs.send(JSON.stringify(countdownMessage));
                    }
                });
                
                logger.info(`📡 Countdown started broadcasted to ${clients.shops.size} shops`);
            }
            // Handle countdown update message
            else if (data.type === 'COUNTDOWN_UPDATE') {
                logger.info('⏰ Countdown update:', data.payload);
                
                // Broadcast countdown update to all shops
                const countdownMessage = {
                    type: 'COUNTDOWN_UPDATE',
                    payload: data.payload
                };
                
                clients.shops.forEach((shopWs, shopId) => {
                    if (shopWs.readyState === WebSocket.OPEN) {
                        shopWs.send(JSON.stringify(countdownMessage));
                    }
                });
            }
        } catch (error) {
            logger.error('❌ Error processing WebSocket message:', error);
        }
    });

    // Handle client disconnect
    ws.on('close', () => {
        if (ws.role && ws.userId) {
            switch (ws.role) {
                case 'driver':
                    clients.drivers.delete(ws.userId);
                    logger.info(`🚚 Driver ${ws.userId} disconnected`);
                    break;
                case 'shop':
                    clients.shops.delete(ws.userId);
                    logger.info(`🏪 Shop ${ws.userId} disconnected`);
                    break;
                case 'admin':
                    clients.admin.delete(ws);
                    logger.info(`👨‍💼 Admin disconnected`);
                    break;
            }
        }
        
        logger.info(`🔌 WebSocket client disconnected: ${clientId}`);
    });

    // Handle errors
    ws.on('error', (error) => {
        logger.error(`❌ WebSocket error for client ${clientId}:`, error);
        
        if (ws.role && ws.userId) {
            switch (ws.role) {
                case 'driver':
                    clients.drivers.delete(ws.userId);
                    break;
                case 'shop':
                    clients.shops.delete(ws.userId);
                    break;
                case 'admin':
                    clients.admin.delete(ws);
                    break;
            }
        }
    });
});

// Supabase Webhook handler for real-time events
app.post('/api/webhook/supabase', async (req, res) => {
    try {
        const event = req.body;
        logger.info('📡 Supabase webhook received:', { type: event.type });
        
        // Process different event types
        switch (event.type) {
            case 'INSERT':
                if (event.table === 'orders') {
                    await handleNewOrder(event.record);
                } else if (event.table === 'notifications') {
                    await handleNewNotification(event.record);
                }
                break;
                
            case 'UPDATE':
                if (event.table === 'orders') {
                    await handleOrderUpdate(event.record, event.old_record);
                }
                break;
        }
        
        res.status(200).json({ success: true });
    } catch (error) {
        logger.error('❌ Error processing webhook:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle new order with improved error handling and retry logic
async function handleNewOrder(order) {
    logger.info('🆕 New order created:', { orderId: order.id });
    
    try {
        // Verify the order still exists and is available before notifying drivers
        const { data: orderCheck, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('id', order.id)
            .eq('status', 'pending')
            .is('driver_id', null)
            .single();
        
        if (orderError || !orderCheck) {
            logger.warn('⚠️ Order no longer available for drivers:', { orderId: order.id, error: orderError });
            return;
        }
    
    // Notify all available drivers
    const { data: drivers, error } = await supabaseAdmin
        .from('users')
        .select('user_id')
        .eq('role', 'driver')
        .eq('status', 'active');
    
    if (error) {
        logger.error('❌ Error fetching drivers:', error);
        return;
    }
    
        // Send notification to all available drivers with retry logic
        let notificationCount = 0;
    drivers.forEach(driver => {
        const ws = clients.drivers.get(driver.user_id);
        if (ws && ws.readyState === WebSocket.OPEN) {
                try {
            ws.send(JSON.stringify({
                type: 'NEW_ORDER_AVAILABLE',
                payload: {
                    order_id: order.id,
                    order_number: order.order_id,
                    customer_name: order.customer_name,
                    delivery_address: order.delivery_address,
                            amount: order.amount,
                            shop_name: order.shop_name || 'Shop'
                }
            }));
                    notificationCount++;
            logger.info(`📩 Sent new order notification to driver: ${driver.user_id}`);
                } catch (sendError) {
                    logger.error(`❌ Error sending notification to driver ${driver.user_id}:`, sendError);
                }
        }
    });
        
        logger.info(`📡 Notified ${notificationCount} drivers about new order: ${order.id}`);
    
    // Notify shop that created the order
        if (order.shop_id) {
    const shopWs = clients.shops.get(order.shop_id);
    if (shopWs && shopWs.readyState === WebSocket.OPEN) {
                try {
        shopWs.send(JSON.stringify({
            type: 'ORDER_CREATED',
            payload: {
                order_id: order.id,
                order_number: order.order_id,
                status: order.status
            }
        }));
        logger.info(`📩 Sent order creation confirmation to shop: ${order.shop_id}`);
                } catch (sendError) {
                    logger.error(`❌ Error sending confirmation to shop ${order.shop_id}:`, sendError);
                }
            }
        }
        
    } catch (error) {
        logger.error('❌ Error handling new order:', error);
        
        // Retry once after a short delay
        setTimeout(async () => {
            try {
                logger.info('🔄 Retrying new order notification...');
                await handleNewOrder(order);
            } catch (retryError) {
                logger.error('❌ Retry failed for new order notification:', retryError);
            }
        }, 2000);
    }
}

// Handle new notification
async function handleNewNotification(notification) {
    logger.info('🔔 New notification created:', { notificationId: notification.id });
    
    // Send notification to the target user
    const targetWs = clients.drivers.get(notification.user_id) || clients.shops.get(notification.user_id);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({
            type: 'NOTIFICATION',
            payload: notification
        }));
        logger.info(`📩 Sent notification to user: ${notification.user_id}`);
    }
}

// Handle order update with improved error handling and race condition prevention
async function handleOrderUpdate(order, oldOrder) {
    logger.info('🔄 Order updated:', { 
        orderId: order.id, 
        oldStatus: oldOrder.status, 
        newStatus: order.status 
    });
    
    try {
        // Verify the order still exists before sending updates
        const { data: orderCheck, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('id', order.id)
            .single();
        
        if (orderError || !orderCheck) {
            logger.warn('⚠️ Order no longer exists for update notification:', { orderId: order.id, error: orderError });
            return;
        }
    
    // Notify the assigned driver
    if (order.driver_id) {
        const driverWs = clients.drivers.get(order.driver_id);
        if (driverWs && driverWs.readyState === WebSocket.OPEN) {
                try {
            driverWs.send(JSON.stringify({
                type: 'ORDER_UPDATED',
                payload: {
                    order_id: order.id,
                    order_number: order.order_id,
                    status: order.status,
                            previous_status: oldOrder.status,
                            customer_name: order.customer_name,
                            delivery_address: order.delivery_address,
                            amount: order.amount
                }
            }));
            logger.info(`📩 Sent order update to driver: ${order.driver_id}`);
                } catch (sendError) {
                    logger.error(`❌ Error sending order update to driver ${order.driver_id}:`, sendError);
                }
        }
    }
    
    // Notify the shop that created the order
    if (order.shop_id) {
        const shopWs = clients.shops.get(order.shop_id);
        if (shopWs && shopWs.readyState === WebSocket.OPEN) {
                try {
            shopWs.send(JSON.stringify({
                type: 'ORDER_UPDATED',
                payload: {
                    order_id: order.id,
                    order_number: order.order_id,
                    status: order.status,
                    previous_status: oldOrder.status,
                            driver_id: order.driver_id,
                            customer_name: order.customer_name,
                            delivery_address: order.delivery_address,
                            amount: order.amount
                }
            }));
            logger.info(`📩 Sent order update to shop: ${order.shop_id}`);
                } catch (sendError) {
                    logger.error(`❌ Error sending order update to shop ${order.shop_id}:`, sendError);
                }
            }
        }
        
        // If order status changed to 'delivered', notify all drivers about completion
        if (order.status === 'delivered' && oldOrder.status !== 'delivered') {
            logger.info('✅ Order delivered, notifying all drivers');
            clients.drivers.forEach((ws, driverId) => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try {
                        ws.send(JSON.stringify({
                            type: 'ORDER_DELIVERED',
                            payload: {
                                order_id: order.id,
                                order_number: order.order_id,
                                driver_id: order.driver_id
                            }
                        }));
                    } catch (sendError) {
                        logger.error(`❌ Error sending delivery notification to driver ${driverId}:`, sendError);
                    }
                }
            });
        }
        
        // If order status changed to 'processing' and has delivery_date, broadcast countdown
        if (order.status === 'processing' && oldOrder.status !== 'processing' && order.delivery_date) {
            logger.info('⏰ Order processing with countdown, broadcasting to shops');
            
            // Broadcast countdown started to all shops
            const countdownMessage = {
                type: 'COUNTDOWN_STARTED',
                payload: {
                    order_id: order.order_id,
                    id: order.id,
                    delivery_date: order.delivery_date,
                    driver_id: order.driver_id,
                    customer_name: order.customer_name,
                    delivery_address: order.delivery_address,
                    amount: order.amount
                }
            };
            
            clients.shops.forEach((shopWs, shopId) => {
                if (shopWs.readyState === WebSocket.OPEN) {
                    try {
                        shopWs.send(JSON.stringify(countdownMessage));
                    } catch (sendError) {
                        logger.error(`❌ Error sending countdown to shop ${shopId}:`, sendError);
                    }
                }
            });
            
            logger.info(`📡 Countdown started broadcasted to ${clients.shops.size} shops`);
        }
        
    } catch (error) {
        logger.error('❌ Error handling order update:', error);
        
        // Retry once after a short delay
        setTimeout(async () => {
            try {
                logger.info('🔄 Retrying order update notification...');
                await handleOrderUpdate(order, oldOrder);
            } catch (retryError) {
                logger.error('❌ Retry failed for order update notification:', retryError);
            }
        }, 2000);
    }
}

// Broadcast message to specific role
function broadcastToRole(role, message) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    
    switch (role) {
        case 'driver':
            clients.drivers.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(messageStr);
                    sentCount++;
                }
            });
            break;
            
        case 'shop':
            clients.shops.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(messageStr);
                    sentCount++;
                }
            });
            break;
            
        case 'admin':
            clients.admin.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(messageStr);
                    sentCount++;
                }
            });
            break;
    }
    
    logger.info(`📡 Broadcasted message to ${sentCount} ${role}s:`, {
        type: message.type,
        clientCount: sentCount
    });
}

// Mock data for real-time updates
let dashboardData = {
    stats: {
        totalUsers: 40689,
        totalOrders: 10293,
        totalSales: 89000,
        pendingOrders: 2040
    },
    orders: [
        {
            id: 'ORD-001',
            customer: 'John Doe',
            product: 'Premium Package',
            amount: '$299.99',
            status: 'delivered',
            date: '2024-01-15'
        },
        {
            id: 'ORD-002',
            customer: 'Jane Smith',
            product: 'Express Delivery',
            amount: '$149.99',
            status: 'pending',
            date: '2024-01-14'
        },
        {
            id: 'ORD-003',
            customer: 'Mike Johnson',
            product: 'Standard Package',
            amount: '$199.99',
            status: 'processing',
            date: '2024-01-13'
        }
    ],
    notifications: []
};

// API Routes
app.get('/api/dashboard', (req, res) => {
    logger.info('📊 API: Dashboard data requested');
    res.json(dashboardData);
});

// NOTE: Removed legacy mock create-order endpoint to avoid shadowing the real DB-backed endpoint below.
// The real handler that persists to Supabase is defined later ("Create order (driver-created)").

app.put('/api/orders/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    logger.info('🔄 API: Order status updated', { orderId: id, newStatus: status });
    
    const updated = updateOrderStatus(id, status);
    if (updated) {
        res.json({ success: true, order: updated });
    } else {
        res.status(404).json({ success: false, message: 'Order not found' });
    }
});

// Registration Management API
app.get('/api/registrations', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('user_registrations')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            logger.error('❌ Error fetching registrations:', error);
            res.status(500).json({ success: false, message: 'Database error' });
        } else {
            logger.info('📋 API: Registrations fetched', { count: data.length });
            res.json({ success: true, registrations: data });
        }
    } catch (error) {
        logger.error('❌ Error in registrations API:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/registrations', async (req, res) => {
    const { username, password, full_name, phone, role } = req.body;
    
    try {
        // Insert into user_registrations table without user_id for now
        const { data, error } = await supabase
            .from('user_registrations')
            .insert([{
                username,
                full_name,
                phone,
                role,
                status: 'pending',
                password_hash: password // Store password temporarily (will be hashed later)
            }])
            .select();
        
        // If RLS error, try with service role
        if (error && error.message.includes('row-level security policy')) {
            logger.warn('RLS policy blocked insert, trying with service role...');
            
            // Create a new client with service role for this operation
            const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
            
            const { data: serviceData, error: serviceError } = await serviceClient
                .from('user_registrations')
                .insert([{
                    username,
                    full_name,
                    phone,
                    role,
                    status: 'pending',
                    password_hash: password
                }])
                .select();
            
            if (serviceError) {
                logger.error('❌ Service role insert also failed:', serviceError);
                res.status(500).json({ success: false, message: 'Registration creation error: ' + serviceError.message });
                return;
            }
            
            logger.info('✅ API: New registration created with service role', { id: serviceData[0].id, username });
            res.json({ success: true, id: serviceData[0].id });
            return;
        }
        
        if (error) {
            logger.error('❌ Error creating registration:', error);
            res.status(500).json({ success: false, message: 'Registration creation error: ' + error.message });
        } else {
            logger.info('✅ API: New registration created', { id: data[0].id, username });
            res.json({ success: true, id: data[0].id });
        }
    } catch (error) {
        logger.error('❌ Error in registration creation:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

app.put('/api/registrations/:id/accept', async (req, res) => {
    const { id } = req.params;
    
    console.log('Accepting registration with ID:', id);
    
    try {
        // Create service client first
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Get registration details
        const { data: registration, error: fetchError } = await serviceClient
            .from('user_registrations')
            .select('*')
            .eq('id', id)
            .single();
        
        if (fetchError || !registration) {
            logger.error('❌ Error fetching registration:', fetchError);
            res.status(404).json({ success: false, message: 'Registration not found' });
            return;
        }
        
        console.log('Found registration:', registration);
        
        // Check if user already exists
        const { data: existingUser, error: existingUserError } = await serviceClient
            .from('users')
            .select('*')
            .eq('username', registration.username)
            .single();
            
        if (existingUser) {
            logger.warn('⚠️ User already exists with this username:', registration.username);
            
            // Still update the registration status
            await serviceClient
                .from('user_registrations')
                .update({ 
                    status: 'accepted', 
                    processed_at: new Date().toISOString() 
                })
                .eq('id', id);
                
            res.json({ 
                success: true, 
                message: 'Registration accepted (user already exists)',
                userId: existingUser.id
            });
            return;
        }
        
        // Update registration status to accepted using service role
        const { error: updateError } = await serviceClient
            .from('user_registrations')
            .update({ 
                status: 'accepted', 
                processed_at: new Date().toISOString() 
            })
            .eq('id', id);
        
        if (updateError) {
            logger.error('❌ Error updating registration status:', updateError);
            res.status(500).json({ success: false, message: 'Status update error' });
            return;
        }
        
        // Create user with direct SQL to avoid any foreign key issues
        console.log('Creating user for:', registration.username);
        
        const { data: userData, error: userError } = await serviceClient
            .from('users')
            .insert([{
                username: registration.username,
                full_name: registration.full_name,
                phone: registration.phone,
                role: registration.role,
                status: 'active',
                user_id: crypto.randomUUID() // Generate UUID for new users
            }])
            .select();
        
        if (userError) {
            logger.error('❌ Error creating user account:', userError);
            console.error('Detailed user creation error:', userError);
            
            // If it's a foreign key constraint error, try without user_id
            if (userError.code === '23503') {
                console.log('Foreign key constraint error, trying without user_id...');
                const { data: userData2, error: userError2 } = await serviceClient
                    .from('users')
                    .insert([{
                        username: registration.username,
                        full_name: registration.full_name,
                        phone: registration.phone,
                        role: registration.role,
                        status: 'active'
                        // Don't include user_id to avoid FK constraint
                    }])
                    .select();
                
                if (userError2) {
                    logger.error('❌ Second attempt also failed:', userError2);
                    res.status(500).json({ success: false, message: 'User account creation error: ' + userError.message });
                    return;
                } else {
                    logger.info('✅ User created without user_id (will be updated later)');
                    res.json({ 
                        success: true, 
                        message: 'Registration accepted and user account created',
                        userId: userData2[0].id,
                        note: 'User ID will be assigned automatically'
                    });
                    return;
                }
            }
            
            // Try a more direct approach with RPC
            const { error: rpcError } = await serviceClient.rpc('create_user', {
                p_username: registration.username,
                p_full_name: registration.full_name,
                p_phone: registration.phone,
                p_role: registration.role
            });
            
            if (rpcError) {
                logger.error('❌ RPC user creation also failed:', rpcError);
                res.status(500).json({ success: false, message: 'User account creation error: ' + userError.message });
                return;
            }
            
            logger.info('✅ User created via RPC');
            
            res.json({ 
                success: true, 
                message: 'Registration accepted and user account created via RPC'
            });
            return;
        }
        
        logger.info('✅ API: Registration accepted and user account created', { 
            registrationId: id, 
            userId: userData[0].id,
            username: registration.username 
        });
        
        res.json({ 
            success: true, 
            message: 'Registration accepted and user account created',
            userId: userData[0].id
        });
        
    } catch (error) {
        logger.error('❌ Error in registration acceptance:', error);
        console.error('Detailed error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + (error.message || 'Unknown error'),
            error: error.toString()
        });
    }
});

app.put('/api/registrations/:id/reject', async (req, res) => {
    const { id } = req.params;
    
    console.log('Rejecting registration with ID:', id);
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        const { error } = await serviceClient
            .from('user_registrations')
            .update({ 
                status: 'rejected', 
                processed_at: new Date().toISOString() 
            })
            .eq('id', id);
        
        if (error) {
            logger.error('❌ Error rejecting registration:', error);
            res.status(500).json({ success: false, message: 'Rejection error' });
        } else {
            logger.info('❌ API: Registration rejected', { registrationId: id });
            res.json({ success: true, message: 'Registration rejected' });
        }
    } catch (error) {
        logger.error('❌ Error in registration rejection:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Users Management API
app.get('/api/users', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Debug the users table
        console.log('Attempting to fetch users from the database...');
        
        const { data, error } = await serviceClient
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            logger.error('❌ Error fetching users:', error);
            console.error('Detailed error:', error);
            res.status(500).json({ success: false, message: 'Database error: ' + error.message });
        } else {
            // If no users exist, check if we need to create a default admin
            if (!data || data.length === 0) {
                console.log('No users found, checking if we need to create default users...');
                
                // Create a default admin user if none exists
                const { data: adminData, error: adminError } = await serviceClient
                    .from('users')
                    .insert([{
                        username: 'admin',
                        full_name: 'Admin User',
                        phone: '1234567890',
                        role: 'admin',
                        status: 'active'
                    }])
                    .select();
                
                if (adminError) {
                    logger.error('❌ Error creating default admin:', adminError);
                } else {
                    logger.info('✅ Created default admin user');
                    data = adminData;
                }
            }
            
            logger.info('📋 API: Users fetched', { count: data ? data.length : 0 });
            res.json({ success: true, users: data || [] });
        }
    } catch (error) {
        logger.error('❌ Error in users API:', error);
        console.error('Detailed error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

app.get('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    
    console.log('Fetching user details for ID:', id);
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        const { data, error } = await serviceClient
            .from('users')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) {
            logger.error('❌ Error fetching user:', error);
            console.error('Detailed error:', error);
            
            // Try alternate query with different ID format
            const { data: altData, error: altError } = await serviceClient
                .from('users')
                .select('*')
                .eq('id', parseInt(id))
                .single();
                
            if (altError || !altData) {
                res.status(500).json({ success: false, message: 'Database error: ' + error.message });
                return;
            }
            
            logger.info('📋 API: User details fetched with alternate ID format', { userId: id });
            res.json({ success: true, user: altData });
            return;
        } else if (!data) {
            res.status(404).json({ success: false, message: 'User not found' });
        } else {
            logger.info('📋 API: User details fetched', { userId: id });
            res.json({ success: true, user: data });
        }
    } catch (error) {
        logger.error('❌ Error in user details API:', error);
        console.error('Detailed error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Update user
app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { full_name, username, phone, role, status, notes, category_id } = req.body;
    
    console.log('Updating user with ID:', id);
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Check if username is already taken by another user
        if (username) {
            const { data: existingUser, error: checkError } = await serviceClient
                .from('users')
                .select('id')
                .eq('username', username)
                .neq('id', id)
                .single();
                
            if (existingUser) {
                res.status(400).json({ success: false, message: 'Username is already taken' });
                return;
            }
        }
        
        // Update the user
        const updatePayload = {
            full_name,
            username,
            phone,
            role,
            status,
            notes,
            updated_at: new Date().toISOString()
        };
        if (typeof category_id !== 'undefined') {
            updatePayload.category_id = category_id; // may be null for non-shops
        }

        const { data, error } = await serviceClient
            .from('users')
            .update(updatePayload)
            .eq('id', id)
            .select();
        
        if (error) {
            logger.error('❌ Error updating user:', error);
            console.error('Detailed error:', error);
            
            // Try with parsed ID
            const { data: altData, error: altError } = await serviceClient
                .from('users')
                .update(updatePayload)
                .eq('id', parseInt(id))
                .select();
                
            if (altError) {
                res.status(500).json({ success: false, message: 'Database error: ' + error.message });
                return;
            }
            
            logger.info('✅ API: User updated with alternate ID format', { userId: id });
            res.json({ success: true, user: altData[0] });
            return;
        }
        
        logger.info('✅ API: User updated', { userId: id });
        res.json({ success: true, user: data[0] });
    } catch (error) {
        logger.error('❌ Error in user update API:', error);
        console.error('Detailed error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    
    console.log('Deleting user with ID:', id);
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Delete the user
        const { data, error } = await serviceClient
            .from('users')
            .delete()
            .eq('id', id);
        
        if (error) {
            logger.error('❌ Error deleting user:', error);
            console.error('Detailed error:', error);
            
            // Try with parsed ID
            const { error: altError } = await serviceClient
                .from('users')
                .delete()
                .eq('id', parseInt(id));
                
            if (altError) {
                res.status(500).json({ success: false, message: 'Database error: ' + error.message });
                return;
            }
        }
        
        logger.info('✅ API: User deleted', { userId: id });
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        logger.error('❌ Error in user delete API:', error);
        console.error('Detailed error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Categories API
app.get('/api/categories', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        const { data, error } = await serviceClient
            .from('categories')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            logger.warn('⚠️ Categories table not available or error, using memory store:', error.message);
            return res.json({ success: true, categories: memoryCategories });
        }
        res.json({ success: true, categories: data });
    } catch (e) {
        logger.warn('⚠️ Categories fallback due to exception:', e.message);
        res.json({ success: true, categories: memoryCategories });
    }
});

app.post('/api/categories', async (req, res) => {
    const { name, description } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        const { data, error } = await serviceClient
            .from('categories')
            .insert([{ name, description: description || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
            .select();
        if (error) {
            // memory fallback
            const item = { id: crypto.randomUUID(), name, description: description || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            memoryCategories.unshift(item);
            return res.json({ success: true, category: item, fallback: true });
        }
        res.json({ success: true, category: data[0] });
    } catch (e) {
        const item = { id: crypto.randomUUID(), name, description: description || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        memoryCategories.unshift(item);
        res.json({ success: true, category: item, fallback: true });
    }
});

app.put('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        const { data, error } = await serviceClient
            .from('categories')
            .update({ name, description: description || '', updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();
        if (error) {
            // memory fallback
            memoryCategories = memoryCategories.map(c => c.id === id ? { ...c, name, description, updated_at: new Date().toISOString() } : c);
            return res.json({ success: true, category: memoryCategories.find(c => c.id === id) || null, fallback: true });
        }
        res.json({ success: true, category: data[0] });
    } catch (e) {
        memoryCategories = memoryCategories.map(c => c.id === id ? { ...c, name, description, updated_at: new Date().toISOString() } : c);
        res.json({ success: true, category: memoryCategories.find(c => c.id === id) || null, fallback: true });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        const { error } = await serviceClient
            .from('categories')
            .delete()
            .eq('id', id);
        if (error) {
            // memory fallback
            memoryCategories = memoryCategories.filter(c => c.id !== id);
            return res.json({ success: true, fallback: true });
        }
        res.json({ success: true });
    } catch (e) {
        memoryCategories = memoryCategories.filter(c => c.id !== id);
        res.json({ success: true, fallback: true });
    }
});
// Helper functions
function addNewOrder() {
    const newOrder = {
        id: `ORD-${String(dashboardData.orders.length + 1).padStart(3, '0')}`,
        customer: generateRandomCustomer(),
        product: generateRandomProduct(),
        amount: `$${(Math.random() * 500 + 50).toFixed(2)}`,
        status: 'pending',
        date: new Date().toISOString().split('T')[0]
    };

    dashboardData.orders.unshift(newOrder);
    
    // Update stats
    dashboardData.stats.totalOrders++;
    dashboardData.stats.pendingOrders++;
    
    // Add notification
    const notification = {
        id: Date.now(),
        title: 'New Order',
        message: `Order ${newOrder.id} has been placed`,
        time: 'Just now',
        type: 'order'
    };
    dashboardData.notifications.unshift(notification);
    
    // Broadcast to all clients
    broadcastToClients({
        type: 'NEW_ORDER',
        data: {
            order: newOrder,
            stats: dashboardData.stats,
            notification: notification
        }
    });

    logger.info('🆕 New order added:', newOrder);
    return newOrder;
}

function updateOrderStatus(orderId, newStatus) {
    const order = dashboardData.orders.find(o => o.id === orderId);
    if (!order) {
        logger.warn(`⚠️ Order not found: ${orderId}`);
        return null;
    }

    const oldStatus = order.status;
    order.status = newStatus;

    // Update stats based on status change
    if (oldStatus === 'pending' && newStatus !== 'pending') {
        dashboardData.stats.pendingOrders--;
    } else if (oldStatus !== 'pending' && newStatus === 'pending') {
        dashboardData.stats.pendingOrders++;
    }

    // Add notification
    const notification = {
        id: Date.now(),
        title: 'Order Status Updated',
        message: `Order ${orderId} status changed to ${newStatus}`,
        time: 'Just now',
        type: 'status'
    };
    dashboardData.notifications.unshift(notification);

    // Broadcast to all clients
    broadcastToClients({
        type: 'ORDER_STATUS_UPDATED',
        data: {
            order: order,
            stats: dashboardData.stats,
            notification: notification
        }
    });

    logger.info('🔄 Order status updated:', { orderId, oldStatus, newStatus });
    return order;
}

// Broadcast to all clients
function broadcastToClients(message) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    // Broadcast to all drivers
    clients.drivers.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(messageStr);
            sentCount++;
        }
    });
    
    // Broadcast to all shops
    clients.shops.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(messageStr);
            sentCount++;
        }
    });
    
    // Broadcast to all admins
    clients.admin.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(messageStr);
            sentCount++;
        }
    });

    logger.info(`📡 Broadcasted message to ${sentCount} clients:`, {
        type: message.type,
        clientCount: sentCount
    });
}

// Utility functions
function generateRandomCustomer() {
    const customers = [
        'Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Wilson',
        'Emma Brown', 'Frank Miller', 'Grace Lee', 'Henry Taylor',
        'Ivy Chen', 'Jack Anderson', 'Kate Martinez', 'Liam O\'Connor'
    ];
    return customers[Math.floor(Math.random() * customers.length)];
}

function generateRandomProduct() {
    const products = [
        'Premium Package', 'Express Delivery', 'Standard Package',
        'Overnight Service', 'Same Day Delivery', 'International Shipping',
        'Bulk Order', 'Fragile Items', 'Temperature Controlled'
    ];
    return products[Math.floor(Math.random() * products.length)];
}

// Simulate real-time updates (DISABLED - using real orders now)
/*
setInterval(() => {
    // Randomly add new orders
    if (Math.random() < 0.3) { // 30% chance every 10 seconds
        addNewOrder();
    }

    // Randomly update order statuses
    if (Math.random() < 0.2) { // 20% chance every 10 seconds
        const pendingOrders = dashboardData.orders.filter(o => o.status === 'pending');
        if (pendingOrders.length > 0) {
            const randomOrder = pendingOrders[Math.floor(Math.random() * pendingOrders.length)];
            const newStatuses = ['processing', 'delivered'];
            const newStatus = newStatuses[Math.floor(Math.random() * newStatuses.length)];
            updateOrderStatus(randomOrder.id, newStatus);
        }
    }
}, 10000); // Every 10 seconds
*/

// Login API Endpoint
app.post('/api/login', async (req, res) => {
    const { username, password, role } = req.body;
    
    console.log('🔑 Login attempt:', { username, role, passwordLength: password ? password.length : 0 });
    
    if (!username || !password || !role) {
        console.log('❌ Login failed: Missing required fields');
        return res.status(400).json({ success: false, message: 'Username, password, and role are required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Get user from database
        console.log('🔍 Searching for user:', username);
        const { data: userData, error: userError } = await serviceClient
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (userError) {
            console.log('❌ User query error:', userError);
            logger.error('❌ Login error: User query error', { username, error: userError });
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        
        if (!userData) {
            console.log('❌ User not found:', username);
            logger.error('❌ Login error: User not found', { username });
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        
        console.log('✅ User found:', { id: userData.id, username: userData.username, role: userData.role });
        
        // For now, we're using a simple password check since we don't have proper auth
        // In a real app, we would use bcrypt to compare hashed passwords
        // Get registration data to check password
        console.log('🔍 Searching for registration data for:', username);
        const { data: regData, error: regError } = await serviceClient
            .from('user_registrations')
            .select('password_hash, username')
            .eq('username', username)
            .single();
            
        if (regError) {
            console.log('❌ Registration query error:', regError);
            logger.error('❌ Login error: Registration query error', { username, error: regError });
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        
        if (!regData) {
            console.log('❌ Registration data not found for:', username);
            logger.error('❌ Login error: Registration data not found', { username });
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        
        console.log('✅ Registration data found:', { username: regData.username });
        console.log('🔐 Password check:', { 
            provided: password, 
            stored: regData.password_hash,
            match: regData.password_hash === password 
        });
        
        // Simple password check - this is NOT secure and should be replaced with proper auth
        if (regData.password_hash !== password) {
            console.log('❌ Password mismatch for user:', username);
            logger.error('❌ Login error: Invalid password', { username });
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        
        // Check if role matches
        console.log('🔍 Role check:', { 
            provided: role.toLowerCase(), 
            actual: userData.role.toLowerCase(),
            match: userData.role.toLowerCase() === role.toLowerCase()
        });
        
        if (userData.role.toLowerCase() !== role.toLowerCase()) {
            console.log('❌ Role mismatch for user:', username);
            logger.error('❌ Login error: Role mismatch', { username, expectedRole: userData.role, providedRole: role });
            return res.status(401).json({ 
                success: false, 
                message: `This user is a ${userData.role}, not ${role}` 
            });
        }
        
        // Login successful
        console.log('🎉 Login successful for:', username);
        logger.info('✅ User logged in successfully', { username, role: userData.role });
        
        // Make sure we have a user_id (UUID) - generate one if missing
        if (!userData.user_id) {
            const newUuid = crypto.randomUUID();
            await serviceClient
                .from('users')
                .update({ user_id: newUuid })
                .eq('id', userData.id);
            userData.user_id = newUuid;
            console.log('Generated UUID for user:', userData.username, newUuid);
        }
        
        res.json({
            success: true,
            user: {
                id: userData.id,
                user_id: userData.user_id, // Include the UUID
                username: userData.username,
                full_name: userData.full_name,
                role: userData.role,
                status: userData.status,
                phone: userData.phone
            }
        });
    } catch (error) {
        console.error('❌ Unexpected login error:', error);
        logger.error('❌ Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Driver API Endpoints
app.get('/api/driver/orders', async (req, res) => {
    const { driverId } = req.query;
    
    if (!driverId) {
        return res.status(400).json({ success: false, message: 'Driver ID is required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Get driver's assigned orders
        const { data, error } = await serviceClient
            .from('orders')
            .select('*')
            .eq('driver_id', driverId)
            .in('status', ['pending', 'processing'])
            .order('order_date', { ascending: true });
        
        if (error) {
            logger.error('❌ Error fetching driver orders:', error);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        
        logger.info('📋 API: Driver orders fetched', { driverId, count: data.length });
        res.json({ success: true, orders: data });
    } catch (error) {
        logger.error('❌ Error in driver orders API:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// New endpoint to accept an order
app.post('/api/driver/orders/:orderId/accept', async (req, res) => {
    const { orderId } = req.params;
    const { driverId } = req.body;
    
    if (!orderId || !driverId) {
        return res.status(400).json({ success: false, message: 'Order ID and Driver ID are required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Call the RPC function to assign the order
        const { data, error } = await serviceClient.rpc('assign_order_to_driver', {
            order_id_param: orderId,
            driver_id_param: driverId
        });
        
        if (error) {
            logger.error('❌ Error accepting order:', error);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        
        logger.info('✅ API: Order accepted by driver', { orderId, driverId });
        res.json({ success: true, notificationId: data });
    } catch (error) {
        logger.error('❌ Error in order acceptance API:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// New endpoint to complete an order
app.post('/api/driver/orders/:orderId/complete', async (req, res) => {
    const { orderId } = req.params;
    const { driverId } = req.body;
    
    if (!orderId || !driverId) {
        return res.status(400).json({ success: false, message: 'Order ID and Driver ID are required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Update the order status
        const { data, error } = await serviceClient
            .from('orders')
            .update({ 
                status: 'delivered',
                delivery_date: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('driver_id', driverId)
            .select();
        
        if (error) {
            logger.error('❌ Error completing order:', error);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        
        logger.info('✅ API: Order completed by driver', { orderId, driverId });
        res.json({ success: true, order: data[0] });
    } catch (error) {
        logger.error('❌ Error in order completion API:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// New endpoint to create an order
app.post('/api/shop/orders', async (req, res) => {
    const { 
        customer_phone,
        delivery_address,
        amount,
        payment_method,
        notes,
        order_items
    } = req.body;
    
    const shopId = req.headers['x-user-id']; // Get shop ID from header
    
    if (!shopId) {
        return res.status(400).json({ success: false, message: 'Shop ID is required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Create the order directly in the orders table
        const { data, error } = await serviceClient
            .from('orders')
            .insert([{
                shop_id: shopId, // Keep as string (UUID)
                customer_name: null, // Set to null since it's now optional
                customer_phone: customer_phone,
                delivery_address: delivery_address,
                amount: parseFloat(amount),
                payment_method: payment_method,
                notes: notes || '',
                order_items: order_items || '[]',
                status: 'pending',
                order_id: `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
                product_name: 'Custom Order' // Add required product_name field
            }])
            .select()
            .single();
        
        if (error) {
            logger.error('❌ Error creating order:', error);
            return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
        }
        
        logger.info('✅ API: New order created by shop', { shopId, orderId: data.id });
        
        // Broadcast the new order to all drivers
        broadcastToRole('driver', {
            type: 'NEW_ORDER_AVAILABLE',
            payload: {
                order_id: data.id,
                order_number: data.order_id,
                customer_name: data.customer_name || 'Customer',
                delivery_address: data.delivery_address,
                amount: data.amount
            }
        });
        
        res.json({ success: true, orderId: data.id, order: data });
    } catch (error) {
        logger.error('❌ Error in order creation API:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Get orders for a shop
app.get('/api/shop/orders', async (req, res) => {
    const shopId = req.headers['x-user-id']; // Get shop ID from header
    
    if (!shopId) {
        return res.status(400).json({ success: false, message: 'Shop ID is required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Get orders created by this shop
        const { data: orders, error } = await serviceClient
            .from('orders')
            .select('*')
            .eq('shop_id', shopId)
            .order('created_at', { ascending: false });
        
        if (error) {
            logger.error('❌ Error fetching shop orders:', error);
            return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
        }
        
        logger.info('✅ API: Fetched orders for shop', { shopId, orderCount: orders.length });
        
        res.json({ success: true, orders: orders });
    } catch (error) {
        logger.error('❌ Error in shop orders API:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Get a specific order
app.get('/api/shop/orders/:id', async (req, res) => {
    const orderId = req.params.id;
    const shopId = req.headers['x-user-id']; // Get shop ID from header
    
    if (!shopId) {
        return res.status(400).json({ success: false, message: 'Shop ID is required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Get order details
        const { data: order, error } = await serviceClient
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .eq('shop_id', shopId)
            .single();
        
        if (error) {
            logger.error('❌ Error fetching order details:', error);
            return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
        }
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        logger.info('✅ API: Fetched order details', { shopId, orderId });
        
        res.json({ success: true, order });
    } catch (error) {
        logger.error('❌ Error in order details API:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Update an order
app.patch('/api/shop/orders/:id', async (req, res) => {
    const orderId = req.params.id;
    const shopId = req.headers['x-user-id']; // Get shop ID from header
    
    if (!shopId) {
        return res.status(400).json({ success: false, message: 'Shop ID is required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Check if order exists and belongs to this shop
        const { data: existingOrder, error: checkError } = await serviceClient
            .from('orders')
            .select('status, driver_id')
            .eq('id', orderId)
            .eq('shop_id', shopId)
            .single();
        
        if (checkError) {
            logger.error('❌ Error checking order:', checkError);
            return res.status(500).json({ success: false, message: 'Database error: ' + checkError.message });
        }
        
        if (!existingOrder) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Check if order is still pending
        if (existingOrder.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Only pending orders can be updated' });
        }
        
        // Check if order has been assigned to a driver
        if (existingOrder.driver_id) {
            return res.status(400).json({ success: false, message: 'Order has already been accepted by a driver and cannot be updated' });
        }
        
        // Update the order
        const { data, error } = await serviceClient
            .from('orders')
            .update(req.body)
            .eq('id', orderId)
            .eq('shop_id', shopId)
            .select();
        
        if (error) {
            logger.error('❌ Error updating order:', error);
            return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
        }
        
        logger.info('✅ API: Updated order', { shopId, orderId });
        
        res.json({ success: true, order: data[0] });
    } catch (error) {
        logger.error('❌ Error in order update API:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Delete an order
app.delete('/api/shop/orders/:id', async (req, res) => {
    const orderId = req.params.id;
    const shopId = req.headers['x-user-id']; // Get shop ID from header
    
    if (!shopId) {
        return res.status(400).json({ success: false, message: 'Shop ID is required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Check if order exists and belongs to this shop
        const { data: existingOrder, error: checkError } = await serviceClient
            .from('orders')
            .select('status, driver_id')
            .eq('id', orderId)
            .eq('shop_id', shopId)
            .single();
        
        if (checkError) {
            logger.error('❌ Error checking order:', checkError);
            return res.status(500).json({ success: false, message: 'Database error: ' + checkError.message });
        }
        
        if (!existingOrder) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Check if order is still pending
        if (existingOrder.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Only pending orders can be deleted' });
        }
        
        // Check if order has been assigned to a driver
        if (existingOrder.driver_id) {
            return res.status(400).json({ success: false, message: 'Order has already been accepted by a driver and cannot be deleted' });
        }
        
        // Delete the order
        const { error } = await serviceClient
            .from('orders')
            .delete()
            .eq('id', orderId)
            .eq('shop_id', shopId);
        
        if (error) {
            logger.error('❌ Error deleting order:', error);
            return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
        }
        
        logger.info('✅ API: Deleted order', { shopId, orderId });
        
        res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error) {
        logger.error('❌ Error in order delete API:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Debug endpoint for checking user credentials (ONLY FOR DEVELOPMENT)
app.get('/api/debug/user/:username', async (req, res) => {
    const { username } = req.params;
    
    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
    }
    
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Get user from database
        const { data: userData, error: userError } = await serviceClient
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
            
        // Get registration data
        const { data: regData, error: regError } = await serviceClient
            .from('user_registrations')
            .select('*')
            .eq('username', username)
            .single();
            
        res.json({
            success: true,
            user: userData || null,
            registration: regData ? {
                ...regData,
                password_hash: regData.password_hash ? `${regData.password_hash.substring(0, 3)}...` : null
            } : null,
            userError: userError ? userError.message : null,
            regError: regError ? regError.message : null
        });
    } catch (error) {
        console.error('Debug endpoint error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve the .env file for client-side initialization
app.get('/.env', (req, res) => {
    // Only expose the public variables
    const publicEnv = `SUPABASE_URL=${process.env.SUPABASE_URL || ''}
SUPABASE_ANON_KEY=${process.env.SUPABASE_ANON_KEY || ''}`;
    res.type('text/plain').send(publicEnv);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connectedClients: {
            drivers: clients.drivers.size,
            shops: clients.shops.size,
            admin: clients.admin.size,
            total: clients.drivers.size + clients.shops.size + clients.admin.size
        },
        uptime: process.uptime()
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    logger.info('🚀 Team Delivery Server started successfully!', {
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        service: 'team-delivery-server',
        timestamp: new Date().toISOString()
    });
    
    console.log('\n🎉 Team Delivery App is running!');
    console.log(`📱 Login page: http://localhost:${PORT}/LoginPage/`);
    console.log(`👨‍💼 Admin dashboard: http://localhost:${PORT}/AdminPage/`);
    console.log(`🚚 Driver app: http://localhost:${PORT}/DriverPage/`);
    console.log(`🏪 Shop app: http://localhost:${PORT}/ShopPage/`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`📊 API endpoint: http://localhost:${PORT}/api/dashboard`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
    console.log('\n📝 Logs are being written to logs/ directory');
    console.log('🔄 Real-time updates are active\n');
    
    // Initialize database tables
    await initializeDatabase();
    
    // Check Supabase connection
    await checkSupabaseConnection();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        logger.info('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('🛑 Received SIGINT, shutting down gracefully...');
    server.close(() => {
        logger.info('✅ Server closed');
        process.exit(0);
    });
}); 

// Transfer Management API Endpoints

// Get all drivers
app.get('/api/drivers', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Fetch drivers from users table where role is 'driver'
        const { data, error } = await serviceClient
            .from('users')
            .select('*')
            .eq('role', 'driver')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        
        if (error) {
            logger.error('❌ Error fetching drivers:', error);
            
            // Fallback to mock data if database query fails
            const mockDrivers = [
                { id: 1, name: 'John Smith', role: 'Driver', phone: '+1234567890', status: 'Active', totalOrders: 45, completedOrders: 42, pendingOrders: 3, earnings: 1250.50 },
                { id: 2, name: 'Mike Johnson', role: 'Driver', phone: '+1234567891', status: 'Active', totalOrders: 38, completedOrders: 35, pendingOrders: 3, earnings: 980.25 },
                { id: 3, name: 'Alex Brown', role: 'Driver', phone: '+1234567892', status: 'Active', totalOrders: 52, completedOrders: 50, pendingOrders: 2, earnings: 1450.75 },
                { id: 4, name: 'Sarah Wilson', role: 'Driver', phone: '+1234567893', status: 'Active', totalOrders: 29, completedOrders: 27, pendingOrders: 2, earnings: 720.00 },
                { id: 5, name: 'Chris Davis', role: 'Driver', phone: '+1234567894', status: 'Active', totalOrders: 41, completedOrders: 39, pendingOrders: 2, earnings: 1100.30 }
            ];
            
            logger.info('📋 API: Drivers fetched (mock data fallback)', { count: mockDrivers.length });
            res.json({ success: true, drivers: mockDrivers });
        } else {
            // Transform data to match expected format
            const drivers = data.map(driver => ({
                id: driver.user_id || driver.id, // Prefer UUID for cross-table consistency
                name: driver.full_name,
                role: 'Driver',
                phone: driver.phone || 'No phone',
                status: driver.status === 'active' ? 'Active' : 'Inactive',
                totalOrders: 0, // Will be calculated separately
                completedOrders: 0, // Will be calculated separately
                pendingOrders: 0, // Will be calculated separately
                earnings: 0 // Will be calculated separately
            }));
            
            logger.info('📋 API: Drivers fetched from database', { count: drivers.length });
            res.json({ success: true, drivers: drivers });
        }
    } catch (error) {
        logger.error('❌ Error in drivers API:', error);
        
        // Fallback to mock data if an exception occurs
        const mockDrivers = [
            { id: 1, name: 'John Smith', role: 'Driver', phone: '+1234567890', status: 'Active', totalOrders: 45, completedOrders: 42, pendingOrders: 3, earnings: 1250.50 },
            { id: 2, name: 'Mike Johnson', role: 'Driver', phone: '+1234567891', status: 'Active', totalOrders: 38, completedOrders: 35, pendingOrders: 3, earnings: 980.25 },
            { id: 3, name: 'Alex Brown', role: 'Driver', phone: '+1234567892', status: 'Active', totalOrders: 52, completedOrders: 50, pendingOrders: 2, earnings: 1450.75 },
            { id: 4, name: 'Sarah Wilson', role: 'Driver', phone: '+1234567893', status: 'Active', totalOrders: 29, completedOrders: 27, pendingOrders: 2, earnings: 720.00 },
            { id: 5, name: 'Chris Davis', role: 'Driver', phone: '+1234567894', status: 'Active', totalOrders: 41, completedOrders: 39, pendingOrders: 2, earnings: 1100.30 }
        ];
        
        logger.info('📋 API: Drivers fetched (mock data fallback after exception)', { count: mockDrivers.length });
        res.json({ success: true, drivers: mockDrivers });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test database connection and orders table
app.get('/api/test-db', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Test orders table
        const { data: ordersData, error: ordersError } = await serviceClient
            .from('orders')
            .select('count')
            .limit(1);
            
        // Test users table
        const { data: usersData, error: usersError } = await serviceClient
            .from('users')
            .select('count')
            .limit(1);
            
        const result = {
            orders: {
                accessible: !ordersError,
                error: ordersError?.message || null,
                count: ordersData?.length || 0
            },
            users: {
                accessible: !usersError,
                error: usersError?.message || null,
                count: usersData?.length || 0
            },
            timestamp: new Date().toISOString()
        };
        
        logger.info('🔍 Database test result:', result);
        res.json(result);
    } catch (error) {
        logger.error('❌ Database test error:', error);
        res.status(500).json({ 
            error: error.message, 
            timestamp: new Date().toISOString() 
        });
    }
});

// Debug endpoint to check orders and drivers
app.get('/api/debug-orders', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Get all orders with driver info
        const { data: orders, error: ordersError } = await serviceClient
            .from('orders')
            .select('id, order_id, driver_id, order_date, customer_name, status')
            .order('order_date', { ascending: false })
            .limit(20);
            
        // Get all drivers
        const { data: drivers, error: driversError } = await serviceClient
            .from('users')
            .select('id, user_id, full_name, username, role, status')
            .eq('role', 'driver')
            .eq('status', 'active');
            
        // Process orders to show date strings
        const processedOrders = orders ? orders.map(order => ({
            ...order,
            order_date_string: order.order_date ? order.order_date.split('T')[0] : null,
            order_date_full: order.order_date
        })) : [];
            
        const result = {
            orders: processedOrders,
            drivers: drivers || [],
            ordersError: ordersError?.message || null,
            driversError: driversError?.message || null,
            summary: {
                totalOrders: orders?.length || 0,
                totalDrivers: drivers?.length || 0,
                ordersWithDrivers: orders?.filter(o => o.driver_id)?.length || 0,
                ordersWithoutDrivers: orders?.filter(o => !o.driver_id)?.length || 0,
                uniqueDates: [...new Set(processedOrders.map(o => o.order_date_string))].filter(Boolean)
            }
        };
        
        logger.info('🔍 Debug orders result:', result.summary);
        res.json(result);
    } catch (error) {
        logger.error('❌ Debug orders error:', error);
        res.status(500).json({ 
            error: error.message, 
            timestamp: new Date().toISOString() 
        });
    }
});

// Test database connection and orders table
app.get('/api/test-db', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Test orders table
        const { data: ordersData, error: ordersError } = await serviceClient
            .from('orders')
            .select('count')
            .limit(1);
            
        // Test users table
        const { data: usersData, error: usersError } = await serviceClient
            .from('users')
            .select('count')
            .limit(1);
            
        const result = {
            orders: {
                accessible: !ordersError,
                error: ordersError?.message || null,
                count: ordersData?.length || 0
            },
            users: {
                accessible: !usersError,
                error: usersError?.message || null,
                count: usersData?.length || 0
            },
            timestamp: new Date().toISOString()
        };
        
        logger.info('🔍 Database test result:', result);
        res.json(result);
    } catch (error) {
        logger.error('❌ Database test error:', error);
        res.status(500).json({ 
            error: error.message, 
            timestamp: new Date().toISOString() 
        });
    }
});

// List all drivers with their IDs
app.get('/api/list-drivers', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Get all drivers
        const { data: allDrivers, error: driversError } = await serviceClient
            .from('users')
            .select('*')
            .eq('role', 'driver')
            .eq('status', 'active');
            
        const result = {
            totalDrivers: allDrivers?.length || 0,
            driversError: driversError?.message || null,
            drivers: allDrivers?.map(d => ({
                id: d.id,
                user_id: d.user_id,
                full_name: d.full_name,
                username: d.username,
                phone: d.phone
            })) || []
        };
        
        logger.info('🔍 List drivers result:', result);
        res.json(result);
    } catch (error) {
        logger.error('❌ List drivers error:', error);
        res.status(500).json({ 
            error: error.message, 
            timestamp: new Date().toISOString() 
        });
    }
});

// Simple endpoint to check if there are any orders at all
app.get('/api/check-orders', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Get all orders
        const { data: allOrders, error: allError } = await serviceClient
            .from('orders')
            .select('*')
            .order('order_date', { ascending: false })
            .limit(10);
            
        // Get all drivers
        const { data: allDrivers, error: driversError } = await serviceClient
            .from('users')
            .select('*')
            .eq('role', 'driver')
            .eq('status', 'active');
            
        const result = {
            totalOrders: allOrders?.length || 0,
            totalDrivers: allDrivers?.length || 0,
            ordersError: allError?.message || null,
            driversError: driversError?.message || null,
            sampleOrders: allOrders?.slice(0, 5).map(o => ({
                id: o.id,
                order_id: o.order_id,
                driver_id: o.driver_id,
                order_date: o.order_date,
                customer_name: o.customer_name
            })) || [],
            sampleDrivers: allDrivers?.slice(0, 5).map(d => ({
                id: d.id,
                user_id: d.user_id,
                full_name: d.full_name,
                username: d.username
            })) || []
        };
        
        logger.info('🔍 Check orders result:', result);
        res.json(result);
    } catch (error) {
        logger.error('❌ Check orders error:', error);
        res.status(500).json({ 
            error: error.message, 
            timestamp: new Date().toISOString() 
        });
    }
});

// Test endpoint to debug order fetching
app.get('/api/test-order-fetch', async (req, res) => {
    try {
        const { driverId, date } = req.query;
        
        if (!driverId || !date) {
            return res.status(400).json({ 
                success: false, 
                message: 'Driver ID and date are required',
                example: '/api/test-order-fetch?driverId=5&date=2025-01-15'
            });
        }
        
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // First, resolve the driver ID to get the correct UUID
        let actualDriverId = driverId;
        
        // Try to find the driver by ID or user_id
        const { data: driverData, error: driverError } = await serviceClient
            .from('users')
            .select('id, user_id')
            .eq('role', 'driver')
            .eq('status', 'active')
            .or(`id.eq.${driverId},user_id.eq.${driverId}`);
        
        if (!driverError && driverData && driverData.length > 0) {
            // Use the UUID (user_id) instead of the numeric ID
            actualDriverId = driverData[0].user_id || driverData[0].id || driverId;
            logger.info('✅ Found driver in users table for test:', { originalId: driverId, actualId: actualDriverId });
        } else {
            // If not found by ID, try to find by the driver's name or other fields
            logger.info('🔍 Driver not found by ID for test, trying to find by name or other criteria');
            
            // Get all active drivers to see what's available
            const { data: allDrivers, error: allDriversError } = await serviceClient
                .from('users')
                .select('id, user_id, full_name, username')
                .eq('role', 'driver')
                .eq('status', 'active');
                
            if (!allDriversError && allDrivers && allDrivers.length > 0) {
                logger.info('📋 Available drivers for test:', allDrivers.map(d => ({ id: d.id, user_id: d.user_id, name: d.full_name || d.username })));
                
                // Use the UUID (user_id) as fallback, not the numeric ID
                actualDriverId = allDrivers[0].user_id || allDrivers[0].id;
                logger.info('🔄 Using first available driver UUID as fallback for test:', { fallbackId: actualDriverId });
            }
        }
        
        // Test 1: Get all orders for this driver
        const { data: allDriverOrders, error: allError } = await serviceClient
            .from('orders')
            .select('*')
            .eq('driver_id', actualDriverId)
            .order('order_date', { ascending: false });
            
        // Test 2: Get all orders for this date
        const { data: allDateOrders, error: dateError } = await serviceClient
            .from('orders')
            .select('*')
            .gte('order_date', date + 'T00:00:00')
            .lt('order_date', date + 'T23:59:59.999')
            .order('order_date', { ascending: false });
            
        // Test 3: Get orders for this driver and date
        const { data: specificOrders, error: specificError } = await serviceClient
            .from('orders')
            .select('*')
            .eq('driver_id', actualDriverId)
            .gte('order_date', date + 'T00:00:00')
            .lt('order_date', date + 'T23:59:59.999')
            .order('order_date', { ascending: false });
            
        const result = {
            driverId,
            actualDriverId,
            date,
            allDriverOrders: allDriverOrders?.length || 0,
            allDateOrders: allDateOrders?.length || 0,
            specificOrders: specificOrders?.length || 0,
            errors: {
                allDriver: allError?.message || null,
                allDate: dateError?.message || null,
                specific: specificError?.message || null
            },
            sampleDriverOrders: allDriverOrders?.slice(0, 3).map(o => ({
                id: o.id,
                driver_id: o.driver_id,
                order_date: o.order_date,
                order_date_string: o.order_date ? o.order_date.split('T')[0] : null
            })) || [],
            sampleDateOrders: allDateOrders?.slice(0, 3).map(o => ({
                id: o.id,
                driver_id: o.driver_id,
                order_date: o.order_date,
                order_date_string: o.order_date ? o.order_date.split('T')[0] : null
            })) || []
        };
        
        logger.info('🔍 Test order fetch result:', result);
        res.json(result);
    } catch (error) {
        logger.error('❌ Test order fetch error:', error);
        res.status(500).json({ 
            error: error.message, 
            timestamp: new Date().toISOString() 
        });
    }
});

// Get driver orders for a specific date
app.get('/api/driver-orders', async (req, res) => {
    try {
        const { driverId, date } = req.query;
        
        if (!driverId || !date) {
            return res.status(400).json({ success: false, message: 'Driver ID and date are required' });
        }
        
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Parse the date to get start and end of day - try multiple approaches
        const selectedDate = new Date(date + 'T00:00:00.000Z');
        const startOfDay = new Date(selectedDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        
        // Also create date range using just the date string (YYYY-MM-DD)
        const dateOnly = date; // e.g., "2025-01-15"
        const nextDate = new Date(selectedDate);
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        const nextDateString = nextDate.toISOString().split('T')[0]; // e.g., "2025-01-16"
        
        logger.info('🔍 Searching for orders with driver_id:', { driverId, date, startOfDay: startOfDay.toISOString(), endOfDay: endOfDay.toISOString() });
        
        // First, try to find the driver in the users table to get the correct ID format
        let actualDriverId = driverId;
        
        // Try to find the driver by ID or user_id
        const { data: driverData, error: driverError } = await serviceClient
            .from('users')
            .select('id, user_id')
            .eq('role', 'driver')
            .eq('status', 'active')
            .or(`id.eq.${driverId},user_id.eq.${driverId}`);
        
        if (!driverError && driverData && driverData.length > 0) {
            // Use the UUID (user_id) instead of the numeric ID
            actualDriverId = driverData[0].user_id || driverData[0].id || driverId;
            logger.info('✅ Found driver in users table:', { originalId: driverId, actualId: actualDriverId });
        } else {
            // If not found by ID, try to find by the driver's name or other fields
            logger.info('🔍 Driver not found by ID, trying to find by name or other criteria');
            
            // Get all active drivers to see what's available
            const { data: allDrivers, error: allDriversError } = await serviceClient
                .from('users')
                .select('id, user_id, full_name, username')
                .eq('role', 'driver')
                .eq('status', 'active');
                
            if (!allDriversError && allDrivers && allDrivers.length > 0) {
                logger.info('📋 Available drivers:', allDrivers.map(d => ({ id: d.id, user_id: d.user_id, name: d.full_name || d.username })));
                
                // Use the UUID (user_id) as fallback, not the numeric ID
                actualDriverId = allDrivers[0].user_id || allDrivers[0].id;
                logger.info('🔄 Using first available driver UUID as fallback:', { fallbackId: actualDriverId });
            }
        }
        
        // Fetch orders for the driver on the specific date
        let { data, error } = await serviceClient
            .from('orders')
            .select('*')
            .eq('driver_id', actualDriverId)
            .gte('order_date', startOfDay.toISOString())
            .lt('order_date', endOfDay.toISOString())
            .order('order_date', { ascending: false });
            
        // If no data found, try with a more flexible date range (same day in local timezone)
        if ((!data || data.length === 0) && !error) {
            logger.info('🔍 No orders found with UTC date range, trying local date range');
            
            // Create date range for the same day in local timezone
            const localStartOfDay = new Date(date + 'T00:00:00');
            const localEndOfDay = new Date(date + 'T23:59:59.999');
            
            const { data: localData, error: localError } = await serviceClient
                .from('orders')
                .select('*')
                .eq('driver_id', actualDriverId)
                .gte('order_date', localStartOfDay.toISOString())
                .lt('order_date', localEndOfDay.toISOString())
                .order('order_date', { ascending: false });
                
            logger.info('🔍 Local date range query result:', { 
                driverId: actualDriverId, 
                dataCount: localData?.length || 0, 
                error: localError?.message || null,
                dateRange: {
                    start: localStartOfDay.toISOString(),
                    end: localEndOfDay.toISOString(),
                    selectedDate: date
                }
            });
            
            if (!localError && localData && localData.length > 0) {
                data = localData;
                error = null;
                logger.info('✅ Found orders with local date range:', { count: data.length });
            }
        }
            
        logger.info('🔍 First query result:', { 
            driverId: actualDriverId, 
            dataCount: data?.length || 0, 
            error: error?.message || null,
            dateRange: {
                start: startOfDay.toISOString(),
                end: endOfDay.toISOString(),
                selectedDate: date
            }
        });
            
        // If no data found, try with the original driverId as string
        if ((!data || data.length === 0) && !error) {
            logger.info('🔍 No orders found with actual ID, trying with original ID as string');
            const { data: stringData, error: stringError } = await serviceClient
                .from('orders')
                .select('*')
                .eq('driver_id', String(driverId))
                .gte('order_date', startOfDay.toISOString())
                .lt('order_date', endOfDay.toISOString())
                .order('order_date', { ascending: false });
                
            logger.info('🔍 String ID query result:', { 
                driverId: String(driverId), 
                dataCount: stringData?.length || 0, 
                error: stringError?.message || null 
            });
                
            if (!stringError && stringData && stringData.length > 0) {
                data = stringData;
                error = null;
                logger.info('✅ Found orders with string ID:', { count: data.length });
            }
        }
        
        // If still no data, try with string ID and local date range
        if ((!data || data.length === 0) && !error) {
            logger.info('🔍 No orders found with string ID and UTC range, trying local date range');
            
            const localStartOfDay = new Date(date + 'T00:00:00');
            const localEndOfDay = new Date(date + 'T23:59:59.999');
            
            const { data: stringLocalData, error: stringLocalError } = await serviceClient
                .from('orders')
                .select('*')
                .eq('driver_id', String(driverId))
                .gte('order_date', localStartOfDay.toISOString())
                .lt('order_date', localEndOfDay.toISOString())
                .order('order_date', { ascending: false });
                
            logger.info('🔍 String ID with local date range result:', { 
                driverId: String(driverId), 
                dataCount: stringLocalData?.length || 0, 
                error: stringLocalError?.message || null 
            });
                
            if (!stringLocalError && stringLocalData && stringLocalData.length > 0) {
                data = stringLocalData;
                error = null;
                logger.info('✅ Found orders with string ID and local date range:', { count: data.length });
            }
        }
        
        // If still no data, try with string date filtering (YYYY-MM-DD format)
        if ((!data || data.length === 0) && !error) {
            logger.info('🔍 No orders found with time-based ranges, trying string date filtering');
            
            // Get all orders for the driver and filter by date string
            const { data: allDriverOrders, error: allOrdersError } = await serviceClient
                .from('orders')
                .select('*')
                .eq('driver_id', actualDriverId)
                .order('order_date', { ascending: false });
                
            if (!allOrdersError && allDriverOrders && allDriverOrders.length > 0) {
                // Filter orders by date string (YYYY-MM-DD)
                const filteredOrders = allDriverOrders.filter(order => {
                    if (!order.order_date) return false;
                    const orderDateString = order.order_date.split('T')[0]; // Get YYYY-MM-DD part
                    return orderDateString === date;
                });
                
                logger.info('🔍 String date filtering result:', { 
                    totalDriverOrders: allDriverOrders.length,
                    filteredOrders: filteredOrders.length,
                    selectedDate: date,
                    sampleOrderDates: allDriverOrders.slice(0, 3).map(o => o.order_date?.split('T')[0])
                });
                
                if (filteredOrders.length > 0) {
                    data = filteredOrders;
                    error = null;
                    logger.info('✅ Found orders with string date filtering:', { count: data.length });
                }
            }
        }
        
        // If still no data, try with string ID and string date filtering
        if ((!data || data.length === 0) && !error) {
            logger.info('🔍 No orders found with actual ID, trying string ID with string date filtering');
            
            // Get all orders for the driver using string ID and filter by date string
            const { data: allDriverOrders, error: allOrdersError } = await serviceClient
                .from('orders')
                .select('*')
                .eq('driver_id', String(driverId))
                .order('order_date', { ascending: false });
                
            if (!allOrdersError && allDriverOrders && allDriverOrders.length > 0) {
                // Filter orders by date string (YYYY-MM-DD)
                const filteredOrders = allDriverOrders.filter(order => {
                    if (!order.order_date) return false;
                    const orderDateString = order.order_date.split('T')[0]; // Get YYYY-MM-DD part
                    return orderDateString === date;
                });
                
                logger.info('🔍 String ID with string date filtering result:', { 
                    totalDriverOrders: allDriverOrders.length,
                    filteredOrders: filteredOrders.length,
                    selectedDate: date,
                    sampleOrderDates: allDriverOrders.slice(0, 3).map(o => o.order_date?.split('T')[0])
                });
                
                if (filteredOrders.length > 0) {
                    data = filteredOrders;
                    error = null;
                    logger.info('✅ Found orders with string ID and string date filtering:', { count: data.length });
                }
            }
        }
        
        // If still no data, try without date filtering to see if there are any orders for this driver
        if ((!data || data.length === 0) && !error) {
            logger.info('🔍 No orders found with date filter, checking if driver has any orders at all');
            const { data: allDriverOrders, error: allOrdersError } = await serviceClient
                .from('orders')
                .select('*')
                .eq('driver_id', actualDriverId)
                .order('order_date', { ascending: false });
                
            if (!allOrdersError && allDriverOrders && allDriverOrders.length > 0) {
                logger.info('✅ Driver has orders but none for the selected date:', { 
                    totalOrders: allDriverOrders.length, 
                    selectedDate: date,
                    sampleOrderDates: allDriverOrders.slice(0, 3).map(o => o.order_date)
                });
                
                // Don't return orders if they don't match the selected date
                // Only return empty array to show "No Available Orders"
                logger.info('❌ No orders found for the selected date, returning empty array');
                data = [];
                error = null;
            } else {
                logger.info('❌ Driver has no orders at all');
            }
        }
        
        // If still no data, try to get all orders for the date (without driver filter) to see if there are any orders at all
        if ((!data || data.length === 0) && !error) {
            logger.info('🔍 No orders found for driver, checking if there are any orders for this date at all');
            const { data: allDateOrders, error: allDateError } = await serviceClient
                .from('orders')
                .select('*')
                .gte('order_date', startOfDay.toISOString())
                .lt('order_date', endOfDay.toISOString())
                .order('order_date', { ascending: false });
                
            if (!allDateError && allDateOrders && allDateOrders.length > 0) {
                logger.info('✅ There are orders for this date but not for this driver:', { 
                    totalOrders: allDateOrders.length, 
                    selectedDate: date,
                    sampleOrderDates: allDateOrders.slice(0, 3).map(o => o.order_date),
                    sampleDriverIds: allDateOrders.slice(0, 3).map(o => o.driver_id)
                });
            } else {
                logger.info('❌ No orders exist for this date at all');
            }
        }
        
        // Debug: Check all orders in database to see their driver_id values
        if ((!data || data.length === 0) && !error) {
            logger.info('🔍 Debug: Checking all orders in database to see driver_id values');
            const { data: allOrders, error: allOrdersError } = await serviceClient
                .from('orders')
                .select('id, order_id, driver_id, order_date, customer_name')
                .order('order_date', { ascending: false })
                .limit(10);
                
            if (!allOrdersError && allOrders) {
                logger.info('📋 Sample orders in database:', allOrders.map(o => ({
                    id: o.id,
                    order_id: o.order_id,
                    driver_id: o.driver_id,
                    order_date: o.order_date,
                    order_date_string: o.order_date ? o.order_date.split('T')[0] : null,
                    customer_name: o.customer_name
                })));
            }
        }
        
        if (error) {
            logger.error('❌ Error fetching driver orders:', error);
            
            // Return empty array with a special flag for no orders
            res.json({ 
                success: true, 
                orders: [], 
                message: 'Error fetching orders from database',
                noOrders: true 
            });
        } else if (!data || data.length === 0) {
            logger.info('📋 API: No orders found for driver on date', { driverId, date });
            
            // Return empty array with a special flag for no orders
            res.json({ 
                success: true, 
                orders: [], 
                message: 'No orders found for this date',
                noOrders: true 
            });
        } else {
            logger.info('📋 API: Driver orders fetched from database', { driverId, date, count: data.length });
            res.json({ success: true, orders: data });
        }
    } catch (error) {
        logger.error('❌ Error in driver orders API:', error);
        
        // Return empty array with a special flag for no orders
        res.json({ 
            success: true, 
            orders: [], 
            message: 'Error loading orders. Please try again.',
            noOrders: true 
        });
    }
});

// Insert sample orders for testing (only for development)
app.post('/api/insert-sample-orders', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Get today's date
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // First, get a real driver ID from the database
        const { data: drivers, error: driversError } = await serviceClient
            .from('users')
            .select('id, user_id')
            .eq('role', 'driver')
            .eq('status', 'active')
            .limit(2);
            
        if (driversError || !drivers || drivers.length === 0) {
            logger.error('❌ No drivers found in database');
            return res.status(400).json({ success: false, message: 'No drivers found in database' });
        }
        
        const driverId1 = drivers[0].user_id || drivers[0].id;
        const driverId2 = drivers.length > 1 ? (drivers[1].user_id || drivers[1].id) : driverId1;
        
        logger.info('✅ Using driver IDs for sample orders:', { driverId1, driverId2 });
        
        // Sample orders for testing
        const sampleOrders = [
            {
                order_id: 'ORD-001',
                customer_name: 'John Doe',
                customer_phone: '1234567890',
                product_name: 'Pizza',
                amount: 25.50,
                status: 'pending',
                order_date: today.toISOString(),
                delivery_date: tomorrow.toISOString(),
                driver_id: driverId1,
                delivery_address: '123 Main St, City, State',
                payment_method: 'cash'
            },
            {
                order_id: 'ORD-002',
                customer_name: 'Jane Smith',
                customer_phone: '0987654321',
                product_name: 'Burger',
                amount: 18.75,
                status: 'delivered',
                order_date: today.toISOString(),
                delivery_date: today.toISOString(),
                driver_id: driverId1,
                delivery_address: '456 Oak Ave, City, State',
                payment_method: 'card'
            },
            {
                order_id: 'ORD-003',
                customer_name: 'Mike Johnson',
                customer_phone: '5551234567',
                product_name: 'Sushi',
                amount: 32.00,
                status: 'processing',
                order_date: today.toISOString(),
                delivery_date: tomorrow.toISOString(),
                driver_id: driverId2,
                delivery_address: '789 Pine Rd, City, State',
                payment_method: 'cash'
            }
        ];
        
        const { data, error } = await serviceClient
            .from('orders')
            .insert(sampleOrders)
            .select();
            
        if (error) {
            logger.error('❌ Error inserting sample orders:', error);
            res.status(500).json({ success: false, message: 'Failed to insert sample orders', error: error.message });
        } else {
            logger.info('✅ Sample orders inserted successfully:', { count: data.length });
            res.json({ success: true, message: 'Sample orders inserted successfully', orders: data });
        }
    } catch (error) {
        logger.error('❌ Error in insert sample orders API:', error);
        res.status(500).json({ success: false, message: 'Error inserting sample orders' });
    }
});

// Get driver statistics
app.get('/api/driver-stats', async (req, res) => {
    try {
        const { driverId } = req.query;
        
        if (!driverId) {
            return res.status(400).json({ success: false, message: 'Driver ID is required' });
        }
        
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // First, try to find the driver in the users table to get the correct ID format
        let actualDriverId = driverId;
        
        // Try to find the driver by ID or user_id
        const { data: driverData, error: driverError } = await serviceClient
            .from('users')
            .select('id, user_id')
            .eq('role', 'driver')
            .eq('status', 'active')
            .or(`id.eq.${driverId},user_id.eq.${driverId}`);
        
        if (!driverError && driverData && driverData.length > 0) {
            // Use the UUID (user_id) instead of the numeric ID
            actualDriverId = driverData[0].user_id || driverData[0].id || driverId;
            logger.info('✅ Found driver in users table for stats:', { originalId: driverId, actualId: actualDriverId });
        } else {
            // If not found by ID, try to find by the driver's name or other fields
            logger.info('🔍 Driver not found by ID for stats, trying to find by name or other criteria');
            
            // Get all active drivers to see what's available
            const { data: allDrivers, error: allDriversError } = await serviceClient
                .from('users')
                .select('id, user_id, full_name, username')
                .eq('role', 'driver')
                .eq('status', 'active');
                
            if (!allDriversError && allDrivers && allDrivers.length > 0) {
                logger.info('📋 Available drivers for stats:', allDrivers.map(d => ({ id: d.id, user_id: d.user_id, name: d.full_name || d.username })));
                
                // Use the UUID (user_id) as fallback, not the numeric ID
                actualDriverId = allDrivers[0].user_id || allDrivers[0].id;
                logger.info('🔄 Using first available driver UUID as fallback for stats:', { fallbackId: actualDriverId });
            }
        }
        
        // Fetch driver statistics from the database using the resolved driver ID
        const { data: totalOrders, error: totalError } = await serviceClient
            .from('orders')
            .select('id, status')
            .eq('driver_id', actualDriverId);
        
        logger.info('🔍 Fetching driver stats with resolved ID:', { originalId: driverId, actualId: actualDriverId });
        
        if (totalError) {
            logger.error('❌ Error fetching driver stats:', totalError);
            
            // Return mock data
            const mockStats = {
                totalOrders: Math.floor(5 + Math.random() * 20),
                completedOrders: Math.floor(3 + Math.random() * 15)
            };
            
            logger.info('📊 API: Driver stats fetched (mock data)', { driverId, actualDriverId, stats: mockStats });
            res.json({ success: true, ...mockStats });
        } else {
            const totalOrdersCount = totalOrders ? totalOrders.length : 0;
            const completedOrdersCount = totalOrders ? totalOrders.filter(order => order.status === 'delivered').length : 0;
            
            const stats = {
                totalOrders: totalOrdersCount,
                completedOrders: completedOrdersCount
            };
            
            logger.info('📊 API: Driver stats fetched from database', { driverId, actualDriverId, stats });
            res.json({ success: true, ...stats });
        }
    } catch (error) {
        logger.error('❌ Error in driver stats API:', error);
        
        // Return mock data as fallback
        const mockStats = {
            totalOrders: Math.floor(5 + Math.random() * 20),
            completedOrders: Math.floor(3 + Math.random() * 15)
        };
        
        logger.info('📊 API: Driver stats fetched (mock data fallback)', { driverId: req.query.driverId, stats: mockStats });
        res.json({ success: true, ...mockStats });
    }
});

// Transfer an order to another driver (must be after app/supabase init)
app.post('/api/transfer-order', async (req, res) => {
    try {
        const { orderId, fromDriverId, toDriverId } = req.body || {};
        if (!orderId || !toDriverId) {
            return res.status(400).json({ success: false, message: 'orderId and toDriverId are required' });
        }

        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);

        // Update the order's driver_id only
        const { data: updated, error: updateError } = await serviceClient
            .from('orders')
            .update({ driver_id: toDriverId, updated_at: new Date().toISOString(), assigned_at: new Date().toISOString() })
            .eq('id', orderId)
            .select();

        if (updateError) {
            logger.error('❌ Transfer update error:', updateError);
            return res.status(500).json({ success: false, message: 'Failed to transfer order' });
        }

        if (!updated || updated.length === 0) {
            logger.warn('⚠️ Transfer attempted but order not found', { orderId });
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Log action to admin_actions (best-effort)
        try {
            await serviceClient
                .from('admin_actions')
                .insert({
                    action_type: 'transfer',
                    target_id: orderId,
                    details: { fromDriverId, toDriverId },
                    created_at: new Date().toISOString()
                });
        } catch (logErr) {
            logger.warn('⚠️ Failed to log admin action for transfer:', logErr?.message || logErr);
        }

        logger.info('✅ Order transferred', { orderId, fromDriverId, toDriverId });
        res.json({ success: true, order: updated[0] });
    } catch (error) {
        logger.error('❌ Error in transfer-order API:', error);
        res.status(500).json({ success: false, message: 'Error transferring order' });
    }
});

// Get all orders
app.get('/api/orders', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Fetch all orders from the database
        const { data, error } = await serviceClient
            .from('orders')
            .select('*')
            .order('order_date', { ascending: false });
        
        if (error) {
            logger.error('❌ Error fetching orders:', error);
            
            // Fallback to mock data
            const mockOrders = [];
            for (let i = 0; i < 10; i++) {
                mockOrders.push({
                    id: `mock-order-${i+1}`,
                    order_id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
                    customer_name: getRandomName(),
                    driver_name: `Driver ${i+1}`,
                    amount: (10 + Math.random() * 90).toFixed(2),
                    status: getRandomOrderStatus(),
                    order_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
                    driver_id: `driver-${i+1}`
                });
            }
            
            logger.info('📋 API: Orders fetched (mock data fallback)', { count: mockOrders.length });
            res.json({ success: true, orders: mockOrders });
        } else {
            logger.info('📋 API: Orders fetched from database', { count: data.length });
            res.json({ success: true, orders: data });
        }
    } catch (error) {
        logger.error('❌ Error in orders API:', error);
        
        // Fallback to mock data
        const mockOrders = [];
        for (let i = 0; i < 10; i++) {
            mockOrders.push({
                id: `mock-order-${i+1}`,
                order_id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
                customer_name: getRandomName(),
                driver_name: `Driver ${i+1}`,
                amount: (10 + Math.random() * 90).toFixed(2),
                status: getRandomOrderStatus(),
                order_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
                driver_id: `driver-${i+1}`
            });
        }
        
        logger.info('📋 API: Orders fetched (mock data fallback after exception)', { count: mockOrders.length });
        res.json({ success: true, orders: mockOrders });
    }
});

// Create order (driver-created)
app.post('/api/orders', async (req, res) => {
    try {
        if (!supabaseServiceKey) {
            logger.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY: cannot insert orders with service role');
            return res.status(500).json({ success: false, message: 'Server missing service role key' });
        }
        const payload = req.body || {};
        // Normalize values
        const driverId = payload.driver_id || (req.headers['x-user-id'] || null);
        const amountNum = payload.amount === undefined || payload.amount === null || payload.amount === ''
            ? 0
            : Number(payload.amount);
        // Normalize phone: keep only digits; ensure 10 digits for NOT NULL constraint
        let phone = (payload.customer_phone || '').toString().replace(/\D/g, '').slice(0, 10);
        if (phone.length !== 10) phone = '0000000000';
        const insertPayload = {
            order_id: payload.order_id || `DRV-${Date.now()}`,
            customer_name: payload.customer_name || null,
            customer_phone: phone,
            amount: isNaN(amountNum) ? 0 : amountNum,
            status: payload.status || 'processing',
            order_date: payload.order_date || new Date().toISOString(),
            delivery_date: payload.delivery_date || null,
            driver_id: driverId,
            // orders.shop_id is uuid; if client sent a numeric id, drop it
            shop_id: (payload.shop_id && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(payload.shop_id)) ? payload.shop_id : null,
            delivery_address: payload.delivery_address || '',
            notes: payload.notes || null,
            assigned_at: payload.assigned_at || new Date().toISOString(),
            // Note: orders table does not have category_id in this schema, so we ignore it.
        };

        const { data, error } = await supabaseAdmin.from('orders').insert([insertPayload]).select();
        if (error || !data || !data.length) {
            logger.error('❌ Error creating order:', error);
            return res.status(500).json({ success: false, message: error?.message || 'Failed to create order' });
        }
        const created = data[0];

        // Optionally create a driver_history row so history renders immediately
        try {
            if (created && created.id && created.driver_id) {
                const historyInsert = {
                    driver_id: created.driver_id,
                    order_id: created.id,
                    order_number: created.order_id,
                    customer_name: created.customer_name || null,
                    delivery_address: created.delivery_address || '',
                    amount: created.amount || 0,
                    status: created.status === 'delivered' ? 'completed' : 'accepted',
                    completed_at: created.status === 'delivered' ? (created.delivery_date || created.updated_at || new Date().toISOString()) : null,
                    accepted_at: created.assigned_at || created.created_at || new Date().toISOString()
                };
                const { data: hist, error: histErr } = await supabaseAdmin
                    .from('driver_history')
                    .upsert(historyInsert, { onConflict: 'order_id,driver_id' })
                    .select();
                if (histErr) {
                    logger.warn('⚠️ Failed to upsert driver_history for created order:', histErr.message);
                    return res.json({ success: true, order: created, history: null, historyError: histErr.message });
                }
                return res.json({ success: true, order: created, history: hist ? hist[0] : null });
            }
        } catch (hErr) {
            logger.warn('⚠️ driver_history upsert exception:', hErr.message);
            return res.json({ success: true, order: created, history: null, historyError: hErr.message });
        }

        res.json({ success: true, order: created });
    } catch (e) {
        logger.error('❌ Error in create order API:', e);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get all schedules
app.get('/api/schedules', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Fetch all schedules from the database (if schedule table exists)
        const { data, error } = await serviceClient
            .from('schedules')
            .select('*')
            .order('date', { ascending: false });
        
        if (error) {
            logger.error('❌ Error fetching schedules:', error);
            
            // Fallback to mock data
            const mockSchedules = [];
            for (let i = 0; i < 5; i++) {
                mockSchedules.push({
                    id: `mock-schedule-${i+1}`,
                    date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString(),
                    driver_name: `Driver ${i+1}`,
                    driver_id: `driver-${i+1}`,
                    order_count: Math.floor(3 + Math.random() * 8),
                    status: ['Active', 'Pending', 'Completed'][Math.floor(Math.random() * 3)]
                });
            }
            
            logger.info('📅 API: Schedules fetched (mock data fallback)', { count: mockSchedules.length });
            res.json({ success: true, schedules: mockSchedules });
        } else {
            logger.info('📅 API: Schedules fetched from database', { count: data.length });
            res.json({ success: true, schedules: data });
        }
    } catch (error) {
        logger.error('❌ Error in schedules API:', error);
        
        // Fallback to mock data
        const mockSchedules = [];
        for (let i = 0; i < 5; i++) {
            mockSchedules.push({
                id: `mock-schedule-${i+1}`,
                date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString(),
                driver_name: `Driver ${i+1}`,
                driver_id: `driver-${i+1}`,
                order_count: Math.floor(3 + Math.random() * 8),
                status: ['Active', 'Pending', 'Completed'][Math.floor(Math.random() * 3)]
            });
        }
        
        logger.info('📅 API: Schedules fetched (mock data fallback after exception)', { count: mockSchedules.length });
        res.json({ success: true, schedules: mockSchedules });
    }
});

// Get dashboard statistics
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const serviceClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
        
        // Get total drivers
        const { data: drivers, error: driversError } = await serviceClient
            .from('users')
            .select('id', { count: 'exact' })
            .eq('role', 'driver')
            .eq('status', 'active');
        
        // Get total orders
        const { data: orders, error: ordersError } = await serviceClient
            .from('orders')
            .select('id', { count: 'exact' });
        
        // Get transfers today (from admin_actions table)
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        
        const { data: transfers, error: transfersError } = await serviceClient
            .from('admin_actions')
            .select('id', { count: 'exact' })
            .eq('action_type', 'transfer')
            .gte('created_at', startOfDay.toISOString())
            .lt('created_at', endOfDay.toISOString());
        
        if (driversError || ordersError || transfersError) {
            logger.error('❌ Error fetching dashboard stats:', { driversError, ordersError, transfersError });
            
            // Fallback to mock data
            const mockStats = {
                totalDrivers: 5,
                totalOrders: 205,
                totalTransfers: 3
            };
            
            logger.info('📊 API: Dashboard stats fetched (mock data fallback)', mockStats);
            res.json({ success: true, ...mockStats });
        } else {
            const stats = {
                totalDrivers: drivers?.length || 0,
                totalOrders: orders?.length || 0,
                totalTransfers: transfers?.length || 0
            };
            
            logger.info('📊 API: Dashboard stats fetched from database', stats);
            res.json({ success: true, ...stats });
        }
    } catch (error) {
        logger.error('❌ Error in dashboard stats API:', error);
        
        // Fallback to mock data
        const mockStats = {
            totalDrivers: 5,
            totalOrders: 205,
            totalTransfers: 3
        };
        
        logger.info('📊 API: Dashboard stats fetched (mock data fallback after exception)', mockStats);
        res.json({ success: true, ...mockStats });
    }
});

// Helper functions for generating mock data
function getRandomName() {
    const firstNames = ['John', 'Jane', 'Michael', 'Emily', 'David', 'Sarah', 'Robert', 'Lisa'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson'];
    
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
}

function getRandomAddress() {
    const streets = ['Main St', 'Oak Ave', 'Maple Rd', 'Park Blvd', 'Cedar Ln', 'Pine Dr', 'Elm St', 'Washington Ave'];
    const cities = ['Springfield', 'Riverdale', 'Oakwood', 'Maplewood', 'Fairview', 'Lakeside'];
    
    const streetNum = Math.floor(100 + Math.random() * 900);
    const street = streets[Math.floor(Math.random() * streets.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    
    return `${streetNum} ${street}, ${city}`;
}

function getRandomOrderStatus() {
    const statuses = ['Pending', 'Processing', 'Completed'];
    const weights = [0.3, 0.3, 0.4]; // Weighted probability
    
    const random = Math.random();
    let sum = 0;
    
    for (let i = 0; i < statuses.length; i++) {
        sum += weights[i];
        if (random <= sum) {
            return statuses[i];
        }
    }
    
    return statuses[0];
}

// Get Supabase configuration
app.get('/api/config', (req, res) => {
    try {
        // Check if Supabase URL and key are available in environment
        if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your-supabase-project-url') {
            return res.status(500).json({ 
                success: false, 
                message: 'Supabase configuration not available' 
            });
        }
        
        // Return Supabase configuration
        res.json({
            success: true,
            config: {
                supabaseUrl: supabaseUrl,
                supabaseAnonKey: supabaseKey
            }
        });
        logger.info('✅ API: Supabase configuration fetched');
    } catch (error) {
        logger.error('❌ Error fetching Supabase configuration:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}); 
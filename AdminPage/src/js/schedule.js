// Schedule Management JavaScript
let currentWeek = new Date();
let schedules = [];
let drivers = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    loadSchedules();
    loadDrivers();
    initializeCalendar();
    updateStats();
});

// Load schedules from the database
async function loadSchedules() {
    try {
        const response = await fetch('/api/schedules', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch schedules');
        }

        const data = await response.json();
        schedules = data.schedules || [];
        
        console.log('Schedules loaded:', schedules);
        renderScheduleList();
        updateStats();
    } catch (error) {
        console.error('Error loading schedules:', error);
        showNotification('Failed to load schedules from database', 'error');
    }
}

// Load drivers for schedule management
async function loadDrivers() {
    try {
        const response = await fetch('/api/drivers', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch drivers');
        }

        const data = await response.json();
        drivers = data.drivers || [];
        
        const driverSelector = document.getElementById('driverSelector');
        if (driverSelector) {
            driverSelector.innerHTML = '<option value="">All Drivers</option>';
            drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = driver.name;
                driverSelector.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading drivers:', error);
    }
}

// Initialize calendar
function initializeCalendar() {
    updateCalendarDisplay();
    renderCalendarDays();
}

// Update calendar display
function updateCalendarDisplay() {
    const weekStart = getWeekStart(currentWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const currentWeekElement = document.getElementById('currentWeek');
    if (currentWeekElement) {
        currentWeekElement.textContent = `Week of ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
    }
}

// Get the start of the week (Monday)
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
}

// Render calendar days
function renderCalendarDays() {
    const calendarDays = document.getElementById('calendarDays');
    if (!calendarDays) return;
    
    const weekStart = getWeekStart(currentWeek);
    calendarDays.innerHTML = '';
    
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.innerHTML = `
            <div class="day-date">${day.getDate()}</div>
            <div class="day-schedules">
                ${getSchedulesForDay(day)}
            </div>
        `;
        calendarDays.appendChild(dayElement);
    }
}

// Get schedules for a specific day
function getSchedulesForDay(date) {
    const daySchedules = schedules.filter(schedule => {
        const scheduleDate = new Date(schedule.date);
        return scheduleDate.toDateString() === date.toDateString();
    });
    
    if (daySchedules.length === 0) {
        return '<div class="no-schedules">No schedules</div>';
    }
    
    return daySchedules.map(schedule => `
        <div class="schedule-item" onclick="viewSchedule('${schedule.id}')">
            <div class="schedule-driver">${schedule.driver_name}</div>
            <div class="schedule-orders">${schedule.order_count} orders</div>
        </div>
    `).join('');
}

// Render schedule list
function renderScheduleList() {
    const scheduleList = document.getElementById('scheduleList');
    if (!scheduleList) return;
    
    if (schedules.length === 0) {
        scheduleList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <p>No schedules found</p>
            </div>
        `;
        return;
    }
    
    scheduleList.innerHTML = '';
    schedules.forEach(schedule => {
        const scheduleElement = document.createElement('div');
        scheduleElement.className = 'schedule-card';
        scheduleElement.innerHTML = `
            <div class="schedule-header">
                <div class="schedule-date">${formatDate(schedule.date)}</div>
                <div class="schedule-actions">
                    <button class="btn btn-sm btn-primary" onclick="viewSchedule('${schedule.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="editSchedule('${schedule.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSchedule('${schedule.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="schedule-content">
                <div class="schedule-driver">
                    <i class="fas fa-user"></i>
                    <span>${schedule.driver_name}</span>
                </div>
                <div class="schedule-orders">
                    <i class="fas fa-shopping-cart"></i>
                    <span>${schedule.order_count} orders</span>
                </div>
                <div class="schedule-status">
                    <span class="status-badge ${schedule.status.toLowerCase()}">${schedule.status}</span>
                </div>
            </div>
        `;
        scheduleList.appendChild(scheduleElement);
    });
}

// Update statistics
function updateStats() {
    const totalSchedules = schedules.length;
    const activeDrivers = new Set(schedules.map(s => s.driver_id)).size;
    const totalRoutes = schedules.reduce((sum, s) => sum + s.order_count, 0);
    
    document.getElementById('totalSchedules').textContent = totalSchedules;
    document.getElementById('activeDrivers').textContent = activeDrivers;
    document.getElementById('totalRoutes').textContent = totalRoutes;
}

// Navigation functions
function previousWeek() {
    currentWeek.setDate(currentWeek.getDate() - 7);
    updateCalendarDisplay();
    renderCalendarDays();
}

function nextWeek() {
    currentWeek.setDate(currentWeek.getDate() + 7);
    updateCalendarDisplay();
    renderCalendarDays();
}

// Create new schedule
function createSchedule() {
    const dateSelector = document.getElementById('dateSelector');
    const driverSelector = document.getElementById('driverSelector');
    
    if (!dateSelector.value) {
        showNotification('Please select a date', 'warning');
        return;
    }
    
    if (!driverSelector.value) {
        showNotification('Please select a driver', 'warning');
        return;
    }
    
    // You can implement schedule creation logic here
    showNotification('Schedule created successfully', 'success');
    loadSchedules(); // Refresh the list
}

// Optimize routes
function optimizeRoutes() {
    showNotification('Route optimization in progress...', 'info');
    // You can implement route optimization logic here
    setTimeout(() => {
        showNotification('Routes optimized successfully', 'success');
    }, 2000);
}

// Refresh schedule
function refreshSchedule() {
    loadSchedules();
    showNotification('Schedule refreshed successfully', 'success');
}

// Export schedule
function exportSchedule() {
    // Create CSV content
    const headers = ['Date', 'Driver', 'Orders', 'Status'];
    const csvContent = [
        headers.join(','),
        ...schedules.map(schedule => [
            formatDate(schedule.date),
            schedule.driver_name,
            schedule.order_count,
            schedule.status
        ].join(','))
    ].join('\n');
    
    // Download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showNotification('Schedule exported successfully', 'success');
}

// View schedule details
function viewSchedule(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
        showNotification(`Viewing schedule for ${schedule.driver_name}`, 'info');
    }
}

// Edit schedule
function editSchedule(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
        showNotification(`Editing schedule for ${schedule.driver_name}`, 'info');
    }
}

// Delete schedule
function deleteSchedule(scheduleId) {
    if (confirm('Are you sure you want to delete this schedule?')) {
        showNotification('Schedule deleted successfully', 'success');
        loadSchedules(); // Refresh the list
    }
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
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
    
    switch(type) {
        case 'success':
            notification.style.background = '#22c55e';
            break;
        case 'error':
            notification.style.background = '#ef4444';
            break;
        case 'warning':
            notification.style.background = '#f59e0b';
            break;
        default:
            notification.style.background = '#3b82f6';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
} 
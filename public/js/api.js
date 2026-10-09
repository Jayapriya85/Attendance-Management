/**
 * SS40 NETWORK SMART ATTENDANCE - API SERVICE CLIENT
 * Handles all HTTP requests, authentication tokens, and toast alerts
 */

class ApiService {
  constructor() {
    this.baseUrl = '';
    this.token = localStorage.getItem('ss40_admin_token') || null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('ss40_admin_token', token);
    } else {
      localStorage.removeItem('ss40_admin_token');
    }
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    options.headers = { ...this.getHeaders(), ...options.headers };
    try {
      const res = await fetch(endpoint, options);
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      return { ok: false, status: 0, data: { success: false, message: 'Network connection error. Please check server.' } };
    }
  }

  // Auth
  async login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async verifyAuth() {
    return this.request('/api/auth/verify');
  }

  // Settings
  async getSettings() {
    return this.request('/api/settings');
  }

  async updateSettings(settings) {
    return this.request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  // Employees
  async getEmployees(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/api/employees${q ? '?' + q : ''}`);
  }

  async getEmployeeById(id) {
    return this.request(`/api/employees/${encodeURIComponent(id)}`);
  }

  async createEmployee(employeeData) {
    return this.request('/api/employees', {
      method: 'POST',
      body: JSON.stringify(employeeData)
    });
  }

  async updateEmployee(id, employeeData) {
    return this.request(`/api/employees/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(employeeData)
    });
  }

  async toggleEmployeeStatus(id) {
    return this.request(`/api/employees/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  // Attendance Punch
  async punchAttendance(barcodeOrId, coords, method = 'CAMERA_BARCODE') {
    return this.request('/api/attendance/punch', {
      method: 'POST',
      body: JSON.stringify({
        barcodeOrId,
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        accuracy: coords ? coords.accuracy : null,
        method
      })
    });
  }

  // Today Overview & Logs
  async getTodayOverview() {
    return this.request('/api/attendance/today');
  }

  async getAttendanceLogs(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/api/attendance${q ? '?' + q : ''}`);
  }

  async getAttendanceStats() {
    return this.request('/api/attendance/stats');
  }

  // Toast System
  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    if (type === 'error') {
      toast.style.borderLeftColor = '#EF4444';
    } else if (type === 'success') {
      toast.style.borderLeftColor = '#10B981';
    }

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

window.apiService = new ApiService();

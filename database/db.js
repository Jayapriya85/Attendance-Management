/**
 * SS40 NETWORK SMART ATTENDANCE — DATABASE CONNECTOR & ADAPTER
 * Dual-Mode Engine:
 * 1. Supabase PostgreSQL (Cloud Live Mode when credentials provided in .env)
 * 2. Persistent Local Store (data/db.json fallback for immediate local execution)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let supabase = null;
let isSupabaseActive = false;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http') && !supabaseUrl.includes('your-project-id')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    isSupabaseActive = true;
    console.log(`[Database] Supabase client initialized for: ${supabaseUrl}`);
  } catch (err) {
    console.error('[Database] Failed to initialize Supabase client:', err.message);
    isSupabaseActive = false;
  }
} else {
  console.log('[Database] Operating with local persistent store: data/db.json');
}

// -------------------------------------------------------------
// LOCAL JSON STORE HELPERS
// -------------------------------------------------------------
const dbJsonPath = path.join(__dirname, '..', 'data', 'db.json');

function readLocalDb() {
  try {
    if (fs.existsSync(dbJsonPath)) {
      const raw = fs.readFileSync(dbJsonPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[LocalDb] Read error:', err.message);
  }
  return { settings: {}, admin: {}, employees: [], attendance: [] };
}

function writeLocalDb(data) {
  try {
    fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.warn('[LocalDb] Write error:', err.message);
    return false;
  }
}

// ============================================================================
// 1. SETTINGS
// ============================================================================
async function getSettings() {
  if (isSupabaseActive) {
    try {
      const { data, error } = await supabase.from('office_settings').select('*').eq('id', 1).single();
      if (!error && data) {
        return {
          companyName: data.company_name,
          shortName: data.short_name,
          website: data.website,
          address: data.address,
          phone: data.phone,
          email: data.email,
          cin: data.cin,
          officeLat: data.office_lat,
          officeLng: data.office_lng,
          radiusMeters: data.radius_meters,
          accuracyThresholdMeters: data.accuracy_threshold_meters,
          shiftStartTime: data.shift_start_time,
          shiftEndTime: data.shift_end_time,
          graceMinutes: data.grace_minutes,
          demoMode: data.demo_mode
        };
      }
    } catch (e) {
      console.warn('[Supabase] Get settings error:', e.message);
    }
  }

  const local = readLocalDb();
  return local.settings || {
    companyName: 'SS40 NETWORK PRIVATE LIMITED',
    shortName: 'SS40 NETWORK',
    website: 'https://ss40network.com',
    address: '1st Floor, Municipal Corporation Incubation Centre, Sree Puram, Tirunelveli, Tamil Nadu 627001',
    phone: '+91 8300591750',
    email: 'support@ss40network.com',
    cin: 'U72900TN2023PTC160892',
    officeLat: 8.728512,
    officeLng: 77.727438,
    radiusMeters: 150,
    accuracyThresholdMeters: 50,
    shiftStartTime: '09:30',
    shiftEndTime: '18:30',
    graceMinutes: 15,
    demoMode: 'FORCE_INSIDE'
  };
}

async function updateSettings(updates) {
  if (isSupabaseActive) {
    try {
      const payload = {};
      if (updates.officeLat !== undefined) payload.office_lat = updates.officeLat;
      if (updates.officeLng !== undefined) payload.office_lng = updates.officeLng;
      if (updates.radiusMeters !== undefined) payload.radius_meters = updates.radiusMeters;
      if (updates.shiftStartTime !== undefined) payload.shift_start_time = updates.shiftStartTime;
      if (updates.shiftEndTime !== undefined) payload.shift_end_time = updates.shiftEndTime;
      if (updates.graceMinutes !== undefined) payload.grace_minutes = updates.graceMinutes;
      if (updates.demoMode !== undefined) payload.demo_mode = updates.demoMode;
      if (updates.officeName !== undefined) payload.company_name = updates.officeName;
      if (updates.companyName !== undefined) payload.company_name = updates.companyName;
      if (updates.officeAddress !== undefined) payload.address = updates.officeAddress;
      if (updates.address !== undefined) payload.address = updates.address;
      payload.updated_at = new Date().toISOString();

      await supabase.from('office_settings').update(payload).eq('id', 1);
      return getSettings();
    } catch (e) {
      console.warn('[Supabase] Update settings error:', e.message);
    }
  }

  const local = readLocalDb();
  local.settings = { ...(local.settings || {}), ...updates };
  if (updates.officeName) local.settings.companyName = updates.officeName;
  if (updates.officeAddress) local.settings.address = updates.officeAddress;
  writeLocalDb(local);
  return local.settings;
}

// ============================================================================
// 2. ADMIN USERS
// ============================================================================
async function getAdminUser(email) {
  if (isSupabaseActive) {
    try {
      const { data, error } = await supabase.from('admin_users').select('*').eq('email', email).single();
      if (!error && data) {
        return {
          id: data.id,
          username: data.email,
          passwordHash: data.password_hash,
          name: data.name,
          role: data.role
        };
      }
    } catch (e) {
      console.warn('[Supabase] Admin lookup error:', e.message);
    }
  }

  const local = readLocalDb();
  const clean = (email || '').trim().toLowerCase();
  if (!clean || clean === 'admin@ss40network.com' || clean === 'admin') {
    return local.admin || {
      id: 1,
      username: 'admin@ss40network.com',
      passwordHash: 'admin123',
      name: 'SS40 Systems Administrator',
      role: 'Super Admin'
    };
  }

  return null;
}

async function updateAdminPassword(email, newPassword) {
  const clean = (email || 'admin@ss40network.com').trim().toLowerCase();
  if (isSupabaseActive) {
    try {
      await supabase.from('admin_users').update({ password_hash: newPassword }).eq('email', clean);
    } catch (e) {
      console.warn('[Supabase] Admin password update error:', e.message);
    }
  }

  const local = readLocalDb();
  if (!local.admin) {
    local.admin = {
      id: 1,
      username: 'admin@ss40network.com',
      name: 'SS40 Systems Administrator',
      role: 'Super Admin'
    };
  }
  local.admin.passwordHash = newPassword;
  writeLocalDb(local);
  return true;
}

// ============================================================================
// 3. EMPLOYEES CRUD
// ============================================================================
async function getEmployees(filter = {}) {
  if (isSupabaseActive) {
    try {
      let query = supabase.from('employees').select('*');
      if (filter.status) query = query.ilike('status', filter.status);
      if (filter.department) query = query.eq('department', filter.department);

      const { data, error } = await query;
      if (!error && data) {
        let emps = data.map(row => ({
          id: row.id,
          name: row.name,
          email: row.email,
          department: row.department,
          wing: row.wing,
          designation: row.designation,
          barcode: row.barcode,
          phone: row.phone,
          bloodGroup: row.blood_group,
          shift: row.shift,
          avatarColor: row.avatar_color,
          status: row.status,
          joinedDate: row.joined_date,
          emergencyContact: row.emergency_contact
        }));

        if (filter.search) {
          const q = filter.search.toLowerCase();
          emps = emps.filter(e =>
            e.name.toLowerCase().includes(q) ||
            e.id.toLowerCase().includes(q) ||
            e.department.toLowerCase().includes(q) ||
            e.designation.toLowerCase().includes(q)
          );
        }
        return emps;
      }
    } catch (e) {
      console.warn('[Supabase] Employee list error:', e.message);
    }
  }

  const local = readLocalDb();
  let emps = [...(local.employees || [])];
  if (filter.status) {
    emps = emps.filter(e => (e.status || '').toLowerCase() === filter.status.toLowerCase());
  }
  if (filter.department) {
    emps = emps.filter(e => e.department === filter.department);
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    emps = emps.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.id || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q)
    );
  }
  return emps;
}

async function getEmployeeByIdOrBarcode(key) {
  if (!key) return null;
  const cleanKey = key.trim().toLowerCase();

  if (isSupabaseActive) {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .or(`id.ilike.${cleanKey},barcode.ilike.${cleanKey}`)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          name: data.name,
          email: data.email,
          department: data.department,
          wing: data.wing,
          designation: data.designation,
          barcode: data.barcode,
          phone: data.phone,
          bloodGroup: data.blood_group,
          shift: data.shift,
          avatarColor: data.avatar_color,
          status: data.status,
          joinedDate: data.joined_date,
          emergencyContact: data.emergency_contact
        };
      }
    } catch (e) {
      console.warn('[Supabase] Single employee error:', e.message);
    }
  }

  const local = readLocalDb();
  return (local.employees || []).find(e =>
    (e.id || '').toLowerCase() === cleanKey || (e.barcode || '').toLowerCase() === cleanKey
  ) || null;
}

async function getEmployeeByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  if (isSupabaseActive) {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          name: data.name,
          email: data.email,
          department: data.department,
          wing: data.wing,
          designation: data.designation,
          barcode: data.barcode,
          phone: data.phone,
          bloodGroup: data.blood_group,
          shift: data.shift,
          avatarColor: data.avatar_color,
          status: data.status,
          joinedDate: data.joined_date,
          emergencyContact: data.emergency_contact
        };
      }
    } catch (e) {
      console.warn('[Supabase] getEmployeeByEmail error:', e.message);
    }
  }

  const local = readLocalDb();
  return (local.employees || []).find(e =>
    (e.email || '').toLowerCase() === cleanEmail
  ) || null;
}

async function createEmployee(empData) {
  if (!empData) throw new Error('Employee data is required');
  const cleanName = (empData.name || '').trim();
  const cleanEmail = (empData.email || '').trim().toLowerCase();
  const cleanDept = (empData.department || empData.dept || 'SS40 Digital Solutions').trim();
  const cleanDesignation = (empData.designation || empData.role || empData.title || 'Associate Specialist').trim();
  const cleanPhone = (empData.phone && empData.phone.trim()) ? empData.phone.trim() : '+91 90000 00000';
  const cleanBlood = (empData.bloodGroup || empData.blood_group || 'O+').trim();
  const cleanEmergency = (empData.emergencyContact || empData.emergency_contact || '+91 8300591750').trim();

  if (!cleanName) throw new Error('Employee legal name is required');
  if (!cleanEmail) throw new Error('Employee official email is required');

  const newId = `SS40-EMP-${Date.now().toString().slice(-4)}`;
  const finalBarcode = empData.barcode && empData.barcode.trim() ? empData.barcode.trim() : newId;
  const avatarColors = ['#0F766E', '#2563EB', '#D97706', '#7C3AED', '#059669', '#DC2626', '#0891B2', '#4F46E5'];
  const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

  if (isSupabaseActive) {
    try {
      const payload = {
        id: newId,
        name: cleanName,
        email: cleanEmail,
        department: cleanDept,
        wing: empData.wing || 'Digital Solutions',
        designation: cleanDesignation,
        barcode: finalBarcode,
        phone: cleanPhone,
        blood_group: cleanBlood,
        shift: empData.shift || '09:30 - 18:30',
        avatar_color: avatarColor,
        status: 'Active',
        joined_date: new Date().toISOString().split('T')[0],
        emergency_contact: cleanEmergency
      };

      const { data, error } = await supabase.from('employees').insert(payload).select().single();
      if (!error && data) {
        return {
          id: data.id,
          name: data.name,
          email: data.email,
          department: data.department,
          wing: data.wing,
          designation: data.designation,
          barcode: data.barcode,
          phone: data.phone,
          bloodGroup: data.blood_group,
          shift: data.shift,
          avatarColor: data.avatar_color,
          status: data.status,
          joinedDate: data.joined_date,
          emergencyContact: data.emergency_contact
        };
      }
    } catch (e) {
      console.warn('[Supabase] Create employee error:', e.message);
    }
  }

  const local = readLocalDb();
  local.employees = local.employees || [];
  const newEmp = {
    id: newId,
    name: cleanName,
    email: cleanEmail,
    department: cleanDept,
    wing: empData.wing || 'Digital Solutions',
    designation: cleanDesignation,
    barcode: finalBarcode,
    phone: cleanPhone,
    bloodGroup: cleanBlood,
    shift: empData.shift || '09:30 - 18:30',
    avatarColor: avatarColor,
    status: 'Active',
    joinedDate: new Date().toISOString().split('T')[0],
    emergencyContact: cleanEmergency
  };
  local.employees.push(newEmp);
  writeLocalDb(local);
  return newEmp;
}

async function updateEmployee(id, updates) {
  if (!id || !updates) return null;

  if (isSupabaseActive) {
    try {
      const payload = {};
      if (updates.name) payload.name = updates.name.trim();
      if (updates.email) payload.email = updates.email.trim().toLowerCase();
      if (updates.department) payload.department = updates.department.trim();
      if (updates.wing) payload.wing = updates.wing.trim();
      if (updates.designation) payload.designation = updates.designation.trim();
      if (updates.phone) payload.phone = updates.phone.trim();
      if (updates.bloodGroup) payload.blood_group = updates.bloodGroup.trim();
      if (updates.shift) payload.shift = updates.shift.trim();
      if (updates.emergencyContact) payload.emergency_contact = updates.emergencyContact.trim();
      if (updates.status) payload.status = updates.status;
      payload.updated_at = new Date().toISOString();

      await supabase.from('employees').update(payload).eq('id', id);
      return getEmployeeByIdOrBarcode(id);
    } catch (e) {
      console.warn('[Supabase] Update employee error:', e.message);
    }
  }

  const local = readLocalDb();
  const idx = (local.employees || []).findIndex(e => e.id === id);
  if (idx !== -1) {
    local.employees[idx] = { ...local.employees[idx], ...updates };
    writeLocalDb(local);
    return local.employees[idx];
  }
  return null;
}

async function toggleEmployeeStatus(id) {
  if (!id) return null;
  const emp = await getEmployeeByIdOrBarcode(id);
  if (!emp) return null;

  const nextStatus = emp.status === 'Active' ? 'Inactive' : 'Active';

  if (isSupabaseActive) {
    try {
      await supabase.from('employees').update({
        status: nextStatus,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      return getEmployeeByIdOrBarcode(id);
    } catch (e) {
      console.warn('[Supabase] Toggle status error:', e.message);
    }
  }

  const local = readLocalDb();
  const idx = (local.employees || []).findIndex(e => e.id === id);
  if (idx !== -1) {
    local.employees[idx].status = nextStatus;
    writeLocalDb(local);
    return local.employees[idx];
  }
  return null;
}

async function deleteEmployee(id) {
  if (!id) return false;

  if (isSupabaseActive) {
    try {
      await supabase.from('employees').delete().eq('id', id);
      return true;
    } catch (e) {
      console.warn('[Supabase] Delete employee error:', e.message);
    }
  }

  const local = readLocalDb();
  local.employees = (local.employees || []).filter(e => e.id !== id);
  writeLocalDb(local);
  return true;
}

// ============================================================================
// 4. ATTENDANCE LOGS
// ============================================================================
async function getAttendanceLogs(filters = {}) {
  if (isSupabaseActive) {
    try {
      let query = supabase.from('attendance_logs').select('*');
      if (filters.date) query = query.eq('date', filters.date);
      if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
      if (filters.department) query = query.eq('department', filters.department);
      if (filters.status) query = query.eq('status', filters.status);
      query = query.order('check_in', { ascending: false });
      if (filters.limit) query = query.limit(parseInt(filters.limit, 10));

      const { data, error } = await query;
      if (!error && data) {
        return data.map(r => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          department: r.department,
          designation: r.designation,
          date: r.date,
          checkIn: r.check_in,
          checkInTime: r.check_in_time,
          checkOut: r.check_out,
          checkOutTime: r.check_out_time,
          hoursWorked: r.hours_worked,
          status: r.status,
          method: r.method,
          location: {
            lat: r.latitude,
            lng: r.longitude,
            distanceMeters: r.distance_meters,
            accuracy: r.accuracy,
            isInside: Boolean(r.is_inside),
            address: r.address
          }
        }));
      }
    } catch (e) {
      console.warn('[Supabase] Attendance list error:', e.message);
    }
  }

  const local = readLocalDb();
  let logs = [...(local.attendance || [])];
  if (filters.date) {
    logs = logs.filter(l => l.date === filters.date);
  }
  if (filters.employeeId) {
    logs = logs.filter(l => l.employeeId === filters.employeeId);
  }
  if (filters.department) {
    logs = logs.filter(l => l.department === filters.department);
  }
  if (filters.status) {
    logs = logs.filter(l => l.status === filters.status);
  }
  logs.sort((a, b) => new Date(b.checkIn || b.date) - new Date(a.checkIn || a.date));
  if (filters.limit) {
    logs = logs.slice(0, parseInt(filters.limit, 10));
  }
  return logs;
}

async function createAttendanceLog(log) {
  if (isSupabaseActive) {
    try {
      await supabase.from('attendance_logs').insert({
        id: log.id,
        employee_id: log.employeeId,
        employee_name: log.employeeName,
        department: log.department,
        designation: log.designation,
        date: log.date,
        check_in: log.checkIn,
        check_in_time: log.checkInTime,
        check_out: log.checkOut,
        check_out_time: log.checkOutTime,
        hours_worked: log.hoursWorked,
        status: log.status,
        method: log.method,
        latitude: log.location ? log.location.lat : null,
        longitude: log.location ? log.location.lng : null,
        distance_meters: log.location ? log.location.distanceMeters : 0,
        accuracy: log.location ? log.location.accuracy : null,
        is_inside: log.location ? (log.location.isInside ? 1 : 0) : 1,
        address: log.location ? log.location.address : null
      });
    } catch (e) {
      console.warn('[Supabase] Attendance insert error:', e.message);
    }
  }

  const local = readLocalDb();
  local.attendance = local.attendance || [];
  local.attendance.unshift(log);
  writeLocalDb(local);
  return log;
}

async function updateAttendanceLog(id, updates) {
  if (isSupabaseActive) {
    try {
      const payload = {};
      if (updates.checkOut !== undefined) payload.check_out = updates.checkOut;
      if (updates.checkOutTime !== undefined) payload.check_out_time = updates.checkOutTime;
      if (updates.hoursWorked !== undefined) payload.hours_worked = updates.hoursWorked;
      if (updates.status !== undefined) payload.status = updates.status;

      await supabase.from('attendance_logs').update(payload).eq('id', id);
    } catch (e) {
      console.warn('[Supabase] Update attendance error:', e.message);
    }
  }

  const local = readLocalDb();
  const idx = (local.attendance || []).findIndex(l => l.id === id);
  if (idx !== -1) {
    local.attendance[idx] = { ...local.attendance[idx], ...updates };
    writeLocalDb(local);
    return local.attendance[idx];
  }
  return null;
}

async function reconcileMidnightShifts() {
  const local = readLocalDb();
  let count = 0;
  const timeStr = '11:59 PM';
  
  if (local.attendance && local.attendance.length > 0) {
    for (const rec of local.attendance) {
      if (rec.checkIn && !rec.checkOut) {
        rec.checkOut = new Date().toISOString();
        rec.checkOutTime = timeStr;
        rec.status = 'MISSED_LOGOUT';
        rec.autoClosed = true;
        count++;
      }
    }
    if (count > 0) {
      writeLocalDb(local);
    }
  }
  return { reconciledCount: count };
}

module.exports = {
  isSupabaseActive: () => isSupabaseActive,
  initDatabase: async () => console.log('[Database] Ready.'),
  getSettings,
  updateSettings,
  getAdminUser,
  updateAdminPassword,
  getEmployees,
  getEmployeeByIdOrBarcode,
  getEmployeeByEmail,
  createEmployee,
  updateEmployee,
  toggleEmployeeStatus,
  deleteEmployee,
  getAttendanceLogs,
  createAttendanceLog,
  updateAttendanceLog,
  reconcileMidnightShifts
};
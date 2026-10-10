/**
 * SS40 NETWORK SMART ATTENDANCE — DATABASE CONNECTOR & ADAPTER
 * Seamlessly interfaces with Supabase / PostgreSQL when configured,
 * or falls back to local persistence (data/db.json).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

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
  console.log('[Database] Operating with local JSON data store (data/db.json). Configure SUPABASE_URL and SUPABASE_KEY in .env to connect live PostgreSQL.');
}

// ============================================================================
// LOCAL JSON HELPERS
// ============================================================================
function readLocalDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json:', err);
    return { settings: {}, employees: [], attendance: [], admin: {} };
  }
}

function writeLocalDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing db.json:', err);
    return false;
  }
}

// ============================================================================
// SETTINGS
// ============================================================================
async function getSettings() {
  if (isSupabaseActive) {
    try {
      const { data, error } = await supabase
        .from('office_settings')
        .select('*')
        .eq('id', 1)
        .single();

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
      console.warn('[Supabase] Falling back to local settings:', e.message);
    }
  }

  const local = readLocalDB();
  return local.settings;
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
      payload.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('office_settings')
        .update(payload)
        .eq('id', 1)
        .select()
        .single();

      if (!error) {
        return getSettings();
      }
    } catch (e) {
      console.warn('[Supabase] Update settings fallback:', e.message);
    }
  }

  const local = readLocalDB();
  local.settings = { ...local.settings, ...updates };
  writeLocalDB(local);
  return local.settings;
}

// ============================================================================
// ADMIN USERS
// ============================================================================
async function getAdminUser(email) {
  if (isSupabaseActive) {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .single();

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

  const local = readLocalDB();
  if (local.admin && local.admin.username === email) {
    return local.admin;
  }
  return null;
}

// ============================================================================
// EMPLOYEES CRUD
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
      console.warn('[Supabase] Employee list fallback:', e.message);
    }
  }

  const local = readLocalDB();
  let emps = [...local.employees];

  if (filter.department) {
    emps = emps.filter(e => e.department === filter.department);
  }
  if (filter.status) {
    emps = emps.filter(e => e.status.toLowerCase() === filter.status.toLowerCase());
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    emps = emps.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.barcode.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q)
    );
  }

  return emps;
}

async function getEmployeeByIdOrBarcode(key) {
  if (!key) return null;
  const cleanKey = key.trim();

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
      console.warn('[Supabase] Single employee fallback:', e.message);
    }
  }

  const local = readLocalDB();
  return local.employees.find(
    e => e.id.toLowerCase() === cleanKey.toLowerCase() ||
         e.barcode.toLowerCase() === cleanKey.toLowerCase()
  ) || null;
}

async function createEmployee(empData) {
  const local = readLocalDB();

  // Compute next ID
  let nextNum = 1001;
  const existingNums = local.employees
    .map(e => {
      const match = e.id.match(/\d+$/);
      return match ? parseInt(match[0], 10) : 0;
    })
    .filter(n => !isNaN(n));

  if (existingNums.length > 0) {
    nextNum = Math.max(...existingNums) + 1;
  }

  const newId = `SS40-EMP-${nextNum}`;
  const avatarColors = ['#0F766E', '#2563EB', '#D97706', '#7C3AED', '#059669', '#DC2626', '#0891B2', '#4F46E5'];
  const avatarColor = avatarColors[nextNum % avatarColors.length];

  let wing = "Digital Solutions";
  if (empData.department.includes('Products')) wing = "Products";
  if (empData.department.includes('Academics')) wing = "Academics";
  if (empData.department.includes('Operations') || empData.department.includes('Executive')) wing = "Corporate Operations";

  const newEmp = {
    id: newId,
    name: empData.name.trim(),
    email: empData.email.trim(),
    department: empData.department.trim(),
    wing: wing,
    designation: (empData.designation || 'Specialist').trim(),
    barcode: newId,
    phone: empData.phone || '+91 90000 00000',
    bloodGroup: empData.bloodGroup || 'O+',
    shift: '09:30 - 18:30',
    avatarColor: avatarColor,
    status: 'Active',
    joinedDate: new Date().toISOString().split('T')[0],
    emergencyContact: empData.emergencyContact || '+91 8300591750'
  };

  if (isSupabaseActive) {
    try {
      const { data, error } = await supabase.from('employees').insert({
        id: newEmp.id,
        name: newEmp.name,
        email: newEmp.email,
        department: newEmp.department,
        wing: newEmp.wing,
        designation: newEmp.designation,
        barcode: newEmp.barcode,
        phone: newEmp.phone,
        blood_group: newEmp.bloodGroup,
        shift: newEmp.shift,
        avatar_color: newEmp.avatarColor,
        status: newEmp.status,
        joined_date: newEmp.joinedDate,
        emergency_contact: newEmp.emergencyContact
      }).select().single();

      if (!error) {
        console.log('[Supabase] Employee record inserted:', newEmp.id);
      }
    } catch (e) {
      console.warn('[Supabase] Create employee fallback:', e.message);
    }
  }

  local.employees.push(newEmp);
  writeLocalDB(local);
  return newEmp;
}

async function updateEmployee(id, updates) {
  const local = readLocalDB();
  const empIndex = local.employees.findIndex(e => e.id === id);
  if (empIndex === -1) return null;

  const updated = {
    ...local.employees[empIndex],
    ...updates,
    id: local.employees[empIndex].id // Immutable
  };
  local.employees[empIndex] = updated;
  writeLocalDB(local);

  if (isSupabaseActive) {
    try {
      await supabase.from('employees').update({
        name: updated.name,
        email: updated.email,
        department: updated.department,
        designation: updated.designation,
        phone: updated.phone,
        blood_group: updated.bloodGroup,
        emergency_contact: updated.emergencyContact,
        updated_at: new Date().toISOString()
      }).eq('id', id);
    } catch (e) {
      console.warn('[Supabase] Update employee fallback:', e.message);
    }
  }

  return updated;
}

async function toggleEmployeeStatus(id) {
  const local = readLocalDB();
  const emp = local.employees.find(e => e.id === id);
  if (!emp) return null;

  emp.status = emp.status === 'Active' ? 'Inactive' : 'Active';
  writeLocalDB(local);

  if (isSupabaseActive) {
    try {
      await supabase.from('employees').update({
        status: emp.status,
        updated_at: new Date().toISOString()
      }).eq('id', id);
    } catch (e) {
      console.warn('[Supabase] Toggle status fallback:', e.message);
    }
  }

  return emp;
}

// ============================================================================
// ATTENDANCE LOGS
// ============================================================================
async function getAttendanceLogs(filters = {}) {
  const local = readLocalDB();
  let list = [...local.attendance];

  if (filters.date) {
    list = list.filter(a => a.date === filters.date);
  }
  if (filters.employeeId) {
    list = list.filter(a => a.employeeId === filters.employeeId);
  }
  if (filters.department) {
    list = list.filter(a => a.department === filters.department);
  }
  if (filters.status) {
    list = list.filter(a => a.status === filters.status);
  }

  list.sort((a, b) => new Date(b.checkIn || b.date) - new Date(a.checkIn || a.date));

  if (filters.limit) {
    const limit = parseInt(filters.limit, 10);
    if (!isNaN(limit) && limit > 0) {
      list = list.slice(0, limit);
    }
  }

  return list;
}

async function createAttendanceLog(log) {
  const local = readLocalDB();
  local.attendance.unshift(log);
  writeLocalDB(local);

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
        is_inside: log.location ? log.location.isInside : true,
        address: log.location ? log.location.address : null
      });
      console.log('[Supabase] Attendance log saved:', log.id);
    } catch (e) {
      console.warn('[Supabase] Attendance insert fallback:', e.message);
    }
  }

  return log;
}

async function updateAttendanceLog(id, updates) {
  const local = readLocalDB();
  const logIndex = local.attendance.findIndex(a => a.id === id);
  if (logIndex === -1) return null;

  local.attendance[logIndex] = {
    ...local.attendance[logIndex],
    ...updates
  };
  writeLocalDB(local);

  if (isSupabaseActive) {
    try {
      await supabase.from('attendance_logs').update({
        check_out: updates.checkOut,
        check_out_time: updates.checkOutTime,
        hours_worked: updates.hoursWorked,
        status: updates.status
      }).eq('id', id);
    } catch (e) {
      console.warn('[Supabase] Attendance update fallback:', e.message);
    }
  }

  return local.attendance[logIndex];
}

module.exports = {
  isSupabaseActive: () => isSupabaseActive,
  getSettings,
  updateSettings,
  getAdminUser,
  getEmployees,
  getEmployeeByIdOrBarcode,
  createEmployee,
  updateEmployee,
  toggleEmployeeStatus,
  getAttendanceLogs,
  createAttendanceLog,
  updateAttendanceLog
};

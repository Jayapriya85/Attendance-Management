/**
 * SS40 NETWORK SMART ATTENDANCE — DATABASE CONNECTOR & ADAPTER
 * Primary cloud engine: Supabase PostgreSQL
 */

require('dotenv').config();
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
  console.error('[Database] ERROR: Supabase credentials are missing or invalid in environment variables!');
}

// ============================================================================
// SETTINGS
// ============================================================================
async function getSettings() {
  if (!isSupabaseActive) return {};
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
  return {};
}

async function updateSettings(updates) {
  if (!isSupabaseActive) return null;
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

    await supabase.from('office_settings').update(payload).eq('id', 1);
  } catch (e) {
    console.warn('[Supabase] Update settings error:', e.message);
  }
  return getSettings();
}

// ============================================================================
// ADMIN USERS
// ============================================================================
async function getAdminUser(email) {
  if (!isSupabaseActive) return null;
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
  return null;
}

// ============================================================================
// EMPLOYEES CRUD
// ============================================================================
async function getEmployees(filter = {}) {
  if (!isSupabaseActive) return [];
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
  return [];
}

async function getEmployeeByIdOrBarcode(key) {
  if (!key || !isSupabaseActive) return null;
  const cleanKey = key.trim();

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
  return null;
}

async function getEmployeeByEmail(email) {
  if (!email || !isSupabaseActive) return null;
  const cleanEmail = email.trim().toLowerCase();

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
  return null;
}

async function createEmployee(empData) {
  if (!empData || !isSupabaseActive) throw new Error('Supabase is not active or payload missing');
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

  let wing = "Digital Solutions";
  if (cleanDept.includes('Products')) wing = "Products";
  else if (cleanDept.includes('Academics')) wing = "Academics";
  else if (cleanDept.includes('Operations') || cleanDept.includes('Executive')) wing = "Corporate Operations";

  const newEmp = {
    id: newId,
    name: cleanName,
    email: cleanEmail,
    department: cleanDept,
    wing: wing,
    designation: cleanDesignation,
    barcode: finalBarcode,
    phone: cleanPhone,
    blood_group: cleanBlood,
    shift: '09:30 - 18:30',
    avatar_color: avatarColor,
    status: 'Active',
    joined_date: new Date().toISOString().split('T')[0],
    emergency_contact: cleanEmergency
  };

  const { error } = await supabase.from('employees').insert(newEmp);
  if (error) throw new Error(error.message);

  return {
    id: newEmp.id,
    name: newEmp.name,
    email: newEmp.email,
    department: newEmp.department,
    wing: newEmp.wing,
    designation: newEmp.designation,
    barcode: newEmp.barcode,
    phone: newEmp.phone,
    bloodGroup: newEmp.blood_group,
    shift: newEmp.shift,
    avatarColor: newEmp.avatar_color,
    status: newEmp.status,
    joinedDate: newEmp.joined_date,
    emergencyContact: newEmp.emergency_contact
  };
}

async function updateEmployee(id, updates) {
  if (!isSupabaseActive) return null;
  try {
    const payload = {};
    if (updates.name) payload.name = updates.name;
    if (updates.email) payload.email = updates.email;
    if (updates.department) payload.department = updates.department;
    if (updates.designation) payload.designation = updates.designation;
    if (updates.phone) payload.phone = updates.phone;
    if (updates.bloodGroup) payload.blood_group = updates.bloodGroup;
    if (updates.emergencyContact) payload.emergency_contact = updates.emergencyContact;
    payload.updated_at = new Date().toISOString();

    await supabase.from('employees').update(payload).eq('id', id);
    return getEmployeeByIdOrBarcode(id);
  } catch (e) {
    console.warn('[Supabase] Update employee error:', e.message);
  }
  return null;
}

async function toggleEmployeeStatus(id) {
  if (!isSupabaseActive) return null;
  try {
    const current = await getEmployeeByIdOrBarcode(id);
    if (!current) return null;
    const nextStatus = current.status === 'Active' ? 'Inactive' : 'Active';

    await supabase.from('employees').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', id);
    return getEmployeeByIdOrBarcode(id);
  } catch (e) {
    console.warn('[Supabase] Toggle status error:', e.message);
  }
  return null;
}

async function deleteEmployee(id) {
  if (!isSupabaseActive) return false;
  try {
    await supabase.from('attendance_logs').delete().eq('employee_id', id);
    const { error } = await supabase.from('employees').delete().eq('id', id);
    return !error;
  } catch (e) {
    console.warn('[Supabase] Delete employee error:', e.message);
  }
  return false;
}

// ============================================================================
// ATTENDANCE LOGS
// ============================================================================
async function getAttendanceLogs(filters = {}) {
  if (!isSupabaseActive) return [];
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
  return [];
}

async function createAttendanceLog(log) {
  if (!isSupabaseActive) return log;
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
  return log;
}

async function updateAttendanceLog(id, updates) {
  if (!isSupabaseActive) return null;
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
  const logs = await getAttendanceLogs({ limit: 1 });
  return logs[0] || null;
}

module.exports = {
  isSupabaseActive: () => isSupabaseActive,
  initDatabase: async () => console.log('[Database] Supabase ready.'),
  getSettings,
  updateSettings,
  getAdminUser,
  getEmployees,
  getEmployeeByIdOrBarcode,
  getEmployeeByEmail,
  createEmployee,
  updateEmployee,
  toggleEmployeeStatus,
  deleteEmployee,
  getAttendanceLogs,
  createAttendanceLog,
  updateAttendanceLog
};
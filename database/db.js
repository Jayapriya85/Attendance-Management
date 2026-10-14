/**
 * SS40 NETWORK SMART ATTENDANCE — DATABASE CONNECTOR & ADAPTER
 * Primary engine: Persistent SQLite (database/attendance.db) with automatic schema creation.
 * Optional cloud engine: Supabase PostgreSQL when SUPABASE_URL and SUPABASE_KEY are provided.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sqlite = require('./sqlite');

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
  console.log('[Database] Operating with persistent SQLite SQL database (database/attendance.db).');
}

// Automatically initialize SQLite database tables on startup
sqlite.initDatabase().catch(err => {
  console.error('[Database] SQLite table initialization error:', err.message);
});

// ============================================================================
// SETTINGS
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
      console.warn('[Supabase] Falling back to SQLite settings:', e.message);
    }
  }
  return sqlite.getSettings();
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

      await supabase.from('office_settings').update(payload).eq('id', 1);
    } catch (e) {
      console.warn('[Supabase] Update settings fallback to SQLite:', e.message);
    }
  }
  return sqlite.updateSettings(updates);
}

// ============================================================================
// ADMIN USERS
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
      console.warn('[Supabase] Admin lookup fallback to SQLite:', e.message);
    }
  }
  return sqlite.getAdminUser(email);
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
      console.warn('[Supabase] Employee list fallback to SQLite:', e.message);
    }
  }
  return sqlite.getEmployees(filter);
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
      console.warn('[Supabase] Single employee fallback to SQLite:', e.message);
    }
  }
  return sqlite.getEmployeeByIdOrBarcode(cleanKey);
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
      console.warn('[Supabase] getEmployeeByEmail fallback:', e.message);
    }
  }

  return sqlite.getEmployeeByEmail(cleanEmail);
}

async function createEmployee(empData) {
  const newEmp = await sqlite.createEmployee(empData);

  if (isSupabaseActive) {
    try {
      await supabase.from('employees').insert({
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
      });
      console.log('[Supabase] Synced new employee:', newEmp.id);
    } catch (e) {
      console.warn('[Supabase] Employee sync failed:', e.message);
    }
  }

  return newEmp;
}

async function updateEmployee(id, updates) {
  const updated = await sqlite.updateEmployee(id, updates);
  if (isSupabaseActive && updated) {
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
      console.warn('[Supabase] Update employee sync error:', e.message);
    }
  }
  return updated;
}

async function toggleEmployeeStatus(id) {
  const updated = await sqlite.toggleEmployeeStatus(id);
  if (isSupabaseActive && updated) {
    try {
      await supabase.from('employees').update({
        status: updated.status,
        updated_at: new Date().toISOString()
      }).eq('id', id);
    } catch (e) {
      console.warn('[Supabase] Toggle status sync error:', e.message);
    }
  }
  return updated;
}

async function deleteEmployee(id) {
  const ok = await sqlite.deleteEmployee(id);
  if (isSupabaseActive) {
    try {
      await supabase.from('employees').delete().eq('id', id);
    } catch (e) {
      console.warn('[Supabase] Delete sync error:', e.message);
    }
  }
  return ok;
}

// ============================================================================
// ATTENDANCE LOGS
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
      console.warn('[Supabase] Attendance list fallback to SQLite:', e.message);
    }
  }
  return sqlite.getAttendanceLogs(filters);
}

async function createAttendanceLog(log) {
  const created = await sqlite.createAttendanceLog(log);
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
      console.warn('[Supabase] Attendance sync error:', e.message);
    }
  }
  return created;
}

async function updateAttendanceLog(id, updates) {
  const updated = await sqlite.updateAttendanceLog(id, updates);
  if (isSupabaseActive) {
    try {
      await supabase.from('attendance_logs').update({
        check_out: updates.checkOut,
        check_out_time: updates.checkOutTime,
        hours_worked: updates.hoursWorked,
        status: updates.status
      }).eq('id', id);
    } catch (e) {
      console.warn('[Supabase] Update attendance sync error:', e.message);
    }
  }
  return updated;
}

module.exports = {
  isSupabaseActive: () => isSupabaseActive,
  initDatabase: () => sqlite.initDatabase(),
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

/**
 * SS40 NETWORK SMART ATTENDANCE — SQLITE DATABASE ENGINE
 * Real embedded SQL database with automatic schema initialization and data persistence
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname);
const DB_FILE = path.join(DB_DIR, 'attendance.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('[SQLite] Could not connect to database:', err.message);
  } else {
    console.log(`[SQLite] Connected to persistent SQL database: ${DB_FILE}`);
  }
});

// Helper for Promisified Queries
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ----------------------------------------------------------------------------
// AUTOMATIC SCHEMA INITIALIZATION
// ----------------------------------------------------------------------------
async function initDatabase() {
  console.log('[SQLite] Initializing database tables...');

  // 1. Admin Users Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'Super Admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Employees Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      department TEXT NOT NULL,
      wing TEXT NOT NULL,
      designation TEXT NOT NULL,
      barcode TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      blood_group TEXT DEFAULT 'O+',
      shift TEXT DEFAULT '09:30 - 18:30',
      avatar_color TEXT DEFAULT '#0F766E',
      status TEXT DEFAULT 'Active',
      joined_date TEXT,
      emergency_contact TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Attendance Logs Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      department TEXT NOT NULL,
      designation TEXT,
      date TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_in_time TEXT NOT NULL,
      check_out TEXT,
      check_out_time TEXT,
      hours_worked REAL,
      status TEXT NOT NULL,
      method TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      distance_meters INTEGER NOT NULL,
      accuracy REAL,
      is_inside INTEGER DEFAULT 1,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )
  `);

  // 4. Office Settings Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS office_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      company_name TEXT DEFAULT 'SS40 NETWORK PRIVATE LIMITED',
      short_name TEXT DEFAULT 'SS40 NETWORK',
      website TEXT DEFAULT 'https://ss40network.com',
      address TEXT NOT NULL,
      phone TEXT DEFAULT '+91 8300591750',
      email TEXT DEFAULT 'support@ss40network.com',
      cin TEXT DEFAULT 'U72900TN2023PTC160892',
      office_lat REAL DEFAULT 8.728512,
      office_lng REAL DEFAULT 77.727438,
      radius_meters INTEGER DEFAULT 150,
      accuracy_threshold_meters INTEGER DEFAULT 50,
      shift_start_time TEXT DEFAULT '09:30',
      shift_end_time TEXT DEFAULT '18:30',
      grace_minutes INTEGER DEFAULT 15,
      demo_mode TEXT DEFAULT 'REAL_GPS',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indexes
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_att_date ON attendance_logs(date)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_att_emp ON attendance_logs(employee_id)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_emp_barcode ON employees(barcode)`);

  // Automatic migrations for break times
  try {
    await dbRun(`ALTER TABLE attendance_logs ADD COLUMN break_start TEXT`);
  } catch (e) {}
  try {
    await dbRun(`ALTER TABLE attendance_logs ADD COLUMN break_start_time TEXT`);
  } catch (e) {}
  try {
    await dbRun(`ALTER TABLE attendance_logs ADD COLUMN break_end TEXT`);
  } catch (e) {}
  try {
    await dbRun(`ALTER TABLE attendance_logs ADD COLUMN break_end_time TEXT`);
  } catch (e) {}
  try {
    await dbRun(`ALTER TABLE attendance_logs ADD COLUMN break_minutes REAL DEFAULT 0`);
  } catch (e) {}

  // Seed default admin if missing
  const admin = await dbGet(`SELECT * FROM admin_users WHERE email = ?`, ['admin@ss40network.com']);
  if (!admin) {
    await dbRun(`
      INSERT INTO admin_users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `, ['admin-uuid-1', 'admin@ss40network.com', 'admin123', 'SS40 Systems Administrator', 'Super Admin']);
    console.log('[SQLite] Seeded default super admin user.');
  }

  // Seed default office settings if missing
  const settings = await dbGet(`SELECT * FROM office_settings WHERE id = 1`);
  if (!settings) {
    await dbRun(`
      INSERT INTO office_settings (id, company_name, short_name, address, office_lat, office_lng, radius_meters, shift_start_time, shift_end_time, grace_minutes)
      VALUES (1, 'SS40 NETWORK PRIVATE LIMITED', 'SS40 NETWORK', '1st Floor, Municipal Corporation Incubation Centre (Near by trade centre), Sree Puram, Tirunelveli, Tamil Nadu 627001', 8.728512, 77.727438, 150, '09:30', '18:30', 15)
    `);
    console.log('[SQLite] Seeded default SS40 Tirunelveli office geofence settings.');
  }

  const jsonPath = path.join(__dirname, '..', 'data', 'db.json');
  if (fs.existsSync(jsonPath)) {
    const dbJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Seed employees if empty
    const empCount = await dbGet(`SELECT COUNT(*) as count FROM employees`);
    if (empCount.count === 0 && dbJson.employees) {
      for (const e of dbJson.employees) {
        await dbRun(`
          INSERT OR IGNORE INTO employees (id, name, email, department, wing, designation, barcode, phone, blood_group, shift, avatar_color, status, joined_date, emergency_contact)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          e.id, e.name, e.email, e.department, e.wing || 'Digital Solutions', e.designation,
          e.barcode, e.phone, e.bloodGroup || 'O+', e.shift || '09:30 - 18:30',
          e.avatarColor || '#0F766E', e.status || 'Active', e.joinedDate || '2023-08-15',
          e.emergencyContact || '+91 8300591750'
        ]);
      }
      console.log(`[SQLite] Seeded initial employees from db.json.`);
    }

    // Seed logs if empty
    const logCount = await dbGet(`SELECT COUNT(*) as count FROM attendance_logs`);
    if (logCount.count === 0 && dbJson.attendance) {
      for (const a of dbJson.attendance) {
        await dbRun(`
          INSERT OR IGNORE INTO attendance_logs (id, employee_id, employee_name, department, designation, date, check_in, check_in_time, check_out, check_out_time, hours_worked, status, method, latitude, longitude, distance_meters, accuracy, is_inside, address)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          a.id, a.employeeId, a.employeeName, a.department, a.designation,
          a.date, a.checkIn, a.checkInTime, a.checkOut, a.checkOutTime,
          a.hoursWorked, a.status, a.method,
          a.location ? a.location.lat : null,
          a.location ? a.location.lng : null,
          a.location ? a.location.distanceMeters : 15,
          a.location ? a.location.accuracy : 10,
          a.location ? (a.location.isInside ? 1 : 0) : 1,
          a.location ? a.location.address : 'SS40 Incubation Centre'
        ]);
      }
      console.log(`[SQLite] Seeded ${dbJson.attendance.length} historical attendance logs.`);
    }
  }

  console.log('[SQLite] Database initialization completed successfully.');
}

// ----------------------------------------------------------------------------
// DATA ACCESS METHODS
// ----------------------------------------------------------------------------

async function getSettings() {
  const row = await dbGet(`SELECT * FROM office_settings WHERE id = 1`);
  if (!row) return {};
  return {
    companyName: row.company_name,
    shortName: row.short_name,
    website: row.website,
    address: row.address,
    phone: row.phone,
    email: row.email,
    cin: row.cin,
    officeLat: row.office_lat,
    officeLng: row.office_lng,
    radiusMeters: row.radius_meters,
    accuracyThresholdMeters: row.accuracy_threshold_meters,
    shiftStartTime: row.shift_start_time,
    shiftEndTime: row.shift_end_time,
    graceMinutes: row.grace_minutes,
    demoMode: row.demo_mode
  };
}

async function updateSettings(updates) {
  const current = await getSettings();
  const merged = { ...current, ...updates };
  await dbRun(`
    UPDATE office_settings SET
      office_lat = ?,
      office_lng = ?,
      radius_meters = ?,
      shift_start_time = ?,
      shift_end_time = ?,
      grace_minutes = ?,
      demo_mode = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `, [
    merged.officeLat,
    merged.officeLng,
    merged.radiusMeters,
    merged.shiftStartTime,
    merged.shiftEndTime,
    merged.graceMinutes,
    merged.demoMode
  ]);
  return getSettings();
}

async function getAdminUser(email) {
  const row = await dbGet(`SELECT * FROM admin_users WHERE email = ?`, [email]);
  if (!row) return null;
  return {
    id: row.id,
    username: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role
  };
}

async function getEmployees(filter = {}) {
  let sql = `SELECT * FROM employees WHERE 1=1`;
  const params = [];

  if (filter.status) {
    sql += ` AND LOWER(status) = LOWER(?)`;
    params.push(filter.status);
  }
  if (filter.department) {
    sql += ` AND department = ?`;
    params.push(filter.department);
  }
  if (filter.search) {
    sql += ` AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(id) LIKE ? OR LOWER(barcode) LIKE ? OR LOWER(department) LIKE ? OR LOWER(designation) LIKE ?)`;
    const q = `%${filter.search.toLowerCase()}%`;
    params.push(q, q, q, q, q, q);
  }


  sql += ` ORDER BY id ASC`;
  const rows = await dbAll(sql, params);

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    department: r.department,
    wing: r.wing,
    designation: r.designation,
    barcode: r.barcode,
    phone: r.phone,
    bloodGroup: r.blood_group,
    shift: r.shift,
    avatarColor: r.avatar_color,
    status: r.status,
    joinedDate: r.joined_date,
    emergencyContact: r.emergency_contact
  }));
}

async function getEmployeeByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();
  const row = await dbGet(`SELECT * FROM employees WHERE LOWER(email) = LOWER(?)`, [cleanEmail]);
  if (!row) return null;
  return {
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
  };
}

async function getEmployeeByIdOrBarcode(key) {
  if (!key) return null;
  const clean = key.trim();
  const row = await dbGet(`
    SELECT * FROM employees
    WHERE LOWER(id) = LOWER(?) OR LOWER(barcode) = LOWER(?)
  `, [clean, clean]);

  if (!row) return null;
  return {
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
  };
}

async function createEmployee(empData) {
  if (!empData) throw new Error('Employee payload is required');
  const cleanName = (empData.name || '').trim();
  const cleanEmail = (empData.email || '').trim().toLowerCase();
  const cleanDept = (empData.department || empData.dept || 'SS40 Digital Solutions').trim();
  const cleanDesignation = (empData.designation || empData.role || empData.title || 'Associate Specialist').trim();
  const cleanPhone = (empData.phone && empData.phone.trim()) ? empData.phone.trim() : '+91 90000 00000';
  const cleanBlood = (empData.bloodGroup || empData.blood_group || 'O+').trim();
  const cleanEmergency = (empData.emergencyContact || empData.emergency_contact || '+91 8300591750').trim();

  if (!cleanName) throw new Error('Employee legal name is required');
  if (!cleanEmail) throw new Error('Employee official email is required');

  // Check email uniqueness
  const existingEmail = await dbGet(`SELECT id, name FROM employees WHERE LOWER(email) = LOWER(?)`, [cleanEmail]);
  if (existingEmail) {
    const err = new Error(`An employee with email '${cleanEmail}' already exists (ID: ${existingEmail.id})`);
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  // Guaranteed unique ID and barcode calculation
  const allRows = await dbAll(`SELECT id, barcode FROM employees`);
  const usedIds = new Set(allRows.map(r => (r.id || '').toUpperCase()));
  const usedBarcodes = new Set(allRows.map(r => (r.barcode || '').toUpperCase()));

  let nextNum = 1001;
  allRows.forEach(r => {
    const m = (r.id || '').match(/\d+$/);
    if (m) {
      const val = parseInt(m[0], 10);
      if (val >= nextNum) nextNum = val + 1;
    }
  });

  let newId = `SS40-EMP-${nextNum}`;
  while (usedIds.has(newId.toUpperCase()) || usedBarcodes.has(newId.toUpperCase())) {
    nextNum++;
    newId = `SS40-EMP-${nextNum}`;
  }

  // Guaranteed unique barcode
  let finalBarcode = newId;
  if (empData.barcode && empData.barcode.trim()) {
    const candidate = empData.barcode.trim();
    if (!usedBarcodes.has(candidate.toUpperCase())) {
      finalBarcode = candidate;
    }
  }

  const avatarColors = ['#0F766E', '#2563EB', '#D97706', '#7C3AED', '#059669', '#DC2626', '#0891B2', '#4F46E5'];
  const avatarColor = avatarColors[nextNum % avatarColors.length];

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
    bloodGroup: cleanBlood,
    shift: '09:30 - 18:30',
    avatarColor: avatarColor,
    status: 'Active',
    joinedDate: new Date().toISOString().split('T')[0],
    emergencyContact: cleanEmergency
  };

  await dbRun(`
    INSERT INTO employees (id, name, email, department, wing, designation, barcode, phone, blood_group, shift, avatar_color, status, joined_date, emergency_contact)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    newEmp.id, newEmp.name, newEmp.email, newEmp.department, newEmp.wing,
    newEmp.designation, newEmp.barcode, newEmp.phone, newEmp.bloodGroup,
    newEmp.shift, newEmp.avatarColor, newEmp.status, newEmp.joinedDate,
    newEmp.emergencyContact
  ]);

  console.log(`[SQLite] Successfully created employee in database: ${newEmp.id} (${newEmp.name})`);
  return newEmp;
}

async function updateEmployee(id, updates) {
  const existing = await getEmployeeByIdOrBarcode(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates };
  await dbRun(`
    UPDATE employees SET
      name = ?,
      email = ?,
      department = ?,
      designation = ?,
      phone = ?,
      blood_group = ?,
      emergency_contact = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    merged.name, merged.email, merged.department, merged.designation,
    merged.phone, merged.bloodGroup, merged.emergencyContact, id
  ]);

  return getEmployeeByIdOrBarcode(id);
}

async function toggleEmployeeStatus(id) {
  const existing = await getEmployeeByIdOrBarcode(id);
  if (!existing) return null;

  const nextStatus = existing.status === 'Active' ? 'Inactive' : 'Active';
  await dbRun(`UPDATE employees SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextStatus, id]);
  return getEmployeeByIdOrBarcode(id);
}

async function getAttendanceLogs(filters = {}) {
  let sql = `SELECT * FROM attendance_logs WHERE 1=1`;
  const params = [];

  if (filters.date) {
    sql += ` AND date = ?`;
    params.push(filters.date);
  }
  if (filters.employeeId) {
    sql += ` AND employee_id = ?`;
    params.push(filters.employeeId);
  }
  if (filters.department) {
    sql += ` AND department = ?`;
    params.push(filters.department);
  }
  if (filters.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }

  sql += ` ORDER BY check_in DESC`;

  if (filters.limit) {
    sql += ` LIMIT ?`;
    params.push(parseInt(filters.limit, 10));
  }

  const rows = await dbAll(sql, params);
  return rows.map(r => ({
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
    breakStart: r.break_start,
    breakStartTime: r.break_start_time,
    breakEnd: r.break_end,
    breakEndTime: r.break_end_time,
    breakMinutes: r.break_minutes || 0,
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

async function createAttendanceLog(log) {
  await dbRun(`
    INSERT INTO attendance_logs (
      id, employee_id, employee_name, department, designation,
      date, check_in, check_in_time, check_out, check_out_time,
      break_start, break_start_time, break_end, break_end_time, break_minutes,
      hours_worked, status, method, latitude, longitude,
      distance_meters, accuracy, is_inside, address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    log.id, log.employeeId, log.employeeName, log.department, log.designation,
    log.date, log.checkIn, log.checkInTime, log.checkOut, log.checkOutTime,
    log.breakStart || null, log.breakStartTime || null,
    log.breakEnd || null, log.breakEndTime || null,
    log.breakMinutes || 0,
    log.hoursWorked, log.status, log.method,
    log.location ? log.location.lat : null,
    log.location ? log.location.lng : null,
    log.location ? log.location.distanceMeters : 0,
    log.location ? log.location.accuracy : 10,
    log.location ? (log.location.isInside ? 1 : 0) : 1,
    log.location ? log.location.address : ''
  ]);
  console.log(`[SQLite] Recorded attendance log: ${log.id} (${log.employeeName})`);
  return log;
}

async function updateAttendanceLog(id, updates) {
  const fields = [];
  const values = [];

  if (updates.checkOut !== undefined) { fields.push('check_out = ?'); values.push(updates.checkOut); }
  if (updates.checkOutTime !== undefined) { fields.push('check_out_time = ?'); values.push(updates.checkOutTime); }
  if (updates.hoursWorked !== undefined) { fields.push('hours_worked = ?'); values.push(updates.hoursWorked); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.breakStart !== undefined) { fields.push('break_start = ?'); values.push(updates.breakStart); }
  if (updates.breakStartTime !== undefined) { fields.push('break_start_time = ?'); values.push(updates.breakStartTime); }
  if (updates.breakEnd !== undefined) { fields.push('break_end = ?'); values.push(updates.breakEnd); }
  if (updates.breakEndTime !== undefined) { fields.push('break_end_time = ?'); values.push(updates.breakEndTime); }
  if (updates.breakMinutes !== undefined) { fields.push('break_minutes = ?'); values.push(updates.breakMinutes); }

  if (fields.length > 0) {
    values.push(id);
    await dbRun(`UPDATE attendance_logs SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  const rows = await getAttendanceLogs({ limit: 1 });
  return rows[0];
}

async function deleteEmployee(id) {
  await dbRun(`DELETE FROM attendance_logs WHERE employee_id = ?`, [id]);
  const result = await dbRun(`DELETE FROM employees WHERE id = ?`, [id]);
  try {
    const jsonPath = path.join(__dirname, '..', 'data', 'db.json');
    if (fs.existsSync(jsonPath)) {
      const dbData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (Array.isArray(dbData.employees)) {
        dbData.employees = dbData.employees.filter(e => e.id !== id);
        fs.writeFileSync(jsonPath, JSON.stringify(dbData, null, 2), 'utf8');
      }
    }
  } catch (syncErr) {
    console.warn('[SQLite] db.json sync notice on delete:', syncErr.message);
  }
  return result.changes > 0;
}

module.exports = {
  initDatabase,
  isSupabaseActive: () => false,
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

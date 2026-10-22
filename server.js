const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Haversine formula to compute distance in meters
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Format 12-hour AM/PM string
function format12Hour(date) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

// Current date formatted as YYYY-MM-DD
function getLocalDateString(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// -------------------------------------------------------------
// 1. AUTH ENDPOINTS
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername !== 'admin@ss40network.com' && cleanUsername !== 'admin') {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials. Please verify your email and password.'
      });
    }

    const admin = await db.getAdminUser(cleanUsername);
    const validPassword = admin?.passwordHash || 'admin123';

    // Strictly authenticate ONLY against the active/current password
    if (password === validPassword) {
      const activeAdmin = admin || {
        name: 'SS40 Systems Administrator',
        username: 'admin@ss40network.com',
        role: 'Super Admin'
      };
      const settings = (await db.getSettings()) || {};
      return res.json({
        success: true,
        token: 'ss40_admin_token_' + Date.now(),
        admin: {
          name: activeAdmin.name,
          email: activeAdmin.username,
          role: activeAdmin.role,
          company: settings.companyName || 'SS40 NETWORK PRIVATE LIMITED'
        }
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid administrative credentials. Please verify your email and password.'
    });
  } catch (err) {
    console.error('Auth login error:', err);
    res.status(500).json({ success: false, message: 'Server authentication error' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  const token = req.headers.authorization;
  if (token && token.startsWith('Bearer ss40_admin_token_')) {
    const admin = await db.getAdminUser('admin@ss40network.com');
    return res.json({
      authenticated: true,
      admin: admin
    });
  }
  return res.json({ authenticated: false });
});

app.post('/api/auth/verify-password', async (req, res) => {
  try {
    const password = String(req.body.password || '').trim();
    if (!password) {
      return res.status(400).json({ success: false, valid: false, message: 'Password is required' });
    }
    const admin = await db.getAdminUser('admin@ss40network.com');
    const validPassword = String(admin?.passwordHash || '').trim();
    const isValid = Boolean(validPassword && password === validPassword);
    return res.json({ success: true, valid: isValid });
  } catch (err) {
    return res.status(500).json({ success: false, valid: false, message: 'Verification error' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();
    const confirmPassword = String(req.body.confirmPassword || '').trim();

    if (!currentPassword) {
      return res.status(400).json({ success: false, message: 'Please enter your current administrator password.' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters in length.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirmation password do not match.' });
    }

    const admin = await db.getAdminUser('admin@ss40network.com');
    const validPassword = String(admin?.passwordHash || '').trim();

    if (!validPassword || currentPassword !== validPassword) {
      return res.status(401).json({ success: false, message: 'The current password you entered is incorrect. Access denied.' });
    }

    if (newPassword === validPassword) {
      return res.status(400).json({ success: false, message: 'New password cannot be identical to the current password. Please choose a different password.' });
    }

    await db.updateAdminPassword('admin@ss40network.com', newPassword);
    res.json({ success: true, message: 'Administrator password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Failed to update administrator password.' });
  }
});

// -------------------------------------------------------------
// 2. SETTINGS & GEOFENCE ENDPOINTS
// -------------------------------------------------------------
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json({
      success: true,
      isSupabaseConnected: db.isSupabaseActive(),
      settings: settings
    });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const updated = await db.updateSettings(req.body);
    res.json({
      success: true,
      message: 'Office geofence settings updated successfully',
      settings: updated
    });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

app.post('/api/settings/reconcile', async (req, res) => {
  try {
    const result = await db.reconcileMidnightShifts();
    res.json({
      success: true,
      message: `Midnight shift reconciler completed. Reconciled ${result.reconciledCount} unclosed shifts as MISSED_LOGOUT.`,
      result
    });
  } catch (err) {
    console.error('Reconcile error:', err);
    res.status(500).json({ success: false, message: 'Reconciler simulation error' });
  }
});

// -------------------------------------------------------------
// 3. EMPLOYEE CRUD ENDPOINTS
// -------------------------------------------------------------
app.get('/api/employees', async (req, res) => {
  try {
    const employees = await db.getEmployees(req.query);
    res.json({
      success: true,
      count: employees.length,
      employees: employees
    });
  } catch (err) {
    console.error('Get employees error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch employees' });
  }
});

app.get('/api/employees/:id', async (req, res) => {
  try {
    const emp = await db.getEmployeeByIdOrBarcode(req.params.id);
    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const empHistory = await db.getAttendanceLogs({ employeeId: emp.id });
    const totalDays = empHistory.length;
    const onTimeDays = empHistory.filter(a => a.status === 'ON_TIME' || a.status === 'OVERTIME').length;
    const graceDays = empHistory.filter(a => a.status === 'GRACE_PERIOD').length;
    const lateDays = empHistory.filter(a => a.status === 'LATE').length;
    const totalHours = empHistory.reduce((acc, curr) => acc + (parseFloat(curr.hoursWorked) || 0), 0);

    let streak = 0;
    for (const rec of empHistory) {
      if (rec.status === 'ON_TIME' || rec.status === 'OVERTIME' || rec.status === 'GRACE_PERIOD') {
        streak++;
      } else {
        break;
      }
    }

    res.json({
      success: true,
      employee: emp,
      stats: {
        totalDays,
        onTimeDays,
        graceDays,
        lateDays,
        streak,
        punctualityRate: totalDays > 0 ? Math.round(((onTimeDays + graceDays) / totalDays) * 100) : 100,
        averageHours: totalDays > 0 ? (totalHours / totalDays).toFixed(1) : 0
      },
      recentAttendance: empHistory.slice(0, 20)
    });
  } catch (err) {
    console.error('Get single employee error:', err);
    res.status(500).json({ success: false, message: 'Failed to load employee details' });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const department = (req.body.department || req.body.dept || 'SS40 Digital Solutions').trim();
    const designation = (req.body.designation || req.body.role || req.body.title || 'Associate Specialist').trim();
    const phone = (req.body.phone || '').trim();
    const bloodGroup = (req.body.bloodGroup || req.body.blood_group || 'O+').trim();
    const emergencyContact = (req.body.emergencyContact || req.body.emergency_contact || '+91 8300591750').trim();
    const barcode = (req.body.barcode || '').trim();

    if (!name) {
      return res.status(400).json({ success: false, message: 'Employee full legal name is required' });
    }
    if (!email) {
      return res.status(400).json({ success: false, message: 'Employee official email address is required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid official email address format' });
    }

    // Verify duplicate email
    const existing = await db.getEmployeeByEmail(email);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `An employee with email '${email}' is already registered (ID: ${existing.id})`
      });
    }

    const newEmp = await db.createEmployee({
      name,
      email,
      department,
      designation,
      role: designation,
      phone,
      bloodGroup,
      emergencyContact,
      barcode
    });

    res.status(201).json({
      success: true,
      message: `Employee ${newEmp.name} (${newEmp.id}) registered successfully`,
      employee: newEmp
    });
  } catch (err) {
    console.error('Create employee error:', err);
    res.status(err.code === 'EMAIL_EXISTS' ? 400 : 500).json({
      success: false,
      message: err.message || 'Failed to register employee in database'
    });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (!payload.designation && payload.role) {
      payload.designation = payload.role;
    }
    const updated = await db.updateEmployee(req.params.id, payload);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({
      success: true,
      message: 'Employee updated successfully',
      employee: updated
    });
  } catch (err) {
    console.error('Update employee error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update employee' });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const isPermanent = req.query.permanent === 'true' || req.query.force === 'true';
    if (isPermanent) {
      const ok = await db.deleteEmployee(req.params.id);
      if (!ok) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
      return res.json({
        success: true,
        message: 'Employee permanently deleted from records'
      });
    }

    const toggled = await db.toggleEmployeeStatus(req.params.id);
    if (!toggled) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({
      success: true,
      message: `Employee marked as ${toggled.status}`,
      employee: toggled
    });
  } catch (err) {
    console.error('Delete/Toggle employee error:', err);
    res.status(500).json({ success: false, message: 'Failed to process employee deletion' });
  }
});

// -------------------------------------------------------------
// 4. SMART ATTENDANCE SCAN & PUNCH ENDPOINT
// -------------------------------------------------------------
app.post('/api/attendance/punch', async (req, res) => {
  try {
    const barcodeOrId = String(req.body.barcodeOrId || req.body.barcode || req.body.id || '').trim();
    const { method = 'CAMERA_BARCODE', action } = req.body;
    const rawLat = req.body.lat ?? req.body.coords?.latitude ?? req.body.coords?.lat;
    const rawLng = req.body.lng ?? req.body.coords?.longitude ?? req.body.coords?.lng;
    const rawAccuracy = req.body.accuracy ?? req.body.coords?.accuracy;
    const settings = await db.getSettings();

    if (!barcodeOrId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_BARCODE',
        message: 'Barcode or Employee ID is required.'
      });
    }

    // 1. Identify employee
    const employee = await db.getEmployeeByIdOrBarcode(barcodeOrId);

    if (!employee) {
      return res.status(404).json({
        success: false,
        code: 'EMPLOYEE_NOT_FOUND',
        message: `No active employee record matches identifier "${barcodeOrId}".`
      });
    }

    if (employee.status !== 'Active') {
      return res.status(403).json({
        success: false,
        code: 'EMPLOYEE_INACTIVE',
        message: `Employee account (${employee.name}) is currently inactive. Please contact HR Administration.`
      });
    }

    // 2. Geofence & Location Strict Validation
    const userLat = parseFloat(rawLat);
    const userLng = parseFloat(rawLng);
    const userAccuracy = parseFloat(rawAccuracy) || 15;

    if (isNaN(userLat) || isNaN(userLng)) {
      return res.status(400).json({
        success: false,
        code: 'LOCATION_REQUIRED',
        message: 'High-precision physical GPS coordinates are required for attendance verification.'
      });
    }

    // Calculate authentic physical Haversine distance
    const distanceMeters = calculateDistanceMeters(
      userLat,
      userLng,
      settings.officeLat,
      settings.officeLng
    );

    // Strict physical geofence verification (allowed radius: 150m for Sree Puram, Tirunelveli)
    const allowedRadiusMeters = settings.radiusMeters || 150;
    const isInside = distanceMeters <= allowedRadiusMeters;

    if (!isInside) {
      return res.status(403).json({
        success: false,
        code: 'GEOFENCE_VIOLATION',
        status: 'Absent',
        message: 'You are not in the range',
        employee: {
          id: employee.id,
          name: employee.name,
          department: employee.department
        },
        geofence: {
          officeName: settings.companyName,
          officeAddress: settings.address,
          distanceMeters: distanceMeters,
          allowedRadiusMeters: allowedRadiusMeters,
          userCoords: { lat: userLat, lng: userLng, accuracy: userAccuracy },
          officeCoords: { lat: settings.officeLat, lng: settings.officeLng }
        }
      });
    }

    // 3. Process Attendance & Break Actions
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const isoTimestamp = now.toISOString();
    const timeFormatted = format12Hour(now);

    const todayRecords = await db.getAttendanceLogs({
      date: todayStr,
      employeeId: employee.id
    });
    const todayRecord = todayRecords.length > 0 ? todayRecords[0] : null;

    const [shiftHour, shiftMin] = settings.shiftStartTime.split(':').map(Number);
    const graceWindowMinutes = settings.graceMinutes || 15;
    const currentMinutesFromMidnight = now.getHours() * 60 + now.getMinutes();
    const shiftStartMinutes = shiftHour * 60 + shiftMin;

    if (!todayRecord) {
      // ---------------------------------------------------------
      // ACTION: CHECK-IN (PUNCH IN)
      // User is INSIDE geofence: attendance marked as Present
      // ---------------------------------------------------------
      let status = 'Present';
      if (currentMinutesFromMidnight <= shiftStartMinutes) {
        status = 'Present';
      } else if (currentMinutesFromMidnight <= shiftStartMinutes + graceWindowMinutes) {
        status = 'GRACE_PERIOD';
      } else {
        status = 'LATE';
      }

      const newRecordId = `ATT-${todayStr.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

      const newRecord = {
        id: newRecordId,
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department,
        designation: employee.designation,
        date: todayStr,
        checkIn: isoTimestamp,
        checkInTime: timeFormatted,
        checkOut: null,
        checkOutTime: null,
        breakStart: null,
        breakStartTime: null,
        breakEnd: null,
        breakEndTime: null,
        breakMinutes: 0,
        hoursWorked: null,
        status: status,
        method: method,
        location: {
          lat: userLat,
          lng: userLng,
          distanceMeters: distanceMeters,
          accuracy: userAccuracy,
          isInside: true,
          address: settings.address
        }
      };

      await db.createAttendanceLog(newRecord);

      return res.json({
        success: true,
        action: 'CHECK_IN',
        message: `Punch In Recorded for ${employee.name}`,
        time: timeFormatted,
        status: status,
        record: newRecord,
        employee: employee,
        greeting: `Welcome, ${employee.name.split(' ')[0]}! Clocked in at ${timeFormatted}.`
      });
    } else if (!todayRecord.checkOut) {
      const isOnBreak = Boolean(todayRecord.breakStart && !todayRecord.breakEnd);

      // Handle explicit Break Start
      if (action === 'BREAK_START') {
        if (isOnBreak) {
          return res.json({
            success: true,
            action: 'ALREADY_ON_BREAK',
            message: `${employee.name} is already on break since ${todayRecord.breakStartTime || todayRecord.breakStart}.`,
            employee: employee,
            record: todayRecord
          });
        }

        const updated = await db.updateAttendanceLog(todayRecord.id, {
          breakStart: isoTimestamp,
          breakStartTime: timeFormatted,
          breakEnd: null,
          breakEndTime: null,
          status: 'ON_BREAK'
        });

        return res.json({
          success: true,
          action: 'BREAK_START',
          message: `Break Started for ${employee.name}`,
          time: timeFormatted,
          status: 'ON_BREAK',
          record: updated,
          employee: employee,
          greeting: `Enjoy your break, ${employee.name.split(' ')[0]}! Clocked out for break at ${timeFormatted}.`
        });
      }

      // Handle explicit Break End (Resume Work)
      if (action === 'BREAK_END' || (isOnBreak && (!action || action === 'AUTO'))) {
        const breakStartMs = todayRecord.breakStart ? new Date(todayRecord.breakStart).getTime() : now.getTime();
        const durationMins = Math.max(1, Math.round((now.getTime() - breakStartMs) / (1000 * 60)));
        const totalBreakMinutes = (parseFloat(todayRecord.breakMinutes) || 0) + durationMins;
        const restoredStatus = todayRecord.status === 'ON_BREAK' ? 'ON_TIME' : todayRecord.status;

        const updated = await db.updateAttendanceLog(todayRecord.id, {
          breakEnd: isoTimestamp,
          breakEndTime: timeFormatted,
          breakMinutes: totalBreakMinutes,
          status: restoredStatus
        });

        return res.json({
          success: true,
          action: 'BREAK_END',
          message: `Resumed from Break for ${employee.name}`,
          time: timeFormatted,
          breakDurationMinutes: durationMins,
          totalBreakMinutes: totalBreakMinutes,
          status: restoredStatus,
          record: updated,
          employee: employee,
          greeting: `Welcome back, ${employee.name.split(' ')[0]}! Break ended at ${timeFormatted} (${durationMins}m).`
        });
      }

      // If already clocked in and not on break, and action is not specified: prompt choices
      if (!action || action === 'AUTO') {
        return res.json({
          success: true,
          requiresAction: true,
          employee: employee,
          currentStatus: 'CLOCKED_IN',
          checkInTime: todayRecord.checkInTime,
          record: todayRecord,
          allowedActions: ['BREAK_START', 'CHECK_OUT'],
          message: `${employee.name} is currently clocked in since ${todayRecord.checkInTime}. Choose an action below:`
        });
      }

      // Handle Check-Out (Punch Out)
      if (action === 'CHECK_OUT') {
        let totalBreakMinutes = parseFloat(todayRecord.breakMinutes) || 0;
        if (isOnBreak) {
          const breakStartMs = new Date(todayRecord.breakStart).getTime();
          totalBreakMinutes += Math.max(1, Math.round((now.getTime() - breakStartMs) / (1000 * 60)));
        }

        const checkInDate = new Date(todayRecord.checkIn);
        const diffMs = now.getTime() - checkInDate.getTime();
        const netHours = Math.max(0, (diffMs / (1000 * 60 * 60)) - (totalBreakMinutes / 60));
        const hoursWorked = parseFloat(netHours.toFixed(2));

        const [endHour, endMin] = settings.shiftEndTime.split(':').map(Number);
        const shiftEndMinutes = endHour * 60 + endMin;

        let finalStatus = todayRecord.status;
        if (finalStatus === 'ON_BREAK') finalStatus = 'ON_TIME';
        if (currentMinutesFromMidnight < shiftEndMinutes - 30) {
          finalStatus = (finalStatus === 'LATE') ? 'LATE' : 'EARLY_LEAVING';
        } else if (currentMinutesFromMidnight > shiftEndMinutes + 45 && finalStatus === 'ON_TIME') {
          finalStatus = 'OVERTIME';
        }

        const updated = await db.updateAttendanceLog(todayRecord.id, {
          checkOut: isoTimestamp,
          checkOutTime: timeFormatted,
          breakMinutes: totalBreakMinutes,
          hoursWorked: hoursWorked,
          status: finalStatus
        });

        return res.json({
          success: true,
          action: 'CHECK_OUT',
          message: `Punch Out Recorded for ${employee.name}`,
          time: timeFormatted,
          status: finalStatus,
          hoursWorked: hoursWorked,
          totalBreakMinutes: totalBreakMinutes,
          record: updated,
          employee: employee,
          greeting: `Good work, ${employee.name.split(' ')[0]}! Total hours today: ${hoursWorked} hrs. Clocked out at ${timeFormatted}.`
        });
      }
    } else {
      // Already checked in and checked out today
      return res.json({
        success: true,
        action: 'ALREADY_COMPLETED',
        message: `${employee.name} has already completed shifts for today.`,
        record: todayRecord,
        employee: employee,
        greeting: `${employee.name} already clocked out at ${todayRecord.checkOutTime} (${todayRecord.hoursWorked} hrs).`
      });
    }
  } catch (err) {
    console.error('Punch processing error:', err);
    res.status(500).json({ success: false, message: 'Internal transaction processing error' });
  }
});

// -------------------------------------------------------------
// 5. TODAY'S LIVE OVERVIEW & METRICS
// -------------------------------------------------------------
app.get('/api/attendance/today', async (req, res) => {
  try {
    const todayStr = getLocalDateString();
    const activeEmployees = await db.getEmployees({ status: 'Active' });
    const todayRecords = await db.getAttendanceLogs({ date: todayStr });

    const presentEmpIds = new Set(todayRecords.map(a => a.employeeId));
    const absentees = activeEmployees.filter(e => !presentEmpIds.has(e.id));

    const currentlyClockedIn = todayRecords.filter(a => a.checkIn && !a.checkOut);
    const clockedOut = todayRecords.filter(a => a.checkOut);

    const onBreak = currentlyClockedIn.filter(a => a.status === 'ON_BREAK' || (a.breakStart && !a.breakEnd));
    const onLunch = currentlyClockedIn.filter(a => a.status === 'ON_LUNCH');
    const loggedIn = currentlyClockedIn.filter(a => a.status !== 'ON_BREAK' && a.status !== 'ON_LUNCH' && !(a.breakStart && !a.breakEnd));

    const onTimeCount = todayRecords.filter(a => a.status === 'ON_TIME' || a.status === 'OVERTIME' || a.status === 'Present' || a.status === 'PRESENT').length;
    const graceCount = todayRecords.filter(a => a.status === 'GRACE_PERIOD').length;
    const lateCount = todayRecords.filter(a => a.status === 'LATE').length;

    res.json({
      success: true,
      date: todayStr,
      totalEmployees: activeEmployees.length,
      totalPresent: todayRecords.length,
      currentlyActive: currentlyClockedIn.length,
      completedShift: clockedOut.length,
      totalAbsent: absentees.length,
      attendanceRate: activeEmployees.length > 0 ? Math.round((todayRecords.length / activeEmployees.length) * 100) : 0,
      counts: {
        totalStaff: activeEmployees.length,
        loggedIn: loggedIn.length,
        onBreak: onBreak.length,
        onLunch: onLunch.length,
        loggedOut: clockedOut.length,
        notLoggedIn: absentees.length
      },
      breakdown: {
        onTime: onTimeCount,
        gracePeriod: graceCount,
        late: lateCount
      },
      todayLogs: todayRecords,
      absentees: absentees
    });
  } catch (err) {
    console.error('Get today overview error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch today metrics' });
  }
});

// -------------------------------------------------------------
// 6. HISTORICAL STATS & HEATMAP
// -------------------------------------------------------------
app.get('/api/attendance/stats', async (req, res) => {
  try {
    const attendance = await db.getAttendanceLogs();
    const employees = await db.getEmployees({ status: 'Active' });

    const dateMap = {};
    attendance.forEach(rec => {
      if (!dateMap[rec.date]) {
        dateMap[rec.date] = {
          date: rec.date,
          count: 0,
          onTime: 0,
          grace: 0,
          late: 0,
          records: []
        };
      }
      dateMap[rec.date].count++;
      if (rec.status === 'ON_TIME' || rec.status === 'OVERTIME' || rec.status === 'Present' || rec.status === 'PRESENT') dateMap[rec.date].onTime++;
      if (rec.status === 'GRACE_PERIOD') dateMap[rec.date].grace++;
      if (rec.status === 'LATE') dateMap[rec.date].late++;
      dateMap[rec.date].records.push(rec);
    });

    const totalLogs = attendance.length;
    const onTimeLogs = attendance.filter(a => a.status === 'ON_TIME' || a.status === 'OVERTIME' || a.status === 'Present' || a.status === 'PRESENT').length;
    const graceLogs = attendance.filter(a => a.status === 'GRACE_PERIOD').length;
    const lateLogs = attendance.filter(a => a.status === 'LATE').length;

    const punctualityScore = totalLogs > 0 ? Math.round(((onTimeLogs + graceLogs) / totalLogs) * 100) : 100;

    const employeeStreaks = employees.map(emp => {
      const empLogs = attendance
        .filter(a => a.employeeId === emp.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      let streak = 0;
      for (const log of empLogs) {
        if (log.status === 'ON_TIME' || log.status === 'OVERTIME' || log.status === 'GRACE_PERIOD' || log.status === 'Present' || log.status === 'PRESENT') {
          streak++;
        } else {
          break;
        }
      }

      const onTimeCount = empLogs.filter(a => a.status === 'ON_TIME' || a.status === 'OVERTIME' || a.status === 'Present' || a.status === 'PRESENT').length;
      const graceCount = empLogs.filter(a => a.status === 'GRACE_PERIOD').length;
      const lateCount = empLogs.filter(a => a.status === 'LATE').length;
      const totalEmpLogs = empLogs.length;
      const consistencyRate = totalEmpLogs > 0 ? Math.round(((onTimeCount + graceCount) / totalEmpLogs) * 100) : 100;

      return {
        id: emp.id,
        name: emp.name,
        department: emp.department,
        designation: emp.designation,
        avatarColor: emp.avatarColor,
        streak: streak,
        totalAttendance: totalEmpLogs,
        onTimeCount,
        graceCount,
        lateCount,
        consistencyRate,
        lastCheckIn: empLogs.length > 0 ? empLogs[0].checkInTime : null,
        lastStatus: empLogs.length > 0 ? empLogs[0].status : null
      };
    }).sort((a, b) => b.streak - a.streak || b.consistencyRate - a.consistencyRate);

    res.json({
      success: true,
      summary: {
        totalLogs,
        onTimeLogs,
        graceLogs,
        lateLogs,
        punctualityScore,
        activeStaffCount: employees.length
      },
      heatmapData: Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date)),
      topStreaks: employeeStreaks.slice(0, 10),
      allEmployeePerformance: employeeStreaks
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch attendance stats' });
  }
});

// -------------------------------------------------------------
// 7. ATTENDANCE LOGS & CSV EXPORT
// -------------------------------------------------------------
app.get('/api/attendance', async (req, res) => {
  try {
    const list = await db.getAttendanceLogs(req.query);
    res.json({
      success: true,
      count: list.length,
      attendance: list
    });
  } catch (err) {
    console.error('Get attendance logs error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch attendance logs' });
  }
});

app.get('/api/attendance/export', async (req, res) => {
  try {
    const departmentFilter = req.query.department;
    const query = { ...req.query };
    if (departmentFilter === 'all' || !departmentFilter) {
      delete query.department;
    }

    const list = await db.getAttendanceLogs(query);

    const headers = [
      'Record ID',
      'Date',
      'Employee ID',
      'Employee Name',
      'Department',
      'Designation',
      'Check-In Time',
      'Check-Out Time',
      'Hours Worked',
      'Status Flag',
      'Verification Method',
      'Distance from Office (m)',
      'GPS Accuracy (m)'
    ];

    const rows = list.map(a => [
      `"${a.id}"`,
      `"${a.date}"`,
      `"${a.employeeId}"`,
      `"${a.employeeName}"`,
      `"${a.department}"`,
      `"${a.designation}"`,
      `"${a.checkInTime || 'N/A'}"`,
      `"${a.checkOutTime || 'Active (Clocked In)'}"`,
      `"${a.hoursWorked !== null && a.hoursWorked !== undefined ? a.hoursWorked : 'In Progress'}"`,
      `"${a.status}"`,
      `"${a.method}"`,
      `"${a.location ? a.location.distanceMeters : 'N/A'}"`,
      `"${a.location ? a.location.accuracy : 'N/A'}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

    const deptSlug = (departmentFilter && departmentFilter !== 'all')
      ? departmentFilter.replace(/[^a-zA-Z0-9]/g, '_')
      : 'Total_Company';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="SS40_Network_Attendance_Report_${deptSlug}_${getLocalDateString()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export CSV error:', err);
    res.status(500).json({ success: false, message: 'Could not generate CSV report' });
  }
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` SS40 NETWORK PRIVATE LIMITED - SMART ATTENDANCE SYSTEM `);
  console.log(` Server active on: http://localhost:${PORT}`);
  console.log(` Database: ${db.isSupabaseActive() ? 'Supabase PostgreSQL' : 'Persistent SQLite Database (database/attendance.db)'}`);
  console.log(` Geofence Target: Municipal Corporation Incubation Centre`);
  console.log(` Office Coordinates: 8.728512, 77.727438 (Radius: 150m)`);
  console.log(`=======================================================`);
});

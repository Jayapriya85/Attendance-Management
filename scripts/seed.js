const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const rawData = fs.readFileSync(dbPath, 'utf8');
const db = JSON.parse(rawData);

const employees = db.employees;
const attendance = [];

// Date range: September 1, 2026 to October 9, 2026
const startDate = new Date(2026, 8, 1); // Month is 0-indexed, 8 = Sept
const endDate = new Date(2026, 9, 9);   // 9 = Oct

const methods = ['CAMERA_BARCODE', 'USB_HARDWARE', 'CAMERA_BARCODE', 'USB_HARDWARE', 'MANUAL_KIOSK'];

let idCounter = 1000;

for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
  const dayOfWeek = d.getDay();
  // Skip Sundays (0). Workdays Mon-Sat (SS40 operates Mon-Sat as per site schema!)
  if (dayOfWeek === 0) continue;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const isToday = (dateStr === '2026-10-09');

  employees.forEach((emp, index) => {
    // 95% attendance probability, occasional leave
    const seed = (d.getDate() * 17 + index * 31) % 100;
    if (seed < 7 && !isToday) return; // Leave day

    // Determine status & check-in time
    // Shift is 09:30 - 18:30
    let status = 'ON_TIME';
    let inHour = 9;
    let inMin = 15 + ((seed * 3) % 15); // 09:15 to 09:29

    // Some grace period (09:31 - 09:44)
    if (seed > 75 && seed <= 88) {
      status = 'GRACE_PERIOD';
      inHour = 9;
      inMin = 31 + (seed % 13);
    } else if (seed > 88) {
      status = 'LATE';
      inHour = 9;
      inMin = 46 + (seed % 25);
      if (inMin >= 60) {
        inHour = 10;
        inMin = inMin - 60;
      }
    }

    const inSec = 10 + (seed % 45);
    const inTimeStr = `${String(inHour).padStart(2, '0')}:${String(inMin).padStart(2, '0')}:${String(inSec).padStart(2, '0')}`;
    const checkInIso = `${dateStr}T${inTimeStr}+05:30`;

    // Format 12-hour AM/PM
    const ampmIn = inHour >= 12 ? 'PM' : 'AM';
    const displayHourIn = inHour % 12 || 12;
    const formattedCheckIn = `${String(displayHourIn).padStart(2, '0')}:${String(inMin).padStart(2, '0')} ${ampmIn}`;

    let checkOutIso = null;
    let formattedCheckOut = null;
    let hoursWorked = null;

    if (!isToday || (isToday && index < 4)) {
      // Past days or some checked out today
      let outHour = 18;
      let outMin = 30 + ((seed * 7) % 35); // 18:30 - 19:05
      let outSec = 15 + (seed % 40);

      if (outMin >= 60) {
        outHour = 19;
        outMin = outMin - 60;
      }

      // Occasional early leave
      if (seed === 42 || seed === 73) {
        status = (status === 'LATE') ? 'LATE' : 'EARLY_LEAVING';
        outHour = 17;
        outMin = 45;
      }

      if (outHour >= 19 && outMin >= 15) {
        if (status === 'ON_TIME') status = 'OVERTIME';
      }

      const outTimeStr = `${String(outHour).padStart(2, '0')}:${String(outMin).padStart(2, '0')}:${String(outSec).padStart(2, '0')}`;
      checkOutIso = `${dateStr}T${outTimeStr}+05:30`;
      const ampmOut = outHour >= 12 ? 'PM' : 'AM';
      const displayHourOut = outHour % 12 || 12;
      formattedCheckOut = `${String(displayHourOut).padStart(2, '0')}:${String(outMin).padStart(2, '0')} ${ampmOut}`;

      const diffMs = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
      hoursWorked = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
    }

    const method = methods[(index + d.getDate()) % methods.length];
    const distanceMeters = Math.floor(10 + (seed % 45)); // inside perimeter (10m - 55m from office center)

    idCounter++;
    attendance.push({
      id: `ATT-${yyyy}${mm}${dd}-${idCounter}`,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      designation: emp.designation,
      date: dateStr,
      checkIn: checkInIso,
      checkInTime: formattedCheckIn,
      checkOut: checkOutIso,
      checkOutTime: formattedCheckOut,
      hoursWorked: hoursWorked,
      status: status,
      method: method,
      location: {
        lat: 8.728512 + (Math.random() - 0.5) * 0.0002,
        lng: 77.727438 + (Math.random() - 0.5) * 0.0002,
        distanceMeters: distanceMeters,
        accuracy: Math.floor(8 + (seed % 15)),
        isInside: true,
        address: "SS40 Network Incubation Centre, Tirunelveli"
      }
    });
  });
}

db.attendance = attendance;
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log(`Seeded ${attendance.length} attendance records successfully.`);

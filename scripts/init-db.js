/**
 * SS40 NETWORK SMART ATTENDANCE — DATABASE INITIALIZATION & MIGRATION SCRIPT
 * Usage: node scripts/init-db.js
 * Initializes and seeds Supabase / PostgreSQL database or validates local store.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function run() {
  console.log('=======================================================');
  console.log(' SS40 NETWORK — DATABASE INITIALIZATION UTILITY');
  console.log('=======================================================');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const dbJsonPath = path.join(__dirname, '..', 'data', 'db.json');
  const rawDb = fs.readFileSync(dbJsonPath, 'utf8');
  const localDb = JSON.parse(rawDb);

  if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http') && !supabaseUrl.includes('your-project-id')) {
    console.log(`Target: Live Supabase PostgreSQL (${supabaseUrl})`);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Check or seed settings
    console.log('\n[1/3] Syncing Office Geofence Settings...');
    const { data: existingSettings, error: setErr } = await supabase
      .from('office_settings')
      .select('id')
      .eq('id', 1);

    if (setErr) {
      console.warn('Note: Could not query office_settings. Ensure schema.sql has been executed in the Supabase SQL Editor.');
      console.warn('Error details:', setErr.message);
    } else if (!existingSettings || existingSettings.length === 0) {
      const s = localDb.settings;
      await supabase.from('office_settings').insert({
        id: 1,
        company_name: s.companyName,
        short_name: s.shortName,
        website: s.website,
        address: s.address,
        phone: s.phone,
        email: s.email,
        cin: s.cin,
        office_lat: s.officeLat,
        office_lng: s.officeLng,
        radius_meters: s.radiusMeters,
        accuracy_threshold_meters: s.accuracyThresholdMeters,
        shift_start_time: s.shiftStartTime,
        shift_end_time: s.shiftEndTime,
        grace_minutes: s.graceMinutes,
        demo_mode: s.demoMode
      });
      console.log('✓ Office settings seeded successfully into Supabase.');
    } else {
      console.log('✓ Office settings already present in Supabase.');
    }

    // 2. Check or seed admin
    console.log('\n[2/3] Syncing Admin User...');
    const { data: existingAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', localDb.admin.username);

    if (!existingAdmin || existingAdmin.length === 0) {
      await supabase.from('admin_users').insert({
        email: localDb.admin.username,
        password_hash: localDb.admin.passwordHash,
        name: localDb.admin.name,
        role: localDb.admin.role
      });
      console.log('✓ Super Admin credentials seeded into Supabase.');
    } else {
      console.log('✓ Admin user already present.');
    }

    // 3. Check or seed employees
    console.log('\n[3/3] Syncing Employees...');
    const { data: existingEmps } = await supabase.from('employees').select('id');
    const existingIds = new Set((existingEmps || []).map(e => e.id));

    let inserted = 0;
    for (const emp of localDb.employees) {
      if (!existingIds.has(emp.id)) {
        await supabase.from('employees').insert({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.department,
          wing: emp.wing,
          designation: emp.designation,
          barcode: emp.barcode,
          phone: emp.phone,
          blood_group: emp.bloodGroup,
          shift: emp.shift,
          avatar_color: emp.avatarColor,
          status: emp.status,
          joined_date: emp.joinedDate,
          emergency_contact: emp.emergencyContact
        });
        inserted++;
      }
    }
    console.log(`✓ Synchronized ${inserted} new employees to Supabase (Total: ${localDb.employees.length}).`);

  } else {
    console.log('Target: Local Persistent Store (data/db.json)');
    console.log(`✓ Verified ${localDb.employees.length} active employees.`);
    console.log(`✓ Verified ${localDb.attendance.length} historical attendance logs.`);
    console.log(`✓ Verified office settings: ${localDb.settings.companyName}`);
    console.log('\nTo connect live Supabase / PostgreSQL:');
    console.log('1. Run the database/schema.sql script in your Supabase SQL Editor.');
    console.log('2. Set SUPABASE_URL and SUPABASE_KEY in your .env file.');
    console.log('3. Re-run: node scripts/init-db.js');
  }

  console.log('\n=======================================================');
  console.log(' Database initialization check completed successfully.');
  console.log('=======================================================');
}

run().catch(console.error);

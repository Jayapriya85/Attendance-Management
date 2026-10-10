-- ============================================================================
-- SS40 NETWORK PRIVATE LIMITED — SMART ATTENDANCE SYSTEM
-- Supabase / PostgreSQL Production Database Schema
-- Location: Tirunelveli Municipal Corporation Incubation Centre (8.728512, 77.727438)
-- ============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ADMIN USERS TABLE
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Super Admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EMPLOYEES TABLE
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'SS40-EMP-1001'
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    department VARCHAR(100) NOT NULL,
    wing VARCHAR(100) NOT NULL,
    designation VARCHAR(150) NOT NULL,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(50) NOT NULL,
    blood_group VARCHAR(10) DEFAULT 'O+',
    shift VARCHAR(50) DEFAULT '09:30 - 18:30',
    avatar_color VARCHAR(20) DEFAULT '#0F766E',
    status VARCHAR(20) DEFAULT 'Active', -- 'Active' | 'Inactive'
    joined_date DATE DEFAULT CURRENT_DATE,
    emergency_contact VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ATTENDANCE LOGS TABLE
CREATE TABLE IF NOT EXISTS attendance_logs (
    id VARCHAR(100) PRIMARY KEY, -- e.g. 'ATT-20261010-1001'
    employee_id VARCHAR(50) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    designation VARCHAR(150),
    date DATE NOT NULL,
    check_in TIMESTAMPTZ NOT NULL,
    check_in_time VARCHAR(20) NOT NULL,
    check_out TIMESTAMPTZ,
    check_out_time VARCHAR(20),
    hours_worked NUMERIC(5, 2),
    status VARCHAR(30) NOT NULL, -- 'ON_TIME', 'GRACE_PERIOD', 'LATE', 'EARLY_LEAVING', 'OVERTIME'
    method VARCHAR(30) NOT NULL, -- 'CAMERA_BARCODE', 'USB_HARDWARE', 'MANUAL_KIOSK'
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_meters INTEGER NOT NULL,
    accuracy DOUBLE PRECISION,
    is_inside BOOLEAN DEFAULT TRUE,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. OFFICE GEOFENCE & POLICY SETTINGS TABLE
CREATE TABLE IF NOT EXISTS office_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    company_name VARCHAR(255) NOT NULL DEFAULT 'SS40 NETWORK PRIVATE LIMITED',
    short_name VARCHAR(100) NOT NULL DEFAULT 'SS40 NETWORK',
    website VARCHAR(255) DEFAULT 'https://ss40network.com',
    address TEXT NOT NULL DEFAULT '1st Floor, Municipal Corporation Incubation Centre (Near by trade centre), Sree Puram, Tirunelveli, Tamil Nadu 627001',
    phone VARCHAR(50) DEFAULT '+91 8300591750',
    email VARCHAR(255) DEFAULT 'support@ss40network.com',
    cin VARCHAR(50) DEFAULT 'U72900TN2023PTC160892',
    office_lat DOUBLE PRECISION NOT NULL DEFAULT 8.728512,
    office_lng DOUBLE PRECISION NOT NULL DEFAULT 77.727438,
    radius_meters INTEGER NOT NULL DEFAULT 150,
    accuracy_threshold_meters INTEGER NOT NULL DEFAULT 50,
    shift_start_time VARCHAR(10) NOT NULL DEFAULT '09:30',
    shift_end_time VARCHAR(10) NOT NULL DEFAULT '18:30',
    grace_minutes INTEGER NOT NULL DEFAULT 15,
    demo_mode VARCHAR(30) DEFAULT 'REAL_GPS',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CREATE INDEXES FOR FAST QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_logs(date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_logs(status);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_barcode ON employees(barcode);

-- 5. INITIAL SEED DATA FOR ADMIN & SETTINGS
INSERT INTO admin_users (email, password_hash, name, role)
VALUES (
    'admin@ss40network.com',
    'admin123', -- Can be bcrypt hashed
    'SS40 Systems Administrator',
    'Super Admin'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO office_settings (id, company_name, short_name, office_lat, office_lng, radius_meters, shift_start_time, shift_end_time, grace_minutes)
VALUES (
    1,
    'SS40 NETWORK PRIVATE LIMITED',
    'SS40 NETWORK',
    8.728512,
    77.727438,
    150,
    '09:30',
    '18:30',
    15
)
ON CONFLICT (id) DO UPDATE SET
    office_lat = EXCLUDED.office_lat,
    office_lng = EXCLUDED.office_lng,
    radius_meters = EXCLUDED.radius_meters;

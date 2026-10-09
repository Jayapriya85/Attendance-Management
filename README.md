# SS40 NETWORK PRIVATE LIMITED — Smart Attendance Management System

A production-ready, highly secure, and responsive Smart Attendance Web Application architected for **SS40 Network Private Limited** ([https://ss40network.com/](https://ss40network.com/)).

Registered Office: **1st Floor, Municipal Corporation Incubation Centre (Near by trade centre), Sree Puram, Tirunelveli, Tamil Nadu 627001.**

---

## 🌟 Key Architectural Features

### 1. Dual Barcode Scanning Engine
- **Mobile / Camera Mode:** Built-in WebRTC barcode scanner using `Html5Qrcode` supporting **Code-128**, **Code-39**, **QR Code**, and **EAN-13** with holographic laser sweeping animation, aiming corner brackets, and camera flipping (Front / Environment).
- **Desktop / Front-Desk Kiosk Mode:** High-speed hardware keystroke listener that intercepts handheld **USB or Bluetooth barcode scanners** (detecting keystroke bursts `< 60ms` ending in `Enter`), alongside manual Employee ID entry with autocomplete.
- **Interactive Quick-Test Badges Shelf:** Allows one-click simulated scans for registered SS40 employees across all 3 business wings.

### 2. Strict Geofencing Location Lock
- Attendance can **ONLY** be marked if the employee's GPS coordinates fall within SS40 Network's exact office location radius (**Municipal Corporation Incubation Centre, Sree Puram, Tirunelveli: `8.728512° N, 77.727438° E`**).
- Real-time Haversine distance calculation with strict accuracy threshold verification.
- **Stylized Geofence Warning Modal:** If an employee attempts to scan outside the allowed perimeter, a corporate restriction modal is displayed:
  > *"You are outside the SS40 Network office premises. Please move to the designated work zone."*
- **Built-in Testing Controls:** Instant toggles for `Inside Office (24m)`, `Outside Office (485m)`, and `Live Device GPS`, plus an administrative *"Set Office to My Current GPS"* calibration button.

### 3. Smart Status Flagging & Policy Automation
- **Shift Schedule:** 09:30 AM to 06:30 PM (Configurable via Admin Settings).
- **On-Time (Emerald Green):** Clocked in on or before 09:30 AM.
- **Grace Period (Warm Amber):** Clocked in during the 15-minute grace window (09:31 AM – 09:45 AM).
- **Late-Coming (Subtle Rose):** Clocked in after the grace period (> 09:45 AM).
- **Early-Leaving (Orange):** Clocked out before shift conclusion.
- **Overtime (Violet):** Shift extended beyond designated hours.

### 4. Comprehensive Admin Control Center
- **Summary KPI Metrics:** Registered staff, present count, currently active on floor, and overall punctuality score.
- **Live Activity Feed:** Streaming real-time punch logs with timestamps, verification methods, and GPS accuracy.
- **Employee CRUD Registry:** Add new employees (auto-generates sequential IDs like `SS40-EMP-1009` and barcodes), edit details, or toggle active/inactive status.
- **Individual Employee Tracking:** Inspect day-by-day punch logs, personal on-time streak tracker, and average daily hours worked.
- **Monthly Attendance Heatmap:** GitHub-style 30-day visual contribution matrix showing attendance consistency and punctuality intensity.
- **Digital ID Badge Studio:** Generates official SS40 Network corporate ID badges featuring employee avatar, blood group, emergency contact, company seal, and scannable Code-128 barcode rendered via `JsBarcode` with print stylesheet.
- **Report Export:** Instant export of attendance logs to formatted **CSV**.

### 5. Corporate Web Audio Feedback (Zero-Latency)
- Synthesizes crisp corporate chimes via the **Web Audio API** without external audio file dependencies:
  - Double corporate chime (587Hz -> 880Hz) on Check-In.
  - Three-note harmonic chord on Check-Out.
  - Low-frequency alert buzzer on Geofence perimeter violation.

---

## 🚀 Running the Application

### Prerequisites
- Node.js (v18+ or v24+)
- npm

### Installation & Launch
```bash
# 1. Install dependencies
npm install

# 2. Start the application
npm start
```

The web application runs on **`http://localhost:3000`**.

### Administrative Credentials
- **Portal URL:** Click **"Admin Control Center"** in the top navigation bar.
- **Email:** `admin@ss40network.com`
- **Password:** `admin123`
- *(Or click the **"⚡ Quick Demo 1-Click Login"** button inside the login modal).*

---

## 🏢 Company Profile Reference
- **Legal Entity:** SS40 NETWORK PRIVATE LIMITED
- **CIN:** U72900TN2023PTC160892
- **Website:** https://ss40network.com/
- **Address:** 1st Floor, Municipal Corporation Incubation Centre, Sree Puram, Tirunelveli, Tamil Nadu 627001
- **Business Wings:**
  1. **SS40 Digital Solutions:** Enterprise Custom Software, Web & Mobile Platforms
  2. **SS40 SaaS Products:** ClearInvoice, GTC Suite, AI Email Agent
  3. **SS40 Tech Academics:** Career Launching Tech Training & Internships

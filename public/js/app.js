/**
 * SS40 NETWORK PRIVATE LIMITED - SMART ATTENDANCE APPLICATION
 * Master Application Controller & UI State Manager
 */

document.addEventListener('DOMContentLoaded', async () => {
  // State
  let currentView = 'kiosk'; // 'kiosk' | 'admin'
  let currentScanMode = 'camera'; // 'camera' | 'usb'
  let adminAuthenticated = false;
  let activeAdminTab = 'feed';
  let punchAutoDismissTimer = null;
  let cachedEmployees = [];
  let cachedSettings = {};

  // DOM Elements Cache
  const kioskView = document.getElementById('view-kiosk');
  const adminView = document.getElementById('view-admin');
  const navKioskBtn = document.getElementById('nav-kiosk-btn');
  const navAdminBtn = document.getElementById('nav-admin-btn');
  const liveClockEl = document.getElementById('live-clock');
  const liveDateEl = document.getElementById('live-date');
  const geofenceBadge = document.getElementById('geofence-live-badge');
  const geofenceDistText = document.getElementById('geofence-dist-text');
  const audioToggleBtn = document.getElementById('audio-toggle-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  // Modals
  const punchModal = document.getElementById('punch-modal');
  const geofenceAlertModal = document.getElementById('geofence-alert-modal');
  const adminLoginModal = document.getElementById('admin-login-modal');
  const employeeModal = document.getElementById('employee-modal');
  const idBadgeModal = document.getElementById('id-badge-modal');
  const empHistoryModal = document.getElementById('emp-history-modal');

  // -------------------------------------------------------------
  // 1. LIVE DIGITAL CLOCK (Every second)
  // -------------------------------------------------------------
  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    if (liveClockEl) {
      liveClockEl.textContent = `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
    }

    if (liveDateEl) {
      const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      liveDateEl.textContent = now.toLocaleDateString('en-US', options);
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Audio Toggle
  if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click', () => {
      const muted = window.soundFX.toggleMute();
      audioToggleBtn.innerHTML = muted ? `🔇` : `🔊`;
      window.apiService.showToast(muted ? 'Sound Muted' : 'Sound Effects Active', 'info');
    });
  }

  // Fullscreen Kiosk Mode
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.warn(err));
      } else {
        document.exitFullscreen().catch(err => console.warn(err));
      }
    });
  }

  // -------------------------------------------------------------
  // 2. GEOFENCE LOCATION TRACKER & RADAR INTEGRATION
  // -------------------------------------------------------------
  window.geofenceMgr.onUpdate((state) => {
    // Update Header Pill
    if (geofenceBadge) {
      geofenceBadge.className = `geofence-live-badge ${state.isInside ? 'inside' : 'outside'}`;
      if (geofenceDistText) {
        geofenceDistText.textContent = state.isInside
          ? `Office Perimeter: ${state.distanceMeters}m`
          : `Outside Office: ${window.geofenceMgr.formatDistance(state.distanceMeters)}`;
      }
    }

    // Update Kiosk Sidebar Meter
    const kioskMeterVal = document.getElementById('kiosk-meter-dist');
    const kioskMeterBar = document.getElementById('kiosk-meter-bar');
    const kioskOfficeTarget = document.getElementById('kiosk-office-coords');

    if (kioskMeterVal) {
      kioskMeterVal.textContent = `${state.distanceMeters}m`;
      kioskMeterVal.style.color = state.isInside ? 'var(--teal-400)' : 'var(--rose-500)';
    }

    if (kioskMeterBar) {
      const maxRange = Math.max(state.radius * 2, state.distanceMeters);
      const pct = Math.min(100, Math.round((state.distanceMeters / maxRange) * 100));
      kioskMeterBar.style.width = `${pct}%`;
      kioskMeterBar.className = `geofence-bar-fill ${state.isInside ? '' : 'danger'}`;
    }

    if (kioskOfficeTarget && state.office) {
      kioskOfficeTarget.textContent = `${state.office.lat.toFixed(5)}, ${state.office.lng.toFixed(5)} (±${state.radius}m)`;
    }

    // Highlight active simulation button
    document.querySelectorAll('.demo-sim-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });
  });

  // Attach Simulation switcher clicks
  document.querySelectorAll('.demo-sim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      window.geofenceMgr.setSimulationMode(mode);
      const labels = {
        REAL_GPS: 'Live Device GPS Active',
        FORCE_INSIDE: 'Simulating Inside Office (24m)',
        FORCE_OUTSIDE: 'Simulating Outside Office (485m)'
      };
      window.apiService.showToast(labels[mode] || mode, 'info');
    });
  });

  // Start GPS tracking
  window.geofenceMgr.startTracking();

  // -------------------------------------------------------------
  // 3. BARCODE SCANNING & PUNCH WORKFLOW
  // -------------------------------------------------------------
  window.barcodeScanner.setCallback(async (scannedCode, method) => {
    await processAttendancePunch(scannedCode, method);
  });

  async function processAttendancePunch(barcodeOrId, method) {
    const coords = window.geofenceMgr.currentPosition;
    
    // Show quick status toast
    window.apiService.showToast(`Validating scan: ${barcodeOrId}...`, 'info');

    const result = await window.apiService.punchAttendance(barcodeOrId, coords, method);

    if (!result.ok) {
      // Check for GEOFENCE_VIOLATION
      if (result.data.code === 'GEOFENCE_VIOLATION') {
        window.soundFX.playWarningTone();
        showGeofenceWarningModal(result.data);
        return;
      }

      window.soundFX.playWarningTone();
      window.apiService.showToast(result.data.message || 'Scanning verification failed', 'error');
      return;
    }

    // Success punch!
    const data = result.data;
    if (data.action === 'CHECK_IN') {
      window.soundFX.playCheckInSuccess();
    } else {
      window.soundFX.playCheckOutSuccess();
    }

    showPunchSuccessModal(data);

    // Refresh feeds
    loadTodayLiveOverview();
    if (adminAuthenticated) {
      loadAttendanceLogs();
    }
  }

  // Show Stylized Geofence Warning Modal (Per requirement #2)
  function showGeofenceWarningModal(data) {
    if (!geofenceAlertModal) return;

    const distVal = document.getElementById('geo-alert-distance');
    const radiusVal = document.getElementById('geo-alert-radius');
    const empInfo = document.getElementById('geo-alert-emp');
    const officeAddr = document.getElementById('geo-alert-address');

    if (distVal && data.geofence) {
      distVal.textContent = window.geofenceMgr.formatDistance(data.geofence.distanceMeters);
    }
    if (radiusVal && data.geofence) {
      radiusVal.textContent = `${data.geofence.allowedRadiusMeters} meters`;
    }
    if (empInfo && data.employee) {
      empInfo.textContent = `${data.employee.name} (${data.employee.id})`;
    }
    if (officeAddr && data.geofence) {
      officeAddr.textContent = data.geofence.officeAddress;
    }

    geofenceAlertModal.classList.add('active');
  }

  // Dismiss Geofence Alert Modal
  const closeGeoModalBtn = document.getElementById('close-geo-alert-btn');
  if (closeGeoModalBtn) {
    closeGeoModalBtn.addEventListener('click', () => {
      geofenceAlertModal.classList.remove('active');
    });
  }

  // One-click "Switch to Inside Office (Demo)" from inside the alert modal
  const geoAlertSimulateInsideBtn = document.getElementById('geo-alert-simulate-inside');
  if (geoAlertSimulateInsideBtn) {
    geoAlertSimulateInsideBtn.addEventListener('click', () => {
      geofenceAlertModal.classList.remove('active');
      window.geofenceMgr.setSimulationMode('FORCE_INSIDE');
      window.apiService.showToast('Location switched to Inside Office (24m). Ready to scan!', 'success');
    });
  }

  // Show Punch Success Modal
  function showPunchSuccessModal(data) {
    if (!punchModal) return;

    const banner = document.getElementById('punch-modal-banner');
    const title = document.getElementById('punch-modal-title');
    const sub = document.getElementById('punch-modal-sub');
    const icon = document.getElementById('punch-modal-icon');
    const avatar = document.getElementById('punch-modal-avatar');
    const name = document.getElementById('punch-modal-name');
    const role = document.getElementById('punch-modal-role');
    const dept = document.getElementById('punch-modal-dept');
    const timeVal = document.getElementById('punch-modal-time');
    const statusVal = document.getElementById('punch-modal-status');
    const hoursWrap = document.getElementById('punch-modal-hours-wrap');
    const hoursVal = document.getElementById('punch-modal-hours');
    const greeting = document.getElementById('punch-modal-greeting');

    const isCheckIn = data.action === 'CHECK_IN';
    const isCheckOut = data.action === 'CHECK_OUT';

    if (banner) {
      banner.className = `punch-header-banner ${isCheckIn ? 'check-in' : 'check-out'}`;
    }
    if (icon) {
      icon.innerHTML = isCheckIn ? `✓` : `⇥`;
    }
    if (title) {
      title.textContent = isCheckIn ? 'ATTENDANCE CLOCKED IN' : 'ATTENDANCE CLOCKED OUT';
    }
    if (sub) {
      sub.textContent = isCheckIn ? 'Welcome to SS40 Network' : 'Shift Completed • Have a great evening';
    }

    if (data.employee) {
      if (name) name.textContent = data.employee.name;
      if (role) role.textContent = `${data.employee.designation} (${data.employee.id})`;
      if (dept) dept.textContent = data.employee.department;
      if (avatar) {
        avatar.textContent = data.employee.name.charAt(0);
        avatar.style.backgroundColor = data.employee.avatarColor || '#0F766E';
      }
    }

    if (timeVal) timeVal.textContent = data.time || 'Recorded';
    if (greeting) greeting.textContent = data.greeting || data.message;

    // Status Badge
    if (statusVal) {
      const statusMap = {
        ON_TIME: { label: 'On-Time', cls: 'on-time' },
        GRACE_PERIOD: { label: 'Grace Period', cls: 'grace' },
        LATE: { label: 'Late Coming', cls: 'late' },
        EARLY_LEAVING: { label: 'Early Leaving', cls: 'early' },
        OVERTIME: { label: 'Overtime', cls: 'overtime' }
      };
      const s = statusMap[data.status] || { label: data.status, cls: 'on-time' };
      statusVal.innerHTML = `<span class="status-badge ${s.cls}">${s.label}</span>`;
    }

    if (hoursWrap && hoursVal) {
      if (isCheckOut && data.hoursWorked) {
        hoursWrap.style.display = 'block';
        hoursVal.textContent = `${data.hoursWorked} hrs`;
      } else {
        hoursWrap.style.display = 'none';
      }
    }

    punchModal.classList.add('active');

    // Auto dismiss after 4 seconds
    clearTimeout(punchAutoDismissTimer);
    punchAutoDismissTimer = setTimeout(() => {
      punchModal.classList.remove('active');
    }, 4500);
  }

  // Dismiss punch modal button
  const dismissPunchBtn = document.getElementById('punch-modal-dismiss-btn');
  if (dismissPunchBtn) {
    dismissPunchBtn.addEventListener('click', () => {
      clearTimeout(punchAutoDismissTimer);
      punchModal.classList.remove('active');
    });
  }

  // -------------------------------------------------------------
  // 4. SCAN MODE SWITCHING (Camera vs USB Hardware Mode)
  // -------------------------------------------------------------
  const modeCameraBtn = document.getElementById('mode-camera-btn');
  const modeUsbBtn = document.getElementById('mode-usb-btn');
  const cameraViewport = document.getElementById('camera-viewport-wrap');
  const usbScannerView = document.getElementById('usb-scanner-view');

  async function setScanMode(mode) {
    currentScanMode = mode;
    if (mode === 'camera') {
      if (modeCameraBtn) modeCameraBtn.classList.add('active');
      if (modeUsbBtn) modeUsbBtn.classList.remove('active');
      if (cameraViewport) cameraViewport.style.display = 'flex';
      if (usbScannerView) usbScannerView.classList.remove('active');
      await window.barcodeScanner.initCamera('camera-preview');
    } else {
      if (modeUsbBtn) modeUsbBtn.classList.add('active');
      if (modeCameraBtn) modeCameraBtn.classList.remove('active');
      if (cameraViewport) cameraViewport.style.display = 'none';
      if (usbScannerView) usbScannerView.classList.add('active');
      await window.barcodeScanner.stopCamera();

      // Focus manual/hardware input
      const hwInput = document.getElementById('hardware-barcode-input');
      if (hwInput) hwInput.focus();
    }
  }

  if (modeCameraBtn) modeCameraBtn.addEventListener('click', () => setScanMode('camera'));
  if (modeUsbBtn) modeUsbBtn.addEventListener('click', () => setScanMode('usb'));

  // Switch camera button (flip front/back)
  const switchCamBtn = document.getElementById('switch-camera-btn');
  if (switchCamBtn) {
    switchCamBtn.addEventListener('click', async () => {
      await window.barcodeScanner.switchCamera();
      window.apiService.showToast('Camera flipped', 'info');
    });
  }

  // Hardware Manual Input Submit
  const hwSubmitBtn = document.getElementById('hardware-submit-btn');
  const hwInput = document.getElementById('hardware-barcode-input');
  if (hwSubmitBtn && hwInput) {
    const handleHwSubmit = () => {
      const code = hwInput.value.trim();
      if (code) {
        processAttendancePunch(code, 'USB_HARDWARE');
        hwInput.value = '';
      }
    };
    hwSubmitBtn.addEventListener('click', handleHwSubmit);
    hwInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleHwSubmit();
    });
  }

  // Terminal footer manual input
  const manualInput = document.getElementById('manual-barcode-input');
  const manualSubmitBtn = document.getElementById('manual-submit-btn');
  if (manualSubmitBtn && manualInput) {
    const handleManualSubmit = () => {
      const code = manualInput.value.trim();
      if (code) {
        processAttendancePunch(code, 'MANUAL_KIOSK');
        manualInput.value = '';
      }
    };
    manualSubmitBtn.addEventListener('click', handleManualSubmit);
    manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleManualSubmit();
    });
  }

  // -------------------------------------------------------------
  // 5. QUICK-TEST EMPLOYEE BADGES SHELF
  // -------------------------------------------------------------
  async function loadQuickTestShelf() {
    const shelfGrid = document.getElementById('test-badges-grid');
    if (!shelfGrid) return;

    const res = await window.apiService.getEmployees({ status: 'active' });
    if (!res.ok) return;

    cachedEmployees = res.data.employees;
    shelfGrid.innerHTML = cachedEmployees.map(emp => `
      <div class="test-badge-item" data-id="${emp.id}" data-barcode="${emp.barcode}">
        <div class="test-badge-info">
          <div class="test-badge-avatar" style="background-color: ${emp.avatarColor || '#0F766E'};">
            ${emp.name.charAt(0)}
          </div>
          <div>
            <div class="test-badge-name">${emp.name}</div>
            <div class="test-badge-sub">${emp.id} • ${emp.designation.split(' ')[0]}</div>
          </div>
        </div>
        <button class="test-badge-action" title="Click to simulate instant scan">Scan ➔</button>
      </div>
    `).join('');

    // Attach click handlers
    shelfGrid.querySelectorAll('.test-badge-item').forEach(item => {
      item.addEventListener('click', () => {
        const barcode = item.dataset.barcode || item.dataset.id;
        processAttendancePunch(barcode, 'CAMERA_BARCODE');
      });
    });
  }

  // -------------------------------------------------------------
  // 6. VIEW SWITCHING (Kiosk Portal vs Admin Control Center)
  // -------------------------------------------------------------
  function switchView(viewName) {
    currentView = viewName;
    if (viewName === 'kiosk') {
      kioskView.classList.add('active');
      adminView.classList.remove('active');
      navKioskBtn.classList.add('active');
      navAdminBtn.classList.remove('active');
      // Resume camera
      if (currentScanMode === 'camera') {
        window.barcodeScanner.initCamera('camera-preview');
      }
    } else {
      if (!adminAuthenticated) {
        openAdminLoginModal();
        return;
      }
      kioskView.classList.remove('active');
      adminView.classList.add('active');
      navKioskBtn.classList.remove('active');
      navAdminBtn.classList.add('active');
      // Pause camera to save CPU/battery
      window.barcodeScanner.stopCamera();
      loadAdminDashboard();
    }
  }

  navKioskBtn.addEventListener('click', () => switchView('kiosk'));
  navAdminBtn.addEventListener('click', () => switchView('admin'));

  // -------------------------------------------------------------
  // 7. ADMIN AUTHENTICATION
  // -------------------------------------------------------------
  function openAdminLoginModal() {
    if (adminLoginModal) adminLoginModal.classList.add('active');
  }

  const adminLoginForm = document.getElementById('admin-login-form');
  const closeLoginModalBtn = document.getElementById('close-login-modal-btn');
  const demoAutoLoginBtn = document.getElementById('demo-admin-login-btn');

  if (closeLoginModalBtn) {
    closeLoginModalBtn.addEventListener('click', () => {
      adminLoginModal.classList.remove('active');
    });
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pass = document.getElementById('login-password').value.trim();

      const res = await window.apiService.login(email, pass);
      if (res.ok && res.data.success) {
        window.apiService.setToken(res.data.token);
        adminAuthenticated = true;
        adminLoginModal.classList.remove('active');
        window.apiService.showToast('Administrative session authenticated', 'success');
        switchView('admin');
      } else {
        window.apiService.showToast(res.data.message || 'Login failed', 'error');
      }
    });
  }

  if (demoAutoLoginBtn) {
    demoAutoLoginBtn.addEventListener('click', async () => {
      const res = await window.apiService.login('admin@ss40network.com', 'admin123');
      if (res.ok && res.data.success) {
        window.apiService.setToken(res.data.token);
        adminAuthenticated = true;
        adminLoginModal.classList.remove('active');
        window.apiService.showToast('Logged in as SS40 Systems Administrator', 'success');
        switchView('admin');
      }
    });
  }

  // Admin Logout
  const adminLogoutBtn = document.getElementById('admin-logout-btn');
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', () => {
      window.apiService.setToken(null);
      adminAuthenticated = false;
      window.apiService.showToast('Admin logged out', 'info');
      switchView('kiosk');
    });
  }

  // -------------------------------------------------------------
  // 8. ADMIN DASHBOARD & TABS
  // -------------------------------------------------------------
  const adminTabs = document.querySelectorAll('.admin-tab-btn');
  const adminPanes = document.querySelectorAll('.admin-tab-pane');

  adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabTarget = tab.dataset.tab;
      adminTabs.forEach(t => t.classList.remove('active'));
      adminPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const pane = document.getElementById(`pane-${tabTarget}`);
      if (pane) pane.classList.add('active');
      activeAdminTab = tabTarget;

      handleAdminTabActivation(tabTarget);
    });
  });

  function handleAdminTabActivation(tab) {
    if (tab === 'feed') loadTodayLiveOverview();
    if (tab === 'employees') loadEmployeesTable();
    if (tab === 'logs') loadAttendanceLogs();
    if (tab === 'heatmap') loadHeatmapAndStats();
    if (tab === 'idcard') renderDefaultIdBadge();
    if (tab === 'settings') loadSettingsForm();
  }

  async function loadAdminDashboard() {
    await loadTodayLiveOverview();
    handleAdminTabActivation(activeAdminTab);
  }

  // -------------------------------------------------------------
  // 9. TODAY'S LIVE OVERVIEW & KPI METRICS
  // -------------------------------------------------------------
  async function loadTodayLiveOverview() {
    const res = await window.apiService.getTodayOverview();
    if (!res.ok) return;

    const d = res.data;

    // Update KPI Cards
    const kpiTotalEmp = document.getElementById('kpi-total-employees');
    const kpiPresent = document.getElementById('kpi-present-today');
    const kpiActive = document.getElementById('kpi-clocked-in');
    const kpiPunctuality = document.getElementById('kpi-punctuality-rate');

    if (kpiTotalEmp) kpiTotalEmp.textContent = d.totalEmployees;
    if (kpiPresent) kpiPresent.textContent = `${d.totalPresent} (${d.attendanceRate}%)`;
    if (kpiActive) kpiActive.textContent = d.currentlyActive;
    if (kpiPunctuality) {
      const totalP = d.totalPresent || 1;
      const onTimePct = Math.round(((d.breakdown.onTime + d.breakdown.gracePeriod) / totalP) * 100);
      kpiPunctuality.textContent = `${onTimePct}%`;
    }

    // Render Today's Live Feed Table
    const feedTbody = document.getElementById('live-feed-tbody');
    if (feedTbody) {
      if (d.todayLogs.length === 0) {
        feedTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">No attendance scans registered today yet. Use the Kiosk to punch in.</td></tr>`;
      } else {
        feedTbody.innerHTML = d.todayLogs.map(log => {
          const statusMap = {
            ON_TIME: { label: 'On-Time', cls: 'on-time' },
            GRACE_PERIOD: { label: 'Grace Period', cls: 'grace' },
            LATE: { label: 'Late', cls: 'late' },
            EARLY_LEAVING: { label: 'Early Leaving', cls: 'early' },
            OVERTIME: { label: 'Overtime', cls: 'overtime' }
          };
          const s = statusMap[log.status] || { label: log.status, cls: 'on-time' };

          const methodMap = {
            CAMERA_BARCODE: '📷 Mobile/Webcam',
            USB_HARDWARE: '🔌 USB Scanner Gun',
            MANUAL_KIOSK: '⌨ Manual Entry'
          };

          return `
            <tr>
              <td>
                <div class="table-emp-cell">
                  <div class="emp-avatar-sm" style="background-color: var(--teal-700);">
                    ${log.employeeName.charAt(0)}
                  </div>
                  <div class="emp-info-sm">
                    <div class="name">${log.employeeName}</div>
                    <div class="code">${log.employeeId}</div>
                  </div>
                </div>
              </td>
              <td><strong>${log.checkInTime || '-'}</strong></td>
              <td>${log.checkOutTime ? `<strong>${log.checkOutTime}</strong>` : '<span style="color:var(--emerald-600); font-weight:700;">● In Office</span>'}</td>
              <td>${log.hoursWorked !== null ? `${log.hoursWorked} hrs` : 'In Progress'}</td>
              <td><span class="status-badge ${s.cls}">${s.label}</span></td>
              <td><span class="method-tag">${methodMap[log.method] || log.method}</span></td>
              <td>
                <span style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--teal-700); font-weight: 600;">
                  ✓ ${log.location ? `${log.location.distanceMeters}m from office` : 'Verified'}
                </span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // -------------------------------------------------------------
  // 10. EMPLOYEE CRUD & MANAGEMENT
  // -------------------------------------------------------------
  async function loadEmployeesTable() {
    const tbody = document.getElementById('employees-tbody');
    if (!tbody) return;

    const res = await window.apiService.getEmployees();
    if (!res.ok) return;

    cachedEmployees = res.data.employees;
    renderEmployeesRows(cachedEmployees);
  }

  function renderEmployeesRows(employees) {
    const tbody = document.getElementById('employees-tbody');
    if (!tbody) return;

    if (employees.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">No matching employees found.</td></tr>`;
      return;
    }

    tbody.innerHTML = employees.map(emp => `
      <tr>
        <td>
          <div class="table-emp-cell">
            <div class="emp-avatar-sm" style="background-color: ${emp.avatarColor || '#0F766E'};">
              ${emp.name.charAt(0)}
            </div>
            <div class="emp-info-sm">
              <div class="name">${emp.name}</div>
              <div class="code">${emp.id}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 600; font-size: 0.82rem;">${emp.department}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${emp.designation}</div>
        </td>
        <td><code style="background:var(--bg-subtle); padding:2px 6px; border-radius:4px; font-size:0.75rem;">${emp.barcode}</code></td>
        <td>${emp.phone}</td>
        <td>
          <span class="status-badge ${emp.status === 'Active' ? 'on-time' : 'late'}">
            ${emp.status}
          </span>
        </td>
        <td>
          <div style="display:flex; gap: 0.4rem;">
            <button class="btn-action-icon view-history-btn" data-id="${emp.id}" title="View Individual Attendance History">📊</button>
            <button class="btn-action-icon generate-badge-btn" data-id="${emp.id}" title="View & Print ID Badge">🪪</button>
            <button class="btn-action-icon edit-emp-btn" data-id="${emp.id}" title="Edit Details">✏</button>
            <button class="btn-action-icon toggle-status-btn" data-id="${emp.id}" title="Toggle Active/Inactive">
              ${emp.status === 'Active' ? '⏸' : '▶'}
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach actions
    tbody.querySelectorAll('.view-history-btn').forEach(btn => {
      btn.addEventListener('click', () => openEmployeeHistory(btn.dataset.id));
    });

    tbody.querySelectorAll('.generate-badge-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emp = cachedEmployees.find(e => e.id === btn.dataset.id);
        if (emp) openIdBadgeModal(emp);
      });
    });

    tbody.querySelectorAll('.edit-emp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emp = cachedEmployees.find(e => e.id === btn.dataset.id);
        if (emp) openEmployeeEditModal(emp);
      });
    });

    tbody.querySelectorAll('.toggle-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const res = await window.apiService.toggleEmployeeStatus(btn.dataset.id);
        if (res.ok) {
          window.apiService.showToast(res.data.message, 'success');
          loadEmployeesTable();
          loadQuickTestShelf();
        }
      });
    });
  }

  // Search & Filter Employees
  const empSearchInput = document.getElementById('emp-search-input');
  const empWingFilter = document.getElementById('emp-wing-filter');

  function filterEmployees() {
    const query = empSearchInput ? empSearchInput.value.toLowerCase().trim() : '';
    const wing = empWingFilter ? empWingFilter.value : '';

    let filtered = cachedEmployees.filter(emp => {
      const matchesQuery = !query ||
        emp.name.toLowerCase().includes(query) ||
        emp.id.toLowerCase().includes(query) ||
        emp.department.toLowerCase().includes(query) ||
        emp.designation.toLowerCase().includes(query);

      const matchesWing = !wing || emp.wing === wing || emp.department.includes(wing);

      return matchesQuery && matchesWing;
    });

    renderEmployeesRows(filtered);
  }

  if (empSearchInput) empSearchInput.addEventListener('input', filterEmployees);
  if (empWingFilter) empWingFilter.addEventListener('change', filterEmployees);

  // Add Employee Modal
  const openAddEmpBtn = document.getElementById('open-add-emp-btn');
  const closeEmpModalBtn = document.getElementById('close-emp-modal-btn');
  const empForm = document.getElementById('employee-form');
  const empModalTitle = document.getElementById('employee-modal-title');

  let editingEmployeeId = null;

  if (openAddEmpBtn) {
    openAddEmpBtn.addEventListener('click', () => {
      editingEmployeeId = null;
      if (empModalTitle) empModalTitle.textContent = 'Add New SS40 Employee';
      if (empForm) empForm.reset();
      if (employeeModal) employeeModal.classList.add('active');
    });
  }

  if (closeEmpModalBtn) {
    closeEmpModalBtn.addEventListener('click', () => {
      if (employeeModal) employeeModal.classList.remove('active');
    });
  }

  function openEmployeeEditModal(emp) {
    editingEmployeeId = emp.id;
    if (empModalTitle) empModalTitle.textContent = `Edit Details - ${emp.name}`;
    document.getElementById('emp-name-input').value = emp.name;
    document.getElementById('emp-email-input').value = emp.email;
    document.getElementById('emp-dept-select').value = emp.department;
    document.getElementById('emp-designation-input').value = emp.designation;
    document.getElementById('emp-phone-input').value = emp.phone;
    document.getElementById('emp-blood-select').value = emp.bloodGroup || 'O+';
    document.getElementById('emp-emergency-input').value = emp.emergencyContact || '';
    if (employeeModal) employeeModal.classList.add('active');
  }

  if (empForm) {
    empForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('emp-name-input').value.trim(),
        email: document.getElementById('emp-email-input').value.trim(),
        department: document.getElementById('emp-dept-select').value,
        designation: document.getElementById('emp-designation-input').value.trim(),
        phone: document.getElementById('emp-phone-input').value.trim(),
        bloodGroup: document.getElementById('emp-blood-select').value,
        emergencyContact: document.getElementById('emp-emergency-input').value.trim()
      };

      let res;
      if (editingEmployeeId) {
        res = await window.apiService.updateEmployee(editingEmployeeId, payload);
      } else {
        res = await window.apiService.createEmployee(payload);
      }

      if (res.ok) {
        window.apiService.showToast(res.data.message, 'success');
        if (employeeModal) employeeModal.classList.remove('active');
        loadEmployeesTable();
        loadQuickTestShelf();
      } else {
        window.apiService.showToast(res.data.message || 'Error saving employee', 'error');
      }
    });
  }

  // -------------------------------------------------------------
  // 11. INDIVIDUAL EMPLOYEE ATTENDANCE HISTORY DRAWER
  // -------------------------------------------------------------
  async function openEmployeeHistory(empId) {
    const res = await window.apiService.getEmployeeById(empId);
    if (!res.ok) {
      window.apiService.showToast('Could not fetch employee history', 'error');
      return;
    }

    const d = res.data;
    const emp = d.employee;
    const stats = d.stats;

    document.getElementById('hist-emp-name').textContent = emp.name;
    document.getElementById('hist-emp-sub').textContent = `${emp.id} • ${emp.designation} • ${emp.department}`;
    document.getElementById('hist-stat-total').textContent = `${stats.totalDays} Days`;
    document.getElementById('hist-stat-ontime').textContent = `${stats.punctualityRate}%`;
    document.getElementById('hist-stat-streak').textContent = `🔥 ${stats.streak} Days`;
    document.getElementById('hist-stat-avg').textContent = `${stats.averageHours} hrs/day`;

    const histTbody = document.getElementById('emp-history-tbody');
    if (histTbody) {
      if (d.recentAttendance.length === 0) {
        histTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No past records logged.</td></tr>`;
      } else {
        histTbody.innerHTML = d.recentAttendance.map(rec => {
          const statusMap = {
            ON_TIME: { label: 'On-Time', cls: 'on-time' },
            GRACE_PERIOD: { label: 'Grace', cls: 'grace' },
            LATE: { label: 'Late', cls: 'late' },
            EARLY_LEAVING: { label: 'Early Leave', cls: 'early' },
            OVERTIME: { label: 'Overtime', cls: 'overtime' }
          };
          const s = statusMap[rec.status] || { label: rec.status, cls: 'on-time' };

          return `
            <tr>
              <td><strong>${rec.date}</strong></td>
              <td>${rec.checkInTime || '-'}</td>
              <td>${rec.checkOutTime || 'Active'}</td>
              <td>${rec.hoursWorked !== null ? `${rec.hoursWorked} hrs` : '-'}</td>
              <td><span class="status-badge ${s.cls}">${s.label}</span></td>
            </tr>
          `;
        }).join('');
      }
    }

    if (empHistoryModal) empHistoryModal.classList.add('active');
  }

  const closeHistoryModalBtn = document.getElementById('close-history-modal-btn');
  if (closeHistoryModalBtn) {
    closeHistoryModalBtn.addEventListener('click', () => {
      empHistoryModal.classList.remove('active');
    });
  }

  // -------------------------------------------------------------
  // 12. DIGITAL ID BADGE STUDIO & PRINT MODAL
  // -------------------------------------------------------------
  function openIdBadgeModal(emp) {
    window.idCardStudio.renderBadge(emp, 'modal-id-card-render-zone');
    if (idBadgeModal) idBadgeModal.classList.add('active');
  }

  function renderDefaultIdBadge() {
    if (cachedEmployees.length > 0) {
      window.idCardStudio.renderBadge(cachedEmployees[0], 'id-badge-preview-zone');
    }
  }

  const closeIdModalBtn = document.getElementById('close-id-modal-btn');
  if (closeIdModalBtn) {
    closeIdModalBtn.addEventListener('click', () => {
      idBadgeModal.classList.remove('active');
    });
  }

  const printBadgeModalBtn = document.getElementById('print-badge-modal-btn');
  if (printBadgeModalBtn) {
    printBadgeModalBtn.addEventListener('click', () => {
      window.idCardStudio.printBadge();
    });
  }

  // -------------------------------------------------------------
  // 13. ATTENDANCE LOGS & CSV EXPORT
  // -------------------------------------------------------------
  async function loadAttendanceLogs() {
    const tbody = document.getElementById('all-logs-tbody');
    if (!tbody) return;

    const res = await window.apiService.getAttendanceLogs({ limit: 40 });
    if (!res.ok) return;

    const logs = res.data.attendance;
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;">No logs found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const statusMap = {
        ON_TIME: { label: 'On-Time', cls: 'on-time' },
        GRACE_PERIOD: { label: 'Grace Period', cls: 'grace' },
        LATE: { label: 'Late', cls: 'late' },
        EARLY_LEAVING: { label: 'Early Leave', cls: 'early' },
        OVERTIME: { label: 'Overtime', cls: 'overtime' }
      };
      const s = statusMap[l.status] || { label: l.status, cls: 'on-time' };

      return `
        <tr>
          <td><code style="font-size:0.75rem;">${l.date}</code></td>
          <td>
            <strong>${l.employeeName}</strong>
            <div style="font-size:0.7rem; color:var(--text-muted);">${l.employeeId}</div>
          </td>
          <td>${l.department.replace('SS40 ', '')}</td>
          <td><strong>${l.checkInTime || '-'}</strong></td>
          <td>${l.checkOutTime || 'Active'}</td>
          <td>${l.hoursWorked !== null ? `${l.hoursWorked} hrs` : '-'}</td>
          <td><span class="status-badge ${s.cls}">${s.label}</span></td>
        </tr>
      `;
    }).join('');
  }

  // CSV Export Button
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      window.open('/api/attendance/export', '_blank');
      window.apiService.showToast('Generating official CSV report...', 'success');
    });
  }

  // -------------------------------------------------------------
  // 14. MONTHLY ATTENDANCE HEATMAP & STREAKS
  // -------------------------------------------------------------
  async function loadHeatmapAndStats() {
    const res = await window.apiService.getAttendanceStats();
    if (!res.ok) return;

    const d = res.data;
    window.attendanceHeatmap.render(d.heatmapData, d.topStreaks);

    const scoreEl = document.getElementById('stat-punctuality-score');
    if (scoreEl) scoreEl.textContent = `${d.summary.punctualityScore}%`;

    const totalLogsEl = document.getElementById('stat-total-logs');
    if (totalLogsEl) totalLogsEl.textContent = d.summary.totalLogs;
  }

  // -------------------------------------------------------------
  // 15. OFFICE GEOFENCE & POLICY SETTINGS
  // -------------------------------------------------------------
  async function loadSettingsForm() {
    const res = await window.apiService.getSettings();
    if (!res.ok) return;

    cachedSettings = res.data.settings;
    document.getElementById('setting-office-lat').value = cachedSettings.officeLat;
    document.getElementById('setting-office-lng').value = cachedSettings.officeLng;
    document.getElementById('setting-radius').value = cachedSettings.radiusMeters;
    document.getElementById('setting-shift-start').value = cachedSettings.shiftStartTime;
    document.getElementById('setting-shift-end').value = cachedSettings.shiftEndTime;
    document.getElementById('setting-grace').value = cachedSettings.graceMinutes;
  }

  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        officeLat: parseFloat(document.getElementById('setting-office-lat').value),
        officeLng: parseFloat(document.getElementById('setting-office-lng').value),
        radiusMeters: parseInt(document.getElementById('setting-radius').value, 10),
        shiftStartTime: document.getElementById('setting-shift-start').value,
        shiftEndTime: document.getElementById('setting-shift-end').value,
        graceMinutes: parseInt(document.getElementById('setting-grace').value, 10)
      };

      const res = await window.apiService.updateSettings(payload);
      if (res.ok) {
        window.geofenceMgr.updateOfficeSettings(res.data.settings);
        window.apiService.showToast('Office geofence settings updated successfully', 'success');
      } else {
        window.apiService.showToast('Failed to update settings', 'error');
      }
    });
  }

  // "Set Office to My Current GPS" Button
  const syncGpsBtn = document.getElementById('sync-current-gps-btn');
  if (syncGpsBtn) {
    syncGpsBtn.addEventListener('click', () => {
      if (window.geofenceMgr.currentPosition) {
        const pos = window.geofenceMgr.currentPosition;
        document.getElementById('setting-office-lat').value = pos.lat.toFixed(6);
        document.getElementById('setting-office-lng').value = pos.lng.toFixed(6);
        window.apiService.showToast(`Coordinates updated to current device GPS (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`, 'info');
      } else {
        window.apiService.showToast('Current GPS coordinates not yet acquired. Ensure location is allowed in browser.', 'error');
      }
    });
  }

  // -------------------------------------------------------------
  // INITIALIZATION BOOTSTRAP
  // -------------------------------------------------------------
  const initialSettingsRes = await window.apiService.getSettings();
  if (initialSettingsRes.ok) {
    cachedSettings = initialSettingsRes.data.settings;
    window.geofenceMgr.updateOfficeSettings(cachedSettings);
  }

  await loadQuickTestShelf();
  await loadTodayLiveOverview();
  await setScanMode('camera');

  console.log('SS40 Network Smart Attendance System initialized successfully.');
});

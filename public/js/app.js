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
  const audioToggleBtn = document.getElementById('audio-toggle-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  // Modals
  const punchModal = document.getElementById('punch-modal');
  const geofenceAlertModal = document.getElementById('geofence-alert-modal');
  const adminLoginModal = document.getElementById('admin-login-modal');
  const employeeModal = document.getElementById('employee-modal');
  const idBadgeModal = document.getElementById('id-badge-modal');
  const empHistoryModal = document.getElementById('emp-history-modal');
  const deleteEmpModal = document.getElementById('delete-employee-modal');
  let pendingDeleteEmpId = null;

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
      audioToggleBtn.innerHTML = muted
        ? `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`
        : `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
      window.apiService.showToast(muted ? 'Sound Muted' : 'Audio Active', 'info');
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
    // Update Kiosk Sidebar Meter & Status Badge
    const kioskMeterVal = document.getElementById('kiosk-meter-dist');
    const kioskMeterBar = document.getElementById('kiosk-meter-bar');
    const kioskOfficeTarget = document.getElementById('kiosk-office-coords');
    const geofenceStatusBadge = document.querySelector('.geofence-card-header .status-badge');

    if (kioskMeterVal) {
      if (state.distanceMeters !== null && !isNaN(state.distanceMeters)) {
        kioskMeterVal.textContent = window.geofenceMgr.formatDistance(state.distanceMeters);
        kioskMeterVal.style.color = state.isInside ? 'var(--teal-400)' : 'var(--rose-500)';
      } else {
        kioskMeterVal.textContent = state.isLocating ? 'Locating...' : 'GPS Inactive';
        kioskMeterVal.style.color = 'var(--text-muted)';
      }
    }

    if (kioskMeterBar) {
      if (state.distanceMeters !== null && !isNaN(state.distanceMeters)) {
        const maxRange = Math.max(state.radius * 2, state.distanceMeters);
        const pct = Math.min(100, Math.round((state.distanceMeters / maxRange) * 100));
        kioskMeterBar.style.width = `${pct}%`;
        kioskMeterBar.className = `geofence-bar-fill ${state.isInside ? '' : 'danger'}`;
      } else {
        kioskMeterBar.style.width = '0%';
      }
    }

    if (geofenceStatusBadge) {
      geofenceStatusBadge.removeAttribute('style');
      if (state.distanceMeters !== null && !isNaN(state.distanceMeters)) {
        if (state.isInside) {
          geofenceStatusBadge.className = 'status-badge on-time';
          geofenceStatusBadge.textContent = 'Within Perimeter';
        } else {
          geofenceStatusBadge.className = 'status-badge danger';
          geofenceStatusBadge.textContent = 'Outside Perimeter';
        }
      } else {
        geofenceStatusBadge.className = 'status-badge offline';
        geofenceStatusBadge.textContent = state.isLocating ? 'Acquiring GPS...' : 'GPS Offline';
      }
    }

    if (kioskOfficeTarget && state.office) {
      kioskOfficeTarget.textContent = `${state.office.lat.toFixed(5)}, ${state.office.lng.toFixed(5)} (±${state.radius}m)`;
    }
  });

  // Start GPS tracking
  window.geofenceMgr.startTracking();

  // -------------------------------------------------------------
  // 3. BARCODE SCANNING & PUNCH WORKFLOW WITH BREAK TRACKING
  // -------------------------------------------------------------
  let selectedPunchAction = null; // 'CHECK_IN' | 'BREAK_START' | 'BREAK_END' | 'CHECK_OUT' | null

  // Wire Attendance & Break Punch Quick Buttons
  const quickPunchBtns = document.querySelectorAll('.action-punch-btn');
  const actionStateBadge = document.getElementById('kiosk-action-state-badge');

  function updateActionButtonsUI() {
    quickPunchBtns.forEach(btn => {
      if (selectedPunchAction && btn.dataset.action === selectedPunchAction) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (actionStateBadge) {
      const labels = {
        CHECK_IN: 'Punch In Active',
        BREAK_START: 'Break Active',
        BREAK_END: 'Resume Active',
        CHECK_OUT: 'Punch Out Active'
      };
      actionStateBadge.textContent = selectedPunchAction ? labels[selectedPunchAction] : 'Ready';
      actionStateBadge.style.backgroundColor = selectedPunchAction ? 'var(--navy-900)' : 'var(--teal-50)';
      actionStateBadge.style.color = selectedPunchAction ? '#FFFFFF' : 'var(--teal-700)';
    }
  }

  quickPunchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (selectedPunchAction === action) {
        selectedPunchAction = null;
      } else {
        selectedPunchAction = action;
      }
      updateActionButtonsUI();

      // If manual barcode input has text, punch immediately
      const manualInput = document.getElementById('manual-barcode-input');
      if (manualInput && manualInput.value.trim() && selectedPunchAction) {
        const code = manualInput.value.trim();
        processAttendancePunch(code, 'MANUAL_KIOSK', selectedPunchAction);
        manualInput.value = '';
      }
    });
  });

  window.barcodeScanner.setCallback(async (scannedCode, method) => {
    await processAttendancePunch(scannedCode, method);
  });

  async function processAttendancePunch(barcodeOrId, method, requestedAction = null) {
    if (!barcodeOrId || !barcodeOrId.trim()) {
      window.apiService.showToast('Please provide a valid Barcode or Employee ID', 'warning');
      return;
    }

    const cleanId = barcodeOrId.trim();
    const actionToPerform = requestedAction || selectedPunchAction || undefined;

    // 1. Show immediate GPS acquisition feedback
    window.apiService.showToast('Verifying GPS location...', 'info');

    let coords = null;
    try {
      // Actively acquire fresh GPS coordinates from browser HTML5 Geolocation
      coords = await window.geofenceMgr.acquireLocation();
    } catch (locErr) {
      // If immediate fix fails, check if recent watchPosition fix exists
      if (window.geofenceMgr.currentPosition) {
        coords = window.geofenceMgr.currentPosition;
      } else {
        window.soundFX.playWarningTone();
        window.apiService.showToast(locErr.message || 'GPS location permission required to verify attendance.', 'error');
        return;
      }
    }

    // 2. Client-side precise distance check against office perimeter
    const officeDist = window.geofenceMgr.calculateDistance(
      coords.lat,
      coords.lng,
      window.geofenceMgr.officeCoords.lat,
      window.geofenceMgr.officeCoords.lng
    );

    // If outside the allowed perimeter, block attendance check-in
    if (officeDist > window.geofenceMgr.allowedRadiusMeters) {
      const emp = cachedEmployees ? cachedEmployees.find(e => e.id === cleanId || e.barcode === cleanId) : null;
      window.soundFX.playWarningTone();
      showGeofenceWarningModal({
        code: 'GEOFENCE_VIOLATION',
        message: 'You are outside the SS40 Network office premises. Please move to the designated work zone.',
        employee: {
          id: cleanId,
          name: emp ? emp.name : cleanId
        },
        geofence: {
          officeName: 'SS40 Network Private Limited',
          officeAddress: window.geofenceMgr.officeCoords.address,
          distanceMeters: officeDist,
          allowedRadiusMeters: window.geofenceMgr.allowedRadiusMeters,
          userCoords: coords,
          officeCoords: window.geofenceMgr.officeCoords
        }
      });
      return;
    }

    // 3. Inside perimeter: proceed to record attendance
    window.apiService.showToast(`Validating scan: ${cleanId}...`, 'info');

    const result = await window.apiService.punchAttendance(cleanId, coords, method, actionToPerform);

    if (!result.ok) {
      // Check for GEOFENCE_VIOLATION from server
      if (result.data && result.data.code === 'GEOFENCE_VIOLATION') {
        window.soundFX.playWarningTone();
        showGeofenceWarningModal(result.data);
        return;
      }

      window.soundFX.playWarningTone();
      window.apiService.showToast(result.data.message || 'Scanning verification failed', 'error');
      return;
    }

    const data = result.data;

    // Check if employee is already checked in and server requests explicit user action
    if (data.requiresAction) {
      promptActionChoice(cleanId, method, data);
      return;
    }

    // 4. Success punch!
    if (data.action === 'CHECK_IN' || data.action === 'BREAK_END') {
      window.soundFX.playCheckInSuccess();
    } else {
      window.soundFX.playCheckOutSuccess();
    }

    // Reset any active selection
    selectedPunchAction = null;
    updateActionButtonsUI();

    showPunchSuccessModal(data);
    updateKioskLastResult(data);

    // Refresh feeds
    loadTodayLiveOverview();
    if (adminAuthenticated) {
      loadAttendanceLogs();
    }
  }

  // Action choice prompt when scanning without picking an action
  function promptActionChoice(cleanId, method, data) {
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
    const choiceWrap = document.getElementById('punch-modal-choice-wrap');
    const breakBtn = document.getElementById('modal-action-break-btn');
    const checkoutBtn = document.getElementById('modal-action-checkout-btn');
    const resumeBtn = document.getElementById('modal-action-resume-btn');
    const greeting = document.getElementById('punch-modal-greeting');
    const hoursWrap = document.getElementById('punch-modal-hours-wrap');
    const breakWrap = document.getElementById('punch-modal-break-wrap');

    if (hoursWrap) hoursWrap.style.display = 'none';
    if (breakWrap) breakWrap.style.display = 'none';

    if (banner) banner.className = 'punch-header-banner check-in';
    if (icon) {
      icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
    }
    if (title) title.textContent = 'ACTIVE SHIFT DETECTED';
    if (sub) sub.textContent = 'Please choose your next attendance action:';

    if (data.employee) {
      if (name) name.textContent = data.employee.name;
      if (role) role.textContent = `${data.employee.designation} (${data.employee.id})`;
      if (dept) dept.textContent = data.employee.department;
      if (avatar) {
        avatar.textContent = data.employee.name.charAt(0);
        avatar.style.backgroundColor = data.employee.avatarColor || '#0F766E';
      }
    }

    if (timeVal) timeVal.textContent = data.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (statusVal) {
      const isOnBreak = data.status === 'ON_BREAK';
      statusVal.innerHTML = `<span class="status-badge ${isOnBreak ? 'grace' : 'on-time'}">${isOnBreak ? 'On Break' : 'Currently Active'}</span>`;
    }

    if (greeting) greeting.textContent = 'Tap an action below:';

    if (choiceWrap) {
      choiceWrap.style.display = 'block';
      const isOnBreak = data.status === 'ON_BREAK';

      if (isOnBreak) {
        if (breakBtn) breakBtn.style.display = 'none';
        if (checkoutBtn) checkoutBtn.style.display = 'none';
        if (resumeBtn) {
          resumeBtn.style.display = 'inline-flex';
          resumeBtn.onclick = () => {
            punchModal.classList.remove('active');
            processAttendancePunch(cleanId, method, 'BREAK_END');
          };
        }
      } else {
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (breakBtn) {
          breakBtn.style.display = 'inline-flex';
          breakBtn.onclick = () => {
            punchModal.classList.remove('active');
            processAttendancePunch(cleanId, method, 'BREAK_START');
          };
        }
        if (checkoutBtn) {
          checkoutBtn.style.display = 'inline-flex';
          checkoutBtn.onclick = () => {
            punchModal.classList.remove('active');
            processAttendancePunch(cleanId, method, 'CHECK_OUT');
          };
        }
      }
    }

    punchModal.classList.add('active');
  }

  // Update Kiosk Sidebar Last Result Box
  function updateKioskLastResult(data) {
    const box = document.getElementById('kiosk-last-punch-box');
    if (!box) return;

    const titleEl = document.getElementById('last-punch-title');
    const timeEl = document.getElementById('last-punch-time');
    const avatarEl = document.getElementById('last-punch-avatar');
    const nameEl = document.getElementById('last-punch-name');
    const descEl = document.getElementById('last-punch-desc');

    const actionTitles = {
      CHECK_IN: 'Punch In Recorded',
      BREAK_START: 'Break Started',
      BREAK_END: 'Resumed From Break',
      CHECK_OUT: 'Punch Out Recorded'
    };

    if (titleEl) titleEl.textContent = actionTitles[data.action] || 'Punch Recorded';
    if (timeEl) timeEl.textContent = data.time || 'Just now';
    if (data.employee) {
      if (nameEl) nameEl.textContent = data.employee.name;
      if (avatarEl) {
        avatarEl.textContent = data.employee.name.charAt(0);
        avatarEl.style.backgroundColor = data.employee.avatarColor || '#0F766E';
      }
    }

    const actionDescs = {
      CHECK_IN: 'Clocked In • Location Verified',
      BREAK_START: 'Break Started (Lunch / Tea)',
      BREAK_END: `Resumed (${data.breakMinutes || 0}m break) • Working`,
      CHECK_OUT: `Shift Completed (${data.hoursWorked || 0} hrs)`
    };
    if (descEl) descEl.textContent = actionDescs[data.action] || 'Location Verified';

    box.style.display = 'block';
  }

  // Show Stylized Geofence Warning Modal
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

  // Show Punch Success Modal with Complete Break and Shift Statuses
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
    const breakWrap = document.getElementById('punch-modal-break-wrap');
    const breakVal = document.getElementById('punch-modal-break');
    const greeting = document.getElementById('punch-modal-greeting');
    const choiceWrap = document.getElementById('punch-modal-choice-wrap');

    if (choiceWrap) choiceWrap.style.display = 'none';

    const isCheckIn = data.action === 'CHECK_IN';
    const isCheckOut = data.action === 'CHECK_OUT';
    const isBreakStart = data.action === 'BREAK_START';
    const isBreakEnd = data.action === 'BREAK_END';

    if (banner) {
      let bannerCls = 'check-in';
      if (isCheckOut) bannerCls = 'check-out';
      else if (isBreakStart) bannerCls = 'break-start';
      else if (isBreakEnd) bannerCls = 'break-end';
      banner.className = `punch-header-banner ${bannerCls}`;
    }

    if (icon) {
      if (isCheckIn) {
        icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      } else if (isBreakStart) {
        icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`;
      } else if (isBreakEnd) {
        icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      } else {
        icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;
      }
    }

    if (title) {
      if (isCheckIn) title.textContent = 'ATTENDANCE CLOCKED IN';
      else if (isBreakStart) title.textContent = 'BREAK STARTED';
      else if (isBreakEnd) title.textContent = 'RESUMED WORK';
      else title.textContent = 'ATTENDANCE CLOCKED OUT';
    }

    if (sub) {
      if (isCheckIn) sub.textContent = 'Welcome to SS40 Network';
      else if (isBreakStart) sub.textContent = 'Break Started • Enjoy your break';
      else if (isBreakEnd) sub.textContent = 'Welcome back • Shift resumed';
      else sub.textContent = 'Shift Completed • Have a great evening';
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
      if (isBreakStart) {
        statusVal.innerHTML = `<span class="status-badge grace">On Break</span>`;
      } else if (isBreakEnd) {
        statusVal.innerHTML = `<span class="status-badge on-time">Working</span>`;
      } else {
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
    }

    if (hoursWrap && hoursVal) {
      if (isCheckOut && data.hoursWorked) {
        hoursWrap.style.display = 'block';
        hoursVal.textContent = `${data.hoursWorked} hrs`;
      } else {
        hoursWrap.style.display = 'none';
      }
    }

    if (breakWrap && breakVal) {
      if (isBreakEnd && data.breakMinutes !== undefined) {
        breakWrap.style.display = 'block';
        breakVal.textContent = `${data.breakMinutes} mins`;
      } else if (isCheckOut && data.totalBreakMinutes) {
        breakWrap.style.display = 'block';
        breakVal.textContent = `${data.totalBreakMinutes} mins total`;
      } else {
        breakWrap.style.display = 'none';
      }
    }

    punchModal.classList.add('active');

    // Auto dismiss after 4.5 seconds
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
  // 4. CAMERA TOGGLE & CONTROLS
  // -------------------------------------------------------------
  const cameraToggleBtn = document.getElementById('camera-toggle-btn');
  if (cameraToggleBtn) {
    cameraToggleBtn.addEventListener('click', async () => {
      if (window.barcodeScanner.isCameraRunning) {
        await window.barcodeScanner.stopCamera();
        window.apiService.showToast('Camera paused', 'info');
      } else {
        await window.barcodeScanner.initCamera('camera-preview');
      }
    });
  }

  // Switch camera button (flip front/back or reload stream)
  const switchCamBtn = document.getElementById('switch-camera-btn');
  if (switchCamBtn) {
    switchCamBtn.addEventListener('click', async () => {
      await window.barcodeScanner.switchCamera();
    });
  }

  // Toggle torch / illumination boost button
  const toggleTorchBtn = document.getElementById('toggle-torch-btn');
  if (toggleTorchBtn) {
    toggleTorchBtn.addEventListener('click', async () => {
      await window.barcodeScanner.toggleTorch();
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
        processAttendancePunch(code, 'MANUAL_KIOSK', selectedPunchAction);
        manualInput.value = '';
      }
    };
    manualSubmitBtn.addEventListener('click', handleManualSubmit);
    manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleManualSubmit();
    });
  }

  // -------------------------------------------------------------
  // 5. REGISTERED PERSONNEL ROSTER & EMPLOYEE CACHE
  // -------------------------------------------------------------
  async function loadQuickTestShelf() {
    const res = await window.apiService.getEmployees({ status: 'active' });
    if (!res.ok) return;

    cachedEmployees = res.data.employees;
    const shelfGrid = document.getElementById('test-badges-grid');
    if (!shelfGrid) return;
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
        <button class="test-badge-action" title="Verify employee identity">Verify ID</button>
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
      window.barcodeScanner.initCamera('camera-preview');
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
    if (tab === 'idcard') initIdBadgeStudio();
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
            CAMERA_BARCODE: 'WebRTC Camera',
            USB_HARDWARE: 'USB Scanner Gun',
            MANUAL_KIOSK: 'Manual Entry'
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
                <span style="display:inline-flex; align-items:center; gap:4px; font-family: var(--font-mono); font-size: 0.78rem; color: var(--teal-700); font-weight: 600;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  ${log.location ? `${log.location.distanceMeters}m from office` : 'Verified'}
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
            <button class="btn-action-icon view-history-btn" data-id="${emp.id}" title="View Individual Attendance History">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            </button>
            <button class="btn-action-icon generate-badge-btn" data-id="${emp.id}" title="Generate Official Badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line></svg>
            </button>
            <button class="btn-action-icon edit-emp-btn" data-id="${emp.id}" title="Edit Credentials">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="btn-action-icon toggle-status-btn" data-id="${emp.id}" title="Toggle Active/Inactive">
              ${emp.status === 'Active' 
                ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>' 
                : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'}
            </button>
            <button class="btn-action-icon danger-hover delete-emp-btn" data-id="${emp.id}" title="Permanently Delete Employee">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
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

    tbody.querySelectorAll('.delete-emp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emp = cachedEmployees.find(e => e.id === btn.dataset.id);
        if (emp) openDeleteEmployeeModal(emp);
      });
    });
  }

  // Delete Employee Confirmation Modal Handlers
  function openDeleteEmployeeModal(emp) {
    if (!emp || !deleteEmpModal) return;
    pendingDeleteEmpId = emp.id;

    const nameTarget = document.getElementById('delete-emp-name-target');
    const idTarget = document.getElementById('delete-emp-id-target');
    if (nameTarget) nameTarget.textContent = emp.name;
    if (idTarget) idTarget.textContent = emp.id;

    deleteEmpModal.classList.add('active');
  }

  function closeDeleteEmployeeModal() {
    if (!deleteEmpModal) return;
    deleteEmpModal.classList.remove('active');
    pendingDeleteEmpId = null;
  }

  const closeDeleteEmpModalBtn = document.getElementById('close-delete-emp-modal-btn');
  const cancelDeleteEmpBtn = document.getElementById('cancel-delete-emp-btn');
  const confirmDeleteEmpBtn = document.getElementById('confirm-delete-emp-btn');

  if (closeDeleteEmpModalBtn) closeDeleteEmpModalBtn.addEventListener('click', closeDeleteEmployeeModal);
  if (cancelDeleteEmpBtn) cancelDeleteEmpBtn.addEventListener('click', closeDeleteEmployeeModal);

  if (confirmDeleteEmpBtn) {
    confirmDeleteEmpBtn.addEventListener('click', async () => {
      if (!pendingDeleteEmpId) return;

      const targetEmp = cachedEmployees.find(e => e.id === pendingDeleteEmpId);
      const empName = targetEmp ? targetEmp.name : pendingDeleteEmpId;

      confirmDeleteEmpBtn.disabled = true;
      confirmDeleteEmpBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite; margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
        Deleting...
      `;

      try {
        const res = await window.apiService.deleteEmployeePermanently(pendingDeleteEmpId);
        if (res.ok) {
          window.soundFX.playCheckOutSuccess();
          window.apiService.showToast(`Employee ${empName} permanently deleted`, 'success');
          closeDeleteEmployeeModal();
          await loadEmployeesTable();
          await loadTodayLiveOverview();
          await loadQuickTestShelf();
          if (typeof initIdBadgeStudio === 'function') {
            initIdBadgeStudio();
          }
        } else {
          window.apiService.showToast(res.data.message || 'Failed to delete employee', 'error');
        }
      } catch (err) {
        console.error('Delete employee error:', err);
        window.apiService.showToast('Network error during deletion', 'error');
      } finally {
        confirmDeleteEmpBtn.disabled = false;
        confirmDeleteEmpBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Confirm Delete
        `;
      }
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
      const designationVal = document.getElementById('emp-designation-input').value.trim();
      const payload = {
        name: document.getElementById('emp-name-input').value.trim(),
        email: document.getElementById('emp-email-input').value.trim(),
        department: document.getElementById('emp-dept-select').value,
        designation: designationVal,
        role: designationVal,
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
        window.apiService.showToast(res.data.message || 'Employee credentials saved successfully', 'success');
        if (employeeModal) employeeModal.classList.remove('active');
        if (empForm) empForm.reset();
        editingEmployeeId = null;
        loadEmployeesTable();
        loadQuickTestShelf();
        if (typeof initIdBadgeStudio === 'function') {
          initIdBadgeStudio();
        }
      } else {
        window.apiService.showToast(res.data.message || 'Error saving employee to database', 'error');
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
    document.getElementById('hist-stat-streak').textContent = `${stats.streak} Days`;
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
  // 12. DYNAMIC DIGITAL ID BADGE STUDIO (Requirement #3)
  // -------------------------------------------------------------
  function openIdBadgeModal(emp) {
    window.idCardStudio.renderBadge(emp, 'modal-id-card-render-zone');
    if (idBadgeModal) idBadgeModal.classList.add('active');
  }

  function initIdBadgeStudio() {
    const select = document.getElementById('id-badge-employee-select');
    const searchInput = document.getElementById('id-badge-search-input');
    if (!select) return;

    if (!cachedEmployees || cachedEmployees.length === 0) {
      select.innerHTML = '<option value="">Loading employees...</option>';
      window.apiService.getEmployees().then(res => {
        if (res.ok && res.data.employees) {
          cachedEmployees = res.data.employees;
          initIdBadgeStudio();
        }
      });
      return;
    }

    const currentVal = select.value;
    select.innerHTML = cachedEmployees.map(emp => `
      <option value="${emp.id}">${emp.name} (${emp.id}) — ${emp.department.replace('SS40 ', '')}</option>
    `).join('');

    if (currentVal && cachedEmployees.some(e => e.id === currentVal)) {
      select.value = currentVal;
    } else {
      select.value = cachedEmployees[0].id;
    }

    const selectedEmp = cachedEmployees.find(e => e.id === select.value) || cachedEmployees[0];
    if (selectedEmp) {
      window.idCardStudio.renderBadge(selectedEmp, 'id-badge-preview-zone');
    }

    select.onchange = () => {
      const emp = cachedEmployees.find(e => e.id === select.value);
      if (emp) window.idCardStudio.renderBadge(emp, 'id-badge-preview-zone');
    };

    if (searchInput) {
      searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase().trim();
        if (!q) return;
        const matched = cachedEmployees.find(e =>
          e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q)
        );
        if (matched) {
          select.value = matched.id;
          window.idCardStudio.renderBadge(matched, 'id-badge-preview-zone');
        }
      };
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
  // 13. ATTENDANCE LOGS & DEPARTMENT-WISE REPORTS (Requirement #2)
  // -------------------------------------------------------------
  async function loadAttendanceLogs(filters = {}) {
    const tbody = document.getElementById('all-logs-tbody');
    if (!tbody) return;

    const queryParams = { limit: 50, ...filters };
    const res = await window.apiService.getAttendanceLogs(queryParams);
    if (!res.ok) return;

    const logs = res.data.attendance;
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color:var(--text-muted);">No attendance logs found matching filter criteria.</td></tr>`;
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

  // Report Generator Handlers (Requirement #2)
  const reportDeptFilter = document.getElementById('report-dept-filter');
  const exportTotalReportBtn = document.getElementById('export-total-report-btn');
  const exportDeptReportBtn = document.getElementById('export-dept-report-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');

  if (exportTotalReportBtn) {
    exportTotalReportBtn.addEventListener('click', () => {
      window.open('/api/attendance/export?department=all', '_blank');
      window.apiService.showToast('Generating official Total Company attendance report...', 'success');
    });
  }

  if (exportDeptReportBtn && reportDeptFilter) {
    exportDeptReportBtn.addEventListener('click', () => {
      const dept = reportDeptFilter.value;
      const url = dept === 'all'
        ? '/api/attendance/export?department=all'
        : `/api/attendance/export?department=${encodeURIComponent(dept)}`;
      window.open(url, '_blank');
      const label = dept === 'all' ? 'Total Company' : dept;
      window.apiService.showToast(`Generating ${label} attendance report...`, 'success');
    });
  }

  if (reportDeptFilter) {
    reportDeptFilter.addEventListener('change', () => {
      const dept = reportDeptFilter.value;
      const badge = document.getElementById('log-current-filter-badge');
      if (badge) {
        badge.textContent = dept === 'all' ? 'Showing: All Departments' : `Filtered: ${dept}`;
      }
      loadAttendanceLogs(dept === 'all' ? {} : { department: dept });
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      window.open('/api/attendance/export?department=all', '_blank');
      window.apiService.showToast('Generating official CSV report...', 'success');
    });
  }

  // -------------------------------------------------------------
  // 14. INTERACTIVE PERFORMANCE TRACKER & STREAKS (Requirement #5)
  // -------------------------------------------------------------
  async function loadHeatmapAndStats() {
    const res = await window.apiService.getAttendanceStats();
    if (!res.ok) return;

    const d = res.data;
    window.attendanceHeatmap.render(d.heatmapData, d.topStreaks, d.allEmployeePerformance);

    const scoreEl = document.getElementById('stat-punctuality-score');
    if (scoreEl) scoreEl.textContent = `${d.summary.punctualityScore}%`;

    const totalLogsEl = document.getElementById('stat-total-logs');
    if (totalLogsEl) totalLogsEl.textContent = d.summary.totalLogs;
  }

  const streakDeptFilter = document.getElementById('streak-dept-filter');
  if (streakDeptFilter) {
    streakDeptFilter.addEventListener('change', (e) => {
      window.attendanceHeatmap.setDepartmentFilter(e.target.value);
    });
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
  await window.barcodeScanner.initCamera('camera-preview');

  console.log('SS40 Network Smart Attendance System initialized successfully.');
});

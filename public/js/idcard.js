/**
 * SS40 NETWORK SMART ATTENDANCE - DIGITAL ID BADGE STUDIO
 * Renders corporate ID cards with scannable Code-128 Barcodes using JsBarcode
 * 100% professional corporate aesthetic without emojis
 */

class IdCardStudio {
  constructor() {
    this.currentEmployee = null;
  }

  renderBadge(employee, containerId = 'id-badge-preview-zone') {
    if (!employee) return;
    this.currentEmployee = employee;
    const container = document.getElementById(containerId);
    if (!container) return;

    const initialLetter = employee.name ? employee.name.charAt(0).toUpperCase() : 'E';
    const joinedYear = employee.joiningDate ? employee.joiningDate.slice(0, 4) : (employee.joinedDate ? new Date(employee.joinedDate).getFullYear() : '2023');
    const shiftVal = employee.shiftSchedule || employee.shift || '09:30 - 18:30';
    const bloodVal = employee.bloodGroup || 'O+';
    const emergencyVal = employee.emergencyContact || '+91 94421 88299';
    const barcodeSvgId = 'badge-barcode-' + Math.random().toString(36).substr(2, 9);

    container.innerHTML = `
      <div class="id-card-corporate" id="printable-id-card">
        <div class="id-card-lanyard-slot"></div>
        
        <!-- Header: SS40 Network Identity -->
        <div class="id-card-header">
          <div class="id-card-company-name">SS40 NETWORK</div>
          <div class="id-card-subline">SS40 NETWORK PRIVATE LIMITED</div>
          <div class="id-card-office-tag">Tirunelveli Incubation Centre HQ</div>
        </div>

        <!-- Center: Employee Avatar Badge -->
        <div class="id-card-avatar-box" style="background-color: ${employee.avatarColor || '#0F766E'};">
          <span>${initialLetter}</span>
          <div class="id-card-verified-badge" title="Official Verified Personnel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        <!-- Body: Credentials -->
        <div class="id-card-body">
          <div class="id-card-emp-name">${employee.name}</div>
          <div class="id-card-emp-role">${employee.designation || 'Specialist'}</div>
          <div class="id-card-emp-dept">${employee.department}</div>

          <div class="id-card-meta-grid">
            <div class="id-meta-item">
              <span class="id-meta-label">EMP ID</span>
              <span class="id-meta-val">${employee.id}</span>
            </div>
            <div class="id-meta-item">
              <span class="id-meta-label">BLOOD GROUP</span>
              <span class="id-meta-val">${bloodVal}</span>
            </div>
            <div class="id-meta-item">
              <span class="id-meta-label">JOINED</span>
              <span class="id-meta-val">${joinedYear}</span>
            </div>
            <div class="id-meta-item">
              <span class="id-meta-label">SHIFT</span>
              <span class="id-meta-val">${shiftVal}</span>
            </div>
            <div class="id-meta-item id-meta-full">
              <span class="id-meta-label">EMERGENCY</span>
              <span class="id-meta-val">${emergencyVal}</span>
            </div>
          </div>

          <!-- Scannable Code-128 Barcode Section -->
          <div class="id-card-barcode-wrap">
            <svg id="${barcodeSvgId}" class="id-card-barcode-svg"></svg>
            <div class="id-card-barcode-val">${employee.barcode || employee.id}</div>
            <div class="id-card-footer-cin">CIN: U72900TN2023PTC160892 • MUNICIPAL INCUBATION CENTRE</div>
          </div>
        </div>
      </div>
    `;

    // Render Crisp Code-128 Barcode via JsBarcode without text collision
    try {
      if (typeof JsBarcode !== 'undefined') {
        JsBarcode('#' + barcodeSvgId, employee.barcode || employee.id, {
          format: 'CODE128',
          lineColor: '#0F172A',
          width: 1.5,
          height: 36,
          displayValue: false,
          margin: 0
        });
      }
    } catch (e) {
      console.warn('JsBarcode render error:', e);
    }
  }

  printBadge() {
    window.print();
  }
}

window.idCardStudio = new IdCardStudio();

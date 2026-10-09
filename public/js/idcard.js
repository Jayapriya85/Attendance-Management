/**
 * SS40 NETWORK SMART ATTENDANCE - DIGITAL ID BADGE STUDIO
 * Renders corporate ID cards with scannable Code-128 Barcodes using JsBarcode
 */

class IdCardStudio {
  constructor() {
    this.currentEmployee = null;
  }

  renderBadge(employee, containerId = 'id-card-render-zone') {
    this.currentEmployee = employee;
    const container = document.getElementById(containerId);
    if (!container) return;

    const initialLetter = employee.name ? employee.name.charAt(0).toUpperCase() : 'E';
    const joinedYear = employee.joinedDate ? new Date(employee.joinedDate).getFullYear() : '2023';

    container.innerHTML = `
      <div class="id-card-corporate" id="printable-id-card">
        <div class="id-card-lanyard-slot"></div>
        
        <!-- Header: SS40 Network Identity -->
        <div class="id-card-header">
          <div class="id-card-company-name">SS40 NETWORK</div>
          <div class="id-card-subline">SS40 NETWORK PRIVATE LIMITED</div>
        </div>

        <!-- Center: Employee Avatar Badge -->
        <div class="id-card-avatar-box" style="background-color: ${employee.avatarColor || '#0F766E'};">
          <span>${initialLetter}</span>
        </div>

        <!-- Body: Credentials -->
        <div class="id-card-body">
          <div class="id-card-emp-name">${employee.name}</div>
          <div class="id-card-emp-role">${employee.designation || 'Engineer'}</div>
          <div class="id-card-emp-dept">${employee.department}</div>

          <table class="id-card-meta-table">
            <tr>
              <td class="label">EMP ID:</td>
              <td class="val">${employee.id}</td>
              <td class="label">BLOOD:</td>
              <td class="val">${employee.bloodGroup || 'O+'}</td>
            </tr>
            <tr>
              <td class="label">JOINED:</td>
              <td class="val">${joinedYear}</td>
              <td class="label">SHIFT:</td>
              <td class="val">${employee.shift || '09:30 - 18:30'}</td>
            </tr>
            <tr>
              <td class="label">EMERGENCY:</td>
              <td class="val" colspan="3">${employee.emergencyContact || '+91 8300591750'}</td>
            </tr>
          </table>

          <!-- Scannable Code-128 Barcode Section -->
          <div class="id-card-barcode-wrap">
            <svg id="id-card-barcode-svg" class="id-card-barcode-svg"></svg>
            <div class="id-card-footer-cin">CIN: U72900TN2023PTC160892 • TIRUNELVELI HQ</div>
          </div>
        </div>
      </div>
    `;

    // Render Crisp Code-128 Barcode via JsBarcode
    try {
      if (typeof JsBarcode !== 'undefined') {
        JsBarcode('#id-card-barcode-svg', employee.barcode || employee.id, {
          format: 'CODE128',
          lineColor: '#0F172A',
          width: 1.8,
          height: 38,
          displayValue: true,
          fontSize: 11,
          font: 'monospace',
          margin: 4
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

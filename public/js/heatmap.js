/**
 * SS40 NETWORK SMART ATTENDANCE - INTERACTIVE STREAK & PERFORMANCE TRACKER
 * Visual attendance consistency matrix, clickable day inspector, and employee streak leaderboard
 * 100% corporate aesthetic without emojis
 */

class AttendanceHeatmap {
  constructor() {
    this.containerId = 'attendance-heatmap-grid';
    this.detailsContainerId = 'heatmap-day-details';
    this.streaksContainerId = 'top-streaks-container';
    this.currentData = null;
    this.selectedDate = null;
    this.selectedDeptFilter = 'all';
  }

  render(heatmapData, topStreaks, allEmployeePerformance = []) {
    this.currentData = {
      heatmapData: heatmapData || [],
      topStreaks: topStreaks || [],
      allPerformance: (allEmployeePerformance && allEmployeePerformance.length > 0) ? allEmployeePerformance : (topStreaks || [])
    };

    this.renderHeatmapGrid();
    this.renderPerformanceLeaderboard();
  }

  renderHeatmapGrid() {
    const gridEl = document.getElementById(this.containerId);
    if (!gridEl) return;

    const data = this.currentData ? this.currentData.heatmapData : [];
    if (!data || data.length === 0) {
      gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.85rem;">No historical records found for this period.</div>`;
      return;
    }

    gridEl.innerHTML = '';

    data.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      if (this.selectedDate === day.date) {
        cell.classList.add('selected');
      }

      const d = new Date(day.date);
      const dayNum = d.getDate();
      const isSunday = d.getDay() === 0;

      // Determine punctuality level
      let level = 0;
      if (isSunday) {
        cell.classList.add('sunday');
        cell.title = `${day.date} (Sunday - Weekly Off)`;
      } else {
        const total = day.count || 0;
        const onTime = day.onTime || 0;
        const punctuality = total > 0 ? (onTime / total) : 0;

        if (total === 0) {
          level = 0;
        } else if (punctuality < 0.6) {
          level = 1;
        } else if (punctuality < 0.8) {
          level = 2;
        } else if (punctuality < 0.95) {
          level = 3;
        } else {
          level = 4;
        }

        cell.classList.add(`level-${level}`);
        cell.title = `${day.date}: ${day.count} Present (${day.onTime || 0} On-Time, ${day.grace || 0} Grace, ${day.late || 0} Late) — Click to inspect`;
      }

      cell.innerHTML = `<span>${dayNum}</span>`;

      // Interactive Click on Date Cell
      cell.addEventListener('click', () => {
        this.selectDate(day);
      });

      gridEl.appendChild(cell);
    });

    // Auto-select latest or current date if none selected
    if (!this.selectedDate && data.length > 0) {
      const lastDay = data[data.length - 1];
      this.selectDate(lastDay);
    }
  }

  selectDate(day) {
    this.selectedDate = day.date;

    // Highlight selected cell
    const cells = document.querySelectorAll('.heatmap-cell');
    cells.forEach(c => c.classList.remove('selected'));

    const gridEl = document.getElementById(this.containerId);
    if (gridEl) {
      const data = this.currentData ? this.currentData.heatmapData : [];
      const index = data.findIndex(d => d.date === day.date);
      if (index >= 0 && gridEl.children[index]) {
        gridEl.children[index].classList.add('selected');
      }
    }

    this.renderDayDetails(day);
  }

  renderDayDetails(day) {
    const detailsContainer = document.getElementById(this.detailsContainerId);
    if (!detailsContainer) return;

    const records = day.records || [];
    const formattedDate = new Date(day.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    detailsContainer.innerHTML = `
      <div class="day-details-card">
        <div class="day-details-header">
          <div>
            <div class="day-details-title">${formattedDate}</div>
            <div class="day-details-sub">Shift Audit Breakdown & Individual Scans</div>
          </div>
          <div class="day-details-metrics">
            <span class="metric-chip on-time">On-Time: ${day.onTime || 0}</span>
            <span class="metric-chip grace">Grace: ${day.grace || 0}</span>
            <span class="metric-chip late">Late: ${day.late || 0}</span>
            <span class="metric-chip total">Total: ${day.count || 0}</span>
          </div>
        </div>

        <div class="day-details-table-wrap">
          ${records.length === 0 ? `
            <div style="padding: 1.25rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
              No shift check-ins recorded on this calendar day.
            </div>
          ` : `
            <table class="data-table" style="font-size: 0.78rem;">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Status</th>
                  <th>Geofence</th>
                </tr>
              </thead>
              <tbody>
                ${records.map(r => {
                  const statusMap = {
                    ON_TIME: { label: 'On-Time', cls: 'on-time' },
                    GRACE_PERIOD: { label: 'Grace Period', cls: 'grace' },
                    LATE: { label: 'Late Coming', cls: 'late' },
                    EARLY_LEAVING: { label: 'Early Leave', cls: 'early' },
                    OVERTIME: { label: 'Overtime', cls: 'overtime' }
                  };
                  const s = statusMap[r.status] || { label: r.status, cls: 'on-time' };

                  return `
                    <tr>
                      <td>
                        <strong>${r.employeeName}</strong>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">${r.employeeId}</div>
                      </td>
                      <td>${r.department.replace('SS40 ', '')}</td>
                      <td><strong>${r.checkInTime || '-'}</strong></td>
                      <td>${r.checkOutTime || 'Active'}</td>
                      <td><span class="status-badge ${s.cls}">${s.label}</span></td>
                      <td>
                        <span style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--teal-700); font-weight: 600;">
                          ${r.location ? `${r.location.distanceMeters}m Verified` : 'Verified'}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
  }

  setDepartmentFilter(dept) {
    this.selectedDeptFilter = dept;
    this.renderPerformanceLeaderboard();
  }

  renderPerformanceLeaderboard() {
    const streakContainer = document.getElementById(this.streaksContainerId);
    if (!streakContainer || !this.currentData) return;

    let employees = [...this.currentData.allPerformance];

    if (this.selectedDeptFilter && this.selectedDeptFilter !== 'all') {
      employees = employees.filter(e => e.department.includes(this.selectedDeptFilter) || e.department === this.selectedDeptFilter);
    }

    if (employees.length === 0) {
      streakContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.85rem;">No employees matching selected department filter.</div>`;
      return;
    }

    streakContainer.innerHTML = employees.map((item, idx) => {
      const consistency = item.consistencyRate !== undefined ? item.consistencyRate : 95;
      const initial = item.name ? item.name.charAt(0) : 'E';

      return `
        <div class="streak-performance-card">
          <div class="streak-card-top">
            <div class="emp-avatar-sm" style="background-color: ${item.avatarColor || '#0F766E'};">
              ${initial}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div class="streak-emp-name">${item.name}</div>
              <div class="streak-emp-meta">${item.id} • ${item.department.replace('SS40 ', '')}</div>
            </div>
            <div class="streak-badge-box">
              <div class="streak-number">${item.streak}</div>
              <div class="streak-label">Consecutive Days</div>
            </div>
          </div>

          <!-- Punctuality Consistency Bar -->
          <div class="streak-consistency-row">
            <div class="consistency-label-wrap">
              <span>Check-In Consistency</span>
              <strong>${consistency}%</strong>
            </div>
            <div class="consistency-progress-track">
              <div class="consistency-progress-bar" style="width: ${consistency}%; background-color: ${consistency >= 85 ? 'var(--emerald-500)' : consistency >= 70 ? 'var(--amber-500)' : 'var(--rose-500)'};"></div>
            </div>
          </div>

          <!-- Bottom Metric Chips -->
          <div class="streak-chips-row">
            <span class="chip-item">On-Time: <strong>${item.onTimeCount || 0}</strong></span>
            <span class="chip-item">Grace: <strong>${item.graceCount || 0}</strong></span>
            <span class="chip-item">Late: <strong>${item.lateCount || 0}</strong></span>
            <span class="chip-item">Total Shifts: <strong>${item.totalAttendance || 0}</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }
}

window.attendanceHeatmap = new AttendanceHeatmap();

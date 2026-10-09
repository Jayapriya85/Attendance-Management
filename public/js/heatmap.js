/**
 * SS40 NETWORK SMART ATTENDANCE - ATTENDANCE HEATMAP & STREAK TRACKER
 * Visual representation of monthly attendance consistency & punctuality streaks
 */

class AttendanceHeatmap {
  constructor() {
    this.containerId = 'attendance-heatmap-grid';
  }

  render(heatmapData, topStreaks) {
    const gridEl = document.getElementById(this.containerId);
    if (!gridEl) return;

    if (!heatmapData || heatmapData.length === 0) {
      gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem;">No historical records found for this period.</div>`;
      return;
    }

    gridEl.innerHTML = '';

    heatmapData.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';

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
        cell.title = `${day.date}: ${day.count} Present (${day.onTime || 0} On-Time, ${day.grace || 0} Grace, ${day.late || 0} Late)`;
      }

      cell.innerHTML = `<span>${dayNum}</span>`;
      gridEl.appendChild(cell);
    });

    // Render Top Streaks Leaderboard
    const streakContainer = document.getElementById('top-streaks-container');
    if (streakContainer && topStreaks) {
      streakContainer.innerHTML = topStreaks.map((item, idx) => `
        <div class="streak-card">
          <div class="emp-avatar-sm" style="background-color: ${item.avatarColor || '#0F766E'};">
            ${item.name.charAt(0)}
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 0.84rem; color: var(--navy-900);">${item.name}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${item.department.replace('SS40 ', '')}</div>
          </div>
          <div style="text-align: right;">
            <div class="streak-count">🔥 ${item.streak}</div>
            <div style="font-size: 0.68rem; color: var(--text-muted); font-weight: 600;">Day Streak</div>
          </div>
        </div>
      `).join('');
    }
  }
}

window.attendanceHeatmap = new AttendanceHeatmap();

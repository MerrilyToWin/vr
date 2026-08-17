/**
 * SYNOVA Dashboard Controller
 */
import { fitnessMath } from './utils.js';

let dashboardInterval = null;

// Helper to check and return achievement statuses
export function checkAchievements() {
  const achievements = [
    {
      id: 'first_steps',
      title: 'First Steps',
      desc: 'Complete at least 10 steps in the running challenge.',
      icon: 'footprints',
      unlocked: false
    },
    {
      id: 'speed_demon',
      title: 'Speed Demon',
      desc: 'Reach a running speed above 8 km/h.',
      icon: 'zap',
      unlocked: false
    },
    {
      id: 'combo_master',
      title: 'Combo Master',
      desc: 'Achieve a 10+ combo in Catch the Ball.',
      icon: 'flame',
      unlocked: false
    },
    {
      id: 'golden_touch',
      title: 'Golden Catch',
      desc: 'Catch a high-value Golden Ball (+50).',
      icon: 'sparkles',
      unlocked: false
    },
    {
      id: 'marksman',
      title: 'Marksman',
      desc: 'Reach 80%+ accuracy in Catch the Ball.',
      icon: 'target',
      unlocked: false
    },
    {
      id: 'calorie_burner',
      title: 'Calorie Burner',
      desc: 'Burn more than 10 calories in this session.',
      icon: 'fire',
      unlocked: false
    },
    {
      id: 'tightrope_pro',
      title: 'Tightrope Master',
      desc: 'Survive on the tightrope for 30+ seconds.',
      icon: 'activity',
      unlocked: false
    },
  ];

  const cbResults = window.appState.gameResults.catchBall;
  const runResults = window.appState.gameResults.running;
  
  // 1. First Steps: steps >= 10
  const totalSteps = runResults.reduce((acc, curr) => acc + curr.steps, 0);
  if (totalSteps >= 10) {
    achievements.find(a => a.id === 'first_steps').unlocked = true;
  }
  
  // 2. Speed Demon: max speed > 8
  const maxSpeed = runResults.reduce((max, curr) => Math.max(max, curr.speed), 0);
  if (maxSpeed > 8) {
    achievements.find(a => a.id === 'speed_demon').unlocked = true;
  }
  
  // 3. Combo Master
  const maxCombo = cbResults.reduce((max, curr) => Math.max(max, curr.maxCombo || 0), 0);
  if (maxCombo >= 10) {
    achievements.find(a => a.id === 'combo_master').unlocked = true;
  }
  
  // 4. Golden Touch (We can set a flag in appState.session or catch ball results)
  const caughtGolden = cbResults.some(r => r.caughtGolden);
  if (caughtGolden) {
    achievements.find(a => a.id === 'golden_touch').unlocked = true;
  }
  
  // 5. Marksman: accuracy >= 80% (with at least 10 balls caught)
  const hasMarksman = cbResults.some(r => r.accuracy >= 80 && r.ballsCaught >= 10);
  if (hasMarksman) {
    achievements.find(a => a.id === 'marksman').unlocked = true;
  }
  
  // 6. Calorie Burner: calories > 10
  const totalCalories = window.appState.session.totalCalories;
  if (totalCalories > 10) {
    achievements.find(a => a.id === 'calorie_burner').unlocked = true;
  }

  // 7. Tightrope Master
  const maxBalanceTime = (window.appState.gameResults.balance || []).reduce((max, curr) => Math.max(max, curr.duration || 0), 0);
  if (maxBalanceTime >= 30) {
    achievements.find(a => a.id === 'tightrope_pro').unlocked = true;
  }

  return achievements;
}

// Initialise the Dashboard view
export function initDashboard() {
  updateStats();
  renderAchievements();
  renderHistoryTable();
  renderProgressChart();
  renderPersonalBests();
  
  // Periodically refresh the timer and stats
  dashboardInterval = setInterval(() => {
    updateStats();
  }, 1000);
  
  return cleanupDashboard;
}

// Update dashboard text elements
function updateStats() {
  const usernameEl = document.getElementById('dash-username');
  const caloriesEl = document.getElementById('dash-calories');
  const durationEl = document.getElementById('dash-duration');
  const scoreEl = document.getElementById('dash-score');
  
  if (usernameEl && window.appState.user) {
    usernameEl.innerText = window.appState.user.name;
  }
  
  // Accumulate calorie and score totals across games
  const cbTotalScore = window.appState.gameResults.catchBall.reduce((acc, curr) => acc + curr.score, 0);
  const runTotalScore = window.appState.gameResults.running.reduce((acc, curr) => acc + curr.steps, 0); // steps count as score
  const balTotalScore = (window.appState.gameResults.balance || []).reduce((acc, curr) => acc + curr.score, 0);
  window.appState.session.totalScore = cbTotalScore + runTotalScore + balTotalScore;
  
  const cbCalories = window.appState.gameResults.catchBall.reduce((acc, curr) => acc + (curr.ballsCaught * 0.05), 0); // 0.05 kcal per catch
  const runCalories = window.appState.gameResults.running.reduce((acc, curr) => acc + curr.calories, 0);
  const balCalories = (window.appState.gameResults.balance || []).reduce((acc, curr) => acc + curr.calories, 0);
  window.appState.session.totalCalories = Math.round((cbCalories + runCalories + balCalories) * 10) / 10;
  
  if (caloriesEl) caloriesEl.innerText = window.appState.session.totalCalories.toFixed(1);
  if (scoreEl) scoreEl.innerText = window.appState.session.totalScore;
  
  // Format elapsed session time
  if (durationEl && window.appState.session.startTime) {
    const elapsedSecs = Math.floor((Date.now() - window.appState.session.startTime) / 1000);
    const mins = Math.floor(elapsedSecs / 60).toString().padStart(2, '0');
    const secs = (elapsedSecs % 60).toString().padStart(2, '0');
    durationEl.innerText = `${mins}:${secs}`;
  }

  // Admin dynamic enabling/disabling of game cards
  const catchBallCard = document.querySelector('a[href="#catch-ball"]')?.closest('.premium-card');
  const runningCard = document.querySelector('a[href="#running"]')?.closest('.premium-card');
  const balanceCard = document.querySelector('a[href="#balance"]')?.closest('.premium-card');
  
  if (catchBallCard) {
    const btn = catchBallCard.querySelector('a');
    if (window.appState.settings.catchBallEnabled === false) {
      catchBallCard.classList.add('opacity-50');
      btn.style.pointerEvents = 'none';
      btn.classList.add('bg-secondary');
    } else {
      catchBallCard.classList.remove('opacity-50');
      btn.style.pointerEvents = 'auto';
      btn.classList.remove('bg-secondary');
    }
  }

  if (runningCard) {
    const btn = runningCard.querySelector('a');
    if (window.appState.settings.runningEnabled === false) {
      runningCard.classList.add('opacity-50');
      btn.style.pointerEvents = 'none';
      btn.style.background = 'gray';
    } else {
      runningCard.classList.remove('opacity-50');
      btn.style.pointerEvents = 'auto';
      btn.style.background = '';
    }
  }

  if (balanceCard) {
    const btn = balanceCard.querySelector('a');
    if (window.appState.settings.balanceEnabled === false) {
      balanceCard.classList.add('opacity-50');
      btn.style.pointerEvents = 'none';
      btn.style.background = 'gray';
    } else {
      balanceCard.classList.remove('opacity-50');
      btn.style.pointerEvents = 'auto';
      btn.style.background = '';
    }
  }
}

// Render achievement tokens list
function renderAchievements() {
  const container = document.getElementById('dash-achievements-container');
  if (!container) return;
  
  const list = checkAchievements();
  let html = '';
  
  list.forEach((ach) => {
    const opacityClass = ach.unlocked ? '' : 'opacity-50';
    const borderClass = ach.unlocked ? 'border-success' : '';
    const badgeHtml = ach.unlocked 
      ? `<span class="badge bg-success text-white small" style="border-radius: 8px;">Unlocked</span>` 
      : `<span class="badge bg-secondary text-white small" style="border-radius: 8px;">Locked</span>`;
      
    html += `
      <div class="d-flex align-items-center justify-content-between p-2 rounded-3 border mb-2 ${borderClass} ${opacityClass}" style="background: rgba(255,255,255,0.02);">
        <div class="d-flex align-items-center gap-2">
          <div class="btn-circle bg-light" style="width: 38px; height: 38px; border-radius: 10px;">
            <i data-lucide="${ach.icon}" style="width: 18px; height: 18px; color: ${ach.unlocked ? 'var(--accent-green)' : 'var(--text-muted)'};"></i>
          </div>
          <div>
            <p class="mb-0 fw-bold small text-start">${ach.title}</p>
            <p class="mb-0 text-muted" style="font-size: 0.7rem; text-align: left;">${ach.desc}</p>
          </div>
        </div>
        <div>
          ${badgeHtml}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  lucide.createIcons();
}

// Clean up references and intervals
export function cleanupDashboard() {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    dashboardInterval = null;
  }
  if (window.dashboardChartInstance) {
    window.dashboardChartInstance.destroy();
    window.dashboardChartInstance = null;
  }
}

// Render historical scores and workout details inside a responsive table
function renderHistoryTable() {
  const tbody = document.getElementById('dashboard-history-tbody');
  if (!tbody) return;

  const cb = window.appState.gameResults.catchBall || [];
  const run = window.appState.gameResults.running || [];
  const bal = window.appState.gameResults.balance || [];

  const history = [
    ...cb.map(r => ({ date: r.date, game: 'Catch Ball', score: r.score, calories: r.ballsCaught * 0.05, desc: `${r.ballsCaught} caught (${r.accuracy}%)` })),
    ...run.map(r => ({ date: r.date, game: 'Running', score: r.steps, calories: r.calories, desc: `${r.steps} steps (${r.speed} km/h)` })),
    ...bal.map(r => ({ date: r.date, game: 'Tight Rope', score: r.score, calories: r.calories, desc: `${r.distance}m (${100 - r.maxDeviation}% stab)` }))
  ];

  // Sort chronologically (newest first)
  history.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-3">No workouts completed yet</td>
      </tr>
    `;
    return;
  }

  let html = '';
  history.forEach(item => {
    const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
    
    html += `
      <tr style="border-bottom: 1px solid #f1f5f9; vertical-align: middle;">
        <td class="text-muted">${formattedDate}</td>
        <td class="fw-bold">${item.game}</td>
        <td class="text-primary fw-bold">${item.score}</td>
        <td class="text-danger fw-bold">${item.calories.toFixed(1)}</td>
        <td class="text-muted text-truncate" style="max-width: 110px;">${item.desc}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// Render score analytics over time using Chart.js
function renderProgressChart() {
  const canvas = document.getElementById('dashboard-progress-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const cb = window.appState.gameResults.catchBall || [];
  const run = window.appState.gameResults.running || [];
  const bal = window.appState.gameResults.balance || [];

  const combined = [
    ...cb.map(r => ({ date: r.date, score: r.score })),
    ...run.map(r => ({ date: r.date, score: r.steps })), // steps are score
    ...bal.map(r => ({ date: r.date, score: r.score }))
  ];

  // Sort oldest first for progression trend
  combined.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (window.dashboardChartInstance) {
    window.dashboardChartInstance.destroy();
  }

  // Draw flat line placeholder if empty
  const chartLabels = combined.length > 0 ? combined.map((_, idx) => `Set ${idx + 1}`) : ['No Data'];
  const chartData = combined.length > 0 ? combined.map(item => item.score) : [0];

  const isDark = document.body.getAttribute('data-theme') === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const labelColor = isDark ? '#94A3B8' : '#64748B';

  window.dashboardChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Score',
        data: chartData,
        borderColor: '#2563EB',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#2563EB',
        pointRadius: combined.length > 0 ? 3 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: labelColor, font: { family: 'Poppins', size: 9 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: labelColor, font: { family: 'Poppins', size: 9 } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// Display highest metrics from all past game sessions (Personal Bests)
function renderPersonalBests() {
  const cb = window.appState.gameResults.catchBall || [];
  const run = window.appState.gameResults.running || [];
  const bal = window.appState.gameResults.balance || [];

  const combined = [
    ...cb.map(r => r.score),
    ...run.map(r => r.steps),
    ...bal.map(r => r.score)
  ];

  const maxScore = combined.length > 0 ? Math.max(...combined) : 0;
  const maxCombo = cb.length > 0 ? Math.max(...cb.map(r => r.maxCombo || 0)) : 0;
  const maxSpeed = run.length > 0 ? Math.max(...run.map(r => r.speed || 0)) : 0.0;

  const pbScoreEl = document.getElementById('pb-score');
  const pbComboEl = document.getElementById('pb-combo');
  const pbSpeedEl = document.getElementById('pb-speed');

  if (pbScoreEl) pbScoreEl.innerText = maxScore;
  if (pbComboEl) pbComboEl.innerText = maxCombo;
  if (pbSpeedEl) pbSpeedEl.innerText = maxSpeed.toFixed(1);
}

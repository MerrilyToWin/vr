/**
 * SYNOVA Admin Dashboard Controller
 * Connects layout sections and handles Broadcast event loops.
 * Patient Analytics: loads patients from IndexedDB, switches views,
 * renders clinical KPIs, radar, trend, history table, and export.
 */

// ─── Patient Analytics State ───────────────────────────────────────────────
let allPatients = [];          // [{_id, name, age, gender, height, weight}]
let selectedPatientId = 'live'; // 'live' | patient._id
let patientResultsCache = {};   // patientId → results[]
let livePatientSnapshot = {     // Continuously updated by broadcast stream
  score: 0, calories: 0, steps: 0, caught: 0, missed: 0, accuracy: 0, combo: 0,
  speed: 0, distance: 0, name: '', age: 25, gender: 'Unknown', height: 175, weight: 70
};

// ─── IndexedDB helpers (standalone — no ES module import needed) ───────────
const IDBNAME = 'fitvr_db';
const IDBVER  = 1;

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDBNAME, IDBVER);
    req.onsuccess     = (e) => resolve(e.target.result);
    req.onerror       = (e) => reject(e.target.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('users')) {
        const us = db.createObjectStore('users', { keyPath: '_id' });
        us.createIndex('name', 'name', { unique: true });
      }
      if (!db.objectStoreNames.contains('results')) {
        const rs = db.createObjectStore('results', { keyPath: '_id' });
        rs.createIndex('userId', 'userId', { unique: false });
      }
    };
  });
}

async function idbGetAllUsers() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(['users'], 'readonly');
    const req = tx.objectStore('users').getAll();
    req.onsuccess = () => {
      const users = req.result || [];
      users.sort((a, b) => a.name.localeCompare(b.name));
      resolve(users);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbGetResultsForUser(userId) {
  if (patientResultsCache[userId]) return patientResultsCache[userId];
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(['results'], 'readonly');
    const idx = tx.objectStore('results').index('userId');
    const req = idx.getAll(userId);
    req.onsuccess = () => {
      const results = (req.result || []).sort((a, b) => new Date(a.date) - new Date(b.date));
      patientResultsCache[userId] = results;
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── DOMContentLoaded Entrypoint ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.adminCharts)   window.adminCharts.init();
  if (window.adminSettings) window.adminSettings.init();

  initSidebar();
  initBroadcastListener();
  initPatientSelector();
  initExportButton();

  const wipeBtn = document.getElementById('btn-admin-wipe');
  if (wipeBtn && window.adminSettings) {
    wipeBtn.addEventListener('click', () => window.adminSettings.remoteWipeSession());
  }
});

// ─── Sidebar Navigation ────────────────────────────────────────────────────
function initSidebar() {
  const menuItems   = document.querySelectorAll('.sidebar-menu .menu-item');
  const panels      = document.querySelectorAll('.panel-section');
  const headerTitle = document.getElementById('header-panel-title');
  const sidebar     = document.getElementById('sidebar');
  const toggleBtn   = document.getElementById('sidebar-toggle');

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const targetId = item.getAttribute('data-target');
      panels.forEach(p => p.classList.remove('active'));
      const activePanel = document.getElementById(targetId);
      if (activePanel) activePanel.classList.add('active');

      const targetLabel = item.querySelector('a').innerText.trim();
      if (headerTitle) headerTitle.innerText = targetLabel;
      if (sidebar) sidebar.classList.remove('open');

      // When switching to Reports, refresh patient analytics view
      if (targetId === 'panel-reports') refreshPatientAnalyticsView();
    });
  });

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
}

// ─── Patient Selector Initialization ──────────────────────────────────────
async function initPatientSelector() {
  const sel = document.getElementById('patient-selector');
  if (!sel) return;

  try { allPatients = await idbGetAllUsers(); } catch (err) { allPatients = []; }
  rebuildPatientDropdown(sel);

  sel.addEventListener('change', async (e) => {
    selectedPatientId = e.target.value;
    patientResultsCache = {};
    await refreshPatientAnalyticsView();
  });
}

function rebuildPatientDropdown(sel) {
  if (!sel) return;
  sel.innerHTML = `<option value="live">🟢 Live Athlete Stream</option>`;
  allPatients.forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p._id;
    opt.textContent = `👤 ${p.name}`;
    sel.appendChild(opt);
  });
}

async function refreshPatientList() {
  try {
    allPatients = await idbGetAllUsers();
    const sel = document.getElementById('patient-selector');
    if (sel) {
      const prev = sel.value;
      rebuildPatientDropdown(sel);
      if (prev) sel.value = prev;
    }
  } catch (err) {}
}

// ─── Patient Analytics Refresh ─────────────────────────────────────────────
async function refreshPatientAnalyticsView() {
  if (selectedPatientId === 'live') { renderLivePatientView(); return; }
  const patient = allPatients.find(p => p._id === selectedPatientId);
  if (!patient)  { renderLivePatientView(); return; }
  let results = [];
  try { results = await idbGetResultsForUser(patient._id); } catch (e) {}
  renderHistoricalPatientView(patient, results);
}

// ─── Live Patient View ─────────────────────────────────────────────────────
function renderLivePatientView() {
  const snap = livePatientSnapshot;
  updatePatientBanner({ name: snap.name || 'Live Athlete Stream', age: snap.age || '--', gender: snap.gender || 'Unknown', height: snap.height || '--', weight: snap.weight || '--' });
  const coordination = snap.accuracy || 0;
  const stability    = snap.caught > 0 ? Math.min(100, Math.round((snap.caught / Math.max(snap.caught + snap.missed, 1)) * 100)) : 0;
  const cardio       = snap.calories || 0;
  const overall      = computeOverallScore({ coordination, stability, cardioKcal: cardio, sessions: 0 });
  setVal('patient-kpi-coordination', `${coordination}%`);
  setVal('patient-kpi-stability',    `${stability}%`);
  setVal('patient-kpi-cardio',       `${cardio.toFixed(1)} kcal`);
  setVal('patient-kpi-overall',      `${overall} / 100`);
  const radarScores = computeRadarScores({ coordination, stability, cardioKcal: cardio, speed: snap.speed || 0, steps: snap.steps || 0, combo: snap.combo || 0, sessions: 0 });
  if (window.adminCharts) {
    window.adminCharts.updatePatientRadar(radarScores);
    window.adminCharts.updatePatientTrend(['Now'], [snap.score || 0], [coordination]);
    window.adminCharts.updateCardio(snap.steps, snap.distance || 0, cardio);
    window.adminCharts.updateAccuracy(snap.caught, snap.missed);
  }
  renderHistoryTable([], null);
}

// ─── Historical Patient View ───────────────────────────────────────────────
function renderHistoricalPatientView(patient, results) {
  updatePatientBanner(patient);
  const catchResults   = results.filter(r => r.gameType === 'catch-ball');
  const runResults     = results.filter(r => r.gameType === 'running');
  const balanceResults = results.filter(r => r.gameType === 'balance');
  const totalCalories  = results.reduce((s, r) => s + (r.calories || 0), 0);
  const avgAccuracy    = catchResults.length   ? Math.round(catchResults.reduce((s,r) => s + ((r.metadata?.accuracy) || 0), 0) / catchResults.length) : 0;
  const avgStability   = balanceResults.length ? Math.round(balanceResults.reduce((s,r) => s + ((r.metadata?.stability || r.metadata?.accuracy || 0)), 0) / balanceResults.length) : (runResults.length ? 72 : 0);
  const avgSpeed       = runResults.length ? (runResults.reduce((s,r) => s + ((r.metadata?.speed) || 0), 0) / runResults.length) : 0;
  const avgCombo       = catchResults.length ? Math.round(catchResults.reduce((s,r) => s + ((r.metadata?.maxCombo) || 0), 0) / catchResults.length) : 0;
  const totalSteps     = runResults.reduce((s,r) => s + ((r.metadata?.steps) || 0), 0);
  const coordination   = avgAccuracy;
  const stability      = avgStability;
  const overall        = computeOverallScore({ coordination, stability, cardioKcal: totalCalories, sessions: results.length });
  setVal('patient-kpi-coordination', `${coordination}%`);
  setVal('patient-kpi-stability',    `${stability}%`);
  setVal('patient-kpi-cardio',       `${totalCalories.toFixed(1)} kcal`);
  setVal('patient-kpi-overall',      `${overall} / 100`);
  const radarScores = computeRadarScores({ coordination, stability, cardioKcal: totalCalories, speed: avgSpeed, steps: totalSteps, combo: avgCombo, sessions: results.length });
  if (window.adminCharts) {
    window.adminCharts.updatePatientRadar(radarScores);
    if (results.length > 0) {
      window.adminCharts.updatePatientTrend(results.map((_,i) => `S${i+1}`), results.map(r => r.score || 0), results.map(r => r.metadata?.accuracy || r.metadata?.stability || 0));
    } else {
      window.adminCharts.updatePatientTrend(['No Sessions'], [0], [0]);
    }
    const latestRun   = runResults[runResults.length - 1];
    const latestCatch = catchResults[catchResults.length - 1];
    if (latestRun)   window.adminCharts.updateCardio(latestRun.metadata?.steps || 0, latestRun.metadata?.distance || 0, latestRun.calories || 0);
    if (latestCatch) window.adminCharts.updateAccuracy(latestCatch.metadata?.ballsCaught || 0, latestCatch.metadata?.ballsMissed || 0);
  }
  renderHistoryTable(results, patient);
}

// ─── Patient Banner Helper ─────────────────────────────────────────────────
function updatePatientBanner(patient) {
  const bmi    = patient.height && patient.weight ? (patient.weight / Math.pow(patient.height / 100, 2)).toFixed(1) : '--';
  const bmiCat = bmi !== '--' ? (bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese') : '--';
  const initials = (patient.name || 'LS').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  setVal('patient-avatar-text',  initials);
  setVal('patient-name-display', patient.name || 'Live Patient Stream');
  setVal('patient-bio-display',  patient.age
    ? `Age: ${patient.age} | Gender: ${patient.gender || 'N/A'} | Height: ${patient.height || '--'}cm | Weight: ${patient.weight || '--'}kg | BMI: ${bmi} (${bmiCat})`
    : 'Live data from active session');
  const riskBadge = document.getElementById('patient-risk-badge');
  if (riskBadge) {
    riskBadge.className = 'badge px-2 py-1 small rounded-pill';
    if (bmi === '--' || (bmi >= 18.5 && bmi < 25)) {
      riskBadge.classList.add('risk-badge-optimal');  riskBadge.textContent = 'Optimal Health';
    } else if ((bmi >= 17 && bmi < 18.5) || (bmi >= 25 && bmi < 30)) {
      riskBadge.classList.add('risk-badge-moderate'); riskBadge.textContent = 'Moderate Risk';
    } else {
      riskBadge.classList.add('risk-badge-high');     riskBadge.textContent = 'High Risk';
    }
  }
}

// ─── Clinical Scoring ──────────────────────────────────────────────────────
function computeOverallScore({ coordination, stability, cardioKcal, sessions }) {
  return Math.round(
    Math.min(coordination, 100) * 0.35 +
    Math.min(stability,    100) * 0.30 +
    Math.min(cardioKcal / 5, 100) * 0.20 +
    Math.min(sessions * 5,  100) * 0.15
  );
}

function computeRadarScores({ coordination, stability, cardioKcal, speed, steps, combo, sessions }) {
  return [
    Math.min(Math.round(coordination),          100), // Hand-Eye
    Math.min(Math.round(stability),             100), // Postural
    Math.min(Math.round(cardioKcal / 5),        100), // Endurance
    Math.min(Math.round(combo * 3.33),          100), // Reaction Speed
    Math.min(Math.round(steps / 10),            100), // Stride
    Math.min(Math.round((speed / 12) * 100),    100)  // Agility
  ];
}

// ─── History Table Renderer ────────────────────────────────────────────────
function renderHistoryTable(results, patient) {
  const tbody = document.getElementById('patient-history-tbody');
  const badge = document.getElementById('patient-session-count-badge');
  if (!tbody) return;
  if (badge) badge.textContent = `${results.length} Session${results.length !== 1 ? 's' : ''}`;
  if (results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">${patient ? `No recorded sessions for <strong>${patient.name}</strong>.` : 'Select a historical patient or start a live session.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = results.map((r, i) => {
    const date    = new Date(r.date);
    const dStr    = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const tStr    = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const game    = formatGameLabel(r.gameType);
    const dur     = r.duration ? `${Math.round(r.duration)}s` : '--';
    const primary = formatPrimaryMetric(r);
    const accStab = formatAccuracyStability(r);
    const cal     = r.calories != null ? `${r.calories.toFixed(1)} kcal` : '--';
    const { label, cls } = computeRowRisk(r);
    return `<tr class="${cls}">
      <td class="ps-3"><span class="fw-semibold">${dStr}</span><br><span class="text-muted small">${tStr}</span></td>
      <td>${game}</td><td>${dur}</td><td class="fw-bold">${primary}</td>
      <td>${accStab}</td><td>${cal}</td><td>${label}</td>
    </tr>`;
  }).join('');
}

function formatGameLabel(g) {
  return ({ 'catch-ball': '🎯 Catch the Ball', 'running': '🏃 Running Challenge', 'balance': '🤸 Tight Rope Walk' })[g] || g || '--';
}
function formatPrimaryMetric(r) {
  if (r.gameType === 'running')    return `${r.metadata?.steps || 0} steps`;
  if (r.gameType === 'catch-ball') return `Score: ${r.score || 0}`;
  if (r.gameType === 'balance')    return `Dist: ${r.metadata?.distance || '--'}m`;
  return `Score: ${r.score || 0}`;
}
function formatAccuracyStability(r) {
  if (r.metadata?.accuracy  != null) return `${r.metadata.accuracy}% accuracy`;
  if (r.metadata?.stability != null) return `${r.metadata.stability}% stability`;
  return '--';
}
function computeRowRisk(r) {
  const acc = r.metadata?.accuracy ?? r.metadata?.stability ?? null;
  if (acc === null)  return { label: '⬜ No Data',   cls: '' };
  if (acc >= 70)     return { label: '🟢 Optimal',   cls: 'history-row-optimal' };
  if (acc >= 40)     return { label: '🟡 Moderate',  cls: 'history-row-moderate' };
  return               { label: '🔴 High Risk',  cls: 'history-row-high' };
}

// ─── Export Report ─────────────────────────────────────────────────────────
function initExportButton() {
  const btn = document.getElementById('btn-export-patient-report');
  if (btn) btn.addEventListener('click', exportPatientReport);
}

async function exportPatientReport() {
  let patient = null, results = [];
  if (selectedPatientId !== 'live') {
    patient = allPatients.find(p => p._id === selectedPatientId) || null;
    if (patient) { try { results = await idbGetResultsForUser(patient._id); } catch (e) {} }
  }
  const name   = patient?.name || livePatientSnapshot.name || 'Live Athlete';
  const now    = new Date().toLocaleString();
  const bmi    = patient?.height && patient?.weight ? (patient.weight / Math.pow(patient.height / 100, 2)).toFixed(1) : '--';
  const bmiCat = bmi !== '--' ? (bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese') : '--';
  const rows   = results.map((r, i) => `<tr>
    <td>${i+1}</td><td>${new Date(r.date).toLocaleString()}</td>
    <td>${formatGameLabel(r.gameType)}</td><td>${r.duration ? Math.round(r.duration)+'s' : '--'}</td>
    <td>${r.score || 0}</td><td>${formatAccuracyStability(r)}</td>
    <td>${r.calories != null ? r.calories.toFixed(1)+' kcal' : '--'}</td>
    <td>${computeRowRisk(r).label}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>SYNOVA Report: ${name}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:900px;margin:2rem auto;color:#0f172a}
h1{color:#2563EB}h1 span{font-size:0.6em;color:#64748b;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:1.5rem 0}
.cell{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1rem}
.cell label{font-size:0.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#64748b;display:block}
.cell span{font-size:1.1rem;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:0.83rem;margin-top:1rem}
th{background:#f1f5f9;text-align:left;padding:.6rem .9rem;font-size:.68rem;text-transform:uppercase}
td{padding:.6rem .9rem;border-bottom:1px solid #f1f5f9}
.footer{margin-top:2rem;color:#94a3b8;font-size:.75rem;border-top:1px solid #e2e8f0;padding-top:1rem}
@media print{body{margin:0}}</style></head><body>
<h1>SYNOVA Patient Diagnostic Report <span>— Generated ${now}</span></h1>
<p>Patient: <strong>${name}</strong></p>
<div class="grid">
<div class="cell"><label>Age</label><span>${patient?.age ?? '--'}</span></div>
<div class="cell"><label>Gender</label><span>${patient?.gender ?? '--'}</span></div>
<div class="cell"><label>Height</label><span>${patient?.height ?? '--'} cm</span></div>
<div class="cell"><label>Weight</label><span>${patient?.weight ?? '--'} kg</span></div>
<div class="cell"><label>BMI</label><span>${bmi}</span></div>
<div class="cell"><label>BMI Category</label><span>${bmiCat}</span></div>
</div>
<h3>Session History (${results.length} sessions)</h3>
<table><thead><tr><th>#</th><th>Date</th><th>Game</th><th>Duration</th><th>Score</th><th>Accuracy/Stability</th><th>Calories</th><th>Assessment</th></tr></thead>
<tbody>${rows || '<tr><td colspan="8">No session data recorded.</td></tr>'}</tbody></table>
<div class="footer">SYNOVA Research Hub | Confidential Clinical Document</div>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `SYNOVA_Report_${name.replace(/\s+/g,'_')}_${Date.now()}.html`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

// ─── Broadcast Listener ────────────────────────────────────────────────────
let connectionWatchdog = null;
let isConnected = false;

function initBroadcastListener() {
  const channel = new BroadcastChannel('fitvr-session');
  channel.addEventListener('message', (event) => {
    const data = event.data;
    setConnectionState(true);
    resetWatchdog();
    if      (data.type === 'session_start') handleSessionStart(data.user);
    else if (data.type === 'session_tick')  handleSessionTick(data);
    else if (data.type === 'game_event')    handleGameEvent(data);
    else if (data.type === 'sensor_stream') handleSensorStream(data);
    else if (data.type === 'session_end')   handleSessionEnd();
  });
}

function resetWatchdog() {
  clearTimeout(connectionWatchdog);
  connectionWatchdog = setTimeout(() => { setConnectionState(false); handleSessionEnd(); }, 4000);
}

function setConnectionState(online) {
  isConnected = online;
  const pill    = document.getElementById('connection-status');
  const spinner = document.getElementById('connection-spinner');
  const icon    = document.getElementById('connection-icon');
  const text    = document.getElementById('connection-text');
  if (!pill) return;
  if (online) {
    pill.className = 'status-pill online';
    if (spinner) spinner.classList.remove('d-none');
    if (icon)    icon.classList.add('d-none');
    if (text)    text.innerText = 'Connected';
  } else {
    pill.className = 'status-pill offline';
    if (spinner) spinner.classList.add('d-none');
    if (icon)  { icon.classList.remove('d-none'); icon.setAttribute('data-lucide', 'wifi-off'); }
    if (text)    text.innerText = 'No Active Session';
    if (window.lucide) lucide.createIcons();
  }
}

// ─── Session Handlers ──────────────────────────────────────────────────────
function handleSessionStart(user) {
  if (!user) return;
  document.getElementById('session-offline-placeholder')?.classList.add('d-none');
  document.getElementById('session-active-grid')?.classList.remove('d-none');
  setVal('client-app-status',       'Connected');
  setVal('client-athlete-name',     user.name);
  setVal('client-athlete-details',  `${user.gender}, Age ${user.age}`);
  setVal('live-session-name',       `${user.name} Diagnostic Profile`);
  setVal('live-session-gender-age', `${user.gender} | Age ${user.age} | Weight ${user.weight}kg | Height ${user.height}cm`);
  Object.assign(livePatientSnapshot, { name: user.name, age: user.age, gender: user.gender, height: user.height, weight: user.weight });
  refreshPatientList();
  if (selectedPatientId === 'live') updatePatientBanner(livePatientSnapshot);
}

function handleSessionTick(payload) {
  const { session, hardware, settings, user } = payload;
  if (!document.getElementById('session-offline-placeholder')?.classList.contains('d-none') && user) handleSessionStart(user);
  const gameLabels = { '#catch-ball': 'Playing Catch Ball VR', '#running': 'Playing Running Challenge', '#balance': 'Playing Tight Rope Walk VR', '#summary': 'Viewing Session Summary', '#settings': 'Viewing Settings' };
  setVal('client-route-text',     gameLabels[session.activeGame] || 'Browsing Dashboard');
  setVal('client-app-status',     'Active');
  setVal('client-session-duration', `${Math.floor(session.duration/60).toString().padStart(2,'0')}:${(session.duration%60).toString().padStart(2,'0')}`);
  setVal('live-score',    session.totalScore);
  setVal('live-calories', session.totalCalories.toFixed(1));
  setVal('client-fps',    payload.fps);
  if (window.adminCharts) window.adminCharts.pushFPS(payload.fps);
  if (hardware) {
    if (hardware.battery) setVal('status-battery', `${Math.round(hardware.battery.level)}% ${hardware.battery.charging ? '(Charging)' : ''}`);
    setVal('status-fullscreen',  hardware.fullscreen          ? 'Active'     : 'Inactive');
    setVal('status-webxr',       hardware.webxrSupported      ? 'Supported'  : 'Unavailable');
    setVal('status-orientation', hardware.orientationGranted  ? 'Granted'    : 'Blocked');
    setVal('status-motion',      hardware.motionGranted       ? 'Granted'    : 'Blocked');
  }
  if (settings) {
    syncCheckbox('mgmt-catch-ball', settings.catchBallEnabled);
    syncCheckbox('mgmt-running',    settings.runningEnabled);
    syncCheckbox('mgmt-balance',    settings.balanceEnabled);
    syncCheckbox('mgmt-sound',      settings.soundEnabled);
    const diffEl = document.getElementById('mgmt-difficulty');
    if (diffEl && diffEl.value !== settings.difficulty) diffEl.value = settings.difficulty;
    const durEl = document.getElementById('mgmt-duration'), durValEl = document.getElementById('mgmt-duration-val');
    if (durEl && parseInt(durEl.value) !== settings.gameDuration) { durEl.value = settings.gameDuration; if (durValEl) durValEl.innerText = settings.gameDuration; }
  }
}

function handleGameEvent(event) {
  setVal('live-score', event.score);
  Object.assign(livePatientSnapshot, { score: event.score, caught: event.ballsCaught || livePatientSnapshot.caught, missed: event.ballsMissed || livePatientSnapshot.missed, accuracy: event.accuracy || livePatientSnapshot.accuracy, combo: event.combo || livePatientSnapshot.combo });
  if (event.game === 'catch-ball') {
    setVal('live-cb-caught', event.ballsCaught); setVal('live-cb-missed', event.ballsMissed);
    setVal('live-cb-combo',  event.combo);       setVal('live-accuracy',  `${event.accuracy}%`);
    if (window.adminCharts) window.adminCharts.updateAccuracy(event.ballsCaught, event.ballsMissed);
  } else if (event.game === 'balance') {
    setVal('live-accuracy',  `Stability: ${event.accuracy}%`);
    setVal('live-cb-caught', `${event.ballsCaught}m`);
    setVal('live-cb-missed', event.ballsMissed ? 'Fallen' : 'Active');
    setVal('live-cb-combo',  `${event.combo}%`);
  }
  if (selectedPatientId === 'live') renderLivePatientView();
}

function handleSensorStream(stream) {
  Object.assign(livePatientSnapshot, { steps: stream.steps || livePatientSnapshot.steps, distance: stream.distance || livePatientSnapshot.distance, calories: stream.calories || livePatientSnapshot.calories, speed: stream.speed || livePatientSnapshot.speed });
  const isRun     = stream.game === 'running';
  const isCatch   = stream.game === 'catch-ball';
  const isBalance = stream.game === 'balance';
  if (isRun || isCatch) {
    setVal('live-steps',     stream.steps);
    setVal('live-run-steps', stream.steps);
    setVal('live-run-dist',  Math.round(stream.distance));
    setVal('live-run-speed', stream.speed.toFixed(1));
    setVal('live-calories',  stream.calories.toFixed(1));
    if (window.adminSensor) window.adminSensor.update(stream.accel);
    if (isRun && window.adminCharts) window.adminCharts.updateCardio(stream.steps, stream.distance, stream.calories);
  } else if (isBalance) {
    setVal('live-steps',     stream.steps);
    setVal('live-run-steps', stream.steps);
    setVal('live-run-dist',  stream.distance);
    setVal('live-run-speed', `Tilt: ${Math.round(stream.speed)}deg`);
    setVal('live-calories',  stream.calories.toFixed(1));
    if (window.adminSensor) window.adminSensor.update(stream.accel);
  }
}

function handleSessionEnd() {
  document.getElementById('session-offline-placeholder')?.classList.remove('d-none');
  document.getElementById('session-active-grid')?.classList.add('d-none');
  ['client-app-status','client-route-text','client-athlete-name','client-session-duration','client-fps',
   'status-battery','status-fullscreen','status-webxr','status-orientation','status-motion',
   'live-score','live-calories','live-steps','live-accuracy','live-cb-caught','live-cb-missed',
   'live-cb-combo','live-run-steps','live-run-dist','live-run-speed'].forEach(id => {
    const defaults = { 'client-app-status':'Disconnected','client-route-text':'Not active','client-athlete-name':'None','client-session-duration':'00:00','client-fps':'--','status-battery':'--%','status-fullscreen':'Inactive','status-webxr':'--','status-orientation':'--','status-motion':'--','live-score':'0','live-calories':'0.0','live-steps':'0','live-accuracy':'0%','live-cb-caught':'0','live-cb-missed':'0','live-cb-combo':'0','live-run-steps':'0','live-run-dist':'0','live-run-speed':'0.0','client-athlete-details':'-' };
    setVal(id, defaults[id] || '');
  });
  if (window.adminCharts) window.adminCharts.clear();
  if (window.adminSensor) window.adminSensor.clear();
  livePatientSnapshot = { score: 0, calories: 0, steps: 0, caught: 0, missed: 0, accuracy: 0, combo: 0, speed: 0, distance: 0, name: '', age: 25, gender: 'Unknown', height: 175, weight: 70 };
  patientResultsCache = {};
  refreshPatientList();
}

// ─── Utility ───────────────────────────────────────────────────────────────
function setVal(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }
function syncCheckbox(id, checked) { const el = document.getElementById(id); if (el && el.checked !== checked) el.checked = checked; }

/**
 * SYNOVA Admin Dashboard Controller
 * Connects layout sections and handles Broadcast event loops.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize admin parts
  if (window.adminCharts) window.adminCharts.init();
  if (window.adminSettings) window.adminSettings.init();
  
  initSidebar();
  initBroadcastListener();
  
  // Wipe session binding
  const wipeBtn = document.getElementById('btn-admin-wipe');
  if (wipeBtn && window.adminSettings) {
    wipeBtn.addEventListener('click', () => {
      window.adminSettings.remoteWipeSession();
    });
  }
});

// Sidebar navigation and view management
function initSidebar() {
  const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
  const panels = document.querySelectorAll('.panel-section');
  const headerTitle = document.getElementById('header-panel-title');
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Toggle menu items
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Toggle views
      const targetId = item.getAttribute('data-target');
      panels.forEach(p => p.classList.remove('active'));
      
      const activePanel = document.getElementById(targetId);
      if (activePanel) activePanel.classList.add('active');

      // Update header text based on section
      const targetLabel = item.querySelector('a').innerText.trim();
      if (headerTitle) headerTitle.innerText = targetLabel;
      
      // Close sidebar on mobile after clicking
      if (sidebar) sidebar.classList.remove('open');
    });
  });

  // Mobile sidebar hamburger toggle
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

// Connection watchdog variables
let connectionWatchdog = null;
let isConnected = false;

function initBroadcastListener() {
  const channel = new BroadcastChannel('fitvr-session');
  
  channel.addEventListener('message', (event) => {
    const data = event.data;
    
    // Set status online and reset watchdog
    setConnectionState(true);
    resetWatchdog();

    // Route message types
    if (data.type === 'session_start') {
      handleSessionStart(data.user);
    } else if (data.type === 'session_tick') {
      handleSessionTick(data);
    } else if (data.type === 'game_event') {
      handleGameEvent(data);
    } else if (data.type === 'sensor_stream') {
      handleSensorStream(data);
    } else if (data.type === 'session_end') {
      handleSessionEnd();
    }
  });
}

// Reset connection watchdog timer
function resetWatchdog() {
  clearTimeout(connectionWatchdog);
  
  // Declares connection offline if client fails to broadcast ticks for 4s
  connectionWatchdog = setTimeout(() => {
    setConnectionState(false);
    handleSessionEnd();
  }, 4000);
}

// Sets connection pills visual styles
function setConnectionState(online) {
  isConnected = online;
  const pill = document.getElementById('connection-status');
  const spinner = document.getElementById('connection-spinner');
  const icon = document.getElementById('connection-icon');
  const text = document.getElementById('connection-text');

  if (!pill) return;

  if (online) {
    pill.className = 'status-pill online';
    if (spinner) spinner.classList.remove('d-none');
    if (icon) icon.classList.add('d-none');
    if (text) text.innerText = 'Connected';
  } else {
    pill.className = 'status-pill offline';
    if (spinner) spinner.classList.add('d-none');
    if (icon) {
      icon.classList.remove('d-none');
      icon.setAttribute('data-lucide', 'wifi-off');
    }
    if (text) text.innerText = 'No Active Session';
    lucide.createIcons();
  }
}

// Populate session configurations
function handleSessionStart(user) {
  if (!user) return;
  
  // Show active container
  document.getElementById('session-offline-placeholder')?.classList.add('d-none');
  document.getElementById('session-active-grid')?.classList.remove('d-none');

  setVal('client-app-status', 'Connected');
  setVal('client-athlete-name', user.name);
  setVal('client-athlete-details', `${user.gender}, Age ${user.age}`);
  
  setVal('live-session-name', `${user.name} Diagnostic Profile`);
  setVal('live-session-gender-age', `${user.gender} | Age ${user.age} | Weight ${user.weight}kg | Height ${user.height}cm`);
}

// Process tick variables
function handleSessionTick(payload) {
  const session = payload.session;
  const hardware = payload.hardware;
  const settings = payload.settings;
  const user = payload.user;

  // Set initial layouts if app was loaded after session started
  if (!document.getElementById('session-offline-placeholder')?.classList.contains('d-none') && user) {
    handleSessionStart(user);
  }

  // Set route strings
  let gameLabel = 'Browsing Dashboard';
  if (session.activeGame === '#catch-ball') gameLabel = 'Playing Catch Ball VR';
  if (session.activeGame === '#running') gameLabel = 'Playing Running Challenge';
  if (session.activeGame === '#balance') gameLabel = 'Playing Tight Rope Walk VR';
  if (session.activeGame === '#summary') gameLabel = 'Viewing Session Summary';
  if (session.activeGame === '#settings') gameLabel = 'Viewing Settings';
  
  setVal('client-route-text', gameLabel);
  setVal('client-app-status', 'Active');
  
  // Session durations
  const mins = Math.floor(session.duration / 60).toString().padStart(2, '0');
  const secs = (session.duration % 60).toString().padStart(2, '0');
  setVal('client-session-duration', `${mins}:${secs}`);
  
  // Stats details
  setVal('live-score', session.totalScore);
  setVal('live-calories', session.totalCalories.toFixed(1));
  setVal('client-fps', payload.fps);

  // Update FPS Chart
  if (window.adminCharts) {
    window.adminCharts.pushFPS(payload.fps);
  }

  // Set hardware specs
  if (hardware) {
    if (hardware.battery) {
      const bat = hardware.battery;
      setVal('status-battery', `${Math.round(bat.level)}% ${bat.charging ? '(Charging)' : ''}`);
    }
    setVal('status-fullscreen', hardware.fullscreen ? 'Active' : 'Inactive');
    setVal('status-webxr', hardware.webxrSupported ? 'Supported' : 'Unavailable');
    setVal('status-orientation', hardware.orientationGranted ? 'Granted' : 'Blocked');
    setVal('status-motion', hardware.motionGranted ? 'Granted' : 'Blocked');
  }

  // Dynamically sync management checkboxes
  if (settings) {
    syncCheckbox('mgmt-catch-ball', settings.catchBallEnabled);
    syncCheckbox('mgmt-running', settings.runningEnabled);
    syncCheckbox('mgmt-balance', settings.balanceEnabled);
    syncCheckbox('mgmt-sound', settings.soundEnabled);
    
    const diffEl = document.getElementById('mgmt-difficulty');
    if (diffEl && diffEl.value !== settings.difficulty) {
      diffEl.value = settings.difficulty;
    }

    const durEl = document.getElementById('mgmt-duration');
    const durValEl = document.getElementById('mgmt-duration-val');
    if (durEl && parseInt(durEl.value) !== settings.gameDuration) {
      durEl.value = settings.gameDuration;
      if (durValEl) durValEl.innerText = settings.gameDuration;
    }
  }
}

// Process ball catches and running step metrics
function handleGameEvent(event) {
  setVal('live-score', event.score);

  if (event.game === 'catch-ball') {
    setVal('live-cb-caught', event.ballsCaught);
    setVal('live-cb-missed', event.ballsMissed);
    setVal('live-cb-combo', event.combo);
    setVal('live-accuracy', `${event.accuracy}%`);

    if (window.adminCharts) {
      window.adminCharts.updateAccuracy(event.ballsCaught, event.ballsMissed);
    }
  } else if (event.game === 'balance') {
    setVal('live-accuracy', `Stability: ${event.accuracy}%`);
    setVal('live-cb-caught', `${event.ballsCaught}m`);
    setVal('live-cb-missed', event.ballsMissed ? 'Fallen' : 'Active');
    setVal('live-cb-combo', `${event.combo}%`);
  }
}

// Receive sensor updates
function handleSensorStream(stream) {
  if (stream.game === 'running') {
    setVal('live-steps', stream.steps);
    setVal('live-run-steps', stream.steps);
    setVal('live-run-dist', Math.round(stream.distance));
    setVal('live-run-speed', stream.speed.toFixed(1));
    setVal('live-calories', stream.calories.toFixed(1));

    // Update coordinates & waveform graph
    if (window.adminSensor) {
      window.adminSensor.update(stream.accel);
    }

    // Update cardio analytics graphs
    if (window.adminCharts) {
      window.adminCharts.updateCardio(stream.steps, stream.distance, stream.calories);
    }
  } else if (stream.game === 'catch-ball') {
    setVal('live-steps', stream.steps);
    setVal('live-run-steps', stream.steps);
    setVal('live-run-dist', Math.round(stream.distance));
    setVal('live-run-speed', stream.speed.toFixed(1));
    setVal('live-calories', stream.calories.toFixed(1));

    if (window.adminSensor) {
      window.adminSensor.update(stream.accel);
    }
  } else if (stream.game === 'balance') {
    setVal('live-steps', stream.steps);
    setVal('live-run-steps', stream.steps);
    setVal('live-run-dist', stream.distance);
    setVal('live-run-speed', `Tilt: ${Math.round(stream.speed)}deg`);
    setVal('live-calories', stream.calories.toFixed(1));

    // Update coordinates & waveform graph
    if (window.adminSensor) {
      window.adminSensor.update(stream.accel);
    }
  }
}

// Clear admin details and reset views on logout/disconnection
function handleSessionEnd() {
  document.getElementById('session-offline-placeholder')?.classList.remove('d-none');
  document.getElementById('session-active-grid')?.classList.add('d-none');

  setVal('client-app-status', 'Disconnected');
  setVal('client-route-text', 'Not active');
  setVal('client-athlete-name', 'None');
  setVal('client-athlete-details', '-');
  setVal('client-session-duration', '00:00');
  setVal('client-fps', '--');

  setVal('status-battery', '--%');
  setVal('status-fullscreen', 'Inactive');
  setVal('status-webxr', '--');
  setVal('status-orientation', '--');
  setVal('status-motion', '--');

  // Reset metrics
  setVal('live-score', '0');
  setVal('live-calories', '0.0');
  setVal('live-steps', '0');
  setVal('live-accuracy', '0%');
  setVal('live-cb-caught', '0');
  setVal('live-cb-missed', '0');
  setVal('live-cb-combo', '0');
  setVal('live-run-steps', '0');
  setVal('live-run-dist', '0');
  setVal('live-run-speed', '0.0');

  // Clear charts
  if (window.adminCharts) window.adminCharts.clear();
  if (window.adminSensor) window.adminSensor.clear();
}

// Safely set DOM text content
function setVal(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

// Set toggle buttons states
function syncCheckbox(id, checked) {
  const el = document.getElementById(id);
  if (el && el.checked !== checked) {
    el.checked = checked;
  }
}

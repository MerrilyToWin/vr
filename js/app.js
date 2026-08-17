/**
 * SYNOVA Central SPA Router and State Manager
 */
import { vrHelper } from './vr.js';
import { soundManager } from './utils.js';
import { initDashboard, cleanupDashboard } from './dashboard.js';
import { initBallGame, cleanupBallGame } from './ballgame.js';
import { initRunningGame, cleanupRunningGame } from './running.js';
import { initBalanceGame, cleanupBalanceGame } from './balance.js';
import { initSummary, cleanupSummary } from './summary.js';
import { localDB } from './db.js';

// Setup global state in RAM
window.appState = {
  user: null, // { name, age, gender, height, weight }
  session: {
    active: false,
    startTime: null,
    duration: 0, // seconds
    timerInterval: null,
    totalCalories: 0,
    totalScore: 0
  },
  settings: {
    difficulty: 'medium', // easy, medium, hard
    soundEnabled: true,
    catchBallEnabled: true, // admin dynamic toggles
    runningEnabled: true,
    balanceEnabled: true,
    gameDuration: 60 // customizable durations
  },
  gameResults: {
    catchBall: [], // { score, ballsCaught, ballsMissed, accuracy, duration }
    running: [], // { steps, distance, speed, calories, duration }
    balance: [] // { score, duration, maxDeviation, calories, date }
  }
};

// Load data from localStorage on startup
try {
  const localUser = localStorage.getItem('fitvr_user');
  if (localUser) {
    window.appState.user = JSON.parse(localUser);
    
    // Refresh user's game results from IndexedDB
    if (window.appState.user && window.appState.user._id) {
      localDB.getResultsForUser(window.appState.user._id)
        .then(results => {
          const gameResults = { catchBall: [], running: [], balance: [], rulerDrop: [] };
          results.forEach(res => {
            const gameType = res.gameType;
            if (gameResults[gameType]) {
              gameResults[gameType].push({
                ...res.metadata,
                _id: res._id,
                date: res.date
              });
            }
          });
          window.appState.gameResults = gameResults;
          localStorage.setItem('fitvr_game_results', JSON.stringify(gameResults));
          // If we are currently rendering dashboard or summary, re-init to update charts
          if (window.location.hash === '#dashboard') {
            initDashboard();
          }
        })
        .catch(err => {
          console.warn('Could not load history from IndexedDB on startup, using offline cache:', err);
        });
    }
  }
  const localSettings = localStorage.getItem('fitvr_settings');
  if (localSettings) {
    window.appState.settings = { ...window.appState.settings, ...JSON.parse(localSettings) };
  }
  const localResults = localStorage.getItem('fitvr_game_results');
  if (localResults) {
    window.appState.gameResults = { ...window.appState.gameResults, ...JSON.parse(localResults) };
  }
} catch (e) {
  console.error('Error loading localStorage:', e);
}

// Broadcast Channel for Admin Dashboard sharing (RAM only)
export const adminChannel = new BroadcastChannel('fitvr-session');

// requestAnimationFrame based FPS tracking
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFPS = 60;
function calcFPS() {
  const now = performance.now();
  frameCount++;
  if (now - lastFrameTime >= 1000) {
    currentFPS = Math.round((frameCount * 1000) / (now - lastFrameTime));
    frameCount = 0;
    lastFrameTime = now;
  }
  requestAnimationFrame(calcFPS);
}
requestAnimationFrame(calcFPS);

// Listen to admin inputs and commands
adminChannel.addEventListener('message', (event) => {
  const data = event.data;
  if (data.type === 'admin_control') {
    if (data.settings) {
      window.appState.settings = { ...window.appState.settings, ...data.settings };
      soundManager.setMute(!window.appState.settings.soundEnabled);
      
      // Update client settings page values in real-time if currently rendered
      const muteCheckbox = document.getElementById('settings-mute');
      const diffSelect = document.getElementById('settings-difficulty');
      if (muteCheckbox) muteCheckbox.checked = !window.appState.settings.soundEnabled;
      if (diffSelect) diffSelect.value = window.appState.settings.difficulty;
    }
    
    if (data.action === 'wipe_session') {
      cleanupSession();
      window.location.hash = '#splash';
    }
  }
});

let currentCleanup = null;
let currentRoute = '';

// Handle SPA route changes
async function router() {
  const hash = window.location.hash || '';
  
  // Enforce onboarding unless on splash
  if (hash !== '' && hash !== '#welcome' && !window.appState.user) {
    window.location.hash = '#welcome';
    return;
  }

  // Cleanup current page logic
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  
  currentRoute = hash;
  
  // Show navigation overlays or orientations where required
  const rotateOverlay = document.getElementById('rotate-overlay');
  if (rotateOverlay) rotateOverlay.classList.remove('visible');

  // Route routing
  try {
    if (hash === '' || hash === '#splash') {
      await loadView('splash');
      setupSplash();
    } else if (hash === '#welcome') {
      await loadView('welcome');
      setupWelcome();
    } else if (hash === '#dashboard') {
      await loadView('dashboard');
      currentCleanup = initDashboard();
    } else if (hash === '#catch-ball') {
      await loadView('catch-ball');
      currentCleanup = initBallGame();
    } else if (hash === '#running') {
      await loadView('running');
      currentCleanup = initRunningGame();
    } else if (hash === '#balance') {
      await loadView('balance');
      currentCleanup = initBalanceGame();
    } else if (hash === '#summary') {
      await loadView('summary');
      currentCleanup = initSummary();
    } else if (hash === '#settings') {
      await loadView('settings');
      setupSettings();
    } else {
      window.location.hash = '#dashboard';
    }
  } catch (error) {
    console.error(`Failed to load view for route ${hash}:`, error);
  }
}

// Fetch external HTML files and inject into SPA viewport
async function loadView(viewName) {
  if (viewName === 'splash') {
    // Splash screen is pre-rendered in index.html, reset it if we navigate back
    const splashHTML = `
      <div id="splash-screen" class="view-content fade-in d-flex flex-column align-items-center justify-content-center text-center">
        <div class="logo-container mb-4">
          <div class="vr-visor-container floating-card">
            <div class="vr-visor-glass"></div>
          </div>
        </div>
        <h1 class="display-4 fw-bold mb-2" style="letter-spacing: -0.5px;"><span class="text-gradient">SYNOVA</span></h1>
        <p class="text-muted fs-5 mb-5" style="font-weight: 500;">Turn your phone into a VR fitness trainer</p>
        <div class="loading-area d-flex flex-column align-items-center" id="splash-action-container">
          <div class="loading-ring mb-4" id="splash-loader"><div></div><div></div><div></div></div>
          <p class="text-muted small" id="splash-status-text" style="font-weight: 500; letter-spacing: 0.2px;">Calibrating system sensors...</p>
          <button id="btn-start-app" class="btn-premium d-none mt-2 pulse-glow">
            Get Started <i data-lucide="arrow-right"></i>
          </button>
        </div>
      </div>
    `;
    // Retain dynamic island if not present, and overwrite app viewport internal HTML
    const appViewport = document.getElementById('app-viewport');
    let hasNotch = appViewport.querySelector('.dynamic-island');
    if (!hasNotch) {
      appViewport.innerHTML = `
        <div class="dynamic-island d-none d-sm-flex">
          <div class="dynamic-island-sensor"></div>
          <span style="font-size: 0.65rem; font-weight: 700; color: rgba(255,255,255,0.45); letter-spacing: 0.5px;">SYNOVA ACTIVE</span>
        </div>
        ${splashHTML}
      `;
    } else {
      // Retain the existing dynamic island and replace the rest
      const existingNotch = hasNotch.outerHTML;
      appViewport.innerHTML = `${existingNotch}${splashHTML}`;
    }
    lucide.createIcons();
    return;
  }

  const response = await fetch(`${viewName}.html?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Could not fetch ${viewName}.html`);
  
  const htmlText = await response.text();
  
  // Extract content inside #view-root
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const viewRoot = doc.getElementById('view-root');
  
  if (viewRoot) {
    document.getElementById('app-viewport').innerHTML = viewRoot.innerHTML;
  } else {
    // Fallback if not structured correctly
    document.getElementById('app-viewport').innerHTML = htmlText;
  }
  
  // Re-run library hooks on page load
  lucide.createIcons();
  AOS.init({
    duration: 800,
    easing: 'ease-out-back',
    once: true
  });
  
  // Scroll to top
  window.scrollTo(0, 0);
}

// Splash Page Actions
function setupSplash() {
  const loader = document.getElementById('splash-loader');
  const statusText = document.getElementById('splash-status-text');
  const startBtn = document.getElementById('btn-start-app');
  
  // Simulate sensor calibration
  setTimeout(() => {
    if (loader) loader.classList.add('d-none');
    if (statusText) statusText.innerText = 'System Ready';
    if (startBtn) {
      startBtn.classList.remove('d-none');
        startBtn.addEventListener('click', async () => {
          // Request motion permissions
          const sensorsApproved = await vrHelper.requestPermissions();
          if (sensorsApproved) {
            // Initialize synth sounds on first user click gesture
            soundManager.init();
            soundManager.playSuccess();
            if (window.appState.user) {
              startGlobalSession();
              window.location.hash = '#dashboard';
            } else {
              window.location.hash = '#welcome';
            }
          } else {
            alert('SYNOVA requires motion sensors to run VR fitness games. Please grant permissions to proceed.');
          }
        });
    }
  }, 2000);
}

// Welcome Page Actions (Form handling)
function setupWelcome() {
  const form = document.getElementById('onboarding-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const user = {
        name: document.getElementById('user-name').value || 'Athlete',
        age: parseInt(document.getElementById('user-age').value) || 25,
        gender: document.getElementById('user-gender').value || 'Other',
        height: parseFloat(document.getElementById('user-height').value) || 175,
        weight: parseFloat(document.getElementById('user-weight').value) || 70
      };
      
      // Save/update user profile in client-side IndexedDB
      localDB.signInUser(user)
      .then(dbUser => {
        window.appState.user = dbUser;
        localStorage.setItem('fitvr_user', JSON.stringify(dbUser));
        
        // Load the user's historical data from IndexedDB
        return localDB.getResultsForUser(dbUser._id);
      })
      .then(results => {
        const gameResults = { catchBall: [], running: [], balance: [], rulerDrop: [] };
        results.forEach(res => {
          const gameType = res.gameType;
          if (gameResults[gameType]) {
            gameResults[gameType].push({
              ...res.metadata,
              _id: res._id,
              date: res.date
            });
          }
        });
        window.appState.gameResults = gameResults;
        localStorage.setItem('fitvr_game_results', JSON.stringify(gameResults));
        
        startGlobalSession();
        soundManager.playSuccess();
        window.location.hash = '#dashboard';
      })
      .catch(err => {
        console.error('Error in IndexedDB onboarding, falling back to local storage only:', err);
        // Fallback for offline or local-only mode
        window.appState.user = user;
        localStorage.setItem('fitvr_user', JSON.stringify(user));
        startGlobalSession();
        soundManager.playSuccess();
        window.location.hash = '#dashboard';
      });
    });
  }
}

// Settings screen interactions
function setupSettings() {
  const muteCheckbox = document.getElementById('settings-mute');
  const diffSelect = document.getElementById('settings-difficulty');
  const resetBtn = document.getElementById('settings-reset');
  const backBtn = document.getElementById('settings-back');
  
  if (muteCheckbox) {
    muteCheckbox.checked = !window.appState.settings.soundEnabled;
    muteCheckbox.addEventListener('change', (e) => {
      window.appState.settings.soundEnabled = !e.target.checked;
      soundManager.setMute(e.target.checked);
      if (!e.target.checked) {
        soundManager.playCatch();
      }
      localStorage.setItem('fitvr_settings', JSON.stringify(window.appState.settings));
    });
  }
  
  if (diffSelect) {
    diffSelect.value = window.appState.settings.difficulty;
    diffSelect.addEventListener('change', (e) => {
      window.appState.settings.difficulty = e.target.value;
      localStorage.setItem('fitvr_settings', JSON.stringify(window.appState.settings));
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to end this session and erase all progress?')) {
        clearAllHistory();
        window.location.hash = '#splash';
      }
    });
  }
  
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.hash = '#dashboard';
    });
  }
}

// Helper to broadcast tick updates to the admin dashboard channel
function broadcastTick() {
  if (!window.appState.user) return;

  const cbResults = window.appState.gameResults.catchBall;
  const runResults = window.appState.gameResults.running;
  const balResults = window.appState.gameResults.balance || [];

  const cbTotalScore = cbResults.reduce((acc, curr) => acc + curr.score, 0);
  const runTotalScore = runResults.reduce((acc, curr) => acc + curr.steps, 0);
  const balTotalScore = balResults.reduce((acc, curr) => acc + curr.score, 0);
  window.appState.session.totalScore = cbTotalScore + runTotalScore + balTotalScore;
  
  const cbCalories = cbResults.reduce((acc, curr) => acc + (curr.ballsCaught * 0.05), 0);
  const runCalories = runResults.reduce((acc, curr) => acc + curr.calories, 0);
  const balCalories = balResults.reduce((acc, curr) => acc + curr.calories, 0);
  window.appState.session.totalCalories = Math.round((cbCalories + runCalories + balCalories) * 10) / 10;

  // Battery status mapping if supported
  const getBatteryStatus = navigator.getBattery 
    ? navigator.getBattery().then(b => ({ level: b.level * 100, charging: b.charging }))
    : Promise.resolve({ level: 95, charging: true });

  getBatteryStatus.then(battery => {
    adminChannel.postMessage({
      type: 'session_tick',
      user: window.appState.user,
      session: {
        active: window.appState.session.active,
        duration: window.appState.session.duration,
        totalScore: window.appState.session.totalScore,
        totalCalories: window.appState.session.totalCalories,
        activeGame: window.location.hash
      },
      settings: window.appState.settings,
      hardware: {
        battery: battery,
        fullscreen: !!document.fullscreenElement,
        webxrSupported: !!navigator.xr,
        orientationGranted: typeof DeviceOrientationEvent !== 'undefined',
        motionGranted: typeof DeviceMotionEvent !== 'undefined'
      },
      fps: currentFPS
    });
  });
}

// Start Session tracking
function startGlobalSession() {
  window.appState.session.active = true;
  window.appState.session.startTime = Date.now();
  window.appState.session.duration = 0;
  
  // Broadcast start message
  adminChannel.postMessage({
    type: 'session_start',
    user: window.appState.user
  });
  
  window.appState.session.timerInterval = setInterval(() => {
    if (window.appState.session.active) {
      window.appState.session.duration++;
      broadcastTick();
    }
  }, 1000);
  
  // Play soft background theme
  soundManager.startBGM();
}

// Save game results to localStorage and sync with MongoDB
export function saveHistoryToLocalStorage() {
  try {
    localStorage.setItem('fitvr_game_results', JSON.stringify(window.appState.gameResults));
    
    // Sync the latest game result with IndexedDB if user has database ID
    const user = window.appState.user;
    if (user && user._id) {
      const cbLast = window.appState.gameResults.catchBall.slice(-1)[0];
      const runLast = window.appState.gameResults.running.slice(-1)[0];
      const balLast = window.appState.gameResults.balance.slice(-1)[0];
      const rdLast = window.appState.gameResults.rulerDrop ? window.appState.gameResults.rulerDrop.slice(-1)[0] : null;
      
      let candidates = [];
      if (cbLast) candidates.push({ type: 'catchBall', data: cbLast });
      if (runLast) candidates.push({ type: 'running', data: runLast });
      if (balLast) candidates.push({ type: 'balance', data: balLast });
      if (rdLast) candidates.push({ type: 'rulerDrop', data: rdLast });
      
      // Sort to find the absolute latest entry based on date
      candidates.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
      
      if (candidates.length > 0) {
        const latest = candidates[0];
        
        // Prevent double syncing same result (check last synced ID or timestamp)
        const lastSyncKey = `last_sync_${latest.type}`;
        const lastSyncedDate = localStorage.getItem(lastSyncKey);
        
        if (lastSyncedDate !== new Date(latest.data.date).toISOString()) {
          const payload = {
            userId: user._id,
            gameType: latest.type,
            score: latest.type === 'running' ? latest.data.steps : latest.data.score,
            duration: latest.data.duration,
            calories: latest.data.calories,
            metadata: latest.data,
            date: latest.data.date
          };
          
          localDB.saveGameResult(payload)
          .then(data => {
            console.log('Successfully saved workout result to IndexedDB:', data);
            // Save last synced timestamp to prevent duplicate posts
            localStorage.setItem(lastSyncKey, new Date(latest.data.date).toISOString());
          })
          .catch(err => {
            console.error('Failed to save workout result to IndexedDB:', err);
          });
        }
      }
    }
  } catch (e) {
    console.error('Error saving game results:', e);
  }
}

// Clear all local storage records and reset app state
export function clearAllHistory() {
  try {
    localStorage.removeItem('fitvr_user');
    localStorage.removeItem('fitvr_settings');
    localStorage.removeItem('fitvr_game_results');
    localStorage.removeItem('last_sync_catchBall');
    localStorage.removeItem('last_sync_running');
    localStorage.removeItem('last_sync_balance');
    localStorage.removeItem('last_sync_rulerDrop');
    adminChannel.postMessage({ type: 'session_end' });
  } catch (e) {}
  
  // Wipes state variables in RAM
  window.appState.user = null;
  window.appState.session.active = false;
  window.appState.session.totalCalories = 0;
  window.appState.session.totalScore = 0;
  
  if (window.appState.session.timerInterval) {
    clearInterval(window.appState.session.timerInterval);
    window.appState.session.timerInterval = null;
  }
  
  window.appState.gameResults.catchBall = [];
  window.appState.gameResults.running = [];
  window.appState.gameResults.balance = [];
  window.appState.gameResults.rulerDrop = [];
  
  soundManager.stopBGM();
}

// Cleanup active session parameters in RAM
export function cleanupSession() {
  try {
    adminChannel.postMessage({ type: 'session_end' });
  } catch (e) {}

  window.appState.session.active = false;
  if (window.appState.session.timerInterval) {
    clearInterval(window.appState.session.timerInterval);
    window.appState.session.timerInterval = null;
  }
  
  soundManager.stopBGM();
}

// Router Event Listeners
window.addEventListener('hashchange', router);
window.addEventListener('load', router);

// Clean up before refresh
window.addEventListener('beforeunload', () => {
  cleanupSession();
});

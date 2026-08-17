/**
 * SYNOVA Admin Settings & Controls Configuration
 * Handles double-bound UI controls and Broadcast transmissions.
 */

window.adminSettings = {
  channel: null,

  init() {
    this.channel = new BroadcastChannel('fitvr-session');
    this.bindEvents();
  },

  bindEvents() {
    // 1. Game toggles and parameter adjustments
    const controls = [
      'mgmt-catch-ball',
      'mgmt-running',
      'mgmt-balance',
      'mgmt-sound',
      'mgmt-difficulty',
      'mgmt-duration'
    ];

    controls.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          this.syncToClient();
        });
        el.addEventListener('input', () => {
          // Sync text value label for slider ranges immediately
          if (id === 'mgmt-duration') {
            const valEl = document.getElementById('mgmt-duration-val');
            if (valEl) valEl.innerText = el.value;
          }
          this.syncToClient();
        });
      }
    });

    // 2. Admin dashboard visual theme changes
    const themeSelect = document.getElementById('settings-theme');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.setAttribute('data-theme', theme);
      });
    }

    // 3. Language settings simulator
    const langSelect = document.getElementById('settings-lang');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        alert(`Language changed to: ${e.target.value.toUpperCase()}`);
      });
    }

    // 4. Sensitivity slider triggers
    const sensRange = document.getElementById('settings-sensitivity');
    if (sensRange) {
      sensRange.addEventListener('input', (e) => {
        const valEl = document.getElementById('settings-sensitivity-val');
        if (valEl) valEl.innerText = parseFloat(e.target.value).toFixed(1);
      });
    }
  },

  // Gather control parameters and broadcast payload back to client
  syncToClient() {
    const catchEnabled = document.getElementById('mgmt-catch-ball')?.checked ?? true;
    const runningEnabled = document.getElementById('mgmt-running')?.checked ?? true;
    const balanceEnabled = document.getElementById('mgmt-balance')?.checked ?? true;
    const soundEnabled = document.getElementById('mgmt-sound')?.checked ?? true;
    const difficulty = document.getElementById('mgmt-difficulty')?.value ?? 'medium';
    const duration = parseInt(document.getElementById('mgmt-duration')?.value ?? '60');

    this.channel.postMessage({
      type: 'admin_control',
      settings: {
        catchBallEnabled: catchEnabled,
        runningEnabled: runningEnabled,
        balanceEnabled: balanceEnabled,
        soundEnabled: soundEnabled,
        difficulty: difficulty,
        gameDuration: duration
      }
    });
  },

  // Trigger absolute session cleanups
  remoteWipeSession() {
    if (confirm('Are you sure you want to shut down this remote training session? All athlete data will be permanently wiped.')) {
      this.channel.postMessage({
        type: 'admin_control',
        action: 'wipe_session'
      });
    }
  }
};

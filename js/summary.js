/**
 * SYNOVA Session Summary Controller
 */
import { fitnessMath, ConfettiEffect } from './utils.js';
import { cleanupSession } from './app.js';

let confetti = null;
let chartInstance = null;

// Initialise the summary screen
export function initSummary() {
  calculateAndRenderStats();
  triggerCelebration();
  
  // Setup Actions
  const restartBtn = document.getElementById('btn-restart-session');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      window.appState.lastGameResult = null;
      window.location.hash = '#dashboard';
    });
  }

  const exitBtn = document.getElementById('btn-exit-session');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      // Clear everything and return to splash screen
      cleanupSession();
      window.location.hash = '#splash';
    });
  }

  return () => {
    cleanupSummary();
  };
}

// Perform calculations and populate layout
function calculateAndRenderStats() {
  const result = window.appState.lastGameResult;
  if (!result) {
    window.location.hash = '#dashboard';
    return;
  }

  const gameCards = {
    catchBall: 'summary-card-catchball',
    running: 'summary-card-running',
    balance: 'summary-card-balance',
    rulerDrop: 'summary-card-rulerdrop'
  };
  Object.values(gameCards).forEach((id) => document.getElementById(id)?.classList.add('d-none'));
  document.getElementById(gameCards[result.gameType])?.classList.remove('d-none');

  const score = result.gameType === 'running' ? result.steps : (result.score || 0);
  const calories = result.gameType === 'catchBall'
    ? (result.ballsCaught || 0) * 0.05
    : (result.calories || 0);
  const duration = result.duration || 0;

  setVal('summary-score', score);
  setVal('summary-calories', calories.toFixed(1));
  setVal('summary-time', formatDuration(duration));

  if (result.gameType === 'catchBall') {
    setVal('summary-cb-caught', result.ballsCaught || 0);
    setVal('summary-cb-missed', result.ballsMissed || 0);
    setVal('summary-cb-acc', result.accuracy || 0);
  } else if (result.gameType === 'running') {
    setVal('summary-run-steps', result.steps || 0);
    setVal('summary-run-dist', Math.round(result.distance || 0));
    setVal('summary-run-speed', (result.speed || 0).toFixed(1));
  } else if (result.gameType === 'balance') {
    setVal('summary-bal-dist', result.distance || 0);
    setVal('summary-bal-time', result.duration || 0);
    setVal('summary-bal-dev', result.maxDeviation || 0);
  } else if (result.gameType === 'rulerDrop') {
    setVal('summary-rd-score', result.score || 0);
    setVal('summary-rd-reaction', result.reactionTimeMs || 0);
    setVal('summary-rd-dist', result.caughtDistanceCm || 0);
  }

  const expectedScores = { catchBall: 300, running: 150, balance: 100, rulerDrop: 50 };
  const normalizedFitnessScore = Math.min(Math.round((score / (expectedScores[result.gameType] || 100)) * 100), 100);
  const rating = fitnessMath.getPerformanceRating(normalizedFitnessScore);
  
  const ratingTextEl = document.getElementById('summary-rating-text');
  const ratingSubtextEl = document.getElementById('summary-rating-subtext');
  const levelBarEl = document.getElementById('summary-level-bar');
  
  if (ratingTextEl) {
    ratingTextEl.innerText = `${rating.text} (${normalizedFitnessScore}/100)`;
    ratingTextEl.className = `fw-bold mb-0 ${rating.class}`;
  }
  
  if (levelBarEl) {
    levelBarEl.style.width = `${normalizedFitnessScore}%`;
  }
  
  if (ratingSubtextEl) {
    if (normalizedFitnessScore <= 25) {
      ratingSubtextEl.innerText = 'Good start! Keep training to improve this result.';
    } else if (normalizedFitnessScore <= 50) {
      ratingSubtextEl.innerText = 'Nice pacing! You are building a solid fitness base.';
    } else if (normalizedFitnessScore <= 75) {
      ratingSubtextEl.innerText = 'Excellent work! This was a strong performance.';
    } else {
      ratingSubtextEl.innerText = 'Outstanding result! You achieved peak performance.';
    }
  }

  renderChart(result, score, calories);
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

// Utility to set DOM text content safely
function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

// Draw the Polar Area Chart showing training composition
function renderChart(result, score, calories) {
  const canvas = document.getElementById('summary-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  
  // Custom theme-aware text colors
  const isDark = document.body.getAttribute('data-theme') === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches;
  const labelColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  chartInstance = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels: [result.gameType, 'Calories (kcal * 10)'],
      datasets: [{
        label: 'Workout Breakdown',
        data: [
          Math.min(score, 200),
          Math.min(calories * 10, 200)
        ],
        backgroundColor: [
          'rgba(37, 99, 235, 0.65)',
          'rgba(239, 68, 68, 0.65)'
        ],
        borderColor: isDark ? '#090D16' : '#ffffff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          grid: {
            color: gridColor
          },
          angleLines: {
            color: gridColor
          },
          ticks: {
            display: false
          },
          pointLabels: {
            display: true,
            color: labelColor,
            font: {
              family: 'Poppins',
              size: 9,
              weight: 'bold'
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

// Particle/Confetti celebratory trigger
function triggerCelebration() {
  const canvas = document.getElementById('confetti-canvas');
  if (canvas) {
    confetti = new ConfettiEffect(canvas);
    confetti.start();
  }
}

// Destroy instances to prevent memory leakage
export function cleanupSummary() {
  if (confetti) {
    confetti.stop();
    confetti = null;
  }
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

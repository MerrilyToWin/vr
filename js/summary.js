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
      // Clear game results but keep User Profile in RAM
      window.appState.gameResults.catchBall = [];
      window.appState.gameResults.running = [];
      window.appState.gameResults.balance = [];
      window.appState.gameResults.rulerDrop = [];
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
  const cbResults = window.appState.gameResults.catchBall;
  const runResults = window.appState.gameResults.running;
  const balResults = window.appState.gameResults.balance || [];
  const rdResults = window.appState.gameResults.rulerDrop || [];

  // 1. Calculate catch ball aggregations
  const cbCaught = cbResults.reduce((acc, curr) => acc + curr.ballsCaught, 0);
  const cbMissed = cbResults.reduce((acc, curr) => acc + curr.ballsMissed, 0);
  const cbTotal = cbCaught + cbMissed;
  const cbAcc = fitnessMath.calcAccuracy(cbCaught, cbTotal);
  
  const cbScore = cbResults.reduce((acc, curr) => acc + curr.score, 0);
  const cbCalories = cbCaught * 0.05; // 0.05 kcal per ball caught

  // 2. Calculate running aggregations
  const runSteps = runResults.reduce((acc, curr) => acc + curr.steps, 0);
  const runDist = runResults.reduce((acc, curr) => acc + curr.distance, 0);
  const runCalories = runResults.reduce((acc, curr) => acc + curr.calories, 0);
  const runMaxSpeed = runResults.reduce((max, curr) => Math.max(max, curr.speed), 0);

  // 3. Calculate balance aggregations
  const balDist = balResults.reduce((acc, curr) => acc + curr.distance, 0);
  const balTime = balResults.reduce((acc, curr) => acc + curr.duration, 0);
  const balMaxDev = balResults.reduce((max, curr) => Math.max(max, curr.maxDeviation), 0);
  const balScore = balResults.reduce((acc, curr) => acc + curr.score, 0);
  const balCalories = balResults.reduce((acc, curr) => acc + curr.calories, 0);

  // 4. Calculate ruler drop aggregations
  const rdScore = rdResults.reduce((acc, curr) => acc + curr.score, 0);
  const rdReaction = rdResults.length > 0 ? Math.round(rdResults.reduce((acc, curr) => acc + curr.reactionTimeMs, 0) / rdResults.length) : 0;
  const rdDist = rdResults.length > 0 ? Math.round(rdResults.reduce((acc, curr) => acc + curr.caughtDistanceCm, 0) / rdResults.length) : 0;
  const rdCalories = rdResults.reduce((acc, curr) => acc + curr.calories, 0);

  // 5. Overall stats
  const totalScore = cbScore + runSteps + balScore + rdScore;
  const totalCalories = Math.round((cbCalories + runCalories + balCalories + rdCalories) * 10) / 10;

  // Format Elapsed Session Time
  let timeStr = '00:00';
  if (window.appState.session.startTime) {
    const elapsedSecs = Math.floor((Date.now() - window.appState.session.startTime) / 1000);
    const mins = Math.floor(elapsedSecs / 60).toString().padStart(2, '0');
    const secs = (elapsedSecs % 60).toString().padStart(2, '0');
    timeStr = `${mins}:${secs}`;
  }

  // Update DOM values
  setVal('summary-score', totalScore);
  setVal('summary-calories', totalCalories.toFixed(1));
  setVal('summary-time', timeStr);

  setVal('summary-cb-caught', cbCaught);
  setVal('summary-cb-missed', cbMissed);
  setVal('summary-cb-acc', cbAcc);

  setVal('summary-run-steps', runSteps);
  setVal('summary-run-dist', Math.round(runDist));
  setVal('summary-run-speed', runMaxSpeed.toFixed(1));

  setVal('summary-bal-dist', balDist);
  setVal('summary-bal-time', balTime);
  setVal('summary-bal-dev', balMaxDev);

  setVal('summary-rd-score', rdScore);
  setVal('summary-rd-reaction', rdReaction);
  setVal('summary-rd-dist', rdDist);

  // 5. Performance Rating based on 0-100 normalized score
  // Average expected workout score: 300 (Catch ball) + 150 (running) + 100 (balance) + 50 (ruler) = 600
  const normalizedFitnessScore = Math.min(Math.round((totalScore / 600) * 100), 100);
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
      ratingSubtextEl.innerText = 'Good start! Try playing more sets to boost your score.';
    } else if (normalizedFitnessScore <= 50) {
      ratingSubtextEl.innerText = 'Nice pacing! You have a solid aerobic threshold.';
    } else if (normalizedFitnessScore <= 75) {
      ratingSubtextEl.innerText = 'Excellent job! You are in great cardiovascular shape.';
    } else {
      ratingSubtextEl.innerText = 'Outstanding! You achieved peak athletic performance!';
    }
  }

  // 6. Render Chart.js visual
  renderChart(cbScore, runSteps, balScore, rdScore, totalCalories);
}

// Utility to set DOM text content safely
function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

// Draw the Polar Area Chart showing training composition
function renderChart(cbScore, runSteps, balScore, rdScore, calories) {
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
      labels: ['Catch Points', 'Running Steps', 'Balance Score', 'Reflex Score', 'Calories (kcal * 10)'],
      datasets: [{
        label: 'Workout Breakdown',
        data: [
          Math.min(cbScore, 200), // capped for visualization spacing
          Math.min(runSteps, 200),
          Math.min(balScore, 200),
          Math.min(rdScore, 200),
          Math.min(calories * 10, 200)
        ],
        backgroundColor: [
          'rgba(37, 99, 235, 0.65)',  // Blue (Catch Ball)
          'rgba(34, 197, 94, 0.65)',  // Green (Running)
          'rgba(251, 191, 36, 0.65)',  // Yellow (Tight Rope)
          'rgba(6, 182, 212, 0.65)',  // Cyan (Ruler Drop)
          'rgba(239, 68, 68, 0.65)'   // Red (Calories)
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

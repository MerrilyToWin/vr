/**
 * SYNOVA Tight Rope Walk VR Balance Game Logic
 */
import { soundManager } from './utils.js';
import { vrHelper } from './vr.js';
import { adminChannel, saveHistoryToLocalStorage } from './app.js';

let gameTimer = null;
let secondsElapsed = 0;
let animationFrameId = null;
let gameActive = false;

// Game state variables
let playerZ = 0;      // Starts at 0, walks forward (Z decreases)
let speed = 0.05;     // Speed of walking forward
let stability = 100;   // Stability meter (100% to 0%)
let tilt = 0;         // Current tilt angle (-30 to +30 degrees)
let keyboardTilt = 0; // Manual desktop tilt offset (-30 to +30)
let sensorTilt = 0;   // Device orientation tilt offset
let windDrift = 0;    // Wind gust drift offset
let windTime = 0;     // Time tracker for wind generation
let filteredMotion = 0;
let isMotionPeak = false;
let lastMotionTime = 0;
let pendingForwardDistance = 0;
let unsubscribeOrientation = null;
let unsubscribeMotion = null;
let latestMovement = null;
let cleanupGameMode = null;

// Falling physics & time delta tracking
let isFalling = false;
let fallY = 10;
let fallRotation = 0;
let fallVelocityY = 0;
let lastFrameTime = 0;

function updateWindVisuals(dt) {
  const starsContainer = document.getElementById('stars-container');
  if (!starsContainer) return;
  
  // Only spawn horizontal wind lines if wind drift is strong
  if (Math.abs(windDrift) > 1.5 && Math.random() < 0.15) {
    const windLine = document.createElement('a-box');
    const driftDirection = windDrift > 0 ? 1 : -1;
    
    const startX = driftDirection > 0 ? -12 : 12;
    const endX = driftDirection > 0 ? 12 : -12;
    const y = Math.random() * 4 + 8; // altitude 8m to 12m
    const z = playerZ - (Math.random() * 15 + 5); // 5m to 20m in front of camera
    
    windLine.setAttribute('position', `${startX} ${y} ${z}`);
    windLine.setAttribute('width', `${Math.random() * 2 + 2}`);
    windLine.setAttribute('height', '0.015');
    windLine.setAttribute('depth', '0.015');
    windLine.setAttribute('color', '#cbd5e1');
    windLine.setAttribute('material', 'shader: flat; opacity: 0.28; transparent: true;');
    
    const dur = Math.round(1500 / Math.abs(windDrift));
    
    windLine.setAttribute('animation__drift', {
      property: 'position',
      to: `${endX} ${y} ${z}`,
      dur: dur,
      easing: 'linear'
    });
    
    starsContainer.appendChild(windLine);
    
    setTimeout(() => {
      try {
        starsContainer.removeChild(windLine);
      } catch (e) {}
    }, dur);
  }
}

// Difficulty parameters
let windStrength = 0.1;
let recoveryRate = 0.5;
let drainRate = 1.0;
let strideDistance = 0.75;

const MOTION_THRESHOLD = 2.2;
const MOTION_DEBOUNCE_TIME = 320;
const MOTION_FILTER_ALPHA = 0.25;

// Balance HUD boundaries (A-Frame coordinates)
const MAX_DOT_X = 0.38; // Max limit on X axis for balance indicator
const SAFE_ZONE_LIMIT = 0.08; // X displacement for green safe zone

// Obstacle system
let obstacles = [];
let lastObstacleSpawn = 0;
const OBSTACLE_SPAWN_INTERVAL = 15; // Spawn obstacle every 15 meters
const OBSTACLE_WIDTH = 0.6; // Safe passage width
const OBSTACLE_HIT_THRESHOLD = 0.4; // Distance from center to trigger collision

// Keyboard press state
const keysPressed = {};

export function initBalanceGame() {
  gameActive = false;
  secondsElapsed = 0;
  playerZ = 0;
  stability = 100;
  tilt = 0;
  keyboardTilt = 0;
  sensorTilt = 0;
  windDrift = 0;
  windTime = 0;
  filteredMotion = 0;
  isMotionPeak = false;
  lastMotionTime = Date.now();
  pendingForwardDistance = 0;
  latestMovement = null;
  isFalling = false;
  fallY = 10;
  fallRotation = 0;
  fallVelocityY = 0;
  lastFrameTime = performance.now();
  obstacles = [];
  lastObstacleSpawn = 0;

  // Set difficulty parameters
  const diff = window.appState.settings.difficulty || 'medium';
  if (diff === 'easy') {
    speed = 0.04;
    windStrength = 0.05;
    drainRate = 0.6;
    recoveryRate = 0.8;
    strideDistance = 0.65;
  } else if (diff === 'hard') {
    speed = 0.07;
    windStrength = 0.22;
    drainRate = 1.8;
    recoveryRate = 0.3;
    strideDistance = 0.9;
  } else {
    // medium
    speed = 0.05;
    windStrength = 0.12;
    drainRate = 1.0;
    recoveryRate = 0.5;
    strideDistance = 0.75;
  }

  // Set camera initial position (high altitude: Y=10, Z=0)
  const cameraRig = document.getElementById('camera-rig');
  if (cameraRig) {
    cameraRig.setAttribute('position', '0 10 0');
    cameraRig.setAttribute('rotation', '0 0 0');
  }

  const sceneEl = document.querySelector('a-scene');

  // Setup Keyboard Listeners
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // Setup live movement fusion from all available phone sensors
  unsubscribeMotion = vrHelper.subscribeMovement((data) => {
    latestMovement = data;
    handleDeviceOrientation(data);
    handleDeviceMotion(data);
  });

  // Setup Orientation change prompt
  const cleanupOrientation = vrHelper.onOrientationChange((isLandscape) => {
    const overlay = document.getElementById('rotate-overlay');
    if (overlay) {
      if (!isLandscape && gameActive) {
        overlay.classList.add('visible');
      } else {
        overlay.classList.remove('visible');
      }
    }
  });

  // Countdown starts only after mobile landscape and VR mode are ready.
  cleanupGameMode = vrHelper.requireGameMode({
    sceneEl,
    onReady: () => {
      startCountdown(() => {
        startGameLoop();
      });
    }
  });

  // Exit Button
  const exitBtn = document.getElementById('btn-exit-game');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      endGame(true);
    });
  }

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    if (unsubscribeMotion) {
      unsubscribeMotion();
      unsubscribeMotion = null;
    }
    if (cleanupGameMode) {
      cleanupGameMode();
      cleanupGameMode = null;
    }
    cleanupOrientation();
    cleanupBalanceGame();
  };
}

function startCountdown(onComplete) {
  const overlay = document.getElementById('countdown-overlay');
  const hud = document.getElementById('game-hud');
  const numberEl = document.getElementById('countdown-number');
  let count = 5;

  soundManager.playCountdown(false);

  const countdownInterval = setInterval(() => {
    count--;
    if (numberEl) numberEl.innerText = count;

    if (count > 0) {
      soundManager.playCountdown(false);
    } else {
      clearInterval(countdownInterval);
      soundManager.playCountdown(true);
      if (overlay) overlay.classList.add('d-none');
      if (hud) hud.classList.remove('d-none');
      onComplete();
    }
  }, 1000);

  // Store countdown interval to clear if game is exited early
  animationFrameId = countdownInterval;
}

function startGameLoop() {
  gameActive = true;
  updateHUD();

  // Time tracker
  gameTimer = setInterval(() => {
    secondsElapsed++;
    updateHUD();
  }, 1000);

  lastFrameTime = performance.now();
  // Start frame animation
  tick();
}

function handleKeyDown(e) {
  keysPressed[e.code] = true;
}

function handleKeyUp(e) {
  keysPressed[e.code] = false;
}

function handleDeviceOrientation(data) {
  // Clamp raw tilt value and blend in gyro roll-rate for more responsive live movement.
  const gyroRollBoost = data.rotationRate ? data.rotationRate.z * 2.5 : 0;
  const targetSensorTilt = Math.max(Math.min((data.tilt || 0) + gyroRollBoost, 30), -30);
  sensorTilt = sensorTilt * 0.8 + targetSensorTilt * 0.2;
}

let slowMovingAverage = 0;
let fastMovingAverage = 0;

function handleDeviceMotion(data) {
  if (!gameActive) return;

  const motionMagnitude = data.movementScore || data.magnitude || 0;
  
  if (slowMovingAverage === 0) slowMovingAverage = motionMagnitude;
  if (fastMovingAverage === 0) fastMovingAverage = motionMagnitude;
  
  slowMovingAverage = 0.95 * slowMovingAverage + 0.05 * motionMagnitude;
  fastMovingAverage = 0.60 * fastMovingAverage + 0.40 * motionMagnitude;
  
  const dynamicMotion = Math.abs(fastMovingAverage - slowMovingAverage);
  filteredMotion = 0.4 * dynamicMotion + 0.6 * filteredMotion;

  const threshold = 0.8; 
  const now = Date.now();
  
  if (filteredMotion > threshold) {
    if (!isMotionPeak && (now - lastMotionTime) > MOTION_DEBOUNCE_TIME) {
      pendingForwardDistance += strideDistance;
      lastMotionTime = now;
      isMotionPeak = true;
    }
  } else if (filteredMotion < threshold * 0.6) {
    isMotionPeak = false;
  }
}

function tick() {
  if (!gameActive && !isFalling) return;

  const now = performance.now();
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  // Real-Time falling physics animation in requestAnimationFrame tick
  if (isFalling) {
    fallVelocityY += 9.8 * dt; // gravity constant acceleration
    fallY -= fallVelocityY * dt;
    fallRotation += 120 * dt; // spin roll

    const cameraRig = document.getElementById('camera-rig');
    if (cameraRig) {
      cameraRig.setAttribute('position', `0 ${fallY} ${playerZ}`);
      cameraRig.setAttribute('rotation', `15 0 ${fallRotation}`);
    }

    if (fallY <= 1.2) {
      isFalling = false;
      endGame(false); // End game natural trigger
      return;
    }

    animationFrameId = requestAnimationFrame(tick);
    return;
  }

  // 1. Process Desktop Input
  if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) {
    keyboardTilt -= 45 * dt;
  }
  if (keysPressed['KeyD'] || keysPressed['ArrowRight']) {
    keyboardTilt += 45 * dt;
  }
  // Soft decay back to center if no keys are pressed and no sensors active
  if (!keysPressed['KeyA'] && !keysPressed['ArrowLeft'] && !keysPressed['KeyD'] && !keysPressed['ArrowRight']) {
    keyboardTilt *= Math.pow(0.1, dt);
  }
  keyboardTilt = Math.max(Math.min(keyboardTilt, 30), -30);

  // 2. Process Wind Gusts (Dynamic Drift over time)
  windTime += dt * 1.0;
  // Use sine waves of different frequencies to make wind feel natural/unpredictable
  windDrift = Math.sin(windTime * 0.7) * Math.cos(windTime * 1.5) * windStrength * 18;

  // 3. Compute final combined tilt (-30 to +30 scale)
  tilt = sensorTilt + keyboardTilt + windDrift;
  tilt = Math.max(Math.min(tilt, 30), -30);

  // 4. Translate combined tilt to X displacement on the balance HUD indicator
  // Map tilt (-30 to +30) to HUD X position (-MAX_DOT_X to +MAX_DOT_X)
  const dotX = (tilt / 30) * MAX_DOT_X;
  const cursorDot = document.getElementById('balance-cursor-dot');
  if (cursorDot) {
    cursorDot.setAttribute('position', `${dotX} 0 0.02`);
  }

  // 5. Update Stability Meter based on balance safety zones
  const isOutOfSafeZone = Math.abs(dotX) > SAFE_ZONE_LIMIT;
  const tiltStatusEl = document.getElementById('hud-tilt-status');

  if (isOutOfSafeZone) {
    // Out of green zone: drain stability
    const severity = Math.abs(dotX) / MAX_DOT_X;
    stability = Math.max(stability - drainRate * severity * 75 * dt, 0);

    if (tiltStatusEl) {
      tiltStatusEl.style.borderColor = 'var(--danger-color)';
      tiltStatusEl.innerHTML = `<i data-lucide="alert-triangle"></i> Falling! ${Math.round(stability)}%`;
      tiltStatusEl.className = 'hud-pill text-danger';
    }
  } else {
    // In green safe zone: recover stability
    stability = Math.min(stability + recoveryRate * 50 * dt, 100);

    if (tiltStatusEl) {
      tiltStatusEl.style.borderColor = 'var(--accent-green)';
      tiltStatusEl.innerHTML = `<i data-lucide="shield-check"></i> Balanced`;
      tiltStatusEl.className = 'hud-pill text-success';
    }
  }

  // Update cursor dot color depending on health
  if (cursorDot) {
    if (stability < 40) {
      cursorDot.setAttribute('color', '#EF4444'); // Red danger
    } else if (stability < 80) {
      cursorDot.setAttribute('color', '#FBBF24'); // Yellow warning
    } else {
      cursorDot.setAttribute('color', '#3B82F6'); // Blue balanced
    }
  }

  // 6. Camera Tilt rotation Z representation (Roll)
  const camera = document.getElementById('main-camera');
  if (camera) {
    const rot = camera.getAttribute('rotation') || { x: 0, y: 0, z: 0 };
    camera.setAttribute('rotation', `${rot.x} ${rot.y} ${tilt}`);
  }

  // 7. Dynamic Wind Visualizer
  updateWindVisuals(dt);

  // 8. Tightrope Sway/vibration under low stability
  const tightrope = document.getElementById('tightrope');
  if (tightrope) {
    if (stability < 85) {
      const intensity = (85 - stability) / 85;
      const swayX = Math.sin(now * 0.05) * 0.03 * intensity;
      tightrope.setAttribute('position', `${swayX} 9.8 -100`);
    } else {
      tightrope.setAttribute('position', '0 9.8 -100');
    }
  }

  // 9. Check Game Over (Stability hits 0 or Z limit reached)
  const cameraRig = document.getElementById('camera-rig');
  
  if (stability <= 0) {
    // Trigger Fall
    triggerFall();
    return;
  }

  // 10. Move Player Forward only when the phone registers walking motion.
  if (pendingForwardDistance > 0 && stability > 0) {
    const frameMove = Math.min(pendingForwardDistance, Math.max(speed, 0.04));
    playerZ -= frameMove;
    pendingForwardDistance -= frameMove;
    updateHUD();
    
    // Spawn obstacles based on distance traveled
    const distanceTraveled = Math.abs(playerZ);
    if (distanceTraveled > lastObstacleSpawn + OBSTACLE_SPAWN_INTERVAL) {
      spawnObstacle(playerZ - (Math.random() * 20 + 10));
      lastObstacleSpawn = distanceTraveled;
    }
    
    // Check collisions with obstacles
    checkObstacleCollisions();
  }
  
  // Z limit: -200 is the destination building platform
  if (playerZ <= -200) {
    playerZ = -200;
    endGame(false); // Success! Finished rope walk
    return;
  }

  if (cameraRig) {
    cameraRig.setAttribute('position', `0 10 ${playerZ}`);
  }

  // Broadcast real-time sensor streams to admin panel
  broadcastSensorStream();

  animationFrameId = requestAnimationFrame(tick);
}

function broadcastSensorStream() {
  try {
    const distanceWalked = Math.round(Math.abs(playerZ));
    const score = Math.round(distanceWalked * 2 + secondsElapsed);
    const calories = Math.round(secondsElapsed * 0.08 * 10) / 10; // 0.08 kcal/sec
    const motion = latestMovement || {};
    const accel = motion.linearAccel || motion.motion || motion.accelerometer || {};
    const gyro = motion.gyroscope || {};
    const orientation = motion.orientation || {};

    adminChannel.postMessage({
      type: 'sensor_stream',
      game: 'balance',
      accel: {
        x: formatSensorValue(accel.x),
        y: formatSensorValue(accel.y),
        z: formatSensorValue(accel.z),
        magnitude: formatSensorValue(motion.magnitude),
        filtered: formatSensorValue(filteredMotion),
        gyroX: formatSensorValue(gyro.x),
        gyroY: formatSensorValue(gyro.y),
        gyroZ: formatSensorValue(gyro.z),
        tilt: formatSensorValue(tilt),
        alpha: formatSensorValue(orientation.alpha),
        beta: formatSensorValue(orientation.beta),
        gamma: formatSensorValue(orientation.gamma),
        source: accel.source || motion.source || 'movement'
      },
      steps: distanceWalked, // steps mapped to distance for admin stream
      distance: distanceWalked,
      calories: calories,
      speed: Math.abs(tilt), // speed mapped to current tilt angle
      timeElapsed: secondsElapsed
    });
  } catch (err) {}
}

function formatSensorValue(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function updateHUD() {
  const distEl = document.getElementById('hud-distance');
  const timeEl = document.getElementById('hud-time');
  
  const distanceWalked = Math.round(Math.abs(playerZ));
  const score = Math.round(distanceWalked * 2 + secondsElapsed);
  if (distEl) distEl.innerText = distanceWalked;
  if (timeEl) timeEl.innerText = secondsElapsed;

  // Broadcast game stats to admin panel
  try {
    adminChannel.postMessage({
      type: 'game_event',
      game: 'balance',
      score: score,
      combo: Math.round(stability),
      ballsCaught: distanceWalked,
      ballsMissed: stability <= 0 ? 1 : 0,
      accuracy: Math.round(stability),
      timeElapsed: secondsElapsed
    });
  } catch (e) {}
}

function triggerFall() {
  gameActive = false;
  isFalling = true;
  fallY = 10;
  fallRotation = 0;
  fallVelocityY = 0;
  
  // Stop BGM and other intervals
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }
  
  soundManager.playFall();
}

function cleanupIntervals() {
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    clearInterval(animationFrameId); // handles countdown clean too
    animationFrameId = null;
  }
}

function endGame(forced = false) {
  gameActive = false;
  cleanupIntervals();
  
  vrHelper.exitFullscreen();
  
  if (!forced) {
    if (stability <= 0) {
      soundManager.playGameOver();
    } else {
      soundManager.playSuccess();
    }
    
    // Save results to appState
    const distanceWalked = Math.round(Math.abs(playerZ));
    const finalScore = Math.round(distanceWalked * 2 + secondsElapsed);
    const caloriesBurned = Math.round(secondsElapsed * 0.08 * 10) / 10;
    
    window.appState.gameResults.balance.push({
      score: finalScore,
      duration: secondsElapsed,
      distance: distanceWalked,
      maxDeviation: Math.round(100 - stability),
      calories: caloriesBurned,
      date: new Date()
    });
    saveHistoryToLocalStorage();
    
    window.location.hash = '#summary';
  } else {
    window.location.hash = '#dashboard';
  }
}

// Spawn an obstacle (hoop/ring) along the rope path
function spawnObstacle(zPosition) {
  const container = document.getElementById('target-container');
  if (!container) return;
  
  const obstacle = document.createElement('a-torus');
  const obstacleId = `obstacle-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const xOffset = (Math.random() * 1.6 - 0.8);
  
  let color = '#10b981';
  let difficulty = 1;
  const rand = Math.random();
  if (rand > 0.7) {
    color = '#ef4444';
    difficulty = 3;
  } else if (rand > 0.4) {
    color = '#f59e0b';
    difficulty = 2;
  }
  
  obstacle.setAttribute('id', obstacleId);
  obstacle.setAttribute('position', `${xOffset} 9.8 ${zPosition}`);
  obstacle.setAttribute('rotation', '90 0 0');
  obstacle.setAttribute('radius', '0.5');
  obstacle.setAttribute('tube', '0.08');
  obstacle.setAttribute('color', color);
  obstacle.setAttribute('material', `emissive: ${color}; emissiveIntensity: 0.3; metalness: 0.4`);
  obstacle.setAttribute('animation__pulse', {property: 'scale', to: '1.1 1.1 1.1', dir: 'alternate', dur: 500, loop: true});
  
  container.appendChild(obstacle);
  obstacles.push({id: obstacleId, element: obstacle, zPosition, xOffset, difficulty, passed: false});
  
  setTimeout(() => {
    const obs = obstacles.find(o => o.id === obstacleId);
    if (obs && container && obs.element.parentNode === container) {
      try { container.removeChild(obs.element); } catch (e) {}
      obstacles = obstacles.filter(o => o.id !== obstacleId);
    }
  }, 8000);
}

// Check collision with obstacles
function checkObstacleCollisions() {
  obstacles.forEach((obstacle) => {
    if (obstacle.passed) return;
    const distanceToObstacle = Math.abs(playerZ - obstacle.zPosition);
    if (distanceToObstacle < 1.5 && distanceToObstacle > 0.2) {
      const relativePosition = Math.abs(tilt / 30);
      const obstacleCenter = obstacle.xOffset / 3;
      const safeZoneRadius = 0.15 / obstacle.difficulty;
      const collision = Math.abs(relativePosition - (0.5 + obstacleCenter * 0.2)) > safeZoneRadius;
      if (collision) {
        stability = Math.max(stability - (8 * obstacle.difficulty), 0);
        soundManager.playMiss();
        obstacle.element.setAttribute('color', '#ef4444');
        setTimeout(() => {
          if (obstacles.includes(obstacle)) {
            obstacle.element.setAttribute('color', '#10b981');
          }
        }, 200);
      }
    }
    if (playerZ < obstacle.zPosition - 2) {
      obstacle.passed = true;
    }
  });
}

export function cleanupBalanceGame() {
  gameActive = false;

  if (cleanupGameMode) {
    cleanupGameMode();
    cleanupGameMode = null;
  }

  cleanupIntervals();
  
  // Clear scene elements if needed
  const starsContainer = document.getElementById('stars-container');
  if (starsContainer) {
    starsContainer.innerHTML = '';
  }
  
  // Clear obstacles
  const container = document.getElementById('target-container');
  if (container) {
    obstacles.forEach(obs => {
      try {
        if (obs.element.parentNode === container) {
          container.removeChild(obs.element);
        }
      } catch (e) {}
    });
  }
  obstacles = [];
  
  document.documentElement.classList.remove('a-fullscreen');
  document.body.classList.remove('a-fullscreen');
}

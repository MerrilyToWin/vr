/**
 * SYNOVA Running Challenge Controller
 * Implements DeviceMotion step detection and Spacebar key simulator.
 * Features an immersive 3D A-Frame VR scene with scrolling scenery and head bobbing.
 */
import { soundManager, fitnessMath } from './utils.js';
import { vrHelper } from './vr.js';
import { adminChannel, saveHistoryToLocalStorage } from './app.js';

let gameActive = false;
let runningTimer = null;
let tickFrameId = null;
let secondsLeft = 45;
let stepCount = 0;
let lastStepTime = 0;
let filteredAcc = 0;
let isAboveThreshold = false;
let currentSpeed = 0;
let maxSpeedReached = 0;
let unsubscribeMotion = null;
let latestMovement = null;
let cleanupGameMode = null;

// Peak detection settings
const ACCEL_THRESHOLD = 12.0;
const DEBOUNCE_TIME = 350;
const FILTER_ALPHA = 0.2;

// Real-time animation physics variables
let lastFrameTime = 0;
let bobTime = 0;
let scenerySpeedFactor = 3.0; // scales visual motion
let spawnedScenery = [];

export function initRunningGame() {
  gameActive = false;
  secondsLeft = window.appState.settings.gameDuration || 45;
  stepCount = 0;
  lastStepTime = Date.now();
  filteredAcc = 0;
  isAboveThreshold = false;
  currentSpeed = 0;
  maxSpeedReached = 0;
  latestMovement = null;
  bobTime = 0;
  spawnedScenery = [];

  const sceneEl = document.querySelector('a-scene');

  // Setup device rotation checks
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

  // Setup Keyboard Listeners
  window.addEventListener('keydown', handleKeyboardStep);

  // Setup live movement fusion from all available phone sensors
  unsubscribeMotion = vrHelper.subscribeMovement((data) => {
    latestMovement = data;
    handleDeviceMotion(data);
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

  // Setup Exit Button
  const exitBtn = document.getElementById('btn-stop-running');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      endChallenge(true); // Forced cancel
    });
  }

  return () => {
    window.removeEventListener('keydown', handleKeyboardStep);
    if (unsubscribeMotion) {
      unsubscribeMotion();
      unsubscribeMotion = null;
    }
    if (cleanupGameMode) {
      cleanupGameMode();
      cleanupGameMode = null;
    }
    cleanupOrientation();
    cleanupRunningGame();
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

  // Re-use runningTimer reference for early cleanup
  runningTimer = countdownInterval;
}

function startGameLoop() {
  gameActive = true;
  lastFrameTime = performance.now();

  // Clear countdown reference and setup actual game timer
  if (runningTimer) clearInterval(runningTimer);
  
  runningTimer = setInterval(() => {
    secondsLeft--;
    updateHUD();

    if (secondsLeft <= 0) {
      endChallenge(false);
    }
  }, 1000);

  // Build scenery elements in 3D
  buildEnvironment();

  // Start tick render animation loop
  tick();
}

function buildEnvironment() {
  const sceneryContainer = document.getElementById('scenery-container');
  const starsContainer = document.getElementById('stars-container');
  if (!sceneryContainer) return;

  sceneryContainer.innerHTML = '';
  if (starsContainer) starsContainer.innerHTML = '';

  // 1. Spawn Stars
  if (starsContainer) {
    for (let i = 0; i < 120; i++) {
      const star = document.createElement('a-sphere');
      const x = (Math.random() * 200 - 100).toFixed(2);
      const y = (Math.random() * 60 + 20).toFixed(2);
      const z = (Math.random() * 200 - 100).toFixed(2);
      const r = (Math.random() * 0.15 + 0.05).toFixed(2);
      
      star.setAttribute('position', `${x} ${y} ${z}`);
      star.setAttribute('radius', r);
      star.setAttribute('color', '#ffffff');
      star.setAttribute('material', 'shader: flat; opacity: 0.8');
      starsContainer.appendChild(star);
    }
  }

  // 2. Spawn Streetlights lining the path (left and right sides every 15 meters)
  const segmentLength = 15;
  const startZ = -10;
  const endZ = -115;
  
  for (let z = startZ; z >= endZ; z -= segmentLength) {
    createStreetlight(-4.2, z);
    createStreetlight(4.2, z);
  }

  // 3. Spawn Neon Arches bridging the track (every 30 meters)
  for (let z = -25; z >= -115; z -= 30) {
    createArch(z);
  }
}

function createStreetlight(x, z) {
  const container = document.getElementById('scenery-container');
  if (!container) return;

  const pole = document.createElement('a-entity');
  pole.setAttribute('position', `${x} 0 ${z}`);

  // Base Pole
  const cylinder = document.createElement('a-cylinder');
  cylinder.setAttribute('radius', '0.06');
  cylinder.setAttribute('height', '3.5');
  cylinder.setAttribute('position', '0 1.75 0');
  cylinder.setAttribute('color', '#475569');
  cylinder.setAttribute('material', 'roughness: 0.7;');
  pole.appendChild(cylinder);

  // Glowing Lantern top
  const lightSphere = document.createElement('a-sphere');
  lightSphere.setAttribute('radius', '0.22');
  lightSphere.setAttribute('position', `${x < 0 ? 0.3 : -0.3} 3.5 0`);
  lightSphere.setAttribute('color', '#38bdf8');
  lightSphere.setAttribute('material', 'shader: flat; emissive: #38bdf8; emissiveIntensity: 1.0;');
  pole.appendChild(lightSphere);

  container.appendChild(pole);
  spawnedScenery.push({ el: pole, baseZ: z });
}

function createArch(z) {
  const container = document.getElementById('scenery-container');
  if (!container) return;

  const arch = document.createElement('a-entity');
  arch.setAttribute('position', `0 0 ${z}`);

  // Left column
  const colL = document.createElement('a-box');
  colL.setAttribute('width', '0.15');
  colL.setAttribute('height', '5.0');
  colL.setAttribute('depth', '0.15');
  colL.setAttribute('position', '-4 2.5 0');
  colL.setAttribute('color', '#22c55e');
  colL.setAttribute('material', 'shader: flat; emissive: #22c55e; emissiveIntensity: 0.4;');
  arch.appendChild(colL);

  // Right column
  const colR = document.createElement('a-box');
  colR.setAttribute('width', '0.15');
  colR.setAttribute('height', '5.0');
  colR.setAttribute('depth', '0.15');
  colR.setAttribute('position', '4 2.5 0');
  colR.setAttribute('color', '#22c55e');
  colR.setAttribute('material', 'shader: flat; emissive: #22c55e; emissiveIntensity: 0.4;');
  arch.appendChild(colR);

  // Cross beam
  const beam = document.createElement('a-box');
  beam.setAttribute('width', '8.2');
  beam.setAttribute('height', '0.15');
  beam.setAttribute('depth', '0.15');
  beam.setAttribute('position', '0 5.0 0');
  beam.setAttribute('color', '#3b82f6');
  beam.setAttribute('material', 'shader: flat; emissive: #3b82f6; emissiveIntensity: 0.6;');
  arch.appendChild(beam);

  container.appendChild(arch);
  spawnedScenery.push({ el: arch, baseZ: z });
}

function tick() {
  if (!gameActive) return;

  const now = performance.now();
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1); // cap dt to avoid huge jumps on tab resume
  lastFrameTime = now;

  // 1. Real-Time speed decay (smooth, frame-independent)
  if (Date.now() - lastStepTime > 1200) {
    currentSpeed = Math.max(currentSpeed - 2.8 * dt, 0);
  }

  // 2. Real-Time Scenery scroll animations
  const velocity = currentSpeed * scenerySpeedFactor; // visual scale velocity
  
  spawnedScenery.forEach((sc) => {
    sc.baseZ += velocity * dt;
    // Wrap around once it goes behind camera (Z > 2)
    if (sc.baseZ > 3) {
      sc.baseZ = -102; // Recycle back to starting horizon
    }
    const currentPos = sc.el.getAttribute('position');
    sc.el.setAttribute('position', `${currentPos.x} ${currentPos.y} ${sc.baseZ}`);
  });

  // 3. Real-Time Head Bobbing (Sinusoidal camera bobbing based on speed)
  const camera = document.getElementById('main-camera');
  if (camera) {
    let rotX = 0;
    let rotY = 0;
    let rotZ = 0;
    let posY = 1.6;

    const rawRot = camera.getAttribute('rotation');
    if (typeof rawRot === 'object' && rawRot !== null) {
      rotX = Number.isFinite(rawRot.x) ? rawRot.x : 0;
      rotY = Number.isFinite(rawRot.y) ? rawRot.y : 0;
      rotZ = Number.isFinite(rawRot.z) ? rawRot.z : 0;
    } else if (typeof rawRot === 'string') {
      const parts = rawRot.trim().split(/\s+/).map(Number);
      if (parts.length >= 3) {
        rotX = Number.isFinite(parts[0]) ? parts[0] : 0;
        rotY = Number.isFinite(parts[1]) ? parts[1] : 0;
        rotZ = Number.isFinite(parts[2]) ? parts[2] : 0;
      }
    }

    const rawPos = camera.getAttribute('position');
    if (typeof rawPos === 'object' && rawPos !== null) {
      posY = Number.isFinite(rawPos.y) ? rawPos.y : 1.6;
    } else if (typeof rawPos === 'string') {
      const parts = rawPos.trim().split(/\s+/).map(Number);
      if (parts.length >= 2) posY = Number.isFinite(parts[1]) ? parts[1] : 1.6;
    }

    if (currentSpeed > 0.1) {
      const frequency = currentSpeed * 1.5;
      bobTime += dt * frequency;

      const bobY = Math.sin(bobTime) * 0.05 * (currentSpeed / 12);
      const bobZ = Math.cos(bobTime * 0.5) * 1.2 * (currentSpeed / 12);
      
      const safeY = Number.isFinite(bobY) ? 1.6 + bobY : 1.6;
      const safeZ = Number.isFinite(bobZ) ? bobZ : 0;

      camera.setAttribute('position', `0 ${safeY.toFixed(3)} 0`);
      camera.setAttribute('rotation', `${rotX.toFixed(2)} ${rotY.toFixed(2)} ${safeZ.toFixed(2)}`);
    } else {
      const newY = posY * 0.9 + 1.6 * 0.1;
      const newZRoll = rotZ * 0.9;
      
      const safeY = Number.isFinite(newY) ? newY : 1.6;
      const safeZ = Number.isFinite(newZRoll) ? newZRoll : 0;

      camera.setAttribute('position', `0 ${safeY.toFixed(3)} 0`);
      camera.setAttribute('rotation', `${rotX.toFixed(2)} ${rotY.toFixed(2)} ${safeZ.toFixed(2)}`);
    }
  }

  // Stream stats dynamically to admin panel
  broadcastSensorStream();

  tickFrameId = requestAnimationFrame(tick);
}

function handleDeviceMotion(data) {
  if (!gameActive) return;

  const motionMagnitude = data.movementScore || data.magnitude || 0;
  filteredAcc = FILTER_ALPHA * motionMagnitude + (1 - FILTER_ALPHA) * filteredAcc;
  
  const threshold = data.hasLinearAccel ? 2.2 : ACCEL_THRESHOLD;
  const now = Date.now();
  if (filteredAcc > threshold) {
    if (!isAboveThreshold && (now - lastStepTime) > DEBOUNCE_TIME) {
      registerStep(now);
      isAboveThreshold = true;
    }
  } else if (filteredAcc < threshold - 0.6) {
    isAboveThreshold = false;
  }
}

function registerStep(now) {
  stepCount++;
  
  const stepDeltaSecs = (now - lastStepTime) / 1000;
  lastStepTime = now;
  
  let estimatedSpeed = 2.7 / stepDeltaSecs;
  if (estimatedSpeed > 16) estimatedSpeed = 16;
  if (estimatedSpeed < 1.5) estimatedSpeed = 1.5;
  
  currentSpeed = Math.round(estimatedSpeed * 10) / 10;
  if (currentSpeed > maxSpeedReached) maxSpeedReached = currentSpeed;
  
  soundManager.playStep();
  updateHUD();
}

function handleKeyboardStep(e) {
  if (e.code === 'Space') {
    e.preventDefault();
    registerStep(Date.now());
  }
}

function updateHUD() {
  const distMeters = fitnessMath.calcDistance(stepCount);
  const calories = fitnessMath.calcCalories(stepCount);

  // Broadcast game event data to admin channel
  try {
    adminChannel.postMessage({
      type: 'game_event',
      game: 'running',
      score: stepCount,
      combo: 0,
      ballsCaught: stepCount,
      ballsMissed: 0,
      accuracy: 100,
      timeElapsed: (window.appState.settings.gameDuration || 45) - secondsLeft
    });
  } catch (e) {}
}

function broadcastSensorStream() {
  try {
    const distMeters = fitnessMath.calcDistance(stepCount);
    const calories = fitnessMath.calcCalories(stepCount);
    const motion = latestMovement || {};
    const accel = motion.linearAccel || motion.motion || motion.accelerometer || {};
    const gyro = motion.gyroscope || {};
    const orientation = motion.orientation || {};
    
    adminChannel.postMessage({
      type: 'sensor_stream',
      game: 'running',
      accel: {
        x: formatSensorValue(accel.x),
        y: formatSensorValue(accel.y),
        z: formatSensorValue(accel.z),
        magnitude: formatSensorValue(motion.magnitude),
        filtered: formatSensorValue(filteredAcc),
        gyroX: formatSensorValue(gyro.x),
        gyroY: formatSensorValue(gyro.y),
        gyroZ: formatSensorValue(gyro.z),
        tilt: formatSensorValue(motion.tilt),
        alpha: formatSensorValue(orientation.alpha),
        beta: formatSensorValue(orientation.beta),
        gamma: formatSensorValue(orientation.gamma),
        source: accel.source || motion.source || 'movement'
      },
      steps: stepCount,
      distance: distMeters,
      calories: calories,
      speed: currentSpeed,
      timeElapsed: (window.appState.settings.gameDuration || 45) - secondsLeft
    });
  } catch (err) {}
}

function formatSensorValue(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function endChallenge(forced = false) {
  cleanupRunningGame();
  vrHelper.exitFullscreen();
  
  if (!forced) {
    soundManager.playSuccess();
    
    const calories = fitnessMath.calcCalories(stepCount);
    const distance = fitnessMath.calcDistance(stepCount);
    
    window.appState.gameResults.running.push({
      steps: stepCount,
      distance,
      speed: maxSpeedReached,
      calories,
      duration: (window.appState.settings.gameDuration || 45) - secondsLeft,
      date: new Date()
    });
    saveHistoryToLocalStorage();
    
    window.location.hash = '#summary';
  } else {
    window.location.hash = '#dashboard';
  }
}

export function cleanupRunningGame() {
  gameActive = false;

  if (cleanupGameMode) {
    cleanupGameMode();
    cleanupGameMode = null;
  }
  
  if (runningTimer) {
    clearInterval(runningTimer);
    runningTimer = null;
  }

  if (tickFrameId) {
    cancelAnimationFrame(tickFrameId);
    tickFrameId = null;
  }
  
  // Clear entities in 3D
  const sceneryContainer = document.getElementById('scenery-container');
  if (sceneryContainer) sceneryContainer.innerHTML = '';

  const starsContainer = document.getElementById('stars-container');
  if (starsContainer) starsContainer.innerHTML = '';

  document.documentElement.classList.remove('a-fullscreen');
  document.body.classList.remove('a-fullscreen');
}

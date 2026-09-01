/**
 * SYNOVA Catch the Ball VR Game Logic
 */
import { soundManager, fitnessMath } from './utils.js';
import { vrHelper } from './vr.js';
import { adminChannel, saveHistoryToLocalStorage } from './app.js';

// Register curved flight path component in A-Frame
if (typeof AFRAME !== 'undefined' && !AFRAME.components['curved-flight']) {
  AFRAME.registerComponent('curved-flight', {
    schema: {
      startX: {type: 'number'},
      startY: {type: 'number'},
      startZ: {type: 'number'},
      duration: {type: 'number', default: 4000}
    },
    init: function () {
      this.timeElapsed = 0;
      this.p0 = new THREE.Vector3(this.data.startX, this.data.startY, this.data.startZ);
      
      // Calculate a curved control point arching upwards and slightly bending side-to-side
      const sideOffset = (Math.random() * 2 - 1) * 1.5;
      const arcHeight = (Math.random() * 0.8 + 0.6) * 1.5;
      const midX = (this.data.startX + 0) / 2 + sideOffset;
      const midY = (this.data.startY + 1.6) / 2 + arcHeight;
      const midZ = (this.data.startZ + 0) / 2;
      this.p1 = new THREE.Vector3(midX, midY, midZ);
      this.p2 = new THREE.Vector3(0, 1.6, 0); // target camera
    },
    tick: function (time, timeDelta) {
      this.timeElapsed += timeDelta;
      const t = Math.min(this.timeElapsed / this.data.duration, 1);
      
      const oneMinusT = 1 - t;
      const term0 = oneMinusT * oneMinusT;
      const term1 = 2 * oneMinusT * t;
      const term2 = t * t;
      
      const x = term0 * this.p0.x + term1 * this.p1.x + term2 * this.p2.x;
      const y = term0 * this.p0.y + term1 * this.p1.y + term2 * this.p2.y;
      const z = term0 * this.p0.z + term1 * this.p1.z + term2 * this.p2.z;
      
      this.el.setAttribute('position', `${x} ${y} ${z}`);
      
      if (t >= 1) {
        this.el.emit('reached-target');
      }
    }
  });
}

// Particle explosion helper for high-fidelity catch VFX
function spawnExplosion(position, color) {
  const container = document.getElementById('target-container');
  if (!container) return;

  const numParticles = 10;
  for (let i = 0; i < numParticles; i++) {
    const p = document.createElement('a-sphere');
    p.setAttribute('radius', '0.04');
    p.setAttribute('color', color);
    p.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
    p.setAttribute('material', 'shader: flat; opacity: 0.9');

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const speed = Math.random() * 1.5 + 0.8;
    const vx = Math.sin(phi) * Math.cos(theta) * speed;
    const vy = Math.sin(phi) * Math.sin(theta) * speed;
    const vz = Math.cos(phi) * speed;

    p.setAttribute('animation__move', {
      property: 'position',
      to: `${position.x + vx} ${position.y + vy} ${position.z + vz}`,
      dur: 350,
      easing: 'easeOutQuad'
    });

    p.setAttribute('animation__scale', {
      property: 'scale',
      to: '0 0 0',
      dur: 350,
      easing: 'easeInQuad'
    });

    container.appendChild(p);

    setTimeout(() => {
      try {
        container.removeChild(p);
      } catch (err) {}
    }, 350);
  }
}

// Floating score popup in 3D space
function spawnScorePopup(position, points) {
  const container = document.getElementById('target-container');
  if (!container) return;

  const popup = document.createElement('a-text');
  const isPositive = points >= 0;
  const textValue = isPositive ? `+${points}` : `${points}`;
  const textColor = isPositive ? (points >= 50 ? '#FBBF24' : '#38BDF8') : '#EF4444';

  popup.setAttribute('value', textValue);
  popup.setAttribute('color', textColor);
  popup.setAttribute('align', 'center');
  popup.setAttribute('width', '2.5');
  popup.setAttribute('position', `${position.x} ${position.y} ${position.z}`);

  popup.setAttribute('animation__move', {
    property: 'position',
    to: `${position.x} ${position.y + 0.8} ${position.z}`,
    dur: 750,
    easing: 'easeOutQuad'
  });

  popup.setAttribute('animation__scale', {
    property: 'scale',
    to: '0 0 0',
    dur: 750,
    easing: 'easeInQuad'
  });

  container.appendChild(popup);

  setTimeout(() => {
    try {
      container.removeChild(popup);
    } catch (err) {}
  }, 750);
}

let gameTimer = null;
let spawnTimer = null;
let secondsLeft = 30;
let score = 0;
let combo = 0;
let maxCombo = 0;
let caughtCount = 0;
let missedCount = 0;
let totalBallsSpawned = 0;
let caughtGolden = false;
let gameActive = false;
let elapsedSeconds = 0;
let currentSpawnDelay = 1500;
let spawnDifficultyLevel = 0;
let unsubscribeMovement = null;
let latestMovement = null;
let bodySwayX = 0;
let bodySwayY = 0;
let lastSensorBroadcast = 0;
let cleanupGameMode = null;

// Initialize and start the Catch the Ball game
export function initBallGame() {
  score = 0;
  combo = 0;
  maxCombo = 0;
  caughtCount = 0;
  missedCount = 0;
  totalBallsSpawned = 0;
  caughtGolden = false;
  secondsLeft = 30;
  elapsedSeconds = 0;
  spawnDifficultyLevel = 0;
  currentSpawnDelay = 1500;
  gameActive = false;
  latestMovement = null;
  bodySwayX = 0;
  bodySwayY = 0;
  lastSensorBroadcast = 0;
  
  const sceneEl = document.querySelector('a-scene');
  
  // Show rotation overlay if portrait
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

  // Subscribe to all available phone movement sensors for live body sway and admin data.
  unsubscribeMovement = vrHelper.subscribeMovement((data) => {
    latestMovement = data;
    handleLiveMovement(data);
    broadcastSensorStream();
  });

  // Countdown starts only after mobile landscape and permissions are ready (VR skipped)
  cleanupGameMode = vrHelper.requireGameMode({
    sceneEl,
    skipVR: true,
    onReady: () => {
      startCountdown(() => {
        startGameLoop();
      });
    }
  });

  // Setup Exit Button
  const exitBtn = document.getElementById('btn-exit-game');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      endGame(true); // forced exit
    });
  }

  return () => {
    if (unsubscribeMovement) {
      unsubscribeMovement();
      unsubscribeMovement = null;
    }
    if (cleanupGameMode) {
      cleanupGameMode();
      cleanupGameMode = null;
    }
    cleanupOrientation();
    cleanupBallGame();
  };
}

function handleLiveMovement(data) {
  const accel = data?.linearAccel || data?.motion || data?.accelerometer || {};
  const gyro = data?.gyroscope || {};
  const cameraRig = document.getElementById('camera-rig');
  if (!cameraRig) return;

  const rawX = (accel.x || 0) * 0.035 + (gyro.y || 0) * 0.02;
  const rawY = (accel.y || 0) * 0.012;
  
  const safeX = Number.isFinite(rawX) ? Math.max(Math.min(rawX, 0.35), -0.35) : 0;
  const safeY = Number.isFinite(rawY) ? Math.max(Math.min(rawY, 0.12), -0.12) : 0;
  
  bodySwayX = Number.isFinite(bodySwayX) ? bodySwayX * 0.85 + safeX * 0.15 : safeX;
  bodySwayY = Number.isFinite(bodySwayY) ? bodySwayY * 0.85 + safeY * 0.15 : safeY;

  const finalX = Number.isFinite(bodySwayX) ? bodySwayX : 0;
  const finalY = Number.isFinite(bodySwayY) ? 1.6 + bodySwayY : 1.6;

  cameraRig.setAttribute('position', `${finalX.toFixed(3)} ${finalY.toFixed(3)} 0`);
}

// Pre-game 5-second countdown
function startCountdown(onComplete) {
  const overlay = document.getElementById('countdown-overlay');
  const hud = document.getElementById('game-hud');
  const numberEl = document.getElementById('countdown-number');
  let count = 5;
  
  soundManager.playCountdown(false);
  
  const timer = setInterval(() => {
    count--;
    if (numberEl) numberEl.innerText = count;
    
    if (count > 0) {
      soundManager.playCountdown(false);
    } else {
      clearInterval(timer);
      soundManager.playCountdown(true);
      if (overlay) overlay.classList.add('d-none');
      if (hud) hud.classList.remove('d-none');
      onComplete();
    }
  }, 1000);
  
  // Save reference to clean up if exit is pressed early
  spawnTimer = timer;
}

// Main game starter
function startGameLoop() {
  gameActive = true;
  updateHUD();
  
  // Align containers with camera's initial look direction
  const camera = document.getElementById('main-camera');
  const targetContainer = document.getElementById('target-container');
  const cloudsContainer = document.getElementById('clouds-container');
  if (camera) {
    const rot = camera.getAttribute('rotation') || { y: 0 };
    if (targetContainer) targetContainer.setAttribute('rotation', `0 ${rot.y} 0`);
    if (cloudsContainer) cloudsContainer.setAttribute('rotation', `0 ${rot.y} 0`);
  }
  
  initClouds();
  
  // Game countdown timer
  gameTimer = setInterval(() => {
    elapsedSeconds++;
    secondsLeft--;
    updateHUD();
    
    // Every 5 seconds, increase ball spawn rate by decreasing spawn delay
    if (elapsedSeconds > 0 && elapsedSeconds % 5 === 0) {
      spawnDifficultyLevel++;
      currentSpawnDelay = Math.max(600, Math.round(currentSpawnDelay * 0.85));
    }
    
    if (secondsLeft <= 0) {
      endGame(false); // natural end
    }
  }, 1000);

  // Set spawn interval based on settings difficulty
  const difficulty = window.appState.settings.difficulty;
  let baseSpawnDelay = 1500;
  if (difficulty === 'easy') baseSpawnDelay = 2000;
  if (difficulty === 'hard') baseSpawnDelay = 1000;
  
  currentSpawnDelay = baseSpawnDelay;
  
  // Start the ball spawn cycle
  spawnBallCycle(baseSpawnDelay);
}

// Spawns targets periodically
function spawnBallCycle(baseDelay) {
  if (!gameActive) return;
  
  spawnBall();
  
  // Use the dynamically adjusted spawn delay that increases every 5 seconds
  const dynamicDelay = currentSpawnDelay;
  
  spawnTimer = setTimeout(() => {
    spawnBallCycle(baseDelay);
  }, dynamicDelay);
}

// Generate a target ball inside A-Frame scene
function spawnBall() {
  const container = document.getElementById('target-container');
  if (!container) return;
  
  const ball = document.createElement('a-sphere');
  const ballId = `ball-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Random ball type weights
  // Green (60%): +10
  // Blue (20%): +20
  // Gold (10%): +50
  // Red Obstacle (10%): -10
  const rand = Math.random();
  let type = 'green';
  let color = '#22C55E';
  let points = 10;
  let radius = 0.35;
  
  if (rand > 0.90) {
    type = 'gold';
    color = '#FBBF24';
    points = 50;
    radius = 0.25; // Smaller, harder to catch
  } else if (rand > 0.70) {
    type = 'blue';
    color = '#3B82F6';
    points = 20;
    radius = 0.3;
  } else if (rand > 0.60) {
    type = 'red';
    color = '#EF4444';
    points = -10;
    radius = 0.4; // Larger, easier to accidentally look at
  }
  
  // Set dimensions and position
  // Spawn in a 360-degree radius around the player to encourage looking around
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * 2.0 + 3.5; // 3.5 to 5.5 meters away
  const x = (Math.cos(angle) * distance).toFixed(2);
  const y = (Math.random() * 2.0 + 0.5).toFixed(2); // 0.5 to 2.5 meters high
  const z = (Math.sin(angle) * distance).toFixed(2);
  
  ball.setAttribute('id', ballId);
  ball.setAttribute('position', `${x} ${y} ${z}`);
  ball.setAttribute('radius', radius);
  ball.setAttribute('class', 'catchable');
  ball.setAttribute('material', `shader: standard; color: ${color}; emissive: ${color}; emissiveIntensity: 0.6; metalness: 0.2; roughness: 0.3`);
  
  // Outer glowing ring accent
  const ring = document.createElement('a-ring');
  ring.setAttribute('radius-inner', (radius * 1.15).toFixed(2));
  ring.setAttribute('radius-outer', (radius * 1.3).toFixed(2));
  ring.setAttribute('material', `shader: flat; color: ${color}; opacity: 0.85; transparent: true`);
  ring.setAttribute('animation__spin', 'property: rotation; to: 0 0 360; dur: 2000; loop: true; easing: linear');
  ball.appendChild(ring);

  // Curved Flight Path Animation Component (smooth 6s duration)
  ball.setAttribute('curved-flight', {
    startX: parseFloat(x),
    startY: parseFloat(y),
    startZ: parseFloat(z),
    duration: 6000
  });
  
  // Pulse animation to make it visually premium
  ball.setAttribute('animation__pulse', {
    property: 'scale',
    to: '1.15 1.15 1.15',
    dir: 'alternate',
    dur: 600,
    loop: true
  });

  // Keep track of counts (red obstacles aren't counted in accuracy targets)
  if (type !== 'red') {
    totalBallsSpawned++;
  }

  // Handle Catch Event via reticle look hover
  let isProcessed = false;
  const catchBall = (e) => {
    if (isProcessed || !gameActive) return;
    isProcessed = true;
    
    // Retrieve actual position when caught for vfx
    const currentPos = ball.getAttribute('position') || { x: 0, y: 1.6, z: 0 };
    
    // Spawn explosions and popups
    spawnExplosion(currentPos, color);
    spawnScorePopup(currentPos, points);
    
    // Clean animations and animate caught explosion shrink
    ball.removeAttribute('animation__pulse');
    ball.removeAttribute('curved-flight');
    
    ball.setAttribute('animation__scale', {
      property: 'scale',
      to: '0 0 0',
      dur: 200,
      easing: 'easeInBack'
    });
    
    setTimeout(() => {
      try {
        container.removeChild(ball);
      } catch (err) {}
    }, 200);
    
    // Point allocation & sound effects
    if (type === 'red') {
      soundManager.playMiss();
      combo = 0;
      score = Math.max(score + points, 0); // clamp at 0
    } else {
      soundManager.playCatch();
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      
      if (type === 'gold') caughtGolden = true;
      
      // Multiplier: 1x (combo < 5), 2x (combo 5-9), 3x (combo 10+)
      const mult = 1 + Math.floor(combo / 5);
      score += points * mult;
      caughtCount++;
    }
    
    updateHUD();
  };

  // Handle Miss Event
  const missBall = () => {
    if (isProcessed || !gameActive) return;
    isProcessed = true;
    
    const currentPos = ball.getAttribute('position') || { x: 0, y: 1.6, z: 0 };
    
    // Clean animations
    ball.removeAttribute('animation__pulse');
    ball.removeAttribute('curved-flight');
    
    // Animate falling physics and shrink
    ball.setAttribute('animation__move_drop', {
      property: 'position',
      to: `${currentPos.x} ${currentPos.y - 0.6} ${currentPos.z}`,
      dur: 300,
      easing: 'easeInQuad'
    });
    ball.setAttribute('animation__scale_miss', {
      property: 'scale',
      to: '0 0 0',
      dur: 300,
      easing: 'easeInBack'
    });
    
    setTimeout(() => {
      try {
        container.removeChild(ball);
      } catch (err) {}
    }, 300);

    // If missed a positive ball, break combo
    if (type !== 'red') {
      combo = 0;
      missedCount++;
      soundManager.playMiss();
      updateHUD();
    }
  };

  // Listen to fuse click (A-Frame default event)
  ball.addEventListener('click', catchBall);
  ball.addEventListener('reached-target', missBall);

  container.appendChild(ball);
}

// Update HUD Overlay text
function updateHUD() {
  const scoreEl = document.getElementById('hud-score');
  const comboEl = document.getElementById('hud-combo');
  const timeEl = document.getElementById('hud-time');
  if (scoreEl) scoreEl.innerText = `Score: ${score}`;
  if (comboEl) comboEl.innerText = `Combo: ${combo}`;
  if (timeEl) timeEl.innerText = `${secondsLeft}s`;

  // Broadcast game event data to admin channel
  try {
    adminChannel.postMessage({
      type: 'game_event',
      game: 'catch-ball',
      score: score,
      combo: combo,
      ballsCaught: caughtCount,
      ballsMissed: missedCount,
      accuracy: fitnessMath.calcAccuracy(caughtCount, totalBallsSpawned),
      timeElapsed: (window.appState.settings.gameDuration || 60) - secondsLeft
    });
  } catch (e) {}
}

function broadcastSensorStream() {
  const now = performance.now();
  if (!gameActive || now - lastSensorBroadcast < 100) return;
  lastSensorBroadcast = now;

  try {
    const motion = latestMovement || {};
    const accel = motion.linearAccel || motion.motion || motion.accelerometer || {};
    const gyro = motion.gyroscope || {};
    const orientation = motion.orientation || {};

    adminChannel.postMessage({
      type: 'sensor_stream',
      game: 'catch-ball',
      accel: {
        x: formatSensorValue(accel.x),
        y: formatSensorValue(accel.y),
        z: formatSensorValue(accel.z),
        magnitude: formatSensorValue(motion.magnitude),
        filtered: formatSensorValue(motion.movementScore),
        gyroX: formatSensorValue(gyro.x),
        gyroY: formatSensorValue(gyro.y),
        gyroZ: formatSensorValue(gyro.z),
        tilt: formatSensorValue(motion.tilt),
        alpha: formatSensorValue(orientation.alpha),
        beta: formatSensorValue(orientation.beta),
        gamma: formatSensorValue(orientation.gamma),
        source: accel.source || motion.source || 'movement'
      },
      steps: caughtCount,
      distance: caughtCount,
      calories: Math.round(caughtCount * 0.05 * 10) / 10,
      speed: motion.movementScore || 0,
      timeElapsed: elapsedSeconds
    });
  } catch (err) {}
}

function formatSensorValue(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

// Complete the game and submit statistics
function endGame(forced = false) {
  gameActive = false;
  cleanupBallGame();
  
  // Exit fullscreen orientation and release vr view
  vrHelper.exitFullscreen();
  
  if (!forced) {
    soundManager.playGameOver();
    
    // Save results to appState
    const accuracy = fitnessMath.calcAccuracy(caughtCount, totalBallsSpawned);
    window.appState.gameResults.catchBall.push({
      score,
      ballsCaught: caughtCount,
      ballsMissed: missedCount,
      accuracy,
      duration: 30 - secondsLeft,
      caughtGolden,
      maxCombo,
      difficultyLevel: spawnDifficultyLevel,
      date: new Date()
    });
    saveHistoryToLocalStorage();
    
    // Go to summary
    window.location.hash = '#summary';
  } else {
    // If exited, go back to dashboard without saving incomplete results
    window.location.hash = '#dashboard';
  }
}

// Stop all running cycles and clear screen
export function cleanupBallGame() {
  gameActive = false;

  if (unsubscribeMovement) {
    unsubscribeMovement();
    unsubscribeMovement = null;
  }

  if (cleanupGameMode) {
    cleanupGameMode();
    cleanupGameMode = null;
  }
  
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }
  
  if (spawnTimer) {
    clearTimeout(spawnTimer);
    clearInterval(spawnTimer); // clean countdown timer too
    spawnTimer = null;
  }
  
  // Clear spawned entities
  const container = document.getElementById('target-container');
  if (container) {
    container.innerHTML = '';
  }
  
  const cloudsContainer = document.getElementById('clouds-container');
  if (cloudsContainer) {
    cloudsContainer.innerHTML = '';
  }
  
  // Clean up A-Frame global styles on html and body tags
  document.documentElement.classList.remove('a-fullscreen');
  document.body.classList.remove('a-fullscreen');
}

// Spawns initial set of clouds across the sky
function initClouds() {
  const cloudsContainer = document.getElementById('clouds-container');
  if (!cloudsContainer) return;
  
  // Spawn 6 initial clouds distributed across the sky width
  for (let i = 0; i < 6; i++) {
    spawnCloud(true);
  }
}

// Generate a unique dynamic cloud drifting in the sky
function spawnCloud(isInitial = false) {
  const container = document.getElementById('clouds-container');
  if (!container || !gameActive) return;
  
  const cloud = document.createElement('a-entity');
  const cloudId = `cloud-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  cloud.setAttribute('id', cloudId);
  
  // Random altitude, depth, and speed
  const y = (Math.random() * 8 + 12).toFixed(2); // Altitude: 12m to 20m high
  const z = -(Math.random() * 30 + 15).toFixed(2); // Depth: -15m to -45m away
  
  // Left-to-right or right-to-left drift
  const driftRight = Math.random() > 0.5;
  const startX = isInitial 
    ? (Math.random() * 70 - 35).toFixed(2) // Distributed initially between -35 and 35
    : (driftRight ? -45 : 45); // Start off-screen left or right
  const endX = driftRight ? 45 : -45;
  
  cloud.setAttribute('position', `${startX} ${y} ${z}`);
  
  // Create a UNIQUE puffy cloud by grouping multiple white spheres together
  const sphereCount = Math.floor(Math.random() * 3) + 4; // 4 to 6 spheres per cloud
  const baseScale = Math.random() * 0.8 + 0.8; // Random scale size multiplier
  
  for (let i = 0; i < sphereCount; i++) {
    const sphere = document.createElement('a-sphere');
    // Randomize relative offset to make each cloud shape unique
    const offsetX = (Math.random() * 2.5 - 1.25) * baseScale;
    const offsetY = (Math.random() * 0.8 - 0.4) * baseScale;
    const offsetZ = (Math.random() * 1.5 - 0.75) * baseScale;
    const radius = (Math.random() * 1.0 + 0.8) * baseScale;
    
    sphere.setAttribute('position', `${offsetX} ${offsetY} ${offsetZ}`);
    sphere.setAttribute('radius', radius);
    sphere.setAttribute('color', '#FFFFFF');
    // Random opacity for realistic cloud density variation
    const opacity = (Math.random() * 0.15 + 0.75).toFixed(2);
    sphere.setAttribute('material', `shader: flat; opacity: ${opacity}; transparent: true`);
    cloud.appendChild(sphere);
  }
  
  // Calculate speed and movement duration
  const distance = Math.abs(endX - parseFloat(startX));
  const speed = Math.random() * 1.0 + 0.8; // Drift speed: 0.8 to 1.8 meters per second
  const duration = Math.round((distance / speed) * 1000);
  
  // Drift animation
  cloud.setAttribute('animation__drift', {
    property: 'position',
    to: `${endX} ${y} ${z}`,
    dur: duration,
    easing: 'linear'
  });
  
  container.appendChild(cloud);
  
  // Self-destruct when off-screen and spawn a new one to keep sky populated
  setTimeout(() => {
    try {
      if (cloud.parentNode) {
        cloud.parentNode.removeChild(cloud);
      }
      if (gameActive) {
        spawnCloud(false);
      }
    } catch (err) {}
  }, duration);
}

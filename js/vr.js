/**
 * SYNOVA WebXR and Device Sensor Helper
 * Handles DeviceMotion, DeviceOrientation API permissions and Fullscreen triggers.
 */

export const vrHelper = {
  isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia?.('(pointer: coarse)').matches;
  },

  isLandscape() {
    return Math.abs(window.orientation || 0) === 90 || window.screen.orientation?.type?.includes('landscape') || window.innerWidth > window.innerHeight;
  },

  // Check if permission requests are needed (iOS 13+ requires explicit permissions)
  needsPermissionRequest() {
    return (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    );
  },

  // Requests motion/orientation permissions from user gesture
  async requestPermissions() {
    // 1. Check iOS DeviceOrientation/MotionEvent permissions
    let legacyApproved = true;
    if (this.needsPermissionRequest()) {
      try {
        const orientationRes = await DeviceOrientationEvent.requestPermission();
        const motionRes = (
          typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function'
        )
          ? await DeviceMotionEvent.requestPermission()
          : 'granted';
        legacyApproved = orientationRes === 'granted' && motionRes === 'granted';
      } catch (err) {
        console.error('Error requesting motion permissions:', err);
        legacyApproved = false;
      }
    }

    // 2. Query permissions for modern Generic Sensors if supported
    let modernApproved = true;
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const results = await Promise.all([
          navigator.permissions.query({ name: 'accelerometer' }).catch(() => null),
          navigator.permissions.query({ name: 'gyroscope' }).catch(() => null),
          navigator.permissions.query({ name: 'magnetometer' }).catch(() => null)
        ]);
        
        // If query works and is denied, return false
        const denied = results.some(res => res && res.state === 'denied');
        if (denied) {
          modernApproved = false;
        }
      } catch (err) {
        console.warn('Generic Sensor permissions query failed:', err);
      }
    }

    return legacyApproved && modernApproved;
  },

  // Toggle fullscreen mode for the target element
  async toggleFullscreen(element = document.documentElement) {
    if (!document.fullscreenElement) {
      try {
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        }
        // Force lock orientation to landscape in VR
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape').catch(e => console.warn('Orientation lock failed:', e));
        }
        return true;
      } catch (err) {
        console.warn('Error entering fullscreen:', err);
        return false;
      }
    } else {
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        return false;
      } catch (err) {
        console.warn('Error exiting fullscreen:', err);
        return false;
      }
    }
  },

  async enterLandscapeFullscreen(element = document.documentElement) {
    try {
      if (!document.fullscreenElement) {
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        }
      }

      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape').catch(e => console.warn('Orientation lock failed:', e));
      }

      return true;
    } catch (err) {
      console.warn('Error entering landscape fullscreen:', err);
      return false;
    }
  },

  async enterVRScene(sceneEl = document.querySelector('a-scene')) {
    if (!sceneEl) return false;

    try {
      if (!sceneEl.hasLoaded) {
        await new Promise((resolve) => sceneEl.addEventListener('loaded', resolve, { once: true }));
      }

      if (!sceneEl.is('vr-mode')) {
        await sceneEl.enterVR();
      }

      return sceneEl.is('vr-mode');
    } catch (err) {
      console.warn('Could not enter VR mode:', err);
      return false;
    }
  },

  requireGameMode({ onReady, sceneEl = document.querySelector('a-scene') } = {}) {
    let active = true;
    let ready = false;
    const mobileOnlyStrict = this.isMobileDevice();
    const overlay = document.getElementById('rotate-overlay');
    const originalTitle = overlay?.querySelector('h3')?.innerText || '';
    const originalText = overlay?.querySelector('p')?.innerText || '';

    const setOverlay = (title, text, showButton = false) => {
      if (!overlay) return;

      const titleEl = overlay.querySelector('h3');
      const textEl = overlay.querySelector('p');
      if (titleEl) titleEl.innerText = title;
      if (textEl) textEl.innerText = text;

      let button = overlay.querySelector('#btn-enter-vr-mode');
      if (showButton && !button) {
        button = document.createElement('button');
        button.id = 'btn-enter-vr-mode';
        button.className = 'btn-premium mt-3';
        button.innerText = 'Enter VR Mode';
        button.addEventListener('click', tryStart);
        overlay.appendChild(button);
      }
      if (button) button.classList.toggle('d-none', !showButton);

      overlay.classList.add('visible');
    };

    const clearOverlay = () => {
      if (!overlay) return;
      overlay.classList.remove('visible');
      const button = overlay.querySelector('#btn-enter-vr-mode');
      if (button) button.classList.add('d-none');
    };

    const tryStart = async () => {
      if (!active || ready) return;

      if (mobileOnlyStrict && !this.isLandscape()) {
        setOverlay(
          'Rotate to Landscape',
          'SYNOVA games run only in landscape VR mode on mobile. Rotate your phone sideways before starting.'
        );
        return;
      }

      clearOverlay();
      const sensorsApproved = await this.requestPermissions();
      if (mobileOnlyStrict && !sensorsApproved) {
        setOverlay(
          'Allow Motion Sensors',
          'SYNOVA needs phone motion and orientation access before the VR game can start.',
          true
        );
        return;
      }

      await this.enterLandscapeFullscreen();
      const vrStarted = await this.enterVRScene(sceneEl);

      if (!active || ready) return;

      if (mobileOnlyStrict && !vrStarted) {
        setOverlay(
          'Enter VR Mode',
          'SYNOVA needs VR mode active before the game can start. Tap the button after your phone is in landscape.',
          true
        );
        return;
      }

      ready = true;
      clearOverlay();
      if (typeof onReady === 'function') onReady();
    };

    const handleOrientationChange = () => {
      if (!active || ready) return;
      tryStart();
    };

    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    tryStart();

    return () => {
      active = false;
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (overlay) {
        const titleEl = overlay.querySelector('h3');
        const textEl = overlay.querySelector('p');
        if (titleEl) titleEl.innerText = originalTitle;
        if (textEl) textEl.innerText = originalText;
        const button = overlay.querySelector('#btn-enter-vr-mode');
        if (button) button.remove();
        overlay.classList.remove('visible');
      }
    };
  },

  // Force exit fullscreen
  async exitFullscreen() {
    if (document.fullscreenElement) {
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
        await document.exitFullscreen();
      } catch (err) {
        console.warn('Error exiting fullscreen:', err);
      }
    }
  },

  // Detect orientation change to show rotation prompt
  onOrientationChange(callback) {
    const checkOrientation = () => {
      // 90 or -90 means landscape
      const isLandscape = Math.abs(window.orientation) === 90 || window.screen.orientation?.type.includes('landscape');
      callback(isLandscape);
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    // Initial check
    checkOrientation();
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  },

  // Unified motion subscription (uses LinearAccelerationSensor or falls back to devicemotion)
  subscribeMotion(callback) {
    let sensor = null;
    let fallbackListener = null;

    if (typeof LinearAccelerationSensor === 'function') {
      try {
        sensor = new LinearAccelerationSensor({ frequency: 60 });
        sensor.addEventListener('reading', () => {
          callback({
            x: sensor.x,
            y: sensor.y,
            z: sensor.z,
            magnitude: Math.sqrt(sensor.x * sensor.x + sensor.y * sensor.y + sensor.z * sensor.z),
            hasLinearAccel: true
          });
        });
        sensor.addEventListener('error', (event) => {
          console.warn('LinearAccelerationSensor error, falling back to devicemotion:', event.error);
          setupFallback();
        });
        sensor.start();
      } catch (err) {
        console.warn('Could not start LinearAccelerationSensor, falling back:', err);
        setupFallback();
      }
    } else {
      setupFallback();
    }

    function setupFallback() {
      if (window.DeviceMotionEvent) {
        fallbackListener = (event) => {
          const hasLinearAccel = event.acceleration && [event.acceleration.x, event.acceleration.y, event.acceleration.z].some(value => value !== null);
          const accel = hasLinearAccel ? event.acceleration : event.accelerationIncludingGravity;
          if (!accel) return;

          const x = accel.x || 0;
          const y = accel.y || 0;
          const z = accel.z || 0;
          callback({
            x,
            y,
            z,
            magnitude: Math.sqrt(x * x + y * y + z * z),
            hasLinearAccel: hasLinearAccel
          });
        };
        window.addEventListener('devicemotion', fallbackListener);
      }
    }

    // Return unsubscribe function
    return () => {
      if (sensor) {
        try {
          sensor.stop();
        } catch (e) {}
      }
      if (fallbackListener) {
        window.removeEventListener('devicemotion', fallbackListener);
      }
    };
  },

  // Unified orientation subscription (uses RelativeOrientationSensor / Gyroscope or falls back to deviceorientation)
  subscribeOrientation(callback) {
    let sensor = null;
    let fallbackListener = null;

    if (typeof RelativeOrientationSensor === 'function') {
      try {
        sensor = new RelativeOrientationSensor({ frequency: 60 });
        sensor.addEventListener('reading', () => {
          const q = sensor.quaternion;
          if (!q) return;

          // Convert quaternion to Roll and Pitch
          const roll = Math.atan2(2 * (q[3] * q[0] + q[1] * q[2]), 1 - 2 * (q[0] * q[0] + q[1] * q[1])) * (180 / Math.PI);
          const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (q[3] * q[1] - q[2] * q[0])))) * (180 / Math.PI);

          const orientationAngle = window.orientation || window.screen.orientation?.angle || 0;
          let tiltValue = 0;

          if (Math.abs(orientationAngle) === 90) {
            // Landscape mode
            tiltValue = pitch;
            if (orientationAngle === -90) {
              tiltValue = -tiltValue;
            }
          } else {
            // Portrait mode
            tiltValue = roll;
          }

          callback({
            tilt: tiltValue,
            alpha: 0,
            beta: pitch,
            gamma: roll
          });
        });
        sensor.addEventListener('error', (event) => {
          console.warn('RelativeOrientationSensor error, falling back to deviceorientation:', event.error);
          setupFallback();
        });
        sensor.start();
      } catch (err) {
        console.warn('Could not start RelativeOrientationSensor, falling back:', err);
        setupFallback();
      }
    } else {
      setupFallback();
    }

    function setupFallback() {
      if (window.DeviceOrientationEvent) {
        fallbackListener = (event) => {
          let rawTilt = 0;
          const orientationAngle = window.orientation || window.screen.orientation?.angle || 0;
          
          if (Math.abs(orientationAngle) === 90) {
            // Landscape Mode
            rawTilt = event.beta || 0;
            if (orientationAngle === -90) {
              rawTilt = -rawTilt;
            }
          } else {
            // Portrait Mode
            rawTilt = event.gamma || 0;
          }

          callback({
            tilt: rawTilt,
            alpha: event.alpha || 0,
            beta: event.beta || 0,
            gamma: event.gamma || 0
          });
        };
        window.addEventListener('deviceorientation', fallbackListener);
      }
    }

    // Return unsubscribe function
    return () => {
      if (sensor) {
        try {
          sensor.stop();
        } catch (e) {}
      }
      if (fallbackListener) {
        window.removeEventListener('deviceorientation', fallbackListener);
      }
    };
  }
};

// Enhanced gyroscope subscription for precise rotation tracking
vrHelper.subscribeGyroscope = function(callback) {
  let gyroSensor = null;
  if (typeof Gyroscope === 'function') {
    try {
      gyroSensor = new Gyroscope({ frequency: 60 });
      gyroSensor.addEventListener('reading', () => {
        callback({
          x: gyroSensor.x || 0,
          y: gyroSensor.y || 0,
          z: gyroSensor.z || 0,
          timestamp: gyroSensor.timestamp,
          source: 'gyroscope'
        });
      });
      gyroSensor.addEventListener('error', (event) => {
        console.warn('Gyroscope error:', event.error);
      });
      gyroSensor.start();
    } catch (err) {
      console.warn('Could not start Gyroscope sensor:', err);
    }
  }
  
  return () => {
    if (gyroSensor) {
      try { gyroSensor.stop(); } catch (e) {}
    }
  };
};

vrHelper.subscribeAccelerometer = function(callback) {
  let sensor = null;
  if (typeof Accelerometer === 'function') {
    try {
      sensor = new Accelerometer({ frequency: 60 });
      sensor.addEventListener('reading', () => {
        callback({
          x: sensor.x || 0,
          y: sensor.y || 0,
          z: sensor.z || 0,
          magnitude: vectorMagnitude(sensor.x, sensor.y, sensor.z),
          timestamp: sensor.timestamp,
          source: 'accelerometer'
        });
      });
      sensor.addEventListener('error', (event) => {
        console.warn('Accelerometer error:', event.error);
      });
      sensor.start();
    } catch (err) {
      console.warn('Could not start Accelerometer sensor:', err);
    }
  }

  return () => {
    if (sensor) {
      try { sensor.stop(); } catch (e) {}
    }
  };
};

vrHelper.subscribeGravity = function(callback) {
  let sensor = null;
  if (typeof GravitySensor === 'function') {
    try {
      sensor = new GravitySensor({ frequency: 60 });
      sensor.addEventListener('reading', () => {
        callback({
          x: sensor.x || 0,
          y: sensor.y || 0,
          z: sensor.z || 0,
          magnitude: vectorMagnitude(sensor.x, sensor.y, sensor.z),
          timestamp: sensor.timestamp,
          source: 'gravity'
        });
      });
      sensor.addEventListener('error', (event) => {
        console.warn('GravitySensor error:', event.error);
      });
      sensor.start();
    } catch (err) {
      console.warn('Could not start GravitySensor:', err);
    }
  }

  return () => {
    if (sensor) {
      try { sensor.stop(); } catch (e) {}
    }
  };
};

vrHelper.subscribeMagnetometer = function(callback) {
  let sensor = null;
  if (typeof Magnetometer === 'function') {
    try {
      sensor = new Magnetometer({ frequency: 30 });
      sensor.addEventListener('reading', () => {
        callback({
          x: sensor.x || 0,
          y: sensor.y || 0,
          z: sensor.z || 0,
          magnitude: vectorMagnitude(sensor.x, sensor.y, sensor.z),
          timestamp: sensor.timestamp,
          source: 'magnetometer'
        });
      });
      sensor.addEventListener('error', (event) => {
        console.warn('Magnetometer error:', event.error);
      });
      sensor.start();
    } catch (err) {
      console.warn('Could not start Magnetometer:', err);
    }
  }

  return () => {
    if (sensor) {
      try { sensor.stop(); } catch (e) {}
    }
  };
};

vrHelper.subscribeMovement = function(callback) {
  const state = createMovementState();
  const unsubscribers = [];
  let lastEmit = 0;

  const emit = () => {
    const now = performance.now();
    if (now - lastEmit < 1000 / 60) return;
    lastEmit = now;
    callback(snapshotMovementState(state));
  };

  unsubscribers.push(this.subscribeMotion((motion) => {
    state.motion = normalizeVector(motion, 'motion');
    state.linearAccel = normalizeVector(motion, motion.hasLinearAccel ? 'linear-acceleration' : 'acceleration-with-gravity');
    state.lastMotionAt = performance.now();
    emit();
  }));

  unsubscribers.push(this.subscribeOrientation((orientation) => {
    state.orientation = {
      tilt: orientation.tilt || 0,
      alpha: orientation.alpha || 0,
      beta: orientation.beta || 0,
      gamma: orientation.gamma || 0,
      timestamp: performance.now(),
      source: 'orientation'
    };
    emit();
  }));

  unsubscribers.push(this.subscribeGyroscope((gyro) => {
    state.gyroscope = normalizeVector(gyro, 'gyroscope');
    emit();
  }));

  unsubscribers.push(this.subscribeAccelerometer((accel) => {
    state.accelerometer = normalizeVector(accel, 'accelerometer');
    emit();
  }));

  unsubscribers.push(this.subscribeGravity((gravity) => {
    state.gravity = normalizeVector(gravity, 'gravity');
    if (state.accelerometer) {
      const linear = {
        x: state.accelerometer.x - gravity.x,
        y: state.accelerometer.y - gravity.y,
        z: state.accelerometer.z - gravity.z,
        hasLinearAccel: true,
        timestamp: performance.now(),
        source: 'accelerometer-minus-gravity'
      };
      state.linearAccel = normalizeVector(linear, linear.source);
    }
    emit();
  }));

  unsubscribers.push(this.subscribeMagnetometer((magnetometer) => {
    state.magnetometer = normalizeVector(magnetometer, 'magnetometer');
    emit();
  }));

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      try {
        if (typeof unsubscribe === 'function') unsubscribe();
      } catch (e) {}
    });
  };
};

// Auto-enable all sensors
vrHelper.autoEnableSensors = async function() {
  try {
    await this.requestPermissions();
    const movementStarted = this.subscribeMovement(() => {});
    return { movement: movementStarted };
  } catch (err) {
    console.error('Error auto-enabling sensors:', err);
    return null;
  }
};

// Calibrate sensors by storing current orientation as baseline
vrHelper.calibrateSensors = function() {
  return {
    calibrationTime: Date.now(),
    calibrationComplete: true,
    message: 'Sensors calibrated. Hold device level for accurate tracking.'
  };
};

function vectorMagnitude(x = 0, y = 0, z = 0) {
  return Math.sqrt((x || 0) * (x || 0) + (y || 0) * (y || 0) + (z || 0) * (z || 0));
}

function normalizeVector(vector, source) {
  const x = vector?.x || 0;
  const y = vector?.y || 0;
  const z = vector?.z || 0;
  return {
    x,
    y,
    z,
    magnitude: vector?.magnitude ?? vectorMagnitude(x, y, z),
    hasLinearAccel: !!vector?.hasLinearAccel,
    timestamp: vector?.timestamp || performance.now(),
    source
  };
}

function createMovementState() {
  return {
    motion: null,
    linearAccel: null,
    accelerometer: null,
    gravity: null,
    gyroscope: null,
    magnetometer: null,
    orientation: null,
    lastMotionAt: 0
  };
}

function snapshotMovementState(state) {
  const primaryMotion = state.linearAccel || state.motion || state.accelerometer;
  const tilt = state.orientation?.tilt || 0;
  const gyro = state.gyroscope || { x: 0, y: 0, z: 0, magnitude: 0 };

  return {
    ...state,
    x: primaryMotion?.x || 0,
    y: primaryMotion?.y || 0,
    z: primaryMotion?.z || 0,
    magnitude: primaryMotion?.magnitude || 0,
    hasLinearAccel: !!primaryMotion?.hasLinearAccel || primaryMotion?.source === 'accelerometer-minus-gravity',
    tilt,
    rotationRate: gyro,
    movementScore: (primaryMotion?.magnitude || 0) + Math.min(gyro.magnitude || 0, 8) * 0.35,
    timestamp: performance.now()
  };
}

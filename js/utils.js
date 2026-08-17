/**
 * SYNOVA Utilities
 * - Real-time Web Audio API Synthesizer (BGM & sound effects)
 * - Fitness & Score Formulas
 * - Canvas Confetti Particle System
 */

// Sound Manager implementing Web Audio synth
class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmOscs = [];
    this.bgmGain = null;
    this.bgmInterval = null;
    this.bgmSequenceIndex = 0;
    this.isMuted = false;
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    
    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.5, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Setup BGM Gain
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.08, this.ctx.currentTime); // Soft BGM
    this.bgmGain.connect(this.masterGain);
  }

  setMute(mute) {
    this.isMuted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(mute ? 0 : 0.5, this.ctx.currentTime);
    }
  }

  resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play a simple synthesized chirp for catching a ball
  playCatch() {
    this.init();
    this.resumeContext();
    if (this.isMuted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.12);
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.16);
  }

  // Play a descending buzz for missed ball / obstacle hit
  playMiss() {
    this.init();
    this.resumeContext();
    if (this.isMuted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.25);
    
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.26);
  }

  // Step thump for running
  playStep() {
    this.init();
    this.resumeContext();
    if (this.isMuted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + 0.08);
    
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.11);
  }

  // Success fanfare
  playSuccess() {
    this.init();
    this.resumeContext();
    if (this.isMuted || !this.ctx) return;

    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    const now = this.ctx.currentTime;
    
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.08);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.25, now + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.08 + 0.3);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      osc.start(now + index * 0.08);
      osc.stop(now + index * 0.08 + 0.35);
    });
  }

  // Game countdown beeps
  playCountdown(isStart = false) {
    this.init();
    this.resumeContext();
    if (this.isMuted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    if (isStart) {
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    } else {
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    }
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  // Game over sound
  playGameOver() {
    this.init();
    this.resumeContext();
    if (this.isMuted || !this.ctx) return;

    const notes = [392.00, 349.23, 311.13, 293.66]; // G4, F4, Eb4, D4
    const now = this.ctx.currentTime;
    
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + index * 0.15);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.18, now + index * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.15 + 0.25);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      osc.start(now + index * 0.15);
      osc.stop(now + index * 0.15 + 0.3);
    });
  }

  // Swelling falling pitch sweep for tightrope walk fall
  playFall() {
    this.init();
    this.resumeContext();
    if (this.isMuted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 1.2);
    
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 1.25);
  }

  // Double beep for fouls
  playFoul() {
    this.init();
    this.resumeContext();
    if (this.isMuted || !this.ctx) return;

    const now = this.ctx.currentTime;
    [0, 0.15].forEach((delay) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now + delay);
      gain.gain.setValueAtTime(0.2, now + delay);
      gain.gain.linearRampToValueAtTime(0.01, now + delay + 0.1);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + delay);
      osc.stop(now + delay + 0.12);
    });
  }

  // Start real-time synthesized ambient looping track
  startBGM() {
    this.init();
    this.resumeContext();
    this.stopBGM();
    if (this.isMuted || !this.ctx) return;

    // Chord Progression: Cmaj7 (C E G B), Am7 (A C E G), Fmaj7 (F A C E), G7 (G B D F)
    const progressions = [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00], // Am7
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [196.00, 246.94, 293.66, 349.23]  // G7
    ];
    
    const playChord = () => {
      const notes = progressions[this.bgmSequenceIndex];
      this.bgmSequenceIndex = (this.bgmSequenceIndex + 1) % progressions.length;
      
      const now = this.ctx.currentTime;
      
      // Spawn slow warm swelling oscillators for notes in the chord
      notes.forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        
        // Lowpass sweep
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(100, now);
        filter.frequency.exponentialRampToValueAtTime(800, now + 1.5);
        filter.frequency.exponentialRampToValueAtTime(100, now + 3.8);
        
        // Swell envelope
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 3.9);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);
        
        osc.start(now);
        osc.stop(now + 4.0);
        
        this.bgmOscs.push({ osc, gain });
      });
    };
    
    playChord();
    this.bgmInterval = setInterval(playChord, 4000);
  }

  stopBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    
    this.bgmOscs.forEach(({ osc, gain }) => {
      try {
        osc.stop();
      } catch (e) {}
    });
    this.bgmOscs = [];
  }
}

export const soundManager = new SoundManager();

// Fitness calculations
export const fitnessMath = {
  // Steps to calories: Steps * 0.04
  calcCalories(steps) {
    return Math.round(steps * 0.04 * 10) / 10;
  },
  
  // Steps to distance: Steps * 0.75 meters
  calcDistance(steps) {
    return Math.round(steps * 0.75 * 10) / 10; // returns meters
  },
  
  // Accuracy percentage
  calcAccuracy(caught, total) {
    if (total === 0) return 0;
    return Math.round((caught / total) * 100);
  },
  
  // Performance ranking
  getPerformanceRating(score) {
    if (score <= 25) return { text: 'Beginner', class: 'badge-danger' };
    if (score <= 50) return { text: 'Average', class: 'text-warning' };
    if (score <= 75) return { text: 'Good', class: 'badge-accent' };
    return { text: 'Excellent', class: 'badge-accent' };
  },
  
  // Calculate running MET / speed-based calories
  calcRunningCalories(weightKg, durationSec) {
    // MET for moderate running ~ 8
    // Calories/min = MET * 3.5 * weightKg / 200
    const durationMin = durationSec / 60;
    const calories = 8 * 3.5 * (weightKg || 70) / 200 * durationMin;
    return Math.round(calories * 10) / 10;
  }
};

// Canvas-based particles / Confetti
export class ConfettiEffect {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.particles = [];
    this.active = false;
    this.colors = ['#2563EB', '#3B82F6', '#06B6D4', '#22C55E', '#FBBF24', '#EF4444'];
    
    // Resize handler
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }
  
  resize() {
    if (this.canvas) {
      this.canvas.width = this.canvas.parentElement.clientWidth;
      this.canvas.height = this.canvas.parentElement.clientHeight || window.innerHeight;
    }
  }
  
  start() {
    this.active = true;
    this.particles = [];
    for (let i = 0; i < 100; i++) {
      this.particles.push(this.createParticle());
    }
    this.animate();
  }
  
  stop() {
    this.active = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    window.removeEventListener('resize', this.resize);
  }
  
  createParticle() {
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height - this.canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * this.canvas.height,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0
    };
  }
  
  animate() {
    if (!this.active) return;
    requestAnimationFrame(() => this.animate());
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    let complete = true;
    this.particles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle);
      p.tilt = Math.sin(p.tiltAngle - p.r/2) * 5;
      
      this.ctx.beginPath();
      this.ctx.lineWidth = p.r;
      this.ctx.strokeStyle = p.color;
      this.ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      this.ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      this.ctx.stroke();
      
      if (p.y <= this.canvas.height) {
        complete = false;
      }
    });
    
    if (complete) {
      this.active = false;
    }
  }
}

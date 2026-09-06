import { EVENTS } from '../config/constants.js';

/**
 * Zero-dependency procedural sound synthesizer powered by the Web Audio API.
 * Eliminates external audio file dependencies and broken third-party links.
 */
export class AudioEngine {
  /**
   * @param {import('../core/EventBus.js').EventBus} eventBus
   * @param {import('../core/StorageService.js').StorageService} storage
   */
  constructor(eventBus, storage) {
    this.eventBus = eventBus;
    this.storage = storage;
    this.muted = storage.getSettings().muted;
    /** @type {AudioContext|null} */
    this._ctx = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.eventBus.on(EVENTS.ARROW_FIRED, () => this.playShoot());
    this.eventBus.on(EVENTS.TARGET_HIT, ({ isBullseye, comboMultiplier }) => {
      this.playHit();
      if (isBullseye) {
        this.playBullseye(comboMultiplier);
      }
    });
    this.eventBus.on(EVENTS.TARGET_MISSED, () => this.playMiss());
    this.eventBus.on(EVENTS.GAME_OVER, ({ isNewBest }) => {
      if (isNewBest) {
        this.playHighScore();
      } else {
        this.playGameOver();
      }
    });
  }

  /**
   * Lazily create and unlock the AudioContext on first user gesture.
   */
  unlock() {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this._ctx) {
      this._ctx = new AudioCtx();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  /**
   * Toggle mute state and persist preference.
   * @returns {boolean} New muted state
   */
  toggleMute() {
    this.muted = !this.muted;
    this.storage.saveSettings({ muted: this.muted });
    this.eventBus.emit(EVENTS.SOUND_TOGGLED, { muted: this.muted });
    return this.muted;
  }

  _ready() {
    if (this.muted) return false;
    this.unlock();
    return this._ctx !== null && this._ctx.state === 'running';
  }

  /**
   * Synthesize bowstring twang + arrow whoosh.
   */
  playShoot() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // String twang (triangle wave pitch drop)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(88, now + 0.14);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);

    // Filtered noise whoosh
    this._playNoiseBurst(0.11, 1800, 0.08);
  }

  /**
   * Synthesize crisp wooden target impact thud.
   */
  playHit() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /**
   * Synthesize harmonic bell chime for bullseye hits.
   * @param {number} comboMultiplier
   */
  playBullseye(comboMultiplier = 1) {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const pitchBoost = 1 + (comboMultiplier - 1) * 0.12;
    const notes = [587.33, 880, 1174.66]; // D5, A5, D6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq * pitchBoost, start);
      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  /**
   * Synthesize subtle downward swoosh on miss.
   */
  playMiss() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.18);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  /**
   * Synthesize uplifting arpeggio on new high score.
   */
  playHighScore() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.16, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.46);
    });
  }

  /**
   * Synthesize soft round-over cadence.
   */
  playGameOver() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const notes = [392, 329.63, 261.63]; // G4 E4 C4

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.11;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.13, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.34);
    });
  }

  _playNoiseBurst(duration, filterFreq, volume) {
    const ctx = this._ctx;
    const sampleCount = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }
}

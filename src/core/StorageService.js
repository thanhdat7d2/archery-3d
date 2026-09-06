import { STORAGE_KEYS } from '../config/constants.js';

/**
 * Persistence wrapper over localStorage with safe fallback for non-browser
 * environments (e.g., Node.js test runner) and restricted storage contexts.
 */
export class StorageService {
  /**
   * @param {Storage|null} [storage]
   */
  constructor(storage = null) {
    this._memory = new Map();
    this._storage = storage ?? this._detectLocalStorage();
  }

  _detectLocalStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const probe = '__archery_probe__';
        window.localStorage.setItem(probe, '1');
        window.localStorage.removeItem(probe);
        return window.localStorage;
      }
    } catch {
      // Fallback to in-memory map
    }
    return null;
  }

  _readJSON(key, fallback) {
    try {
      const raw = this._storage ? this._storage.getItem(key) : this._memory.get(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  _writeJSON(key, value) {
    try {
      const serialized = JSON.stringify(value);
      if (this._storage) {
        this._storage.setItem(key, serialized);
      } else {
        this._memory.set(key, serialized);
      }
    } catch {
      // Ignore quota or serialization errors gracefully
    }
  }

  /**
   * Retrieve the best score for a given game mode.
   * @param {string} modeId
   * @returns {number}
   */
  getHighScore(modeId) {
    const scores = this._readJSON(STORAGE_KEYS.HIGH_SCORES, {});
    return Number(scores[modeId]) || 0;
  }

  /**
   * Retrieve all mode high scores.
   * @returns {Record<string, number>}
   */
  getAllHighScores() {
    return this._readJSON(STORAGE_KEYS.HIGH_SCORES, {});
  }

  /**
   * Save score if it beats the existing best for the mode.
   * @param {string} modeId
   * @param {number} score
   * @returns {boolean} True if a new high score was set
   */
  saveHighScore(modeId, score) {
    const scores = this._readJSON(STORAGE_KEYS.HIGH_SCORES, {});
    const currentBest = Number(scores[modeId]) || 0;
    if (score > currentBest) {
      scores[modeId] = score;
      this._writeJSON(STORAGE_KEYS.HIGH_SCORES, scores);
      return true;
    }
    return false;
  }

  /**
   * Load persisted user settings.
   * @returns {{ muted: boolean, selectedMode: string, selectedWorld: string, selectedTargetType: string }}
   */
  getSettings() {
    const defaults = {
      muted: false,
      selectedMode: 'championship',
      selectedWorld: 'alpine',
      selectedTargetType: 'mixed',
    };
    return { ...defaults, ...this._readJSON(STORAGE_KEYS.SETTINGS, {}) };
  }

  /**
   * Persist partial user settings.
   * @param {Partial<{ muted: boolean, selectedMode: string, selectedWorld: string, selectedTargetType: string }>} patch
   */
  saveSettings(patch) {
    const current = this.getSettings();
    this._writeJSON(STORAGE_KEYS.SETTINGS, { ...current, ...patch });
  }
}

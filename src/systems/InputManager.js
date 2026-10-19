import { GAME_STATES } from '../config/constants.js';

/**
 * Unified 3D pointer (mouse/touch) and keyboard input controller.
 * - Pointer move steers 3D aim yaw & pitch across the range
 * - Hold pointer / Space to draw bowstring, release to fire
 * - WASD / Arrow keys walk within the archer's shooting box
 * - P / Escape toggles pause; M toggles audio mute
 */
export class InputManager {
  /**
   * @param {object} deps
   * @param {HTMLCanvasElement} deps.canvas
   * @param {import('../core/GameEngine.js').GameEngine} deps.engine
   * @param {import('./AudioEngine.js').AudioEngine} deps.audio
   */
  constructor({ canvas, engine, audio }) {
    this.canvas = canvas;
    this.engine = engine;
    this.audio = audio;

    /** @type {Set<string>} */
    this._pressedKeys = new Set();
    this._activePointerId = null;

    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onBlur = this._handleBlur.bind(this);
  }

  attach() {
    window.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  detach() {
    window.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  _updateAimFromPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const normX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    this.engine.setAimNormalized(normX, normY);
  }

  _syncMoveAxes() {
    const forward =
      (this._pressedKeys.has('w') || this._pressedKeys.has('arrowup') ? 1 : 0) -
      (this._pressedKeys.has('s') || this._pressedKeys.has('arrowdown') ? 1 : 0);
    const right =
      (this._pressedKeys.has('d') || this._pressedKeys.has('arrowright') ? 1 : 0) -
      (this._pressedKeys.has('a') || this._pressedKeys.has('arrowleft') ? 1 : 0);
    this.engine.setMoveInput(forward, right);
  }

  _handlePointerMove(event) {
    if (this.engine.state !== GAME_STATES.PLAYING) return;
    this._updateAimFromPointer(event);
  }

  _handlePointerDown(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    this.audio.unlock();
    if (this.engine.state !== GAME_STATES.PLAYING) return;
    this._activePointerId = event.pointerId ?? null;
    if (this._activePointerId !== null) {
      try {
        this.canvas.setPointerCapture?.(this._activePointerId);
      } catch {
        // Ignore if pointer capture is unsupported or pointer is inactive
      }
    }
    this._updateAimFromPointer(event);
    this.engine.beginDraw();
  }

  _handlePointerUp(event) {
    if (
      this._activePointerId !== null &&
      event?.pointerId !== undefined &&
      event.pointerId !== this._activePointerId
    ) {
      return;
    }
    if (this._activePointerId !== null) {
      try {
        if (this.canvas.hasPointerCapture?.(this._activePointerId)) {
          this.canvas.releasePointerCapture(this._activePointerId);
        }
      } catch {
        // Ignore release errors
      }
      this._activePointerId = null;
    }
    if (this.engine.isDrawing) {
      this.engine.releaseDraw();
    }
  }

  _handleKeyDown(event) {
    const key = event.key.toLowerCase();

    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      if (this.engine.state === GAME_STATES.PLAYING) {
        event.preventDefault();
        this._pressedKeys.add(key);
        this._syncMoveAxes();
      }
      return;
    }

    if (event.repeat) return;

    if (key === 'm') {
      this.audio.toggleMute();
      return;
    }

    if (key === 'p' || key === 'escape') {
      if (this.engine.state === GAME_STATES.PLAYING || this.engine.state === GAME_STATES.PAUSED) {
        event.preventDefault();
        this._pressedKeys.clear();
        this._syncMoveAxes();
        this.engine.togglePause();
      }
      return;
    }

    if (key === ' ') {
      this.audio.unlock();
      if (this.engine.state === GAME_STATES.PLAYING) {
        event.preventDefault();
        this.engine.beginDraw();
      } else if (this.engine.state === GAME_STATES.PAUSED) {
        event.preventDefault();
        this.engine.togglePause();
      }
    }
  }

  _handleKeyUp(event) {
    const key = event.key.toLowerCase();
    if (this._pressedKeys.delete(key)) {
      this._syncMoveAxes();
    }
    if (key === ' ' && this.engine.isDrawing) {
      event.preventDefault();
      this.engine.releaseDraw();
    }
  }

  _handleBlur() {
    this._pressedKeys.clear();
    this._activePointerId = null;
    this._syncMoveAxes();
    if (this.engine.state === GAME_STATES.PLAYING) {
      this.engine.togglePause();
    }
  }
}

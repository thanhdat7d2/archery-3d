import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_STATES } from '../src/config/constants.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameEngine } from '../src/core/GameEngine.js';
import { StorageService } from '../src/core/StorageService.js';
import { InputManager } from '../src/systems/InputManager.js';

function createTargetMock() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(type, event = {}) {
      for (const fn of listeners.get(type) ?? []) {
        fn(event);
      }
    },
  };
}

function createInputHarness() {
  const prevWindow = globalThis.window;
  const mockWindow = createTargetMock();
  globalThis.window = mockWindow;

  const captured = new Set();
  const canvas = Object.assign(createTargetMock(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }),
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
  });

  const eventBus = new EventBus();
  const storage = new StorageService();
  const engine = new GameEngine({ eventBus, storage, rng: () => 0.5 });
  let unlocked = 0;
  let muted = false;
  const audio = {
    unlock: () => {
      unlocked += 1;
    },
    toggleMute: () => {
      muted = !muted;
    },
  };

  const input = new InputManager({ canvas, engine, audio });
  input.attach();

  return {
    mockWindow,
    canvas,
    captured,
    engine,
    input,
    getUnlocked: () => unlocked,
    isMuted: () => muted,
    cleanup: () => {
      input.detach();
      globalThis.window = prevWindow;
    },
  };
}

describe('InputManager', () => {
  it('captures pointer on draw and ignores unrelated pointerup events', () => {
    const h = createInputHarness();
    try {
      h.engine.startGame('championship');
      h.canvas.emit('pointerdown', {
        button: 0,
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 500,
        clientY: 250,
      });

      assert.equal(h.engine.isDrawing, true);
      assert.equal(h.captured.has(1), true);
      assert.equal(h.getUnlocked(), 1);

      // Unrelated pointerId should not release the active bow draw
      h.mockWindow.emit('pointerup', { pointerId: 2 });
      assert.equal(h.engine.isDrawing, true);

      h.mockWindow.emit('pointerup', { pointerId: 1 });
      assert.equal(h.engine.isDrawing, false);
      assert.equal(h.captured.has(1), false);
    } finally {
      h.cleanup();
    }
  });

  it('handles WASD movement, mute, pause, and blur cleanup', () => {
    const h = createInputHarness();
    try {
      h.engine.startGame('championship');

      h.mockWindow.emit('keydown', { key: 'W', repeat: false, preventDefault() {} });
      h.mockWindow.emit('keydown', { key: 'D', repeat: false, preventDefault() {} });
      assert.deepEqual(h.engine.moveInput, { forward: 1, right: 1 });

      h.mockWindow.emit('keydown', { key: 'm', repeat: false, preventDefault() {} });
      assert.equal(h.isMuted(), true);

      h.mockWindow.emit('blur');
      assert.deepEqual(h.engine.moveInput, { forward: 0, right: 0 });
      assert.equal(h.engine.state, GAME_STATES.PAUSED);
    } finally {
      h.cleanup();
    }
  });
});

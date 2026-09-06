/**
 * Lightweight synchronous Publish/Subscribe EventBus.
 * Decouples core simulation logic from UI, audio, and rendering layers.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} handler
   * @returns {() => void} Unsubscribe function
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe a specific handler from an event.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const set = this._listeners.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this._listeners.delete(event);
    }
  }

  /**
   * Emit an event with an optional payload.
   * @param {string} event
   * @param {*} [payload]
   */
  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      handler(payload);
    }
  }

  /**
   * Remove all listeners.
   */
  clear() {
    this._listeners.clear();
  }
}

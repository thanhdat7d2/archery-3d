import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';

describe('EventBus', () => {
  it('delivers emitted payloads to subscribed listeners', () => {
    const bus = new EventBus();
    const received = [];

    bus.on('score', (payload) => received.push(payload));
    bus.emit('score', { points: 10 });
    bus.emit('score', { points: 25 });

    assert.deepEqual(received, [{ points: 10 }, { points: 25 }]);
  });

  it('supports unsubscribing via returned disposer and off()', () => {
    const bus = new EventBus();
    let count = 0;

    const unsubscribe = bus.on('ping', () => {
      count += 1;
    });
    bus.emit('ping');
    assert.equal(count, 1);

    unsubscribe();
    bus.emit('ping');
    assert.equal(count, 1);
  });

  it('clears all listeners with clear()', () => {
    const bus = new EventBus();
    let called = false;
    bus.on('eventA', () => {
      called = true;
    });

    bus.clear();
    bus.emit('eventA');
    assert.equal(called, false);
  });
});

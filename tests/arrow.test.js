import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Arrow, ARROW_STATES } from '../src/entities/Arrow.js';

describe('Arrow (3D Ballistics)', () => {
  it('applies gravity drop and crosswind drift over flight', () => {
    const arrow = new Arrow({
      id: 1,
      position: { x: 0, y: 2.0, z: 0 },
      velocity: { x: 0, y: 0, z: -50 },
    });

    arrow.update(0.1, { x: 4.0, y: 0 });

    assert.ok(arrow.z < -4.9, 'expected arrow to travel downrange along -Z');
    assert.ok(arrow.y < 2.0, 'expected gravity to pull arrow downward');
    assert.ok(arrow.x > 0, 'expected positive crosswind to push arrow toward +X');
    assert.equal(arrow.state, ARROW_STATES.FLYING);
  });

  it('computes exact Z-plane intersection to prevent high-speed tunneling', () => {
    const arrow = new Arrow({
      id: 2,
      position: { x: 0, y: 2.0, z: -24.0 },
      velocity: { x: 2.0, y: 0, z: -40.0 },
    });

    // Step 0.05s -> z moves from -24 to -26, crossing target plane z = -25 halfway
    arrow.update(0.05, { x: 0, y: 0 });
    const hit = arrow.intersectZPlane(-25.0);

    assert.equal(hit.crossed, true);
    assert.equal(hit.z, -25.0);
    assert.ok(Math.abs(hit.x - 0.05) < 0.01);
  });

  it('transitions to GROUNDED when hitting the meadow floor', () => {
    const arrow = new Arrow({
      id: 3,
      position: { x: 0, y: 0.2, z: -10 },
      velocity: { x: 0, y: -5, z: -20 },
    });

    arrow.update(0.1, { x: 0, y: 0 });
    assert.equal(arrow.state, ARROW_STATES.GROUNDED);
    assert.equal(arrow.y, 0.08);
  });

  it('embeds into target and tracks lateral rail movement', () => {
    const arrow = new Arrow({
      id: 4,
      position: { x: 0.1, y: 1.7, z: -25 },
      velocity: { x: 0, y: 0, z: -50 },
    });

    arrow.stickToTarget(0, 1.65, -25, 0.1, 0.05);
    assert.equal(arrow.state, ARROW_STATES.STUCK);

    arrow.syncWithTarget(2.5, 1.65, -25);
    assert.equal(arrow.x, 2.6);
    assert.equal(arrow.y, 1.7);
  });
});

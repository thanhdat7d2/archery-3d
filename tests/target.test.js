import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Target } from '../src/entities/Target.js';

describe('Target (3D Olympic Scoring)', () => {
  it('awards 10-point X-RING bullseye at exact center', () => {
    const target = new Target({ distance: 25, radius: 1.25 });
    const result = target.evaluateHit(target.x, target.y);

    assert.equal(result.hit, true);
    assert.equal(result.points, 10);
    assert.equal(result.isBullseye, true);
    assert.equal(result.ring.name, 'X-RING');
  });

  it('evaluates radial 2D distance across concentric Olympic rings', () => {
    const target = new Target({ distance: 35, radius: 1.0 });

    const gold = target.evaluateHit(0.2, target.y);
    const red = target.evaluateHit(0.4, target.y);
    const blue = target.evaluateHit(0.7, target.y);
    const white = target.evaluateHit(0.95, target.y);
    const miss = target.evaluateHit(1.05, target.y);

    assert.equal(gold.points, 9);
    assert.equal(gold.isBullseye, true);
    assert.equal(red.points, 8);
    assert.equal(blue.points, 5);
    assert.equal(white.points, 1);
    assert.equal(miss.hit, false);
  });

  it('oscillates smoothly along the X rail when isMoving is enabled', () => {
    const target = new Target({ distance: 45, radius: 1.25 });
    target.configure({ distance: 45, radius: 1.25, isMoving: true, moveSpeed: 3.0 });

    target.update(0.5);
    assert.notEqual(target.x, 0);
    assert.ok(Math.abs(target.x) <= target.railHalfSpan);
  });

  it('uses archetype-specific hit labels and decays impact wobble over time', () => {
    const fox = new Target({ distance: 25, radius: 1.25, type: 'fox' });
    assert.equal(fox.evaluateHit(fox.x, fox.y).label, 'VITAL SHOT');

    const robot = new Target({ distance: 25, radius: 1.25, type: 'robot' });
    assert.equal(robot.evaluateHit(robot.x, robot.y).label, 'CORE HIT');

    const mixedFallback = new Target({ distance: 25, radius: 1.25, type: 'mixed' });
    assert.equal(mixedFallback.type, 'board');

    fox.triggerImpact();
    assert.equal(fox.hitWobble, 1.0);
    fox.update(0.1);
    assert.ok(fox.hitWobble < 1.0 && fox.hitWobble > 0);
    fox.update(0.5);
    assert.equal(fox.hitWobble, 0);
  });
});

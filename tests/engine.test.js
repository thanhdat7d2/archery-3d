import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, GAME_STATES, PHYSICS, PLAYER_BOUNDS } from '../src/config/constants.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameEngine } from '../src/core/GameEngine.js';
import { StorageService } from '../src/core/StorageService.js';

function createEngine() {
  const eventBus = new EventBus();
  const storage = new StorageService();
  return {
    eventBus,
    storage,
    engine: new GameEngine({
      eventBus,
      storage,
      rng: () => 0.5, // Deterministic zero wind
    }),
  };
}

/**
 * Helper to compute exact upward launch pitch needed to hit target center at `distance`
 * with speed `v` under gravity `g` and zero wind.
 */
function solveZeroWindPitch(distance, speed) {
  const g = Math.abs(PHYSICS.GRAVITY);
  const sin2Theta = (g * distance) / (speed * speed);
  return 0.5 * Math.asin(Math.min(1, sin2Theta));
}

describe('GameEngine (3D Range)', () => {
  it('starts in MENU and transitions to PLAYING on startGame()', () => {
    const { engine } = createEngine();
    assert.equal(engine.state, GAME_STATES.MENU);

    engine.startGame('championship');
    assert.equal(engine.state, GAME_STATES.PLAYING);
    assert.equal(engine.arrowsLeft, 12);
    assert.equal(engine.target.distance, 25);
  });

  it('charges bow draw power and fires an arrow on releaseDraw()', () => {
    const { engine } = createEngine();
    engine.startGame('championship');

    engine.beginDraw();
    for (let i = 0; i < 20; i++) {
      engine.step(0.05);
    }
    assert.equal(engine.drawPower, 1);

    const arrow = engine.releaseDraw();
    assert.ok(arrow, 'expected arrow to be fired at full draw');
    assert.equal(engine.arrowsLeft, 11);
    assert.equal(engine.flyingArrows.length, 1);
  });

  it('scores an X-RING bullseye and grants bonus arrows when aimed with ballistic drop compensation', () => {
    const { engine, eventBus } = createEngine();
    engine.startGame('championship');
    engine.wind = { x: 0, y: 0 };

    // Aim with exact ballistic arc for 25m at full draw speed
    const pitch = solveZeroWindPitch(25, PHYSICS.MAX_LAUNCH_SPEED);
    engine.aimYaw = 0;
    engine.aimPitch = pitch;
    engine.swayYaw = 0;
    engine.swayPitch = 0;

    let hitPayload = null;
    eventBus.on(EVENTS.TARGET_HIT, (payload) => {
      hitPayload = payload;
    });

    engine.beginDraw();
    engine.drawPower = 1;
    engine.releaseDraw();

    for (let i = 0; i < 60 && engine.flyingArrows.length > 0; i++) {
      engine.step(0.02);
    }

    assert.ok(hitPayload, 'expected TARGET_HIT event');
    assert.equal(hitPayload.isBullseye, true);
    assert.equal(hitPayload.points, 10);
    assert.equal(engine.arrowsLeft, 11 + PHYSICS.BULLSEYE_BONUS_ARROWS);
    assert.equal(engine.stuckArrows.length, 1);
  });

  it('applies 2x mode multiplier in Wind Master mode', () => {
    const { engine } = createEngine();
    engine.startGame('windMaster');
    engine.wind = { x: 0, y: 0 };
    engine.target.isMoving = false;
    engine.target.x = 0;

    const pitch = solveZeroWindPitch(engine.target.distance, PHYSICS.MAX_LAUNCH_SPEED);
    engine.aimYaw = 0;
    engine.aimPitch = pitch;
    engine.swayYaw = 0;
    engine.swayPitch = 0;

    engine.beginDraw();
    engine.drawPower = 1;
    engine.releaseDraw();

    for (let i = 0; i < 120 && engine.flyingArrows.length > 0; i++) {
      engine.step(0.02);
    }

    assert.equal(engine.score, 20);
  });

  it('ends the round and saves high score when the final arrow misses', () => {
    const { engine, storage, eventBus } = createEngine();
    engine.startGame('championship');
    engine.score = 64;
    engine.arrowsLeft = 1;
    engine.aimYaw = 0.34; // Aim far off to the side
    engine.aimPitch = -0.1;

    let summary = null;
    eventBus.on(EVENTS.GAME_OVER, (payload) => {
      summary = payload;
    });

    engine.beginDraw();
    engine.drawPower = 1;
    engine.releaseDraw();

    for (let i = 0; i < 160 && engine.state === GAME_STATES.PLAYING; i++) {
      engine.step(0.02);
    }

    assert.equal(engine.state, GAME_STATES.GAME_OVER);
    assert.ok(summary);
    assert.equal(summary.score, 64);
    assert.equal(summary.isNewBest, true);
    assert.equal(storage.getHighScore('championship'), 64);
  });

  it('allows walking inside the shooting box and clamps strictly to PLAYER_BOUNDS', () => {
    const { engine } = createEngine();
    engine.startGame('championship');

    // Walk forward and right for several seconds
    engine.setMoveInput(1, 1);
    for (let i = 0; i < 80; i++) {
      engine.step(0.05);
    }

    assert.equal(engine.playerPos.x, PLAYER_BOUNDS.maxX);
    assert.equal(engine.playerPos.z, PLAYER_BOUNDS.minZ);

    // Arrow fired should originate from the walked position
    engine.beginDraw();
    engine.drawPower = 1;
    const arrow = engine.releaseDraw();
    assert.ok(arrow);
    assert.equal(arrow.x, PLAYER_BOUNDS.maxX);
    assert.equal(arrow.z, PLAYER_BOUNDS.minZ);
  });

  it('supports wide free camera look range, world switching, and diverse target types', () => {
    const { engine } = createEngine();
    engine.setWorld('alien');
    assert.equal(engine.worldId, 'alien');

    engine.setTargetType('soldier');
    assert.equal(engine.target.type, 'soldier');

    engine.startGame('championship');
    engine.setAimNormalized(1, -1);
    for (let i = 0; i < 40; i++) {
      engine.step(0.05);
    }
    // Wide panoramic yaw exceeds 120 degrees (> 2.09 rad)
    assert.ok(Math.abs(engine.aimYaw) > 2.1, 'expected wide panoramic horizontal look angle');
    assert.ok(engine.aimPitch > 0.65, 'expected wide vertical look angle');
  });

  it('launches arrows collinearly with the camera aim ray from playerPos', () => {
    const { engine } = createEngine();
    engine.startGame('championship');
    engine.playerPos = { x: 1.5, y: PHYSICS.BOW_POS.y, z: -2.0 };
    engine.aimYaw = 0.25;
    engine.aimPitch = 0.12;
    engine.swayYaw = 0;
    engine.swayPitch = 0;

    engine.beginDraw();
    engine.drawPower = 1;
    const arrow = engine.releaseDraw();

    assert.ok(arrow);
    assert.equal(arrow.x, engine.playerPos.x);
    assert.equal(arrow.y, engine.playerPos.y);
    assert.equal(arrow.z, engine.playerPos.z);

    const dir = arrow.getDirection();
    const expectedX = -Math.sin(0.25) * Math.cos(0.12);
    const expectedY = Math.sin(0.12);
    const expectedZ = -Math.cos(0.25) * Math.cos(0.12);
    assert.ok(Math.abs(dir.x - expectedX) < 1e-6);
    assert.ok(Math.abs(dir.y - expectedY) < 1e-6);
    assert.ok(Math.abs(dir.z - expectedZ) < 1e-6);
  });

  it('updates menu target preview on setMode() and blocks drawing after Time Attack expires', () => {
    const { engine } = createEngine();
    engine.setMode('windMaster');
    assert.equal(engine.target.distance, 55);
    assert.equal(engine.target.isMoving, true);

    engine.startGame('timeAttack');
    engine.roundTimeRemaining = 0;
    engine.beginDraw();
    assert.equal(engine.isDrawing, false);
  });
});

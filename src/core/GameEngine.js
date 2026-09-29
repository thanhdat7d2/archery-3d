import {
  DIFFICULTY,
  ENVIRONMENTS,
  EVENTS,
  GAME_MODES,
  GAME_STATES,
  MIXED_TARGET_SEQUENCE,
  PHYSICS,
  PLAYER_BOUNDS,
  TARGET_TYPES,
} from '../config/constants.js';
import { Arrow, ARROW_STATES } from '../entities/Arrow.js';
import { Target } from '../entities/Target.js';

/**
 * Core 3D archery simulation engine and state machine.
 * Pure JS math — completely independent of Three.js & DOM for headless unit testing.
 */
export class GameEngine {
  /**
   * @param {object} deps
   * @param {import('./EventBus.js').EventBus} deps.eventBus
   * @param {import('./StorageService.js').StorageService} deps.storage
   * @param {() => number} [deps.rng=Math.random] Injectable PRNG for deterministic tests
   */
  constructor({ eventBus, storage, rng = Math.random }) {
    this.eventBus = eventBus;
    this.storage = storage;
    this.rng = rng;

    const saved = storage.getSettings();
    this.state = GAME_STATES.MENU;
    this.mode = GAME_MODES[saved.selectedMode] ?? GAME_MODES.championship;
    this.worldId = ENVIRONMENTS[saved.selectedWorld] ? saved.selectedWorld : 'alpine';
    this.targetTypePreference = TARGET_TYPES[saved.selectedTargetType]
      ? saved.selectedTargetType
      : 'mixed';

    this.target = new Target({
      distance: this.mode.distances[0],
      radius: this.mode.targetRadius,
      type: this._resolveTargetTypeForStage(0),
    });

    // Player walkable position within the shooting box
    this.playerPos = { ...PHYSICS.BOW_POS };
    this.moveInput = { forward: 0, right: 0 };
    this.walkBobPhase = 0;
    this.walkSpeedRatio = 0;

    // Wide-range camera look (smoothly interpolated from pointer target)
    this.targetAimYaw = 0;
    this.targetAimPitch = 0.04;
    this.aimYaw = 0;
    this.aimPitch = 0.04;
    this.swayTime = 0;
    this.swayYaw = 0;
    this.swayPitch = 0;

    this.isDrawing = false;
    this.drawPower = 0;
    this.holdTime = 0;
    this.releaseRecoil = 0;

    // Projectiles
    this._nextArrowId = 1;
    /** @type {Arrow[]} */
    this.flyingArrows = [];
    /** @type {Arrow[]} */
    this.stuckArrows = [];
    /** @type {Arrow[]} */
    this.groundedArrows = [];

    // Round progression & stats
    this.stageIndex = 0;
    this.hitsInStage = 0;
    this.score = 0;
    this.arrowsLeft = this.mode.startingArrows;
    this.shotsFired = 0;
    this.hits = 0;
    this.bullseyes = 0;
    this.totalRingPoints = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.roundTimeRemaining = 0;
    this.lastHitLabel = '';

    this.wind = { x: 0, y: 0 };

    this._rafId = null;
    this._lastTimestamp = 0;
  }

  _resolveTargetTypeForStage(stageIdx) {
    if (this.targetTypePreference !== 'mixed') {
      return this.targetTypePreference;
    }
    return MIXED_TARGET_SEQUENCE[stageIdx % MIXED_TARGET_SEQUENCE.length];
  }

  /**
   * Select a game mode by ID.
   * @param {string} modeId
   */
  setMode(modeId) {
    if (!GAME_MODES[modeId]) return;
    this.mode = GAME_MODES[modeId];
    this.storage.saveSettings({ selectedMode: modeId });
    if (this.state === GAME_STATES.MENU) {
      this._configureStage(0);
    }
  }

  /**
   * Switch the active 3D environment / world.
   * @param {string} worldId
   */
  setWorld(worldId) {
    if (!ENVIRONMENTS[worldId]) return;
    this.worldId = worldId;
    this.storage.saveSettings({ selectedWorld: worldId });
    this.eventBus.emit(EVENTS.ENVIRONMENT_CHANGED, { worldId });
  }

  /**
   * Switch the active target type preference (`mixed`, `board`, `fox`, `soldier`, `robot`).
   * @param {string} targetTypeId
   */
  setTargetType(targetTypeId) {
    if (!TARGET_TYPES[targetTypeId]) return;
    this.targetTypePreference = targetTypeId;
    this.storage.saveSettings({ selectedTargetType: targetTypeId });

    const resolved = this._resolveTargetTypeForStage(this.stageIndex);
    this.target.configure({
      distance: this.target.distance,
      radius: this.mode.targetRadius,
      isMoving: this.target.isMoving,
      moveSpeed: this.target.moveSpeed,
      type: resolved,
    });
    this.eventBus.emit(EVENTS.TARGET_TYPE_CHANGED, { targetType: resolved });
  }

  /**
   * Start a new match in the chosen (or currently selected) mode.
   * @param {string} [modeId]
   */
  startGame(modeId) {
    if (modeId && GAME_MODES[modeId]) {
      this.mode = GAME_MODES[modeId];
      this.storage.saveSettings({ selectedMode: modeId });
    }

    this.stageIndex = 0;
    this.hitsInStage = 0;
    this.score = 0;
    this.arrowsLeft = this.mode.startingArrows;
    this.shotsFired = 0;
    this.hits = 0;
    this.bullseyes = 0;
    this.totalRingPoints = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.roundTimeRemaining = this.mode.roundDuration ?? 0;
    this.lastHitLabel = '';

    this.playerPos = { ...PHYSICS.BOW_POS };
    this.moveInput = { forward: 0, right: 0 };
    this.walkBobPhase = 0;
    this.walkSpeedRatio = 0;

    this.targetAimYaw = 0;
    this.targetAimPitch = 0.045;
    this.aimYaw = 0;
    this.aimPitch = 0.045;
    this.isDrawing = false;
    this.drawPower = 0;
    this.holdTime = 0;
    this.releaseRecoil = 0;

    this.flyingArrows = [];
    this.stuckArrows = [];
    this.groundedArrows = [];

    this._configureStage(0);
    this._rollWind();
    this._setState(GAME_STATES.PLAYING);
    this._emitHud();
  }

  togglePause() {
    if (this.state === GAME_STATES.PLAYING) {
      this.isDrawing = false;
      this.drawPower = 0;
      this.moveInput = { forward: 0, right: 0 };
      this._setState(GAME_STATES.PAUSED);
    } else if (this.state === GAME_STATES.PAUSED) {
      this._lastTimestamp = 0;
      this._setState(GAME_STATES.PLAYING);
    }
  }

  returnToMenu() {
    this.isDrawing = false;
    this.drawPower = 0;
    this.moveInput = { forward: 0, right: 0 };
    this.flyingArrows = [];
    this.stuckArrows = [];
    this.groundedArrows = [];
    this._setState(GAME_STATES.MENU);
  }

  /**
   * Set directional walking axes (-1, 0, +1).
   * @param {number} forward +1 forward, -1 backward
   * @param {number} right +1 right, -1 left
   */
  setMoveInput(forward, right) {
    this.moveInput.forward = Math.max(-1, Math.min(1, forward));
    this.moveInput.right = Math.max(-1, Math.min(1, right));
  }

  /**
   * Set normalized aim coordinates from pointer position in viewport (-1..+1).
   * Maps smoothly across the wide 280-degree horizontal & 82-degree vertical look range.
   * @param {number} normX -1 (left) to +1 (right)
   * @param {number} normY -1 (top) to +1 (bottom)
   */
  setAimNormalized(normX, normY) {
    if (this.state !== GAME_STATES.PLAYING) return;
    const clampedX = Math.max(-1, Math.min(1, normX));
    const clampedY = Math.max(-1, Math.min(1, normY));
    this.targetAimYaw = -clampedX * PHYSICS.MAX_YAW_RAD;
    this.targetAimPitch = -clampedY * PHYSICS.MAX_PITCH_RAD + 0.03;
  }

  /**
   * Effective aim angles including subtle archer breathing sway.
   * @returns {{ yaw: number, pitch: number }}
   */
  getEffectiveAim() {
    return {
      yaw: this.aimYaw + this.swayYaw,
      pitch: this.aimPitch + this.swayPitch,
    };
  }

  getEffectiveDistance() {
    return Math.max(
      5,
      Math.round(Math.hypot(this.target.x - this.playerPos.x, this.target.z - this.playerPos.z))
    );
  }

  beginDraw() {
    if (this.state !== GAME_STATES.PLAYING) return;
    if (this.mode.roundDuration !== null && this.roundTimeRemaining <= 0) return;
    if (!this.mode.infiniteArrows && this.arrowsLeft <= 0) return;
    if (!this.mode.infiniteArrows && this.flyingArrows.length > 0) return;

    this.isDrawing = true;
    this.holdTime = 0;
  }

  releaseDraw() {
    if (!this.isDrawing) return null;
    this.isDrawing = false;

    const power = this.drawPower;
    this.drawPower = 0;
    this.holdTime = 0;

    if (this.state !== GAME_STATES.PLAYING || power < PHYSICS.MIN_DRAW_TO_FIRE) {
      this.eventBus.emit(EVENTS.DRAW_UPDATED, { isDrawing: false, drawPower: 0, fatigue: 0 });
      return null;
    }

    if (!this.mode.infiniteArrows && this.arrowsLeft <= 0) {
      return null;
    }

    const { yaw, pitch } = this.getEffectiveAim();
    const speed =
      PHYSICS.MIN_LAUNCH_SPEED + (PHYSICS.MAX_LAUNCH_SPEED - PHYSICS.MIN_LAUNCH_SPEED) * power;

    const cosPitch = Math.cos(pitch);
    const dirX = -Math.sin(yaw) * cosPitch;
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(yaw) * cosPitch;

    const arrow = new Arrow({
      id: this._nextArrowId++,
      position: { ...this.playerPos },
      velocity: {
        x: dirX * speed,
        y: dirY * speed,
        z: dirZ * speed,
      },
    });

    this.flyingArrows.push(arrow);
    this.shotsFired += 1;
    if (!this.mode.infiniteArrows) {
      this.arrowsLeft -= 1;
    }

    this.releaseRecoil = 1.0;

    this.eventBus.emit(EVENTS.ARROW_FIRED, {
      arrowId: arrow.id,
      power,
      speed,
      arrowsLeft: this.arrowsLeft,
    });
    this.eventBus.emit(EVENTS.DRAW_UPDATED, { isDrawing: false, drawPower: 0, fatigue: 0 });
    this._emitHud();
    return arrow;
  }

  getComboMultiplier() {
    const bonus = Math.floor(this.streak / DIFFICULTY.STREAK_COMBO_STEP);
    return Math.min(DIFFICULTY.MAX_COMBO_MULTIPLIER, 1 + bonus);
  }

  step(rawDt) {
    const dt = Math.min(Math.max(rawDt, 0), PHYSICS.MAX_DELTA_TIME);
    this.swayTime += dt;

    if (this.state === GAME_STATES.MENU) {
      this.target.update(dt);
      return;
    }

    if (this.state !== GAME_STATES.PLAYING) {
      return;
    }

    // Smoothly track wide camera aim (responsive yet non-twitchy)
    const aimSmoothing = Math.min(1, dt * 16);
    this.aimYaw += (this.targetAimYaw - this.aimYaw) * aimSmoothing;
    this.aimPitch += (this.targetAimPitch - this.aimPitch) * aimSmoothing;

    this._updatePlayerMovement(dt);

    if (this.releaseRecoil > 0) {
      this.releaseRecoil = Math.max(0, this.releaseRecoil - dt * 5.2);
    }

    let fatigue = 0;
    if (this.isDrawing) {
      this.drawPower = Math.min(1, this.drawPower + PHYSICS.DRAW_CHARGE_RATE * dt);
      if (this.drawPower >= 0.99) {
        this.holdTime += dt;
        fatigue = Math.max(0, Math.min(1, (this.holdTime - PHYSICS.HOLD_STEADY_LIMIT) / 2.2));
      }
      this.eventBus.emit(EVENTS.DRAW_UPDATED, {
        isDrawing: true,
        drawPower: this.drawPower,
        fatigue,
      });
    }

    const walkSwayBoost = this.walkSpeedRatio * 0.004;
    const swayAmp = (this.isDrawing ? 0.0022 + fatigue * 0.011 : 0.0038) + walkSwayBoost;
    this.swayYaw = Math.sin(this.swayTime * 1.45) * swayAmp;
    this.swayPitch = Math.cos(this.swayTime * 2.1) * swayAmp * 0.85;

    this.target.update(dt);
    for (const stuck of this.stuckArrows) {
      stuck.syncWithTarget(this.target.x, this.target.y, this.target.z);
    }

    if (this.mode.roundDuration !== null) {
      this.roundTimeRemaining = Math.max(0, this.roundTimeRemaining - dt);
      if (this.roundTimeRemaining <= 0 && this.flyingArrows.length === 0) {
        this._finishGame();
        return;
      }
    }

    for (let i = this.flyingArrows.length - 1; i >= 0; i--) {
      const arrow = this.flyingArrows[i];
      arrow.update(dt, this.wind, -(this.target.distance + 45));

      const crossing = arrow.intersectZPlane(this.target.z);
      if (crossing.crossed) {
        const hitResult = this.target.evaluateHit(crossing.x, crossing.y);
        if (hitResult.hit) {
          this.flyingArrows.splice(i, 1);
          this._handleHit(arrow, hitResult);
          continue;
        }
      }

      if (arrow.state === ARROW_STATES.GROUNDED || arrow.state === ARROW_STATES.MISSED) {
        this.flyingArrows.splice(i, 1);
        if (arrow.state === ARROW_STATES.GROUNDED) {
          this.groundedArrows.push(arrow);
          if (this.groundedArrows.length > 6) {
            this.groundedArrows.shift();
          }
        }
        this._handleMiss(arrow);
      }
    }

    this._emitHud();
  }

  _updatePlayerMovement(dt) {
    const { forward, right } = this.moveInput;
    const mag = Math.hypot(forward, right);
    if (mag > 0.01) {
      const speed = PLAYER_BOUNDS.walkSpeed * (this.isDrawing ? 0.55 : 1.0);
      const localF = forward / mag;
      const localR = right / mag;

      // Camera-relative ground movement so walking feels natural at any look angle
      const sinY = Math.sin(this.aimYaw);
      const cosY = Math.cos(this.aimYaw);
      const moveX = (-sinY * localF + cosY * localR) * speed * dt;
      const moveZ = (-cosY * localF - sinY * localR) * speed * dt;

      this.playerPos.x = Math.max(
        PLAYER_BOUNDS.minX,
        Math.min(PLAYER_BOUNDS.maxX, this.playerPos.x + moveX)
      );
      this.playerPos.z = Math.max(
        PLAYER_BOUNDS.minZ,
        Math.min(PLAYER_BOUNDS.maxZ, this.playerPos.z + moveZ)
      );
      this.walkBobPhase += dt * (this.isDrawing ? 5.5 : 8.5);
      this.walkSpeedRatio = Math.min(1, this.walkSpeedRatio + dt * 6);
    } else {
      this.walkSpeedRatio = Math.max(0, this.walkSpeedRatio - dt * 8);
    }
  }

  _handleHit(arrow, hitResult) {
    this.hits += 1;
    this.hitsInStage += 1;
    this.streak += 1;
    this.totalRingPoints += hitResult.points;
    if (this.streak > this.maxStreak) {
      this.maxStreak = this.streak;
    }

    const comboMultiplier = this.getComboMultiplier();
    const earnedPoints = hitResult.points * comboMultiplier * this.mode.scoreMultiplier;
    this.score += earnedPoints;
    this.lastHitLabel = `${hitResult.points} • ${hitResult.label}`;

    let bonusArrows = 0;
    if (hitResult.isBullseye) {
      this.bullseyes += 1;
      if (!this.mode.infiniteArrows) {
        bonusArrows = PHYSICS.BULLSEYE_BONUS_ARROWS;
        this.arrowsLeft += bonusArrows;
      }
    }

    arrow.stickToTarget(
      this.target.x,
      this.target.y,
      this.target.z,
      hitResult.offsetX,
      hitResult.offsetY
    );
    this.stuckArrows.push(arrow);
    if (this.stuckArrows.length > PHYSICS.MAX_STUCK_ARROWS) {
      this.stuckArrows.shift();
    }

    this.target.triggerImpact();

    this.eventBus.emit(EVENTS.TARGET_HIT, {
      arrowId: arrow.id,
      worldPos: { x: arrow.x, y: arrow.y, z: arrow.z },
      points: earnedPoints,
      basePoints: hitResult.points,
      ring: hitResult.ring,
      label: hitResult.label,
      isBullseye: hitResult.isBullseye,
      bonusArrows,
      streak: this.streak,
      comboMultiplier,
    });

    // Advance stage (distance and/or mixed target rotation)
    const shouldAdvance =
      this.hitsInStage >= this.mode.shotsPerStage &&
      (this.stageIndex < this.mode.distances.length - 1 ||
        this.targetTypePreference === 'mixed');

    if (shouldAdvance) {
      this.stageIndex += 1;
      this.hitsInStage = 0;
      this.stuckArrows = [];
      this._configureStage(this.stageIndex);
      this.eventBus.emit(EVENTS.STAGE_CHANGED, {
        stageIndex: this.stageIndex,
        distance: this.target.distance,
        isMoving: this.target.isMoving,
        targetType: this.target.type,
      });
    }

    this._rollWind();
    this._checkEndConditions();
  }

  _handleMiss(arrow) {
    this.streak = 0;
    this.lastHitLabel = 'MISS';
    this.eventBus.emit(EVENTS.TARGET_MISSED, {
      arrowId: arrow.id,
      worldPos: { x: arrow.x, y: arrow.y, z: arrow.z },
      arrowsLeft: this.arrowsLeft,
    });
    this._rollWind();
    this._checkEndConditions();
  }

  _configureStage(stageIndex) {
    const distIdx = Math.min(stageIndex, this.mode.distances.length - 1);
    const distance = this.mode.distances[distIdx] ?? this.mode.distances[0];
    const isMoving = stageIndex >= this.mode.movingTargetFromStage;
    const moveSpeed = 2.0 + Math.min(stageIndex, 4) * 0.55;
    const targetType = this._resolveTargetTypeForStage(stageIndex);

    this.target.configure({
      distance,
      radius: this.mode.targetRadius,
      isMoving,
      moveSpeed,
      type: targetType,
    });
    this.eventBus.emit(EVENTS.TARGET_TYPE_CHANGED, { targetType });
  }

  _rollWind() {
    const maxWind = PHYSICS.BASE_WIND_MAX * this.mode.windScale;
    const rawX = (this.rng() * 2 - 1) * maxWind;
    const rawY = (this.rng() * 2 - 1) * (maxWind * 0.3);
    this.wind = {
      x: Math.round(rawX * 10) / 10,
      y: Math.round(rawY * 10) / 10,
    };
    this.eventBus.emit(EVENTS.WIND_CHANGED, { wind: { ...this.wind } });
  }

  _checkEndConditions() {
    const outOfArrows =
      !this.mode.infiniteArrows && this.arrowsLeft <= 0 && this.flyingArrows.length === 0;
    const outOfTime =
      this.mode.roundDuration !== null &&
      this.roundTimeRemaining <= 0 &&
      this.flyingArrows.length === 0;

    if (outOfArrows || outOfTime) {
      this._finishGame();
    }
  }

  _finishGame() {
    this.isDrawing = false;
    this.drawPower = 0;
    this.moveInput = { forward: 0, right: 0 };
    this._setState(GAME_STATES.GAME_OVER);

    const isNewBest = this.storage.saveHighScore(this.mode.id, this.score);
    const bestScore = this.storage.getHighScore(this.mode.id);
    const accuracy = this.shotsFired > 0 ? Math.round((this.hits / this.shotsFired) * 100) : 0;
    const avgRing = this.hits > 0 ? (this.totalRingPoints / this.hits).toFixed(1) : '0.0';

    this.eventBus.emit(EVENTS.GAME_OVER, {
      mode: this.mode,
      score: this.score,
      bestScore,
      isNewBest,
      shotsFired: this.shotsFired,
      hits: this.hits,
      bullseyes: this.bullseyes,
      maxStreak: this.maxStreak,
      accuracy,
      avgRing,
    });
  }

  _setState(nextState) {
    if (this.state === nextState) return;
    const prevState = this.state;
    this.state = nextState;
    this.eventBus.emit(EVENTS.STATE_CHANGED, { prevState, state: nextState, mode: this.mode });
  }

  _emitHud() {
    this.eventBus.emit(EVENTS.HUD_UPDATED, {
      score: this.score,
      bestScore: this.storage.getHighScore(this.mode.id),
      arrowsLeft: this.arrowsLeft,
      infiniteArrows: this.mode.infiniteArrows,
      distance: this.getEffectiveDistance(),
      stageIndex: this.stageIndex + 1,
      totalStages: this.mode.distances.length,
      streak: this.streak,
      comboMultiplier: this.getComboMultiplier(),
      roundTimeRemaining: this.mode.roundDuration !== null ? this.roundTimeRemaining : null,
      wind: { ...this.wind },
      lastHitLabel: this.lastHitLabel,
      targetType: this.target.type,
      worldId: this.worldId,
      mode: this.mode,
    });
  }

  startLoop(renderCallback) {
    this._lastTimestamp = 0;

    const tick = (timestamp) => {
      if (this._lastTimestamp === 0) {
        this._lastTimestamp = timestamp;
      }
      const dt = Math.min((timestamp - this._lastTimestamp) / 1000, PHYSICS.MAX_DELTA_TIME);
      this._lastTimestamp = timestamp;

      this.step(dt);
      renderCallback(this, dt);

      this._rafId = window.requestAnimationFrame(tick);
    };

    this._rafId = window.requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this._rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}

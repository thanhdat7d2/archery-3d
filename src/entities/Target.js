import { PHYSICS, SCORING_RINGS, TARGET_TYPES } from '../config/constants.js';

/**
 * Pure 3D archery target supporting multiple archetypes (Olympic Board,
 * Alpine Stag, Armored Soldier, Hover Drone), radial hit-zone evaluation,
 * lateral rail/patrol movement, and impact recoil wobble.
 */
export class Target {
  /**
   * @param {object} [options]
   * @param {number} [options.distance=25]
   * @param {number} [options.radius=1.25]
   * @param {string} [options.type='board']
   */
  constructor({ distance = 25, radius = 1.25, type = 'board' } = {}) {
    this.type = TARGET_TYPES[type] && type !== 'mixed' ? type : 'board';
    const meta = TARGET_TYPES[this.type];

    this.x = 0;
    this.baseY = meta.centerY ?? PHYSICS.TARGET_CENTER_Y;
    this.y = this.baseY;
    this.distance = distance;
    this.z = -distance;
    this.radius = radius * (meta.radiusScale ?? 1.0);

    // Patrol / rail movement state
    this.isMoving = false;
    this.moveSpeed = 2.2;
    this.railHalfSpan = PHYSICS.TARGET_RAIL_HALF_SPAN;
    this.phase = 0;
    this.animTime = 0;

    // Visual impact wobble
    this.hitWobble = 0;
  }

  /**
   * Configure target for a new round, distance stage, or target archetype.
   * @param {object} options
   * @param {number} options.distance
   * @param {number} options.radius
   * @param {boolean} options.isMoving
   * @param {number} [options.moveSpeed=2.2]
   * @param {string} [options.type]
   */
  configure({ distance, radius, isMoving, moveSpeed = 2.2, type }) {
    if (type && TARGET_TYPES[type] && type !== 'mixed') {
      this.type = type;
    }
    const meta = TARGET_TYPES[this.type] ?? TARGET_TYPES.board;
    this.distance = distance;
    this.z = -distance;
    this.baseY = meta.centerY ?? PHYSICS.TARGET_CENTER_Y;
    this.y = this.baseY;
    this.radius = radius * (meta.radiusScale ?? 1.0);
    this.isMoving = isMoving;
    this.moveSpeed = moveSpeed;
    this.x = 0;
    this.phase = 0;
    this.hitWobble = 0;
  }

  /**
   * Evaluate a 2D impact point on the target's face plane (z = this.z).
   * @param {number} hitX
   * @param {number} hitY
   * @returns {{ hit: boolean, points: number, ring: object|null, label: string, isBullseye: boolean, offsetX: number, offsetY: number, radialRatio: number }}
   */
  evaluateHit(hitX, hitY) {
    const offsetX = hitX - this.x;
    const offsetY = hitY - this.y;
    const radialDist = Math.hypot(offsetX, offsetY);
    const radialRatio = this.radius > 0 ? radialDist / this.radius : Infinity;

    if (radialRatio > 1.0) {
      return {
        hit: false,
        points: 0,
        ring: null,
        label: 'MISS',
        isBullseye: false,
        offsetX,
        offsetY,
        radialRatio,
      };
    }

    const matchedRing =
      SCORING_RINGS.find((ring) => radialRatio <= ring.maxRatio) ??
      SCORING_RINGS[SCORING_RINGS.length - 1];

    const meta = TARGET_TYPES[this.type] ?? TARGET_TYPES.board;
    let label = matchedRing.name;
    if (matchedRing.points === 10) label = meta.bullseyeLabel;
    else if (matchedRing.points >= 9) label = meta.innerLabel;
    else if (matchedRing.points >= 7) label = meta.midLabel;
    else label = meta.outerLabel;

    return {
      hit: true,
      points: matchedRing.points,
      ring: matchedRing,
      label,
      isBullseye: matchedRing.isBullseye,
      offsetX,
      offsetY,
      radialRatio,
    };
  }

  /**
   * Trigger impact wobble animation.
   */
  triggerImpact() {
    this.hitWobble = 1.0;
  }

  /**
   * Advance patrol/rail movement, drone hover bob, and impact wobble decay.
   * @param {number} dt Delta time in seconds
   */
  update(dt) {
    this.animTime += dt;

    if (this.isMoving) {
      this.phase += (this.moveSpeed / Math.max(1, this.railHalfSpan)) * dt;
      this.x = Math.sin(this.phase) * this.railHalfSpan;
    }

    this.y = this.baseY;

    if (this.hitWobble > 0) {
      this.hitWobble = Math.max(0, this.hitWobble - dt * 4.5);
    }
  }
}

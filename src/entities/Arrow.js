import { PHYSICS } from '../config/constants.js';

export const ARROW_STATES = Object.freeze({
  FLYING: 'flying',
  STUCK: 'stuck',
  GROUNDED: 'grounded',
  MISSED: 'missed',
});

/**
 * Pure 3D arrow ballistic projectile.
 * Decoupled from Three.js meshes so physics can be unit-tested headlessly in Node.
 */
export class Arrow {
  /**
   * @param {object} params
   * @param {number} params.id Unique identifier for renderer mesh tracking
   * @param {{x:number, y:number, z:number}} params.position Initial world position
   * @param {{x:number, y:number, z:number}} params.velocity Initial velocity vector (m/s)
   */
  constructor({ id, position, velocity }) {
    this.id = id;
    this.x = position.x;
    this.y = position.y;
    this.z = position.z;

    this.prevX = position.x;
    this.prevY = position.y;
    this.prevZ = position.z;

    this.vx = velocity.x;
    this.vy = velocity.y;
    this.vz = velocity.z;

    this.state = ARROW_STATES.FLYING;
    this.flightTime = 0;

    // Offset relative to target center when embedded
    this.stuckOffsetX = 0;
    this.stuckOffsetY = 0;
    this.stuckDir = { x: 0, y: 0, z: -1 };
  }

  /**
   * Unit direction vector aligned with current velocity (or impact direction when stuck).
   * @returns {{x:number, y:number, z:number}}
   */
  getDirection() {
    if (this.state !== ARROW_STATES.FLYING) {
      return this.stuckDir;
    }
    const speed = Math.hypot(this.vx, this.vy, this.vz);
    if (speed < 1e-5) {
      return { x: 0, y: 0, z: -1 };
    }
    return { x: this.vx / speed, y: this.vy / speed, z: this.vz / speed };
  }

  /**
   * Step 3D ballistics with gravity and wind acceleration.
   * @param {number} dt Delta time in seconds
   * @param {{x:number, y:number}} wind Wind velocity in m/s (x = crosswind, y = updraft/downdraft)
   * @param {number} maxRangeZ Negative Z boundary beyond which arrow is considered missed
   */
  update(dt, wind, maxRangeZ = -110) {
    if (this.state !== ARROW_STATES.FLYING) return;

    this.prevX = this.x;
    this.prevY = this.y;
    this.prevZ = this.z;

    const windAccelX = wind.x * PHYSICS.WIND_DRAG_FACTOR;
    const windAccelY = wind.y * PHYSICS.WIND_DRAG_FACTOR * 0.35;

    this.vx += windAccelX * dt;
    this.vy += (PHYSICS.GRAVITY + windAccelY) * dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.flightTime += dt;

    // Hit the ground
    if (this.y <= 0.08) {
      this.y = 0.08;
      this.stuckDir = this.getDirection();
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.state = ARROW_STATES.GROUNDED;
      return;
    }

    // Flew past the range
    if (this.z < maxRangeZ || this.flightTime > 5.0) {
      this.state = ARROW_STATES.MISSED;
    }
  }

  /**
   * Compute intersection point when the arrow segment crosses a Z plane.
   * Prevents high-speed tunneling through the target face.
   * @param {number} planeZ
   * @returns {{crossed: boolean, x: number, y: number, z: number}}
   */
  intersectZPlane(planeZ) {
    if (this.prevZ >= planeZ && this.z <= planeZ) {
      const dz = this.z - this.prevZ;
      const t = Math.abs(dz) > 1e-6 ? (planeZ - this.prevZ) / dz : 1;
      return {
        crossed: true,
        x: this.prevX + (this.x - this.prevX) * t,
        y: this.prevY + (this.y - this.prevY) * t,
        z: planeZ,
      };
    }
    return { crossed: false, x: this.x, y: this.y, z: this.z };
  }

  /**
   * Embed the arrow into the target face at the exact impact offset.
   * @param {number} targetX
   * @param {number} targetY
   * @param {number} targetZ
   * @param {number} offsetX
   * @param {number} offsetY
   */
  stickToTarget(targetX, targetY, targetZ, offsetX, offsetY) {
    this.stuckDir = this.getDirection();
    this.state = ARROW_STATES.STUCK;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.stuckOffsetX = offsetX;
    this.stuckOffsetY = offsetY;
    this.x = targetX + offsetX;
    this.y = targetY + offsetY;
    this.z = targetZ;
  }

  /**
   * Keep embedded arrow synced with a laterally moving target.
   * @param {number} targetX
   * @param {number} targetY
   * @param {number} targetZ
   */
  syncWithTarget(targetX, targetY, targetZ) {
    if (this.state !== ARROW_STATES.STUCK) return;
    this.x = targetX + this.stuckOffsetX;
    this.y = targetY + this.stuckOffsetY;
    this.z = targetZ;
  }
}

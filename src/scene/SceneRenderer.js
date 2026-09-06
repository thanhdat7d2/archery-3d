import * as THREE from 'three';
import { EVENTS, GAME_STATES, PHYSICS } from '../config/constants.js';
import { LandscapeBuilder } from './LandscapeBuilder.js';
import { ModelFactory } from './ModelFactory.js';

/**
 * Three.js WebGL 3D renderer orchestrating 6 switchable worlds,
 * wide-angle walkable first-person camera, PBR-textured bow, diverse 3D targets,
 * and a live top-left square Picture-in-Picture Target Spotting Camera.
 */
export class SceneRenderer {
  /**
   * @param {object} deps
   * @param {HTMLCanvasElement} deps.canvas
   * @param {import('../core/EventBus.js').EventBus} deps.eventBus
   * @param {string} [deps.initialWorld='alpine']
   * @param {string} [deps.initialTargetType='board']
   */
  constructor({ canvas, eventBus, initialWorld = 'alpine', initialTargetType = 'board' }) {
    this.canvas = canvas;
    this.eventBus = eventBus;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xcfe4f7, 0.0036);

    this.camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 450);
    this.camera.position.set(0, PHYSICS.BOW_POS.y + 0.12, 0.45);

    this.targetScopeCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.autoClear = false;

    this._elapsed = 0;
    /** @type {Map<number, THREE.Group>} */
    this._arrowMeshes = new Map();
    /** @type {Map<number, { points: THREE.Vector3[], mesh: THREE.Mesh, material: THREE.MeshBasicMaterial, fading: boolean, life: number, maxLife: number }>} */
    this._arrowTrails = new Map();
    /** @type {Array<{ mesh: THREE.Mesh, material: THREE.MeshBasicMaterial, life: number, maxLife: number }>} */
    this._hitRings = [];
    /** @type {Array<{mesh: THREE.Mesh, vx: number, vy: number, vz: number, life: number, maxLife: number}>} */
    this._particles = [];

    this.lights = this._setupLighting();

    this.landscape = new LandscapeBuilder(this.scene, this.renderer, this.lights);
    this.sharedMaterials = this.landscape.build(initialWorld);

    this.bowRig = ModelFactory.createBow(this.sharedMaterials);
    this.bowRig.group.position.set(0.32, -0.22, -0.78);
    this.camera.add(this.bowRig.group);
    this.scene.add(this.camera);

    this._activeTargetType = null;
    this.targetRig = null;
    this._setTargetRig(initialTargetType);

    this._bindEvents();
  }

  _setupLighting() {
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x3f6212, 0.65);
    hemi.position.set(0, 60, 0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.85);
    sun.position.set(36, 52, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 175;
    const d = 58;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    return { hemi, sun };
  }

  _setTargetRig(type) {
    if (this._activeTargetType === type && this.targetRig) return;
    if (this.targetRig) {
      this.scene.remove(this.targetRig.group);
      this.scene.remove(this.targetRig.railMesh);
    }
    this._activeTargetType = type;
    this.targetRig = ModelFactory.createTargetRig(
      type,
      1.25,
      this.sharedMaterials,
      this.landscape.gltfLoader
    );
    this.scene.add(this.targetRig.group);
    this.scene.add(this.targetRig.railMesh);
  }

  _bindEvents() {
    this.eventBus.on(EVENTS.TARGET_HIT, ({ arrowId, worldPos, ring, isBullseye }) => {
      this._spawnImpactParticles(worldPos, isBullseye ? 0xfacc15 : ring.color, isBullseye ? 26 : 12);
      this._spawnGreenHitRing(worldPos, isBullseye);
      const trail = this._arrowTrails.get(arrowId);
      if (trail) {
        trail.points.push(new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z));
        this._rebuildTrailGeometry(trail);
        trail.fading = true;
      }
    });

    this.eventBus.on(EVENTS.TARGET_MISSED, ({ arrowId }) => {
      const trail = this._arrowTrails.get(arrowId);
      if (trail) {
        trail.fading = true;
      }
    });

    this.eventBus.on(EVENTS.ENVIRONMENT_CHANGED, ({ worldId }) => {
      this.landscape.loadWorld(worldId);
    });

    this.eventBus.on(EVENTS.TARGET_TYPE_CHANGED, ({ targetType }) => {
      this._setTargetRig(targetType);
    });
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  projectToScreen(worldPos) {
    const vec = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    vec.project(this.camera);
    return {
      x: (vec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-vec.y * 0.5 + 0.5) * window.innerHeight,
      visible: vec.z < 1,
    };
  }

  render(engine, dt) {
    this._elapsed += dt;

    if (this._activeTargetType !== engine.target.type) {
      this._setTargetRig(engine.target.type);
    }

    this.landscape.update(dt, this._elapsed, engine.wind);
    this._syncTarget(engine.target, dt);
    this._syncArrows(engine);
    this._updateArrowTrails(engine, dt);
    this._syncCameraAndBow(engine, dt);
    this._updateParticles(dt);
    this._updateHitRings(dt);

    const w = window.innerWidth;
    const h = window.innerHeight;

    // 1. Main full-screen render pass
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2. Top-left square Target Spotting Camera pass
    if (engine.state === GAME_STATES.PLAYING || engine.state === GAME_STATES.PAUSED) {
      this._renderTargetScope(engine, w, h);
    }
  }

  _renderTargetScope(engine, viewportW, viewportH) {
    const scopeSize = viewportW <= 720 ? 128 : 176;
    const margin = viewportW <= 720 ? 14 : 20;

    const t = engine.target;
    const camDist = t.radius * 3.15;
    this.targetScopeCamera.position.set(t.x + 0.25, t.y + 0.1, t.z + camDist);
    this.targetScopeCamera.lookAt(t.x, t.y, t.z);

    const x = margin;
    const y = viewportH - margin - scopeSize;

    const prevBowVis = this.bowRig.group.visible;
    this.bowRig.group.visible = false;

    this.renderer.setScissorTest(true);
    this.renderer.setScissor(x, y, scopeSize, scopeSize);
    this.renderer.setViewport(x, y, scopeSize, scopeSize);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.targetScopeCamera);
    this.renderer.setScissorTest(false);

    this.bowRig.group.visible = prevBowVis;
  }

  _syncTarget(target, dt) {
    if (!this.targetRig) return;
    this.targetRig.setRadius(target.radius);
    this.targetRig.group.position.set(target.x, target.y, target.z);
    this.targetRig.animate(dt, target.isMoving);

    const wobble = Math.sin(target.hitWobble * Math.PI * 4) * 0.08 * target.hitWobble;
    this.targetRig.bossGroup.rotation.x = wobble;

    this.targetRig.railMesh.visible = target.isMoving && target.type === 'board';
    if (this.targetRig.railMesh.visible) {
      this.targetRig.railMesh.position.set(0, 0.04, target.z - 0.35);
    }
  }

  _syncArrows(engine) {
    const activeIds = new Set();
    const allArrows = [
      ...engine.flyingArrows,
      ...engine.stuckArrows,
      ...engine.groundedArrows,
    ];

    const forwardRef = new THREE.Vector3(0, 0, -1);
    const dirVec = new THREE.Vector3();

    for (const arrow of allArrows) {
      activeIds.add(arrow.id);
      let mesh = this._arrowMeshes.get(arrow.id);
      if (!mesh) {
        mesh = ModelFactory.createArrow();
        this.scene.add(mesh);
        this._arrowMeshes.set(arrow.id, mesh);
      }

      mesh.position.set(arrow.x, arrow.y, arrow.z);
      const d = arrow.getDirection();
      dirVec.set(d.x, d.y, d.z).normalize();
      mesh.quaternion.setFromUnitVectors(forwardRef, dirVec);
    }

    for (const [id, mesh] of this._arrowMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this._arrowMeshes.delete(id);
      }
    }
  }

  _syncCameraAndBow(engine, dt) {
    if (engine.state === GAME_STATES.MENU) {
      const t = this._elapsed * 0.18;
      this.camera.position.set(Math.sin(t) * 6.5, 3.8 + Math.sin(t * 0.7) * 0.4, 4.5);
      this.camera.lookAt(0, 2.0, -32);
      this.bowRig.group.visible = false;
      this.camera.fov += (56 - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
      return;
    }

    this.bowRig.group.visible = true;
    const { yaw, pitch } = engine.getEffectiveAim();

    const targetFov = 56 - engine.drawPower * 15;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();

    const recoilKick = engine.releaseRecoil * 0.04;
    const bobY = Math.sin(engine.walkBobPhase * 2) * 0.032 * engine.walkSpeedRatio;
    const bobX = Math.cos(engine.walkBobPhase) * 0.018 * engine.walkSpeedRatio;

    this.camera.position.set(
      engine.playerPos.x + bobX,
      engine.playerPos.y + 0.1 + bobY,
      engine.playerPos.z + 0.35 + recoilKick
    );

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch + engine.releaseRecoil * 0.015;
    this.camera.rotation.z = 0;

    const showNocked =
      engine.state === GAME_STATES.PLAYING &&
      (engine.mode.infiniteArrows || engine.arrowsLeft > 0) &&
      (engine.mode.infiniteArrows || engine.flyingArrows.length === 0);

    this.bowRig.group.position.set(
      0.29 - engine.drawPower * 0.06,
      -0.19 + engine.drawPower * 0.03,
      -0.76 + engine.drawPower * 0.09
    );
    this.bowRig.group.rotation.z = 0.08 - engine.drawPower * 0.04;
    this.bowRig.updateDraw(engine.drawPower, engine.releaseRecoil, showNocked);
  }

  _spawnImpactParticles(worldPos, colorHex, count) {
    const geo = new THREE.SphereGeometry(0.035, 6, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: 0.35,
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 0.3,
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(worldPos.x, worldPos.y, worldPos.z + 0.1);
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 4.5;
      const maxLife = 0.45 + Math.random() * 0.45;
      this._particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 2.2,
        vz: 1.5 + Math.random() * 3.0,
        life: maxLife,
        maxLife,
      });
    }
  }

  _updateArrowTrails(engine, dt) {
    const flyingIds = new Set();

    for (const arrow of engine.flyingArrows) {
      flyingIds.add(arrow.id);
      let trail = this._arrowTrails.get(arrow.id);
      if (!trail) {
        const geo = new THREE.BufferGeometry();
        const mat = new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        this.scene.add(mesh);

        trail = {
          points: [],
          mesh,
          material: mat,
          fading: false,
          life: 1.45,
          maxLife: 1.45,
        };
        this._arrowTrails.set(arrow.id, trail);
      }

      const last = trail.points[trail.points.length - 1];
      const nextPt = new THREE.Vector3(arrow.x, arrow.y, arrow.z);
      if (!last || last.distanceToSquared(nextPt) > 0.04) {
        trail.points.push(nextPt);
        if (trail.points.length > 64) {
          trail.points.shift();
        }
        this._rebuildTrailGeometry(trail);
      }
    }

    // Fade out & clean up trails once arrows have landed or missed
    for (const [id, trail] of this._arrowTrails.entries()) {
      if (!flyingIds.has(id)) {
        trail.fading = true;
      }
      if (trail.fading) {
        trail.life -= dt;
        if (trail.life <= 0) {
          this.scene.remove(trail.mesh);
          trail.mesh.geometry.dispose();
          trail.material.dispose();
          this._arrowTrails.delete(id);
        } else {
          trail.material.opacity = 0.78 * (trail.life / trail.maxLife);
        }
      }
    }
  }

  /**
   * Build a crossed-ribbon 3D green trace mesh along the arrow's trajectory points
   * so it stays clearly visible from every viewing angle (horizontal + vertical ribbons).
   */
  _rebuildTrailGeometry(trail) {
    const pts = trail.points;
    if (pts.length < 2) return;

    const positions = [];
    const indices = [];
    const halfWidthBase = 0.055;

    // Two orthogonal ribbons (horizontal + vertical) for full 3D visibility
    const offsets = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ];

    let vertOffset = 0;
    for (const axis of offsets) {
      for (let i = 0; i < pts.length; i++) {
        const t = i / (pts.length - 1); // 0 = tail, 1 = arrow head
        const w = halfWidthBase * (0.15 + 0.85 * t);
        const p = pts[i];
        positions.push(
          p.x - axis.x * w, p.y - axis.y * w, p.z - axis.z * w,
          p.x + axis.x * w, p.y + axis.y * w, p.z + axis.z * w
        );

        if (i < pts.length - 1) {
          const a = vertOffset + i * 2;
          const b = a + 1;
          const c = a + 2;
          const d = a + 3;
          indices.push(a, b, c, b, d, c);
        }
      }
      vertOffset += pts.length * 2;
    }

    trail.mesh.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    trail.mesh.geometry = geo;
  }

  _spawnGreenHitRing(worldPos, isBullseye) {
    const geo = new THREE.RingGeometry(0.06, isBullseye ? 0.14 : 0.11, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(worldPos.x, worldPos.y, worldPos.z + 0.06);
    this.scene.add(mesh);

    this._hitRings.push({
      mesh,
      material: mat,
      life: 0.95,
      maxLife: 0.95,
    });
  }

  _updateHitRings(dt) {
    for (let i = this._hitRings.length - 1; i >= 0; i--) {
      const r = this._hitRings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.material.dispose();
        this._hitRings.splice(i, 1);
        continue;
      }
      const progress = 1 - r.life / r.maxLife;
      const scale = 1 + progress * 2.4;
      r.mesh.scale.setScalar(scale);
      r.material.opacity = 0.95 * (1 - progress);
    }
  }

  _updateParticles(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this._particles.splice(i, 1);
        continue;
      }
      p.vy += PHYSICS.GRAVITY * 0.65 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const scale = Math.max(0.01, p.life / p.maxLife);
      p.mesh.scale.setScalar(scale);
    }
  }
}

import * as THREE from 'three';
import { SCORING_RINGS, TARGET_TYPES } from '../config/constants.js';

const GLB_TARGET_SPECS = Object.freeze({
  fox: Object.freeze({
    path: './assets/models/targets/Fox.glb',
    desiredHeight: 1.75,
    facingRotY: 0,
    idleClip: 'Survey',
    moveClip: 'Walk',
  }),
  soldier: Object.freeze({
    path: './assets/models/targets/Soldier.glb',
    desiredHeight: 2.25,
    facingRotY: Math.PI,
    idleClip: 'Idle',
    moveClip: 'Walk',
  }),
  robot: Object.freeze({
    path: './assets/models/targets/RobotExpressive.glb',
    desiredHeight: 2.25,
    facingRotY: 0,
    idleClip: 'Idle',
    moveClip: 'Walking',
  }),
});

/**
 * Factory for PBR-textured 3D Olympic recurve bow (zero floating parts,
 * exact limb-tip anchored 3D bowstring), tournament carbon arrows,
 * Olympic target board, and real animated 3D GLB targets (Fox, Soldier, Robot).
 */
export class ModelFactory {
  /**
   * Create a solid, physically connected PBR-textured 3D Olympic recurve bow.
   * Every sub-assembly (riser, leather grip, sight mount, stabilizer, limb pockets,
   * flexing recurve limbs, and 3D cylindrical bowstring) is mathematically anchored
   * with zero floating gaps.
   */
  static createBow({ woodMaterial = null, leatherMaterial = null, metalMaterial = null } = {}) {
    const group = new THREE.Group();

    const riserMat = metalMaterial
      ? metalMaterial.clone()
      : new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.78, roughness: 0.28 });
    riserMat.color.setHex(0x475569);

    const anodizedMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.82,
      roughness: 0.2,
    });

    const gripMat = leatherMaterial
      ? leatherMaterial.clone()
      : new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.75 });

    const limbMat = woodMaterial
      ? woodMaterial.clone()
      : new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.38, metalness: 0.12 });
    limbMat.roughness = 0.38;

    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.45,
      roughness: 0.32,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.88,
      roughness: 0.22,
    });

    // -----------------------------------------------------------------------
    // 1. Solid Central CNC Riser Spine (centered at x = 0, z = 0)
    // -----------------------------------------------------------------------
    const riserCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.24, 0.015),
      new THREE.Vector3(0, -0.12, -0.012),
      new THREE.Vector3(0, 0.0, 0.0),
      new THREE.Vector3(0, 0.12, -0.012),
      new THREE.Vector3(0, 0.24, 0.015),
    ]);
    const riser = new THREE.Mesh(
      new THREE.TubeGeometry(riserCurve, 28, 0.02, 14, false),
      riserMat
    );
    riser.scale.set(0.85, 1, 1.45);
    riser.castShadow = true;
    group.add(riser);

    // Contoured leather grip coaxial with riser (y = -0.11 to +0.01)
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.13, 18), gripMat);
    grip.position.set(0, -0.055, -0.005);
    grip.scale.set(0.95, 1, 1.3);
    group.add(grip);

    // Flush anodized grip end-collars
    for (const cy of [-0.12, 0.01]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.012, 18), anodizedMat);
      collar.position.set(0, cy, -0.005);
      collar.scale.set(0.95, 1, 1.3);
      group.add(collar);
    }

    // Welded leather-padded arrow shelf protruding directly from riser to x = -0.028
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.048), gripMat);
    shelf.position.set(-0.014, 0.018, -0.004);
    group.add(shelf);

    // -----------------------------------------------------------------------
    // 2. Stabilizer Assembly (bolted directly into front of riser at y = -0.115)
    // -----------------------------------------------------------------------
    const stabBushing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.035, 14),
      anodizedMat
    );
    stabBushing.rotation.x = Math.PI / 2;
    stabBushing.position.set(0, -0.115, -0.025);
    group.add(stabBushing);

    const stabilizer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0085, 0.0095, 0.38, 12),
      carbonMat
    );
    stabilizer.rotation.x = Math.PI / 2;
    stabilizer.position.set(0, -0.115, -0.22);
    group.add(stabilizer);

    const damper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.048, 16),
      anodizedMat
    );
    damper.rotation.x = Math.PI / 2;
    damper.position.set(0, -0.115, -0.425);
    group.add(damper);

    // -----------------------------------------------------------------------
    // 3. Sight Assembly (bolted solidly into riser with zero floating parts)
    // -----------------------------------------------------------------------
    // Horizontal mount block welded from riser center (x = 0) out to x = -0.036
    const sightMountBlock = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.026, 0.028), riserMat);
    sightMountBlock.position.set(-0.018, 0.095, -0.012);
    group.add(sightMountBlock);

    // Forward sight extension arm from mount block (z = -0.012) to z = -0.17
    const sightArm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.165), riserMat);
    sightArm.position.set(-0.036, 0.095, -0.092);
    group.add(sightArm);

    // Vertical sight elevation bar attached directly to the front tip of the sight arm
    const sightRail = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.085, 0.012), anodizedMat);
    sightRail.position.set(-0.036, 0.095, -0.172);
    group.add(sightRail);

    // Short pin stem connecting elevation bar to the sight ring center
    const pinStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.024, 8), riserMat);
    pinStem.rotation.z = Math.PI / 2;
    pinStem.position.set(-0.024, 0.095, -0.172);
    group.add(pinStem);

    // Illuminated sight ring & fiber-optic aiming dot
    const sightRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0032, 10, 28), anodizedMat);
    sightRing.position.set(-0.016, 0.095, -0.172);
    group.add(sightRing);

    const fiberPin = new THREE.Mesh(
      new THREE.SphereGeometry(0.0034, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xff2222,
        emissive: 0xef4444,
        emissiveIntensity: 1.6,
      })
    );
    fiberPin.position.set(-0.016, 0.095, -0.172);
    group.add(fiberPin);

    // -----------------------------------------------------------------------
    // 4. Limb Pockets + Flexing Laminated Recurve S-Limbs + Exact Tip Anchors
    // -----------------------------------------------------------------------
    const makeLimbAssembly = (sign) => {
      // Bolted anodized limb pocket overlapping riser end
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.072, 0.056), anodizedMat);
      pocket.position.set(0, sign * 0.23, 0.016);
      pocket.rotation.x = sign * 0.16;
      group.add(pocket);

      const pivot = new THREE.Group();
      pivot.position.set(0, sign * 0.23, 0.016);

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, sign * 0.2, 0.052),
        new THREE.Vector3(0, sign * 0.42, 0.115),
        new THREE.Vector3(0, sign * 0.56, 0.095),
      ]);

      const woodCore = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.013, 10, false),
        limbMat
      );
      woodCore.scale.set(1.65, 1, 0.45);
      woodCore.castShadow = true;
      pivot.add(woodCore);

      // Reinforced dark carbon limb tip & string groove
      const tipCap = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.02, 6, 10), carbonMat);
      tipCap.position.set(0, sign * 0.56, 0.095);
      pivot.add(tipCap);

      // Exact anchor point for the 3D bowstring loop
      const tipAnchor = new THREE.Object3D();
      tipAnchor.position.set(0, sign * 0.565, 0.102);
      pivot.add(tipAnchor);

      group.add(pivot);
      return { pivot, tipAnchor };
    };

    const upper = makeLimbAssembly(1);
    const lower = makeLimbAssembly(-1);

    // -----------------------------------------------------------------------
    // 5. Real 3D Cylindrical Braided Bowstring (Upper & Lower Segments)
    //    Locked mathematically to upper.tipAnchor and lower.tipAnchor!
    // -----------------------------------------------------------------------
    const stringMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.75,
      metalness: 0.05,
    });
    const unitCylGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 8);
    const upperStringMesh = new THREE.Mesh(unitCylGeo, stringMat);
    const lowerStringMesh = new THREE.Mesh(unitCylGeo, stringMat);
    group.add(upperStringMesh, lowerStringMesh);

    // Brass nocking point bead where the arrow clips onto the bowstring
    const nockBead = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 10, 10), brassMat);
    group.add(nockBead);

    // Nocked arrow resting squarely on the leather shelf & clipped to nockBead
    const nockedArrow = ModelFactory.createArrow();
    group.add(nockedArrow);

    const upAxis = new THREE.Vector3(0, 1, 0);
    const topPos = new THREE.Vector3();
    const botPos = new THREE.Vector3();
    const nockPos = new THREE.Vector3();
    const segVec = new THREE.Vector3();

    const positionSegment = (mesh, pA, pB) => {
      segVec.subVectors(pB, pA);
      const len = segVec.length();
      if (len < 1e-5) return;
      mesh.position.copy(pA).addScaledVector(segVec, 0.5);
      mesh.scale.set(1, len, 1);
      mesh.quaternion.setFromUnitVectors(upAxis, segVec.normalize());
    };

    const updateDraw = (power, recoil, showNocked) => {
      const flex = power * 0.24;
      upper.pivot.rotation.x = flex;
      lower.pivot.rotation.x = -flex;
      upper.pivot.updateMatrix();
      lower.pivot.updateMatrix();

      // Compute exact limb-tip coordinates in bow-local space
      topPos.copy(upper.tipAnchor.position).applyMatrix4(upper.pivot.matrix);
      botPos.copy(lower.tipAnchor.position).applyMatrix4(lower.pivot.matrix);

      // Rest string line lies halfway between topPos and botPos
      const restZ = (topPos.z + botPos.z) * 0.5;
      const pullZ = showNocked
        ? restZ + power * 0.44
        : restZ + Math.sin(recoil * Math.PI * 6) * 0.065 * recoil;

      // Keep nocking point aligned with arrow rest height (y = 0.032)
      nockPos.set(0, 0.032, pullZ);
      nockBead.position.copy(nockPos);

      // Lock upper & lower 3D string cylinders directly onto the limb tips
      positionSegment(upperStringMesh, topPos, nockPos);
      positionSegment(lowerStringMesh, nockPos, botPos);

      nockedArrow.visible = showNocked;
      if (showNocked) {
        // Rear nock clips onto nockBead (z = pullZ), shaft rests cleanly on the leather shelf (x = -0.02, y = 0.032)
        nockedArrow.position.set(-0.018, 0.032, pullZ);
        // Subtle angle from nock center toward the arrow rest shelf so it sits flush on both
        nockedArrow.rotation.set(0, 0.018, 0);
      }
    };

    // Initialize resting geometry immediately so frame 0 has zero detached parts
    updateDraw(0, 0, true);

    return { group, updateDraw };
  }

  /**
   * Create a detailed tournament 3D carbon arrow pointing downrange along -Z.
   * Features carbon shaft, gold/blue cresting bands, brass insert collar,
   * steel field point, molded orange nock, and 3 sculpted parabolic vanes.
   */
  static createArrow() {
    const group = new THREE.Group();
    const shaftLength = 0.84;

    // 1. Sleek matte-carbon main shaft (z = -0.025 to -(shaftLength + 0.025))
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.24,
      metalness: 0.55,
    });
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0068, 0.0074, shaftLength, 12),
      shaftMat
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -shaftLength / 2 - 0.02;
    shaft.castShadow = true;
    group.add(shaft);

    // 2. Decorative tournament cresting wrap near the fletching
    const wrapMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0076, 0.0076, 0.14, 12), wrapMat);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.z = -0.105;
    group.add(wrap);

    const accentBandMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.78,
      roughness: 0.25,
    });
    for (const bz of [-0.038, -0.172]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0079, 0.0079, 0.012, 12),
        accentBandMat
      );
      band.rotation.x = Math.PI / 2;
      band.position.z = bz;
      group.add(band);
    }

    // 3. Molded bright-orange rear nock seamlessly fitted to shaft rear (z = 0)
    const nockMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 });
    const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.006, 0.028, 10), nockMat);
    nock.rotation.x = Math.PI / 2;
    nock.position.z = -0.012;
    group.add(nock);

    // 4. Brass front insert collar + tapered stainless-steel target point
    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0082, 0.0074, 0.024, 12),
      accentBandMat
    );
    ferrule.rotation.x = Math.PI / 2;
    ferrule.position.z = -shaftLength - 0.026;
    group.add(ferrule);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.0115, 0.068, 12),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.14 })
    );
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -shaftLength - 0.07;
    group.add(tip);

    // 5. Three 3D extruded parabolic fletching vanes mounted flush on the cresting wrap
    const vaneShape = new THREE.Shape();
    vaneShape.moveTo(0, 0);
    vaneShape.lineTo(0.115, 0);
    vaneShape.bezierCurveTo(0.1, 0.032, 0.035, 0.036, 0.008, 0.018);
    vaneShape.lineTo(0, 0);

    const vaneGeo = new THREE.ExtrudeGeometry(vaneShape, {
      depth: 0.0018,
      bevelEnabled: false,
    });
    vaneGeo.translate(0, 0, -0.0009);
    vaneGeo.rotateY(Math.PI / 2);

    const redVaneMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
    const whiteVaneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });

    for (let i = 0; i < 3; i++) {
      const vane = new THREE.Mesh(vaneGeo, i === 0 ? whiteVaneMat : redVaneMat);
      const angle = (i * Math.PI * 2) / 3;
      vane.position.set(Math.sin(angle) * 0.006, Math.cos(angle) * 0.006, -0.048);
      vane.rotation.z = -angle;
      group.add(vane);
    }

    return group;
  }

  /**
   * Create a 3D target rig: Olympic Board or real animated GLB model (`fox`, `soldier`, `robot`).
   */
  static createTargetRig(type, radius = 1.25, materials = {}, gltfLoader = null) {
    if (GLB_TARGET_SPECS[type] && gltfLoader) {
      return ModelFactory._createGltfTarget(type, radius, gltfLoader);
    }
    return ModelFactory._createBoardTarget(radius, materials);
  }

  static _createRailMesh() {
    const railMesh = new THREE.Mesh(
      new THREE.BoxGeometry(11.2, 0.07, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.35 })
    );
    railMesh.receiveShadow = true;
    railMesh.visible = false;
    return railMesh;
  }

  static _createGltfTarget(type, radius, gltfLoader) {
    const spec = GLB_TARGET_SPECS[type];
    const meta = TARGET_TYPES[type] ?? TARGET_TYPES.board;
    const root = new THREE.Group();
    const bossGroup = new THREE.Group();
    root.add(bossGroup);

    let mixer = null;
    let idleAction = null;
    let moveAction = null;
    let activeIsMoving = null;
    let loadedModel = null;

    gltfLoader.load(spec.path, (gltf) => {
      const model = gltf.scene;
      model.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);

      const scale = size.y > 0.001 ? spec.desiredHeight / size.y : 1;
      model.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);

      model.position.set(-scaledCenter.x, -scaledBox.min.y - meta.centerY, -scaledCenter.z);
      model.rotation.y = spec.facingRotY;

      bossGroup.add(model);
      loadedModel = model;

      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        const findClip = (name) =>
          gltf.animations.find((c) => c.name.toLowerCase().includes(name.toLowerCase())) ??
          gltf.animations[0];

        idleAction = mixer.clipAction(findClip(spec.idleClip));
        moveAction = mixer.clipAction(findClip(spec.moveClip));
        idleAction.play();
        activeIsMoving = false;
      }
    });

    const setRadius = (r) => {
      const s = Math.max(0.75, r / 1.25);
      bossGroup.scale.setScalar(s);
    };
    setRadius(radius);

    const animate = (dt, isMoving) => {
      if (!mixer) return;
      if (activeIsMoving !== isMoving && idleAction && moveAction) {
        activeIsMoving = isMoving;
        if (isMoving) {
          idleAction.fadeOut(0.25);
          moveAction.reset().fadeIn(0.25).play();
        } else {
          moveAction.fadeOut(0.25);
          idleAction.reset().fadeIn(0.25).play();
        }
      }
      mixer.update(dt);
      if (loadedModel) {
        loadedModel.rotation.y = spec.facingRotY;
      }
    };

    return { group: root, bossGroup, railMesh: ModelFactory._createRailMesh(), setRadius, animate };
  }

  static _createBoardTarget(radius, { woodMaterial = null }) {
    const root = new THREE.Group();
    const bossGroup = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 1024, 1024);

    for (const ring of [...SCORING_RINGS].reverse()) {
      ctx.beginPath();
      ctx.arc(512, 512, 504 * ring.maxRatio, 0, Math.PI * 2);
      ctx.fillStyle = ring.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = ring.color === '#1e293b' ? '#475569' : '#0f172a';
      ctx.stroke();
    }

    const faceTex = new THREE.CanvasTexture(canvas);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    const strawMat = new THREE.MeshStandardMaterial({ color: 0xc89b54, roughness: 0.94 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.78 });

    const bossMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.38, 48),
      [strawMat, faceMat, strawMat]
    );
    bossMesh.rotation.x = Math.PI / 2;
    bossMesh.position.z = -0.19;
    bossMesh.castShadow = true;
    bossMesh.receiveShadow = true;
    bossGroup.add(bossMesh);

    const standWood = woodMaterial ?? new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.9 });
    const legGeo = new THREE.CylinderGeometry(0.055, 0.065, 2.38, 10);
    for (const [lx, lz, rz, rx] of [
      [-0.68, -0.35, -0.22, 0],
      [0.68, -0.35, 0.22, 0],
      [0, -0.95, 0, 0.34],
    ]) {
      const leg = new THREE.Mesh(legGeo, standWood);
      leg.position.set(lx, -0.58, lz);
      leg.rotation.set(rx, 0, rz);
      leg.castShadow = true;
      bossGroup.add(leg);
    }

    root.add(bossGroup);
    const setRadius = (r) => bossMesh.scale.set(r, 1, r);
    setRadius(radius);

    return { group: root, bossGroup, railMesh: ModelFactory._createRailMesh(), setRadius, animate: () => {} };
  }
}

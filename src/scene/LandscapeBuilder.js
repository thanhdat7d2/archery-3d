import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Tree, TreePreset } from '@dgreenheck/ez-tree';
import { PLAYER_BOUNDS } from '../config/constants.js';

/**
 * Multi-world 3D environment builder where EVERY world uses real 360° HDRIs or
 * photorealistic equirectangular panoramas, real 1K PBR ground textures, and
 * real 3D GLTF photogrammetry models (`fern_02`, `wild_rooibos_bush`, `boulder_01`)
 * + genuine 3D branching trees (`@dgreenheck/ez-tree`).
 */
export class LandscapeBuilder {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ hemi: THREE.HemisphereLight, sun: THREE.DirectionalLight }} lights
   */
  constructor(scene, renderer, lights) {
    this.scene = scene;
    this.renderer = renderer;
    this.lights = lights;
    this.textureLoader = new THREE.TextureLoader();
    this.rgbeLoader = new RGBELoader();
    this.gltfLoader = new GLTFLoader();

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.currentWorldId = null;
    this.windFlagPivot = null;
    this.windFlagCloth = null;
    this._flagBasePositions = null;

    /** @type {Array<(dt: number, elapsed: number, wind: {x:number,y:number}) => void>} */
    this._worldAnimators = [];

    this.materials = {};
    this._envCache = new Map();
    this._treeArchetypes = null;
    this._gltfCache = new Map();
  }

  build(initialWorld = 'alpine') {
    this.materials = {
      woodMaterial: this._createPbrMaterial('wood', { repeatX: 1, repeatY: 2, roughness: 0.88, metalness: 0.04 }),
      leatherMaterial: this._createPbrMaterial('leather', { repeatX: 2, repeatY: 2, roughness: 0.72, metalness: 0.05 }),
      metalMaterial: this._createPbrMaterial('metal', { repeatX: 2, repeatY: 2, roughness: 0.32, metalness: 0.78 }),
      fabricMaterial: this._createPbrMaterial('fabric', { repeatX: 2, repeatY: 1, roughness: 0.85, metalness: 0.0 }),
      grassMaterial: this._createPbrMaterial('grass', { repeatX: 46, repeatY: 46, roughness: 0.94, metalness: 0.0 }),
      lavaRockMaterial: this._createPbrMaterial('lava_rock', { repeatX: 38, repeatY: 38, roughness: 0.88, metalness: 0.12 }),
      oceanSandMaterial: this._createPbrMaterial('ocean_sand', { repeatX: 42, repeatY: 42, roughness: 0.92, metalness: 0.0 }),
      cityDeckMaterial: this._createPbrMaterial('city_deck', { repeatX: 44, repeatY: 44, roughness: 0.72, metalness: 0.1 }),
    };

    this.loadWorld(initialWorld);

    return {
      woodMaterial: this.materials.woodMaterial,
      leatherMaterial: this.materials.leatherMaterial,
      metalMaterial: this.materials.metalMaterial,
    };
  }

  loadWorld(worldId) {
    if (this.currentWorldId === worldId) return;
    this.currentWorldId = worldId;

    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this._worldAnimators = [];
    this.windFlagPivot = null;
    this.windFlagCloth = null;
    this._flagBasePositions = null;

    switch (worldId) {
      case 'alien':
        this._buildAlienWorld();
        break;
      case 'lava':
        this._buildLavaWorld();
        break;
      case 'underwater':
        this._buildUnderwaterWorld();
        break;
      case 'jungle':
        this._buildJungleWorld();
        break;
      case 'city':
        this._buildCityWorld();
        break;
      case 'alpine':
      default:
        this._buildAlpineWorld();
        break;
    }

    this._buildShootingBox(worldId);
    this._buildDistanceMarkers();
    this._buildRealisticWindFlag(worldId);
  }

  _loadTexture(path, { srgb = false, repeatX = 1, repeatY = 1 } = {}) {
    const tex = this.textureLoader.load(path);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeatX !== 1 || repeatY !== 1) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    }
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  _createPbrMaterial(prefix, { repeatX = 1, repeatY = 1, roughness = 0.85, metalness = 0.05 } = {}) {
    return new THREE.MeshStandardMaterial({
      map: this._loadTexture(`./assets/textures/${prefix}_diff.jpg`, { srgb: true, repeatX, repeatY }),
      normalMap: this._loadTexture(`./assets/textures/${prefix}_nor.jpg`, { repeatX, repeatY }),
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: this._loadTexture(`./assets/textures/${prefix}_rough.jpg`, { repeatX, repeatY }),
      roughness,
      metalness,
    });
  }

  /**
   * Load and apply a real 360° HDRI or photographic equirectangular panorama as both
   * `scene.background` and `scene.environment` (IBL).
   */
  _applyEnvironmentPanorama(worldId, path, { isHdr = false, rotY = 0, envIntensity = 0.88 } = {}) {
    const apply = (tex) => {
      if (this.currentWorldId !== worldId) return;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = tex;
      this.scene.environment = tex;
      if ('backgroundRotation' in this.scene) {
        this.scene.backgroundRotation.set(0, rotY, 0);
        this.scene.environmentRotation.set(0, rotY, 0);
      }
      this.scene.environmentIntensity = envIntensity;
    };

    if (this._envCache.has(path)) {
      apply(this._envCache.get(path));
      return;
    }

    if (isHdr) {
      this.rgbeLoader.load(path, (hdrTex) => {
        this._envCache.set(path, hdrTex);
        apply(hdrTex);
      });
    } else {
      this.textureLoader.load(path, (imgTex) => {
        imgTex.colorSpace = THREE.SRGBColorSpace;
        this._envCache.set(path, imgTex);
        apply(imgTex);
      });
    }
  }

  _getTerrainHeight(x, z, hillScale = 1.0) {
    const absX = Math.abs(x);
    const laneFactor = THREE.MathUtils.smoothstep(absX, 10.5, 28);
    const hills =
      (Math.sin(x * 0.048) * Math.cos(z * 0.042) * 3.2 +
        Math.sin(x * 0.11 + z * 0.07) * 0.85 +
        Math.max(0, (absX - 28) * 0.11)) *
      hillScale;
    const backRise = z < -95 ? Math.pow((-95 - z) * 0.055, 1.55) * hillScale : 0;
    return hills * laneFactor + backRise;
  }

  _addTerrainMesh(material, hillScale = 1.0) {
    const geo = new THREE.PlaneGeometry(280, 280, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const worldZ = pos.getZ(i) - 55;
      pos.setY(i, this._getTerrainHeight(x, worldZ, hillScale));
    }
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, material);
    terrain.position.z = -55;
    terrain.receiveShadow = true;
    this.worldGroup.add(terrain);
  }

  _getTreeArchetypes() {
    if (this._treeArchetypes) return this._treeArchetypes;
    const presetKeys = Object.keys(TreePreset);
    const preferred = ['Pine Medium', 'Pine Small', 'Oak Small', 'Aspen Medium'].filter((k) =>
      presetKeys.includes(k)
    );
    const chosen = preferred.length > 0 ? preferred : presetKeys.slice(0, 3);
    this._treeArchetypes = chosen.map((name, idx) => {
      const tree = new Tree();
      tree.loadPreset(name);
      tree.options.seed = 1000 + idx * 137;
      tree.generate();
      tree.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      return tree;
    });
    return this._treeArchetypes;
  }

  _loadGltfCached(path, worldTag, onReady) {
    if (this._gltfCache.has(path)) {
      if (this.currentWorldId === worldTag) onReady(this._gltfCache.get(path));
      return;
    }
    this.gltfLoader.load(path, (gltf) => {
      gltf.scene.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      this._gltfCache.set(path, gltf.scene);
      if (this.currentWorldId === worldTag) onReady(gltf.scene);
    });
  }

  _makeSeededRand(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  /**
   * Clone a real 3D photogrammetry GLTF model and optionally apply a biome material tint.
   */
  _cloneWithTint(base, tintHex = null, emissiveHex = null, emissiveIntensity = 0) {
    const clone = base.clone();
    if (tintHex !== null || emissiveHex !== null) {
      clone.traverse((n) => {
        if (n.isMesh && n.material) {
          n.material = n.material.clone();
          if (tintHex !== null) n.material.color.multiply(new THREE.Color(tintHex));
          if (emissiveHex !== null) {
            n.material.emissive = new THREE.Color(emissiveHex);
            n.material.emissiveIntensity = emissiveIntensity;
          }
        }
      });
    }
    return clone;
  }

  // =========================================================================
  // WORLD 1: ALPINE MEADOW (Real Alps 2K HDRI + PBR Grass + ez-tree + GLTF)
  // =========================================================================
  _buildAlpineWorld() {
    this.scene.fog = new THREE.FogExp2(0xcfe4f7, 0.0036);
    this.lights.hemi.color.setHex(0xe0f2fe);
    this.lights.hemi.groundColor.setHex(0x3f6212);
    this.lights.hemi.intensity = 0.65;
    this.lights.sun.color.setHex(0xfffbeb);
    this.lights.sun.intensity = 1.85;

    this._applyEnvironmentPanorama('alpine', './assets/env/alps_field_2k.hdr', {
      isHdr: true,
      rotY: Math.PI * 0.62,
      envIntensity: 0.9,
    });

    this._addTerrainMesh(this.materials.grassMaterial, 1.0);
    this._scatterTrees('alpine', 32, 13.5, 0.24, 0.18);
    this._scatterPhotogrammetry('alpine', { scaleMult: 1.0 });
    this._buildWoodenFences();
  }

  // =========================================================================
  // WORLD 2: GREEN ALIEN WORLD (Real 360° Alien Panorama + Real 3D Boulders & Flora)
  // =========================================================================
  _buildAlienWorld() {
    this.scene.fog = new THREE.FogExp2(0x164e3f, 0.0052);
    this.lights.hemi.color.setHex(0x6ee7b7);
    this.lights.hemi.groundColor.setHex(0x064e3b);
    this.lights.hemi.intensity = 0.9;
    this.lights.sun.color.setHex(0xa7f3d0);
    this.lights.sun.intensity = 1.65;

    this._applyEnvironmentPanorama('alien', './assets/env/alien_pano.jpg', {
      isHdr: false,
      rotY: Math.PI * 0.5,
      envIntensity: 0.95,
    });

    const alienGround = this.materials.grassMaterial.clone();
    alienGround.color.setHex(0x34d399);
    this._addTerrainMesh(alienGround, 1.25);

    // Real 3D photogrammetry rocks, bushes & ferns tinted with bioluminescent alien hues
    this._scatterPhotogrammetry('alien', {
      scaleMult: 1.35,
      rockTint: 0x2dd4bf,
      rockEmissive: 0x0f766e,
      floraTint: 0x4ade80,
      floraEmissive: 0x059669,
    });
  }

  // =========================================================================
  // WORLD 3: VOLCANIC LAVA WORLD (Real 360° Lava Panorama + PBR Volcanic Rock + GLTF Boulders)
  // =========================================================================
  _buildLavaWorld() {
    this.scene.fog = new THREE.FogExp2(0x3b1206, 0.0055);
    this.lights.hemi.color.setHex(0xfdba74);
    this.lights.hemi.groundColor.setHex(0x7c2d12);
    this.lights.hemi.intensity = 0.85;
    this.lights.sun.color.setHex(0xfb923c);
    this.lights.sun.intensity = 1.85;

    this._applyEnvironmentPanorama('lava', './assets/env/lava_pano.jpg', {
      isHdr: false,
      rotY: Math.PI * 0.5,
      envIntensity: 0.9,
    });

    const lavaGround = this.materials.lavaRockMaterial.clone();
    lavaGround.color.setHex(0x57534e);
    lavaGround.emissive = new THREE.Color(0x7c2d12);
    lavaGround.emissiveIntensity = 0.25;
    this._addTerrainMesh(lavaGround, 1.35);

    // Real 3D photogrammetry volcanic basalt boulders with subtle molten underglow
    const rand = this._makeSeededRand(666);
    this._loadGltfCached('./assets/models/boulder_01/boulder_01.gltf', 'lava', (base) => {
      for (let i = 0; i < 28; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (11.5 + rand() * 34);
        const z = 4 - rand() * 92;
        const y = this._getTerrainHeight(x, z, 1.35) - 0.3;
        const rock = this._cloneWithTint(base, 0x332d2b, 0x9a3412, 0.22);
        rock.position.set(x, y, z);
        rock.rotation.set(0, rand() * Math.PI * 2, 0);
        rock.scale.setScalar(1.3 + rand() * 2.4);
        this.worldGroup.add(rock);
      }
    });

    // Rising glowing ember sparks
    const embers = [];
    const emberGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    for (let i = 0; i < 55; i++) {
      const m = new THREE.Mesh(emberGeo, emberMat);
      m.position.set((rand() - 0.5) * 32, rand() * 14, 4 - rand() * 75);
      this.worldGroup.add(m);
      embers.push({ mesh: m, speed: 1.4 + rand() * 2.4, drift: (rand() - 0.5) * 1.1 });
    }
    this._worldAnimators.push((dt) => {
      for (const e of embers) {
        e.mesh.position.y += e.speed * dt;
        e.mesh.position.x += e.drift * dt;
        if (e.mesh.position.y > 16) e.mesh.position.y = 0.2;
      }
    });
  }

  // =========================================================================
  // WORLD 4: UNDERWATER CORAL OCEAN (Real 360° Underwater Panorama + PBR Sand + GLTF Reef Rocks/Flora)
  // =========================================================================
  _buildUnderwaterWorld() {
    this.scene.fog = new THREE.FogExp2(0x0c4a6e, 0.0065);
    this.lights.hemi.color.setHex(0x67e8f9);
    this.lights.hemi.groundColor.setHex(0x0e7490);
    this.lights.hemi.intensity = 1.05;
    this.lights.sun.color.setHex(0xbae6fd);
    this.lights.sun.intensity = 1.5;

    this._applyEnvironmentPanorama('underwater', './assets/env/underwater_pano.jpg', {
      isHdr: false,
      rotY: Math.PI * 0.5,
      envIntensity: 1.0,
    });

    this._addTerrainMesh(this.materials.oceanSandMaterial, 1.1);

    // Real 3D photogrammetry reef rocks & sea flora
    this._scatterPhotogrammetry('underwater', {
      scaleMult: 1.25,
      rockTint: 0x67e8f9,
      floraTint: 0x2dd4bf,
    });

    // Subtle rising underwater air bubbles
    const rand = this._makeSeededRand(314);
    const bubbles = [];
    const bubbleGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const bubbleMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.55,
      roughness: 0.08,
    });
    for (let i = 0; i < 55; i++) {
      const b = new THREE.Mesh(bubbleGeo, bubbleMat);
      b.position.set((rand() - 0.5) * 30, rand() * 14, 4 - rand() * 72);
      this.worldGroup.add(b);
      bubbles.push({ mesh: b, speed: 0.9 + rand() * 1.6 });
    }
    this._worldAnimators.push((dt) => {
      for (const b of bubbles) {
        b.mesh.position.y += b.speed * dt;
        if (b.mesh.position.y > 16) b.mesh.position.y = 0.2;
      }
    });
  }

  // =========================================================================
  // WORLD 5: TROPICAL JUNGLE (Real Rainforest HDRI + Real ez-tree + Oversized GLTF Ferns)
  // =========================================================================
  _buildJungleWorld() {
    this.scene.fog = new THREE.FogExp2(0x1b4332, 0.0052);
    this.lights.hemi.color.setHex(0xd9f99d);
    this.lights.hemi.groundColor.setHex(0x14532d);
    this.lights.hemi.intensity = 0.85;
    this.lights.sun.color.setHex(0xfef08a);
    this.lights.sun.intensity = 1.7;

    this._applyEnvironmentPanorama('jungle', './assets/env/jungle_rainforest_1k.hdr', {
      isHdr: true,
      rotY: Math.PI * 0.25,
      envIntensity: 0.9,
    });

    const jungleGround = this.materials.grassMaterial.clone();
    jungleGround.color.setHex(0x86efac);
    this._addTerrainMesh(jungleGround, 1.15);

    this._scatterTrees('jungle', 40, 12.0, 0.28, 0.22);
    this._scatterPhotogrammetry('jungle', { scaleMult: 1.75 });
  }

  // =========================================================================
  // WORLD 6: SKYLINE CITY (Real Daylight City Rooftop HDRI + PBR Concrete Deck)
  // =========================================================================
  _buildCityWorld() {
    this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.0028);
    this.lights.hemi.color.setHex(0xe0f2fe);
    this.lights.hemi.groundColor.setHex(0x64748b);
    this.lights.hemi.intensity = 0.85;
    this.lights.sun.color.setHex(0xffffff);
    this.lights.sun.intensity = 1.85;

    this._applyEnvironmentPanorama('city', './assets/env/city_day_1k.hdr', {
      isHdr: true,
      rotY: Math.PI * 0.15,
      envIntensity: 1.0,
    });

    // Real photographic PBR concrete tile rooftop deck
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 180),
      this.materials.cityDeckMaterial
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.z = -45;
    deck.receiveShadow = true;
    this.worldGroup.add(deck);

    // Metallic rooftop safety railings & real photogrammetry planter shrubs
    const railMat = this.materials.metalMaterial;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 92), railMat);
      rail.position.set(side * 10.6, 1.05, -40);
      this.worldGroup.add(rail);
      for (let z = 6; z >= -84; z -= 8) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8), railMat);
        post.position.set(side * 10.6, 0.52, z);
        this.worldGroup.add(post);
      }
    }

    this._loadGltfCached('./assets/models/fern_02/fern_02.gltf', 'city', (base) => {
      for (const side of [-1, 1]) {
        for (let z = -6; z >= -66; z -= 15) {
          const planter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 1.1), this.materials.cityDeckMaterial);
          planter.position.set(side * 9.8, 0.32, z);
          planter.castShadow = true;
          this.worldGroup.add(planter);

          const fern = base.clone();
          fern.position.set(side * 9.8, 0.62, z);
          fern.scale.setScalar(1.0);
          this.worldGroup.add(fern);
        }
      }
    });
  }

  // =========================================================================
  // SHARED REAL 3D ASSET SCATTERERS
  // =========================================================================
  _scatterTrees(worldTag, count, minOffsetX, minScale, scaleRange) {
    const archetypes = this._getTreeArchetypes();
    const rand = this._makeSeededRand(worldTag === 'jungle' ? 409 : 211);
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (minOffsetX + rand() * 44);
      const z = 8 - rand() * 112;
      const y = this._getTerrainHeight(x, z, worldTag === 'jungle' ? 1.15 : 1.0) - 0.15;
      const instance = archetypes[i % archetypes.length].clone();
      instance.position.set(x, y, z);
      instance.rotation.y = rand() * Math.PI * 2;
      instance.scale.setScalar(minScale + rand() * scaleRange);
      this.worldGroup.add(instance);
    }
  }

  _scatterPhotogrammetry(
    worldTag,
    { scaleMult = 1.0, rockTint = null, rockEmissive = null, floraTint = null, floraEmissive = null } = {}
  ) {
    const rand = this._makeSeededRand(521);

    this._loadGltfCached('./assets/models/wild_rooibos_bush/wild_rooibos_bush.gltf', worldTag, (base) => {
      for (let i = 0; i < 34; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (9.8 + rand() * 24);
        const z = 4 - rand() * 86;
        const bush = this._cloneWithTint(base, floraTint, floraEmissive, floraEmissive ? 0.35 : 0);
        bush.position.set(x, this._getTerrainHeight(x, z) - 0.05, z);
        bush.rotation.y = rand() * Math.PI * 2;
        bush.scale.setScalar((1.1 + rand() * 1.3) * scaleMult);
        this.worldGroup.add(bush);
      }
    });

    this._loadGltfCached('./assets/models/fern_02/fern_02.gltf', worldTag, (base) => {
      for (let i = 0; i < 50; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (8.5 + rand() * 14);
        const z = 4 - rand() * 75;
        const fern = this._cloneWithTint(base, floraTint, floraEmissive, floraEmissive ? 0.25 : 0);
        fern.position.set(x, this._getTerrainHeight(x, z) - 0.02, z);
        fern.rotation.y = rand() * Math.PI * 2;
        fern.scale.setScalar((0.85 + rand() * 0.95) * scaleMult);
        this.worldGroup.add(fern);
      }
    });

    this._loadGltfCached('./assets/models/boulder_01/boulder_01.gltf', worldTag, (base) => {
      for (let i = 0; i < 16; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (12.5 + rand() * 26);
        const z = 2 - rand() * 84;
        const rock = this._cloneWithTint(base, rockTint, rockEmissive, rockEmissive ? 0.35 : 0);
        rock.position.set(x, this._getTerrainHeight(x, z) - 0.25, z);
        rock.rotation.y = rand() * Math.PI * 2;
        rock.scale.setScalar((1.1 + rand() * 1.5) * scaleMult);
        this.worldGroup.add(rock);
      }
    });
  }

  _buildWoodenFences() {
    const woodMat = this.materials.woodMaterial;
    const postGeo = new THREE.CylinderGeometry(0.085, 0.095, 1.18, 10);
    const railGeo = new THREE.CylinderGeometry(0.045, 0.045, 10.0, 8);
    railGeo.rotateX(Math.PI / 2);

    for (const side of [-1, 1]) {
      const fenceX = side * 10.4;
      for (let z = 6; z >= -84; z -= 10) {
        const y = this._getTerrainHeight(fenceX, z);
        const post = new THREE.Mesh(postGeo, woodMat);
        post.position.set(fenceX, y + 0.56, z);
        post.castShadow = true;
        this.worldGroup.add(post);

        if (z > -84) {
          const midY = this._getTerrainHeight(fenceX, z - 5);
          const topRail = new THREE.Mesh(railGeo, woodMat);
          topRail.position.set(fenceX, midY + 0.92, z - 5);
          this.worldGroup.add(topRail);

          const lowRail = new THREE.Mesh(railGeo, woodMat);
          lowRail.position.set(fenceX, midY + 0.46, z - 5);
          this.worldGroup.add(lowRail);
        }
      }
    }
  }

  _buildShootingBox(worldId) {
    const { minX, maxX, minZ, maxZ } = PLAYER_BOUNDS;
    const width = maxX - minX;
    const depth = maxZ - minZ;

    const lineColor = worldId === 'lava' ? 0xfbbf24 : worldId === 'alien' ? 0x6ee7b7 : 0xffffff;
    const lineMat = new THREE.MeshStandardMaterial({
      color: lineColor,
      emissive: worldId === 'lava' || worldId === 'alien' ? lineColor : 0x000000,
      emissiveIntensity: 0.35,
      roughness: 0.9,
      transparent: true,
      opacity: 0.72,
    });

    const makeBorder = (w, d, x, z) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.03, z);
      mesh.receiveShadow = true;
      this.worldGroup.add(mesh);
    };

    makeBorder(width, 0.14, 0, minZ);
    makeBorder(width, 0.14, 0, maxZ);
    makeBorder(0.14, depth, minX, 0);
    makeBorder(0.14, depth, maxX, 0);

    const bollardMat = worldId === 'city' ? this.materials.metalMaterial : this.materials.woodMaterial;
    const bollardGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.52, 10);
    for (const [cx, cz] of [
      [minX, minZ],
      [maxX, minZ],
      [minX, maxZ],
      [maxX, maxZ],
    ]) {
      const bollard = new THREE.Mesh(bollardGeo, bollardMat);
      bollard.position.set(cx, 0.25, cz);
      bollard.castShadow = true;
      this.worldGroup.add(bollard);
    }
  }

  _buildDistanceMarkers() {
    const woodMat = this.materials.woodMaterial;
    for (const dist of [25, 35, 45, 55, 65, 75]) {
      const group = new THREE.Group();
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.98, 8), woodMat);
      stake.position.y = 0.46;
      stake.castShadow = true;
      group.add(stake);

      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 160, 80);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, 152, 72);
      ctx.fillStyle = '#0f172a';
      ctx.font = '800 36px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${dist}m`, 80, 42);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const plaque = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.38, 0.05),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })
      );
      plaque.position.set(0, 0.86, 0.04);
      plaque.castShadow = true;
      group.add(plaque);

      group.position.set(-8.2, 0, -dist);
      this.worldGroup.add(group);
    }
  }

  _buildRealisticWindFlag(worldId) {
    const poleGroup = new THREE.Group();
    poleGroup.position.set(8.2, 0, -18);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.065, 4.7, 14),
      this.materials.metalMaterial
    );
    pole.position.y = 2.35;
    pole.castShadow = true;
    poleGroup.add(pole);

    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.22 });
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), brassMat);
    finial.position.y = 4.74;
    poleGroup.add(finial);

    const primaryColor =
      worldId === 'alien' ? '#10b981' : worldId === 'underwater' ? '#06b6d4' : '#dc2626';

    const flagCanvas = document.createElement('canvas');
    flagCanvas.width = 512;
    flagCanvas.height = 256;
    const ctx = flagCanvas.getContext('2d');
    const stripes = [primaryColor, '#f8fafc', primaryColor, '#f8fafc', primaryColor];
    const sw = 512 / stripes.length;
    stripes.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(i * sw, 0, sw + 1, 256);
    });
    const stripeTex = new THREE.CanvasTexture(flagCanvas);
    stripeTex.colorSpace = THREE.SRGBColorSpace;

    const pivot = new THREE.Group();
    pivot.position.set(0, 4.28, 0);

    for (const ry of [0.24, -0.24]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 16), brassMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0.02, ry, 0);
      pivot.add(ring);
    }

    const clothGeo = new THREE.PlaneGeometry(2.1, 0.72, 18, 6);
    clothGeo.translate(1.08, 0, 0);
    const pos = clothGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setY(i, y * (1.0 - (x / 2.2) * 0.55));
    }
    this._flagBasePositions = new Float32Array(pos.array);

    const clothMat = new THREE.MeshStandardMaterial({
      map: stripeTex,
      normalMap: this.materials.fabricMaterial.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: this.materials.fabricMaterial.roughnessMap,
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.castShadow = true;
    pivot.add(cloth);
    poleGroup.add(pivot);

    this.worldGroup.add(poleGroup);
    this.windFlagPivot = pivot;
    this.windFlagCloth = cloth;
  }

  update(dt, elapsed, wind) {
    for (const fn of this._worldAnimators) {
      fn(dt, elapsed, wind);
    }

    if (!this.windFlagPivot || !this.windFlagCloth || !this._flagBasePositions) return;

    const windMag = Math.abs(wind.x);
    const targetRotY = wind.x >= 0 ? 0 : Math.PI;
    this.windFlagPivot.rotation.y +=
      (targetRotY - this.windFlagPivot.rotation.y) * Math.min(1, dt * 6);
    this.windFlagPivot.rotation.z = THREE.MathUtils.lerp(-0.55, 0.02, Math.min(1, windMag / 7.5));

    const pos = this.windFlagCloth.geometry.attributes.position;
    const base = this._flagBasePositions;
    const waveSpeed = 4.6 + windMag * 1.55;
    const waveAmp = 0.045 + Math.min(0.22, windMag * 0.026);

    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const u = Math.max(0, (bx - 0.03) / 2.1);
      const wave1 = Math.sin(elapsed * waveSpeed - bx * 3.4) * waveAmp * u;
      const wave2 = Math.sin(elapsed * waveSpeed * 1.7 - bx * 6.2 + by * 2.0) * (waveAmp * 0.35) * u * u;
      const sag = -0.14 * u * u * Math.max(0.15, 1 - windMag / 8);
      pos.setXYZ(i, bx, by + sag, wave1 + wave2);
    }
    pos.needsUpdate = true;
    this.windFlagCloth.geometry.computeVertexNormals();
  }
}

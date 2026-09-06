/**
 * Central 3D simulation, ballistics, walkable bounds, environments,
 * target types, game modes, and scoring configuration.
 * Coordinate convention (right-handed, Three.js standard):
 *   +X = right, +Y = up, -Z = downrange (away from archer).
 */

export const GAME_STATES = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'game_over',
});

export const ENVIRONMENTS = Object.freeze({
  alpine: Object.freeze({
    id: 'alpine',
    label: 'Alpine Meadow',
    badge: 'Alps HDRI',
    accent: '#0284c7',
  }),
  alien: Object.freeze({
    id: 'alien',
    label: 'Green Alien World',
    badge: 'Exoplanet',
    accent: '#10b981',
  }),
  lava: Object.freeze({
    id: 'lava',
    label: 'Volcanic Lava',
    badge: 'Caldera',
    accent: '#ea580c',
  }),
  underwater: Object.freeze({
    id: 'underwater',
    label: 'Coral Ocean',
    badge: 'Underwater',
    accent: '#0891b2',
  }),
  jungle: Object.freeze({
    id: 'jungle',
    label: 'Tropical Jungle',
    badge: 'Rainforest',
    accent: '#15803d',
  }),
  city: Object.freeze({
    id: 'city',
    label: 'Skyline City',
    badge: 'Rooftop',
    accent: '#4f46e5',
  }),
});

export const TARGET_TYPES = Object.freeze({
  mixed: Object.freeze({
    id: 'mixed',
    label: 'Mixed Targets',
    description: 'Cycles through Board, Wild Fox, Soldier & Robot.',
  }),
  board: Object.freeze({
    id: 'board',
    label: 'Olympic Board',
    description: 'Classic 10-ring straw competition target.',
    centerY: 1.65,
    radiusScale: 1.0,
    bullseyeLabel: 'X-RING',
    innerLabel: 'GOLD',
    midLabel: 'RED RING',
    outerLabel: 'OUTER RING',
  }),
  fox: Object.freeze({
    id: 'fox',
    label: 'Wild Fox (3D)',
    description: 'Animated 3D glTF wild fox with vital-zone scoring.',
    centerY: 1.05,
    radiusScale: 1.0,
    bullseyeLabel: 'VITAL SHOT',
    innerLabel: 'HEART ZONE',
    midLabel: 'BODY HIT',
    outerLabel: 'GRAZE',
  }),
  soldier: Object.freeze({
    id: 'soldier',
    label: '3D Soldier',
    description: 'Animated 3D glTF tactical soldier target.',
    centerY: 1.25,
    radiusScale: 0.98,
    bullseyeLabel: 'BULLSEYE',
    innerLabel: 'CENTER MASS',
    midLabel: 'ARMOR HIT',
    outerLabel: 'GRAZE',
  }),
  robot: Object.freeze({
    id: 'robot',
    label: 'Sci-Fi Robot',
    description: 'Animated 3D glTF mech robot with core scoring.',
    centerY: 1.25,
    radiusScale: 0.98,
    bullseyeLabel: 'CORE HIT',
    innerLabel: 'CHEST UNIT',
    midLabel: 'CHASSIS HIT',
    outerLabel: 'DEFLECT',
  }),
});

export const MIXED_TARGET_SEQUENCE = Object.freeze(['board', 'fox', 'soldier', 'robot']);

export const GAME_MODES = Object.freeze({
  championship: Object.freeze({
    id: 'championship',
    label: 'Championship',
    tagline: 'Escalating Range',
    description: '12 arrows across 25m–65m targets. Bullseyes grant +2 arrows.',
    startingArrows: 12,
    infiniteArrows: false,
    roundDuration: null,
    distances: [25, 35, 45, 55, 65],
    shotsPerStage: 3,
    movingTargetFromStage: 2,
    windScale: 1.0,
    targetRadius: 1.25,
    scoreMultiplier: 1,
  }),
  timeAttack: Object.freeze({
    id: 'timeAttack',
    label: 'Time Attack',
    tagline: '60s Rapid Range',
    description: '60 seconds, unlimited arrows, moving 35m target. Chain streaks.',
    startingArrows: Infinity,
    infiniteArrows: true,
    roundDuration: 60,
    distances: [35],
    shotsPerStage: 3,
    movingTargetFromStage: 0,
    windScale: 0.7,
    targetRadius: 1.3,
    scoreMultiplier: 1,
  }),
  windMaster: Object.freeze({
    id: 'windMaster',
    label: 'Wind Master',
    tagline: 'Pro Long-Range',
    description: '55m–75m moving targets, strong crosswinds, 2x score.',
    startingArrows: 10,
    infiniteArrows: false,
    roundDuration: null,
    distances: [55, 65, 75],
    shotsPerStage: 3,
    movingTargetFromStage: 0,
    windScale: 1.85,
    targetRadius: 1.08,
    scoreMultiplier: 2,
  }),
});

export const PLAYER_BOUNDS = Object.freeze({
  minX: -8.0,
  maxX: 8.0,
  minZ: -5.0,
  maxZ: 5.0,
  walkSpeed: 5.0, // m/s
});

export const PHYSICS = Object.freeze({
  MAX_DELTA_TIME: 0.05,
  GRAVITY: -9.81, // m/s^2
  BOW_POS: Object.freeze({ x: 0, y: 1.65, z: 0 }),
  MIN_LAUNCH_SPEED: 26, // m/s at minimum draw
  MAX_LAUNCH_SPEED: 62, // m/s at full draw
  MIN_DRAW_TO_FIRE: 0.14,
  DRAW_CHARGE_RATE: 1.05,
  HOLD_STEADY_LIMIT: 2.8,
  // Wide panoramic camera look range: +/-140 deg yaw (280 deg sweep) & +/-41 deg pitch
  MAX_YAW_RAD: Math.PI * 0.78,
  MAX_PITCH_RAD: 0.72,
  BASE_WIND_MAX: 6.5,
  WIND_DRAG_FACTOR: 0.42,
  BULLSEYE_BONUS_ARROWS: 2,
  MAX_STUCK_ARROWS: 10,
  TARGET_CENTER_Y: 1.65,
  TARGET_RAIL_HALF_SPAN: 4.8,
});

export const SCORING_RINGS = Object.freeze([
  Object.freeze({ name: 'X-RING', points: 10, maxRatio: 0.16, color: '#eab308', isBullseye: true }),
  Object.freeze({ name: 'GOLD', points: 9, maxRatio: 0.30, color: '#facc15', isBullseye: true }),
  Object.freeze({ name: 'RED', points: 8, maxRatio: 0.48, color: '#ef4444', isBullseye: false }),
  Object.freeze({ name: 'RED OUTER', points: 7, maxRatio: 0.62, color: '#dc2626', isBullseye: false }),
  Object.freeze({ name: 'BLUE', points: 5, maxRatio: 0.78, color: '#2563eb', isBullseye: false }),
  Object.freeze({ name: 'BLACK', points: 3, maxRatio: 0.90, color: '#1e293b', isBullseye: false }),
  Object.freeze({ name: 'WHITE', points: 1, maxRatio: 1.0, color: '#f8fafc', isBullseye: false }),
]);

export const DIFFICULTY = Object.freeze({
  STREAK_COMBO_STEP: 3,
  MAX_COMBO_MULTIPLIER: 3,
});

export const STORAGE_KEYS = Object.freeze({
  HIGH_SCORES: 'archery_precision_3d_scores_v1',
  SETTINGS: 'archery_precision_3d_settings_v2',
});

export const EVENTS = Object.freeze({
  STATE_CHANGED: 'state:changed',
  HUD_UPDATED: 'hud:updated',
  DRAW_UPDATED: 'draw:updated',
  ARROW_FIRED: 'arrow:fired',
  TARGET_HIT: 'target:hit',
  TARGET_MISSED: 'target:missed',
  STAGE_CHANGED: 'stage:changed',
  WIND_CHANGED: 'wind:changed',
  ENVIRONMENT_CHANGED: 'environment:changed',
  TARGET_TYPE_CHANGED: 'targetType:changed',
  GAME_OVER: 'game:over',
  SOUND_TOGGLED: 'sound:toggled',
});

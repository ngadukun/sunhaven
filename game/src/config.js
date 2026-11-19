// Sunhaven's tuning, in one place: the city's shape, the car catalogue, the wanted system's
// numbers and the palette. The world is measured in pixels; the camera shows a 1280x720
// logical window into it, scaled to the screen, so nothing here depends on display size.

/** The simulation's fixed step, in seconds: sixty updates a second at any refresh rate. */
export const STEP = 1 / 60;

/** The logical size of the camera's window into the world. */
export const VIEW = { width: 1280, height: 720 };

// ---------------------------------------------------------------------------
// City geometry. Nine columns and seven rows of blocks; a road runs along
// every block edge, so the road grid has one more line than the blocks each
// way. East of the last road: a strip of beach, then the sea.
// ---------------------------------------------------------------------------

export const CITY = {
  cols: 9,
  rows: 7,
  blockW: 320,
  blockH: 240,
  road: 128,
  beachW: 320,
  seaW: 560,
};

CITY.pitchX = CITY.blockW + CITY.road;
CITY.pitchY = CITY.blockH + CITY.road;
CITY.width = CITY.cols * CITY.blockW + (CITY.cols + 1) * CITY.road;
CITY.height = CITY.rows * CITY.blockH + (CITY.rows + 1) * CITY.road;

/** The whole world, city plus beach plus sea. */
export const WORLD = { width: CITY.width + CITY.beachW + CITY.seaW, height: CITY.height };

/** The x where the sand starts, and where the water starts. */
export const BEACH_X = CITY.width;
export const SEA_X = CITY.width + CITY.beachW;

// ---------------------------------------------------------------------------
// The player, on foot.
// ---------------------------------------------------------------------------

export const WALKER = {
  radius: 13,
  walkSpeed: 178,
  sprintSpeed: 268,
  health: 100,
  /** Health regained per second once no damage has landed for a while. */
  regen: 3.2,
  regenDelay: 6,
  /** How close to a car's door the player must be to get in. */
  enterRange: 58,
};

// ---------------------------------------------------------------------------
// Cars. Speeds are pixels per second; grip is how hard the tyres bite
// sideways (higher keeps more of the sideways slide); value is dollars.
// ---------------------------------------------------------------------------

export const CAR_TYPES = {
  compact: { name: 'Blista Compact', accel: 265, topSpeed: 332, reverse: 120, grip: 8.6, turn: 2.9, mass: 0.8, value: 180, length: 64, width: 30 },
  sedan: { name: 'Primo Sedan', accel: 305, topSpeed: 384, reverse: 128, grip: 8.1, turn: 2.7, mass: 1.0, value: 320, length: 72, width: 32 },
  premium: { name: 'Admiral Premium', accel: 345, topSpeed: 424, reverse: 136, grip: 8.3, turn: 2.6, mass: 1.15, value: 640, length: 76, width: 33 },
  pickup: { name: 'Rancher Pickup', accel: 322, topSpeed: 392, reverse: 140, grip: 7.3, turn: 2.5, mass: 1.3, value: 460, length: 78, width: 34 },
  wagon: { name: 'Regina Wagon', accel: 292, topSpeed: 362, reverse: 124, grip: 7.9, turn: 2.6, mass: 1.1, value: 380, length: 74, width: 32 },
  coupe: { name: 'Futo GT', accel: 432, topSpeed: 522, reverse: 150, grip: 9.1, turn: 3.2, mass: 0.95, value: 980, length: 70, width: 31 },
  muscle: { name: 'Dukes Muscle', accel: 462, topSpeed: 502, reverse: 146, grip: 6.9, turn: 2.8, mass: 1.25, value: 870, length: 76, width: 34 },
  van: { name: 'Pony Armored Van', accel: 282, topSpeed: 362, reverse: 118, grip: 7.6, turn: 2.2, mass: 1.9, value: 1500, length: 84, width: 38 },
  interceptor: { name: 'Police Interceptor', accel: 452, topSpeed: 542, reverse: 160, grip: 8.9, turn: 3.1, mass: 1.2, value: 0, length: 74, width: 33 },
};

/** The colours a civilian car of each type can wear, chosen by the world seed. */
export const CAR_COLORS = {
  compact: ['#c94f42', '#4a7fc9', '#d9d3c3', '#5da464'],
  sedan: ['#7a8899', '#33424f', '#b8bcc0', '#6e3b3b'],
  premium: ['#1f2733', '#c0c6cc', '#3d5a80', '#704214'],
  pickup: ['#a63d2a', '#4f772d', '#8a8d91', '#274156'],
  wagon: ['#90a955', '#bc6c25', '#606c38', '#7f5539'],
  coupe: ['#d90429', '#ffb703', '#2a9d8f', '#8338ec'],
  muscle: ['#e36414', '#0f4c5c', '#9a031e', '#5f0f40'],
  van: ['#565d66', '#42484f'],
  interceptor: ['#14181d'],
};

/** Ambient traffic and parked cars the world keeps around the player. */
export const TRAFFIC_COUNT = 14;
export const PARKED_COUNT = 26;
export const PED_COUNT = 42;

// ---------------------------------------------------------------------------
// The wanted system. Heat runs 0..500; every full hundred is a star.
// ---------------------------------------------------------------------------

export const HEAT = {
  max: 500,
  perStar: 100,
  /** Interceptors the city fields at 1..5 stars. */
  policeByStar: [0, 1, 2, 3, 5, 6],
  /** Heat lost per second once nobody has seen the player for `unseenDelay`. */
  decay: 8,
  unseenDelay: 5,
  /** How far a witness or a police unit can see, in pixels. */
  sight: 460,
  witness: 265,
  theft: 35,
  knockdown: 45,
  shooting: 12,
  hardCrash: 15,
  crate: 10,
  /** Seconds pinned at crawling pace beside a police car before the cuffs. */
  bustTime: 2.4,
  bustRange: 66,
  bustSpeed: 46,
  /** Where fresh Interceptors join the chase, measured from the player. */
  spawnDistance: 780,
};

// ---------------------------------------------------------------------------
// The pistol.
// ---------------------------------------------------------------------------

export const GUN = {
  magazine: 12,
  startReserve: 48,
  pickupAmmo: 36,
  range: 540,
  speed: 1500,
  cooldown: 0.21,
  reloadTime: 1.05,
  carDamage: 7,
  /** Seconds before a spent ammo pickup is back on its porch. */
  pickupRespawn: 60,
};

// ---------------------------------------------------------------------------
// Money and the story's shape.
// ---------------------------------------------------------------------------

export const MONEY = {
  bustFee: 150,
  wastedFee: 200,
  /** A Chop Run only takes cars worth at least this much. */
  chopMinimum: 240,
  /** A Delivery Run pays this plus distance times the rate, rounded. */
  deliveryBase: 140,
  deliveryRate: 0.18,
};

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'sunhaven.save.v1';
export const MUTE_KEY = 'sunhaven.muted.v1';

/** The seed a brand-new game starts from; a save remembers its own. */
export const DEFAULT_SEED = 20261119;

// ---------------------------------------------------------------------------
// Screens the game moves between; main.js owns the changes, render draws them.
// ---------------------------------------------------------------------------

export const SCREEN = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  BUSTED: 'busted',
  WASTED: 'wasted',
  COMPLETE: 'complete',
};

// ---------------------------------------------------------------------------
// Palette: sun-soaked pastels, dark asphalt, bright sea.
// ---------------------------------------------------------------------------

export const PALETTE = {
  grass: '#5da85e',
  grassDark: '#4c9150',
  pavement: '#a7adb3',
  pavementDark: '#9399a0',
  lot: '#8d9299',
  sand: '#eed49e',
  sandWet: '#e0c384',
  sea: '#2b7bbb',
  seaDeep: '#1f639e',
  road: '#3b4046',
  roadEdge: '#d8d4c8',
  lane: '#e8c95a',
  sidewalk: '#ccd0d4',
  crosswalk: '#e8eaec',
  roofTerracotta: '#c96f4a',
  roofSlate: '#71808e',
  towerA: '#d9c9a8',
  towerB: '#b8c9d4',
  towerC: '#e3b7a0',
  hotel: '#f2ead8',
  warehouse: '#8b98a5',
  bank: '#cfd6da',
  civic: '#b9c4cc',
  shop: '#e0a458',
  houseWall: '#f0e6d2',
  windowLit: '#ffe9a3',
  windowDark: '#33505e',
  palmTrunk: '#8a6642',
  palmLeaf: '#3e9e4f',
  crate: '#b0813c',
  crateDark: '#8a6128',
  player: '#ffd23f',
  playerSkin: '#e8b08a',
  pedShirt: ['#e07a5f', '#3d8bfd', '#81b29a', '#f2cc8f', '#bc4749', '#6a8eae', '#e5989b', '#84a98c'],
  text: '#f7f3e8',
  textDark: '#22303a',
  muted: '#b9c4c4',
  panel: 'rgba(16, 26, 36, 0.88)',
  accent: '#ffb703',
  danger: '#ef476f',
  good: '#06d6a0',
  policeBlue: '#2470c9',
  policeRed: '#e5383b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

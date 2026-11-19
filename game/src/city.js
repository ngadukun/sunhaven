// The city of Sunhaven, built from a seed: nine columns by seven rows of blocks, four
// districts with their own building habits, eight named places, and the dressing (palms,
// lamps, dock crates) that makes a block read as a place. Also the road graph: traffic and
// the police think in intersections, so the graph lives here with the geometry.
import { BEACH_X, CITY, PALETTE, SEA_X } from './config.js';

/** The rectangle of block (col, row) — the land between the roads around it. */
export function blockRect(col, row) {
  return {
    x: CITY.road + col * CITY.pitchX,
    y: CITY.road + row * CITY.pitchY,
    w: CITY.blockW,
    h: CITY.blockH,
  };
}

/** The centre of intersection (i, j); i runs 0..cols, j runs 0..rows. */
export function intersection(i, j) {
  return { x: CITY.road / 2 + i * CITY.pitchX, y: CITY.road / 2 + j * CITY.pitchY };
}

/** Which district a block belongs to. */
export function districtAt(col, row) {
  if (col <= 1) return 'palma';
  if (col >= 7 && row <= 3) return 'coral';
  if ((col >= 7 && row >= 4) || (col >= 5 && row === 6)) return 'docks';
  return 'downtown';
}

export const DISTRICT_NAMES = {
  palma: 'PALMA HEIGHTS',
  downtown: 'DOWNTOWN SUNHAVEN',
  coral: 'CORAL BEACHFRONT',
  docks: 'THE DOCKS',
};

/** The named places, by the block they anchor. `id` is how missions and the save refer to them. */
export const PLACE_DEFS = [
  { id: 'vega', name: 'Vega Auto Works', col: 0, row: 3, kind: 'shop' },
  { id: 'hideout', name: "Leo's Hideout", col: 1, row: 5, kind: 'house' },
  { id: 'bank', name: 'Sunhaven Trust Bank', col: 3, row: 2, kind: 'bank' },
  { id: 'police', name: 'Sunhaven Police Station', col: 4, row: 4, kind: 'civic' },
  { id: 'hospital', name: 'Sunhaven General Hospital', col: 2, row: 5, kind: 'civic' },
  { id: 'hotel', name: 'Coral Court Hotel', col: 7, row: 1, kind: 'hotel' },
  { id: 'marina', name: 'Palma Marina', col: 8, row: 3, kind: 'marina' },
  { id: 'docks', name: 'Sunhaven Docks', col: 8, row: 5, kind: 'warehouse' },
];

/** True when the point lies on a road (or the beach road along the shore). */
export function isRoad(x, y) {
  if (x < 0 || y < 0 || y > CITY.height) return false;
  if (x > CITY.width) return false;
  const inX = x % CITY.pitchX < CITY.road || x < CITY.road;
  const inY = y % CITY.pitchY < CITY.road || y < CITY.road;
  return inX || inY;
}

/** The graph node index of intersection (i, j). */
export function nodeIndex(i, j) {
  return j * (CITY.cols + 1) + i;
}

/** The centre of the intersection with this node index. */
export function nodePoint(index) {
  const i = index % (CITY.cols + 1);
  const j = Math.floor(index / (CITY.cols + 1));
  return intersection(i, j);
}

/** The node nearest a point, clamped to the grid. */
export function nearestNode(x, y) {
  const i = Math.max(0, Math.min(CITY.cols, Math.round((x - CITY.road / 2) / CITY.pitchX)));
  const j = Math.max(0, Math.min(CITY.rows, Math.round((y - CITY.road / 2) / CITY.pitchY)));
  return nodeIndex(i, j);
}

/**
 * A shortest road path between two nodes, as a list of node indices including both ends.
 * Breadth-first over the grid: roads are uniform, so the first path found is a shortest.
 */
export function findPath(from, to) {
  if (from === to) return [from];
  const width = CITY.cols + 1;
  const cameFrom = new Map([[from, -1]]);
  const queue = [from];
  let head = 0; // an index, not shift(): the queue is walked, never shortened
  while (head < queue.length) {
    const node = queue[head];
    head += 1;
    const i = node % width;
    const j = Math.floor(node / width);
    const neighbours = [];
    if (i > 0) neighbours.push(node - 1);
    if (i < CITY.cols) neighbours.push(node + 1);
    if (j > 0) neighbours.push(node - width);
    if (j < CITY.rows) neighbours.push(node + width);
    for (const next of neighbours) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, node);
      if (next === to) {
        const path = [to];
        let cursor = node;
        while (cursor !== -1) {
          path.unshift(cursor);
          cursor = cameFrom.get(cursor);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [from];
}

/** A rectangle shrunk by a margin on every side — the buildable inside of a block. */
function inner(rect, margin) {
  return { x: rect.x + margin, y: rect.y + margin, w: rect.w - margin * 2, h: rect.h - margin * 2 };
}

function placeBuilding(list, rect, kind, color, placeId) {
  const building = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, kind, color };
  if (placeId) building.place = placeId;
  list.push(building);
  return building;
}

/**
 * Build the whole city from the seeded stream. Returns everything the game and the
 * renderer need: buildings (solid), places (with a roadside marker each), destructible
 * crates, palms and lamps (dressing), and parking lots (visual, where parked cars sit).
 */
export function generateCity(rng) {
  const buildings = [];
  const crates = [];
  const palms = [];
  const lamps = [];
  const lots = [];
  const places = [];

  const towerColors = [PALETTE.towerA, PALETTE.towerB, PALETTE.towerC];

  function downtownBlock(rect) {
    const area = inner(rect, 26);
    const count = rng.int(3, 4);
    for (let n = 0; n < count; n += 1) {
      const w = rng.range(64, 118);
      const h = rng.range(58, 104);
      const x = area.x + (n % 2) * (area.w / 2) + rng.range(0, Math.max(4, area.w / 2 - w));
      const y = area.y + Math.floor(n / 2) * (area.h / 2) + rng.range(0, Math.max(4, area.h / 2 - h));
      placeBuilding(buildings, { x, y, w, h }, 'tower', rng.pick(towerColors));
    }
    lots.push({ x: rect.x + 14, y: rect.y + rect.h - 46, w: rect.w - 28, h: 32 });
  }

  function palmaBlock(rect) {
    const area = inner(rect, 22);
    const rows = 2;
    const perRow = rng.int(2, 3);
    for (let r = 0; r < rows; r += 1) {
      for (let n = 0; n < perRow; n += 1) {
        const w = rng.range(62, 86);
        const h = rng.range(46, 60);
        const x = area.x + n * (area.w / perRow) + rng.range(2, Math.max(4, area.w / perRow - w - 2));
        const y = area.y + r * (area.h / rows) + rng.range(2, Math.max(4, area.h / rows - h - 2));
        const roof = rng.chance(0.6) ? PALETTE.roofTerracotta : PALETTE.roofSlate;
        placeBuilding(buildings, { x, y, w, h }, 'house', roof);
      }
    }
    lots.push({ x: rect.x + 14, y: rect.y + rect.h - 40, w: rect.w - 28, h: 26 });
  }

  function coralBlock(rect) {
    const area = inner(rect, 24);
    if (rng.chance(0.7)) {
      const w = rng.range(160, 216);
      const h = rng.range(78, 104);
      placeBuilding(buildings, { x: area.x + (area.w - w) / 2, y: area.y + rng.range(0, 30), w, h }, 'hotel', PALETTE.hotel);
    } else {
      placeBuilding(buildings, { x: area.x, y: area.y, w: rng.range(90, 120), h: rng.range(60, 84) }, 'tower', rng.pick(towerColors));
      placeBuilding(buildings, { x: area.x + 150, y: area.y + 60, w: rng.range(90, 120), h: rng.range(60, 84) }, 'tower', rng.pick(towerColors));
    }
    for (let n = 0; n < 4; n += 1) {
      palms.push({ x: rect.x + 18 + n * ((rect.w - 36) / 3), y: rect.y + rect.h - 14 });
    }
    lots.push({ x: rect.x + 14, y: rect.y + rect.h - 44, w: rect.w - 28, h: 30 });
  }

  function docksBlock(rect, rngCrates) {
    const area = inner(rect, 22);
    // The warehouse keeps to the top of the block; the bottom strip stays open
    // concrete for the crate stacks, so a car can always reach them.
    const w = rng.range(150, 215);
    const h = rng.range(78, 98);
    placeBuilding(buildings, { x: area.x + rng.range(0, Math.max(4, area.w - w)), y: area.y, w, h }, 'warehouse', PALETTE.warehouse);
    // Crate stacks on the open concrete: each crate its own destructible box.
    const stacks = rng.int(2, 3);
    for (let s = 0; s < stacks; s += 1) {
      const baseX = rect.x + rng.range(24, rect.w - 90);
      const baseY = rect.y + rect.h - rng.range(56, 80);
      const inStack = rng.int(2, 4);
      for (let c = 0; c < inStack; c += 1) {
        rngCrates.push({ x: baseX + (c % 2) * 28, y: baseY + Math.floor(c / 2) * 28, w: 26, h: 26 });
      }
    }
    lots.push({ x: rect.x + 12, y: rect.y + 12, w: rect.w - 24, h: 30 });
  }

  const placeByBlock = new Map();
  for (const def of PLACE_DEFS) placeByBlock.set(`${def.col},${def.row}`, def);

  for (let row = 0; row < CITY.rows; row += 1) {
    for (let col = 0; col < CITY.cols; col += 1) {
      const rect = blockRect(col, row);
      const def = placeByBlock.get(`${col},${row}`);
      const district = districtAt(col, row);
      if (def) {
        // A named place gets one signature building, sized by its kind, and a marker on
        // the road along its south edge where jobs point and deliveries land.
        const sizes = {
          shop: [168, 96], house: [86, 58], bank: [178, 104], civic: [158, 94],
          hotel: [208, 104], marina: [64, 42], warehouse: [204, 112],
        };
        const [w, h] = sizes[def.kind];
        const colors = {
          shop: PALETTE.shop, house: PALETTE.roofTerracotta, bank: PALETTE.bank,
          civic: PALETTE.civic, hotel: PALETTE.hotel, marina: PALETTE.warehouse, warehouse: PALETTE.warehouse,
        };
        placeBuilding(buildings, { x: rect.x + (rect.w - w) / 2, y: rect.y + 30, w, h }, def.kind, colors[def.kind], def.id);
        const marker = { x: rect.x + rect.w / 2, y: rect.y + rect.h + CITY.road / 2 };
        places.push({ ...def, marker, district, rect });
        lots.push({ x: rect.x + 14, y: rect.y + rect.h - 42, w: rect.w - 28, h: 28 });
        if (def.id === 'docks') {
          for (let c = 0; c < 6; c += 1) {
            crates.push({ x: rect.x + 20 + (c % 3) * 30, y: rect.y + rect.h - 66 + Math.floor(c / 3) * 30, w: 26, h: 26 });
          }
        }
        continue;
      }
      if (district === 'downtown') downtownBlock(rect);
      else if (district === 'palma') palmaBlock(rect);
      else if (district === 'coral') coralBlock(rect);
      else docksBlock(rect, crates);
    }
  }

  // Palms down the shore and lamps at the corners of every other intersection.
  for (let y = 60; y < CITY.height - 40; y += rng.range(80, 120)) {
    palms.push({ x: BEACH_X + rng.range(36, 90), y });
    if (rng.chance(0.6)) palms.push({ x: BEACH_X + rng.range(190, 270), y: y + rng.range(-24, 24) });
  }
  for (let j = 0; j <= CITY.rows; j += 1) {
    for (let i = 0; i <= CITY.cols; i += 1) {
      const p = intersection(i, j);
      lamps.push({ x: p.x + CITY.road / 2 - 8, y: p.y + CITY.road / 2 - 8 });
    }
  }

  return { buildings, crates, palms, lamps, lots, places };
}

/** The place with this id, or null. */
export function placeById(city, id) {
  for (const place of city.places) if (place.id === id) return place;
  return null;
}

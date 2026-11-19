// The world: every rule of Sunhaven that is not drawing or sound. It owns the player,
// the cars, the pedestrians, the police, the bullets and the heat, and advances them all
// in fixed steps behind one call — step(dt, input) — returning the events a step caused
// (a shot, a crash, an arrest) so the shell can answer with sound and announcements.
// Nothing here touches the window, the canvas or storage: the same world runs under the
// test harness in Node exactly as it runs in the browser.
import {
  CAR_COLORS, CAR_TYPES, CITY, DEFAULT_SEED, GUN, HEAT, MONEY,
  SEA_X, STEP, VIEW, WALKER, WORLD,
} from './config.js';
import { createRng } from './random.js';
import {
  findPath, generateCity, nearestNode, nodePoint, placeById,
} from './city.js';
import { createDirector } from './missions.js';

const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** The shortest signed turn from one heading to another, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Does the straight line between two points pass through any building? */
export function lineBlocked(buildings, x1, y1, x2, y2) {
  for (const b of buildings) {
    // Liang–Barsky: clip the segment against the rectangle; anything left inside blocks.
    let t0 = 0;
    let t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - b.x, b.x + b.w - x1, y1 - b.y, b.y + b.h - y1];
    let clear = true;
    for (let i = 0; i < 4; i += 1) {
      if (p[i] === 0) {
        if (q[i] < 0) { clear = false; break; }
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) { clear = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { clear = false; break; } if (r < t1) t1 = r; }
      }
    }
    if (clear && t0 <= t1) return true;
  }
  return false;
}

/** Push a circle out of every building it overlaps; returns the deepest push, for damage. */
function pushOutOfBuildings(buildings, body, radius) {
  let worst = 0;
  for (const b of buildings) {
    const nearX = clamp(body.x, b.x, b.x + b.w);
    const nearY = clamp(body.y, b.y, b.y + b.h);
    let dx = body.x - nearX;
    let dy = body.y - nearY;
    let d = Math.hypot(dx, dy);
    if (d >= radius) {
      // The centre may still be inside the rectangle (then near == centre and d == 0).
      if (body.x > b.x && body.x < b.x + b.w && body.y > b.y && body.y < b.y + b.h) {
        const left = body.x - b.x;
        const right = b.x + b.w - body.x;
        const top = body.y - b.y;
        const bottom = b.y + b.h - body.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) body.x = b.x - radius;
        else if (min === right) body.x = b.x + b.w + radius;
        else if (min === top) body.y = b.y - radius;
        else body.y = b.y + b.h + radius;
        worst = Math.max(worst, radius);
      }
      continue;
    }
    if (d === 0) { dx = 1; dy = 0; d = 1; }
    const push = radius - d;
    body.x += (dx / d) * push;
    body.y += (dy / d) * push;
    if (push > worst) worst = push;
  }
  return worst;
}

let nextCarId = 1;

export function createWorld(options = {}) {
  const seed = options.seed ?? DEFAULT_SEED;
  const rng = createRng(seed);
  const city = generateCity(rng);
  const buildings = city.buildings;

  const state = {
    time: 0,
    seed,
    city,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    skids: [],
    crates: city.crates.map((c) => ({ ...c, smashed: false, respawn: 0 })),
    pickups: [],
    player: null,
    heat: 0,
    lastSeenAt: -100,
    cash: 0,
    stats: { stolen: 0, shots: 0, jobs: 0 },
    camera: { x: 0, y: 0 },
    banner: null,
    dialogue: null,
    dialogueDone: null,
    objectiveOverride: null,
    staging: false,
    storyComplete: false,
    cratesSmashed: 0,
  };

  // -- Spawning ---------------------------------------------------------------

  function makeCar(type, x, y, angle, driver) {
    const def = CAR_TYPES[type];
    const car = {
      id: nextCarId,
      type,
      def,
      color: driver === 'police' ? '#14181d' : rng.pick(CAR_COLORS[type]),
      x, y, angle,
      vx: 0, vy: 0, speed: 0,
      health: 100,
      driver,
      parked: driver === null,
      route: null,
      path: null,
      pathIndex: 0,
      repath: 0,
      stuckFor: 0,
      leaving: false,
      dead: false,
      everDriven: false,
      mission: null,
      smoke: 0,
      fire: 0,
      burn: 0,
      skid: null,
      hornAt: 0,
      brake: false,
    };
    nextCarId += 1;
    state.cars.push(car);
    return car;
  }

  /** A point on the lane between two intersections, `along` of the way, right-hand side. */
  function lanePoint(fromNode, toNode, along) {
    const a = nodePoint(fromNode);
    const b = nodePoint(toNode);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = 27;
    return {
      x: a.x + dx * along + (-dy / len) * off,
      y: a.y + dy * along + (dx / len) * off,
      angle: Math.atan2(dy, dx),
    };
  }

  function randomRoute() {
    const i = rng.int(0, CITY.cols);
    const j = rng.int(0, CITY.rows);
    const from = j * (CITY.cols + 1) + i;
    const options = [];
    if (i > 0) options.push(from - 1);
    if (i < CITY.cols) options.push(from + 1);
    if (j > 0) options.push(from - (CITY.cols + 1));
    if (j < CITY.rows) options.push(from + (CITY.cols + 1));
    return { from, to: rng.pick(options) };
  }

  function spawnTrafficCar() {
    const route = randomRoute();
    const spot = lanePoint(route.from, route.to, rng.range(0.15, 0.85));
    const types = ['compact', 'sedan', 'sedan', 'premium', 'pickup', 'wagon', 'coupe', 'muscle'];
    const car = makeCar(rng.pick(types), spot.x, spot.y, spot.angle, 'traffic');
    car.route = route;
    return car;
  }

  function spawnParkedCar(forcedType = null, nearPlace = null) {
    const lot = nearPlace
      ? { x: nearPlace.rect.x + 14, y: nearPlace.rect.y + nearPlace.rect.h - 42, w: nearPlace.rect.w - 28, h: 28 }
      : rng.pick(city.lots);
    const types = ['compact', 'sedan', 'premium', 'pickup', 'wagon', 'coupe', 'muscle'];
    const type = forcedType ?? rng.pick(types);
    // A lot slot is only a slot if no one is already in it: try a few spots and take
    // the first with clear space around it, so parked cars never spawn inside each other.
    let x = lot.x + 24;
    let y = lot.y + lot.h / 2;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const cx = lot.x + rng.range(20, Math.max(24, lot.w - 20));
      const cy = lot.y + lot.h / 2;
      x = cx;
      y = cy;
      let clear = true;
      for (const other of state.cars) {
        if (Math.hypot(other.x - cx, other.y - cy) < 58) { clear = false; break; }
      }
      if (clear) break;
    }
    return makeCar(type, x, y, rng.chance(0.5) ? 0 : Math.PI, null);
  }

  function spawnInterceptor(x, y) {
    const car = makeCar('interceptor', x, y, angleTo({ x, y }, state.player), 'police');
    return car;
  }

  function spawnPed() {
    const col = rng.int(0, CITY.cols - 1);
    const row = rng.int(0, CITY.rows - 1);
    const rect = { x: CITY.road + col * CITY.pitchX, y: CITY.road + row * CITY.pitchY, w: CITY.blockW, h: CITY.blockH };
    const inset = 15;
    const ped = {
      x: rect.x + inset + rng.range(0, rect.w - inset * 2),
      y: rect.y + inset,
      angle: rng.range(0, TAU),
      speed: rng.range(48, 78),
      color: rng.pick(['#e07a5f', '#3d8bfd', '#81b29a', '#f2cc8f', '#bc4749', '#6a8eae', '#e5989b', '#84a98c']),
      state: 'walk',
      timer: rng.range(0, 3),
      target: null,
      rect,
      vx: 0, vy: 0,
      dead: false,
    };
    ped.target = sidewalkTarget(ped);
    state.peds.push(ped);
    return ped;
  }

  /** A point on the sidewalk ring of the ped's block, or of the block across the road. */
  function sidewalkTarget(ped) {
    const inset = 15;
    let rect = ped.rect;
    if (rng.chance(0.3)) {
      // Cross to a neighbouring block's ring, straight over the road.
      const col = clamp(Math.round((rect.x - CITY.road) / CITY.pitchX) + rng.int(-1, 1), 0, CITY.cols - 1);
      const row = clamp(Math.round((rect.y - CITY.road) / CITY.pitchY) + rng.int(-1, 1), 0, CITY.rows - 1);
      rect = { x: CITY.road + col * CITY.pitchX, y: CITY.road + row * CITY.pitchY, w: CITY.blockW, h: CITY.blockH };
      ped.rect = rect;
    }
    const side = rng.int(0, 3);
    if (side === 0) return { x: rect.x + rng.range(inset, rect.w - inset), y: rect.y + inset };
    if (side === 1) return { x: rect.x + rng.range(inset, rect.w - inset), y: rect.y + rect.h - inset };
    if (side === 2) return { x: rect.x + inset, y: rect.y + rng.range(inset, rect.h - inset) };
    return { x: rect.x + rect.w - inset, y: rect.y + rng.range(inset, rect.h - inset) };
  }

  // -- The player ---------------------------------------------------------------

  state.player = {
    x: 0, y: 0, angle: -Math.PI / 2,
    health: WALKER.health,
    car: null,
    mag: GUN.magazine,
    reserve: GUN.startReserve,
    reloadTimer: 0,
    fireTimer: 0,
    bustMeter: 0,
    lastDamageAt: -100,
    dryFired: false,
  };

  const hideout = placeById(city, 'hideout');
  state.player.x = hideout.marker.x;
  state.player.y = hideout.marker.y + 10;

  for (let n = 0; n < 14; n += 1) spawnTrafficCar();
  for (let n = 0; n < 26; n += 1) spawnParkedCar();
  for (let n = 0; n < 42; n += 1) spawnPed();

  for (const id of ['hideout', 'vega', 'hotel']) {
    const place = placeById(city, id);
    state.pickups.push({
      place: id,
      x: place.marker.x,
      y: place.marker.y - 44,
      active: true,
      timer: 0,
    });
  }

  // -- Small public helpers -----------------------------------------------------

  function setBanner(text, sub = '', seconds = 3.2) {
    state.banner = { text, sub, until: state.time + seconds };
  }

  function showDialogue(lines, tag) {
    state.dialogue = { lines, index: 0, tag };
  }

  /** Can anyone see the point (x, y) — a witness close by, or the law within sight? */
  function witnessed(x, y, byPlayer = false) {
    const px = byPlayer ? state.player.x : x;
    const py = byPlayer ? state.player.y : y;
    for (const ped of state.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if (Math.hypot(ped.x - px, ped.y - py) < HEAT.witness && !lineBlocked(buildings, ped.x, ped.y, px, py)) return true;
    }
    for (const car of state.cars) {
      if (car.driver !== 'police' || car.dead) continue;
      if (Math.hypot(car.x - px, car.y - py) < HEAT.sight && !lineBlocked(buildings, car.x, car.y, px, py)) return true;
    }
    return false;
  }

  /** A crime at the player's position: heat lands only when somebody saw it. */
  function reportCrime(kind) {
    const amount = HEAT[kind] ?? 0;
    if (amount <= 0) return false;
    if (!witnessed(state.player.x, state.player.y, true)) return false;
    state.heat = Math.min(HEAT.max, state.heat + amount);
    state.lastSeenAt = state.time;
    return true;
  }

  function stars() {
    if (state.heat <= 0) return 0;
    return Math.min(5, Math.ceil(state.heat / HEAT.perStar));
  }

  function addHeat(amount) {
    state.heat = clamp(state.heat + amount, 0, HEAT.max);
    if (amount > 0) state.lastSeenAt = state.time;
  }

  // -- Driving physics ----------------------------------------------------------
  //
  // One model for every car, whoever drives it: velocity split into forward and
  // sideways parts, the sideways part eaten by grip, the forward part by the engine,
  // drag and the brakes. Steering bites in proportion to speed, harder with the
  // handbrake, which also loosens the rear — that is the whole drift model.

  function driveCar(car, dt, throttle, steer, handbrake) {
    if (car.dead) {
      car.vx *= Math.max(0, 1 - 3 * dt);
      car.vy *= Math.max(0, 1 - 3 * dt);
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      car.speed = 0;
      car.brake = true;
      return;
    }
    const def = car.def;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let vf = car.vx * fx + car.vy * fy;
    let vl = -car.vx * fy + car.vy * fx;

    if (throttle > 0) {
      if (vf < -6) vf += def.accel * 2.3 * dt; // braking while rolling backwards
      else vf += def.accel * throttle * dt * (1 - Math.max(0, vf) / (def.topSpeed * 1.9));
    } else if (throttle < 0) {
      if (vf > 6) vf += def.accel * 2.3 * throttle * dt; // braking while rolling forwards
      else vf += def.accel * 0.72 * throttle * dt * (1 - Math.max(0, -vf) / (def.reverse * 1.9));
    }
    // Rolling drag and a whisper of static friction so parked speeds settle at zero.
    vf -= vf * 0.55 * dt;
    if (throttle === 0 && Math.abs(vf) < 6) vf = 0;
    if (vf > def.topSpeed) vf = def.topSpeed;
    if (vf < -def.reverse) vf = -def.reverse;

    const grip = handbrake ? def.grip * 0.24 : def.grip;
    vl *= Math.exp(-grip * dt);
    if (handbrake) vf -= vf * 0.7 * dt;

    if (Math.abs(vf) > 8) {
      const bite = clamp(vf / 130, -1, 1);
      car.angle += steer * def.turn * bite * dt * (handbrake ? 1.45 : 1);
    }

    const nfx = Math.cos(car.angle);
    const nfy = Math.sin(car.angle);
    car.vx = nfx * vf + -nfy * vl;
    car.vy = nfy * vf + nfx * vl;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.speed = vf;
    car.brake = throttle < 0 || (throttle === 0 && Math.abs(vf) > 30);
  }

  /** Steer a free car toward a point; returns the {throttle, steer} a driver would use. */
  function steerToward(car, tx, ty, targetSpeed) {
    const want = angleTo(car, { x: tx, y: ty });
    const delta = angleDelta(car.angle, want);
    const steer = clamp(delta * 2.4, -1, 1);
    const dist = Math.hypot(tx - car.x, ty - car.y);
    let throttle = 1;
    if (Math.abs(delta) > 2.2) throttle = -0.6; // badly turned around: back up and swing
    else if (Math.abs(delta) > 1.1) throttle = 0.35;
    const speed = Math.abs(car.speed);
    if (speed > targetSpeed) throttle = speed > targetSpeed * 1.35 ? -0.5 : 0;
    if (dist < 60 && speed > targetSpeed * 0.6) throttle = -0.4;
    return { throttle, steer };
  }

  // -- Collisions ---------------------------------------------------------------

  function damageCar(car, amount, events) {
    if (car.dead || amount <= 0) return;
    car.health -= amount;
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
      car.burn = 7; // a wreck burns for a while before it is just a wreck
      if (car.driver === 'traffic') ejectDriver(car);
      else if (car.driver === 'police') car.driver = null;
      else if (car.driver === 'player') {
        // The player's wreck stops being a car and becomes a bad day on foot.
        leaveCar(events, true);
        hurtPlayer(12, events);
      }
      events.push({ type: 'wreck', car });
    }
  }

  function hurtPlayer(amount, events) {
    const player = state.player;
    if (amount <= 0) return;
    player.health -= amount;
    player.lastDamageAt = state.time;
    events.push({ type: 'hurt', amount });
  }

  function collideCarWithWorld(car, events, dt) {
    const radius = car.def.width * 0.78;
    const beforeVx = car.vx;
    const beforeVy = car.vy;
    const pushed = pushOutOfBuildings(buildings, car, radius);
    if (pushed > 0.5) {
      // Kill the velocity that ran into the wall; what is left is the scrape along it.
      const impact = Math.hypot(beforeVx, beforeVy);
      car.vx *= 0.35;
      car.vy *= 0.35;
      if (impact > 170) {
        const damage = (impact - 170) / 11;
        damageCar(car, damage, events);
        if (car.driver === 'player') hurtPlayer(damage * 0.4, events);
        events.push({ type: 'crash', strength: clamp((impact - 170) / 300, 0.15, 1), x: car.x, y: car.y });
        if (car.driver === 'player') reportCrime('hardCrash');
      }
    }
    // The sea stops every car at the shoreline, and the world has edges.
    if (car.x > SEA_X + 46) {
      car.x = SEA_X + 46;
      car.vx = Math.min(car.vx, 0);
    }
    if (car.x < 14) { car.x = 14; car.vx = Math.max(car.vx, 0); }
    if (car.y < 14) { car.y = 14; car.vy = Math.max(car.vy, 0); }
    if (car.y > WORLD.height - 14) { car.y = WORLD.height - 14; car.vy = Math.min(car.vy, 0); }
    void dt;
  }

  function collideCars(events) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        const ra = a.def.length * 0.36;
        const rb = b.def.length * 0.36;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d === 0 || d >= ra + rb) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = ra + rb - d;
        const totalMass = a.def.mass + b.def.mass;
        a.x -= nx * overlap * (b.def.mass / totalMass);
        a.y -= ny * overlap * (b.def.mass / totalMass);
        b.x += nx * overlap * (a.def.mass / totalMass);
        b.y += ny * overlap * (a.def.mass / totalMass);
        const relN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relN < 0) {
          const impulse = -(1.35) * relN / (1 / a.def.mass + 1 / b.def.mass);
          a.vx -= (impulse / a.def.mass) * nx;
          a.vy -= (impulse / a.def.mass) * ny;
          b.vx += (impulse / b.def.mass) * nx;
          b.vy += (impulse / b.def.mass) * ny;
          const severity = -relN;
          if (severity > 165) {
            const damage = (severity - 165) / 12;
            damageCar(a, damage, events);
            damageCar(b, damage, events);
            if (a.driver === 'player' || b.driver === 'player') {
              hurtPlayer(damage * 0.45, events);
              reportCrime('hardCrash');
              events.push({ type: 'crash', strength: clamp(severity / 380, 0.2, 1), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }
          }
        }
      }
    }
  }

  // -- People -------------------------------------------------------------------

  function ejectDriver(car) {
    car.driver = null;
    car.parked = true;
    const ped = spawnPed();
    ped.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    ped.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    ped.state = 'flee';
    ped.timer = 5;
    ped.fleeFrom = { x: state.player.x, y: state.player.y };
    return ped;
  }

  function knockPed(ped, vx, vy, lethal, events, byPlayerCar) {
    ped.state = 'down';
    ped.timer = lethal ? 1e9 : 4.5;
    ped.dead = lethal;
    ped.vx = vx;
    ped.vy = vy;
    events.push({ type: 'pedHit', ped, lethal });
    if (byPlayerCar) {
      reportCrime('knockdown');
      if (lethal) reportCrime('knockdown');
    }
  }

  function updatePeds(dt, events) {
    const player = state.player;
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        ped.x += ped.vx * dt;
        ped.y += ped.vy * dt;
        ped.vx *= Math.max(0, 1 - 6 * dt);
        ped.vy *= Math.max(0, 1 - 6 * dt);
        pushOutOfBuildings(buildings, ped, 11);
        if (!ped.dead) {
          ped.timer -= dt;
          if (ped.timer <= 0) {
            ped.state = 'walk';
            ped.target = sidewalkTarget(ped);
          }
        }
        continue;
      }
      let speed = ped.speed;
      let tx;
      let ty;
      if (ped.state === 'flee') {
        ped.timer -= dt;
        const from = ped.fleeFrom ?? player;
        tx = ped.x + (ped.x - from.x);
        ty = ped.y + (ped.y - from.y);
        speed = 205;
        if (ped.timer <= 0) {
          ped.state = 'walk';
          ped.target = sidewalkTarget(ped);
        }
      } else {
        if (ped.target === null || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 12) {
          ped.target = sidewalkTarget(ped);
        }
        tx = ped.target.x;
        ty = ped.target.y;
      }
      const want = angleTo(ped, { x: tx, y: ty });
      ped.angle = want;
      ped.x += Math.cos(want) * speed * dt;
      ped.y += Math.sin(want) * speed * dt;
      pushOutOfBuildings(buildings, ped, 11);
      ped.x = clamp(ped.x, 10, WORLD.width - 10);
      ped.y = clamp(ped.y, 10, WORLD.height - 10);
      void events;
    }
  }

  /** Something loud or violent at (x, y): nearby pedestrians run from it. */
  function scarePeds(x, y, radius = 300) {
    for (const ped of state.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if (Math.hypot(ped.x - x, ped.y - y) < radius) {
        ped.state = 'flee';
        ped.timer = Math.max(ped.timer, 4);
        ped.fleeFrom = { x, y };
      }
    }
  }

  // -- Traffic --------------------------------------------------------------------

  const LANE = 27;

  function updateTrafficCar(car, dt, events) {
    if (car.route === null) car.route = randomRoute();
    const { from, to } = car.route;
    const a = nodePoint(from);
    const b = nodePoint(to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // The point on the lane to aim at: the car's projection along the segment, pushed
    // ahead, offset to the right-hand side of the road.
    const along = clamp((car.x - a.x) * ux + (car.y - a.y) * uy, 0, len);
    const look = Math.min(len, along + 95);
    const tx = a.x + ux * look - uy * LANE;
    const ty = a.y + uy * look + ux * LANE;

    let targetSpeed = car.def.topSpeed * 0.52;
    // Slow for whatever is in front: another car, or a person in the road.
    for (const other of state.cars) {
      if (other === car) continue;
      const rel = (other.x - car.x) * ux + (other.y - car.y) * uy;
      const side = Math.abs((other.x - car.x) * -uy + (other.y - car.y) * ux);
      if (rel > 0 && rel < 86 && side < 30) targetSpeed = Math.min(targetSpeed, Math.max(0, (rel - 52) * 2.2));
    }
    for (const ped of state.peds) {
      if (ped.dead) continue;
      const rel = (ped.x - car.x) * ux + (ped.y - car.y) * uy;
      const side = Math.abs((ped.x - car.x) * -uy + (ped.y - car.y) * ux);
      if (rel > 0 && rel < 64 && side < 26) targetSpeed = 0;
    }
    const player = state.player;
    if (player.car === null) {
      const rel = (player.x - car.x) * ux + (player.y - car.y) * uy;
      const side = Math.abs((player.x - car.x) * -uy + (player.y - car.y) * ux);
      if (rel > 0 && rel < 70 && side < 26) targetSpeed = 0;
    }

    const input = steerToward(car, tx, ty, Math.max(targetSpeed, 1));
    if (targetSpeed === 0 && Math.abs(car.speed) > 12) input.throttle = -0.7;
    driveCar(car, dt, input.throttle, input.steer, false);

    if (targetSpeed === 0 && Math.abs(car.speed) < 14) {
      car.stuckFor += dt;
      if (car.stuckFor > 3.4 && state.time > car.hornAt) {
        car.hornAt = state.time + 7;
        events.push({ type: 'horn', car });
      }
    } else car.stuckFor = 0;

    const distToEnd = Math.hypot(b.x - car.x, b.y - car.y);
    if (along >= len - 6 || distToEnd < 46) {
      // At the intersection: choose the next leg, usually not straight back.
      const width = CITY.cols + 1;
      const ti = to % width;
      const tj = Math.floor(to / width);
      const options = [];
      if (ti > 0 && to - 1 !== from) options.push(to - 1);
      if (ti < CITY.cols && to + 1 !== from) options.push(to + 1);
      if (tj > 0 && to - width !== from) options.push(to - width);
      if (tj < CITY.rows && to + width !== from) options.push(to + width);
      const next = options.length > 0 ? options[Math.floor(rng.next() * options.length)] : from;
      car.route = { from: to, to: next };
    }

    // Keep the ambient fleet near the player: a car left far behind re-enters ahead,
    // on a road out of the nearest intersection to where the player is.
    if (Math.hypot(car.x - player.x, car.y - player.y) > 1750) {
      const near = nearestNode(player.x, player.y);
      const w = CITY.cols + 1;
      const fi = near % w;
      const fj = Math.floor(near / w);
      const opts = [];
      if (fi > 0) opts.push(near - 1);
      if (fi < CITY.cols) opts.push(near + 1);
      if (fj > 0) opts.push(near - w);
      if (fj < CITY.rows) opts.push(near + w);
      const route = { from: near, to: opts[Math.floor(rng.next() * opts.length)] ?? near };
      car.route = route;
      const spot = lanePoint(route.from, route.to, 0.12);
      car.x = spot.x;
      car.y = spot.y;
      car.angle = spot.angle;
      car.vx = 0;
      car.vy = 0;
    }
  }

  // -- Police ---------------------------------------------------------------------

  let spawnTimer = 0;

  function policeCars() {
    return state.cars.filter((c) => c.driver === 'police' && !c.dead);
  }

  function managePolice(dt) {
    const want = HEAT.policeByStar[stars()];
    const active = policeCars();
    if (active.length < want) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = 0.8;
        // Join at an intersection about spawnDistance away — close enough to matter,
        // far enough not to pop into view.
        const player = state.player;
        let best = null;
        let bestScore = Infinity;
        for (let j = 0; j <= CITY.rows; j += 1) {
          for (let i = 0; i <= CITY.cols; i += 1) {
            const p = nodePoint(j * (CITY.cols + 1) + i);
            const d = Math.hypot(p.x - player.x, p.y - player.y);
            const score = Math.abs(d - HEAT.spawnDistance) + rng.next() * 60;
            if (d > 620 && score < bestScore) {
              bestScore = score;
              best = p;
            }
          }
        }
        if (best !== null) spawnInterceptor(best.x, best.y);
      }
    } else if (active.length > want) {
      // Too many for the current heat: the farthest peels off and leaves the map.
      let far = null;
      let farD = -1;
      for (const car of active) {
        const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
        if (d > farD) { farD = d; far = car; }
      }
      if (far !== null) far.leaving = true;
    }
  }

  function updatePoliceCar(car, dt, events) {
    const player = state.player;
    const dist = Math.hypot(player.x - car.x, player.y - car.y);

    if (car.leaving) {
      // Drive for the far corner of the map; once well out of the picture, it is gone.
      if (car.leaveTarget === null || car.leaveTarget === undefined) {
        let farNode = 0;
        let farD = -1;
        for (let n = 0; n < (CITY.cols + 1) * (CITY.rows + 1); n += 1) {
          const p = nodePoint(n);
          const d = Math.hypot(p.x - player.x, p.y - player.y);
          if (d > farD) { farD = d; farNode = n; }
        }
        car.leaveTarget = nodePoint(farNode);
      }
      const out = steerToward(car, car.leaveTarget.x, car.leaveTarget.y, car.def.topSpeed * 0.8);
      driveCar(car, dt, out.throttle, out.steer, false);
      if (dist > 1250) car.driver = 'gone';
      return;
    }

    let tx;
    let ty;
    let targetSpeed = car.def.topSpeed * 0.94;
    if (dist > 620) {
      // Far off: come by road. Recompute the route a few times a second.
      car.repath -= dt;
      if (car.path === null || car.repath <= 0) {
        car.path = findPath(nearestNode(car.x, car.y), nearestNode(player.x, player.y));
        car.pathIndex = 0;
        car.repath = 0.45;
      }
      while (car.pathIndex < car.path.length - 1) {
        const p = nodePoint(car.path[car.pathIndex]);
        if (Math.hypot(p.x - car.x, p.y - car.y) > 52) break;
        car.pathIndex += 1;
      }
      const p = nodePoint(car.path[Math.min(car.pathIndex, car.path.length - 1)]);
      tx = p.x;
      ty = p.y;
    } else {
      // Close: hunt the player, leading the target a little so the chase cuts corners.
      const lead = clamp(dist / 900, 0, 0.4);
      const pvx = player.car !== null ? player.car.vx : 0;
      const pvy = player.car !== null ? player.car.vy : 0;
      tx = player.x + pvx * lead;
      ty = player.y + pvy * lead;
      // Pace-matching when close: sit on the player's bumper rather than blasting past.
      if (dist < 130) {
        const playerSpeed = player.car !== null ? Math.abs(player.car.speed) : 0;
        targetSpeed = clamp(playerSpeed + (dist - 42) * 1.5, 60, car.def.topSpeed);
      }
    }
    const input = steerToward(car, tx, ty, targetSpeed);
    driveCar(car, dt, input.throttle, input.steer, false);

    // Wedged against the scenery? Recover by aiming at the nearest intersection.
    if (Math.abs(car.speed) < 26 && dist > 120) {
      car.stuckFor += dt;
      if (car.stuckFor > 1.3) {
        const p = nodePoint(nearestNode(car.x, car.y));
        const back = steerToward(car, p.x, p.y, 200);
        driveCar(car, dt, -0.55, back.steer, false);
        if (car.stuckFor > 2.2) car.stuckFor = 0;
      }
    } else car.stuckFor = 0;
    void events;
  }

  // -- The player -----------------------------------------------------------------

  function leaveCar(events, wrecked = false) {
    const player = state.player;
    const car = player.car;
    if (car === null) return;
    car.driver = null;
    car.parked = true;
    const side = car.angle + Math.PI / 2;
    player.x = car.x + Math.cos(side) * (car.def.width / 2 + 17);
    player.y = car.y + Math.sin(side) * (car.def.width / 2 + 17);
    player.car = null;
    pushOutOfBuildings(buildings, player, WALKER.radius);
    if (!wrecked) events.push({ type: 'door' });
  }

  function tryEnterCar(events) {
    const player = state.player;
    let best = null;
    let bestD = WALKER.enterRange;
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best === null) return;
    if (best.driver === 'police') {
      setBanner('Locked', 'Sunhaven PD keeps its cars locked.', 1.6);
      events.push({ type: 'locked' });
      return;
    }
    if (best.driver === 'traffic') ejectDriver(best);
    if (!best.everDriven) {
      best.everDriven = true;
      state.stats.stolen += 1;
      reportCrime('theft');
    }
    best.driver = 'player';
    best.parked = false;
    best.leaving = false;
    player.car = best;
    player.x = best.x;
    player.y = best.y;
    events.push({ type: 'door' });
  }

  function updatePlayer(dt, input, events) {
    const player = state.player;

    // Reload and trigger timing run whether Leo is walking or driving.
    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) {
        const take = Math.min(GUN.magazine - player.mag, player.reserve);
        player.mag += take;
        player.reserve -= take;
        events.push({ type: 'reloadEnd' });
      }
    }
    if (player.fireTimer > 0) player.fireTimer -= dt;
    if (input.reload && player.reloadTimer <= 0 && player.mag < GUN.magazine && player.reserve > 0) {
      player.reloadTimer = GUN.reloadTime;
      events.push({ type: 'reloadStart' });
    }

    if (player.car !== null) {
      const car = player.car;
      const throttle = -input.y;
      const steer = input.x * (car.speed < -4 ? -1 : 1);
      driveCar(car, dt, throttle, steer, input.handbrake);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      // A drive-by aims where the player aims, not where the car happens to point.
      if (input.aim) player.aimAngle = angleTo(player, input.aim);
      if (input.interact) leaveCar(events);
    } else {
      const len = Math.hypot(input.x, input.y);
      const speed = input.sprint ? WALKER.sprintSpeed : WALKER.walkSpeed;
      if (len > 0) {
        const ux = input.x / (len || 1);
        const uy = input.y / (len || 1);
        player.x += ux * speed * dt;
        player.y += uy * speed * dt;
        if (!input.shoot) player.angle = Math.atan2(uy, ux);
      }
      if (input.aim) player.angle = angleTo(player, input.aim);
      pushOutOfBuildings(buildings, player, WALKER.radius);
      // Cars are solid to a walker; a moving one is worse than solid.
      for (const car of state.cars) {
        const d = Math.hypot(car.x - player.x, car.y - player.y);
        const r = car.def.length * 0.36 + WALKER.radius;
        if (d > 0 && d < r) {
          const carSpeed = Math.hypot(car.vx, car.vy);
          if (carSpeed > 190 && car.driver !== 'player') {
            hurtPlayer((carSpeed - 190) / 14, events);
            player.x += (car.vx / (carSpeed || 1)) * 26;
            player.y += (car.vy / (carSpeed || 1)) * 26;
            events.push({ type: 'crash', strength: 0.4, x: player.x, y: player.y });
          } else {
            player.x += ((player.x - car.x) / d) * (r - d);
            player.y += ((player.y - car.y) / d) * (r - d);
          }
        }
      }
      // Crates are waist-high: a walker climbs neither over nor through them.
      for (const crate of state.crates) {
        if (crate.smashed) continue;
        const nearX = clamp(player.x, crate.x, crate.x + crate.w);
        const nearY = clamp(player.y, crate.y, crate.y + crate.h);
        const d = Math.hypot(player.x - nearX, player.y - nearY);
        if (d < WALKER.radius && d > 0) {
          player.x += ((player.x - nearX) / d) * (WALKER.radius - d);
          player.y += ((player.y - nearY) / d) * (WALKER.radius - d);
        }
      }
      player.x = clamp(player.x, 12, SEA_X + 26);
      player.y = clamp(player.y, 12, WORLD.height - 12);
      if (input.interact) tryEnterCar(events);

      // Ammo pickups wait on porches; walking over one tops up the reserve.
      for (const pickup of state.pickups) {
        if (!pickup.active) continue;
        if (Math.hypot(pickup.x - player.x, pickup.y - player.y) < 36) {
          pickup.active = false;
          pickup.timer = GUN.pickupRespawn;
          player.reserve = Math.min(999, player.reserve + GUN.pickupAmmo);
          events.push({ type: 'pickup', pickup });
          setBanner('Ammo +36', 'Spare rounds from the porch.', 1.6);
        }
      }
    }

    // Health creeps back once the shooting — and the crashing — has stopped.
    if (player.health > 0 && player.health < WALKER.health && state.time - player.lastDamageAt > WALKER.regenDelay) {
      player.health = Math.min(WALKER.health, player.health + WALKER.regen * dt);
    }
  }

  // -- Combat ---------------------------------------------------------------------

  function fireBullet(events) {
    const player = state.player;
    const angle = player.car !== null && player.aimAngle !== undefined ? player.aimAngle : player.angle;
    const fromX = player.x + Math.cos(angle) * (player.car !== null ? 30 : 16);
    const fromY = player.y + Math.sin(angle) * (player.car !== null ? 30 : 16);
    state.bullets.push({
      x: fromX, y: fromY,
      vx: Math.cos(angle) * GUN.speed,
      vy: Math.sin(angle) * GUN.speed,
      life: GUN.range / GUN.speed,
    });
    player.mag -= 1;
    state.stats.shots += 1;
    addParticle(fromX + Math.cos(angle) * 14, fromY + Math.sin(angle) * 14, 'flash', angle);
    addParticle(player.x, player.y, 'casing', angle + Math.PI / 2);
    scarePeds(player.x, player.y, 320);
    reportCrime('shooting');
    events.push({ type: 'shot' });
  }

  function updateCombat(dt, input, events) {
    const player = state.player;
    if (input.shoot && player.fireTimer <= 0 && player.reloadTimer <= 0 && !state.staging) {
      if (player.mag > 0) {
        player.fireTimer = GUN.cooldown;
        fireBullet(events);
      } else if (!player.dryFired) {
        player.dryFired = true;
        player.fireTimer = 0.3;
        events.push({ type: 'dry' });
      }
    }
    if (!input.shoot) player.dryFired = false;

    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      const nx = bullet.x + bullet.vx * dt;
      const ny = bullet.y + bullet.vy * dt;
      bullet.life -= dt;
      let hit = bullet.life <= 0;
      // Buildings stop rounds cold.
      if (!hit && lineBlocked(buildings, bullet.x, bullet.y, nx, ny)) hit = true;
      if (!hit) {
        for (const car of state.cars) {
          if (Math.hypot(car.x - nx, car.y - ny) < car.def.length * 0.38) {
            damageCar(car, GUN.carDamage, events);
            addParticle(nx, ny, 'spark', Math.atan2(bullet.vy, bullet.vx));
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (const ped of state.peds) {
          if (ped.dead || ped.state === 'down') continue;
          if (Math.hypot(ped.x - nx, ped.y - ny) < 14) {
            knockPed(ped, bullet.vx * 0.2, bullet.vy * 0.2, true, events, true);
            hit = true;
            break;
          }
        }
      }
      bullet.x = nx;
      bullet.y = ny;
      if (hit) state.bullets.splice(i, 1);
    }
  }

  // -- Particles ------------------------------------------------------------------

  function addParticle(x, y, kind, angle = 0) {
    if (state.particles.length > 420) state.particles.shift();
    const p = {
      x, y, kind, angle,
      vx: 0, vy: 0,
      life: 0.4, maxLife: 0.4, size: 3,
    };
    if (kind === 'smoke') { p.life = p.maxLife = 1.15; p.size = 9; p.vy = -22; p.vx = rng.range(-6, 6); }
    if (kind === 'tire') { p.life = p.maxLife = 0.5; p.size = 6; }
    if (kind === 'spark') { p.life = p.maxLife = 0.28; p.size = 2.5; p.vx = Math.cos(angle + Math.PI) * rng.range(40, 130); p.vy = Math.sin(angle + Math.PI) * rng.range(40, 130); }
    if (kind === 'casing') { p.life = p.maxLife = 0.55; p.size = 2; p.vx = Math.cos(angle) * rng.range(30, 70); p.vy = Math.sin(angle) * rng.range(30, 70); }
    if (kind === 'flash') { p.life = p.maxLife = 0.06; p.size = 12; }
    if (kind === 'fire') { p.life = p.maxLife = 0.5; p.size = 8; p.vy = -34; p.vx = rng.range(-7, 7); }
    if (kind === 'debris') { p.life = p.maxLife = 0.7; p.size = 4; p.vx = rng.range(-90, 90); p.vy = rng.range(-90, 90); }
    state.particles.push(p);
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') p.size += 15 * dt;
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
  }

  /** Tyre smoke and damage smoke, skid marks, fire, and crates under bumpers. */
  function updateCarEffects(dt, events) {
    for (const car of state.cars) {
      if (car.dead) {
        // A fresh wreck burns: flames first, then only smoke, then nothing.
        if (car.burn > 0) {
          car.burn -= dt;
          car.fire -= dt;
          if (car.fire <= 0) {
            car.fire = 0.11;
            addParticle(car.x + rng.range(-9, 9), car.y + rng.range(-9, 9), 'fire', 0);
            addParticle(car.x, car.y - 5, 'smoke', 0);
          }
        }
        continue;
      }
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const vl = -car.vx * fy + car.vy * fx;
      if (Math.abs(vl) > 95 && Math.abs(car.speed) > 120) {
        addParticle(car.x - fx * 20, car.y - fy * 20, 'tire', car.angle);
      }
      // When the rear axle steps out hard, it writes on the road: a fading dark line
      // from where the tyres were to where they are, kept for half a minute.
      const rearX = car.x - fx * car.def.length * 0.32;
      const rearY = car.y - fy * car.def.length * 0.32;
      if (Math.abs(vl) > 85 && Math.abs(car.speed) > 130) {
        if (car.skid !== null) {
          state.skids.push({ x1: car.skid.x, y1: car.skid.y, x2: rearX, y2: rearY, life: 26 });
          if (state.skids.length > 420) state.skids.shift();
        }
        car.skid = { x: rearX, y: rearY };
      } else car.skid = null;
      if (car.health < 45) {
        car.smoke -= dt;
        if (car.smoke <= 0) {
          car.smoke = car.health < 20 ? 0.09 : 0.2;
          addParticle(car.x + fx * 24, car.y + fy * 24, 'smoke', 0);
        }
      }
      if (car.health < 20) {
        // Before the end, the engine lets the fire out.
        car.fire -= dt;
        if (car.fire <= 0) {
          car.fire = 0.13;
          addParticle(car.x + fx * 22, car.y + fy * 22, 'fire', 0);
        }
      }
      // Crates: a fast car smashes through; a slow one is stopped by the stack.
      for (const crate of state.crates) {
        if (crate.smashed) continue;
        const nearX = clamp(car.x, crate.x, crate.x + crate.w);
        const nearY = clamp(car.y, crate.y, crate.y + crate.h);
        const d = Math.hypot(car.x - nearX, car.y - nearY);
        const r = car.def.width * 0.78;
        if (d < r) {
          const speed = Math.hypot(car.vx, car.vy);
          if (speed > 135) {
            crate.smashed = true;
            crate.respawn = 90;
            state.cratesSmashed += 1;
            for (let n = 0; n < 5; n += 1) addParticle(crate.x + 13, crate.y + 13, 'debris', 0);
            if (car.driver === 'player') reportCrime('crate');
            events.push({ type: 'smash', crate });
          } else if (d > 0) {
            car.x += ((car.x - nearX) / d) * (r - d);
            car.y += ((car.y - nearY) / d) * (r - d);
            car.vx *= 0.5;
            car.vy *= 0.5;
          }
        }
      }
      void events;
    }
    for (const crate of state.crates) {
      if (!crate.smashed) continue;
      crate.respawn -= dt;
      if (crate.respawn <= 0) crate.smashed = false;
    }
  }

  /** Cars meet pedestrians: traffic brakes for them, but speed has consequences. */
  function updateCarPedHits(events) {
    for (const car of state.cars) {
      if (car.dead) continue;
      const speed = Math.hypot(car.vx, car.vy);
      if (speed < 60) continue;
      for (const ped of state.peds) {
        if (ped.dead || ped.state === 'down') continue;
        const d = Math.hypot(ped.x - car.x, ped.y - car.y);
        if (d < car.def.length * 0.38 + 10) {
          knockPed(ped, car.vx * 0.65, car.vy * 0.65, speed > 305, events, car.driver === 'player');
        }
      }
    }
  }

  // -- Heat, the law's memory, and the camera --------------------------------------

  function updateHeat(dt) {
    const player = state.player;
    // A police unit with eyes on the player keeps the heat from cooling.
    for (const car of state.cars) {
      if (car.driver !== 'police' || car.dead || car.leaving) continue;
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d < HEAT.sight && !lineBlocked(buildings, car.x, car.y, player.x, player.y)) {
        state.lastSeenAt = state.time;
        break;
      }
    }
    if (state.time - state.lastSeenAt > HEAT.unseenDelay && state.heat > 0) {
      state.heat = Math.max(0, state.heat - HEAT.decay * dt);
    }
  }

  function updateBust(dt, events) {
    const player = state.player;
    const playerSpeed = player.car !== null ? Math.abs(player.car.speed) : 0;
    let pinned = false;
    if (stars() > 0 && playerSpeed < HEAT.bustSpeed) {
      for (const car of state.cars) {
        if (car.driver !== 'police' || car.dead || car.leaving) continue;
        if (Math.hypot(car.x - player.x, car.y - player.y) < HEAT.bustRange) {
          pinned = true;
          break;
        }
      }
    }
    if (pinned) player.bustMeter += dt;
    else player.bustMeter = Math.max(0, player.bustMeter - dt * 1.6);
    if (player.bustMeter >= HEAT.bustTime) {
      player.bustMeter = 0;
      events.push({ type: 'busted' });
    }
  }

  function updateCamera(dt) {
    const player = state.player;
    const lead = player.car !== null ? 0.32 : 0.12;
    const tx = player.x + (player.car !== null ? player.car.vx * lead : 0) - VIEW.width / 2;
    const ty = player.y + (player.car !== null ? player.car.vy * lead : 0) - VIEW.height / 2;
    const k = Math.min(1, dt * 5);
    state.camera.x += (clamp(tx, 0, Math.max(0, WORLD.width - VIEW.width)) - state.camera.x) * k;
    state.camera.y += (clamp(ty, 0, Math.max(0, WORLD.height - VIEW.height)) - state.camera.y) * k;
  }

  // -- Consequences -----------------------------------------------------------------

  /** After an arrest or a hospital visit: the fee, the clean slate, the doorstep. */
  function applyAftermath(kind) {
    const player = state.player;
    const place = placeById(city, kind === 'busted' ? 'police' : 'hospital');
    if (player.car !== null) {
      player.car.driver = null;
      player.car.parked = true;
      player.car = null;
    }
    state.cash = Math.max(0, state.cash - (kind === 'busted' ? MONEY.bustFee : MONEY.wastedFee));
    state.heat = 0;
    player.bustMeter = 0;
    player.health = WALKER.health;
    player.x = place.marker.x;
    player.y = place.marker.y;
    // The law goes home: every Interceptor leaves the world.
    for (const car of state.cars) if (car.driver === 'police') car.driver = 'gone';
    state.cars = state.cars.filter((c) => c.driver !== 'gone');
    setBanner(
      kind === 'busted' ? 'BUSTED' : 'WASTED',
      kind === 'busted' ? `$${MONEY.bustFee} in fines and fees.` : `$${MONEY.wastedFee} in hospital bills.`,
      3.4,
    );
  }

  // -- Saves -------------------------------------------------------------------------

  function snapshotSave() {
    return {
      v: 1,
      cash: state.cash,
      storyIndex: director.storyIndex,
      reserveAmmo: state.player.reserve,
      seed: state.seed,
      sideRotation: director.sideRotation,
      stats: { ...state.stats },
    };
  }

  function applySave(save) {
    state.cash = save.cash;
    state.player.reserve = save.reserveAmmo;
    state.stats = { ...save.stats };
    director.applyProgress(save.storyIndex, save.sideRotation);
    if (save.storyIndex >= 5) state.storyComplete = true;
  }

  // -- The step ------------------------------------------------------------------------

  const director = createDirector({
    state,
    placeById: (id) => placeById(city, id),
    setBanner,
    showDialogue,
    addHeat,
    setHeatAtLeast(amount) {
      if (state.heat < amount) state.heat = amount;
      state.lastSeenAt = state.time;
    },
    spawnSpecialCar(type, placeId, missionTag) {
      const place = placeById(city, placeId);
      const car = spawnParkedCar(type, place);
      car.mission = missionTag;
      return car;
    },
    pay(amount, events) {
      state.cash += amount;
      state.stats.jobs += 1;
      events.push({ type: 'cash', amount });
    },
  });

  function step(dt, input) {
    const events = [];
    state.time += dt;

    // Dialogue advances on a press, and while it is open the world's clocks hold.
    if (state.dialogue !== null) {
      if (input.interact || input.confirm) {
        state.dialogue.index += 1;
        events.push({ type: 'dialogueStep' });
        if (state.dialogue.index >= state.dialogue.lines.length) {
          state.dialogueDone = state.dialogue.tag;
          state.dialogue = null;
        }
      }
      updateCamera(dt);
      return events;
    }

    if (!state.staging) {
      updatePlayer(dt, input, events);
      updateCombat(dt, input, events);
    }

    for (const car of state.cars) {
      if (car.driver === 'traffic' || (car.driver === 'police' && car.leaving)) updateTrafficCar(car, dt, events);
    }
    if (!state.staging) {
      managePolice(dt);
      for (const car of state.cars) {
        if (car.driver === 'police' && !car.leaving) updatePoliceCar(car, dt, events);
      }
    }
    for (const car of state.cars) {
      if (car.driver === null) {
        // A parked car shoved by a collision slides a little, then settles.
        car.x += car.vx * dt;
        car.y += car.vy * dt;
        car.vx *= Math.max(0, 1 - 4 * dt);
        car.vy *= Math.max(0, 1 - 4 * dt);
        if (Math.hypot(car.vx, car.vy) < 4) { car.vx = 0; car.vy = 0; }
      }
      collideCarWithWorld(car, events, dt);
    }
    collideCars(events);
    updateCarPedHits(events);
    updatePeds(dt, events);
    updateCarEffects(dt, events);
    updateParticles(dt);

    for (const pickup of state.pickups) {
      if (pickup.active) continue;
      pickup.timer -= dt;
      if (pickup.timer <= 0) pickup.active = true;
    }

    if (!state.staging) {
      updateHeat(dt);
      updateBust(dt, events);
      if (state.player.health <= 0) {
        state.player.health = 0;
        events.push({ type: 'wasted' });
      }
      director.update(dt, events);
    }

    // Gone cars (police who peeled off) leave the world entirely.
    if (state.cars.some((c) => c.driver === 'gone')) {
      state.cars = state.cars.filter((c) => c.driver !== 'gone');
    }

    updateCamera(dt);
    return events;
  }

  return {
    state,
    director,
    step,
    stars,
    setBanner,
    showDialogue,
    applyAftermath,
    snapshotSave,
    applySave,
    reportCrime,
    witnessed,
    /** Snap the camera to the player at once (a new game, a load, a staged scene). */
    centreCamera() {
      state.camera.x = clamp(state.player.x - VIEW.width / 2, 0, Math.max(0, WORLD.width - VIEW.width));
      state.camera.y = clamp(state.player.y - VIEW.height / 2, 0, Math.max(0, WORLD.height - VIEW.height));
    },
  };
}

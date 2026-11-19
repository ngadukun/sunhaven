// The four screenshot scenes behind ?shot=title|city|chase|mission (with &seed=N).
// Each is staged from the real world and the real rules: the world idles for a moment so
// the streets are alive, then the principals are placed — a man on a Palma Heights
// sidewalk with a job across the city, a red coupe downtown with the law closing in, a
// courier mid-run with his passenger aboard. Nothing is drawn that the game does not
// draw in play, and once staged the scene is frozen: staging mode holds the player, the
// police and the mission clocks still while the traffic rolls past.
import { CAR_TYPES, CITY, SCREEN } from './config.js';
import { blockRect, intersection, placeById } from './city.js';

const IDLE_INPUT = {
  x: 0, y: 0, sprint: false, handbrake: false,
  interact: false, confirm: false, reload: false, shoot: false, aim: null,
};

function idle(world, seconds) {
  const steps = Math.round(seconds / (1 / 60));
  for (let i = 0; i < steps; i += 1) world.step(1 / 60, IDLE_INPUT);
}

/** The parked car nearest a point, pressed into a new identity for the scene. */
function pressCar(world, x, y, type) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.state.cars) {
    if (car.driver !== null) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  best.type = type;
  best.def = CAR_TYPES[type];
  return best;
}

/** A traffic car re-roled as an Interceptor and parked in the frame. */
function pressInterceptor(world, x, y, angle) {
  let donor = null;
  for (const car of world.state.cars) {
    if (car.driver === 'traffic') { donor = car; break; }
  }
  donor.type = 'interceptor';
  donor.def = CAR_TYPES.interceptor;
  donor.color = '#14181d';
  donor.driver = 'police';
  donor.route = null;
  donor.x = x;
  donor.y = y;
  donor.angle = angle;
  donor.vx = 0;
  donor.vy = 0;
  return donor;
}

export function stageShot(name, world) {
  const { state } = world;
  state.staging = true;
  const player = state.player;

  if (name === 'city') {
    idle(world, 1.5);
    const rect = blockRect(1, 2);
    player.car = null;
    player.x = rect.x - 30;
    player.y = rect.y + 104;
    player.angle = 0.4;
    const docks = placeById(state.city, 'docks');
    state.objectiveOverride = {
      text: 'Pick up the package at the Sunhaven Docks',
      x: docks.marker.x,
      y: docks.marker.y,
    };
    world.centreCamera();
    return { screen: SCREEN.PLAY };
  }

  if (name === 'chase') {
    idle(world, 2);
    const hub = intersection(3, 3);
    const car = pressCar(world, hub.x, hub.y, 'coupe');
    car.color = '#d90429';
    car.x = hub.x + 130;
    car.y = hub.y + 27;
    car.angle = 0;
    car.vx = 0;
    car.vy = 0;
    car.driver = 'player';
    car.parked = false;
    car.everDriven = true;
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    player.angle = 0;
    pressInterceptor(world, car.x - 128, car.y - 64, 0.25);
    pressInterceptor(world, car.x + 158, car.y + 58, Math.PI + 0.2);
    state.heat = 250; // exactly three stars
    state.lastSeenAt = state.time;
    state.cash = 240;
    world.centreCamera();
    return { screen: SCREEN.PLAY };
  }

  if (name === 'mission') {
    idle(world, 2);
    const road = intersection(7, 3);
    const car = pressCar(world, road.x, road.y, 'sedan');
    car.color = '#7a8899';
    car.x = road.x + 60;
    car.y = road.y + 27;
    car.angle = 0;
    car.vx = 0;
    car.vy = 0;
    car.driver = 'player';
    car.parked = false;
    car.everDriven = true;
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    player.angle = 0;
    world.director.stageCourier(car);
    state.heat = 50; // one star, courtesy of Paco's nerves
    state.lastSeenAt = state.time;
    state.cash = 1500;
    world.centreCamera();
    return { screen: SCREEN.PLAY };
  }

  // title: the city idles behind the name; the camera looks over the beachfront.
  idle(world, 2.5);
  state.camera.x = Math.max(0, CITY.width - 1060);
  state.camera.y = 560;
  return { screen: SCREEN.TITLE };
}

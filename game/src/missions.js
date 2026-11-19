// The work: Marisol Vega's five-job story, and the endless side work that follows it.
// The director watches the world the way a fixer would — it never moves anything itself
// except the jobs' own pieces (a marked coupe, a waiting passenger, a bank van); it
// reads where Leo is, what he is driving and what he has broken, and it pays out when a
// job is done. Between jobs it sends him back to Vega Auto Works for the next one.
import { HEAT, MONEY } from './config.js';

export const STORY = [
  {
    title: 'First Wheels',
    pay: 300,
    intro: [
      { who: 'Marisol', text: 'Leo Santos. Heard you drive like the road owes you money.' },
      { who: 'Marisol', text: 'Simple start: bring me a car. Any car with four wheels and a future. My lot, tonight.' },
      { who: 'Leo', text: 'Borrowed or bought?' },
      { who: 'Marisol', text: 'Borrowed. Permanently. Go.' },
    ],
    outro: [
      { who: 'Marisol', text: 'It runs, it steers, it is not on fire. You pass the interview.' },
    ],
  },
  {
    title: 'Hot Property',
    pay: 600,
    intro: [
      { who: 'Marisol', text: 'A collector across town keeps a Futo GT I admire. Red, loud, impossible to miss.' },
      { who: 'Marisol', text: 'It is parked up by the Coral Court. Bring it back CLEAN — every dent comes out of your end.' },
    ],
    outro: [
      { who: 'Marisol', text: 'Clean lines, clean paint. The collector will cry into his money. Beautiful.' },
    ],
  },
  {
    title: 'The Courier',
    pay: 900,
    intro: [
      { who: 'Marisol', text: 'Paco is at the Coral Court with a bag that makes people nervous. He needs the Palma Marina.' },
      { who: 'Marisol', text: 'Fast, Leo. The harbour master locks the gate soon, and Paco sweats attention.' },
    ],
    outro: [
      { who: 'Marisol', text: 'Paco made his boat and kept his bag. Whatever was in it, we never ask.' },
    ],
  },
  {
    title: 'Dockside Distraction',
    pay: 1400,
    intro: [
      { who: 'Marisol', text: 'The night crew at the Docks needs the law looking the other way. You are the other way.' },
      { who: 'Marisol', text: 'Smash up their spare crates — eight of them — then lose every star before you come back.' },
    ],
    outro: [
      { who: 'Marisol', text: 'Quiet streets, empty sky, one very confused harbour patrol. Perfect work.' },
    ],
  },
  {
    title: 'The Sunhaven Score',
    pay: 3000,
    intro: [
      { who: 'Marisol', text: 'Last one, and it is not small. The Sunhaven Trust is moving its armored van tonight.' },
      { who: 'Marisol', text: 'It sits at the bank, Leo. The whole city will hear the alarm. Bring it to me anyway.' },
    ],
    outro: [
      { who: 'Marisol', text: 'You drove the loudest truck in Sunhaven through its own alarm. Legend.' },
      { who: 'Marisol', text: 'That is the story, driver. The city is yours now — work still comes in, if you want it.' },
    ],
  },
];

const SIDE_KINDS = ['chop', 'fare', 'delivery'];
export const SIDE_TITLES = { chop: 'Chop Run', fare: 'Fare Job', delivery: 'Delivery Run' };

/**
 * The director. `api` is the world's small set of levers (places, banners, dialogue,
 * heat, special cars, payment). State is plain data on `director.state` so the shell,
 * the shots and the harness can all read where the story stands.
 */
export function createDirector(api) {
  const { state } = api;
  const director = {
    storyIndex: 0,
    sideRotation: 0,
    state: {
      phase: 'meet', // meet → brief → active; then sideOffer → sideActive, round and round
      mission: null, // working data for the active story job
      side: null, // working data for the active side job
      paco: null, // {x, y, aboard, carId} while the Courier runs
      sideCooldown: false, // a finished side job re-offers only on a fresh arrival
    },
    objective,
    update,
    applyProgress,
    stageCourier,
  };

  function vega() {
    return api.placeById('vega');
  }

  function playerNear(place, radius) {
    const p = state.player;
    return Math.hypot(p.x - place.marker.x, p.y - place.marker.y) < radius;
  }

  function startBrief() {
    const job = STORY[director.storyIndex];
    director.state.phase = 'brief';
    api.showDialogue(job.intro, `story-${director.storyIndex}`);
    api.setBanner(job.title, `Job ${director.storyIndex + 1} of ${STORY.length} — $${job.pay}`, 3.6);
  }

  function beginMission() {
    const index = director.storyIndex;
    const m = { index, phase: 'main', timeLeft: 0, trickle: 0, banter: 0, crateBase: state.cratesSmashed, targetCar: null, vanCar: null };
    director.state.mission = m;
    if (index === 1) {
      // The Futo GT waits in the Coral Court's lot, red as a warning light.
      const car = api.spawnSpecialCar('coupe', 'hotel', 'hotProperty');
      car.color = '#d90429';
      m.targetCar = car;
    }
    if (index === 2) {
      const hotel = api.placeById('hotel');
      director.state.paco = { x: hotel.marker.x - 26, y: hotel.marker.y - 20, aboard: false, carId: null };
      m.phase = 'pickup';
    }
    if (index === 4) {
      const van = api.spawnSpecialCar('van', 'bank', 'scoreVan');
      m.vanCar = van;
    }
    director.state.phase = 'active';
  }

  function completeMission(events) {
    const job = STORY[director.storyIndex];
    api.pay(job.pay, events);
    api.setBanner(`${job.title} — done`, `+$${job.pay} from Marisol`, 3.8);
    api.showDialogue(job.outro, `story-outro-${director.storyIndex}`);
    director.state.mission = null;
    director.state.paco = null;
    director.storyIndex += 1;
    if (director.storyIndex >= STORY.length) {
      state.storyComplete = true;
      director.state.phase = 'sideOffer';
      events.push({ type: 'storyComplete' });
    } else {
      director.state.phase = 'meet';
    }
  }

  function failMission(reason) {
    api.setBanner('Job blown', reason, 3.6);
    director.state.mission = null;
    director.state.paco = null;
    director.state.phase = 'meet';
  }

  // -- Side work -----------------------------------------------------------------

  function offerSide() {
    const kind = SIDE_KINDS[director.sideRotation % SIDE_KINDS.length];
    director.sideRotation = (director.sideRotation + 1) % SIDE_KINDS.length;
    const side = { kind, phase: 'main', timeLeft: 0, from: null, to: null, passenger: false };
    director.state.side = side;
    if (kind === 'fare') {
      side.from = api.placeById('hotel');
      side.to = api.placeById('marina');
      side.timeLeft = 150;
      director.state.paco = { x: side.from.marker.x - 26, y: side.from.marker.y - 20, aboard: false, carId: null };
    } else if (kind === 'delivery') {
      side.from = api.placeById('docks');
      side.to = api.placeById('vega');
      side.timeLeft = 170;
      side.phase = 'pickup';
    }
    director.state.phase = 'sideActive';
  }

  function completeSide(events) {
    const side = director.state.side;
    const player = state.player;
    let pay = 0;
    if (side.kind === 'chop') {
      const car = player.car;
      pay = Math.round(car.def.value * (car.health / 100));
    } else if (side.kind === 'fare') {
      pay = Math.round(120 + Math.hypot(side.to.marker.x - side.from.marker.x, side.to.marker.y - side.from.marker.y) * 0.12);
    } else {
      const d = Math.hypot(side.to.marker.x - side.from.marker.x, side.to.marker.y - side.from.marker.y);
      pay = Math.round(MONEY.deliveryBase + d * MONEY.deliveryRate);
    }
    api.pay(pay, events);
    api.setBanner(`${SIDE_TITLES[side.kind]} — done`, `+$${pay}`, 3.2);
    director.state.side = null;
    director.state.paco = null;
    director.state.phase = 'sideOffer';
    // The next job is offered on a fresh arrival at the curb, not in the same breath:
    // otherwise a driver who finishes one job in a valuable car would instantly sell
    // it as a Chop Run without ever being asked.
    director.state.sideCooldown = true;
  }

  // -- The objective line the HUD shows ------------------------------------------

  function objective() {
    if (state.objectiveOverride !== null) return state.objectiveOverride;
    const s = director.state;
    const player = state.player;
    const at = (place, text, timer) => ({ text, x: place.marker.x, y: place.marker.y, timer });
    if (s.phase === 'meet') return at(vega(), 'Meet Marisol at Vega Auto Works');
    if (s.phase === 'brief') return at(vega(), STORY[director.storyIndex].title);
    if (s.phase === 'sideOffer') return { text: 'Side work is waiting — check the curb by Vega Auto Works', x: vega().marker.x, y: vega().marker.y };
    if (s.phase === 'sideActive' && s.side !== null) {
      const side = s.side;
      if (side.kind === 'chop') {
        if (player.car !== null && player.car.def.value >= MONEY.chopMinimum) {
          return at(vega(), `Deliver the ${player.car.def.name} to Vega Auto Works`);
        }
        return { text: `Steal a car worth $${MONEY.chopMinimum}+ for the chop shop`, x: player.x, y: player.y, anywhere: true };
      }
      if (side.kind === 'fare') {
        if (!s.passenger) return { text: 'Pick up the fare at the Coral Court Hotel', x: side.from.marker.x, y: side.from.marker.y, timer: side.timeLeft };
        return { text: 'Take your passenger to Palma Marina', x: side.to.marker.x, y: side.to.marker.y, timer: side.timeLeft };
      }
      if (side.phase === 'pickup') return { text: 'Collect the package at the Sunhaven Docks', x: side.from.marker.x, y: side.from.marker.y, timer: side.timeLeft };
      return { text: 'Deliver the package to Vega Auto Works', x: side.to.marker.x, y: side.to.marker.y, timer: side.timeLeft };
    }
    if (s.phase !== 'active' || s.mission === null) return null;
    const m = s.mission;
    switch (m.index) {
      case 0:
        if (player.car !== null) return at(vega(), 'Deliver the car to Vega Auto Works');
        return { text: 'Steal a car — any car', x: player.x, y: player.y, anywhere: true };
      case 1: {
        const car = m.targetCar;
        if (car === null || car.dead) return at(vega(), 'The Futo is gone — see Marisol');
        if (player.car === car) return at(vega(), 'Deliver the Futo GT to Vega Auto Works — keep it clean');
        return { text: 'Steal the red Futo GT at the Coral Court Hotel', x: car.x, y: car.y };
      }
      case 2: {
        if (m.phase === 'pickup') {
          const hotel = api.placeById('hotel');
          return { text: 'Pick up Paco at the Coral Court Hotel', x: hotel.marker.x, y: hotel.marker.y };
        }
        const marina = api.placeById('marina');
        return { text: 'Drive Paco to Palma Marina — he is hot, move!', x: marina.marker.x, y: marina.marker.y, timer: m.timeLeft };
      }
      case 3: {
        const smashed = state.cratesSmashed - m.crateBase;
        if (smashed < 8) {
          const docks = api.placeById('docks');
          return { text: `Smash the dock crates — ${smashed} of 8`, x: docks.marker.x, y: docks.marker.y };
        }
        return { text: 'Now lose the heat — stay out of sight', x: player.x, y: player.y, anywhere: true };
      }
      case 4: {
        const van = m.vanCar;
        if (van === null || van.dead) return at(vega(), 'The van is gone — see Marisol');
        if (player.car === van) return at(vega(), 'Deliver the armored van to Vega Auto Works');
        return { text: 'Steal the armored van at Sunhaven Trust Bank', x: van.x, y: van.y };
      }
      default:
        return null;
    }
  }

  // -- The per-step watch ----------------------------------------------------------

  function update(dt, events) {
    const s = director.state;
    const player = state.player;

    // A finished conversation starts whatever it was introducing.
    if (state.dialogueDone !== null) {
      const tag = state.dialogueDone;
      state.dialogueDone = null;
      if (tag === `story-${director.storyIndex}` && s.phase === 'brief') beginMission();
    }

    if (s.phase === 'meet' && playerNear(vega(), 95)) startBrief();

    if (s.phase === 'sideOffer') {
      if (playerNear(vega(), 110)) {
        if (!s.sideCooldown) offerSide();
      } else {
        s.sideCooldown = false;
      }
    }

    if (s.phase === 'active' && s.mission !== null) updateMission(dt, events);
    if (s.phase === 'sideActive' && s.side !== null) updateSide(dt, events);
  }

  function updateMission(dt, events) {
    const s = director.state;
    const m = s.mission;
    const player = state.player;

    if (m.index === 0) {
      if (player.car !== null && playerNear(vega(), 105)) completeMission(events);
      return;
    }
    if (m.index === 1) {
      const car = m.targetCar;
      if (car !== null && car.dead) {
        failMission('The Futo is a wreck. Marisol wanted a car, not a sculpture.');
        return;
      }
      if (player.car === car && playerNear(vega(), 105)) {
        if (car.health >= 55) completeMission(events);
        else {
          failMission('Too wrecked — Marisol waves it away. She will find you another.');
        }
      }
      return;
    }
    if (m.index === 2) {
      const paco = director.state.paco;
      if (m.phase === 'pickup') {
        if (paco !== null && player.car !== null && Math.hypot(player.x - paco.x, player.y - paco.y) < 74) {
          paco.aboard = true;
          paco.carId = player.car.id;
          m.phase = 'drive';
          m.timeLeft = 150;
          api.setBanner('Paco is in', 'Palma Marina — and make it quick.', 2.6);
          events.push({ type: 'pickupPassenger' });
        }
        return;
      }
      // The drive: the clock runs and Paco's nerves raise the temperature.
      m.timeLeft -= dt;
      m.trickle += dt;
      if (m.trickle >= 15) {
        m.trickle -= 15;
        api.addHeat(20);
      }
      // And Paco, being Paco, narrates his own nerves at the halfway marks.
      if (m.banter === 0 && m.timeLeft < 100) {
        m.banter = 1;
        api.setBanner('Paco: You drive angry, friend.', 'I like it. Mostly.', 2.2);
      } else if (m.banter === 1 && m.timeLeft < 45) {
        m.banter = 2;
        api.setBanner('Paco: That boat leaves with or without me.', 'Mostly without, if you keep sightseeing.', 2.2);
      }
      if (paco !== null && paco.aboard && player.car !== null) paco.carId = player.car.id;
      if (paco !== null && paco.aboard && player.car === null) {
        // Out of the car, Paco waits with it — but if Leo walks off, the job frays.
      }
      if (m.timeLeft <= 0) {
        failMission('The gate closed without Paco. Marisol is not pleased.');
        return;
      }
      const marina = api.placeById('marina');
      if (paco !== null && paco.aboard && player.car !== null && playerNear(marina, 100)) {
        completeMission(events);
      }
      return;
    }
    if (m.index === 3) {
      const smashed = state.cratesSmashed - m.crateBase;
      if (smashed >= 8 && state.heat <= 0) completeMission(events);
      return;
    }
    if (m.index === 4) {
      const van = m.vanCar;
      if (van !== null && van.dead) {
        failMission('The van is scrap. The Score will have to wait for another night.');
        return;
      }
      if (player.car === van && m.phase === 'main') {
        m.phase = 'deliver';
        api.setHeatAtLeast(400);
        api.setBanner('The bank alarm is screaming', 'Every badge in Sunhaven just woke up.', 3.4);
        events.push({ type: 'alarm' });
      }
      if (player.car === van && playerNear(vega(), 110)) completeMission(events);
    }
  }

  function updateSide(dt, events) {
    const s = director.state;
    const side = s.side;
    const player = state.player;

    if (side.kind === 'chop') {
      if (player.car !== null && player.car.def.value >= MONEY.chopMinimum && playerNear(vega(), 105)) {
        completeSide(events);
      }
      return;
    }
    if (side.kind === 'fare') {
      const paco = director.state.paco;
      if (!side.passenger) {
        if (paco !== null && player.car !== null && Math.hypot(player.x - paco.x, player.y - paco.y) < 74) {
          side.passenger = true;
          paco.aboard = true;
          paco.carId = player.car.id;
          events.push({ type: 'pickupPassenger' });
        }
        return;
      }
      side.timeLeft -= dt;
      if (side.timeLeft <= 0) {
        api.setBanner('Fare lost', 'The passenger bailed at a red light.', 2.8);
        director.state.side = null;
        director.state.paco = null;
        director.state.phase = 'sideOffer';
        return;
      }
      if (player.car !== null && playerNear(side.to, 100)) completeSide(events);
      return;
    }
    // Delivery: collect at the docks, then against the clock to Marisol's.
    if (side.phase === 'pickup') {
      if (playerNear(side.from, 100)) {
        side.phase = 'deliver';
        api.setBanner('Package aboard', 'Vega Auto Works — the clock is running.', 2.4);
        events.push({ type: 'pickupPackage' });
      }
      return;
    }
    side.timeLeft -= dt;
    if (side.timeLeft <= 0) {
      api.setBanner('Delivery failed', 'Cold packages pay nothing.', 2.8);
      director.state.side = null;
      director.state.phase = 'sideOffer';
      return;
    }
    if (playerNear(side.to, 105)) completeSide(events);
  }

  /** Restore story progress from a save: the next job waits at Marisol's, as always. */
  function applyProgress(storyIndex, sideRotation) {
    director.storyIndex = storyIndex;
    director.sideRotation = sideRotation;
    director.state.phase = storyIndex >= STORY.length ? 'sideOffer' : 'meet';
    director.state.mission = null;
    director.state.side = null;
    director.state.paco = null;
    director.state.sideCooldown = false;
  }

  /** Put the Courier mid-drive for a screenshot: Paco aboard, the clock at ~90. */
  function stageCourier(car) {
    director.storyIndex = 2;
    director.state.phase = 'active';
    director.state.mission = { index: 2, phase: 'drive', timeLeft: 90, trickle: 0, banter: 2, crateBase: state.cratesSmashed, targetCar: null, vanCar: null };
    director.state.paco = { x: car.x, y: car.y, aboard: true, carId: car.id };
  }

  return director;
}

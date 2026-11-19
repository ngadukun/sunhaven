// Boot and the one loop. Two ways in: ?shot=<scene>&seed=N stages a frozen scene,
// paints it twice and raises window.__shotReady for the screenshot; anything else runs
// the game — title, play, pause, and the screens an arrest, a hospital visit or a
// finished story bring up. The world advances in fixed steps however fast the display
// runs; sound answers the world's events; progress is saved as it is earned.
import { DEFAULT_SEED, SCREEN, STEP } from './config.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { clearSave, loadMuted, loadSave, storeMuted, storeSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

function runShot(name) {
  const seed = Number.isInteger(seedParam) ? seedParam : 7;
  const world = createWorld({ seed });
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, {});
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let save = loadSave(window.localStorage);
  let world = createWorld({ seed: save !== null ? save.seed : DEFAULT_SEED });
  if (save !== null) world.applySave(save);
  world.centreCamera();

  let screen = SCREEN.TITLE;
  let overlayUntil = 0;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let lastBanner = null;
  let muted = loadMuted(window.localStorage);
  audio.setMuted(muted);

  // Behind the title the city idles in staging mode: traffic rolls, nobody works.
  world.state.staging = true;

  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    save = world.snapshotSave();
    storeSave(window.localStorage, save);
  }

  function newGame() {
    clearSave(window.localStorage);
    world = createWorld({ seed: DEFAULT_SEED });
    world.centreCamera();
    world.state.staging = false;
    screen = SCREEN.PLAY;
    announce('A new game. Leo Santos, Sunhaven, and Marisol Vega is waiting.');
  }

  function continueGame() {
    world.state.staging = false;
    screen = SCREEN.PLAY;
    announce('Back to Sunhaven.');
  }

  // On the title screen, N starts over even when a save exists to continue.
  window.addEventListener('keydown', (event) => {
    if (screen === SCREEN.TITLE && event.code === 'KeyN') newGame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN.PLAY) screen = SCREEN.PAUSED;
  });

  function handleEvents(events) {
    for (const event of events) {
      switch (event.type) {
        case 'shot': audio.shot(); break;
        case 'dry': audio.dryFire(); break;
        case 'reloadStart': audio.reloadStart(); break;
        case 'reloadEnd': audio.reloadEnd(); break;
        case 'crash': audio.crash(event.strength); break;
        case 'horn': audio.horn(); break;
        case 'door': audio.door(); break;
        case 'smash': audio.smash(); break;
        case 'pickup': audio.pickup(); break;
        case 'cash': audio.cash(); persist(); break;
        case 'alarm': audio.alarm(); break;
        case 'busted':
          screen = SCREEN.BUSTED;
          overlayUntil = performance.now() + 2600;
          audio.bad();
          announce('Busted. The police take Leo in.');
          break;
        case 'wasted':
          screen = SCREEN.WASTED;
          overlayUntil = performance.now() + 2600;
          audio.bad();
          announce('Wasted. Leo wakes up in Sunhaven General.');
          break;
        case 'storyComplete':
          screen = SCREEN.COMPLETE;
          persist();
          announce('The Sunhaven Score is complete. The city is yours.');
          break;
        default: break;
      }
    }
  }

  function steerAudio(now) {
    const player = world.state.player;
    let siren = 0;
    if (world.stars() > 0) {
      let nearest = Infinity;
      for (const car of world.state.cars) {
        if (car.driver !== 'police' || car.dead) continue;
        nearest = Math.min(nearest, Math.hypot(car.x - player.x, car.y - player.y));
      }
      if (nearest < Infinity) siren = Math.max(0, 1 - nearest / 720);
    }
    audio.tick({
      engineOn: screen === SCREEN.PLAY && player.car !== null,
      engineLoad: player.car !== null ? Math.abs(player.car.speed) / player.car.def.topSpeed : 0,
      sirenLevel: screen === SCREEN.PLAY ? siren : 0,
      musicOn: screen !== SCREEN.PAUSED,
    });
    void now;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const actions = input.takeActions();
    if (actions.confirm || actions.interact) audio.unlock();
    if (actions.mute) {
      muted = !muted;
      audio.setMuted(muted);
      storeMuted(window.localStorage, muted);
    }

    if (screen === SCREEN.TITLE) {
      // The world idles; a confirm starts, and N (above) starts over.
      let acc = Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      while (acc >= STEP) {
        world.step(STEP, { x: 0, y: 0, sprint: false, handbrake: false, interact: false, confirm: false, reload: false, shoot: false, aim: null });
        acc -= STEP;
      }
      if (actions.confirm) {
        if (save !== null) continueGame();
        else newGame();
      }
      renderer.draw(world, screen, { hasSave: save !== null });
      steerAudio(now);
      return;
    }

    if (screen === SCREEN.BUSTED || screen === SCREEN.WASTED) {
      renderer.draw(world, screen, {});
      if (now >= overlayUntil) {
        world.applyAftermath(screen === SCREEN.BUSTED ? 'busted' : 'wasted');
        screen = SCREEN.PLAY;
        persist();
      }
      last = now;
      return;
    }

    if (screen === SCREEN.COMPLETE) {
      if (actions.confirm) screen = SCREEN.PLAY;
      renderer.draw(world, screen, {});
      last = now;
      return;
    }

    if (actions.pause && screen === SCREEN.PLAY) {
      screen = SCREEN.PAUSED;
      persist();
      announce('Paused.');
    } else if (actions.pause && screen === SCREEN.PAUSED) {
      screen = SCREEN.PLAY;
      announce('Playing.');
    }
    if (screen === SCREEN.PAUSED) {
      renderer.draw(world, screen, {});
      last = now;
      accumulator = 0;
      return;
    }

    // Play: catch the world up in fixed steps, spending each one-shot press once.
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const axes = input.axes();
    const stepInput = {
      x: axes.x,
      y: axes.y,
      sprint: input.sprint(),
      handbrake: input.handbrake(),
      interact: actions.interact,
      confirm: actions.confirm,
      reload: actions.reload,
      shoot: input.shooting(),
      aim: renderer.screenToWorld(input.mouse.x, input.mouse.y),
    };
    let steps = 0;
    while (accumulator >= STEP && steps < 5 && screen === SCREEN.PLAY) {
      const events = world.step(STEP, stepInput);
      handleEvents(events);
      stepInput.interact = false;
      stepInput.confirm = false;
      stepInput.reload = false;
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
    // A new banner is news worth hearing as well as seeing.
    if (world.state.banner !== null && world.state.banner !== lastBanner) {
      lastBanner = world.state.banner;
      announce(world.state.banner.sub ? `${world.state.banner.text}. ${world.state.banner.sub}` : world.state.banner.text);
    }
    saveTimer += steps * STEP;
    if (saveTimer > 20) {
      saveTimer = 0;
      persist();
    }
    steerAudio(now);
    renderer.draw(world, screen, {});
  }

  announce('Sunhaven. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// Keyboard and mouse, gathered in one place. Held keys and the mouse button are read as
// state every step; one-shot presses (interact, confirm, pause, reload, mute) are queued
// and handed over exactly once, so a press between two frames is never lost and never
// counted twice. The game loop asks; this module only listens.

const KEYMAP = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  handbrake: ['Space'],
  interact: ['KeyF', 'KeyE'],
  confirm: ['Enter', 'Space'],
  pause: ['KeyP', 'Escape'],
  reload: ['KeyR'],
  mute: ['KeyM'],
};

const CODE_TO_ACTION = new Map();
for (const [action, codes] of Object.entries(KEYMAP)) {
  for (const code of codes) {
    if (!CODE_TO_ACTION.has(code)) CODE_TO_ACTION.set(code, []);
    CODE_TO_ACTION.get(code).push(action);
  }
}

const ONE_SHOTS = ['interact', 'confirm', 'pause', 'reload', 'mute'];

export function createInput(canvas) {
  const held = new Set();
  const pressed = { interact: false, confirm: false, pause: false, reload: false, mute: false };
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    const actions = CODE_TO_ACTION.get(event.code);
    if (!actions) return;
    held.add(event.code);
    if (!event.repeat) {
      for (const action of actions) if (ONE_SHOTS.includes(action)) pressed[action] = true;
    }
    // Keep the page from scrolling or the browser from treating keys as its own.
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends its keyup: drop everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  // A right-click over the game is an aim, not a menu.
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    pressed.confirm = true;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function anyHeld(action) {
    for (const code of KEYMAP[action]) if (held.has(code)) return true;
    return false;
  }

  return {
    mouse,
    /** Steering axes from the keys: x is right-minus-left, y is down-minus-up, each -1..1. */
    axes() {
      return {
        x: (anyHeld('right') ? 1 : 0) - (anyHeld('left') ? 1 : 0),
        y: (anyHeld('down') ? 1 : 0) - (anyHeld('up') ? 1 : 0),
      };
    },
    sprint() {
      return anyHeld('sprint');
    },
    handbrake() {
      return anyHeld('handbrake');
    },
    shooting() {
      return mouse.down;
    },
    /** The one-shot presses since the last call; each is reported once, then cleared. */
    takeActions() {
      const taken = { ...pressed };
      for (const action of ONE_SHOTS) pressed[action] = false;
      return taken;
    },
  };
}

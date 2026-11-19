// Drawing only: the world goes in, pixels come out. The camera shows a 1280x720 logical
// window, scaled to fit the screen with the sea colour filling any letterbox margin.
// Everything is flat shapes and canvas text — no images, no fonts to load — and anything
// that twinkles (police lights, the water) reads the world's clock, so a staged scene
// frozen at one moment draws the same frame every time.
import {
  BEACH_X, CITY, FONT, GUN, HEAT, PALETTE, SCREEN, SEA_X, VIEW, WORLD,
} from './config.js';
import { blockRect, districtAt, intersection } from './city.js';

const DISTRICT_GROUND = {
  palma: PALETTE.grass,
  downtown: PALETTE.pavement,
  coral: '#ddd3b8',
  docks: PALETTE.lot,
};

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function hash2(x, y) {
  let h = (Math.floor(x) * 73856093) ^ (Math.floor(y) * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let lastDistrict = '';
  let districtUntil = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    view.scale = Math.min(w / VIEW.width, h / VIEW.height);
    view.x = (w - VIEW.width * view.scale) / 2;
    view.y = (h - VIEW.height * view.scale) / 2;
  }

  /** A point in client (mouse) pixels, in world coordinates. */
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return {
      x: (px - view.x) / view.scale + currentCam.x,
      y: (py - view.y) / view.scale + currentCam.y,
    };
  }

  let currentCam = { x: 0, y: 0 };

  function text(value, x, y, size, color, align = 'left', weight = 600) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function rrect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // -- The ground and the streets ------------------------------------------------

  function drawGround(state) {
    // The sea first, everywhere; the land is drawn over it.
    ctx.fillStyle = PALETTE.seaDeep;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(SEA_X + 26, 0, WORLD.width - SEA_X - 26, WORLD.height);
    // Slow stripes on the water, drifting with the world's clock.
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    const drift = (state.time * 16) % 72;
    for (let y = -72 + drift; y < WORLD.height; y += 72) {
      ctx.fillRect(SEA_X + 60, y, 190, 7);
      ctx.fillRect(SEA_X + 300, y + 34, 150, 6);
    }
    // Sand, then the wet band at the waterline.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(BEACH_X, 0, CITY.beachW, WORLD.height);
    ctx.fillStyle = PALETTE.sandWet;
    ctx.fillRect(SEA_X - 12, 0, 16, WORLD.height);

    // Roads: one asphalt slab under the whole city, blocks laid over it.
    ctx.fillStyle = PALETTE.road;
    ctx.fillRect(0, 0, CITY.width, CITY.height);
    ctx.strokeStyle = PALETTE.lane;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let j = 0; j <= CITY.rows; j += 1) {
      const y = intersection(0, j).y;
      ctx.moveTo(0, y);
      ctx.lineTo(CITY.width, y);
    }
    for (let i = 0; i <= CITY.cols; i += 1) {
      const x = intersection(i, 0).x;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CITY.height);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Blocks: a sidewalk rim, then the district's ground.
    for (let row = 0; row < CITY.rows; row += 1) {
      for (let col = 0; col < CITY.cols; col += 1) {
        const r = blockRect(col, row);
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(r.x - 7, r.y - 7, r.w + 14, r.h + 14);
        ctx.fillStyle = DISTRICT_GROUND[districtAt(col, row)];
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }

    // Crosswalks: zebra stripes on each approach to each intersection.
    ctx.fillStyle = PALETTE.crosswalk;
    ctx.globalAlpha = 0.75;
    for (let j = 0; j <= CITY.rows; j += 1) {
      for (let i = 0; i <= CITY.cols; i += 1) {
        const c = intersection(i, j);
        for (let s = -2; s <= 2; s += 1) {
          if (s === 0) continue;
          ctx.fillRect(c.x - 52, c.y + s * 13 - 4, 30, 8); // west approach
          ctx.fillRect(c.x + 22, c.y + s * 13 - 4, 30, 8); // east approach
          ctx.fillRect(c.x + s * 13 - 4, c.y - 52, 8, 30); // north approach
          ctx.fillRect(c.x + s * 13 - 4, c.y + 22, 8, 30); // south approach
        }
      }
    }
    ctx.globalAlpha = 1;

    // Parking lots and driveways.
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    for (const lot of state.city.lots) ctx.fillRect(lot.x, lot.y, lot.w, lot.h);

    // The marina pier, reaching into the water.
    const marina = state.city.places.find((p) => p.id === 'marina');
    if (marina) {
      ctx.fillStyle = '#9a744e';
      ctx.fillRect(marina.marker.x + 30, marina.marker.y - 16, SEA_X + 190 - marina.marker.x, 32);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = marina.marker.x + 52; x < SEA_X + 180; x += 22) ctx.fillRect(x, marina.marker.y - 16, 3, 32);
    }
  }

  // -- Buildings and dressing ------------------------------------------------------

  function drawBuildings(state) {
    for (const b of state.city.buildings) {
      ctx.fillStyle = 'rgba(10, 18, 24, 0.30)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.kind === 'tower' || b.kind === 'bank' || b.kind === 'civic' || b.kind === 'hotel') {
        // A grid of windows; which ones are lit is fixed by where the building stands.
        const cols = Math.max(2, Math.floor(b.w / 17));
        const rows = Math.max(2, Math.floor(b.h / 15));
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            const lit = hash2(b.x + cx * 31, b.y + cy * 47) < 0.34;
            ctx.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDark;
            ctx.fillRect(b.x + 6 + cx * ((b.w - 10) / cols), b.y + 6 + cy * ((b.h - 10) / rows), 8, 6);
          }
        }
        if (b.kind === 'hotel') {
          ctx.fillStyle = 'rgba(180, 60, 60, 0.85)';
          ctx.fillRect(b.x, b.y - 7, b.w, 7);
        }
      } else if (b.kind === 'house') {
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, 8);
        ctx.fillStyle = PALETTE.houseWall;
        ctx.fillRect(b.x + b.w / 2 - 9, b.y + b.h - 4, 18, 4);
      } else if (b.kind === 'warehouse' || b.kind === 'marina') {
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        for (let x = b.x + 14; x < b.x + b.w - 8; x += 26) ctx.fillRect(x, b.y + 4, 3, b.h - 8);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(b.x + b.w / 2 - 22, b.y + b.h - 16, 44, 12);
      } else if (b.kind === 'shop') {
        ctx.fillStyle = 'rgba(120, 40, 20, 0.55)';
        ctx.fillRect(b.x, b.y, b.w, 14);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(b.x + 10, b.y + b.h - 22, b.w - 20, 14);
      }
    }
    // Place names, lettered over their buildings like signage.
    ctx.textBaseline = 'middle';
    for (const place of state.city.places) {
      const b = state.city.buildings.find((bb) => bb.place === place.id);
      if (!b) continue;
      const label = place.name.toUpperCase();
      ctx.font = `700 12px ${FONT}`;
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = 'rgba(14, 22, 30, 0.72)';
      rrect(b.x + b.w / 2 - w / 2, b.y - 22, w, 17, 4);
      ctx.fill();
      text(label, b.x + b.w / 2, b.y - 13, 12, PALETTE.text, 'center', 700);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function drawProps(state) {
    // Lamps: a post dot by day; their glow belongs to the polish pass.
    ctx.fillStyle = '#5a6068';
    for (const lamp of state.city.lamps) {
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Palms: a short trunk and a star of fronds.
    for (const palm of state.city.palms) {
      ctx.strokeStyle = PALETTE.palmTrunk;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(palm.x - 4, palm.y + 5);
      ctx.lineTo(palm.x, palm.y);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.palmLeaf;
      ctx.lineWidth = 3.4;
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + palm.x;
        ctx.beginPath();
        ctx.moveTo(palm.x, palm.y);
        ctx.quadraticCurveTo(
          palm.x + Math.cos(a) * 11, palm.y + Math.sin(a) * 11 - 3,
          palm.x + Math.cos(a) * 19, palm.y + Math.sin(a) * 19 + 3,
        );
        ctx.stroke();
      }
    }
    // Crates: a stencilled box with a cross brace; smashed ones are gone.
    for (const crate of state.crates) {
      if (crate.smashed) continue;
      ctx.fillStyle = PALETTE.crate;
      ctx.fillRect(crate.x, crate.y, crate.w, crate.h);
      ctx.strokeStyle = PALETTE.crateDark;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(crate.x + 1, crate.y + 1, crate.w - 2, crate.h - 2);
      ctx.beginPath();
      ctx.moveTo(crate.x + 2, crate.y + 2);
      ctx.lineTo(crate.x + crate.w - 2, crate.y + crate.h - 2);
      ctx.moveTo(crate.x + crate.w - 2, crate.y + 2);
      ctx.lineTo(crate.x + 2, crate.y + crate.h - 2);
      ctx.stroke();
    }
    // Ammo pickups: a green tin on the porch, gently bobbing.
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const bob = Math.sin(state.time * 3.2 + pickup.x) * 3;
      ctx.fillStyle = '#2f6d3a';
      rrect(pickup.x - 13, pickup.y - 9 + bob, 26, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#e8e3d0';
      ctx.fillRect(pickup.x - 8, pickup.y - 2 + bob, 4, 5);
      ctx.fillRect(pickup.x - 2, pickup.y - 2 + bob, 4, 5);
      ctx.fillRect(pickup.x + 4, pickup.y - 2 + bob, 4, 5);
    }
  }

  // -- Vehicles and people ----------------------------------------------------------

  function drawCar(state, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const L = car.def.length;
    const W = car.def.width;
    ctx.fillStyle = 'rgba(8, 12, 16, 0.35)';
    rrect(-L / 2 + 3, -W / 2 + 5, L, W, 7);
    ctx.fill();
    if (car.type === 'interceptor') {
      ctx.fillStyle = '#14181d';
      rrect(-L / 2, -W / 2, L, W, 7);
      ctx.fill();
      ctx.fillStyle = '#eef1f3';
      rrect(-L * 0.16, -W / 2, L * 0.34, W, 4);
      ctx.fill();
      // The light bar: red and blue take turns, twice a second and a bit.
      const phase = Math.floor(state.time * 2.6) % 2;
      ctx.fillStyle = phase === 0 ? PALETTE.policeRed : '#5a1414';
      ctx.fillRect(-7, -W / 2 + 3, 12, 7);
      ctx.fillStyle = phase === 1 ? PALETTE.policeBlue : '#12283f';
      ctx.fillRect(-7, W / 2 - 10, 12, 7);
    } else {
      ctx.fillStyle = car.dead ? '#3c3f42' : car.color;
      rrect(-L / 2, -W / 2, L, W, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      rrect(-L * 0.30, -W * 0.34, L * 0.52, W * 0.68, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(16, 26, 34, 0.75)';
      ctx.fillRect(L * 0.10, -W * 0.36, L * 0.13, W * 0.72); // windshield
      ctx.fillRect(-L * 0.30, -W * 0.36, L * 0.10, W * 0.72); // rear window
    }
    // Headlights and brake lights.
    ctx.fillStyle = '#ffeeb0';
    ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 6);
    ctx.fillRect(L / 2 - 3, W / 2 - 9, 3, 6);
    ctx.fillStyle = car.brake ? '#ff5a4e' : '#8e2f28';
    ctx.fillRect(-L / 2, -W / 2 + 3, 3, 6);
    ctx.fillRect(-L / 2, W / 2 - 9, 3, 6);
    ctx.restore();

    if (car.driver === 'player') {
      // A small gold chevron rides over Leo's car, the way these games always mark you.
      ctx.fillStyle = PALETTE.accent;
      ctx.beginPath();
      ctx.moveTo(car.x - 8, car.y - car.def.width - 20 + Math.sin(state.time * 3) * 2);
      ctx.lineTo(car.x + 8, car.y - car.def.width - 20 + Math.sin(state.time * 3) * 2);
      ctx.lineTo(car.x, car.y - car.def.width - 11 + Math.sin(state.time * 3) * 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPerson(x, y, angle, shirt, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (opts.down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = shirt;
      rrect(-13, -6, 26, 12, 6);
      ctx.fill();
      ctx.fillStyle = PALETTE.playerSkin;
      ctx.beginPath();
      ctx.arc(16, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(8,12,16,0.28)';
      ctx.beginPath();
      ctx.arc(1.5, 2.5, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.playerSkin;
      ctx.beginPath();
      ctx.arc(0, 0, 5.6, 0, Math.PI * 2);
      ctx.fill();
      if (opts.gun) {
        ctx.strokeStyle = '#22282e';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
        ctx.lineTo(Math.cos(angle) * 17, Math.sin(angle) * 17);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPeople(state, paco) {
    for (const ped of state.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.dead ? '#6d6d6d' : ped.color, { down: ped.state === 'down' });
    }
    // Paco, when he is waiting: a man, a suitcase, and no patience at all.
    if (paco && !paco.aboard) {
      drawPerson(paco.x, paco.y, -Math.PI / 2, '#f4f1de', {});
      ctx.fillStyle = '#7a4a21';
      ctx.fillRect(paco.x + 9, paco.y + 2, 11, 8);
      text('PACO', paco.x, paco.y - 18, 11, PALETTE.text, 'center', 700);
    }
    const player = state.player;
    if (player.car === null) {
      // A gold ring at Leo's feet, and Leo himself, gun out when he is aiming.
      ctx.strokeStyle = PALETTE.accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 15.5, 0, Math.PI * 2);
      ctx.stroke();
      drawPerson(player.x, player.y, player.angle, PALETTE.player, { gun: true });
    }
  }

  function drawBulletsAndParticles(state) {
    ctx.strokeStyle = '#ffe9a3';
    ctx.lineWidth = 2.6;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const p of state.particles) {
      const lifeRatio = p.life / p.maxLife;
      if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(70, 72, 76, ${0.34 * lifeRatio})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'tire') {
        ctx.fillStyle = `rgba(200, 200, 200, ${0.25 * lifeRatio})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = `rgba(255, 205, 80, ${lifeRatio})`;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      } else if (p.kind === 'casing') {
        ctx.fillStyle = `rgba(212, 175, 55, ${lifeRatio})`;
        ctx.fillRect(p.x - 2, p.y - 1, 4, 2);
      } else if (p.kind === 'flash') {
        ctx.fillStyle = `rgba(255, 230, 150, ${lifeRatio})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * lifeRatio + 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'fire') {
        ctx.fillStyle = `rgba(240, 118, 30, ${0.72 * lifeRatio})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.55 + lifeRatio * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 214, 96, ${0.85 * lifeRatio})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.42 * lifeRatio + 1, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'debris') {
        ctx.fillStyle = `rgba(150, 105, 45, ${lifeRatio})`;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
    }
    // Skid marks, laid by hard cornering, fading over half a minute.
    ctx.strokeStyle = 'rgba(20, 20, 22, 0.4)';
    ctx.lineWidth = 4;
    for (const skid of state.skids) {
      ctx.globalAlpha = Math.min(0.4, skid.life / 30);
      ctx.beginPath();
      ctx.moveTo(skid.x1, skid.y1);
      ctx.lineTo(skid.x2, skid.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // -- The HUD -----------------------------------------------------------------------

  function formatMoney(n) {
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatTimer(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function drawMinimap(state, world) {
    const MW = 218;
    const MH = 138;
    const x0 = VIEW.width - MW - 16;
    const y0 = VIEW.height - MH - 16;
    const sx = MW / WORLD.width;
    const sy = MH / WORLD.height;
    ctx.fillStyle = 'rgba(12, 20, 28, 0.82)';
    rrect(x0, y0, MW, MH, 6);
    ctx.fill();
    // Land, beach and sea as three flat bands.
    ctx.fillStyle = '#4a6b52';
    ctx.fillRect(x0 + 3, y0 + 3, CITY.width * sx - 6, MH - 6);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(x0 + 3 + CITY.width * sx, y0 + 3, CITY.beachW * sx, MH - 6);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(x0 + 3 + SEA_X * sx, y0 + 3, (WORLD.width - SEA_X) * sx - 3, MH - 6);
    // The road grid, as scratches of light.
    ctx.strokeStyle = 'rgba(240,240,230,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= CITY.cols; i += 1) {
      const x = x0 + 3 + intersection(i, 0).x * sx;
      ctx.moveTo(x, y0 + 3);
      ctx.lineTo(x, y0 + MH - 3);
    }
    for (let j = 0; j <= CITY.rows; j += 1) {
      const y = y0 + 3 + intersection(0, j).y * sy;
      ctx.moveTo(x0 + 3, y);
      ctx.lineTo(x0 + 3 + CITY.width * sx, y);
    }
    ctx.stroke();

    const dot = (wx, wy, size, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x0 + 3 + wx * sx - size / 2, y0 + 3 + wy * sy - size / 2, size, size);
    };
    // The named places, as fixed gold points a driver can steer by.
    for (const place of state.city.places) dot(place.marker.x, place.marker.y, 3, PALETTE.accent);
    const waitingPaco = world.director.state.paco;
    if (waitingPaco && !waitingPaco.aboard) dot(waitingPaco.x, waitingPaco.y, 3.6, '#39d0d8');
    for (const car of state.cars) {
      if (car.driver === 'traffic') dot(car.x, car.y, 2.4, '#dfe6ea');
    }
    const flash = Math.floor(state.time * 2.6) % 2 === 0;
    for (const car of state.cars) {
      if (car.driver === 'police' && !car.dead) dot(car.x, car.y, 4, flash ? PALETTE.policeRed : PALETTE.policeBlue);
    }
    const objective = world.director.objective();
    if (objective && !objective.anywhere) {
      const ox = x0 + 3 + objective.x * sx;
      const oy = y0 + 3 + objective.y * sy;
      ctx.fillStyle = PALETTE.accent;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
      ctx.restore();
    }
    // Leo: a white wedge pointing his way.
    const player = state.player;
    const px = x0 + 3 + player.x * sx;
    const py = y0 + 3 + player.y * sy;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.angle);
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3.6, -3.2);
    ctx.lineTo(-3.6, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // The district he is standing in, named under the map.
    const col = Math.max(0, Math.min(CITY.cols - 1, Math.floor((player.x - CITY.road) / CITY.pitchX)));
    const row = Math.max(0, Math.min(CITY.rows - 1, Math.floor((player.y - CITY.road) / CITY.pitchY)));
    const name = player.x > SEA_X ? 'THE SEA' : player.x > BEACH_X ? 'CORAL BEACH' : { palma: 'PALMA HEIGHTS', downtown: 'DOWNTOWN SUNHAVEN', coral: 'CORAL BEACHFRONT', docks: 'THE DOCKS' }[districtAt(col, row)];
    if (name !== lastDistrict) {
      lastDistrict = name;
      districtUntil = state.time + 2.6;
    }
    text(name, x0 + MW / 2, y0 + MH + 16, 12.5, PALETTE.text, 'center', 700);
    return name;
  }

  function drawHud(state, world, screen) {
    const player = state.player;
    // Cash and health, top-left.
    text(formatMoney(state.cash), 20, 38, 30, PALETTE.text, 'left', 800);
    ctx.fillStyle = 'rgba(10, 16, 22, 0.55)';
    rrect(20, 48, 168, 11, 5);
    ctx.fill();
    const hp = Math.max(0, player.health) / 100;
    ctx.fillStyle = hp > 0.45 ? PALETTE.good : hp > 0.22 ? PALETTE.accent : PALETTE.danger;
    if (hp > 0) {
      rrect(21.5, 49.5, 165 * hp, 8, 4);
      ctx.fill();
    }

    // Stars, top-right; under them, the bust meter when the law has hands on him.
    const stars = world.stars();
    ctx.font = `26px ${FONT}`;
    ctx.textAlign = 'right';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < stars ? PALETTE.accent : 'rgba(230,230,220,0.28)';
      ctx.fillText('★', VIEW.width - 20 - (4 - i) * 27, 40);
    }
    if (player.bustMeter > 0.04) {
      const w = 138;
      ctx.fillStyle = 'rgba(10,16,22,0.55)';
      rrect(VIEW.width - 20 - w, 50, w, 9, 4);
      ctx.fill();
      ctx.fillStyle = PALETTE.danger;
      rrect(VIEW.width - 19 - w, 51, (w - 2) * Math.min(1, player.bustMeter / HEAT.bustTime), 7, 3);
      ctx.fill();
      text('BUSTED?', VIEW.width - 20, 74, 12, PALETTE.danger, 'right', 800);
    }

    // The objective, top-centre: what, how far, and the clock when there is one.
    const objective = world.director.objective();
    if (objective && screen === SCREEN.PLAY) {
      const dist = objective.anywhere ? 0 : Math.hypot(objective.x - player.x, objective.y - player.y);
      let label = objective.text;
      if (!objective.anywhere) label += `  ·  ${Math.round(dist / 10)}m`;
      if (objective.timer !== undefined && objective.timer !== null) label += `  ·  ${formatTimer(objective.timer)}`;
      ctx.font = `700 16.5px ${FONT}`;
      const w = ctx.measureText(label).width + 30;
      ctx.fillStyle = PALETTE.panel;
      rrect(VIEW.width / 2 - w / 2, 14, w, 30, 15);
      ctx.fill();
      const urgent = objective.timer !== undefined && objective.timer !== null && objective.timer < 30;
      text(label, VIEW.width / 2, 35.5, 16.5, urgent ? PALETTE.danger : PALETTE.text, 'center', 700);

      // Off-screen, the objective gets an arrow on the edge of the world.
      const cam = state.camera;
      const onScreen = objective.x > cam.x && objective.x < cam.x + VIEW.width && objective.y > cam.y && objective.y < cam.y + VIEW.height;
      if (!onScreen && !objective.anywhere) {
        const cx = clamp(objective.x - cam.x, 44, VIEW.width - 44);
        const cy = clamp(objective.y - cam.y, 60, VIEW.height - 44);
        const aim = Math.atan2(objective.y - player.y, objective.x - player.x);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(aim);
        ctx.fillStyle = PALETTE.accent;
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-9, -9);
        ctx.lineTo(-9, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        text(`${Math.round(dist / 10)}m`, cx, cy + 26, 12.5, PALETTE.accent, 'center', 700);
      }
    }

    // The banner: big news, briefly.
    if (state.banner !== null && state.time < state.banner.until) {
      const remain = state.banner.until - state.time;
      ctx.globalAlpha = Math.min(1, remain / 0.5);
      text(state.banner.text, VIEW.width / 2, 108, 30, PALETTE.accent, 'center', 800);
      if (state.banner.sub) text(state.banner.sub, VIEW.width / 2, 132, 16, PALETTE.text, 'center', 600);
      ctx.globalAlpha = 1;
    }

    // The pistol, bottom-left: its name, its magazine as pips, its spare rounds.
    ctx.fillStyle = PALETTE.panel;
    rrect(16, VIEW.height - 64, 196, 48, 8);
    ctx.fill();
    text('PISTOL', 28, VIEW.height - 40, 13, PALETTE.muted, 'left', 800);
    for (let i = 0; i < GUN.magazine; i += 1) {
      ctx.fillStyle = i < player.mag ? PALETTE.accent : 'rgba(230,230,220,0.22)';
      ctx.fillRect(28 + i * 11, VIEW.height - 34, 7, 14);
    }
    text(player.reloadTimer > 0 ? '···' : `${player.reserve}`, 178, VIEW.height - 24, 16, PALETTE.text, 'right', 700);

    // Speed, when driving, bottom-centre.
    if (player.car !== null) {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.22);
      text(`${kmh}`, VIEW.width / 2 + 130, VIEW.height - 24, 30, PALETTE.text, 'right', 800);
      text('km/h', VIEW.width / 2 + 136, VIEW.height - 24, 13, PALETTE.muted, 'left', 600);
    }

    drawMinimap(state, world);
    void lastDistrict;
    void districtUntil;
  }

  function wrapText(value, maxWidth) {
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line === '' ? word : `${line} ${word}`;
      if (ctx.measureText(next).width > maxWidth && line !== '') {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line !== '') lines.push(line);
    return lines;
  }

  function drawDialogue(state) {
    const dialogue = state.dialogue;
    if (dialogue === null) return;
    const line = dialogue.lines[Math.min(dialogue.index, dialogue.lines.length - 1)];
    const w = Math.min(760, VIEW.width - 80);
    const x = VIEW.width / 2 - w / 2;
    ctx.font = `16px ${FONT}`;
    const lines = wrapText(line.text, w - 44);
    const h = 44 + lines.length * 22 + 16;
    const y = VIEW.height - h - 84;
    ctx.fillStyle = PALETTE.panel;
    rrect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,183,3,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    text(line.who.toUpperCase(), x + 22, y + 27, 13, PALETTE.accent, 'left', 800);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `16px ${FONT}`;
    ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, x + 22, y + 52 + i * 22));
    text('F ▸', x + w - 20, y + h - 12, 13, PALETTE.muted, 'right', 700);
  }

  // -- Screens -------------------------------------------------------------------------

  function veil(alpha) {
    ctx.fillStyle = `rgba(8, 14, 22, ${alpha})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawTitle(state, hasSave) {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, 'rgba(10, 18, 30, 0.25)');
    grad.addColorStop(0.55, 'rgba(10, 18, 30, 0.45)');
    grad.addColorStop(1, 'rgba(10, 18, 30, 0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // A sun stripe under the name.
    text('SUNHAVEN', VIEW.width / 2, 252, 92, PALETTE.text, 'center', 800);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(VIEW.width / 2 - 218, 268, 436, 7);
    text('an open-world crime caper', VIEW.width / 2, 306, 21, PALETTE.accent, 'center', 600);
    text('Leo Santos just rolled into Sunhaven with an empty tank and a borrowed name.', VIEW.width / 2, 356, 16.5, PALETTE.text, 'center', 500);
    text('Marisol Vega at Vega Auto Works has work for a driver who does not ask questions.', VIEW.width / 2, 380, 16.5, PALETTE.text, 'center', 500);
    if (hasSave) {
      text('ENTER — Continue', VIEW.width / 2, 452, 22, PALETTE.good, 'center', 800);
      text('N — New Game', VIEW.width / 2, 486, 17, PALETTE.muted, 'center', 700);
    } else {
      text('▶  New Game', VIEW.width / 2, 452, 22, PALETTE.good, 'center', 800);
    }
    text('WASD drive & walk · F enter/exit car · mouse aim, click shoot · R reload · Shift sprint · Space handbrake · P pause · M mute', VIEW.width / 2, VIEW.height - 26, 13.5, PALETTE.muted, 'center', 500);
    void state;
  }

  function drawCentredPanel(title, titleColor, lines) {
    veil(0.55);
    text(title, VIEW.width / 2, 300, 54, titleColor, 'center', 800);
    lines.forEach((line, i) => text(line, VIEW.width / 2, 348 + i * 26, 17, PALETTE.text, 'center', 600));
  }

  // -- The frame -------------------------------------------------------------------------

  function draw(world, screen, opts = {}) {
    const state = world.state;
    currentCam = state.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.seaDeep;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.save();
    ctx.translate(-state.camera.x, -state.camera.y);
    drawGround(state);
    drawBuildings(state);
    drawProps(state);
    for (const car of state.cars) if (car.driver !== 'player') drawCar(state, car);
    if (state.player.car !== null) drawCar(state, state.player.car);
    drawPeople(state, world.director.state.paco);
    drawBulletsAndParticles(state);
    ctx.restore();

    if (screen === SCREEN.TITLE) {
      drawHudTitleSafe(state, world);
      drawTitle(state, opts.hasSave === true);
      return;
    }
    drawHud(state, world, screen);
    drawDialogue(state);
    if (screen === SCREEN.PAUSED) {
      drawCentredPanel('PAUSED', PALETTE.text, ['The city holds its breath.', '', 'P or Esc — back to it']);
    } else if (screen === SCREEN.BUSTED) {
      drawCentredPanel('BUSTED', PALETTE.policeBlue, ['The Sunhaven PD thanks you for your cooperation.', `$150 in fines and fees.`]);
    } else if (screen === SCREEN.WASTED) {
      drawCentredPanel('WASTED', PALETTE.danger, ['Sunhaven General patches you up and sends the bill.', '$200, payable on waking.']);
    } else if (screen === SCREEN.COMPLETE) {
      const s = state.stats;
      drawCentredPanel('THE SUNHAVEN SCORE — COMPLETE', PALETTE.accent, [
        'Marisol was right about you, driver.',
        '',
        `Jobs done: ${s.jobs}    Cars stolen: ${s.stolen}    Shots fired: ${s.shots}`,
        `Cash on hand: ${formatMoney(state.cash)}`,
        '',
        'ENTER — back to the city. Side work pays by the job.',
      ]);
    }
  }

  /** On the title screen the world idles behind the panel; only the map stays hidden. */
  function drawHudTitleSafe(state, world) {
    void state;
    void world;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, resize };
}

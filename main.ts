// Sunhaven's hand-in (Node 22, standard library only). The game is this directory's
// game/ folder — plain static files a desktop browser loads offline — and this program
// delivers it: it copies game/ and screenshots/ beside this file into the output
// directory and writes dossier.json there with the vendored make.fun library, exactly
// as the scorer will rebuild it.
//
// Before any of that, the screenshots are held to the bounty's own rules, checked here
// so a bad capture fails loudly at the desk instead of quietly at the gate: three or
// four of them, each a PNG or JPEG of at most 256 KiB, no side longer than 1280 pixels
// and no side shorter than 480. The image headers are read by hand — the standard
// library has no image codec, and the dimensions live in the first few bytes.
//
// Run it:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.)
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const SHOT_RULES = { min: 3, max: 4, maxBytes: 262144, maxSide: 1280, minSide: 480 };

/** The pixel size of a PNG or JPEG, read from its header; null when it is neither. */
function imageSize(path) {
  const bytes = readFileSync(path);
  // PNG: an 8-byte signature, then the IHDR chunk with width and height as u32s.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  // JPEG: walk the marker segments until a start-of-frame carries the dimensions.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      if (marker === 0xd9 || marker === 0xda) return null;
      const length = bytes.readUInt16BE(at + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      }
      at += 2 + length;
    }
  }
  return null;
}

/** Check the screenshots against the bounty's rules; returns the file names in order. */
function checkScreenshots(dir) {
  if (!existsSync(dir)) throw new Error('screenshots/ is missing: the entry needs its 3 or 4 screenshots');
  const names = readdirSync(dir)
    .filter((name) => /\.(png|jpe?g)$/i.test(name) && !name.startsWith('.'))
    .sort();
  if (names.length < SHOT_RULES.min || names.length > SHOT_RULES.max) {
    throw new Error(`screenshots/: ${names.length} images found, the bounty takes ${SHOT_RULES.min} to ${SHOT_RULES.max}`);
  }
  for (const name of names) {
    const path = join(dir, name);
    const size = statSync(path).size;
    if (size > SHOT_RULES.maxBytes) {
      throw new Error(`screenshots/${name}: ${size} bytes is over the ${SHOT_RULES.maxBytes}-byte cap`);
    }
    const dims = imageSize(path);
    if (dims === null) throw new Error(`screenshots/${name}: not a readable PNG or JPEG`);
    const long = Math.max(dims.width, dims.height);
    const short = Math.min(dims.width, dims.height);
    if (long > SHOT_RULES.maxSide) throw new Error(`screenshots/${name}: long side ${long}px is over ${SHOT_RULES.maxSide}`);
    if (short < SHOT_RULES.minSide) throw new Error(`screenshots/${name}: short side ${short}px is under ${SHOT_RULES.minSide}`);
  }
  return names;
}

const shots = checkScreenshots(join(here, 'screenshots'));

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the
// others refuse an entry the scorer would refuse — more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files in all, or a path under
// game/ over 1000 bytes.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

let gameFiles = 0;
let gameBytes = 0;
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else {
      gameFiles += 1;
      gameBytes += statSync(path).size;
    }
  }
})(join(out, 'game'));

console.log(
  `Sunhaven handed in: ${gameFiles} game files (${gameBytes} bytes), `
  + `${shots.length} screenshots (${shots.join(', ')}), dossier ${dossier.length} bytes -> ${out}`,
);

// Progress between visits, kept in the browser's local storage: cash, where the story
// stands, the running stats and the spare ammunition. A save is only trusted after it has
// been picked apart field by field — a corrupted or hand-edited save is refused whole,
// never half-applied, and the game simply starts fresh without it.
import { MUTE_KEY, SAVE_KEY } from './config.js';

function isCount(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

/** The shape a save must have, checked on the way in. Returns the save or null. */
export function validateSave(data) {
  if (data === null || typeof data !== 'object') return null;
  if (data.v !== 1) return null;
  if (!isCount(data.cash, 100000000)) return null;
  if (!isCount(data.storyIndex, 5)) return null;
  if (!isCount(data.reserveAmmo, 9999)) return null;
  if (!isCount(data.seed, 4294967295)) return null;
  if (!isCount(data.sideRotation, 2)) return null;
  const stats = data.stats;
  if (stats === null || typeof stats !== 'object') return null;
  if (!isCount(stats.stolen, 100000) || !isCount(stats.shots, 1000000) || !isCount(stats.jobs, 100000)) return null;
  return {
    v: 1,
    cash: data.cash,
    storyIndex: data.storyIndex,
    reserveAmmo: data.reserveAmmo,
    seed: data.seed,
    sideRotation: data.sideRotation,
    stats: { stolen: stats.stolen, shots: stats.shots, jobs: stats.jobs },
  };
}

/** Read and validate the stored save; null when there is none worth having. */
export function loadSave(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return null;
    return validateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Store a save. Storage can refuse (private windows, quotas): the game goes on regardless. */
export function storeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // A visit without storage keeps its progress in memory only.
  }
}

/** Forget the stored save (a finished story starting over, or a player asking to). */
export function clearSave(storage) {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to forget in a browser that kept nothing.
  }
}

/** The mute preference: a small thing, stored apart from the save so it survives a reset. */
export function loadMuted(storage) {
  try {
    return storage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function storeMuted(storage, muted) {
  try {
    storage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // The preference then lasts the visit.
  }
}

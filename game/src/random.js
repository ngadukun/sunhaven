// A seeded random source (splitmix32): one seed always makes the same city, the same
// traffic, the same day — which is what lets a screenshot scene be staged exactly, and a
// saved game come back to the world it left. Helpers cover the shapes the game asks for.

export function createRng(seed) {
  let state = seed >>> 0;

  /** The next float in [0, 1). */
  function next() {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 4294967296;
  }

  return {
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max], both ends included. */
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** One member of a non-empty array. */
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    /** +1 or -1, a fair coin apart. */
    sign() {
      return next() < 0.5 ? -1 : 1;
    },
    /** A whole new stream seeded from this one, for a subsystem that wants its own dice. */
    fork() {
      return createRng(Math.floor(next() * 4294967296));
    },
  };
}

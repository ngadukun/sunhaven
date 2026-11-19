// Every sound in Sunhaven is synthesized — there are no audio files. A small WebAudio
// rig: one-shot voices for shots, crashes, horns and the till, and three standing voices
// (the engine, the siren, a synthwave pulse) whose levels the game steers each frame.
// Nothing sounds until the player first touches the game, as browsers require.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let siren = null;
  let muted = false;
  let musicStep = 0;
  let musicNext = 0;

  function ensure() {
    if (ctx !== null) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function env(gain, at, peak, decay) {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  }

  function tone({ type = 'square', from = 440, to = null, at = 0, dur = 0.15, peak = 0.2 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    env(gain, t, peak, dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise({ at = 0, dur = 0.2, peak = 0.3, freq = 1200, q = 0.8, type = 'bandpass' }) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    env(gain, t, peak, dur);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
  }

  // -- Standing voices -------------------------------------------------------

  function engineVoice() {
    if (engine !== null) return engine;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    // A second saw, a fifth up and turned down: the difference between a note and an engine.
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 82;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.45;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(osc2Gain).connect(filter);
    filter.connect(gain).connect(master);
    osc.start();
    osc2.start();
    engine = { osc, osc2, filter, gain };
    return engine;
  }

  function sirenVoice() {
    if (siren !== null) return siren;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    siren = { osc, gain };
    return siren;
  }

  // A synthwave pulse: a driving minor-key bass, a hat tick on the off-beats, and a soft
  // pad that rolls around the same four chords. Steps are scheduled a little ahead.
  const BASS = [55, 0, 55, 55, 0, 55, 0, 55, 65.4, 0, 65.4, 65.4, 0, 65.4, 0, 65.4,
    49, 0, 49, 49, 0, 49, 0, 49, 73.4, 0, 73.4, 73.4, 0, 82.4, 0, 73.4];
  const STEP_SECONDS = 0.16;

  function scheduleMusic() {
    while (musicNext < ctx.currentTime + 0.3) {
      const at = Math.max(0, musicNext - ctx.currentTime);
      const step = musicStep % BASS.length;
      const note = BASS[step];
      if (note > 0) tone({ type: 'sawtooth', from: note, at, dur: 0.14, peak: 0.055 });
      if (step % 2 === 1) noise({ at, dur: 0.03, peak: 0.012, freq: 6000, type: 'highpass' });
      if (step === 0) {
        const roots = [110, 130.8, 98, 146.8];
        const root = roots[Math.floor(musicStep / BASS.length) % roots.length];
        tone({ type: 'sine', from: root * 2, at, dur: 2.2, peak: 0.03 });
        tone({ type: 'sine', from: root * 3, at, dur: 2.2, peak: 0.018 });
      }
      musicStep += 1;
      musicNext += STEP_SECONDS;
    }
  }

  return {
    /** Call on the first user gesture; safe to call again. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master !== null) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /**
     * Steer the standing voices once a frame. engineLoad and sirenLevel run 0..1;
     * music plays while musicOn. Time is the audio clock's own.
     */
    tick({ engineOn, engineLoad, sirenLevel, musicOn }) {
      if (ctx === null) return;
      const t = ctx.currentTime;
      const e = engineVoice();
      const target = engineOn ? 0.05 + engineLoad * 0.05 : 0;
      e.gain.gain.setTargetAtTime(target, t, 0.09);
      e.osc.frequency.setTargetAtTime(52 + engineLoad * 165, t, 0.08);
      e.osc2.frequency.setTargetAtTime((52 + engineLoad * 165) * 1.5, t, 0.08);
      e.filter.frequency.setTargetAtTime(280 + engineLoad * 900, t, 0.1);
      const s = sirenVoice();
      s.gain.gain.setTargetAtTime(sirenLevel * 0.045, t, 0.12);
      s.osc.frequency.setTargetAtTime(660 + Math.sin(t * 5.2) * 190, t, 0.03);
      if (musicOn) {
        if (musicNext < t) {
          musicNext = t + 0.05;
          musicStep = 0;
        }
        scheduleMusic();
      }
    },
    shot() {
      noise({ dur: 0.11, peak: 0.32, freq: 1900, q: 0.6 });
      tone({ type: 'square', from: 220, to: 60, dur: 0.09, peak: 0.16 });
    },
    dryFire() {
      tone({ type: 'square', from: 1200, to: 900, dur: 0.03, peak: 0.06 });
    },
    reloadStart() {
      tone({ type: 'square', from: 500, to: 300, dur: 0.05, peak: 0.08 });
      tone({ type: 'square', from: 800, to: 500, at: 0.09, dur: 0.05, peak: 0.08 });
    },
    reloadEnd() {
      tone({ type: 'square', from: 700, to: 1100, dur: 0.05, peak: 0.1 });
    },
    crash(strength) {
      const s = Math.min(1, strength);
      noise({ dur: 0.16 + s * 0.25, peak: 0.14 + s * 0.3, freq: 300 + s * 300, q: 0.5, type: 'lowpass' });
      tone({ type: 'sine', from: 120, to: 40, dur: 0.2 + s * 0.2, peak: 0.12 * s });
    },
    horn() {
      tone({ type: 'square', from: 370, dur: 0.16, peak: 0.05 });
      tone({ type: 'square', from: 466, dur: 0.16, peak: 0.05 });
    },
    door() {
      noise({ dur: 0.06, peak: 0.12, freq: 500, type: 'lowpass' });
      tone({ type: 'sine', from: 180, to: 90, dur: 0.07, peak: 0.1 });
    },
    smash() {
      noise({ dur: 0.22, peak: 0.26, freq: 900, q: 0.4 });
      tone({ type: 'triangle', from: 300, to: 80, dur: 0.16, peak: 0.12 });
    },
    pickup() {
      tone({ type: 'sine', from: 660, dur: 0.07, peak: 0.12 });
      tone({ type: 'sine', from: 990, at: 0.07, dur: 0.1, peak: 0.12 });
    },
    cash() {
      tone({ type: 'square', from: 1320, dur: 0.06, peak: 0.07 });
      tone({ type: 'square', from: 1760, at: 0.06, dur: 0.12, peak: 0.07 });
    },
    alarm() {
      tone({ type: 'square', from: 880, dur: 0.12, peak: 0.1 });
      tone({ type: 'square', from: 880, at: 0.18, dur: 0.12, peak: 0.1 });
    },
    bad() {
      tone({ type: 'sawtooth', from: 220, to: 110, dur: 0.3, peak: 0.12 });
    },
  };
}

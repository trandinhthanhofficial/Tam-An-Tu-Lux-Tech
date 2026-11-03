/* =============================================================================
   audio.js — everything you hear, synthesised in the browser.
   No audio files except the two background tracks. The four ritual sounds are
   built from oscillators + filtered noise so they stay crisp and weightless.
   ========================================================================== */
(function (global) {
  'use strict';

  let AC = null, master = null, musicGain = null, sfxGain = null;
  let noiseBuf = null;
  let musicEl = null, musicSrc = null;
  let muted = false, musicOn = true;
  let ambientTimer = null;

  const TRACKS = ['assets/music/music1.mp3', 'assets/music/music2.mp3'];
  let trackIdx = Math.floor(Math.random() * TRACKS.length);

  /* ------------------------------------------------------------------ setup */
  function ctx() { return AC; }

  function init() {
    if (AC) return AC;
    const C = global.AudioContext || global.webkitAudioContext;
    if (!C) return null;
    AC = new C();

    master = AC.createGain(); master.gain.value = 0.85; master.connect(AC.destination);
    musicGain = AC.createGain(); musicGain.gain.value = musicOn ? 0.5 : 0; musicGain.connect(master);
    sfxGain = AC.createGain(); sfxGain.gain.value = 1; sfxGain.connect(master);

    noiseBuf = makeNoise(2.0);
    startMusic();
    // No ambient wooden-fish loop on purpose: the mõ must only sound when
    // somebody actually strikes it, otherwise it reads as a background glitch.
    ambientTimer = setInterval(function () { if (!muted) bell(0.5); }, 47000);

    // iOS/Safari keeps the context suspended until a real gesture — resume it.
    if (AC.state === 'suspended') AC.resume().catch(function () {});
    document.addEventListener('pointerdown', function () {
      if (AC && AC.state === 'suspended') AC.resume().catch(function () {});
    }, { passive: true });

    return AC;
  }

  function makeNoise(seconds) {
    const n = Math.floor(AC.sampleRate * seconds);
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function noiseSource() {
    const s = AC.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    return s;
  }

  /* ------------------------------------------------------------------ music */
  function startMusic() {
    if (!AC || musicEl) return;
    musicEl = new Audio(TRACKS[trackIdx % TRACKS.length]);
    musicEl.crossOrigin = 'anonymous';
    musicEl.loop = false;
    musicSrc = AC.createMediaElementSource(musicEl);
    musicSrc.connect(musicGain);
    musicEl.onended = function () { trackIdx++; swapTrack(); };
    musicEl.play().catch(function () {});
  }

  function swapTrack() {
    if (!AC) return;
    try { if (musicEl) { musicEl.pause(); musicEl.onended = null; } } catch (e) {}
    try { if (musicSrc) musicSrc.disconnect(); } catch (e) {}
    musicEl = null; musicSrc = null;
    startMusic();
  }

  function nextTrack() { trackIdx++; swapTrack(); }

  function duck(on) {
    if (!musicGain) return;
    const t = AC.currentTime, target = !musicOn ? 0 : (on ? 0.16 : 0.5);
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(target, t + 0.5);
  }

  function setMusic(on) {
    musicOn = !!on;
    if (musicGain) {
      const t = AC.currentTime;
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.linearRampToValueAtTime(musicOn ? 0.5 : 0, t + 0.4);
    }
    if (musicOn && musicEl && musicEl.paused) musicEl.play().catch(function () {});
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.85;
  }

  /* ---------------------------------------------------------------- wooden fish */
  // Slightly randomised each strike: a metronome-precise knock sounds fake.
  function mo() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    const base = 600 + Math.random() * 90;
    const o = AC.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.58, t + 0.05);
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = base * 1.15; bp.Q.value = 3.2;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.19 + Math.random() * 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(bp); bp.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.16);

    // mallet click
    const n = noiseSource();
    const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1700;
    const ng = AC.createGain();
    ng.gain.setValueAtTime(0.045, t);
    ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    n.connect(hp); hp.connect(ng); ng.connect(sfxGain);
    n.start(t); n.stop(t + 0.06);
  }

  // 99 strikes complete — an ascending chime, then the temple bell answers.
  function meritChime() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    [523.3, 659.3, 784.0, 1046.5].forEach(function (f, i) {
      const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = AC.createGain(); const st = t + i * 0.11;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.1, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0004, st + 1.8);
      o.connect(g); g.connect(sfxGain);
      o.start(st); o.stop(st + 2.0);
    });
    setTimeout(function () { bell(0.7); }, 420);
  }

  /* -------------------------------------------------------------- temple bell */
  // Partial ratios of a bronze bell, with individual decay so it blooms then fades.
  const BELL_PARTS = [
    [1.0, 0.55, 7.0], [2.0, 0.34, 5.0], [2.98, 0.16, 3.2],
    [4.07, 0.09, 2.2], [5.42, 0.05, 1.5], [6.79, 0.03, 1.1],
  ];

  function bell(gain) {
    if (!AC || muted) return;
    gain = gain == null ? 1 : gain;
    const t = AC.currentTime, f0 = 196;
    for (let i = 0; i < BELL_PARTS.length; i++) {
      const p = BELL_PARTS[i];
      const o = AC.createOscillator(); o.type = 'sine';
      o.frequency.value = f0 * p[0] * (1 + (Math.random() - 0.5) * 0.002);
      const g = AC.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p[1] * gain * 0.55, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0004, t + p[2] * gain);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + p[2] * gain + 0.1);
    }
    // mallet thud: short filtered noise burst
    const n = noiseSource();
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = AC.createGain();
    ng.gain.setValueAtTime(0.18 * gain, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(lp); lp.connect(ng); ng.connect(sfxGain);
    n.start(t); n.stop(t + 0.2);
    if (global.Hall) global.Hall.pulseHalo(1);
  }

  /* ------------------------------------------------------------------ rituals */

  // Dâng hương — airy swell of incense, low body, three soft ticks of the stick.
  function sfxIncense() {
    if (!AC || muted) return;
    const t = AC.currentTime;

    const n = noiseSource();
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 1.1);
    bp.frequency.exponentialRampToValueAtTime(700, t + 3.4);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 3.6);
    n.connect(bp); bp.connect(g); g.connect(sfxGain);
    n.start(t); n.stop(t + 3.8);

    // warm low body
    const o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(146.8, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 2.6);
    const og = AC.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.2, t + 0.3);
    og.gain.exponentialRampToValueAtTime(0.0004, t + 3.2);
    o.connect(og); og.connect(sfxGain);
    o.start(t); o.stop(t + 3.4);

    // three ember ticks
    [0, 0.14, 0.31].forEach(function (d) {
      const s = noiseSource();
      const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      const sg = AC.createGain();
      sg.gain.setValueAtTime(0.09, t + d);
      sg.gain.exponentialRampToValueAtTime(0.0008, t + d + 0.09);
      s.connect(hp); hp.connect(sg); sg.connect(sfxGain);
      s.start(t + d); s.stop(t + d + 0.12);
    });
  }

  // Cánh sen — bright glassy chime, petals fluttering.
  function sfxPetal() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    const notes = [1046.5, 1396.9, 1568.0, 2093.0];
    notes.forEach(function (f, i) {
      const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = AC.createGain();
      const st = t + i * 0.055;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.075, st + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0004, st + 1.5 - i * 0.15);
      o.connect(g); g.connect(sfxGain);
      o.start(st); o.stop(st + 1.7);
    });
    // flutter
    const n = noiseSource();
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3600; bp.Q.value = 2.4;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 1.2);
    n.connect(bp); bp.connect(g); g.connect(sfxGain);
    n.start(t); n.stop(t + 1.4);
  }

  // Hoa sen — lotus blooming: major chord swell + shimmer + a soft bell on top.
  function sfxLotus() {
    if (!AC || muted) return;
    const t = AC.currentTime;
    const chord = [261.6, 329.6, 392.0, 523.3, 784.0];
    chord.forEach(function (f, i) {
      const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = AC.createGain();
      const st = t + i * 0.07;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.085, st + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0004, st + 3.4);
      o.connect(g); g.connect(sfxGain);
      o.start(st); o.stop(st + 3.6);
    });
    // shimmer
    const n = noiseSource();
    const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 3.0);
    n.connect(hp); hp.connect(g); g.connect(sfxGain);
    n.start(t); n.stop(t + 3.2);

    setTimeout(function () { bell(0.55); }, 120);
  }

  // Thỉnh chuông — one heavy strike, long decay, plus a low room rumble.
  function sfxBell() {
    if (!AC || muted) return;
    bell(1.15);
    const t = AC.currentTime;
    const o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(64, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 3.5);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 5.5);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 5.7);
  }

  const SFX = { incense: sfxIncense, petal: sfxPetal, lotus: sfxLotus, bell: sfxBell };

  function play(kind) {
    if (!AC || muted) return;
    const fn = SFX[kind];
    if (fn) fn();
  }

  global.Audio2 = {
    init: init, play: play, bell: bell, mo: mo, merit: meritChime,
    duck: duck, setMusic: setMusic, setMuted: setMuted,
    nextTrack: nextTrack,
    get ready() { return !!AC; },
    get muted() { return muted; },
    get musicOn() { return musicOn; },
  };
})(window);

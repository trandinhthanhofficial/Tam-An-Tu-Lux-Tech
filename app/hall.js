/* =============================================================================
   hall.js — the 2.5D hall renderer.

   Stage space is always 1080x1920; the canvas is scaled to fit and every
   coordinate below is in stage space, so the layout never drifts.

   Seating (32 seats, exactly):
     1  trụ trì   — centre, right in front of the altar
     3  thượng tọa — one row behind
     4  hàng cuối  — 2 per aisle  (fills last)
     8  hàng giữa  — 4 per aisle
     8  hàng trước — 4 per aisle
     8  hàng gần   — 4 per aisle  (fills first)
   ========================================================================== */
(function (global) {
  'use strict';

  const SW = 1080, SH = 1920;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  const SRC = {
    hall: 'assets/hall.jpg',
    monk: 'assets/c_monk.png', nun: 'assets/c_nun.png', granny: 'assets/c_granny.png',
    man: 'assets/c_man.png', woman: 'assets/c_woman.png', child: 'assets/c_child.png',
    anim_man: 'assets/anim_man.png', anim_woman: 'assets/anim_woman.png', anim_granny: 'assets/anim_granny.png',
    lotus: 'assets/fx_lotus.png', bell: 'assets/fx_bell.png', petal: 'assets/fx_petal.png',
  };

  const A = {};
  for (const k in SRC) { const im = new Image(); im.src = SRC[k]; A[k] = im; }

  /* ------------------------------------------------ walking / sitting strips */
  // 8 frames: 0-3 walk away from camera, 4-7 sit down onto the cushion.
  const ANIM = { man: { fw: 212, fh: 300, seatH: 210 }, woman: { fw: 212, fh: 300, seatH: 220 }, granny: { fw: 195, fh: 300, seatH: 222 } };
  const hasAnim = k => !!(ANIM[k] && A['anim_' + k] && A['anim_' + k].naturalWidth > 0);

  /* ------------------------------------------------------------- seat layout */
  /* Ten seats, matched to the cushions painted on the floor:
       1     trụ trì, centre, in front of the altar (own mat — he sits in the aisle)
       2-9   four rows of two, either side of the central aisle
       10    head of the aisle, nearest the camera (own mat — bare floor there)
     Each x/y below was measured off assets/hall.jpg so a sprite lands dead centre
     on its cushion. */
  const SEATS = [
    { x: 540, y: 1205, s: 0.340, gap: 300, role: 'abbot', mat: true },  // 1
    { x: 440, y: 1247, s: 0.270, gap: 210 },                            // 2
    { x: 650, y: 1247, s: 0.270, gap: 210 },                            // 3
    { x: 390, y: 1320, s: 0.290, gap: 285 },                            // 4
    { x: 675, y: 1320, s: 0.290, gap: 285 },                            // 5
    { x: 355, y: 1404, s: 0.310, gap: 335 },                            // 6
    { x: 690, y: 1404, s: 0.310, gap: 335 },                            // 7
    { x: 341, y: 1660, s: 0.340, gap: 396 },                            // 8
    { x: 737, y: 1660, s: 0.340, gap: 396 },                            // 9
    { x: 540, y: 1700, s: 0.360, gap: 300, mat: true },                 // 10
  ];
  const CAP = SEATS.length; // 10

  const DOOR = { x: 540, y: SH + 140 };

  /* ------------------------------------------------------------------ state */
  const visitors = new Map(); // uid -> visitor
  const fx = [];              // large effects
  const parts = [];           // petals, sparks, smoke, rings
  const blesses = [];         // short blessing lines floating over a visitor
  let myUid = null, haloPulse = 0, altarGlow = 0, flash = 0;

  /* -------------------------------------------------------------- visitors */
  // list items: { uid, name, skin, seat }  — seat is an index into SEATS, or null
  // for someone who has joined but not picked a place yet (they wait at the door).
  function sync(list) {
    const seen = new Set();
    list.forEach(function (p) {
      seen.add(p.uid);
      const idx = (p.seat != null && SEATS[p.seat]) ? p.seat : null;
      const seat = idx == null ? null : SEATS[idx];
      let v = visitors.get(p.uid);

      if (!v) {
        v = {
          uid: p.uid, name: p.name, skin: p.skin, seat: seat, seatIdx: idx,
          x: DOOR.x, y: DOOR.y,
          state: seat ? 'walk' : 'idle', frame: 0, ft: 0, sitT: 0,
          flip: false, fade: 0, glow: 0, phase: Math.random() * 6.28,
          bowT: 0, bowDur: 0, bowN: 0, bowAmp: 0,
        };
        visitors.set(p.uid, v);
      } else {
        v.name = p.name;
        if (v.skin !== p.skin) { v.skin = p.skin; v.glow = 0.8; if (v.state === 'sit') v.frame = 7; }

        if (idx !== v.seatIdx) {
          v.seatIdx = idx;
          v.seat = seat;
          if (seat) {
            // walk in from the door if they were waiting, otherwise glide across
            if (v.state === 'idle') { v.x = DOOR.x; v.y = DOOR.y; v.state = 'walk'; }
          } else {
            v.state = 'idle';
            v.x = DOOR.x; v.y = DOOR.y;
          }
        } else {
          v.seat = seat;
        }
      }
      v.isMe = p.uid === myUid;
      v.role = seat ? seat.role : 'seat';
    });
    visitors.forEach(function (v, uid) { if (!seen.has(uid)) visitors.delete(uid); });
  }

  function setMyUid(uid) { myUid = uid; visitors.forEach(function (v) { v.isMe = v.uid === uid; }); }

  function count() { return visitors.size; }

  /* ------------------------------------------------------- choosing a seat */
  let pickMode = false, pickables = [], takenList = [];

  function setPick(on, takenIdx) {
    pickMode = !!on;
    pickables = [];
    takenList = takenIdx ? takenIdx.slice() : [];
    if (!pickMode) return;
    const taken = new Set(takenList);
    SEATS.forEach(function (s, i) { if (!taken.has(i)) pickables.push(i); });
  }

  function freeCount() { return pickables.length; }

  /* stage-space hit test; main.js converts the pointer into 1080x1920 coords.
     Returns the seat index, -2 for an occupied seat, -1 for empty floor. */
  function pickAt(px, py) {
    if (!pickMode) return -1;
    let best = -1, bestD = 1e9;
    for (let k = 0; k < pickables.length; k++) {
      const i = pickables[k], s = SEATS[i];
      const cy = s.y - 34 * s.s;
      const d = Math.sqrt((px - s.x) * (px - s.x) + (py - cy) * (py - cy));
      if (d < 95 && d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) return best;
    for (let k = 0; k < takenList.length; k++) {
      const s = SEATS[takenList[k]];
      if (!s) continue;
      const cy = s.y - 34 * s.s;
      if (Math.sqrt((px - s.x) * (px - s.x) + (py - cy) * (py - cy)) < 95) return -2;
    }
    return -1;
  }

  function drawPick(t) {
    for (let k = 0; k < pickables.length; k++) {
      const i = pickables[k], s = SEATS[i];
      const cx = s.x, cy = s.y - 34 * s.s;
      const r = 30 + 4 * Math.sin(t * 2.6 + i * 1.1);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.29);
      ctx.fillStyle = 'rgba(126,29,18,.62)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,214,140,.95)';
      ctx.stroke();
      ctx.fillStyle = '#ffeec4';
      ctx.font = '700 ' + Math.round(24 + 10 * s.s) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), cx, cy + 1);
      ctx.restore();
    }
  }

  /* --------------------------------------------------------------- effects */
  function pulseHalo(v) { haloPulse = Math.max(haloPulse, v == null ? 1 : v); }

  function startBow(v, n, dur, amp) {
    v.bowT = 0; v.bowN = n; v.bowDur = dur; v.bowAmp = amp;
  }

  /* a small personal gesture — one quick bow and a few petals */
  function bow(uid) {
    const v = visitors.get(uid);
    if (!v) return;
    startBow(v, 1, 0.55, 0.05);
    const s = v.seat ? v.seat.s : 0.34;
    spawnPetals(v.x, v.y - 40 * s, 5, true, 70 * s + 30);
  }

  /* offering incense: three slow deep bows, palms together */
  function bowDeep(uid) {
    const v = visitors.get(uid);
    if (!v) return;
    startBow(v, 3, 2.7, 0.16);
  }

  /* A blessing line drifts up over the head of whoever just made an offering.
     One per person at a time: a second offering replaces the first. */
  function bless(uid, text) {
    if (!visitors.has(uid) || !text) return;
    for (let i = blesses.length - 1; i >= 0; i--) if (blesses[i].uid === uid) blesses.splice(i, 1);
    blesses.push({ uid: uid, text: text, t: 0, life: 4.0 });
  }

  function spawnPetals(x, y, n, up, spread) {
    for (let i = 0; i < n; i++) {
      parts.push({
        kind: 'petal', x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * 90,
        vx: (Math.random() - 0.5) * 70, vy: -(up ? 60 + Math.random() * 120 : 30 + Math.random() * 60),
        t: -Math.random() * 0.9, life: 2.6 + Math.random() * 1.8, s: 0.10 + Math.random() * 0.13,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2.2,
      });
    }
  }

  function spawnSparks(x, y, n, spread, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = Math.random() * spread;
      parts.push({
        kind: 'spark', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * speed * (0.4 + Math.random()), vy: -Math.abs(Math.sin(a)) * speed * 0.8 - 20,
        t: 0, life: 1.2 + Math.random() * 1.4, s: 2 + Math.random() * 3,
      });
    }
  }

  function spawnSmoke(x, y, n) {
    for (let i = 0; i < n; i++) {
      parts.push({
        kind: 'smoke', x: x + (Math.random() - 0.5) * 26, y: y + Math.random() * 20,
        vx: (Math.random() - 0.5) * 16, vy: -(22 + Math.random() * 26),
        t: 0, life: 2.6 + Math.random() * 2.2, s: 4 + Math.random() * 7,
        sway: Math.random() * 6.28,
      });
    }
  }

  function fxPlay(kind, uid) {
    const v = uid ? visitors.get(uid) : null;
    const seat = v && v.seat ? v.seat : null;
    const ox = seat ? seat.x : 540;
    const oy = seat ? seat.y - 60 * seat.s : 1000;

    if (kind === 'incense') {
      fx.push({ kind: 'incense', x: 540, y: 980, t: 0, life: 7.2, s: 1 });
      altarGlow = 1;
      spawnSmoke(540, 962, 10);
    } else if (kind === 'petal') {
      fx.push({ kind: 'petal', x: ox, y: oy, t: 0, life: 3.2, s: seat ? seat.s : 0.4 });
      spawnPetals(ox, oy - 30, 18, true, 240 * (seat ? seat.s : 0.4) + 90);
    } else if (kind === 'lotus') {
      fx.push({ kind: 'lotus', x: 540, y: 1000, t: 0, life: 4.6, s: 1 });
      spawnSparks(540, 1000, 26, 110, 90);
      spawnPetals(540, 950, 22, true, 300);
      flash = 0.9;
      pulseHalo(0.7);
    } else if (kind === 'bell') {
      fx.push({ kind: 'bell', x: 540, y: 285, t: 0, life: 6.0, s: 1 });
      parts.push({ kind: 'ring', x: 540, y: 1180, t: 0, life: 2.6, s: 0 });
      parts.push({ kind: 'ring', x: 540, y: 1180, t: -0.35, life: 2.6, s: 0 });
      parts.push({ kind: 'ring', x: 540, y: 1180, t: -0.7, life: 2.6, s: 0 });
      spawnSparks(540, 320, 22, 70, 70);
      flash = 0.55;
      pulseHalo(1.3);
    }
  }

  /* ------------------------------------------------------------------ draw */
  let last = performance.now();

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(w / SW, 0, 0, h / SH, 0, 0);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function sprite(im, x, y, s, anchorY) {
    if (!im || !im.naturalWidth) return;
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.drawImage(im, x - w / 2, y - h * (anchorY == null ? 1 : anchorY), w, h);
  }

  function nameTag(text, x, y, s, opts) {
    opts = opts || {};
    const fs = Math.max(11, Math.round(20 * s + 6));
    ctx.font = '600 ' + fs + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    let label = text;
    const maxW = opts.maxW || 400;
    if (ctx.measureText(label).width + 12 > maxW) {
      while (label.length > 1 && ctx.measureText(label + '…').width + 12 > maxW) label = label.slice(0, -1);
      label = label + '…';
    }
    const w = Math.min(maxW, ctx.measureText(label).width + 12), h = fs + 8;
    ctx.fillStyle = opts.abbot ? 'rgba(122,72,12,.92)' : (opts.me ? 'rgba(126,29,18,.9)' : 'rgba(20,11,7,.66)');
    roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.lineWidth = opts.abbot ? 2.2 : 1.4;
    ctx.strokeStyle = opts.abbot ? '#f0c66a' : (opts.me ? 'rgba(226,176,79,.9)' : 'rgba(226,176,79,.32)');
    ctx.stroke();
    ctx.fillStyle = opts.abbot ? '#ffe9b8' : '#f1e3c8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
  }

  /* The abbot sits in the centre aisle and seat 10 sits at the head of the aisle
     — neither has a cushion painted under it, so both get one drawn here. */
  function drawMat(x, y, s) {
    const w = 340 * s, h = w * 0.30;

    // soft shadow on the floor
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.42, w * 0.53, h * 0.55, 0, 0, 6.29);
    ctx.fill();
    ctx.restore();

    // side wall of the cushion, so it reads as a solid object and not a disc
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.26, w / 2, h / 2, 0, 0, 6.29);
    ctx.fillStyle = '#3a2010';
    ctx.fill();

    // padded top — same brown family as the painted cushions, no gold plate
    const g = ctx.createLinearGradient(0, y - h * 0.55, 0, y + h * 0.55);
    g.addColorStop(0, '#8b5c36');
    g.addColorStop(0.42, '#71462a');
    g.addColorStop(1, '#4a2b16');
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, 6.29);
    ctx.fillStyle = g;
    ctx.fill();

    // soft top highlight, offset like the light in the painting
    const hg = ctx.createRadialGradient(x - w * 0.12, y - h * 0.28, 2, x, y, w * 0.5);
    hg.addColorStop(0, 'rgba(220,170,120,.30)');
    hg.addColorStop(1, 'rgba(220,170,120,0)');
    ctx.fillStyle = hg;
    ctx.fill();

    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.strokeStyle = 'rgba(196,140,86,.35)';
    ctx.stroke();
  }

  /* Small outlined text, no background plate — it has to stay readable over a
     busy painting without hiding the people behind it. */
  function drawBless(v, ty, s) {
    let b = null;
    for (let i = 0; i < blesses.length; i++) if (blesses[i].uid === v.uid) { b = blesses[i]; break; }
    if (!b) return;

    const fadeIn = Math.min(1, b.t / 0.3);
    const fadeOut = Math.min(1, (b.life - b.t) / 1.2);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    if (alpha <= 0.02) return;

    let fs = Math.max(12, Math.round(19 * s + 6));
    ctx.font = '600 ' + fs + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    const w = ctx.measureText(b.text).width;
    if (w > 210) {
      fs = Math.max(10, Math.floor(fs * 210 / w));
      ctx.font = '600 ' + fs + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    }

    const k = Math.min(1, b.t / b.life);
    const rise = 20 * (1 - Math.pow(1 - Math.min(1, k * 1.7), 2));
    const y = ty - fs - 10 - rise;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, fs * 0.46);
    ctx.strokeStyle = 'rgba(22,11,3,.82)';
    ctx.strokeText(b.text, v.x, y);
    ctx.fillStyle = '#fff0c4';
    ctx.fillText(b.text, v.x, y);
    ctx.restore();
  }

  function drawVisitor(v, t, dt) {
    const s = v.seat ? v.seat.s : 0.34;
    const anim = hasAnim(v.skin);

    /* movement */
    if (v.state === 'walk' && v.seat) {
      const sp = (200 + 190 * Math.max(0, Math.min(1.4, (v.y - 1245) / 500))) * dt;
      const dy = v.seat.y - v.y, dx = v.seat.x - v.x;
      if (Math.abs(dy) > 3) {
        v.y += Math.max(-sp, Math.min(sp, dy));
        v.x += (540 - v.x) * Math.min(1, dt * 6);
        v.flip = false;
      } else {
        v.x += Math.max(-sp, Math.min(sp, dx));
        v.flip = dx < 0;
      }
      v.ft += dt;
      if (v.ft > 0.15) { v.ft = 0; v.frame = (v.frame + 1) % 4; }
      if (Math.abs(v.x - v.seat.x) < 2 && Math.abs(v.y - v.seat.y) < 3) {
        v.x = v.seat.x; v.y = v.seat.y; v.state = 'sitting'; v.sitT = 0; v.flip = false;
      }
    } else if (v.state === 'sitting') {
      v.sitT += dt;
      v.frame = 4 + Math.min(3, Math.floor(v.sitT / 0.22));
      if (v.sitT > 0.9) { v.state = 'sit'; v.frame = 7; }
    } else if (v.seat && v.state === 'sit') {
      // glide when the grid shifts underneath you
      v.x += (v.seat.x - v.x) * Math.min(1, dt * 3);
      v.y += (v.seat.y - v.y) * Math.min(1, dt * 3);
    }

    v.fade = Math.min(1, v.fade + dt * 2);
    v.glow = Math.max(0, v.glow - dt * 0.5);

    /* bow sequence: each cycle is a sine hump, so a run of three reads as
       bow–rise–bow–rise–bow rather than one long squash */
    if (v.bowN > 0) {
      v.bowT += dt;
      if (v.bowT >= v.bowDur) { v.bowN = 0; v.bowT = 0; }
    }

    if (v.glow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = v.glow * 0.6;
      const g = ctx.createRadialGradient(v.x, v.y - 90 * s, 8, v.x, v.y - 90 * s, 180 * s);
      g.addColorStop(0, 'rgba(255,205,120,.85)');
      g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(v.x - 200 * s, v.y - 300 * s, 400 * s, 340 * s);
      ctx.restore();
    }

    /* contact shadow so nobody floats on the parquet */
    ctx.save();
    ctx.globalAlpha = 0.34 * v.fade;
    const sg = ctx.createRadialGradient(v.x, v.y + 2, 1, v.x, v.y + 2, 60 * s);
    sg.addColorStop(0, 'rgba(0,0,0,.75)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(v.x, v.y + 2, 60 * s, 16 * s, 0, 0, 6.29);
    ctx.fill();
    ctx.restore();

    const breathe = v.state === 'sit' ? Math.sin(t * 1.1 + v.phase) * 2 * s : 0;
    let bowK = 0;
    if (v.bowN > 0) {
      const seg = v.bowDur / v.bowN;
      const ph = (v.bowT / seg) % 1;
      bowK = Math.sin(ph * Math.PI) * v.bowAmp;
    }

    ctx.save();
    ctx.globalAlpha = v.fade;
    ctx.translate(v.x, v.y);
    /* A bow seen from behind: the body sinks and spreads slightly. Squashing
       straight down alone reads as squatting, so the X scale opens up too. */
    if (bowK > 0) ctx.transform(1 + bowK * 0.30, 0, 0, 1 - bowK * 1.75, 0, 0);

    let topY;
    if (anim) {
      const a = ANIM[v.skin], k = s * 1.05 * 260 / a.seatH;
      if (v.flip) ctx.scale(-1, 1);
      ctx.drawImage(A['anim_' + v.skin], v.frame * a.fw, 0, a.fw, a.fh,
        -a.fw * k / 2, -a.fh * k + breathe, a.fw * k, a.fh * k);
      topY = (v.state === 'sit' ? a.seatH : a.fh * 0.97) * k;
    } else {
      sprite(A[v.skin] || A.man, 0, breathe, s * 1.05, 1);
      topY = 268 * s;
    }
    ctx.restore();

    const ty = v.y - topY * (1 - bowK) - 12 * s;
    v._ty = ty;
    nameTag(v.name, v.x, ty, s, {
      abbot: v.role === 'abbot',
      me: v.isMe,
      maxW: v.seat ? v.seat.gap * 1.12 : 200,
    });
  }

  function drawFx(t, dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { fx.splice(i, 1); continue; }
      const fade = k < 0.75 ? 1 : (1 - k) / 0.25;

      if (f.kind === 'incense') {
        // warm glow on the altar + a slow column of smoke
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * fade * (0.7 + 0.3 * Math.sin(t * 3));
        const g = ctx.createRadialGradient(540, 985, 10, 540, 985, 190);
        g.addColorStop(0, 'rgba(255,190,110,.9)');
        g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(340, 800, 400, 380);
        ctx.restore();
        if (Math.random() < 0.35) spawnSmoke(540, 958, 1);

      } else if (f.kind === 'petal') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.30 * fade;
        const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, 170 * f.s + 60);
        g.addColorStop(0, 'rgba(255,220,170,.8)');
        g.addColorStop(1, 'rgba(255,160,90,0)');
        ctx.fillStyle = g;
        ctx.fillRect(f.x - 220, f.y - 220, 440, 440);
        ctx.restore();

      } else if (f.kind === 'lotus') {
        const pop = 1 - Math.pow(1 - Math.min(1, f.t * 2.2), 3);
        ctx.save();
        ctx.translate(f.x, f.y - f.t * 26);
        ctx.rotate(Math.sin(f.t * 0.9) * 0.06);
        // rays
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.30 * fade;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * 6.28 + f.t * 0.5;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 420, Math.sin(a) * 420);
          ctx.strokeStyle = 'rgba(255,205,120,.5)';
          ctx.lineWidth = 6;
          ctx.stroke();
        }
        ctx.globalAlpha = fade;
        ctx.globalCompositeOperation = 'source-over';
        sprite(A.lotus, 0, 0, (0.45 + 0.55 * pop) * 1.25, 0.5);
        ctx.restore();

      } else if (f.kind === 'bell') {
        const swing = Math.sin(f.t * 5.2) * Math.exp(-f.t * 1.1) * 0.22;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(swing);
        ctx.globalAlpha = fade;
        sprite(A.bell, 0, 0, 1.15, 0.5);
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * fade;
        const bg = ctx.createRadialGradient(f.x, f.y, 8, f.x, f.y, 250);
        bg.addColorStop(0, 'rgba(255,228,168,.9)');
        bg.addColorStop(0.4, 'rgba(255,186,90,.45)');
        bg.addColorStop(1, 'rgba(255,150,50,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(f.x - 270, f.y - 270, 540, 540);
        ctx.restore();
      }
    }
  }

  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t > p.life) { parts.splice(i, 1); continue; }
      if (p.t < 0) continue;
      const k = p.t / p.life;

      if (p.kind === 'petal') {
        p.x += p.vx * dt + Math.sin(p.t * 3 + p.rot) * 26 * dt;
        p.y += p.vy * dt;
        p.vy += 12 * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (p.life - p.t) * 1.2);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        sprite(A.petal, 0, 0, p.s, 0.5);
        ctx.restore();

      } else if (p.kind === 'spark') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, (1 - k) * 1.4);
        ctx.fillStyle = 'rgba(255,215,140,1)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * (1 - k * 0.5), 0, 6.29);
        ctx.fill();
        ctx.restore();

      } else if (p.kind === 'smoke') {
        p.sway += dt * 1.6;
        p.x += p.vx * dt + Math.sin(p.sway) * 14 * dt;
        p.y += p.vy * dt;
        ctx.save();
        ctx.globalAlpha = 0.13 * (1 - k);
        ctx.fillStyle = '#e6d8bf';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * (1 + k * 2.8), 0, 6.29);
        ctx.fill();
        ctx.restore();

      } else if (p.kind === 'ring') {
        const e = Math.min(1, p.t / p.life);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 * (1 - e);
        ctx.strokeStyle = 'rgba(255,210,130,.9)';
        ctx.lineWidth = 10 * (1 - e) + 1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + e * 60, 120 + e * 620, (120 + e * 620) * 0.30, 0, 0, 6.29);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    resize();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    ctx.clearRect(0, 0, SW, SH);
    if (A.hall.naturalWidth) ctx.drawImage(A.hall, 0, 0, SW, SH);
    else { ctx.fillStyle = '#170c07'; ctx.fillRect(0, 0, SW, SH); }

    /* ambient light behind the Buddha — a soft warm bloom, not a hard ring */
    haloPulse = Math.max(0, haloPulse - dt * 0.45);
    altarGlow = Math.max(0, altarGlow - dt * 0.28);
    const haloA = 0.24 + 0.06 * Math.sin(t * 1.2) + haloPulse * 0.5;
    const hr = 330 + haloPulse * 80;
    const hg = ctx.createRadialGradient(540, 470, 16, 540, 470, hr);
    hg.addColorStop(0, 'rgba(255,216,146,' + (0.5 * haloA) + ')');
    hg.addColorStop(0.45, 'rgba(255,172,74,' + (0.2 * haloA) + ')');
    hg.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hg;
    ctx.fillRect(540 - hr, 470 - hr, hr * 2, hr * 2);
    ctx.restore();

    /* candle flicker */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.05 + 0.035 * Math.sin(t * 9) * Math.sin(t * 13.3) + altarGlow * 0.06;
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(0, 300, SW, 900);
    ctx.restore();

    /* standing incense smoke at the altar */
    if (Math.random() < 0.12) spawnSmoke(540, 950, 1);

    /* blessing lines age out */
    for (let i = blesses.length - 1; i >= 0; i--) {
      blesses[i].t += dt;
      if (blesses[i].t >= blesses[i].life) blesses.splice(i, 1);
    }

    /* mats for the two seats that sit off the painted cushions — drawn always,
       so an empty seat still looks like a place waiting for someone */
    for (let i = 0; i < SEATS.length; i++) {
      if (SEATS[i].mat) drawMat(SEATS[i].x, SEATS[i].y, SEATS[i].s);
    }

    /* visitors, back to front */
    const list = Array.from(visitors.values()).sort(function (a, b) { return a.y - b.y; });
    for (const v of list) drawVisitor(v, t, dt);

    drawFx(t, dt);
    drawParts(dt);

    /* Blessings go last so a lotus blooming over the offerer cannot swallow the
       words. Text only — no plate — so it still does not hide anyone. */
    if (blesses.length) {
      const bl = list.slice().sort(function (a, b) { return a.y - b.y; });
      for (const v of bl) if (v._ty) drawBless(v, v._ty, v.seat ? v.seat.s : 0.34);
    }

    /* seat numbers on top of everything while somebody is choosing */
    if (pickMode) drawPick(t);

    /* flash */
    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flash * 0.16;
      ctx.fillStyle = '#ffd9a0';
      ctx.fillRect(0, 0, SW, SH);
      ctx.restore();
      flash = Math.max(0, flash - dt * 1.6);
    }
  }

  requestAnimationFrame(frame);

  global.Hall = {
    sync: sync, setMyUid: setMyUid, count: count,
    fx: fxPlay, bow: bow, bowDeep: bowDeep, bless: bless, pulseHalo: pulseHalo,
    setPick: setPick, pickAt: pickAt, freeCount: freeCount,
    CAP: CAP, SEATS: SEATS,
    get seated() { return visitors.size; },
  };
})(window);

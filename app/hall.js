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
  function halfAt(y) { return Math.min(500, 410 + (y - 1245) * 0.24); }
  function aisleAt(y) { return 92 + (y - 1245) * 0.078; }

  /* Rows are spaced slightly wider than a seated sprite is tall, so every one of
     the 32 people stays fully visible from the front row to the back. */
  const ROWS = [
    { y: 1270, s: 0.350, fill: 0, xs: [540], gap: 320, role: 'abbot', mat: true },
    { y: 1360, s: 0.320, fill: 1, xs: [386, 540, 694], gap: 154, role: 'senior' },
    { y: 1442, s: 0.265, fill: 5, per: 2 },   // back row  — 4 seats
    { y: 1528, s: 0.295, fill: 4, per: 4 },   // middle    — 8 seats
    { y: 1618, s: 0.325, fill: 3, per: 4 },   // front     — 8 seats
    { y: 1714, s: 0.355, fill: 2, per: 4 },   // nearest   — 8 seats
  ];

  const SEATS = [];
  for (const r of ROWS) {
    if (r.xs) {
      r.xs.forEach(function (x) {
        SEATS.push({ x: x, y: r.y, s: r.s, gap: r.gap, role: r.role, fill: r.fill, mat: r.mat });
      });
      continue;
    }
    const half = halfAt(r.y), a = aisleAt(r.y), per = r.per;
    const w = (half - a) / per;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < per; i++) {
        SEATS.push({
          x: 540 + side * (a + (i + 0.5) * w), y: r.y, s: r.s,
          gap: w * 1.02, role: 'seat', fill: r.fill,
        });
      }
    }
  }
  // Fill order: abbot first, then the three, then the rows nearest the camera.
  SEATS.sort(function (p, q) {
    return (p.fill - q.fill) || (Math.abs(p.x - 540) - Math.abs(q.x - 540));
  });
  const CAP = SEATS.length; // 32

  const DOOR = { x: 540, y: SH + 140 };

  /* ------------------------------------------------------------------ state */
  const visitors = new Map(); // uid -> visitor
  const fx = [];              // large effects
  const parts = [];           // petals, sparks, smoke, rings
  const blesses = [];         // short blessing lines floating over a visitor
  let myUid = null, haloPulse = 0, altarGlow = 0, flash = 0;

  /* -------------------------------------------------------------- visitors */
  function sync(list) {
    const seen = new Set();
    list.forEach(function (p, i) {
      seen.add(p.uid);
      const seat = i < CAP ? SEATS[i] : null;
      let v = visitors.get(p.uid);
      if (!v) {
        v = {
          uid: p.uid, name: p.name, skin: p.skin, seat: seat,
          x: seat ? DOOR.x : 540, y: seat ? DOOR.y : SH + 200,
          state: seat ? 'walk' : 'idle', frame: 0, ft: 0, sitT: 0,
          flip: false, fade: 0, glow: 0, bow: 0, phase: Math.random() * 6.28,
        };
        visitors.set(p.uid, v);
      } else {
        v.name = p.name;
        if (v.skin !== p.skin) { v.skin = p.skin; v.glow = 0.8; if (v.state === 'sit') v.frame = 7; }
        v.seat = seat;
      }
      v.isMe = p.uid === myUid;
      v.role = seat ? seat.role : 'seat';
    });
    visitors.forEach(function (v, uid) { if (!seen.has(uid)) visitors.delete(uid); });
  }

  function setMyUid(uid) { myUid = uid; visitors.forEach(function (v) { v.isMe = v.uid === uid; }); }

  function count() { return visitors.size; }

  /* --------------------------------------------------------------- effects */
  function pulseHalo(v) { haloPulse = Math.max(haloPulse, v == null ? 1 : v); }

  /* a small personal gesture — a bow and a few petals, not a full ritual */
  function bow(uid) {
    const v = visitors.get(uid);
    if (!v) return;
    v.bow = 1;
    const s = v.seat ? v.seat.s : 0.34;
    spawnPetals(v.x, v.y - 40 * s, 5, true, 70 * s + 30);
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

  /* The abbot sits in the centre aisle, off the painted cushions, so he gets
     his own mat — the only seat that needs one. */
  function drawMat(x, y, s) {
    const w = 340 * s, h = w * 0.30;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.45, w * 0.52, h * 0.52, 0, 0, 6.29);
    ctx.fill();
    ctx.restore();

    const g = ctx.createLinearGradient(0, y - h * 0.6, 0, y + h * 0.5);
    g.addColorStop(0, '#8d4a22');
    g.addColorStop(0.5, '#6a3016');
    g.addColorStop(1, '#3d1a0b');
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, 6.29);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, 3 * s);
    ctx.strokeStyle = 'rgba(240,198,106,.6)';
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.10, w * 0.36, h * 0.26, 0, 0, 6.29);
    ctx.strokeStyle = 'rgba(240,198,106,.28)';
    ctx.lineWidth = Math.max(1, 2 * s);
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
    v.bow = Math.max(0, v.bow - dt * 0.8);

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
    if (v.seat && v.seat.mat) drawMat(v.x, v.y, s);
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
    const bowK = v.state === 'sit' ? Math.sin(Math.min(1, v.bow) * Math.PI) * 0.045 : 0;

    ctx.save();
    ctx.globalAlpha = v.fade;
    ctx.translate(v.x, v.y);
    if (bowK > 0) ctx.transform(1, 0, 0, 1 - bowK, 0, 0);

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

    const ty = v.y - topY - 12 * s;
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
    fx: fxPlay, bow: bow, bless: bless, pulseHalo: pulseHalo,
    CAP: CAP, SEATS: SEATS,
    get seated() { return visitors.size; },
  };
})(window);

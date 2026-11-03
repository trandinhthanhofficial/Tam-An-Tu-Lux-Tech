/* =============================================================================
   main.js — servers, presence, chat, rituals, wooden fish, and the glue
   between Net / Hall / Audio.
   ========================================================================== */
(function () {
  'use strict';

  const t = function (k, v) { return window.I18N.t(k, v); };
  const $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------ config */
  const CFG = window.APP_CONFIG || {};
  const SERVERS = (CFG.servers && CFG.servers.length) ? CFG.servers : [{ id: 'main', name: 'Main' }];
  const CAP = CFG.capacity || 32;

  function serverName(s) {
    return window.I18N.lang === 'zh' ? (s.nameZh || s.name) : s.name;
  }
  function serverById(id) {
    for (let i = 0; i < SERVERS.length; i++) if (SERVERS[i].id === id) return SERVERS[i];
    return SERVERS[0];
  }

  /* ------------------------------------------------------------ identity */
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); return val; } catch (e) { return null; }
  }

  const me = {
    uid: store('cd.uid') || (function () {
      const u = 'u' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
      store('cd.uid', u);
      return u;
    })(),
    name: store('cd.name') || '',
    skin: store('cd.skin') || 'man',
    joinedAt: Date.now(),
    joined: false,
  };

  /* ------------------------------------------------------------- presence */
  const roomPeers = new Map();    // roomId -> Map(uid -> peer)
  const CHAT_WINDOW = 90 * 1000;
  const HEARTBEAT = 8000;
  const EXPIRE = 26000;

  let activeServer = (function () {
    const q = new URLSearchParams(location.search).get('room');
    if (q && SERVERS.some(function (s) { return s.id === q; })) return q;
    const saved = store('cd.server');
    if (saved && SERVERS.some(function (s) { return s.id === saved; })) return saved;
    return CFG.defaultServer && SERVERS.some(function (s) { return s.id === CFG.defaultServer; })
      ? CFG.defaultServer : SERVERS[0].id;
  })();

  let hbTimer = null, pruneTimer = null, lastReply = 0;
  let localIds = new Set();

  function peerMapOf(room) {
    let m = roomPeers.get(room);
    if (!m) { m = new Map(); roomPeers.set(room, m); }
    return m;
  }
  function roomCount(room) {
    const m = roomPeers.get(room);
    return m ? m.size : 0;
  }

  function ordered(map) {
    const arr = Array.from(map.values());
    arr.sort(function (a, b) { return (a.joinedAt - b.joinedAt) || (a.uid < b.uid ? -1 : 1); });
    return arr;
  }

  function renderRoom() {
    const list = ordered(peerMapOf(activeServer));
    window.Hall.sync(list.map(function (p) {
      return { uid: p.uid, name: p.name, skin: p.skin };
    }));
    $('count').textContent = String(list.length);
    updateNetText();
  }

  function announce() {
    if (!me.joined) return;
    Net.publish({ k: 'hi', uid: me.uid, name: me.name, skin: me.skin, t: me.joinedAt });
  }

  /* ---------------------------------------------------------------- chat */
  const chat = [];
  let unread = 0, panelOpen = false;

  function pushChat(entry) {
    entry.ts = Date.now();
    chat.push(entry);
    if (chat.length > 120) chat.shift();
    if (panelOpen) renderChat();
    else if (!entry.sys) { unread++; renderBadge(); }
  }

  function pushSys(name, text) { pushChat({ sys: true, name: name, text: text }); }

  function liveChat() {
    const cut = Date.now() - CHAT_WINDOW;
    return chat.filter(function (m) { return m.ts >= cut; });
  }

  function renderChat() {
    const list = $('chatList');
    const items = liveChat();
    list.textContent = '';
    if (!items.length) {
      const d = document.createElement('div');
      d.className = 'chat-empty';
      d.textContent = t('chat.empty');
      list.append(d);
      return;
    }
    for (const m of items) {
      const row = document.createElement('div');
      row.className = 'chat-row' + (m.sys ? ' sys' : '');
      const who = document.createElement('b');
      who.textContent = m.name;
      const body = document.createElement('span');
      body.textContent = ' ' + m.text;
      row.append(who, body);
      list.append(row);
    }
    list.scrollTop = list.scrollHeight;
  }

  function renderBadge() {
    const b = $('chatBadge');
    if (unread > 0 && !panelOpen) { b.hidden = false; b.textContent = unread > 9 ? '9+' : String(unread); }
    else b.hidden = true;
  }

  /* -------------------------------------------------------------- rituals */
  // How many blessing lines exist in the dictionary (bless.0 … bless.N-1).
  const BLESS_COUNT = 10;

  function performRitual(kind) {
    if (!me.joined) return;
    const msg = { k: 'fx', uid: me.uid, name: me.name, kind: kind };
    // Incense and lotus carry a blessing that drifts up over the offerer's head.
    // Only the index travels; every client renders it in its own language.
    if (kind === 'incense' || kind === 'lotus') msg.bless = Math.floor(Math.random() * BLESS_COUNT);
    localIds.add(msg.id = newId());
    Net.publish(msg);
    applyFx(msg, true);
  }

  function applyFx(m, local) {
    window.Hall.fx(m.kind, m.uid);
    window.Audio2.play(m.kind);
    if (m.bless != null) window.Hall.bless(m.uid, t('bless.' + m.bless));
    const v = peerMapOf(activeServer).get(m.uid);
    pushSys(m.name || (v && v.name) || '—', t('sys.ritual', { ritual: t('ritual.' + m.kind) }));
  }

  function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  /* ------------------------------------------------------------ wooden fish */
  const MO_GOAL = 99;
  let moCount = parseInt(store('cd.moCount'), 10) || 0;
  let merit = parseInt(store('cd.merit'), 10) || 0;

  function renderMo() {
    $('moCount').textContent = String(moCount);
    $('moMerit').textContent = String(merit);
    $('moBar').style.width = (moCount / MO_GOAL * 100) + '%';
  }

  function hitMo() {
    if (!me.joined) return;
    window.Audio2.init();
    window.Audio2.mo();

    const ping = $('moHit').querySelector('.mo-ping');
    if (ping) { ping.classList.remove('go'); void ping.offsetWidth; ping.classList.add('go'); }
    const plus = $('moPlus');
    plus.classList.remove('go'); void plus.offsetWidth; plus.classList.add('go');

    moCount++;
    if (moCount >= MO_GOAL) {
      moCount = 0;
      merit++;
      store('cd.merit', String(merit));
      window.Audio2.merit();
      window.Hall.fx('lotus', me.uid);
      toast(t('toast.merit'));
      pushSys(me.name, t('sys.merit'));
      const msg = { k: 'merit', uid: me.uid, name: me.name, merit: merit };
      localIds.add(msg.id = newId());
      Net.publish(msg);
    }
    store('cd.moCount', String(moCount));
    renderMo();
  }

  /* ----------------------------------------------------------------- net */
  function updateNetText() {
    const el = $('netText');
    if (!el) return;
    if (Net.mode === 'online') el.textContent = t('net.online');
    else if (Net.mode === 'local') el.textContent = t('net.offline');
    else el.textContent = t('net.connecting');
    $('netDot').className = 'dot ' + (Net.mode === 'online' ? 'ok' : Net.mode === 'local' ? 'warn' : 'wait');
  }

  function onMessage(m, room) {
    if (m.id && localIds.has(m.id)) { localIds.delete(m.id); return; }

    const isActive = room === activeServer;

    switch (m.k) {
      case 'hi': {
        const map = peerMapOf(room);
        const known = map.has(m.uid);
        let p = map.get(m.uid);
        if (!p) {
          p = { uid: m.uid, name: m.name || '—', skin: m.skin || 'man', joinedAt: m.t || Date.now(), lastSeen: Date.now() };
          map.set(m.uid, p);
          if (isActive && m.uid !== me.uid) pushSys(p.name, t('sys.joined'));
        } else {
          if (m.name) p.name = m.name;
          if (m.skin) p.skin = m.skin;
          p.lastSeen = Date.now();
        }
        if (isActive) {
          renderRoom();
          // A stranger just arrived: say hello back so they learn about us fast.
          if (!known && m.uid !== me.uid && Date.now() - lastReply > 1500) {
            lastReply = Date.now(); announce();
          }
        }
        break;
      }
      case 'bye': {
        const map = peerMapOf(room);
        if (map.delete(m.uid) && isActive) renderRoom();
        break;
      }
      case 'prof': {
        const p = peerMapOf(room).get(m.uid);
        if (p) {
          p.name = m.name || p.name;
          p.skin = m.skin || p.skin;
          p.lastSeen = Date.now();
          if (isActive) renderRoom();
        }
        break;
      }
      case 'chat':
        if (isActive) pushChat({ name: m.name, text: m.text, uid: m.uid });
        break;
      case 'fx':
        if (isActive) applyFx(m, false);
        break;
      case 'merit':
        if (isActive) {
          window.Hall.fx('petal', m.uid);
          window.Audio2.play('petal');
          pushSys(m.name || '—', t('sys.merit'));
        }
        break;
    }
  }

  function onStatus() { updateNetText(); }

  /* ------------------------------------------------------- server picker */
  function renderServerList() {
    const wrap = $('serverList');
    if (!wrap) return;
    wrap.textContent = '';
    SERVERS.forEach(function (s) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'srv';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(s.id === activeServer));
      b.dataset.id = s.id;

      const dot = document.createElement('span');
      dot.className = 'dot' + (roomCount(s.id) > 0 ? ' ok' : '');
      const name = document.createElement('span');
      name.className = 'srv-name';
      name.textContent = serverName(s);
      const cnt = document.createElement('span');
      cnt.className = 'srv-count';
      cnt.textContent = roomCount(s.id) + '/' + CAP;

      b.append(dot, name, cnt);
      b.addEventListener('click', function () { selectServer(s.id); });
      wrap.append(b);
    });
  }

  function renderServerCounts() {
    const wrap = $('serverList');
    if (!wrap) return;
    Array.prototype.forEach.call(wrap.children, function (b) {
      const n = roomCount(b.dataset.id);
      const c = b.querySelector('.srv-count');
      if (c) c.textContent = n + '/' + CAP;
      const d = b.querySelector('.dot');
      if (d) d.className = 'dot' + (n > 0 ? ' ok' : '');
    });
  }

  function selectServer(id) {
    if (me.joined) return;                 // change servers by leaving first
    activeServer = id;
    store('cd.server', id);
    Net.setActive(id);
    renderServerList();
    renderHudServer();
  }

  function renderHudServer() {
    $('serverName').textContent = serverName(serverById(activeServer));
    $('cap').textContent = String(CAP);
  }

  /* ------------------------------------------------------------------ ui */
  function startSession(name, skin) {
    me.name = name;
    me.skin = skin;
    me.joinedAt = Date.now();
    me.joined = true;
    store('cd.name', name);
    store('cd.skin', skin);
    store('cd.server', activeServer);

    Net.setActive(activeServer);
    const map = peerMapOf(activeServer);
    map.set(me.uid, { uid: me.uid, name: me.name, skin: me.skin, joinedAt: me.joinedAt, lastSeen: Date.now() });

    window.Hall.setMyUid(me.uid);
    renderRoom();
    announce();

    clearInterval(hbTimer);
    hbTimer = setInterval(announce, HEARTBEAT);

    clearInterval(pruneTimer);
    pruneTimer = setInterval(function () {
      const cut = Date.now() - EXPIRE;
      let changed = false;
      roomPeers.forEach(function (map, room) {
        map.forEach(function (p, uid) {
          if (!p.demo && uid !== me.uid && p.lastSeen < cut) {
            map.delete(uid);
            if (room === activeServer) changed = true;
          }
        });
      });
      if (changed) renderRoom();
      renderChat();
      if (!$('gate').hidden) renderServerCounts();
    }, 5000);

    seedPreview();

    $('gate').hidden = true;
    $('hud').hidden = false;
    $('bottom').hidden = false;
    $('dock').hidden = false;
    renderHudServer();
    renderMo();
  }

  function endSession() {
    Net.publish({ k: 'bye', uid: me.uid });
    me.joined = false;
    clearInterval(hbTimer);
    clearInterval(pruneTimer);
    peerMapOf(activeServer).delete(me.uid);
    window.Hall.sync([]);
    $('gate').hidden = false;
    $('hud').hidden = true;
    $('bottom').hidden = true;
    $('dock').hidden = true;
    panelOpen = false;
    $('chatPanel').hidden = true;
    $('moPanel').hidden = true;
    renderServerList();
  }

  /* ?preview=32 fills the hall with local-only stand-ins so you can see the
     whole layout without waiting for 31 friends. They are never published. */
  const PREVIEW_NAMES = ['Diệu Hạnh', 'Minh Tâm', 'Thiện Đức', 'Huệ An', 'Tịnh Nhã', 'Quảng Trí', 'Chơn Như', 'Pháp Hỷ',
    'Nguyên Thanh', 'Tâm Đăng', 'Diệu Liên', 'Trí Hải', 'Phước Lộc', 'Hạnh Nguyện', 'Như Ý', 'Bảo Châu',
    'Thanh Lương', 'Từ Tâm', 'An Lạc', 'Giác Hoa', 'Tuệ Minh', 'Liên Hương', 'Thu Hà', 'Ngọc Lan',
    'Đức Anh', 'Hải Đăng', 'Mai Anh', 'Phương Thảo', 'Trung Kiên', 'Quang Huy', 'Bảo Ngọc'];
  const PREVIEW_SKINS = ['man', 'woman', 'woman', 'man', 'granny', 'monk', 'nun', 'child'];

  function seedPreview() {
    let n = 0;
    try { n = parseInt(new URLSearchParams(location.search).get('preview'), 10) || 0; } catch (e) {}
    if (n <= 0) return;
    const map = peerMapOf(activeServer);
    for (let i = 0; i < n && i < CAP - 1; i++) {
      map.set('pv' + i, {
        uid: 'pv' + i,
        name: PREVIEW_NAMES[i % PREVIEW_NAMES.length],
        skin: PREVIEW_SKINS[i % PREVIEW_SKINS.length],
        joinedAt: me.joinedAt + i + 1,
        lastSeen: Date.now(),
        demo: true,
      });
    }
    renderRoom();
  }

  /* --------------------------------------------------------------- wiring */
  function renderMusicBtn() {
    const on = window.Audio2.musicOn;
    const label = on ? t('btn.music.off') : t('btn.music.on');
    const b = $('musicBtn');
    b.title = label;
    b.setAttribute('aria-label', label);
    b.classList.toggle('off', !on);
  }

  function boot() {
    window.I18N.apply();

    /* name field */
    const nameInput = $('dharma');
    if (me.name) nameInput.value = me.name;

    /* server picker */
    renderServerList();
    renderHudServer();
    setInterval(function () { if (!$('gate').hidden) renderServerCounts(); }, 2000);

    /* robe picker */
    let skin = me.skin;
    const skinWrap = $('skin');
    Array.prototype.forEach.call(skinWrap.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.skin === skin));
      b.addEventListener('click', function () {
        skin = b.dataset.skin;
        Array.prototype.forEach.call(skinWrap.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        window.Audio2.play('petal');
      });
    });

    /* enter */
    $('gateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      const name = nameInput.value.trim().replace(/\s+/g, ' ').slice(0, 16);
      if (!name) return;
      window.Audio2.init();
      startSession(name, skin);
      window.Audio2.play('bell');
      toast(t('toast.welcome', { name: name }));
    });

    /* rituals */
    $('rituals').addEventListener('click', function (e) {
      const b = e.target.closest('[data-ritual]');
      if (!b) return;
      performRitual(b.dataset.ritual);
      b.classList.add('hit');
      setTimeout(function () { b.classList.remove('hit'); }, 260);
    });

    /* language */
    $('langBtn').addEventListener('click', function () { window.I18N.toggle(); });
    document.addEventListener('langchange', function () {
      renderChat();
      renderBadge();
      updateNetText();
      renderMusicBtn();
      renderServerList();
      renderHudServer();
    });

    /* music */
    $('musicBtn').addEventListener('click', function () {
      window.Audio2.setMusic(!window.Audio2.musicOn);
      renderMusicBtn();
    });

    /* leave */
    $('leaveBtn').addEventListener('click', function () {
      endSession();
      toast(t('toast.left'));
    });

    /* chat */
    $('chatFab').addEventListener('click', function () {
      panelOpen = !panelOpen;
      $('chatPanel').hidden = !panelOpen;
      if (panelOpen) { unread = 0; renderBadge(); renderChat(); $('chatInput').focus(); }
    });
    $('chatClose').addEventListener('click', function () {
      panelOpen = false;
      $('chatPanel').hidden = true;
      renderBadge();
    });
    $('chatForm').addEventListener('submit', function (e) {
      e.preventDefault();
      const input = $('chatInput');
      const text = input.value.trim().slice(0, 120);
      if (!text) return;
      input.value = '';
      const msg = { k: 'chat', uid: me.uid, name: me.name || '—', text: text };
      localIds.add(msg.id = newId());
      Net.publish(msg);
      pushChat({ name: msg.name, text: text, uid: me.uid });
    });

    /* wooden fish */
    $('moFab').addEventListener('click', function () {
      $('moPanel').hidden = false;
      renderMo();
    });
    $('moClose').addEventListener('click', function () { $('moPanel').hidden = true; });
    $('moHit').addEventListener('pointerdown', function (e) { e.preventDefault(); hitMo(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('moPanel').hidden) $('moPanel').hidden = true;
    });

    /* tap the hall to bow */
    $('c').addEventListener('pointerdown', function () {
      if (!me.joined) return;
      window.Audio2.mo();
      window.Hall.bow(me.uid);
    });

    /* net */
    Net.start({
      rooms: SERVERS.map(function (s) { return s.id; }),
      active: activeServer,
      onMessage: onMessage,
      onStatus: onStatus,
    });

    window.Hall.setMyUid(me.uid);
    renderChat();
    updateNetText();
    renderBadge();
    renderMusicBtn();
    renderMo();

    window.addEventListener('beforeunload', function () {
      if (me.joined) Net.publish({ k: 'bye', uid: me.uid });
    });

    /* keep the 90s window honest even when nothing arrives */
    setInterval(function () { if (panelOpen) renderChat(); }, 3000);
  }

  let toastTimer = null;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

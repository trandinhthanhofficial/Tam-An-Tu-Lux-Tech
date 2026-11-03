/* =============================================================================
   net.js — realtime transport for a static site.

   GitHub Pages only serves files, so there is no server to hold a socket.
   Instead every browser joins the same public MQTT broker over WSS and talks on
   one topic per room ("server"). No account, no key, no deploy step beyond
   pushing files.

   Every configured server is subscribed at once, so the entry screen can show
   how many people are sitting in each one. Only the chosen server is published to.

   Three public brokers are tried in order. If all of them are unreachable
   (offline, corporate firewall, broker down) the app degrades to BroadcastChannel
   so it still works across tabs of the same browser.
   ========================================================================== */
(function (global) {
  'use strict';

  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];

  const PREFIX = 'chanhdien/v3/';

  let client = null;
  let onMsg = function () {};
  let onStatus = function () {};
  let mode = 'idle';           // idle | connecting | online | local
  let brokerIdx = -1, fails = 0, connected = false;

  let roomIds = [];
  let active = '';
  const topicOf = {};          // roomId -> topic
  const roomOfTopic = {};      // topic -> roomId
  const channels = {};         // roomId -> BroadcastChannel

  const seen = new Set();
  const seenOrder = [];
  function once(id) {
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    seenOrder.push(id);
    if (seenOrder.length > 900) seen.delete(seenOrder.shift());
    return true;
  }

  function setStatus(next, detail) {
    if (mode === next && !detail) return;
    mode = next;
    onStatus(next, detail || {});
  }

  function randomId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function safeRoom(r) {
    return String(r || 'main').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'main';
  }

  /* --------------------------------------------------------------- delivery */
  function deliver(raw, room) {
    let m;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; }
    if (!m || !m.k || !m.id) return;
    if (!once(m.id)) return;
    onMsg(m, room);
  }

  function publish(obj, room) {
    const target = room || active;
    if (!target) return;
    if (!obj.id) obj.id = randomId();
    const payload = JSON.stringify(obj);
    if (client && connected) {
      try { client.publish(topicOf[target], payload, { qos: 0 }); } catch (e) {}
    }
    const ch = channels[target];
    if (ch) { try { ch.postMessage(payload); } catch (e) {} }
  }

  /* ------------------------------------------------------------------ mqtt */
  function topics() { return roomIds.map(function (r) { return topicOf[r]; }); }

  function tryBroker(i) {
    if (!global.mqtt) { goLocal('no-lib'); return; }
    if (i >= BROKERS.length) { goLocal('all-failed'); return; }
    brokerIdx = i;
    setStatus('connecting', { broker: BROKERS[i] });

    let settled = false;
    let c;
    try {
      c = global.mqtt.connect(BROKERS[i], {
        clientId: 'cd_' + randomId(),
        clean: true,
        connectTimeout: 7000,
        reconnectPeriod: 0,       // we drive reconnection ourselves
        keepalive: 30,
        protocolVersion: 4,
      });
    } catch (e) { tryBroker(i + 1); return; }

    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      try { c.end(true); } catch (e) {}
      tryBroker(i + 1);
    }, 8000);

    c.on('connect', function () {
      clearTimeout(timer);
      if (settled && client !== c) return;
      settled = true;
      client = c;
      connected = true;
      fails = 0;
      c.subscribe(topics(), { qos: 0 }, function () {
        setStatus('online', { broker: BROKERS[i] });
      });
    });

    c.on('message', function (tp, buf) {
      const room = roomOfTopic[tp];
      if (!room) return;
      deliver(buf.toString(), room);
    });

    c.on('error', function () {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        try { c.end(true); } catch (e) {}
        tryBroker(i + 1);
      }
    });

    c.on('close', function () {
      if (client !== c) return;
      connected = false;
      if (!settled) return;
      fails++;
      if (fails >= 3) { try { c.end(true); } catch (e) {} client = null; tryBroker(0); return; }
      setStatus('connecting', { retry: fails });
      setTimeout(function () {
        if (client !== c || connected) return;
        try { c.reconnect(); } catch (e) { tryBroker(0); }
      }, 2500);
    });
  }

  /* --------------------------------------------------------- local fallback */
  function goLocal(reason) {
    if (mode === 'local') return;
    setStatus('local', { reason: reason });
  }

  /* ------------------------------------------------------------------- api */
  function start(opts) {
    onMsg = opts.onMessage || onMsg;
    onStatus = opts.onStatus || onStatus;

    roomIds = (opts.rooms && opts.rooms.length ? opts.rooms : ['main']).map(safeRoom);
    active = safeRoom(opts.active || roomIds[0]);

    roomIds.forEach(function (r) {
      topicOf[r] = PREFIX + r;
      roomOfTopic[topicOf[r]] = r;
      try {
        const ch = new BroadcastChannel('chanhdien-' + r);
        ch.onmessage = function (e) { deliver(e.data, r); };
        channels[r] = ch;
      } catch (e) {}
    });

    setStatus('connecting');
    tryBroker(0);
  }

  function setActive(room) { active = safeRoom(room); }

  global.Net = {
    start: start,
    publish: publish,
    setActive: setActive,
    get active() { return active; },
    get mode() { return mode; },
    get broker() { return brokerIdx >= 0 ? BROKERS[brokerIdx] : ''; },
    get online() { return connected; },
  };
})(window);

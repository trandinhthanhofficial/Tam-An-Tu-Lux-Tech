/* =============================================================================
   i18n.js — VI / ZH dictionary + tiny runtime
   Every user-facing string lives here. Add a key once, translate it twice.
   ========================================================================== */
(function (global) {
  'use strict';

  const DICT = {
    vi: {
      'app.title': 'Tịnh Tâm · Chánh Điện Online',
      'app.short': 'Chánh Điện Online',

      'gate.h1': 'Chánh Điện Online',
      'gate.desc': 'Chọn chánh điện, nhập pháp danh rồi vào an tọa. Mỗi chánh điện có 32 chỗ: một vị trụ trì, ba vị tiếp theo, và hai lối phía dưới.',
      'gate.name': 'Pháp danh',
      'gate.place': 'Ví dụ: Diệu Hạnh, Minh Tâm…',
      'gate.robe': 'Y phục',
      'gate.enter': 'Vào chánh điện',
      'gate.hint': 'Chạm vào chánh điện để tụng một câu.',
      'gate.credit': 'Mã nguồn mở · MIT',
      'gate.full': 'Chánh điện đã đủ 32 chỗ, mời bạn xem và chờ một lát.',
      'gate.server': 'Chánh điện',

      'skin.man': 'Nam áo lam',
      'skin.woman': 'Nữ áo lam',
      'skin.granny': 'Áo nâu',
      'skin.monk': 'Tăng sĩ',
      'skin.nun': 'Ni sư',
      'skin.child': 'Chú tiểu',

      'hud.count': 'phật tử',
      'hud.abbot': 'Trụ trì',
      'hud.you': 'bạn',

      'ritual.incense': 'Dâng hương',
      'ritual.petal': 'Cánh sen',
      'ritual.lotus': 'Hoa sen',
      'ritual.bell': 'Thỉnh chuông',

      'mo.title': 'Gõ mõ tụng kinh',
      'mo.hit': 'Gõ mõ',
      'mo.open': 'Mở gõ mõ',
      'mo.merit': 'công đức',
      'mo.hint': 'Gõ đủ 99 lần được 1 công đức.',
      'mo.done': 'Đủ 99 lần · công đức +1',
      'mo.round': 'lần',
      'sys.merit': 'đã gõ đủ 99 lần, hồi hướng một công đức',
      'toast.merit': 'Đủ 99 lần gõ mõ · công đức +1',

      // Blessings that float above whoever offers incense or a lotus.
      'bless.0': 'Bình an tự tại',
      'bless.1': 'An nhiên vô sự',
      'bless.2': 'Tâm tịnh như sen',
      'bless.3': 'Vạn sự cát tường',
      'bless.4': 'Thân tâm an lạc',
      'bless.5': 'Phước huệ song tu',
      'bless.6': 'Phiền não tận trừ',
      'bless.7': 'Cát tường như ý',
      'bless.8': 'Đạo tâm kiên cố',
      'bless.9': 'Thiện duyên hội đủ',

      'btn.music.off': 'Tắt nhạc',
      'btn.music.on': 'Bật nhạc',
      'btn.leave': 'Rời',
      'btn.lang': '中文',

      'chat.title': 'Bình luận',
      'chat.window': '90 giây gần nhất',
      'chat.placeholder': 'Nhập lời nguyện…',
      'chat.send': 'Gửi',
      'chat.empty': 'Chưa có bình luận nào trong 90 giây qua.',
      'chat.open': 'Mở ô bình luận',

      'pick.title': 'Chọn chỗ ngồi',
      'pick.hint': 'Bấm vào một vị trí trống để bước vào ngồi.',
      'pick.yours': 'Bạn ngồi ở vị trí {n}.',
      'pick.taken': 'Vị trí đó vừa có người chọn, mời chọn chỗ khác.',
      'pick.occupied': 'Chỗ này đã có người ngồi.',

      'sys.joined': 'đã vào chánh điện',
      'sys.ritual': 'đã {ritual}',

      'toast.welcome': 'Hoan nghênh {name} vào chánh điện',
      'toast.seated': 'Đã an tọa. Nam mô A Di Đà Phật.',
      'toast.full': 'Chánh điện đã đủ 32 chỗ.',
      'toast.left': 'Đã rời chánh điện.',

      'net.connecting': 'Đang kết nối…',
      'net.online': 'Trực tuyến',
      'net.offline': 'Ngoại tuyến · chỉ tab này',
      'net.local': 'Chế độ cục bộ',

      'err.mic': 'Không có lỗi nào.',
    },

    zh: {
      'app.title': '静心 · 在线正殿',
      'app.short': '在线正殿',

      'gate.h1': '在线正殿',
      'gate.desc': '选择正殿、输入法名，然后入座。每座正殿共 32 席：住持一位、上座三位，下方分为两条通道。',
      'gate.name': '法名',
      'gate.place': '例如：妙行、明心…',
      'gate.robe': '服饰',
      'gate.enter': '进入正殿',
      'gate.hint': '点击正殿即可诵一句佛号。',
      'gate.credit': '开源 · MIT',
      'gate.full': '正殿 32 席已满，请稍候。',
      'gate.server': '正殿',

      'skin.man': '男众·蓝袍',
      'skin.woman': '女众·蓝袍',
      'skin.granny': '褐衣长者',
      'skin.monk': '比丘',
      'skin.nun': '比丘尼',
      'skin.child': '小沙弥',

      'hud.count': '信众',
      'hud.abbot': '住持',
      'hud.you': '你',

      'ritual.incense': '上香',
      'ritual.petal': '莲瓣',
      'ritual.lotus': '莲花',
      'ritual.bell': '叩钟',

      'mo.title': '敲木鱼诵经',
      'mo.hit': '敲木鱼',
      'mo.open': '打开木鱼',
      'mo.merit': '功德',
      'mo.hint': '敲满 99 次得 1 功德。',
      'mo.done': '满 99 次 · 功德 +1',
      'mo.round': '次',
      'sys.merit': '敲满 99 次，回向一份功德',
      'toast.merit': '敲满 99 次 · 功德 +1',

      'bless.0': '平安自在',
      'bless.1': '安然无事',
      'bless.2': '心如莲花',
      'bless.3': '万事吉祥',
      'bless.4': '身心安乐',
      'bless.5': '福慧双修',
      'bless.6': '烦恼尽除',
      'bless.7': '吉祥如意',
      'bless.8': '道心坚固',
      'bless.9': '善缘具足',

      'btn.music.off': '关闭音乐',
      'btn.music.on': '开启音乐',
      'btn.leave': '离开',
      'btn.lang': 'Tiếng Việt',

      'chat.title': '留言',
      'chat.window': '最近 90 秒',
      'chat.placeholder': '写下你的祈愿…',
      'chat.send': '发送',
      'chat.empty': '最近 90 秒内还没有留言。',
      'chat.open': '打开留言框',

      'pick.title': '选择座位',
      'pick.hint': '点击一个空位即可入座。',
      'pick.yours': '你坐在 {n} 号位。',
      'pick.taken': '该位置刚被他人选择，请另选一位。',
      'pick.occupied': '这个位置已经有人了。',

      'sys.joined': '已进入正殿',
      'sys.ritual': '已{ritual}',

      'toast.welcome': '欢迎 {name} 进入正殿',
      'toast.seated': '已安坐。南无阿弥陀佛。',
      'toast.full': '正殿 32 席已满。',
      'toast.left': '已离开正殿。',

      'net.connecting': '连接中…',
      'net.online': '在线',
      'net.offline': '离线 · 仅本标签页',
      'net.local': '本地模式',

      'err.mic': '无错误。',
    },
  };

  const STORE = 'cd.lang';
  let lang = 'vi';

  function detect() {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved && DICT[saved]) return saved;
    } catch (e) {}
    const nav = (navigator.language || 'vi').toLowerCase();
    return nav.startsWith('zh') ? 'zh' : 'vi';
  }

  function t(key, vars) {
    let s = (DICT[lang] && DICT[lang][key]) || (DICT.vi[key] || key);
    if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    return s;
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'vi';
    document.title = t('app.title');
  }

  function set(next) {
    if (!DICT[next]) return;
    lang = next;
    try { localStorage.setItem(STORE, next); } catch (e) {}
    apply();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  function toggle() { set(lang === 'vi' ? 'zh' : 'vi'); }

  lang = detect();

  global.I18N = { t: t, apply: apply, set: set, toggle: toggle, get lang() { return lang; } };
})(window);

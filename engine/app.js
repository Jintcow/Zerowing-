// Оболочка v253 (Claude, 02.11.2026) по утверждённым макетам GPT: титул, день, дела, сцена, Система, бой, итог дня, смерть.
// Логика игры — в модулях day/combat/system/cards/gear/sysinv; здесь только экраны и переходы между ними.
G.define('app', function (G) {
  const root = document.getElementById('app');
  let data, save, screen = 'title', scene = null, line = 0, returnTo = null;
  const UI = { target: null, menu: null, busy: false, hp: null };          // состояние экрана боя
  const PREFS_KEY = 'norwon2026.prefs';
  let prefs = { motion: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} };
  const motion = () => prefs.motion && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- построение DOM ----------
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(3)) { if (c === null || c === undefined || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  const icon = (name) => h('span', { class: 'ic', 'aria-hidden': 'true', html: G.icons.svg(name) });
  const deco = (cls, style) => h('div', { class: 'deco ' + cls, style: style || null });
  function run(fn) { try { fn(); } catch (e) { message(e.message); } }
  function result(r) { if (r && r.ok === false) throw Error(r.error); return r; }
  // Плитка-кнопка: иконка, название, подпись, стрелка. aria-label — только название (по нему кнопку и ищут).
  function tile(label, fn, o = {}) {
    const cls = ['tile', o.variant ? 'tile--' + o.variant : '', o.shape || 's1', o.cls || ''].join(' ');
    return h('button', { type: 'button', class: cls, 'aria-label': o.aria || label, disabled: !!o.disabled, onclick: () => run(fn) },
      o.icon ? icon(o.icon) : null,
      h('span', { class: 'tl' }, h('strong', null, label), o.sub ? h('small', null, o.sub) : null),
      o.arrow === false ? null : (() => { const a = icon('arrow'); a.classList.add('go'); return a; })());
  }
  const back = (fn, label = 'Назад') => h('button', { type: 'button', class: 'back', onclick: () => run(fn) }, icon('back'), label);
  function page(name, cls, title) {
    root.replaceChildren(); root.className = 'screen ' + (cls || ''); root.dataset.screen = name;
    document.title = (title ? title + ' · ' : '') + 'Нулевое крыло: СОЛО';
    window.scrollTo(0, 0);
    requestAnimationFrame(fit); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit); setTimeout(fit, 400); setTimeout(fit, 1500);
  }
  // Крупные заголовки (широкий Unbounded) ужимаются, пока не влезут в ширину экрана.
  // Длина надписи уходит в CSS (--n): размер сразу рассчитан на ширину экрана, даже до загрузки шрифта и без JS-подгонки.
  function mark() { for (const el of root.querySelectorAll('.band, .logo-word')) el.style.setProperty('--n', Math.max(4, Math.max(...el.textContent.split(/\s+/).map(w => w.length)))); }
  let fitting = false;
  function fit() {
    if (fitting) return; fitting = true; mark();
    for (const el of root.querySelectorAll('.band, .logo-word, [data-fit-w]')) {
      el.style.fontSize = '';
      const block = getComputedStyle(el).display === 'block', par = el.parentElement, ps = getComputedStyle(par);
      const inner = par.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);   // ширина содержимого родителя, без отступов
      const max = el.dataset.fitW ? root.clientWidth * +el.dataset.fitW : block ? el.clientWidth : inner * 0.96;
      let fs = parseFloat(getComputedStyle(el).fontSize), guard = 60;
      while ((block ? el.scrollWidth > el.clientWidth + 1 : el.offsetWidth > max) && fs > 16 && guard--) { fs -= 2; el.style.fontSize = fs + 'px'; }
    }
    requestAnimationFrame(() => { fitting = false; });
  }
  // Шрифт пришёл, экран повернули, плашка изменила размер — подогнать заново.
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => fit()); ro.observe(root); new MutationObserver(() => { for (const el of root.querySelectorAll('.band, .logo-word')) ro.observe(el); fit(); }).observe(root, { childList: true }); }
  // Шрифт с Google Fonts может прийти позже первой отрисовки — подогнать заново, когда он загрузится.
  if (document.fonts) { document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => fit()); }
  window.addEventListener('resize', () => fit());
  // Прилипшая панель разделов: прячется, пока листаешь вниз, и возвращается при движении вверх или у конца страницы.
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const bar = root.querySelector(':scope > .navbar'); const y = window.scrollY, dy = y - lastY;
    if (!bar) { lastY = y; return; }
    const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 40;
    if (atEnd || y < 40 || dy < -6) bar.classList.remove('is-away'); else if (dy > 6) bar.classList.add('is-away');
    if (Math.abs(dy) > 6 || atEnd) lastY = y;
  }, { passive: true });

  // Кнопка «назад» всегда наверху (решение заказчика 03.11.2026): сразу под заголовком экрана.
  const add = (...n) => { const L = n.flat().filter((x) => x !== null && x !== undefined && x !== false); root.append(...L);
    for (const x of L) if (x && x.classList && x.classList.contains('back') && x.parentNode === root) { const h1 = root.querySelector(':scope > h1');
      if (h1) h1.after(x); else root.prepend(x); x.classList.add('back--top'); }
    return n[0]; };
  function navigate(s) { screen = s; render(); }
  const money = (n) => G.hero.formatMoney(n);
  const signed = (n, f = String) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));

  // ---------- общие куски ----------
  function whereLabel() { const d = data.districts && data.districts[String(save.hero.location || '').split(':')[0]]; return d ? d.city + ' · ' + d.name : 'Нулевое крыло'; }
  function navbar(active) {
    const items = [['day', 'День'], ['system', 'Система'], ['phone', 'Телефон'], ['saves', 'Сохранения']];
    const locked = save && !save.hero.awakened;
    const badge = phoneBadge();
    return h('nav', { class: 'navbar', 'aria-label': 'Разделы' }, items.map(([id, label]) =>
      h('button', { type: 'button', class: locked && id === 'system' ? 'is-locked' : null, 'aria-label': label, 'aria-current': id === active ? 'page' : null, onclick: () => { returnTo = null; navigate(id); } }, label, id === 'phone' && badge ? h('i', { class: 'badge', 'aria-hidden': 'true' }, String(badge)) : null)));
  }
  function message(text, next = render, sub) {
    page('message', 'scr-msg', 'Система');
    add(deco('dots dots--fade-r'), h('h1', { class: 'band band--m' }, 'Система //'),
      h('div', { class: 'frame msg-box' }, h('p', null, text), sub ? h('small', null, sub) : null),
      tile('Продолжить', next, { variant: 'blue', icon: 'right', shape: 's5', cls: 'tile--wide' }));
    // защита от «пролетевшего» тапа: последний тап по прошлому экрану не должен сразу закрыть сообщение
    const btn = root.querySelector('.scr-msg .tile'); btn.disabled = true; btn.classList.add('is-wait'); setTimeout(() => { btn.disabled = false; btn.classList.remove('is-wait'); }, 350);
  }
  // Уведомления Системы теперь всплывают окном поверх экрана (sysPop) — здесь только идём дальше.
  function notices(next) { next(); }
  // Окно Системы «для игрока»: новое задание, выполнено/провалено, уровень, пробуждение. Очередью, по одному,
  // поверх любого экрана — но не посреди сюжетной сцены и боя (там дождётся конца).
  // Окно в духе RPG: заголовок в скобках, блоки ЦЕЛЬ / СРОК / НАГРАДА / ПРИ ПРОВАЛЕ, чекбокс и полоса прогресса.
  const sec = (label, ...body) => h('div', { class: 'sp-sec' }, h('span', { class: 'sp-lbl' }, label), h('div', { class: 'sp-body' }, ...body));
  const chips = (r) => h('div', { class: 'sp-chips' }, r && r.xp ? h('span', { class: 'sp-chip' }, h('b', null, 'EXP'), '+' + r.xp) : null, r && r.coins ? h('span', { class: 'sp-chip' }, h('b', null, '◆'), '+' + r.coins) : null, !r || (!r.xp && !r.coins) ? h('span', { class: 'sp-chip' }, '—') : null);
  const goalRow = (q, mark) => h('div', { class: 'sp-goal' }, h('span', { class: 'sp-box ' + mark }, mark === 'ok' ? '✓' : mark === 'x' ? '✕' : ''), h('span', null, q.goal),
    q.need > 1 ? h('span', { class: 'sp-bar' }, h('i', { style: 'width:' + Math.round(100 * Math.min(1, q.progress / q.need)) + '%' })) : null);
  const penaltyList = (L) => L && L.length ? h('ul', { class: 'sp-pen' }, L.map((x) => h('li', null, x))) : h('p', { class: 'sp-mute' }, '—');
  const POP = {
    awakening: (n) => ({ tone: 'blue', kicker: 'УВЕДОМЛЕНИЕ', title: 'Система доступна', body: [h('p', { class: 'sp-lead' }, 'Добро пожаловать, Игрок.'), sec('ОТКРЫТО', h('p', null, 'Статус · Карты · Задания · Инвентарь'))] }),
    level: (n) => ({ tone: 'gold', kicker: 'УРОВЕНЬ', title: 'Уровень повышен', body: [h('div', { class: 'sp-lv' }, h('span', null, 'LV ' + (n.level - 1)), h('b', null, '→'), h('strong', null, 'LV ' + n.level)), sec('ПОЛУЧЕНО', h('div', { class: 'sp-chips' }, h('span', { class: 'sp-chip' }, h('b', null, 'ОЧКИ'), '+5')))] }),
    achievement: (n) => ({ tone: 'blue', kicker: 'ДОСТИЖЕНИЕ', title: n.name, body: [h('p', { class: 'sp-lead' }, n.hint ? n.hint[0].toUpperCase() + n.hint.slice(1) + '.' : ''), sec('НАГРАДА', h('div', { class: 'sp-chips' }, n.xp ? h('span', { class: 'sp-chip' }, h('b', null, 'EXP'), '+' + n.xp) : null, h('span', { class: 'sp-chip' }, '+1 выбор карты'), n.fusion ? h('span', { class: 'sp-chip' }, 'Карта «Объединение»') : null))] }),
    quest_new: (n) => { const q = n.q || { goal: n.title, progress: 0, need: 1 }; return { tone: 'blue', kicker: q.story ? 'СЮЖЕТНОЕ ЗАДАНИЕ' : 'ЗАДАНИЕ', title: n.title,
      body: [sec('ЦЕЛЬ', goalRow(q, '')), q.due ? sec('СРОК', h('p', null, 'до ' + q.due + ' · ' + q.left)) : null, sec('НАГРАДА', chips(q.reward)), sec('ПРИ ПРОВАЛЕ', penaltyList(q.penalty))] }; },
    quest_done: (n) => { const q = n.q || { goal: n.title, progress: 1, need: 1, reward: n.reward }; return { tone: 'gold', kicker: 'ЗАДАНИЕ', title: n.title, stamp: 'ВЫПОЛНЕНО',
      body: [sec('ЦЕЛЬ', goalRow(q, 'ok')), sec('ПОЛУЧЕНО', chips(q.reward || n.reward))] }; },
    quest_failed: (n) => { const q = n.q || { goal: n.title, progress: 0, need: 1 }; return { tone: 'red', kicker: 'ЗАДАНИЕ', title: n.title, stamp: 'ПРОВАЛЕНО',
      body: [sec('ЦЕЛЬ', goalRow(q, 'x')), sec('ШТРАФ', penaltyList(n.lost || q.penalty))] }; },
  };
  let popOpen = false;
  // Уведомление телефона (банк, письма): баннер сверху в стиле телефона, не окно Системы. Письмо остаётся в «Почте».
  const APP_IC = { 'Банк': 'coins', 'Почта': 'chat' };
  // Mobile phone banners must never cover iOS status bar / Dynamic Island.
  // Set the offset on the actual DOM layer (not just the stylesheet), so the
  // overlay also stays correctly positioned during a staggered PWA update.
  const pushSafeStyle = () => window.matchMedia && window.matchMedia('(max-width: 600px)').matches
    ? 'padding-top:max(98px,calc(env(safe-area-inset-top,0px) + 28px));overflow-y:auto'
    : null;

  function chatPush() {
    if (!save.day || screen === 'chat' || screen === 'chatwarn') return false;
    const seen = save.chat_pushed || (save.chat_pushed = {}), sc = G.plot.chats(save).find((x) => !seen[x.id]); if (!sc) return false;
    seen[sc.id] = 1; const w = chatWho(sc), first = ((sc.steps || []).find((x) => x.say === w && x.t) || {}).t || 'Новое сообщение';
    popOpen = true;
    const close = (open) => { layer.classList.add('out'); setTimeout(() => { layer.remove(); popOpen = false; if (open) chatThread(w); else sysPop(); }, 160); };
    const ok = h('button', { type: 'button', class: 'syspop-ok push-btn', onclick: () => close(false) }, 'Позже');
    const layer = h('div', { class: 'syspop push', style: pushSafeStyle(), role: 'alertdialog', 'aria-label': 'Чат: ' + G.plot.name(save, w) },
      h('div', { class: 'push-card' }, h('div', { class: 'push-top' }, h('span', { class: 'push-ic' }, icon('chat')), h('span', null, 'ЧАТ'), h('small', null, 'сейчас')),
        h('strong', null, G.plot.name(save, w)), h('p', null, first.length > 120 ? first.slice(0, 120) + '…' : first),
        h('div', { class: 'push-row' }, h('button', { type: 'button', class: 'push-btn push-btn--open', onclick: () => close(true) }, 'Открыть'), ok)));
    document.body.append(layer); ok.disabled = true; setTimeout(() => { ok.disabled = false; }, 300);
    return true;
  }
  function phonePush() {
    if (chatPush()) return;
    const m = G.mail && G.mail.nextPush(save); if (!m) return;
    popOpen = true;
    const close = (open) => { layer.classList.add('out'); setTimeout(() => { layer.remove(); popOpen = false; if (open) { G.mail.read(save, m.id); while (G.mail.nextPush(save)); UI.mailOpen = m.id; navigate('mailView'); } else sysPop(); }, 160); };
    const ok = h('button', { type: 'button', class: 'syspop-ok push-btn', onclick: () => close(false) }, 'Закрыть');
    const layer = h('div', { class: 'syspop push', style: pushSafeStyle(), role: 'alertdialog', 'aria-label': m.app + ': ' + m.title },
      h('div', { class: 'push-card' },
        h('div', { class: 'push-top' }, h('span', { class: 'push-ic' }, icon(APP_IC[m.app] || 'chat')), h('span', null, m.app.toUpperCase()), h('small', null, 'сейчас')),
        h('strong', null, m.title), h('p', null, m.from ? m.from + ': ' + m.text : m.text),
        h('div', { class: 'push-row' }, h('button', { type: 'button', class: 'push-btn push-btn--open', onclick: () => close(true) }, 'Открыть'), ok)));
    document.body.append(layer);
    ok.disabled = true; setTimeout(() => { ok.disabled = false; }, 300);
  }
  // Бестиарий: вкладки рангов, карточки тварей (неизвестные — силуэт «???»), подробности по ступеням.
  const ROLE_NAME = { regular: 'рядовой', elite: 'элита', boss: 'босс' };
  function bestiaryView() {
    page('bestiaryView', 'scr-phone', 'Бестиарий');
    const B = G.bestiary, C = B.counts(save, data), r = UI.bRank || 'F', L = B.list(save, data, r).sort((a, b) => (b.tier > 0) - (a.tier > 0) || ({ boss: 2, elite: 1 }[b.s.role] || 0) - ({ boss: 2, elite: 1 }[a.s.role] || 0));
    add(h('h1', { class: 'band band--l' }, 'Бестиарий'),
      h('div', { class: 'tabs bx-tabs' }, B.RANKS.map((k) => h('button', { type: 'button', class: 'tab' + (k === r ? ' is-on' : ''), onclick: () => { UI.bRank = k; bestiaryView(); } }, k, h('small', null, C[k].known + '/' + C[k].total)))),
      h('p', { class: 'muted', style: 'font-size:13px;margin:0 0 10px' }, 'Встретил — открывается облик. Убийства и «Анализ» открывают силу, слабости и добычу.'),
      h('div', { class: 'bx-grid' }, L.map(({ s, tier, kills }) => { const src = tier ? G.art.mon(s.id) : null;
        return h('button', { type: 'button', class: 'bx' + (tier ? '' : ' is-unknown') + ' role-' + s.role, disabled: !tier, onclick: () => { UI.beast = s.id; navigate('beastView'); } },
          h('span', { class: 'bx-sp', style: src ? 'background-image:url("' + src + '")' : null }, tier ? null : '?'),
          h('strong', null, tier ? s.name : '???'), h('small', null, tier ? (ROLE_NAME[s.role] || '') + (kills ? ' · убито ' + kills : '') : ROLE_NAME[s.role] || '')); })),
      back(() => navigate('phone'), 'Телефон'));
  }
  function beastView() {
    const c = G.bestiary.card(save, data, UI.beast); if (!c || !c.tier) { navigate('bestiaryView'); return; }
    const s = c.s, src = G.art.mon(s.id), STN = { str: 'СИЛ', agi: 'ЛОВ', vit: 'ВЫН', per: 'ВОС', mag: 'МАГ' };
    page('beastView', 'scr-phone', s.name);
    const row = (k, v) => h('div', { class: 'eq-stat' }, h('span', null, k), h('b', null, String(v)), h('small', { class: 'muted' }, ''));
    const sec = (title, ...body) => h('section', { class: 'frame bx-sec' }, h('h2', { class: 'h-sec', style: 'margin:0 0 6px' }, title), ...body);
    const lock = (t) => h('p', { class: 'bx-lock' }, icon('info'), t);
    add(h('h1', { class: 'band band--l' }, s.name),
      h('div', { class: 'bx-head' }, h('span', { class: 'an-sp bx-big', style: src ? 'background-image:url("' + src + '")' : null }),
        h('div', null, h('p', { style: 'margin:0' }, h('span', { class: 'rank' }, s.rank), ' ', ROLE_NAME[s.role] || ''), h('p', { class: 'muted', style: 'margin:6px 0 0' }, s.biome + (s.size_m ? ' · ' + s.size_m + ' м' : '')),
          h('p', { style: 'margin:6px 0 0;font-weight:700' }, 'Убито: ' + c.kills + (c.analyzed ? ' · изучен «Анализом»' : '')))),
      sec('Облик', h('p', { style: 'margin:0' }, s.look || '—')),
      c.tier >= 2 ? sec('Сила', row('HP', s.hp), row('Атака', s.atk), ...Object.entries(s.stats || {}).filter(([, v]) => v).map(([k, v]) => row(STN[k] || k, v)),
        s.sign ? h('p', { class: 'muted', style: 'margin:8px 0 0;font-size:13px' }, 'Перед атакой: ' + s.sign.toLowerCase()) : null, s.behavior ? h('p', { class: 'muted', style: 'margin:6px 0 0;font-size:13px' }, s.behavior) : null) : null,
      c.tier >= 3 ? sec('Слабости и способности', h('p', { style: 'margin:0' }, 'Урон: ' + (s.dmg_type || '—') + (s.weak ? ' · слабость: ' + s.weak + (s.weak_pct ? ' (+' + s.weak_pct + '%)' : '') : '')),
        s.energy_only ? h('p', { class: 'alert-line', style: 'margin:6px 0 0' }, icon('info'), 'Обычный удар не берёт — нужна энергия пробуждённых') : null,
        h('ul', { class: 'bx-abil' }, (s.abilities || []).map((a) => h('li', null, h('b', null, a.name), a.prep ? ' · подготовка ' + a.prep + ' х.' : '', a.cd ? ' · перезарядка ' + a.cd + ' х.' : '')))) : null,
      c.tier >= 4 ? sec('Добыча', s.material ? h('p', { style: 'margin:0' }, s.material.name + ' · ' + money(s.material.price_won) + ' · ' + Math.round((s.material.chance || 1) * 100) + '%') : null,
        ...(s.loot_pool || []).map((p) => h('p', { style: 'margin:4px 0 0' }, p.name + (p.price_won ? ' · ' + money(p.price_won) : '') + ' · ' + Math.round((p.chance || 0) * 100) + '%'))) : null,
      c.next ? lock(c.next) : null,
      back(() => navigate('bestiaryView'), 'Бестиарий'));
  }
  // Заказ (кузнец или Чо): предложение недели, взятый заказ, сдача на месте.
  function orderCard(who) {
    const Fo = G.forge, o = Fo.orders(save, who), g = Fo.GIVERS[who], here = save.hero.location === g.place, run2 = (fn) => () => run(() => { const r = fn(); UI.forgeMsg = r; (screen === 'forgeView' ? forgeView : ordersView)(); });
    if (o.active) { const a = o.active, n = Fo.have(save, a.mat);
      return h('section', { class: 'plate billrow' }, h('div', null, h('strong', null, a.name + ' · ' + n + '/' + a.n), h('small', null, 'С твари «' + a.from + '» (' + a.rank + ') · до ' + G.clock.format(a.due + 'T07:00').date + ' · ' + money(a.pay) + (a.rep ? ' · репутация +' + a.rep : ''))),
        h('button', { type: 'button', class: 'mini mini--blue', disabled: n < a.n || !here, onclick: run2(() => { const r = Fo.deliver(save, who); return 'Сдано: ' + r.name + ' ×' + r.n + '. +' + money(r.pay) + (r.rep ? ', репутация +' + r.rep : '') + '.'; }) }, n < a.n ? 'Не хватает' : 'Сдать')); }
    if (o.offer) { const a = o.offer;
      return h('section', { class: 'plate billrow' }, h('div', null, h('strong', null, a.name + ' ×' + a.n), h('small', null, 'С твари «' + a.from + '» (' + a.rank + ') · ' + a.days + ' дн. · ' + money(a.pay) + (a.rep ? ' · репутация +' + a.rep : '') + (who === 'forge' ? ' · сорвёшь — репутация −6' : ''))),
        h('button', { type: 'button', class: 'mini mini--blue', onclick: run2(() => { Fo.accept(save, who); return 'Заказ взят. Срок — ' + a.days + ' дней.'; }) }, 'Взять')); }
    return h('p', { class: 'muted' }, 'На этой неделе заказов нет. Новые — со следующей недели.');
  }
  function ordersView() {
    const who = UI.ordWho || 'cho', g = G.forge.GIVERS[who];
    page('ordersView', '', 'Заказ: ' + g.name);
    add(h('h1', { class: 'band band--l' }, 'Заказ: ' + g.name), UI.forgeMsg ? h('p', { class: 'note' }, icon('check'), UI.forgeMsg) : null,
      h('p', { class: 'muted' }, who === 'cho' ? 'Чо платит наличными и сверху каталога — если принести вовремя.' : ''), orderCard(who),
      back(() => { UI.forgeMsg = null; run(() => placeView(g.place)); }, 'Выйти'));
  }
  function forgeView() {
    const Fo = G.forge, T = Fo.tier(save), R = Fo.recipes(save);
    page('forgeView', '', 'Кузня Кихо');
    const msg = (fn) => () => run(() => { UI.forgeMsg = fn(); forgeView(); });
    add(h('h1', { class: 'band band--l' }, 'Кузня Кихо'), UI.forgeMsg ? h('p', { class: 'note' }, icon('info'), UI.forgeMsg) : null,
      h('section', { class: 'plate' }, h('span', { class: 'label' }, 'Репутация у Кихо'), h('b', { style: 'display:block;font:800 22px var(--f-display);margin-top:4px' }, T.name + ' · ' + T.rep),
        h('small', { class: 'muted' }, T.next !== null ? 'До «' + T.nextName + '»: ' + (T.next - T.rep) + '. Растёт от заказов и от денег, потраченных здесь.' : 'Выше некуда.')),
      h('section', { class: 'plate balance' }, h('span', { class: 'label' }, 'На счёте'), h('b', null, money(save.hero.money))),
      h('h2', { class: 'h-sec' }, 'Заказ Кихо'), orderCard('forge'),
      h('h2', { class: 'h-sec' }, 'Рецепты', h('span', { class: 'label muted' }, 'дорого и сложно')));
    add(h('div', { class: 'stack' }, R.map((r, i) => { const g = r.item.gear, w = r.owned ? Fo.canCraft(save, r.id) : '';
      const locked = !r.owned && Fo.rep(save) < r.rep;
      return h('section', { class: 'frame frame--ink2 fg-rec' + (locked ? ' is-locked' : '') },
        h('div', { class: 'fg-top' }, h('strong', null, r.name), h('span', { class: 'rank' }, r.rank)),
        h('small', { class: 'muted' }, G.gear.EQ_NAME[g.eq] + ' · ' + G.gear.describe(g)),
        r.owned ? h('ul', { class: 'fg-need' }, r.need.map((n) => h('li', { class: n.have >= n.n ? 'ok' : '' }, n.name + ' ' + Math.min(n.have, n.n) + '/' + n.n, h('small', null, ' · ' + n.from)))) : null,
        r.owned ? h('div', { class: 'fg-row' }, h('small', null, 'Работа ' + money(r.fee) + ' · успех ' + Math.round(r.chance * 100) + '% · неудача — материалы сгорят'),
          h('button', { type: 'button', class: 'mini mini--blue', disabled: !!w, onclick: msg(() => { const x = Fo.craft(save, r.id); return x.ok ? 'Готово: «' + x.item.name + '». Уже в рюкзаке.' : 'Металл лопнул на закалке. Материалы сгорели. Кихо молча сметает обломки.'; }) }, w || 'Ковать'))
          : h('div', { class: 'fg-row' }, h('small', null, locked ? 'Кихо не продаст: нужна репутация ' + r.rep : 'Рецепт · ' + money(r.price)),
            h('button', { type: 'button', class: 'mini mini--blue', disabled: locked || save.hero.money < r.price, onclick: msg(() => { Fo.buyRecipe(save, r.id); return 'Рецепт «' + r.name + '» твой.'; }) }, locked ? 'Закрыто' : 'Купить рецепт')));
    })));
    if (Fo.canSharpenAt(save)) { const items = G.gear.worn(save.hero, data).map((w) => w.item).concat((save.hero.items || []).filter((it) => G.gear.info(data, it)));
      add(h('h2', { class: 'h-sec' }, 'Заточка', h('span', { class: 'label muted' }, 'Кузнечное чутьё')), h('div', { class: 'stack' }, items.map((it) => { const c = Fo.sharpenCost(it);
        return h('section', { class: 'plate billrow' }, h('div', null, h('strong', null, it.name + (it.plus ? ' +' + it.plus : '')), h('small', null, c ? c.cry + ' × ' + c.id.replace('CRY-', 'кристалл ') + ' (есть ' + Fo.have(save, c.id) + ') · ' + money(c.money) + ' · шанс ' + Math.round(c.chance * 100) + '%' : 'Предел +5')),
          h('button', { type: 'button', class: 'mini mini--blue', disabled: !c || Fo.have(save, c.id) < c.cry || save.hero.money < c.money, onclick: msg(() => { const r = Fo.sharpen(save, it); return r.ok ? '«' + it.name + '» теперь +' + r.plus + '.' : 'Не взялось. ' + (r.plus ? 'Заточка: +' + r.plus + '.' : ''); }) }, 'Точить')); }))); }
    add(back(() => { UI.forgeMsg = null; run(() => placeView('nowon:forge')); }, 'Выйти'));
  }
  function mailView() {
    page('mailView', 'scr-phone', 'Почта');
    const L = G.mail.list(save), open = UI.mailOpen;
    add(h('h1', { class: 'band band--l' }, 'Почта'));
    if (!L.length) add(h('p', { class: 'note' }, icon('info'), 'Писем нет.'));
    add(h('div', { class: 'mail-list' }, L.map((m) => { const isOpen = m.id === open;
      return h('button', { type: 'button', class: 'mail' + (m.read ? '' : ' is-new') + (isOpen ? ' is-open' : ''), onclick: () => { G.mail.read(save, m.id); UI.mailOpen = isOpen ? null : m.id; mailView(); } },
        h('span', { class: 'mail-top' }, h('b', null, m.from || m.app), h('small', null, G.clock.format(m.at).date)),
        h('strong', null, m.title), isOpen ? h('p', null, m.text) : h('span', { class: 'mail-pre' }, m.text)); })),
      back(() => { UI.mailOpen = null; navigate('phone'); }, 'Телефон'));
  }
  function sysPop() {
    if (popOpen || !save || save.hero.dead || save.battle || (save.plot && save.plot.run) || ['message', 'draw', 'reveal', 'title', 'newgame', 'battle', 'scene', 'debug'].includes(screen)) return;
    const n = G.system.pendingNotices(save)[0]; if (!n) return phonePush();
    if (['bill', 'bill_soon', 'bill_cut', 'suneung', 'school_warn'].includes(n.kind)) { n.shown = true; return sysPop(); }   // старые сохранения: это теперь письма телефона
    const v = (POP[n.kind] || ((x) => ({ tone: 'blue', kicker: 'УВЕДОМЛЕНИЕ', title: 'Статус обновлён', body: [] })))(n);
    popOpen = true;
    const close = () => { n.shown = true; layer.classList.add('out'); setTimeout(() => { layer.remove(); popOpen = false; sysPop(); }, 180); };
    const ok = h('button', { type: 'button', class: 'syspop-ok', onclick: close }, 'Принять');
    const layer = h('div', { class: 'syspop tone-' + v.tone, role: 'alertdialog', 'aria-label': 'Система: ' + v.title },
      h('div', { class: 'syspop-win' }, h('div', { class: 'syspop-head' }, h('span', null, '◆ СИСТЕМА'), h('i', null, '!')),
        h('div', { class: 'sp-kicker' }, '[ ' + v.kicker + ' ]'), h('strong', { class: 'syspop-title' }, v.title),
        v.stamp ? h('div', { class: 'sp-stamp' }, v.stamp) : null, h('div', { class: 'sp-rule' }), v.body, ok));
    document.body.append(layer);
    ok.disabled = true; setTimeout(() => { ok.disabled = false; ok.focus(); }, 380);   // пролетевший тап не закрывает окно сразу
  }
  function after(text) { if (save.hero.dead) { render(); return; } if (text) message(text, () => notices(() => navigate('day'))); else notices(() => navigate('day')); }
  const dateParts = () => { const p = G.clock.parts(save.clock); return { dd: String(p.d).padStart(2, '0'), mm: String(p.mo + 1).padStart(2, '0'), full: G.clock.format(save.clock).date, wd: G.clock.format(save.clock).weekday }; };
  function personName(id) { return G.plot.name(save, id); }

  // ---------- титул ----------
  function title() {
    page('title', 'scr-title');
    const bg = G.art.loc('nowon:street');
    const has = G.save.list().some((s) => !s.empty && !s.broken);
    add(h('div', { class: 'deco title-bg', style: bg ? 'background-image:url("' + bg + '")' : null }), h('div', { class: 'deco title-tint' }),
      deco('moon'), deco('dots dots--fade-r', 'right:0;top:0;width:70%;height:42%'), deco('shard shard-tl'), deco('shard shard-bl'),
      h('div', { class: 'logo' }, h('h1', { class: 'logo-h1' }, h('span', { class: 'logo-top' }, 'Нулевое крыло'), h('span', { class: 'sr' }, ': '), h('span', { class: 'logo-word' }, 'Соло'))),
      h('div', { class: 'title-menu' },
        h('button', { type: 'button', class: 'menu-btn menu-btn--blue', onclick: () => navigate('newgame') }, icon('play'), 'Новая игра'),
        h('button', { type: 'button', class: 'menu-btn', disabled: !has, onclick: () => navigate('saves') }, icon('play'), 'Продолжить'),
        h('button', { type: 'button', class: 'menu-btn', onclick: () => navigate('settings') }, icon('gear'), 'Настройки')),
      h('small', { class: 'title-ver' }, 'v253 · каркас'));
  }
  function newGame() {
    page('newgame', '', 'Новая игра');
    add(deco('dots dots--fade-r', 'right:0;top:0;width:70%;height:40%'), h('h1', { class: 'band band--l' }, 'Новая игра'));
    // Герой — всегда Кан Сиу (решение заказчика 02.11.2026).
    add(h('section', { class: 'plate hero-card' }, h('span', { class: 'nm' }, 'Кан Сиу'), h('small', null, '18 лет · выпускной класс 3-4 · Норвон, Сеул')),
      h('p', { class: 'note' }, icon('info'), 'Сюжет: пролог 1–9 сентября, затем Глава 1.'),
      tile('Начать', () => {
        save = G.bootstrap.newSave(data, G.bootstrap.HERO_NAME, crypto.getRandomValues(new Uint32Array(1))[0]); scene = null; after();
      }, { variant: 'blue', icon: 'play', shape: 's5', cls: 'tile--hero' }),
      // Для проверки: сразу к Главе 1 (пролог 1–9 сентября напишут сценаристы).
      tile('Тест: Глава 1 с 10 сентября', () => {
        save = G.bootstrap.newSave(data, G.bootstrap.HERO_NAME, crypto.getRandomValues(new Uint32Array(1))[0]); G.day.begin(save, data, 10, '2026-09-10'); scene = null; after();
      }, { variant: 'ink', icon: 'book', sub: 'Пропустить пустые дни пролога', shape: 's3', cls: 'tile--frame' }),
      back(() => navigate('title')));
  }
  function settings() {
    page('settings', '', 'Настройки');
    add(h('h1', { class: 'band band--l' }, 'Настройки'));
    const mo = h('input', { type: 'checkbox', id: 'pref-motion', checked: prefs.motion });
    mo.onchange = () => { prefs.motion = mo.checked; savePrefs(); };
    const box = h('div', { class: 'plate stack' },
      h('label', { class: 'switch', for: 'pref-motion' }, h('span', null, h('strong', null, 'Анимации боя'), h('br'), h('small', { class: 'muted' }, 'Позы, удары и цифры урона')), mo));
    if (document.fullscreenEnabled) box.append(h('button', { type: 'button', class: 'mini', onclick: () => { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); } }, 'Полный экран'));
    add(box, h('p', { class: 'note' }, icon('info'), G.save.cloudState() === 'on' ? 'Сохранения хранятся в этом браузере и в облаке Claude — откроются и на другом устройстве.' : G.save.cloudState() === 'error' ? 'Облако сохранений сейчас недоступно — сохранения пока только в этом браузере.' : G.save.isPersistent() ? 'Сохранения хранятся в этом браузере.' : 'Хранилище браузера недоступно: сохранения пропадут при закрытии страницы.'),
      back(() => navigate(save ? 'day' : 'title')));
  }

  // ---------- день ----------
  const ACT = [
    { id: 'gate', label: 'Врата', sub: 'Бой / трофеи', icon: 'gate', variant: 'blue', shape: 's1' },
    { id: 'quest', label: 'Задание Системы', sub: 'Задание дня', icon: 'check', shape: 's3' },
    { id: 'train', label: 'Тренировка', sub: 'Характеристики', icon: 'dumbbell', shape: 's2' },
    { id: 'work', label: 'Работа', sub: 'Подработка', icon: 'briefcase', shape: 's3' },
    { id: 'gear', label: 'Снаряжение', sub: 'Кукла · рюкзак', icon: 'bag', shape: 's4' },
    { id: 'study', label: 'Учёба', sub: 'Занятие', icon: 'book', shape: 's2' },
    { id: 'rest', label: 'Отдых', sub: 'HP / MP', icon: 'moon', variant: 'blue', wide: true, shape: 's6', cls: 'tile--wide tile--center' },
  ];
  // Задания и достижения Системы вернутся после переработки (решение заказчика 02.11.2026).
  // Места под них в интерфейсе уже есть: пока модулей нет — пустые состояния; появятся G.quests/G.achievements — подхватятся.
  const questErr = () => (G.quests.view(save).length ? '' : 'Нет активного задания');
  const questList = () => (G.quests && G.quests.view ? G.quests.view(save, data) : []);
  function actGrid() {
    const offers = G.plot.offers(save).map((sc) => { const t = tile(sc.offer && sc.offer.label || sc.title, () => chatGuard(() => playScene(sc.id, { offer: true })), { icon: 'book', sub: (sc.offer && sc.offer.sub) || 'Сцена', variant: 'red', shape: 's5' }); t.classList.add('wide'); return t; });
    const shop = [];
    if (G.school && G.school.examToday(save)) { const t = tile('Сунын', () => doAction('suneung'), { icon: 'book', variant: 'red', sub: 'Экзамен на весь день · пропустишь — «не явился»', shape: 's5' }); t.classList.add('wide'); shop.unshift(t); }
    return h('div', { class: 'grid2' }, offers, shop, ACT.map((a) => {
      const err = a.id === 'quest' ? questErr() : a.id === 'gear' ? (save.battle ? 'Не в бою' : '') : G.day.can(save, a.id, data);
      const q0 = a.id === 'quest' && !err ? G.quests.view(save)[0] : null;
      const sub0 = a.id === 'study' && G.school ? G.school.line(save) : a.sub;
      const t = tile(a.label, () => chooseActivity(a.id), { icon: a.icon, sub: err || (q0 ? q0.title + ' · ' + G.quests.dueText(save, q0) : sub0), variant: err ? null : q0 ? 'blue' : a.variant, shape: a.shape, disabled: !!err, cls: (a.cls || '') });
      if (a.wide) t.classList.add('wide');
      return t;
    }));
  }
  function dayHead() {
    const d = dateParts(), slot = G.day.SLOTS[save.day.slot], w = G.passives.weather(save);
    const free = save.day.story_done && save.day.slot < 3;
    return h('header', { class: 'dayhead' }, deco('dots dots--fade-l'),
      h('h1', null, h('span', { class: 'bigdate', 'aria-hidden': 'true' }, d.dd, h('small', null, '/' + d.mm)),
        h('span', { class: 'band dayband' }, slot), h('span', { class: 'sr' }, ' · ' + d.full)),
      h('div', { class: 'weather' }, h('span', { class: 'label' }, d.wd), h('span', { class: 'tw' }, icon(w.rain ? 'rain' : save.day.slot === 3 ? 'moon' : 'sun'), (w.temp > 0 ? '' : w.temp < 0 ? '−' : '') + Math.abs(w.temp) + '°')),
      free ? h('span', { class: 'tag tag--ink turn' }, 'Твой ход') : holidayName() ? h('span', { class: 'tag tag--ink turn' }, holidayName()) : null);
  }
  const holidayName = () => { const x = G.plot.holiday(save.day.date); return x ? x.name : ''; };
  function goals() {
    const t = [], L = G.living;
    if (L && L.phoneCut(save)) t.push('Связь отключена — оплати телефон: Телефон → Банк');
    if (L && L.cold(save)) t.push('Отопление отключено — оплати коммуналку: Телефон → Банк');
    for (const b of (L ? L.bills(save) : []).filter((b) => !b.paid && G.clock.diff(save.day.date + 'T07:00', b.due + 'T07:00') <= 3 * 1440).slice(0, 1))
      if (!(L.phoneCut(save) && b.kind === 'phone')) t.push('Оплатить «' + b.title + '» до ' + G.clock.format(b.due + 'T07:00').date.slice(0, 5) + ' — Телефон → Банк');
    for (const g of G.gates.breaches(save).slice(0, 1)) t.push('ПРОРЫВ: ' + placeName(g.place) + ' — твари на улицах');
    for (const o of (G.forge ? G.forge.activeAll(save) : [])) t.push('Заказ ' + (o.who === 'cho' ? 'Чо' : 'Кихо') + ': ' + o.name + ' ' + G.forge.have(save, o.mat) + '/' + o.n + ' до ' + o.due.slice(8, 10) + '.' + o.due.slice(5, 7));
    for (const q of (G.quests ? G.quests.view(save) : []).slice(0, 2)) t.push('Задание «' + q.title + '» · ' + G.quests.dueText(save, q));
    if (save.hero.sys && save.hero.sys.gacha) t.push('Выбрать карту в Системе');
    if (save.hero.sys && save.hero.sys.points) t.push('Распределить очки характеристик (' + save.hero.sys.points + ')');
    t.splice(t.length && /^(Связь|Отопление|Оплатить|Штраф)/.test(t[0]) ? 1 : 0, 0, save.day.slot === 3 ? 'Подвести итог дня' : save.day.story_done ? 'Выбрать дело' : 'Пройти сюжетную сцену');
    return h('section', { class: 'goalbox' }, h('span', { class: 'label' }, 'Цель /'), h('p', null, t[0]),
      t.length > 1 ? h('details', null, h('summary', null, '▸ Ещё ' + (t.length - 1) + ' ▾'), t.slice(1).map((x) => h('p', null, x))) : null);
  }
  function day() {
    G.day.unlockMorning(save);
    page('day', 'scr-day', G.day.SLOTS[save.day.slot]);
    add(h('div', { class: 'topbar' }, h('span', { class: 'label' }, whereLabel()), h('span', { class: 'label' }, 'День ' + String(save.day.n).padStart(2, '0') + ' · ' + ((data.locById[save.hero.location] || {}).name || ''))),
      dayHead(),
      h('div', { class: 'slots' }, G.day.SLOTS.map((x, i) => h('div', { class: 'slot' + (i === save.day.slot ? ' current' : i < save.day.slot ? ' done' : '') },
        h('span', { class: 'num' }, String(i + 1).padStart(2, '0')), h('strong', null, x)))),
      goals(), h('hr', { class: 'rule' }));
    if (save.day.slot === 3) {
      add(h('h2', { class: 'h-sec' }, 'День окончен'), tile('Подвести итог дня', summary, { variant: 'blue', icon: 'moon', shape: 's5', cls: 'tile--hero' }));
    } else if (!save.day.story_done) {
      const first = G.plot.storyNext(save);
      add(h('h2', { class: 'h-sec' }, 'Активность'),
        first ? tile(first.mode === 'chat' ? 'Сообщение' : 'Сюжетная сцена', () => startStory(first, { morning: true }), { variant: 'blue', icon: first.mode === 'chat' ? 'chat' : 'book', sub: first.mode === 'chat' ? G.plot.name(save, chatWho(first)) : first.title, shape: 's5', cls: 'tile--hero' })
          : tile('Начать день', () => { G.day.finishStory(save, data); after(); }, { variant: 'blue', icon: 'right', sub: holidayName() || 'Обычное утро', shape: 's5', cls: 'tile--hero' }));
    } else if (save.inspector) {
      add(h('h2', { class: 'h-sec' }, 'Ассоциация'), tile('Инспектор у подъезда', () => playScene(save.inspector, { heat: true }), { variant: 'red', icon: 'person', sub: 'Мимо не пройти', shape: 's5', cls: 'tile--hero' }));
    } else if (save.breach_here && G.gates.byId(save, save.breach_here)) {
      const g = G.gates.byId(save, save.breach_here);
      add(h('h2', { class: 'h-sec' }, 'Прорыв'), h('p', { class: 'alert-line' }, icon('info'), 'Разлом ранга ' + g.est + ' прорвался прямо здесь, ' + placeName(g.place) + '. Твари уже на улице.'),
        tile('Твари на улице', () => doAction('breach', g.id), { variant: 'red', icon: 'gate', sub: 'Бой обязателен · бежать можно', shape: 's5', cls: 'tile--hero' }));
    } else if (save.penalty_zone) {
      add(h('h2', { class: 'h-sec' }, 'Штраф Системы'), tile('Штрафная зона', () => doAction('penalty'), { variant: 'red', icon: 'gate', sub: 'Бой обязателен · бегство: −2 на 2 дня · поражение: 1 HP и −2 на 3 дня', shape: 's5', cls: 'tile--hero', disabled: !!G.day.can(save, 'penalty', data) }));
    } else if (G.plot.autoDue(save).length) {
      const ev = G.plot.storyNext(save);
      add(h('h2', { class: 'h-sec' }, 'Событие'), tile(ev.mode === 'chat' ? 'Сообщение · ' + G.plot.name(save, chatWho(ev)) : ev.title || 'Сцена', () => startStory(ev, { slotAuto: true }), { variant: 'red', icon: 'book', sub: 'Сначала это', shape: 's5', cls: 'tile--hero' }));
    } else {
      add(h('h2', { class: 'h-sec' }, 'Активность', h('button', { type: 'button', class: 'pill', onclick: () => navigate('activities') }, 'Выбрать дело')), actGrid());
    }
    add(h('div', { class: 'grow' }), navbar('day'));
  }
  function activities() {
    page('activities', '', 'Дела');
    add(h('h1', { class: 'band band--l' }, 'Дела'), h('p', { class: 'muted' }, dateParts().full + ' · ' + G.day.SLOTS[save.day.slot]), actGrid(), back(() => navigate('day')));
  }
  // Непрочитанная переписка (03.11.2026): сообщение сгорает с концом слота, поэтому перед делом, которое тратит слот, — предупреждение.
  const chatWho = (sc) => sc.chat || (sc.cast || [])[0];
  function chatGuard(next) {
    const pend = G.plot.chats(save), key = save.day.date + ':' + save.day.slot;
    if (!pend.length || UI.chatSkip === key) return next();
    const sc = pend[0], w = chatWho(sc), first = ((sc.steps || []).find((x) => x.say === w && x.t) || {}).t || 'Новое сообщение';
    page('chatwarn', 'scr-phone', 'Сообщение');
    add(h('h1', { class: 'band band--l' }, 'Сообщение'), h('section', { class: 'push-card', style: 'margin:0 0 14px' }, h('div', { class: 'push-top' }, h('span', { class: 'push-ic' }, icon('chat')), h('span', null, 'ЧАТ'), h('small', null, 'не прочитано')),
        h('strong', null, G.plot.name(save, w) + (pend.length > 1 ? ' и ещё ' + (pend.length - 1) : '')), h('p', null, first.length > 140 ? first.slice(0, 140) + '…' : first)),
      h('p', { class: 'muted' }, 'Если заняться делом сейчас, разговор пройдёт без Сиу.'),
      h('div', { class: 'stack' }, tile('Открыть чат', () => startStory(sc, { back: true }), { variant: 'blue', icon: 'chat', shape: 's5' }),
        tile('Не отвечать', () => { UI.chatSkip = key; next(); }, { icon: 'right', sub: 'Сообщение останется без ответа', shape: 's3' })));
  }
  function chooseActivity(id) {
    if (id !== 'gear' && id !== 'quest' && G.plot.chats(save).length && UI.chatSkip !== save.day.date + ':' + save.day.slot) return chatGuard(() => chooseActivity(id));
    if (id === 'gate') return gateView();
    if (id === 'work') return jobsView();
    if (id === 'gear') return inventory();
    if (id === 'train') return trainView();
    if (id === 'quest') return questsView();
    doAction(id);
  }
  // Заход во Врата закончен: мысли Сиу (если есть сцена) и возврат к делам.
  function gateOver(msg) { const post = G.plot.onActivity(save, 'gate_done'); if (post) { playScene(post.id, { msg }); return; } after(msg); }
  // ---------- карта Врат: развилки от входа (снизу) к боссу (сверху) ----------
  const GSVG = {
    fight: '<path d="M5 4l11 11M19 4L8 15"/><path d="M13 17l4 4M11 17l-4 4M3.5 19.5l2-2M20.5 19.5l-2-2"/>',
    treasure: '<path d="M4 10a8 5 0 0 1 16 0v9H4z"/><path d="M4 13h16M11 12h2v3h-2z"/>',
    rest: '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z"/><path d="M5 20l14-3M5 17l14 3"/>',
    event: '<path d="M8.5 8.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.3-1.5 2.3V15"/><path d="M12 19.2v.3" stroke-width="3"/>',
    elite: '<path d="M5 3c0 4 1 6 3 7M19 3c0 4-1 6-3 7"/><path d="M6 11a6 6 0 0 1 12 0v3l-2 2v4H8v-4l-2-2z"/><path d="M9.5 13h.01M14.5 13h.01" stroke-width="3"/><path d="M10 20v-2M14 20v-2"/>',
    boss: '<path d="M7 7l2.5 2 2.5-4 2.5 4L17 7v3H7z"/><path d="M5 12l3 2h8l3-2-1 5-3 2.5h-4L8 17z"/><path d="M10 15h.01M14 15h.01" stroke-width="2.6"/>',
    pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/>',
  };
  const GNAME = { fight: 'Бой', treasure: 'Сокровище', rest: 'Отдых', event: 'Событие', elite: 'Элита', boss: 'Босс' };
  const GGO = { fight: 'В бой', treasure: 'Забрать сокровище', rest: 'Отдохнуть', event: 'Шагнуть в «?»', elite: 'Бой с элитой', boss: 'К хозяину Врат' };
  const GSUB = { fight: 'Поражение — смерть', treasure: 'Материалы, иногда вещь', rest: '+30% HP, +25% MP', event: 'Событие или засада', elite: 'Сильнее обычного. Поражение — смерть', boss: 'Только его смерть закрывает разлом' };
  // Оценка угрозы узла: 16 пробных боёв на копии сохранения с текущими HP/MP (ничего не меняет в игре).
  const threatCache = {};
  function threat(g, node) {
    if (!['fight', 'elite', 'boss'].includes(node.kind)) return '';
    const key = g.id + ':' + node.id + ':' + Math.round(save.hero.hp) + ':' + Math.round(save.hero.mp) + ':' + save.hero.level;
    if (threatCache[key] !== undefined) return threatCache[key];
    let won = 0; const ids = G.gates.nodeEnemies(save, data, g, node.id);
    for (let k = 0; k < 16; k++) {
      const c = JSON.parse(JSON.stringify(save)); const st = G.combat.start(c, data, ids, { lethal: true, seed: 1000 + k * 7919 });
      for (let n = 0; n < 300 && !st.over; n++) { const tgt = st.enemies.find((id) => st.units[id].hp > 0 && !st.units[id].gone); if (!tgt) break; G.combat.act(st, data, { type: 'attack', target: tgt }); }
      if (st.result === 'won') won++;
    }
    const p = won / 16;
    return (threatCache[key] = p >= 0.9 ? 'Угроза: низкая' : p >= 0.6 ? 'Угроза: средняя' : p >= 0.25 ? 'Угроза: высокая' : 'Угроза: смертельная');
  }
  function gatemap() {
    const R = save.gateRun; if (!R) { navigate('day'); return; }
    const g = G.gates.byId(save, R.id), M = G.gates.map(save, g), hh = save.hero, hpMax = G.system.maxHp(hh), mpMax = G.system.mpCap(hh);
    const opts = G.gates.options(save, g), avail = new Set(opts.map((n) => n.id));
    if (UI.gsel !== undefined && !avail.has(UI.gsel)) UI.gsel = undefined;
    if (UI.gsel === undefined && opts.length === 1) UI.gsel = opts[0].id;
    page('gatemap', 'scr-gmap', 'Врата');
    // геометрия: вход внизу, босс наверху, три дорожки
    const L = Math.max(...M.nodes.map((n) => n.layer)), W = 340, ROW = 92, H = (L + 2) * ROW + 30;
    const X = (lane) => [62, 170, 278][lane], Y = (layer) => H - 52 - (layer + 1) * ROW, EY = H - 52;
    const trail = M.trail || [], walked = new Set(), prev = [null].concat(trail);
    trail.forEach((id, i) => walked.add((prev[i] === null ? 'e' : prev[i]) + '>' + id));
    const curve = (x1, y1, x2, y2) => 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (y1 + y2) / 2 + ',' + x2 + ' ' + (y1 + y2) / 2 + ',' + x2 + ' ' + y2;
    let paths = '', under = '';
    const edge = (key, x1, y1, x2, y2) => { const d = curve(x1, y1, x2, y2); under += '<path d="' + d + '"/>'; paths += '<path class="' + (walked.has(key) ? 'is-walked' : '') + '" d="' + d + '"/>'; };
    M.nodes.filter((n) => n.layer === 0).forEach((n) => edge('e>' + n.id, X(1), EY, X(n.lane), Y(0)));
    M.nodes.forEach((n) => n.next.forEach((id) => { const m = M.nodes[id]; edge(n.id + '>' + id, X(n.lane), Y(n.layer), X(m.lane), Y(m.layer)); }));
    const icon = (k, s) => '<g transform="translate(' + (-s / 2) + ',' + (-s / 2) + ') scale(' + s / 24 + ')" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + GSVG[k] + '</g>';
    const hex = (r) => [0, 1, 2, 3, 4, 5].map((i) => { const a = Math.PI / 3 * i - Math.PI / 2; return (r * Math.cos(a)).toFixed(1) + ',' + (r * Math.sin(a)).toFixed(1); }).join(' ');
    let nodes = '';
    for (const n of M.nodes) {
      const boss = n.kind === 'boss', s = boss ? 66 : 44, k = n.kind === 'event' && n.reveal === 'fight' && n.state === 'done' ? 'fight' : n.kind;
      const cls = ['gn', 'gn-' + n.kind, n.state === 'done' ? 'is-done' : avail.has(n.id) ? 'is-avail' : trail.length && n.layer <= (M.nodes[M.pos] || {}).layer ? 'is-skip' : '', UI.gsel === n.id ? 'is-sel' : ''].join(' ');
      nodes += '<g class="' + cls + '" data-id="' + n.id + '" transform="translate(' + X(n.lane) + ',' + Y(n.layer) + ')"' + (avail.has(n.id) ? ' role="button" tabindex="0" aria-label="' + GNAME[n.kind] + '"' : '') + '>' +
        (boss ? '<g><polygon class="gn-sh" transform="translate(6,6)" points="' + hex(s * 0.62) + '"/><polygon class="gn-bg" points="' + hex(s * 0.62) + '"/></g>'   // босс — шестигранник
          : '<g transform="rotate(-6)"><rect class="gn-sh" x="' + (-s / 2 + 5) + '" y="' + (-s / 2 + 5) + '" width="' + s + '" height="' + s + '"/><rect class="gn-bg" x="' + (-s / 2) + '" y="' + (-s / 2) + '" width="' + s + '" height="' + s + '"/></g>') +
        '<image class="gn-img" href="art/gate/' + k + '.webp" x="' + (-(boss ? 92 : 64) / 2 + (boss ? 4 : 3)) + '" y="' + (-(boss ? 92 : 64) / 2 - (boss ? 10 : 7)) + '" width="' + (boss ? 92 : 64) + '" height="' + (boss ? 92 : 64) + '"/>' + (boss ? '<text class="gn-lbl" y="' + (s / 2 + 22) + '">Босс</text>' : '') + '</g>';
    }
    const here = M.pos === null ? [X(1), EY] : [X(M.nodes[M.pos].lane), Y(M.nodes[M.pos].layer)];
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Карта Врат">' +
      '<g class="gm-under">' + under + '</g><g class="gm-path">' + paths + '</g>' +
      '<g class="gm-entry" transform="translate(' + X(1) + ',' + EY + ')"><circle r="9"/><text y="34">Вход</text></g>' + nodes +
      '<g class="gm-here" transform="translate(' + (here[0] + (M.pos === null ? 0 : 30)) + ',' + (here[1] - (M.pos === null ? 30 : 30)) + ')">' + icon('pin', 26) + '</g></svg>';
    add(h('div', { class: 'gm-head' }, h('b', { class: 'gm-rank' }, g.est + '-подземелье'), h('span', { class: 'gm-name' }, G.gates.title(g))));
    const box = h('div', { class: 'gm-map', html: svg });
    box.querySelectorAll('g.is-avail').forEach((el) => { const pickIt = () => { UI.gsel = +el.dataset.id; gatemap(); }; el.addEventListener('click', pickIt); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickIt(); } }); });
    add(box, h('div', { class: 'gm-legend' }, ['fight', 'treasure', 'rest', 'event', 'elite', 'boss'].map((k) => h('span', null, h('img', { src: 'art/gate/' + k + '.webp', alt: '' }), GNAME[k]))));
    const sel = UI.gsel !== undefined ? M.nodes[UI.gsel] : null;
    add(h('div', { class: 'stack' },
      sel ? tile(GGO[sel.kind], () => run(() => { const id = UI.gsel; UI.gsel = undefined; const r = G.day.gateStep(save, data, id); if (r === 'battle') { UI.target = null; UI.menu = null; navigate('battle'); } else if (r.scene) playScene(r.scene, { gate: true }); else message(r.text, () => navigate('gatemap')); }), { variant: sel.kind === 'boss' || sel.kind === 'elite' ? 'red' : 'blue', icon: sel.kind === 'rest' ? 'heart' : sel.kind === 'treasure' ? 'bag' : 'sword', sub: [threat(g, sel), GSUB[sel.kind]].filter(Boolean).join(' · '), shape: 's5', cls: 'tile--hero' })
        : h('p', { class: 'muted', style: 'text-align:center;margin:0' }, 'Выбери, куда идти: отмеченные узлы на карте.'),
      tile('Выйти из Врат', () => run(() => { G.day.gateLeave(save, data); UI.gsel = undefined; gateOver('Сиу выходит из разлома. Врата остаются открытыми — пройденное запомнится, пока не приедет рейд Ассоциации.'); }), { icon: 'run', sub: 'Заход займёт слот, разлом не закроется', shape: 's2' })));
  }
  function doAction(id, arg, skipPlot) {
    const trig = !skipPlot && G.plot.onActivity(save, id, arg);
    if (trig && !G.day.can(save, id, data)) { playScene(trig.id, { doing: id, then: { id, arg } }); return; }
    const r = G.day.action(save, data, id, arg);
    if (r === 'battle') { UI.target = null; UI.menu = null; navigate('battle'); }
    else if (r === 'gatemap') navigate('gatemap');
    else if (r === 'scene') { scene = personScene(arg); line = 0; navigate('scene'); }
    else after(r);
  }
  function personScene(id) { return { title: 'Встреча', location: save.hero.location, lines: [{ speaker: id, text: '[Встреча-заглушка. Здесь будет разговор.]' }], choices: [{ label: 'Завершить встречу' }] }; }
  function gateView() {
    page('gate', '', 'Врата');
    const list = G.gates.known(save), free = !G.day.can(save, 'gate', data);
    add(deco('dots dots--fade-r', 'right:0;top:0;width:60%;height:300px'), h('h1', { class: 'band band--xl' }, 'Врата'),
      h('div', { class: 'frame' }, h('p', { style: 'margin:0' }, list.length ? 'Открытые разломы, о которых ты знаешь. Вход без боевого допуска незаконен.' : 'Открытых врат рядом нет. Оповещения приходят в «Понхва».'),
        h('p', { style: 'margin:8px 0 0;color:#ff6b6b;font-weight:700' }, 'Поражение в бою — смерть.')),
      h('div', { class: 'stack' },
        list.map((g, k) => tile('Врата · ' + placeName(g.place), () => doAction('gate', g.id), { variant: 'blue', icon: 'gate', sub: 'Оценка: ранг ' + g.est + ' · ' + G.gates.label(save, g), shape: 's' + (1 + k % 4), cls: 'tile--hero', disabled: !free })),
        tile('Открыть «Понхва»', ponhva, { icon: 'radar', sub: 'Оповещения о разломах', shape: 's3' }),
        tile('Проверка конфликта с человеком', humanWarning, { variant: 'ink', icon: 'person', sub: 'Тест: выходы до боя', shape: 's3', cls: 'tile--frame' }),
        tile('Уйти', () => navigate('day'), { icon: 'back', sub: 'Вернуться к делам', shape: 's2' })));
  }
  // Работа: выбрать работодателя. Смена занимает слот, деньги — сразу в Банк.
  function jobsView(place) {
    page('jobs', '', 'Работа');
    const L = G.day.jobs(save, data).filter((x) => !place || x.job.place === place);
    add(h('h1', { class: 'band band--l' }, 'Работа'), h('p', { class: 'muted' }, 'Смена занимает ' + G.day.SLOTS[save.day.slot].toLowerCase() + '. Оплата — сразу в Банк.'));
    if (!L.length) add(h('p', { class: 'note' }, icon('info'), 'Здесь не нанимают.'));
    add(h('div', { class: 'stack' }, L.map((x, k) => tile(x.job.employer + ' · ' + x.job.name, () => { if (x.why) return; UI.mg = { job: x.job.id, place }; navigate('minigame'); }, { icon: 'briefcase', sub: x.why || money(x.job.pay) + ' за смену · ' + placeName(x.job.place) + (x.job.desc ? ' · ' + x.job.desc : ''), disabled: !!x.why || !!G.day.can(save, 'work', data), variant: !x.why ? 'blue' : null, shape: 's' + (1 + k % 4) }))),
      back(() => (place ? placeView(place) : navigate('day'))));
  }
  // ---------- Итоги главы (03.11.2026) ----------
  const CH1 = {
    c1_ares: { t: 'Ёнмин и Старший', v: { free: 'Ответил Старшему встречным компроматом', partial: 'Оставил Ёнмина на разгрузке', war: 'Отверг шантаж и ушёл', chain: 'Открытый бой со Старшим проигран' } },
    c1_bres: { t: 'Пятница', v: { saved: 'Бой с Тэсоком — победа', partial: 'Спустился в подвал сам', heavy: 'Бой с Тэсоком проигран', ydead: 'Бой с Тэсоком проигран — Ёнмин не выжил' } },
    c1_cres: { t: 'Встреча с Бёнхуном', v: { pact: 'Пакт о ненападении', sold: 'Сдал Старшего и бокс №14', cold: 'Оборвал разговор и ушёл', threat: 'Отказался и ушёл', watched: 'Не пошёл на встречу' } },
    c1_eres: { t: 'Минхо', v: { cleared: 'Не дал Минхо уйти', contained: 'Минхо остановлен', fled: 'Минхо ушёл', leak: 'Утечка не остановлена' } },
  };
  function chapterStats() {
    const h0 = save.hero, V = G.plot.state(save).vars, L = h0.ledger || [];
    const earned = L.filter((x) => x.amount > 0 && x.kind !== 'start').reduce((a, x) => a + x.amount, 0), spent = -L.filter((x) => x.amount < 0).reduce((a, x) => a + x.amount, 0);
    const kills = Object.values(h0.kills || {}).reduce((a, n) => a + n, 0), Q = G.quests.state(save).log;
    const bc = G.bestiary ? Object.values(G.bestiary.counts(save, data)).reduce((a, c) => a + c.known, 0) : 0;
    return { days: save.day.n, money: h0.money || 0, earned, spent, level: h0.level || 0, rank: G.hero.powerRank(save), stats: h0.stats || {}, kills, species: bc,
      gates: V.gates_closed_by_siu || 0, stopped: V.breaches_stopped || 0, ignored: V.breaches_ignored || 0, qDone: Q.filter((q) => q.result === 'done').length, qFail: Q.filter((q) => q.result === 'failed').length,
      ach: G.achievements ? G.achievements.count(save).n : 0, heat: G.heat ? G.heat.mood(save) : '', crafted: V.forge_crafted || 0, rep: G.forge ? G.forge.tier(save).name : '' };
  }
  function chapterView() {
    page('chapterView', 'scr-night', 'Итоги главы');
    const s = chapterStats(), V = G.plot.state(save).vars, cell = (k, v, sub) => h('div', { class: 'ch-cell' }, h('b', null, v), h('span', null, k), sub ? h('small', null, sub) : null);
    add(h('p', { class: 'label muted', style: 'margin:0' }, 'Глава 1 · завершена'), h('h1', { class: 'band band--xl' }, 'Итоги'),
      h('p', { class: 'muted' }, 'С 1 сентября по ' + dateParts().full + ' · ' + s.days + ' дн.'),
      h('div', { class: 'ch-grid' },
        cell('на счёте', money(s.money), 'заработано ' + money(s.earned) + ' · потрачено ' + money(s.spent)),
        cell('уровень', String(s.level), 'ранг Системы ' + s.rank),
        cell('тварей убито', String(s.kills), 'видов в бестиарии: ' + s.species),
        cell('врат закрыто', String(s.gates), 'прорывов остановлено ' + s.stopped + (s.ignored ? ' · пропущено ' + s.ignored : '')),
        cell('заданий Системы', s.qDone + ' / ' + (s.qDone + s.qFail), 'провалено ' + s.qFail),
        cell('достижений', String(s.ach), s.crafted ? 'выковано у Кихо: ' + s.crafted : 'Кихо: ' + s.rep)),
      h('section', { class: 'frame', style: 'margin:14px 0' }, h('h2', { class: 'h-sec', style: 'margin:0 0 6px' }, 'Характеристики'),
        h('p', { style: 'margin:0;font-weight:700' }, ['str', 'agi', 'vit', 'per', 'mag'].map((k) => G.gear.STAT_NAME[k] + ' ' + (s.stats[k] || 0)).join(' · '))),
      h('h2', { class: 'h-sec' }, 'Решения главы'),
      h('div', { class: 'stack' }, Object.entries(CH1).filter(([k]) => V[k] && CH1[k].v[V[k]]).map(([k, c]) => h('section', { class: 'plate' }, h('span', { class: 'label' }, c.t), h('p', { style: 'margin:4px 0 0;font-weight:700' }, c.v[V[k]])))),
      s.heat ? h('p', { class: 'note' }, icon('radar'), 'Ассоциация: ' + s.heat.toLowerCase() + '.') : null,
      tile('Дальше', () => { const f = UI.chapterNext; UI.chapterNext = null; if (f) f(); else navigate('system'); }, { variant: 'blue', icon: 'right', shape: 's5' }));
  }
  // ---------- Мини-игры на сменах (03.11.2026) ----------
  // Касса («Боми 24»), сортировка (рынок, терминал, листовки), память заказов (PC-бан). ~25 секунд.
  // Итог: ≥80% — премия +25%, 40–80% — обычная оплата, <40% — штраф −25%. «Отработать без игры» — обычная оплата.
  const MG_SORT = {
    market: { title: 'Разгрузка на рынке', hint: 'Раскладывай товар по лоткам', bins: ['Фрукты', 'Рыба', 'Хрупкое'], items: [['Яблоки', 0], ['Мандарины', 0], ['Груши', 0], ['Хурма', 0], ['Скумбрия', 1], ['Кальмары', 1], ['Минтай', 1], ['Креветки', 1], ['Яйца', 2], ['Банки соджу', 2], ['Стеклянные банки', 2], ['Лампочки', 2]] },
    s3: { title: 'Терминал С-3', hint: 'Сортируй посылки по линиям', bins: ['Хрупкое', 'Тяжёлое', 'Срочное'], items: [['Посуда', 0], ['Монитор', 0], ['Зеркало', 0], ['Гантели', 1], ['Цемент', 1], ['Шины', 1], ['Лекарства', 2], ['Документы', 2], ['Цветы', 2], ['Аквариум', 0], ['Станок', 1], ['Торт', 2]] },
    flyers: { title: 'Листовки у метро', hint: 'Кому дать листовку, а кого не трогать', bins: ['Дать', 'Не трогать'], items: [['Студентка с рюкзаком', 0], ['Парень в наушниках не спешит', 0], ['Бабушка с сумкой', 0], ['Офисный, смотрит по сторонам', 0], ['Курьер бегом', 1], ['Говорит по телефону', 1], ['Полицейский', 1], ['Тащит чемодан к поезду', 1], ['Школьники гурьбой', 0], ['Злой, отмахивается', 1]] },
  };
  const MG_OF = { bomi: 'cash', pc: 'memory', market: 'sort', s3: 'sort', flyers: 'sort' };
  function minigame() {
    const M = UI.mg; if (!M) { navigate('day'); return; }
    const job = (data.places.jobs || []).find((j) => j.id === M.job), kind = MG_OF[M.job] || 'sort';
    let x = ((save.seed >>> 0) ^ Math.imul(save.day.n * 4 + save.day.slot + 3, 0x9e3779b1)) >>> 0;
    const rnd = () => { x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return x / 4294967296; };
    const finish = (score) => {
      clearInterval(M.timer); const mul = score === null ? 1 : score >= 0.8 ? 1.25 : score >= 0.4 ? 1 : 0.75;
      save.workMul = mul; UI.mg = null;
      const pay = Math.round(job.pay * mul / 1000) * 1000;
      const txt = score === null ? 'Смена отработана как обычно.' : 'Результат: ' + Math.round(score * 100) + '%. ' + (mul > 1 ? 'Начальник доволен — премия +25%.' : mul < 1 ? 'Ошибок много — штраф −25%.' : 'Без замечаний.');
      run(() => { const d = G.day.action(save, data, 'work', M.job); message(txt + ' Начислено: ' + money(pay) + '.', () => notices(() => navigate('day'))); });
    };
    page('minigame', 'scr-mg', job.employer);
    const head = h('div', { class: 'mg-head' }, h('strong', null, job.employer), h('span', { class: 'mg-time' }, '25'));
    const box = h('div', { class: 'mg-box' });
    add(h('h1', { class: 'band band--l' }, kind === 'cash' ? 'Касса' : kind === 'memory' ? 'Заказы' : MG_SORT[M.job].title), head, box,
      h('button', { type: 'button', class: 'mini', style: 'margin-top:14px', onclick: () => finish(null) }, 'Отработать без игры'));
    let t = 25; const tEl = head.querySelector('.mg-time');
    clearInterval(M.timer); M.timer = setInterval(() => { t--; tEl.textContent = String(Math.max(0, t)); if (t <= 0) end(); }, 1000);
    let end = () => finish(0);
    if (kind === 'sort') {
      const S = MG_SORT[M.job], list = S.items.slice().sort(() => rnd() - 0.5), N = Math.min(10, list.length); let i = 0, ok = 0;
      end = () => finish(ok / N);
      const draw = () => { box.innerHTML = '';
        if (i >= N) return end();
        box.append(h('p', { class: 'muted' }, S.hint + ' · ' + (i + 1) + ' / ' + N), h('div', { class: 'mg-item' }, list[i][0]),
          h('div', { class: 'mg-bins' }, S.bins.map((b, k) => h('button', { type: 'button', class: 'mg-bin', onclick: () => { if (k === list[i][1]) ok++; else box.classList.add('mg-miss'); setTimeout(() => box.classList.remove('mg-miss'), 200); i++; draw(); } }, b)))); };
      draw();
    } else if (kind === 'cash') {
      const N = 5; let i = 0, ok = 0, given = 0, price = 0, paid = 0;
      end = () => finish(ok / N);
      const next = () => { price = (2 + Math.floor(rnd() * 90)) * 100; paid = price <= 5000 ? (rnd() < 0.5 ? 5000 : 10000) : price <= 10000 ? 10000 : 50000; given = 0; draw(); };
      const draw = () => { box.innerHTML = '';
        if (i >= N) return end();
        box.append(h('p', { class: 'muted' }, 'Покупатель ' + (i + 1) + ' / ' + N + ' · дай точную сдачу'),
          h('div', { class: 'mg-item' }, 'Покупка ' + money(price), h('small', null, 'дал ' + money(paid))),
          h('p', { class: 'mg-change' }, 'Сдача: ' + money(given)),
          h('div', { class: 'mg-bins mg-coins' }, [10000, 5000, 1000, 500, 100].map((v) => h('button', { type: 'button', class: 'mg-bin', onclick: () => { given += v; draw(); } }, v.toLocaleString('ru-RU')))),
          h('div', { class: 'mg-bins' }, h('button', { type: 'button', class: 'mg-bin', onclick: () => { given = 0; draw(); } }, 'Сброс'),
            h('button', { type: 'button', class: 'mg-bin mg-go', onclick: () => { if (given === paid - price) ok++; else box.classList.add('mg-miss'); i++; next(); } }, 'Отдать'))); };
      next();
    } else {
      const MENU = ['Рамен', 'Кола', 'Чипсы', 'Кофе', 'Токпокки', 'Сок', 'Энергетик', 'Кимпаб'], R = 4; let r = 0, ok = 0;
      end = () => finish(ok / R);
      const round = () => { box.innerHTML = '';
        if (r >= R) return end();
        const len = 3 + r, seq = Array.from({ length: len }, () => MENU[Math.floor(rnd() * MENU.length)]); let pos = 0;
        box.append(h('p', { class: 'muted' }, 'Заказ ' + (r + 1) + ' / ' + R + ' · запомни'), h('div', { class: 'mg-item mg-seq' }, seq.join(' → ')));
        setTimeout(() => { if (UI.mg !== M) return; box.innerHTML = '';
          const shown = h('p', { class: 'mg-change' }, '…');
          box.append(h('p', { class: 'muted' }, 'Повтори заказ по порядку'), shown,
            h('div', { class: 'mg-bins mg-menu' }, MENU.map((m) => h('button', { type: 'button', class: 'mg-bin', onclick: () => {
              if (m !== seq[pos]) { r++; box.classList.add('mg-miss'); setTimeout(() => { box.classList.remove('mg-miss'); round(); }, 250); return; }
              pos++; shown.textContent = seq.slice(0, pos).join(' → '); if (pos >= len) { ok++; r++; setTimeout(round, 250); } } }, m)))); }, 1400 + r * 400); };
      round();
    }
  }
  function humanWarning() {
    page('human', '', 'Риск смерти');
    const can = Object.values(save.relations).some((r) => r.trust >= 3), broke = save.hero.money < data.rules.day.bribe;
    add(h('h1', { class: 'band band--l band--red' }, 'Риск смерти'),
      h('div', { class: 'frame' }, h('p', { style: 'margin:0' }, 'Тестовый конфликт с человеком. Поражение в бою завершит прохождение. Выбери выход.')),
      h('div', { class: 'stack' },
        tile('Уйти', () => { G.day.escape(save, data, 'leave'); after(); }, { icon: 'run', sub: 'Без последствий', shape: 's1' }),
        tile('Откупиться', () => { G.day.escape(save, data, 'bribe'); after('Откуп проведён. Запись — в Банке.'); }, { icon: 'coins', sub: broke ? 'Не хватает денег' : 'Списание со счёта', disabled: broke, shape: 's2' }),
        can ? tile('Позвать на помощь', () => { G.day.escape(save, data, 'help'); after(); }, { icon: 'chat', sub: 'Связь 3+', shape: 's3' }) : null,
        tile('Вступить в бой', () => doAction('human'), { variant: 'red', icon: 'sword', sub: 'Смертельно опасно', shape: 's4' }),
        tile('Банк · условия откупа', () => { returnTo = humanWarning; navigate('bank'); }, { variant: 'ink', icon: 'coins', shape: 's5', cls: 'tile--frame' })),
      back(gateView));
  }
  const STAT_IC = { str: 'arm', agi: 'run', vit: 'shield', mag: 'spark', per: 'eye' };
  const STAT_HINT = { str: 'Физическая мощь', agi: 'Скорость и реакция', vit: 'Здоровье и защита', mag: 'Сила заклинаний', per: 'Внимательность' };
  const STAT_ORDER = ['str', 'agi', 'vit', 'mag', 'per'];
  function trainView() {
    page('train', '', 'Тренировка');
    add(h('h1', { class: 'band band--l' }, 'Тренировка'), h('p', { class: 'muted' }, 'Обычные тренировки растят характеристику до ' + G.system.HUMAN_CAP + ' — предела человека.'));
    const st = G.system.status(save);   // до пробуждения статуса Системы нет — названия берём из справочника
    add(h('div', { class: 'stack' }, STAT_ORDER.filter((k) => k !== 'mag').map((k) => {
      const s = (st ? st.stats : G.system.STATS).find((x) => x.id === k), capped = save.hero.stats[k] >= G.system.HUMAN_CAP;
      return h('div', { class: 'stat-row is-train' }, h('button', { type: 'button', class: 'stat-main', 'aria-label': s.name, disabled: capped, onclick: () => run(() => doAction('train', k)) },
        icon(STAT_IC[k]), h('span', null, h('strong', null, s.name), h('small', null, capped ? 'Предел человека' : STAT_HINT[k])), h('b', null, save.hero.stats[k])));
    })), back(() => navigate('day')));
  }
  function peopleView() {
    page('people', '', 'Человек');
    add(h('h1', { class: 'band band--l' }, 'Человек'), h('p', { class: 'muted' }, 'С кем провести время? Встреча даёт +1 к связи.'));
    add(h('div', { class: 'stack' }, data.dayPeople.map((p, i) => {
      const r = save.relations[p.id] || {};
      return tile(personName(p.id), () => doAction('person', p.id), { icon: 'person', sub: r.met ? 'Связь: ' + (r.trust || 0) : 'Ещё не знакомы', shape: 's' + (1 + i % 4) });
    })), back(() => navigate('day')));
  }

  // ---------- сцена ----------
  // Сюжет по порядку: сцена или переписка (чат открывается как экран переписки).
  function startStory(sc, ctx) { if (sc.mode === 'chat') { G.plot.start(save, sc.id, Object.assign({ chat: chatWho(sc) }, ctx)); scene = null; navigate('scene'); } else playScene(sc.id, ctx); }
  function playScene(id, ctx) { G.plot.start(save, id, ctx); scene = null; navigate('scene'); }
  // Сцена закончилась: куда дальше — по тому, откуда её запустили.
  function sceneEnded(v) {
    const c = v.ctx || {}, sc = G.plot.scene(v.id) || {};
    if (!v.bad && G.plot.state(save).vars.c1_done && !(save.chapters || {}).c1) { (save.chapters || (save.chapters = {})).c1 = save.clock; UI.chapterNext = () => sceneEnded(v); navigate('chapterView'); return; }   // итоги главы 1 — один раз
    if (v.bad) { const E = save.hero.ending || {}; G.day.die(save); save.hero.ending = E; save.hero.death_cause = 'Концовка: ' + (E.title || v.bad); render(); return; }
    if (c.morning) { const nx = G.plot.storyNext(save); if (nx) { startStory(nx, { morning: true }); return; } G.day.finishStory(save, data); after(); return; }
    if ((c.slotAuto || c.back) && c.chat) { after(); return; }   // переписку открыли из напоминания — назад к делам дня
    if (c.offer) { G.day.finishScene(save, data, sc.title); after(); return; }
    if (c.then) { doAction(c.then.id, c.then.arg, true); return; }
    if (c.chat) { chatThread(c.chat); return; }
    if (c.gate) { if (save.gateRun) navigate('gatemap'); else after(); return; }
    if (c.heat) { delete save.inspector; after(); return; }
    if (c.forge) { navigate('forgeView'); return; }
    if (c.shop) { UI.bought = null; if (G.plot.state(save).vars.shop_go) navigate('shopView'); else placeView('nowon:hunter_shop'); return; }   // разговор у входа в Лавку   // событие «?» во Вратах — назад к карте
    after(c.msg);
  }
  // Кто действует в ремарке: первое упомянутое в тексте имя из состава сцены (Ёнмин, Ёнмина, Ёнмину…). Сиу — тоже.
  function actorOf(text, sc) {
    const cast = (G.data.story && G.data.story.cast) || {}, ids = ['siu'].concat(sc.cast || []);
    let best = null, at = Infinity;
    for (const id of ids) {
      const c = cast[id] || {}, names = [id === 'siu' ? 'Сиу' : null, c.short, (c.name || '').split(' ').pop()].filter((x) => x && x.length > 2);
      for (const nm of names) {
        const m = new RegExp('(^|[^А-Яа-яЁё])' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(а|у|ом|е|ы|ой)?(?![А-Яа-яЁё])').exec(text);
        if (m && m.index < at) { at = m.index; best = id; }
      }
    }
    return best;
  }
  // Делит текст на куски, каждый — не длиннее lines строк в этом окне (меряет по-настоящему, по вёрстке). Режет по предложениям, если можно.
  function paginate(pEl, text, lines) {
    const lh = parseFloat(getComputedStyle(pEl).lineHeight) || 24, max = lh * lines + 2;
    const fits = (t) => { pEl.textContent = t; return pEl.offsetHeight <= max; };
    if (!pEl.offsetWidth || fits(text)) { pEl.textContent = text; return [text]; }
    const words = text.split(/\s+/), parts = []; let cur = [];
    for (const w of words) {
      const tryT = cur.concat(w).join(' ') + ' …';
      if (!cur.length || fits(tryT)) { cur.push(w); continue; }
      // перелом: ищем конец предложения во второй половине куска
      let cut = -1; for (let k = cur.length - 1; k >= Math.ceil(cur.length / 2); k--) if (/[.!?…»]$/.test(cur[k])) { cut = k; break; }
      if (cut >= 0) { parts.push(cur.slice(0, cut + 1).join(' ')); cur = cur.slice(cut + 1); } else { parts.push(cur.join(' ')); cur = []; }
      cur.push(w);
    }
    if (cur.length) parts.push(cur.join(' '));
    // хвост из пары слов — перераспределить два последних куска пополам (по словам), чтобы не было экрана с одним «трат.»
    if (parts.length > 1 && parts[parts.length - 1].length < parts[parts.length - 2].length * 0.4) {
      const ws = (parts[parts.length - 2] + ' ' + parts[parts.length - 1]).split(' '), half = ws.join(' ').length / 2;
      let k = 1, acc = 0; while (k < ws.length - 1 && acc + ws[k - 1].length + 1 < half) { acc += ws[k - 1].length + 1; k++; }
      for (let j = k; j < ws.length - 1; j++) if (/[.!?…»,]$/.test(ws[j - 1]) && j - k < 4) { k = j; break; }
      const a = ws.slice(0, k).join(' '), b = ws.slice(k).join(' ');
      if (fits(a + ' …') && fits(b)) parts.splice(parts.length - 2, 2, a, b);
    }
    pEl.textContent = text;
    return parts;
  }
  function sceneView() {
    if (save.pending) return personView();
    const v = G.plot.view(save);
    if (!v) { navigate('day'); return; }
    if (v.kind === 'end') { sceneEnded(v); return; }
    if (v.kind === 'draw') return draw(true);
    if (v.kind === 'battle') { G.day.startPlotBattle(save, data, v.def); UI.target = null; UI.menu = null; navigate('battle'); return; }
    const run = G.plot.state(save).run, sc = G.plot.scene(run.id);
    if (run.ctx && run.ctx.chat && !v.cut) return chatScene(v, run, sc);
    const cut = v.cut;
    page('scene', 'scr-scene' + (cut ? ' is-cut' : ''), sc.title || 'Сцена');
    const bg = G.art.loc((!cut && run.bg) || (cut && cut.place) || (cut ? null : sc.place) || (cut ? '' : save.hero.location));
    add(h('div', { class: 'deco scene-bg', style: bg ? 'background-image:url("' + bg + '")' : null }));
    const st = v.kind === 'line' ? v.step : null, who = st && st.say;
    const cast = (G.data.story && G.data.story.cast) || {};
    // Портрет — только того, кто говорит: Сиу смотрит направо, остальные — налево. Ремарка — без портрета.
    const siuTalks = who === 'siu' || (st && st.think !== undefined);
    // Ремарка: тот, кто в ней действует (первое упомянутое имя), стоит на экране в тени — видно, кто что делает.
    const actor = st && st.n !== undefined && !cut ? actorOf(st.n, sc) : null;
    const heroLike = siuTalks || actor === 'siu', npcId = siuTalks ? null : who && who !== 'narrator' ? who : actor && actor !== 'siu' ? actor : null;
    const por = heroLike ? G.art.hero(G.art.EMO_NAMES[G.art.emo({ emo: st.emo, text: st.t || st.think || '' })])
      : npcId ? G.art.npc((cast[npcId] || {}).art || npcId, save, G.art.emo({ emo: st.emo, text: st.t || '' })) : null;
    if (por) add(h('img', { class: 'deco scene-por ' + (heroLike ? 'hero' : 'npc') + (!heroLike && G.art.facesRight(por) ? ' flip' : '') + (actor ? ' dim' : '') + (npcId === 'serin' ? ' serin' : ''), src: por, alt: '' }));
    if (v.kind === 'choice') { const hs = G.art.hero('neutral'); if (hs) add(h('img', { class: 'deco scene-por hero dim', src: hs, alt: '' })); }   // выбор — за Сиу: он на экране в тени
    if (cut) add(h('span', { class: 'tag tag--red cut-banner' }, cut.t + (cut.where ? ' · ' + cut.where : '')));
    else add(h('span', { class: 'tag scene-meta' }, [dateParts().full, sc.time || G.day.SLOTS[save.day.slot], sc.title].filter(Boolean).join(' · ')));
    const ui = h('div', { class: 'scene-ui' });
    add(h('div', { class: 'grow' }), ui);
    if (v.kind === 'line') {
      const next = () => { const nv = G.plot.advance(save); if (nv && nv.kind === 'end') sceneEnded(nv); else render(); };
      let box;
      if (st.sys !== undefined) box = h('div', { class: 'frame dialogue is-sys' }, [].concat(st.sys).map((x) => h('p', null, x)));
      else if (st.think !== undefined) box = h('div', { class: 'frame dialogue is-thought' }, h('strong', null, G.plot.name(save, 'siu') + ' · мысли'), h('p', null, '«' + st.think.replace(/^«|»$/g, '') + '»'));
      else if (st.n !== undefined) box = h('div', { class: 'frame dialogue is-narr' }, h('p', null, st.n));
      else if (st.msg !== undefined) box = h('div', { class: 'frame dialogue is-msg' }, h('strong', null, '✉ ' + G.plot.name(save, st.from || 'narrator')), h('p', null, st.msg));
      else {
        ui.append(h('div', { class: 'nameplate' }, h('span', { class: 'nameplate-name' }, G.plot.name(save, who)), st.how ? h('small', { class: 'nameplate-how' }, '(' + st.how + ')') : null));
        box = h('div', { class: 'frame dialogue' }, h('p', null, st.t));
      }
      box.onclick = () => turn(); box.style.cursor = 'pointer'; ui.append(box);
      // Длинная реплика — по три строки за раз: «Дальше» листает её, потом переходит к следующему шагу.
      const pEl = box.querySelector('p:last-of-type'), key = run.id + '|' + (st.t || st.n || st.think || st.msg || '').slice(0, 60);
      if (!UI.pages || UI.pages.key !== key) UI.pages = { key, parts: null, i: 0 };
      if (pEl && !UI.pages.parts) UI.pages.parts = paginate(pEl, pEl.textContent, 3);
      const P = UI.pages;
      if (pEl && P.parts && P.parts.length > 1) pEl.textContent = P.parts[P.i] + (P.i < P.parts.length - 1 ? ' …' : '');
      const turn = () => { if (P.parts && P.i < P.parts.length - 1) { P.i++; render(); } else { UI.pages = null; next(); } };
      ui.append(tile('Дальше', turn, { variant: 'blue', shape: 's5', cls: 'next-btn' }));
      return;
    }
    // выбор
    if (v.title) ui.append(h('div', { class: 'nameplate is-choice' }, v.title));
    v.options.forEach((o, i) => ui.append(tile(o.label, () => { const nv = G.plot.pick(save, o.k); if (nv && nv.kind === 'end') sceneEnded(nv); else render(); }, { shape: 's' + (1 + i % 4), cls: 'choice', disabled: !o.ok, sub: !o.ok ? o.hint : null })));
  }
  // Встреча с человеком (дело «Человек»): пока заглушка до системы связей.
  function personView() {
    if (!scene) scene = personScene(save.pending.npc);
    page('scene', 'scr-scene', 'Встреча');
    const l = scene.lines[0], C = (G.data.story && G.data.story.cast) || {}, por = G.art.npc((C[l.speaker] || {}).art || l.speaker, save, 0);
    if (por) add(h('img', { class: 'deco scene-por', src: por, alt: '' }));
    const ui = h('div', { class: 'scene-ui' });
    add(h('div', { class: 'grow' }), ui);
    ui.append(h('div', { class: 'nameplate' }, personName(l.speaker)), h('div', { class: 'frame dialogue' }, h('p', null, l.text)),
      tile('Завершить встречу', () => { G.day.finishPerson(save, data); scene = null; after('Связь +1'); }, { variant: 'blue', shape: 's5', cls: 'next-btn' }));
  }

  // ---------- итог дня ----------
  function summary() {
    page('night', 'scr-night', 'Итог дня');
    const h0 = save.hero, st = save.day.start || G.day.snapshot(h0, save);
    const trust = Object.values(save.relations || {}).reduce((a, r) => a + (r.trust || 0), 0);
    const dMoney = (h0.money || 0) - st.money, dStudy = ((h0.school || {}).progress || 0) - st.study, dTrust = trust - st.trust;
    const ENTRY = {
      story: (u) => ['book', 'Сюжетная сцена', 'Утро прошло по сюжету.'],
      train: (u) => ['dumbbell', [h('em', null, '+' + ((u.meta || {}).n || 0) + ' '), (G.system.STATS.find((s) => s.id === (u.meta || {}).stat) || { name: 'Тренировка' }).name], (u.meta || {}).n ? 'Тренировка дала результат.' : 'Предел человека: тело больше не растёт само.'],
      work: (u) => ['coins', ['Банк: ', h('em', null, '+' + money((u.meta || {}).money || 0))], 'Подработка принесла доход.'],
      study: () => ['book', [h('em', null, '+1 '), 'Знания'], 'Занятие в школе.'],
      rest: () => ['moon', 'Отдых', 'Здоровье и мана восстановлены.'],
      person: (u) => ['chat', [h('em', null, personName((u.meta || {}).npc)), ': связь +1'], 'Провели время вместе.'],
      gate: (u) => ['gate', ['Врата: ', h('em', null, u.detail)], u.meta && u.meta.xp ? 'Опыт +' + u.meta.xp + '. Трофеи — в инвентаре.' : 'Бой окончен.'],
      human: (u) => ['person', ['Конфликт: ', h('em', null, u.detail)], 'Стычка с человеком.'],
      penalty: (u) => ['gate', ['Штрафная зона: ', h('em', null, u.detail)], (u.meta || {}).result === 'won' ? 'Штраф отработан.' : (u.meta || {}).result === 'lost' ? 'Система выбросила без сознания — «Выброшен из зоны» на 3 дня.' : 'Бегство — «Бегство из зоны» на 2 дня.'],
    };
    const used = save.day.used.filter((u) => u.activity !== 'story' || save.day.used.length === 1);
    add(h('header', { class: 'night-head' }, h('h1', { class: 'band' }, 'Итог', h('br'), 'дня'), h('span', { class: 'moon-ic' }, h('span', { class: 'ic', style: 'width:74px;height:74px', html: G.icons.svg('moon') })),
      h('span', { class: 'tag' }, 'Время', h('br'), 'отдохнуть')));
    const paper = h('section', { class: 'paper' }, h('h2', null, 'Сегодня...'),
      used.map((u) => { const [ic, head, text] = (ENTRY[u.activity] || (() => ['info', u.detail || u.activity, '']))(u); return h('div', { class: 'entry' }, icon(ic), h('div', null, h('strong', null, head), text ? h('p', null, text) : null)); }),
      h('div', { class: 'changes-h' }, 'Изменения'),
      h('div', { class: 'changes' }, [['book', 'Знания', dStudy, String], ['coins', 'Банк', dMoney, money], ['person', 'Связи', dTrust, String]].map(([ic, name, v, f]) =>
        h('div', { class: 'chg' }, v > 0 ? h('i', { class: 'up' }) : null, icon(ic), h('small', null, name), h('b', { class: v > 0 ? '' : v < 0 ? 'minus-v' : 'zero' }, v ? signed(v, f) : '—')))));
    const sg = G.day.sleepGain(h0, data);
    add(paper, h('p', { class: 'note' }, icon('heart'), 'HP ' + h0.hp + ' / ' + G.system.maxHp(h0) + ' · MP ' + Math.round(h0.mp) + ' / ' + G.system.maxMp(h0) + (sg.hp || sg.mp ? ' · сон: ' + [sg.hp ? '+' + sg.hp + ' HP' : '', sg.mp ? '+' + sg.mp + ' MP' : ''].filter(Boolean).join(', ') : '')),
      tile('Следующий день', () => { G.day.next(save, data); after(); }, { variant: 'red', arrow: false, cls: 'next-day' }));
  }

  // ---------- Система ----------
  function system() {
    page('system', 'scr-system', 'Система');
    if (!save.hero.awakened) {   // до пробуждения (по сюжету — вечер 17 сентября) Системы нет
      add(deco('dots dots--fade-r', 'right:0;top:0;width:60%;height:200px'), h('h1', { class: 'band band--xl' }, 'Система'),
        h('section', { class: 'frame sys-locked' }, h('p', null, '[ НЕТ ДОСТУПА ]'), h('small', null, 'Кан Сиу — обычный выпускник. Пока что.')),
        h('div', { class: 'grow' }), navbar('system'));
      return;
    }
    // Открыта из боя (или из другого окна) — «Назад» сверху и прилипает: возвращаться не нужно листать.
    if (save.battle || returnTo) { const b = back(() => { if (returnTo) { const fn = returnTo; returnTo = null; fn(); } else navigate('battle'); }); b.classList.add('back--top'); add(b); }
    const hh = save.hero, st = G.system.status(save), inBattle = !!save.battle, unit = inBattle ? save.battle.units.hero : null;
    const hp = unit ? Math.ceil(unit.hp) : st.hp, mp = unit ? Math.round(unit.mp) : Math.round(st.mp);
    add(deco('dots dots--fade-r', 'right:0;top:0;width:60%;height:200px'), h('h1', { class: 'band band--xl' }, 'Система'),
      h('div', { class: 'sys-head' },
        h('div', { class: 'plate hero-card' }, h('span', { class: 'nm' }, hh.name), h('small', null, 'Уровень · ' + G.hero.age(hh, save.clock) + ' лет'),
          h('div', { class: 'lvl' }, h('b', null, st.level), h('div', { class: 'bars' }, h('div', { class: 'bar bar--xp' }, h('i', { style: 'width:' + Math.min(100, 100 * st.xp / st.xpNext) + '%' })), h('small', null, 'Опыт ' + st.xp + ' / ' + st.xpNext)))),
        h('div', { class: 'rank-card', 'aria-label': 'Ранг Системы ' + G.hero.powerRank(save) }, h('small', null, 'Ранг Системы'), h('b', null, G.hero.powerRank(save)), h('i', { class: 'orb' }, 'По шару: ' + ((save.hero.orb || {}).rank || '—')))),
      h('div', { class: 'vitals' },
        h('div', { class: 'row' }, h('span', null, 'HP ' + hp + ' / ' + st.hpMax), h('div', { class: 'bar bar--hp' }, h('i', { style: 'width:' + Math.min(100, 100 * hp / st.hpMax) + '%' }))),
        h('div', { class: 'row' }, h('span', null, 'MP ' + mp + ' / ' + st.mpMax), h('div', { class: 'bar bar--mp' }, h('i', { style: 'width:' + (st.mpMax ? Math.min(100, 100 * mp / st.mpMax) : 0) + '%' })))),
      h('p', { class: 'points' }, 'Свободные очки: ', h('b', null, st.points)),
      (hh.debuffs || []).length ? h('section', { class: 'debuffs' }, h('strong', null, '[ ШТРАФЫ ]'), hh.debuffs.map((d) => h('p', null, d.text + ' · до утра ' + d.until.slice(8, 10) + '.' + d.until.slice(5, 7)))) : null,
      save.penalty_zone ? h('section', { class: 'debuffs' }, h('strong', null, '[ ШТРАФНАЯ ЗОНА ]'), h('p', null, 'Ожидает. Пока не пройдёшь — других дел нет.')) : null);
    add(h('div', { class: 'stack' }, STAT_ORDER.map((k) => {
      const s = st.stats.find((x) => x.id === k);
      return h('div', { class: 'stat-row' },
        h('div', { class: 'stat-main' }, icon(STAT_IC[k]), h('span', null, h('strong', null, s.name), h('small', null, STAT_HINT[k])), h('b', null, s.value, s.bonus ? h('em', { class: s.bonus < 0 ? 'neg' : null }, (s.bonus > 0 ? '+' : '−') + Math.abs(s.bonus)) : null)),
        h('button', { type: 'button', class: 'plus', 'aria-label': '+', title: 'Вложить очко: ' + s.name, disabled: st.points < 1, onclick: () => run(() => invest(k)) }, icon('plus')));
    })));
    const qs = inBattle ? [] : questList(), achN = G.achievements && G.achievements.count ? G.achievements.count(save) : null;
    add(h('hr', { class: 'rule' }), h('h2', { class: 'h-sec' }, 'События'),
      h('div', { class: 'stack' },
        tile(qs.length ? 'Новое задание' : 'Задания', questsView, { aria: 'Задания', variant: qs.length ? 'blue' : null, icon: 'list', sub: qs.length ? qs[0].title : 'Активного задания нет', shape: 's2' }),
        tile('Достижения', achievementsView, { icon: 'trophy', sub: achN && achN.n ? 'Открыто: ' + achN.n + ' · остальные скрыты' : 'Пока ни одного', shape: 's4' })));
    add(h('h2', { class: 'h-sec' }, 'Возможности'),
      h('div', { class: 'stack' },
        tile('Выбрать карту', draw, { aria: 'Выбрать карту · попыток ' + st.gacha, variant: st.gacha && !inBattle ? 'blue' : null, icon: 'cards', sub: 'Попыток: ' + st.gacha + (inBattle ? ' · не в бою' : ''), disabled: st.gacha < 1 || inBattle, shape: 's1' }),
        tile('Купить попытку карты', () => { result(G.cards.buyAttempt(save, data)); notices(() => navigate('system')); }, { icon: 'coins', sub: G.cards.attemptPrice(save, data) + ' валюты Системы · у тебя ' + ((hh.sys && hh.sys.coins) || 0), disabled: inBattle || ((hh.sys && hh.sys.coins) || 0) < G.cards.attemptPrice(save, data), shape: 's4' }),
        (save.chapters || {}).c1 ? tile('Итоги главы 1', () => { UI.chapterNext = null; navigate('chapterView'); }, { icon: 'trophy', sub: 'Деньги, бои, решения', shape: 's3' }) : null,
        tile('Мои карты', cardsView, { icon: 'list', sub: 'Набор способностей: ' + (hh.loadout || []).length + ' / ' + G.cards.maxActive(data), shape: 's2' })));
    if (!(inBattle || returnTo)) add(h('div', { class: 'grow' }), navbar('system'));
  }
  function questsView() {
    page('quests', '', 'Задания');
    add(h('h1', { class: 'band band--l' }, 'Задания'));
    const qs = questList(), log = G.quests.state(save).log.slice(-8).reverse();
    if (!qs.length) add(h('section', { class: 'frame' }, h('p', { style: 'margin:0;font-weight:700;font-size:17px' }, 'Активного задания нет.'),
      h('p', { class: 'muted', style: 'margin:6px 0 0' }, 'Система иногда выдаёт задание утром. Сюжетные задания приходят по ходу истории.')));
    for (const q of qs) add(h('section', { class: 'plate stack quest' }, h('span', { class: 'kind' }, (q.src === 'story' ? 'Сюжетное' : 'Задание Системы') + ' · ' + G.quests.dueText(save, q)),
      h('h2', { style: 'margin:0;font-size:18px;font-weight:800' }, q.title),
      h('p', { style: 'margin:0' }, G.quests.goalText(q)),
      h('div', { class: 'bar bar--xp' }, h('i', { style: 'width:' + (100 * q.progress / (q.goal.type === 'gate_fast' || q.goal.type === 'cond' ? 1 : q.goal.n || 1)) + '%' })),
      h('p', { style: 'margin:0;font-weight:700' }, 'Награда: опыт ' + (q.reward.xp || 0) + ' · валюта Системы ' + (q.reward.coins || 0)),
      h('p', { class: 'muted', style: 'margin:0' }, 'Не выполнишь — штрафа нет.')));
    if (log.length) add(h('h2', { class: 'h-sec' }, 'История'), h('section', { class: 'frame' }, log.map((l) => h('div', { class: 'listrow' }, h('span', { class: 't' }, h('strong', null, l.title), h('small', null, G.clock.format(l.at).date)), h('span', { class: 'amount ' + (l.result === 'done' ? 'plus-v' : 'minus-v') }, l.result === 'done' ? 'Выполнено' : 'Провалено')))));
    add(back(() => navigate(screen === 'system' ? 'system' : 'day')));
  }
  function achievementsView() {
    page('achievements', '', 'Достижения');
    const A = G.achievements, list = A && A.got ? A.got(save) : [], c0 = A ? A.count(save) : { n: 0, t: 0 };
    add(h('h1', { class: 'band band--l' }, 'Достижения'),
      h('div', { class: 'ach-head' }, h('b', null, String(c0.n)), h('span', null, 'открыто', h('small', null, 'Остальные скрыты — Система покажет их, когда заслужишь.'))));
    if (!list.length) add(h('section', { class: 'frame' }, h('p', { style: 'margin:0;font-weight:700' }, 'Пока ни одного.'), h('p', { class: 'muted', style: 'margin:6px 0 0' }, 'Каждое достижение — опыт и попытка выбора карты.')));
    add(h('div', { class: 'ach-list' }, list.map((a) => h('section', { class: 'ach-card' },
      h('span', { class: 'ach-medal r-' + a.r.toLowerCase(), 'aria-hidden': 'true' }, h('b', null, a.label.length > 3 ? '30' : a.label)),
      h('div', { class: 'ach-body' }, h('strong', null, a.name), h('p', null, a.hint[0].toUpperCase() + a.hint.slice(1)),
        h('small', null, G.clock.format(a.at).date + ' · +' + a.xp + ' EXP · +1 выбор карты')),
      ))),
      h('div', { class: 'ach-locked' }, Array.from({ length: Math.min(24, c0.t - c0.n) }, () => h('span', { class: 'ach-q', 'aria-hidden': 'true' }, '?')),
        h('p', { class: 'muted' }, 'Скрыто: ' + (c0.t - c0.n))),
      back(() => navigate('system')));
  }
  function invest(k) {
    const hh = save.hero, hp0 = G.system.maxHp(hh), mp0 = G.system.maxMp(hh);
    result(G.system.invest(save, k, 1));
    if (save.battle) { const u = save.battle.units.hero; u.stats[k]++; u.hp += G.system.maxHp(hh) - hp0; u.hpMax = G.system.maxHp(hh); u.mp += G.system.maxMp(hh) - mp0; u.mpMax = G.system.maxMp(hh); u.mpCap = G.system.mpCap(hh); u.rank = G.hero.powerRank(save); u.init = u.stats.agi + Math.floor(u.stats.per / 2); }
    notices(() => navigate('system'));
  }
  // inScene — первый выбор карты внутри сюжетной сцены: после выбора (или «Отложить») сцена продолжается.
  // ---------- Карты (переделано 03.11.2026): раскрытие карты с описанием, выбор подряд, удобное объединение ----------
  const KIND = (c) => c.kind === 'active' ? 'Активная' : 'Пассивная';
  const cardFacts = (c) => [c.kind === 'active' ? 'MP ' + (c.mp || 0) : 'действует всегда', c.cooldown ? 'перезарядка ' + c.cooldown + ' х.' : null, c.prep ? 'подготовка ' + c.prep + ' х.' : null, c.dur ? 'длится ' + c.dur + ' х.' : null, c.negative ? 'с изъяном' : null].filter(Boolean).join(' · ');
  // Большая карта: ранг, имя, вид, описание. anim — переворот при выдаче.
  function bigCard(c, anim) {
    return h('div', { class: 'bigcard r-' + String(c.rank).toLowerCase() + (anim ? ' is-reveal' : '') + (c.negative ? ' is-neg' : '') },
      h('div', { class: 'bc-face' }, h('span', { class: 'bc-rank' }, c.rank), h('strong', { class: 'bc-name' }, c.name), h('span', { class: 'bc-kind' }, KIND(c)),
        h('p', { class: 'bc-desc' }, c.desc || c.text || c.description || ''), h('small', { class: 'bc-facts' }, cardFacts(c))),
      h('i', { class: 'bc-shine', 'aria-hidden': 'true' }));
  }
  function draw(inScene) {
    result(G.cards.open(save, data));
    const done = inScene === true ? () => { G.plot.advance(save); notices(() => navigate('scene')); } : () => notices(() => navigate('system'));
    const left = (save.hero.sys || {}).gacha || 0;
    page('draw', '', 'Выбор карты');
    add(h('h1', { class: 'band band--l' }, 'Выбери карту'), h('p', { class: 'note' }, icon('info'), 'Время остановлено. 32 карты рубашкой вверх — открой одну.' + (left > 1 ? ' Попыток: ' + left + '.' : '')),
      h('div', { class: 'card-grid' }, save.hero.gacha_board.slots.map((_, i) => h('button', { type: 'button', onclick: () => run(() => {
        const r = result(G.cards.pick(save, data, i)); UI.reveal = { card: r.card, inScene: inScene === true }; navigate('reveal');
      }) }, String(i + 1).padStart(2, '0')))),
      inScene === true ? tile('Отложить выбор', () => { G.plot.advance(save); navigate('scene'); }, { icon: 'right', sub: 'Попытка останется в Системе', shape: 's3' }) : back(() => navigate('system')));
  }
  // Выпала карта: разворот с описанием; если попытки остались — сразу следующая.
  function reveal() {
    const R = UI.reveal; if (!R) { navigate('system'); return; }
    const left = (save.hero.sys || {}).gacha || 0, c = R.card;
    page('reveal', 'scr-reveal', c.name);
    const finish = () => { UI.reveal = null; if (R.inScene) { G.plot.advance(save); notices(() => navigate('scene')); } else notices(() => navigate('system')); };
    add(h('p', { class: 'label muted', style: 'margin:0 0 6px' }, 'Новая карта'), bigCard(c, true),
      h('div', { class: 'stack', style: 'margin-top:16px' },
        left > 0 && !R.inScene ? tile('Следующая карта', () => { UI.reveal = null; notices(() => draw()); }, { variant: 'blue', icon: 'cards', sub: 'Осталось попыток: ' + left, shape: 's5' }) : null,
        tile(R.inScene ? 'Дальше' : 'Готово', finish, { icon: 'right', sub: R.inScene ? 'Вернуться в сцену' : 'К Системе', shape: 's3' }),
        !R.inScene ? tile('Мои карты', () => { UI.reveal = null; notices(cardsView); }, { icon: 'list', shape: 's2' }) : null));
  }
  function cardsView() {
    page('cards', '', 'Мои карты');
    add(h('h1', { class: 'band band--l' }, 'Мои карты'), back(() => navigate('system')));
    const list = G.cards.owned(save, data), open = UI.cardOpen;
    if (!list.length) add(h('p', { class: 'note' }, icon('info'), 'Карт пока нет. Попытки выбора — в Системе.'));
    const st = save.hero.sys || {};
    if (st.gacha) add(tile('Выбрать карту', () => draw(), { variant: 'blue', icon: 'cards', sub: 'Попыток: ' + st.gacha, disabled: !!save.battle, shape: 's5' }));
    if (G.cards.canFuse(save)) add(tile('Объединение', fusion, { icon: 'cards', sub: 'Сжечь карты ранга → карта ранга выше', disabled: !!save.battle, shape: 's4' }));
    for (const [title, kind] of [['Активные', 'active'], ['Пассивные', 'passive']]) {
      const L = list.filter((c) => c.kind === kind); if (!L.length) continue;
      add(h('h2', { class: 'h-sec' }, title, kind === 'active' ? h('span', { class: 'label muted' }, 'в наборе ' + (save.hero.loadout || []).length + ' / ' + G.cards.maxActive(data)) : null));
      add(h('div', { class: 'cl' }, L.map((c) => { const isOpen = open === c.id;
        return h('div', { class: 'cl-item' + (isOpen ? ' is-open' : '') },
          h('button', { type: 'button', class: 'cl-row', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { UI.cardOpen = isOpen ? null : c.id; cardsView(); } },
            h('span', { class: 'rank' }, c.rank), h('span', { class: 'cl-t' }, h('strong', null, c.name), h('small', null, cardFacts(c) + (c.equipped ? ' · в наборе' : ''))), h('span', { class: 'cl-chev' }, '▾')),
          isOpen ? h('div', { class: 'cl-body' }, bigCard(c, true),
            c.kind === 'active' ? h('button', { type: 'button', class: 'mini' + (c.equipped ? '' : ' mini--blue'), style: 'margin-top:10px', disabled: !!save.battle, onclick: () => run(() => { result(G.cards.toggle(save, data, c.id)); cardsView(); }) }, c.equipped ? 'Убрать из набора' : 'В набор') : null) : null); })));
    }
  }
  // Объединение: тапом отметить карты ранга (нужно ровно N), кнопка «подобрать» отмечает сама.
  function fusion() {
    page('fusion', '', 'Объединение');
    add(h('h1', { class: 'band band--l' }, 'Объединение'), back(cardsView), h('p', { class: 'muted' }, 'Отметь карты одного ранга — они сгорят, и выпадет новая карта рангом выше. Карта объединения не тратится.'));
    const sel = UI.fuseSel || (UI.fuseSel = {});
    let any = false;
    for (const rank of G.cards.RANKS.slice(0, -1)) {
      const own = G.cards.owned(save, data).filter((c) => c.rank === rank && c.id !== 'fusion'), cost = G.cards.fusionCost(data, rank);
      if (!own.length || !cost) continue; any = true;
      const S = sel[rank] || (sel[rank] = {}), n = Object.keys(S).filter((k) => S[k]).length, next = G.cards.RANKS[G.cards.RANKS.indexOf(rank) + 1];
      add(h('section', { class: 'frame frame--ink2 fu-sec' },
        h('div', { class: 'fu-head' }, h('span', { class: 'rank' }, rank), h('strong', null, '→ ' + next), h('span', { class: 'fu-n' + (n === cost ? ' ok' : '') }, n + ' / ' + cost)),
        own.length < cost ? h('p', { class: 'muted', style: 'margin:4px 0 0' }, 'Нужно ' + cost + ' карт ранга ' + rank + ', у тебя ' + own.length + '.') : null,
        h('div', { class: 'fu-cards' }, own.map((c) => h('button', { type: 'button', class: 'fu-card' + (S[c.id] ? ' is-on' : '') + (c.equipped ? ' is-eq' : ''), title: c.desc || '', onclick: () => { S[c.id] = !S[c.id]; fusion(); } },
          h('strong', null, c.name), h('small', null, KIND(c) + (c.equipped ? ' · в наборе' : '') + (c.negative ? ' · изъян' : ''))))),
        h('div', { class: 'btn-row', style: 'margin-top:8px' },
          h('button', { type: 'button', class: 'mini', disabled: own.length < cost, onclick: () => { for (const k in S) S[k] = false; own.slice().sort((a, b) => (b.negative ? 1 : 0) - (a.negative ? 1 : 0) || (a.equipped ? 1 : 0) - (b.equipped ? 1 : 0)).slice(0, cost).forEach((c) => (S[c.id] = true)); fusion(); } }, 'Подобрать'),
          h('button', { type: 'button', class: 'mini mini--blue', disabled: n !== cost || !!save.battle, onclick: () => run(() => {
            const r = result(G.cards.fuse(save, data, rank, Object.keys(S).filter((k) => S[k]))); sel[rank] = {}; UI.reveal = { card: r.card, inScene: false }; navigate('reveal'); }) }, 'Объединить'))));
    }
    if (!any) add(h('p', { class: 'note' }, icon('info'), 'Для объединения нужны карты одного ранга.'));
  }
  function packLine(hh) { const L = G.sysinv.load(hh); return 'Рюкзак ' + L.slots + '/' + L.slotsMax + ' · ' + String(L.kg).replace('.', ',') + '/' + String(L.kgMax).replace('.', ',') + ' кг'; }
  function syncInventory() { if (save.battle) save.battle.invFree = save.hero.inventory.filter((x) => !x).length; }
  // Экран снаряжения (Claude 03.11.2026): кукла с 10 слотами, выбор вещи в слот из рюкзака и ячеек Системы, характеристики с бонусами.
  const EQ_GLYPH = {
    head: 'M5 15a7 7 0 0 1 14 0v3H5z M9 18v3 M15 18v3 M12 8V5',
    cloak: 'M8 3h8l3 18H5z M12 3v6 M9 3l3 4 3-4',
    top: 'M8 3 3 7l3 3 2-2v13h8V8l2 2 3-3-5-4c-1 2-2.5 2.5-4 2.5S9 5 8 3z',
    belt: 'M3 10h18v4H3z M10 9h4v6h-4z',
    bottom: 'M6 3h12l1 18h-5l-2-11-2 11H5z M6 7h12',
    feet: 'M8 3h5v10l6 3v4H5v-4l3-2z',
    weapon_r: 'M14 4h6v6L9 21l-3-3L17 7 M5 15l4 4 M3 21l3-3',
    weapon_l: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
    relic: 'M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z',
    rings: 'M12 10a5.5 5.5 0 1 0 .01 0z M9.5 4h5L12 9z',
  };
  const eqGlyph = (k) => h('span', { class: 'eqs-ic', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + EQ_GLYPH[k] + '"/></svg>' });
  const DOLL_SVG = '<svg viewBox="0 0 120 260" fill="currentColor" aria-hidden="true"><circle cx="60" cy="28" r="20"/><path d="M38 58c6-6 14-8 22-8s16 2 22 8l14 58c1 6-7 9-10 3L76 82v62l6 104c0 8-12 8-13 0l-9-92-9 92c-1 8-13 8-13 0l6-104V82l-10 37c-3 6-11 3-10-3z"/></svg>';
  function inventory() {
    page('inventory', '', 'Снаряжение');
    const hh = save.hero, E = hh.equipment, LOCK = G.hero.TWO_HAND_LOCK, again = (fn) => () => run(() => { result(fn()); syncInventory(); inventory(); });
    const kg = (x) => String(x).replace('.', ','), rules = data.rules, open = G.hero.ringsUnlocked(hh, rules);
    const sel = UI.eqsel || null;
    const pickSlot = (id) => () => { UI.eqsel = UI.eqsel === id ? null : id; inventory(); };
    const slotName = (id) => id.startsWith('rings:') ? 'Кольцо ' + (+id.slice(6) + 1) : (G.hero.EQUIP_SLOTS.find((x) => x.id === id) || {}).name || id;
    const itemAt = (id) => id.startsWith('rings:') ? E.rings[+id.slice(6)] : E[id];
    function slotBtn(id, glyph) {
      const it = itemAt(id), lockRing = id.startsWith('rings:') && +id.slice(6) >= open, two = it === LOCK;
      const g = it && it !== LOCK ? G.gear.info(data, it) : null, brk = it && g && G.gear.broken(it);
      const need = lockRing ? G.hero.ringUnlockLevel(+id.slice(6), rules) : 0;
      return h('button', { type: 'button', class: 'eqs' + (sel === id ? ' is-sel' : '') + (!it ? ' is-empty' : '') + (lockRing ? ' is-locked' : '') + (brk ? ' is-broken' : '') + (id.startsWith('rings:') ? ' eqs--ring' : ''),
        disabled: lockRing, 'aria-label': slotName(id) + (it && it !== LOCK ? ': ' + it.name : two ? ': занято двуручным' : lockRing ? ': откроется на уровне ' + need : ': пусто'), onclick: pickSlot(id) },
        eqGlyph(glyph),
        id.startsWith('rings:') ? (lockRing ? h('small', null, 'ур.' + need) : it ? h('b', { class: 'eqs-rank' }, it.rank || 'F') : null)
          : h('span', { class: 'eqs-t' }, h('small', null, slotName(id)), h('strong', null, it && it !== LOCK ? it.name : two ? 'двуручное' : '—')),
        g && !id.startsWith('rings:') ? h('i', { class: 'eqs-dur', style: 'width:' + Math.max(0, Math.round(100 * it.dur / g.dur)) + '%' }) : null,
        g && !id.startsWith('rings:') ? h('b', { class: 'eqs-rank' }, it.rank || 'F') : null);
    }
    add(h('h1', { class: 'band band--l' }, 'Снаряжение'));
    if (!hh.awakened) add(h('p', { class: 'note' }, icon('info'), 'Ячеек Системы и колец пока нет — только то, что можно надеть руками.'));
    const left = ['head', 'cloak', 'top', 'belt', 'bottom', 'feet'].map((id) => slotBtn(id, id));
    const right = [slotBtn('weapon_r', 'weapon_r'), slotBtn('weapon_l', 'weapon_l'), slotBtn('relic', 'relic')];
    const rings = [0, 1, 2, 3, 4].map((i) => slotBtn('rings:' + i, 'rings'));
    add(h('section', { class: 'doll' },
      h('div', { class: 'doll-col' }, ...left),
      h('div', { class: 'doll-mid', html: DOLL_SVG }),
      h('div', { class: 'doll-col' }, ...right),
      h('div', { class: 'doll-rings' }, h('span', { class: 'doll-rings-l' }, 'Кольца'), ...rings)));

    // выбранный слот: что надето и чем заменить
    if (sel) {
      const cur = itemAt(sel), panel = h('section', { class: 'frame frame--ink2 eq-panel' }, h('h2', { class: 'h-sec', style: 'margin:0 0 6px' }, slotName(sel)));
      const cg = cur && cur !== LOCK ? G.gear.info(data, cur) : null;
      if (cur === LOCK) panel.append(h('p', { class: 'muted', style: 'margin:0' }, 'Рука занята двуручным оружием из правой руки.'));
      else if (cur) panel.append(h('div', { class: 'listrow' }, h('span', { class: 't' }, h('strong', null, cur.name + ' · ' + (cur.rank || 'F')), h('small', null, cg ? G.gear.describe(cg, cur) : '')),
        h('button', { type: 'button', class: 'mini', disabled: !!save.battle, onclick: again(() => G.gear.unequip(save, data, sel)) }, 'Снять')));
      else panel.append(h('p', { class: 'muted', style: 'margin:0 0 4px' }, 'Пусто.'));
      const cands = [];
      for (const it of hh.items || []) { const g = G.gear.info(data, it); if (g && G.gear.fits(g, sel)) cands.push({ it, g, from: 'рюкзак', go: () => G.gear.equip(save, data, it.uid, sel) }); }
      (hh.inventory || []).forEach((e, c) => { if (e && e.kind === 'item' && e.list) e.list.forEach((it, k) => { const g = G.gear.info(data, it); if (g && G.gear.fits(g, sel)) cands.push({ it, g, from: 'ячейка ' + (c + 1), go: () => G.gear.equipCell(save, data, c, k, sel) }); }); });
      if (cands.length) {
        panel.append(h('h3', { class: 'eq-sub' }, cur && cur !== LOCK ? 'Заменить на' : 'Надеть'));
        for (const c of cands) { const ok = G.gear.canEquip(save, data, c.it);
          panel.append(h('div', { class: 'listrow' }, h('span', { class: 't' }, h('strong', null, c.it.name + ' · ' + (c.it.rank || 'F')), h('small', null, c.from + ' · ' + G.gear.describe(c.g, c.it) + (ok.ok ? '' : ' · ' + ok.error))),
            h('button', { type: 'button', class: 'mini mini--blue', disabled: !!save.battle || !ok.ok, onclick: again(c.go) }, 'Надеть'))); }
      } else panel.append(h('p', { class: 'muted', style: 'margin:6px 0 0;font-size:13px' }, 'Подходящих вещей нет. Снаряжение выпадает с элиты и боссов во Вратах.'));
      add(panel);
    }

    // характеристики с бонусами
    const t = G.gear.combat(save, data), st = G.system.STATS, P = G.passives;
    const statRows = st.map((s) => { const base = hh.stats ? hh.stats[s.id] : 10, gb = G.gear.stat(hh, s.id), pb = P ? P.stat(hh, s.id) : 0;
      return h('div', { class: 'eq-stat' }, h('span', null, s.name), h('b', null, String(base + gb + pb)), h('small', { class: gb + pb > 0 ? 'up' : gb + pb < 0 ? 'down' : 'muted' }, gb + pb ? (gb + pb > 0 ? '+' : '') + (gb + pb) + ' от ' + (gb && pb ? 'вещей и пассивок' : gb ? 'вещей' : 'пассивок') : 'база')); });
    const defF = G.gear.defAgainst(t.def, 'F'), defE = G.gear.defAgainst(t.def, 'E'), defD = G.gear.defAgainst(t.def, 'D');
    const wield = t.wield.unarmed ? 'без оружия' : t.wield.two_handed ? 'двуручное' : t.wield.dual ? 'по оружию в каждой руке' : 'одной рукой';
    add(h('h2', { class: 'h-sec' }, 'Характеристики', h('span', { class: 'label muted' }, 'с учётом надетого')),
      h('section', { class: 'frame eq-stats' }, ...statRows,
        h('div', { class: 'eq-stat' }, h('span', null, 'HP / MP'), h('b', null, G.system.maxHp(hh) + ' / ' + (hh.awakened ? G.system.maxMp(hh) : 0)), h('small', { class: 'muted' }, 'максимум')),
        h('div', { class: 'eq-stat' }, h('span', null, 'Атака оружием'), h('b', null, '+' + t.atk), h('small', { class: 'muted' }, wield)),
        h('div', { class: 'eq-stat' }, h('span', null, 'Защита'), h('b', null, defF + '%'), h('small', { class: 'muted' }, 'против F · E ' + defE + '% · D ' + defD + '% · предел ' + G.gear.DEF_CAP + '%')),
        t.spell ? h('div', { class: 'eq-stat' }, h('span', null, 'Сила способностей'), h('b', null, '+' + t.spell + '%'), h('small', { class: 'muted' }, '')) : null,
        t.sets && t.sets.length ? h('div', { class: 'eq-stat' }, h('span', null, 'Комплекты'), h('b', null, String(t.sets.length)), h('small', { class: 'muted' }, t.sets.join(', '))) : null));

    // рюкзак и ячейки Системы
    const L = G.sysinv.load(hh);
    const meter = (label, a, b, f = String) => h('div', { class: 'meter' }, h('span', { class: 'label' }, label), h('span', { class: 'bar' + (a >= b ? ' is-full' : '') }, h('i', { style: 'width:' + Math.min(100, 100 * a / b) + '%' })), h('b', null, f(a) + ' / ' + f(b)));
    const pack = h('section', { class: 'plate' }, h('h2', { class: 'h-sec', style: 'margin-bottom:8px' }, 'Рюкзак'),
      h('div', { class: 'meters' }, meter('Слоты', L.slots, L.slotsMax), meter('Вес, кг', L.kg, L.kgMax, kg)));
    const mats = Object.entries(hh.materials || {}), items = hh.items || [];
    if (!mats.length && !items.length) pack.append(h('p', { class: 'muted', style: 'margin:4px 0 0' }, 'Пусто'));
    for (const [id, n] of mats) { const m = data._matIndex[id]; pack.append(h('div', { class: 'listrow' }, h('span', { class: 't' }, h('strong', null, (m ? m.name : id) + ' ×' + n), h('small', null, (G.crystals && G.crystals.isCrystal(id) ? 'Кристалл маны' : 'Материал') + ' · ' + kg(Math.round(n * G.data.rules.backpack.material_kg * 10) / 10) + ' кг')), hh.awakened ? h('button', { type: 'button', class: 'mini', onclick: again(() => G.sysinv.stash(save, 'mat', id)) }, 'В инвентарь') : null)); }
    for (const it of items) { const g = G.gear.info(data, it);
      pack.append(h('div', { class: 'listrow' }, h('span', { class: 't' }, h('strong', null, it.name + (g ? ' · ' + (it.rank || 'F') + ' · ' + G.gear.EQ_NAME[g.eq] : '')), h('small', null, kg(G.sysinv.itemKg(it)) + ' кг · ' + (g ? G.gear.describe(g, it) : 'вещь'))),
        h('span', { class: 'btn-row' }, g ? h('button', { type: 'button', class: 'mini mini--blue', disabled: !!save.battle, onclick: again(() => G.gear.equip(save, data, it.uid)) }, 'Надеть') : null,
          hh.awakened ? h('button', { type: 'button', class: 'mini', onclick: again(() => G.sysinv.stash(save, 'item', it.uid)) }, 'В инвентарь') : null))); }
    add(pack);
    if (hh.awakened) add(h('h2', { class: 'h-sec' }, 'Ячейки Системы', h('span', { class: 'label muted' }, 'время внутри стоит')),
      h('div', { class: 'cells' }, hh.inventory.map((it, i) => it
        ? h('button', { type: 'button', class: 'cell', title: it.name, 'aria-label': (i + 1) + '. ' + it.name + ' — достать', onclick: again(() => G.sysinv.take(save, i)) }, h('b', null, '×' + it.count), it.name)
        : h('div', { class: 'cell empty' }, String(i + 1)))));
    add(back(() => { UI.eqsel = null; navigate('day'); }));
  }

  // ---------- банк, сохранения ----------
  // ---------- телефон ----------
  const placeName = (id) => (data.locById[id] || {}).name || 'где-то в районе';
  function phoneSeen() { return save.phone || (save.phone = { alerts: 0 }); }
  function phoneBadge() { if (!save || !save.day) return 0; const newAlerts = G.gates.alerts(save).length - phoneSeen().alerts; return G.plot.chats(save).length + Math.max(0, newAlerts) + (G.mail ? G.mail.unread(save) : 0); }   // новости — только значок на «Ленте», не на вкладке
  function phone() {
    page('phone', 'scr-phone', 'Телефон');
    const p = G.clock.parts(save.clock), alerts = Math.max(0, G.gates.alerts(save).length - phoneSeen().alerts), chats = G.plot.chats(save).length;
    const news = G.news.unread(save);
    const cut = G.living.phoneCut(save), bills = G.living.bills(save).filter((b) => G.clock.diff(save.day.date + 'T07:00', b.due + 'T07:00') <= 3 * 1440).length;
    add(deco('dots dots--fade-r', 'right:0;top:0;width:60%;height:220px'), h('h1', { class: 'band band--xl' }, 'Телефон'),
      h('p', { class: 'muted phone-time' }, dateParts().full + ' · ' + G.day.SLOTS[save.day.slot] + ' · ' + placeName(save.hero.location)),
      ...(cut ? [h('p', { class: 'alert-line' }, icon('info'), 'Нет связи — счёт за телефон просрочен')] : []),
      h('div', { class: 'apps' },
        cut ? app('Чат', 'chat', 'Нет связи', () => message('Связь отключена за неуплату. Оплати счёт в Банке.', phone), 0)
          : app('Чат', 'chat', chats ? chats + ' новых' : 'Переписка', chatList, chats),
        app('Навигатор', 'map', 'Норвон', navigator, 0),
        cut ? app('Понхва', 'radar', 'Нет связи', () => message('Связь отключена за неуплату. Оповещения о разломах не приходят.', phone), 0)
          : app('Понхва', 'radar', alerts ? alerts + ' оповещ.' : 'Разломы рядом', ponhva, alerts),
        cut ? app('Лента', 'news', 'Нет связи', () => message('Связь отключена за неуплату. Новости не грузятся.', phone), 0)
          : app('Лента', 'news', news ? news + ' новых' : 'Сеул · Норвон', newsView, news),
        app('Бестиарий', 'search', (() => { const c = G.bestiary.counts(save, data); const n = Object.values(c).reduce((a, x) => a + x.known, 0); return n ? 'Изучено видов: ' + n : 'Твари разломов'; })(), () => { UI.bRank = UI.bRank || 'F'; navigate('bestiaryView'); }, 0),
        app('Почта', 'chat', G.mail.unread(save) ? G.mail.unread(save) + ' новых' : 'Письма', () => { UI.mailOpen = null; navigate('mailView'); }, G.mail.unread(save)),
        app('Банк', 'coins', money(save.hero.money), () => navigate('bank'), bills)),
      h('div', { class: 'grow' }), navbar('phone'));
  }
  function app(label, ic, sub, fn, n) { return h('button', { type: 'button', class: 'app', 'aria-label': label, onclick: () => run(fn) }, h('span', { class: 'app-ic' }, icon(ic), n ? h('i', { class: 'badge' }, String(n)) : null), h('strong', null, label), h('small', null, sub)); }
  const phoneBack = () => back(() => navigate('phone'), 'Телефон');
  // Лента: новости Сеула и страны, мир Охотников, районный «Норвон Инсайд» (тут же — следы того, что сделал Сиу).
  const NEWS_TABS = [['all', 'Все'], ['local', 'Норвон'], ['seoul', 'Сеул'], ['assoc', 'Охотники']];
  const newsKind = (p) => p.src === 'Норвон Инсайд' ? 'local' : /Ассоциац|Охотн/.test(p.src) ? 'assoc' : 'seoul';
  function newsView(tab) {
    tab = typeof tab === 'string' ? tab : UI.newsTab || 'all'; UI.newsTab = tab;
    const all = G.news.feed(save), unread = G.news.unread(save), open = UI.newsOpen || (UI.newsOpen = {});
    const newIds = new Set(all.slice(0, unread).map((p) => p.id));
    G.news.markRead(save);
    const list = all.filter((p) => tab === 'all' || newsKind(p) === tab);
    page('news', 'scr-phone scr-news', 'Лента');
    add(h('h1', { class: 'band band--l' }, 'Лента'), phoneBack(),
      h('div', { class: 'news-tabs' }, NEWS_TABS.map(([k, l]) => h('button', { type: 'button', class: 'news-tab' + (k === tab ? ' on' : ''), onclick: () => newsView(k) }, l))),
      ...(list.length ? [] : [h('p', { class: 'muted' }, 'Пока пусто.')]),
      h('div', { class: 'stack' }, list.slice(0, 40).map((p, i) => {
        const cs = p.comments || [], shown = open[p.id] ? cs : cs.slice(0, 2), k = newsKind(p);
        return h('article', { class: 'post plate s' + (1 + i % 4) + ' k-' + k + (newIds.has(p.id) ? ' is-new' : '') },
          h('div', { class: 'post-meta' }, h('span', { class: 'post-src' }, p.src), p.hot ? h('span', { class: 'post-hot' }, 'Горячее') : null,
            newIds.has(p.id) ? h('span', { class: 'post-new' }, 'Новое') : null, h('small', null, G.clock.format(p.date + 'T07:00').date)),
          h('strong', { class: 'post-title' }, p.title), h('p', { class: 'post-text' }, p.text),
          cs.length ? h('div', { class: 'post-comments' }, h('span', { class: 'post-cc' }, icon('chat'), cs.length + ' ' + (cs.length === 1 ? 'комментарий' : cs.length < 5 ? 'комментария' : 'комментариев')),
            shown.map((c) => h('div', { class: 'cmt' }, h('b', null, '@' + c.who), h('span', null, c.t))),
            cs.length > 2 ? h('button', { type: 'button', class: 'cmt-more', onclick: () => { open[p.id] = !open[p.id]; newsView(tab); } }, open[p.id] ? 'Свернуть' : 'Ещё ' + (cs.length - 2)) : null) : null);
      })));
  }

  // Чат: треды по людям; входящие разговоры (сцены типа «чат») — сверху.
  function chatList() {
    page('chat', 'scr-phone', 'Чат');
    const C = G.plot.state(save).chat || {}, incoming = G.plot.chats(save);
    const who = [...new Set(incoming.map((sc) => sc.chat || (sc.cast || [])[0]).concat(Object.keys(C)))].filter(Boolean);
    add(h('h1', { class: 'band band--l' }, 'Чат'), phoneBack());
    if (!who.length) add(h('p', { class: 'note' }, icon('info'), 'Сообщений пока нет.'));
    add(h('div', { class: 'stack' }, who.map((w, k) => {
      const log = C[w] || [], last = log[log.length - 1], fresh = incoming.some((sc) => (sc.chat || (sc.cast || [])[0]) === w);
      return tile(G.plot.name(save, w), () => chatThread(w), { icon: 'chat', variant: fresh ? 'blue' : null, sub: fresh ? 'Новое сообщение' : last ? (last.who === 'siu' ? 'Ты: ' : '') + String(last.t).slice(0, 48) : '', shape: 's' + (1 + k % 4) });
    })));
  }
  // Пузырь переписки. В общем чате (тред — не сам собеседник) у чужих сообщений подписано имя.
  // Вложения в чатах (03.11.2026): ремарка «приходит фото / голосовое» показывается как фото или голосовое сообщение.
  const PHOTO_RX = /(фотограф|фото(?![а-яё])|снимок|скрин|селфи)/i, VOICE_RX = /голосов/i;
  function photoSvg(text, k) {
    const t = text.toLowerCase(), nums = (text.match(/\d+\s?к/g) || []).slice(0, 4);
    if (/бумаг|документ|строк|графу|счёт|квитанц|договор|расписк/.test(t)) {
      const rows = (nums.length ? nums : ['', '', '']).map((n, i) => '<rect x="34" y="' + (52 + i * 22) + '" width="' + (90 - i * 12) + '" height="7" rx="2" fill="#9aa1b1"/><text x="186" y="' + (59 + i * 22) + '" font-size="12" font-weight="700" text-anchor="end" fill="#1b1f2a">' + n + '</text>').join('');
      return '<svg viewBox="0 0 220 160"><rect width="220" height="160" fill="#3a3f4b"/><g transform="rotate(' + (k ? 3 : -3) + ' 110 80)"><rect x="20" y="14" width="180" height="136" fill="#f4f2ea"/><rect x="34" y="26" width="110" height="10" fill="#1b1f2a"/><rect x="34" y="40" width="60" height="5" fill="#c33"/>' + rows + '<rect x="34" y="126" width="150" height="14" fill="none" stroke="#9aa1b1" stroke-dasharray="3 3"/></g></svg>';
    }
    if (/миск|каштан|еда|груш|рамен|тарел|кимпаб|торт/.test(t)) return '<svg viewBox="0 0 220 160"><rect width="220" height="160" fill="#c9a77a"/><ellipse cx="105" cy="96" rx="78" ry="34" fill="#e9e6df"/><ellipse cx="105" cy="88" rx="66" ry="24" fill="#6b3d22"/>' + [[80, 84], [100, 80], [122, 86], [92, 94], [114, 95], [70, 92], [136, 92]].map(([x, y]) => '<ellipse cx="' + x + '" cy="' + y + '" rx="10" ry="7" fill="#8a4b28" stroke="#4a2513"/>').join('') + '<rect x="150" y="40" width="10" height="70" rx="3" fill="#cfd3dc" transform="rotate(35 155 75)"/></svg>';
    return '<svg viewBox="0 0 220 160"><defs><linearGradient id="pg' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b7bd5"/><stop offset="1" stop-color="#26324f"/></linearGradient></defs><rect width="220" height="160" fill="url(#pg' + k + ')"/><circle cx="160" cy="44" r="14" fill="#ffd27a"/><path d="M0 130 L60 80 L100 112 L150 70 L220 126 V160 H0Z" fill="#1b2236"/></svg>';
  }
  function attachment(w, text) {
    const names = (G.data.story && G.data.story.cast) || {}, m = text.match(/от\s+([А-ЯЁ][а-яё]+)/), from = m ? Object.keys(names).find((id) => (names[id].short || names[id].name) === m[1]) : null;
    const who = from || w, wrap = (body) => h('div', { class: 'bubble them att' }, who !== w ? h('b', { class: 'from' }, G.plot.name(save, who)) : null, body);
    if (VOICE_RX.test(text)) { const tr = (text.split(/—\s*/).slice(1).join('— ') || '').trim();
      return wrap([h('div', { class: 'voice' }, h('span', { class: 'play' }, '▶'), h('span', { class: 'wave' }, Array.from({ length: 22 }, (_, i) => h('i', { style: 'height:' + (4 + Math.round(Math.abs(Math.sin(i * 1.7 + text.length)) * 14)) + 'px' }))), h('small', null, '0:0' + (3 + text.length % 6))),
        tr ? h('p', { class: 'att-cap' }, tr) : null]); }
    const n = /(^|[^а-яё])(две|два|2)\s/i.test(text) ? 2 : 1;
    return wrap([h('div', { class: 'photos n' + n }, Array.from({ length: n }, (_, k) => h('span', { class: 'photo', html: photoSvg(text, k) }))), h('p', { class: 'att-cap' }, text)]);
  }
  function bubble(w, who, text, now) {
    const cls = who === 'siu' ? 'me' : who === 'narr' || who === 'sys' || !who ? 'note' : who === 'think' ? 'think' : 'them';
    if (cls === 'note' && typeof text === 'string' && (PHOTO_RX.test(text) || VOICE_RX.test(text))) { const a = attachment(w, text); if (now) a.classList.add('now'); return a; }
    return h('div', { class: 'bubble ' + cls + (now ? ' now' : '') }, cls === 'them' && who !== w ? h('b', { class: 'from' }, G.plot.name(save, who)) : null, text);
  }
  function bubbles(w) {
    const log = (G.plot.state(save).chat || {})[w] || [];
    return h('div', { class: 'chat' }, log.map((m) => bubble(w, m.who, m.who === 'think' ? '«' + m.t + '»' : m.t)));
  }
  function chatThread(w) {
    const sc = G.plot.chats(save).find((x) => (x.chat || (x.cast || [])[0]) === w);
    if (sc) { G.plot.start(save, sc.id, { chat: w }); navigate('scene'); return; }
    page('chat', 'scr-phone scr-chat', G.plot.name(save, w));
    add(h('div', { class: 'chat-head' }, h('strong', null, G.plot.name(save, w))), bubbles(w), h('div', { class: 'grow' }), back(chatList, 'Чат'));
    const c = root.querySelector('.chat'); if (c) c.scrollTop = c.scrollHeight;
  }
  // Сцена в виде переписки: история пузырями, текущая реплика — последней, выбор — кнопки ответа.
  function chatScene(v, run, sc) {
    const w = run.ctx.chat;
    page('scene', 'scr-phone scr-chat', G.plot.name(save, w));
    add(h('div', { class: 'chat-head' }, h('strong', null, G.plot.name(save, w)), h('small', null, 'в сети')));
    const list = bubbles(w);
    if (v.kind === 'line') {
      const st = v.step;
      list.append(bubble(w, st.say || (st.think !== undefined ? 'think' : st.msg !== undefined ? st.from : 'narr'), st.think !== undefined ? '«' + st.think + '»' : st.t || st.n || st.msg || [].concat(st.sys || []).join(' / '), true));
      add(list, h('div', { class: 'grow' }), tile('Дальше', () => { const nv = G.plot.advance(save); if (nv && nv.kind === 'end') sceneEnded(nv); else render(); }, { variant: 'blue', shape: 's5', cls: 'next-btn' }));
    } else {
      add(list, h('div', { class: 'grow' }), h('div', { class: 'replies' }, v.options.map((o) => tile(o.label, () => { const nv = G.plot.pick(save, o.k); if (nv && nv.kind === 'end') sceneEnded(nv); else render(); }, { cls: 'choice reply', arrow: false, disabled: !o.ok, sub: !o.ok ? o.hint : null }))));
    }
    list.scrollTop = list.scrollHeight;
  }
  // Навигатор: карта района с метками; перейти — без траты слота.
  function navigator() {
    page('nav', 'scr-phone', 'Навигатор');
    const map = G.art.map(), P = data.places.places.filter((p) => !p.if || G.plot.test(save, p.if)), gates = G.gates.known(save), offers = G.plot.offers(save);
    const mark = (p) => { const g = gates.some((x) => x.place === p.id) || !!G.gates.breachAt(save, p.id), o = offers.some((x) => x.place === p.id), here = save.hero.location === p.id;
      return h('button', { type: 'button', class: 'pin' + (here ? ' here' : '') + (g ? ' gate' : '') + (o ? ' event' : ''), style: 'left:' + p.x + '%;top:' + p.y + '%', 'aria-label': p.name, onclick: () => run(() => placeView(p.id)) }, icon(g ? 'gate' : here ? 'person' : 'pin'), h('span', { class: 'lbl' }, p.name)); };
    add(h('h1', { class: 'band band--l' }, 'Навигатор'), phoneBack(),
      h('div', { class: 'map', style: map ? 'background-image:url("' + map + '")' : '' }, P.map(mark)),
      h('p', { class: 'muted map-hint' }, 'Нажми на метку, чтобы открыть место. По району — без потери времени.'));
  }
  const ACT_OF = { rest: 'Отдых', study: 'Учёба', work: 'Работа', train: 'Тренировка', person: 'Встреча с человеком' };
  function placeView(id) {
    const p = data.locById[id], here = save.hero.location === id, free = save.day.story_done && save.day.slot < 3;
    page('place', 'scr-place', p.name);
    const bg = G.art.loc(id);
    add(h('div', { class: 'deco scene-bg', style: bg ? 'background-image:url("' + bg + '")' : null }),
      h('h1', { class: 'band band--l' }, p.name), h('p', { class: 'tag place-sub' }, p.sub || ''), h('div', { class: 'grow' }));
    const box = h('div', { class: 'stack place-acts' });
    if (!here) box.append(tile('Идти сюда', () => { G.day.move(save, data, id); placeView(id); }, { variant: 'blue', icon: 'run', sub: 'По району — без потери времени', shape: 's5', disabled: !!(save.battle || save.pending || (save.plot && save.plot.run)) }));
    else box.append(h('p', { class: 'tag tag--ink' }, 'Ты здесь'));
    if (here) {
      { const bg = G.gates.breachAt(save, id); if (bg) box.append(tile('Твари на улицах', () => doAction('breach', bg.id), { variant: 'red', icon: 'gate', sub: free ? 'Прорыв ранга ' + bg.est + ' · займёт ' + G.day.SLOTS[save.day.slot].toLowerCase() : 'Сейчас не до этого', shape: 's1', disabled: !free })); }
      G.gates.at(save, id).forEach((g) => box.append(tile('Войти во врата', () => doAction('gate', g.id), { variant: 'red', icon: 'gate', sub: 'Оценка «Понхва»: ранг ' + g.est + ' · смертельно опасно', shape: 's1', disabled: !free })));
      G.plot.offers(save).filter((sc) => sc.place === id).forEach((sc) => box.append(tile((sc.offer && sc.offer.label) || sc.title, () => playScene(sc.id, { offer: true }), { variant: 'blue', icon: 'book', sub: (sc.offer && sc.offer.sub) || 'Сцена', shape: 's2', disabled: !free })));
      if (G.market) G.market.channels(save).filter((c) => c.place === id).forEach((c) => { const err = save.battle || save.pending || (save.plot && save.plot.run) ? 'Сначала заверши текущее дело' : save.day.slot !== 1 && save.day.slot !== 2 ? 'Работает днём и вечером' : '';
        box.append(tile(c.id === 'cho' ? 'Лавка старика Чо' : c.id === 'box' ? 'Сдать в Бокс «Находка гражданина»' : 'Сдать скупщику', () => { UI.mktPlace = id; navigate('market'); }, { variant: 'blue', icon: 'coins', sub: err || 'Трофеи и кристаллы · ' + Math.round(c.rate * 100) + '% · время не тратится', disabled: !!err, shape: 's4' })); });
      if (id === 'nowon:forge' && G.forge) { const err = save.battle || save.pending || (save.plot && save.plot.run) ? 'Сначала заверши текущее дело' : save.day.slot !== 1 && save.day.slot !== 2 ? 'Открыто днём и вечером' : '';
        box.append(tile('Зайти к Кихо', () => { if (!G.plot.state(save).vars.forge_met) playScene('forge_intro', { forge: true }); else navigate('forgeView'); }, { variant: 'blue', icon: 'sword', sub: err || 'Рецепты, крафт, заказы · время не тратится', disabled: !!err, shape: 's2' })); }
      if (id === 'nowon:market' && G.forge && G.market.channels(save).some((c) => c.id === 'cho')) { const o = G.forge.orders(save, 'cho'), err = save.day.slot !== 1 && save.day.slot !== 2 ? 'Днём и вечером' : '';
        box.append(tile('Заказ старика Чо', () => { UI.ordWho = 'cho'; navigate('ordersView'); }, { icon: 'list', sub: err || (o.active ? 'Взят: ' + o.active.name + ' ×' + o.active.n : o.offer ? 'Есть заказ · ' + money(o.offer.pay) : 'На этой неделе заказов нет'), disabled: !!err, shape: 's3' })); }
      if (id === 'nowon:hunter_shop' && G.shop) { const err = save.battle || save.pending || (save.plot && save.plot.run) ? 'Сначала заверши текущее дело' : G.shop.closed(save);
        box.append(tile('Зайти в лавку', () => playScene('shop_enter', { shop: true }), { variant: 'blue', icon: 'sword', sub: err || 'Снаряжение и ремонт · время не тратится', disabled: !!err, shape: 's2' })); }
      (p.acts || []).forEach((a) => { const err = G.day.can(save, a, data); box.append(tile(ACT_OF[a] || a, () => (a === 'work' ? jobsView(id) : chooseActivity(a)), { icon: { rest: 'moon', study: 'book', work: 'briefcase', train: 'dumbbell', person: 'person' }[a], sub: err || 'Займёт ' + G.day.SLOTS[save.day.slot].toLowerCase(), disabled: !!err, shape: 's3' })); });
    }
    add(box, back(navigator, 'Навигатор'));
  }
  // «Понхва»: служба раннего оповещения о разломах — быстро, но не идеально.
  function ponhva() {
    phoneSeen().alerts = G.gates.alerts(save).length;
    page('ponhva', 'scr-phone', 'Понхва');
    const list = G.gates.alerts(save);
    add(h('h1', { class: 'band band--l band--red' }, 'Понхва'), phoneBack(),
      h('p', { class: 'note' }, icon('info'), 'Служба раннего оповещения о разломах. Точность оценки — около 70%, возможны ложные тревоги и задержки.'),
      G.heat && save.hero.awakened ? h('p', { class: (G.plot.state(save).vars.assoc_heat || 0) >= 50 ? 'alert-line' : 'muted' }, icon('radar'), 'Обстановка: ' + G.heat.mood(save)) : null);
    if (!list.length) add(h('p', { class: 'muted' }, 'Оповещений нет. В районе спокойно.'));
    add(h('div', { class: 'stack' }, list.slice(0, 12).map((g) => {
      const open = g.status === 'open' || g.status === 'breach', d = G.clock.format(G.clock.advance(save.day.date + 'T07:00', (Math.floor(g.alert_at / 4) - save.day.n) * 1440));
      return h('section', { class: 'alert ' + (open ? 'is-open' : 'is-done') },
        h('span', { class: 'lvl' }, g.status === 'breach' ? 'ПРОРЫВ' : open ? 'ТРЕВОГА' : 'ОТБОЙ'),
        h('strong', null, 'Разлом · ' + placeName(g.place)),
        h('small', null, d.date + ' · ' + G.day.SLOTS[g.alert_at % 4] + ' · предварительная оценка: ранг ' + g.est + ' (±1)'),
        h('p', null, G.gates.label(save, g)),
        open ? tile('Показать на карте', () => placeView(g.place), { icon: 'map', shape: 's2', arrow: false }) : null);
    })));
  }

  // Банк: счёт, счета за жильё и связь (с пенями), история операций.
  function bank() {
    page('bank', '', 'Банк');
    const hh = save.hero, L = G.living, bills = L.bills(save);
    add(h('h1', { class: 'band band--xl' }, 'Банк'),
      h('section', { class: 'plate balance' }, h('span', { class: 'label' }, 'На счёте'), h('b', null, money(hh.money))));
    if (L.phoneCut(save)) add(h('p', { class: 'alert-line' }, icon('info'), 'Связь отключена: чаты и «Понхва» не работают, пока не оплатишь.'));
    if (L.cold(save)) add(h('p', { class: 'alert-line' }, icon('info'), 'В квартире холодно: сон восстанавливает вдвое меньше.'));
    add(h('h2', { class: 'h-sec' }, 'Счета'),
      bills.length ? h('div', { class: 'stack' }, bills.map((b, i) => h('section', { class: 'plate billrow s' + (1 + i % 4) + (b.late ? ' is-late' : '') },
        h('div', null, h('strong', null, b.title), h('small', null, b.late ? 'Просрочено на ' + b.late + ' дн. · пени ' + money(b.fine) : 'До ' + G.clock.format(b.due + 'T07:00').date)),
        h('div', { class: 'billpay' }, h('b', null, money(b.owe)),
          h('button', { type: 'button', class: 'mini mini--blue', disabled: hh.money < b.owe, onclick: () => run(() => { L.pay(save, b.id); bank(); }) }, 'Оплатить')))))
        : h('p', { class: 'muted' }, 'Всё оплачено. Следующие счета придут в начале месяца.'),
      h('h2', { class: 'h-sec' }, 'Операции'),
      h('section', { class: 'frame' }, hh.ledger.slice(-12).reverse().map((e) => h('div', { class: 'listrow' }, h('span', { class: 't' }, h('strong', null, e.title), h('small', null, e.at ? G.clock.format(e.at).date : '')),
        h('span', { class: 'amount ' + (e.amount > 0 ? 'plus-v' : 'minus-v') }, (e.kind === 'start' ? '' : e.amount > 0 ? '+' : '−') + money(Math.abs(e.amount)))))));
    if (returnTo) add(back(() => { const fn = returnTo; returnTo = null; fn(); }));
    else add(back(() => navigate('phone')), h('div', { class: 'grow' }), navbar('phone'));
  }
  // Скупка: разведанные каналы сбыта (задание «Ничего не продаётся само»). Сдаётся по одной штуке.
  // Скупка — в своём месте района (rules.json → market.channels[].place): рынок (Чо), пункт Ассоциации (Бокс), ломбард (серый).
  function market() {
    const M = G.market, place = UI.mktPlace || save.hero.location, ch = M.channels(save).filter((c) => c.place === place), goods = M.goods(save), V = G.plot.state(save).vars;
    if (!ch.length) { navigate('day'); return; }
    const c0 = ch[0];
    page('market', '', c0.name);
    add(h('h1', { class: 'band band--l' }, c0.name),
      h('section', { class: 'plate' }, h('strong', null, 'Платит ' + Math.round(c0.rate * 100) + '% от цены'), h('p', { style: 'margin:4px 0 0' }, c0.note), c0.week_units ? h('small', { class: 'muted' }, 'На этой неделе возьмёт ещё: ' + M.left(save, c0)) : null),
      h('section', { class: 'plate balance' }, h('span', { class: 'label' }, 'На счёте'), h('b', null, money(save.hero.money))),
      G.crystals ? (() => { const w = G.crystals.week(save), k = G.crystals.index(save), d = w ? Math.round((k / G.crystals.index(save, w - 1) - 1) * 100) : 0;
        return h('p', { class: 'note' }, icon('coins'), 'Курс кристаллов маны: ' + Math.round(k * 100) + '% от каталога' + (d ? ' (' + (d > 0 ? '+' : '') + d + '% за неделю)' : '') + '. Меняется по вторникам — следи за «Экономикой» в ленте.'); })() : null,
      c0.id === 'grey' && (V.grey_heat || 0) >= 3 ? h('p', { class: 'alert-line' }, icon('info'), 'Скупщик слишком много о тебе спрашивал. Он уже знает больше, чем стоило бы.') : null,
      h('h2', { class: 'h-sec' }, 'Трофеи'),
      goods.length ? h('div', { class: 'stack' }, goods.map((g, i) => h('section', { class: 'plate billrow s' + (1 + i % 4) },
        h('div', null, h('strong', null, g.name + (g.n > 1 ? ' ×' + g.n : '')), h('small', null, g.where + (g.crystal ? ' · по курсу ' : ' · по каталогу ') + money(g.price))),
        h('div', { class: 'btn-row' }, ch.map((c) => { const w = M.why(save, c, g); return h('button', { type: 'button', class: 'mini mini--blue', disabled: !!w, title: w || '', onclick: () => run(() => {
          const r = M.sell(save, c.id, g.key); message(r.robbed ? 'У ломбарда тебя «случайно» толкнули в толпе. Ни «' + r.name + '», ни денег. Сиу уходит дворами.' : '«' + r.name + '» — ' + c.short + '. Зачислено: ' + money(r.won) + '.', () => navigate('market')); }) }, w || 'Сдать · ' + money(Math.round(g.price * c.rate / 100) * 100)); })))))
        : h('p', { class: 'muted' }, 'Сдавать нечего. Трофеи и кристаллы маны приходят из Врат.'),
      back(() => { UI.mktPlace = null; run(() => placeView(place)); }, 'Выйти'));
  }

  function shopView() {
    page('shopView', '', 'Лавка снаряжения');
    const S = G.shop, full = S.full(save), all = S.list(save);
    const again = (fn) => () => run(() => { UI.bought = fn(); shopView(); });
    const row = (it, i) => { const w = S.why(save, it), g = it.gear;
      return h('section', { class: 'plate billrow s' + (1 + i % 4) },
        h('div', null, h('strong', null, it.name + (it.sport || it.name.includes('(' + it.rank + ')') ? '' : ' · ' + it.rank)), h('small', null, G.gear.EQ_NAME[g.eq] + ' · ' + G.gear.describe(g) + ' · ' + money(it.price_won))),
        h('button', { type: 'button', class: 'mini mini--blue', disabled: !!w, title: w || '', onclick: again(() => { S.buy(save, data, it.id); return '«' + it.name + '» — в рюкзаке. Надеть — в «Снаряжении».'; }) }, w || 'Купить')); };
    add(h('h1', { class: 'band band--l' }, 'Лавка'),
      UI.bought ? h('p', { class: 'note' }, icon('check'), UI.bought) : null,
      h('section', { class: 'plate balance' }, h('span', { class: 'label' }, 'На счёте'), h('b', null, money(save.hero.money))));
    const rep = G.gear.repairList(save, data), cost = G.gear.repairCost(save, data);
    if (rep.length) add(h('section', { class: 'frame eq-panel' }, h('div', { class: 'listrow' }, h('span', { class: 't' }, h('strong', null, 'Ремонт · ' + rep.length + ' ' + (rep.length === 1 ? 'вещь' : 'вещи')), h('small', null, rep.map((x) => x.name + ' ' + Math.max(0, x.dur) + '/' + x.gear.dur).join(' · '))),
      h('button', { type: 'button', class: 'mini mini--blue', disabled: save.hero.money < cost || !!S.closed(save), onclick: again(() => { G.hero.charge(save.hero, save.clock, -cost, 'Лавка снаряжения: ремонт'); G.gear.repair(save, data); return 'Починено.'; }) }, 'Починить · ' + money(cost)))));
    const hunt = all.filter((x) => !x.sport), sport = all.filter((x) => x.sport);
    if (full) add(h('h2', { class: 'h-sec' }, 'Охотничья витрина', h('span', { class: 'label muted' }, 'F–D')), h('div', { class: 'stack' }, hunt.map(row)));
    else add(h('p', { class: 'note' }, icon('info'), S.card(save) ? 'Охотничья витрина закрыта: карточку ты продавцу не показал.' : 'Охотничья витрина (оружие и броня F–D) — только по карточке пробуждённого из Ассоциации.'));
    add(h('h2', { class: 'h-sec' }, 'Спортинвентарь', h('span', { class: 'label muted' }, 'обычные вещи')), h('div', { class: 'stack' }, sport.map(row)),
      h('p', { class: 'muted', style: 'font-size:13px' }, 'Обычная вещь защищает и бьёт, но маной не напитана: тварей, которых берёт только энергия, бита не возьмёт.'),
      back(() => { UI.bought = null; run(() => placeView('nowon:hunter_shop')); }, 'Выйти'));
  }
  function saves() {
    page('saves', '', 'Сохранения');
    add(h('h1', { class: 'band band--l' }, 'Сохранения'));
    const canSave = save && !save.hero.dead && !save.battle && !save.pending;
    add(h('div', { class: 'stack' }, G.save.list().map((s, i) => {
      const label = s.slot === 'auto' ? 'Начало дня (авто)' : s.slot === 'last' ? 'Последний ход (авто)' : 'Слот ' + s.slot.slice(-1);
      return h('section', { class: 'plate slotrow s' + (1 + i % 4) },
        h('div', null, h('h2', null, label), h('p', null, s.empty ? 'Пусто' : s.broken ? 'Повреждено' : s.name + ' · ' + G.clock.format(s.clock).date + ' · ' + G.clock.format(s.clock).time)),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'mini mini--blue', disabled: !!(s.empty || s.broken), onclick: () => run(() => {
            save = G.save.load(s.slot, data); scene = null; line = save.sceneLine || 0; returnTo = null; UI.target = null; UI.menu = null; UI.hp = null;
            screen = save.battle ? 'battle' : save.pending || (save.plot && save.plot.run) ? 'scene' : 'day'; if (save.pending) scene = personScene(save.pending.npc); render();
          }) }, 'Загрузить'),
          canSave && s.slot !== 'auto' && s.slot !== 'last' ? h('button', { type: 'button', class: 'mini', onclick: () => run(() => { G.save.write(s.slot, save, data); message('Сохранено', saves); }) }, 'Сохранить') : null));
    })));
    if (save && !save.hero.dead) { if (screen === 'saves' && !save.battle) add(h('div', { class: 'grow' }), navbar('saves')); else add(back(() => navigate(save.battle ? 'battle' : 'day'))); }
    else if (!save) add(back(() => navigate('title')));
  }

  // ---------- смерть ----------
  function death() {
    const E = save.hero.ending;
    if (E && E.title) {   // плохая концовка из сюжета — свой экран
      page('death', 'scr-death scr-ending', 'Концовка');
      add(deco('dots dots--fade-r'), h('p', { class: 'tag tag--ink' }, 'BAD END'), h('h1', { class: 'band band--xl band--red' }, E.title),
        h('div', { class: 'frame death-msg' }, h('p', null, E.text || 'Прохождение завершено.')),
        tile('Загрузить сохранение', () => navigate('saves'), { variant: 'blue', icon: 'save', arrow: false, shape: 's5' }));
      return;
    }
    page('death', 'scr-death', 'Критический исход');
    add(deco('dots dots--fade-r'), h('h1', { class: 'death-band' }, h('span', { class: 'db', 'data-fit-w': '0.84' }, '// Критический'), h('span', { class: 'db l2', 'data-fit-w': '0.7' }, 'исход')),
      h('div', { class: 'frame death-msg' }, h('p', null, 'Прохождение завершено.'), save.hero.death_cause ? h('small', null, 'Причина: ' + save.hero.death_cause) : null),
      tile('Загрузить сохранение', () => navigate('saves'), { variant: 'blue', icon: 'save', arrow: false, shape: 's5' }));
  }

  // ---------- бой ----------
  const INTENT = { prep: 'Подготовка', attack: 'Атака', heavy: 'Сильный удар', spell: 'Заклинание', self: 'Усиление', broken: 'Слом стойки', stun: 'Оглушён' };
  const HERO_SET = (b) => { const w = b.units.hero.w || {}, g = b.units.hero.gear || {}; return w.ranged ? 'bow' : g.offhand ? 'shield' : w.two_handed ? 'two' : w.unarmed ? 'unarmed' : 'sword'; };
  const MON_CELL = { i: 1, g: 0, a: 1, h: 2, c: 3, r: 4 };   // ждёт — в атакующей стойке (решение заказчика 03.11.2026), защита — пригнувшись
  const HERO_CELL = { i: 0, g: 1, h: 2, r: 3, t1: 4, t2: 5, v1: 6, v2: 7 };
  const cellPos = (i, n) => (n > 1 ? (i * 100 / (n - 1)) : 0) + '% 0';
  const shownHp = (u) => (UI.hp && UI.hp[u.id] !== undefined ? UI.hp[u.id] : u.hp);
  function battle() {
    const b = save.battle;
    if (!b) { navigate('day'); return; }
    if (b.over && !UI.busy && save.battleActivity === 'plot') {
      UI.hp = null; G.day.finishPlotBattle(save, data);
      if (save.hero.dead) { death(); return; }
      navigate('scene'); return;
    }
    if (b.over && !UI.busy) {
      UI.hp = null;
      const wasGate = save.battleActivity === 'gate', r = G.day.finishBattle(save, data);
      if (save.hero.dead) { death(); return; }
      const res = b.result === 'won' ? 'Победа.' : b.result === 'fled' ? 'Герой ушёл из боя.' : 'Бой завершён.';
      const msg = res + (r.rewards && r.rewards.xp ? ' Опыт: +' + r.rewards.xp + '. Трофеи — в рюкзаке.' : '');
      if (save.gateRun) { message(msg + ' Разлом ещё держится — дальше тянет глубже.', () => navigate('gatemap')); return; }   // узел пройден, Врата открыты
      if (wasGate) { gateOver(b.result === 'won' ? msg + ' Хозяин Врат повержен — разлом схлопывается.' : msg); return; }
      after(msg);
      return;
    }
    page('battle', 'scr-battle', 'Бой');
    const live = b.enemies.map((id) => b.units[id]).filter((m) => (m.hp > 0 || (UI.hp && UI.hp[m.id] > 0)) && !m.gone);
    if (!UI.target || !live.some((m) => m.id === UI.target)) UI.target = (live[0] || {}).id || null;
    const intents = G.combat.intents(b), u = b.units.hero;
    add(h('div', { class: 'deco bt-bg' }));
    // противники
    const foes = h('div', { class: 'foes' }, live.map((m) => {
      const it = intents[m.id] || { list: [] }, hp = Math.max(0, Math.ceil(shownHp(m)));
      const first = it.list[0] || {};
      return h('button', { type: 'button', class: 'frame foe' + (m.id === UI.target ? ' is-target' : ''), 'data-unit': m.id, 'aria-label': 'Цель: ' + m.name, onclick: () => { UI.target = m.id; render(); } },
        h('span', { class: 'row1' }, h('span', null, m.name), h('span', { class: 'hpnum' }, hp + ' / ' + m.hpMax)),
        h('span', { class: 'bar' }, h('i', { style: 'width:' + (100 * hp / m.hpMax) + '%' })),
        h('span', { class: 'poise', title: 'Стойкость ' + m.poise + '/' + m.poiseMax }, Array.from({ length: m.poiseMax }, (_, k) => h('i', { class: k < m.poise ? '' : 'off' }))),
        h('span', { class: 'intent' }, h('span', { class: 'bang' }, '!'), h('em', null, 'Намерение:'), ' ' + (first.name || INTENT[first.kind] || 'Неясно') + (first.dmg ? ' · ~' + first.dmg : '')));
    }));
    add(h('div', { class: 'bt-top' }, foes, h('button', { type: 'button', class: 'sys-mini', onclick: () => navigate('system') }, 'Система')));
    // арена
    const arena = h('div', { class: 'arena' }, h('i', { class: 'deco floor floor--mon' }), h('i', { class: 'deco floor floor--hero' }), h('i', { class: 'deco slash' }));
    live.slice(0, 2).forEach((m, k) => {
      const src = G.art.mon(m.species);
      arena.append(h('div', { class: 'sp mon' + (k ? ' second' : '') + (src && G.art.facesRight(src) ? ' flip' : ''), 'data-sp': m.id, 'data-n': '5', style: (src ? 'background-image:url("' + src + '");' : '') + 'background-position:' + cellPos(m.status && m.status.guard ? MON_CELL.g : MON_CELL.i, 5) }));
    });
    const hs = G.art.heroBattle(HERO_SET(b));
    arena.append(h('div', { class: 'sp heroes is-turn', 'data-sp': 'hero', 'data-n': '8', style: (hs ? 'background-image:url("' + hs + '");' : '') + 'background-position:' + cellPos(u.status.guard ? 1 : 0, 8) }));
    add(arena);
    const hp = Math.max(0, Math.ceil(shownHp(u)));
    add(h('div', { class: 'frame vit-box', 'data-unit': 'hero' },
      h('div', { class: 'r' }, h('span', null, 'HP'), h('span', { class: 'bar bar--hp' }, h('i', { style: 'width:' + (100 * hp / u.hpMax) + '%' })), h('span', { class: 'n' }, hp + ' / ' + u.hpMax)),
      h('div', { class: 'r' }, h('span', null, 'MP'), h('span', { class: 'bar bar--mp' }, h('i', { style: 'width:' + (u.mpMax ? 100 * u.mp / u.mpMax : 0) + '%' })), h('span', { class: 'n' }, Math.round(u.mp) + ' / ' + u.mpMax))));
    add(h('div', { class: 'bt-log', 'aria-live': 'polite' }, b.log.slice(-2).map((x) => h('p', null, x.text))));
    // действия
    const acts = G.combat.actions(b), find = (t) => acts.find((a) => a.type === t);
    const doAct = (a) => () => { if (UI.busy) return; act(Object.assign({}, a, { target: a.target || UI.target })); };
    if (UI.menu) { add(battleMenu(b, acts, doAct)); return; }
    const A = (label, sub, ic, a, o = {}) => tile(label, a && a.ok ? doAct(a) : () => {}, { sub: a && !a.ok && a.error ? a.error : sub, icon: ic, arrow: false, variant: o.hot ? null : 'frame', cls: 'tile--frame' + (o.hot ? ' is-hot' : ''), shape: o.shape, disabled: !a || !a.ok });
    const cards = acts.filter((a) => a.type === 'card'), items = acts.filter((a) => ['item', 'gear', 'touch', 'blood', 'finger', 'pass'].includes(a.type));
    const menuBtn = (label, sub, ic, kind, list, shape) => tile(label, () => { if (UI.busy) return; UI.menu = kind; render(); }, { sub: list.length ? sub : 'Пусто', icon: ic, arrow: false, cls: 'tile--frame', shape, disabled: !list.length });
    add(h('div', { class: 'acts' },
      A('Удар', 'Атаковать врага', 'sword', find('attack'), { shape: 's1' }),
      A('Защита', 'Снизить урон', 'shield', find('guard'), { shape: 's2' }),
      tile('Анализ', () => { if (UI.busy) return; const m = b.units[UI.target]; if (m) analysis(m); }, { sub: 'Изучить врага', icon: 'search', arrow: false, cls: 'tile--frame is-hot', shape: 's3', disabled: !UI.target }),
      menuBtn('Карты', 'Использовать карту', 'cards', 'cards', cards, 's4'),
      menuBtn('Предметы', 'Использовать предмет', 'potion', 'items', items, 's1'),
      A('Бежать', 'Покинуть бой', 'run', find('flee'), { shape: 's2' })));
  }
  function battleMenu(b, acts, doAct) {
    const kind = UI.menu, list = acts.filter((a) => (kind === 'cards' ? a.type === 'card' : ['item', 'gear', 'touch', 'blood', 'finger', 'pass'].includes(a.type)));
    return h('section', { class: 'frame sheet' }, h('h2', null, kind === 'cards' ? 'Карты' : 'Предметы и свойства'),
      list.map((a) => h('button', { type: 'button', class: 'opt', disabled: !a.ok, onclick: () => { if (UI.busy) return; UI.menu = null; doAct(a)(); } },
        h('span', null, h('strong', null, a.label), a.ok ? (a.hint ? h('small', null, a.hint) : null) : h('small', null, a.error || 'Недоступно')),
        a.cost !== undefined ? h('span', { class: 'cost' }, 'MP ' + a.cost) : null)),
      h('button', { type: 'button', class: 'back', onclick: () => { UI.menu = null; render(); } }, icon('back'), 'Закрыть'));
  }
  // Действие героя: запомнить здоровье до хода, применить, проиграть события боя (позы, урон), затем показать итог.
  function act(a) {
    const b = save.battle, n0 = (b.fx || []).length;
    UI.hp = Object.fromEntries(Object.values(b.units).map((x) => [x.id, x.hp]));
    try { result(G.combat.act(b, data, a)); } catch (e) { UI.hp = null; message(e.message); return; }
    const ev = (b.fx || []).slice(n0);
    if (!motion() || !ev.length) { UI.hp = null; render(); return; }
    UI.busy = true; render(); play(ev);   // busy до render: иначе законченный бой закроется раньше анимации
  }
  function play(ev) {
    UI.busy = true;
    const step = Math.max(110, Math.min(260, 1500 / ev.length));
    const spr = (id) => root.querySelector('[data-sp="' + id + '"]');
    const setCell = (el, cell) => { if (el) el.style.backgroundPosition = cellPos(cell, +el.dataset.n); };
    const setBar = (id, hp) => {
      UI.hp[id] = hp; const box = root.querySelector('[data-unit="' + id + '"]'); const u = save.battle.units[id]; if (!box || !u) return;
      const i = box.querySelector('.bar i'); if (i) i.style.width = Math.max(0, 100 * hp / u.hpMax) + '%';
      const n = box.querySelector('.hpnum, .n'); if (n) n.textContent = Math.max(0, Math.ceil(hp)) + ' / ' + u.hpMax;
    };
    // Эффект попадания поверх спрайта: open — открытый удар (рваная вспышка, разрезы, искры), guard — удар в блок (синий щит, отскок искр), kill — добивание.
    const SHIELD_SVG = '<svg viewBox="0 0 100 116" width="100%" height="100%"><defs><linearGradient id="fxsg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dfe8ff" stop-opacity=".95"/><stop offset=".6" stop-color="#1f5bff" stop-opacity=".55"/><stop offset="1" stop-color="#1f5bff" stop-opacity=".1"/></linearGradient></defs>'
      + '<polygon points="50,3 96,29 96,87 50,113 4,87 4,29" fill="url(#fxsg)" stroke="#fff" stroke-width="5"/><polygon points="50,22 80,39 80,77 50,94 20,77 20,39" fill="none" stroke="#bcd0ff" stroke-width="3"/></svg>';
    const burst = (el, kind, big) => {
      const ar = root.querySelector('.arena'); if (!el || !ar) return;
      const r = el.getBoundingClientRect(), a = ar.getBoundingClientRect(), isHero = el.dataset.sp === 'hero';
      const x = r.left - a.left + r.width * (isHero ? .5 : .46), y = r.top - a.top + r.height * (isHero ? .52 : .6);
      const box = h('div', { class: 'fx fx--' + kind + (big ? ' fx--big' : ''), style: 'left:' + x + 'px;top:' + y + 'px;--side:' + (isHero ? 1 : -1) + ';--rot:' + Math.round(Math.random() * 50 - 25) + 'deg' });
      if (kind === 'guard') { const sh = h('i', { class: 'fx-shield' }); sh.innerHTML = SHIELD_SVG; box.append(sh, h('i', { class: 'fx-flash' })); }
      else box.append(h('i', { class: 'fx-star' }), h('i', { class: 'fx-star fx-star--in' }), ...[0, 1, 2].map((k) => h('i', { class: 'fx-slash', style: '--k:' + k })));
      const n = kind === 'guard' ? 6 : big ? 12 : 8;
      for (let k = 0; k < n; k++) { const ang = (kind === 'guard' ? (isHero ? 0 : 180) - 70 + 140 * k / (n - 1) : 360 * k / n + Math.random() * 30) * Math.PI / 180, d = 50 + Math.random() * 40;
        box.append(h('i', { class: 'fx-spark', style: '--dx:' + Math.round(Math.cos(ang) * d) + 'px;--dy:' + Math.round(Math.sin(ang) * d) + 'px;--d:' + (Math.random() * 60 | 0) + 'ms' })); }
      ar.append(box); setTimeout(() => box.remove(), 650);
      if (kind !== 'guard' && (isHero || big)) { ar.classList.remove('shake'); void ar.offsetWidth; ar.classList.add('shake'); setTimeout(() => ar.classList.remove('shake'), 320); }
    };
    const pop = (el, text, cls) => { if (!el) return; const r = el.getBoundingClientRect(), a = root.querySelector('.arena').getBoundingClientRect();
      const d = h('span', { class: 'dmg ' + (cls || ''), style: 'left:' + (r.left - a.left + r.width * .45) + 'px;top:' + (r.top - a.top + r.height * .25) + 'px' }, text); root.querySelector('.arena').append(d); setTimeout(() => d.remove(), 700); };
    // Чей ход — тот крупнее и впереди, остальные отступают в тень.
    const turn = (id) => { for (const x of root.querySelectorAll('.arena .sp')) x.classList.toggle('is-turn', x.dataset.sp === id); };
    let i = 0;
    const tick = () => {
      if (i >= ev.length || !save.battle) { setTimeout(() => { UI.busy = false; UI.hp = null; render(); }, 160); return; }
      const e = ev[i++], el = spr(e.u), isHero = e.u === 'hero', C = isHero ? HERO_CELL : MON_CELL;
      if (e.p === 'a' || e.p === 'c' || e.p === 'g') turn(e.u);
      if (e.p === 'a') { setCell(el, isHero ? C.t2 : C.a); el && el.classList.add(isHero ? 'lunge-r' : 'lunge-l'); setTimeout(() => { if (el) { el.classList.remove('lunge-r', 'lunge-l'); setCell(el, C.i); } }, step * .9); }
      else if (e.p === 'h' || e.p === 'k') { setCell(el, C.h); const tint = e.g ? 'hit--guard' : 'hit--open'; el && el.classList.add('hit', tint); if (motion()) burst(el, e.g ? 'guard' : 'open', e.p === 'k'); pop(el, '−' + e.n); setBar(e.u, e.hp); setTimeout(() => { if (el) { el.classList.remove('hit', 'hit--guard', 'hit--open'); setCell(el, C.i); if (e.p === 'k' && !isHero) el.classList.add('dead'); } }, step * .9); }
      else if (e.p === 'c') { setCell(el, isHero ? C.v2 : C.c); setTimeout(() => setCell(el, C.i), step * .9); }
      else if (e.p === 'g') setCell(el, C.g);
      else if (e.p === '+') { pop(el, '+' + e.n, 'heal'); setBar(e.u, e.hp); }
      else if (e.p === 'miss') pop(el, 'мимо', 'miss');
      setTimeout(tick, step);
    };
    tick();
  }
  function analysis(m) {
    page('analysis', '', 'Анализ');
    if (G.achievements && save.hero.awakened && m.species && !m.human) { G.achievements.note(save, 'analyzed', m.species); G.achievements.check(save); }
    const src = G.art.mon(m.species), stats = Object.entries(m.stats || {});
    const max = Math.max(1, ...stats.map(([, v]) => v));
    add(h('h1', { class: 'band band--l' }, 'Анализ'),
      h('section', { class: 'plate stack' },
        h('div', { class: 'an-head' }, h('div', { class: 'an-sp', style: src ? 'background-image:url("' + src + '")' : '' }),
          h('div', null, h('h2', { style: 'margin:0;font-size:20px;font-weight:800' }, m.name), h('p', { style: 'margin:6px 0 0' }, h('span', { class: 'rank' }, m.rank), ' ', h('span', { class: 'kind' }, { regular: 'рядовой', elite: 'элита', boss: 'босс' }[m.role] || m.role)),
            h('p', { style: 'margin:6px 0 0;font-weight:700' }, 'HP ' + Math.ceil(m.hp) + ' / ' + m.hpMax + ' · MP ' + m.mp + ' / ' + m.mpMax))),
        h('div', { class: 'an-stats' }, stats.map(([k, v]) => [h('span', null, (G.system.STATS.find((s) => s.id === k) || { name: k }).name), h('span', { class: 'bar' }, h('i', { style: 'width:' + (100 * v / max) + '%' })), h('b', null, v)]))),
      h('section', { class: 'frame' }, h('dl', { class: 'kv' },
        h('dt', null, 'Атака'), h('dd', null, m.atk + ' · защита ' + m.def_pct + '% · регенерация ' + m.regen),
        h('dt', null, 'Тело'), h('dd', null, (m.body || '—') + ' · рост ' + (m.size || '—') + ' м'),
        h('dt', null, 'Оружие'), h('dd', null, (m.weapon || 'нет') + ' · стойкость ' + m.poise + ' / ' + m.poiseMax),
        h('dt', null, 'Слабость'), h('dd', null, m.weak || 'не выявлена'),
        h('dt', null, 'Сопротивления'), h('dd', null, (m.resist || []).join(', ') || 'нет'))),
      h('h2', { class: 'h-sec' }, 'Способности'),
      h('div', { class: 'stack' }, (m.abilities || []).map((a, i) => h('div', { class: 'plate listrow s' + (1 + i % 4) }, h('span', { class: 't' }, h('strong', null, a.name), h('small', null, 'подготовка ' + (a.prep || 0) + ' · перезарядка ' + (a.cd || 0))), h('span', { class: 'amount' }, a.dmg ? a.dmg : '—')))),
      tile('Вернуться в бой', () => navigate('battle'), { variant: 'blue', icon: 'sword', arrow: false, shape: 's5' }));
  }

  // ---------- маршрутизация ----------
  const SCREENS = { reveal, debug: debugView, chapterView, minigame, title, newgame: newGame, settings, day, activities, scene: sceneView, battle, system, bank, saves, phone, market, gatemap, shopView, mailView, bestiaryView, beastView, forgeView, ordersView };
  // ---------- Тестовый режим (?debug=1): панель для ручной проверки баланса ----------
  const DEBUG = typeof location !== 'undefined' && /[?&]debug=1/.test(location.search || '');
  function debugButton() {
    if (!DEBUG || document.getElementById('dbg-btn')) return;
    document.body.append(h('button', { type: 'button', id: 'dbg-btn', 'aria-label': 'Тестовый режим', onclick: () => { if (!save) return; document.querySelectorAll('.syspop').forEach((x) => x.remove()); popOpen = false; UI.dbgBack = screen === 'debug' ? UI.dbgBack : screen; navigate('debug'); } }, 'DBG'));
  }
  function debugView() {
    page('debug', '', 'Тестовый режим');
    const hh = save.hero, V = G.plot.state(save).vars, busy = !!(save.battle || save.gateRun || save.pending || (save.plot && save.plot.run));
    const go = (fn, msg) => () => run(() => { const r = fn(); UI.dbgMsg = msg || r || 'Готово'; debugView(); });
    const btn = (label, fn, msg, dis) => h('button', { type: 'button', class: 'mini mini--blue', disabled: !!dis, onclick: go(fn, msg) }, label);
    const row = (title, ...kids) => h('section', { class: 'frame frame--ink2 dbg-sec' }, h('h2', { class: 'h-sec', style: 'margin:0 0 8px' }, title), h('div', { class: 'dbg-row' }, ...kids));
    const inp = (id, ph, val) => h('input', { id, class: 'dbg-in', placeholder: ph, value: val === undefined ? '' : String(val) });
    const val = (id) => (document.getElementById(id) || {}).value || '';
    const allMats = () => { const B = data.bestiary.species; const out = {}; for (const r of G.forge ? G.forge.recipes(save) : []) for (const n of r.need) out[n.id] = n.n * 2; return out; };
    add(h('h1', { class: 'band band--l band--red' }, 'Тестовый режим'),
      h('p', { class: 'muted' }, dateParts().full + ' · день ' + save.day.n + ' · ' + G.day.SLOTS[save.day.slot] + ' · ' + placeName(hh.location) + (busy ? ' · идёт бой/сцена/Врата' : '')),
      UI.dbgMsg ? h('p', { class: 'note' }, icon('check'), UI.dbgMsg) : null,
      row('Дата', inp('dbg-date', 'ГГГГ-ММ-ДД', save.day.date), btn('Перейти', () => {
          const d = val('dbg-date'); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw Error('Дата: ГГГГ-ММ-ДД'); if (d < save.day.date) throw Error('Только вперёд (назад — загрузи сохранение)');
          delete save.battle; delete save.battleActivity; delete save.gateRun; delete save.gateId; delete save.pending; if (save.plot) save.plot.run = null; delete save.breach_here; delete save.inspector;
          const n = save.day.n + Math.round(G.clock.diff(save.day.date + 'T07:00', d + 'T07:00') / 1440); G.day.begin(save, data, n, d);
          if (d >= '2026-09-17' && !hh.awakened) { G.system.awaken(save, save.clock); }
          return 'Переход на ' + d + '. Пропущенные сцены прошли без Сиу.'; }),
        btn('+1 день', () => { delete save.battle; delete save.gateRun; if (save.plot) save.plot.run = null; G.day.begin(save, data, save.day.n + 1, G.clock.advance(save.day.date + 'T07:00', 1440).slice(0, 10)); return 'Следующий день'; }),
        btn('Слот сюжета пройден', () => { if (!save.day.story_done) G.day.finishStory(save, data); return 'Утро закрыто'; }, null, save.day.story_done)),
      row('Деньги и ресурсы',
        btn('+1 000 000 ₩', () => G.hero.charge(hh, save.clock, 1000000, 'Тест'), '+1 млн'),
        btn('+10 млн ₩', () => G.hero.charge(hh, save.clock, 10000000, 'Тест'), '+10 млн'),
        btn('Кристаллы F/E/D ×10', () => { hh.materials = hh.materials || {}; for (const r of ['F', 'E', 'D']) hh.materials['CRY-' + r] = (hh.materials['CRY-' + r] || 0) + 10; }, '+30 кристаллов'),
        btn('Материалы для всех рецептов', () => { hh.materials = hh.materials || {}; for (const [k, n] of Object.entries(allMats())) hh.materials[k] = (hh.materials[k] || 0) + n; }, 'Материалы добавлены (рюкзак может быть перегружен)'),
        btn('Снаряжение F/E (5 шт.)', () => { const pool = []; for (const s of data.bestiary.species) for (const p of s.loot_pool || []) if (p.gear && (s.rank === 'F' || s.rank === 'E')) pool.push({ ...p, rank: s.rank });
          for (let i = 0; i < 5; i++) { const p = pool[(i * 37 + save.day.n * 11) % pool.length]; (hh.items || (hh.items = [])).push({ uid: p.id + '@dbg' + Date.now() + i, id: p.id, name: p.name, rank: p.rank, price_won: p.price_won, gear: JSON.parse(JSON.stringify(p.gear)), dur: p.gear.dur }); } }, '+5 вещей в рюкзак'),
        btn('Счета оплачены', () => { for (const b of hh.bills || []) b.paid = save.clock; }, 'Все счета закрыты')),
      row('Герой',
        hh.awakened ? null : btn('Пробудить', () => G.system.awaken(save, save.clock), 'Система открыта'),
        inp('dbg-stat', 'характеристики', 20), btn('Все характеристики', () => { const v = +val('dbg-stat') || 10; for (const k of ['str', 'agi', 'vit', 'per']) hh.stats[k] = v; if (hh.awakened) hh.stats.mag = Math.max(10, v); G.gear.refresh(save, data); hh.hp = G.system.maxHp(hh); }, 'Характеристики выставлены'),
        hh.awakened ? inp('dbg-lv', 'уровень', hh.level) : null, hh.awakened ? btn('Уровень', () => { hh.level = Math.max(1, +val('dbg-lv') || 1); }, 'Уровень выставлен') : null,
        btn('HP/MP полные', () => { hh.hp = G.system.maxHp(hh); hh.mp = G.system.mpCap(hh); }),
        hh.awakened ? btn('+3 выбора карты', () => { hh.sys.gacha = (hh.sys.gacha || 0) + 3; }, '+3 попытки') : null,
        hh.awakened ? btn('Карта «Кузнечное чутьё»', () => { (hh.cards || (hh.cards = {}))['A-P-SHARP'] = { lvl: 1, at: save.clock }; G.cards.refresh(save, data); }, 'Карта добавлена') : null),
      row('Врата', ...['F', 'E', 'D', 'C', 'B', 'A', 'S'].map((r) => btn(r, () => { const g = G.gates.spawn(save, data, { rank: r, est: r }); return 'Врата ' + r + ': ' + placeName(g.place); })),
        btn('Прорыв рядом', () => { const g = G.gates.spawn(save, data, { rank: 'F', est: 'F', place: hh.location, late: true, raid_in: 1 }); G.gates.breach(save, g); return 'Прорыв: ' + placeName(g.place); })),
      row('Мир',
        btn('Все каналы скупки', () => { Object.assign(V, { c1_sell_cho: 1, c1_sell_box: 1, c1_sell_grey: 1 }); }, 'Чо, Бокс, ломбард открыты'),
        btn(V.hunter_card ? 'Убрать карточку' : 'Выдать карточку', () => { V.hunter_card = V.hunter_card ? 0 : 1; }),
        btn('Внимание 0', () => { V.assoc_heat = 0; V.insp_wave = 0; }), btn('Внимание 55', () => { V.assoc_heat = 55; V.insp_wave = 0; }), btn('Внимание 85', () => { V.assoc_heat = 85; V.insp_wave = 1; }),
        btn('Репутация Кихо +20', () => { V.forge_rep = (V.forge_rep || 0) + 20; }), btn('Ленту прочитать', () => G.news.markRead(save))),
      row('Переменная сюжета', inp('dbg-var', 'имя=значение', ''), btn('Поставить', () => { const m = val('dbg-var').match(/^\s*([\wа-яё_]+)\s*=\s*(.*)$/i); if (!m) throw Error('Формат: имя=значение'); const raw = m[2].trim(); V[m[1]] = raw === 'true' ? true : raw === 'false' ? false : raw !== '' && !isNaN(+raw) ? +raw : raw; return m[1] + ' = ' + JSON.stringify(V[m[1]]); })),
      h('details', { class: 'dbg-vars' }, h('summary', null, 'Все переменные сюжета (' + Object.keys(V).length + ')'), h('pre', null, Object.keys(V).sort().map((k) => k + ' = ' + JSON.stringify(V[k])).join('\n'))),
      row('Сохранение', btn('Записать в слот 3', () => G.save.write('slot3', save, data), 'Записано в слот 3')),
      back(() => { UI.dbgMsg = null; navigate(UI.dbgBack && UI.dbgBack !== 'debug' ? UI.dbgBack : 'day'); }));
  }
  function render() {
    debugButton();
    if (save && save.hero.dead && screen !== 'saves' && screen !== 'debug') { death(); return; }
    if (screen === 'debug' && save) { debugView(); return; }
    if (save && save.battle && !['system', 'bank', 'saves', 'phone'].includes(screen)) screen = 'battle';
    else if (save && save.plot && save.plot.run && !['system', 'bank', 'saves', 'settings'].includes(screen)) screen = 'scene';
    else if (save && save.gateRun && !['system', 'bank', 'saves', 'phone', 'gatemap', 'message'].includes(screen)) screen = 'gatemap';
    if (!save && !['title', 'newgame', 'settings', 'saves'].includes(screen)) screen = 'title';
    (SCREENS[screen] || day)();
    sysPop();
  }
  // Облачные сохранения на claude.ai: личная папка игрока в базе страницы. Без claude.ai — только браузер.
  async function cloudSaves() {
    try {
      if (!window.claude || !window.claude.use) return false;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const uid = user && await user.id(); if (!db || !uid) return false;
      const got = await G.save.attachCloud(db, uid);
      if (got && ['title', 'saves'].includes(screen)) render();
      return true;
    } catch (e) { return false; }
  }
  async function start() {
    try {
      data = await G.bootstrap.load(async (p) => { const r = await fetch(p); if (!r.ok) throw Error('Не загружен файл ' + p); return r.json(); });
      const persistent = G.save.useBrowser(); render();
      cloudSaves().then((ok) => { if (!persistent && !ok) message('Постоянное хранилище недоступно. Сохранения пропадут при закрытии страницы.', render); });
    } catch (e) { page('error', ''); add(h('h1', { class: 'band band--m band--red' }, 'Не удалось запустить'), h('p', null, e.message), h('p', { class: 'muted' }, 'Открой папку игры через локальный сервер.')); }
  }
  return { start, deathActions: () => ['load'] };
});
G.app.start();

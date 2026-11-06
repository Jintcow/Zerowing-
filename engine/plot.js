// Сюжет v2 (02.11.2026): сцены по календарю, состояние мира, знания персонажей, итоги боёв.
// Данные — data/public/story.json (формат описан в docs/SCENES.md). Всё состояние — в save.plot:
//   vars     — переменные мира (жив ли Бёнхун, долг Ёнмина, исход 24 сентября…)
//   know     — кто что знает: know[npc][fact] = {how:'saw'|'told'|'rumor', from, at, detail}
//   dead     — погибшие персонажи (навсегда)
//   done     — сцены: 'played' (Сиу был) | 'missed' (прошла без него)
//   chose    — ключи выбранных вариантов
//   battles  — итоги сюжетных боёв по id
//   run      — сцена, которая идёт сейчас: {id, stack:[{p:[путь к списку шагов], i}], ctx}
G.define("plot", function (G) {
  const SLOTS = ["morning", "day", "evening", "night"];
  const RANKS = () => G.cards.RANKS;
  let D = { cast: {}, scenes: [], vars: {}, calendar: { holidays: [] } }, BY = {};
  function use(data) {
    ORDER = null;
    const s = data.story || {};
    D = Object.assign({ cast: {}, scenes: [], vars: {}, facts: {}, calendar: { holidays: [] } }, s);
    BY = Object.fromEntries(D.scenes.map((x) => [x.id, x]));
  }
  const scene = (id) => BY[id] || null;
  function state(save) {
    if (!save.plot) save.plot = { vars: {}, know: {}, dead: {}, done: {}, chose: {}, battles: {}, run: null };
    const P = save.plot;
    for (const [k, v] of Object.entries(D.vars || {})) if (!(k in P.vars)) P.vars[k] = v && typeof v === "object" && "init" in v ? v.init : v;
    return P;
  }
  // ---------- имена ----------
  function name(save, id) {
    if (id === "siu" || id === "hero") return String(save.hero.name).split(" ").pop();
    const c = D.cast[id]; if (c) return c.short || c.name || id;
    const p = G.data && G.data.characters ? G.data.characters.characters.find((x) => x.id === id) : null;
    return p ? p.name_known || p.name_unknown : id;
  }
  // ---------- знания ----------
  function knows(save, who, fact, how) {
    const k = ((state(save).know[who]) || {})[fact];
    if (!k) return false;
    if (!how) return true;
    const order = { rumor: 0, told: 1, saw: 2 };   // «видел сам» сильнее «рассказали», то — сильнее «слухов»
    return order[k.how] >= order[how];
  }
  function learn(save, who, fact, how, o) {
    o = o || {}; const P = state(save);
    for (const w of [].concat(who)) {
      if (P.dead[w]) continue;
      const K = P.know[w] || (P.know[w] = {}), old = K[fact];
      const order = { rumor: 0, told: 1, saw: 2 };
      if (old && order[old.how] >= order[how || "told"]) { if (o.detail) old.detail = [].concat(old.detail || [], o.detail).filter((x, i, a) => a.indexOf(x) === i); continue; }
      K[fact] = { how: how || "told", from: o.from || null, at: save.clock, detail: o.detail ? [].concat(o.detail) : (old && old.detail) || [] };
    }
  }
  // Передать знание можно только от того, кто его сам имеет (никакой телепатии): иначе — false.
  function tell(save, from, to, fact) {
    if (from !== "siu" && !knows(save, from, fact)) return false;
    learn(save, to, fact, "told", { from }); return true;
  }
  // ---------- вычисляемые переменные (из фактического сохранения, сценарий их не задаёт) ----------
  // Сценаристы ссылаются на них как на обычные переменные: [учёба_январь = хорошая], [каникулы_режим = врата].
  const WEEKDAYS = (from, to) => { let n = 0; for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 864e5) { const d = new Date(t).getUTCDay(); if (d && d < 6) n++; } return n; };
  function studyLevel(save) {   // занятия «Учёба» относительно учебных дней с 1 сентября (утро — школа, учёба — сверху)
    const days = Math.max(1, WEEKDAYS("2026-09-01", (save.day || {}).date || "2026-09-01")), r = ((save.hero.school || {}).progress || 0) / days;
    return r >= 0.35 ? "хорошая" : r >= 0.15 ? "средняя" : "тяжёлая";
  }
  function modeOf(save, from, to) {   // чем Сиу в основном занимался в эти дни (save.history)
    const H = save.history || {}, n = {}; for (const [d, acts] of Object.entries(H)) if (d >= from && d <= to) for (const a of acts) n[a] = (n[a] || 0) + 1;
    const NAME = { gate: "врата", work: "работа", study: "учёба", rest: "отдых", train: "учёба" };
    const top = Object.entries(n).sort((a, b) => b[1] - a[1]); if (!top.length) return "отдых";
    if (top.length > 1 && top[1][1] === top[0][1] && NAME[top[0][0]] !== NAME[top[1][0]]) return "смешанный";
    return NAME[top[0][0]] || "смешанный";
  }
  const DERIVED = {
    "учёба_январь": studyLevel, study_level: studyLevel,
    "каникулы_режим": (save) => modeOf(save, "2027-01-07", "2027-01-08"),
    "каникулы_нагрузка": (save) => { const H = save.history || {}; let busy = 0; for (const d of ["2027-01-07", "2027-01-08"]) busy += (H[d] || []).filter((a) => a !== "rest").length; return busy >= 3 ? "тяжёлая" : "обычная"; },
    "завтрак_наличие": () => "неизвестно",   // запасов еды в игре сейчас нет
  };
  // Свободен ли персонаж сегодня: жив, знаком, не отмечен занятым (переменная busy_<id> = дата) и не выпал занятым по зерну (~25%).
  function free(save, w) {
    const P = state(save); if (P.dead[w] || !((save.relations || {})[w] || {}).met) return false;
    if (P.vars["busy_" + w] === (save.day || {}).date) return false;
    let x = ((save.seed >>> 0) ^ Math.imul(((save.day || {}).n || 0) + 17, 0x9e3779b1)) >>> 0; for (const ch of w) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0;
    return (x % 100) >= 25;
  }
  // ---------- условия ----------
  function cmp(v, want) {
    if (want === null) return v === null || v === undefined || v === false;
    if (want && typeof want === "object" && !Array.isArray(want)) {
      return Object.entries(want).every(([op, x]) => op === "gte" ? v >= x : op === "lte" ? v <= x : op === "gt" ? v > x : op === "lt" ? v < x : op === "ne" ? v !== x : op === "in" ? [].concat(x).includes(v) : false);
    }
    if (Array.isArray(want)) return want.includes(v);
    return v === want;
  }
  function test(save, cond, ctx) {
    if (!cond) return true;
    if (Array.isArray(cond)) return cond.every((c) => test(save, c, ctx));
    const P = state(save), h = save.hero, R = RANKS();
    return Object.entries(cond).every(([k, v]) => {
      switch (k) {
        case "all": return [].concat(v).every((c) => test(save, c, ctx));
        case "any": return [].concat(v).some((c) => test(save, c, ctx));
        case "not": return !test(save, v, ctx);
        case "var": return Object.entries(v).every(([n, w]) => cmp(P.vars[n], w));
        case "knows": return [].concat(v).every((q) => [].concat(q.who).every((w) => knows(save, w, q.fact || "awakened", q.how)));
        case "unaware": return [].concat(v).every((q) => [].concat(q.who).every((w) => !knows(save, w, q.fact || "awakened")));
        case "alive": return [].concat(v).every((w) => !P.dead[w]);
        case "dead": return [].concat(v).every((w) => !!P.dead[w]);
        case "played": return [].concat(v).every((id) => P.done[id] === "played");
        case "missed": return [].concat(v).every((id) => P.done[id] === "missed");
        case "chose": return [].concat(v).every((key) => !!P.chose[key]);
        case "battle": {
          const b = P.battles[v.id]; if (!b) return v.result === null;
          return Object.entries(v).every(([f, w]) => f === "id" ? true : f === "fate" ? Object.entries(w).every(([who, x]) => cmp(b.fates[who], x)) : f === "saw" ? [].concat(w).every((who) => b.witnesses.includes(who)) : cmp(b[f], w));
        }
        case "awakened": return !!h.awakened === !!v;
        case "doing": return cmp(ctx && ctx.doing, v);
        case "slot": return cmp(SLOTS[(save.day || {}).slot], v);
        case "date_gte": return (save.day || {}).date >= v;
        case "date_lte": return (save.day || {}).date <= v;
        case "money_gte": return (h.money || 0) >= v;
        case "money_lt": return (h.money || 0) < v;
        case "money_gte_var": return (h.money || 0) >= (P.vars[v] || 0) && (P.vars[v] || 0) > 0;   // у Сиу хватит денег закрыть переменную-сумму
        case "level_gte": return (h.level || 0) >= v;
        case "stat_gte": return Object.entries(v).every(([s, n]) => Number.isFinite((h.stats || {})[s]) && h.stats[s] >= n);
        case "power_rank": return R.includes(v) && R.indexOf(G.hero.powerRank(save)) >= R.indexOf(v);
        case "orb_rank": return R.includes(v) && !!(h.orb && h.orb.rank) && R.indexOf(h.orb.rank) >= R.indexOf(v);
        case "card_kind": return cmp(cardKind(save), v);   // первая карта: active / passive / negative (странная, с изъяном) / none — карту ещё не выбрал
        case "place": return cmp(h.location, v);
        case "has_loot": return (Object.values(h.materials || {}).some((n) => n > 0) || (h.items || []).length > 0 || (h.inventory || []).some((x) => x && (x.kind === "mat" || x.kind === "item"))) === !!v;   // трофеи из Врат: рюкзак или инвентарь Системы
        case "mp_gte": return (h.mp || 0) >= v;
        case "gate_open": return !!(G.gates && G.gates.known(save).length) === !!v;   // в районе есть открытые врата, о которых Сиу знает
        case "card_active": return Object.keys(h.cards || {}).some((id) => (G.cards.byId(G.data, id) || {}).kind === "active") === !!v;   // есть активная карта — можно применить на виду
        case "card_rank": return R.includes(v) && Object.keys(h.cards || {}).some((id) => { const c = G.cards.byId(G.data, id); return c && R.indexOf(c.rank) >= R.indexOf(v); });
        case "quest": return [].concat(v).every((q) => cmp(G.quests.status(save, q.id), q.status === undefined ? "done" : q.status));
        case "met": return [].concat(v).every((w) => !P.dead[w] && ((save.relations || {})[w] || {}).met);   // знаком и жив — можно написать, позвать
        case "free": return [].concat(v).every((w) => free(save, w));                                    // свободен сегодня (жив, знаком, не занят)
        case "quest_any": return !!(G.quests && G.quests.view(save).length) === !!v;                      // есть ли сейчас активное задание
        case "trust_gte": return Object.entries(v).every(([w, n]) => ((save.relations || {})[w] || {}).trust >= n);
        default: return cmp(k in DERIVED ? DERIVED[k](save) : P.vars[k], v);          // короткая запись: {"bh_alive": true} = {"var":{"bh_alive":true}}
      }
    });
  }
  function cardKind(save) {
    const ids = Object.keys(save.hero.cards || {}); if (!ids.length) return "none";
    const cs = ids.map((id) => G.cards.byId(G.data, id)).filter(Boolean);
    if (cs.some((c) => c.negative)) return "negative";
    return (cs[0] || {}).kind === "active" ? "active" : "passive";
  }
  // Подстановки в тексте окон Системы и реплик: {mag} {mp} {mpmax} {level} {str} {agi} {vit} {per} — из сохранения, а не из примера в сценарии.
  function fill(save, x) {
    if (typeof x !== "string" || x.indexOf("{") < 0) return x;
    const h = save.hero, S = h.stats || {}, V = { mag: S.mag, str: S.str, agi: S.agi, vit: S.vit, per: S.per, level: h.level, mp: Math.floor(h.mp || 0), mpmax: G.system ? G.system.maxMp(h) : h.mp };
    const vars = state(save).vars;
    return x.replace(/\{(mag|mp|mpmax|level|str|agi|vit|per)\}/g, (_, k) => V[k] === undefined || V[k] === null ? "?" : String(V[k]))
      .replace(/\{var\.([a-z0-9_]+)\}/g, (_, k) => { const v = vars[k]; return typeof v === "number" ? v.toLocaleString("ru-RU") : v === undefined || v === null ? "0" : String(v); });   // {var.yeonmin_debt}
  }
  const filled = (save, st) => { const o = Object.assign({}, st); for (const k of ["t", "n", "think", "msg"]) if (o[k] !== undefined) o[k] = fill(save, o[k]); if (o.sys !== undefined) o.sys = [].concat(o.sys).map((x) => fill(save, x)); return o; };
  // ---------- календарь ----------
  function holiday(date) { return (D.calendar.holidays || []).find((x) => date >= x.date && date <= (x.to || x.date)) || null; }
  const slotOf = (s) => SLOTS.indexOf(s.slot || "morning");
  // Сцены этого дня и слота, ещё не сыгранные и подходящие по условиям.
  function due(save, slot, mode) {
    const P = state(save), d = save.day; if (!d) return [];
    const k = slot === undefined ? d.slot : slot;
    const today = (s) => s.date === d.date || (s.mode === "side" && P.side && P.side.id === s.id && P.side.date === d.date)
      || (!s.date && s.mode && (s.mode.startsWith("on:") || (s.mode === "offer" && s.anyday)) && (!s.from || s.from <= d.date) && (!s.to || d.date <= s.to));   // offer+anyday — плитка в любой день окна (пока выполняется if)   // «при деле» без даты — в окне from…to, один раз
    return D.scenes.filter((s) => today(s) && (s.slot === "any" || slotOf(s) === k) && (!P.done[s.id] || (s.mode === "offer" && s.repeatOffer)) && test(save, s.if)
      && (mode === "autonomous" ? s.mode === "autonomous" : s.mode !== "autonomous") && (!mode || (mode === "auto" ? !s.mode || s.mode === "auto" || s.mode === "side" : s.mode === mode)));
  }
  const autoDue = (save) => due(save, undefined, "auto");
  // Следующее по сюжету в этом слоте: сцена или переписка — в том порядке, в каком их написали (порядок в файлах).
  let ORDER = null;
  const ord = (id) => { if (!ORDER) { ORDER = {}; D.scenes.forEach((s, i) => (ORDER[s.id] = i)); } return ORDER[id] ?? 1e9; };
  function storyNext(save) { const L = autoDue(save).concat(chats(save)); return L.sort((a, b) => ord(a.id) - ord(b.id))[0] || null; }
  const offers = (save) => due(save, undefined, "offer");
  const byPrio = (a) => a.slice().sort((x, y) => (y.prio || 0) - (x.prio || 0));   // при равных — порядок в файлах
  const onActivity = (save, act, arg) => (arg && byPrio(due(save, undefined, "on:" + act + ":" + arg))[0]) || byPrio(due(save, undefined, "on:" + act))[0] || null;
  const chats = (save) => G.living && G.living.phoneCut(save) ? [] : due(save, undefined, "chat");   // связь отключена за долги — переписка не приходит   // входящие: разговор в чате, слот не тратит
  // Слот прошёл: сцены без Сиу случаются сами — только их последствия (absent), без показа игроку.
  function closeSlot(save, slot) {
    const P = state(save);
    for (const s of due(save, slot, "autonomous")) { runQuiet(save, s.steps || []); P.done[s.id] = "autonomous"; }   // ТИП: АВТОНОМНАЯ — без Сиу, только последствия
    for (const s of due(save, slot)) { if (!s.date && (/^on:/.test(s.mode || "") || s.anyday)) continue;   // «при деле» без даты ждут своего дела, а не слота
      runQuiet(save, s.absent || []); P.done[s.id] = "missed"; }
  }
  // Побочные задания сценаристов (mode:"side"): у сцены не дата, а окно from…to. В свободный день Система
  // иногда выдаёт одно из подходящих (шанс — story.side_chance), и сцена играет сегодня в своём слоте.
  function pickSide(save) {
    const P = state(save), d = save.day; if (!d || (P.side && P.side.date === d.date)) return null;
    if (D.scenes.some((s) => s.date === d.date && !s.mode)) return null;   // в сюжетный день побочных нет
    let x = ((save.seed >>> 0) ^ Math.imul(d.n + 5, 0x9e3779b1)) >>> 0; const r = () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), x | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    if (r() >= (D.side_chance === undefined ? 0.35 : D.side_chance)) return null;
    const pool = D.scenes.filter((s) => s.mode === "side" && !P.done[s.id] && (!s.from || s.from <= d.date) && (!s.to || d.date <= s.to) && test(save, s.if));
    if (!pool.length) return null;
    // вес: сцены, связанные с текущей историей, сценарист помечает weight > 1 — они выпадают чаще
    const total = pool.reduce((a, s) => a + (s.weight || 1), 0); let x2 = r() * total, s = pool[0];
    for (const c of pool) { x2 -= c.weight || 1; if (x2 < 0) { s = c; break; } }
    P.side = { id: s.id, date: d.date }; return s;
  }
  // Новый день: всё, что осталось в прошлых днях, считается прошедшим без Сиу.
  function catchUp(save) {
    const P = state(save), d = save.day; if (!d) return;
    for (const s of D.scenes) if (s.date && s.date < d.date && (!P.done[s.id] || (s.mode === "offer" && s.repeatOffer)) && test(save, s.if)) { runQuiet(save, s.mode === "autonomous" ? s.steps || [] : s.absent || []); P.done[s.id] = s.mode === "autonomous" ? "autonomous" : "missed"; }
    if (P.side && P.side.date < d.date) { const s = scene(P.side.id); if (s && !P.done[s.id]) { runQuiet(save, s.absent || []); P.done[s.id] = "missed"; } }
  }
  // ---------- исполнение шагов ----------
  const LINE = ["n", "say", "think", "sys", "msg"];
  // Добыча из сцены: {"loot":{"gate":true,"n":2}} — материал рядовой твари текущих Врат; {"loot":{"id":"MAT-…","n":1}}; {"loot":{"item":"random"}} — вещь ранга Врат из каталога.
  function lootStep(save, L) {
    const data = G.data, h = save.hero, run = save.gateRun, g = run && G.gates.byId(save, run.id), rank = (g && g.rank) || "F", out = [];
    let x = ((save.seed >>> 0) ^ Math.imul((save.day ? save.day.n : 1) * 31 + (g ? G.gates.depth(g) : 0) + 3, 0x9e3779b1)) >>> 0; const r = () => ((x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 1) >>> 0) % 1e6) / 1e6;
    let mats = {}, items = [];
    if (L.gate || L.id) {
      let m = null;
      if (L.id) { const sp = data.bestiary.species.find((s) => s.material && s.material.id === L.id); m = sp && sp.material; }
      else { const pool = data.bestiary.species.filter((s) => s.rank === rank && s.role === "regular" && s.material && !String(s.id).startsWith("H-")); const sp = pool[Math.floor(r() * pool.length)]; m = sp && sp.material; }
      if (m) mats[m.id] = { units: L.n || 1, name: m.name, price_won: m.price_won };
    }
    if (L.item) { const pool = (data.catalog.items || []).filter((it) => it.rank === rank); const it = L.item === "random" ? pool[Math.floor(r() * pool.length)] : (data.catalog.items || []).find((i) => i.id === L.item);
      if (it) items.push({ id: it.id, name: it.name, slot: (it.stats || {}).eq, rank: it.rank, price_won: it.price_won, desc: it.desc, uid: it.id + "@" + save.clock + "#s" + Math.floor(r() * 1e6) }); }
    if (G.sysinv && h.awakened) G.sysinv.addLoot(save, data, mats, items);
    else { h.materials = h.materials || {}; for (const [id, m] of Object.entries(mats)) h.materials[id] = (h.materials[id] || 0) + m.units; (h.items = h.items || []).push(...items); }
  }
  // Событие «?» в обычных Вратах: случайная сцена mode:"gate_event" (по весу, условию и окну дат). repeat:true — может повторяться.
  function gateEvent(save, rand) {
    const P = state(save), d = (save.day || {}).date;
    const pool = D.scenes.filter((s) => s.mode === "gate_event" && (s.repeat || !P.done[s.id]) && (!s.from || s.from <= d) && (!s.to || d <= s.to) && test(save, s.if));
    const sum = pool.reduce((a, s) => a + (s.weight || 1), 0); if (!pool.length) return null;
    let x = rand() * sum; for (const s of pool) { if ((x -= s.weight || 1) < 0) return s.id; } return pool[0].id;
  }
  function apply(save, st) {   // шаги-действия без показа; true — шаг был действием
    const P = state(save), h = save.hero;
    if (st.set) { Object.assign(P.vars, st.set); return true; }
    if (st.add) { for (const [k, n] of Object.entries(st.add)) P.vars[k] = (P.vars[k] || 0) + n; return true; }
    if (st.know) { const q = st.know; if (q.from && q.from !== "siu") { for (const w of [].concat(q.who)) tell(save, q.from, w, q.fact || "awakened"); } else learn(save, q.who, q.fact || "awakened", q.how || "told", { from: q.from, detail: q.detail }); return true; }
    if (st.money !== undefined) { if (st.money) G.hero.charge(h, save.clock, st.money, st.why || "Сюжет"); return true; }
    if (st.roll) {   // случай без Сиу: {"roll":{"var":"x","of":["a","b"],"w":[2,1]}} — по зерну сохранения, повторяемо
      const o = st.roll, w = o.w || o.of.map(() => 1), tot = w.reduce((a, b) => a + b, 0);
      let x = (save.seed >>> 0) ^ 0x9e3779b1; for (const c of String(o.var)) x = Math.imul(x ^ c.charCodeAt(0), 0x01000193) >>> 0;
      x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; let r = (x >>> 0) / 4294967296 * tot, i = 0;
      while (i < w.length - 1 && r >= w[i]) { r -= w[i]; i++; }
      P.vars[o.var] = o.of[i]; return true;
    }
    if (st.stat) { for (const [k, n] of Object.entries(st.stat)) if (h.stats && k in h.stats) h.stats[k] += n; return true; }   // прибавка к базовой характеристике (награда сюжета)
    if (st.perm) { (h.perm_fx || (h.perm_fx = [])).push(Object.assign({ op: "+" }, st.perm)); return true; }   // постоянный эффект, напр. {"k":"mp","v":10,"name":"…"}
    if (st.post) { if (G.news) G.news.add(save, st.post); return true; }   // пост в ленте новостей
    if (st.mail) { if (G.mail) G.mail.send(save, st.mail); return true; }   // письмо на телефон: {app, from, title, text}
    if (st.pay_bill) { const b = G.living && G.living.bills(save).find((x) => x.kind === st.pay_bill); if (b && (h.money || 0) >= b.owe) G.living.pay(save, b.id); return true; }   // оплатить счёт по сюжету, если хватает денег
    if (st.mp !== undefined) { const v = typeof st.mp === "object" ? Math.round(G.system.mpCap(h) * st.mp.pct / 100) : st.mp; if (v > 0) G.system.addMp(h, v); else h.mp = Math.max(0, (h.mp || 0) + v); return true; }   // {"mp":-15} или {"mp":{"pct":40}}
    if (st.pay_var) { const q = st.pay_var, need = Math.max(0, P.vars[q.var] || 0), n = Math.min(need, q.max || need, h.money || 0); if (n > 0) { G.hero.charge(h, save.clock, -n, q.why || "Отдал за друга"); P.vars[q.var] = need - n; } return true; }   // {"pay_var":{"var":"yeonmin_debt"}} — Сиу закрывает из своих
    if (st.hp !== undefined) { const mx = G.system.maxHp(h), v = typeof st.hp === "object" ? Math.round(mx * st.hp.pct / 100) : st.hp; h.hp = Math.max(1, Math.min(mx, (h.hp || 0) + v)); return true; }   // {"hp":{"pct":35}} / {"hp":{"pct":-20}}: сцена не убивает
    if (st.loot) { lootStep(save, st.loot); return true; }
    if (st.gate) { const g = G.gates.spawn(save, G.data, st.gate); Object.assign(g, { story: true, event: st.gate.event || null, events: st.gate.events || null, name: st.gate.name || null }); return true; }   // сюжетные Врата: «?» играет свою сцену   // магия в сцене стоит маны
    if (st.awaken) { if (!h.awakened) G.system.awaken(save, save.clock); return true; }
    if (st.measure) { G.hero.measure(save, G.data, st.measure === true ? "story" : st.measure); return true; }   // замер шаром: фиксирует официальный ранг
    if (st.quest) { G.quests.give(save, Object.assign({ src: "story" }, st.quest)); return true; }
    if (st.kill) { for (const w of [].concat(st.kill)) P.dead[w] = save.clock; return true; }
    if (st.trust) { for (const [w, n] of Object.entries(st.trust)) { const r = save.relations[w] || (save.relations[w] = { met: true, talks: 0, trust: 0 }); r.trust = (r.trust || 0) + n; } return true; }
    if (st.meet) { for (const w of [].concat(st.meet)) { const r = save.relations[w] || (save.relations[w] = { met: false, talks: 0, trust: 0 }); r.met = true; } return true; }
    return false;
  }
  function runQuiet(save, steps) {   // для сцен без Сиу: только действия и ветки, реплики пропускаются
    for (const st of steps || []) {
      if (st.if !== undefined && !st.then && !st.else && !test(save, st.if)) continue;
      if (apply(save, st)) continue;
      if (st.then || st.else) runQuiet(save, test(save, st.if) ? st.then : st.else);
      else if (st.case) { const b = st.case.find((c) => test(save, c.if)); if (b) runQuiet(save, b.steps); }
    }
  }
  function at(sc, path) { let x = sc; for (const k of path) x = x[k]; return x; }
  function start(save, id, ctx) {
    const s = scene(id); if (!s) throw Error("Нет сцены " + id);
    state(save).run = { id, stack: [{ p: ["steps"], i: 0 }], ctx: ctx || {}, cut: s.cut ? cutOf(s) : null };
    if (!s.cut && s.place && G.data && G.data.locById[s.place]) save.hero.location = s.place;
    return view(save);
  }
  // Кат-сцена («Тем временем»): Сиу там нет, игрок видит, герой — не знает. Сцена целиком (cut:true) или кусок шагов {"cut":…}…{"cut":false}.
  const cutOf = (o) => ({ t: typeof o.cut === "string" ? o.cut : "Тем временем", where: o.where || null, place: o.place || null });
  // Текущий показываемый шаг. Действия и ветки исполняются по пути (каждое — один раз).
  function view(save) {
    const P = state(save), R = P.run; if (!R) return null;
    const sc = scene(R.id); if (!sc) { P.run = null; return null; }
    for (let guard = 0; guard < 2000; guard++) {
      const f = R.stack[R.stack.length - 1];
      if (!f) return finish(save);
      const list = at(sc, f.p) || [];
      if (f.i >= list.length) { R.stack.pop(); continue; }
      const st = list[f.i];
      const gated = st.if !== undefined && !st.then && !st.else;   // одиночный шаг с условием: {"say":…, "if":{…}}
      if (gated && !test(save, st.if, R.ctx)) { f.i++; continue; }
      if (apply(save, st)) { f.i++; if (G.quests) G.quests.check(save); continue; }
      if (st.bg) R.bg = st.bg;
      if (st.cut !== undefined) { R.cut = st.cut ? cutOf(st) : null; f.i++; continue; }
      if (st.if !== undefined && (st.then || st.else)) { f.i++; const yes = test(save, st.if, R.ctx); const key = yes ? "then" : "else"; if (st[key]) R.stack.push({ p: f.p.concat(f.i - 1, key), i: 0 }); continue; }
      if (st.case) { f.i++; const j = st.case.findIndex((c) => test(save, c.if, R.ctx)); if (j >= 0) R.stack.push({ p: f.p.concat(f.i - 1, "case", j, "steps"), i: 0 }); continue; }
      if (st.choice !== undefined) {
        const opts = st.options.map((o, k) => ({ k, label: o.label, ok: test(save, o.if, R.ctx), hint: o.hint })).filter((o) => o.ok || o.hint);
        return { kind: "choice", title: st.choice, options: opts };
      }
      if (st.battle) return { kind: "battle", def: st.battle };
      if (st.goto) { const to = st.goto; finish(save); return start(save, to, R.ctx); }
      if (st.end) { P.badend = st.end; const E = (D.endings || {})[st.end] || {}; save.hero.ending = { id: st.end, title: E.title || st.end, text: E.text || "" }; return finish(save, st.end); }
      if (st.draw) { const h = save.hero; if (h.awakened && h.sys && (h.sys.gacha || 0) > 0) return { kind: "draw" }; f.i++; continue; }   // первый выбор карты: экран 32 рубашек; отложить можно
      if (LINE.some((k) => st[k] !== undefined)) return { kind: "line", step: filled(save, st), scene: sc, cut: R.cut || null };
      f.i++;   // неизвестный шаг — пропустить (validate() ловит такие заранее)
    }
    throw Error("Сцена " + R.id + " зациклилась");
  }
  // Переписка: сообщения из сцен и разговоры в чате остаются в телефоне.
  function chatLog(save, who, entry) { const P = state(save), C = P.chat || (P.chat = {}); (C[who] || (C[who] = [])).push(Object.assign({ at: save.clock }, entry)); }
  function advance(save) {
    const R = state(save).run; if (!R) return null; const f = R.stack[R.stack.length - 1];
    if (f) {
      const st = (at(scene(R.id), f.p) || [])[f.i];
      if (st && st.msg !== undefined) chatLog(save, st.from || "unknown", { who: st.from || "unknown", t: st.msg });
      else if (st && R.ctx.chat && !R.cut) chatLog(save, R.ctx.chat, st.say !== undefined ? { who: st.say, t: st.t } : st.n !== undefined ? { who: "narr", t: st.n } : st.think !== undefined ? { who: "think", t: st.think } : { who: "sys", t: [].concat(st.sys).join(" / ") });
      f.i++;
    }
    return view(save);
  }
  function pick(save, k) {
    const P = state(save), R = P.run, v = view(save);
    if (!v || v.kind !== "choice") throw Error("Сейчас нет выбора");
    const o = v.options.find((x) => x.k === k); if (!o || !o.ok) throw Error("Этот вариант недоступен");
    const f = R.stack[R.stack.length - 1], st = at(scene(R.id), f.p)[f.i], opt = st.options[k];
    P.chose[opt.key || R.id + ":" + (st.id || f.i) + ":" + k] = save.clock;
    const own = opt.steps && opt.steps[0] && opt.steps[0].say === "siu";   // ветка сама начинается с ответа Сиу — подпись варианта не дублировать
    if (R.ctx.chat && !own && !opt.quiet) chatLog(save, R.ctx.chat, { who: "siu", t: opt.label.replace(/^«|»$/g, "") });
    f.i++;
    if (opt.steps && opt.steps.length) R.stack.push({ p: f.p.concat(f.i - 1, "options", k, "steps"), i: 0 });
    return view(save);
  }
  function finish(save, bad) {
    const P = state(save), R = P.run; if (!R) return null;
    P.done[R.id] = "played"; P.run = null;
    return { kind: "end", id: R.id, ctx: R.ctx, bad: bad || null };
  }
  // ---------- итог боя ----------
  // Классы исхода — как в «Постоянном правиле реактивности»: flawless (разгром), confident (уверенно), hard (тяжело),
  // fled (бегство), lost (поражение); helped — рядом были союзники.
  function summarize(st) {
    const u = st.units.hero, lostPct = Math.round(100 * Math.max(0, (st.hp0 || u.hpMax) - u.hp) / u.hpMax);
    const style = st.result === "won" ? (lostPct <= 10 ? "flawless" : lostPct <= 40 ? "confident" : "hard") : st.result === "fled" || st.fled ? "fled" : "lost";
    const casts = u.castLog || [];
    return { result: st.result === "won" ? "won" : style === "fled" ? "fled" : "lost", style, hp_lost: lostPct, turns: u.turns || 0,
      magic: casts.some((c) => c.visible), cards: casts.filter((c) => c.visible).map((c) => c.name).filter((x, i, a) => a.indexOf(x) === i),
      helped: (st.allies || []).length > 0, fates: {}, witnesses: [] };
  }
  // Сюжетный бой закончен: записать итог, раздать знания свидетелям, отметить погибших.
  function battleDone(save, st, def) {
    const P = state(save), b = summarize(st);
    (def.enemies || []).forEach((e, i) => {
      const as = typeof e === "object" ? e.as : null; if (!as) return;
      const m = st.units[st.enemies[i]];
      b.fates[as] = !m ? "alive" : m.gone === "surrender" ? "surrendered" : m.gone ? "fled" : m.hp <= 0 ? (st.lethal && !def.spare ? "killed" : "down") : "alive";   // spare — враги-люди без сознания, не убиты
      if (b.fates[as] === "killed") P.dead[as] = save.clock;
    });
    const seers = [].concat(def.witnesses || []).filter((w) => !P.dead[w]);
    for (const [as, f] of Object.entries(b.fates)) if (f !== "killed") seers.push(as);   // выжившие враги тоже видели
    b.witnesses = seers;
    if (b.magic && seers.length) learn(save, seers, "awakened", "saw", { detail: b.cards });
    for (const w of seers) learn(save, w, "fight", "saw", { detail: [b.style] });
    if (def.id) P.battles[def.id] = b;
    const R = P.run; if (R) { const f = R.stack[R.stack.length - 1]; if (f) f.i++; }
    return b;
  }
  // ---------- проверка данных ----------
  function validate(data) {
    const errs = [], S = (data.story || {}).scenes || [], ids = new Set(S.map((s) => s.id)), cast = (data.story || {}).cast || {};
    const known = (w) => w === "siu" || w === "narrator" || w in cast;
    const walk = (steps, where) => (steps || []).forEach((st, i) => {
      const at = where + "#" + i;
      if (st.say !== undefined && !known(st.say)) errs.push(at + ": неизвестный персонаж «" + st.say + "»");
      if (st.goto && !ids.has(st.goto)) errs.push(at + ": переход на несуществующую сцену " + st.goto);
      if (st.end && !(((data.story || {}).endings || {})[st.end])) errs.push(at + ": нет концовки " + st.end);
      if (st.choice !== undefined) { if (!st.options || !st.options.length) errs.push(at + ": выбор без вариантов"); (st.options || []).forEach((o, k) => walk(o.steps, at + "/" + k)); }
      if (st.then || st.else) { walk(st.then, at + "/да"); walk(st.else, at + "/нет"); }
      if (st.case) st.case.forEach((c, k) => walk(c.steps, at + "/" + k));
      const kinds = ["n", "say", "think", "sys", "msg", "choice", "if", "case", "set", "add", "know", "money", "awaken", "measure", "quest", "kill", "trust", "meet", "battle", "goto", "end", "cut", "draw", "mp", "roll", "pay_bill", "post", "mail", "stat", "perm", "hp", "loot", "gate", "pay_var"];
      if (!kinds.some((k) => st[k] !== undefined)) errs.push(at + ": непонятный шаг " + JSON.stringify(st).slice(0, 60));
    });
    for (const s of S) {
      if (!s.id) errs.push("сцена без id");
      if (s.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) errs.push(s.id + ": дата " + s.date);
      if (s.slot && s.slot !== "any" && !SLOTS.includes(s.slot)) errs.push(s.id + ": слот " + s.slot);
      if (s.mode === "side" && s.date) errs.push(s.id + ": у побочного задания не дата, а окно from…to");
      if (s.mode === "autonomous") { const lines = (st) => (st || []).some((x) => ["n", "say", "think", "sys", "msg", "choice", "battle"].some((k) => x[k] !== undefined) || lines(x.then) || lines(x.else) || (x.case || []).some((c) => lines(c.steps))); if (lines(s.steps)) errs.push(s.id + ": в автономной сцене не должно быть реплик, ремарок и выборов — только последствия"); }
      if (s.cut) { const siu = (st) => (st || []).some((x) => x.say === "siu" || x.think !== undefined || x.choice !== undefined || siu(x.then) || siu(x.else) || (x.case || []).some((c) => siu(c.steps))); if (siu(s.steps)) errs.push(s.id + ": в кат-сцене нет Сиу — ни его реплик, ни выборов"); }
      for (const w of s.cast || []) if (!known(w)) errs.push(s.id + ": в составе неизвестный «" + w + "»");
      walk(s.steps, s.id); walk(s.absent, s.id + "/без Сиу");
    }
    return errs;
  }
  return { SLOTS, use, scene, state, name, knows, learn, tell, test, holiday, due, autoDue, offers, onActivity, closeSlot, catchUp, gateEvent,
    free, DERIVED, pickSide, storyNext, chats, chatLog, start, view, advance, pick, finish, summarize, battleDone, validate, runQuiet };
});

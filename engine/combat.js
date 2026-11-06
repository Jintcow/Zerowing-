// Пошаговый бой (Claude, правила t316, «Бой v2» 21.10.2026). Без дальности и клеток: у способности только цель.
// Очередь по скорости (ЛОВ): промежуток между ходами = TIME / скорость, быстрый ходит чаще. «Раунд» — от хода героя до его следующего хода.
// Попадание, крит и стойкость — сравнение характеристик; у монстра видно намерение (сколько — по ВОС); защита по намерению; шкала стойкости (слом).
// Герой: удар, карта из набора (до 5 активных), защита, побег. Монстр: одна функция по своему порядку (фазы босса).
// Союзник (двойник от пассивки) ходит сам сразу после героя и бьёт его цель.
// Всё детерминировано зерном боя: один и тот же бой с теми же действиями даёт тот же итог.
// Движок не трогает сохранение во время боя; итог переносит finish().
// Пассивки героя (поле fx карт) подключены здесь все боевые; проверка покрытия — tools/check_passives.js.
G.define("combat", function (G) {
  const BASIC_PCT = 60;                 // обычный удар — 60% СИЛ
  const CRIT_BASE = 0.05, CRIT_MULT = 1.5;
  const WEAK = 0.25;                    // уязвимость +25% урона
  const MP_REGEN_TURN = 0.02;           // 2% запаса маны в начале хода героя
  const HIT_STEP = 0.05;                // +1 к попаданию / уклонению = 5 п. п.
  const ARMOR_STEP = 5;                 // 1 единица брони монстра = 5 п. п. его защиты
  const CRITFAIL = 0.25;                // доля промахов, которые оборачиваются грубой ошибкой
  const PREP_BREAK = 0.1;               // шанс сорвать подготовку монстра уроном (проверка сохранения подготовки)
  const STAT_KEY = { "СИЛ": "str", "ЛОВ": "agi", "ВЫН": "vit", "ВОС": "per", "МАГ": "mag" };
  const RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];
  // ---- Бой v2 ----
  const TYP0 = { F: 10, E: 20, D: 35, C: 55, B: 80, A: 115, S: 160, SS: 220, SSS: 300 };   // типичная характеристика ранга
  const POISE = { regular: 2, elite: 4, boss: 6 };   // деления стойкости
  const BREAK_DMG = 1.5;                             // урон по сломленному
  const TIME = 1000;                                 // шкала очереди
  const GUARD = 0.5, GUARD_READ = 0.25;              // защита: обычный удар / угаданный сильный удар или заклинание
  const SELF_M = ["shield", "heal", "evade", "buff"];
  const rankIdx = (r) => RANKS.indexOf(r);
  // «урона огнём» в карте → тип уязвимости в бестиарии
  const TYPE_OF = [["огн", "огонь"], ["холод", "холод"], ["лед", "холод"], ["электр", "электричество"], ["молни", "электричество"], ["свет", "свет"],
    ["тень", "тень"], ["тен", "тень"], ["вод", "вода"], ["пар", "пар"], ["ветр", "ветер"], ["камн", "дробление"], ["дробящ", "дробление"],
    ["режущ", "режущее"], ["колющ", "колющее"], ["кислот", "кислота"], ["яд", "яд"], ["звук", "звук"]];
  const typeOf = (s) => { s = String(s || "").toLowerCase(); for (const [a, b] of TYPE_OF) if (s.includes(a)) return b; return ""; };
  const ADAPT = ["огонь", "холод", "электричество", "кислота"];
  const PROJ = /снаряд|стрел|метат|брос|выстрел|игл|осколок|дротик|шип|пуля/i;   // способность-снаряд — «стрелковое попадание»
  const ELEM = ["огонь", "холод", "электричество"];

  function rng(st) { // mulberry32 на счётчике боя
    let a = (st.seed + 0x6d2b79f5 * (++st.rolls)) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const typ = (st, r) => (st.typ || TYP0)[r] || 10;
  // характеристика участника сейчас: герой — с условными прибавками; монстр — из бестиария (нет — типичная для ранга)
  function sv(st, u, k) {
    if (u.side === "hero") return statNow(st, k);
    const v = u.stats && u.stats[k]; return v !== undefined ? v : typ(st, u.rank);
  }
  // стойкость тела: при ВЫН, равной типичной для ранга нападающего, урон как есть; выше — меньше (с убыванием), ниже — больше
  const vitCut = (vit, T) => 5 * T / (Math.max(0, vit) + 4 * T);
  function critChance(st, a, d) { return clamp(0.05 + 0.05 * (sv(st, a, "agi") / Math.max(1, sv(st, d, "agi")) - 1), 0.02, 0.35); }
  function critMult(st, a, d) { return clamp(CRIT_MULT + 0.1 * (sv(st, a, "per") / Math.max(1, sv(st, d, "per")) - 1), 1.25, 2.5); }
  // разница рангов (канон): цель на ранг выше героя ×0,6, на два и больше ×0,3, ниже ×1,3
  function gapMul(st, m) { const g = rankIdx(m.rank) - rankIdx(st.units.hero.rank); return g >= 2 ? 0.3 : g === 1 ? 0.6 : g <= -1 ? 1.3 : 1; }
  const say = (st, text, kind) => st.log.push({ round: st.round, text, kind: kind || "" });
  // события для анимации поз монстров: a — атака, h — получил удар, c — функция, k — погиб
  // события для анимации боя: a — атака, h — получил удар (n — урон), c — способность, g — защита, k — погиб, +  — лечение.
  // hp — здоровье участника сразу после события (интерфейс ведёт полосу здоровья по ходу анимации)
  const fx = (st, u, p, n) => { if (u) (st.fx || (st.fx = [])).push({ u: u.id, p, n: n || 0, hp: Math.max(0, Math.round(u.hp)), g: !!(u.status && u.status.guard) }); };
  // строка из texts.json (GPT t727); если ключа нет — запасной текст
  const T = (st, key, vars, fallback) => { const hv = Object.assign({ hero: st.units.hero ? st.units.hero.name : "Герой" }, vars); const t = G.texts && G.texts.has(key) ? G.texts.line(key, hv, st.log.length) : ""; return t || fallback; };

  // ---------- эффекты пассивок героя в бою ----------
  function pfx(st) { const h = st.units.hero; return h.suppressed > 0 ? [] : h.fx; }
  // when: не задан — только эффекты без условия; строка — ровно это условие; объект — условные эффекты, чьё условие в нём выполнено.
  function wmatch(e, when) { return when === undefined ? !e.when : typeof when === "string" ? e.when === when : !!e.when && !!when[e.when]; }
  function padd(st, key, when) { let s = 0; for (const e of pfx(st)) if (e.k === key && e.op === "+" && typeof e.v === "number" && wmatch(e, when)) s += e.v; return s; }
  function pmul(st, key, when) { let m = 1; for (const e of pfx(st)) if (e.k === key && e.op === "×" && typeof e.v === "number" && wmatch(e, when)) m *= e.v; return m; }
  // есть ли эффект; when — строка условия (точное совпадение) или не задан (любой)
  function phas(st, key, when) { return pfx(st).some((e) => e.k === key && (when === undefined || e.when === when)); }
  function pval(st, key) { const e = pfx(st).find((x) => x.k === key && x.op === "="); return e ? e.v : null; }
  // when — набор признаков текущего действия; условие пассивки выполнено, если оно среди них (или его нет). Число — множитель.
  function whenOk(st, w, ctx) { return !w || (ctx && ctx[w]); }
  const factor = (w, ctx) => (!w ? 1 : typeof ctx[w] === "number" ? ctx[w] : 1);
  function ctxSum(st, key, ctx) { let s = 0; for (const e of pfx(st)) if (e.k === key && e.op === "+" && typeof e.v === "number" && whenOk(st, e.when, ctx)) s += e.v * factor(e.when, ctx); return s; }
  function ctxMul(st, key, ctx) { let m = 1; for (const e of pfx(st)) if (e.k === key && e.op === "×" && typeof e.v === "number" && whenOk(st, e.when, ctx)) m *= e.v; return m; }
  // Реактивные пассивки (ответ на чужое действие) срабатывают раз в 6 ходов; «Быстрые реакции» — раз в ход.
  function reactive(st, key) {
    const h = st.units.hero, cd = pval(st, "reactive_cd") || 6, last = (h.react || (h.react = {}))[key];
    if (last !== undefined && h.turns - last < cd) return false;
    h.react[key] = h.turns; return true;
  }
  // раз в сутки (отметка переносится в сохранение в finish)
  function daily(st, key) { const h = st.units.hero; if (h.daily[key] === st.day) return false; h.daily[key] = st.day; return true; }

  // ---------- создание боя ----------
  function heroUnit(save, data) {
    const h = save.hero, P = G.passives, S = G.system;
    const stats = {};
    const gear = G.gear ? G.gear.combat(save, data) : { atk: 0, spell: 0, energy: false, def: [], profiles: [], sigs: [], weapons: [], wield: { unarmed: true } };
    for (const k of ["str", "agi", "vit", "per", "mag"]) stats[k] = (h.stats ? h.stats[k] : 10) + (P ? P.stat(h, k) : 0) + (G.gear ? G.gear.stat(h, k) : 0);
    const cards = (h.loadout || []).map((id) => G.cards.byId(data, id)).filter((c) => c && c.kind === "active");
    const mpMax = h.awakened && S ? S.maxMp(h) : 0;
    return { id: "hero", side: "hero", name: h.name || "Герой", hp: h.hp, hpMax: S ? S.maxHp(h) : stats.vit * 10,
      mp: h.awakened ? h.mp : 0, mpMax, mpCap: h.awakened && S ? S.mpCap(h) : 0, stats, cards, fx: (P ? P.list(h) : (h.passive_fx || [])).slice(),
      init: stats.agi + Math.floor(stats.per / 2), cd: {}, once: {}, status: {}, shield: 0, shieldT: 0, prep: null, prep2: null,
      turns: 0, hits: 0, firstHit: false, took: false, lastMiss: false, suppressed: 0, rank: rankOf(h),
      bag: Object.assign({}, h.bag || {}), bagInfo: (data.services && data.services.bag_items) || {},
      gear, gearUse: { struck: false, hit: false, sig: [] }, w: gear.wield || {},
      daily: Object.assign({}, h.daily || {}), poisonImm: Object.assign({}, h.poison_imm || {}),
      adapt: Object.fromEntries(Object.entries(h.adapt || {}).filter(([, at]) => G.clock.toMin(save.clock) - G.clock.toMin(at) <= 1440)),
      killsN: 0, stored: 0, lostAcc: 0, storeAcc: 0, elecAcc: 0, armorStack: 0, pending: 0, castStreak: 0, mpMin: h.awakened ? h.mp : 0,
      castTurn: -9, healedTurn: -9, hurtTurn: -9, noRegen: 0, ramp: 0, quiet: 0 };
  }
  function rankOf(h) { return G.hero.powerRank({hero:h}); }
  // Мана монстра: функции кроме простого удара тратят ману (5×2^ранг за раз); запас — на 4/6/12 применений.
  function monsterUnit(sp, n) {
    const ri = Math.max(0, rankIdx(sp.rank)), uses = { regular: 4, elite: 6, boss: 12 }[sp.role] || 4, cost = 5 * Math.pow(2, ri);
    return { id: "m" + n, side: "enemy", species: sp.id, name: sp.name, rank: sp.rank, role: sp.role, biome: sp.biome, hp: sp.hp, hpMax: sp.hp,
      atk: sp.atk, init: sp.init, abilities: sp.abilities, weak: sp.weak, type: sp.dmg_type, energy_only: sp.energy_only,
      def_pct: (sp.abilities.find((a) => a.m === "def_pct") || {}).value || 0,
      resist: sp.abilities.filter((a) => a.m === "resist").map((a) => a.type),
      regen: (sp.abilities.find((a) => a.m === "regen") || {}).value || 0,
      thorns: (sp.abilities.find((a) => a.m === "thorns") || {}).dmg || 0,
      body: sp.body || "", size: +sp.size_m || 0, weapon: sp.weapon || "", mpCost: cost, mp: cost * uses, mpMax: cost * uses,
      cd: {}, status: {}, shield: 0, prep: null, phase: 1, unaware: true, xp: sp.xp, material: sp.material, pool: sp.loot_pool || null, scar: 0, armorBroken: 0,
      stats: Object.assign({}, sp.stats || {}), poise: POISE[sp.role] || 3, poiseMax: POISE[sp.role] || 3, broken: false, plan: [],
      human: !!sp.human, awakened: !!sp.awakened, fearless: !!sp.fearless, cash: sp.cash || null };
  }
  // «Злой двойник»: копия героя без карт и предметов — против него.
  function evilTwin(h) {
    const atk = Math.max(1, Math.round(h.stats.str * BASIC_PCT / 100));
    return { id: "tw", side: "enemy", species: null, name: "Двойник " + h.name, rank: h.rank, role: "regular", biome: "", hp: h.hp, hpMax: h.hpMax,
      atk, init: h.init, abilities: [{ name: "Удар", m: "attack", dmg: atk, prep: 0, cd: 0 }], weak: "", type: "", energy_only: false,
      def_pct: 0, resist: [], regen: 0, thorns: 0, body: "плоть", size: 1.8, weapon: "", mpCost: 0, mp: 0, mpMax: 0,
      cd: {}, status: {}, shield: 0, prep: null, phase: 1, unaware: false, xp: 0, material: null, pool: null, scar: 0, armorBroken: 0, twin: true,
      stats: Object.assign({}, h.stats), poise: 3, poiseMax: 3, broken: false, plan: [] };
  }
  // «Двойник»: союзник с теми же характеристиками, здоровьем и маной, без карт и предметов.
  function allyTwin(h) {
    return { id: "a1", side: "ally", name: "Двойник", hp: h.hp, hpMax: h.hpMax, mp: h.mp, mpMax: h.mpMax, stats: Object.assign({}, h.stats),
      init: h.init - 0.01, rank: h.rank, status: {}, shield: 0, shieldT: 0, cd: {} };
  }

  function start(save, data, speciesIds, opts) {
    opts = opts || {};
    const B = data.bestiary.species, P = G.passives, hh = save.hero;
    for (const id of speciesIds || []) if (id && !String(id).startsWith("H-")) (hh.seen || (hh.seen = {}))[id] = 1;   // бестиарий: встреченные виды
    const cond = (w) => (P ? !!P.cond(save, w) : false);
    const st = { seed: (opts.seed >>> 0) || ((save.seed >>> 0) ^ (G.clock.toMin(save.clock) * 2654435761)) >>> 0, rolls: 0, round: 0,
      units: { hero: heroUnit(save, data) }, enemies: [], allies: [], order: [], turn: -1, log: [], over: false, result: null,
      night: (() => { const hr = G.clock.parts(save.clock).h; return hr >= 21 || hr < 6; })(), test: !!opts.test, fled: false, extra: 0,
      day: save.clock.slice(0, 10), clock: save.clock, ambush: !!opts.ambush, lethal: !!opts.lethal, survive: !!opts.survive, first: opts.first || null,
      // условия мира на момент боя (бой сохранение не трогает)
      w: { hungry: cond("hungry"), sleepless: cond("sleepless"), mp_zero_day: cond("mp_zero_day"), dungeon: !!save.dungeon,
           drunk3: P ? P.since(save, "drink") <= 360 && ((hh.pt || {}).drink_n || 0) >= 3 : false },
      known: Object.assign({}, hh.kills || {}), fought: Object.assign({}, hh.fought || {}),
      typ: (data.cards && data.cards.balance && data.cards.balance.typical_stat) || TYP0, now: 0, cur: null };
    const PP = (data.people && data.people.species) || [];
    speciesIds.forEach((id, i) => { const sp = B.find((s) => s.id === id) || PP.find((s) => s.id === id); if (!sp) throw new Error("Нет такого монстра: " + id); const u = monsterUnit(sp, i + 1); st.units[u.id] = u; st.enemies.push(u.id); });
    const h = st.units.hero;
    st.hp0 = h.hp; h.cardsUsed = 0;
    st.invFree = hh.awakened && Array.isArray(hh.inventory) ? hh.inventory.filter((x) => !x).length : 0;
    // в начале боя: щиты от пассивок, инициатива
    const sh = padd(st, "shield", "battle_start"); if (sh) addShield(st, h, sh, Infinity, "Щит");
    h.initAdd = padd(st, "init");                                                // прибавка к скорости
    let first = phas(st, "first_round") ? "first" : phas(st, "init_last") ? "last" : "";
    // союзники и противники от пассивок
    if (phas(st, "twin")) { const a = allyTwin(h); a.initAdd = padd(st, "ally_init"); st.units[a.id] = a; st.allies.push(a.id); say(st, "Рядом с героем появляется его двойник.", "sys"); }
    // напарники в рейде (наёмник): шаблоны людей, здоровье переносится между залами
    const PPa = (data.people && data.people.species) || [];
    (opts.allies || []).forEach((m, i) => {
      const sp = PPa.find((s) => s.id === m.species); if (!sp || !(m.hp > 0)) return;
      const a = { id: "r" + (i + 1), side: "ally", name: m.name || sp.name, species: sp.id, rank: sp.rank, hp: m.hp, hpMax: sp.hp, mp: 0, mpMax: 0,
        stats: Object.assign({}, sp.stats), init: sp.init, status: {}, shield: 0, shieldT: 0, cd: {}, human: true,
        atkBonus: Math.max(0, sp.atk - Math.round(0.6 * sp.stats.str)) };
      st.units[a.id] = a; st.allies.push(a.id);
    });
    if (st.allies.length && opts.allies) say(st, "Рядом с героем — группа: " + st.allies.map((id) => st.units[id].name).join(", ") + ".", "sys");
    if (phas(st, "evil_twin")) { const tw = evilTwin(h); st.units[tw.id] = tw; st.enemies.push(tw.id); say(st, "Рядом с противником встаёт двойник героя.", "sys"); }
    for (const id of st.allies) { const a = st.units[id], v = padd(st, "ally_shield", "battle_start"); if (v) { a.shield += v; a.shieldT = 5; } }
    if (!st.allies.length) h.initAdd += padd(st, "init", "alone");               // «Одиночка»
    if (phas(st, "decoy")) say(st, "Рядом с героем мерцает его иллюзия.", "sys");
    // засада: монстры первыми и точнее — если нет «Затылочного чутья»
    if (st.ambush && !phas(st, "no_ambush_penalty")) { first = "last"; say(st, "Засада: монстры заметили героя первыми.", "sys"); }
    else if (st.ambush) say(st, "Засада не застала героя врасплох.", "sys");
    // «Остановка времени»: ход в застывшем мире до всех
    if (phas(st, "time_stop")) { first = "first"; st.extra += 1; say(st, "Время вокруг замирает.", "sys"); }
    const names = st.enemies.map((id) => st.units[id].name).join(", ");
    say(st, T(st, "start", { monster: names }, "Бой начался: " + names + "."), "start");
    // очередь: первый ход каждого — через половину своего промежутка (быстрый раньше); ничья — герой, союзник, враги по порядку
    st.round = 1;
    const ids = ["hero"].concat(st.allies, st.enemies);
    ids.forEach((id, k) => { const u = st.units[id]; u.next = interval(st, u) * 0.5 + k * 1e-3; });
    if (first === "first") h.next = -1;
    if (first === "last") h.next = Math.max(...st.enemies.map((id) => st.units[id].next)) + 0.5;
    for (const id of st.allies) st.units[id].next = h.next + 1e-3;
    for (const id of st.enemies) plan(st, st.units[id]);
    runUntilHero(st, data);
    st.t05 = G.secrets ? G.secrets.charges(save, "T05") : 0;
    st.t02 = !!(G.secrets && G.secrets.has(save, "T02") && (!save.hero.t02_at || G.clock.diff(save.hero.t02_at, save.clock) >= 720));
    return st;
  }

  function alive(st, id) { const u = st.units[id]; return u && u.hp > 0 && !u.gone; }
  function liveEnemies(st) { return st.enemies.filter((id) => alive(st, id)); }
  function liveAllies(st) { return st.allies.filter((id) => alive(st, id)); }

  // Скорость: ЛОВ (+ прибавки пассивок к инициативе). Замедленный ходит в полтора раза реже.
  function speed(st, u) {
    const base = u.side === "hero" ? statNow(st, "agi") + (u.initAdd || 0) : (u.stats ? u.stats.agi : typ(st, u.rank)) + (u.initAdd || 0);
    return Math.max(1, base);
  }
  // Разница в ЛОВ ускоряет, но не удваивает ходы сразу: ЛОВ 10 против 5 — 4 хода на 3, а не 2 на 1.
  const SPEED_K = 10;
  function interval(st, u) { return TIME / (speed(st, u) + SPEED_K) * (u.status && u.status.slow ? 1.5 : 1); }
  const order = (st) => ["hero"].concat(liveAllies(st), liveEnemies(st));
  function nextActor(st) {
    let best = null;
    for (const id of order(st)) { const u = st.units[id]; if (best === null || u.next < st.units[best].next - 1e-9) best = id; }
    return best;
  }
  // Ближайшие n ходов (для полосы очереди): без учёта будущих эффектов.
  function queue(st, n) {
    const t = {}, out = []; for (const id of order(st)) t[id] = st.units[id].next;
    if (st.cur && t[st.cur] !== undefined && !st.over) out.push(st.cur);
    while (out.length < (n || 6)) {
      let b = null; for (const id of Object.keys(t)) if (b === null || t[id] < t[b] - 1e-9) b = id;
      if (b === null) break; out.push(b); t[b] += interval(st, st.units[b]);
    }
    return out;
  }

  // Характеристика героя сейчас: с условными прибавками («Злость раненого», «Дневное создание», «Берсерк»).
  function statNow(st, k) {
    const h = st.units.hero, ru = Object.keys(STAT_KEY).find((x) => STAT_KEY[x] === k);
    const ctx = { low_hp: h.hp <= h.hpMax / 2, night: st.night };
    let v = h.stats[k];
    for (const e of pfx(st)) if (e.k === "stat:" + ru && e.when && whenOk(st, e.when, ctx)) v += e.v;
    if (k === "str" && berserk(st)) v += 16;
    return Math.max(0, v);
  }
  const berserk = (st) => phas(st, "berserk") && st.units.hero.hp <= st.units.hero.hpMax / 2;

  // ---------- урон ----------
  // Попадание: 85% плюс 2 п. п. за каждые 10% превосходства ВОС нападающего над ЛОВ цели (от −35 до +13 п. п.).
  function hitChance(st, att, def, ctx) {
    let p = 0.85 + clamp(0.2 * (sv(st, att, "per") / Math.max(1, sv(st, def, "agi")) - 1), -0.35, 0.13);
    if (att.side === "hero") {
      p += HIT_STEP * ctxSum(st, "hit", ctx) - (att.status.blind && !phas(st, "blindfight") ? 0.2 : 0) - (att.status.fear && att.status.fear.src === def.id ? 0.2 : 0);
      if (ctx.melee && berserk(st)) p += 4 * HIT_STEP;
    }
    return clamp(p, 0.3, 0.98);
  }

  // Урон по монстру от героя. base — уже число урона до модификаторов цели.
  function damageEnemy(st, data, m, base, type, ctx, note) {
    const h = st.units.hero;
    if (!alive(st, m.id)) return 0;
    if (m.status.evade) { delete m.status.evade; say(st, m.name + " уходит от удара."); return 0; }
    if (m.energy_only && ((ctx.basic && !phas(st, "atk_energy") && !h.gear.energy) || ctx.nonenergy)) { say(st, T(st, "immune", { monster: m.name }, "Обычный удар не берёт: " + m.name + "."), "miss"); return 0; }
    let d = base * (ctx.pw || 1);
    if (ctx.ability && h.gear.spell) d *= 1 + h.gear.spell / 100;          // магический фокус
    if (h.status.dmgbuff) d *= 1 + h.status.dmgbuff.pct / 100;
    if (m.status.exposed) d *= 1.25;
    if (type && m.weak && type === m.weak) d *= 1 + WEAK;
    if (m.resist.includes(type)) d *= 0.75;
    // стойкость тела цели (ВЫН) против ранга героя; Сила пробивает её физическими ударами
    const Tr = typ(st, h.rank), pierce = ctx.phys ? clamp(0.25 * (statNow(st, "str") / Tr - 1), 0, 0.5) : 0;
    d *= vitCut(sv(st, m, "vit") * (1 - pierce), Tr) * gapMul(st, m);
    if (m.broken) d *= BREAK_DMG;
    // защита монстра: «Пробивной» (ближние), «Раскол брони» (стопки), подавленная функция не действует
    const def = m.status.supp ? 0 : Math.max(0, m.def_pct - ARMOR_STEP * (m.armorBroken + (ctx.melee ? padd(st, "pierce") : 0)));
    d *= 1 - def / 100;
    let crit = false;
    const cc = critChance(st, h, m) * ctxMul(st, "crit", ctx);
    if (rng(st) < cc) { crit = true; d *= critMult(st, h, m) * (phas(st, "double_crit") ? 2 : 1); }
    d = Math.max(1, Math.round(d));
    if (m.shield > 0 && !phas(st, "shield_pierce")) {
      const extra = padd(st, "shieldbreak");                                  // «Щитолом»: по щиту сильнее
      const a = Math.min(m.shield, d + extra); m.shield -= a; d -= Math.max(0, a - extra); if (a) say(st, "Щит " + m.name + " поглощает " + a + ".");
      d = Math.max(0, d);
    }
    m.hp = Math.max(0, m.hp - d); m.unaware = false; m.scar += d; if (d > 0 && m.hp > 0) fx(st, m, "h", d); else if (d > 0) fx(st, m, "k", d);
    if (d > 0) {
      const head = !note || note === "Удар" ? T(st, "hero_attack", { monster: m.name, n: d }, "Удар → " + m.name + ": −" + d + ".") : note + " → " + m.name + ": −" + d + " HP.";
      say(st, head + (crit ? " " + T(st, "hero_crit", {}, "Крит.") : "") + (type && type === m.weak ? " " + T(st, "weak", {}, "Уязвимость.") : ""), "hit");
    }
    if (ctx.echoOf) return d;                                                   // повтор способности не множит эффекты попадания
    // пассивки героя после попадания
    const ls = pmul(st, "lifesteal"); if (ls !== 1 && d > 0) heal(st, h, Math.round(d * ls), "Вампиризм");
    const rv = pmul(st, "reverse_vamp");
    if (rv !== 1 && d > 0) { const x = Math.max(1, Math.round(d * rv)); hurtHero(st, data, x, null, { system: true }); if (m.hp > 0) { m.hp = Math.min(m.hpMax, m.hp + x); m.scar = Math.max(0, m.scar - x); say(st, "Обратный вампиризм: " + m.name + " +" + x + " HP."); } }
    if (crit) { const g = padd(st, "mp", "crit"); if (g) gainMp(st, g); }
    if (!ctx.dot) onHit(st, data, m, d, crit, ctx);                           // попадание засчитано, даже если всё съел щит
    // Шкала стойкости: уязвимость 2, крит 1, сильный удар телом (СИЛ ≥ 1,5× ранга) 1. Обычный удар стойку не сбивает.
    // После восстановления противник «собран» (steady): стойку не сбить, пока он не сделает свой ход — без вечного оглушения.
    if (!ctx.dot && !ctx.echoOf && m.hp > 0 && !m.broken && !m.steady) {
      const k = (type && type === m.weak ? 2 : 0) + (crit ? 1 : 0) + (ctx.phys && statNow(st, "str") >= 1.5 * Tr ? 1 : 0);
      if (k) { m.poise = Math.max(0, m.poise - k); if (m.poise <= 0) breakEnemy(st, m); }
    }
    if (m.thorns && ctx.melee && !m.status.supp) { hurtHero(st, data, m.thorns, m, { reflect: true }); }
    if (m.hp <= 0) onKill(st, data, m, ctx);
    else updatePhase(st, m);
    return d;
  }
  function breakEnemy(st, m) {
    m.broken = true; m.poise = 0; m.prep = null; m.plan = [];
    say(st, T(st, "m_break", { monster: m.name }, "Стойка " + m.name + " сломлена: пропустит ход и получает больше урона."), "phase"); fx(st, m, "brk");
  }
  // Эффекты попадания героя по живой цели.
  function onHit(st, data, m, d, crit, ctx) {
    const h = st.units.hero;
    if (m.hp > 0) {
      if (phas(st, "armor_break") && m.armorBroken < 4) m.armorBroken += padd(st, "armor_break");             // «Раскол брони»
      const dr = padd(st, "mpdrain", "hit"); if (dr && m.mp > 0) { m.mp = Math.max(0, m.mp - dr); }            // «Гасящий удар»
      const wk = padd(st, "weaken", "hit"); if (wk) m.status.wk = wk;                                           // «Ослабляющий удар»
      if (phas(st, "suppress", "hit") && (m.def_pct || m.regen || m.thorns)) { m.status.supp = 1; say(st, "Функции " + m.name + " онемели на ход."); }
      if (phas(st, "dispel", "hit") || (phas(st, "dispel", "unarmed") && ctx.unarmed && rankIdx(m.rank) <= 1)) {
        if (m.shield > 0) { m.shield = 0; say(st, "Щит " + m.name + " рассеян."); }
        else if (m.status.evade) { delete m.status.evade; say(st, "С " + m.name + " снято усиление."); }
      }
      if (!h.firstHits) h.firstHits = {};
      if (phas(st, "mark") && !h.firstHits[m.id]) { m.status.markHero = padd(st, "mark"); say(st, m.name + " отмечен для союзников."); }   // «Метка палача»
      h.firstHits[m.id] = true;
      // подготовку монстра можно сорвать уроном: «Сбиватель» −2 к его проверке; «Срыв» — на крите без проверки
      if (m.prep !== null && m.prep !== undefined) {
        const brk = (crit && phas(st, "interrupt", "crit")) || rng(st) < PREP_BREAK + HIT_STEP * padd(st, "interrupt");
        if (brk) { m.prep = null; plan(st, m); say(st, "Подготовка " + m.name + " сорвана."); }
      }
      if (crit) {
        if (ctx.melee && phas(st, "stun", "crit_melee")) { const resist = m.role === "boss" ? 0.7 : m.role === "elite" ? 0.5 : 0.3; if (rng(st) >= resist) { m.status.stun = 1; say(st, m.name + " оглушён."); } else say(st, m.name + " выдержал удар."); }
        if (phas(st, "blind", "crit")) { m.status.blind = 1; say(st, m.name + " ослеплён вспышкой."); }
        if (phas(st, "disarm", "crit") && m.weapon && !m.disarmed) { m.disarmed = true; m.atk = Math.round(m.atk * 0.6); say(st, "Оружие выбито из рук " + m.name + "."); }
      }
    }
    if (crit) { const ch = padd(st, "chain", "crit"); if (ch) { const o = otherEnemy(st, m); if (o) damageEnemy(st, data, o, ch, "электричество", { dot: true }, "Молния"); } }
    // «Широкий взмах»: меч или топор задевает ещё одного
    if (ctx.basic && h.w.blade) { const cl = padd(st, "cleave"); if (cl) { const o = otherEnemy(st, m); if (o) damageEnemy(st, data, o, cl, "", { dot: true }, "Взмах"); } }
    // «Заряд в снаряде»: вспышка рядом с целью
    if (ctx.ranged) { const sp = padd(st, "splash", "ranged"); if (sp) { const o = otherEnemy(st, m); if (o) damageEnemy(st, data, o, sp, "", { dot: true }, "Вспышка"); } }
  }
  const otherEnemy = (st, m) => { const id = liveEnemies(st).find((x) => x !== m.id); return id ? st.units[id] : null; };
  function onKill(st, data, m, ctx) {
    const h = st.units.hero;
    ctx = ctx || {};
    say(st, T(st, "m_kill", { monster: m.name }, m.name + " погибает."), "kill");
    h.killsN += 1;
    const hk = padd(st, "heal", "kill"); if (hk) heal(st, h, hk, "Трофейный вдох");
    if (phas(st, "cd_reset", "kill")) { const c = h.cards.find((x) => (h.cd[x.id] || 0) > 0 && rankIdx(x.rank) <= 1); if (c) { h.cd[c.id] = 0; say(st, "Жатва: «" + c.name + "» снова готова."); } }
    const ex = padd(st, "explode", "kill"); if (ex) { const o = liveEnemies(st)[0]; if (o) damageEnemy(st, data, st.units[o], ex, "", {}, "Взрыв тела"); }
    const kc = padd(st, "kill_cost"); if (kc) hurtHero(st, data, kc, null, { system: true });
    // «Поглощение остатка»: десятая часть маны жертвы, не больше 20
    const ms = pmul(st, "mp_steal", { kill: true }); if (ms !== 1 && m.mp > 0) { const g = Math.min(20, Math.round(m.mp * ms)); if (g) { gainMp(st, g); say(st, "Поглощение остатка: +" + g + " MP."); } }
    const ah = padd(st, "ally_heal", "kill"); if (ah) for (const id of liveAllies(st)) heal(st, st.units[id], ah, "Воодушевление");
    // «Перескок»: половина урона убившей способности — другому врагу
    if (ctx.ability && ctx.lastDmg) { const oc = pmul(st, "overkill_chain"); if (oc !== 1) { const o = otherEnemy(st, m); if (o) damageEnemy(st, data, o, ctx.lastDmg * oc, "", { ability: true, dot: true }, "Перескок"); } }
    // «Каскад»: после смертельного ближнего удара — сразу удар по другому
    if (ctx.melee && ctx.basic && phas(st, "cascade", "kill") && !ctx.cascade && reactive(st, "cascade")) { const o = otherEnemy(st, m); if (o) { say(st, "Каскад."); heroAttack(st, data, o, { cascade: true }); } }
  }
  function updatePhase(st, m) {
    if (m.role !== "boss") return;
    const p = m.hp <= m.hpMax / 3 ? 3 : m.hp <= m.hpMax * 2 / 3 ? 2 : 1;
    if (p > m.phase) { m.phase = p; plan(st, m); say(st, T(st, "m_phase" + p, { monster: m.name }, m.name + " переходит в фазу " + ["", "I", "II", "III"][p] + "."), "phase"); }
  }
  function heal(st, u, n, why) {
    if (n <= 0 || u.hp <= 0) return 0;
    if (u.side !== "enemy" && phas(st, "no_heal_all")) return 0;                                  // «Иссушитель»
    let cap = u.hpMax;
    if (u.side === "enemy" && phas(st, "no_heal_enemy")) cap = Math.max(0, u.hpMax - u.scar);      // «Клеймо увядания»
    const b = u.hp; u.hp = Math.min(cap, Math.max(u.hp, u.hp + Math.round(n)));
    if (u.hp > b) { say(st, (why ? why + ": " : "") + u.name + " +" + (u.hp - b) + " HP.", "heal"); fx(st, u, "+", u.hp - b); }
    return u.hp - b;
  }
  function gainMp(st, n) {
    const h = st.units.hero; if (!h.mpMax) return;
    if (n < 0) { h.mp = Math.max(0, h.mp + n); return; }
    let v = h.mp;
    if (v < h.mpMax) { const a = Math.min(n, h.mpMax - v); v += a; n -= a; }
    if (n > 0 && h.mpCap > h.mpMax) v += n / 2;                         // «Двойное дно»: сверх максимума вдвое медленнее
    h.mp = Math.min(h.mpCap || h.mpMax, v);
  }
  function spendMp(st, n) { const h = st.units.hero; h.mp = Math.max(0, h.mp - n); h.mpMin = Math.min(h.mpMin, h.mp); if (h.mp <= 0 && h.mpMax) onMpZero(st); }
  // «Мана-пиявка»: на нуле маны — забрать у союзника
  function onMpZero(st) {
    const h = st.units.hero, v = padd(st, "mp_leech", "mp_zero"); if (!v) return;
    const a = liveAllies(st).map((id) => st.units[id]).find((x) => x.mp > 0); if (!a) return;
    const g = Math.min(v, a.mp); a.mp -= g; gainMp(st, g); say(st, "Мана-пиявка: +" + Math.round(g) + " MP у союзника.");
  }
  // Щит на герое: «Отторжение щитов» — не держится; «Цепкие щиты» — дольше.
  function addShield(st, u, n, turns, why) {
    n = Math.round(n); if (n <= 0) return;
    if (u.side === "hero" && phas(st, "no_shields")) { say(st, "Щит не держится на герое."); return; }
    u.shield += n; u.shieldT = Math.max(u.shieldT || 0, turns + (u.side === "hero" ? padd(st, "shield_turns") : 0));
    if (why) say(st, why + " " + n + ".");
  }

  // Урон по герою. o: system (Система, без защит), reflect, ranged, ability, type, trap, deferred.
  function hurtHero(st, data, n, src, o) {
    o = o || {}; const h = st.units.hero;
    if (h.hp <= 0 || h.doomed) return 0;
    if (h.status.invuln && !o.system) { say(st, "Неуязвимость: урон не проходит."); return 0; }
    const type = o.type !== undefined ? o.type : src && src.side === "enemy" ? src.type || "" : "";
    let d = n;
    if (!o.system && !o.reflect) {
      if (phas(st, "elem_immune") && ELEM.includes(type)) { say(st, "Тело стихий: " + type + " не ранит героя."); return 0; }
      if (phas(st, "mind_immune") && type === "психическое") { say(st, "Щит разума: психический урон не проходит."); return 0; }
      // «Тело врат»: без маны героя не ранить — обычные удары F–E неэнергетические
      if (phas(st, "energy_only_dmg") && src && src.side === "enemy" && rankIdx(src.rank) < 2 && !o.ability && !o.trap) { say(st, "Удар " + src.name + " не берёт героя: в нём нет маны."); return 0; }
      if (h.status.guard) { if (o.heavy) { d *= GUARD_READ; guardRead(st); } else d *= GUARD; }
      // «Слепая дуга» (T02): раз в 12 ч первый энергетический удар ранга не выше B — примерно на треть слабее
      // «Клинок сухого прилива» (T05): удачная защита от энергетического удара рассеивает отдачу (7 срабатываний на весь срок)
      if (st.t05 > 0 && h.status.guard && src && src.side === "enemy" && (rankIdx(src.rank) >= 2 || o.ability)) { d *= 0.5; st.t05 -= 1; st.t05used = (st.t05used || 0) + 1; say(st, "Сухое лезвие приняло удар — отдача рассыпалась солёной пылью."); }
      if (st.t02 && !st.t02used && src && src.side === "enemy" && (rankIdx(src.rank) >= 2 || o.ability) && rankIdx(src.rank) <= 4) { d *= 0.67; st.t02used = true; say(st, "Браслет на руке дрогнул: удар ослаб."); }
      if (src && src.side === "enemy") {                                   // стойкость тела, снаряжение: защита по рангу и профильное преимущество
        d *= vitCut(statNow(st, "vit"), typ(st, src.rank));
        d *= 1 - G_def(h, src.rank) / 100;
        if (src.biome && h.gear.profiles.includes(src.biome)) d *= 1 - PROFILE_CUT;
      }
      const ctx = { first_hit_taken: !h.took, low_hp: h.hp < h.hpMax / 4, big_hit: n > 20, same_attacker: !!(src && src.status && src.status.lesson > 0),
        clothes: !h.gear.topArmor, no_armor: !h.gear.armored, dual: !!h.w.dual, ranged: !!o.ranged && !o.ability, guard: !!h.status.guard, shield: !!h.gear.offhand };
      // броня без условия («Подогнанная», «Хрупкая») — только если броня надета
      d -= ctxSum(st, "def", ctx) + padd(st, "armor", ctx) + (h.gear.armored ? padd(st, "armor") : 0) + h.armorStack + (h.allyDied && phas(st, "avenge") ? 4 : 0);
      if (h.status.guard) d -= ctxSum(st, "guard", ctx);                     // «Второй клинок»: блок с двумя клинками
      d += padd(st, "dmg_taken");
      if (src && (rankIdx(src.rank) >= 2 || o.ability)) d += padd(st, "energy_dmg_taken");   // «Контурная уязвимость»
      d *= 1 - padd(st, "res_all") / 100;                                   // «Закалка»
      if (ADAPT.includes(type) && h.adapt[type]) d *= 1 - padd(st, "adapt_res") / 100;      // «Адаптация»
      if (o.trap) d *= pmul(st, "trap_dmg");
      const cap = pmul(st, "dmg_cap"); if (cap !== 1) d = Math.min(d, h.hpMax * cap);
    }
    d = Math.max(o.system ? 1 : 0, Math.round(d));
    if (h.shield > 0 && !o.system) {
      const a = Math.min(h.shield, d); h.shield -= a; d -= a; if (a) say(st, "Щит поглощает " + a + ".");
      if (h.shield <= 0 && a > 0) { h.shieldT = 0; const sb = padd(st, "shield_burst"); if (sb) { say(st, "Щит взрывается."); for (const id of liveEnemies(st)) damageEnemy(st, data, st.units[id], sb, "", { dot: true }, "Взрыв щита"); } }
    }
    // «Мана-щит»: пока есть мана, урон не опускает здоровье ниже 1
    if (phas(st, "mana_shield") && h.mp > 0 && h.hpMax && h.mpMax && h.hp - d < 1) {
      const over = d - (h.hp - 1), need = over * h.mpMax / h.hpMax, pay = Math.min(h.mp, need);
      spendMp(st, pay); const saved = Math.round(pay * h.hpMax / h.mpMax); d -= saved; say(st, "Мана-щит гасит " + saved + " урона.");
    }
    // «Отсроченная рана»: урон приходит одной суммой в начале следующего хода героя
    if (phas(st, "delayed_dmg") && !o.deferred && d > 0) { h.pending += d; say(st, "Рана откладывается: −" + d + " в начале хода."); return d; }
    h.hp = Math.max(0, h.hp - d); h.took = true; if (d > 0) fx(st, h, h.hp <= 0 ? "k" : "h", d);
    if (d > 0) { h.hurtTurn = h.turns; h.quiet = 0; }
    if (d > 0 && src && !o.system) h.gearUse.hit = true;
    if (h.hp > 0 && src && src.side === "enemy" && h.status.retaliate && !o.reflect) damageEnemy(st, data, src, h.status.retaliate.dmg, "", { dot: true }, "Ответная реакция");
    if (d > 0) say(st, src && src.side === "enemy" ? T(st, "m_attack", { monster: src.name, n: d }, src.name + " бьёт: −" + d + " HP.") : (src ? src.name + ": " : o.system ? "Система: " : "") + "−" + d + " HP.", "hurt");
    if (d > 0) afterHurt(st, data, d, src, o, type);
    if (d > 0 && h.status.guard && src) { const g = padd(st, "mp", "guard"); if (g) gainMp(st, g); }     // «Ковка маны»
    // урон во время подготовки — проверка сохранения подготовки («Толстая концентрация», «Рассеянная концентрация», «Отдача срыва»)
    if (d > 0 && (h.prep || h.prep2) && !o.deferred) {
      const g = padd(st, "prep_guard");
      if (!(g > 0 && d <= g) && (o.stun || (g < 0 && rng(st) < -g * HIT_STEP))) {   // решение заказчика 26.10: урон подготовку героя не срывает — только оглушение (и негативное свойство «Рассеянная концентрация»)
        h.prep = null; h.prep2 = null; say(st, "Подготовка героя сорвана.", "miss");
        const ic = padd(st, "interrupt_cost"); if (ic) hurtHero(st, data, ic, null, { system: true });
      }
    }
    // «Второе дыхание» — раз в сутки
    const ho = padd(st, "heal_once", "quarter_hp"); if (ho && h.hp > 0 && h.hp < h.hpMax / 4 && daily(st, "heal_once")) heal(st, h, ho, "Второе дыхание");
    // «Второй контур» — раз в сутки, ниже десятой части
    if (h.hp > 0 && h.hp < h.hpMax / 10 && phas(st, "mp_full", "near_death") && h.mpMax && daily(st, "mp_full")) { h.mp = Math.max(h.mp, h.mpMax); say(st, "Второй контур: мана полна.", "sys"); }
    if (h.hp > 0 && src && !o.reflect && !o.ranged) {
      const th = padd(st, "thorns", "melee") + (h.status.guard ? padd(st, "thorns", "guard") : 0);
      if (th) damageEnemy(st, data, src, th, "", { dot: true }, "Ответ");
    }
    if (h.hp <= 0) {
      if (phas(st, "survive_once") && !h.once.survive) { h.once.survive = true; h.hp = 1; say(st, "Нерушимость: герой остаётся на 1 HP.", "sys"); }
      else if (phas(st, "last_stand") && !h.once.last) { h.once.last = true; h.hp = 1; say(st, "Железная воля: герой остаётся на 1 HP.", "sys"); }
      else if (phas(st, "last_turn") && !h.once.lastTurn) { h.once.lastTurn = true; h.hp = 1; h.doomed = true; say(st, "Предсмертный хрип: у героя ещё один ход.", "sys"); }
    }
    return d;
  }
  // Последствия полученного урона.
  function afterHurt(st, data, d, src, o, type) {
    const h = st.units.hero, enemy = src && src.side === "enemy";
    if (enemy) src.status.lesson = 5;                                                       // «Выученный урок»
    if (h.status.guard && enemy) h.guardHit = true;                                         // «Отбитые руки»
    const mfd = padd(st, "mp_from_dmg"); if (mfd) { h.lostAcc += d; const k = Math.floor(h.lostAcc / 20); if (k) { h.lostAcc -= 20 * k; gainMp(st, k * mfd); } }
    const sd = padd(st, "store_dmg"); if (sd) { h.storeAcc += d; const k = Math.floor(h.storeAcc / 20); if (k) { h.storeAcc -= 20 * k; h.stored = Math.min(48, h.stored + k * sd); } }
    if (enemy && phas(st, "armor_stack")) h.armorStack = Math.min(16, h.armorStack + padd(st, "armor_stack"));
    if (type === "огонь") { const f = pmul(st, "fire_to_mp"); if (f !== 1) gainMp(st, d * f); }
    if (type === "электричество") { const e = padd(st, "mp_from_elec"); if (e) { h.elecAcc += d; const k = Math.floor(h.elecAcc / 5); if (k) { h.elecAcc -= 5 * k; gainMp(st, k * e); } } }
    if (ADAPT.includes(type) && phas(st, "adapt_res") && !h.adapt[type]) { h.adapt[type] = st.clock; h.adaptNew = true; say(st, "Адаптация: сопротивление «" + type + "» на сутки.", "sys"); }
    if (enemy && h.hp > 0 && !o.reflect) {
      if (!o.ranged && !o.ability) { const r = pmul(st, "reflect", { melee: true }); if (r !== 1) damageEnemy(st, data, src, d * r, "", { dot: true }, "Зеркальная боль"); }
      if (d > h.hpMax / 4) { const rt = padd(st, "retaliate", "big_hit"); if (rt && reactive(st, "retaliate")) damageEnemy(st, data, src, rt, type, { dot: true }, "Эхо боли"); }
      if (o.ability) { const rf = padd(st, "reflect", "ability_taken"); if (rf) damageEnemy(st, data, src, rf, "звук", { dot: true }, "Звонкий отклик"); }
      if (phas(st, "berserk_target") && alive(st, src.id)) h.status.rage = src.id;              // «Горячая голова»
      if (!o.ranged && phas(st, "aura")) src.status.burn = true;                               // «Жгучая аура»
    }
    if (phas(st, "panic", "half_hp") && !h.once.panic && h.hp > 0 && h.hp < h.hpMax / 2) { h.once.panic = true; h.status.panic = 2; say(st, "Паника: два хода герой может только защищаться или отходить.", "sys"); }
  }

  const PROFILE_CUT = 0.15;
  // Защита угадала сильный удар или заклинание: +10% маны и следующий ход раньше (раз за ход защиты).
  function guardRead(st) {
    const h = st.units.hero; if (h.guardRead) return; h.guardRead = true;
    if (h.mpMax) gainMp(st, h.mpMax * 0.1);
    h.next -= interval(st, h) * 0.5;
    say(st, T(st, "guard_read", {}, "Защита угадана: удар принят на блок, следующий ход раньше."), "sys");
  }
  function G_def(h, rank) { return G.gear ? G.gear.defAgainst(h.gear.def, rank) : 0; }
  // Сигнатурные свойства вещей: сила — урон героя ранга вещи (balance.hero_dmg).
  function gearSig(st, data, g, target) {
    const h = st.units.hero, P = g.power, live = () => liveEnemies(st).map((id) => st.units[id]);
    switch (g.kind) {
      case "next_strike": h.status.nextx = 2.5; break;
      case "stun": if (target.role !== "boss" || rng(st) < 0.5) { target.status.stun = 1; say(st, target.name + " оглушён."); } else say(st, target.name + " устоял."); break;
      case "shield": addShield(st, h, h.hpMax * 0.2, 5, "Щит"); break;
      case "dmgbuff": h.status.dmgbuff = { pct: 25, turns: 3 }; break;
      case "weaken": target.status.weaken = { pct: 30, turns: 3 }; break;
      case "invuln": h.status.invuln = 1; break;
      case "expose": target.status.exposed = 3; break;
      case "retaliate": h.status.retaliate = { dmg: Math.round(P * 0.5), turns: 3 }; break;
      case "resist": h.status.resist = { v: 40, turns: 3 }; break;
      case "evade": h.status.evade = 1; break;
      case "triple": for (const m of [target].concat(live().filter((u) => u !== target)).slice(0, 3)) damageEnemy(st, data, m, P, "", { ability: true }, "«" + g.name + "»"); break;
      case "zone": for (const m of live()) m.status.dot = { dmg: Math.round(P * 0.3), turns: 3, type: "" }; break;
      case "blast": for (const m of live()) damageEnemy(st, data, m, P * 1.5, "", { ability: true }, "«" + g.name + "»"); break;
      case "heal": heal(st, h, h.hpMax * 0.25, "«" + g.name + "»"); break;
      case "dot": target.status.dot = { dmg: Math.round(P * 0.4), turns: 4, type: "" }; break;
    }
  }

  // ---------- действия героя ----------
  // Почему нельзя применить способность сейчас (запреты пассивок) — или "".
  function castBlock(st, c) {
    const h = st.units.hero, r = rankIdx(c.rank || "F");
    if (berserk(st)) return "Берсерк: только драться";
    if (phas(st, "no_cast", "night") && st.night) return "Ночью способности не работают";
    if (phas(st, "no_cast", "sleepless") && st.w.sleepless) return "Без сна — без магии";
    if (phas(st, "no_cast", "higher_rank_ally") && liveAllies(st).some((id) => rankIdx(st.units[id].rank) > rankIdx(h.rank))) return "Рядом старший по рангу";
    if (phas(st, "no_cast_above_F", "hungry") && st.w.hungry && r > 0) return "Натощак — только ранг F";
    if (phas(st, "no_cast_above_D", "mp_zero_day") && (st.w.mp_zero_day || h.mpMin <= 0) && r > 2) return "Выжат: только до ранга D";
    return "";
  }
  function cardState(st, c) {
    const h = st.units.hero;
    if (h.prep && !(phas(st, "double_prep") && !h.prep2)) return { ok: false, error: "Идёт подготовка" };
    if (c.once && h.once[c.id]) return { ok: false, error: "Уже применена в этом бою" };
    if ((h.cd[c.id] || 0) > 0) return { ok: false, error: "Перезарядка " + h.cd[c.id] };
    const bl = castBlock(st, c); if (bl) return { ok: false, error: bl };
    const cost = mpCost(st, c);
    // «Кровавый контур»: нехватку маны платит здоровьем, 2 HP за 1 MP
    const hpm = pmul(st, "hp_for_mp"), lack = Math.max(0, cost - h.mp);
    if (lack > 0 && !(hpm !== 1 && h.hp > lack * hpm)) return { ok: false, error: "Мало маны: нужно " + cost };
    if (!usableInBattle(c)) return { ok: false, error: "Только вне боя" };
    return { ok: true, cost, hpCost: lack > 0 ? Math.ceil(lack * hpm) : 0 };
  }
  function mpCost(st, c) {
    const h = st.units.hero;
    if (h.status.domain) return 0;
    const multi = c.target === "few" || c.target === "all";
    let m = c.mp * pmul(st, "mpcost") * (h.mp > h.mpMax / 2 ? pmul(st, "mpcost", { half_mp: true }) : 1) * (multi ? pmul(st, "mpcost", { multi: true }) : 1);
    if (phas(st, "overload")) m *= 2;                                         // «Перегрузка»
    for (const e of pfx(st)) if (e.k === "mpcost" && e.op === "+" && (!e.when || e.when === "rank_" + c.rank)) m += e.v;
    if (h.castTurn >= h.turns - 1) m += padd(st, "mpcost", "chain");             // «Цепной контур»
    return Math.max(c.mp > 0 ? 1 : 0, Math.round(m));
  }
  function usableInBattle(c) {
    if (c.src === "claude") return !!c.effect && Object.keys(c.effect).length > 0;
    if ((c.fx || []).length) return true;
    return (c.effects || []).some((e) => e.model === "stat" || e.model === "resistance" || e.model === "dispel" || e.model === "suppress" ||
      (e.params && ["extra_action", "cleanse_self", "resource_anchor"].includes(e.params.kind)));
  }

  // Что герою разрешено в этот ход (паника, перегрев, ярость, бегство, добавочное действие).
  function limits(st) {
    const h = st.units.hero;
    if (h.forceFlee) return { only: ["flee"], why: "Герой бежит" };
    if (h.status.panic) return { only: ["guard", "flee"], why: "Паника" };
    if (h.status.overheat) return { only: ["guard", "flee"], why: "Перегрев" };
    if (h.status.rage && alive(st, h.status.rage)) return { only: ["attack"], target: h.status.rage, why: "Герой бросается на обидчика" };
    if (h.bonusOnly) return { only: ["guard", "item", "pass"], why: "Добавочное действие" };
    if (h.digging) return { only: ["item"], why: "Роется в рюкзаке" };
    return null;
  }
  function actions(st) {
    const h = st.units.hero, L = limits(st), okT = (t) => !L || L.only.includes(t);
    const busy = !!h.prep && !phas(st, "double_prep");
    const list = [{ type: "attack", label: "Удар", ok: !busy && okT("attack"), target: L && L.target },
      { type: "guard", label: "Защита", ok: !busy && okT("guard") },
      { type: "flee", label: "Бежать", ok: !busy && okT("flee") && !h.status.bind && !h.status.no_flee && !phas(st, "no_flee") }];
    for (const [id, n] of Object.entries(h.bag)) { const it = h.bagInfo[id]; if (n > 0 && it && it.battle) list.push({ type: "item", item: id, label: it.name + " ×" + n + (h.digging === id ? " (достать)" : ""), ok: !busy && okT("item") && (!h.digging || h.digging === id) }); }
    if (h.bonusOnly) list.push({ type: "pass", label: "Дальше", ok: true });
    // Касание (t355, канон инвентаря: «можно забрать вещь, которую держит другой, даже без согласия»): забрать оружие у человека
    if (h.awakened) for (const id of liveEnemies(st)) { const u = st.units[id]; if (u.human && !u.disarmed && (u.weapon || u.awakened)) list.push({ type: "touch", target: id, label: "Касание: забрать оружие — " + u.name, ok: !busy && okT("touch") && st.invFree, error: st.invFree ? "" : "Инвентарь полон" }); }
    for (const g of h.gear.sigs) list.push({ type: "gear", slot: g.slot, label: "«" + g.name + "»", hint: g.label, ok: !busy && okT("gear") && !h.once["gear:" + g.slot], error: h.once["gear:" + g.slot] ? "Уже использовано" : "" });
    if (phas(st, "blood_heal") && liveAllies(st).length) list.push({ type: "blood", label: "Дать крови союзнику", ok: !busy && okT("blood") && h.hp > 16 });
    const fd = fingerTarget(st); if (phas(st, "finger_death")) list.push({ type: "finger", label: "Касание конца", target: fd && fd.id, ok: !!fd && okT("finger") && !busy, error: fd ? "" : "Нет добитой цели F–B" });
    for (const c of h.cards) { const s = cardState(st, c); list.push({ type: "card", card: c.id, label: c.name, ok: s.ok && okT("card"), error: s.ok && !okT("card") ? L.why : s.error, cost: s.cost !== undefined ? s.cost : mpCost(st, c) }); }
    return list;
  }
  // «Касание конца»: рядовой F–B с четвертью здоровья или меньше
  function fingerTarget(st) { const id = liveEnemies(st).find((x) => { const m = st.units[x]; return m.role === "regular" && rankIdx(m.rank) <= 4 && m.hp <= m.hpMax / 4; }); return id ? st.units[id] : null; }

  // Обычный удар героя. o: minus (штраф к попаданию), cascade, note, counter.
  function heroAttack(st, data, target, o) {
    o = o || {};
    const h = st.units.hero;
    if (!target || !alive(st, target.id)) return null;
    const ranged = !!h.w.ranged;
    const ctx = heroCtx(st, target, { melee: !ranged, ranged, basic: true, phys: true, cascade: !!o.cascade });
    let p = hitChance(st, h, target, ctx) - HIT_STEP * (o.minus || 0);
    if (phas(st, "always_hit")) p = 1;                                            // «Неотвратимость»
    h.lastTarget = target.id;
    if (rng(st) > p) { heroMiss(st, data, target, ctx); return { hit: false }; }
    h.lastMiss = false; h.hits += 1; h.gearUse.struck = true; h.dodged = null; h.guardHit = false; fx(st, h, "a");
    const stat = phas(st, "melee_uses_mag") && !ranged ? h.stats.mag : statNow(st, "str");   // «Магическая мускулатура»
    let base = stat * BASIC_PCT / 100 + ctxSum(st, "atk", ctx) + (h.disarmedT > 0 ? 0 : h.gear.atk) + takeStored(st) + (h.allyDied ? padd(st, "avenge") : 0);
    if (h.status.nextx) { base *= h.status.nextx; delete h.status.nextx; }
    const d = damageEnemy(st, data, target, base, "", ctx, o.note || "Удар"); h.firstHit = true;
    return { hit: true, dmg: d, killed: target.hp <= 0 };
  }
  // Промах: «Цена промаха», грубая ошибка («Несчастливая рука», «Скользкие руки», «Отдача», «Капризный контур»).
  function heroMiss(st, data, target, ctx) {
    const h = st.units.hero;
    say(st, T(st, "miss", {}, "Промах."), "miss"); h.lastMiss = true; fx(st, h, "a"); fx(st, target, "miss");
    const mc = padd(st, "miss_cost"); if (mc) hurtHero(st, data, mc, null, { system: true });
    if (rng(st) < CRITFAIL * pmul(st, "critfail")) {
      say(st, "Грубая ошибка.", "miss");
      if (phas(st, "fumble", "crit_fail") && !h.w.unarmed) { h.disarmedT = 2; say(st, "Оружие выпало из руки: два хода без него."); }
      const sd = pmul(st, "self_dmg", { crit_fail: true }); if (sd !== 1) hurtHero(st, data, Math.max(1, Math.round((statNow(st, "str") * BASIC_PCT / 100 + h.gear.atk) * sd)), null, { system: true });
      const ml = -padd(st, "mp", { crit_fail: true }); if (ml > 0) spendMp(st, ml);
    }
  }
  const takeStored = (st) => { const h = st.units.hero, s = h.stored; h.stored = 0; return s; };

  function act(st, data, a) {
    if (st.over) return { ok: false, error: "Бой окончен" };
    if (st.cur !== "hero") return { ok: false, error: "Сейчас не ход героя" };
    const h = st.units.hero, L = limits(st);
    if (L && !L.only.includes(a.type)) return { ok: false, error: L.why };
    let target = a.target && alive(st, a.target) ? st.units[a.target] : st.units[liveEnemies(st)[0]];
    if (L && L.target) target = st.units[L.target];
    // «Рыцарский кодекс»: упавшего, связанного или бегущего не бьют — ни ударом, ни способностью по одной цели
    const helpless = (u) => u.status.bind || u.status.down || u.fleeing;
    if (phas(st, "chivalry") && target && (a.type === "attack" || a.type === "card") && helpless(target)) {
      const other = liveEnemies(st).map((id) => st.units[id]).find((u) => !helpless(u));
      if (!other) return { ok: false, error: T(st, "px_refuse_chivalry", {}, "Рыцарский кодекс: лежачего, связанного и бегущего герой не бьёт") };
      target = other;
    }
    let kind = "main";
    if (a.type === "attack") {
      const cnt = h.w.dual && phas(st, "double_attack", "dual") ? 2 : 1;            // «Два клинка»: две атаки с −2
      const minus = cnt === 2 ? -padd(st, "double_attack", { dual: true }) : 0;
      for (let i = 0; i < cnt && target && alive(st, target.id); i++) heroAttack(st, data, target, { minus });
      // «Круговой удар»: при двух и больше врагах — ещё один, оба с −2
      const ca = padd(st, "cleave_all"); const o2 = target && otherEnemy(st, target);
      if (ca && o2 && !h.w.ranged) heroAttack(st, data, o2, { minus: -ca, note: "Круговой удар" });
      if (h.status.rage) delete h.status.rage;
      h.castStreak = 0;
    } else if (a.type === "touch") {
      // нужно дотянуться: ЛОВ героя против ЛОВ цели; удача — оружие уходит в инвентарь Системы, удар цели — кулаками
      const p = clamp(0.55 + 0.25 * (statNow(st, "agi") / Math.max(1, sv(st, target, "agi")) - 1), 0.2, 0.9);
      if (rng(st) < p) {
        const old = target.atk, bare = Math.max(1, Math.round(0.6 * (target.stats.str || 10))), k = bare / Math.max(1, old);
        target.atk = bare; target.disarmed = true;
        for (const ab of target.abilities) if (ab.m === "attack" && ab.dmg) ab.dmg = Math.max(1, Math.round(ab.dmg * k));
        st.seized = (st.seized || []).concat([target.weapon || "оружие пробуждённого"]); st.invFree -= 1;
        say(st, T(st, "touch_weapon_ok", {}, "Касание удалось: оружие перешло в инвентарь Системы.") + " " + T(st, "touch_enemy_reaction_ok", {}, ""), "sys");
      } else say(st, T(st, "touch_weapon_fail", {}, target.name + " отдёргивает руку с оружием."), "miss");
    } else if (a.type === "guard") {
      h.status.guard = 1; say(st, T(st, "guard", {}, "Герой защищается.")); fx(st, h, "g");
      if (phas(st, "heal")) { const g = padd(st, "heal", "idle_turn"); if (g) heal(st, h, g, "Передышка"); }
      if (h.bonusOnly) kind = "bonus"; else h.castStreak = 0;
    } else if (a.type === "pass") {
      kind = "bonus";
    } else if (a.type === "flee") {
      delete h.forceFlee; h.castStreak = 0;
      const boss = liveEnemies(st).some((id) => st.units[id].role === "boss");
      let p = (boss ? 0.3 : 0.6) + 0.01 * (h.stats.agi - 10) + 0.1 * padd(st, "flee");     // «Мнимая смерть»: +10% за ступень
      if (h.status.stealth) p = 1;
      if (rng(st) < clamp(p, 0.05, 1)) { st.over = true; st.fled = true; st.result = "fled"; say(st, T(st, "flee_ok", {}, "Герой уходит из боя."), "end"); return { ok: true }; }
      say(st, T(st, "flee_fail", {}, "Уйти не удалось."), "miss");
      kind = "flee";
    } else if (a.type === "item") {
      const it = h.bagInfo[a.item];
      if (!it || !(h.bag[a.item] > 0)) return { ok: false, error: "Нет такого" };
      // «Бардак в рюкзаке»: сначала целый ход ищет вещь
      if (phas(st, "item_full_turn") && h.digging !== a.item) { h.digging = a.item; say(st, "Герой роется в рюкзаке."); }
      else {
        delete h.digging; h.bag[a.item] -= 1;
        // лекарство — чужое лечение: «Отзывчивое тело», «Непереносимость лечения», «Отторжение помощи»
        let n = ((it.heal || 0) + (it.heal_pct ? h.hpMax * it.heal_pct / 100 : 0)) * pmul(st, "potion") + padd(st, "heal_in");
        if (phas(st, "no_external_help")) { n = 0; say(st, "Отторжение помощи: " + it.name + " не действует."); }
        heal(st, h, Math.max(0, n), it.name);
      }
      if (h.bonusOnly) kind = "bonus";
    } else if (a.type === "gear") {
      const g = h.gear.sigs.find((x) => x.slot === a.slot);
      if (!g || h.once["gear:" + g.slot]) return { ok: false, error: "Свойство уже использовано" };
      h.once["gear:" + g.slot] = true; h.gearUse.sig.push(g.slot);
      say(st, "«" + g.name + "»: " + g.label.toLowerCase() + ".", "card");
      gearSig(st, data, g, target);
    } else if (a.type === "blood") {
      const al = liveAllies(st).map((id) => st.units[id]).sort((x, y) => x.hp / x.hpMax - y.hp / y.hpMax)[0];
      if (!al) return { ok: false, error: "Некому" };
      hurtHero(st, data, 16, null, { system: true }); heal(st, al, padd(st, "blood_heal"), "Целебная кровь");
    } else if (a.type === "finger") {
      const m = fingerTarget(st); if (!m) return { ok: false, error: "Нет добитой цели F–B" };
      say(st, "Касание конца: " + m.name + " умирает мгновенно.", "kill"); m.hp = 0; onKill(st, data, m, {});
    } else if (a.type === "card") {
      const c = h.cards.find((x) => x.id === a.card);
      if (!c) return { ok: false, error: "Такой карты нет в наборе" };
      const s = cardState(st, c); if (!s.ok) return s;
      const pay = Math.min(h.mp, s.cost); spendMp(st, pay);
      if (s.hpCost) hurtHero(st, data, s.hpCost, null, { system: true });
      h.cardsUsed = (h.cardsUsed || 0) + 1;
      // для сюжета: что видели со стороны. Видна любая энергетическая способность; карта может явно задать visible.
      { const full = G.cards.byId(data, c.id) || c; const vis = full.visible !== undefined ? !!full.visible : (full.effects || []).some((e) => e.energy);
        (h.castLog || (h.castLog = [])).push({ id: c.id, name: c.name || full.name, visible: vis }); }
      if (c.prep > 0 && !(phas(st, "instant_first2") && (h.instants = (h.instants || 0) + 1) <= 2)) {
        const slot = h.prep ? "prep2" : "prep";
        h[slot] = { card: c.id, target: target && target.id, left: c.prep };
        say(st, T(st, "prep", { card: c.name }, "Подготовка: «" + c.name + "»."), "prep");
      } else release(st, data, c, target);
      // «Перегрев»: три выпуска подряд — следующий ход только отойти или защищаться
      h.castStreak += 1; const oh = padd(st, "overheat"); if (oh && h.castStreak >= oh) { h.status.overheat = 1; h.castStreak = 0; say(st, "Перегрев: следующий ход герой только отходит.", "sys"); }
    } else return { ok: false, error: "Неизвестное действие" };
    if (h.status.panic && kind !== "bonus") { h.status.panic -= 1; if (h.status.panic <= 0) delete h.status.panic; }
    if (h.status.overheat && a.type !== "card" && kind !== "bonus") delete h.status.overheat;
    endHeroTurn(st, data, kind);
    return { ok: true };
  }

  function heroCtx(st, target, extra) {
    const h = st.units.hero, w = h.w || {}, al = liveAllies(st).length;
    return Object.assign({
      first_hit: !h.firstHit, target_half: target && target.hp < target.hpMax / 2, boss: target && target.role === "boss",
      third_hit: (h.hits + 1) % 3 === 0, target_unaware: target && target.unaware, after_miss: h.lastMiss, night: st.night,
      low_hp: h.hp < h.hpMax / 2, untouched: !h.took, alone: !al, outnumbered: liveEnemies(st).length >= 2, ability: false,
      last_standing: true,
      unarmed: !!w.unarmed || h.disarmedT > 0, one_handed: !!w.one_handed, two_handed: !!w.two_handed, dual: !!w.dual, new_weapon: !!w.new_weapon,
      after_dodge: !!(target && h.dodged === target.id), after_cast: h.turns === h.castTurn + 1, after_heal: h.turns === h.healedTurn + 1,
      after_guard: !!h.guardHit, first_turns: h.turns <= 2, kill_stack: Math.min(3, h.killsN),
      known_species: !!(target && st.known[target.species]), spider: !!(target && /пау/i.test(target.name)), big_target: !!(target && target.size >= 4),
      stone_metal: !!(target && ["камень", "металл"].includes(target.body)), casting: !!(target && target.prep !== null && target.prep !== undefined),
      shooter: !!(target && target.shotRound >= st.round - 1), per_ally: Math.min(4, al),
      avenge: !!(target && h.avengeOn === target.id && h.avengeT > 0), drunk_round3: st.w.drunk3 && st.round >= 3, weakness: false,
      combo: !!(target && target.allyHit !== undefined && target.allyHit >= h.turns - 1),
    }, extra || {});
  }

  // Срабатывание карты героя (сразу или после подготовки). o.pw — сила (эхо ½), o.echo — повтор без эффектов попадания.
  function release(st, data, c, target, o) {
    o = o || {};
    const h = st.units.hero;
    if (!target || !alive(st, target.id)) target = st.units[liveEnemies(st)[0]];
    say(st, (o.echo ? "Эхо: " : "") + T(st, "card", { card: c.name }, "«" + c.name + "»."), "card"); fx(st, h, "c");
    {                                                                             // для анимации: стихия, цель, по всем ли
      const dm = (c.effects || []).find((e) => e.damage_type), ev = st.fx[st.fx.length - 1];
      ev.el = dm ? dm.damage_type : (c.effects || []).some((e) => /heal/.test(e.model || "")) ? "heal" : "buff";
      ev.t = dm && target ? target.id : null; ev.all = c.target === "all";
    }
    let pw = (o.pw || 1) * (phas(st, "overload") ? 1.5 : 1);                   // «Перегрузка»: сильнее в полтора раза
    if (!o.echo) {
      if (c.once) h.once[c.id] = true; else h.cd[c.id] = Math.max(0, Math.round((c.cooldown || 0) * pmul(st, "cd")));
      h.castTurn = h.turns;
      if (phas(st, "mpregen", "after_cast")) h.noRegen = 3;                      // «Голодный контур»
      const self = padd(st, "self_dmg", "cast"); if (self) hurtHero(st, data, self, null, { system: true });
      if (rankIdx(c.rank || "F") >= 4) { const sb = pmul(st, "self_dmg", { cast_B: true }); if (sb !== 1) hurtHero(st, data, Math.max(1, Math.round(h.hpMax * sb)), null, { system: true }); }   // «Шрамы контура»
      if (rng(st) < (pmul(st, "fizzle") !== 1 ? pmul(st, "fizzle") : 0)) { say(st, "Способность сработала впустую.", "miss"); return; }
      const mv = padd(st, "mpmax", "cast"); if (mv) h.mpBurn = (h.mpBurn || 0) - mv;   // «Выгорание»: после боя максимум маны меньше
      // «Эхо способности»: первая активная в бою повторится через ход с половиной силы
      if (!h.echoDone && pmul(st, "echo") !== 1) { h.echoDone = true; h.echoQ = { card: c.id, target: target && target.id, pw: pmul(st, "echo") }; }
    }
    const targets = (tg) => {
      const live = liveEnemies(st).map((id) => st.units[id]);
      if (tg === "all" || (tg === "few" && phas(st, "multi_to_all"))) return live;
      if (tg === "few") return [target].concat(live.filter((u) => u !== target)).slice(0, 3);
      return target ? [target] : [];
    };
    if (c.src === "claude") return releaseClaude(st, data, c, target, targets, pw);
    const tg = c.target || "one", area = tg === "all" || tg === "few";
    let harmful = false, hitN = 0, missN = 0, areaDmg = 0;
    for (const f of c.fx || []) {
      const stat = h.stats[STAT_KEY[f.stat] || "mag"];
      const val = (f.pct || 0) * stat / 100 * pw;
      if (f.m === "dmg") {
        harmful = true;
        const bonus = o.echo ? 0 : h.ramp + takeStored(st) + (h.allyDied ? padd(st, "avenge") : 0);
        for (const m of targets(tg)) {
          const ty = typeOf(f.type);
          const ctx = heroCtx(st, m, { ability: true, nonenergy: c.energy === false, weakness: !!ty && ty === m.weak, echoOf: !!o.echo, ranged: PROJ.test(c.name + " " + (c.desc || "")), phys: f.stat === "СИЛ" || f.stat === "ЛОВ" });
          let p = hitChance(st, h, m, ctx) + HIT_STEP * padd(st, "hit", "ability"); if (phas(st, "always_hit")) p = 1;
          if (rng(st) > p) { say(st, "«" + c.name + "» мимо: " + m.name + ".", "miss"); missN++; continue; }
          const base = val + (o.echo ? 0 : ctxSum(st, "atk", ctx)) + bonus;
          ctx.lastDmg = base;
          const d = damageEnemy(st, data, m, base, ty, ctx, "«" + c.name + "»"); hitN++; areaDmg += d;
        }
        if (!o.echo) { const rp = padd(st, "ramp"); if (rp) h.ramp = Math.min(16, h.ramp + rp); }   // «Нарастающий контур»
      } else if (f.m === "dot") {
        harmful = true;
        for (const m of targets(tg)) if (alive(st, m.id)) { m.status.dot = { dmg: Math.round(val), turns: f.turns + padd(st, "dur"), type: typeOf(f.type) }; hitN++; say(st, m.name + " горит: " + Math.round(val) + " за ход, " + f.turns + " х."); }
      } else if (f.m === "heal") healCard(st, data, c, val);
      else if (f.m === "shield") {
        const al = liveAllies(st).map((id) => st.units[id]);
        if ((c.target === "ally" || c.target === "allies") && al.length) for (const a of al) addShield(st, a, (val + padd(st, "heal_out")) * pmul(st, "heal_out"), f.turns || c.dur || 5, "Щит на " + a.name);
        else addShield(st, h, Math.round(val) + padd(st, "shield_in"), f.turns || c.dur || 5, "Щит");
      }
      else if (f.m === "mp") { for (const m of targets(tg)) { const n = Math.min(m.mp, Math.round(val)); m.mp -= n; say(st, n ? "«" + m.name + "» теряет " + n + " маны." : "У «" + m.name + "» нет маны — урон по мане не действует."); } }
      else if (f.m === "hp_regen") h.status.regen = { hp: Math.round(val), turns: f.turns };
      else if (f.m === "mp_regen") h.status.mpregen = { mp: Math.round(val), turns: f.turns };
      else if (f.m === "evade") { h.status.evade = 1; say(st, "Следующая атака по герою пройдёт мимо."); }
    }
    if (harmful && !o.echo) {
      if (hitN >= 3) { const g = padd(st, "mp", "multi_hit3"); if (g) { gainMp(st, g); say(st, "Урожай площади: +" + g + " MP."); } }            // «Урожай площади»
      if (!hitN && missN && phas(st, "cd_reset", "all_miss")) { h.cd[c.id] = 0; say(st, "Вторая попытка контура: перезарядка сброшена."); }
      if (area && areaDmg > 0) areaSide(st, data, areaDmg / Math.max(1, hitN));
    }
    for (const e of c.effects || []) {
      if (e.model === "stat") {
        const k = STAT_KEY[{ STR: "СИЛ", AGI: "ЛОВ", END: "ВЫН", PER: "ВОС", MAG: "МАГ" }[e.stat]] || "str";
        if ((e.value || 0) > 0) { h.status.buff = h.status.buff || {}; h.status.buff[k] = { v: e.value, turns: c.dur || 5 }; h.stats[k] += e.value; say(st, "+" + e.value + " " + k.toUpperCase() + " на " + (c.dur || 5) + " х."); }
        else for (const m of targets(tg === "self" || tg === "ally" ? "one" : tg)) { m.status.weaken = { pct: clamp(-e.value * 2, 5, 50), turns: c.dur || 5 }; say(st, m.name + " ослаблен: удар −" + m.status.weaken.pct + "%."); }
      } else if (e.model === "resistance") { h.status.resist = { v: e.value || 10, turns: c.dur || 5 }; say(st, "Сопротивление +" + (e.value || 10) + " п. п."); }
      else if (e.model === "dispel") { for (const m of targets("one")) { m.shield = 0; m.status = {}; say(st, "С «" + m.name + "» сняты эффекты."); } }
      else if (e.model === "suppress") { for (const m of targets("one")) { m.def_pct = 0; m.regen = 0; m.thorns = 0; say(st, "Пассивные свойства «" + m.name + "» подавлены."); } }
      else if (e.params && e.params.kind === "extra_action") { st.extra += 1; say(st, "Разрыв хода: ещё одно действие.", "sys"); }
      else if (e.params && e.params.kind === "cleanse_self") { for (const k of ["bind", "no_flee", "slow", "blind", "fear", "dot", "mark"]) delete h.status[k]; say(st, "С героя сняты все эффекты."); }
      else if (e.params && e.params.kind === "resource_anchor") { h.status.anchor = { hp: h.hp, mp: h.mp, turns: 5 }; say(st, "Состояние запомнено на 5 ходов."); }
    }
  }
  // Область задевает своих: союзников (без «Избирательного контура») и героя («Сам под раздачу»).
  function areaSide(st, data, d) {
    const sa = pmul(st, "self_area"); if (sa !== 1) hurtHero(st, data, Math.max(1, Math.round(d * sa)), null, { system: true, ability: true });
    if (!phas(st, "area_spares_allies")) for (const id of liveAllies(st)) hurtAlly(st, data, st.units[id], d * 0.5, null, { friendly: true });
  }
  // Лечение картой: себя или союзника (цель «союзник»). «Кровожадный», «Взаимное исцеление», «Тяжёлая рука лекаря».
  function healCard(st, data, c, n) {
    const h = st.units.hero;
    const allies = liveAllies(st).map((id) => st.units[id]);
    const toAlly = (c.target === "ally" || c.target === "allies") && allies.length;
    if (toAlly && phas(st, "no_heal_others", "combat") && liveEnemies(st).length) { say(st, "Кровожадный: лечить других, пока жив враг, герой не может."); heal(st, h, n, "«" + c.name + "»"); h.healedTurn = h.turns; return; }
    if (toAlly) {
      const nOut = (n + padd(st, "heal_out")) * pmul(st, "heal_out");                    // «Щедрый контур», «Скупые руки»
      for (const a of c.target === "allies" ? allies : [allies.sort((x, y) => x.hp / x.hpMax - y.hp / y.hpMax)[0]]) {
        const got = heal(st, a, nOut, "«" + c.name + "»");
        const hurt = padd(st, "heal_out_hurts"); if (hurt) hurtAlly(st, data, a, hurt, null, { friendly: true, raw: true });
        if (phas(st, "heal_mirror") && got > 0) heal(st, h, got, "Взаимное исцеление");
      }
    } else heal(st, h, n, "«" + c.name + "»");
    h.healedTurn = h.turns;
  }

  // Карты из старого набора Claude (призыв, скрытность, контроль, уникальные, проклятые активные).
  function releaseClaude(st, data, c, target, targets, pw) {
    const h = st.units.hero, e = c.effect || {};
    pw = pw || 1;
    if (e.hp_cost) hurtHero(st, data, h.hpMax * e.hp_cost, null, { system: true });
    if (e.dmg) {
      const stat = h.stats[e.dmg.stat] || h.stats.mag;
      let el = e.dmg.el === "random" ? ["огонь", "холод", "электричество"][Math.floor(rng(st) * 3)] : typeOf(e.dmg.el === "fire" ? "огн" : e.dmg.el === "ice" ? "холод" : e.dmg.el || "");
      if (e.backfire && rng(st) < e.backfire) { hurtHero(st, data, stat * e.dmg.k, null, { system: true }); say(st, "Магия ударила по самому герою."); }
      else {
        let sum = 0, n = 0;
        for (const m of targets(e.dmg.aoe ? "all" : "one")) {
          const d = damageEnemy(st, data, m, stat * e.dmg.k * pw, el, heroCtx(st, m, { ability: true, weakness: el === m.weak, phys: e.dmg.stat === "str" || e.dmg.stat === "agi" }), "«" + c.name + "»");
          sum += d; n++;
          if (e.recoil) hurtHero(st, data, d * e.recoil, null, { system: true });
          if (e.lifesteal) heal(st, h, d * e.lifesteal, "Похищение сил");
        }
        if (e.dmg.aoe && sum > 0) areaSide(st, data, sum / Math.max(1, n));
      }
      if (e.self_kill) { h.hp = 0; say(st, "Последняя искра сжигает героя.", "end"); }
    }
    if (e.control) for (const m of targets(e.control.aoe ? "all" : "one")) {
      if (rng(st) < e.control.chance) { m.status[e.control.type] = e.control.turns; say(st, m.name + ": " + { stun: "оглушён", slow: "замедлен", fear: "напуган" }[e.control.type] + " на " + e.control.turns + " х."); }
      else say(st, m.name + " устоял.");
    }
    if (e.summon) { h.status.summon = { k: e.summon.k, n: e.summon.n || 1, turns: e.summon.turns }; say(st, "Призванные существа вступают в бой."); }
    if (e.stealth) { h.status.stealth = e.stealth; h.status.evade = 1; say(st, "Враги теряют героя из виду."); }
    if (e.buff) { h.status.dmgbuff = { pct: (e.buff.dmg || 0) * 100 * pw, turns: e.buff.turns }; say(st, "Урон героя +" + Math.round(e.buff.dmg * 100 * pw) + "% на " + e.buff.turns + " х."); }
    if (e.mp_restore) { h.mp = h.mpMax; say(st, "Мана восстановлена."); }
    if (e.party_invuln) { h.status.invuln = e.party_invuln; say(st, "Неуязвимость на " + e.party_invuln + " х."); }
    if (e.domain) { h.status.domain = e.domain; say(st, e.domain + " х. способности без маны и перезарядки."); }
    if (e.echo) { h.status.echo = { k: e.echo.k, turns: e.echo.turns }; say(st, "Тень-двойник повторяет удары."); }
  }

  function endHeroTurn(st, data, kind) {
    const h = st.units.hero;
    if (h.doomed) { h.hp = 0; h.doomed = false; say(st, "Герой падает.", "end"); }
    if (!st.over && h.hp > 0 && liveEnemies(st).length) {
      // «Двойной темп»: к основному действию — защита или предмет
      if (st.bonus && kind === "main") { st.bonus = false; h.bonusOnly = true; return; }
      h.bonusOnly = false;
      if (st.extra > 0) { st.extra -= 1; return; }
    }
    h.bonusOnly = false;
    checkEnd(st);
    if (!st.over) runUntilHero(st, data);
  }

  function checkEnd(st) {
    if (st.over) return true;
    if (st.units.hero.hp <= 0) { st.over = true; st.result = "lost"; say(st, T(st, "lost", {}, "Герой погиб."), "end"); return true; }
    if (!liveEnemies(st).length) { st.over = true; st.result = "won"; say(st, T(st, "won", {}, "Победа."), "end"); return true; }
    return false;
  }

  // ---------- ход по очереди ----------
  function runUntilHero(st, data) {
    for (let guard = 0; guard < 400 && !st.over; guard++) {
      const id = nextActor(st); if (!id) return;
      const u = st.units[id];
      st.now = u.next; u.next += interval(st, u); st.cur = id;
      if (id === "hero" && u.turns > 0) st.round += 1;
      if (!startTurn(st, data, u)) { if (checkEnd(st)) return; continue; }
      if (checkEnd(st)) return;
      if (id === "hero") {
        const h = u, dp = phas(st, "double_prep");
        // подготовки: выпуск занимает ход; «Параллельный контур» — две сразу и без потери хода
        let released = false;
        for (const slot of ["prep", "prep2"]) {
          const pr = h[slot]; if (!pr) continue;
          pr.left -= 1;
          if (pr.left <= 0) {
            const c = h.cards.find((x) => x.id === pr.card); let t = st.units[pr.target]; h[slot] = null;
            if (!t || !alive(st, t.id)) {                                            // цель пропала: «Перенаведение» — в ближайшую допустимую
              if (phas(st, "retarget")) { t = st.units[liveEnemies(st)[0]] || null; if (t) say(st, "Перенаведение: «" + c.name + "» уходит в " + t.name + "."); }
              else { say(st, "«" + c.name + "»: цели больше нет — подготовка ушла впустую.", "miss"); released = true; continue; }
            }
            release(st, data, c, t); released = true;
            if (checkEnd(st)) return;
          } else if (!dp) say(st, "Подготовка продолжается.");
        }
        if (!h.prep && h.prep2) { h.prep = h.prep2; h.prep2 = null; }
        if (!dp && (released || h.prep)) continue;
        return; // ждём действие игрока
      }
      if (u.side === "ally") { allyTurn(st, data, u); if (checkEnd(st)) return; continue; }
      monsterTurn(st, data, u);
      if (checkEnd(st)) return;
    }
  }

  // Начало хода: длительные эффекты, восстановление. false — ход пропущен.
  function startTurn(st, data, u) {
    const S = u.status;
    if (u.side === "hero") {
      u.turns += 1; u.quiet += 1;
      delete S.guard; u.guardRead = false;
      for (const k of ["bind", "invuln", "stealth", "domain"]) if (S[k]) { S[k] -= 1; if (S[k] <= 0) delete S[k]; }
      for (const k of ["no_flee", "blind", "fear", "slow", "mark"]) if (S[k]) { S[k].turns -= 1; if (S[k].turns <= 0) delete S[k]; }
      if (u.suppressed > 0) u.suppressed -= 1;
      if (u.disarmedT > 0) u.disarmedT -= 1;
      if (u.avengeT > 0) u.avengeT -= 1;
      // «Отсроченная рана»
      if (u.pending > 0) { const p = u.pending; u.pending = 0; say(st, "Отсроченная рана: −" + p + " HP.", "hurt"); hurtHero(st, data, p, null, { system: true, deferred: true }); if (u.hp <= 0) return false; }
      // щиты: срок и «Рассыпающийся щит»
      if (u.shield > 0) {
        const dec = padd(st, "shield_decay"); if (dec) u.shield = Math.max(0, u.shield - dec);
        if (u.shieldT !== Infinity) { u.shieldT -= 1; if (u.shieldT <= 0) { u.shield = 0; say(st, "Щит рассеивается."); } }
      }
      // «Самовосстанавливающийся щит»: 10 ходов без урона
      const ns = padd(st, "shield", "no_dmg10"); if (ns && u.quiet >= 10 && u.shield <= 0) { addShield(st, u, ns, Infinity, "Самовосстанавливающийся щит"); u.quiet = 0; }
      // «Упрямая плоть»: если с начала прошлого хода был урон
      if (u.hurtTurn >= u.turns - 1) { const g = padd(st, "regen", "hurt_last_turn"); if (g) heal(st, u, g, "Упрямая плоть"); }
      // мана
      const reg = u.mpMax * MP_REGEN_TURN * pmul(st, "mpregen_combat") * (u.mp <= 0 ? pmul(st, "mpregen", { mp_zero: true }) : 1) * pmul(st, "mpregen", { dark: st.night || st.w.dungeon });
      if (u.noRegen > 0) u.noRegen -= 1;
      else if (u.mpMax && !phas(st, "no_mpregen_all") && !phas(st, "mpregen_only_sleep")) gainMp(st, reg);
      if (u.turns % 3 === 0) { const g = padd(st, "mp", "third_turn"); if (g) gainMp(st, g); }
      const rg = padd(st, "regen") + (S.regen ? S.regen.hp : 0); if (rg) heal(st, u, rg, "Восстановление");
      if (S.regen && --S.regen.turns <= 0) delete S.regen;
      if (S.mpregen) { gainMp(st, S.mpregen.mp); if (--S.mpregen.turns <= 0) delete S.mpregen; }
      if (S.dot) {
        // «Запоздалая боль»: первый тик не ранит
        if (S.dot.fresh && phas(st, "dot_skip")) say(st, "Запоздалая боль: первый тик не ранит.");
        else hurtHero(st, data, S.dot.dmg, null, { system: false, ranged: true, type: S.dot.type || "" });
        delete S.dot.fresh; if (S.dot && --S.dot.turns <= 0) delete S.dot;
      }
      if (S.delayed) { say(st, "Срабатывает ловушка."); hurtHero(st, data, S.delayed.dmg, null, { ranged: true, trap: true }); delete S.delayed; }
      if (S.summon) { const t = liveEnemies(st)[0]; if (t) damageEnemy(st, data, st.units[t], u.stats.mag * S.summon.k * S.summon.n, "", {}, "Призванные"); if (--S.summon.turns <= 0) delete S.summon; }
      if (S.anchor && --S.anchor.turns <= 0) { u.hp = Math.max(1, S.anchor.hp); u.mp = S.anchor.mp; say(st, "Якорь состояния: HP и MP возвращаются.", "sys"); delete S.anchor; }
      if (S.buff) for (const [k, b] of Object.entries(S.buff)) if (--b.turns <= 0) { u.stats[k] -= b.v; delete S.buff[k]; }
      for (const k of Object.keys(u.cd)) if (u.cd[k] > 0 && !S.domain) u.cd[k] -= 1;
      if (S.dmgbuff && --S.dmgbuff.turns <= 0) delete S.dmgbuff;
      if (S.resist && S.resist.turns && --S.resist.turns <= 0) delete S.resist;
      if (S.retaliate && --S.retaliate.turns <= 0) delete S.retaliate;
      if (u.hp <= 0) return false;
      // «Неуловимый» и «Скользкий»: путы держат хуже
      if (S.bind && padd(st, "escape") && rng(st) < 0.25 * padd(st, "escape")) { delete S.bind; say(st, "Герой выскальзывает из захвата."); }
      // «Эхо способности»
      if (u.echoQ) { const q = u.echoQ; u.echoQ = null; const c = u.cards.find((x) => x.id === q.card); const t = st.units[q.target]; if (c && liveEnemies(st).length) release(st, data, c, t && alive(st, t.id) ? t : null, { pw: q.pw, echo: true }); if (checkEnd(st)) return false; }
      // пропуски хода: «Окаменение по ночам», «Ритуал» / «Медленный ум»
      if (phas(st, "petrify", "night") && st.night) { say(st, "Ночь: герой окаменел и не может пошевелиться.", "sys"); return false; }
      if (st.round === 1 && phas(st, "skip_first_turn") && !u.once.skip) { u.once.skip = true; say(st, "Первый ход герой тратит на свой ритуал.", "sys"); return false; }
      // «Ускоренное время» и «Двойной темп»
      if (phas(st, "double_turn")) st.extra = Math.max(st.extra, 1);
      st.bonus = phas(st, "extra_action");
      return u.hp > 0;
    }
    if (u.side === "ally") {
      const rg = padd(st, "ally_regen"); if (rg) heal(st, u, rg, "Целебное присутствие");
      if (u.mpMax) u.mp = Math.min(u.mpMax, u.mp + u.mpMax * MP_REGEN_TURN * pmul(st, "ally_mpregen"));
      if (u.shield > 0 && u.shieldT !== Infinity && --u.shieldT <= 0) u.shield = 0;
      return u.hp > 0;
    }
    // монстр
    if (S.enemyBuff && --S.enemyBuff.turns <= 0) delete S.enemyBuff;
    if (u.regen && !u.status.supp) heal(st, u, u.regen);
    if (S.burn) { delete S.burn; const a = padd(st, "aura"); if (a) { damageEnemy(st, data, u, a, "огонь", { dot: true }, "Жгучая аура"); if (u.hp <= 0) return false; } }
    if (S.dot) { const d = Math.max(1, Math.round(S.dot.dmg * (S.dot.type && S.dot.type === u.weak ? 1 + WEAK : 1))); u.hp = Math.max(0, u.hp - d); u.scar += d; fx(st, u, u.hp > 0 ? "h" : "k", d); say(st, u.name + " −" + d + " (длительный урон)."); if (--S.dot.turns <= 0) delete S.dot; if (u.hp <= 0) { onKill(st, data, u); return false; } updatePhase(st, u); }
    if (S.weaken && --S.weaken.turns <= 0) delete S.weaken;
    if (S.exposed && --S.exposed <= 0) delete S.exposed;
    if (S.lesson && --S.lesson <= 0) delete S.lesson;
    for (const k of Object.keys(u.cd)) if (u.cd[k] > 0) u.cd[k] -= 1;
    if (u.broken) { u.broken = false; u.steady = true; u.poise = u.poiseMax; plan(st, u); say(st, T(st, "m_recover", { monster: u.name }, u.name + " приходит в себя.")); return false; }   // сломленная стойка: ход пропущен
    u.steady = false;
    if (S.stun) { S.stun -= 1; if (S.stun <= 0) delete S.stun; say(st, u.name + " оглушён и пропускает ход."); return false; }
    if (S.fear && rng(st) < 0.5) { S.fear -= 1; if (S.fear <= 0) delete S.fear; say(st, u.name + " в страхе медлит."); return false; }
    if (S.slow) { S.slow -= 1; if (S.slow <= 0) delete S.slow; }
    if (st.round === 1 && phas(st, "lower_rank_skip_first") && rankIdx(u.rank) < rankIdx(st.units.hero.rank) && u.role === "regular") { say(st, u.name + " в страхе пропускает ход."); return false; }
    return true;
  }

  // ---------- союзник ----------
  function allyTurn(st, data, a) {
    const h = st.units.hero;
    const tid = h.lastTarget && alive(st, h.lastTarget) ? h.lastTarget : liveEnemies(st)[0]; if (!tid) return;
    const m = st.units[tid];
    let p = 0.85 + HIT_STEP * ctxSum(st, "ally_hit", { marked: tid === h.lastTarget });          // «Наводчик»
    if (rng(st) > p) { say(st, a.name + " промахивается."); return; }
    let d = a.stats.str * BASIC_PCT / 100 + (a.atkBonus || 0) + (m.status.markHero || 0);       // «Метка палача»; у напарника — оружие
    d *= 1 - (m.status.supp ? 0 : m.def_pct) / 100;
    d = Math.max(1, Math.round(d));
    if (m.shield > 0) { const x = Math.min(m.shield, d); m.shield -= x; d -= x; }
    fx(st, a, "a"); m.hp = Math.max(0, m.hp - d); m.unaware = false; m.allyHit = h.turns; fx(st, m, m.hp > 0 ? "h" : "k", d);
    if (d > 0) say(st, a.name + " → " + m.name + ": −" + d + " HP.", "hit");
    if (m.hp <= 0) { m.killedBy = "ally"; onKill(st, data, m, {}); } else updatePhase(st, m);
  }
  // Урон по союзнику. «Командир отряда»/«Слабое звено», «Страж», «Общая боль», «Гнев павших», «Смертельная связь», «Бегство».
  function hurtAlly(st, data, a, n, src, o) {
    o = o || {}; const h = st.units.hero;
    if (a.hp <= 0) return 0;
    let d = n;
    if (!o.raw) d -= padd(st, "ally_def");
    const gd = pmul(st, "guardian"); if (gd !== 1 && !o.friendly && h.hp > 0) { const part = d * (1 - gd); d -= part; say(st, "Страж: герой принимает часть удара."); hurtHero(st, data, part, src, { ranged: true }); }
    d = Math.max(0, Math.round(d));
    if (a.shield > 0) { const x = Math.min(a.shield, d); a.shield -= x; d -= x; }
    a.hp = Math.max(0, a.hp - d); if (d > 0) fx(st, a, a.hp > 0 ? "h" : "k", d);
    if (d > 0) say(st, (src ? src.name + " → " : "") + a.name + ": −" + d + " HP.", "hurt");
    const sp = pmul(st, "shared_pain"); if (sp !== 1 && d > 0) hurtHero(st, data, Math.max(1, Math.round(d * sp)), null, { system: true });
    if (src && a.hp > 0 && a.hp < a.hpMax / 4 && phas(st, "atk", "avenge")) { h.avengeOn = src.id; h.avengeT = 5; }   // «Месть»
    if (a.hp <= 0) {
      say(st, a.name + " падает.", "kill"); h.allyDied = true; st.allyDown = true;
      if (phas(st, "avenge")) say(st, "Гнев павших: удары героя сильнее до конца боя.", "sys");
      const dl = padd(st, "death_link"); if (dl) hurtHero(st, data, dl, null, { system: true });
      if (phas(st, "flee", "ally_down")) { h.forceFlee = true; say(st, "Герой срывается в бегство.", "sys"); }
    }
    return d;
  }

  // ---------- монстр ----------
  function orderFor(m, last) {
    let act = m.abilities.map((a, i) => ({ a, i })).filter((x) => !x.a.passive);
    if (m.role === "boss" && m.phase === 2) act = act.slice(1).concat(act.slice(0, 1));
    else if (m.role === "boss" && m.phase >= 3) act.reverse();
    const previous = act.findIndex((x) => x.i === last);
    return previous < 0 ? act : act.slice(previous + 1).concat(act.slice(0, previous + 1));
  }
  // Функции, кроме простого удара, тратят ману монстра. «Мана-трясина» — вдвое дороже; «Мёртвая зона маны» — тратить нельзя.
  const needsMana = (a) => a.m !== "attack" || a.prep > 0 || a.target === "all";
  function manaCost(st, m, a) { return needsMana(a) && m.mpMax ? Math.round(m.mpCost * pmul(st, "enemy_mpcost")) : 0; }
  // Намерение: что монстр сделает в свой ход. Выбор — как раньше (порядок паспорта, фазы, перезарядки, мана), но заранее.
  function kindOf(m, a, release) {
    if (!a) return "attack";
    if (release) return a.m === "attack" ? "heavy" : SELF_M.includes(a.m) ? "self" : "spell";
    if (a.prep > 0) return "prep";
    if (a.m === "attack") return a.target === "all" || a.target === "few" || a.dmg >= 1.3 * baseHit(m) ? "heavy" : "attack";
    return SELF_M.includes(a.m) ? "self" : "spell";
  }
  // обычный удар монстра — самый слабый из его ударов (сильный — заметно больше него)
  const baseHit = (m) => Math.min(...m.abilities.filter((a) => a.m === "attack" && !a.prep && a.target !== "all" && a.target !== "few").map((a) => a.dmg).concat([Infinity])) === Infinity ? m.atk : Math.min(...m.abilities.filter((a) => a.m === "attack" && !a.prep && a.target !== "all" && a.target !== "few").map((a) => a.dmg));
  function pick(st, m, cdS, mpS, last = m.lastAbility) {
    for (const { a, i } of orderFor(m, last)) {
      if ((cdS[i] || 0) > 0) continue;
      if (!monsterWants(st, m, a)) continue;
      const cost = manaCost(st, m, a);
      if (cost && (phas(st, "mana_dead_zone") || mpS < cost)) continue;
      return i;
    }
    return -1;
  }
  // План на два хода вперёд (второй виден при высоком ВОС героя).
  function plan(st, m) {
    if (!alive(st, m.id)) { m.plan = []; return; }
    const out = [], cdS = Object.assign({}, m.cd); let mp = m.mp, prep = m.prep, last = m.lastAbility;
    for (let k = 0; k < 2; k++) {
      for (const j of Object.keys(cdS)) cdS[j] = Math.max(0, cdS[j] - 1);
      if (prep !== null && prep !== undefined) { const a = m.abilities[prep]; out.push({ i: prep, kind: kindOf(m, a, true), name: a.name, rel: true }); cdS[prep] = a.cd || 0; last = prep; prep = null; continue; }
      const i = pick(st, m, cdS, mp, last), a = i >= 0 ? m.abilities[i] : null;
      out.push({ i, kind: kindOf(m, a), name: a ? a.name : "Удар" });
      if (a) { mp -= manaCost(st, m, a); if (a.prep > 0) prep = i; else { cdS[i] = a.cd || 0; last = i; } }
    }
    m.plan = out;
  }
  // Мораль людей (t340): ранен до четверти или половина своих лежит — каждый ход 50%: сдаться или сбежать.
  function morale(st, m) {
    if (!m.human || m.fearless) return false;
    const mine = st.enemies.map((id) => st.units[id]).filter((u) => u.human), down = mine.filter((u) => u.hp <= 0 || u.gone).length;
    if (!(m.hp < m.hpMax * 0.25 || down * 2 >= mine.length)) return false;
    if (rng(st) >= 0.5) return false;
    m.gone = rng(st) < 0.5 ? "surrender" : "fled";
    say(st, T(st, m.gone === "surrender" ? "human_surrender" : "human_flee", { name: m.name }, m.name + (m.gone === "surrender" ? " поднимает руки: сдаётся." : " бросается бежать.")), "sys");
    return true;
  }
  function monsterTurn(st, data, m) {
    const h = st.units.hero;
    if (morale(st, m)) return;
    if (m.prep !== null && m.prep !== undefined) { const a = m.abilities[m.prep]; m.prep = null; m.heavyNow = true; useMonster(st, data, m, a, m.prepIdx); m.heavyNow = false; endMonster(st, m); return; }
    const it = (m.plan || []).shift();
    let i = it ? it.i : pick(st, m, m.cd, m.mp);
    if (i >= 0) { const a = m.abilities[i], c = manaCost(st, m, a); if ((m.cd[i] || 0) > 0 || (c && (phas(st, "mana_dead_zone") || m.mp < c))) i = pick(st, m, m.cd, m.mp); }
    if (i < 0) { strike(st, data, m, Math.round(m.atk * 0.6), {}); endMonster(st, m); return; }   // ничего не подошло — импровизированный удар
    const a = m.abilities[i], cost = manaCost(st, m, a);
    if (cost) { m.mp -= cost; const g = padd(st, "mp", "enemy_cast"); if (g) gainMp(st, g); }   // «Ловец маны»
    if (a.prep > 0) {
      m.prep = i; m.prepIdx = i; say(st, m.name + ": " + a.name.toLowerCase() + " — подготовка.", "prep"); fx(st, m, "c");
      if (phas(st, "interrupt_strike") && h.hp > 0 && reactive(st, "interrupt_strike")) { say(st, "Упреждение."); heroAttack(st, data, m, { note: "Упреждение" }); }
      endMonster(st, m); return;
    }
    m.heavyNow = kindOf(m, a) === "heavy"; useMonster(st, data, m, a, i); m.heavyNow = false; endMonster(st, m);
  }
  function endMonster(st, m) { plan(st, m); delete m.status.wk; if (m.status.supp && --m.status.supp <= 0) delete m.status.supp; if (m.status.blind && --m.status.blind <= 0) delete m.status.blind; }
  function monsterWants(st, m, a) {
    const h = st.units.hero;
    switch (a.m) {
      case "shield": return m.shield <= 0;
      case "heal": return m.hp < m.hpMax / 2;
      case "buff": return liveEnemies(st).some((id) => (a.target !== "ally" || id !== m.id) && !st.units[id].status.enemyBuff);
      case "evade": return !m.status.evade && rng(st) < 0.3;
      case "dispel": return h.shield > 0 || !!h.status.buff || !!h.status.regen;
      case "suppress": return h.suppressed <= 0 && h.fx.length > 0;
      case "mp_dmg": return h.mp > 0;
      case "bind": return !h.status.bind;
      case "no_flee": case "slow": case "blind": case "fear": case "mark": return !h.status[a.m];
      default: return true;
    }
  }
  // Цель удара монстра: герой или союзник. «Сорвиголова», «Лакомый кусок», «Метка добычи» — герой.
  function pickTarget(st, m) {
    const al = liveAllies(st); if (!al.length) return "hero";
    const aggro = padd(st, "aggro") + (st.round === 1 ? padd(st, "aggro", "battle_start") : 0) + (st.w.dungeon ? padd(st, "aggro", "dungeon") : 0);
    if (aggro > 0) return "hero";
    const ids = ["hero"].concat(al); return ids[Math.floor(rng(st) * ids.length)];
  }
  function strike(st, data, m, dmg, o) {
    const h = st.units.hero; fx(st, m, "a");
    if (o.ranged) m.shotRound = st.round;
    dmg *= 1 + (m.status.enemyBuff ? m.status.enemyBuff.pct / 100 : 0);
    dmg = Math.max(0, dmg - (m.status.wk || 0));                                // «Ослабляющий удар»
    const tid = pickTarget(st, m);
    if (tid !== "hero") { const a = st.units[tid]; if (rng(st) > 0.85) { say(st, m.name + " промахивается по " + a.name + "."); return; } hurtAlly(st, data, a, dmg * (m.status.weaken ? 1 - m.status.weaken.pct / 100 : 1), m); return; }
    if (h.status.evade) { delete h.status.evade; say(st, m.name + " промахивается: герой ушёл от удара.", "miss"); dodged(st, data, m, o); return; }
    // «Зеркальный двойник»: первая атака в раунде — в половине случаев по иллюзии
    if (phas(st, "decoy") && st.decoyRound !== st.round) { st.decoyRound = st.round; if (rng(st) < pmul(st, "decoy")) { say(st, m.name + " бьёт иллюзию героя.", "miss"); return; } }
    const ctx = { first_attack: !m.attacked, projectile: !!o.ranged, area: !!o.area, dark: st.night, big_enemy: m.size >= 4, outnumbered: liveEnemies(st).length >= 2, boss: m.role === "boss", first_turn: st.round === 1,
      spider: /пау/i.test(m.name), new_species: !st.fought[m.species], low_hp: h.hp < h.hpMax / 2 };
    m.attacked = true;
    let p = hitChance(st, m, h, ctx) - HIT_STEP * ctxSum(st, "evade", ctx) - (h.status.bind ? -0.15 : 0) + (m.status.markOn ? 0.2 : 0);
    if (m.status.blind) p -= 0.2;
    p += HIT_STEP * ctxSum(st, "enemy_hit", ctx);   // «Тирания»: −2 к атакам всех врагов; «Незнакомец»: +5 новому виду
    if (st.ambush && st.round === 1 && !phas(st, "no_ambush_penalty")) p += 0.15;   // засада: внезапная атака
    if (rng(st) > clamp(p, 0.2, 0.98)) { say(st, T(st, "m_miss", { monster: m.name }, m.name + " промахивается."), "miss"); fx(st, h, "miss"); dodged(st, data, m, o); return; }
    let d = dmg * (m.status.weaken ? 1 - m.status.weaken.pct / 100 : 1) * (h.status.resist ? 1 - h.status.resist.v / 100 : 1);
    const crit = rng(st) < critChance(st, m, h); if (crit) d *= critMult(st, m, h) * ctxMul(st, "crit_taken", {});
    hurtHero(st, data, d, m, { ranged: o.ranged, ability: o.ability, heavy: o.heavy });
  }
  // Герой увернулся: «Урок уклонения», «Контрвыпад».
  function dodged(st, data, m, o) {
    const h = st.units.hero; h.dodged = m.id;
    if (!o.ranged && phas(st, "counter", "dodge") && alive(st, m.id) && h.hp > 0 && reactive(st, "counter")) { say(st, "Контрвыпад."); heroAttack(st, data, m, { note: "Контрвыпад" }); h.dodged = m.id; }
  }
  // Вредная функция по герою (не простой удар): «Сфера отвода», «Зеркальная эгида», «Скользкая для чар кожа», «Щит разума».
  const MIND = ["fear"];
  function harmful(a) { return ["dot", "delayed", "bind", "no_flee", "slow", "blind", "fear", "mark", "mp_dmg", "suppress", "dispel"].includes(a.m) || (a.m === "attack" && (a.prep > 0 || a.target === "all")); }
  function abilityGate(st, data, m, a) {
    const h = st.units.hero;
    if (padd(st, "ability_block") && !h.once.block) { h.once.block = true; say(st, "Сфера отвода: «" + a.name + "» разбивается о невидимую сферу."); return false; }
    if (phas(st, "reflect_ability", "third_round") && st.round % 3 === 0 && !h.once["refl" + st.round]) { h.once["refl" + st.round] = true; reflectBack(st, data, m, a); return false; }
    if (rng(st) < HIT_STEP * padd(st, "evade_ability")) { say(st, "«" + a.name + "» соскальзывает с героя.", "miss"); return false; }
    if (MIND.includes(a.m) && phas(st, "mind_immune")) { say(st, "Щит разума: «" + a.name + "» не действует."); return false; }
    return true;
  }
  function reflectBack(st, data, m, a) {
    say(st, "Зеркальная эгида: «" + a.name + "» возвращается к " + m.name + ".");
    const S = m.status;
    switch (a.m) {
      case "dot": S.dot = { dmg: a.dmg, turns: a.turns, type: m.type }; break;
      case "bind": case "no_flee": S.stun = 1; break;
      case "fear": S.fear = a.turns || 1; break;
      case "blind": S.blind = a.turns || 1; break;
      case "slow": S.slow = a.turns || 1; break;
      case "mark": S.exposed = a.turns || 1; break;
      case "mp_dmg": m.mp = Math.max(0, m.mp - (a.value || 0)); break;
      case "suppress": S.supp = a.turns || 3; break;
      case "dispel": m.shield = 0; break;
      default: damageEnemy(st, data, m, a.dmg || m.atk, m.type, { dot: true }, "Отражение");
    }
  }
  function useMonster(st, data, m, a, i) {
    const h = st.units.hero; if (a.m !== "attack") fx(st, m, "c");
    m.cd[i] = a.cd || 0; m.lastAbility = i;
    const dmgMul = m.disarmed ? 0.6 : 1;
    if (harmful(a) && !abilityGate(st, data, m, a)) return;
    // защита против заклинания: три из четырёх не проходят
    if (harmful(a) && a.m !== "attack" && h.status.guard && rng(st) < 0.75) { say(st, T(st, "guard_spell", { ability: a.name }, "Герой закрылся: «" + a.name + "» не проходит."), "miss"); guardRead(st); return; }
    let landed = true;
    switch (a.m) {
      case "attack": strike(st, data, m, a.dmg * dmgMul, { ranged: a.ranged, area: a.target === "all", ability: harmful(a), heavy: !!m.heavyNow }); landed = false; break;
      case "dot": {
        if (h.status.evade) { delete h.status.evade; say(st, "Герой ушёл от удара."); landed = false; break; }
        const poison = m.type === "яд" || /яд|токс|отрав/i.test(a.name);
        if (poison && pfx(st).some((e) => e.k === "poison_immune" && !e.when)) { say(st, "Чистая кровь: яд не действует."); landed = false; break; }
        if (poison && phas(st, "poison_immune", "after_first") && h.poisonImm[m.species] && h.poisonImm[m.species] >= st.day) { say(st, "Привыкание: этот яд больше не берёт героя."); landed = false; break; }
        const turns = Math.max(1, Math.round(a.turns * (poison ? pmul(st, "poison_turns") : 1)));
        h.status.dot = { dmg: a.dmg, turns, fresh: true, type: poison ? "яд" : m.type };
        if (poison && phas(st, "poison_immune", "after_first")) h.poisonImm[m.species] = nextDay(st.day);
        say(st, m.name + ": " + a.name.toLowerCase() + " — " + a.dmg + " урона за ход, " + turns + " х."); break;
      }
      case "delayed": h.status.delayed = { dmg: a.dmg }; say(st, m.name + " ставит ловушку."); break;
      case "bind": {
        const t = (a.turns || 1) + padd(st, "bind_turns");
        if (phas(st, "unbindable") || t <= 0) { say(st, "Путы соскальзывают с героя."); landed = false; break; }
        h.status.bind = t; say(st, m.name + " сковывает героя: нельзя уклоняться и бежать."); break;
      }
      case "no_flee": if (phas(st, "unbindable")) { say(st, "Связь не держит героя."); landed = false; break; } h.status.no_flee = { turns: Math.max(1, a.turns + padd(st, "bind_turns")) }; say(st, m.name + " привязывает героя: сбежать нельзя " + a.turns + " х."); break;
      case "interrupt": {
        const pr = h.prep || h.prep2;
        if (pr && padd(st, "prep_guard") <= 0) { h.prep = null; h.prep2 = null; say(st, m.name + " сбивает подготовку героя.", "miss"); const ic = padd(st, "interrupt_cost"); if (ic) hurtHero(st, data, ic, null, { system: true }); }
        else strike(st, data, m, Math.round(m.atk * 0.5), {});
        break;
      }
      case "slow": h.status.slow = { turns: a.turns }; say(st, "Герой замедлен: ходит реже."); break;
      case "blind": h.status.blind = { turns: a.turns }; say(st, m.name + ": " + a.name.toLowerCase() + " — атаки героя хуже."); break;
      case "fear": h.status.fear = { turns: Math.max(1, Math.round(a.turns * pmul(st, "fear_turns")) + (padd(st, "mind_def") < 0 ? 1 : 0)), src: m.id }; say(st, m.name + " давит на героя: атаки по нему хуже."); break;
      case "mark": h.status.mark = { turns: a.turns }; m.status.markOn = "hero"; say(st, m.name + " метит героя."); break;
      case "shield": m.shield += a.value; say(st, m.name + " ставит щит " + a.value + "."); landed = false; break;
      case "heal": heal(st, m, a.value, m.name); landed = false; break;
      case "evade": m.status.evade = 1; say(st, m.name + " уходит в сторону."); landed = false; break;
      case "dispel": {
        const res = HIT_STEP * padd(st, "dispel_res");                                        // «Упрямые чары»
        if (rng(st) < res) { say(st, "Чары героя устояли против рассеивания."); landed = false; break; }
        h.shield = 0; h.shieldT = 0; delete h.status.buff; delete h.status.regen; say(st, m.name + " снимает с героя эффекты."); break;
      }
      case "suppress": { const t = Math.max(1, Math.ceil((a.turns || 3) * pmul(st, "suppress_turns"))); h.suppressed = t; say(st, m.name + " подавляет пассивки героя на " + t + " х."); break; }
      case "mp_dmg": { const n = Math.min(h.mp, Math.max(0, a.value + padd(st, "mpdrain_in"))); spendMp(st, n); say(st, m.name + " сжигает " + n + " маны."); break; }
      case "buff": {
        const candidates = liveEnemies(st).map((id) => st.units[id]).filter((u) => a.target !== "ally" || u.id !== m.id);
        const target = candidates.find((u) => !u.status.enemyBuff) || candidates[0];
        if (target) { target.status.enemyBuff = { pct: a.dmg_pct || 0, turns: (a.turns || 1) + 1 }; say(st, m.name + " усиливает: " + target.name + "."); }
        landed = false; break;
      }
      default: strike(st, data, m, m.atk, {}); landed = false;
    }
    if (landed && harmful(a)) { const rf = padd(st, "reflect", "ability_taken"); if (rf) damageEnemy(st, data, m, rf, "звук", { dot: true }, "Звонкий отклик"); }
  }
  function nextDay(d) { return G.clock.advance(d + "T00:00", 1440).slice(0, 10); }

  // ---------- итог ----------
  // Добыча по таблицам «Порога»: рядовой — шанс на 1–3 ед. своего материала, элита — 2–4 ед. наверняка,
  // босс — ровно один результат из пяти позиций пула. Бросается один раз за бой и запоминается.
  // «Мясник»: сохранность материалов ниже (loot_quality) — единиц меньше.
  function rewards(st) {
    if (st.loot) return st.loot;
    const dead = st.enemies.map((id) => st.units[id]).filter((u) => u.hp <= 0 && !u.twin);
    const r = (() => { let a = (st.seed ^ 0x2545f491) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const between = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    const q = st.units.hero ? pmul(st, "loot_quality") : 1;
    const mats = {}, items = [], junk = [];
    const addMat = (id, name, n, price) => { n = q !== 1 ? Math.max(1, Math.floor(n * q)) : n; mats[id] = { name, units: (mats[id] ? mats[id].units : 0) + n, price_won: price }; };
    for (const u of dead) {
      if (u.pool) {
        let x = r(), pick = u.pool[u.pool.length - 1];
        for (const p of u.pool) { if ((x -= p.chance) < 0) { pick = p; break; } }
        if (pick.kind === "material") addMat(pick.id, pick.name, between(pick.min, pick.max), pick.price_won);
        else items.push({ id: pick.id, name: pick.name, slot: pick.slot, rank: u.rank, tier: pick.tier, desc: pick.desc, price_won: pick.price_won, from: u.species, gear: pick.gear ? JSON.parse(JSON.stringify(pick.gear)) : undefined, dur: pick.gear ? pick.gear.dur : undefined });
      } else if (u.material) {
        const m = u.material;
        if (r() < Math.min(1, (m.chance === undefined ? 1 : m.chance) * (st.units.hero ? pmul(st, "loot_chance") : 1))) addMat(m.id, m.name, between(m.min || 1, m.max || 1), m.price_won);
        else junk.push(u.name);
      }
    }
    // кристаллы маны (03.11.2026): свой бросок, чтобы не сдвигать прежние таблицы добычи
    if (G.crystals) { let c = (st.seed ^ 0x51ed270b) >>> 0; const rc = () => { c = Math.imul(c ^ (c >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 >>> 0; return ((c ^ (c >>> 14)) >>> 0) / 4294967296; };
      for (const u of dead) { const n = G.crystals.drop(u, rc()); if (n) { const m = G.crystals.mat(u.rank); mats[m.id] = { name: m.name, units: (mats[m.id] ? mats[m.id].units : 0) + n, price_won: m.price_won }; } } }
    // люди: наличные у тех, кто лежит без сознания, и у сдавшихся (отдают сами)
    let cash = 0;
    for (const u of st.enemies.map((id) => st.units[id])) if (u.human && u.cash && (u.hp <= 0 || u.gone === "surrender")) { if (u.cashHad === undefined) u.cashHad = Math.round((u.cash[0] + r() * (u.cash[1] - u.cash[0])) / 1000) * 1000; cash += u.cashHad; }
    st.loot = { xp: dead.filter((u) => u.killedBy !== "ally").reduce((s, u) => s + u.xp, 0), materials: mats, items, junk, cash };
    return st.loot;
  }
  // Перенести итог в сохранение. Тестовый бой сохранение не меняет.
  function finish(save, data, st) {
    if (st.test) return { applied: false, rewards: rewards(st) };
    if (!st.over) return { applied: false, error: "Бой ещё не завершён" };
    if (st.applied) return { applied: false, rewards: rewards(st) };
    if (st.t02used) save.hero.t02_at = save.clock;
    if (st.t05used && G.secrets) st.t05broke = G.secrets.spend(save, "T05", st.t05used) === "broken";
    st.applied = true;
    if (G.law && st.enemies.some((id) => st.units[id].human)) G.law.afterFight(save, st);   // t342: напал первым при свидетелях — дело
    const h = save.hero, u = st.units.hero, r = rewards(st), P = G.passives;
    h.hp = Math.max(0, Math.round(u.hp)); if (h.awakened) h.mp = Math.round(u.mp);
    h.bag = Object.assign({}, u.bag);
    let brokeNow = G.gear ? G.gear.wear(save, data, u.gearUse) : [];
    // «Чёрный крепёж» (T07): три раза спасает сломавшееся снаряжение (энергетическая перегрузка), затем исчерпан
    if (brokeNow.length && G.secrets && G.secrets.charges(save, "T07") > 0) {
      for (const w of G.gear.worn(save.hero, data)) if (w.item.dur === 0) w.item.dur = 1;
      G.secrets.spend(save, "T07", 1); G.gear.refresh(save, data); brokeNow = [];
    }
    // память героя между боями: раз в сутки, яды, адаптация, виды
    h.daily = u.daily; h.poison_imm = u.poisonImm;
    if (u.adaptNew) h.adapt = u.adapt;
    const species = st.enemies.map((id) => st.units[id]).filter((m) => m.species);
    h.fought = Object.assign(h.fought || {}, Object.fromEntries(species.map((m) => [m.species, true])));
    if (P) {
      P.stamp(save, "battle");
      if (u.cardsUsed) P.stamp(save, "cast");
      if (u.mpMax && u.mpMin <= 0) P.stamp(save, "mp_zero");
      if (st.allyDown) P.stamp(save, "ally_down");
      if (species.some((m) => m.role === "boss")) P.stamp(save, "boss_fight");
    }
    if (u.mpBurn) h.mp_burn = (h.mp_burn || 0) + u.mpBurn;                                     // «Выгорание»
    const humansOnly = species.length && species.every((m) => m.human);
    if (false && st.result === "lost" && humansOnly && !st.lethal) {   // 26.10: решено — проигрыш людям = смерть (канон)
   // люди вырубают, а не убивают (t340): час без сознания, часть денег пропала
      h.hp = 1; const lost = Math.min(h.money || 0, Math.max(0, Math.round((h.money || 0) * 0.2 / 1000) * 1000), 200000);
      if (lost > 0) G.hero.charge(h, save.clock, -lost, "Забрали, пока герой был без сознания");
      save.journal.push({ at: save.clock, actor: "hero", action: "knocked_out", enemies: species.map((m) => m.species), amount: lost, result: "lost" });
      if (G.time) G.time.spend(save, 60, "knocked_out");
      return { applied: true, rewards: r, knocked: true, lost };
    }
    if (st.result === "lost" && st.survive) {   // Штрафная зона: Система выкидывает героя без сознания — 1 HP, без смерти
      h.hp = 1; save.journal.push({ at: save.clock, actor: "system", action: "penalty_zone_ejected", result: "lost" });
      return { applied: true, rewards: r, ejected: true };
    }
    if (st.result === "lost") { G.day.die(save); h.death_cause = "погиб в бою" + (species.length ? " (" + species.map((m) => m.name).join(", ") + ")" : ""); return { applied: true, rewards: r, dead: true }; }
    // после боя: «Передышка», «Пустота после боя», «Износ»
    const hw = P ? -P.add(h, "hpmax", "after_battle") : 0; if (hw > 0) h.hp_wear = (h.hp_wear || 0) + hw;
    const ab = P ? P.add(h, "heal", "after_battle") : 0; if (ab && h.hp > 0 && !(P && P.has(h, "no_heal_all"))) h.hp = Math.min(G.system.maxHp(h), h.hp + ab);
    h.hp = Math.min(h.hp, G.system ? G.system.maxHp(h) : h.hp);
    if (P && P.has(h, "mp_zero", "after_battle") && h.awakened) { h.mp = 0; P.stamp(save, "mp_zero"); }
    if (h.awakened && G.system) h.mp = Math.min(h.mp, G.system.mpCap(h));
    if (st.result === "won") {
      if (h.awakened && r.xp > 0) G.system.gainXp(save, r.xp, "battle");
      const RP = save.dungeon && save.dungeon.raid ? save.dungeon.raid.pool : null;   // рейд: добыча общая, у группы
      if (RP) { for (const [, m] of Object.entries(r.materials)) RP.value += m.units * (m.price_won || 0); for (const it of r.items) RP.value += it.price_won || 0; RP.items += r.items.length; }
      h.materials = h.materials || {}; h.items = h.items || [];
      const n0 = h.items.length;
      if (!RP) {   // рюкзак, потом инвентарь Системы; что не влезло — осталось лежать (t354)
        const pl = G.sysinv ? G.sysinv.addLoot(save, data, r.materials, r.items.map((it, k) => ({ ...it, uid: it.id + "@" + save.clock + "#" + k })))
          : (Object.entries(r.materials).forEach(([id, m]) => { h.materials[id] = (h.materials[id] || 0) + m.units; }), h.items.push(...r.items.map((it, k) => ({ ...it, uid: it.id + "@" + save.clock + "#" + k }))), null);
        st.placed = pl;
      }
      if (G.gear) for (const it of h.items) G.gear.info(data, it);
      if (save.dungeon && save.dungeon.legal && G.hunter) {  // законный рейд — добыча в опись
        const fresh = h.items.slice(n0);
        G.hunter.documentLoot(save, Object.fromEntries(Object.entries(r.materials).map(([id, m]) => [id, m.units])), fresh);
      }
      // v187: деньги людей — только через «Обыскать» (law.search), не автоматически
      for (const w of st.seized || []) { const k = h.inventory.indexOf(null); if (k >= 0) h.inventory[k] = { kind: "thing", id: "seized:" + w, name: "Отобранное: " + w, count: 1 }; }
      const K = h.kills || (h.kills = {}); for (const m of species) if (m.hp <= 0 && !m.human && m.killedBy !== "ally") K[m.species] = (K[m.species] || 0) + 1;
      if (G.achievements && h.awakened) {          // «Выше головы»: убит монстр ранга выше ранга героя
        const RK = G.cards.RANKS, me = RK.indexOf(G.hero.powerRank(save));
        for (const m of species) if (m.hp <= 0 && !m.human && m.killedBy !== "ally" && RK.indexOf(m.rank) > me) G.achievements.note(save, "above", m.rank);
        G.achievements.check(save);
      }
    }
    // валюта Системы за убитых (канон: 2^ранг, элита ×2, босс ×5 — поле sys_coins бестиария)
    let coins = 0;
    if (st.result === "won" && h.awakened && h.sys) { for (const m of species) { if (m.killedBy === "ally") continue; const sp = data.bestiary.species.find((x) => x.id === m.species); coins += (sp && sp.sys_coins) || 0; } h.sys.coins = (h.sys.coins || 0) + coins; }
    save.journal.push({ at: save.clock, actor: "hero", action: "battle", result: st.result, enemies: species.map((m) => m.species),
      loot_units: st.result === "won" ? Object.values(r.materials).reduce((a, m) => a + m.units, 0) : 0, coins,
      items: st.result === "won" ? r.items.length : 0, roles: species.map((m) => m.role), cards: u.cardsUsed || 0,
      people_down: species.filter((m) => m.human && m.hp <= 0).map((m) => m.species), people_gone: species.filter((m) => m.human && m.gone).map((m) => m.species + ":" + m.gone),
      hp_lost_pct: Math.round(100 * Math.max(0, (st.hp0 || u.hpMax) - u.hp) / u.hpMax), night: !!st.night });
    // разделка тел: 60 ходов на единицу материала — обычный темп уже входит в дорогу между залами (gates.ROOM_MIN).
    // «Сноровка разделщика» ×0,2 сокращает следующий переход, «Брезгливый» ×2 добавляет время сразу.
    let butcher = 0;
    if (st.result === "won") {
      const units = Object.values(r.materials).reduce((a, m) => a + m.units, 0), sec = (data.cards && data.cards.sec_per_turn) || 6;
      butcher = Math.round(units * 60 * sec / 60 * (pmul(st, "time_butcher") - 1));
      if (butcher >= 1 && G.time) G.time.spend(save, butcher, "butcher");
      else if (butcher < 0 && save.dungeon) save.dungeon.credit = (save.dungeon.credit || 0) - butcher;
    }
    return { applied: true, rewards: r, broke: brokeNow, butcher };
  }

  // ---------- для интерфейса: намерения и очередь ----------
  // Что видно о следующем ходе монстра — по ВОС героя против ВОС монстра: 1 — только вид, 2 — название и урон, 3 — ещё и ход после.
  function sightLevel(st, m) { const r = statNow(st, "per") / Math.max(1, sv(st, m, "per")); return r >= 1.75 ? 3 : r >= 1.25 ? 2 : 1; }
  function estDmg(st, m, it) {
    const h = st.units.hero, a = it.i >= 0 ? m.abilities[it.i] : null;
    if (it.kind === "prep" || it.kind === "self") return null;
    if (a && a.m !== "attack" && a.m !== "dot") return null;
    let d = a ? a.dmg * (a.m === "attack" && m.disarmed ? 0.6 : 1) : m.atk * 0.6;
    if (!a || a.m === "attack") d *= 1 + (m.status.enemyBuff ? m.status.enemyBuff.pct / 100 : 0);
    if (m.status.weaken) d *= 1 - m.status.weaken.pct / 100;
    d *= vitCut(statNow(st, "vit"), typ(st, m.rank)) * (1 - G_def(h, m.rank) / 100);
    return Math.max(1, Math.round(d));
  }
  function intents(st) {
    const out = {};
    for (const id of liveEnemies(st)) {
      const m = st.units[id], lvl = sightLevel(st, m), o = { lvl, poise: m.poise, poiseMax: m.poiseMax, broken: !!m.broken, list: [] };
      if (m.broken) o.list.push({ kind: "broken" });
      else if (m.status.stun) o.list.push({ kind: "stun" });
      else for (const it of (m.plan || []).slice(0, lvl >= 3 ? 2 : 1)) o.list.push({ kind: it.kind, name: lvl >= 2 ? it.name : null, dmg: lvl >= 2 ? estDmg(st, m, it) : null });
      out[id] = o;
    }
    return out;
  }

  return { start, act, actions, finish, rewards, cardState, typeOf, queue, intents, sightLevel };
});

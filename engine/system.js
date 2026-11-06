// Система героя: пробуждение, статус, уровень, опыт, очки характеристик.
// Канон (передача проекта, раздел «Система»):
//  • пробуждение — один случайный момент 01.09–30.11.2026, бросается при новой игре и не зависит от поступков;
//  • старт: уровень 1, Магия 10, одна попытка выбора способности; обычной способности нет;
//  • цена уровня 100×L², за уровень 5 очков; вложенное не вернуть; потолка нет;
//  • на новом уровне HP и MP полные; HP от Выносливости, MP от Магии; ноль HP — смерть;
//  • тренировки растят характеристики только до 20 (предел обычного человека).
// Набор характеристик и множители HP/MP — решение Claude (предварительно, баланс позже).
G.define("system", function (G) {
  const STATS = [
    { id: "str", name: "Сила", hint: "урон в ближнем бою, переносимый вес" },
    { id: "agi", name: "Ловкость", hint: "скорость, уклонение, точность" },
    { id: "vit", name: "Выносливость", hint: "здоровье (HP)" },
    { id: "per", name: "Восприятие", hint: "внимание, реакция, критические удары" },
    { id: "mag", name: "Магия", hint: "мана (MP), сила способностей" },
  ];
  const HUMAN_CAP = 20;               // предел тренировок без Системы
  const HP_PER_VIT = 10, MP_PER_MAG = 10;
  const POINTS_PER_LEVEL = 5;
  const START = { level: 1, mag: 10, gacha: 1 };
  const WINDOW = ["2026-09-01T09:00", "2026-09-03T22:00"];   // решение заказчика 27.10: пробуждение в первые три дня

  // Обычный 18-летний парень до пробуждения: магии нет, остальное — средний уровень.
  function baseStats() { return { str: 10, agi: 10, vit: 10, per: 10, mag: 0 }; }

  // Детерминированный бросок от зерна прохождения: перезагрузка не меняет выпавшее.
  function rand(seed) {
    let t = (seed ^ 0x5157e1) >>> 0;
    t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
  function rollAwakening(seed) {
    const a = G.clock.toMin(WINDOW[0]), b = G.clock.toMin(WINDOW[1]);
    return G.clock.fromMin(a + Math.floor(rand(seed) * (b - a + 1)));
  }

  const bonus = (h, id) => (G.passives ? G.passives.stat(h, id) : 0) + (G.gear ? G.gear.stat(h, id) : 0);
  // «Сытая сила» (+HP, пока сыт), «Износ» (−1 за бой навсегда: hp_wear), «Выгорание» (−1 MP за выпуск: mp_burn).
  function maxHp(h) { const P = G.passives; return Math.max(1, ((h.stats ? h.stats.vit : 10) + bonus(h, "vit")) * HP_PER_VIT + (P ? P.add(h, "hp") + (h.satiety >= 60 ? P.add(h, "hp", "fed") : 0) : 0) - (h.hp_wear || 0)); }
  function maxMp(h) { return Math.max(0, ((h.stats ? h.stats.mag : 0) + bonus(h, "mag")) * MP_PER_MAG + (G.passives ? G.passives.add(h, "mp") : 0) - (h.mp_burn || 0)); }
  // Потолок запаса маны: «Половинный контур» ×0.5, «Двойное дно» ×2 (выше максимума восстанавливается вдвое медленнее).
  function mpCap(h) { const P = G.passives; return Math.round(maxMp(h) * (P ? P.mul(h, "mp_cap") * P.mul(h, "mp_overcap") : 1)); }
  // Прибавить ману с учётом потолка; сверх максимума — вдвое медленнее.
  function addMp(h, n) {
    const mx = maxMp(h), cap = mpCap(h);
    if (n <= 0) { h.mp = Math.max(0, h.mp + n); return; }
    let v = h.mp;
    if (v < mx) { const a = Math.min(n, mx - v); v += a; n -= a; }
    if (n > 0 && cap > mx) v += n / 2;
    h.mp = Math.min(cap, v);
  }
  function xpToNext(level) { return 100 * level * level; }

  // Дополнить героя полями Системы (новая игра и старые сохранения).
  function prepare(save, data) {
    const h = save.hero;
    if (!h.stats) h.stats = baseStats();
    if (!h.awakening_at) h.awakening_at = rollAwakening(save.seed >>> 0);
    if (h.hp === undefined) h.hp = maxHp(h);
    if (h.mp === undefined) h.mp = maxMp(h);
    if (h.awakened && !h.sys) h.sys = { xp: 0, points: 0, gacha: START.gacha };
    if (G.cards && data) G.cards.migrate(save, data);
    if (G.gear && data) G.gear.refresh(save, data);
    return save;
  }

  // Вызывается после каждого шага времени: если момент наступил — Система появляется.
  function check(save) {
    const h = save.hero;
    if (h.awakened || !h.awakening_at || G.clock.toMin(save.clock) < G.clock.toMin(h.awakening_at)) return null;
    return awaken(save, h.awakening_at);
  }

  function awaken(save, at) {
    const h = save.hero;
    h.awakened = true; h.level = START.level;
    h.stats.mag = Math.max(h.stats.mag, START.mag);
    h.sys = { xp: 0, points: 0, gacha: START.gacha };
    h.hp = maxHp(h); h.mp = Math.min(maxMp(h), mpCap(h));
    if (G.passives) G.passives.stamp(save, "awake", at);
    notify(save, { kind: "awakening", at });
    save.journal.push({ at, actor: "system", action: "awakening", result: "ok" });
    return { kind: "awakening", at };
  }

  function notify(save, n) { (save.system_notices || (save.system_notices = [])).push({ ...n, shown: false }); }

  // Опыт: только за убийства, задания и достижения (источник указывает вызывающий код).
  function gainXp(save, amount, source) {
    const h = save.hero;
    if (!h.awakened) throw new Error("Системы нет");
    if (!(amount > 0)) throw new Error("Опыт должен быть больше нуля");
    h.sys.xp += amount;
    const ups = [];
    while (h.sys.xp >= xpToNext(h.level)) {
      h.sys.xp -= xpToNext(h.level);
      h.level += 1; h.sys.points += POINTS_PER_LEVEL;
      h.hp = maxHp(h); h.mp = Math.max(h.mp, Math.min(maxMp(h), mpCap(h)));
      if (G.passives) G.passives.stamp(save, "levelup");
      ups.push(h.level);
      notify(save, { kind: "level", at: save.clock, level: h.level }); save.journal.push({ at: save.clock, actor: "system", action: "level_up", level: h.level, result: "ok" });
    }
    save.journal.push({ at: save.clock, actor: "system", action: "xp", amount, source: source || null, result: "ok" });
    if (G.achievements) G.achievements.check(save);       // «Восхождение» и прочие вехи (повторный вызов из награды гасится внутри)
    return ups;
  }

  // Вложить очки. Необратимо. Здоровье/мана растут вместе с максимумом.
  function invest(save, statId, n) {
    const h = save.hero, k = n || 1;
    if (!h.awakened) return { ok: false, error: "Системы нет" };
    if (!STATS.some((s) => s.id === statId)) return { ok: false, error: "Нет такой характеристики" };
    if (!Number.isInteger(k) || !(k > 0) || h.sys.points < k) return { ok: false, error: "Не хватает очков" };
    const hp0 = maxHp(h), mp0 = maxMp(h);
    h.sys.points -= k; h.stats[statId] += k;
    h.hp += maxHp(h) - hp0; h.mp += maxMp(h) - mp0;
    save.journal.push({ at: save.clock, actor: "system", action: "invest", stat: statId, n: k, result: "ok" });
    if (G.achievements) G.achievements.check(save);
    return { ok: true };
  }

  // Тренировка (обычным путём): +n, но не выше предела человека.
  function train(save, statId, n) {
    const h = save.hero;
    const cur = h.stats[statId];
    if (cur >= HUMAN_CAP) return 0;
    const add = Math.min(n, HUMAN_CAP - cur);
    h.stats[statId] += add;
    return add;
  }

  // Статус для экрана — только то, что Система показывает герою.
  function status(save) {
    const h = save.hero;
    if (!h.awakened) return null;
    return { level: h.level, xp: h.sys.xp, xpNext: xpToNext(h.level), points: h.sys.points, gacha: h.sys.gacha, coins: h.sys.coins || 0,
             hp: h.hp, hpMax: maxHp(h), mp: h.mp, mpMax: maxMp(h),
             stats: STATS.map((s) => ({ ...s, value: h.stats[s.id] + bonus(h, s.id), bonus: bonus(h, s.id) })) };
  }

  // «Запоздалая Система»: уведомления доходят через час (sys_notice_delay, минуты).
  function pendingNotices(save) {
    const d = G.passives ? G.passives.add(save.hero, "sys_notice_delay") : 0, now = G.clock.toMin(save.clock);
    return (save.system_notices || []).filter((n) => !n.shown && (!d || !n.at || G.clock.toMin(n.at) + d <= now));
  }
  function markShown(save) { for (const n of pendingNotices(save)) n.shown = true; }

  return { notify, STATS, HUMAN_CAP, POINTS_PER_LEVEL, WINDOW, baseStats, rollAwakening, prepare, check, awaken, gainXp, invest, train,
           status, maxHp, maxMp, mpCap, addMp, xpToNext, pendingNotices, markShown };
});

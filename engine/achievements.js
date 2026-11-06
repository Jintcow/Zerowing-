// Достижения (Claude, 26.10.2026, t313; перенесено из v252 03.11.2026): разовые вехи развития через Систему.
// Каждое — один раз за игру: опыт 50×4^ранг и одна попытка выбора карты (канон).
// Ключ сохранения — "вид:ранг" в save.quests.achievements (старые "solo_clear:*" просто не показываются).
// Проверка — сканом состояния героя, поэтому вызов check() в любой момент безопасен и идемпотентен.
G.define("achievements", function (G) {
  const R7 = ["F", "E", "D", "C", "B", "A", "S"], ALL = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];
  const rk = (r) => ALL.indexOf(r);
  const STAT_CAP = { F: 21, E: 28, D: 49, C: 77, B: 112, A: 161, S: 224 };      // F — сверх 20; дальше порог ранга (×1,4 типичной)
  const LEVEL = { F: 5, E: 10, D: 20, C: 35, B: 55, A: 80, S: 110 };
  const HUNT = { F: 50, E: 50, D: 40, C: 30, B: 20, A: 10, S: 3 };
  const QUESTS = { F: 1, E: 5, D: 15, C: 30, B: 60, A: 100, S: 150 };
  const ANALYZE = 10;
  // Порядок — как в экране.
  const KINDS = [
    { id: "human_limit", name: "Предел человека", ranks: R7, hint: (r) => r === "F" ? "любая характеристика выше 20" : "характеристика " + STAT_CAP[r] },
    { id: "ascent", name: "Восхождение", ranks: R7, hint: (r) => "уровень " + LEVEL[r] },
    { id: "hunter", name: "Охотник", ranks: R7, hint: (r) => HUNT[r] + " монстров ранга " + r },
    { id: "above", name: "Выше головы", ranks: R7.slice(1), hint: (r) => "убить монстра ранга " + r + ", будучи ниже" },
    { id: "quests", name: "Задания Системы", ranks: R7.concat(["clean"]), hint: (r) => r === "clean" ? "30 дней без провалов" : "выполнить заданий: " + QUESTS[r] },
    { id: "collector", name: "Коллекционер", ranks: ALL, hint: (r) => "первая карта ранга " + r },
    { id: "fusion", name: "Объединение", ranks: ALL.slice(1), hint: (r) => "первое объединение в ранг " + r },
    { id: "analysis", name: "Анализ", ranks: R7, hint: (r) => ANALYZE + " видов ранга " + r },
    { id: "first_gate", name: "Первый закрытый портал", ranks: R7, hint: (r) => "добить босса врат ранга " + r },
    { id: "solo_clear", name: "Самостоятельная зачистка", ranks: R7, hint: (r) => "закрыть врата ранга " + r + " без единого привала" },
  ];
  const rewardRank = (r) => (r === "clean" ? "C" : r);
  const label = (r) => (r === "clean" ? "30 дней" : r);

  let DATA = null, spRank = null;
  function use(data) { DATA = data; spRank = null; }
  function speciesRank(id) {
    if (!spRank) { spRank = {}; for (const s of ((DATA && DATA.bestiary && DATA.bestiary.species) || [])) spRank[s.id] = s.rank; }
    return spRank[id];
  }
  const store = (save) => { const S = G.quests.state(save); return S.achievements || (S.achievements = {}); };
  const has = (save, kind, r) => !!store(save)[kind + ":" + r];

  function grant(save, kind, r) {
    const h = save.hero, A = store(save), key = kind + ":" + r;
    if (!h.awakened || h.dead || A[key]) return false;
    const K = KINDS.find((k) => k.id === kind); if (!K || !K.ranks.includes(r)) return false;
    A[key] = save.clock; h.sys.gacha = (h.sys.gacha || 0) + 1;
    const xp = 50 * Math.pow(4, rk(rewardRank(r)));
    G.system.gainXp(save, xp, "achievement");
    let fusion = false;   // решение заказчика 27.10.2026: «Коллекционер» ранга C и выше — ещё и карта объединения
    if (kind === "collector" && rk(r) >= rk("C") && !(h.cards || {}).fusion) { (h.cards || (h.cards = {})).fusion = { lvl: 1, at: save.clock }; fusion = true; if (G.cards && DATA) G.cards.refresh(save, DATA); }
    G.system.notify(save, { kind: "achievement", at: save.clock, name: K.name + " (" + label(r) + ")", hint: K.hint(r), xp, fusion });
    save.journal.push({ at: save.clock, actor: "system", action: "achievement", id: key, result: "ok" });
    return true;
  }

  // Счётчики, которых нет в сохранении сами по себе, пишут места событий через note().
  function note(save, what, x) {
    const a = save.hero.ach || (save.hero.ach = {});
    if (what === "seeded") return;
    const set = a[what] || (a[what] = {}); set[x] = 1;
  }

  let busy = false;
  function check(save) {
    const h = save.hero;
    if (busy || !h || !h.awakened || h.dead || !h.sys) return [];
    busy = true; const got = [];
    try {
      for (let pass = 0; pass < 5; pass++) {           // новый уровень от награды может открыть следующее
        if (!(h.ach || {}).seeded) { for (const id of Object.keys(h.cards || {})) { const c = G.cards.byId(DATA, id); if (c && id !== "fusion") note(save, "card", c.rank); } (h.ach || (h.ach = {})).seeded = 1; } // старые сохранения: карты, что уже на руках
        const n0 = got.length, a = h.ach || {}, give = (k, r) => { if (grant(save, k, r)) got.push(k + ":" + r); };
        const top = Math.max(...Object.values(h.stats || {}));
        for (const r of R7) if (top >= STAT_CAP[r]) give("human_limit", r);
        for (const r of R7) if (h.level >= LEVEL[r]) give("ascent", r);
        const kills = {}; for (const [sp, n] of Object.entries(h.kills || {})) { const r = speciesRank(sp); if (r) kills[r] = (kills[r] || 0) + n; }
        for (const r of R7) if ((kills[r] || 0) >= HUNT[r]) give("hunter", r);
        for (const r of Object.keys(a.above || {})) give("above", r);
        const S = G.quests.state(save), done = S.log.filter((q) => q.result === "done");
        for (const r of R7) if (done.length >= QUESTS[r]) give("quests", r);
        const fails = S.log.filter((q) => q.result === "failed").map((q) => q.at).sort();
        const from = fails.length ? fails[fails.length - 1] : h.awakening_at;
        if (from && G.clock.diff(from, save.clock) >= 30 * 1440 && done.some((q) => q.at > from)) give("quests", "clean");
        for (const r of Object.keys(a.card || {})) give("collector", r);
        for (const r of Object.keys(a.fused || {})) give("fusion", r);
        const an = {}; for (const sp of Object.keys(a.analyzed || {})) { const r = speciesRank(sp); if (r) an[r] = (an[r] || 0) + 1; }
        for (const r of R7) if ((an[r] || 0) >= ANALYZE) give("analysis", r);
        for (const r of Object.keys(a.gate || {})) give("first_gate", r);
        for (const r of Object.keys(a.solo || {})) give("solo_clear", r);
        if (got.length === n0) break;
      }
    } finally { busy = false; }
    return got;
  }

  // Для экрана: виды с клетками рангов.
  function view(save) {
    return KINDS.map((k) => ({ id: k.id, name: k.name,
      cells: k.ranks.map((r) => ({ r, label: label(r), done: has(save, k.id, r), hint: k.hint(r) })) }));
  }
  // Полученные (для экрана: скрытые не показываются, пока не получены), новые сверху.
  function got(save) {
    const A = store(save), out = [];
    for (const k of KINDS) k.ranks.forEach((r, i) => { const at = A[k.id + ":" + r]; if (at) out.push({ id: k.id, name: k.name, r, label: label(r), hint: k.hint(r), at, step: i + 1, of: k.ranks.length, xp: 50 * Math.pow(4, rk(rewardRank(r))) }); });
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function count(save) { let n = 0, t = 0; for (const k of KINDS) for (const r of k.ranks) { t++; if (has(save, k.id, r)) n++; } return { n, t }; }

  return { KINDS, use, grant, note, check, view, count, has, got };
});

// Карты-способности героя и гача «выбор карты из 32» (канон: время стоит, пока герой выбирает).
// Раскладка 32 карт рубашкой вверх создаётся один раз на попытку и хранится в сохранении:
// перезагрузка не перетасовывает. Ранг каждой карты — по шансам рангов, способность — случайная
// карта этого ранга из каталога. Повторов нет: карта, которая уже есть у героя, не выпадает
// (и не повторяется внутри одной раскладки); сожжённая в объединении возвращается в пул.
G.define("cards", function (G) {
  const RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"]; // SS и SSS — только у Системы героя

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function catalog(data) { return (data.cards && data.cards.cards) || []; }
  function byId(data, id) { return catalog(data).find((c) => c.id === id); }

  function rollRank(r, odds) {
    const total = RANKS.reduce((s, k) => s + (odds[k] || 0), 0);
    let x = r() * total;
    for (const k of RANKS) { x -= odds[k] || 0; if (x < 0) return k; }
    return "F";
  }

  function rollKind(r, w) {
    if (!w) return null;
    return r() * ((w.active || 0) + (w.passive || 0)) < (w.active || 0) ? "active" : "passive";
  }

  // Старое сохранение: карт, которых больше нет в каталоге, нет и у героя — за каждую возвращается попытка.
  function migrate(save, data) {
    const h = save.hero; if (!h || !h.cards || !data.cards) return 0;
    let n = 0;
    for (const id of Object.keys(h.cards)) if (!byId(data, id)) { delete h.cards[id]; n++; }
    if (h.loadout) h.loadout = h.loadout.filter((id) => byId(data, id));
    if (h.gacha_board && h.gacha_board.slots.some((id) => !byId(data, id))) delete h.gacha_board;
    if (n && h.sys) h.sys.gacha = (h.sys.gacha || 0) + n;
    refresh(save, data);
    return n;
  }

  // Случайная карта из пула с учётом веса (карта объединения встречается чаще обычной).
  function weighted(r, pool) {
    const total = pool.reduce((s, c) => s + (c.weight || 1), 0);
    let x = r() * total;
    for (const c of pool) { x -= c.weight || 1; if (x < 0) return c; }
    return pool[pool.length - 1];
  }

  // Открыть попытку: если раскладки нет — разложить 32 карты (детерминированно).
  function open(save, data) {
    const h = save.hero;
    if (!h.awakened || !h.sys || h.sys.gacha < 1) return { ok: false, error: "Попыток нет" };
    if (h.gacha_board) return { ok: true, board: h.gacha_board };
    const n = (h.sys.gacha_used || 0);
    const r = rng((save.seed >>> 0) ^ (0x9e3779b9 * (n + 1)));
    const cfg = data.cards.draw, own = h.cards || {}, used = new Set();
    const free = catalog(data).filter((c) => !own[c.id]);
    const slots = [];
    for (let i = 0; i < cfg.cards; i++) {
      let rank = rollRank(r, cfg.rank_odds), k = RANKS.indexOf(rank), pool = [];
      const kind = rollKind(r, cfg.kind_weights);
      // весь ранг уже собран — берём ближайший ранг ниже, где что-то осталось (потом выше)
      const order = RANKS.slice(0, k + 1).reverse().concat(RANKS.slice(k + 1));
      for (const rk of order) {
        const left = free.filter((c) => c.rank === rk && !used.has(c.id));
        // вид (активная/пассивная) — по весам гачи героя; если такого вида на ранге не осталось — любой
        pool = kind ? left.filter((c) => c.kind === kind || c.id === "fusion") : left;
        if (!pool.length) pool = left;
        if (pool.length) break;
      }
      if (!pool.length) break; // карт в мире не осталось вовсе
      const c = weighted(r, pool); used.add(c.id); slots.push(c.id);
    }
    h.gacha_board = { attempt: n + 1, slots };
    return { ok: true, board: h.gacha_board };
  }

  // Собрать эффекты пассивок героя (вызывается после любого изменения набора карт).
  function refresh(save, data) {
    const h = save.hero; if (!h) return;
    h.passive_fx = G.passives ? G.passives.collect(Object.keys(h.cards || {}).map((id) => byId(data, id))) : [];
    // Постоянный физический эффект SSS-P-012 существует в сохранённом состоянии героя.
    if (G.cliche && G.cliche.enabled(save)) h.passive_anatomy = G.cliche.anatomy(save);
    else delete h.passive_anatomy;
    // «Ускоренная старость»: отсчёт с момента, как карта у героя
    if (G.passives && G.passives.has(h, "aging")) { if (!h.aging_since) h.aging_since = save.clock; } else delete h.aging_since;
  }

  // Выбрать карту. Время не тратится (канон). Возвращает полученную карту и её мастерство.
  function pick(save, data, index) {
    const h = save.hero, b = h.gacha_board;
    if (!b) return { ok: false, error: "Раскладки нет" };
    const id = b.slots[index];
    if (!id) return { ok: false, error: "Нет такой карты" };
    const card = byId(data, id);
    h.cards = h.cards || {};
    h.cards[id] = { lvl: 1, at: save.clock };
    if (card.kind === "active") autoEquip(save, data, card);
    h.sys.gacha -= 1; h.sys.gacha_used = (h.sys.gacha_used || 0) + 1;
    delete h.gacha_board;
    refresh(save, data);
    save.journal.push({ at: save.clock, actor: "system", action: "card", card: id, rank: card.rank, kind: card.kind, result: "ok" });
    if (G.achievements) { if (id !== "fusion") G.achievements.note(save, "card", card.rank); G.achievements.check(save); }
    return { ok: true, card, lvl: 1, repeat: false };
  }

  // ---- Набор активных способностей: не больше 5; пассивные действуют всегда ----
  function maxActive(data) { return (data.cards.loadout || {}).active_max || 5; }
  const cursed = (c) => c && c.negative && c.kind === "active";
  function loadout(save) { return save.hero.loadout || (save.hero.loadout = []); }
  function autoEquip(save, data, card) {
    const L = loadout(save);
    if (L.includes(card.id)) return;
    if (L.length < maxActive(data)) { L.push(card.id); return; }
    if (cursed(card)) { // проклятая способность занимает место сама: вытесняет последнюю обычную
      for (let i = L.length - 1; i >= 0; i--) if (!cursed(byId(data, L[i]))) { L.splice(i, 1, card.id); return; }
    }
  }
  // Поставить/снять активную способность. Проклятую снять нельзя.
  function toggle(save, data, id) {
    const c = byId(data, id), L = loadout(save);
    if (!c || !(save.hero.cards || {})[id]) return { ok: false, error: "Такой способности нет" };
    if (c.kind !== "active") return { ok: false, error: "Пассивная действует всегда" };
    const i = L.indexOf(id);
    if (i >= 0) {
      if (cursed(c)) return { ok: false, error: "Проклятую способность не убрать" };
      L.splice(i, 1); return { ok: true, on: false };
    }
    if (L.length >= maxActive(data)) return { ok: false, error: "В наборе уже " + maxActive(data) + " активных — сначала убери одну" };
    L.push(id); return { ok: true, on: true };
  }

  // Карты героя для экрана: из каталога + мастерство.
  function owned(save, data) {
    const L = save.hero.loadout || [];
    return Object.entries(save.hero.cards || {}).map(([id, o]) => ({ ...byId(data, id), lvl: o.lvl, equipped: L.includes(id) }))
      .filter((c) => c.id).sort((a, b) => RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank));
  }

  // ---- Объединение (нужна карта объединения; она не тратится) ----
  // Карты ранга R в нужном числе уничтожаются → одна новая карта ранга R+1. Без шанса провала:
  // цена растёт с рангом, поэтому до S, SS и SSS добраться так очень дорого, но гарантированно.
  // Каждая карта — одна. Сожжённые возвращаются в пул и снова могут выпасть. Изъяны тоже можно сжечь.
  function canFuse(save) { return !!(save.hero.cards || {}).fusion; }
  function fusionCost(data, rank) { return (data.cards.fusion.cost || {})[rank] || 0; }
  function copiesOfRank(save, data, rank) {
    return Object.entries(save.hero.cards || {}).filter(([id]) => id !== "fusion")
      .map(([id]) => ({ ...byId(data, id), copies: 1 })).filter((c) => c.rank === rank);
  }
  // picks: список id карт, которые сжечь (или старый вид { id: 1 })
  function fuse(save, data, rank, picks) {
    if (Array.isArray(picks)) picks = Object.fromEntries(picks.map((id) => [id, 1]));
    const h = save.hero, own = h.cards || {};
    if (!canFuse(save)) return { ok: false, error: "Нет карты объединения" };
    const next = RANKS[RANKS.indexOf(rank) + 1], need = fusionCost(data, rank);
    if (!next || !need) return { ok: false, error: "Выше ранга нет" };
    let total = 0;
    for (const [id, n] of Object.entries(picks || {})) {
      const c = byId(data, id);
      if (id === "fusion") return { ok: false, error: "Карту объединения нельзя сжечь" };
      if (!c || !own[id] || c.rank !== rank) return { ok: false, error: "Нужны твои карты ранга " + rank };
      if (!Number.isInteger(n) || !(n > 0) || n > own[id].lvl) return { ok: false, error: "Столько копий нет" };
      total += n;
    }
    if (total !== need) return { ok: false, error: "Нужно ровно " + need + " карт ранга " + rank };
    const k = (h.sys.fusions || 0);
    const r = rng((save.seed >>> 0) ^ (0x51ed270b * (k + 7)));
    const pool = catalog(data).filter((c) => c.rank === next && c.id !== "fusion" && !own[c.id] && !(data.cards.fusion.result_excludes_negative && c.negative));
    if (!pool.length) return { ok: false, error: "Все карты ранга " + next + " уже у тебя" };
    const made = pool[Math.floor(r() * pool.length)];
    for (const [id, n] of Object.entries(picks)) {
      own[id].lvl -= n;
      if (own[id].lvl <= 0) { delete own[id]; const L = loadout(save), i = L.indexOf(id); if (i >= 0) L.splice(i, 1); }
    }
    own[made.id] = { lvl: 1, at: save.clock }; if (made.kind === "active") autoEquip(save, data, made);
    h.sys.fusions = k + 1;
    refresh(save, data);
    save.journal.push({ at: save.clock, actor: "system", action: "fuse", rank, card: made.id, result: "ok" });
    if (G.achievements) { G.achievements.note(save, "fused", next); G.achievements.note(save, "card", made.rank); G.achievements.check(save); }
    return { ok: true, card: made, from: rank, to: next, spent: need };
  }
  // Сколько карт F нужно в пересчёте, чтобы собрать карту ранга (для подсказки игроку).
  function fCost(data, rank) {
    let n = 1; for (const r of RANKS.slice(0, RANKS.indexOf(rank))) n *= fusionCost(data, r); return n;
  }

  // Способность обычного пробуждённого (NPC): одна навсегда, ранг по шансам пробуждения,
  // 80% активная / 20% пассивная, из общего пула F–S (без карт, доступных только Системе героя).
  function drawAwakened(data, seed) {
    const r = rng(seed >>> 0), rank = rollRank(r, data.cards.awakening_odds);
    const w = data.cards.awakening_kind_weights || { active: 80, passive: 20 };
    const kind = rollKind(r, w);
    let pool = catalog(data).filter((c) => !c.hero_only && c.rank === rank && c.kind === kind);
    if (!pool.length) pool = catalog(data).filter((c) => !c.hero_only && c.rank === rank);
    return pool[Math.floor(r() * pool.length)];
  }

  function validate(data) {
    const errs = [], ids = new Set();
    for (const c of catalog(data)) {
      if (ids.has(c.id)) errs.push("карта: повтор " + c.id);
      ids.add(c.id);
      if (!RANKS.includes(c.rank)) errs.push("карта " + c.id + ": ранг");
      if (!["active", "passive"].includes(c.kind)) errs.push("карта " + c.id + ": вид");
    }
    return errs;
  }

  // Покупка попытки выбора за валюту Системы (черновик Claude: 100; «Наценка» ×1,25).
  const ATTEMPT_PRICE = 100;
  function attemptPrice(save, data) { return Math.round(((data.cards && data.cards.attempt_price) || ATTEMPT_PRICE) * (G.passives ? G.passives.mul(save.hero, "gacha_price") : 1)); }
  function buyAttempt(save, data) {
    const h = save.hero; if (!h.awakened || !h.sys) return { ok: false, error: "Системы нет" };
    const p = attemptPrice(save, data); if ((h.sys.coins || 0) < p) return { ok: false, error: "Нужно " + p + " валюты" };
    h.sys.coins -= p; h.sys.gacha = (h.sys.gacha || 0) + 1;
    save.journal.push({ at: save.clock, actor: "hero", action: "buy_attempt", amount: p, result: "ok" });
    return { ok: true, price: p };
  }
  return { attemptPrice, buyAttempt, RANKS, open, pick, owned, byId, validate, toggle, loadout, maxActive, drawAwakened, fuse, canFuse, fusionCost, copiesOfRank, fCost, migrate, refresh };
});

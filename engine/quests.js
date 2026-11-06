// Задания Системы (02.11.2026): случайные — Система иногда выдаёт утром (data/public/quests.json),
// сюжетные — выдаёт сцена шагом {"quest":{…}}. Награда — опыт и валюта Системы. За провал — ШТРАФ (всегда):
//   penalty: { coins: N (◆), xp: N, hp_pct: N, mp_pct: N,
//              debuff: {name, days, stats: N (минус ко всем характеристикам), mp_pct: N (минус к запасу маны)},
//              stat_loss: N — Система навсегда забирает N очков у сильнейшей характеристики,
//              death: true — смертельное задание: провал = смерть (концовка bad_system) }
//   не задан — по умолчанию: ◆ −max(20, награда), HP −25% и «Истощение» (−2 ко всем характеристикам на 2 дня).
//   Серия провалов (без выполненного между ними) — штраф растёт (решение заказчика 03.11.2026: хардкор, вплоть до смерти):
//     2-й провал подряд — ещё и −1 навсегда, 3-й — −2 навсегда и предупреждение, 4-й — смерть.
//   «Штрафной зоны» больше нет: Система не телепортирует, она наказывает напрямую.
// save.quests = { active:[{id, src, title, text, goal, progress, due, reward}], log:[{id, title, result, at}], day }
//   due — номер слота (день × 4 + слот), до которого надо успеть.
G.define("quests", function (G) {
  const now = (save) => save.day.n * 4 + save.day.slot;
  const st = (save) => save.quests && save.quests.active ? save.quests : (save.quests = { active: [], log: [], day: 0, seen: {} });
  let POOL = { chance: 0, pool: [] };
  function use(data) { POOL = data.quests || POOL; }
  const need = (g) => g.type === "gate_fast" || g.type === "cond" ? 1 : g.n || 1;
  function rnd(save, salt) { let x = ((save.seed >>> 0) ^ Math.imul(save.day.n + 3, 0x27d4eb2d) ^ salt) >>> 0;
    return () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), x | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Выдать задание. o: {id, title, text, goal, reward, src, due (слот) | slots (сколько слотов) | date ('ГГГГ-ММ-ДД' — до конца дня)}
  function give(save, o) {
    const S = st(save); if (S.active.some((q) => q.id === o.id)) return null;
    const endOfDay = save.day.n * 4 + 3;
    const due = o.due !== undefined ? o.due : o.slots ? now(save) + o.slots : o.date ? endOfDay + Math.round(G.clock.diff(save.day.date + "T07:00", o.date + "T07:00") / 1440) * 4 : endOfDay;
    const reward = o.reward || { xp: 0, coins: 0 };
    const q = { id: o.id, src: o.src || "story", title: o.title, text: o.text || "", goal: o.goal, progress: 0, seen: [], due, reward, penalty: o.penalty || defaultPenalty(reward) };
    S.active.push(q); check(save); if (!S.active.includes(q)) return q; G.system.notify(save, { kind: "quest_new", title: q.title, q: card(save, q), at: save.clock }); return q;
  }
  const defaultPenalty = (r) => ({ coins: Math.max(20, (r && r.coins) || 0), hp_pct: 25, debuff: { name: "Истощение", days: 2, stats: 2 } });
  // Серия провалов: сколько подряд провалено без выполненного между ними.
  function streak(save) { let n = 0; for (const l of st(save).log.slice().reverse()) { if (l.result === "failed") n++; else if (l.result === "done") break; } return n; }
  // Штраф с учётом серии (n — каким по счёту подряд будет этот провал).
  function escalate(p, n) {
    const e = Object.assign({}, p || {});
    if (n >= 4) e.death = true;
    else if (n === 3) { e.stat_loss = (e.stat_loss || 0) + 2; e.warn = true; }
    else if (n === 2) e.stat_loss = (e.stat_loss || 0) + 1;
    return e;
  }
  // Текст штрафа для окна Системы.
  function penaltyText(p) {
    if (!p) return [];
    const out = [];
    if (p.death) out.push("СМЕРТЬ");
    if (p.coins) out.push("◆ −" + p.coins);
    if (p.xp) out.push("EXP −" + p.xp);
    if (p.hp_pct) out.push("HP −" + p.hp_pct + "%");
    if (p.mp_pct) out.push("MP −" + p.mp_pct + "%");
    if (p.debuff) { const d = p.debuff, parts = []; if (d.stats) parts.push("все характеристики −" + d.stats); if (d.mp_pct) parts.push("запас маны −" + d.mp_pct + "%");
      out.push("«" + (d.name || "Истощение") + "»: " + parts.join(", ") + " · " + (d.days || 1) + " дн."); }
    if (p.stat_loss) out.push("Сильнейшая характеристика −" + p.stat_loss + " навсегда");
    if (p.warn) out.push("Следующий провал подряд — смерть");
    return out;
  }
  // Применить штраф (провал задания). Возвращает, что именно списано.
  function punish(save, p) {
    const h = save.hero; if (!p || !h.awakened) return [];
    if (p.coins && h.sys) h.sys.coins = Math.max(0, (h.sys.coins || 0) - p.coins);
    if (p.xp && h.sys) h.sys.xp = Math.max(0, (h.sys.xp || 0) - p.xp);
    if (p.hp_pct) h.hp = Math.max(1, Math.round(h.hp * (1 - p.hp_pct / 100)));
    if (p.mp_pct) h.mp = Math.max(0, Math.round((h.mp || 0) * (1 - p.mp_pct / 100)));
    if (p.debuff) addDebuff(save, p.debuff);
    if (p.stat_loss && h.stats) { const k = ["str", "agi", "vit", "per", "mag"].reduce((a, b) => (h.stats[b] > h.stats[a] ? b : a)); h.stats[k] = Math.max(1, h.stats[k] - p.stat_loss);
      if (G.system) { h.hp = Math.min(h.hp, G.system.maxHp(h)); h.mp = Math.min(h.mp, G.system.maxMp(h)); } }
    if (p.death) { if (G.day && G.day.die) G.day.die(save); else { h.dead = true; h.hp = 0; } h.death_cause = "Система: задание провалено"; const E = ((G.data && G.data.story && G.data.story.endings) || {}).bad_system; h.ending = E ? { id: "bad_system", title: E.title, text: E.text } : { id: "bad_system", title: "Непригоден", text: "Система сочла его непригодным." }; }
    return penaltyText(p);
  }
  const STATK = ["СИЛ", "ЛОВ", "ВЫН", "ВОС"];
  function addDebuff(save, d) {
    const h = save.hero, start = save.day.slot === 3 ? 1 : 0;   // провал ночью — штраф действует весь следующий день
    const until = G.clock.advance(save.day.date + "T07:00", (start + (d.days || 1)) * 1440).slice(0, 10);
    const fx = [];
    if (d.stats) for (const k of STATK) fx.push({ k: "stat:" + k, op: "+", v: -d.stats });
    if (d.mp_pct) fx.push({ k: "mp_cap", op: "×", v: 1 - d.mp_pct / 100 });
    (h.debuffs || (h.debuffs = [])).push({ name: d.name || "Истощение", until, fx, text: penaltyText({ debuff: d })[0] });
  }
  // Утро нового дня: просроченные — в провал, иногда новое случайное.
  function morning(save, data) {
    const S = st(save);
    if (save.hero.debuffs) save.hero.debuffs = save.hero.debuffs.filter((d) => d.until > save.day.date);   // штраф действует до утра дня until
    delete save.penalty_zone;   // старые сохранения: Штрафной зоны больше нет
    expire(save); if (S.day >= save.day.n) return; S.day = save.day.n;
    if (!save.hero.awakened || S.active.some((q) => q.src === "random")) return;
    const r = rnd(save, 11); if (r() >= (POOL.chance || 0)) return;
    const gateKnown = G.gates && G.gates.known(save).length > 0;
    const pool = (POOL.pool || []).filter((p) => !p.need || (p.need === "gate_known" && gateKnown));
    if (!pool.length) return;
    const p = pool[Math.floor(r() * pool.length)];
    give(save, Object.assign({}, p, { id: p.id + "@" + save.day.n, src: "random" }));
  }
  function expire(save) {
    const S = st(save), t = now(save);
    for (const q of S.active.slice()) if (t > q.due || (t === q.due && save.day.slot === 3)) close(save, q, "failed");
  }
  function close(save, q, result) {
    const S = st(save); S.active = S.active.filter((x) => x !== q); S.log.push({ id: q.id, src: q.src, title: q.title, result, at: save.clock }); q.closed = true;
    if (result === "done") {
      if (q.reward.xp && save.hero.awakened) G.system.gainXp(save, q.reward.xp, "quest");
      if (q.reward.coins && save.hero.sys) save.hero.sys.coins = (save.hero.sys.coins || 0) + q.reward.coins;
      G.system.notify(save, { kind: "quest_done", title: q.title, reward: q.reward, q: card(save, q), at: save.clock });
    }
    else if (result === "failed") { const lost = punish(save, escalate(q.penalty, streak(save))); G.system.notify(save, { kind: "quest_failed", title: q.title, q: card(save, q), lost, at: save.clock }); }
    if (G.achievements && save.hero.awakened) G.achievements.check(save);   // «Задания Системы», «30 дней без провалов»
  }
  function bump(save, q, k) { q.progress = Math.min(need(q.goal), q.progress + (k || 1)); if (q.progress >= need(q.goal)) close(save, q, "done"); }
  // События мира → прогресс.
  function event(save, kind, o) {
    o = o || {};
    for (const q of st(save).active.slice()) {
      const g = q.goal;
      if (kind === "act" && g.type === "act" && g.act === o.act) bump(save, q);
      else if (kind === "act" && g.type === "shifts" && o.act === "work") bump(save, q);
      else if (kind === "visit" && g.type === "visit" && !q.seen.includes(o.place)) { q.seen.push(o.place); bump(save, q); }
      else if (kind === "battle" && o.result === "won" && (g.type === "win" || (g.type === "flawless" && o.hp_lost <= 10))) bump(save, q);
      else if (kind === "gate" && g.type === "gate") bump(save, q);
      else if (kind === "gate" && g.type === "gate_fast" && o.turns <= g.turns) bump(save, q);
    }
  }
  // Цели-состояния (сверяются после каждого дела и шага сцены):
  //   money — накопить N ₩ на счёте к сроку; cond — любое условие сюжета (например, долг Ёнмина закрыт).
  function check(save) {
    for (const q of st(save).active.slice()) {
      const g = q.goal;
      if (g.fail_if && G.plot && G.plot.test(save, g.fail_if)) { close(save, q, "failed"); continue; }   // провал по сюжету (сорвался на месте)
      if (g.type === "money") { q.progress = Math.min(g.n, Math.max(0, save.hero.money || 0)); if (q.progress >= g.n) close(save, q, "done"); }
      else if (g.type === "cond" && G.plot && G.plot.test(save, g.if)) { q.progress = 1; close(save, q, "done"); }
    }
  }
  const status = (save, id) => { const S = st(save); if (S.active.some((q) => q.id === id)) return "active"; const l = S.log.filter((x) => x.id === id).pop(); return l ? l.result : null; };
  function goalText(q) {
    const g = q.goal, n = need(g);
    if (g.type === "money") return (q.text || "Накопить") + " — " + G.hero.formatMoney(q.progress) + " из " + G.hero.formatMoney(g.n);
    if (g.type === "cond") return q.text || q.title;
    return g.type === "gate_fast" ? "Закрыть врата за " + g.turns + " ходов" : (q.text || q.title) + " — " + q.progress + " / " + n;
  }
  function dueText(save, q) { const left = q.due - now(save); return left <= 0 ? "до конца этого слота" : Math.floor(q.due / 4) === save.day.n ? "до конца дня" : "ещё " + (Math.floor(q.due / 4) - save.day.n) + " дн."; }
  function deadline(save, q) { const d = Math.floor(q.due / 4) - save.day.n, iso = G.clock.advance(save.day.date + "T07:00", d * 1440).slice(0, 10); return iso.slice(8, 10) + "." + iso.slice(5, 7); }
  // Снимок для окна Системы (уведомление хранит его — задание к моменту показа может уже закрыться).
  const card = (save, q) => ({ id: q.id, title: q.title, goal: goalText(q), progress: q.progress, need: need(q.goal), due: deadline(save, q), left: dueText(save, q), reward: q.reward, penalty: penaltyText(escalate(q.penalty, streak(save) + (q.closed ? 0 : 1))), story: q.src === "story" });
  const view = (save) => st(save).active.map((q) => Object.assign({}, q));
  return { penaltyText, punish, addDebuff, check, use, give, morning, expire, event, status, view, goalText, dueText, streak, escalate, state: st };
});

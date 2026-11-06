// Кузня Кихо и заказы (Claude, 03.11.2026). Данные — data/public/forge.json.
//  • Репутация у кузнеца (переменная forge_rep): +за выполненные заказы кузнеца, +1 за каждые 100 000 ₩, потраченные у него;
//    −6 за проваленный заказ. Ступени — forge.json → rep_tiers.
//  • Рецепты покупаются за деньги и только при нужной репутации. Крафт: материалы с конкретных тварей + кристаллы + плата;
//    шанс успеха (F 60%, E 45%, D 30%). Неудача — материалы сгорают, плата не возвращается.
//  • Заказы: у кузнеца (деньги + репутация) и у старика Чо (деньги, больше). По одному предложению в неделю у каждого,
//    берётся одно; срок — 7 дней. Сдать — на месте (кузня / рынок), материалы берутся из рюкзака и ячеек Системы.
//  • Заточка — только с пассивной картой «Кузнечное чутьё» (A): кристаллы ранга вещи + деньги, до +5, каждая ступень +10%.
// save.forge = { recipes:{id:1}, spent, orders:{forge:{offer, active}, cho:{…}} }
G.define("forge", function (G) {
  let F = { recipes: [], rep_tiers: [[0, "Чужой"]], orders: {}, sharpen: {} };
  function use(data) { F = Object.assign(F, data.forge || {}); }
  const V = (save) => G.plot.state(save).vars;
  const st = (save) => save.forge || (save.forge = { recipes: {}, spent: 0, orders: {} });
  const rep = (save) => V(save).forge_rep || 0;
  function addRep(save, n) { V(save).forge_rep = Math.max(0, rep(save) + n); }
  function tier(save) { const r = rep(save); let t = F.rep_tiers[0]; for (const x of F.rep_tiers) if (r >= x[0]) t = x; const nx = F.rep_tiers.find((x) => x[0] > r); return { name: t[1], rep: r, next: nx ? nx[0] : null, nextName: nx ? nx[1] : null }; }
  // Потратил у кузнеца — +1 репутации за каждые 100 000 ₩ (накопительно).
  function spend(save, won, title) {
    G.hero.charge(save.hero, save.clock, -won, "Кузня Кихо: " + title);
    const S = st(save), before = Math.floor(S.spent / 100000); S.spent += won; addRep(save, Math.floor(S.spent / 100000) - before);
  }
  // Сколько единиц материала у Сиу (рюкзак + ячейки Системы).
  function have(save, id) { const h = save.hero; return ((h.materials || {})[id] || 0) + (h.inventory || []).filter((x) => x && x.kind === "mat" && x.id === id).reduce((a, x) => a + x.count, 0); }
  function take(save, id, n) {
    const h = save.hero; let left = n;
    const m = (h.materials || {})[id] || 0, a = Math.min(m, left); if (a) { h.materials[id] -= a; if (h.materials[id] <= 0) delete h.materials[id]; left -= a; }
    (h.inventory || []).forEach((x, k) => { if (left > 0 && x && x.kind === "mat" && x.id === id) { const b = Math.min(x.count, left); x.count -= b; left -= b; if (x.count <= 0) h.inventory[k] = null; } });
    return n - left;
  }
  const closed = (save) => { const s = save.day && save.day.slot; return s !== 1 && s !== 2 ? "Кузня открыта днём и вечером" : ""; };
  // ---- рецепты и крафт ----
  function recipes(save) {
    const S = st(save);
    return F.recipes.map((r) => ({ ...r, owned: !!S.recipes[r.id], need: r.need.map((n) => ({ ...n, have: have(save, n.id) })) }));
  }
  function buyRecipe(save, id) {
    const r = F.recipes.find((x) => x.id === id); if (!r) throw Error("Нет такого рецепта");
    const c = closed(save); if (c) throw Error(c);
    if (st(save).recipes[id]) throw Error("Рецепт уже твой");
    if (rep(save) < r.rep) throw Error("Кихо не продаёт такое чужим: нужна репутация " + r.rep);
    if (save.hero.money < r.price) throw Error("Не хватает денег");
    spend(save, r.price, "рецепт «" + r.name + "»"); st(save).recipes[id] = save.clock; return r;
  }
  function canCraft(save, id) {
    const r = recipes(save).find((x) => x.id === id); if (!r) return "Нет такого рецепта";
    if (!r.owned) return "Сначала купи рецепт"; const c = closed(save); if (c) return c;
    if (r.need.some((n) => n.have < n.n)) return "Не хватает материалов";
    if (save.hero.money < r.fee) return "Не хватает на работу мастера";
    return "";
  }
  function craft(save, id, roll) {
    const w = canCraft(save, id); if (w) throw Error(w);
    const r = F.recipes.find((x) => x.id === id), S = st(save); S.crafts = (S.crafts || 0) + 1;
    for (const n of r.need) take(save, n.id, n.n);
    spend(save, r.fee, "работа над «" + r.name + "»");
    let x = roll; if (x === undefined) { x = ((save.seed >>> 0) ^ Math.imul(S.crafts + 77, 0x9e3779b1)) >>> 0; x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296; }
    if (x >= r.chance) { V(save).forge_fails = (V(save).forge_fails || 0) + 1; return { ok: false, recipe: r }; }
    const it = JSON.parse(JSON.stringify(r.item)); it.uid = it.id + "@" + save.clock + "#f" + S.crafts; it.dur = it.gear.dur;
    (save.hero.items || (save.hero.items = [])).push(it); V(save).forge_crafted = (V(save).forge_crafted || 0) + 1;
    return { ok: true, item: it, recipe: r };
  }
  // ---- заточка (карта «Кузнечное чутьё») ----
  const canSharpenAt = (save) => !!((save.hero.cards || {})[(F.sharpen || {}).card]);
  function sharpenCost(it) { const k = it.plus || 0, S = F.sharpen; return k >= S.max ? null : { cry: S.cry[k], money: S.money[k], chance: S.chance[k], id: "CRY-" + (it.rank || "F") }; }
  function sharpen(save, it, roll) {
    if (!canSharpenAt(save)) throw Error("Нужна карта «Кузнечное чутьё»"); const c = closed(save); if (c) throw Error(c);
    const cost = sharpenCost(it); if (!cost) throw Error("Предел заточки");
    if (have(save, cost.id) < cost.cry) throw Error("Нужно кристаллов: " + cost.cry); if (save.hero.money < cost.money) throw Error("Не хватает денег");
    take(save, cost.id, cost.cry); spend(save, cost.money, "заточка «" + it.name + "»");
    const S = st(save); S.sharp = (S.sharp || 0) + 1;
    let x = roll; if (x === undefined) { x = ((save.seed >>> 0) ^ Math.imul(S.sharp + 131, 0x85ebca6b)) >>> 0; x = (Math.imul(x ^ (x >>> 13), 0x297a2d39) >>> 0) / 4294967296; }
    if (x < cost.chance) { it.plus = (it.plus || 0) + 1; if (G.gear) G.gear.refresh(save, G.data); return { ok: true, plus: it.plus }; }
    if ((it.plus || 0) >= 3) it.plus -= 1;
    return { ok: false, plus: it.plus || 0 };
  }
  // ---- заказы ----
  const week = (save) => Math.floor(((save.day && save.day.n) || 1) - 1) / 7 | 0;
  const GIVERS = { forge: { name: "Кихо", place: "nowon:forge" }, cho: { name: "Старик Чо", place: "nowon:market" } };
  function makeOffer(save, who) {
    const B = ((G.data && G.data.bestiary && G.data.bestiary.species) || []).filter((s) => s.role === "regular" && s.material && !String(s.id).startsWith("H-"));
    const R = ["F", "E", "D", "C", "B", "A", "S"], top = Math.max(0, Math.min(2, R.indexOf(G.hero.powerRank(save))));
    let x = ((save.seed >>> 0) ^ Math.imul(week(save) + (who === "cho" ? 501 : 7), 0x9e3779b1)) >>> 0; const rnd = () => { x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return x / 4294967296; };
    const rank = R[Math.floor(rnd() * (top + 1))], pool = B.filter((s) => s.rank === rank); if (!pool.length) return null;
    const s = pool[Math.floor(rnd() * pool.length)], n = 4 + Math.floor(rnd() * 7), O = (F.orders || {})[who] || { mult: 1.6, rep: [0, 0] };
    return { id: who + "_" + week(save), who, mat: s.material.id, name: s.material.name, from: s.name, rank, n, pay: Math.round(s.material.price_won * n * O.mult / 1000) * 1000,
      rep: O.rep[0] + Math.floor(rnd() * (O.rep[1] - O.rep[0] + 1)), days: (F.orders || {}).week_days || 7 };
  }
  function orders(save, who) {
    const S = st(save), o = S.orders[who] || (S.orders[who] = {});
    if (!o.active && (!o.offer || o.offer.id !== who + "_" + week(save)) && o.taken !== who + "_" + week(save)) o.offer = makeOffer(save, who);
    if (o.active) o.active.have = have(save, o.active.mat);
    return o;
  }
  function accept(save, who) { const o = orders(save, who); if (o.active) throw Error("Уже есть заказ"); if (!o.offer) throw Error("Заказов нет"); o.active = Object.assign({}, o.offer, { due: G.clock.advance(save.day.date + "T07:00", o.offer.days * 1440).slice(0, 10) }); o.taken = o.offer.id; o.offer = null; return o.active; }
  function deliver(save, who) {
    const o = orders(save, who), a = o.active; if (!a) throw Error("Заказа нет");
    const c = closed(save); if (c) throw Error(c);
    if (save.hero.location !== GIVERS[who].place) throw Error("Сдавать — на месте");
    if (have(save, a.mat) < a.n) throw Error("Не хватает: " + a.name);
    take(save, a.mat, a.n); G.hero.charge(save.hero, save.clock, a.pay, "Заказ: " + GIVERS[who].name); if (a.rep) addRep(save, a.rep);
    V(save)["orders_done_" + who] = (V(save)["orders_done_" + who] || 0) + 1; o.active = null; return a;
  }
  // Утро: просроченные заказы — провал.
  function morning(save) {
    for (const who of Object.keys(GIVERS)) { const o = st(save).orders[who]; if (o && o.active && save.day.date > o.active.due) {
      if (who === "forge") addRep(save, (F.orders || {}).fail_rep || -6);
      V(save)["orders_failed_" + who] = (V(save)["orders_failed_" + who] || 0) + 1;
      if (G.mail) G.mail.send(save, { app: "Почта", from: GIVERS[who].name, title: "Заказ сорван", text: who === "forge" ? "Материал так и не принёс. Запомню." : "Не принёс — ну и ладно. Найду другого." });
      o.active = null; } }
  }
  const activeAll = (save) => Object.keys(GIVERS).map((w) => (st(save).orders[w] || {}).active).filter(Boolean);
  return { use, rep, tier, recipes, buyRecipe, canCraft, craft, have, take, canSharpenAt, sharpenCost, sharpen, orders, accept, deliver, morning, activeAll, GIVERS, cfg: () => F };
});

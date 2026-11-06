// Сбыт трофеев из Врат (02.11.2026, блок 6Е, задание «Ничего не продаётся само»).
// Каналы открываются переменными сюжета (c1_sell_box / c1_sell_cho / c1_sell_grey), настройки — rules.json → market.
//   Бокс Ассоциации «Находка гражданина»: 40% каталога, за раз не дороже 100 000 ₩ по каталогу, скан паспорта (assoc_scans).
//   Старик Чо на рынке: 60% наличными, без паспорта, не больше 2 штук в неделю.
//   Серый скупщик у ломбарда: 75%, но лезет в душу (grey_heat) и может навести карманника — тогда ни денег, ни вещи.
// Продажа не тратит слот, но только днём или вечером.
G.define("market", function (G) {
  const DEF = { channels: [] };
  let C = DEF, PRICE = {};
  function use(data) {
    C = Object.assign({}, DEF, (data.rules && data.rules.market) || {}); PRICE = {};
    for (const s of (data.bestiary && data.bestiary.species) || []) {
      if (s.material) PRICE[s.material.id] = { price: s.material.price_won || 0, name: s.material.name };
      for (const p of s.pool || []) if (p.kind === "material") PRICE[p.id] = { price: p.price_won || 0, name: p.name };
    }
    if (G.crystals) for (const m of G.crystals.all()) PRICE[m.id] = { price: m.price_won, name: m.name };
  }
  const V = (save) => G.plot.state(save).vars;
  const st = (save) => save.market || (save.market = { sold: [], n: 0 });
  const week = (save) => Math.floor(((save.day && save.day.n) || 1) - 1) / 7 | 0;
  function channels(save) { return (C.channels || []).filter((c) => !!V(save)[c.var]); }
  function left(save, ch) {   // сколько штук ещё возьмёт канал на этой неделе (Infinity — без лимита)
    if (!ch.week_units) return Infinity;
    const w = week(save); return Math.max(0, ch.week_units - st(save).sold.filter((x) => x.ch === ch.id && x.week === w).reduce((s, x) => s + x.n, 0));
  }
  // Цена по каталогу; у кристаллов — по курсу недели.
  const cost = (save, id) => G.crystals && G.crystals.isCrystal(id) ? G.crystals.price(save, id) : (PRICE[id] || {}).price || 0;
  // Что можно сдать: рюкзак (материалы и вещи) и инвентарь Системы.
  function goods(save) {
    const h = save.hero, out = [];
    for (const [id, n] of Object.entries(h.materials || {})) if (n > 0) out.push({ key: "bag:" + id, name: (PRICE[id] || {}).name || id, n, price: cost(save, id), where: "Рюкзак", crystal: !!(G.crystals && G.crystals.isCrystal(id)) });
    (h.items || []).forEach((it) => out.push({ key: "item:" + it.uid, name: it.name, n: 1, price: it.price_won || 0, where: "Рюкзак" }));
    (h.inventory || []).forEach((x, k) => { if (x && (x.kind === "mat" || x.kind === "item") && x.count > 0) out.push({ key: "inv:" + k, name: x.name, n: x.count, price: x.kind === "mat" && G.crystals && G.crystals.isCrystal(x.id) ? cost(save, x.id) : x.price_won || (PRICE[x.id] || {}).price || 0, where: "Инвентарь Системы", crystal: x.kind === "mat" && !!(G.crystals && G.crystals.isCrystal(x.id)) }); });
    return out.filter((g) => g.price > 0);
  }
  function why(save, ch, g) {   // почему нельзя (пусто — можно)
    const s = save.day && save.day.slot;
    if (s !== 1 && s !== 2) return "Скупки работают днём и вечером";
    if (save.penalty_zone) return "Сначала штрафная зона";
    if (left(save, ch) <= 0) return "Лимит недели исчерпан";
    if (ch.max_value && g.price > ch.max_value) return "Дороже " + ch.max_value.toLocaleString("ru-RU") + " ₩ — нужен инспектор";
    return "";
  }
  function take(save, key) {
    const h = save.hero, [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (kind === "bag") { h.materials[id] -= 1; if (h.materials[id] <= 0) delete h.materials[id]; return; }
    if (kind === "item") { h.items = (h.items || []).filter((it) => it.uid !== id); return; }
    const x = h.inventory[+id]; x.count -= 1; if (x.list && x.list.length) x.list.pop(); if (x.count <= 0) h.inventory[+id] = null;
  }
  // Сдать одну штуку. Возвращает { won, robbed }.
  function sell(save, chId, key) {
    const ch = channels(save).find((c) => c.id === chId); if (!ch) throw Error("Этот канал Сиу ещё не разведал");
    const g = goods(save).find((x) => x.key === key); if (!g) throw Error("Нечего сдавать");
    const w = why(save, ch, g); if (w) throw Error(w);
    const S = st(save), vars = V(save); S.n++;
    take(save, key);
    S.sold.push({ ch: ch.id, week: week(save), n: 1, at: save.clock });
    if (ch.scan) vars.assoc_scans = (vars.assoc_scans || 0) + 1;
    if (G.heat) G.heat.add(save, ch.scan ? 2 : ch.heat ? 3 : 0);   // внимание Ассоциации: паспорт в базе / серый рынок
    if (ch.heat) vars.grey_heat = (vars.grey_heat || 0) + ch.heat;
    let x = ((save.seed >>> 0) ^ Math.imul(S.n + 31, 0x9e3779b1)) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
    if (ch.risk && (x % 1000) / 1000 < ch.risk) { vars.grey_robbed = (vars.grey_robbed || 0) + 1; return { won: 0, robbed: true, name: g.name }; }
    const won = Math.round(g.price * ch.rate / 100) * 100;
    G.hero.charge(save.hero, save.clock, won, ch.short + ": " + g.name);
    return { won, robbed: false, name: g.name };
  }
  return { use, channels, goods, left, why, sell };
});

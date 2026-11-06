// Рюкзак и инвентарь Системы (t354; рюкзак со слотами и весом — Claude 02.11.2026).
// Инвентарь Системы (канон): 10 ячеек, в ячейке сколько угодно одинаковых предметов, размер и вес не ограничены,
// время внутри стоит, живое не берёт, при смерти содержимое пропадает.
// Рюкзак — обычная сумка: ограничен слотами (вид материала — один слот-стопка, вещь — один слот) и весом
// (база + кг за Силу). Числа — rules.json → backpack. Что не влезло ни в рюкзак, ни в инвентарь — осталось лежать.
G.define("sysinv", function (G) {
  const DEF = { slots: 8, base_kg: 10, kg_per_str: 0.5, material_kg: 0.5,
    item_kg: { weapon: 3, weapon_2h: 5, offhand: 3, top: 6, bottom: 4, head: 2, feet: 2, cloak: 1.5, belt: 1, relic: 0.5, ring: 0.1, other: 2 } };
  const R = () => Object.assign({}, DEF, (G.data && G.data.rules && G.data.rules.backpack) || {});
  const r1 = (x) => Math.round(x * 10) / 10;
  const mats = (h) => Object.entries(h.materials || {}).filter(([, n]) => n > 0);
  // Вес вещи по виду снаряжения.
  function itemKg(it) {
    const K = R().item_kg, g = it && (it.gear || (G.gear && G.data ? G.gear.info(G.data, it) : null));
    if (!g) return K.other;
    if (g.eq === "weapon") return g.offhand ? K.offhand : g.hands === 2 ? K.weapon_2h : K.weapon;
    return K[g.eq] !== undefined ? K[g.eq] : K.other;
  }
  function slotsMax() { return R().slots; }
  function slotsUsed(h) { return mats(h).length + (h.items || []).length; }
  function capKg(h) { const c = R(); return r1(c.base_kg + c.kg_per_str * (((h.stats && h.stats.str) || 10) + (G.passives ? G.passives.stat(h, "str") : 0))); }
  function weight(h) { return r1(mats(h).reduce((s, [, n]) => s + n * R().material_kg, 0) + (h.items || []).reduce((s, it) => s + itemKg(it), 0)); }
  function load(h) { return { slots: slotsUsed(h), slotsMax: slotsMax(), kg: weight(h), kgMax: capKg(h) }; }
  // Сколько единиц материала влезет: новый вид требует свободного слота, дальше — по весу.
  function fitsMat(h, id, n) {
    if (!((h.materials || {})[id] > 0) && slotsUsed(h) >= slotsMax()) return 0;
    return Math.max(0, Math.min(n, Math.floor((capKg(h) - weight(h) + 1e-9) / R().material_kg)));
  }
  function fitsItem(h, it) { return slotsUsed(h) < slotsMax() && weight(h) + itemKg(it) <= capKg(h) + 1e-9; }
  // Совместимость со старым кодом: used/cap — вес, free — сколько ещё кг.
  const used = weight, cap = capKg, free = (h) => Math.max(0, r1(capKg(h) - weight(h)));
  const inv = (h) => (Array.isArray(h.inventory) ? h.inventory : (h.inventory = new Array(10).fill(null)));
  // Положить в инвентарь Системы: материалы стопкой в одну ячейку, вещи — одинаковые по id тоже стопкой.
  function invPut(h, entry) {
    if (!h.awakened) return false;
    const I = inv(h), key = entry.kind + ":" + entry.id;
    let k = I.findIndex((x) => x && x.kind + ":" + x.id === key);
    if (k < 0) k = I.indexOf(null);
    if (k < 0) return false;
    if (!I[k]) I[k] = { kind: entry.kind, id: entry.id, name: entry.name, count: 0, price_won: entry.price_won || 0, list: entry.kind === "item" ? [] : undefined };
    I[k].count += entry.n || 1;
    if (entry.kind === "item") I[k].list.push(entry.item);
    return true;
  }
  // Добыча после боя: сначала рюкзак, потом инвентарь Системы, остальное остаётся на месте.
  function addLoot(save, data, mt, items) {
    const h = save.hero; h.materials = h.materials || {}; h.items = h.items || [];
    const left = [], toInv = [];
    for (const [id, m] of Object.entries(mt || {})) {
      let n = m.units; const b = fitsMat(h, id, n); if (b > 0) { h.materials[id] = (h.materials[id] || 0) + b; n -= b; }
      if (n > 0) { if (invPut(h, { kind: "mat", id, name: m.name, n, price_won: m.price_won })) toInv.push(m.name + " ×" + n); else left.push(m.name + " ×" + n); }
    }
    for (const it of items || []) {
      if (fitsItem(h, it)) { h.items.push(it); continue; }
      if (invPut(h, { kind: "item", id: it.id, name: it.name, item: it, price_won: it.price_won })) toInv.push("«" + it.name + "»"); else left.push("«" + it.name + "»");
    }
    if (left.length) save.journal.push({ at: save.clock, actor: "hero", action: "loot_left", what: left, result: "full" });
    return { toInv, left };
  }
  // Из рюкзака в инвентарь Системы (мгновенно, канон: инвентарь не тратит время).
  function stash(save, kind, key) {
    const h = save.hero; if (!h.awakened) return { ok: false, error: "Системы нет" };
    if (kind === "mat") {
      const n = (h.materials || {})[key] || 0; if (!n) return { ok: false, error: "Нет такого" };
      const name = (G.data ? (G.data._matIndex || {})[key] : null);
      if (!invPut(h, { kind: "mat", id: key, name: (name && name.name) || key, n, price_won: name && name.price_won })) return { ok: false, error: "Все 10 ячеек заняты" };
      delete h.materials[key]; return { ok: true };
    }
    const i = (h.items || []).findIndex((x) => x.uid === key); if (i < 0) return { ok: false, error: "Нет такого" };
    const it = h.items[i];
    if (!invPut(h, { kind: "item", id: it.id, name: it.name, item: it, price_won: it.price_won })) return { ok: false, error: "Все 10 ячеек заняты" };
    h.items.splice(i, 1); return { ok: true };
  }
  // Достать из ячейки в рюкзак — сколько влезет по слотам и весу.
  function take(save, slot) {
    const h = save.hero, I = inv(h), e = I[slot]; if (!e) return { ok: false, error: "Ячейка пуста" };
    if (e.kind === "thing") return { ok: false, error: "Это остаётся в инвентаре" };
    h.materials = h.materials || {}; h.items = h.items || [];
    let moved = 0;
    if (e.kind === "mat") { const n = fitsMat(h, e.id, e.count); if (n > 0) { h.materials[e.id] = (h.materials[e.id] || 0) + n; e.count -= n; moved = n; } }
    else while (e.list.length && fitsItem(h, e.list[0])) { h.items.push(e.list.shift()); e.count -= 1; moved++; }
    if (e.count <= 0) I[slot] = null;
    return moved ? { ok: true, moved } : { ok: false, error: slotsUsed(h) >= slotsMax() ? "В рюкзаке нет свободных слотов" : "Рюкзак слишком тяжёлый" };
  }
  // Смерть: содержимое инвентаря пропадает (канон).
  function onDeath(h) { if (Array.isArray(h.inventory)) h.inventory = h.inventory.map(() => null); }
  return { itemKg, slotsMax, slotsUsed, capKg, weight, load, fitsMat, fitsItem, cap, used, free, addLoot, stash, take, onDeath };
});

// Герой: стартовые параметры по канону, возраст, деньги, платежи.
G.define("hero", function (G) {
  function create(start, name, location) {
    return {
      name,
      location,
      birthdate: start.birthdate,
      money: start.money,
      energy: start.energy,
      school: { ...start.school },
      housing: { ...start.housing },
      bills: start.bills.map((b) => ({ ...b, paid: false })),
      belongings: [...start.belongings],
      pantry: { ...(start.pantry || {}) }, // запасы дома (купленное, но не съеденное)
      awakened: false,
      // RPG-слой (этап 3): уровень и характеристики появятся после пробуждения.
      level: null, stats: null,
      equipment: emptyEquipment(),
      inventory: new Array(INVENTORY_SIZE).fill(null), // показывается только после пробуждения
      ledger: [{ at: null, amount: start.money, title: "Остаток на счёте", kind: "start" }],
    };
  }

  // Слоты экипировки вокруг фигуры героя. Кольца — один слот с 5 подслотами.
  const EQUIP_SLOTS = [
    { id: "head", name: "Голова", side: "left" },
    { id: "cloak", name: "Плащ", side: "left" },
    { id: "top", name: "Верх", side: "left" },
    { id: "belt", name: "Пояс", side: "left" },
    { id: "bottom", name: "Низ", side: "left" },
    { id: "feet", name: "Обувь", side: "left" },
    { id: "weapon_l", name: "Оружие (Л)", side: "right" },
    { id: "weapon_r", name: "Оружие (П)", side: "right" },
    { id: "relic", name: "Реликвия", side: "right" },
    { id: "rings", name: "Кольца", side: "right", sub: 5 },
  ];
  const INVENTORY_SIZE = 10;
  function emptyEquipment() {
    const e = {};
    for (const s of EQUIP_SLOTS) e[s.id] = s.sub ? new Array(s.sub).fill(null) : null;
    return e;
  }

  // Старые сохранения: дополнить недостающие поля, ничего не теряя.
  function migrate(hero, start) {
    const e = hero.equipment || {};
    const fresh = emptyEquipment();
    for (const k of Object.keys(fresh)) if (e[k] === undefined) e[k] = fresh[k];
    hero.equipment = e;
    if (!Array.isArray(hero.inventory) || hero.inventory.length !== INVENTORY_SIZE) {
      const old = Array.isArray(hero.inventory) ? hero.inventory : [];
      hero.inventory = new Array(INVENTORY_SIZE).fill(null).map((_, i) => old[i] || null);
    }
    if (!hero.pantry) hero.pantry = { ...((start && start.pantry) || {}) };
    if (!Array.isArray(hero.ledger)) hero.ledger = [{ at: null, amount: start ? start.money : hero.money, title: "Остаток на счёте", kind: "start" }];
    return hero;
  }

  // ---- Экипировка ----
  // Предмет: { id, name, slot: "head"|"top"|"bottom"|"feet"|"weapon"|"ring", hands?: 1|2, icon? }
  const TWO_HAND_LOCK = "@weapon_r"; // метка в «Оружие (Л)», когда двуручное в правой руке

  function ringsUnlocked(hero, rules) {
    const lv = hero.awakened ? (hero.level || 1) : 0;
    return (rules.ring_unlock_levels || [0]).filter((need) => lv >= need).length;
  }
  function ringUnlockLevel(i, rules) { return (rules.ring_unlock_levels || [])[i]; }

  function slotAccepts(slotId, item) {
    if (slotId === "weapon_l" || slotId === "weapon_r") return item.slot === "weapon";
    if (slotId.startsWith("rings:")) return item.slot === "ring";
    return item.slot === slotId;
  }

  function get(hero, slotId) {
    if (slotId.startsWith("rings:")) return hero.equipment.rings[+slotId.slice(6)];
    return hero.equipment[slotId];
  }
  function set(hero, slotId, v) {
    if (slotId.startsWith("rings:")) hero.equipment.rings[+slotId.slice(6)] = v;
    else hero.equipment[slotId] = v;
  }

  // Снять в инвентарь. Возвращает снятый предмет.
  function unequip(hero, slotId) {
    if (slotId === "weapon_l" && hero.equipment.weapon_l === TWO_HAND_LOCK) slotId = "weapon_r";
    const it = get(hero, slotId);
    if (!it || it === TWO_HAND_LOCK) throw new Error("Слот пуст");
    const free = hero.inventory.indexOf(null);
    if (free < 0) throw new Error("В инвентаре нет места");
    hero.inventory[free] = it; set(hero, slotId, null);
    if (it.hands === 2) hero.equipment.weapon_l = null;
    return it;
  }

  // Надеть предмет из ячейки инвентаря в слот. Всё или ничего.
  function equip(hero, invIndex, slotId, rules) {
    const item = hero.inventory[invIndex];
    if (!item) throw new Error("Ячейка пуста");
    if (!slotAccepts(slotId, item)) throw new Error("Сюда это не надеть");
    if (slotId.startsWith("rings:") && +slotId.slice(6) >= ringsUnlocked(hero, rules))
      throw new Error("Эта ячейка колец ещё закрыта");
    if (item.hands === 2) slotId = "weapon_r";
    // что придётся снять
    const out = [];
    const cur = get(hero, slotId);
    if (cur && cur !== TWO_HAND_LOCK) out.push(slotId);
    if (item.hands === 2 && hero.equipment.weapon_l && hero.equipment.weapon_l !== TWO_HAND_LOCK) out.push("weapon_l");
    if (slotId === "weapon_l" && hero.equipment.weapon_l === TWO_HAND_LOCK) out.push("weapon_r");
    const freeAfter = hero.inventory.filter((x) => x === null).length + 1; // +1: ячейка надеваемого освободится
    if (out.length > freeAfter) throw new Error("В инвентаре нет места для снятых вещей");
    hero.inventory[invIndex] = null;
    for (const s of out) unequip(hero, s);
    set(hero, slotId, item);
    if (item.hands === 2) hero.equipment.weapon_l = TWO_HAND_LOCK;
    return item;
  }

  // Списание/зачисление по счёту — единственный путь изменения денег героя.
  function charge(hero, at, amount, title) {
    if (amount < 0 && hero.money + amount < 0) throw new Error("Не хватает денег");
    hero.money += amount;
    hero.ledger.push({ at, amount, title });
  }

  function payBill(hero, at, billId) {
    const b = hero.bills.find((x) => x.id === billId);
    if (!b) throw new Error("Такого счёта нет");
    if (b.paid) throw new Error("Этот счёт уже оплачен");
    charge(hero, at, -b.amount, b.title);
    b.paid = at;
    return b;
  }

  // Полных лет на момент clock ("YYYY-MM-DDTHH:MM").
  function age(hero, clock) {
    const [by, bm, bd] = hero.birthdate.split("-").map(Number);
    const p = G.clock.parts(clock);
    let a = p.y - by;
    if (p.mo + 1 < bm || (p.mo + 1 === bm && p.d < bd)) a--;
    return a;
  }
  // Возраст тела: «Ускоренная старость» — год за каждый месяц с получения карты. Документы (допуск, продажи) — по дате рождения.
  function bodyAge(hero, clock) {
    const ag = hero.aging_since ? Math.floor((G.clock.toMin(clock) - G.clock.toMin(hero.aging_since)) / (30 * 1440)) : 0;
    return age(hero, clock) + Math.max(0, ag);
  }

  // Право ПОДАТЬ на самостоятельный боевой допуск (сам допуск выдаётся отдельной процедурой).
  function canApplyCombatLicense(hero, clock, legal) {
    return age(hero, clock) >= legal.combat_license_age;
  }

  function formatMoney(n, cur) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + (cur || "₩");
  }

  // Неоплаченные счета, отсортированные по сроку; overdue — если срок уже прошёл.
  function upcomingBills(hero, clock) {
    const today = clock.slice(0, 10);
    return hero.bills.filter((b) => !b.paid)
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((b) => ({ ...b, overdue: b.due < today }));
  }

  // Два ранга (решение заказчика 02.11.2026):
  //  • ранг Системы — настоящая сила героя (все характеристики + уровень), идёт в бой и в сюжетные условия power_rank;
  //  • ранг по шару — официальный: мана + сила способности; так мир оценивает любого пробуждённого. Замер фиксируется в hero.orb.
  const R7 = ["F", "E", "D", "C", "B", "A", "S"];
  let powerRules, orbRules;
  function useRules(rules) { powerRules = rules.power_rank; orbRules = rules.orb_rank || null; }
  const byThresholds = (t, score) => Object.entries(t).filter(([, n]) => score >= n).sort((a, b) => b[1] - a[1])[0][0];
  function powerRank(save) {
    if (!powerRules) throw new Error("Не загружены правила ранга");
    const h = save.hero, P = powerRules;
    const score = P.stat ? ((h.stats || {})[P.stat] || 0)
      : (h.level || 0) * (P.level_weight || 0) + ["str", "agi", "vit", "per", "mag"].reduce((n, k) => n + ((h.stats || {})[k] || 0), 0);
    return byThresholds(P.thresholds, score);
  }
  // Что покажет шар: высший из «ранга маны» и ранга сильнейшей способности. Работает и для NPC: orbFrom(Магия, ранг карты).
  function orbFrom(mag, cardRank) {
    if (!orbRules) throw new Error("Не загружены правила шара");
    const m = R7.indexOf(byThresholds(orbRules.mana_thresholds, mag || 0));
    const c = cardRank ? Math.min(6, Math.max(-1, ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"].indexOf(cardRank))) : -1;
    return R7[Math.max(m, c)];
  }
  function orbRank(save, data) {
    const h = save.hero, D = data || G.data, ranks = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];
    let best = null;
    for (const id of Object.keys(h.cards || {})) { if (id === "fusion") continue; const c = G.cards && D ? G.cards.byId(D, id) : null; if (c && (!best || ranks.indexOf(c.rank) > ranks.indexOf(best))) best = c.rank; }
    return orbFrom((h.stats || {}).mag || 0, best);
  }
  // Замер на шаре: фиксирует официальный ранг (регистрация, переоценка). Возвращает ранг.
  function measure(save, data, why) {
    const h = save.hero, rank = orbRank(save, data);
    h.orb = { rank, at: save.clock, why: why || "registration" };
    save.journal.push({ at: save.clock, actor: "hero", action: "orb_measure", rank, why: h.orb.why, result: "ok" });
    return rank;
  }
  return { R7, orbFrom, orbRank, measure, useRules, powerRank, create, EQUIP_SLOTS, TWO_HAND_LOCK, ringsUnlocked, ringUnlockLevel, equip, unequip, INVENTORY_SIZE, emptyEquipment, migrate, charge, payBill, age, bodyAge, canApplyCombatLicense, formatMoney, upcomingBills };
});

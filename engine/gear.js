// Снаряжение (Claude, 19.10.2026). Вещи боссов из сумки (hero.items) надеваются в слоты героя.
// Числа вещи лежат в item.gear (tools/gear_numbers.py → bestiary.json); у старых сохранений ищутся по id в бестиарии.
// Защита в % действует полностью против монстров ранга вещи и ниже, против рангом выше — вдвое слабее за каждый ранг.
// Прочность: −1 за бой, где вещь работала (оружие — герой бил, остальное — по герою попали), свойство — ещё −3.
// Сломанная вещь (0) ничего не даёт, пока её не починят в Лавке снаряжения.
G.define("gear", function (G) {
  const RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];
  const DEF_CAP = 50, PROFILE_CUT = 0.15, REPAIR_SHARE = 0.3;
  const STAT_NAME = { str: "СИЛ", agi: "ЛОВ", vit: "ВЫН", per: "ВОС", mag: "МАГ" };
  const EQ_NAME = { weapon: "оружие", head: "голова", top: "верх", bottom: "низ", feet: "обувь", cloak: "плащ", belt: "пояс", ring: "кольцо", relic: "реликвия" };

  let index = null;
  function lookup(data, id) {
    if (!index) { index = {}; for (const sp of (data.bestiary && data.bestiary.species) || []) for (const p of sp.loot_pool || []) if (p.gear) index[p.id] = p.gear;
      for (const p of ((data.hunter || {}).shop) || []) if (p.gear) index[p.id] = p.gear;
      for (const p of ((data.hunter || {}).sport) || []) if (p.gear) index[p.id] = p.gear; }
    return index[id] || null;
  }
  // Числа вещи (копия, чтобы прочность жила на самой вещи).
  function info(data, it) {
    if (!it || typeof it !== "object") return null;
    if (!it.gear) { const g = lookup(data, it.id); if (!g) return null; it.gear = JSON.parse(JSON.stringify(g)); }
    if (typeof it.dur !== "number") it.dur = it.gear.dur;
    // v213: прочность по рангу — старые вещи из сохранений получают новый максимум (текущая растёт пропорционально)
    { const base = lookup(data, it.id); if (base && base.dur && it.gear.dur !== base.dur) { const k = base.dur / (it.gear.dur || base.dur); it.gear.dur = base.dur; it.dur = Math.round(it.dur * k); } }
    return it.gear;
  }
  // Тяжёлая броня: панцири, латы, кольчуги — и вся броня с защитой выше лёгкой (верх > 10%, низ > 5%).
  const HEAVY = /панцир|латн|лат[ыа]\b|кольчуг|доспех|кирас|тяж/i;
  function heavy(it, g) { return (g.eq === "top" || g.eq === "bottom" || g.eq === "head") && (HEAVY.test(it.name || "") || (g.eq === "top" && g.def_pct > 10) || (g.eq === "bottom" && g.def_pct > 5)); }
  const broken = (it) => typeof it.dur === "number" && it.dur <= 0;

  // Все надетые вещи: [{slot, item, g}]
  function worn(h, data) {
    const out = [], e = h.equipment || {};
    for (const [slot, v] of Object.entries(e)) {
      if (Array.isArray(v)) v.forEach((it, i) => { const g = info(data, it); if (g) out.push({ slot: slot + ":" + i, item: it, g }); });
      else { const g = info(data, v); if (g) out.push({ slot, item: v, g }); }
    }
    return out;
  }

  // Подсказка одной строкой: что вещь даёт.
  function describe(g, it) {
    const p = [];
    if (it && it.plus) p.push("заточка +" + it.plus);
    if (g.atk) p.push("атака +" + g.atk + (g.hands === 2 ? ", двуручное" : ""));
    if (g.spell_pct) p.push("сила способностей +" + g.spell_pct + "%");
    if (g.def_pct) p.push("защита " + g.def_pct + "%");
    if (g.stat) for (const [k, v] of Object.entries(g.stat)) p.push(STAT_NAME[k] + " +" + v);
    if (g.profile) p.push(g.profile.label + " (" + g.profile.biome + ")");
    if (g.set) p.push("комплект");
    if (g.mundane) p.push("обычная вещь");
    if (g.sig) p.push("свойство: " + g.sig.label.toLowerCase());
    if (false && g.req) p.push("нужно " + STAT_NAME[g.req.stat] + " " + g.req.v);
    if (it) p.push("прочность " + Math.max(0, it.dur) + "/" + g.dur + (broken(it) ? " — сломано" : ""));
    return p.join(" · ");
  }

  function heroStat(save, k) { const h = save.hero; return (h.stats ? h.stats[k] : 10) + (G.passives ? G.passives.stat(h, k) : 0); }

  function canEquip(save, data, it) {
    const g = info(data, it);
    if (!g) return { ok: false, error: "Это не надеть" };
    if (false && g.req && heroStat(save, g.req.stat) < g.req.v) return { ok: false, error: "Нужно " + STAT_NAME[g.req.stat] + " " + g.req.v };
    const P = G.passives, h = save.hero;
    if (P && g.eq === "weapon" && !g.offhand && P.has(h, "no_weapons")) return { ok: false, error: "Оружие не держится в руках героя" };
    if (P && heavy(it, g) && P.has(h, "no_heavy_armor")) return { ok: false, error: "В тяжёлой броне герой задыхается" };
    return { ok: true };
  }

  // Надеть вещь из сумки по uid. Снятое возвращается в сумку.
  function equip(save, data, uid, want) {
    const h = save.hero, E = h.equipment, LOCK = G.hero.TWO_HAND_LOCK;
    const i = (h.items || []).findIndex((x) => x.uid === uid);
    if (i < 0) return { ok: false, error: "В сумке этого нет" };
    const it = h.items[i], c = canEquip(save, data, it);
    if (!c.ok) return c;
    const g = it.gear, back = [];
    const take = (slot) => {
      if (slot.startsWith("rings:")) { const k = +slot.slice(6); if (E.rings[k]) back.push(E.rings[k]); E.rings[k] = null; return; }
      const v = E[slot]; if (v === LOCK) { take("weapon_r"); return; }
      if (v) { back.push(v); if (slot === "weapon_r" && E.weapon_l === LOCK) E.weapon_l = null; }
      E[slot] = null;
    };
    let slot = g.eq;
    if (g.eq === "weapon") {
      if (g.offhand) slot = "weapon_l";
      else if (g.hands === 2) slot = "weapon_r";
      else if (want === "weapon_l" || want === "weapon_r") slot = want;   // экран снаряжения: в выбранную руку
      else slot = !E.weapon_r ? "weapon_r" : !E.weapon_l ? "weapon_l" : "weapon_r";
      if (g.hands === 2 && !(G.passives && G.passives.has(h, "twohand_one"))) { take("weapon_r"); take("weapon_l"); }
      else if (g.hands === 2) take("weapon_r");
      else take(slot);
    } else if (g.eq === "ring") {
      const open = G.hero.ringsUnlocked(h, data.rules);
      if (!open) return { ok: false, error: "Ячейки колец ещё закрыты" };
      let k = want && want.startsWith("rings:") && +want.slice(6) < open ? +want.slice(6) : E.rings.findIndex((x, j) => j < open && !x); if (k < 0) k = 0;
      slot = "rings:" + k; take(slot);
    } else take(slot);
    h.items.splice(i, 1);
    if (slot.startsWith("rings:")) E.rings[+slot.slice(6)] = it; else E[slot] = it;
    const oneHand = G.passives && G.passives.has(h, "twohand_one");      // «Одной рукой»: вторая рука свободна
    if (g.hands === 2 && !oneHand) E.weapon_l = LOCK;
    if (g.eq === "weapon") it.equipped_at = save.clock;                   // «Однолюб»: новое оружие первую неделю чужое
    h.items.push(...back);
    refresh(save, data);
    save.journal.push({ at: save.clock, actor: "hero", action: "equip", item: it.id, slot, result: "ok" });
    return { ok: true, slot, back };
  }
  // Надеть прямо из ячейки инвентаря Системы (экран снаряжения): вещь вынимается из ячейки, снятое ложится в рюкзак.
  function equipCell(save, data, cell, k, want) {
    const h = save.hero, e = (h.inventory || [])[cell];
    if (!e || e.kind !== "item" || !e.list || !e.list[k]) return { ok: false, error: "В ячейке этого нет" };
    const it = e.list[k]; (h.items || (h.items = [])).push(it);
    const r = equip(save, data, it.uid, want);
    if (!r.ok) { h.items.splice(h.items.indexOf(it), 1); return r; }
    e.list.splice(k, 1); e.count -= 1; if (e.count <= 0 || !e.list.length) h.inventory[cell] = null;
    return r;
  }
  // Какой слот принимает вещь: weapon → обе руки, ring → кольца.
  function fits(g, slot) {
    if (!g) return false;
    if (slot === "weapon_l") return g.eq === "weapon" && (g.offhand || g.hands !== 2);
    if (slot === "weapon_r") return g.eq === "weapon" && !g.offhand;
    if (slot.startsWith("rings")) return g.eq === "ring";
    return g.eq === slot;
  }
  function unequip(save, data, slot) {
    const h = save.hero, E = h.equipment, LOCK = G.hero.TWO_HAND_LOCK;
    if (slot === "weapon_l" && E.weapon_l === LOCK) slot = "weapon_r";
    const it = slot.startsWith("rings:") ? E.rings[+slot.slice(6)] : E[slot];
    if (!it || it === LOCK) return { ok: false, error: "Слот пуст" };
    if (G.sysinv && G.sysinv.fitsItem && !G.sysinv.fitsItem(h, it)) return { ok: false, error: "В рюкзаке нет места: снять некуда" };
    if (slot.startsWith("rings:")) E.rings[+slot.slice(6)] = null; else E[slot] = null;
    if (slot === "weapon_r" && E.weapon_l === LOCK) E.weapon_l = null;
    (h.items || (h.items = [])).push(it);
    refresh(save, data);
    return { ok: true, item: it };
  }

  // Бонусы характеристик от надетого (для HP/MP и боя). Хранится на герое, чтобы system.maxHp не искал данные.
  // комплекты (t321): сколько целых частей каждого сета надето → бонусы за 2/3/5
  function setBonus(save, data) {
    const S = (data && data.bestiary && data.bestiary.sets) || {}, n = {}, out = { stat: {}, def_pct: 0, atk_pct: 0, spell_pct: 0, active: [] };
    for (const w of worn(save.hero, data)) if (!broken(w.item) && w.g.set) n[w.g.set] = (n[w.g.set] || 0) + 1;
    for (const [id, c] of Object.entries(n)) { const st = S[id]; if (!st) continue;
      for (const k of ["2", "3", "5"]) if (c >= +k && st.bonus[k]) { const b = st.bonus[k]; out.active.push(st.name + " (" + k + ")");
        for (const [s2, v] of Object.entries(b.stat || {})) out.stat[s2] = (out.stat[s2] || 0) + v;
        out.def_pct += b.def_pct || 0; out.atk_pct += b.atk_pct || 0; out.spell_pct += b.spell_pct || 0; } }
    return out;
  }
  function refresh(save, data) {
    const h = save.hero, s = {};
    const gm = G.passives ? G.passives.mul(h, "gear") : 1;                 // «Резонанс» ×1.25 / «Порча» ×0.75
    for (const w of worn(h, data)) if (!broken(w.item) && w.g.stat) for (const [k, v] of Object.entries(w.g.stat)) s[k] = (s[k] || 0) + Math.round(v * gm);
    const sb = setBonus(save, data); for (const [k, v] of Object.entries(sb.stat)) s[k] = (s[k] || 0) + v;
    h.gear_stats = s;
    if (G.system && typeof h.hp === "number") h.hp = Math.min(h.hp, G.system.maxHp(h));
  }
  function stat(h, k) { return (h.gear_stats || {})[k] || 0; }

  // Всё, что нужно бою.
  // wield — чем герой держит оружие: без оружия, одной рукой (вторая свободна), двуручным, по оружию в каждой руке.
  const RANGED = /лук|арбалет|праща|метатель|дротик|сюрикен|пистол|ружь/i, BLADE = /меч|клин|топор|секач|сабл|катан|тесак/i;
  function combat(save, data) {
    const h = save.hero, P = G.passives, gm = P ? P.mul(h, "gear") : 1, noW = P && P.has(h, "no_weapons");
    const t = { atk: 0, spell: 0, energy: false, def: [], profiles: [], sigs: [], stats: {}, weapons: [], armored: false, topArmor: false };
    for (const w of worn(h, data)) {
      if (broken(w.item)) continue;
      const g = w.g;
      if (g.eq === "weapon" && !g.offhand) { if (noW) continue; t.weapons.push({ name: w.item.name || "", hands: g.hands || 1, at: w.item.equipped_at || null }); }
      if (g.offhand) t.offhand = true;
      const pk = 1 + 0.1 * (w.item.plus || 0);   // заточка у кузнеца: +10% за ступень
      if (g.atk) { t.atk += Math.round(g.atk * gm * pk); if (!g.mundane) t.energy = true; }   // спортинвентарь (mundane) маной не напитан
      if (g.spell_pct) t.spell += Math.round(g.spell_pct * gm);
      if (g.def_pct) { t.def.push({ v: Math.round(g.def_pct * gm * pk), rank: w.item.rank || "F" }); if (["top", "bottom", "head"].includes(g.eq)) t.armored = true; if (g.eq === "top") t.topArmor = true; }
      if (g.profile) t.profiles.push(g.profile.biome);
      if (g.sig) t.sigs.push({ slot: w.slot, name: w.item.name, ...g.sig, rank: w.item.rank || "F" });
    }
    const sb = setBonus(save, data); t.sets = sb.active;
    if (sb.def_pct) t.def.push({ v: sb.def_pct, rank: "S" });
    if (sb.atk_pct && t.atk) t.atk = Math.round(t.atk * (1 + sb.atk_pct / 100));
    if (sb.spell_pct) t.spell += sb.spell_pct;
    const W = t.weapons, now = G.clock.toMin(save.clock);
    t.wield = { unarmed: !W.length, two_handed: W.some((x) => x.hands === 2), dual: W.length >= 2,
      one_handed: W.length === 1 && W[0].hands !== 2 && !t.offhand, ranged: W.some((x) => RANGED.test(x.name)), blade: W.some((x) => BLADE.test(x.name)),
      new_weapon: W.some((x) => x.at && now - G.clock.toMin(x.at) < 7 * 1440) };
    return t;
  }
  // Защита против монстра данного ранга, %.
  function defAgainst(def, rank) {
    const r = RANKS.indexOf(rank);
    let s = 0;
    for (const d of def) { const gap = r - RANKS.indexOf(d.rank); s += gap > 0 ? d.v / Math.pow(2, gap) : d.v; }
    return Math.min(DEF_CAP, s);
  }

  // Износ после боя. use = {struck, hit, sig: [slot]}
  function wear(save, data, use) {
    const out = [];
    for (const w of worn(save.hero, data)) {
      if (broken(w.item)) continue;
      let n = 0;
      const passive = w.g.eq === "relic" || w.g.eq === "ring";          // украшения и реликвии стираются только от свойства
      if (!passive && (w.g.eq === "weapon" && !w.g.offhand ? use.struck : use.hit)) n += 1;
      if (use.sig && use.sig.includes(w.slot)) n += 3;
      if (!n) continue;
      w.item.dur = Math.max(0, w.item.dur - n);
      if (w.item.dur === 0) out.push(w.item.name);
    }
    if (out.length) refresh(save, data);
    return out;
  }

  // Ремонт: всё надетое и всё в сумке; цена — 30% оценки за полный износ.
  function repairList(save, data) {
    const h = save.hero, list = worn(h, data).map((w) => w.item);
    for (const it of h.items || []) if (info(data, it)) list.push(it);
    return list.filter((it) => it.dur < it.gear.dur);
  }
  function repairCost(save, data) {
    // «Руки-крюки»: герой сам «подкручивает» вещи и доламывает их — мастеру работы больше
    const k = G.passives ? G.passives.mul(save.hero, "repair_cost") : 1;
    return Math.round(repairList(save, data).reduce((s, it) => s + (it.price_won || 0) * REPAIR_SHARE * (1 - it.dur / it.gear.dur), 0) * k / 100) * 100;
  }
  function repair(save, data) {
    const list = repairList(save, data);
    for (const it of list) it.dur = it.gear.dur;
    refresh(save, data);
    return list.length;
  }
  // Цена у перекупщика падает с износом: сломанная — половина.
  function wearShare(data, it) { const g = info(data, it); return g ? 0.5 + 0.5 * Math.max(0, it.dur) / g.dur : 1; }

  return { heavy, info, describe, canEquip, equip, equipCell, fits, unequip, worn, refresh, stat, combat, defAgainst, wear, repairList, repairCost, repair, wearShare, broken, EQ_NAME, STAT_NAME, DEF_CAP, PROFILE_CUT };
});

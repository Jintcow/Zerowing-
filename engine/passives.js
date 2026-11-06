// Пассивные способности героя. Эффекты лежат в каталоге карт (поле fx):
// { k: ключ, op: "+" | "×" | "=", v: значение, when: условие }. При получении или сжигании карты
// cards.js собирает эффекты всех пассивок героя в hero.passive_fx — здесь чтение и условия.
// Боевые эффекты — engine/combat.js; здесь — условия мира (cond), отметки времени (stamp) и погода.
// Проверка покрытия: node tools/check_passives.js (у каждого эффекта должен быть обработчик).
G.define("passives", function (G) {
  const STAT = { "СИЛ": "str", "ЛОВ": "agi", "ВЫН": "vit", "ВОС": "per", "МАГ": "mag" };
  // «Глухой контур»: в подземелье остальные пассивки молчат.
  const hasIn = (all, key, when) => all.some((e) => e.k === key && e.when === when);
  // Штрафы Системы (hero.debuffs) — временные эффекты в том же формате, что и пассивки.
  const debuffFx = (h) => ((h && h.debuffs) || []).flatMap((d) => d.fx || []);
  function list(h) {
    const all = ((h && h.passive_fx) || []).concat(debuffFx(h), (h && h.perm_fx) || []);   // perm_fx — постоянные награды сюжета
    if (h && h.in_dungeon && hasIn(all, "passives_off", "dungeon")) return all.filter((e) => e.k === "passives_off");
    return all;
  }
  const fx = list;
  const match = (e, key, when) => e.k === key && (when === undefined ? !e.when : e.when === when);
  function mul(h, key, when) { let m = 1; for (const e of fx(h)) if (e.op === "×" && match(e, key, when) && typeof e.v === "number") m *= e.v; return m; }
  function add(h, key, when) { let s = 0; for (const e of fx(h)) if (e.op === "+" && match(e, key, when) && typeof e.v === "number") s += e.v; return s; }
  function has(h, key, when) { return fx(h).some((e) => match(e, key, when)); }
  function val(h, key) { const e = fx(h).find((x) => x.k === key && x.op === "="); return e ? e.v : null; }
  function tags(h) { return fx(h).filter((e) => e.k.startsWith("tag:")).map((e) => e.k.slice(4)); }
  // постоянная прибавка к характеристике (без условия)
  function stat(h, id) { let s = 0; for (const e of fx(h)) if (!e.when && e.k.startsWith("stat:") && STAT[e.k.slice(5)] === id) s += e.v; return s; }
  function collect(cards) {
    const out = [];
    for (const c of cards) if (c && c.kind === "passive" && c.fx) for (const e of c.fx) out.push({ ...e, card: c.id });
    return out;
  }

  // ---------- отметки времени (последний сон, еда, бой, выход из врат…) ----------
  function stamp(save, key, at) { const h = save.hero, t = h.pt || (h.pt = {}); t[key] = at || save.clock; }
  function since(save, key) { const t = (save.hero.pt || {})[key]; return t ? G.clock.toMin(save.clock) - G.clock.toMin(t) : Infinity; }

  // ---------- погода: детерминирована зерном и днём (Сеул: муссон летом, мороз зимой) ----------
  function weather(save, at) {
    const c = at || save.clock, p = G.clock.parts(c), block = Math.floor(G.clock.toMin(c) / 180);
    let x = (save.seed >>> 0) ^ Math.imul(block, 2654435761); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
    const r = (x >>> 0) / 4294967296, mo = p.mo + 1;
    const rainP = mo >= 6 && mo <= 8 ? 0.35 : mo === 12 || mo <= 2 ? 0.08 : 0.15;
    const base = [-2, 1, 7, 13, 18, 23, 26, 26, 21, 15, 7, 0][p.mo], night = p.h >= 21 || p.h < 6 ? -5 : 0;
    return { rain: r < rainP, temp: base + night + Math.round((r - 0.5) * 6) };
  }

  const RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];
  const hourOf = (save) => G.clock.parts(save.clock).h;
  const atHome = (save) => { const L = G.world && G.world.data && G.world.data.locById ? G.world.data.locById[save.hero.location] : null; return !!L && (L.tags || []).includes("home"); };
  const locTags = (save) => { const D = G.world && G.world.data; const L = D && D.locById ? D.locById[save.hero.location] : null; return (L && L.tags) || []; };
  const METAL = /клин|топор|секач|меч|шлем|панцир|кольчуг|латн|стал|желез|металл|доспех/i;
  function wearsMetal(save) { return G.gear ? G.gear.worn(save.hero, (G.world && G.world.data) || {}).some((w) => METAL.test(w.item.name || "")) : false; }
  // Похмелье: пил вечером/ночью — до полудня следующего дня (без «Без похмелья»).
  function hangover(save) {
    if (has(save.hero, "no_hangover")) return false;
    const d = (save.hero.pt || {}).drink; if (!d) return false;
    const dm = G.clock.toMin(d), now = G.clock.toMin(save.clock), p = G.clock.parts(save.clock);
    const noon = G.clock.toMin(save.clock.slice(0, 10) + "T12:00");
    return p.h < 12 && p.h >= 5 && now - dm <= 18 * 60 && dm < noon - 5 * 60 && now > dm + 4 * 60;
  }
  // Не спал ночь: последний сон закончился раньше 20:00 позапрошлого «утра» (сутки считаются с 06:00).
  function sleepless(save) {
    const e = (save.hero.pt || {}).sleep_end; if (!e) return false;
    const p = G.clock.parts(save.clock), dayStart = G.clock.toMin(save.clock.slice(0, 10) + "T06:00") - (p.h < 6 ? 1440 : 0);
    const out = G.clock.toMin(e) < dayStart - 600;
    // «Бессонная ночь»: первая за неделю бессонная ночь проходит без последствий
    if (out && has(save.hero, "allnighter")) { const t = save.hero.pt || (save.hero.pt = {}); const day = save.clock.slice(0, 10);
      if (t.allnighter === day) return false;
      if (!t.allnighter || G.clock.toMin(save.clock) - G.clock.toMin(t.allnighter + "T06:00") >= 7 * 1440) { t.allnighter = day; return false; } }
    return out;
  }
  // Длинные окна некоторых карт (одно условие, разные сроки в описании).
  const WIN = { "C-P-068": 1440 };

  // Условие when в мире. tags — признаки ситуации (сцена, проверка); число — множитель («каждый час»).
  function cond(save, w, tags, e) {
    const t = tags || {}, h = save.hero;
    if (!w) return 1;
    if (t[w] !== undefined) return typeof t[w] === "number" ? t[w] : t[w] ? 1 : 0;
    const hr = hourOf(save), mx = G.system && h.awakened ? G.system.maxMp(h) : 0;
    switch (w) {
      case "night": return hr >= 21 || hr < 6 ? 1 : 0;
      case "late": return hr >= 23 || hr < 5 ? 1 : 0;
      case "dark": return save.dungeon || ((hr >= 21 || hr < 6) && !atHome(save)) ? 1 : 0;
      case "rain": return weather(save).rain && !save.dungeon ? 1 : 0;
      case "cold": return weather(save).temp < 0 && !save.dungeon ? 1 : 0;
      case "hungry": return h.satiety < 30 ? 1 : 0;
      case "fed": return h.satiety >= 60 ? 1 : 0;
      case "after_sleep": case "morning": return since(save, "sleep_end") <= 60 ? 1 : 0;
      case "after_meal": return since(save, "meal") <= 30 ? 1 : 0;
      case "hangover": return hangover(save) ? 1 : 0;
      case "no_coffee": return hr >= 5 && hr < 12 && ((h.pt || {}).coffee || "").slice(0, 10) !== save.clock.slice(0, 10) ? 1 : 0;
      case "after_battle": return since(save, "battle") <= 60 ? 1 : 0;
      case "after_gate": return since(save, "gate_exit") <= ((e && WIN[e.card]) || 60) ? 1 : 0;
      case "after_cast": return since(save, "cast") <= 60 ? 1 : 0;
      case "away3d": return !atHome(save) && since(save, "home") >= 3 * 1440 && since(save, "home") < Infinity ? 1 : 0;
      case "no_fight_week": return h.awakened && Math.min(since(save, "battle"), since(save, "awake")) >= 7 * 1440 && since(save, "awake") < Infinity ? 1 : 0;
      case "quest_failed": return since(save, "quest_failed") <= 1440 ? 1 : 0;
      case "levelup_day": return since(save, "levelup") <= 1440 ? 1 : 0;
      case "low_mp": return mx && h.mp < mx / 4 ? 1 : 0;
      case "full_mp": return mx && h.mp >= mx ? 1 : 0;
      case "dungeon": return save.dungeon ? 1 : 0;
      case "new_dungeon": return save.dungeon && since(save, "gate_enter") <= 60 ? 1 : 0;
      case "dungeon_hour": return save.dungeon ? Math.min(6, Math.floor(since(save, "gate_enter") / 60)) : 0;
      case "sleepless": return sleepless(save) ? 1 : 0;
      case "upset": return since(save, "upset") <= 60 ? 1 : 0;                  // «Капризный желудок»: час после уличной еды
      case "mp_zero_day": return since(save, "mp_zero") <= 1440 ? 1 : 0;
      case "ally_down": return since(save, "ally_down") <= 10 ? 1 : 0;          // «до конца следующего хода» — сразу после боя
      case "crowd": { const lt = locTags(save); return (lt.includes("street") || lt.includes("transit") || lt.includes("school")) && hr >= 7 && hr < 21 ? 1 : 0; }
      case "moving": return t.skill === "stealth" ? 1 : 0;                   // скрытность — по умолчанию в движении
      case "slow": return t.running ? 0 : 1;
      case "metal": return wearsMetal(save) ? 1 : 0;
      case "sight": return t.skill === "per" && !t.hearing ? 1 : 0;           // восприятие — по умолчанию зрение
      case "leading": return 0;                                              // отряда вне боя у героя нет (признак сцены — leading)
      case "alone": return 1;                                                // вне боя союзников нет («Боязнь одиночества»)
      case "drunk": return since(save, "drink") <= 240 ? 1 : 0;
      case "fought_today": return since(save, "battle") <= 16 * 60 ? 1 : 0;              // «Кошмары»: сон после дня с боем
      // только из признаков сцены (check.tags): без признака условие не выполнено
      case "spot": case "search": case "fine_work": case "break": case "watch": case "height": case "narrow": case "serious":
      case "strangers": case "superior": case "insulted": case "talking": case "casting": case "hearing": case "cat": case "hidden": return 0;
      // только из признаков сцены: spot, search, fine_work, break, watch, height, narrow, serious, strangers,
      // superior, insulted, talking, casting, hearing, cat — без признака условие не выполнено
      default: return 0;
    }
  }
  // Сумма «+» и произведение «×» по ключу с учётом условий мира.
  function sum(save, key, tags) { let s = 0; for (const e of fx(save.hero)) if (e.k === key && e.op === "+" && typeof e.v === "number") s += e.v * cond(save, e.when, tags, e); return s; }
  function prod(save, key, tags) { let m = 1; for (const e of fx(save.hero)) if (e.k === key && e.op === "×" && typeof e.v === "number" && cond(save, e.when, tags, e)) m *= e.v; return m; }
  function any(save, key, tags) { return fx(save.hero).some((e) => e.k === key && cond(save, e.when, tags, e)); }

  // «Окаменение по ночам»: с заката до рассвета герой не может двигаться.
  function petrified(save) { return has(save.hero, "petrify", "night") && !!cond(save, "night"); }
  // После каждого шага времени: сон, рассвет, дом, ржавеющие навыки.
  function afterTime(save, from, to, reason) {
    const h = save.hero; if (h.dead) return;
    const S = G.system;
    if (reason === "sleep") {
      stamp(save, "sleep_end");
      if (S) { const f = mul(h, "morning_hp"); if (f !== 1) h.hp = Math.max(1, Math.min(h.hp, Math.round(S.maxHp(h) * f))); }   // «Кровавое утро»
    }
    if (atHome(save)) stamp(save, "home");
    // «Рассветный контур»: в 06:00 мана до максимума
    if (h.awakened && S && has(h, "mp_full", "dawn")) {
      const a = G.clock.toMin(from), b = G.clock.toMin(to);
      let d = G.clock.toMin(from.slice(0, 10) + "T06:00"); if (d <= a) d += 1440;
      if (d <= b) h.mp = Math.max(h.mp, Math.min(S.maxMp(h), S.mpCap(h)));
    }
    // «Навыки ржавеют»: месяц без занятий — минус одна ступень натренированного
    if (has(h, "skill_decay") && h.train_gain) for (const k of Object.keys(h.train_gain)) {
      const last = (h.train_last || {})[k];
      if (h.train_gain[k] > 0 && last && G.clock.toMin(to) - G.clock.toMin(last) >= 30 * 1440) {
        h.train_gain[k] -= 1; h.stats[k] -= 1; h.train_last[k] = to;
        save.journal.push({ at: to, actor: "hero", action: "skill_decay", stat: k, result: "ok" });
      }
    }
  }

  return { petrified, afterTime, mul, add, has, val, tags, stat, collect, list, STAT, RANKS, stamp, since, weather, cond, sum, prod, any, hangover, sleepless, wearsMetal };
});

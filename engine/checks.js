// Проверки (Claude, 20.10.2026): к20 + модификатор против сложности.
// Модификатор = (характеристика − 10) / 2 вниз + пассивки: chk:all, chk:<характеристика> (СИЛ/ЛОВ/ВЫН/ВОС/МАГ), chk:<навык>.
// 20 на кубике — всегда успех, 1 — всегда провал. Бросок детерминирован зерном прохождения и ключом
// (сцена, вариант, день): перезагрузка не меняет выпавшее (канон: случайность воспроизводима).
G.define("checks", function (G) {
  const STAT_RU = { str: "СИЛ", agi: "ЛОВ", vit: "ВЫН", per: "ВОС", mag: "МАГ" };
  const SKILLS = {
    str: { stat: "str", name: "Сила" }, agi: { stat: "agi", name: "Ловкость" }, vit: { stat: "vit", name: "Выносливость" },
    per: { stat: "per", name: "Восприятие" }, mag: { stat: "mag", name: "Магия" },
    stealth: { stat: "agi", name: "Скрытность" }, talk: { stat: "per", name: "Разговор" }, lie: { stat: "per", name: "Обман" },
    insight: { stat: "per", name: "Чутьё на ложь" },
  };
  const DC = { 10: "легко", 13: "средне", 16: "трудно", 19: "очень трудно" };

  function stat(save, k) { const h = save.hero; return (h.stats ? h.stats[k] : 10) + (G.passives ? G.passives.stat(h, k) : 0) + (G.gear ? G.gear.stat(h, k) : 0); }
  // tags — признаки ситуации из сцены: { crowd, serious, hearing, spot, … } (список — в «Решениях по механикам»).
  function mod(save, skill, tags) {
    const s = SKILLS[skill]; if (!s) throw new Error("Нет такой проверки: " + skill);
    const P = G.passives, h = save.hero, t = Object.assign({ skill }, tags || {});
    let m = Math.floor((stat(save, s.stat) - 10) / 2);
    if (P) {
      m += P.sum(save, "chk:all", t) + P.sum(save, "chk:" + STAT_RU[s.stat], t);
      if (skill !== s.stat) m += P.sum(save, "chk:" + skill, t);
      if (skill === "insight") m += P.sum(save, "chk:lie_def", t);                 // «Доверчивый»: обман против героя легче
      if (P.has(h, "need:siesta") && siestaMissed(save)) m -= 5;                    // «Сиеста»: не поспал днём — вечером −5
      if (t.hidden && P.has(h, "see_hidden")) m += 10;
      // похмелье после трёх и больше рюмок: −1 ко всем проверкам до полудня («Без похмелья» — нет)
      if (P.hangover(save) && ((h.pt || {}).drink_n || 0) >= 3) m -= 1;                              // «Истинный взгляд»: иллюзии и маскировка не обманывают
    }
    // «Зеркальный гвоздь» (T03): пока герой замер, отражения уводят его силуэт — прятаться легче
    if (skill === "stealth" && G.secrets && G.secrets.has(save, "T03")) m += 2;
    return Math.round(m);
  }
  // Днём (12–18) не спал ни часа — с 18:00 до сна штраф.
  function siestaMissed(save) {
    const p = G.clock.parts(save.clock); if (p.h < 18) return false;
    const day = save.clock.slice(0, 10);
    return !save.journal.some((e) => e.action === "sleep" && e.at.slice(0, 10) === day && e.minutes >= 60 && +e.at.slice(11, 13) >= 11 && +e.at.slice(11, 13) < 18);
  }
  function d20(save, key) {
    let x = (save.seed >>> 0) ^ 0x51ed270b;
    for (const ch of String(key)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
    x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
    return 1 + Math.floor(((x >>> 0) / 4294967296) * 20);
  }
  // Шанс успеха (для подписи на кнопке), учитывая 1 и 20.
  // Встречная проверка (t355): против наблюдателя сложность растёт от его Восприятия — tags.watcher_per (характеристика сторожа).
  const dcOf = (dc, tags) => (tags && tags.watcher_per ? dc + Math.floor((tags.watcher_per - 10) / 2) : dc);
  function chance(save, skill, dc, tags) {
    dc = dcOf(dc, tags);
    const m = mod(save, skill, tags); let ok = 0;
    for (let r = 1; r <= 20; r++) if (r === 20 || (r !== 1 && r + m >= dc)) ok++;
    return ok / 20;
  }
  function roll(save, skill, dc, key, tags) {
    dc = dcOf(dc, tags);
    const r = d20(save, key), m = mod(save, skill, tags), total = r + m;
    const ok = r === 20 ? true : r === 1 ? false : total >= dc;
    // «Капризный контур»: критический провал любой проверки стоит маны
    if (r === 1 && G.passives && save.hero.awakened) { const loss = -G.passives.sum(save, "mp", { crit_fail: true }) + G.passives.sum(save, "mp", {}); if (loss > 0) save.hero.mp = Math.max(0, save.hero.mp - loss); }
    const res = { skill, name: SKILLS[skill].name, dc, d20: r, mod: m, total, ok, crit: r === 20, fumble: r === 1 };
    save.journal.push({ at: save.clock, actor: "hero", action: "check", skill, dc, d20: r, mod: m, total, key: String(key), result: ok ? "ok" : "fail" });
    return res;
  }
  function line(res) {
    return "Проверка: " + res.name + " — " + res.d20 + (res.mod ? (res.mod > 0 ? " + " : " − ") + Math.abs(res.mod) : "") + " = " + res.total + " против " + res.dc + ". " +
      (res.crit ? "Безусловный успех." : res.fumble ? "Безусловный провал." : res.ok ? "Успех." : "Провал.");
  }
  function label(save, skill, dc, tags) { return SKILLS[skill].name + " " + dc + " · " + Math.round(chance(save, skill, dc, tags) * 100) + "%"; }
  return { SKILLS, DC, mod, chance, roll, line, label, d20, stat };
});

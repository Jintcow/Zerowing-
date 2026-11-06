// Цели на сейчас (Claude, 27.10.2026, этап 1 «ядро»): 2–4 понятные задачи с подсказкой «где», из состояния мира.
G.define("goals", function (G) {
  const fmt = (n) => (G.hero ? G.hero.formatMoney(n) : n + " ₩");
  const day = (save) => save.clock.slice(0, 10), J = (save) => save.journal || [];
  const did = (save, act, today) => J(save).some((e) => e.action === act && (!today || e.at.slice(0, 10) === day(save)));
  const daysTo = (save, d) => Math.max(0, Math.ceil(G.clock.diff(save.clock, d + "T00:00") / 1440));
  function header(save) {
    const h = save.hero, spend = 15000, runway = Math.floor((h.money || 0) / spend), house = daysTo(save, "2027-02-28");
    return "На счету " + fmt(h.money || 0) + " — хватит примерно на " + runway + " дн." + (save.clock < "2027-02-28" ? " Жильё по программе: ещё " + house + " дн." : " Программа жилья закончилась.");
  }
  function list(save, data) {
    const h = save.hero, out = [], wd = new Date(day(save) + "T00:00:00Z").getUTCDay() || 7, hr = +save.clock.slice(11, 13);
    const term = (day(save) >= "2026-09-01" && day(save) <= "2026-12-23") || (day(save) >= "2027-02-02" && day(save) <= "2027-02-12");
    // Сюжетные цели появятся из сцен (engine/plot.js), старые подсказки главы 1 убраны 02.11.2026.
    // Система: карта и очки
    if (h.awakened && h.sys && h.sys.gacha > 0) out.push({ t: "Выбрать карту способности", hint: "Герой → Статус → выбор карты", urgent: true });
    if (h.awakened && h.sys && h.sys.points > 0) out.push({ t: "Вложить " + h.sys.points + " очк. характеристик", hint: "Герой → Статус" });
    // Быт: связь
    if (G.living && G.living.phoneCut(save)) out.push({ t: "Связь отключена — оплатить телефон", hint: "Телефон → Банк → Счета", urgent: true });
    // Счета
    for (const b of (h.bills || []).filter((b) => !b.paid).sort((a, c) => a.due.localeCompare(c.due)).slice(0, 1))
      if (daysTo(save, b.due) <= 10) out.push({ t: "Оплатить «" + b.title + "» — " + fmt(b.amount), hint: "Телефон → Банк, до " + G.clock.format(b.due + "T00:00").date, urgent: daysTo(save, b.due) <= 2 });
    // Деньги
    if (!J(save).some((e) => e.action === "service" && /_work$/.test(e.id || "")) && (h.money || 0) < 2000000) out.push({ t: "Найти подработку", hint: "PC-бан «Синяя комета» по вечерам · мини-маркет «Боми 24»" });
    // Охотник
    if (h.awakened && !did(save, "gate_enter")) out.push({ t: "Посмотреть открытые врата", hint: "Телефон → Понхва. Без допуска вход незаконен" });
    if (h.awakened && !h.reg && did(save, "gate_enter")) out.push({ t: "Решить: регистрироваться или скрываться", hint: "Норвонский пункт регистрации пробуждённых" });
    // Школа
    if (term && wd <= 5 && hr < 15 && !did(save, "school_class", true)) out.push({ t: "Сходить на уроки", hint: "Старшая школа «Чонмун», 08:30–15:30" });
    else if (term && hr >= 15 && !((save.school || {}).done || {})["hw:" + day(save)]) out.push({ t: "Сделать домашку", hint: "Дом → «Домашнее задание»" });
    // Жильё
    if (save.clock >= "2027-01-10" && save.clock < "2027-02-28") out.push({ t: "Найти жильё после 28.02", hint: "Центр соцподдержки · госивон «Сонгвон»", urgent: daysTo(save, "2027-02-28") <= 14 });
    if (!out.length) out.push({ t: "Накопить на жизнь после февраля", hint: "Работа, врата, скупка" });
    return out.slice(0, 4);
  }
  // «Ждать до события»: есть ли сейчас что показать
  function eventReady(save, data) {
    if (G.scenes.available(save, data).length) return true;
    if ((save.director || []).some((e) => e.at <= save.clock)) return true;
    return !!((save.cutscenes || {}).pending || []).length;
  }
  return { header, list, eventReady };
});

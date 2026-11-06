// Учёба (Claude, 03.11.2026). Утро — школа, дело «Учёба» — самоподготовка сверху (до 2 раз в день).
// Что она даёт:
//  • Успеваемость — доля занятий к учебным дням с 1 сентября: хорошая / средняя / тяжёлая (переменная study_level,
//    сценаристы уже ссылаются на неё как [учёба_январь]).
//  • Сунын (rules.school.suneung, 19.11.2026) — экзамен на весь день (день + вечер). Не пришёл — «не явился».
//    Итоговый разряд 1–9 зависит от успеваемости к дню экзамена (±1 по зерну). Результаты — rules.school.results (4.12).
//  • Стипендия района за разряд 1–3 (rules.school.scholarship) — зачисляется в день результатов.
//  • Предупреждения классного руководителя 1-го числа месяца, если успеваемость тяжёлая.
// Переменные для сценаристов: suneung_taken (1 — сдавал, 0 — пропустил), suneung_grade (1–9, 0 — не явился),
// suneung ("высокий" 1–2, "хороший" 3–4, "средний" 5–6, "низкий" 7–9, "не явился").
G.define("school", function (G) {
  const DEF = { suneung: "2026-11-19", results: "2026-12-04", scholarship: { 1: 3000000, 2: 1500000, 3: 500000 } };
  let C = DEF;
  function use(data) { C = Object.assign({}, DEF, (data.rules && data.rules.school) || {}); }
  const V = (save) => G.plot.state(save).vars;
  const WEEKDAYS = (from, to) => { let n = 0; for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 864e5) { const d = new Date(t).getUTCDay(); if (d && d < 6) n++; } return n; };
  function level(save) {
    const date = (save.day || {}).date || "2026-09-01", days = Math.max(1, WEEKDAYS("2026-09-01", date)), n = (save.hero.school || {}).progress || 0, r = n / days;
    return { n, days, r, label: r >= 0.35 ? "хорошая" : r >= 0.15 ? "средняя" : "тяжёлая" };
  }
  const daysTo = (save, d) => Math.round(G.clock.diff(save.day.date + "T07:00", d + "T07:00") / 1440);
  function grade(save) {
    const r = level(save).r;
    let g = r >= 0.6 ? 1 : r >= 0.45 ? 2 : r >= 0.35 ? 3 : r >= 0.27 ? 4 : r >= 0.2 ? 5 : r >= 0.13 ? 6 : r >= 0.07 ? 7 : r >= 0.03 ? 8 : 9;
    const x = (((save.seed >>> 0) ^ 0x5a4e) >>> 0) % 3 - 1;   // −1, 0, +1: день экзамена
    return Math.min(9, Math.max(1, g + x));
  }
  const band = (g) => !g ? "не явился" : g <= 2 ? "высокий" : g <= 4 ? "хороший" : g <= 6 ? "средний" : "низкий";
  // Экзамен сегодня, слот «День», ещё не сдавал.
  const examToday = (save) => save.day && save.day.date === C.suneung && save.day.slot === 1 && V(save).suneung_taken === undefined;
  function take(save) {
    if (!examToday(save)) throw Error("Сунын — только " + G.clock.format(C.suneung + "T07:00").date + ", с утра до вечера");
    const v = V(save), g = grade(save); v.suneung_taken = 1; v.suneung_score = g;
    save.journal.push({ at: save.clock, actor: "hero", action: "suneung", result: "ok" });
    return g;
  }
  // Утро нового дня: пропуск экзамена, результаты, предупреждения.
  function morning(save) {
    const v = V(save), d = save.day.date, h = save.hero;
    if (d > C.suneung && v.suneung_taken === undefined) { v.suneung_taken = 0; v.suneung_score = 0; }
    if (d >= C.results && v.suneung_grade === undefined && v.suneung_taken !== undefined) {
      const g = v.suneung_score || 0; v.suneung_grade = g; v.suneung = band(g);
      const pay = (C.scholarship || {})[g] || 0;
      if (pay) G.hero.charge(h, save.clock, pay, "Стипендия района: Сунын, " + g + " разряд");
      if (G.mail) {
        G.mail.send(save, { app: "Почта", from: "Министерство образования", title: g ? "Результаты Суныну: " + g + " разряд" : "Результаты Суныну: не явился",
          text: g ? "Кан Сиу, ваш итоговый разряд — " + g + " (" + band(g) + "). " + (g <= 3 ? "Это проходной уровень в сильные университеты." : g <= 6 ? "Поступление возможно, но выбор будет скромнее." : "С таким результатом в университет почти не берут.") : "Кан Сиу, вы не явились на экзамен. Результат не засчитан." });
        if (pay) G.mail.send(save, { app: "Банк", from: "Фонд поддержки района Норвон", title: "Стипендия: " + G.hero.formatMoney(pay), text: "За " + g + " разряд на Суныне. Деньги уже на счёте. Поздравляем!" });
      }
      if (G.news) G.news.add(save, { src: "Сеул Сегодня", title: "Результаты Суныну: школьники получили бланки", text: "Сегодня с утра выпускники получают результаты. Горячая линия министерства перегружена.", comments: [{ who: "мама_троих", t: "Сын закрылся в комнате. Не открывает. Видимо, результаты" }, { who: "студент_эконом", t: "Год назад был на его месте. Держитесь, школьники" }] });
    }
    if (d.slice(8) === "01" && d >= "2026-10-01" && d <= C.suneung && level(save).label === "тяжёлая" && (v.school_warn || "") !== d) {
      v.school_warn = d; v.school_warns = (v.school_warns || 0) + 1;
      if (G.mail) G.mail.send(save, { app: "Почта", from: "Чхве Хёнджу, классный руководитель", title: "Об успеваемости", text: "Кан Сиу, за месяц вы почти не занимались. До Суныну " + daysTo(save, C.suneung) + " дн. Подумайте, пожалуйста. Если нужна помощь — подойдите после уроков." });
    }
  }
  // Подпись к делу «Учёба».
  function line(save) {
    const L = level(save), left = save.day ? daysTo(save, C.suneung) : 0;
    return "Успеваемость: " + L.label + (left > 0 ? " · Сунын через " + left + " дн." : "");
  }
  return { use, level, grade, band, examToday, take, morning, line, daysTo, C: () => C };
});

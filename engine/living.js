// Быт Кан Сиу (02.11.2026): счета за связь и коммуналку — деньги с подработки нужны не только на снаряжение.
// Настройки — data/public/rules.json → living.
//   Счета каждый месяц (коммуналка, связь). Просрочка — пени каждый день; связь за долги отключают
//   (телефон молчит: чаты не приходят, «Понхва» не работает); без оплаты коммуналки — холод: сон лечит вдвое хуже.
// save.living = { start: 'ГГГГ-ММ-ДД' (с какого дня выставляются счета), last: прошлый день }
G.define("living", function (G) {
  const DEF = { bills: [], penalty_pct_day: 1, phone_cut_after: 3, cold_after: 7 };
  let C = DEF;
  function use(data) { C = Object.assign({}, DEF, (data.rules && data.rules.living) || {}); }
  const st = (save) => save.living || (save.living = { start: save.day ? save.day.date : save.clock.slice(0, 10) });
  const daysBetween = (a, b) => Math.round(G.clock.diff(a + "T07:00", b + "T07:00") / 1440);
  // Счета текущего месяца (выставляются, только если срок не раньше начала игры).
  function ensure(save) {
    const h = save.hero, today = save.day.date, ym = today.slice(0, 7), S = st(save);
    h.bills = h.bills || [];
    for (const b of C.bills) {
      const id = b.id + "_" + ym, due = ym + "-" + String(b.due_day).padStart(2, "0");
      if (due < S.start || h.bills.some((x) => x.id === id)) continue;
      h.bills.push({ id, kind: b.id, title: b.title + " · " + MONTHS[+ym.slice(5, 7) - 1], amount: b.amount, due, paid: false, fine: 0 });
      const why = b.id === "phone" ? "Не оплатишь в течение " + C.phone_cut_after + " дн. после срока — отключат связь: чаты и «Понхва» перестанут работать." : "Не оплатишь в течение " + C.cold_after + " дн. после срока — отключат отопление: сон будет восстанавливать вдвое меньше.";
      if (G.mail) G.mail.send(save, { app: "Банк", from: "Банк Норвон", title: "Счёт: " + b.title + " — " + G.hero.formatMoney(b.amount), text: "Оплатить до " + G.clock.format(due + "T07:00").date + ". Пени 1% в день. " + why + " Оплата: Телефон → Банк." });
    }
  }
  const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  const overdue = (save, b) => b.paid ? 0 : Math.max(0, daysBetween(b.due, save.day.date));
  const owe = (b) => b.amount + (b.fine || 0);
  function phoneCut(save) { const h = save.hero; return !!(h.bills || []).some((b) => b.kind === "phone" && overdue(save, b) > C.phone_cut_after); }
  function cold(save) { const h = save.hero; return !!(h.bills || []).some((b) => b.kind === "utilities" && overdue(save, b) > C.cold_after); }
  const sleepMul = (save) => cold(save) ? 0.5 : 1;
  // Утро нового дня: счета месяца и пени.
  function morning(save, first) {
    const h = save.hero, S = st(save), log = [];
    if (!first && S.last && daysBetween(S.last, save.day.date) > 1) S.start = save.day.date;
    ensure(save);
    if (first) { S.last = save.day.date; return log; }
    // Перескок дней (тестовый старт «с 10 сентября»): прошлое не считаем — счета до сегодня не выставлены, пени нет.
    if (S.last && daysBetween(S.last, save.day.date) > 1) { S.start = save.day.date; h.bills = h.bills.filter((b) => b.paid || b.due >= S.start); ensure(save); }
    S.last = save.day.date;
    for (const b of h.bills) if (!b.paid && overdue(save, b) > 0) b.fine = (b.fine || 0) + Math.round(b.amount * C.penalty_pct_day / 100);
    // предупреждение за 2 дня до срока и в день отключения
    if (G.mail) for (const b of h.bills) {
      if (b.paid) continue;
      const left = daysBetween(save.day.date, b.due), lim = b.kind === "phone" ? C.phone_cut_after : C.cold_after;
      if (left === 2) G.mail.send(save, { app: "Банк", from: "Банк Норвон", title: "Через 2 дня срок: " + b.title, text: "К оплате " + G.hero.formatMoney(owe(b)) + ". Телефон → Банк → «Оплатить»." });
      if (overdue(save, b) === lim + 1) G.mail.send(save, b.kind === "phone"
        ? { app: "Почта", from: "Оператор связи", title: "Связь отключена", text: "Номер заблокирован за неуплату «" + b.title + "». Чаты, «Понхва» и Лента не работают, пока счёт не оплачен. Сюжетные сообщения ты пропустишь." }
        : { app: "Почта", from: "Управляющая компания", title: "Отопление отключено", text: "За неуплату «" + b.title + "» отопление в квартире отключено. В холоде сон восстанавливает вдвое меньше, пока не оплатишь." });
    }
    return log;
  }
  function pay(save, id) {
    const h = save.hero, b = (h.bills || []).find((x) => x.id === id);
    if (!b) throw Error("Такого счёта нет"); if (b.paid) throw Error("Уже оплачено");
    G.hero.charge(h, save.clock, -owe(b), b.title + (b.fine ? " (с пенями)" : ""));
    b.paid = save.clock; return b;
  }
  const bills = (save) => (save.hero.bills || []).filter((b) => !b.paid).sort((a, b) => a.due.localeCompare(b.due)).map((b) => Object.assign({}, b, { owe: owe(b), late: overdue(save, b) }));
  return { use, ensure, morning, pay, bills, phoneCut, cold, sleepMul, cfg: () => C, owe };
});

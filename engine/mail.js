// Почта и уведомления телефона (Claude, 03.11.2026). Окно Системы — только для Системы (задания, уровни, карты, достижения).
// Всё бытовое — счета банка, письма школы, стипендия — приходит на телефон: всплывающее уведомление + письмо в «Почте».
// save.mail = [{ id, at, app, from, title, text, read }], save.pushes = [id …] — ещё не показанные уведомления.
G.define("mail", function (G) {
  const box = (save) => save.mail || (save.mail = []);
  const queue = (save) => save.pushes || (save.pushes = []);
  // app — подпись уведомления («Банк», «Почта»), from — отправитель письма.
  function send(save, m) {
    const id = "m" + (box(save).length + 1);
    box(save).push({ id, at: save.clock, app: m.app || "Почта", from: m.from || "", title: m.title, text: m.text || "", read: false });
    queue(save).push(id);
    return id;
  }
  const byId = (save, id) => box(save).find((x) => x.id === id) || null;
  const list = (save) => box(save).slice().reverse();
  const unread = (save) => box(save).filter((x) => !x.read).length;
  function read(save, id) { const m = byId(save, id); if (m) m.read = true; return m; }
  // Следующее непоказанное уведомление (и снять его с очереди).
  function nextPush(save) { const q = queue(save); while (q.length) { const m = byId(save, q.shift()); if (m) return m; } return null; }
  const pending = (save) => queue(save).length;
  return { send, list, unread, read, byId, nextPush, pending };
});

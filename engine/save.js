// Сохранения: 3 ручных слота + два автосохранения: «начало дня» и «последний ход» (после каждого слота дня).
// Копия каждого слота уходит в облако Claude (artifact db, личная папка игрока), если страница открыта на claude.ai:
// браузерное хранилище там может очищаться, облако — нет. При запуске берётся более свежая из двух копий.
// Хранилище подменяемое: в браузере localStorage, в тестах — память, в ПК-версии — файлы.
G.define("save", function (G) {
  const PREFIX = "norwon2026.v252.";
  const SLOTS = ["slot1", "slot2", "slot3", "auto", "last"];
  const VERSION = 1;

  function memoryStore() {
    const m = new Map();
    return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, v); }, remove: (k) => { m.delete(k); } };
  }
  function browserStore() {
    try {
      const ls = window.localStorage; const probe = PREFIX + "probe";
      ls.setItem(probe, "1"); ls.removeItem(probe);
      return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k), persistent: true };
    } catch (e) { return Object.assign(memoryStore(), { persistent: false }); }
  }
  let store = memoryStore();
  function useStore(s) { store = s; }
  function useBrowser() { store = browserStore(); return !!store.persistent; }
  function isPersistent() { return !!store.persistent; }

  function summary(save, data) {
    const loc = data && data.locById[save.hero.location];
    return { name: save.hero.name, clock: save.clock, place: loc ? loc.name : save.hero.location, money: save.hero.money };
  }

  // ---- облако (claude.ai artifact db) ----
  const CLOUD_MAX = 250000;   // документ db — до 256 КиБ
  let cloud = null;           // { db, uid }
  const busy = {}, queued = {};
  function cloudDoc(slot) { return cloud.db.doc("data/users/" + cloud.uid + "/" + slot); }
  async function cloudPush(slot) {   // по одной записи на слот: пока идёт запись, новая ждёт (берётся самая свежая)
    if (!cloud) return;
    if (busy[slot]) { queued[slot] = true; return; }
    busy[slot] = true;
    try {
      do {
        queued[slot] = false;
        let raw = null; try { raw = store.get(PREFIX + slot); } catch (e) {}
        const rec = raw ? readRecord(slot) : null;
        if (!raw) await cloudDoc(slot).delete();
        else if (raw.length <= CLOUD_MAX) await cloudDoc(slot).set({ raw, savedAt: (rec && rec.savedAt) || "" });
        else lastCloudError = "Сохранение слишком большое для облака";
      } while (queued[slot]);
    } catch (e) { lastCloudError = (e && (e.message || e.code)) || "облако недоступно"; }
    finally { busy[slot] = false; }
  }
  let lastCloudError = null;
  // Подключить облако: подтянуть более свежие копии из облака, свои более свежие — отправить туда. Возвращает число подтянутых слотов.
  async function attachCloud(db, uid) {
    if (!db || !uid) return 0;
    cloud = { db, uid }; let got = 0;
    for (const slot of SLOTS) {
      try {
        const snap = await cloudDoc(slot).get();
        const c = snap.exists ? snap.data() : null, local = readRecord(slot);
        const localAt = local && !local.broken ? local.savedAt || "" : "";
        if (c && typeof c.raw === "string" && (c.savedAt || "") > localAt) { store.set(PREFIX + slot, c.raw); got++; }
        else if (localAt && (!c || (c.savedAt || "") < localAt)) cloudPush(slot);
      } catch (e) { lastCloudError = (e && (e.message || e.code)) || "облако недоступно"; }
    }
    return got;
  }
  function cloudState() { return cloud ? (lastCloudError ? "error" : "on") : "off"; }

  function write(slot, save, data) {
    if (!SLOTS.includes(slot)) throw new Error("Нет такого слота: " + slot);
    const rec = { v: VERSION, savedAt: new Date().toISOString(), summary: summary(save, data), save };
    try { store.set(PREFIX + slot, G.codec.encode(JSON.stringify(rec))); }
    catch (e) { throw new Error("Не удалось сохранить: в браузере нет места или хранилище недоступно"); }
    cloudPush(slot);
    return rec.summary;
  }

  function readRecord(slot) {
    let raw = null;
    try { raw = store.get(PREFIX + slot); } catch (e) { return null; }
    if (!raw) return null;
    try { return JSON.parse(G.codec.decode(raw)); } catch (e) { return { broken: true }; }
  }

  // Проверка и подготовка загруженного прохождения. Ошибка — понятным текстом.
  function check(save, data) {
    const need = ["clock", "hero", "facts", "events", "scenes_seen", "journal"];
    if (!save || typeof save !== "object") throw new Error("Файл сохранения повреждён");
    for (const k of need) if (save[k] === undefined) throw new Error("В сохранении нет раздела «" + k + "»");
    if (save.version !== VERSION) throw new Error("Сохранение другой версии игры (" + save.version + ")");
    G.day.validate(save);
    G.clock.toMin(save.clock);
    if (!data.locById[save.hero.location]) throw new Error("В сохранении неизвестное место: " + save.hero.location);
    delete save.hero.moving;
    G.hero.migrate(save.hero, data.heroStart);
    if (save.day) { delete save.hero.housing; delete save.hero.energy; if (!save.living) { save.hero.bills = []; save.hero.pantry = save.hero.pantry || {}; } }   // быт (living.js) — счета и запасы теперь настоящие
    if (G.system) G.system.prepare(save, data);
    if (G.cards) G.cards.migrate(save, data);
    if (G.needs) G.needs.prepare(save.hero);
    if (G.background) {
      if (save.bg) G.background.restore(save);
      else G.background.attach(save, save.clock, data.game.season_end || "2027-11-09T00:00"); // старые сохранения
    }
    return save;
  }

  function load(slot, data) {
    const rec = readRecord(slot);
    if (!rec) throw new Error("Слот пуст");
    if (rec.broken) throw new Error("Сохранение в этом слоте повреждено");
    return check(JSON.parse(JSON.stringify(rec.save)), data);
  }

  function list() {
    return SLOTS.map((slot) => {
      const rec = readRecord(slot);
      if (!rec) return { slot, empty: true };
      if (rec.broken) return { slot, broken: true };
      return { slot, savedAt: rec.savedAt, ...rec.summary };
    });
  }

  function remove(slot) { try { store.remove(PREFIX + slot); } catch (e) {} cloudPush(slot); }

  // ---- Файл сохранения (перенос между устройствами и в будущую ПК-версию) ----
  const FORMAT = "norwon2026-v252-save";

  function exportText(save, data) {
    return G.codec.encode(JSON.stringify({ format: FORMAT, v: VERSION, exportedAt: new Date().toISOString(),
                            summary: summary(save, data), save }));
  }

  function fileName(save) {
    const name = String(save.hero.name).replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 20) || "hero";
    return "norwon2026_" + name + "_" + save.clock.replace("T", "_").replace(":", "") + ".json";
  }

  // Принимает текст файла; возвращает проверенную копию прохождения.
  function importText(text, data) {
    let obj;
    try { obj = JSON.parse(G.codec.decode(text)); }
    catch (e) { throw new Error("Это не файл сохранения: текст не читается"); }
    if (!obj || typeof obj !== "object") throw new Error("Это не файл сохранения");
    if (obj.format !== FORMAT && !(obj.v && obj.save)) throw new Error("Это не файл сохранения этой игры");
    return check(JSON.parse(JSON.stringify(obj.save)), data);
  }

  return { SLOTS, VERSION, attachCloud, cloudState, useStore, useBrowser, isPersistent, memoryStore, write, load, list, remove, check,
           exportText, importText, fileName };
});

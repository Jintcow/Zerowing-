// Арт пользователя (концепты, 19.10.2026): фоны мест, спрайты монстров, портреты героя и NPC.
// Список того, что есть, — data/public/art.json (собирает tools/make_art.py). Нет картинки — остаётся заглушка.
G.define("art", function (G) {
  let A = { loc: {}, mon: {}, hero: {}, npc: {} };
  function use(a) { if (a) A = Object.assign({ loc: {}, mon: {}, hero: {}, npc: {} }, a); }
  const loc = (id) => (A.loc[id] ? "art/loc/" + A.loc[id] : null);
  // Спрайт монстра — полоса из 5 поз (art.json → mon_strip, «iahcr»: защита-стойка, атака, получил удар, подготовка способности, выпуск).
  // mon(id) — файл; monPose(pose) — номер клетки.
  const mon = (id) => (A.mon[id] ? "art/mon/" + A.mon[id] : null);
  // Боевые позы героя: полоса 5 клеток «iahcg» (стойка, атака, удар по нему, способность, защита), набор по оружию.
  // Боевая полоса героя — 8 клеток: стойка, защита, получил удар, рывок, прямой удар (2 кадра), вертикальный удар (2 кадра).
  const HERO_CELLS = { i: 0, g: 1, h: 2, r: 3, t1: 4, t2: 5, v1: 6, v2: 7, a: 5, c: 6 };
  const heroBattle = (set) => (A.hero["battle_" + set] ? "art/hero/" + A.hero["battle_" + set] : A.hero.battle_unarmed ? "art/hero/" + A.hero.battle_unarmed : null);
  const heroPose = (pose) => HERO_CELLS[pose || "i"] || 0;
  // стойка монстра — первый кадр листа (атака), защита — второй
  const monPose = (pose) => Math.max(0, (A.mon_strip || "iahcr").indexOf(pose === "g" ? "i" : !pose || pose === "i" ? "a" : pose));
  const hero = (emo) => (A.hero[emo || "neutral"] || A.hero.neutral ? "art/hero/" + (A.hero[emo || "neutral"] || A.hero.neutral) : null);
  // Портрет NPC с учётом места и дня: в школе — форма, в остальных местах — повседневная одежда, своя на каждый день.
  // emo — номер эмоции 0..4 (спокойно, улыбка, серьёзно, грустно, удивлённо).
  // Внешность из пула: выпадает один раз на сохранение (по зерну), без повторов, и хранится в save.looks.
  function looks(save) {
    if (!save) return {};
    if (save.looks && Object.keys(A.roles || {}).every((k) => k in save.looks)) return save.looks;
    const out = Object.assign({}, save.looks || {}), used = new Set(Object.values(out));
    let x = (save.seed >>> 0) ^ 0x9e3779b9;
    const rnd = () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), x | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const roles = Object.entries(A.roles || {}).filter(([id]) => !(id in out))
      .map(([id, cand]) => [id, cand.slice().sort(() => 0).map((c) => [rnd(), c]).sort((a, b) => a[0] - b[0]).map((p) => p[1])])
      .sort((a, b) => a[1].length - b[1].length || (a[0] < b[0] ? -1 : 1));       // сначала роли с малым выбором
    const go = (i, allowNull) => { // перебор с возвратом: у каждой роли — свой облик, без повторов
      if (i === roles.length) return true;
      const [id, cand] = roles[i];
      for (const c of cand) if (!used.has(c)) { used.add(c); out[id] = c; if (go(i + 1, allowNull)) return true; used.delete(c); }
      if (allowNull) { out[id] = null; return go(i + 1, true); }
      return false;
    };
    if (!go(0, false)) go(0, true);
    save.looks = out;
    return out;
  }
  function npc(id, save, emo) {
    if (/^s\d\d$/.test(id)) return "art/npc/" + id + "_" + (emo || 0) + ".webp";   // прямой портрет (облик закреплён за персонажем сюжета)
    const e = A.npc[id];
    if (!e) { const l = looks(save)[id]; return l ? "art/npc/" + l + "_" + (emo || 0) + ".webp" : null; }
    const loc = save && save.hero ? save.hero.location : "", day = save && save.clock ? Math.floor(Date.parse(save.clock.slice(0, 10)) / 864e5) : 0;
    let base = (e.by_loc || {})[loc];
    if (!base && e.casual && e.casual.length) base = e.casual[((day % e.casual.length) + e.casual.length) % e.casual.length];
    return base ? "art/npc/" + base + "_" + (emo || 0) + ".webp" : null;
  }
  // Кто стоит на фоне места: сначала названные NPC, которые здесь сейчас, потом безымянные прохожие
  // (в школе в учебные часы — школьники, в людных местах — взрослые без роли в этом сохранении). Одинаково в пределах часа.
  const CROWD = { "nowon:school": 2, "nowon:market": 2, "nowon:metro": 2, "nowon:street": 1, "nowon:academy_street": 1, "nowon:convenience_store": 1, "nowon:pc_bang": 2, "nowon:riverside": 1, "nowon:study_room": 1, "nowon:clinic": 1 };
  function people(save, locId, here, open) {
    const out = [], max = 3;
    for (const id of here || []) { const u = npc(id, save); if (u && out.length < max) out.push({ id, src: u }); }
    if (!open) return out;
    const p = G.clock.parts(save.clock), hr = p.h, wd = new Date(Date.UTC(p.y, p.mo, p.d)).getUTCDay();
    const school = locId === "nowon:school" && wd >= 1 && wd <= 5 && hr >= 8 && hr < 17;
    let n = school ? 2 : (CROWD[locId] || 0);
    if (locId === "nowon:school" && !school) n = 0;
    if (hr >= 23 || hr < 6) n = Math.min(n, 1);
    const taken = new Set(Object.values(looks(save)).filter(Boolean));
    const pool = ((A.extras || {})[school ? "school" : "adult"] || []).filter((c) => !taken.has(c));
    let x = ((save.seed >>> 0) ^ (G.clock.toMin(save.clock.slice(0, 13) + ":00") * 2654435761) ^ hashS(locId)) >>> 0;
    const rnd = () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), x | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const k = Math.floor(rnd() * (n + 1)); // от 0 до n прохожих
    const left = pool.slice();
    for (let i = 0; i < k && left.length && out.length < max; i++) { const j = Math.floor(rnd() * left.length); out.push({ id: null, src: "art/npc/" + left[j] + "_0.webp" }); left.splice(j, 1); }
    return out;
  }
  const hashS = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  // Эпизодические говорящие (кат-сцены): облик по классу (пол/возраст), лицо закреплено за именем в сохранении.
  // Сначала — лица, не занятые NPC этого сохранения; когда запас кончается — повторы.
  function extra(save, name, look, emo) {
    if (!look || !save) return null;
    if (A.npc[look] || (A.roles || {})[look]) return npc(look, save, emo);
    const pool = (A.extras || {})[look]; if (!pool || !pool.length) return null;
    const ex = save.extra_looks || (save.extra_looks = {});
    if (!ex[name] || !pool.includes(ex[name])) {         // облик из прошлой версии пула — выбрать заново
      const busy = new Set(Object.values(looks(save))), free = pool.filter((c) => !busy.has(c)), from = free.length ? free : pool;
      let h = (save.seed >>> 0) ^ 2166136261; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      ex[name] = from[(h >>> 0) % from.length];
    }
    return "art/npc/" + ex[name] + "_" + (emo || 0) + ".webp";
  }
  // Эмоция реплики по тексту (пока у сцен нет своей разметки): 0 спокойно, 1 улыбка, 2 серьёзно, 3 грустно, 4 удивлённо.
  // Разметка в данных (поле emo строки: число 0–4 или neutral/smile/serious/sad/surprised) всегда главнее.
  const EMO_NAMES = ["neutral", "smile", "serious", "sad", "surprised"];
  // только явные описания мимики — слова из самой речи («спасибо», «нельзя») не угадываются
  const EMO_RULES = [
    [4, /удивл|изумл|опешил|вздрогнул|ошараш|\?!|неужели/],
    [3, /вздохн|груст|печальн|заплак|виновато|поник/],
    [2, /нахмур|строго|сердито|отрезал|сжал губы|помрачн/],
    [1, /улыбн|улыба|усмехн|засмея|рассмея|хихикн|подмигн/],
  ];
  function emo(ln) {
    if (!ln) return 0;
    if (typeof ln.emo === "number") return Math.max(0, Math.min(4, ln.emo | 0));
    if (typeof ln.emo === "string" && EMO_NAMES.includes(ln.emo)) return EMO_NAMES.indexOf(ln.emo);
    const aliases = { angry: 2, tired: 3, calm: 0 };
    const explicit = ln.emo || ln.portrait;
    if (EMO_NAMES.includes(explicit)) return EMO_NAMES.indexOf(explicit);
    if (Object.prototype.hasOwnProperty.call(aliases, explicit)) return aliases[explicit];
    const t = String(ln.text || "").toLowerCase();
    for (const [k, re] of EMO_RULES) if (re.test(t)) return k;
    return 0;
  }
  // размер клетки монстра в ростах героя (art.json → mon_size; рост задан в tools/src/mon_height.json)
  // портрет смотрит вправо? (по имени файла; art.json → face_right)
  const facesRight = (url) => { const f = String(url || "").split("/").pop(); return f.startsWith("hero") || (A.face_right || []).some((p) => f.startsWith(p)) || /art\/hero\//.test(url || ""); };
  const monSize = (id) => (A.mon_size && A.mon_size[id]) || null;
  // v187: временный облик людей-врагов, пока нет их боевых спрайтов, — портрет статиста (серьёзное лицо), закреплён за бойцом.
  function humanFoe(u, save) {
    if (u.npc && (A.npc[u.npc] || (A.roles || {})[u.npc])) return npc(u.npc, save, 2);
    const pool = [].concat((A.extras || {}).m || [], (A.extras || {}).my || []); if (!pool.length) return null;
    return "art/npc/" + pool[hashS((save && save.seed) + ":" + u.id + ":" + u.species) % pool.length] + "_2.webp";
  }
  return { humanFoe, emo, EMO_NAMES, use, loc, mon, monPose, monSize, facesRight, heroBattle, heroPose, hero, npc, looks, extra, people, map: () => (A.map ? "art/loc/" + A.map : null) };
});

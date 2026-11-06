// Врата в районе и служба оповещения «Понхва» (02.11.2026).
// Как система раннего предупреждения о землетрясениях: быстро, но не идеально — ложные тревоги, опоздания,
// ошибка в оценке ранга на одну ступень. Настройки — data/public/places.json → gates.
// save.gates = { list:[{id, place, rank, est, open_at, alert_at, raid_at, status, false}] }
//   время — номер слота: день × 4 + слот (утро 0 … ночь 3)
//   status: open | closed_assoc (рейд Ассоциации) | closed_siu (закрыл Сиу — «неизвестный») | false (ложная тревога)
//         | breach (прорыв: рейд не успел, твари вышли в район) | breach_siu (прорыв остановил Сиу) | breach_over (подавлен Ассоциацией, с жертвами)
//   Прорыв (03.11.2026): у части врат рейд опаздывает (places.json → gates.late_raid по рангу). В момент, когда рейд должен был
//   прийти, врата прорываются; рейд приходит ещё через 2 слота и подавляет прорыв. Пока прорыв идёт — место закрыто, в Навигаторе
//   там бой «Твари на улицах»; если Сиу стоит там в момент прорыва — бой обязателен.
G.define("gates", function (G) {
  const R7 = ["F", "E", "D", "C", "B", "A", "S"];
  const now = (save) => save.day.n * 4 + save.day.slot;
  function rnd(save, salt) {   // детерминированно: зерно сохранения + день + соль
    let x = ((save.seed >>> 0) ^ Math.imul(save.day.n + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
    return () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), x | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const st = (save) => save.gates && Array.isArray(save.gates.list) ? save.gates : (save.gates = { list: [], rolled: 0 });
  const cfg = (data) => (data.places && data.places.gates) || { chance: 0, false_alarm: 0, late: 0, est_miss: 0, raid_slots: [2, 4], ranks: { F: 1 } };
  const spots = (data) => ((data.places && data.places.places) || []).filter((p) => p.gate);
  function pickRank(r, ranks) { let x = r(), acc = 0; for (const [k, p] of Object.entries(ranks)) { acc += p; if (x < acc) return k; } return Object.keys(ranks)[0]; }
  function estimate(r, rank, miss) { if (r() >= miss) return rank; const i = R7.indexOf(rank), j = Math.max(0, Math.min(R7.length - 1, i + (r() < 0.5 ? -1 : 1))); return R7[j]; }
  // Открыть врата (для сюжета и тестов): place/rank/open_at можно задать.
  function spawn(save, data, o) {
    o = o || {}; const S = st(save), C = cfg(data), r = rnd(save, S.list.length + 101);
    const places = spots(data), place = o.place || (places.length ? places[Math.floor(r() * places.length)].id : save.hero.location);
    const rank = o.rank || pickRank(r, C.ranks), t = o.open_at !== undefined ? o.open_at : now(save);
    // Срок до прорыва — по канону (rules.json → gate_breach_hours; слот ≈ 6 ч), но не меньше игрового окна F/E/D (6 слотов).
    const H = ((G.data && G.data.rules && G.data.rules.gate_breach_hours) || {})[rank] || 24, win = Math.max(C.raid_slots[1] + 1, Math.ceil(H / 6));
    const raidIn = o.raid_in || (win <= C.raid_slots[1] + 1 ? C.raid_slots[0] + Math.floor(r() * (C.raid_slots[1] - C.raid_slots[0] + 1)) : Math.max(C.raid_slots[0], Math.round(win * (0.3 + 0.5 * r()))));
    const g = { id: "g" + save.day.n + "-" + (S.list.length + 1), place, rank, est: o.est || estimate(r, rank, C.est_miss), open_at: t,
      alert_at: o.alert_at !== undefined ? o.alert_at : t, raid_at: t + raidIn, breach_in: win, status: "open", false: !!o.false };
    const LR = C.late_raid || {};
    if (!g.false && (o.late !== undefined ? o.late : r() < (LR[rank] || 0))) { g.late = true; g.breach_at = o.raid_in ? g.raid_at : t + win; g.raid_at = g.breach_at + 2; }   // рейд не успел: прорыв в канонический срок
    S.list.push(g); return g;
  }
  // Новый день: может открыться разлом (в утро, день или вечер) или прийти ложная тревога.
  function roll(save, data) {
    const S = st(save); if (S.rolled >= save.day.n) return; S.rolled = save.day.n;
    const C = cfg(data), r = rnd(save, 1), base = save.day.n * 4, x = r();
    if (x < C.chance) { const at = base + Math.floor(r() * 3); spawn(save, data, { open_at: at, alert_at: at + (r() < C.late ? 1 : 0) }); }
    else if (x < C.chance + C.false_alarm) { const at = base + Math.floor(r() * 3); spawn(save, data, { open_at: at, alert_at: at, raid_in: 1, false: true }); }
    tick(save);
  }
  function tick(save) {
    const t = now(save);
    for (const g of st(save).list) if (g.status === "open" && g.late && t >= g.breach_at) breach(save, g);
    for (const g of st(save).list) if (g.status === "breach" && t >= g.raid_at) {
      g.status = "breach_over"; const V = G.plot ? G.plot.state(save).vars : {}; V.breaches_ignored = (V.breaches_ignored || 0) + 1;
      if (save.breach_here === g.id) delete save.breach_here;
      if (G.news && save.day) G.news.add(save, { src: "Сеул Сегодня", title: "Прорыв в Норвоне подавлен: " + pname(g.place), hot: true, text: "Рейдовая группа Ассоциации зачистила район спустя несколько часов после прорыва. Есть пострадавшие, " + pname(g.place) + " закрыт на уборку.", comments: [{ who: "мама_троих", t: "Почему рейд опять опоздал?! Дети сидели в подвале" }, { who: "ex_raider", t: "Ранг " + g.rank + ", а прислали полгруппы. Классика" }] });
    }
    for (const g of st(save).list) if (g.status === "open" && t >= g.raid_at) {
      g.status = g.false ? "false" : "closed_assoc";
      if (!g.false && G.news && save.day) { const P = (G.data && G.data.locById[g.place]) || {}; G.news.add(save, { src: "Вестник Ассоциации", title: "Разлом ранга " + g.rank + " закрыт: " + (P.name || "Норвон"), text: "Рейдовая группа Ассоциации закрыла Врата. Оцепление снято, пострадавших нет.", pool: "raid", n: 2 }); }
    }
  }
  const pname = (id) => ((G.data && G.data.locById[id]) || {}).name || "Норвон";
  function breach(save, g) {
    g.status = "breach"; g.breach_started = now(save);
    if (save.hero.location === g.place && !save.hero.dead) save.breach_here = g.id;   // Сиу прямо там — бой обязателен
    if (G.news && save.day) G.news.add(save, { src: "Понхва", title: "ПРОРЫВ: " + pname(g.place) + " — твари на улицах", hot: true, text: "Рейд Ассоциации не успел. Разлом ранга " + g.rank + " прорвался. Жителей просят укрыться в зданиях и не подходить к оцеплению.", comments: [{ who: "пекарь_юн", t: "Слышу крики со стороны " + pname(g.place) + ". Закрыл ставни" }, { who: "hunter_D_rank", t: "Кто рядом — не геройствуйте" }] });
  }
  // Прорыв остановил Сиу.
  function stopBreach(save, id) {
    const g = byId(save, id); if (!g || g.status !== "breach") return;
    g.status = "breach_siu"; if (save.breach_here === id) delete save.breach_here; if (G.heat) G.heat.add(save, 10);
    if (G.plot) { const V = G.plot.state(save).vars; V.breaches_stopped = (V.breaches_stopped || 0) + 1; V.gates_closed_by_siu = (V.gates_closed_by_siu || 0) + 1; }
    if (G.news) G.news.add(save, { src: "Норвон Инсайд", title: "Неизвестный остановил прорыв: " + pname(g.place), hot: true, text: "Очевидцы говорят: парень в капюшоне перебил тварей до приезда рейда и ушёл дворами. Ассоциация разыскивает свидетелей.", comments: [{ who: "пекарь_юн", t: "Это он! Тот же, что в прошлый раз?" }, { who: "ассоциация_фан", t: "Незарегистрированный пробуждённый = нарушитель. Даже если спас" }] });
  }
  const breaches = (save) => st(save).list.filter((g) => g.status === "breach");
  const breachAt = (save, place) => breaches(save).find((g) => g.place === place) || null;
  // Твари прорыва: 2–3 рядовых ранга врат.
  function breachEnemies(save, data, g) {
    const r = rnd(save, 900 + st(save).list.indexOf(g)), pool = data.bestiary.species.filter((s) => s.rank === g.rank && s.role === "regular" && !String(s.id).startsWith("H-"));
    const n = 2 + (r() < 0.5 ? 1 : 0), out = []; for (let i = 0; i < n; i++) out.push((pool[Math.floor(r() * pool.length)] || data.bestiary.species.find((x) => x.rank === "F" && x.role === "regular")).id); return out;
  }
  const exists = (save, g) => !g.false && g.status === "open" && now(save) >= g.open_at;
  // Что видно в «Понхва»: всё, о чём уже было оповещение, новые сверху.
  const alerts = (save) => st(save).list.filter((g) => now(save) >= g.alert_at).slice().reverse();
  // Открытые врата, о которых Сиу знает: было оповещение или он сам стоит рядом.
  const known = (save) => st(save).list.filter((g) => exists(save, g) && (now(save) >= g.alert_at || save.hero.location === g.place));
  const at = (save, place) => st(save).list.filter((g) => exists(save, g) && g.place === place);
  const byId = (save, id) => st(save).list.find((g) => g.id === id) || null;
  // Монстр по настоящему рангу врат (оценка «Понхва» может ошибаться).
  function enemies(save, data, g) {
    const r = rnd(save, 500 + st(save).list.indexOf(g)), pool = data.bestiary.species.filter((s) => s.rank === g.rank && s.role === "regular" && !String(s.id).startsWith("H-"));
    return [(pool[Math.floor(r() * pool.length)] || data.bestiary.species.find((x) => x.rank === "F" && x.role === "regular")).id];
  }
  // ---------- Карта Врат: развилки от входа к боссу (02.11.2026, по референсу заказчика) ----------
  // Узлы: fight (бой), treasure (сокровище), rest (отдых), event («?» — событие или бой), elite (элита), boss.
  // От входа — 3 дорожки (lane 0/1/2), слои вверх; из узла можно идти только по связям в следующий слой.
  // HP и мана между узлами сами не восстанавливаются (только «Отдых»). Выйти можно между узлами — позиция запомнится.
  // g.map = { nodes:[{id, layer, lane, kind, next:[id], state}], pos: id|null (null — у входа), boss: id, biome }
  const BIOME_NAME = { "Пещеры": "Пещерный разлом", "Дремучий лес": "Лесной разлом", "Горы": "Горный разлом", "Вулкан": "Вулканический разлом", "Ледяные пустоши": "Ледяной разлом",
    "Пустыня": "Песчаный разлом", "Морское побережье": "Прибрежный разлом", "Болота": "Болотный разлом", "Кладбище и склепы": "Разлом-склеп", "Проклятый замок": "Разлом-замок" };
  function map(save, g) {
    if (g.map && g.map.nodes && g.map.nodes[0] && g.map.nodes[0].layer !== undefined) return g.map;
    const r = rnd(save, 1300 + st(save).list.indexOf(g)), B = (G.data && G.data.bestiary) || { biomes: [] };
    const L = R7.indexOf(g.rank) <= 1 ? 4 : 5, nodes = [], layers = [];
    for (let l = 0; l < L; l++) {
      const lanes = l === 0 ? (r() < 0.5 ? [0, 2] : [0, 1, 2]) : l === L - 1 && r() < 0.4 ? [0, 2] : [0, 1, 2];
      layers.push(lanes.map((lane) => { const n = { id: nodes.length, layer: l, lane, kind: "fight", next: [], state: "todo" }; nodes.push(n); return n; }));
    }
    const boss = { id: nodes.length, layer: L, lane: 1, kind: "boss", next: [], state: "todo" }; nodes.push(boss);
    // связи: прямо по своей дорожке, развилок немного, линии не пересекаются; у каждого узла есть вход и выход
    for (let l = 0; l < L - 1; l++) {
      const A = layers[l], N = layers[l + 1], E = [];
      const crosses = (a, b) => E.some(([x, y]) => (x.lane < a.lane && y.lane > b.lane) || (x.lane > a.lane && y.lane < b.lane));
      const link = (a, b) => { if (E.some(([x, y]) => x === a && y === b) || crosses(a, b)) return false; E.push([a, b]); return true; };
      const near = (list, lane) => list.slice().sort((x, y) => Math.abs(x.lane - lane) - Math.abs(y.lane - lane));
      for (const a of A) { const b = N.find((n) => n.lane === a.lane); if (b) link(a, b); }
      for (const a of A) if (!E.some(([x]) => x === a)) near(N, a.lane).some((b) => link(a, b));
      for (const b of N) if (!E.some(([, y]) => y === b)) near(A, b.lane).some((a) => link(a, b));
      const forks = A.length > 2 ? 1 : 0;   // одна лишняя развилка на слой — иногда
      for (let k = 0; k < forks; k++) if (r() < 0.5) { const a = A[Math.floor(r() * A.length)], c = N.filter((b) => Math.abs(b.lane - a.lane) === 1); if (c.length) link(a, c[Math.floor(r() * c.length)]); }
      for (const [a, b] of E) a.next.push(b.id);
    }
    for (const a of layers[L - 1]) a.next.push(boss.id);
    // содержимое: первый слой — бои; дальше по весам; элита не раньше третьего слоя; отдых — не в первом
    const pick = (l) => { const W = l === 0 ? [["fight", 1]] : [["fight", 0.34], ["event", 0.26], ["treasure", 0.14], ["elite", l >= 2 ? 0.16 : 0], ["rest", 0.1]];
      const s = W.reduce((a, [, w]) => a + w, 0); let x = r() * s; for (const [k, w] of W) { if ((x -= w) < 0) return k; } return "fight"; };
    for (const n of nodes) if (n.kind !== "boss") n.kind = pick(n.layer);
    if (!layers[L - 1].some((n) => n.kind === "rest") && r() < 0.6) layers[L - 1][Math.floor(r() * layers[L - 1].length)].kind = "rest";   // передышка перед боссом — не всегда
    if (!nodes.some((n) => n.kind === "elite")) layers[Math.min(2, L - 1)][Math.floor(r() * layers[Math.min(2, L - 1)].length)].kind = "elite";
    // сюжетные Врата: каждое сюжетное событие — на слое, который не обойти (все узлы слоя — «?»)
    const story = g.events || (g.event ? [g.event] : []);
    story.slice(0, L - 1).forEach((_, i) => { const l = Math.min(L - 1, 1 + Math.floor((i * (L - 1)) / Math.max(1, story.length))); layers[l].forEach((n) => (n.kind = "event")); });
    const biomes = (B.biomes || []).filter((b) => BIOME_NAME[b]);
    g.map = { nodes, pos: null, boss: boss.id, biome: biomes.length ? biomes[Math.floor(r() * biomes.length)] : "Пещеры" };
    return g.map;
  }
  const title = (g) => g.name || BIOME_NAME[(g.map || {}).biome] || "Разлом";
  // Куда можно пойти отсюда.
  function options(save, g) { const M = map(save, g); return M.pos === null ? M.nodes.filter((n) => n.layer === 0) : M.nodes[M.pos].next.map((id) => M.nodes[id]); }
  const depth = (g) => ((g.map && g.map.nodes) || []).filter((n) => n.state === "done").length;
  function pickSpecies(save, data, g, role, salt) {
    const r = rnd(save, 700 + st(save).list.indexOf(g) * 10 + salt), B = data.bestiary.species.filter((s) => !String(s.id).startsWith("H-"));
    const biome = g.map && g.map.biome, all = B.filter((s) => s.rank === g.rank && s.role === role), here = all.filter((s) => s.biome === biome);
    const pool = here.length ? here : all;
    return (pool[Math.floor(r() * pool.length)] || B.find((x) => x.rank === "F" && x.role === "regular")).id;
  }
  // Кто стоит в узле: рядовой (засада в «?» — тоже), элита, хозяин. Обычный бой на поздних слоях — иногда двое.
  function nodeEnemies(save, data, g, id) {
    const n = map(save, g).nodes[id], role = n.kind === "elite" ? "elite" : n.kind === "boss" ? "boss" : "regular";
    const out = [pickSpecies(save, data, g, role, id)];
    if (n.kind === "fight" && n.layer >= 2 && rnd(save, 800 + id)() < 0.5) out.push(pickSpecies(save, data, g, "regular", id + 40));
    return out;
  }
  // «?» раскрывается, когда Сиу до него доходит: событие или бой.
  //   Сюжетные Врата (шаг сцены {"gate":{…,"event":"id"}} или "events":[…]) — свои сюжетные сцены по порядку.
  //   Обычные — засада (40%) или случайная сцена mode:"gate_event": находка, побочное задание, встреча.
  function reveal(save, g, id) {
    const n = map(save, g).nodes[id]; if (n.reveal) return n.reveal;
    const queue = g.events || (g.event ? [g.event] : null);
    if (queue) { const k = (g.used_events = g.used_events || 0); if (k < queue.length) { g.used_events++; n.scene = queue[k]; return (n.reveal = "story"); } }
    const r = rnd(save, 900 + st(save).list.indexOf(g) * 10 + id);
    if (r() < 0.4) return (n.reveal = "fight");
    const sid = G.plot && G.plot.gateEvent(save, r);
    if (!sid) return (n.reveal = "fight");
    n.scene = sid; return (n.reveal = "event");
  }
  function closedBySiu(save, id) {
    const g = byId(save, id); if (!g) return;
    g.status = "closed_siu"; g.closed_at = now(save); if (G.heat) G.heat.gateClosed(save, g.rank);
    if (G.plot) { const V = G.plot.state(save).vars; V.gates_closed_by_siu = (V.gates_closed_by_siu || 0) + 1; }   // для «городских слухов»
    if (G.news) { const P = (G.data && G.data.locById[g.place]) || {}; G.news.add(save, { src: "Норвон Инсайд", title: "Аномалия: " + (P.name || "Норвон") + " — портала нет", text: "Радары пикнули, приехала группа Ассоциации, а Врат уже нет. Официально — сбой техники. В комментариях шутят про пришельцев.", hot: true, pool: "siu_gate", n: 4 }); }
  }
  // Текст статуса для приложения.
  function label(save, g) {
    if (g.status === "false") return "Ложная тревога";
    if (g.status === "closed_assoc") return "Закрыт рейдовой группой Ассоциации";
    if (g.status === "closed_siu") return "Закрыт до прибытия рейда. Кем — неизвестно";
    if (g.status === "breach") return "ПРОРЫВ · твари в районе · рейд через " + Math.max(1, g.raid_at - now(save)) + " сл.";
    if (g.status === "breach_siu") return "Прорыв остановлен до прибытия рейда. Кем — неизвестно";
    if (g.status === "breach_over") return "Прорыв подавлен рейдом Ассоциации. Есть пострадавшие";
    const left = g.raid_at - now(save);
    if (left > 8) { const d = Math.round(left / 4); return "Открыт · Ассоциация готовит рейд, ожидается через ~" + d + " дн."; }
    return "Открыт · рейд Ассоциации ожидается через " + Math.max(1, left) + " " + (left <= 1 ? "слот" : left <= 4 ? "слота" : "слотов");
  }
  return { R7, now, spawn, roll, tick, alerts, known, breach, stopBreach, breaches, breachAt, breachEnemies, at, byId, enemies, closedBySiu, label, map, options, depth, title, nodeEnemies, reveal, pickSpecies };
});

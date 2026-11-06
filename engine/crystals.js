// Кристаллы маны (Claude, 03.11.2026). Главный доход охотника: из каждой твари во Вратах можно выломать кристалл её ранга.
// Кристалл — материал рюкзака с id «CRY-<ранг>» (слот-стопка, вес как у материала), продаётся через каналы Скупки.
// Цена плавает по неделям: курс — детерминированное блуждание от зерна прохождения (перезагрузка не меняет).
// Неделя 1 (8–14 сентября) закреплена: +12% — так написано в новостях 9 сентября («Цены на кристаллы маны выросли на 12%»).
// Каждый вторник следующих недель в ленте выходит пост о курсе. Настройки — rules.json → crystals.
G.define("crystals", function (G) {
  const RANKS = ["F", "E", "D", "C", "B", "A", "S"];
  const DEF = { price: { F: 40000, E: 150000, D: 600000, C: 2500000, B: 10000000, A: 40000000, S: 150000000 },
    drop: { regular: 0.5, elite: 1, boss: 1 }, boss_units: 2, week1: 0.12, step: [-0.1, 0.12], min: 0.7, max: 1.6,
    comments: [] };
  let C = DEF;
  function use(data) { C = Object.assign({}, DEF, (data.rules && data.rules.crystals) || {}); }
  const id = (rank) => "CRY-" + rank;
  const isCrystal = (mid) => typeof mid === "string" && mid.startsWith("CRY-");
  const rankOf = (mid) => mid.slice(4);
  function mat(rank) { return { id: id(rank), name: "Кристалл маны " + rank, price_won: (C.price || {})[rank] || 0, use: "топливо для артефактов и городской энергетики; сдаётся в скупку" }; }
  function all() { return RANKS.filter((r) => (C.price || {})[r]).map(mat); }

  const week = (save) => Math.floor(((save.day && save.day.n) || 1) - 1) / 7 | 0;
  function hash(seed, k) { let x = ((seed >>> 0) ^ Math.imul(k + 101, 0x9e3779b1)) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0; x = Math.imul(x ^ (x >>> 13), 0x297a2d39) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
  // Курс недели w (1.00 — каталожная цена).
  function index(save, w) {
    if (w === undefined) w = week(save);
    let v = 1;
    for (let k = 1; k <= w; k++) {
      const d = k === 1 ? C.week1 : C.step[0] + hash(save.seed, k) * (C.step[1] - C.step[0]);
      v = Math.min(C.max, Math.max(C.min, v * (1 + d)));
    }
    return Math.round(v * 100) / 100;
  }
  function price(save, mid) { const base = (C.price || {})[rankOf(mid)] || 0; return Math.round(base * index(save) / 1000) * 1000; }

  // Сколько кристаллов дала мёртвая тварь (0, 1 или больше у босса). r — бросок 0..1.
  function drop(u, r) {
    if (!u || u.human || u.twin || !u.rank || !(C.price || {})[u.rank]) return 0;
    if (r >= ((C.drop || {})[u.role] ?? C.drop.regular)) return 0;
    return u.role === "boss" ? C.boss_units : 1;
  }

  // Посты ленты о курсе: первый день каждой недели (вторник) начиная со второй (первую закрывает пост 9 сентября).
  function posts(save) {
    if (!save.day || !save.day.date) return [];
    const n = save.day.n || 1, cur = week(save), out = [];
    for (let w = 2; w <= cur; w++) {
      const date = G.clock.advance(save.day.date + "T12:00", (w * 7 + 1 - n) * 1440).slice(0, 10);
      const a = index(save, w - 1), b = index(save, w), d = Math.round((b / a - 1) * 100);
      const title = d > 0 ? "Кристаллы маны подорожали на " + d + "% за неделю" : d < 0 ? "Кристаллы маны подешевели на " + -d + "% за неделю" : "Цены на кристаллы маны застыли";
      const text = (d > 0 ? "Мало закрытых разломов — мало сырья: энергетики скупают всё, что приносят охотники." : d < 0 ? "Гильдии сбросили на рынок крупные партии после рейдов. Скупки снижают закупочные цены." : "Рынок ждёт отчёта Ассоциации о новых разломах.")
        + " Ориентир за кристалл F-ранга — " + Math.round(C.price.F * b / 1000).toLocaleString("ru-RU") + " тыс. ₩.";
      const P = (C.comments || []).slice(), cm = [];
      for (let k = 0; k < 2 && P.length; k++) { const [who, t] = P.splice(Math.floor(hash(save.seed, w * 13 + k) * P.length), 1)[0]; cm.push({ who, t }); }
      out.push({ id: "cry" + w, date, src: "Экономика", title, text, comments: cm });
    }
    return out;
  }
  return { use, id, isCrystal, mat, all, index, price, drop, posts, week, RANKS };
});

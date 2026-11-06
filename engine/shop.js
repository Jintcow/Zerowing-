// Лавка снаряжения (Claude, 03.11.2026). Норвон, у станции. Работает днём и вечером, слот не тратит.
// Без карточки пробуждённого (переменная сюжета hunter_card) продавец пускает только к спортинвентарю:
// бита, шлем, щитки — обычные вещи (mundane): дают защиту и немного атаки, но удар ими не напитан маной.
// С карточкой открыта охотничья витрина F–D (hunter.json → shop). Здесь же ремонт снаряжения.
// Вход — разговор с продавцом до магазина (story/shop.json, сцена shop_enter): там Сиу решает, показывать ли карточку.
// Переменные: shop_go — зашёл, shop_full — витрина открыта (карточка показана), shop_knows_card — продавец уже знает.
G.define("shop", function (G) {
  let H = { shop: [], sport: [] };
  function use(data) { H = Object.assign({ shop: [], sport: [] }, data.hunter || {}); }
  const V = (save) => G.plot.state(save).vars;
  const st = (save) => save.shop || (save.shop = { visits: 0 });
  const card = (save) => !!((G.plot && G.plot.state(save).vars.hunter_card) || save.hero.registered);
  const full = (save) => card(save) && !!V(save).shop_full;     // карточку показал продавцу
  function list(save) { return (full(save) ? H.shop : []).concat(H.sport).map((x) => ({ ...x, sport: x.tier === "sport" })); }
  function closed(save) { const s = save.day && save.day.slot; return s !== 1 && s !== 2 ? "Лавка открыта днём и вечером" : save.penalty_zone ? "Сначала штрафная зона" : ""; }
  function why(save, it) {
    const c = closed(save); if (c) return c;
    if (!it.sport && !full(save)) return "Без карточки пробуждённого не продадут";
    if (save.hero.money < it.price_won) return "Не хватает денег";
    if (G.sysinv && !G.sysinv.fitsItem(save.hero, it)) return "Рюкзак полон";
    return "";
  }
  function buy(save, data, id) {
    const it = list(save).find((x) => x.id === id); if (!it) throw Error("Такого на витрине нет");
    const w = why(save, it); if (w) throw Error(w);
    G.hero.charge(save.hero, save.clock, -it.price_won, "Лавка снаряжения: " + it.name);
    const S = st(save), item = { uid: it.id + "@" + save.clock + "#" + (S.bought = (S.bought || 0) + 1), id: it.id, name: it.name, rank: it.rank, price_won: it.price_won, gear: JSON.parse(JSON.stringify(it.gear)), dur: it.gear.dur };
    (save.hero.items || (save.hero.items = [])).push(item);
    save.journal.push({ at: save.clock, actor: "hero", action: "buy", item: it.id, price: it.price_won, result: "ok" });
    return { ok: true, item };
  }
  return { use, card, full, list, closed, why, buy };
});

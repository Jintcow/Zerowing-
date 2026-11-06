// Бестиарий — приложение в телефоне (Claude, 03.11.2026). Сведения о твари открываются постепенно:
//   1 — встретил в бою: имя, ранг, место обитания, облик;
//   2 — убил хотя бы одну или изучил «Анализом»: HP, атака, характеристики, поведение, признак атаки;
//   3 — убил 5 или изучил «Анализом»: слабость, тип урона, способности;
//   4 — убил 10: добыча (материал и вещи с ценами).
// Источники: hero.seen (встречи), hero.kills (убийства), hero.ach.analyzed («Анализ» в бою).
G.define("bestiary", function (G) {
  const RANKS = ["F", "E", "D", "C", "B", "A", "S"];
  const NEED = { kills2: 1, kills3: 5, kills4: 10 };
  const all = (data) => ((data.bestiary && data.bestiary.species) || []).filter((s) => !String(s.id).startsWith("H-"));
  function tier(save, id) {
    const h = save.hero, k = (h.kills || {})[id] || 0, an = !!((h.ach || {}).analyzed || {})[id], seen = !!(h.seen || {})[id] || k > 0 || an;
    if (!seen) return 0;
    if (k >= NEED.kills4) return 4;
    if (k >= NEED.kills3 || an) return 3;
    if (k >= NEED.kills2) return 2;
    return 1;
  }
  const kills = (save, id) => ((save.hero.kills || {})[id] || 0);
  const analyzed = (save, id) => !!(((save.hero.ach || {}).analyzed || {})[id]);
  function list(save, data, rank) {
    return all(data).filter((s) => !rank || s.rank === rank).map((s) => ({ s, tier: tier(save, s.id), kills: kills(save, s.id) }));
  }
  function counts(save, data) {
    const out = {}; for (const r of RANKS) out[r] = { known: 0, total: 0 };
    for (const s of all(data)) { const c = out[s.rank]; if (!c) continue; c.total++; if (tier(save, s.id)) c.known++; }
    return out;
  }
  // Что сейчас показать о виде (по ступени) и что откроется дальше.
  function card(save, data, id) {
    const s = all(data).find((x) => x.id === id); if (!s) return null;
    const t = tier(save, id), k = kills(save, id), an = analyzed(save, id);
    const next = t >= 4 ? "" : t === 3 ? "Добыча — после " + NEED.kills4 + " убийств (сейчас " + k + ")"
      : t === 2 ? "Слабость и способности — после " + NEED.kills3 + " убийств или «Анализа»"
      : t === 1 ? "Сила и повадки — после первого убийства или «Анализа»" : "";
    return { s, tier: t, kills: k, analyzed: an, next };
  }
  return { RANKS, NEED, tier, list, counts, card };
});

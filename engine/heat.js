// Внимание Ассоциации (Claude, 03.11.2026). Сиу 18 — во Врата ему нельзя ни с карточкой, ни без. Каждый след растит «внимание»:
//   закрытые до рейда врата (+6 +3 за ранг), остановленный прорыв (+10), вход во Врата (+1), Бокс со сканом паспорта (+2),
//   серый скупщик (+3). Каждое утро внимание остывает на 2. Переменная assoc_heat (0–100) — для сценаристов.
// Пороги: 50 — в районе ищут: приходит инспектор (сцена heat_insp1); 80 — вышли на след: второй визит (heat_insp2), там можно сесть.
// Новый визит возможен, только если внимание остыло ниже 30 и снова поднялось.
G.define("heat", function (G) {
  const V = (save) => G.plot.state(save).vars;
  const RK = ["F", "E", "D", "C", "B", "A", "S"];
  function add(save, n) {
    if (!save.hero || !save.hero.awakened) return 0;
    const v = V(save); v.assoc_heat = Math.max(0, Math.min(100, (v.assoc_heat || 0) + n));
    if (n > 0) v.heat_day = save.day ? save.day.n : 0;
    return v.assoc_heat;
  }
  const gateClosed = (save, rank) => add(save, 6 + 3 * Math.max(0, RK.indexOf(rank)));
  function morning(save) {
    const v = V(save), h = v.assoc_heat || 0;
    if (h > 0 && (v.heat_day || 0) < save.day.n - 0) add(save, -2);
    const x = v.assoc_heat || 0;
    if (x < 30) { v.insp_wave = 0; }
    if (!save.inspector && x >= 80 && (v.insp_wave || 0) < 2) { save.inspector = "heat_insp2"; v.insp_wave = 2; }
    else if (!save.inspector && x >= 50 && (v.insp_wave || 0) < 1) { save.inspector = "heat_insp1"; v.insp_wave = 1; }
  }
  // Что знает Сиу (качественно — числа он не видит).
  function mood(save) {
    const x = V(save).assoc_heat || 0;
    return x >= 80 ? "Ассоциация вышла на след" : x >= 50 ? "В районе ищут «неизвестного»" : x >= 25 ? "О «неизвестном» говорят" : "Спокойно";
  }
  return { add, gateClosed, morning, mood };
});

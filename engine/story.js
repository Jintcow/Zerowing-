// Совместимость: старое имя модуля. Вся логика сюжета — в engine/plot.js (сюжет v2, 02.11.2026).
G.define("story", function (G) {
  return {
    setData: (data) => G.plot.use(data),
    matches: (save, cond) => G.plot.test(save, cond),
    next: () => null,
  };
});

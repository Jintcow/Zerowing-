// Строки, видимые игроку, из data/public/texts.json (литература — GPT). line(key, vars, k): k — любое целое,
// по нему выбирается вариант (в бою — номер строки лога), чтобы не тратить случайность боя.
G.define("texts", function (G) {
  let L = {};
  function use(t) { L = (t && t.lines) || {}; }
  function line(key, vars, k) {
    const list = L[key];
    if (!list || !list.length) return "";
    const s = list[Math.abs(k | 0) % list.length];
    return s.replace(/\{(\w+)\}/g, (m, v) => (vars && vars[v] !== undefined ? String(vars[v]) : m));
  }
  return { use, line, has: (k) => !!(L[k] && L[k].length) };
});

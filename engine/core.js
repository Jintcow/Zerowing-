// Ядро: общее пространство имён игры. Работает и в браузере, и в Node (для тестов).
(function (root) {
  const G = root.G || (root.G = {});
  G.VERSION = "0.1.3";
  G.modules = G.modules || {};
  G.define = function (name, factory) {
    G.modules[name] = factory(G);
    G[name] = G.modules[name];
    return G[name];
  };
})(typeof window !== "undefined" ? window : globalThis);

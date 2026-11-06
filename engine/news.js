// Лента новостей в телефоне (02.11.2026): Сеул, страна, мир Охотников — и районный «Норвон Инсайд».
// Посты: data/public/news.json (дата, источник, условие if) + живые посты из игры:
//   шаг сцены {"post":{"src":"Норвон Инсайд","title":"…","text":"…","comments":[{"who":"ник","t":"…"}]}}, врата, закрытые Сиу или рейдом Ассоциации.
// У каждого поста — комментарии жителей (ники, как в настоящей ленте).
// save.news = { posts:[{id, date, src, title, text}], seen: число прочитанных }
G.define("news", function (G) {
  let D = { posts: [] };
  function use(data) { D = data.news || D; }
  const st = (save) => save.news || (save.news = { posts: [], seen: 0 });
  // Комментарии к живым постам — из пулов news.json (comment_pools), повторяемо по зерну.
  function pick(save, pool, n) {
    const P = ((D.comment_pools || {})[pool] || []).slice(); let x = ((save.seed >>> 0) ^ Math.imul(st(save).posts.length + 7, 0x9e3779b1)) >>> 0; const out = [];
    while (P.length && out.length < n) { x = Math.imul(x ^ (x >>> 13), 0x5bd1e995) >>> 0; const [w, t] = P.splice(x % P.length, 1)[0]; out.push({ who: w, t }); }
    return out;
  }
  function add(save, p) {
    const S = st(save), c = p.comments || (p.pool ? pick(save, p.pool, p.n || 3) : []);
    S.posts.push(Object.assign({ id: "p" + S.posts.length + "_" + (save.day ? save.day.n : 0), date: save.day ? save.day.date : save.clock.slice(0, 10) }, p, { comments: c }));
  }
  // Всё, что уже вышло к сегодняшнему дню, новые сверху.
  function feed(save) {
    const today = save.day ? save.day.date : save.clock.slice(0, 10);
    const fixed = (D.posts || []).filter((p) => p.date <= today && (!p.if || !G.plot || G.plot.test(save, p.if)));
    return fixed.concat(G.crystals ? G.crystals.posts(save).filter((p) => p.date <= today) : [], st(save).posts.filter((p) => p.date <= today)).sort((a, b) => b.date.localeCompare(a.date) || (b.hot ? 1 : 0) - (a.hot ? 1 : 0));
  }
  const unread = (save) => Math.max(0, feed(save).length - st(save).seen);
  const markRead = (save) => { st(save).seen = feed(save).length; };
  return { use, add, feed, unread, markRead };
});

// ZeroWing offline v4: fast updates for visible UI, full offline assets in background.
const CACHE = 'zerowing-offline-push-position-20261106-v4';
const ASSETS = ["./","./engine/achievements.js","./engine/app.js","./engine/art.js","./engine/bestiary.js","./engine/bootstrap.js","./engine/cards.js","./engine/checks.js","./engine/codec.js","./engine/combat.js","./engine/core.js","./engine/crystals.js","./engine/day.js","./engine/forge.js","./engine/gates.js","./engine/gear.js","./engine/goals.js","./engine/heat.js","./engine/hero.js","./engine/icons.js","./engine/living.js","./engine/mail.js","./engine/market.js","./engine/news.js","./engine/passives.js","./engine/plot.js","./engine/quests.js","./engine/save.js","./engine/school.js","./engine/shop.js","./engine/story.js","./engine/sysinv.js","./engine/system.js","./engine/texts.js","./data/author/season1.dat","./data/author/secrets.dat","./data/public/art.json","./data/public/bestiary.json","./data/public/cards.json","./data/public/catalog.json","./data/public/characters.json","./data/public/encounters.json","./data/public/forge.json","./data/public/hero_start.json","./data/public/hunter.json","./data/public/news.json","./data/public/people.json","./data/public/places.json","./data/public/quests.json","./data/public/rules.json","./data/public/story/c1p0.json","./data/public/story/c1p1.json","./data/public/story/c1p2.json","./data/public/story/c1p3.json","./data/public/story/c1p4.json","./data/public/story/c1p5.json","./data/public/story/c1p6a.json","./data/public/story/c1p6b.json","./data/public/story/c1p6c.json","./data/public/story/c1p6d.json","./data/public/story/c1p6e.json","./data/public/story/c1p6f.json","./data/public/story/c1p6g.json","./data/public/story/c1reg.json","./data/public/story/demo.json","./data/public/story/forge.json","./data/public/story/gate_events.json","./data/public/story/heat.json","./data/public/story/shop.json","./data/public/story.json","./data/public/texts.json","./art/gate/boss.webp","./art/gate/elite.webp","./art/gate/event.webp","./art/gate/fight.webp","./art/gate/rest.webp","./art/gate/treasure.webp","./art/hero/battle_bow.webp","./art/hero/battle_shield.webp","./art/hero/battle_sword.webp","./art/hero/battle_two.webp","./art/hero/battle_unarmed.webp","./art/hero/neutral.webp","./art/hero/sad.webp","./art/hero/serious.webp","./art/hero/smile.webp","./art/hero/surprised.webp","./art/loc/convenience_store.webp","./art/loc/home.webp","./art/loc/home_kitchen.webp","./art/loc/hunter_shop.webp","./art/loc/map_night.webp","./art/loc/market.webp","./art/loc/pc_bang.webp","./art/loc/riverside.webp","./art/loc/school.webp","./art/loc/street.webp","./art/loc/study_room.webp","./art/mon/P495-001.webp","./art/mon/P495-002.webp","./art/mon/P495-003.webp","./art/mon/P495-004.webp","./art/mon/P495-005.webp","./art/mon/P495-006.webp","./art/mon/P495-007.webp","./art/mon/P495-008.webp","./art/mon/P495-051.webp","./art/mon/P495-052.webp","./art/mon/P495-053.webp","./art/mon/P495-054.webp","./art/mon/P495-055.webp","./art/mon/P495-056.webp","./art/mon/P495-057.webp","./art/mon/P495-058.webp","./art/mon/P495-101.webp","./art/mon/P495-102.webp","./art/mon/P495-103.webp","./art/mon/P495-104.webp","./art/mon/P495-105.webp","./art/mon/P495-106.webp","./art/mon/P495-107.webp","./art/mon/P495-108.webp","./art/mon/P495-151.webp","./art/mon/P495-152.webp","./art/mon/P495-153.webp","./art/mon/P495-154.webp","./art/mon/P495-155.webp","./art/mon/P495-156.webp","./art/mon/P495-157.webp","./art/mon/P495-158.webp","./art/mon/P495-201.webp","./art/mon/P495-202.webp","./art/mon/P495-203.webp","./art/mon/P495-204.webp","./art/mon/P495-205.webp","./art/mon/P495-206.webp","./art/mon/P495-207.webp","./art/mon/P495-208.webp","./art/mon/P495-251.webp","./art/mon/P495-252.webp","./art/mon/P495-253.webp","./art/mon/P495-254.webp","./art/mon/P495-255.webp","./art/mon/P495-256.webp","./art/mon/P495-257.webp","./art/mon/P495-258.webp","./art/mon/P495-259.webp","./art/mon/P495-304.webp","./art/mon/P495-305.webp","./art/mon/P495-306.webp","./art/mon/P495-307.webp","./art/mon/P495-308.webp","./art/mon/P495-312.webp","./art/mon/P495-314.webp","./art/mon/P495-350.webp","./art/mon/P495-351.webp","./art/mon/P495-352.webp","./art/mon/P495-353.webp","./art/mon/P495-354.webp","./art/mon/P495-355.webp","./art/mon/P495-356.webp","./art/mon/P495-357.webp","./art/mon/P495-400.webp","./art/mon/P495-401.webp","./art/mon/P495-402.webp","./art/mon/P495-403.webp","./art/mon/P495-404.webp","./art/mon/P495-405.webp","./art/mon/P495-406.webp","./art/mon/P495-407.webp","./art/mon/P495-450.webp","./art/mon/P495-451.webp","./art/mon/P495-452.webp","./art/mon/P495-453.webp","./art/mon/P495-454.webp","./art/npc/junho_c1_0.webp","./art/npc/junho_c1_1.webp","./art/npc/junho_c1_2.webp","./art/npc/junho_c1_3.webp","./art/npc/junho_c1_4.webp","./art/npc/junho_c2_0.webp","./art/npc/junho_c2_1.webp","./art/npc/junho_c2_2.webp","./art/npc/junho_c2_3.webp","./art/npc/junho_c2_4.webp","./art/npc/junho_c3_0.webp","./art/npc/junho_c3_1.webp","./art/npc/junho_c3_2.webp","./art/npc/junho_c3_3.webp","./art/npc/junho_c3_4.webp","./art/npc/junho_c4_0.webp","./art/npc/junho_c4_1.webp","./art/npc/junho_c4_2.webp","./art/npc/junho_c4_3.webp","./art/npc/junho_c4_4.webp","./art/npc/junho_school_0.webp","./art/npc/junho_school_1.webp","./art/npc/junho_school_2.webp","./art/npc/junho_school_3.webp","./art/npc/junho_school_4.webp","./art/npc/s02_0.webp","./art/npc/s02_1.webp","./art/npc/s02_2.webp","./art/npc/s02_3.webp","./art/npc/s02_4.webp","./art/npc/s04_0.webp","./art/npc/s04_1.webp","./art/npc/s04_2.webp","./art/npc/s04_3.webp","./art/npc/s04_4.webp","./art/npc/s06_0.webp","./art/npc/s06_1.webp","./art/npc/s06_2.webp","./art/npc/s06_3.webp","./art/npc/s06_4.webp","./art/npc/s07_0.webp","./art/npc/s07_1.webp","./art/npc/s07_2.webp","./art/npc/s07_3.webp","./art/npc/s07_4.webp","./art/npc/s09_0.webp","./art/npc/s09_1.webp","./art/npc/s09_2.webp","./art/npc/s09_3.webp","./art/npc/s09_4.webp","./art/npc/s11_0.webp","./art/npc/s11_1.webp","./art/npc/s11_2.webp","./art/npc/s11_3.webp","./art/npc/s11_4.webp","./art/npc/s13_0.webp","./art/npc/s13_1.webp","./art/npc/s13_2.webp","./art/npc/s13_3.webp","./art/npc/s13_4.webp","./art/npc/s14_0.webp","./art/npc/s14_1.webp","./art/npc/s14_2.webp","./art/npc/s14_3.webp","./art/npc/s14_4.webp","./art/npc/s15_0.webp","./art/npc/s15_1.webp","./art/npc/s15_2.webp","./art/npc/s15_3.webp","./art/npc/s15_4.webp","./art/npc/s16_0.webp","./art/npc/s16_1.webp","./art/npc/s16_2.webp","./art/npc/s16_3.webp","./art/npc/s16_4.webp","./art/npc/s17_0.webp","./art/npc/s17_1.webp","./art/npc/s17_2.webp","./art/npc/s17_3.webp","./art/npc/s17_4.webp","./art/npc/s18_0.webp","./art/npc/s18_1.webp","./art/npc/s18_2.webp","./art/npc/s18_3.webp","./art/npc/s18_4.webp","./art/npc/s19_0.webp","./art/npc/s19_1.webp","./art/npc/s19_2.webp","./art/npc/s19_3.webp","./art/npc/s19_4.webp","./art/npc/s20_0.webp","./art/npc/s20_1.webp","./art/npc/s20_2.webp","./art/npc/s20_3.webp","./art/npc/s20_4.webp","./art/npc/s21_0.webp","./art/npc/s21_1.webp","./art/npc/s21_2.webp","./art/npc/s21_3.webp","./art/npc/s21_4.webp","./art/npc/s22_0.webp","./art/npc/s22_1.webp","./art/npc/s22_2.webp","./art/npc/s22_3.webp","./art/npc/s22_4.webp","./art/npc/s23_0.webp","./art/npc/s23_1.webp","./art/npc/s23_2.webp","./art/npc/s23_3.webp","./art/npc/s23_4.webp","./art/npc/s24_0.webp","./art/npc/s24_1.webp","./art/npc/s24_2.webp","./art/npc/s24_3.webp","./art/npc/s24_4.webp","./art/npc/s26_0.webp","./art/npc/s26_1.webp","./art/npc/s26_2.webp","./art/npc/s26_3.webp","./art/npc/s26_4.webp","./art/npc/s27_0.webp","./art/npc/s27_1.webp","./art/npc/s27_2.webp","./art/npc/s27_3.webp","./art/npc/s27_4.webp","./art/npc/s28_0.webp","./art/npc/s28_1.webp","./art/npc/s28_2.webp","./art/npc/s28_3.webp","./art/npc/s28_4.webp","./art/npc/s29_0.webp","./art/npc/s29_1.webp","./art/npc/s29_2.webp","./art/npc/s29_3.webp","./art/npc/s29_4.webp","./art/npc/s31_0.webp","./art/npc/s31_1.webp","./art/npc/s31_2.webp","./art/npc/s31_3.webp","./art/npc/s31_4.webp","./art/ui/system_frame.webp","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./index.html","./style.css","./manifest.webmanifest","./pwa-register.js"];
const CORE = ['./', './index.html', './style.css', './engine/app.js', './pwa-register.js'];
const LIVE = new Set(['', 'index.html', 'style.css', 'engine/app.js', 'pwa-register.js']);
function urlOf(path) { return new URL(path, self.registration.scope).href; }

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Don't block activation on hundreds of images or a single unavailable asset.
    await Promise.all(CORE.map(async path => {
      try {
        const response = await fetch(urlOf(path), {cache:'reload'});
        if (response.ok) await cache.put(urlOf(path), response);
      } catch (_) { /* Offline: previous cache remains available. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  // Old caches remain as offline fallback until the new full cache is complete.
  event.waitUntil(self.clients.claim());
});

let caching = null;
async function cacheAll() {
  if (caching) return caching;
  caching = (async () => {
    const cache = await caches.open(CACHE);
    let count = 0;
    for (const path of ASSETS) {
      const u = urlOf(path);
      try {
        let cached = await cache.match(u, {ignoreSearch:true});
        if (!cached && !LIVE.has(path.replace(/^\.\//,''))) {
          // Copy large unchanged art files from the former offline cache first.
          cached = await caches.match(u, {ignoreSearch:true});
          if (cached) await cache.put(u,cached);
        }
        if (!cached) {
          const res = await fetch(u, {cache:'reload'});
          if (res.ok) { await cache.put(u,res); cached=res; }
        }
        if (cached) count++;
      } catch (_) { /* Keep previous cache on partial network failure. */ }
    }
    const complete = count === ASSETS.length;
    if (complete) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('zerowing-offline-') && k !== CACHE).map(k => caches.delete(k)));
    }
    const clients = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of clients) client.postMessage({type:'ZW_OFFLINE_STATUS',cached:count,total:ASSETS.length,complete});
  })();
  try { return await caching; } finally { caching = null; }
}
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'ZW_CACHE_ALL') event.waitUntil(cacheAll());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname)) return;
  const path = u.pathname.slice(scope.pathname.length);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (LIVE.has(path)) {
      // The old cache-first approach kept delivering 14px banner styles on iOS.
      try {
        const response = await fetch(req, {cache:'no-store'});
        if (response.ok) await cache.put(req,response.clone());
        return response;
      } catch (_) { /* Continue with offline cache. */ }
    }
    const hit = await cache.match(req, {ignoreSearch:true}) || await caches.match(req, {ignoreSearch:true});
    if (hit) return hit;
    const response = await fetch(req);
    if (response.ok) await cache.put(req,response.clone());
    return response;
  })());
});

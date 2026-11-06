// PWA: refresh offline assets and make new releases visible on iOS.
(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloaded) return;
    reloaded = true;
    // Existing game saves are persisted; reload to pick up newly activated JS/CSS.
    location.reload();
  });
  window.addEventListener('load', async function () {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', {
        scope: './', updateViaCache: 'none'
      });
      // A previous cache-first worker can still serve stale game files until this update.
      await registration.update();
      const ready = await navigator.serviceWorker.ready;
      const worker = navigator.serviceWorker.controller || ready.active;
      if (worker) worker.postMessage({type:'ZW_CACHE_ALL'});
    } catch (e) {
      console.warn('PWA unavailable:', e);
    }
  });
})();

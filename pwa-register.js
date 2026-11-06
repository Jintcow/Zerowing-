// PWA is optional: game works normally if SW is unsupported.
(function(){
 if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
 window.addEventListener('load', function(){
  navigator.serviceWorker.register('./service-worker.js', {scope:'./'}).catch(function(err){console.warn('PWA offline cache unavailable',err);});
 });
})();

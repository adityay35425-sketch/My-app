/* VIDYAVERSE service worker
   - Online: always loads the newest index.html (so your edits reach everyone)
   - Offline: opens the last saved copy, so Game Space and the app still work */
var CACHE = 'vv-app-v1';
var PAGE = './index.html';

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return fetch(PAGE, { cache: 'no-cache' }).then(function (r) {
        if (r && r.ok) return c.put(PAGE, r);
      }).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function withTimeout(p, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    p.then(function (v) { clearTimeout(t); resolve(v); }, function (err) { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  /* the app page: network first, saved copy when offline or very slow */
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith((async function () {
      var cache = await caches.open(CACHE);
      var netP = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
        if (r && r.ok) cache.put(PAGE, r.clone());
        return r;
      });
      netP.catch(function () {});
      try {
        var net = await withTimeout(netP, 4500);
        if (net && net.ok && !net.redirected) return net;
        if (net && net.ok) return net;
      } catch (err) {}
      var hit = await cache.match(PAGE);
      return hit || Response.error();
    })());
    return;
  }

  /* Google Fonts: keep a copy so text looks the same offline */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async function (c) {
      var hit = await c.match(req);
      var net = fetch(req).then(function (r) {
        if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
        return r;
      }).catch(function () { return hit; });
      return hit || net;
    }));
    return;
  }

  /* other files from the same site (icon etc.): network first, then saved copy */
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(function (r) {
        if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return r;
      }).catch(function () { return caches.match(req); })
    );
  }
});

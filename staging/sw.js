// Service worker minimal : coquille applicative (HTML/JS/manifest/logos) + catalogues statiques
// (immos.json, employes.json) en cache pour un usage dégradé hors-ligne — l'app s'ouvre et
// affiche les dernières données connues au lieu d'une page d'erreur du navigateur. Ne met PAS en
// file d'attente les actions (scan, réservation, transfert...) : celles-ci nécessitent le Worker
// en direct et échouent proprement (toast "Erreur réseau") si hors-ligne, comme avant. Voir
// 04_HISTORIQUE_DECISIONS.md pour le périmètre choisi.
// v2 (août 2026) : ajout de design-system.css (palette/typo partagée avec dashboard.html) et de
// style.css (coquille visuelle déjà existante mais jamais explicitement mise en cache jusqu'ici)
// à la coquille applicative — voir 04_HISTORIQUE_DECISIONS.md.
const CACHE_VERSION = 'v2';
const CACHE_NAME = 'immo-tracker-' + CACHE_VERSION;
const APP_SHELL = ['./', './index.html', './app.js', './style.css', './design-system.css', './manifest.json', './immos.json', './employes.json', './logo.jpg', './logo-icon.jpg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(APP_SHELL.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Ne jamais intercepter les appels au Worker (données live : réservations, immos en circulation,
  // etc.) — uniquement l'app shell et les catalogues JSON statiques servis par GitHub Pages.
  if (url.origin !== self.location.origin || req.method !== 'GET') return;

  const isDataFile = url.pathname.endsWith('immos.json') || url.pathname.endsWith('employes.json');

  if (isDataFile) {
    // Stale-while-revalidate : sert le cache immédiatement (rapide), rafraîchit en arrière-plan.
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => cache.match(req).then(cached => {
        const network = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
        return cached || network;
      }))
    );
    return;
  }

  // App shell : réseau d'abord (fraîcheur à chaque déploiement), cache en repli si hors-ligne.
  event.respondWith(
    fetch(req).then(res => {
      // clone() DOIT être appelé avant tout passage asynchrone (ex. caches.open() qui n'est pas
      // encore résolu) — sinon le corps de la réponse peut déjà être en cours de lecture par le
      // navigateur au moment où clone() s'exécute, d'où "Response body is already used".
      if (res.ok) {
        const resPourCache = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resPourCache));
      }
      return res;
    }).catch(() =>
      caches.match(req).then(cached => cached || caches.match('./index.html'))
    )
  );
});

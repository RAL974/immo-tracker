// Charge le vrai worker.js dans Node, sans jamais toucher le réseau ni SharePoint.
// worker.js utilise la syntaxe "Service Worker" (addEventListener('fetch', ...)), qui n'existe
// pas en Node — on stub juste assez pour que le chargement du fichier ne plante pas. Le contenu
// business exporté (signSessionWith, requireAdminWith, ...) est du pur JS, testable directement.
'use strict';
const path = require('node:path');

function loadWorker() {
  if (typeof global.addEventListener !== 'function') {
    global.addEventListener = () => {}; // handleRequest() lui-même n'est pas testé ici, juste les fonctions pures exportées
  }
  const workerPath = path.join(__dirname, '..', '..', 'worker.js');
  delete require.cache[require.resolve(workerPath)];
  return require(workerPath);
}

module.exports = { loadWorker };

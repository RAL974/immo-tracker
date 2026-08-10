// Vérifie que staging/ est bien un miroir à jour des fichiers racine (voir scripts/sync-staging.js).
// Appelé par "npm run check" : un push qui touche index.html/dashboard.html/app.js/... sans avoir
// relancé "npm run sync:staging" doit échouer ici plutôt que de laisser l'environnement de recette
// dériver silencieusement du code réellement en prod.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { FILES_TO_SYNC, STAGING_DIR, ROOT } = require('./sync-staging');

let drift = [];
for (const file of FILES_TO_SYNC) {
  const src = path.join(ROOT, file);
  const dest = path.join(STAGING_DIR, file);
  if (!fs.existsSync(dest)) { drift.push(file + ' (absent de staging/)'); continue; }
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dest);
  if (!a.equals(b)) drift.push(file + ' (différent de la racine)');
}

if (drift.length) {
  console.error('staging/ n\'est plus synchronisé avec la racine — lancez "npm run sync:staging" puis committez :');
  drift.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log('staging/ : miroir à jour (' + FILES_TO_SYNC.length + ' fichier(s) vérifié(s)).');

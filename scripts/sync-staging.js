// Synchronise le dossier staging/ (front-end de recette) avec les fichiers racine — copie
// octet pour octet, jamais éditée à la main. Le dossier staging/ n'existe que pour être servi à
// une URL différente (/immo-tracker/staging/) ; le code lui-même est identique à la prod, seule
// la détection du chemin (IS_RECETTE dans app.js/dashboard.html) change le Worker/les données
// utilisés. À exécuter avant chaque commit qui touche un des fichiers listés ci-dessous — voir
// scripts/check-staging-sync.js (appelé par "npm run check") qui échoue si on l'a oublié.
//
// Volontairement PAS synchronisés (doivent rester distincts de la prod) :
//   - manifest.json  (start_url et nom différents, pour ne jamais confondre une PWA installée)
//   - immos.json / employes.json (catalogues FICTIFS de recette, jamais les vraies données)
//
// Usage : node scripts/sync-staging.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STAGING_DIR = path.join(ROOT, 'staging');

const FILES_TO_SYNC = [
  'index.html',
  'dashboard.html',
  'app.js',
  'style.css',
  'design-system.css',
  'sw.js',
  'logo.jpg',
  'logo-icon.jpg',
  'logo-dark.jpg',
];

function sync() {
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
  let copied = 0;
  for (const file of FILES_TO_SYNC) {
    const src = path.join(ROOT, file);
    const dest = path.join(STAGING_DIR, file);
    if (!fs.existsSync(src)) {
      console.error('Fichier source introuvable, sync annulée : ' + file);
      process.exit(1);
    }
    fs.copyFileSync(src, dest);
    copied++;
  }
  console.log('staging/ synchronisé (' + copied + ' fichier(s)).');
}

if (require.main === module) sync();
module.exports = { FILES_TO_SYNC, STAGING_DIR, ROOT };

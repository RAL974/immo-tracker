// Vérifie les fonctions pures de la palette de commande (recherche globale, dashboard.html) :
// normalisation d'accents/casse, matching multi-mots ("epi hist" → "EPI › Historique"), et le
// contenu de NAV_INDEX. Extraction du bloc concerné puis évaluation isolée dans un contexte vm —
// même principe que scripts/check-dashboard.js (dashboard.html n'est pas un module Node), mais ici
// on exécute réellement le code plutôt que de ne vérifier que sa syntaxe.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// \r\n -> \n : un checkout Windows (core.autocrlf=true) peut convertir dashboard.html en CRLF sur
// disque alors que le blob Git reste en LF — sans cette normalisation, les marqueurs multi-lignes
// ci-dessous (littéraux \n) ne matchent plus après un `git stash`/checkout frais, exactement comme
// le \r?\n déjà utilisé pour la même raison dans tests/security.gated-actions.test.js.
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8').replace(/\r\n/g, '\n');

function extractBetween(src, startMarker, endMarker, label) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`Marqueur de début introuvable pour ${label}: ${startMarker}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`Marqueur de fin introuvable pour ${label}: ${endMarker}`);
  return src.slice(start, end + endMarker.length);
}

// Le bloc GS_DIACRITICS_RE + gsNormalize + gsMatchesTokens est autonome (aucune dépendance au DOM
// ni à des données chargées) — extrait tel quel entre ses deux marqueurs de commentaire.
const pureBlock = extractBetween(
  dashboardSrc,
  "var GS_DIACRITICS_RE=",
  '\nfunction gsMatchesTokens(searchText,tokens){\n  var norm=gsNormalize(searchText);\n  for(var i=0;i<tokens.length;i++){if(norm.indexOf(tokens[i])===-1)return false;}\n  return true;\n}',
  'gsNormalize/gsMatchesTokens'
);

// NAV_INDEX est un littéral de tableau autonome (aucun appel de fonction, aucune dépendance) —
// extrait entre sa déclaration et le "];" qui le termine.
const navIndexBlock = extractBetween(dashboardSrc, 'var NAV_INDEX=[', '\n];', 'NAV_INDEX');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(pureBlock + '\n' + navIndexBlock + '\n', sandbox, { filename: 'dashboard.html (recherche globale, extrait)' });

const { gsNormalize, gsMatchesTokens, NAV_INDEX } = sandbox;

test('gsNormalize supprime les accents et met en majuscules', () => {
  assert.equal(gsNormalize('ANAPOTÉLIVOUA'), 'ANAPOTELIVOUA');
  assert.equal(gsNormalize('anapotélivoua'), 'ANAPOTELIVOUA');
  assert.equal(gsNormalize('Maël'), 'MAEL');
  assert.equal(gsNormalize('  espaces  '), 'ESPACES');
});

test('gsNormalize gère les entrées vides/nulles sans lever', () => {
  assert.equal(gsNormalize(''), '');
  assert.equal(gsNormalize(null), '');
  assert.equal(gsNormalize(undefined), '');
  assert.equal(gsNormalize(123), '123');
});

test('gsMatchesTokens : correspondance simple insensible à la casse et aux accents', () => {
  const tokens = gsNormalize('anapotelivoua').split(/\s+/).filter(Boolean);
  assert.equal(gsMatchesTokens('ANAPOTÉLIVOUA Jean', tokens), true);
  assert.equal(gsMatchesTokens('Quelqu\'un d\'autre', tokens), false);
});

test('gsMatchesTokens : tous les mots doivent être présents, ordre indifférent', () => {
  const tokens = gsNormalize('epi hist').split(/\s+/).filter(Boolean);
  assert.equal(gsMatchesTokens('EPI › Historique', tokens), true);
  // Ordre inverse des mots dans la recherche : doit matcher quand même.
  const tokensInverses = gsNormalize('hist epi').split(/\s+/).filter(Boolean);
  assert.equal(gsMatchesTokens('EPI › Historique', tokensInverses), true);
  // Un seul des deux mots présent : ne doit pas matcher.
  assert.equal(gsMatchesTokens('EPI › Stock', tokens), false);
  assert.equal(gsMatchesTokens('Prime d\'outillage › Historique', tokens), false);
});

test('gsMatchesTokens : chaîne de recherche vide (aucun token) matche tout', () => {
  assert.equal(gsMatchesTokens('IM000123', []), true);
});

test('NAV_INDEX : "epi hist" retrouve bien l\'entrée EPI › Historique', () => {
  const tokens = gsNormalize('epi hist').split(/\s+/).filter(Boolean);
  const matches = NAV_INDEX.filter((n) => gsMatchesTokens(n.label, tokens));
  assert.ok(matches.some((n) => n.tab === 'epi' && n.vue === 'historique'),
    'attendu : au moins une entrée NAV_INDEX pointant vers epi/historique');
});

test('NAV_INDEX : chaque entrée a un tab, et les entrées avec sous-vue ont vueVar+vue', () => {
  assert.ok(Array.isArray(NAV_INDEX) && NAV_INDEX.length > 0);
  for (const entry of NAV_INDEX) {
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.label.length > 0);
    assert.equal(typeof entry.tab, 'string');
    assert.ok(entry.tab.length > 0);
    if (entry.vueVar || entry.vue) {
      assert.equal(typeof entry.vueVar, 'string');
      assert.equal(typeof entry.vue, 'string');
    }
  }
});

test('NAV_INDEX : le Journal d\'audit est marqué adminOnly (caché aux non-admins comme dans la sidebar)', () => {
  const journal = NAV_INDEX.find((n) => n.tab === 'journal');
  assert.ok(journal, 'entrée "journal" attendue dans NAV_INDEX');
  assert.equal(journal.adminOnly, true);
});

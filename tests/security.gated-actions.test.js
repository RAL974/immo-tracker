// Garde-fou anti-régression : la liste des actions protégées côté Worker (requireAdmin/requireGarant)
// doit rester exactement synchronisée avec GATED_ACTIONS côté dashboard.html (qui injecte le
// jeton). Sans ce test, quelqu'un pourrait ajouter une nouvelle action sensible d'un côté et
// oublier l'autre — exactement le genre d'oubli qui a permis la faille initiale (voir
// "Autorisation côté serveur" dans 03_REGLES_METIER_ET_ROLES.md).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadWorker } = require('./helpers/loadWorker');

global.CLIENT_SECRET_ENV = global.CLIENT_SECRET_ENV || 'fake-client-secret';
global.SESSION_SECRET_ENV = global.SESSION_SECRET_ENV || 'fake-session-secret';
const W = loadWorker();

const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

// Actions volontairement non protégées par ce mécanisme : verify_password/set_password sont le
// point d'ENTRÉE qui produit le jeton (il ne peut pas déjà en exiger un), et les actions
// partagées avec la PWA terrain (badge sans mot de passe) suivent un autre modèle de confiance.
const PWA_SHARED_ACTIONS = new Set(['declarer_panne', 'declarer_vol', 'delete_photo', 'modifier_resa', 'reserver', 'resoudre_panne', 'signaler_absence', 'statut_resa', 'supprimer_ligne_inventaire', 'transfert', 'upload_photo', 'valider', 'ajouter_ligne_inventaire', 'enregistrer_scan_inventaire_immo', 'creer_retour_direct_garant', 'sortie_stock_brasseur_pwa', 'transfert_stock_brasseur_pwa', 'upload_fiche_brasseur']);
const LOGIN_ACTIONS = new Set(['verify_password', 'set_password']);

function extractWorkerProtectedActions(src) {
  const protectedActions = new Set();
  const unprotectedDashboardActions = new Set();
  // Repère chaque bloc "if (action === 'xxx') {" et regarde si la ligne suivante appelle le garde.
  // \r?\n (pas \n seul) : tolère un checkout Windows en CRLF (core.autocrlf=true) — le blob Git
  // reste en LF, seul le fichier sur disque local peut avoir \r\n, sinon 0 bloc n'est détecté.
  const re = /if \(action === '([a-z_]+)'\) \{\r?\n([^\r\n]*)\r?\n/g;
  let m;
  while ((m = re.exec(src))) {
    const action = m[1];
    const nextLine = m[2];
    if (/requireAdmin\(body\)|requireGarant\(body\)/.test(nextLine)) {
      protectedActions.add(action);
    } else if (!LOGIN_ACTIONS.has(action) && !PWA_SHARED_ACTIONS.has(action)) {
      unprotectedDashboardActions.add(action);
    }
  }
  return { protectedActions, unprotectedDashboardActions };
}

function extractGatedActionsFromDashboard(src) {
  const m = src.match(/var GATED_ACTIONS=\[([^\]]*)\];/);
  assert.ok(m, "GATED_ACTIONS introuvable dans dashboard.html — le format a-t-il changé ?");
  return new Set(m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean));
}

test('toutes les actions worker.js protégées par requireAdmin/requireGarant figurent dans GATED_ACTIONS (dashboard.html)', () => {
  const { protectedActions } = extractWorkerProtectedActions(workerSrc);
  const gated = extractGatedActionsFromDashboard(dashboardSrc);
  const missing = [...protectedActions].filter(a => !gated.has(a));
  assert.deepEqual(missing, [], 'Actions protégées côté Worker mais absentes de GATED_ACTIONS (le jeton ne serait jamais envoyé) : ' + missing.join(', '));
});

test('toutes les entrées de GATED_ACTIONS (dashboard.html) sont bien protégées côté Worker', () => {
  const { protectedActions } = extractWorkerProtectedActions(workerSrc);
  const gated = extractGatedActionsFromDashboard(dashboardSrc);
  const extra = [...gated].filter(a => !protectedActions.has(a));
  assert.deepEqual(extra, [], "Actions dans GATED_ACTIONS mais sans garde côté Worker (le jeton serait envoyé pour rien) : " + extra.join(', '));
});

test("aucune action partagée avec la PWA terrain (badge sans mot de passe) n'est protégée par erreur", () => {
  const { protectedActions } = extractWorkerProtectedActions(workerSrc);
  const wronglyProtected = [...PWA_SHARED_ACTIONS].filter(a => protectedActions.has(a));
  assert.deepEqual(wronglyProtected, [], 'Ces actions sont utilisées par la PWA sans connexion — les protéger casserait le scan de badge pour les 97 collaborateurs terrain : ' + wronglyProtected.join(', '));
});

// ── Journal d'audit (ajouté août 2026) : GATED_ACTIONS_AUDIT (worker.js) doit rester le même
// périmètre EXACT que GATED_ACTIONS_AUDIT (worker.js) === actions protégées (worker.js) ===
// GATED_ACTIONS (dashboard.html) — sinon une action sensible pourrait être ajoutée sans jamais être
// journalisée, ou le journal pourrait tenter de logger une action qui n'existe pas côté dashboard.
test('GATED_ACTIONS_AUDIT (worker.js, utilisée par le journal d\'audit) reste synchronisée avec GATED_ACTIONS (dashboard.html)', () => {
  const gatedDashboard = extractGatedActionsFromDashboard(dashboardSrc);
  const gatedAudit = W.GATED_ACTIONS_AUDIT;
  assert.ok(gatedAudit instanceof Set, 'GATED_ACTIONS_AUDIT doit être exporté par worker.js (module.exports)');
  const missingFromAudit = [...gatedDashboard].filter(a => !gatedAudit.has(a));
  const extraInAudit = [...gatedAudit].filter(a => !gatedDashboard.has(a));
  assert.deepEqual(missingFromAudit, [], 'Actions dans GATED_ACTIONS (dashboard) mais absentes de GATED_ACTIONS_AUDIT (worker) — ne seraient jamais journalisées : ' + missingFromAudit.join(', '));
  assert.deepEqual(extraInAudit, [], 'Actions dans GATED_ACTIONS_AUDIT (worker) mais absentes de GATED_ACTIONS (dashboard) — n\'existent pas côté client : ' + extraInAudit.join(', '));
});

test('GATED_ACTIONS_AUDIT (worker.js) reste synchronisée avec les actions réellement protégées requireAdmin/requireGarant', () => {
  const { protectedActions } = extractWorkerProtectedActions(workerSrc);
  const gatedAudit = W.GATED_ACTIONS_AUDIT;
  const missingFromAudit = [...protectedActions].filter(a => !gatedAudit.has(a));
  const extraInAudit = [...gatedAudit].filter(a => !protectedActions.has(a));
  assert.deepEqual(missingFromAudit, [], 'Actions gated côté Worker mais absentes de GATED_ACTIONS_AUDIT : ' + missingFromAudit.join(', '));
  assert.deepEqual(extraInAudit, [], 'Actions dans GATED_ACTIONS_AUDIT mais non gated côté Worker : ' + extraInAudit.join(', '));
});

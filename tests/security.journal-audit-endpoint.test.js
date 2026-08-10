// Garde-fou anti-régression pour l'endpoint de lecture ?journal_audit= (journal des actions
// sensibles, voir 03_REGLES_METIER_ET_ROLES.md). Comme ?export_liste=, c'est un endpoint GET en
// paramètre de requête — il ne passe jamais par le mécanisme GATED_ACTIONS/dispatchPost (réservé
// aux POST). Ce test vérifie donc explicitement qu'il reste protégé par requireAdmin, avec son
// propre garde-fou, et que ce n'est PAS une donnée de fonctionnement courant comme les ~35 autres
// endpoints GET publics.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

function extractJournalAuditBlock(src) {
  // \r?\n : tolère un checkout Windows en CRLF (core.autocrlf=true), voir security.gated-actions.test.js.
  const m = /if \(p\.get\('journal_audit'\) === '1'\) \{\r?\n([^\r\n]*)\r?\n/.exec(src);
  return m ? m[1] : null;
}

test("l'endpoint ?journal_audit=1 existe et vérifie requireAdmin avant toute lecture", () => {
  const firstLine = extractJournalAuditBlock(workerSrc);
  assert.ok(firstLine, "bloc \"if (p.get('journal_audit') === '1')\" introuvable dans worker.js");
  assert.match(firstLine, /requireAdmin\(/, "journal_audit doit appeler requireAdmin avant d'accéder à SharePoint — ce n'est pas une donnée de fonctionnement courant");
});

test('le dashboard appelle ?journal_audit=1 avec le jeton de session en paramètre d\'URL', () => {
  assert.match(dashboardSrc, /journal_audit=1/, 'aucun appel à ?journal_audit=1 trouvé dans dashboard.html');
  const idx = dashboardSrc.indexOf("W+'?journal_audit=1");
  assert.ok(idx !== -1, "l'appel doit être construit à partir de l'URL du Worker (variable W)");
  const region = dashboardSrc.slice(idx, idx + 200);
  assert.match(region, /ADMIN_SESSION\.token/, "le jeton de session (ADMIN_SESSION.token) doit être transmis dans l'URL — GATED_ACTIONS ne l'injecte pas ici (ce n'est pas un POST)");
});

test("journal_audit n'a pas été ajouté par erreur à GATED_ACTIONS (mécanisme réservé aux actions POST)", () => {
  const m = dashboardSrc.match(/var GATED_ACTIONS=\[([^\]]*)\];/);
  assert.ok(m, 'GATED_ACTIONS introuvable dans dashboard.html');
  const gated = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  assert.ok(!gated.includes('journal_audit'), "journal_audit est un GET, pas une action POST — l'ajouter à GATED_ACTIONS n'aurait aucun effet (le token ne serait jamais injecté)");
});

test('le nav-item Journal côté dashboard est masqué par défaut (visible seulement si estAdmin)', () => {
  assert.match(dashboardSrc, /id="nav-item-journal"[^>]*style="display:none"/, "le nav-item Journal doit démarrer caché (révélé par appliquerVisibiliteJournal(), voir dashboard.html)");
  assert.match(dashboardSrc, /function appliquerVisibiliteJournal\(\)/, 'appliquerVisibiliteJournal() introuvable — mécanisme de visibilité attendu, réutilisant estAdmin()');
});

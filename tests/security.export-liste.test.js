// Garde-fou anti-régression pour l'endpoint de sauvegarde ?export_liste (voir PROCEDURE_ROLLBACK.md).
// Contrairement aux actions POST couvertes par security.gated-actions.test.js (qui parse
// "if (action === 'xxx') {"), export_liste est un endpoint GET en paramètre de requête — il ne
// passe jamais par ce mécanisme ni par GATED_ACTIONS (qui n'intercepte que les POST). Ce test
// vérifie donc explicitement qu'il reste protégé par requireAdmin, avec son propre garde-fou.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

function extractExportListeBlock(src) {
  // \r?\n : tolère un checkout Windows en CRLF (core.autocrlf=true), voir security.gated-actions.test.js.
  const m = /if \(p\.get\('export_liste'\)\) \{\r?\n([^\r\n]*)\r?\n/.exec(src);
  return m ? m[1] : null;
}

test("l'endpoint ?export_liste existe et vérifie requireAdmin avant toute lecture", () => {
  const firstLine = extractExportListeBlock(workerSrc);
  assert.ok(firstLine, "bloc \"if (p.get('export_liste'))\" introuvable dans worker.js");
  assert.match(firstLine, /requireAdmin\(/, "export_liste doit appeler requireAdmin avant d'accéder à SharePoint, comme les actions gated existantes");
});

test("export_liste ne lit une liste que si elle figure dans une liste blanche (pas de nom Graph arbitraire)", () => {
  assert.match(workerSrc, /EXPORTABLE_LISTS/, "une liste blanche EXPORTABLE_LISTS est attendue à côté du bloc export_liste");
  const idx = workerSrc.indexOf("p.get('export_liste')");
  const region = workerSrc.slice(idx, idx + 1200);
  assert.match(region, /EXPORTABLE_LISTS\.indexOf\(nomListe\) === -1/, "le nom de liste demandé doit être vérifié contre EXPORTABLE_LISTS avant tout appel Graph");
});

test("le dashboard appelle ?export_liste avec le jeton de session en paramètre d'URL", () => {
  assert.match(dashboardSrc, /export_liste/, "aucun appel à ?export_liste trouvé dans dashboard.html");
  const idx = dashboardSrc.indexOf("W+'?export_liste=");
  assert.ok(idx !== -1, "l'appel doit être construit à partir de l'URL du Worker (variable W)");
  const region = dashboardSrc.slice(idx, idx + 200);
  assert.match(region, /ADMIN_SESSION\.token/, "le jeton de session (ADMIN_SESSION.token) doit être transmis dans l'URL — GATED_ACTIONS ne l'injecte pas ici (ce n'est pas un POST)");
});

test("export_liste n'a pas été ajouté par erreur à GATED_ACTIONS (mécanisme réservé aux actions POST)", () => {
  const m = dashboardSrc.match(/var GATED_ACTIONS=\[([^\]]*)\];/);
  assert.ok(m, 'GATED_ACTIONS introuvable dans dashboard.html');
  const gated = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  assert.ok(!gated.includes('export_liste'), "export_liste est un GET, pas une action POST — l'ajouter à GATED_ACTIONS n'aurait aucun effet (le token ne serait jamais injecté)");
});

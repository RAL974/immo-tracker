// Garde-fou anti-régression pour les endpoints GET ?materiel_it=1 et ?lignes_telephoniques=1.
// Ces deux endpoints renvoient des codes PIN/PUK/RIO/déverrouillage SIM réels (voir
// SECURITE_ETAT.md, audit du 9 août 2026) — une classe de sensibilité différente des autres
// endpoints GET publics du Worker (localisation d'immo, etc.). Contrairement aux actions POST
// couvertes par security.gated-actions.test.js, ce sont des GET en paramètre de requête : ils ne
// passent jamais par ce mécanisme ni par GATED_ACTIONS (qui n'intercepte que les POST), même
// principe que security.export-liste.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadWorker } = require('./helpers/loadWorker');

const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

function mockGraphFetch(t) {
  t.mock.method(global, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) return new Response(JSON.stringify({ value: [] }), { status: 200 });
    throw new Error('URL non mockée dans ce test : ' + u);
  });
}

function getRequest(qs) {
  return new Request('https://immo-proxy.test/?' + qs, { method: 'GET' });
}

['materiel_it', 'lignes_telephoniques'].forEach((param) => {
  test('static: le bloc ?' + param + '=1 appelle requireGarant avant tout accès Graph', () => {
    const idx = workerSrc.indexOf("p.get('" + param + "') === '1'");
    assert.ok(idx !== -1, "bloc \"p.get('" + param + "')\" introuvable dans worker.js");
    const region = workerSrc.slice(idx, idx + 300);
    assert.match(region, /requireGarant\(/, param + " doit appeler requireGarant avant d'accéder à SharePoint");
  });

  test('static: dashboard.html transmet le jeton de session en paramètre d\'URL pour ?' + param + '=1', () => {
    const idx = dashboardSrc.indexOf("?" + param + "=1");
    assert.ok(idx !== -1, 'aucun appel à ?' + param + '=1 trouvé dans dashboard.html');
    const region = dashboardSrc.slice(Math.max(0, idx - 200), idx + 300);
    assert.match(region, /ADMIN_SESSION\.token/, 'le jeton doit être transmis dans l\'URL (GET, GATED_ACTIONS ne s\'applique pas ici)');
  });

  test('intégration: ?' + param + '=1 sans jeton -> 401 session_invalide, rien lu', async (t) => {
    let readSharepoint = false;
    const W = loadWorker();
    t.mock.method(global, 'fetch', async (url) => {
      const u = String(url);
      if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
      if (u.includes('graph.microsoft.com')) { readSharepoint = true; return new Response(JSON.stringify({ value: [] }), { status: 200 }); }
      throw new Error('URL non mockée : ' + u);
    });
    const res = await W.handleRequest(getRequest(param + '=1'));
    const data = await res.json();
    assert.equal(res.status, 401);
    assert.equal(data.error, 'session_invalide');
    assert.equal(readSharepoint, false, 'aucune lecture SharePoint ne doit avoir lieu sans jeton valide');
  });

  test('intégration: ?' + param + '=1 avec un jeton de rôle non-garant -> 403 droits_insuffisants', async (t) => {
    mockGraphFetch(t);
    const W = loadWorker();
    const token = await W.signSessionWith('XXXX', 'CT', SESSION_SECRET);
    const res = await W.handleRequest(getRequest(param + '=1&token=' + token));
    const data = await res.json();
    assert.equal(res.status, 403);
    assert.equal(data.error, 'droits_insuffisants');
  });

  test('intégration: ?' + param + '=1 avec un jeton Logistique_Mayotte -> autorisé', async (t) => {
    mockGraphFetch(t);
    const W = loadWorker();
    const token = await W.signSessionWith('XXXX', 'Logistique_Mayotte', SESSION_SECRET);
    const res = await W.handleRequest(getRequest(param + '=1&token=' + token));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.notEqual(data.error, 'droits_insuffisants');
    assert.notEqual(data.error, 'session_invalide');
  });
});

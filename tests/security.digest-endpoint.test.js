// Garde-fou pour l'endpoint ?digest=1 (digest hebdomadaire, voir 01_ARCHITECTURE_TECHNIQUE.md).
// Contrairement aux actions POST couvertes par security.gated-actions.test.js, ?digest=1 est un GET
// en paramètre de requête protégé par un secret dédié (DIGEST_TOKEN_ENV, comparaison directe) plutôt
// que par un jeton de session HMAC (requireAdmin/requireGarant) — pas d'utilisateur connecté derrière
// un flux Power Automate planifié. Ce test vérifie le garde-fou de bout en bout, avec Microsoft Graph
// entièrement mocké (aucun appel réseau réel, aucune donnée SharePoint touchée).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadWorker } = require('./helpers/loadWorker');

const DIGEST_TOKEN = 'fake-digest-token';

function mockGraphFetch(t, { onCall } = {}) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (onCall) onCall(u, opts);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) return new Response(JSON.stringify({ value: [] }), { status: 200 });
    throw new Error('URL non mockée dans ce test : ' + u);
  });
}

function digestRequest(token) {
  const qs = token === undefined ? '?digest=1' : '?digest=1&token=' + encodeURIComponent(token);
  return new Request('https://immo-proxy.test/' + qs);
}

test('?digest=1 sans DIGEST_TOKEN_ENV configuré -> 500 digest_token_manquant', async (t) => {
  global.CLIENT_SECRET_ENV = 'fake-client-secret';
  global.SESSION_SECRET_ENV = 'fake-session-secret';
  global.DIGEST_TOKEN_ENV = '';
  const W = loadWorker();
  mockGraphFetch(t);
  const res = await W.handleRequest(digestRequest('peu-importe'));
  const data = await res.json();
  assert.equal(res.status, 500);
  assert.equal(data.error, 'digest_token_manquant');
});

test('?digest=1 avec un jeton incorrect -> 401 token_invalide, rien lu sur Graph au-delà du token', async (t) => {
  global.DIGEST_TOKEN_ENV = DIGEST_TOKEN;
  const W = loadWorker();
  let graphListRead = false;
  mockGraphFetch(t, { onCall: (u) => { if (u.includes('/Immos/items') || u.includes('/Mouvements/items')) graphListRead = true; } });
  const res = await W.handleRequest(digestRequest('mauvais-jeton'));
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data.error, 'token_invalide');
  assert.equal(graphListRead, false, 'aucune liste métier ne doit être lue si le jeton est invalide');
});

test('?digest=1 sans aucun paramètre token -> 401 token_invalide', async (t) => {
  global.DIGEST_TOKEN_ENV = DIGEST_TOKEN;
  const W = loadWorker();
  mockGraphFetch(t);
  const res = await W.handleRequest(digestRequest(undefined));
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data.error, 'token_invalide');
});

test('?digest=1 avec le bon jeton -> 200, digest vide sur des listes SharePoint vides', async (t) => {
  global.DIGEST_TOKEN_ENV = DIGEST_TOKEN;
  const W = loadWorker();
  let wroteToSharepoint = false;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('graph.microsoft.com') && opts && opts.method && opts.method !== 'GET') wroteToSharepoint = true; } });
  const res = await W.handleRequest(digestRequest(DIGEST_TOKEN));
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.digest.vide, true);
  assert.match(data.html, /Rien à signaler/);
  assert.equal(data.objet, 'Immo Tracker — Digest hebdomadaire : rien à signaler');
  assert.equal(wroteToSharepoint, false, '?digest=1 est un endpoint de lecture seule, aucune écriture SharePoint ne doit avoir lieu');
});

test('?digest=1 n\'a pas été ajouté par erreur à GATED_ACTIONS (mécanisme réservé aux actions POST)', () => {
  const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
  const m = dashboardSrc.match(/var GATED_ACTIONS=\[([^\]]*)\];/);
  assert.ok(m, 'GATED_ACTIONS introuvable dans dashboard.html');
  const gated = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  assert.ok(!gated.includes('digest'), "digest est un GET, pas une action POST — l'ajouter à GATED_ACTIONS n'aurait aucun effet (le token n'y serait jamais injecté, et le dashboard n'appelle de toute façon jamais cet endpoint)");
});

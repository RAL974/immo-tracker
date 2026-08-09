// En-têtes de sécurité des réponses du Worker (CORS resserré + en-têtes standards) — voir
// SECURITE_ETAT.md. Avant durcissement : Access-Control-Allow-Origin: '*' sur toutes les
// réponses, aucun autre en-tête de sécurité.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

function mockGraphFetch(t) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée dans ce test : ' + u);
  });
}

// ── Fonctions pures ──────────────────────────────────────────────────────────────────────────
test('corsOriginFor : reflète l\'origine GitHub Pages légitime', () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/', { headers: { Origin: 'https://ral974.github.io' } });
  assert.equal(W.corsOriginFor(req), 'https://ral974.github.io');
});

test('corsOriginFor : n\'échote PAS une origine tierce non autorisée', () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/', { headers: { Origin: 'https://site-pirate.example.com' } });
  const result = W.corsOriginFor(req);
  assert.notEqual(result, 'https://site-pirate.example.com', 'une origine non autorisée ne doit jamais être reflétée telle quelle');
});

test('corsOriginFor : ne renvoie jamais "*" (jamais de wildcard, même en repli)', () => {
  const W = loadWorker();
  const reqSansOrigin = new Request('https://immo-proxy.test/');
  const reqOrigineInconnue = new Request('https://immo-proxy.test/', { headers: { Origin: 'https://autre-site.example.com' } });
  assert.notEqual(W.corsOriginFor(reqSansOrigin), '*');
  assert.notEqual(W.corsOriginFor(reqOrigineInconnue), '*');
});

test('securityHeadersFor : présence des en-têtes standards attendus', () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/', { headers: { Origin: 'https://ral974.github.io' } });
  const h = W.securityHeadersFor(req);
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.ok(h['Content-Security-Policy']);
  assert.ok(h['Referrer-Policy']);
  assert.ok(h['Strict-Transport-Security']);
  assert.equal(h['Vary'], 'Origin');
});

// ── Intégration : en-têtes réellement posés sur une vraie réponse handleRequest() ──────────────
test('OPTIONS (préflight CORS) : origine légitime reflétée', async () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/?action=reserver', { method: 'OPTIONS', headers: { Origin: 'https://ral974.github.io' } });
  const res = await W.handleRequest(req);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://ral974.github.io');
});

test('OPTIONS (préflight CORS) : origine tierce non autorisée jamais reflétée', async () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/?action=reserver', { method: 'OPTIONS', headers: { Origin: 'https://site-pirate.example.com' } });
  const res = await W.handleRequest(req);
  assert.notEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://site-pirate.example.com');
  assert.notEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('une vraie réponse JSON (action reserver) porte les en-têtes de sécurité standards', async (t) => {
  mockGraphFetch(t);
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/?action=reserver', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ral974.github.io' },
    body: JSON.stringify({ code_im: 'IM000001', code_employe: 'ABCD', nom_employe: 'Test', date_debut: new Date().toISOString(), date_fin: new Date().toISOString() }),
  });
  const res = await W.handleRequest(req);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://ral974.github.io');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
});

// Endpoint ?noms_employes=1 — ajouté lors de la pseudonymisation d'employes.json (voir
// 04_HISTORIQUE_DECISIONS.md). Contrairement à ?employes=1, il est volontairement minimal
// ({code, nom} uniquement) et protégé par deux mécanismes best-effort (aucun jeton de session
// possible ici, la PWA terrain n'en a pas) : vérification de l'en-tête Origin et limitation de
// débit par IP. Deux familles de tests : les fonctions pures (Map en mémoire), puis le branchement
// réel dans handleRequest() avec Microsoft Graph entièrement mocké.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

// ── Fonctions pures ──────────────────────────────────────────────────────────────────────────
test('origineReconnue : accepte l\'origine GitHub Pages légitime', () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/', { headers: { Origin: 'https://ral974.github.io' } });
  assert.equal(W.origineReconnue(req), true);
});

test('origineReconnue : refuse une origine tierce', () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/', { headers: { Origin: 'https://site-pirate.example.com' } });
  assert.equal(W.origineReconnue(req), false);
});

test('origineReconnue : refuse une requête sans Origin ni Referer (visite directe d\'URL, script)', () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/');
  assert.equal(W.origineReconnue(req), false);
});

test('origineReconnue : accepte via Referer si Origin est absent', () => {
  const W = loadWorker();
  const req = new Request('https://immo-proxy.test/', { headers: { Referer: 'https://ral974.github.io/immo-tracker/dashboard.html' } });
  assert.equal(W.origineReconnue(req), true);
});

test('nomLookupRateLimited : pas de blocage avant le seuil', () => {
  const W = loadWorker();
  const ip = 'RATELIM-TEST-1';
  for (let i = 0; i < W.NOM_LOOKUP_MAX_PER_WINDOW; i++) {
    assert.equal(W.nomLookupRateLimited(ip), false, 'appel #' + (i + 1) + ' ne doit pas être bloqué');
  }
});

test('nomLookupRateLimited : bloqué au-delà du seuil, pour cette IP uniquement', () => {
  const W = loadWorker();
  const ip = 'RATELIM-TEST-2';
  const autreIp = 'RATELIM-TEST-2-AUTRE';
  for (let i = 0; i < W.NOM_LOOKUP_MAX_PER_WINDOW; i++) W.nomLookupRateLimited(ip);
  assert.equal(W.nomLookupRateLimited(ip), true, 'le seuil dépassé doit bloquer cette IP');
  assert.equal(W.nomLookupRateLimited(autreIp), false, 'une IP différente ne doit jamais être affectée');
});

test('clientIpFrom : lit CF-Connecting-IP en priorité, X-Forwarded-For en repli', () => {
  const W = loadWorker();
  const reqCf = new Request('https://immo-proxy.test/', { headers: { 'CF-Connecting-IP': '1.2.3.4', 'X-Forwarded-For': '9.9.9.9' } });
  assert.equal(W.clientIpFrom(reqCf), '1.2.3.4');
  const reqXff = new Request('https://immo-proxy.test/', { headers: { 'X-Forwarded-For': '5.6.7.8' } });
  assert.equal(W.clientIpFrom(reqXff), '5.6.7.8');
});

// ── Intégration : handleRequest() avec Microsoft Graph mocké ────────────────────────────────
function mockGraphFetchWithEmployes(t, employes) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET' && u.includes('/Employes/items')) {
        return new Response(JSON.stringify({ value: employes.map((e, idx) => ({ id: 'emp-' + idx, fields: e })) }), { status: 200 });
      }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée dans ce test : ' + u);
  });
}

function getRequest(qs, headers) {
  return new Request('https://immo-proxy.test/?' + qs, { method: 'GET', headers: headers || {} });
}

const ORIGIN_OK = { Origin: 'https://ral974.github.io' };

test('intégration: ?noms_employes=1 sans Origin/Referer reconnu -> 403, rien lu sur SharePoint', async (t) => {
  let readSharepoint = false;
  const W = loadWorker();
  t.mock.method(global, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) { readSharepoint = true; return new Response(JSON.stringify({ value: [] }), { status: 200 }); }
    throw new Error('URL non mockée : ' + u);
  });
  const res = await W.handleRequest(getRequest('noms_employes=1'));
  const data = await res.json();
  assert.equal(res.status, 403);
  assert.equal(data.error, 'origine_non_reconnue');
  assert.equal(readSharepoint, false, 'aucune lecture SharePoint sans origine reconnue');
});

test('intégration: ?noms_employes=1 avec une origine tierce -> 403, rien lu', async (t) => {
  let readSharepoint = false;
  const W = loadWorker();
  t.mock.method(global, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) { readSharepoint = true; return new Response(JSON.stringify({ value: [] }), { status: 200 }); }
    throw new Error('URL non mockée : ' + u);
  });
  const res = await W.handleRequest(getRequest('noms_employes=1', { Origin: 'https://site-pirate.example.com' }));
  assert.equal(res.status, 403);
  assert.equal(readSharepoint, false);
});

test('intégration: ?noms_employes=1 avec une origine reconnue -> 200, payload minimal {code,nom} seulement', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithEmployes(t, [
    { Title: 'AIWI', field_1: 'AIMAR William', Poste: 'Admin', Code_CT: 'Admin', Site: 'Reunion', field_2: 'Oui', MotDePasse: 'hash:secret' },
    { Title: 'CONI', field_1: 'COUTAREL Nicolas', Poste: 'Logistique', Code_CT: 'Logistique', Site: 'Reunion', field_2: 'Oui' },
  ]);
  const res = await W.handleRequest(getRequest('noms_employes=1', ORIGIN_OK));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.length, 2);
  const aiwi = data.find(e => e.code === 'AIWI');
  assert.equal(aiwi.nom, 'AIMAR William');
  // Le payload ne doit contenir QUE code et nom — pas poste/role/site/actif/has_password/mot de passe.
  assert.deepEqual(Object.keys(aiwi).sort(), ['code', 'nom']);
  assert.equal(JSON.stringify(data).includes('secret'), false, 'le hash de mot de passe ne doit jamais apparaître dans ce payload');
});

test('intégration: ?noms_employes=1 dédoublonne par code (garde la première occurrence non vide)', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithEmployes(t, [
    { Title: 'DUPL', field_1: 'PREMIER Nom' },
    { Title: 'DUPL', field_1: 'DOUBLON Nom' },
  ]);
  const res = await W.handleRequest(getRequest('noms_employes=1', ORIGIN_OK));
  const data = await res.json();
  const entries = data.filter(e => e.code === 'DUPL');
  assert.equal(entries.length, 1, 'un seul enregistrement par code');
});

test('intégration: ?noms_employes=1 -> 429 après dépassement du seuil par IP, IP différente non affectée', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithEmployes(t, [{ Title: 'RLINT1', field_1: 'Test Nom' }]);
  const headersA = { ...ORIGIN_OK, 'CF-Connecting-IP': 'IP-INTEGRATION-A' };
  const headersB = { ...ORIGIN_OK, 'CF-Connecting-IP': 'IP-INTEGRATION-B' };
  let lastRes;
  for (let i = 0; i <= W.NOM_LOOKUP_MAX_PER_WINDOW; i++) {
    lastRes = await W.handleRequest(getRequest('noms_employes=1', headersA));
  }
  assert.equal(lastRes.status, 429);
  const lastData = await lastRes.json();
  assert.equal(lastData.error, 'trop_de_requetes');
  const resB = await W.handleRequest(getRequest('noms_employes=1', headersB));
  assert.equal(resB.status, 200, 'une IP différente ne doit pas être affectée par le verrou de la première');
});

test('intégration: ?noms_employes=1 porte les en-têtes de sécurité standards', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithEmployes(t, []);
  const res = await W.handleRequest(getRequest('noms_employes=1', ORIGIN_OK));
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://ral974.github.io');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});

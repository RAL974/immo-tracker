// Limitation de débit sur les tentatives de mot de passe (verify_password / set_password ancien
// mot de passe) — voir SECURITE_ETAT.md et le commentaire au-dessus de LOGIN_ATTEMPTS dans
// worker.js. Trois familles de tests : les fonctions pures du verrou en mémoire (Map), le
// verrou persistant via Cloudflare KV (mocké — paliers, persistance simulée entre "isolates",
// repli mémoire si KV échoue, scope limité à verify_password), puis le branchement réel dans
// handleRequest() via Microsoft Graph entièrement mocké.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

// ── Mock KV (namespace Cloudflare Workers KV) ────────────────────────────────────────────────
// Un vrai binding KV expose get/put/delete asynchrones — suffisant à mocker sans dépendance
// externe. `createMockKv()` simule un namespace qui fonctionne normalement ; son `_store` est
// délibérément exposé (objet Map partagé) pour simuler la persistance ENTRE deux "isolates"
// Cloudflare : on réutilise la même instance de mock à travers plusieurs `loadWorker()` (qui,
// lui, réinitialise LOGIN_ATTEMPTS à chaque appel, simulant un isolate recyclé côté mémoire).
function createMockKv() {
  const store = new Map();
  return {
    _store: store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
  };
}
// Simule un binding KV provisionné mais indisponible (quota dépassé, incident réseau...) : chaque
// opération rejette, pour vérifier que le repli mémoire s'active silencieusement sans jamais
// remonter d'erreur ni bloquer la connexion.
function createFailingMockKv() {
  return {
    async get() { throw new Error('KV indisponible (simulation de test)'); },
    async put() { throw new Error('KV indisponible (simulation de test)'); },
    async delete() { throw new Error('KV indisponible (simulation de test)'); },
  };
}
function clearMockKvBinding() { delete global.LOGIN_ATTEMPTS_KV; }

// ── Fonctions pures (Map en mémoire) ─────────────────────────────────────────────────────────
test('loginLockStatus : pas de verrou pour un code jamais vu', () => {
  const W = loadWorker();
  assert.equal(W.loginLockStatus('CODE_INCONNU_1').locked, false);
});

test('registerLoginFailure : aucun verrou avant le 5e échec', () => {
  const W = loadWorker();
  const code = 'RLTEST1';
  for (let i = 0; i < 4; i++) W.registerLoginFailure(code);
  assert.equal(W.loginLockStatus(code).locked, false);
});

test('registerLoginFailure : verrou déclenché au 5e échec, avec un délai positif', () => {
  const W = loadWorker();
  const code = 'RLTEST2';
  for (let i = 0; i < 5; i++) W.registerLoginFailure(code);
  const st = W.loginLockStatus(code);
  assert.equal(st.locked, true);
  assert.ok(st.retryAfterS > 0 && st.retryAfterS <= 30, 'palier attendu : 30s au 5e échec');
});

test('registerLoginFailure : le verrou s\'allonge aux paliers suivants (7e puis 10e échec)', () => {
  const W = loadWorker();
  const code = 'RLTEST3';
  for (let i = 0; i < 7; i++) W.registerLoginFailure(code);
  const st7 = W.loginLockStatus(code);
  assert.ok(st7.retryAfterS > 30, 'palier 7e échec doit dépasser les 30s du palier précédent');
  for (let i = 0; i < 3; i++) W.registerLoginFailure(code); // total 10
  const st10 = W.loginLockStatus(code);
  assert.ok(st10.retryAfterS > st7.retryAfterS, 'palier 10e échec doit être plus long que le palier 7e');
});

test('clearLoginAttempts : lève le verrou et remet le compteur à zéro', () => {
  const W = loadWorker();
  const code = 'RLTEST4';
  for (let i = 0; i < 10; i++) W.registerLoginFailure(code);
  assert.equal(W.loginLockStatus(code).locked, true);
  W.clearLoginAttempts(code);
  assert.equal(W.loginLockStatus(code).locked, false);
});

test('LOGIN_PROBE_SENTINEL : constante non vide, distincte d\'un mot de passe plausible', () => {
  const W = loadWorker();
  assert.ok(W.LOGIN_PROBE_SENTINEL && W.LOGIN_PROBE_SENTINEL.length > 4);
});

// ── Verrou persistant via Cloudflare KV (mock) ───────────────────────────────────────────────
test('loginAttemptsKv : renvoie null si aucun binding LOGIN_ATTEMPTS_KV n\'est configuré', () => {
  clearMockKvBinding();
  const W = loadWorker();
  assert.equal(W.loginAttemptsKv(), null);
});

test('loginLockStatusAsync/registerLoginFailureAsync : sans KV, se comportent exactement comme les fonctions mémoire', async () => {
  clearMockKvBinding();
  const W = loadWorker();
  const code = 'KVABSENT1';
  for (let i = 0; i < 5; i++) await W.registerLoginFailureAsync(code);
  const st = await W.loginLockStatusAsync(code);
  assert.equal(st.locked, true, 'palier des 5 échecs toujours actif sans KV');
  assert.ok(st.retryAfterS > 0 && st.retryAfterS <= 30);
});

test('registerLoginFailureAsync : écrit dans KV avec le préfixe attendu et un TTL', async (t) => {
  const kv = createMockKv();
  global.LOGIN_ATTEMPTS_KV = kv;
  t.after(clearMockKvBinding);
  const W = loadWorker();
  const code = 'KVWRITE1';
  await W.registerLoginFailureAsync(code);
  const raw = kv._store.get(W.LOGIN_ATTEMPTS_KV_PREFIX + code);
  assert.ok(raw, 'une entrée doit être écrite dans KV sous la clé préfixée');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.fails, 1);
});

test('clearLoginAttemptsAsync : efface aussi bien la mémoire que la clé KV', async (t) => {
  const kv = createMockKv();
  global.LOGIN_ATTEMPTS_KV = kv;
  t.after(clearMockKvBinding);
  const W = loadWorker();
  const code = 'KVCLEAR1';
  for (let i = 0; i < 5; i++) await W.registerLoginFailureAsync(code);
  assert.ok(kv._store.has(W.LOGIN_ATTEMPTS_KV_PREFIX + code));
  await W.clearLoginAttemptsAsync(code);
  assert.equal(kv._store.has(W.LOGIN_ATTEMPTS_KV_PREFIX + code), false);
  assert.equal((await W.loginLockStatusAsync(code)).locked, false);
});

test('KV persiste le verrou entre deux "isolates" simulés (paliers 30s/5min/15min)', async (t) => {
  // Une seule instance de mock KV, réutilisée à travers deux loadWorker() successifs — chaque
  // loadWorker() vide le require-cache et donc réinitialise LOGIN_ATTEMPTS (Map en mémoire),
  // exactement comme le ferait un recyclage d'isolate Cloudflare. Si le verrou survit malgré ce
  // "reset mémoire", c'est la preuve que KV (et non la mémoire) porte l'état entre les deux.
  const kv = createMockKv();
  t.after(clearMockKvBinding);
  const code = 'KVPERSIST1';

  global.LOGIN_ATTEMPTS_KV = kv;
  const isolateA = loadWorker();
  for (let i = 0; i < 7; i++) await isolateA.registerLoginFailureAsync(code); // palier 7e échec : 5min

  global.LOGIN_ATTEMPTS_KV = kv; // même mock, "nouvel isolate"
  const isolateB = loadWorker();
  assert.equal(isolateB.LOGIN_ATTEMPTS.has(code), false, 'le nouvel isolate ne doit rien avoir en mémoire locale avant lecture KV');
  const st = await isolateB.loginLockStatusAsync(code);
  assert.equal(st.locked, true, 'le verrou posé par le premier isolate doit être visible depuis le second, via KV');
  assert.ok(st.retryAfterS > 30, 'palier 7e échec (5 min) doit dépasser le palier 30s');
});

test('KV indisponible (erreurs sur get/put) : repli gracieux sur la mémoire, verrou toujours appliqué', async (t) => {
  global.LOGIN_ATTEMPTS_KV = createFailingMockKv();
  t.after(clearMockKvBinding);
  const W = loadWorker();
  const code = 'KVFAIL1';
  for (let i = 0; i < 5; i++) {
    await assert.doesNotReject(W.registerLoginFailureAsync(code), 'un échec KV ne doit jamais remonter d\'exception');
  }
  const st = await W.loginLockStatusAsync(code); // rejetterait ici si le repli n'absorbait pas l'erreur KV
  assert.equal(st.locked, true, 'le repli mémoire doit continuer à appliquer les paliers malgré KV en panne');
});

test('verify_password (intégration) : le verrou KV bloque bien avec HTTP 429, et la clé KV est écrite', async (t) => {
  const kv = createMockKv();
  global.LOGIN_ATTEMPTS_KV = kv;
  t.after(clearMockKvBinding);
  const W = loadWorker();
  mockGraphFetchWithHash(t, FAKE_HASH);
  const code = 'KVBRUTEFORCE1';
  let lastRes, lastData;
  for (let i = 0; i < 6; i++) {
    lastRes = await W.handleRequest(postRequest('verify_password', { code, password: 'mauvais' + i }));
    lastData = await lastRes.json();
  }
  assert.equal(lastRes.status, 429);
  assert.equal(lastData.error, 'trop_de_tentatives');
  assert.ok(kv._store.has(W.LOGIN_ATTEMPTS_KV_PREFIX + code), 'verify_password doit avoir persisté le compteur dans KV');
});

test('set_password (intégration) : ne lit/n\'écrit jamais KV, même avec un binding présent (scope limité à verify_password)', async (t) => {
  let kvCalls = 0;
  const countingKv = {
    async get() { kvCalls++; return null; },
    async put() { kvCalls++; },
    async delete() { kvCalls++; },
  };
  global.LOGIN_ATTEMPTS_KV = countingKv;
  t.after(clearMockKvBinding);
  const W = loadWorker();
  mockGraphFetchWithHash(t, FAKE_HASH);
  const code = 'KVSETPWD1';
  for (let i = 0; i < 6; i++) {
    await W.handleRequest(postRequest('set_password', { code, password: 'nouveau1234', old_password: 'mauvais' + i }));
  }
  assert.equal(kvCalls, 0, 'set_password doit rester memory-only : aucun appel KV, quel que soit le nombre de tentatives');
});

test('reset_password (admin) : lève aussi le verrou persisté dans KV, pas seulement en mémoire', async (t) => {
  const kv = createMockKv();
  global.LOGIN_ATTEMPTS_KV = kv;
  t.after(clearMockKvBinding);
  const W = loadWorker();
  const code = 'KVRESETLOCK1';
  for (let i = 0; i < 10; i++) await W.registerLoginFailureAsync(code);
  assert.ok(kv._store.has(W.LOGIN_ATTEMPTS_KV_PREFIX + code));
  mockGraphFetchWithHash(t, FAKE_HASH);
  const token = await W.signSessionWith('AIWI', 'Admin', SESSION_SECRET);
  const res = await W.handleRequest(postRequest('reset_password', { code, confirm: 'ESR-CONFIRME', token }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(kv._store.has(W.LOGIN_ATTEMPTS_KV_PREFIX + code), false, 'reset_password doit purger la clé KV pour ne pas laisser l\'employé bloqué après intervention admin');
  assert.equal((await W.loginLockStatusAsync(code)).locked, false);
});

// ── Intégration : handleRequest() avec Microsoft Graph mocké ────────────────────────────────
function mockGraphFetchWithHash(t, hash) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) {
      return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    }
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET' && u.includes('/Employes/items')) {
        return new Response(JSON.stringify({ value: [{ id: 'emp-item-1', fields: { MotDePasse: hash, Code_CT: 'Ouvrier' } }] }), { status: 200 });
      }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée dans ce test : ' + u);
  });
}

function postRequest(action, body) {
  return new Request('https://immo-proxy.test/?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

// Hash bidon (format salt:hash attendu par verifyPassword) : ne correspondra jamais à un mot de
// passe deviné au hasard, donc chaque tentative échoue de façon déterministe — suffisant pour
// tester le compteur d'échecs sans avoir besoin de connaître un vrai mot de passe en clair.
const FAKE_HASH = 'deadbeefdeadbeefdeadbeefdeadbeef:cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe';

test('verify_password : la sonde du dashboard (mot de passe sentinel) ne compte jamais comme un échec', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithHash(t, FAKE_HASH);
  const code = 'PROBECODE';
  for (let i = 0; i < 20; i++) {
    const res = await W.handleRequest(postRequest('verify_password', { code, password: W.LOGIN_PROBE_SENTINEL }));
    const data = await res.json();
    assert.equal(res.status, 200, 'la sonde ne doit jamais être bloquée par un verrou');
    assert.equal(data.success, false);
  }
  assert.equal(W.loginLockStatus(code).locked, false, '20 sondes ne doivent déclencher aucun verrou');
});

test('verify_password : verrou HTTP 429 après des échecs répétés avec un vrai mot de passe deviné', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithHash(t, FAKE_HASH);
  const code = 'BRUTEFORCE1';
  let lastRes, lastData;
  for (let i = 0; i < 6; i++) {
    lastRes = await W.handleRequest(postRequest('verify_password', { code, password: 'mauvais' + i }));
    lastData = await lastRes.json();
  }
  assert.equal(lastRes.status, 429);
  assert.equal(lastData.error, 'trop_de_tentatives');
  assert.ok(lastData.retry_after_s > 0);
});

test('set_password : le verrou s\'applique aussi à l\'ancien mot de passe deviné (changement de mot de passe)', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithHash(t, FAKE_HASH);
  const code = 'BRUTEFORCE2';
  let lastRes, lastData;
  for (let i = 0; i < 6; i++) {
    lastRes = await W.handleRequest(postRequest('set_password', { code, password: 'nouveau1234', old_password: 'mauvais' + i }));
    lastData = await lastRes.json();
  }
  assert.equal(lastRes.status, 429);
  assert.equal(lastData.error, 'trop_de_tentatives');
});

test('set_password : is_reset ne permet plus de contourner la vérification de l\'ancien mot de passe (bypass corrigé)', async (t) => {
  const W = loadWorker();
  let wroteToSharepoint = false;
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('/Employes/items') && (!opts || (opts.method || 'GET') === 'GET')) {
      return new Response(JSON.stringify({ value: [{ id: 'emp-item-1', fields: { MotDePasse: FAKE_HASH, Code_CT: 'Ouvrier' } }] }), { status: 200 });
    }
    if (opts && opts.method === 'PATCH') { wroteToSharepoint = true; return new Response(JSON.stringify({ id: 'emp-item-1' }), { status: 200 }); }
    return new Response(JSON.stringify({ value: [] }), { status: 200 });
  });
  const code = 'BYPASSTEST';
  const res = await W.handleRequest(postRequest('set_password', { code, password: 'nouveauMotDePasse', is_reset: true }));
  const data = await res.json();
  assert.equal(data.success, false, "sans l'ancien mot de passe, l'écriture doit être refusée même avec is_reset:true");
  assert.equal(data.error, 'ancien_incorrect');
  assert.equal(wroteToSharepoint, false, 'aucune écriture SharePoint ne doit avoir lieu sans le bon ancien mot de passe');
});

test('reset_password (admin) lève le verrou en cours sur le code réinitialisé', async (t) => {
  const W = loadWorker();
  const code = 'RESETLOCK1';
  for (let i = 0; i < 10; i++) W.registerLoginFailure(code);
  assert.equal(W.loginLockStatus(code).locked, true);
  mockGraphFetchWithHash(t, FAKE_HASH);
  const token = await W.signSessionWith('AIWI', 'Admin', SESSION_SECRET);
  const res = await W.handleRequest(postRequest('reset_password', { code, confirm: 'ESR-CONFIRME', token }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(W.loginLockStatus(code).locked, false, 'reset_password doit lever le verrou pour ne pas bloquer l\'employé après intervention admin');
});

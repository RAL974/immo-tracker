// Politique de longueur minimale du mot de passe (set_password) — voir PASSWORD_MIN_LENGTH dans
// worker.js et SECURITE_ETAT.md. La règle des 8 caractères ne s'applique qu'à la CRÉATION/au
// CHANGEMENT d'un mot de passe (set_password) : un compte déjà créé avant ce durcissement avec un
// mot de passe plus court (minimum historique : 4 caractères) doit continuer à se connecter sans
// rien casser — verify_password ne vérifie jamais la longueur, seulement le hash.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

global.CLIENT_SECRET_ENV = 'fake-client-secret';
global.SESSION_SECRET_ENV = 'fake-session-secret';

// Reproduit exactement l'algorithme de hashPassword() dans worker.js (PBKDF2-SHA256, 100k
// itérations, format "saltHex:hashHex") pour fabriquer un hash réel vérifiable par verifyPassword —
// nécessaire ici car hashPassword/verifyPassword sont des fonctions internes à handleRequest, non
// exportées (comportement inchangé par cette session, on ne les expose pas juste pour le test).
function bytesToHex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) { const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16); return out; }
async function realHash(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, km, 256);
  return bytesToHex(salt) + ':' + bytesToHex(bits);
}

function postRequest(action, body) {
  return new Request('https://immo-proxy.test/?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

// Mock Graph : GET renvoie l'item employé fourni (avec ou sans hash), PATCH est tracé pour vérifier
// qu'aucune écriture n'a lieu quand la règle des 8 caractères refuse la requête.
function mockGraph(t, { hash } = {}) {
  let patched = false;
  let patchedFields = null;
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET' && u.includes('/Employes/items')) {
        return new Response(JSON.stringify({ value: [{ id: 'emp-item-1', fields: { MotDePasse: hash || '', Code_CT: 'Ouvrier' } }] }), { status: 200 });
      }
      if (method === 'PATCH') { patched = true; patchedFields = JSON.parse(opts.body); return new Response(JSON.stringify({ id: 'emp-item-1' }), { status: 200 }); }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée dans ce test : ' + u);
  });
  return { wasPatched: () => patched, patchedFields: () => patchedFields };
}

test('PASSWORD_MIN_LENGTH : vaut 8', () => {
  const W = loadWorker();
  assert.equal(W.PASSWORD_MIN_LENGTH, 8);
});

test('set_password : un nouveau mot de passe de 7 caractères est refusé, aucune écriture SharePoint', async (t) => {
  const W = loadWorker();
  const graph = mockGraph(t, { hash: '' }); // aucun hash existant : création initiale
  const res = await W.handleRequest(postRequest('set_password', { code: 'NEWACC1', password: '1234567' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'mot_de_passe_trop_court');
  assert.equal(data.min_length, 8);
  assert.equal(graph.wasPatched(), false, 'un mot de passe refusé ne doit jamais être écrit');
});

test('set_password : un nouveau mot de passe de 8 caractères est accepté et écrit', async (t) => {
  const W = loadWorker();
  const graph = mockGraph(t, { hash: '' });
  const res = await W.handleRequest(postRequest('set_password', { code: 'NEWACC2', password: '12345678' }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.token, 'une session doit être ouverte après création réussie');
  assert.equal(graph.wasPatched(), true);
  assert.ok(graph.patchedFields().MotDePasse, 'le hash doit être écrit dans MotDePasse');
});

test('set_password : la règle des 8 caractères s\'applique aussi au changement d\'un mot de passe existant (ancien mot de passe correct)', async (t) => {
  const W = loadWorker();
  const oldHash = await realHash('ancien123');
  const graph = mockGraph(t, { hash: oldHash });
  const res = await W.handleRequest(postRequest('set_password', { code: 'CHANGEACC1', password: 'court12', old_password: 'ancien123' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'mot_de_passe_trop_court');
  assert.equal(graph.wasPatched(), false);
});

test('verify_password : un compte créé avant le durcissement avec un mot de passe de 4 caractères reste connectable', async (t) => {
  const W = loadWorker();
  const oldShortHash = await realHash('1234'); // mot de passe historique à 4 caractères, minimum d'avant cette session
  mockGraph(t, { hash: oldShortHash });
  const res = await W.handleRequest(postRequest('verify_password', { code: 'OLDACC1', password: '1234' }));
  const data = await res.json();
  assert.equal(data.success, true, 'verify_password ne doit jamais vérifier la longueur, seulement le hash — aucun compte existant ne doit être cassé');
  assert.ok(data.token);
});

test('verify_password : le même compte à 4 caractères refuse toujours un mauvais mot de passe (la règle de longueur n\'affaiblit pas la vérification)', async (t) => {
  const W = loadWorker();
  const oldShortHash = await realHash('1234');
  mockGraph(t, { hash: oldShortHash });
  const res = await W.handleRequest(postRequest('verify_password', { code: 'OLDACC2', password: '9999' }));
  const data = await res.json();
  assert.equal(data.success, false);
});

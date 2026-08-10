// Garde-fou anti-régression : ?employes=1 ne doit plus jamais renvoyer de nom en clair (étape 2 de
// la pseudonymisation d'employes.json, voir SECURITE_ETAT.md et 04_HISTORIQUE_DECISIONS.md).
// La résolution nom<->code passe désormais exclusivement par l'endpoint dédié ?noms_employes=1
// (protégé par vérification d'origine + limitation de débit) — voir
// tests/worker.noms-employes-endpoint.test.js pour ce dernier.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

function mockGraphFetchWithNomReel(t, nomReel) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET' && u.includes('/Employes/items')) {
        return new Response(JSON.stringify({ value: [{ id: 'emp-1', fields: { Title: 'NOMTEST', field_1: nomReel, Poste: 'Ouvrier', Code_CT: 'CT', Site: 'Reunion', field_2: 'Oui' } }] }), { status: 200 });
      }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée dans ce test : ' + u);
  });
}

test('?employes=1 : la réponse ne contient plus la clé "nom"', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithNomReel(t, 'NOMREEL Prenom');
  const res = await W.handleRequest(new Request('https://immo-proxy.test/?employes=1'));
  const data = await res.json();
  const entry = data.find(e => e.code === 'NOMTEST');
  assert.ok(entry, 'l\'employé de test doit être présent');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'nom'), false, '?employes=1 ne doit plus porter de clé "nom"');
});

test('?employes=1 : le nom réel n\'apparaît nulle part dans le payload JSON brut', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithNomReel(t, 'NOMREEL Prenom');
  const res = await W.handleRequest(new Request('https://immo-proxy.test/?employes=1'));
  const rawText = await res.text();
  assert.equal(rawText.includes('NOMREEL'), false, 'le nom réel ne doit fuiter nulle part dans la réponse');
});

test('?employes=1 : les autres champs (poste, rôle, site, actif, has_password) restent présents', async (t) => {
  const W = loadWorker();
  mockGraphFetchWithNomReel(t, 'NOMREEL Prenom');
  const res = await W.handleRequest(new Request('https://immo-proxy.test/?employes=1'));
  const data = await res.json();
  const entry = data.find(e => e.code === 'NOMTEST');
  assert.equal(entry.poste, 'Ouvrier');
  assert.equal(entry.role, 'CT');
  assert.equal(entry.site, 'Reunion');
  assert.equal(entry.actif, true);
  assert.equal(typeof entry.has_password, 'boolean');
});

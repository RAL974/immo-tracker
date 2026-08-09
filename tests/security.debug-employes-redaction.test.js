// Garde-fou anti-régression : ?debug_employes=1 est un endpoint de diagnostic non authentifié par
// conception (comme les autres ?debug_*, voir ARCHITECTURE_GLOBALE.md § 3) — mais avant l'audit de
// sécurité du 9 août 2026, il faisait un echo brut de la réponse Graph, MotDePasse (hash PBKDF2)
// inclus. Ce test vérifie que le hash n'apparaît plus jamais dans la réponse, quel que soit son
// contenu réel côté SharePoint (mocké ici avec une valeur reconnaissable).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = 'fake-session-secret';

test('?debug_employes=1 ne fait jamais écho au hash MotDePasse', async (t) => {
  const W = loadWorker();
  const FAKE_HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  t.mock.method(global, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('/Employes/items')) {
      return new Response(JSON.stringify({ value: [{ id: '1', fields: { Title: 'TEST', MotDePasse: FAKE_HASH, Code_CT: 'Ouvrier' } }] }), { status: 200 });
    }
    throw new Error('URL non mockée : ' + u);
  });
  const res = await W.handleRequest(new Request('https://immo-proxy.test/?debug_employes=1'));
  const bodyText = await res.text();
  assert.ok(!bodyText.includes(FAKE_HASH), 'le hash de mot de passe ne doit jamais apparaître dans la réponse, même sur un endpoint de diagnostic non authentifié');
  const data = JSON.parse(bodyText);
  assert.equal(data.value[0].fields.MotDePasse, '[redacted]');
  assert.equal(data.value[0].fields.Title, 'TEST', 'les autres champs (non sensibles) doivent rester intacts pour que le diagnostic reste utile');
});

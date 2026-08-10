// Test d'intégration : simule de vraies requêtes HTTP contre handleRequest() (le vrai routeur du
// Worker), avec Microsoft Graph entièrement mocké — aucun appel réseau réel, aucune donnée
// SharePoint touchée. Vérifie que le contrôle d'accès est bien branché de bout en bout (pas
// seulement les fonctions pures testées isolément dans worker.session.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

const W = loadWorker();

function mockGraphFetch(t, { onCall } = {}) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (onCall) onCall(u, opts);
    if (u.includes('login.microsoftonline.com')) {
      return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    }
    if (u.includes('graph.microsoft.com')) {
      // Par défaut : aucune ligne trouvée (GET) / création acceptée (POST-PATCH)
      const method = (opts && opts.method) || 'GET';
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

test('ajouter_immo sans jeton -> 401 session_invalide, rien écrit', async (t) => {
  let wroteToSharepoint = false;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('graph.microsoft.com') && opts && opts.method === 'POST') wroteToSharepoint = true; } });
  const res = await W.handleRequest(postRequest('ajouter_immo', { code_im: 'IM000999', libelle: 'Test' }));
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data.success, false);
  assert.equal(data.error, 'session_invalide');
  assert.equal(wroteToSharepoint, false, "aucune écriture SharePoint ne doit avoir lieu si l'auth échoue");
});

test('ajouter_immo avec un jeton de rôle non-admin -> 403 droits_insuffisants, rien écrit', async (t) => {
  let wroteToSharepoint = false;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('graph.microsoft.com') && opts && opts.method === 'POST') wroteToSharepoint = true; } });
  const token = await W.signSessionWith('XXXX', 'Logistique', SESSION_SECRET);
  const res = await W.handleRequest(postRequest('ajouter_immo', { code_im: 'IM000999', libelle: 'Test', token }));
  const data = await res.json();
  assert.equal(res.status, 403);
  assert.equal(data.error, 'droits_insuffisants');
  assert.equal(wroteToSharepoint, false);
});

test('ajouter_immo avec un jeton Admin valide -> passe le contrôle, va jusqu\'à Graph', async (t) => {
  let wroteToSharepoint = false;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('graph.microsoft.com') && opts && opts.method === 'POST') wroteToSharepoint = true; } });
  const token = await W.signSessionWith('AIWI', 'Admin', SESSION_SECRET);
  const res = await W.handleRequest(postRequest('ajouter_immo', { code_im: 'IM000999', libelle: 'Test', site: 'Reunion', token }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(wroteToSharepoint, true, "l'admin authentifié doit pouvoir aller jusqu'à l'écriture (mockée)");
});

test('upload_fds (garant) avec un jeton Logistique_Mayotte -> autorisé', async (t) => {
  mockGraphFetch(t);
  const token = await W.signSessionWith('XXXX', 'Logistique_Mayotte', SESSION_SECRET);
  const res = await W.handleRequest(postRequest('upload_fds', { code_im: 'IM000001', data: Buffer.from('test').toString('base64'), token }));
  const data = await res.json();
  assert.notEqual(data.error, 'droits_insuffisants');
  assert.notEqual(data.error, 'session_invalide');
});

test('reserver (action partagée avec la PWA terrain) fonctionne sans jeton', async (t) => {
  mockGraphFetch(t);
  const res = await W.handleRequest(postRequest('reserver', { code_im: 'IM000001', code_employe: 'ABCD', nom_employe: 'Test', date_debut: new Date().toISOString(), date_fin: new Date().toISOString() }));
  const data = await res.json();
  assert.notEqual(data.error, 'droits_insuffisants');
  assert.notEqual(data.error, 'session_invalide');
  assert.equal(res.status, 200, "les actions PWA ne doivent jamais recevoir de 401/403 pour absence de jeton");
});

test('reserver par catégorie (sans code_im, roadmap item D) écrit Categorie/Quantite/Libelle_Libre', async (t) => {
  let writtenFields = null;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('/Reservations/items') && opts && opts.method === 'POST') writtenFields = JSON.parse(opts.body).fields; } });
  const res = await W.handleRequest(postRequest('reserver', { categorie: 'Electroportatif', quantite: 2, libelle_libre: 'perceuses', code_employe: 'ABCD', nom_employe: 'Test', code_chantier: 'C1', date_debut: new Date().toISOString(), date_fin: new Date().toISOString() }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(writtenFields.Code_IM, '');
  assert.equal(writtenFields.Categorie, 'Electroportatif');
  assert.equal(writtenFields.Quantite, 2);
  assert.equal(writtenFields.Libelle_Libre, 'perceuses');
});

test('reserver sans code_im ni categorie -> refusé, rien écrit', async (t) => {
  let wroteToSharepoint = false;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('/Reservations/items') && opts && opts.method === 'POST') wroteToSharepoint = true; } });
  const res = await W.handleRequest(postRequest('reserver', { code_employe: 'ABCD', nom_employe: 'Test', date_debut: new Date().toISOString(), date_fin: new Date().toISOString() }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'destination_manquante');
  assert.equal(wroteToSharepoint, false);
});

test('statut_resa avec une valeur hors liste blanche -> refusé, rien écrit', async (t) => {
  let wroteToSharepoint = false;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('/Reservations/items/') && opts && opts.method === 'PATCH') wroteToSharepoint = true; } });
  const res = await W.handleRequest(postRequest('statut_resa', { id: 'fake-id', statut: 'Servie' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'statut_invalide');
  assert.equal(wroteToSharepoint, false);
});

test('statut_resa avec Refusee (nouveau statut du planning dépôt) -> accepté', async (t) => {
  let writtenFields = null;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('/Reservations/items/') && opts && opts.method === 'PATCH') writtenFields = JSON.parse(opts.body); } });
  const res = await W.handleRequest(postRequest('statut_resa', { id: 'fake-id', statut: 'Refusee' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(writtenFields.Statut, 'Refusee');
});

test('statut_resa avec Contre-proposition (statut historique) -> toujours accepté (non-régression)', async (t) => {
  mockGraphFetch(t);
  const res = await W.handleRequest(postRequest('statut_resa', { id: 'fake-id', statut: 'Contre-proposition' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
});

test('creer_retour_direct_garant (action partagée avec la PWA terrain) fonctionne sans jeton et écrit un mouvement Retour/DEPOT', async (t) => {
  let writtenFields = null;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('/Mouvements/items') && opts && opts.method === 'POST') writtenFields = JSON.parse(opts.body).fields; } });
  const res = await W.handleRequest(postRequest('creer_retour_direct_garant', { code_im: 'im000001', code_employe: 'coni', nom_employe: 'CONI Test', etat: 'Bon', note: 'note' }));
  const data = await res.json();
  assert.equal(res.status, 200, "les actions PWA ne doivent jamais recevoir de 401/403 pour absence de jeton");
  assert.equal(data.success, true);
  assert.ok(writtenFields, "un mouvement aurait dû être écrit");
  assert.equal(writtenFields.Title, 'IM000001');
  assert.equal(writtenFields.Code_Employe, 'CONI');
  assert.equal(writtenFields.Type_Mouvement, 'Retour');
  assert.equal(writtenFields.Code_Chantier, 'DEPOT');
});

test('creer_retour_direct_garant sans code_im/code_employe -> donnees_invalides, rien écrit', async (t) => {
  let wroteToSharepoint = false;
  mockGraphFetch(t, { onCall: (u, opts) => { if (u.includes('/Mouvements/items') && opts && opts.method === 'POST') wroteToSharepoint = true; } });
  const res = await W.handleRequest(postRequest('creer_retour_direct_garant', { etat: 'Bon' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'donnees_invalides');
  assert.equal(wroteToSharepoint, false);
});

test('sans SESSION_SECRET_ENV configuré, une action protégée échoue explicitement (pas de faille silencieuse)', async (t) => {
  mockGraphFetch(t);
  const savedSecret = global.SESSION_SECRET_ENV;
  global.SESSION_SECRET_ENV = '';
  const freshWorker = loadWorker(); // recharge avec le nouveau global
  try {
    const res = await freshWorker.handleRequest(postRequest('ajouter_immo', { code_im: 'IM000999', libelle: 'Test' }));
    const data = await res.json();
    assert.equal(data.error, 'session_secret_manquant');
    assert.equal(res.status, 401);
  } finally {
    global.SESSION_SECRET_ENV = savedSecret;
  }
});

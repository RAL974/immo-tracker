// Photos de mouvement (retour/transfert/panne/résolution) — voir 02_MODELE_DONNEES.md et
// 04_HISTORIQUE_DECISIONS.md. Couvre : (1) les fonctions pures de validation/liaison, (2) les
// garde-fous serveur de upload_photo (action volontairement partagée avec la PWA terrain, sans
// jeton — voir PWA_SHARED_ACTIONS dans security.gated-actions.test.js), (3) la liaison photo <->
// mouvement de bout en bout via declarer_panne/resoudre_panne (directe) et transfert/valider
// (marqueur transitoire côté Transferts_En_Attente, converti en colonne structurée à la validation).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

const W = loadWorker();

// Un JPEG valide minimal : juste la signature FF D8 FF suffit pour isValidJpegBytes.
const FAKE_JPEG_B64 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]).toString('base64');
const FAKE_PNG_B64 = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).toString('base64');

function postRequest(action, body) {
  return new Request('https://immo-proxy.test/?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

// ── Fonctions pures ──────────────────────────────────────────────────────────────────────────

test('isValidPhotoFilename : accepte un nom généré côté client, refuse traversée/extension inconnue', () => {
  assert.equal(W.isValidPhotoFilename('20260810_143000_0.jpg'), true);
  assert.equal(W.isValidPhotoFilename('../../secret.jpg'), false);
  assert.equal(W.isValidPhotoFilename('photo.exe'), false);
  assert.equal(W.isValidPhotoFilename(''), false);
  assert.equal(W.isValidPhotoFilename(null), false);
});

test('isValidJpegBytes : vérifie la signature réelle des octets, pas le Content-Type déclaré', () => {
  assert.equal(W.isValidJpegBytes(new Uint8Array([0xFF, 0xD8, 0xFF, 0x00])), true);
  assert.equal(W.isValidJpegBytes(new Uint8Array([0x89, 0x50, 0x4E, 0x47])), false); // PNG
  assert.equal(W.isValidJpegBytes(new Uint8Array([])), false);
  assert.equal(W.isValidJpegBytes(null), false);
});

test('sanitizePhotoList : filtre les noms invalides et plafonne à PHOTO_MAX_COUNT', () => {
  const r = W.sanitizePhotoList(['a.jpg', '../x.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
  assert.deepEqual(r, ['a.jpg', 'b.jpg', 'c.jpg']);
  assert.equal(W.PHOTO_MAX_COUNT, 3);
  assert.deepEqual(W.sanitizePhotoList('pas-un-tableau'), [], 'une valeur non-tableau ne doit jamais planter, juste ne rien garder');
});

test('joinPhotos / parsePhotosField : round-trip sans perte', () => {
  const joined = W.joinPhotos(['a.jpg', 'b.jpg']);
  assert.equal(joined, 'a.jpg;b.jpg');
  assert.deepEqual(W.parsePhotosField(joined), ['a.jpg', 'b.jpg']);
  assert.deepEqual(W.parsePhotosField(''), []);
  assert.deepEqual(W.parsePhotosField(null), []);
});

test('buildPhotosMarker / extractPhotosMarker / stripPhotosMarker : marqueur transitoire Note', () => {
  const marker = W.buildPhotosMarker(['a.jpg', 'b.jpg']);
  assert.equal(marker, '##PHOTOS:a.jpg;b.jpg##');
  const note = 'Câble abîmé ' + marker + ' — commentaire';
  assert.deepEqual(W.extractPhotosMarker(note), ['a.jpg', 'b.jpg']);
  assert.equal(W.stripPhotosMarker(note), 'Câble abîmé — commentaire');
  assert.equal(W.buildPhotosMarker([]), '', 'aucune photo -> aucun marqueur, jamais de ##PHOTOS:## vide dans Note');
  assert.deepEqual(W.extractPhotosMarker('note sans marqueur'), []);
  assert.equal(W.stripPhotosMarker('note sans marqueur'), 'note sans marqueur');
});

// ── upload_photo : garde-fous serveur (action non authentifiée, partagée avec la PWA) ──────────

function mockGraphUpload(t, { onPut } = {}) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'PUT') { if (onPut) onPut(u, opts); return new Response(JSON.stringify({ id: 'fake-drive-item' }), { status: 200 }); }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée : ' + u);
  });
}

test('upload_photo : refuse un fichier trop volumineux, rien écrit sur le drive', async (t) => {
  let wrote = false;
  mockGraphUpload(t, { onPut: () => { wrote = true; } });
  const bigBytes = new Uint8Array(W.MAX_PHOTO_BYTES + 1000);
  bigBytes[0] = 0xFF; bigBytes[1] = 0xD8; bigBytes[2] = 0xFF; // signature JPEG valide, seule la taille doit bloquer
  const bigB64 = Buffer.from(bigBytes).toString('base64');
  const res = await W.handleRequest(postRequest('upload_photo', { code_im: 'IM000001', filename: 'x.jpg', data: bigB64 }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'fichier_trop_volumineux');
  assert.equal(wrote, false);
});

test('upload_photo : refuse des octets qui ne sont pas un vrai JPEG même avec un nom de fichier .jpg', async (t) => {
  let wrote = false;
  mockGraphUpload(t, { onPut: () => { wrote = true; } });
  const res = await W.handleRequest(postRequest('upload_photo', { code_im: 'IM000001', filename: 'x.jpg', data: FAKE_PNG_B64 }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'type_fichier_invalide');
  assert.equal(wrote, false);
});

test('upload_photo : refuse un nom de fichier invalide (traversée de chemin)', async (t) => {
  let wrote = false;
  mockGraphUpload(t, { onPut: () => { wrote = true; } });
  const res = await W.handleRequest(postRequest('upload_photo', { code_im: 'IM000001', filename: '../../evil.jpg', data: FAKE_JPEG_B64 }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'nom_fichier_invalide');
  assert.equal(wrote, false);
});

test('upload_photo : accepte un petit JPEG valide et l\'écrit sur le drive, sans jeton de session', async (t) => {
  let wrote = false;
  mockGraphUpload(t, { onPut: () => { wrote = true; } });
  const res = await W.handleRequest(postRequest('upload_photo', { code_im: 'IM000001', filename: '20260810_143000_0.jpg', data: FAKE_JPEG_B64 }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(wrote, true);
  assert.ok(data.url && data.url.includes('photo='), 'renvoie une URL de proxy, jamais un lien SharePoint direct');
});

// ── Liaison directe : declarer_panne / resoudre_panne écrivent la colonne Photos ────────────────

function mockGraphMouvements(t, { onMouvementPost } = {}) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'POST' && u.includes('/Mouvements/items')) { if (onMouvementPost) onMouvementPost(JSON.parse(opts.body).fields); return new Response(JSON.stringify({ id: 'fake-mvt-id' }), { status: 200 }); }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée : ' + u);
  });
}

test('declarer_panne : les noms de photos transmis sont écrits dans la colonne structurée Photos', async (t) => {
  let fields = null;
  mockGraphMouvements(t, { onMouvementPost: f => { fields = f; } });
  const res = await W.handleRequest(postRequest('declarer_panne', { code_im: 'IM000001', code_employe: 'ABCD', nom_employe: 'Test', motif: 'Câble sectionné', photos: ['20260810_1_0.jpg', '20260810_1_1.jpg'] }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(fields, 'un Mouvement doit avoir été créé');
  assert.equal(fields.Photos, '20260810_1_0.jpg;20260810_1_1.jpg');
});

test('declarer_panne : sans photo, la colonne Photos est écrite vide (jamais bloquant)', async (t) => {
  let fields = null;
  mockGraphMouvements(t, { onMouvementPost: f => { fields = f; } });
  const res = await W.handleRequest(postRequest('declarer_panne', { code_im: 'IM000001', code_employe: 'ABCD', nom_employe: 'Test', motif: 'Câble sectionné' }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(fields.Photos, '');
});

test('resoudre_panne (partagé PWA, sans jeton) : les photos de la réparation sont liées au mouvement', async (t) => {
  let fields = null;
  mockGraphMouvements(t, { onMouvementPost: f => { fields = f; } });
  const res = await W.handleRequest(postRequest('resoudre_panne', { code_im: 'IM000001', etat_resolution: 'Bon état', note: 'Carte remplacée', par_code: 'ABCD', par_nom: 'Test', photos: ['preuve.jpg'] }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(fields.Type_Mouvement, 'Réparation');
  assert.equal(fields.Photos, 'preuve.jpg');
});

// ── Liaison en deux temps : transfert (marqueur transitoire) -> valider (colonne structurée) ───

test('transfert : les photos du donneur sont portées par un marqueur transitoire dans Note, jamais dans Photos (colonne absente sur cette liste)', async (t) => {
  let pendingFields = null;
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'POST' && u.includes('/Transferts_En_Attente/items')) { pendingFields = JSON.parse(opts.body).fields; return new Response(JSON.stringify({ id: 'fake-pending-id' }), { status: 200 }); }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée : ' + u);
  });
  const res = await W.handleRequest(postRequest('transfert', { code_im: 'IM000001', code_employe_donneur: 'DONE', nom_donneur: 'Le Donneur', code_employe_receveur: 'RECE', nom_receveur: 'Le Receveur', etat: 'Abîmé', note: 'câble abîmé', photos: ['20260810_0.jpg'] }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(pendingFields.Note.includes('##PHOTOS:20260810_0.jpg##'), 'le marqueur doit être présent dans Note en attendant la validation');
  assert.ok(!('Photos' in pendingFields), "Transferts_En_Attente n'a pas de colonne Photos, on n'essaie jamais d'y écrire");
});

function mockGraphValider(t, { pendingNote, receveurDepot, onMouvementPost }) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET' && u.includes('/Transferts_En_Attente/items/')) {
        return new Response(JSON.stringify({ id: 'pending-1', fields: {
          Title: 'IM000001', Code_Employe_Donneur: 'DONE', Nom_Donneur: 'Le Donneur',
          Code_Employe_Receveur: receveurDepot ? 'DEPOT' : 'RECE', Nom_Receveur: 'Le Receveur',
          Etat: 'Abîmé', Note: pendingNote,
        } }), { status: 200 });
      }
      if (method === 'POST' && u.includes('/Mouvements/items')) { if (onMouvementPost) onMouvementPost(JSON.parse(opts.body).fields); return new Response(JSON.stringify({ id: 'fake-mvt-id' }), { status: 200 }); }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée : ' + u);
  });
}

test('valider (retour dépôt) : combine les photos du déclarant (marqueur retiré de Note) et celles du garant validateur, le tout dans la colonne Photos', async (t) => {
  let fields = null;
  mockGraphValider(t, {
    pendingNote: 'câble abîmé ##PHOTOS:donneur1.jpg;donneur2.jpg## — [retour déclaré par Le Donneur]',
    receveurDepot: true,
    onMouvementPost: f => { fields = f; },
  });
  const res = await W.handleRequest(postRequest('valider', { id: 'pending-1', code_im: 'IM000001', code_employe: 'GARANT1', nom_employe: 'Le Garant', etat_reception: 'Abîmé', note_reception: 'Confirmé abîmé', photos: ['garant1.jpg'] }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.vers_depot, true);
  assert.equal(fields.Type_Mouvement, 'Retour');
  assert.equal(fields.Photos, 'donneur1.jpg;donneur2.jpg;garant1.jpg');
  assert.ok(!fields.Note.includes('##PHOTOS:'), 'le marqueur ne doit jamais fuiter dans la Note finale, permanente et affichée aux utilisateurs');
  assert.ok(fields.Note.includes('câble abîmé'), 'le reste du texte de la note doit être conservé');
});

test('valider (transfert classique, sans DEPOT) : les photos du donneur sont quand même reportées dans Photos', async (t) => {
  let fields = null;
  mockGraphValider(t, {
    pendingNote: '##PHOTOS:donneur.jpg##',
    receveurDepot: false,
    onMouvementPost: f => { fields = f; },
  });
  const res = await W.handleRequest(postRequest('valider', { id: 'pending-1', code_im: 'IM000001', code_employe: 'RECE', nom_employe: 'Le Receveur', etat_reception: 'Bon état', note_reception: '' }));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.vers_depot, false);
  assert.equal(fields.Type_Mouvement, 'Transfert');
  assert.equal(fields.Photos, 'donneur.jpg');
});

test('valider : sans aucune photo (ni donneur ni validateur), la colonne Photos est écrite vide', async (t) => {
  let fields = null;
  mockGraphValider(t, { pendingNote: 'note sans photo', receveurDepot: true, onMouvementPost: f => { fields = f; } });
  const res = await W.handleRequest(postRequest('valider', { id: 'pending-1', code_im: 'IM000001', code_employe: 'GARANT1', nom_employe: 'Le Garant', etat_reception: 'Bon état', note_reception: '' }));
  await res.json();
  assert.equal(fields.Photos, '');
});

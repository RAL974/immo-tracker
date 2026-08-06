// Tests des jetons de session (voir "Autorisation côté serveur" dans 03_REGLES_METIER_ET_ROLES.md).
// Charge le vrai worker.js — pas une réimplémentation — pour détecter toute régression réelle.
// Aucun appel réseau : ces fonctions sont pures (signature/vérification HMAC, calcul de rôle).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const W = loadWorker();
const SECRET = 'secret-de-test-ne-jamais-utiliser-en-prod';

test('signSessionWith + verifySessionWith : aller-retour valide', async () => {
  const token = await W.signSessionWith('AIWI', 'Admin', SECRET);
  assert.ok(token, 'un jeton doit être émis quand le secret est fourni');
  const session = await W.verifySessionWith(token, SECRET);
  assert.equal(session.code, 'AIWI');
  assert.equal(session.role, 'Admin');
  assert.ok(session.exp > Date.now(), "l'expiration doit être dans le futur");
});

test('verifySessionWith : refuse un jeton signé avec un autre secret', async () => {
  const token = await W.signSessionWith('AIWI', 'Admin', SECRET);
  const session = await W.verifySessionWith(token, 'un-autre-secret');
  assert.equal(session, null);
});

test('verifySessionWith : refuse un jeton dont le contenu a été modifié (payload trafiqué)', async () => {
  const token = await W.signSessionWith('OUVR', 'Ouvrier', SECRET);
  const [payloadB64, sigB64] = token.split('.');
  // On rejoue le même payload mais en changeant un caractère (simule une tentative de forger un rôle admin)
  const tampered = payloadB64.slice(0, -1) + (payloadB64.slice(-1) === 'A' ? 'B' : 'A') + '.' + sigB64;
  const session = await W.verifySessionWith(tampered, SECRET);
  assert.equal(session, null);
});

test('verifySessionWith : refuse un jeton expiré', async () => {
  const token = await W.signSessionWith('AIWI', 'Admin', SECRET, -1000); // expiré depuis 1s
  const session = await W.verifySessionWith(token, SECRET);
  assert.equal(session, null);
});

test('verifySessionWith : refuse une chaîne quelconque', async () => {
  assert.equal(await W.verifySessionWith('ceci-nest-pas-un-jeton', SECRET), null);
  assert.equal(await W.verifySessionWith('', SECRET), null);
  assert.equal(await W.verifySessionWith(null, SECRET), null);
  assert.equal(await W.verifySessionWith(undefined, SECRET), null);
});

test('signSessionWith : aucun jeton émis si le secret est vide (échec propre, pas une exception)', async () => {
  const token = await W.signSessionWith('AIWI', 'Admin', '');
  assert.equal(token, null);
});

test("estAdminSessionPure : les codes super-admins (GESTIONNAIRES) sont admin quel que soit le rôle SharePoint", () => {
  assert.equal(W.estAdminSessionPure({ code: 'AIWI', role: 'Ouvrier' }, W.GESTIONNAIRES), true);
  assert.equal(W.estAdminSessionPure({ code: 'CONI', role: '' }, W.GESTIONNAIRES), true);
});

test('estAdminSessionPure : rôle "Admin" (insensible à la casse / espaces / tirets)', () => {
  assert.equal(W.estAdminSessionPure({ code: 'XXXX', role: 'Admin' }, W.GESTIONNAIRES), true);
  assert.equal(W.estAdminSessionPure({ code: 'XXXX', role: 'ADMIN' }, W.GESTIONNAIRES), true);
  assert.equal(W.estAdminSessionPure({ code: 'XXXX', role: ' admin ' }, W.GESTIONNAIRES), true);
});

test('estAdminSessionPure : refuse les autres rôles', () => {
  for (const role of ['Ouvrier', 'CT', 'Logistique', 'Logistique_Mayotte', 'RA', 'Encadrement', '']) {
    assert.equal(W.estAdminSessionPure({ code: 'XXXX', role }, W.GESTIONNAIRES), false, 'rôle testé: ' + role);
  }
});

test('estAdminSessionPure : session nulle/absente = jamais admin', () => {
  assert.equal(W.estAdminSessionPure(null, W.GESTIONNAIRES), false);
  assert.equal(W.estAdminSessionPure(undefined, W.GESTIONNAIRES), false);
});

test("estGarantSessionPure : Admin, Logistique et Logistique_Mayotte passent (même population que estGarant() côté dashboard)", () => {
  assert.equal(W.estGarantSessionPure({ code: 'XXXX', role: 'Admin' }, W.GESTIONNAIRES), true);
  assert.equal(W.estGarantSessionPure({ code: 'XXXX', role: 'Logistique' }, W.GESTIONNAIRES), true);
  assert.equal(W.estGarantSessionPure({ code: 'XXXX', role: 'Logistique_Mayotte' }, W.GESTIONNAIRES), true);
  assert.equal(W.estGarantSessionPure({ code: 'XXXX', role: 'Logistique-Mayotte' }, W.GESTIONNAIRES), true); // tiret toléré comme espace
});

test('estGarantSessionPure : refuse les rôles terrain (CT, RA, Ouvrier...)', () => {
  for (const role of ['CT', 'CT_Specialise', 'RA', 'Ouvrier', 'Ouvrier_Specialise', 'Encadrement', '']) {
    assert.equal(W.estGarantSessionPure({ code: 'XXXX', role }, W.GESTIONNAIRES), false, 'rôle testé: ' + role);
  }
});

test('roleNorm : normalise casse, espaces et tirets', () => {
  assert.equal(W.roleNorm('Logistique Mayotte'), 'logistique_mayotte');
  assert.equal(W.roleNorm('Logistique-Mayotte'), 'logistique_mayotte');
  assert.equal(W.roleNorm('  Admin  '), 'admin');
  assert.equal(W.roleNorm(''), '');
  assert.equal(W.roleNorm(null), '');
});

// ── requireAdminWith / requireGarantWith : la porte réellement utilisée par les 46 actions protégées ──

test('requireAdminWith : refuse sans jeton (session_invalide)', async () => {
  const res = await W.requireAdminWith({}, SECRET, W.GESTIONNAIRES);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'session_invalide');
});

test('requireAdminWith : refuse si le secret serveur est absent (session_secret_manquant) — panne explicite, pas une brèche ouverte', async () => {
  const token = await W.signSessionWith('AIWI', 'Admin', SECRET);
  const res = await W.requireAdminWith({ token }, '', W.GESTIONNAIRES);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'session_secret_manquant');
});

test('requireAdminWith : refuse un rôle non-admin (droits_insuffisants)', async () => {
  const token = await W.signSessionWith('XXXX', 'Logistique', SECRET);
  const res = await W.requireAdminWith({ token }, SECRET, W.GESTIONNAIRES);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'droits_insuffisants');
});

test('requireAdminWith : accepte un jeton Admin valide', async () => {
  const token = await W.signSessionWith('XXXX', 'Admin', SECRET);
  const res = await W.requireAdminWith({ token }, SECRET, W.GESTIONNAIRES);
  assert.equal(res.ok, true);
  assert.equal(res.session.code, 'XXXX');
});

test('requireGarantWith : accepte Admin, Logistique et Logistique_Mayotte', async () => {
  for (const role of ['Admin', 'Logistique', 'Logistique_Mayotte']) {
    const token = await W.signSessionWith('XXXX', role, SECRET);
    const res = await W.requireGarantWith({ token }, SECRET, W.GESTIONNAIRES);
    assert.equal(res.ok, true, 'rôle testé: ' + role);
  }
});

test('requireGarantWith : refuse un rôle terrain (CT)', async () => {
  const token = await W.signSessionWith('XXXX', 'CT', SECRET);
  const res = await W.requireGarantWith({ token }, SECRET, W.GESTIONNAIRES);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'droits_insuffisants');
});

test('requireAdminWith : refuse un jeton expiré même avec un rôle Admin', async () => {
  const token = await W.signSessionWith('XXXX', 'Admin', SECRET, -1000);
  const res = await W.requireAdminWith({ token }, SECRET, W.GESTIONNAIRES);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'session_invalide');
});

// Fonctions pures utilisées par le journal d'audit (voir worker.js, section "Journal d'audit").
// Testées isolément, sans passer par une vraie requête HTTP — même esprit que
// worker.session.test.js pour les fonctions de session.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

global.CLIENT_SECRET_ENV = global.CLIENT_SECRET_ENV || 'fake-client-secret';
global.SESSION_SECRET_ENV = global.SESSION_SECRET_ENV || 'fake-session-secret';
const W = loadWorker();

test('auditDetailFrom exclut les mots de passe/PIN/PUK/RIO/déverrouillage/token, insensible à la casse', () => {
  const body = {
    password: 'secret1', old_password: 'secret2', new_password: 'secret3', pwd: 'secret4', token: 'jeton-abc',
    Code_PIN: '1234', code_puk: '5678', CODE_RIO: 'abc', code_deverouillage: 'x', code_deverrouillage: 'y',
    data: 'base64....', code_im: 'IM000001', commentaire: 'ok'
  };
  const out = W.auditDetailFrom(body);
  assert.equal(out.password, undefined);
  assert.equal(out.old_password, undefined);
  assert.equal(out.new_password, undefined);
  assert.equal(out.pwd, undefined);
  assert.equal(out.token, undefined);
  assert.equal(out.Code_PIN, undefined);
  assert.equal(out.code_puk, undefined);
  assert.equal(out.CODE_RIO, undefined);
  assert.equal(out.code_deverouillage, undefined);
  assert.equal(out.code_deverrouillage, undefined);
  assert.equal(out.data, undefined);
  assert.equal(out.code_im, 'IM000001');
  assert.equal(out.commentaire, 'ok');
});

test('auditDetailFrom résume les tableaux/objets (imports en masse) plutôt que de les recopier', () => {
  const out = W.auditDetailFrom({ immos: [{ code_im: 'IM1' }, { code_im: 'IM2' }, { code_im: 'IM3' }], meta: { a: 1, b: 2 } });
  assert.deepEqual(out.immos, { __count: 3 });
  assert.deepEqual(out.meta, { __count: 2 });
});

test('auditDetailFrom ignore les valeurs undefined mais garde null/0/false explicites', () => {
  const out = W.auditDetailFrom({ a: undefined, b: null, c: 0, d: false, e: '' });
  assert.ok(!('a' in out));
  assert.equal(out.b, null);
  assert.equal(out.c, 0);
  assert.equal(out.d, false);
  assert.equal(out.e, '');
});

test('auditCibleFrom choisit le meilleur identifiant disponible, par ordre de priorité', () => {
  assert.equal(W.auditCibleFrom({ code_im: 'IM000001', code_employe: 'ABCD' }), 'IM000001');
  assert.equal(W.auditCibleFrom({ code_employe: 'ABCD', code: 'XYZ' }), 'ABCD');
  assert.equal(W.auditCibleFrom({ code: 'XYZ' }), 'XYZ');
  assert.equal(W.auditCibleFrom({ id: '42' }), '42');
  assert.equal(W.auditCibleFrom({}), '');
  assert.equal(W.auditCibleFrom(null), '');
});

test('GATED_ACTIONS_AUDIT et AUDIT_AUTH_ERRORS sont exportés et non vides', () => {
  assert.ok(W.GATED_ACTIONS_AUDIT instanceof Set);
  assert.equal(W.GATED_ACTIONS_AUDIT.size, 70, 'périmètre attendu : les 70 actions gated (voir GATED_ACTIONS côté dashboard.html) — 62 + 8 actions Brasseurs d\'air ajoutées août 2026');
  assert.ok(W.AUDIT_AUTH_ERRORS.has('session_invalide'));
  assert.ok(W.AUDIT_AUTH_ERRORS.has('droits_insuffisants'));
  assert.ok(W.AUDIT_AUTH_ERRORS.has('session_secret_manquant'));
});

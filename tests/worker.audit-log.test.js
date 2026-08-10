// Journal d'audit des actions sensibles (Journal_Audit) — voir 02_MODELE_DONNEES.md et
// 04_HISTORIQUE_DECISIONS.md. Couvre : écriture sur une action gated réussie, non-blocage de
// l'action métier quand l'écriture du journal échoue (best effort), absence d'écriture quand l'auth
// échoue (garantie déjà testée par worker.integration.test.js, préservée ici), et journalisation
// des échecs de connexion (verify_password). Microsoft Graph et Sentry entièrement mockés — aucun
// appel réseau réel.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

const W = loadWorker();

function mockGraphAndSentry(t, { journalAuditOk = true } = {}) {
  const calls = [];
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    calls.push({ url: u, method: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (u.includes('login.microsoftonline.com')) {
      return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    }
    if (u.includes('sentry.io')) {
      return new Response('{}', { status: 200 });
    }
    if (u.includes('graph.microsoft.com')) {
      const method = (opts && opts.method) || 'GET';
      if (u.includes('Journal_Audit') && method === 'POST') {
        return journalAuditOk ? new Response(JSON.stringify({ id: 'audit-item-id' }), { status: 200 }) : new Response('erreur', { status: 500 });
      }
      if (method === 'GET') return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'fake-item-id' }), { status: 200 });
    }
    throw new Error('URL non mockée dans ce test : ' + u);
  });
  return calls;
}

function postRequest(action, body) {
  return new Request('https://immo-proxy.test/?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

test('une action gated réussie (ajouter_immo, admin) écrit une ligne dans Journal_Audit avec l\'identité de la session', async (t) => {
  const calls = mockGraphAndSentry(t);
  const token = await W.signSessionWith('AIWI', 'Admin', SESSION_SECRET);
  const res = await W.handleRequest(postRequest('ajouter_immo', { code_im: 'IM000999', libelle: 'Test', site: 'Reunion', token }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));

  const auditCall = calls.find(c => c.url.includes('Journal_Audit/items') && c.method === 'POST');
  assert.ok(auditCall, 'aucune écriture Journal_Audit détectée');
  const fields = JSON.parse(auditCall.body).fields;
  assert.equal(fields.Code_Employe, 'AIWI', "l'identité doit venir du jeton vérifié, jamais du corps de la requête");
  assert.equal(fields.Action, 'ajouter_immo');
  assert.equal(fields.Resultat, 'Succès');
  assert.equal(fields.Cible, 'IM000999');
  assert.ok(!JSON.stringify(fields.Detail).includes('token'), 'le jeton de session ne doit jamais être recopié dans Detail');
});

test('un échec d\'écriture du journal (Graph en erreur) ne bloque jamais l\'action métier, et une trace Sentry best-effort est envoyée', async (t) => {
  const calls = mockGraphAndSentry(t, { journalAuditOk: false });
  const token = await W.signSessionWith('AIWI', 'Admin', SESSION_SECRET);
  const res = await W.handleRequest(postRequest('ajouter_immo', { code_im: 'IM000998', libelle: 'Test2', site: 'Reunion', token }));
  const data = await res.json();
  assert.equal(data.success, true, "l'action métier doit réussir même si l'écriture du journal échoue : " + JSON.stringify(data));

  const sentryCall = calls.find(c => c.url.includes('sentry.io'));
  assert.ok(sentryCall, 'une trace Sentry best-effort était attendue après échec d\'écriture du journal');
  const sentryBody = JSON.parse(sentryCall.body);
  assert.equal(sentryBody.tags.action, 'ajouter_immo');
  assert.ok(!JSON.stringify(sentryBody).includes('IM000998'), "le rapport Sentry ne doit jamais contenir le corps de la requête (codes immo/employé)");
});

test('aucune écriture Journal_Audit si l\'auth échoue (jeton absent) — préserve la garantie "rien écrit" de worker.integration.test.js', async (t) => {
  const calls = mockGraphAndSentry(t);
  const res = await W.handleRequest(postRequest('ajouter_immo', { code_im: 'IM000997', libelle: 'Test3' }));
  const data = await res.json();
  assert.equal(data.error, 'session_invalide');
  const auditCall = calls.find(c => c.url.includes('Journal_Audit/items'));
  assert.ok(!auditCall, "aucune écriture Journal_Audit n'est attendue quand l'auth échoue (aucune identité vérifiée disponible)");
});

test('aucune écriture Journal_Audit si l\'auth échoue (rôle insuffisant)', async (t) => {
  const calls = mockGraphAndSentry(t);
  const token = await W.signSessionWith('XXXX', 'Logistique', SESSION_SECRET);
  const res = await W.handleRequest(postRequest('ajouter_immo', { code_im: 'IM000996', libelle: 'Test4', token }));
  const data = await res.json();
  assert.equal(data.error, 'droits_insuffisants');
  const auditCall = calls.find(c => c.url.includes('Journal_Audit/items'));
  assert.ok(!auditCall, "aucune écriture Journal_Audit n'est attendue quand les droits sont insuffisants");
});

test('un échec de connexion (verify_password, mauvais mot de passe) est journalisé sans exposer le mot de passe ni forger une identité', async (t) => {
  const CODE = 'ABCD';
  const calls = [];
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    calls.push({ url: u, method: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('sentry.io')) return new Response('{}', { status: 200 });
    if (u.includes('Journal_Audit/items')) return new Response(JSON.stringify({ id: 'audit-item-id' }), { status: 200 });
    if (u.includes('Employes/items')) {
      return new Response(JSON.stringify({ value: [{ id: 'emp-1', fields: { Title: CODE, MotDePasse: 'deadbeef:cafebabe', Code_CT: 'CT' } }] }), { status: 200 });
    }
    throw new Error('URL non mockée dans ce test : ' + u);
  });
  const res = await W.handleRequest(postRequest('verify_password', { code: CODE, password: 'mauvais-mot-de-passe' }));
  const data = await res.json();
  assert.equal(data.success, false);

  const auditCall = calls.find(c => c.url.includes('Journal_Audit/items') && c.method === 'POST');
  assert.ok(auditCall, 'un échec de verify_password doit être journalisé');
  const fields = JSON.parse(auditCall.body).fields;
  assert.equal(fields.Action, 'verify_password');
  assert.equal(fields.Resultat, 'Échec');
  assert.equal(fields.Code_Employe, '', "aucune session n'existe pour un login raté : Code_Employe doit rester vide (jamais une identité non vérifiée)");
  assert.equal(fields.Cible, CODE, "le code tenté (non vérifié) va dans Cible, pas dans Code_Employe");
  assert.ok(!JSON.stringify(fields).includes('mauvais-mot-de-passe'), 'le mot de passe tenté ne doit jamais apparaître dans le journal');
});

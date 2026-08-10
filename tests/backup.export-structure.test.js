// Tests de la sauvegarde complète (option C, orchestrée par le dashboard sur ?export_liste=).
// Couvre : pagination Graph multi-pages, structure du JSON exporté, détection de troncature
// (complete:false quand le plafond de pages est atteint), et deux garde-fous anti-régression :
//  - toute liste réellement lue/écrite via Graph dans worker.js DOIT figurer dans EXPORTABLE_LISTS ;
//  - la whitelist worker.js et le tableau dashboard.html restent strictement synchronisés.
// Microsoft Graph est entièrement mocké — aucun appel réseau réel, aucune donnée SharePoint touchée.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadWorker } = require('./helpers/loadWorker');

const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = 'fake-client-secret';
global.SESSION_SECRET_ENV = SESSION_SECRET;
const W = loadWorker();

const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

function mockPaginatedGraph(t, { pages = 1, perPage = 2, infinite = false } = {}) {
  let call = 0;
  t.mock.method(global, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) {
      return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    }
    if (u.includes('graph.microsoft.com')) {
      call++;
      const value = [];
      for (let k = 0; k < perPage; k++) value.push({ id: 'id-' + call + '-' + k, fields: { Title: 'T' + call + '-' + k } });
      const hasNext = infinite || call < pages;
      const body = { value };
      if (hasNext) body['@odata.nextLink'] = 'https://graph.microsoft.com/next?page=' + (call + 1);
      return new Response(JSON.stringify(body), { status: 200 });
    }
    throw new Error('URL non mockée : ' + u);
  });
  return () => call;
}

function exportRequest(nomListe, token) {
  return new Request('https://immo-proxy.test/?export_liste=' + encodeURIComponent(nomListe) + '&token=' + encodeURIComponent(token || ''));
}

test('export_liste concatène toutes les pages Graph et renvoie la structure attendue', async (t) => {
  mockPaginatedGraph(t, { pages: 3, perPage: 2 });
  const token = await W.signSessionWith('AIWI', 'Admin', SESSION_SECRET);
  const res = await W.handleRequest(exportRequest('Immos', token));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.liste, 'Immos');
  assert.equal(data.count, 6, '3 pages × 2 items = 6');
  assert.equal(data.items.length, 6);
  assert.equal(data.complete, true, 'pagination terminée avant le plafond → complete:true');
  assert.ok(typeof data.exporte_le === 'string' && data.exporte_le.length > 0, 'horodatage présent');
  assert.equal(data.items[0].id, 'id-1-0');
  assert.equal(data.items[0].Title, 'T1-0');
});

test('export_liste signale complete:false quand la liste dépasse le plafond de pages (pas de troncature silencieuse)', async (t) => {
  const calls = mockPaginatedGraph(t, { infinite: true, perPage: 1 });
  const token = await W.signSessionWith('AIWI', 'Admin', SESSION_SECRET);
  const res = await W.handleRequest(exportRequest('Mouvements', token));
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.complete, false, 'nextLink restant au plafond → complete:false');
  assert.equal(calls(), 45, 'le plafond de 45 pages doit être respecté (budget ~50 sous-requêtes du plan gratuit)');
});

test('export_liste refuse une liste hors whitelist (avant tout appel Graph)', async (t) => {
  let graphCalled = false;
  t.mock.method(global, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'x' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) graphCalled = true;
    return new Response(JSON.stringify({ value: [] }), { status: 200 });
  });
  const token = await W.signSessionWith('AIWI', 'Admin', SESSION_SECRET);
  const res = await W.handleRequest(exportRequest('Table_Inexistante', token));
  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data.error, 'liste_inconnue');
  assert.equal(graphCalled, false, "aucune lecture Graph d'une liste hors whitelist");
});

test('export_liste sans jeton Admin -> 401/403, rien exporté', async (t) => {
  mockPaginatedGraph(t, { pages: 1 });
  const res = await W.handleRequest(exportRequest('Immos', ''));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(res.status === 401 || res.status === 403);
});

function workerExportableLists() {
  const m = /const EXPORTABLE_LISTS = \[([\s\S]*?)\];/.exec(workerSrc);
  assert.ok(m, 'EXPORTABLE_LISTS introuvable dans worker.js');
  return (m[1].match(/'([A-Za-z_]+)'/g) || []).map((s) => s.replace(/'/g, ''));
}

function dashboardExportableLists() {
  const m = /var EXPORTABLE_LISTS=\[([^\]]*)\];/.exec(dashboardSrc);
  assert.ok(m, 'EXPORTABLE_LISTS introuvable dans dashboard.html');
  return (m[1].match(/'([A-Za-z_]+)'/g) || []).map((s) => s.replace(/'/g, ''));
}

test('toute liste SharePoint lue/écrite via Graph dans worker.js figure dans EXPORTABLE_LISTS', () => {
  const referenced = new Set();
  let m;
  const reGL = /GL\s*\+\s*['"]\/([A-Za-z_]+)/g;
  while ((m = reGL.exec(workerSrc))) referenced.add(m[1]);
  const reLit = /\/lists\/([A-Za-z_]+)/g;
  while ((m = reLit.exec(workerSrc))) referenced.add(m[1]);
  referenced.delete('NomListe');
  const whitelist = new Set(workerExportableLists());
  const manquantes = [...referenced].filter((l) => !whitelist.has(l));
  assert.deepEqual(manquantes, [], 'Listes référencées via Graph mais absentes de EXPORTABLE_LISTS : ' + manquantes.join(', '));
});

test('EXPORTABLE_LISTS est strictement synchronisée entre worker.js et dashboard.html', () => {
  const w = workerExportableLists();
  const d = dashboardExportableLists();
  assert.deepEqual([...w].sort(), [...d].sort(), 'worker.js et dashboard.html doivent contenir exactement les mêmes listes');
});

// Environnement de recette (staging) : SITE_ID et ENV_NAME sont surchargeables par les variables
// Cloudflare SITE_ID_ENV / ENV_NAME_ENV (voir wrangler.toml [env.staging] et
// PROCEDURE_RECETTE.md), avec repli sur les valeurs de production si elles sont absentes — exactement
// le même pattern que CLIENT_SECRET_ENV/SESSION_SECRET_ENV. Ce test vérifie les deux sens :
// (1) sans ces variables, le Worker garde son comportement de production actuel, inchangé ;
// (2) avec ces variables, le Worker interroge bien le site SharePoint de recette, jamais la prod.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const PROD_SITE_ID = 'espacesoleil97.sharepoint.com,4157ffef-a5f6-4e7e-8a19-4f6ab57d7128,d15dad00-7bed-4e78-bb2f-d0156e6e49a7';

global.CLIENT_SECRET_ENV = 'fake-client-secret';
global.SESSION_SECRET_ENV = 'fake-session-secret';

function mockGraphFetch(t, { onCall } = {}) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (onCall) onCall(u, opts);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (u.includes('graph.microsoft.com')) return new Response(JSON.stringify({ value: [] }), { status: 200 });
    throw new Error('URL non mockée dans ce test : ' + u);
  });
}

test('sans SITE_ID_ENV/ENV_NAME_ENV : le Worker interroge le site de production et s\'annonce "production"', async (t) => {
  delete global.SITE_ID_ENV;
  delete global.ENV_NAME_ENV;
  const W = loadWorker();
  let calledUrl = '';
  mockGraphFetch(t, { onCall: (u) => { if (u.includes('/Immos/items')) calledUrl = u; } });
  const req = new Request('https://immo-proxy.test/?debug_immos=1', { headers: { Origin: 'https://ral974.github.io' } });
  const res = await W.handleRequest(req);
  assert.ok(calledUrl.includes(PROD_SITE_ID), 'doit interroger le site SharePoint de production par défaut');
  assert.equal(res.headers.get('X-Immo-Env'), 'production');
});

test('avec SITE_ID_ENV/ENV_NAME_ENV définis : le Worker interroge le site de recette, jamais la prod', async (t) => {
  global.SITE_ID_ENV = 'test-tenant.sharepoint.com,TEST-SITE-GUID,TEST-WEB-GUID';
  global.ENV_NAME_ENV = 'staging';
  const W = loadWorker();
  let calledUrl = '';
  mockGraphFetch(t, { onCall: (u) => { if (u.includes('/Immos/items')) calledUrl = u; } });
  const req = new Request('https://immo-proxy-staging.test/?debug_immos=1', { headers: { Origin: 'https://ral974.github.io' } });
  const res = await W.handleRequest(req);
  assert.ok(calledUrl.includes('test-tenant.sharepoint.com,TEST-SITE-GUID,TEST-WEB-GUID'), 'doit interroger le site de recette');
  assert.ok(!calledUrl.includes(PROD_SITE_ID), 'ne doit jamais interroger le site de production quand SITE_ID_ENV est défini');
  assert.equal(res.headers.get('X-Immo-Env'), 'staging');
  delete global.SITE_ID_ENV;
  delete global.ENV_NAME_ENV;
});

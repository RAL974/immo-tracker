// Tests du module « Consultations EPI » (fournisseurs, besoin figé, offres — ajouté sept. 2026).
// Microsoft Graph est entièrement mocké — aucun appel réseau réel, aucune donnée SharePoint
// touchée. Couvre : CRUD Fournisseurs (dédoublonnage), « figer le besoin » (en-tête + lignes en
// $batch, y compris au-delà de 20 lignes), édition d'une ligne de besoin limitée au statut
// Brouillon, transitions de statut validées côté serveur (avec motif d'annulation tracé dans
// Notes sans écraser l'existant), création/édition d'une offre (fournisseur actif obligatoire),
// et la protection requireGarant de l'endpoint de lecture exposant des prix (?epi_offres=).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

const W = loadWorker();

// ── Mock Graph générique pour le module Consultations EPI ──────────────────────────────────────
// config: { fournisseurs:[fields], consultation:fields, consultationLignes:[{id,fields}],
//           offres:[{id,fields}], offresLignes:[{id,fields}], onWrite(evt) }
function mockConsultationsEPI(t, config) {
  let counter = 0;
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });

    if (u.includes('/$batch')) {
      const body = JSON.parse(opts.body);
      const responses = body.requests.map((r) => {
        counter++;
        if (config.onWrite) config.onWrite({ batch: true, method: r.method, url: r.url, body: r.body });
        return { id: r.id, status: r.method === 'POST' ? 201 : 200, body: r.method === 'POST' ? { id: 'batch-item-' + counter } : {} };
      });
      return new Response(JSON.stringify({ responses }), { status: 200 });
    }

    if (/\/Fournisseurs\/items$/.test(u) && method === 'POST') {
      counter++;
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ id: 'fourn-new-' + counter }), { status: 200 });
    }
    if (/\/Fournisseurs\/items\/[^/?]+\/fields/.test(u) && method === 'PATCH') {
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (/\/Fournisseurs\/items/.test(u)) {
      return new Response(JSON.stringify({ value: (config.fournisseurs || []).map((f, i) => ({ id: f.__id || ('fourn' + i), fields: f })) }), { status: 200 });
    }

    if (/\/EPI_Consultations\/items\/[^/?]+\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify(config.consultation ? { fields: config.consultation } : {}), { status: config.consultation ? 200 : 404 });
    }
    if (/\/EPI_Consultations\/items\/[^/?]+\/fields/.test(u) && method === 'PATCH') {
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (/\/EPI_Consultations\/items$/.test(u) && method === 'POST') {
      counter++;
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ id: 'cons-new-' + counter }), { status: 200 });
    }
    if (/\/EPI_Consultations\/items\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }

    if (/\/EPI_Consultation_Lignes\/items\/[^/?]+\?/.test(u) && method === 'GET') {
      const m = /\/items\/([^/?]+)\?/.exec(u);
      const ligne = (config.consultationLignes || []).find((l) => l.id === m[1]);
      return new Response(JSON.stringify(ligne ? { fields: ligne.fields } : {}), { status: ligne ? 200 : 404 });
    }
    if (/\/EPI_Consultation_Lignes\/items\/[^/?]+\/fields/.test(u) && method === 'PATCH') {
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (/\/EPI_Consultation_Lignes\/items\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ value: (config.consultationLignes || []).map((l) => ({ id: l.id, fields: l.fields })) }), { status: 200 });
    }

    if (/\/EPI_Offres\/items$/.test(u) && method === 'POST') {
      counter++;
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ id: 'offre-new-' + counter }), { status: 200 });
    }
    if (/\/EPI_Offres\/items\/[^/?]+\/fields/.test(u) && method === 'PATCH') {
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (/\/EPI_Offres\/items\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ value: (config.offres || []).map((o) => ({ id: o.id, fields: o.fields })) }), { status: 200 });
    }

    if (/\/EPI_Offres_Lignes\/items\/[^/?]+\/fields/.test(u) && method === 'PATCH') {
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (/\/EPI_Offres_Lignes\/items\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ value: (config.offresLignes || []).map((l) => ({ id: l.id, fields: l.fields })) }), { status: 200 });
    }

    throw new Error('URL non mockée dans ce test : ' + method + ' ' + u);
  });
}

function postRequest(action, body) {
  return new Request('https://immo-proxy.test/?action=' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
}
function getRequest(qs) {
  return new Request('https://immo-proxy.test/?' + qs);
}

const FOURN_ACME = { Title: 'ACME Corp', Contact_Nom: 'Jean Dupont', Contact_Email: 'jean@acme.test', Contact_Telephone: '0600000000', Domaines: 'chaussures', Actif: 'Oui', Notes: '' };
async function garantToken() { return W.signSessionWith('XXXX', 'Logistique', SESSION_SECRET); }
async function adminToken() { return W.signSessionWith('AIWI', 'Admin', SESSION_SECRET); }

// ── Fournisseurs ─────────────────────────────────────────────────────────────────────────────

test('creer_fournisseur : crée le fournisseur, refuse un doublon', async (t) => {
  let ecrit = null;
  mockConsultationsEPI(t, { fournisseurs: [], onWrite: (evt) => { if (!evt.batch && evt.method === 'POST' && /Fournisseurs/.test(evt.url)) ecrit = evt.body.fields; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_fournisseur', { token, nom: 'ACME Corp', contact_nom: 'Jean Dupont' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Title, 'ACME Corp');
  assert.equal(ecrit.Contact_Nom, 'Jean Dupont');
  assert.equal(ecrit.Actif, 'Oui');
});

test('creer_fournisseur : refuse un doublon (nom déjà existant)', async (t) => {
  mockConsultationsEPI(t, { fournisseurs: [FOURN_ACME] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_fournisseur', { token, nom: 'ACME Corp' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'doublon');
});

test('creer_fournisseur : nom vide -> refusé', async (t) => {
  mockConsultationsEPI(t, { fournisseurs: [] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_fournisseur', { token, nom: '  ' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'donnees_invalides');
});

test('editer_fournisseur : PATCH partiel (contact), Actif toggle sans écraser le nom', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, { onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_fournisseur', { token, id: 'fourn0', actif: false }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Actif, 'Non');
  assert.equal(Object.prototype.hasOwnProperty.call(patched, 'Title'), false, 'le nom ne doit pas être touché si non transmis');
});

test('editer_fournisseur : renommer vers un nom déjà pris par un AUTRE fournisseur -> refusé', async (t) => {
  mockConsultationsEPI(t, { fournisseurs: [{ ...FOURN_ACME, __id: 'fourn0' }, { Title: 'Beta SARL', __id: 'fourn1' }] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_fournisseur', { token, id: 'fourn1', nom: 'ACME Corp' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'doublon');
});

test('editer_fournisseur : aucun champ transmis -> donnees_invalides', async (t) => {
  mockConsultationsEPI(t, {});
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_fournisseur', { token, id: 'fourn0' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'donnees_invalides');
});

// ── « Figer le besoin » (creer_consultation_epi) ────────────────────────────────────────────

test('creer_consultation_epi : crée l\'en-tête Brouillon + les lignes en $batch, Quantite_Retenue = Quantite_Calculee', async (t) => {
  const ecritures = [];
  mockConsultationsEPI(t, { onWrite: (evt) => { ecritures.push(evt); } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_consultation_epi', {
    token, titre: 'Consultation EPI 2027', annee_cible: 2027, parametres: { annee: 2027, marge_pourcentage: 10 },
    lignes: [
      { type_article: 'Pantalon', taille: '42', reference_interne: 'PANT-42', designation: 'Pantalon 42', quantite_reunion: 5, quantite_mayotte: 2, quantite_calculee: 7 },
      { type_article: 'Casque de chantier', taille: '', reference_interne: 'CASQ-STD', quantite_reunion: 3, quantite_mayotte: 1, quantite_calculee: 4 },
    ],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.lignes_ecrites, 2);

  const entete = ecritures.find((e) => !e.batch && e.method === 'POST');
  assert.equal(entete.body.fields.Title, 'Consultation EPI 2027');
  assert.equal(entete.body.fields.Annee_Cible, 2027);
  assert.equal(entete.body.fields.Statut, 'Brouillon');
  assert.equal(entete.body.fields.Cree_Par, 'XXXX', "l'auteur est résolu depuis le jeton de session, jamais depuis le corps de la requête");
  const parametres = JSON.parse(entete.body.fields.Parametres);
  assert.equal(parametres.marge_pourcentage, 10);

  const lignesEcrites = ecritures.filter((e) => e.batch && e.method === 'POST');
  assert.equal(lignesEcrites.length, 2);
  assert.equal(lignesEcrites[0].body.fields.Title, data.id, 'chaque ligne référence l\'id de la consultation créée, pas son titre');
  assert.equal(lignesEcrites[0].body.fields.Quantite_Calculee, 7);
  assert.equal(lignesEcrites[0].body.fields.Quantite_Retenue, 7, 'initialisée = Quantite_Calculee, pas 0');
  assert.equal(lignesEcrites[0].body.fields.Fournisseur_Retenu, '');
});

test('creer_consultation_epi : plus de 20 lignes -> écrites en plusieurs lots $batch (chunks de 20)', async (t) => {
  const ecrituresBatch = [];
  mockConsultationsEPI(t, { onWrite: (evt) => { if (evt.batch) ecrituresBatch.push(evt); } });
  const token = await garantToken();
  const lignes = Array.from({ length: 25 }, (_, i) => ({ type_article: 'Type' + i, taille: '', quantite_calculee: 1 }));
  const res = await W.handleRequest(postRequest('creer_consultation_epi', { token, titre: 'Grosse consultation', annee_cible: 2027, lignes }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.lignes_ecrites, 25, 'les 25 lignes sont bien écrites malgré le chunking interne (2 lots de $batch)');
  assert.equal(ecrituresBatch.length, 25);
});

test('creer_consultation_epi : sans titre, sans année, ou sans aucune ligne -> refusé', async (t) => {
  mockConsultationsEPI(t, {});
  const token = await garantToken();
  const r1 = await W.handleRequest(postRequest('creer_consultation_epi', { token, annee_cible: 2027, lignes: [{ type_article: 'X' }] }));
  assert.equal((await r1.json()).error, 'donnees_invalides');
  const r2 = await W.handleRequest(postRequest('creer_consultation_epi', { token, titre: 'X', lignes: [{ type_article: 'X' }] }));
  assert.equal((await r2.json()).error, 'donnees_invalides');
  const r3 = await W.handleRequest(postRequest('creer_consultation_epi', { token, titre: 'X', annee_cible: 2027, lignes: [] }));
  assert.equal((await r3.json()).error, 'donnees_invalides');
});

test('creer_consultation_epi : une ligne sans type_article -> refusé, rien écrit', async (t) => {
  let wrote = false;
  mockConsultationsEPI(t, { onWrite: () => { wrote = true; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_consultation_epi', { token, titre: 'X', annee_cible: 2027, lignes: [{ type_article: '', quantite_calculee: 1 }] }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'ligne_invalide');
  assert.equal(wrote, false);
});

// ── editer_consultation_epi ──────────────────────────────────────────────────────────────────

test('editer_consultation_epi : édite titre/date limite/notes, jamais Annee_Cible/Statut/Parametres', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, { onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_consultation_epi', { token, id: 'cons1', titre: 'Nouveau nom', date_limite_reponse: '2027-01-31', notes: 'note' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Title, 'Nouveau nom');
  assert.equal(patched.Date_Limite_Reponse, '2027-01-31');
  assert.equal(patched.Notes, 'note');
  assert.equal(Object.prototype.hasOwnProperty.call(patched, 'Annee_Cible'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patched, 'Statut'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patched, 'Parametres'), false);
});

test('editer_consultation_epi : date limite vidée -> null, jamais une chaîne vide', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, { onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_consultation_epi', { token, id: 'cons1', date_limite_reponse: '' }));
  assert.equal((await res.json()).success, true);
  assert.equal(patched.Date_Limite_Reponse, null);
});

// ── editer_ligne_consultation_epi (limité au statut Brouillon) ──────────────────────────────

test('editer_ligne_consultation_epi : édite Quantite_Retenue/Fournisseur_Retenu/Motif_Choix quand la consultation est Brouillon', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, {
    consultationLignes: [{ id: 'l1', fields: { Title: 'cons1', Type_Article: 'Pantalon', Quantite_Retenue: 7 } }],
    consultation: { Title: 'Consultation', Statut: 'Brouillon' },
    onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH' && /EPI_Consultation_Lignes/.test(evt.url)) patched = evt.body; },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_ligne_consultation_epi', { token, id: 'l1', quantite_retenue: 5, fournisseur_retenu: 'ACME Corp', motif_choix: 'Meilleur prix' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Quantite_Retenue, 5);
  assert.equal(patched.Fournisseur_Retenu, 'ACME Corp');
  assert.equal(patched.Motif_Choix, 'Meilleur prix');
});

test('editer_ligne_consultation_epi : refusé si la consultation parente est Envoyee (pas encore dépouillée)', async (t) => {
  let wrote = false;
  mockConsultationsEPI(t, {
    consultationLignes: [{ id: 'l1', fields: { Title: 'cons1', Type_Article: 'Pantalon', Quantite_Retenue: 7 } }],
    consultation: { Title: 'Consultation', Statut: 'Envoyee' },
    onWrite: () => { wrote = true; },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_ligne_consultation_epi', { token, id: 'l1', quantite_retenue: 5 }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'consultation_non_modifiable');
  assert.equal(data.statut, 'Envoyee');
  assert.equal(wrote, false);
});

test('editer_ligne_consultation_epi : refusé si la consultation parente est Attribuee/Cloturee/Annulee (arbitrage déjà acté)', async (t) => {
  for (const statut of ['Attribuee', 'Cloturee', 'Annulee']) {
    let wrote = false;
    mockConsultationsEPI(t, {
      consultationLignes: [{ id: 'l1', fields: { Title: 'cons1', Type_Article: 'Pantalon', Quantite_Retenue: 7 } }],
      consultation: { Title: 'Consultation', Statut: statut },
      onWrite: () => { wrote = true; },
    });
    const token = await garantToken();
    const res = await W.handleRequest(postRequest('editer_ligne_consultation_epi', { token, id: 'l1', fournisseur_retenu: 'ACME Corp' }));
    const data = await res.json();
    assert.equal(data.success, false, 'statut ' + statut);
    assert.equal(data.error, 'consultation_non_modifiable');
    assert.equal(wrote, false, 'statut ' + statut);
  }
});

test('editer_ligne_consultation_epi : AUTORISÉ pendant Depouillement (attribution : fournisseur retenu + motif), après réception des offres', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, {
    consultationLignes: [{ id: 'l1', fields: { Title: 'cons1', Type_Article: 'Pantalon', Quantite_Retenue: 7 } }],
    consultation: { Title: 'Consultation', Statut: 'Depouillement' },
    onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH' && /EPI_Consultation_Lignes/.test(evt.url)) patched = evt.body; },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_ligne_consultation_epi', { token, id: 'l1', fournisseur_retenu: 'ACME Corp', motif_choix: 'Meilleur prix ligne à ligne' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Fournisseur_Retenu, 'ACME Corp');
  assert.equal(patched.Motif_Choix, 'Meilleur prix ligne à ligne');
});

test('editer_ligne_consultation_epi : quantite_retenue négative -> refusé', async (t) => {
  mockConsultationsEPI(t, {
    consultationLignes: [{ id: 'l1', fields: { Title: 'cons1' } }],
    consultation: { Title: 'Consultation', Statut: 'Brouillon' },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_ligne_consultation_epi', { token, id: 'l1', quantite_retenue: -1 }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'quantite_invalide');
});

// ── changer_statut_consultation_epi (transitions validées côté serveur) ─────────────────────

test('changer_statut_consultation_epi : Brouillon -> Envoyee (transition autorisée)', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, { consultation: { Title: 'Consultation', Statut: 'Brouillon' }, onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('changer_statut_consultation_epi', { token, id: 'cons1', statut: 'Envoyee' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Statut, 'Envoyee');
});

test('changer_statut_consultation_epi : Brouillon -> Attribuee (saut d\'étape) -> refusé, rien écrit', async (t) => {
  let wrote = false;
  mockConsultationsEPI(t, { consultation: { Title: 'Consultation', Statut: 'Brouillon' }, onWrite: () => { wrote = true; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('changer_statut_consultation_epi', { token, id: 'cons1', statut: 'Attribuee' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'transition_invalide');
  assert.equal(data.statut_actuel, 'Brouillon');
  assert.deepEqual(data.transitions_autorisees, ['Envoyee', 'Annulee']);
  assert.equal(wrote, false);
});

test('changer_statut_consultation_epi : depuis un état terminal (Cloturee) -> toute transition refusée', async (t) => {
  mockConsultationsEPI(t, { consultation: { Title: 'Consultation', Statut: 'Cloturee' } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('changer_statut_consultation_epi', { token, id: 'cons1', statut: 'Envoyee' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'transition_invalide');
  assert.deepEqual(data.transitions_autorisees, []);
});

test('changer_statut_consultation_epi : Annulee depuis Depouillement (abandon à tout moment avant clôture) — motif tracé dans Notes sans écraser l\'existant', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, { consultation: { Title: 'Consultation', Statut: 'Depouillement', Notes: 'note initiale' }, onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('changer_statut_consultation_epi', { token, id: 'cons1', statut: 'Annulee', motif: 'plus de budget' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Statut, 'Annulee');
  assert.match(patched.Notes, /ANNULÉ/);
  assert.match(patched.Notes, /plus de budget/);
  assert.match(patched.Notes, /note initiale/, 'le commentaire existant est conservé, pas écrasé');
});

test('changer_statut_consultation_epi : statut hors liste fermée -> donnees_invalides', async (t) => {
  mockConsultationsEPI(t, {});
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('changer_statut_consultation_epi', { token, id: 'cons1', statut: 'Inconnu' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'donnees_invalides');
});

// ── creer_offre_epi / editer_offre_epi / editer_ligne_offre_epi ────────────────────────────

test('creer_offre_epi : crée l\'en-tête + les lignes, fournisseur actif requis', async (t) => {
  const ecritures = [];
  mockConsultationsEPI(t, {
    consultation: { Title: 'Consultation' },
    fournisseurs: [FOURN_ACME],
    onWrite: (evt) => { ecritures.push(evt); },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_offre_epi', {
    token, consultation_id: 'cons1', fournisseur: 'ACME Corp', devise: 'EUR',
    lignes: [{ ligne_consultation_id: 'l1', type_article: 'Pantalon', taille: '42', prix_unitaire_ht: 12.5, conditionnement: 10 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.lignes_ecrites, 1);
  const entete = ecritures.find((e) => !e.batch && e.method === 'POST' && /EPI_Offres\/items$/.test(e.url));
  assert.equal(entete.body.fields.Fournisseur, 'ACME Corp');
  assert.equal(entete.body.fields.Statut, 'Recue');
  const ligne = ecritures.find((e) => e.batch && e.method === 'POST');
  assert.equal(ligne.body.fields.Title, data.id);
  assert.equal(ligne.body.fields.Prix_Unitaire_HT, 12.5);
  assert.equal(ligne.body.fields.Non_Propose, 'Non');
});

test('creer_offre_epi : fournisseur inconnu -> refusé, rien écrit', async (t) => {
  let wrote = false;
  mockConsultationsEPI(t, { consultation: { Title: 'Consultation' }, fournisseurs: [], onWrite: () => { wrote = true; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_offre_epi', { token, consultation_id: 'cons1', fournisseur: 'Inconnu SARL', lignes: [] }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'fournisseur_invalide');
  assert.equal(wrote, false);
});

test('creer_offre_epi : fournisseur inactif -> refusé', async (t) => {
  mockConsultationsEPI(t, { consultation: { Title: 'Consultation' }, fournisseurs: [{ ...FOURN_ACME, Actif: 'Non' }] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_offre_epi', { token, consultation_id: 'cons1', fournisseur: 'ACME Corp', lignes: [] }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'fournisseur_invalide');
});

test('creer_offre_epi : consultation introuvable -> refusé', async (t) => {
  mockConsultationsEPI(t, { consultation: null, fournisseurs: [FOURN_ACME] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_offre_epi', { token, consultation_id: 'cons1', fournisseur: 'ACME Corp', lignes: [] }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'consultation_introuvable');
});

test('creer_offre_epi : statut Ecartee accepté explicitement', async (t) => {
  let ecrit = null;
  mockConsultationsEPI(t, {
    consultation: { Title: 'Consultation' }, fournisseurs: [FOURN_ACME],
    onWrite: (evt) => { if (!evt.batch && evt.method === 'POST' && /EPI_Offres\/items$/.test(evt.url)) ecrit = evt.body.fields; },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_offre_epi', { token, consultation_id: 'cons1', fournisseur: 'ACME Corp', statut: 'Ecartee', lignes: [] }));
  assert.equal((await res.json()).success, true);
  assert.equal(ecrit.Statut, 'Ecartee');
});

test('editer_offre_epi : PATCH partiel, dates vidées -> null, statut invalide refusé', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, { onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_offre_epi', { token, id: 'offre1', validite_offre: '', frais_port: 45.5 }));
  assert.equal((await res.json()).success, true);
  assert.equal(patched.Validite_Offre, null);
  assert.equal(patched.Frais_Port, 45.5);

  const res2 = await W.handleRequest(postRequest('editer_offre_epi', { token, id: 'offre1', statut: 'Inconnu' }));
  const data2 = await res2.json();
  assert.equal(data2.success, false);
  assert.equal(data2.error, 'statut_invalide');
});

test('editer_ligne_offre_epi : édite le prix et le drapeau non_propose', async (t) => {
  let patched = null;
  mockConsultationsEPI(t, { onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_ligne_offre_epi', { token, id: 'ol1', prix_unitaire_ht: 15.9, non_propose: true }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Prix_Unitaire_HT, 15.9);
  assert.equal(patched.Non_Propose, 'Oui');
});

// ── reporter_catalogue_epi (report au catalogue, D8) ────────────────────────────────────────
// Écrit Reference/Fournisseur sur Catalogue_Articles_EPI par lots de 20 ($batch) — jamais Stock_*
// ni Type_Article/Taille_*, uniquement les deux champs concernés par l'attribution.

test('reporter_catalogue_epi : écrit Reference/Fournisseur en $batch pour chaque ligne cochée', async (t) => {
  const ecrituresBatch = [];
  mockConsultationsEPI(t, { onWrite: (evt) => { if (evt.batch) ecrituresBatch.push(evt); } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('reporter_catalogue_epi', {
    token,
    rows: [
      { id: 'cat1', reference: 'PANT-42-ACME', fournisseur: 'ACME Corp' },
      { id: 'cat2', reference: 'CASQ-STD-BETA', fournisseur: 'Beta SARL' },
    ],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.ok, 2);
  assert.equal(ecrituresBatch.length, 2);
  const p1 = ecrituresBatch.find((e) => /items\/cat1\/fields/.test(e.url));
  assert.equal(p1.method, 'PATCH');
  assert.equal(p1.body.Reference, 'PANT-42-ACME');
  assert.equal(p1.body.Fournisseur, 'ACME Corp');
  assert.equal(Object.prototype.hasOwnProperty.call(p1.body, 'Stock_Actuel'), false, 'ne doit jamais toucher le stock');
});

test('reporter_catalogue_epi : plus de 20 lignes -> écrites en plusieurs lots $batch (chunks de 20)', async (t) => {
  const ecrituresBatch = [];
  mockConsultationsEPI(t, { onWrite: (evt) => { if (evt.batch) ecrituresBatch.push(evt); } });
  const token = await garantToken();
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: 'cat' + i, reference: 'REF' + i, fournisseur: 'ACME Corp' }));
  const res = await W.handleRequest(postRequest('reporter_catalogue_epi', { token, rows }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.ok, 25);
  assert.equal(ecrituresBatch.length, 25);
});

test('reporter_catalogue_epi : aucune ligne / lignes sans id -> donnees_invalides, rien écrit', async (t) => {
  let wrote = false;
  mockConsultationsEPI(t, { onWrite: () => { wrote = true; } });
  const token = await garantToken();
  const res1 = await W.handleRequest(postRequest('reporter_catalogue_epi', { token, rows: [] }));
  assert.equal((await res1.json()).error, 'donnees_invalides');
  const res2 = await W.handleRequest(postRequest('reporter_catalogue_epi', { token, rows: [{ reference: 'X', fournisseur: 'Y' }] }));
  assert.equal((await res2.json()).error, 'donnees_invalides');
  assert.equal(wrote, false);
});

test('reporter_catalogue_epi : sans jeton garant -> refusé, rien écrit', async (t) => {
  let wrote = false;
  mockConsultationsEPI(t, { onWrite: () => { wrote = true; } });
  const res = await W.handleRequest(postRequest('reporter_catalogue_epi', { rows: [{ id: 'cat1', reference: 'X', fournisseur: 'Y' }] }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(data.error === 'session_invalide' || data.error === 'droits_insuffisants');
  assert.equal(wrote, false);
});

// ── Lectures GET ─────────────────────────────────────────────────────────────────────────────

test('?fournisseurs=1 et ?epi_consultations=1 restent publics (aucun prix)', async (t) => {
  mockConsultationsEPI(t, { fournisseurs: [FOURN_ACME] });
  const res1 = await W.handleRequest(getRequest('fournisseurs=1'));
  const res2 = await W.handleRequest(getRequest('epi_consultations=1'));
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
  const data1 = await res1.json();
  assert.equal(data1[0].nom, 'ACME Corp');
});

test('?epi_consultation_lignes=<id> filtre par consultation, reste public (aucun prix)', async (t) => {
  mockConsultationsEPI(t, {
    consultationLignes: [
      { id: 'l1', fields: { Title: 'cons1', Type_Article: 'Pantalon', Quantite_Retenue: 5 } },
      { id: 'l2', fields: { Title: 'cons1', Type_Article: 'Casque', Quantite_Retenue: 2 } },
    ],
  });
  const res = await W.handleRequest(getRequest('epi_consultation_lignes=cons1'));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.length, 2);
  assert.equal(data[0].consultation_id, 'cons1');
});

test('?epi_offres=<id> sans jeton -> 401/403, rien exposé', async (t) => {
  mockConsultationsEPI(t, { offres: [] });
  const res = await W.handleRequest(getRequest('epi_offres=cons1'));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(res.status === 401 || res.status === 403);
});

test('?epi_offres=<id> avec un jeton non-garant (CT) -> droits_insuffisants', async (t) => {
  mockConsultationsEPI(t, {});
  const token = await W.signSessionWith('YYYY', 'CT', SESSION_SECRET);
  const res = await W.handleRequest(getRequest('epi_offres=cons1&token=' + token));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'droits_insuffisants');
});

test('?epi_offres=<id> avec un jeton garant valide -> renvoie les offres avec leurs lignes imbriquées, prix inclus', async (t) => {
  mockConsultationsEPI(t, {
    offres: [{ id: 'o1', fields: { Title: 'cons1', Fournisseur: 'ACME Corp', Statut: 'Recue' } }],
    offresLignes: [
      { id: 'ol1', fields: { Title: 'o1', Type_Article: 'Pantalon', Prix_Unitaire_HT: 12.5, Non_Propose: 'Non' } },
      { id: 'ol2', fields: { Title: 'autre-offre', Type_Article: 'Casque', Prix_Unitaire_HT: 5 } }, // n'appartient pas à o1
    ],
  });
  const token = await garantToken();
  const res = await W.handleRequest(getRequest('epi_offres=cons1&token=' + token));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.length, 1);
  assert.equal(data[0].fournisseur, 'ACME Corp');
  assert.equal(data[0].lignes.length, 1, 'seule la ligne appartenant à cette offre est incluse');
  assert.equal(data[0].lignes[0].prix_unitaire_ht, 12.5);
});

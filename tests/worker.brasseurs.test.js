// Tests du module « Brasseurs d'air » (négoce + pose, ajouté août 2026). Microsoft Graph est
// entièrement mocké — aucun appel réseau réel, aucune donnée SharePoint touchée. Couvre : les
// validations serveur (référence inconnue, dépôt invalide, propriétaire hors liste, signe/stock
// négatif), le transfert inter-dépôts (deux mouvements liés cohérents), la réception avec écart
// (statut Recue_Partielle vs Recue), la numérotation automatique des documents, et la protection
// requireGarant des endpoints exposant des prix (mêmes vérifications que security.export-liste.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorker } = require('./helpers/loadWorker');

const CLIENT_SECRET = 'fake-client-secret';
const SESSION_SECRET = 'fake-session-secret';
global.CLIENT_SECRET_ENV = CLIENT_SECRET;
global.SESSION_SECRET_ENV = SESSION_SECRET;

const W = loadWorker();

// ── Mock Graph générique pour le module Brasseurs ──────────────────────────────────────────────
// config: { depots:[fields], catalogue:[fields], mouvements:[fields], commande:fields,
//           lignesCommande:[{id,fields}], onWrite(evt) }
function mockBrasseurs(t, config) {
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

    if (/\/Brasseurs_Commandes\/items\/[^/?]+\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify(config.commande ? { fields: config.commande } : {}), { status: config.commande ? 200 : 404 });
    }
    if (/\/Brasseurs_Commandes\/items\/[^/?]+\/fields/.test(u) && method === 'PATCH') {
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (/\/Brasseurs_Commandes\/items\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }
    if (/\/Brasseurs_Commandes\/items$/.test(u) && method === 'POST') {
      counter++;
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ id: 'cmd-new-' + counter }), { status: 200 });
    }

    if (/\/Brasseurs_Mouvements\/items\/[^/?]+\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify(config.mouvementUnique ? { fields: config.mouvementUnique } : {}), { status: config.mouvementUnique ? 200 : 404 });
    }
    if (/\/Brasseurs_Mouvements\/items\/[^/?]+\/fields/.test(u) && method === 'PATCH') {
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (/\/Brasseurs_Mouvements\/items\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ value: (config.mouvements || []).map((f, i) => ({ id: 'mv' + i, fields: f })) }), { status: 200 });
    }
    if (/\/Brasseurs_Mouvements\/items$/.test(u) && method === 'POST') {
      counter++;
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ id: 'mv-new-' + counter }), { status: 200 });
    }

    if (/\/Brasseurs_Depots\/items$/.test(u) && method === 'POST') {
      counter++;
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ id: 'dep-new-' + counter }), { status: 200 });
    }
    if (/\/Brasseurs_Depots\/items/.test(u)) {
      return new Response(JSON.stringify({ value: (config.depots || []).map((f, i) => ({ id: 'dep' + i, fields: f })) }), { status: 200 });
    }
    if (/\/Brasseurs_Catalogue\/items$/.test(u) && method === 'POST') {
      counter++;
      if (config.onWrite) config.onWrite({ method, url: u, body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ id: 'cat-new-' + counter }), { status: 200 });
    }
    if (/\/Brasseurs_Catalogue\/items/.test(u)) {
      return new Response(JSON.stringify({ value: (config.catalogue || []).map((f, i) => ({ id: 'cat' + i, fields: f })) }), { status: 200 });
    }
    if (/\/Brasseurs_Lignes_Commande\/items\?/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ value: config.lignesCommande || [] }), { status: 200 });
    }
    if (/\/Employes\/items/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ value: (config.employes || []).map((f, i) => ({ id: 'emp' + i, fields: f })) }), { status: 200 });
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

const DEPOT_OMT = { Title: 'OMT', Nom_Complet: 'OM Transit', Prefixe_Document: 'OMT', Site: 'Reunion', Actif: 'Oui' };
const DEPOT_TC2 = { Title: 'TC2', Nom_Complet: 'TC N°2', Prefixe_Document: 'TC2', Site: 'Reunion', Actif: 'Oui' };
const CAT_BA = { Title: 'DCF-FS52920B', Designation: 'Brasseur blanc', Categorie: 'Brasseur', Stock_Mini: 0, Actif: 'Oui' };
const PROP_ESR = 'ELECTRICITE SERVICES REUNION';

async function garantToken() { return W.signSessionWith('XXXX', 'Logistique', SESSION_SECRET); }

// ── Ajout de dépôt / référence catalogue ────────────────────────────────────────────────────

test('ajouter_depot_brasseur : crée le dépôt, refuse un doublon', async (t) => {
  let ecrit = null;
  mockBrasseurs(t, { depots: [], onWrite: (evt) => { if (!evt.batch && evt.method === 'POST' && /Brasseurs_Depots/.test(evt.url)) ecrit = evt.body.fields; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('ajouter_depot_brasseur', { token, code: 'OMT', nom_complet: 'OM Transit', site: 'Reunion' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Title, 'OMT');
  assert.equal(ecrit.Nom_Complet, 'OM Transit');
  assert.equal(ecrit.Prefixe_Document, 'OMT', 'préfixe par défaut = le code si non fourni');
  assert.equal(ecrit.Actif, 'Oui');
});

test('ajouter_depot_brasseur : refuse un doublon (code déjà existant)', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_OMT] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('ajouter_depot_brasseur', { token, code: 'OMT' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'doublon');
});

test('ajouter_reference_brasseur : crée la référence, refuse un doublon', async (t) => {
  let ecrit = null;
  mockBrasseurs(t, { catalogue: [], onWrite: (evt) => { if (!evt.batch && evt.method === 'POST' && /Brasseurs_Catalogue/.test(evt.url)) ecrit = evt.body.fields; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('ajouter_reference_brasseur', { token, reference: 'DCF-FS52920B', designation: 'Brasseur blanc', categorie: 'Brasseur' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Title, 'DCF-FS52920B');
  assert.equal(ecrit.Designation, 'Brasseur blanc');
  assert.equal(ecrit.Actif, 'Oui');
});

test('ajouter_reference_brasseur : refuse un doublon (référence déjà existante)', async (t) => {
  mockBrasseurs(t, { catalogue: [CAT_BA] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('ajouter_reference_brasseur', { token, reference: 'DCF-FS52920B' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'doublon');
});

// ── Validations serveur ─────────────────────────────────────────────────────────────────────

test('creer_mouvement_brasseur : référence inconnue → refusé, rien écrit', async (t) => {
  let wrote = false;
  mockBrasseurs(t, { depots: [DEPOT_OMT], catalogue: [CAT_BA], mouvements: [], onWrite: () => { wrote = true; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'OMT', type_mouvement: 'Sortie', proprietaire: PROP_ESR, lignes: [{ reference: 'INCONNU', quantite: 5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'reference_inconnue');
  assert.equal(wrote, false);
});

test('creer_mouvement_brasseur : dépôt invalide → refusé', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_OMT], catalogue: [CAT_BA], mouvements: [] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'XXX', type_mouvement: 'Entree', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'depot_invalide');
});

test('creer_mouvement_brasseur : propriétaire hors liste fermée → refusé', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_OMT], catalogue: [CAT_BA], mouvements: [] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'OMT', type_mouvement: 'Entree', proprietaire: 'ALCLIMA', lignes: [{ reference: 'DCF-FS52920B', quantite: 5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'proprietaire_invalide');
});

test('creer_mouvement_brasseur : Sortie qui rendrait le stock négatif → bloqué avec message explicite', async (t) => {
  let wrote = false;
  mockBrasseurs(t, { depots: [DEPOT_OMT], catalogue: [CAT_BA], mouvements: [], onWrite: () => { wrote = true; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'OMT', type_mouvement: 'Sortie', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'stock_insuffisant');
  assert.equal(data.stock_actuel, 0);
  assert.equal(data.demande, 5);
  assert.equal(wrote, false, 'aucune écriture ne doit avoir lieu si une ligne échoue (tout ou rien)');
});

test('creer_mouvement_brasseur : Sortie couverte par le stock existant → acceptée, quantité écrite négative', async (t) => {
  let ecrit = null;
  mockBrasseurs(t, {
    depots: [DEPOT_OMT], catalogue: [CAT_BA],
    mouvements: [{ Title: 'DCF-FS52920B', Depot: 'OMT', Proprietaire: PROP_ESR, Quantit_x00e9_: 10 }],
    onWrite: (evt) => { if (evt.batch && evt.method === 'POST') ecrit = evt.body.fields; },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'OMT', type_mouvement: 'Sortie', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 4 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Quantit_x00e9_, -4, 'le signe est déterminé par le type de mouvement, pas par le client');
  assert.equal(ecrit.Code_Employe, 'XXXX', "l'auteur est résolu depuis le jeton de session, jamais depuis le corps de la requête");
  assert.equal(ecrit.Cree_Par, 'XXXX');
});

test('creer_mouvement_brasseur : quantité positive obligatoire pour Entree/Sortie (le signe se déduit du type)', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_OMT], catalogue: [CAT_BA], mouvements: [] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'OMT', type_mouvement: 'Entree', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: -3 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'quantite_invalide');
});

test('creer_mouvement_brasseur : recalage Inventaire calcule et écrit un écart signé (stock cible − stock actuel)', async (t) => {
  let ecrit = null;
  mockBrasseurs(t, {
    depots: [DEPOT_OMT], catalogue: [CAT_BA],
    mouvements: [{ Title: 'DCF-FS52920B', Depot: 'OMT', Proprietaire: PROP_ESR, Quantit_x00e9_: 6 }],
    onWrite: (evt) => { if (evt.batch && evt.method === 'POST') ecrit = evt.body.fields; },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'OMT', type_mouvement: 'Inventaire', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 9 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Quantit_x00e9_, 3, 'stock cible 9 - stock actuel 6 = écart +3');
  assert.equal(ecrit.Type_Mouvement, 'Inventaire');
});

test('creer_mouvement_brasseur : recalage Inventaire sans écart → aucune ligne écrite', async (t) => {
  let wrote = false;
  mockBrasseurs(t, {
    depots: [DEPOT_OMT], catalogue: [CAT_BA],
    mouvements: [{ Title: 'DCF-FS52920B', Depot: 'OMT', Proprietaire: PROP_ESR, Quantit_x00e9_: 6 }],
    onWrite: () => { wrote = true; },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'OMT', type_mouvement: 'Inventaire', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 6 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'aucune_ligne_a_ecrire');
  assert.equal(wrote, false);
});

// ── Transfert inter-dépôts ───────────────────────────────────────────────────────────────────

test('transfert_brasseur : génère deux mouvements liés cohérents (Transfert_Sortie ↔ Transfert_Entree)', async (t) => {
  const ecritures = [];
  mockBrasseurs(t, {
    depots: [DEPOT_OMT, DEPOT_TC2], catalogue: [CAT_BA],
    mouvements: [{ Title: 'DCF-FS52920B', Depot: 'OMT', Proprietaire: PROP_ESR, Quantit_x00e9_: 10 }],
    onWrite: (evt) => { ecritures.push(evt); },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('transfert_brasseur', {
    token, depot_source: 'OMT', depot_destination: 'TC2', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 3 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.paires.length, 1);
  assert.equal(data.paires[0].id_sortie, 'mv-new-1');
  assert.equal(data.paires[0].id_entree, 'mv-new-2');

  const postes = ecritures.filter((e) => e.method === 'POST');
  assert.equal(postes.length, 2);
  const sortie = postes[0].body.fields, entree = postes[1].body.fields;
  assert.equal(sortie.Type_Mouvement, 'Transfert_Sortie');
  assert.equal(sortie.Depot, 'OMT');
  assert.equal(sortie.Quantit_x00e9_, -3);
  assert.equal(entree.Type_Mouvement, 'Transfert_Entree');
  assert.equal(entree.Depot, 'TC2');
  assert.equal(entree.Quantit_x00e9_, 3);
  assert.equal(entree.Transfert_Lien, 'mv-new-1', "l'entrée référence la sortie dès sa création");
  assert.equal(sortie.Document, entree.Document, 'les deux mouvements partagent le même numéro de document');

  const patches = ecritures.filter((e) => e.method === 'PATCH');
  assert.equal(patches.length, 1);
  assert.equal(patches[0].body.Transfert_Lien, 'mv-new-2', 'la sortie est mise à jour après coup pour référencer l\'entrée');
});

test('transfert_brasseur : même dépôt source/destination → refusé', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_OMT], catalogue: [CAT_BA], mouvements: [] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('transfert_brasseur', {
    token, depot_source: 'OMT', depot_destination: 'OMT', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 1 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'donnees_invalides');
});

test('transfert_brasseur : stock insuffisant au dépôt source → refusé', async (t) => {
  mockBrasseurs(t, {
    depots: [DEPOT_OMT, DEPOT_TC2], catalogue: [CAT_BA],
    mouvements: [{ Title: 'DCF-FS52920B', Depot: 'OMT', Proprietaire: PROP_ESR, Quantit_x00e9_: 2 }],
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('transfert_brasseur', {
    token, depot_source: 'OMT', depot_destination: 'TC2', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'stock_insuffisant');
});

// ── Création et édition de commande ─────────────────────────────────────────────────────────

test('creer_commande_brasseur : champs Date optionnels laissés vides -> null, jamais une chaîne vide (Graph refuse "" sur une colonne Date)', async (t) => {
  // Bug réel trouvé en test recette (11 août 2026) : Date_Arrivee_Estimee: '' faisait échouer
  // l'écriture SharePoint avec "One of the provided arguments is not acceptable" dès que le champ
  // optionnel "Arrivée estimée" était laissé vide dans le formulaire.
  let ecrit = null;
  mockBrasseurs(t, { catalogue: [CAT_BA], onWrite: (evt) => { if (!evt.batch && evt.method === 'POST' && /Brasseurs_Commandes/.test(evt.url)) ecrit = evt.body.fields; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_commande_brasseur', {
    token, origine: 'International', fournisseur: '1stShine', date_commande: '2026-08-11',
    // acompte_pourcentage / date_arrivee_estimee volontairement vides, comme un formulaire non rempli
    acompte_pourcentage: '', date_arrivee_estimee: '',
    lignes: [{ reference: 'DCF-FS52920B', quantite_commandee: 5, prix_unitaire: 3.5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Date_Arrivee_Estimee, null);
  assert.notEqual(ecrit.Date_Arrivee_Estimee, '', "jamais une chaîne vide sur une colonne Date SharePoint");
  assert.equal(ecrit.Acompte_Pourcentage, null);
});

test('creer_commande_brasseur : origine invalide -> refusé', async (t) => {
  mockBrasseurs(t, { catalogue: [CAT_BA] });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_commande_brasseur', {
    token, origine: 'Mars', lignes: [{ reference: 'DCF-FS52920B', quantite_commandee: 5, prix_unitaire: 3.5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'donnees_invalides');
});

test('creer_commande_brasseur : numéro auto (CMD.AA.MM.NNN) si aucun n° de PI fourni', async (t) => {
  let titre = null;
  mockBrasseurs(t, { catalogue: [CAT_BA], onWrite: (evt) => { if (!evt.batch && evt.method === 'POST' && /Brasseurs_Commandes/.test(evt.url)) titre = evt.body.fields.Title; } });
  const now = new Date();
  const aa = String(now.getFullYear()).slice(-2), mm = String(now.getMonth() + 1).padStart(2, '0');
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_commande_brasseur', {
    token, origine: 'Local', fournisseur: 'Alclima', lignes: [{ reference: 'DCF-FS52920B', quantite_commandee: 2, prix_unitaire: 40 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(titre, 'CMD.' + aa + '.' + mm + '.001');
  assert.equal(data.reference, titre);
});

test('editer_commande_brasseur : date vidée explicitement -> null, jamais une chaîne vide', async (t) => {
  let patched = null;
  mockBrasseurs(t, { onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_commande_brasseur', { token, id: 'cmd1', date_arrivee_estimee: '' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Date_Arrivee_Estimee, null);
});

test('editer_commande_brasseur : date_arrivee_reelle transmise telle quelle, vidée -> null (même convention que date_arrivee_estimee)', async (t) => {
  let patched = null;
  mockBrasseurs(t, { onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; } });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_commande_brasseur', { token, id: 'cmd1', date_arrivee_reelle: '2026-10-15' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Date_Arrivee_Reelle, '2026-10-15');

  const res2 = await W.handleRequest(postRequest('editer_commande_brasseur', { token, id: 'cmd1', date_arrivee_reelle: '' }));
  assert.equal((await res2.json()).success, true);
  assert.equal(patched.Date_Arrivee_Reelle, null);
});

test('editer_commande_brasseur : échec Graph (ex. colonne inconnue) renvoie un message exploitable, pas juste success:false', async (t) => {
  t.mock.method(global, 'fetch', async (url, opts) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'fake-graph-token' }), { status: 200 });
    if (/\/Brasseurs_Commandes\/items\/[^/?]+\/fields/.test(u) && opts.method === 'PATCH') {
      return new Response(JSON.stringify({ error: { message: "Field 'Date_Arrivee_Reelle' is not recognized." } }), { status: 400 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_commande_brasseur', { token, id: 'cmd1', date_arrivee_reelle: '2026-10-15' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'sharepoint');
  assert.match(data.message, /Date_Arrivee_Reelle/);
});

test('editer_commande_brasseur : statut hors liste fermée -> refusé', async (t) => {
  mockBrasseurs(t, {});
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('editer_commande_brasseur', { token, id: 'cmd1', statut: 'Livree' }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'statut_invalide');
});

// ── Réception de commande avec écart ────────────────────────────────────────────────────────

test('reception_commande_brasseur : réception partielle → statut Recue_Partielle, écart lisible (commandée − reçue)', async (t) => {
  const ecritures = [];
  mockBrasseurs(t, {
    depots: [DEPOT_OMT],
    commande: { Title: 'CMD.26.08.001', Fournisseur: '1stShine', Statut: 'En attente' },
    lignesCommande: [
      { id: 'l1', fields: { Title: 'cmd1', Reference: 'DCF-FS52920B', Quantite_Commandee: 10, Quantite_Recue: 0, Prix_Unitaire: 50 } },
      { id: 'l2', fields: { Title: 'cmd1', Reference: 'CMD-M', Quantite_Commandee: 5, Quantite_Recue: 0, Prix_Unitaire: 10 } },
    ],
    onWrite: (evt) => { ecritures.push(evt); },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('reception_commande_brasseur', {
    token, commande_id: 'cmd1', depot: 'OMT', proprietaire: PROP_ESR, lignes: [{ ligne_id: 'l1', quantite_recue: 4 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.statut, 'Recue_Partielle', '4/10 reçu sur une ligne, 0/5 sur l\'autre : réception partielle');

  const mvtPost = ecritures.find((e) => e.batch && e.method === 'POST');
  assert.equal(mvtPost.body.fields.Quantit_x00e9_, 4);
  assert.equal(mvtPost.body.fields.Type_Mouvement, 'Entree');
  assert.equal(mvtPost.body.fields.Tiers, '1stShine');

  const lignePatch = ecritures.find((e) => e.batch && e.method === 'PATCH');
  assert.equal(lignePatch.body.Quantite_Recue, 4, 'écart restant = 10 − 4 = 6, lisible directement (Quantite_Commandee − Quantite_Recue)');

  const statutPatch = ecritures.find((e) => !e.batch && e.method === 'PATCH');
  assert.equal(statutPatch.body.Statut, 'Recue_Partielle');
});

test('reception_commande_brasseur : toutes les lignes soldées → statut Recue', async (t) => {
  mockBrasseurs(t, {
    depots: [DEPOT_OMT],
    commande: { Title: 'CMD.26.08.001', Fournisseur: '1stShine', Statut: 'Recue_Partielle' },
    lignesCommande: [
      { id: 'l1', fields: { Title: 'cmd1', Reference: 'DCF-FS52920B', Quantite_Commandee: 10, Quantite_Recue: 10 } },
      { id: 'l2', fields: { Title: 'cmd1', Reference: 'CMD-M', Quantite_Commandee: 5, Quantite_Recue: 0 } },
    ],
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('reception_commande_brasseur', {
    token, commande_id: 'cmd1', depot: 'OMT', proprietaire: PROP_ESR, lignes: [{ ligne_id: 'l2', quantite_recue: 5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.statut, 'Recue', 'les deux lignes sont désormais soldées (10/10 et 5/5)');
});

// ── Annulation (convention "quantité 0", jamais de suppression) ────────────────────────────────

test('annuler_mouvement_brasseur : ramène la quantité à 0 et trace le motif en commentaire, ne supprime rien', async (t) => {
  let patched = null;
  mockBrasseurs(t, {
    mouvementUnique: { Title: 'DCF-FS52920B', Quantit_x00e9_: -4, Commentaire: 'note initiale' },
    onWrite: (evt) => { if (!evt.batch && evt.method === 'PATCH') patched = evt.body; },
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('annuler_mouvement_brasseur', { token, id: 'mv1', motif: 'erreur de saisie' }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(patched.Quantit_x00e9_, 0);
  assert.match(patched.Commentaire, /ANNULÉ/);
  assert.match(patched.Commentaire, /erreur de saisie/);
  assert.match(patched.Commentaire, /note initiale/, 'le commentaire existant est conservé, pas écrasé');
});

// ── Numérotation automatique ─────────────────────────────────────────────────────────────────

test('creer_mouvement_brasseur : numéro de document au format {PREFIXE}.{AA}.{MM}.{NNN}, repris à partir du max existant', async (t) => {
  const now = new Date();
  const aa = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  mockBrasseurs(t, {
    depots: [DEPOT_OMT], catalogue: [CAT_BA],
    mouvements: [
      { Title: 'DCF-FS52920B', Depot: 'OMT', Proprietaire: PROP_ESR, Quantit_x00e9_: 20, Document: 'OMT.' + aa + '.' + mm + '.005' },
      { Title: 'DCF-FS52920B', Depot: 'OMT', Proprietaire: PROP_ESR, Quantit_x00e9_: 1, Document: 'TC2.' + aa + '.' + mm + '.099' }, // préfixe différent : ignoré
    ],
  });
  const token = await garantToken();
  const res = await W.handleRequest(postRequest('creer_mouvement_brasseur', {
    token, depot: 'OMT', type_mouvement: 'Entree', proprietaire: PROP_ESR, lignes: [{ reference: 'DCF-FS52920B', quantite: 1 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.document, 'OMT.' + aa + '.' + mm + '.006');
});

// ── Protection des endpoints exposant des prix (cadrage §3.e) ──────────────────────────────────

test('?brasseurs_commandes=1 sans jeton → 401/403, aucun prix exposé', async (t) => {
  mockBrasseurs(t, { commande: null });
  const res = await W.handleRequest(getRequest('brasseurs_commandes=1'));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(res.status === 401 || res.status === 403);
});

test('?brasseurs_commandes=1 avec un jeton non-garant (CT) → droits_insuffisants', async (t) => {
  mockBrasseurs(t, {});
  const token = await W.signSessionWith('YYYY', 'CT', SESSION_SECRET);
  const res = await W.handleRequest(getRequest('brasseurs_commandes=1&token=' + token));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'droits_insuffisants');
});

test('?brasseurs_lignes_commande=1 avec un jeton garant valide → accès autorisé, prix renvoyés', async (t) => {
  mockBrasseurs(t, { lignesCommande: [{ id: 'l1', fields: { Title: 'cmd1', Reference: 'DCF-FS52920B', Quantite_Commandee: 10, Prix_Unitaire: 42.5, Quantite_Recue: 0 } }] });
  const token = await garantToken();
  const res = await W.handleRequest(getRequest('brasseurs_lignes_commande=1&token=' + token));
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.equal(data[0].prix_unitaire, 42.5);
});

test('?brasseurs_stock=1 et ?brasseurs_mouvements=1 restent publics (aucun prix, même confiance que ?catalogue_epi=1)', async (t) => {
  mockBrasseurs(t, { mouvements: [{ Title: 'DCF-FS52920B', Depot: 'OMT', Proprietaire: PROP_ESR, Quantit_x00e9_: 5 }] });
  const res1 = await W.handleRequest(getRequest('brasseurs_stock=1'));
  const res2 = await W.handleRequest(getRequest('brasseurs_mouvements=1'));
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
});

// ── sortie_stock_brasseur_pwa (PWA, sans jeton — retour terrain, ajouté août 2026) ─────────────

const EMP_OUVRIER = { Title: 'OUVR', field_1: 'Ouvrier Test', field_2: 'Oui', Code_CT: 'Ouvrier' };
const EMP_OUVRIER_SPE = { Title: 'OUVS', field_1: 'Ouvrier Spécialisé Test', field_2: 'Oui', Code_CT: 'Ouvrier_Specialise' };
const EMP_CT_SPE = { Title: 'CTSP', field_1: 'CT Spécialisé Test', field_2: 'Oui', Code_CT: 'CT_Specialise' };
const EMP_CT = { Title: 'CTXX', field_1: 'CT Test', field_2: 'Oui', Code_CT: 'CT' };
const EMP_RA = { Title: 'RAXX', field_1: 'RA Test', field_2: 'Oui', Code_CT: 'RA' };
const EMP_LOGI = { Title: 'LOGX', field_1: 'Logistique Test', field_2: 'Oui', Code_CT: 'Logistique' };
const EMP_ADMIN = { Title: 'ADMX', field_1: 'Admin Test', field_2: 'Oui', Code_CT: 'Admin' };
const EMP_ENCADREMENT = { Title: 'ENCA', field_1: 'Encadrement Test', field_2: 'Oui', Code_CT: 'Encadrement' };
const EMP_INACTIF = { Title: 'INAC', field_1: 'Ouvrier Inactif', field_2: 'Non', Code_CT: 'Ouvrier' };
const EMP_SANS_ROLE = { Title: 'NORO', field_1: 'Sans rôle', field_2: 'Oui', Code_CT: '' };

const MVT_STOCK_TC2_200 = { Title: 'DCF-FS52920B', Depot: 'TC2', Proprietaire: PROP_ESR, Quantit_x00e9_: 200 };

test('sortie_stock_brasseur_pwa : Ouvrier plafonné à 10 par référence — refusé au-delà', async (t) => {
  let wrote = false;
  mockBrasseurs(t, { depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_OUVRIER], mouvements: [MVT_STOCK_TC2_200], onWrite: () => { wrote = true; } });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'OUVR', depot: 'TC2', destination: 'Maintenance', lignes: [{ reference: 'DCF-FS52920B', quantite: 11 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'quantite_plafonnee');
  assert.equal(data.plafond, 10);
  assert.equal(wrote, false, 'tout ou rien : rien ne doit être écrit si une ligne dépasse le plafond');
});

test('sortie_stock_brasseur_pwa : Ouvrier — accepté jusqu\'à 10', async (t) => {
  let ecrit = null;
  mockBrasseurs(t, {
    depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_OUVRIER], mouvements: [MVT_STOCK_TC2_200],
    onWrite: (evt) => { if (evt.batch && evt.method === 'POST') ecrit = evt.body.fields; },
  });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'OUVR', depot: 'TC2', destination: 'Chantier Bellepierre', lignes: [{ reference: 'DCF-FS52920B', quantite: 10 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Quantit_x00e9_, -10);
});

for (const emp of [EMP_CT, EMP_RA, EMP_LOGI, EMP_ADMIN, EMP_ENCADREMENT]) {
  test('sortie_stock_brasseur_pwa : ' + emp.Code_CT + ' — illimité, une sortie de 120 unités est acceptée', async (t) => {
    let ecrit = null;
    mockBrasseurs(t, {
      depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [emp], mouvements: [MVT_STOCK_TC2_200],
      onWrite: (evt) => { if (evt.batch && evt.method === 'POST') ecrit = evt.body.fields; },
    });
    const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
      code_employe: emp.Title, depot: 'TC2', destination: 'Chantier gros chantier', lignes: [{ reference: 'DCF-FS52920B', quantite: 120 }],
    }));
    const data = await res.json();
    assert.equal(data.success, true, JSON.stringify(data));
    assert.equal(ecrit.Quantit_x00e9_, -120);
  });
}

for (const emp of [EMP_OUVRIER_SPE, EMP_CT_SPE]) {
  test('sortie_stock_brasseur_pwa : ' + emp.Code_CT + ' plafonné comme Ouvrier (ne touche pas aux BA)', async (t) => {
    mockBrasseurs(t, { depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [emp], mouvements: [MVT_STOCK_TC2_200] });
    const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
      code_employe: emp.Title, depot: 'TC2', destination: 'Maintenance', lignes: [{ reference: 'DCF-FS52920B', quantite: 15 }],
    }));
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'quantite_plafonnee');
    assert.equal(data.plafond, 10);
  });
}

test('sortie_stock_brasseur_pwa : rôle vide/inconnu (ou employé absent de la liste) → plafonné par défaut prudent', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_SANS_ROLE], mouvements: [MVT_STOCK_TC2_200] });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'NORO', depot: 'TC2', destination: 'Maintenance', lignes: [{ reference: 'DCF-FS52920B', quantite: 15 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'quantite_plafonnee');
  assert.equal(data.plafond, 10);
});

test('sortie_stock_brasseur_pwa : stock insuffisant → refusé, rien écrit', async (t) => {
  let wrote = false;
  mockBrasseurs(t, {
    depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_CT],
    mouvements: [{ Title: 'DCF-FS52920B', Depot: 'TC2', Proprietaire: PROP_ESR, Quantit_x00e9_: 2 }],
    onWrite: () => { wrote = true; },
  });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'CTXX', depot: 'TC2', destination: 'Maintenance', lignes: [{ reference: 'DCF-FS52920B', quantite: 5 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'stock_insuffisant');
  assert.equal(data.stock_actuel, 2);
  assert.equal(wrote, false);
});

for (const dest of ['Négoce', 'negoce', 'NÉGOCE', 'Negoce']) {
  test('sortie_stock_brasseur_pwa : destination "' + dest + '" refusée, réservée au dashboard', async (t) => {
    mockBrasseurs(t, { depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_CT], mouvements: [MVT_STOCK_TC2_200] });
    const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
      code_employe: 'CTXX', depot: 'TC2', destination: dest, lignes: [{ reference: 'DCF-FS52920B', quantite: 1 }],
    }));
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'destination_reservee_dashboard');
  });
}

test('sortie_stock_brasseur_pwa : propriétaire toujours ELECTRICITE SERVICES REUNION, même si le client en transmet un autre', async (t) => {
  let ecrit = null;
  mockBrasseurs(t, {
    depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_CT], mouvements: [MVT_STOCK_TC2_200],
    onWrite: (evt) => { if (evt.batch && evt.method === 'POST') ecrit = evt.body.fields; },
  });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'CTXX', depot: 'TC2', proprietaire: '1ST SHINE', destination: 'Maintenance', lignes: [{ reference: 'DCF-FS52920B', quantite: 1 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Proprietaire, PROP_ESR);
});

test('sortie_stock_brasseur_pwa : dépôt inconnu → refusé', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_CT] });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'CTXX', depot: 'XXX', destination: 'Maintenance', lignes: [{ reference: 'DCF-FS52920B', quantite: 1 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'depot_invalide');
});

test('sortie_stock_brasseur_pwa : dépôt inactif → refusé', async (t) => {
  mockBrasseurs(t, { depots: [{ ...DEPOT_TC2, Actif: 'Non' }], catalogue: [CAT_BA], employes: [EMP_CT] });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'CTXX', depot: 'TC2', destination: 'Maintenance', lignes: [{ reference: 'DCF-FS52920B', quantite: 1 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'depot_invalide');
});

test('sortie_stock_brasseur_pwa : employé inactif → refusé', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_INACTIF], mouvements: [MVT_STOCK_TC2_200] });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'INAC', depot: 'TC2', destination: 'Maintenance', lignes: [{ reference: 'DCF-FS52920B', quantite: 1 }],
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'employe_inactif');
});

test('sortie_stock_brasseur_pwa : plus de 5 lignes → refusé', async (t) => {
  mockBrasseurs(t, { depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_CT] });
  const lignes = Array.from({ length: 6 }, () => ({ reference: 'DCF-FS52920B', quantite: 1 }));
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'CTXX', depot: 'TC2', destination: 'Maintenance', lignes,
  }));
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'trop_de_lignes');
});

test('sortie_stock_brasseur_pwa : Cree_Par vide (marqueur origine PWA), Code_Employe = badge scanné, Type_Mouvement = Sortie, document numéroté sur le préfixe du dépôt', async (t) => {
  let ecrit = null;
  mockBrasseurs(t, {
    depots: [DEPOT_TC2], catalogue: [CAT_BA], employes: [EMP_CT], mouvements: [MVT_STOCK_TC2_200],
    onWrite: (evt) => { if (evt.batch && evt.method === 'POST') ecrit = evt.body.fields; },
  });
  const res = await W.handleRequest(postRequest('sortie_stock_brasseur_pwa', {
    code_employe: 'ctxx', depot: 'tc2', destination: 'Chantier Test', lignes: [{ reference: 'dcf-fs52920b', quantite: 2 }],
  }));
  const data = await res.json();
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(ecrit.Cree_Par, '', 'aucune session : Cree_Par doit rester vide, c\'est le marqueur d\'origine PWA côté dashboard');
  assert.equal(ecrit.Code_Employe, 'CTXX');
  assert.equal(ecrit.Type_Mouvement, 'Sortie');
  assert.match(ecrit.Document, /^TC2\.\d{2}\.\d{2}\.\d{3}$/);
});

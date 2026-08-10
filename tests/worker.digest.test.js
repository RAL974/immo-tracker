// Digest hebdomadaire (?digest=1) — règles de sélection pures, testées avec des jeux de données
// factices (aucun appel réseau). Voir 04_HISTORIQUE_DECISIONS.md pour le contexte de cette
// fonctionnalité et 01_ARCHITECTURE_TECHNIQUE.md pour le flux Power Automate qui consomme l'endpoint.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadWorker } = require('./helpers/loadWorker');

const W = loadWorker();

// Référence temporelle fixe pour des calculs de jours déterministes.
const NOW = new Date('2026-08-10T08:00:00Z').getTime();
const joursAvant = (n) => new Date(NOW - n * 86400000).toISOString();

// ── digestTransfertsEnAttente ────────────────────────────────────────────────────────────────
test('digestTransfertsEnAttente : retient un transfert En attente depuis plus de 7 jours', () => {
  const pending = [
    { code_im: 'IM000001', statut: 'En attente', horodatage: joursAvant(8) },
    { code_im: 'IM000002', statut: 'En attente', horodatage: joursAvant(5) },
    { code_im: 'IM000003', statut: 'Validé', horodatage: joursAvant(30) },
  ];
  const r = W.digestTransfertsEnAttente(pending, NOW, 7);
  assert.deepEqual(r.map(t => t.code_im), ['IM000001']);
});

test('digestTransfertsEnAttente : trie du plus ancien au plus récent (jours décroissants)', () => {
  const pending = [
    { code_im: 'IM000001', statut: 'En attente', horodatage: joursAvant(9) },
    { code_im: 'IM000002', statut: 'En attente', horodatage: joursAvant(20) },
  ];
  const r = W.digestTransfertsEnAttente(pending, NOW, 7);
  assert.deepEqual(r.map(t => t.code_im), ['IM000002', 'IM000001']);
});

// ── digestGarantiesProches ────────────────────────────────────────────────────────────────────
// Construit une date de mise en service telle que (dref + 2 ans) tombe `joursRestants` jours après
// NOW — utilise setFullYear (comme digestGarantiesProches) plutôt qu'une approximation en jours/365,
// qui dérive à cause des années bissextiles.
function dateMiseServicePourGarantie(joursRestants) {
  const fin = new Date(NOW + joursRestants * 86400000);
  fin.setFullYear(fin.getFullYear() - 2);
  return fin.toISOString();
}

test('digestGarantiesProches : retient une immo dont la garantie (mise en service + 2 ans) expire sous 30 jours', () => {
  const immos = [
    { code_im: 'IM000001', date_mise_service: dateMiseServicePourGarantie(20), compte_immobilisation: '21541', actif: true },
    // expire dans 40 jours -> hors seuil (30j)
    { code_im: 'IM000002', date_mise_service: dateMiseServicePourGarantie(40), compte_immobilisation: '21541', actif: true },
    // déjà expirée -> exclue
    { code_im: 'IM000003', date_mise_service: dateMiseServicePourGarantie(-10), compte_immobilisation: '21541', actif: true },
  ];
  const r = W.digestGarantiesProches(immos, NOW, W.DIGEST_SEUILS);
  assert.deepEqual(r.map(g => g.code_im), ['IM000001']);
});

test('digestGarantiesProches : exclut les comptes administratifs, sauf exception étiqueteuse', () => {
  const dref = dateMiseServicePourGarantie(15);
  const immos = [
    { code_im: 'IM000010', date_mise_service: dref, compte_immobilisation: '2183', actif: true }, // administratif -> exclue
    { code_im: 'IM000272', date_mise_service: dref, compte_immobilisation: '2183', actif: true }, // étiqueteuse -> exception, incluse
  ];
  const r = W.digestGarantiesProches(immos, NOW, W.DIGEST_SEUILS);
  assert.deepEqual(r.map(g => g.code_im), ['IM000272']);
});

test('digestGarantiesProches : ignore une immo inactive et une immo sans date de référence', () => {
  const dref = dateMiseServicePourGarantie(15);
  const immos = [
    { code_im: 'IM000020', date_mise_service: dref, compte_immobilisation: '21541', actif: false },
    { code_im: 'IM000021', compte_immobilisation: '21541', actif: true },
  ];
  const r = W.digestGarantiesProches(immos, NOW, W.DIGEST_SEUILS);
  assert.deepEqual(r, []);
});

// ── digestPannesNonResolues ───────────────────────────────────────────────────────────────────
test('digestPannesNonResolues : retient une immo dont le DERNIER mouvement est une Panne, depuis plus de 7 jours', () => {
  const mouvements = [
    { code_im: 'IM000001', type_mouvement: 'Panne', horodatage: joursAvant(10) },
    { code_im: 'IM000002', type_mouvement: 'Panne', horodatage: joursAvant(10) },
    { code_im: 'IM000002', type_mouvement: 'Réparation', horodatage: joursAvant(2) }, // résolue depuis -> exclue
    { code_im: 'IM000003', type_mouvement: 'Panne', horodatage: joursAvant(3) }, // trop récente -> exclue
  ];
  const r = W.digestPannesNonResolues(mouvements, NOW, 7);
  assert.deepEqual(r.map(p => p.code_im), ['IM000001']);
});

test('digestPannesNonResolues : un Transfert plus récent qu\'une Panne ferme l\'incident', () => {
  const mouvements = [
    { code_im: 'IM000001', type_mouvement: 'Panne', horodatage: joursAvant(15) },
    { code_im: 'IM000001', type_mouvement: 'Transfert', horodatage: joursAvant(1) },
  ];
  const r = W.digestPannesNonResolues(mouvements, NOW, 7);
  assert.deepEqual(r, []);
});

// ── digestStockBas ────────────────────────────────────────────────────────────────────────────
test('digestStockBas : applique le seuil personnalisé Stock_Mini, sinon le défaut (5 EPI / 3 Outillage)', () => {
  const epi = [
    { type_article: 'Pantalon', stock_actuel: 3, stock_mini: 0 },   // défaut 5 -> sous le seuil
    { type_article: 'Gants', stock_actuel: 10, stock_mini: 0 },      // au-dessus du défaut -> ok
    { type_article: 'Casque', stock_actuel: 6, stock_mini: 8 },      // seuil personnalisé -> sous le seuil
  ];
  const outillage = [
    { title: 'Pince', stock_actuel: 2, stock_mini: 0 },   // défaut 3 -> sous le seuil
    { title: 'Marteau', stock_actuel: 5, stock_mini: 0 }, // ok
  ];
  const r = W.digestStockBas(epi, outillage);
  assert.deepEqual(r.epi.map(a => a.type_article), ['Pantalon', 'Casque']);
  assert.deepEqual(r.outillage.map(a => a.title), ['Pince']);
});

// ── digestCampagnesFaibleCouverture ──────────────────────────────────────────────────────────
test('digestCampagnesFaibleCouverture : retient une campagne En cours, ouverte >=14j, couverture < 50%', () => {
  const immosActives = [{ code_im: 'IM000001' }, { code_im: 'IM000002' }, { code_im: 'IM000003' }, { code_im: 'IM000004' }];
  const campagnes = [{ nom: 'Inventaire 2026', statut: 'En cours', date_debut: joursAvant(20) }];
  const scans = [{ code_im: 'IM000001', campagne: 'Inventaire 2026' }]; // 1/4 = 25% < 50%
  const r = W.digestCampagnesFaibleCouverture(campagnes, scans, immosActives, NOW, W.DIGEST_SEUILS);
  assert.equal(r.length, 1);
  assert.equal(r[0].couverture_pct, 25);
});

test('digestCampagnesFaibleCouverture : ignore une campagne trop récente (< 14 jours) même à faible couverture', () => {
  const immosActives = [{ code_im: 'IM000001' }, { code_im: 'IM000002' }];
  const campagnes = [{ nom: 'Inventaire 2026', statut: 'En cours', date_debut: joursAvant(5) }];
  const r = W.digestCampagnesFaibleCouverture(campagnes, [], immosActives, NOW, W.DIGEST_SEUILS);
  assert.deepEqual(r, []);
});

test('digestCampagnesFaibleCouverture : ignore une campagne à bonne couverture (>= 50%) ou déjà clôturée', () => {
  const immosActives = [{ code_im: 'IM000001' }, { code_im: 'IM000002' }];
  const campagnes = [
    { nom: 'Bonne couverture', statut: 'En cours', date_debut: joursAvant(20) },
    { nom: 'Clôturée', statut: 'Clôturée', date_debut: joursAvant(20) },
  ];
  const scans = [{ code_im: 'IM000001', campagne: 'Bonne couverture' }, { code_im: 'IM000002', campagne: 'Bonne couverture' }];
  const r = W.digestCampagnesFaibleCouverture(campagnes, scans, immosActives, NOW, W.DIGEST_SEUILS);
  assert.deepEqual(r, []);
});

test('digestCampagnesFaibleCouverture : une immo inactive scannée ne compte pas comme "vue" (dénominateur cohérent)', () => {
  const immosActives = [{ code_im: 'IM000001' }, { code_im: 'IM000002' }];
  const campagnes = [{ nom: 'Inventaire 2026', statut: 'En cours', date_debut: joursAvant(20) }];
  // IM999999 n'est pas dans immosActives (sortie du parc ou inconnue) : ne doit pas gonfler le taux
  const scans = [{ code_im: 'IM999999', campagne: 'Inventaire 2026' }];
  const r = W.digestCampagnesFaibleCouverture(campagnes, scans, immosActives, NOW, W.DIGEST_SEUILS);
  assert.equal(r[0].couverture_pct, 0);
});

// ── buildDigest : cas vide et cas rempli ─────────────────────────────────────────────────────
test('buildDigest : digest vide (vide=true) quand aucune règle ne matche', () => {
  const d = W.buildDigest({ immos: [], mouvements: [], pending: [], campagnes: [], scans: [], catalogueEpi: [], catalogueOutillage: [] }, NOW, W.DIGEST_SEUILS);
  assert.equal(d.vide, true);
  assert.deepEqual(d.transferts, []);
  assert.deepEqual(d.garanties, []);
  assert.deepEqual(d.pannes, []);
  assert.deepEqual(d.stock.epi, []);
  assert.deepEqual(d.stock.outillage, []);
  assert.deepEqual(d.campagnes, []);
});

test('buildDigest : vide=false dès qu\'une seule section a un résultat', () => {
  const d = W.buildDigest({
    immos: [], mouvements: [], catalogueEpi: [], catalogueOutillage: [], campagnes: [], scans: [],
    pending: [{ code_im: 'IM000001', statut: 'En attente', horodatage: joursAvant(10) }],
  }, NOW, W.DIGEST_SEUILS);
  assert.equal(d.vide, false);
  assert.equal(d.transferts.length, 1);
});

test('renderDigestHtml : digest vide produit un message "rien à signaler", pas d\'erreur', () => {
  const d = W.buildDigest({ immos: [], mouvements: [], pending: [], campagnes: [], scans: [], catalogueEpi: [], catalogueOutillage: [] }, NOW, W.DIGEST_SEUILS);
  const html = W.renderDigestHtml(d);
  assert.match(html, /Rien à signaler/);
});

test('renderDigestHtml : digest rempli contient un lien vers le dashboard et échappe le HTML', () => {
  const d = W.buildDigest({
    immos: [], mouvements: [], catalogueEpi: [], catalogueOutillage: [], campagnes: [], scans: [],
    pending: [{ code_im: 'IM000001', donneur_nom: '<script>x</script>', statut: 'En attente', horodatage: joursAvant(10) }],
  }, NOW, W.DIGEST_SEUILS);
  const html = W.renderDigestHtml(d);
  assert.match(html, /ral974\.github\.io\/immo-tracker\/dashboard\.html/);
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

// ── requireDigestTokenWith / timingSafeEqualStr ──────────────────────────────────────────────
test('requireDigestTokenWith : refuse si DIGEST_TOKEN_ENV n\'est pas configuré', () => {
  const r = W.requireDigestTokenWith('peu-importe', '');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'digest_token_manquant');
});

test('requireDigestTokenWith : refuse un jeton incorrect, accepte le bon', () => {
  assert.equal(W.requireDigestTokenWith('mauvais', 'secret-digest').ok, false);
  assert.equal(W.requireDigestTokenWith('secret-digest', 'secret-digest').ok, true);
});

// ── Anti-dérive vs dashboard.html : ces constantes DOIVENT rester identiques des deux côtés
// (impossible de vraiment partager le code entre le Worker et une page HTML autonome sans build,
// voir 01_ARCHITECTURE_TECHNIQUE.md) — même principe que security.gated-actions.test.js pour
// GATED_ACTIONS. Sans ce test, un futur changement de barème côté dashboard (ex. GARANTIE_ANS)
// pourrait faire dériver silencieusement le digest.
test('anti-dérive : GARANTIE_ANS (dashboard.html) === DIGEST_SEUILS.garantieAns (worker.js)', () => {
  const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
  const m = /var GARANTIE_ANS=(\d+);/.exec(dashboardSrc);
  assert.ok(m, 'GARANTIE_ANS introuvable dans dashboard.html — le format a-t-il changé ?');
  assert.equal(W.DIGEST_SEUILS.garantieAns, Number(m[1]));
});

test('anti-dérive : COMPTES_ADMIN_DASH (dashboard.html) === COMPTES_ADMIN_DIGEST (worker.js)', () => {
  const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
  const m = /var COMPTES_ADMIN_DASH=\[([^\]]*)\];/.exec(dashboardSrc);
  assert.ok(m, 'COMPTES_ADMIN_DASH introuvable dans dashboard.html — le format a-t-il changé ?');
  const comptes = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(W.COMPTES_ADMIN_DIGEST, comptes);
});

test('anti-dérive : ETIQUETEUSES_DASH (dashboard.html) === ETIQUETEUSES_DIGEST (worker.js)', () => {
  const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
  const m = /var ETIQUETEUSES_DASH=\[([^\]]*)\];/.exec(dashboardSrc);
  assert.ok(m, 'ETIQUETEUSES_DASH introuvable dans dashboard.html — le format a-t-il changé ?');
  const codes = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(W.ETIQUETEUSES_DIGEST, codes);
});

test('anti-dérive : STOCK_MINI_DEFAUT_EPI/OUTILLAGE (worker.js) === défauts historiques (5 / 3)', () => {
  // Pas de constante nommée équivalente côté dashboard.html (les défauts y sont inline) — ce test
  // fige au moins la valeur côté Worker pour éviter une régression silencieuse (voir
  // 04_HISTORIQUE_DECISIONS.md "Seuils d'alerte stock EPI + Outillage").
  assert.equal(W.STOCK_MINI_DEFAUT_EPI, 5);
  assert.equal(W.STOCK_MINI_DEFAUT_OUTILLAGE, 3);
});

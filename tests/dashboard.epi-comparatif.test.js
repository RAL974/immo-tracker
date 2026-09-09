// Vérifie le calcul du comparatif d'offres EPI (epiCalculerComparatifOffres, dashboard.html —
// session 3, sept. 2026) : prix par (ligne × fournisseur), meilleur prix ligne à ligne, distinction
// stricte "non proposé" / prix à 0, arrondi conditionnement + quantité minimum (et son effet sur le
// classement), taux de couverture par fournisseur, scénario A (mono-fournisseur, seulement parmi
// ceux à 100% de couverture), scénario B (panachage, frais recalculés par sous-ensemble gagné) et
// l'écart A/B. Même principe d'extraction que tests/dashboard.epi-besoin-annuel.test.js (dashboard.html
// n'est pas un module Node : bloc extrait entre marqueurs, exécuté dans un contexte vm isolé).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// \r\n -> \n : tolère un checkout Windows en CRLF (core.autocrlf=true), voir dashboard.global-search.test.js.
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8').replace(/\r\n/g, '\n');

const start = dashboardSrc.indexOf('// === EPI_COMPARATIF_DEBUT ===');
const end = dashboardSrc.indexOf('// === EPI_COMPARATIF_FIN ===');
if (start === -1 || end === -1) throw new Error('Marqueurs EPI_COMPARATIF introuvables dans dashboard.html');
const bloc = dashboardSrc.slice(start, end + '// === EPI_COMPARATIF_FIN ==='.length);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(bloc + '\n', sandbox, { filename: 'dashboard.html (comparatif EPI, extrait)' });

const { epiCalculerComparatifOffres, epiArrondirQuantiteCommandee, epiAppliquerFraisOffre } = sandbox;

function ligneBesoin(id, extra) {
  return Object.assign({ id: id, type_article: 'Pantalon', taille: '42', designation: 'Pantalon 42', quantite_retenue: 10, quantite_calculee: 10 }, extra || {});
}
function offre(fournisseur, lignes, extra) {
  return Object.assign({ fournisseur: fournisseur, statut: 'Recue', devise: 'EUR', lignes: lignes || [] }, extra || {});
}
function ol(ligneId, extra) {
  return Object.assign({ ligne_consultation_id: ligneId, non_propose: false }, extra || {});
}

test('epiArrondirQuantiteCommandee : conditionnement (multiple supérieur), quantité minimum, les deux combinés', () => {
  assert.equal(epiArrondirQuantiteCommandee(10, null, null), 10);
  assert.equal(epiArrondirQuantiteCommandee(10, 12, null), 12, 'arrondi au multiple de 12 supérieur');
  assert.equal(epiArrondirQuantiteCommandee(24, 12, null), 24, 'déjà un multiple exact -> inchangé');
  assert.equal(epiArrondirQuantiteCommandee(3, null, 5), 5, 'relevé au minimum de commande');
  assert.equal(epiArrondirQuantiteCommandee(7, 5, 20), 20, 'minimum (20) puis arrondi au multiple de 5 (déjà exact)');
  assert.equal(epiArrondirQuantiteCommandee(7, 5, 22), 25, 'minimum (22) puis arrondi au multiple de 5 supérieur (25)');
});

test('epiAppliquerFraisOffre : frais de port, franco atteint, remise globale — jamais sur un total plus large', () => {
  const sansFranco = epiAppliquerFraisOffre({ frais_port: 15, franco_a_partir_de: 200, remise_globale_pct: 0 }, 100);
  assert.equal(sansFranco.franco_applique, false);
  assert.equal(sansFranco.frais_port, 15);
  assert.equal(sansFranco.total, 115);

  const avecFranco = epiAppliquerFraisOffre({ frais_port: 15, franco_a_partir_de: 200, remise_globale_pct: 0 }, 250);
  assert.equal(avecFranco.franco_applique, true);
  assert.equal(avecFranco.frais_port, 0);
  assert.equal(avecFranco.total, 250);

  const avecRemise = epiAppliquerFraisOffre({ frais_port: 0, remise_globale_pct: 10 }, 200);
  assert.equal(avecRemise.remise_montant, 20);
  assert.equal(avecRemise.total, 180);
});

test('comparatif : distingue strictement "non proposé" d\'un prix à 0 (jamais confondus)', () => {
  const lignes = [ligneBesoin('l1'), ligneBesoin('l2')];
  const offres = [
    offre('ACME', [ol('l1', { prix_unitaire_ht: 0 }), ol('l2', { non_propose: true })]),
  ];
  const r = epiCalculerComparatifOffres(lignes, offres);
  const e1 = r.lignes.find((l) => l.id === 'l1').par_fournisseur.ACME;
  const e2 = r.lignes.find((l) => l.id === 'l2').par_fournisseur.ACME;
  assert.equal(e1.non_propose, false);
  assert.equal(e1.prix_unitaire, 0);
  assert.equal(e1.total_ligne, 0, 'un article gratuit a un total à 0, pas null');
  assert.equal(e2.non_propose, true);
  assert.equal(e2.prix_unitaire, null, 'non proposé -> jamais 0, jamais un nombre');
  assert.equal(e2.total_ligne, null);
});

test('comparatif : ligne sans offre du tout pour ce fournisseur (aucune ligne_consultation_id correspondante) -> traitée comme non proposé', () => {
  const lignes = [ligneBesoin('l1')];
  const offres = [offre('ACME', [])]; // aucune ligne d'offre du tout
  const r = epiCalculerComparatifOffres(lignes, offres);
  const e = r.lignes[0].par_fournisseur.ACME;
  assert.equal(e.non_propose, true);
  assert.equal(e.total_ligne, null);
});

test('comparatif : meilleur prix ligne à ligne tient compte du conditionnement (peut renverser le classement)', () => {
  const lignes = [ligneBesoin('l1', { quantite_retenue: 10 })];
  const offres = [
    // ACME moins cher à l'unité (5€) mais conditionnement 50 -> 50*5 = 250
    offre('ACME', [ol('l1', { prix_unitaire_ht: 5, conditionnement: 50 })]),
    // Beta plus cher à l'unité (8€) mais pas de conditionnement -> 10*8 = 80, moins cher au global
    offre('Beta', [ol('l1', { prix_unitaire_ht: 8 })]),
  ];
  const r = epiCalculerComparatifOffres(lignes, offres);
  const l = r.lignes[0];
  assert.equal(l.par_fournisseur.ACME.quantite_commandee, 50);
  assert.equal(l.par_fournisseur.ACME.total_ligne, 250);
  assert.equal(l.par_fournisseur.ACME.surcout_conditionnement, (50 - 10) * 5);
  assert.equal(l.par_fournisseur.Beta.total_ligne, 80);
  assert.equal(l.meilleur_fournisseur, 'Beta', 'le conditionnement renverse le classement malgré un prix unitaire plus élevé');
});

test('comparatif : totaux par fournisseur sur leur SEUL périmètre proposé, avec taux de couverture', () => {
  const lignes = [ligneBesoin('l1'), ligneBesoin('l2'), ligneBesoin('l3')];
  const offres = [
    offre('ACME', [ol('l1', { prix_unitaire_ht: 10 }), ol('l2', { prix_unitaire_ht: 10 }), ol('l3', { non_propose: true })]),
  ];
  const r = epiCalculerComparatifOffres(lignes, offres);
  const t = r.totaux_par_fournisseur.ACME;
  assert.equal(t.nb_lignes_proposees, 2);
  assert.equal(t.nb_lignes_total, 3);
  assert.equal(Math.round(t.couverture_pct), 67);
  assert.equal(t.sous_total, 200, 'le total ne porte que sur les 2 lignes proposées, jamais complété par une 3e à 0');
});

test('comparatif : offres "Écartée" exclues du comparatif', () => {
  const lignes = [ligneBesoin('l1')];
  const offres = [offre('ACME', [ol('l1', { prix_unitaire_ht: 10 })], { statut: 'Ecartee' })];
  const r = epiCalculerComparatifOffres(lignes, offres);
  assert.deepEqual(r.fournisseurs, []);
  assert.equal(r.lignes[0].meilleur_fournisseur, null);
});

test('scénario A : mono-fournisseur le moins cher, uniquement parmi ceux couvrant 100% du besoin', () => {
  const lignes = [ligneBesoin('l1'), ligneBesoin('l2')];
  const offres = [
    // ACME couvre 100%, total 100+100=200
    offre('ACME', [ol('l1', { prix_unitaire_ht: 10 }), ol('l2', { prix_unitaire_ht: 10 })]),
    // Beta moins cher à l'unité (5) mais ne couvre qu'une ligne -> ne peut pas être scénario A
    offre('Beta', [ol('l1', { prix_unitaire_ht: 5 }), ol('l2', { non_propose: true })]),
  ];
  const r = epiCalculerComparatifOffres(lignes, offres);
  assert.ok(r.scenario_a, 'scénario A calculable (ACME couvre 100%)');
  assert.equal(r.scenario_a.fournisseur, 'ACME');
  assert.equal(r.scenario_a.sous_total, 200);
});

test('scénario A : non calculable si aucun fournisseur ne couvre 100% du besoin — signalé dans les hypothèses', () => {
  const lignes = [ligneBesoin('l1'), ligneBesoin('l2')];
  const offres = [
    offre('ACME', [ol('l1', { prix_unitaire_ht: 10 }), ol('l2', { non_propose: true })]),
    offre('Beta', [ol('l1', { non_propose: true }), ol('l2', { prix_unitaire_ht: 10 })]),
  ];
  const r = epiCalculerComparatifOffres(lignes, offres);
  assert.equal(r.scenario_a, null);
  assert.equal(r.ecart, null, 'écart non calculable sans scénario A');
  assert.ok(r.hypotheses.some((h) => /ne couvre l'intégralité/.test(h)));
});

test('scénario B : panachage au meilleur prix ligne à ligne, frais de port de CHAQUE fournisseur retenu appliqués sur son seul sous-ensemble gagné', () => {
  // ligneBesoin() par défaut : quantite_retenue=10, sans conditionnement -> total_ligne = prix_unitaire * 10.
  const lignes = [ligneBesoin('l1'), ligneBesoin('l2')];
  const offres = [
    // ACME gagne l1 (10€/u -> 100) seulement -> son frais de port (20) s'applique sur ce seul sous-total (100)
    offre('ACME', [ol('l1', { prix_unitaire_ht: 10 }), ol('l2', { prix_unitaire_ht: 100 })], { frais_port: 20 }),
    // Beta gagne l2 (10€/u -> 100) seulement -> son frais de port (5) s'applique sur ce seul sous-total (100)
    offre('Beta', [ol('l1', { prix_unitaire_ht: 100 }), ol('l2', { prix_unitaire_ht: 10 })], { frais_port: 5 }),
  ];
  const r = epiCalculerComparatifOffres(lignes, offres);
  const detailACME = r.scenario_b.details_par_fournisseur.find((d) => d.fournisseur === 'ACME');
  const detailBeta = r.scenario_b.details_par_fournisseur.find((d) => d.fournisseur === 'Beta');
  assert.equal(detailACME.sous_total, 100);
  assert.equal(detailACME.total, 120, '100 + son propre frais de port (20), jamais le frais de port de Beta');
  assert.equal(detailBeta.sous_total, 100);
  assert.equal(detailBeta.total, 105);
  assert.equal(r.scenario_b.total, 225);
  assert.equal(r.scenario_b.lignes_non_couvertes, 0);
});

test('scénario B : ligne sans aucune offre exploitable -> comptée en "lignes_non_couvertes", exclue du total', () => {
  const lignes = [ligneBesoin('l1'), ligneBesoin('l2')];
  const offres = [offre('ACME', [ol('l1', { prix_unitaire_ht: 10 }), ol('l2', { non_propose: true })])];
  const r = epiCalculerComparatifOffres(lignes, offres);
  assert.equal(r.scenario_b.lignes_non_couvertes, 1);
  assert.equal(r.scenario_b.total, 100);
});

test('écart A/B : montant et pourcentage, B toujours <= A (B panache au meilleur prix ligne à ligne)', () => {
  const lignes = [ligneBesoin('l1'), ligneBesoin('l2')];
  const offres = [
    offre('ACME', [ol('l1', { prix_unitaire_ht: 10 }), ol('l2', { prix_unitaire_ht: 20 })]),
    offre('Beta', [ol('l1', { prix_unitaire_ht: 8 }), ol('l2', { prix_unitaire_ht: 25 })]),
  ];
  const r = epiCalculerComparatifOffres(lignes, offres);
  // A : ACME (100+200=300) vs Beta (80+250=330) -> ACME moins cher, 300.
  assert.equal(r.scenario_a.fournisseur, 'ACME');
  assert.equal(r.scenario_a.total, 300);
  // B : l1 -> Beta (80), l2 -> ACME (200) -> total 280.
  assert.equal(r.scenario_b.total, 280);
  assert.equal(r.ecart.montant, 20);
  assert.ok(Math.abs(r.ecart.pourcentage - (20 / 300 * 100)) < 1e-9);
});

test('comparatif : aucune offre reçue -> aucun fournisseur, aucun scénario, pas d\'exception', () => {
  const lignes = [ligneBesoin('l1')];
  const r = epiCalculerComparatifOffres(lignes, []);
  assert.deepEqual(r.fournisseurs, []);
  assert.equal(r.scenario_a, null);
  assert.equal(r.scenario_b.total, 0);
  assert.equal(r.ecart, null);
});

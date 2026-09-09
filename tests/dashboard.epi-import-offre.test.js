// Vérifie le cadre de réponse fournisseur EPI — réimport (epiDetecterColonnesImportOffre,
// epiConstruireLignesImportOffre, epiAnalyserImportOffre, dashboard.html — session 4, sept. 2026) :
// détection des colonnes par libellé (robuste à un réordonnancement), rejet d'un fichier non
// conforme (colonnes obligatoires absentes), rapprochement par identifiant technique puis par
// correspondance type+taille+référence interne, détection de conflit avec une ligne d'offre déjà
// saisie à la main (jamais un simple gabarit vide), prix aberrants (zéro/négatif, écart >10x avec
// une autre offre déjà reçue), et libellé modifié par le fournisseur. Même principe d'extraction que
// tests/dashboard.epi-comparatif.test.js (dashboard.html n'est pas un module Node : bloc extrait
// entre marqueurs, exécuté dans un contexte vm isolé).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// \r\n -> \n : tolère un checkout Windows en CRLF (core.autocrlf=true), voir dashboard.global-search.test.js.
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8').replace(/\r\n/g, '\n');

const start = dashboardSrc.indexOf('// === EPI_IMPORT_OFFRE_DEBUT ===');
const end = dashboardSrc.indexOf('// === EPI_IMPORT_OFFRE_FIN ===');
if (start === -1 || end === -1) throw new Error('Marqueurs EPI_IMPORT_OFFRE introuvables dans dashboard.html');
const bloc = dashboardSrc.slice(start, end + '// === EPI_IMPORT_OFFRE_FIN ==='.length);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(bloc + '\n', sandbox, { filename: 'dashboard.html (import offre EPI, extrait)' });

const { epiDetecterColonnesImportOffre, epiConstruireLignesImportOffre, epiAnalyserImportOffre } = sandbox;

// Ligne de besoin (EPI_Consultation_Lignes) telle que renvoyée par ?epi_consultation_lignes=.
function besoin(id, extra) {
  return Object.assign({ id, type_article: 'Pantalon', taille: '42', reference_interne: 'PANT-42', designation: 'Pantalon 42', quantite_reunion: 5, quantite_mayotte: 2, quantite_calculee: 7 }, extra || {});
}
// Ligne du fichier, déjà mappée par epiConstruireLignesImportOffre.
function ligneFichier(idLigne, extra) {
  return Object.assign({ id_ligne: idLigne, type_article: 'Pantalon', taille: '42', reference_interne: 'PANT-42', designation: 'Pantalon 42', reference_fournisseur: 'REF-ACME', designation_proposee: 'Pantalon ACME', prix_unitaire_ht: 12.5, conditionnement: null, quantite_minimum: null, delai_jours: null, non_propose: false, commentaire: '' }, extra || {});
}
// Ligne d'offre déjà existante (EPI_Offres_Lignes), telle que renvoyée par ?epi_offres=.
function ligneOffreExistante(id, ligneConsultationId, extra) {
  return Object.assign({ id, ligne_consultation_id: ligneConsultationId, reference_fournisseur: '', designation_proposee: '', prix_unitaire_ht: null, conditionnement: null, quantite_minimum: null, delai_jours: null, non_propose: false, commentaire: '' }, extra || {});
}
function offre(id, fournisseur, lignes, extra) {
  return Object.assign({ id, fournisseur, statut: 'Recue', lignes: lignes || [] }, extra || {});
}

// ── epiDetecterColonnesImportOffre : rejet des fichiers non conformes ─────────────────────────

const ENTETE_CADRE_COMPLET = ['ID Ligne (ne pas modifier)', 'Type article', 'Taille', 'Reference interne', 'Designation', 'Quantite Reunion', 'Quantite Mayotte', 'Quantite totale demandee', 'Reference fournisseur', 'Designation proposee', 'Prix unitaire HT', 'Conditionnement', 'Quantite minimum', 'Delai jours', 'Non propose (Oui/Non)', 'Commentaire'];

test('epiDetecterColonnesImportOffre : reconnaît le cadre exporté tel quel', () => {
  const res = epiDetecterColonnesImportOffre(ENTETE_CADRE_COMPLET);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.index.id_ligne, 0);
  assert.equal(res.index.reference_fournisseur, 8);
  assert.equal(res.index.designation_proposee, 9);
  assert.equal(res.index.prix_unitaire_ht, 10);
});

test('epiDetecterColonnesImportOffre : "Designation" et "Designation proposee" ne se volent jamais leur colonne, quel que soit l\'ordre des en-têtes', () => {
  const res = epiDetecterColonnesImportOffre(['Designation proposee', 'Designation', 'ID Ligne (ne pas modifier)', 'Reference fournisseur', 'Prix unitaire HT']);
  assert.equal(res.ok, true);
  assert.equal(res.index.designation_proposee, 0);
  assert.equal(res.index.designation, 1);
});

test('epiDetecterColonnesImportOffre : robuste à un réordonnancement complet des colonnes', () => {
  const reordonne = ENTETE_CADRE_COMPLET.slice().reverse();
  const res = epiDetecterColonnesImportOffre(reordonne);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(reordonne[res.index.id_ligne], 'ID Ligne (ne pas modifier)');
  assert.equal(reordonne[res.index.prix_unitaire_ht], 'Prix unitaire HT');
});

test('epiDetecterColonnesImportOffre : fichier non conforme (colonnes obligatoires absentes) -> rejeté avec le détail des colonnes manquantes', () => {
  const res = epiDetecterColonnesImportOffre(['Nom du produit', 'Coût']);
  assert.equal(res.ok, false);
  assert.ok(res.manquantes.includes('id ligne'));
  assert.ok(res.manquantes.includes('reference fournisseur'));
  assert.ok(res.manquantes.includes('prix unitaire ht'));
});

test('epiDetecterColonnesImportOffre : en-tête vide -> rejeté', () => {
  const res = epiDetecterColonnesImportOffre([]);
  assert.equal(res.ok, false);
  assert.equal(res.manquantes.length, 3);
});

// ── epiConstruireLignesImportOffre ──────────────────────────────────────────────────────────

test('epiConstruireLignesImportOffre : mappe les cellules sur les clés applicatives, ignore les lignes vides, tolère la virgule décimale', () => {
  const detection = epiDetecterColonnesImportOffre(ENTETE_CADRE_COMPLET);
  const rows = [
    ENTETE_CADRE_COMPLET,
    ['l1', 'Pantalon', '42', 'PANT-42', 'Pantalon 42', 5, 2, 7, 'REF-ACME', 'Pantalon ACME', '12,50', 10, 5, 30, '', 'RAS'],
    [], // ligne vide
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], // ligne sans id/réf/prix -> ignorée
  ];
  const lignes = epiConstruireLignesImportOffre(rows, detection.index);
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].id_ligne, 'l1');
  assert.equal(lignes[0].prix_unitaire_ht, 12.5, 'virgule décimale convertie en nombre');
  assert.equal(lignes[0].conditionnement, 10);
  assert.equal(lignes[0].commentaire, 'RAS');
});

test('epiConstruireLignesImportOffre : "Oui"/"oui "/"X" reconnus pour Non proposé, tout le reste = Non', () => {
  const detection = epiDetecterColonnesImportOffre(ENTETE_CADRE_COMPLET);
  const ligne = (v) => ['l1', 'Casque', '', 'CASQ', 'Casque', 3, 1, 4, 'REF', 'Casque X', '', '', '', '', v, ''];
  const rows = [ENTETE_CADRE_COMPLET, ligne('Oui'), ligne(' oui '), ligne('x'), ligne('Non'), ligne('')];
  const lignes = epiConstruireLignesImportOffre(rows, detection.index);
  // Aller-retour JSON : `lignes` est un tableau construit dans le contexte vm (autre "royaume" JS que
  // ce fichier de test) — deepStrictEqual échoue sur le prototype Array du royaume même quand les
  // valeurs sont identiques (piège déjà documenté pour ce même style de test, voir 04_HISTORIQUE_DECISIONS.md).
  assert.deepEqual(JSON.parse(JSON.stringify(lignes.map((l) => l.non_propose))), [true, true, true, false, false]);
});

// ── epiAnalyserImportOffre : rapprochement ──────────────────────────────────────────────────

test('epiAnalyserImportOffre : rapprochement par identifiant technique (cas nominal)', () => {
  const res = epiAnalyserImportOffre([ligneFichier('l1')], [besoin('l1')], null, []);
  assert.equal(res.resume.total, 1);
  assert.equal(res.resume.reconnues, 1);
  assert.equal(res.resume.non_rapprochees, 0);
  assert.equal(res.lignes[0].match_type, 'id');
  assert.equal(res.lignes[0].ligne_consultation_id, 'l1');
  assert.equal(res.lignes[0].action_defaut, 'creer', 'aucune offre existante -> nouvelle ligne à créer');
});

test('epiAnalyserImportOffre : id absent ou inconnu -> rapprochement de repli par type+taille+référence interne', () => {
  const consultationLignes = [besoin('l1'), besoin('l2', { type_article: 'Casque', taille: '', reference_interne: 'CASQ-STD' })];
  const res = epiAnalyserImportOffre([ligneFichier('', { id_ligne: 'id-inconnu-du-serveur' })], consultationLignes, null, []);
  assert.equal(res.lignes[0].match_type, 'fallback');
  assert.equal(res.lignes[0].ligne_consultation_id, 'l1', 'retrouvée via type_article/taille/reference_interne malgré un id absent du serveur');
});

test('epiAnalyserImportOffre : correspondance ambiguë (plusieurs lignes de besoin identiques par type+taille+référence) -> non rapprochée, jamais devinée', () => {
  const consultationLignes = [besoin('l1'), besoin('l2')]; // strictement identiques
  const res = epiAnalyserImportOffre([ligneFichier('', { id_ligne: '' })], consultationLignes, null, []);
  assert.equal(res.lignes[0].match_type, 'aucun');
  assert.equal(res.resume.non_rapprochees, 1);
  assert.equal(res.lignes[0].action_defaut, 'ignore');
});

test('epiAnalyserImportOffre : aucune correspondance possible -> non rapprochée, exclue de l\'écriture', () => {
  const res = epiAnalyserImportOffre([ligneFichier('id-fantome', { id_ligne: 'id-fantome', type_article: 'Article inconnu', taille: '', reference_interne: 'XXX' })], [besoin('l1')], null, []);
  assert.equal(res.lignes[0].match_type, 'aucun');
  assert.equal(res.lignes[0].action_defaut, 'ignore');
});

// ── epiAnalyserImportOffre : conflit avec une ligne d'offre déjà saisie à la main ───────────

test('epiAnalyserImportOffre : ligne d\'offre existante encore VIERGE (gabarit créé en attendant le fichier) -> jamais un conflit, écrasée sans arbitrage', () => {
  const offreExistante = offre('offre1', 'ACME Corp', [ligneOffreExistante('ol1', 'l1')]); // toute vierge
  const res = epiAnalyserImportOffre([ligneFichier('l1')], [besoin('l1')], offreExistante, []);
  assert.equal(res.lignes[0].conflit, false);
  assert.equal(res.lignes[0].ligne_offre_existante_id, 'ol1');
  assert.equal(res.lignes[0].action_defaut, 'maj', 'ligne existante mais vide -> mise à jour directe, pas d\'arbitrage nécessaire');
});

test('epiAnalyserImportOffre : ligne d\'offre existante avec un prix déjà saisi à la MAIN, différent de l\'import -> conflit, action par défaut = garder l\'existant', () => {
  const offreExistante = offre('offre1', 'ACME Corp', [ligneOffreExistante('ol1', 'l1', { prix_unitaire_ht: 15, reference_fournisseur: 'SAISI-A-LA-MAIN' })]);
  const res = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: 12.5, reference_fournisseur: 'REF-FICHIER' })], [besoin('l1')], offreExistante, []);
  assert.equal(res.lignes[0].conflit, true);
  assert.equal(res.resume.conflits, 1);
  assert.equal(res.lignes[0].action_defaut, 'garder_existant', 'ne jamais écraser silencieusement une saisie manuelle');
  const champsEnConflit = res.lignes[0].conflit_details.map((d) => d.champ);
  assert.ok(champsEnConflit.includes('prix_unitaire_ht'));
  assert.ok(champsEnConflit.includes('reference_fournisseur'));
});

test('epiAnalyserImportOffre : ligne d\'offre existante identique à l\'import -> pas de conflit', () => {
  const offreExistante = offre('offre1', 'ACME Corp', [ligneOffreExistante('ol1', 'l1', { prix_unitaire_ht: 12.5, reference_fournisseur: 'REF-ACME', designation_proposee: 'Pantalon ACME' })]);
  const res = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: 12.5 })], [besoin('l1')], offreExistante, []);
  assert.equal(res.lignes[0].conflit, false);
  assert.equal(res.lignes[0].action_defaut, 'maj');
});

// ── epiAnalyserImportOffre : prix aberrants ─────────────────────────────────────────────────

test('epiAnalyserImportOffre : prix nul ou négatif -> signalé, exclu par défaut', () => {
  const resZero = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: 0 })], [besoin('l1')], null, []);
  assert.equal(resZero.lignes[0].prix_flag, 'zero_negatif');
  assert.equal(resZero.lignes[0].action_defaut, 'ignore');
  const resNeg = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: -5 })], [besoin('l1')], null, []);
  assert.equal(resNeg.lignes[0].prix_flag, 'zero_negatif');
});

test('epiAnalyserImportOffre : prix non proposé (non_propose=true) sans prix -> jamais flaggé, même si prix vide', () => {
  const res = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: null, non_propose: true })], [besoin('l1')], null, []);
  assert.equal(res.lignes[0].prix_flag, null);
});

test('epiAnalyserImportOffre : écart de plus d\'un facteur 10 avec une autre offre déjà reçue sur la même ligne -> signalé', () => {
  const autreOffre = offre('offre2', 'Beta SARL', [ligneOffreExistante('ol2', 'l1', { prix_unitaire_ht: 10, non_propose: false })]);
  const resHaut = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: 150 })], [besoin('l1')], null, [autreOffre]); // 15x
  assert.equal(resHaut.lignes[0].prix_flag, 'ecart_10x');
  const resBas = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: 0.5 })], [besoin('l1')], null, [autreOffre]); // 20x en dessous
  assert.equal(resBas.lignes[0].prix_flag, 'ecart_10x');
});

test('epiAnalyserImportOffre : écart dans un facteur 10 raisonnable -> non signalé', () => {
  const autreOffre = offre('offre2', 'Beta SARL', [ligneOffreExistante('ol2', 'l1', { prix_unitaire_ht: 10 })]);
  const res = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: 45 })], [besoin('l1')], null, [autreOffre]); // 4.5x, dans la marge
  assert.equal(res.lignes[0].prix_flag, null);
});

test('epiAnalyserImportOffre : une offre "Écartée" n\'entre jamais dans la comparaison de prix', () => {
  const autreOffreEcartee = offre('offre2', 'Beta SARL', [ligneOffreExistante('ol2', 'l1', { prix_unitaire_ht: 10 })], { statut: 'Ecartee' });
  const res = epiAnalyserImportOffre([ligneFichier('l1', { prix_unitaire_ht: 500 })], [besoin('l1')], null, [autreOffreEcartee]);
  assert.equal(res.lignes[0].prix_flag, null, 'aucune autre offre exploitable -> pas de comparaison possible');
});

// ── epiAnalyserImportOffre : libellé modifié ────────────────────────────────────────────────

test('epiAnalyserImportOffre : la colonne "Désignation" (lecture seule) renvoyée différente de l\'originale -> signalé, sans bloquer l\'inclusion', () => {
  const res = epiAnalyserImportOffre([ligneFichier('l1', { designation: 'Pantalon 42 (modifié par le fournisseur)' })], [besoin('l1', { designation: 'Pantalon 42' })], null, []);
  assert.equal(res.lignes[0].libelle_modifie, true);
  assert.equal(res.resume.libelles_modifies, 1);
  assert.equal(res.lignes[0].action_defaut, 'creer', 'un libellé modifié est informatif, jamais bloquant');
});

test('epiAnalyserImportOffre : désignation inchangée -> pas de signalement', () => {
  const res = epiAnalyserImportOffre([ligneFichier('l1', { designation: 'Pantalon 42' })], [besoin('l1', { designation: 'Pantalon 42' })], null, []);
  assert.equal(res.lignes[0].libelle_modifie, false);
});

// ── Résumé global ────────────────────────────────────────────────────────────────────────────

test('epiAnalyserImportOffre : résumé cumulé correct sur un jeu de lignes hétérogène', () => {
  const consultationLignes = [besoin('l1'), besoin('l2', { type_article: 'Casque', taille: '', reference_interne: 'CASQ' })];
  const offreExistante = offre('offre1', 'ACME Corp', [ligneOffreExistante('ol1', 'l1', { prix_unitaire_ht: 99, reference_fournisseur: 'ANCIEN' })]);
  const lignesFichier = [
    ligneFichier('l1', { prix_unitaire_ht: 12.5 }), // conflit (prix 99 vs 12.5 saisi à la main)
    ligneFichier('l2', { id_ligne: 'l2', type_article: 'Casque', taille: '', reference_interne: 'CASQ', prix_unitaire_ht: 0 }), // prix nul
    ligneFichier('id-inconnu', { id_ligne: 'id-inconnu', type_article: 'Autre', taille: '', reference_interne: 'ZZZ' }), // non rapprochée
  ];
  const res = epiAnalyserImportOffre(lignesFichier, consultationLignes, offreExistante, []);
  assert.equal(res.resume.total, 3);
  assert.equal(res.resume.reconnues, 2);
  assert.equal(res.resume.non_rapprochees, 1);
  assert.equal(res.resume.conflits, 1);
  assert.equal(res.resume.prix_aberrants, 1);
});

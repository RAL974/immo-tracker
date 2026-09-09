// Vérifie le calcul du besoin annuel EPI (epiCalculerBesoinAnnuel, dashboard.html) : formule
// (dotation de base -> renouvellement -> effectif prévisionnel -> marge -> arrondi ligne à ligne),
// ventilation territoriale, et les 6 catégories d'anomalies. Même principe que
// tests/dashboard.global-search.test.js (extraction du bloc concerné, exécution isolée dans un
// contexte vm) — dashboard.html n'est pas un module Node. Complété par un test de non-divergence
// entre les deux tables de mapping taille -> article (worker.js / dashboard.html), seul garde-fou
// réaliste contre une 3e copie qui dériverait silencieusement — voir CADRAGE_MODULE_BESOIN_EPI.md §1.2.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// \r\n -> \n : voir tests/dashboard.global-search.test.js pour la raison (checkout Windows).
const dashboardSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8').replace(/\r\n/g, '\n');
const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8').replace(/\r\n/g, '\n');

function sliceBetween(src, startNeedle, endNeedle, label) {
  const start = src.indexOf(startNeedle);
  if (start === -1) throw new Error(`Marqueur de début introuvable pour ${label}: ${startNeedle}`);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  if (end === -1) throw new Error(`Marqueur de fin introuvable pour ${label}: ${endNeedle}`);
  return src.slice(start, end);
}

// Bloc 1 : EPI_TAILLE_FIELD_PAR_TYPE + epiTrouverArticleCatalogue + epiCalculerBesoinStock (briques
// existantes, réutilisées telles quelles par le nouveau calcul — pas de 3e copie du mapping).
const briquesExistantes = sliceBetween(
  dashboardSrc,
  'var EPI_TAILLE_FIELD_PAR_TYPE={',
  '\n\n// === BESOIN_ANNUEL_EPI_DEBUT ===',
  'briques EPI existantes'
);
// Bloc 2 : le nouveau calcul du besoin annuel, entre ses deux marqueurs explicites.
const besoinAnnuelStart = dashboardSrc.indexOf('// === BESOIN_ANNUEL_EPI_DEBUT ===');
const besoinAnnuelEnd = dashboardSrc.indexOf('// === BESOIN_ANNUEL_EPI_FIN ===');
if (besoinAnnuelStart === -1 || besoinAnnuelEnd === -1) throw new Error('Marqueurs BESOIN_ANNUEL_EPI introuvables dans dashboard.html');
const besoinAnnuelBlock = dashboardSrc.slice(besoinAnnuelStart, besoinAnnuelEnd + '// === BESOIN_ANNUEL_EPI_FIN ==='.length);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(briquesExistantes + '\n' + besoinAnnuelBlock + '\n', sandbox, { filename: 'dashboard.html (besoin annuel EPI, extrait)' });

const { epiCalculerBesoinAnnuel, epiRenouvellementMois, epiSiteExploitable, epiCalculerBesoinStock, epiTrouverArticleCatalogue } = sandbox;

function setFixtures(sb, { epiGrille = [], epiCatalogue = [], employesList = [], employesByCode = {} }) {
  sb.epiGrille = epiGrille;
  sb.epiCatalogue = epiCatalogue;
  sb.employesList = employesList;
  sb.employesByCode = employesByCode;
}
// Les objets renvoyés par le code exécuté dans le contexte vm ont un prototype d'un autre "royaume"
// (Object.prototype du sandbox) : deepStrictEqual échoue même sur des valeurs structurellement
// identiques à un littéral du royaume principal. Round-trip JSON = valeurs plates, comparables.
function plain(v) { return JSON.parse(JSON.stringify(v)); }

test('epiSiteExploitable : Reunion/Mayotte reconnus (variantes de casse/accents), sinon null', () => {
  assert.equal(epiSiteExploitable('Reunion'), 'Reunion');
  assert.equal(epiSiteExploitable('reunion'), 'Reunion');
  assert.equal(epiSiteExploitable('Mayotte'), 'Mayotte');
  assert.equal(epiSiteExploitable('MAYOTTE'), 'Mayotte');
  assert.equal(epiSiteExploitable(''), null);
  assert.equal(epiSiteExploitable(null), null);
  assert.equal(epiSiteExploitable('Autre'), null);
});

test('epiRenouvellementMois : 12 explicite, 24, 0 (invalide -> défaut), absent (colonne pas créée -> défaut)', () => {
  setFixtures(sandbox, { epiGrille: [
    { affectation: 'C', type_article: 'A12', quantite: 1, renouvellement_mois: 12 },
    { affectation: 'C', type_article: 'A24', quantite: 1, renouvellement_mois: 24 },
    { affectation: 'C', type_article: 'A0', quantite: 1, renouvellement_mois: 0 },
    { affectation: 'C', type_article: 'AAbsent', quantite: 1 },
  ] });
  assert.equal(epiRenouvellementMois('C', 'A12'), 12);
  assert.equal(epiRenouvellementMois('C', 'A24'), 24);
  assert.equal(epiRenouvellementMois('C', 'A0'), 12);
  assert.equal(epiRenouvellementMois('C', 'AAbsent'), 12);
  assert.equal(epiRenouvellementMois('C', 'InconnuDeLaGrille'), 12);
});

test('epiCalculerBesoinAnnuel : ventilation territoriale, renouvellement, article taille unique, type absent du catalogue, employé sans taille', () => {
  setFixtures(sandbox, {
    epiGrille: [
      { affectation: 'C', type_article: 'Pantalon', quantite: 2, renouvellement_mois: 24 },
      { affectation: 'C', type_article: 'Casque de chantier', quantite: 1, renouvellement_mois: null },
      { affectation: 'M', type_article: 'Veste', quantite: 1, renouvellement_mois: 0 },
      { affectation: 'M', type_article: 'Gants à picot', quantite: 3 },
    ],
    epiCatalogue: [
      { type_article: 'Pantalon', taille_salarie: '42', taille_affichage: '42', reference: 'PANT-42', designation: 'Pantalon 42', stock_actuel: 10 },
      { type_article: 'Casque de chantier', taille_salarie: '', taille_affichage: '', reference: 'CASQ-STD', designation: 'Casque standard', stock_actuel: 5 },
      { type_article: 'Veste', taille_salarie: 'L', taille_affichage: 'L', reference: 'VEST-L', designation: 'Veste L', stock_actuel: 2 },
      { type_article: 'Veste', taille_salarie: 'M', taille_affichage: 'M', reference: 'VEST-M', designation: 'Veste M', stock_actuel: 1 },
      // Aucune ligne 'Gants à picot' : type de grille sans catalogue -> anomalie de configuration attendue.
    ],
    employesList: [
      { Code: 'EMP1', Nom: 'Un Employe', Actif: true, AffectationEPI: 'C', Site: 'Reunion' },
      { Code: 'EMP2', Nom: 'Deux Employe', Actif: true, AffectationEPI: 'C', Site: 'Mayotte' },
      { Code: 'EMP3', Nom: 'Trois SansTaille', Actif: true, AffectationEPI: 'M', Site: 'Reunion' },
      { Code: 'EMP4', Nom: 'Quatre Inactif', Actif: false, AffectationEPI: 'M', Site: 'Reunion' },
      { Code: 'EMP5', Nom: 'Cinq Veste M', Actif: true, AffectationEPI: 'M', Site: 'Reunion' },
    ],
    employesByCode: {
      EMP1: { taillePantalon: '42' },
      EMP2: { taillePantalon: '42' },
      EMP3: { tailleVeste: '' },
      EMP5: { tailleVeste: 'M' },
    },
  });
  const r = epiCalculerBesoinAnnuel(2027, {}, 0);

  // Effectif : EMP4 (inactif) n'entre jamais dans "éligibles" ; les 4 autres sont comptés (aucune
  // exclusion affectation/site ici — seule la ligne Veste de EMP3 est exclue, pas l'employé entier).
  assert.equal(r.effectif.eligibles, 4);
  assert.equal(r.effectif.exclus, 0);
  assert.equal(r.effectif.comptes, 4);

  // Anomalie "type absent du catalogue" : Gants à picot, une seule fois (config), zéro besoin calculé.
  assert.deepEqual(plain(r.anomalies.type_absent_catalogue), [{ type_article: 'Gants à picot' }]);
  assert.ok(!r.lignes.some((l) => l.type_article === 'Gants à picot'), 'aucune ligne de besoin pour un type absent du catalogue');
  // EMP3/EMP5 ne génèrent aucune anomalie pour Gants à picot (déjà signalé au niveau config, pas par employé).
  assert.equal(r.anomalies.taille_manquante.length + r.anomalies.article_introuvable.length, 1);

  // Anomalie "taille manquante" : EMP3 sur Veste, ligne exclue du calcul pour cet employé+type.
  assert.deepEqual(plain(r.anomalies.taille_manquante), [{ code: 'EMP3', nom: 'Trois SansTaille', type_article: 'Veste' }]);

  const pantalon = r.lignes.find((l) => l.type_article === 'Pantalon' && l.taille === '42');
  assert.ok(pantalon, 'ligne Pantalon/42 attendue');
  // Renouvellement 24 mois : ceil(2*12/24) = 1 par employé concerné.
  assert.equal(pantalon.qte_reunion, 1); // EMP1
  assert.equal(pantalon.qte_mayotte, 1); // EMP2
  assert.equal(pantalon.qte_totale, 2);
  assert.equal(pantalon.nb_employes, 2);
  assert.equal(pantalon.reference, 'PANT-42');
  assert.equal(pantalon.stock_actuel, 10);

  const casque = r.lignes.find((l) => l.type_article === 'Casque de chantier');
  assert.ok(casque, 'ligne Casque de chantier attendue (article à taille unique)');
  assert.equal(casque.taille, '');
  assert.equal(casque.qte_reunion, 1);
  assert.equal(casque.qte_mayotte, 1);

  const veste = r.lignes.find((l) => l.type_article === 'Veste');
  assert.ok(veste, 'ligne Veste attendue (uniquement EMP5, EMP3 exclu pour taille manquante)');
  assert.equal(veste.taille, 'M');
  assert.equal(veste.qte_reunion, 1);
  assert.equal(veste.qte_mayotte, 0);
  assert.equal(veste.nb_employes, 1);
});

test('epiCalculerBesoinAnnuel : marge de sécurité — arrondi ligne à ligne PAR TERRITOIRE, jamais sur un total global', () => {
  setFixtures(sandbox, {
    epiGrille: [{ affectation: 'C', type_article: 'Standard', quantite: 1, renouvellement_mois: 12 }],
    epiCatalogue: [{ type_article: 'Standard', reference: 'STD-1', designation: 'Article standard', stock_actuel: 0 }],
    employesList: [
      { Code: 'A', Nom: 'A', Actif: true, AffectationEPI: 'C', Site: 'Reunion' },
      { Code: 'B', Nom: 'B', Actif: true, AffectationEPI: 'C', Site: 'Reunion' },
      { Code: 'C', Nom: 'C', Actif: true, AffectationEPI: 'C', Site: 'Mayotte' },
    ],
    employesByCode: { A: {}, B: {}, C: {} },
  });
  const r = epiCalculerBesoinAnnuel(2027, {}, 10); // marge 10%
  const l = r.lignes.find((x) => x.type_article === 'Standard');
  // Réunion : 2 employés -> accumulateur 2 -> 2*1.10=2.2 -> ceil=3. Mayotte : 1 -> 1.10 -> ceil=2.
  assert.equal(l.qte_reunion, 3);
  assert.equal(l.qte_mayotte, 2);
  // Total = somme des deux quantités DÉJÀ arrondies (3+2=5), jamais ceil((2+1)*1.10)=4.
  assert.equal(l.qte_totale, 5);
});

test('epiCalculerBesoinAnnuel : effectif prévisionnel — solde net de départs plafonné à 0 (ne retire jamais de besoin)', () => {
  setFixtures(sandbox, {
    epiGrille: [{ affectation: 'C', type_article: 'Standard', quantite: 1, renouvellement_mois: 12 }],
    epiCatalogue: [{ type_article: 'Standard', reference: 'STD-1', stock_actuel: 0 }],
    employesList: [{ Code: 'A', Nom: 'A', Actif: true, AffectationEPI: 'C', Site: 'Reunion' }],
    employesByCode: { A: {} },
  });
  const r = epiCalculerBesoinAnnuel(2027, { 'C|Reunion': { entrees: 0, sorties: 3 } }, 0);
  const l = r.lignes.find((x) => x.type_article === 'Standard');
  // 1 employé réel = besoin 1, le solde prévisionnel négatif (-3) ne doit RIEN retirer.
  assert.equal(l.qte_reunion, 1);
});

test('epiCalculerBesoinAnnuel : entrées prévisionnelles — taille provisionnée = la plus fréquente parmi les employés réels du même profil/territoire', () => {
  setFixtures(sandbox, {
    epiGrille: [{ affectation: 'Z', type_article: 'Pantalon', quantite: 1, renouvellement_mois: 12 }],
    epiCatalogue: [
      { type_article: 'Pantalon', taille_salarie: '40', reference: 'PANT-40', stock_actuel: 5 },
      { type_article: 'Pantalon', taille_salarie: '42', reference: 'PANT-42', stock_actuel: 3 },
    ],
    employesList: [
      { Code: 'Z1', Nom: 'Z1', Actif: true, AffectationEPI: 'Z', Site: 'Reunion' },
      { Code: 'Z2', Nom: 'Z2', Actif: true, AffectationEPI: 'Z', Site: 'Reunion' },
      { Code: 'Z3', Nom: 'Z3', Actif: true, AffectationEPI: 'Z', Site: 'Reunion' },
    ],
    employesByCode: { Z1: { taillePantalon: '40' }, Z2: { taillePantalon: '40' }, Z3: { taillePantalon: '42' } },
  });
  const r = epiCalculerBesoinAnnuel(2027, { 'Z|Reunion': { entrees: 2, sorties: 0 } }, 0);
  const l40 = r.lignes.find((x) => x.taille === '40');
  const l42 = r.lignes.find((x) => x.taille === '42');
  // Réel : Z1+Z2 (taille 40) = 2, Z3 (taille 42) = 1. Prévisionnel (2 entrées) provisionné sur '40' (la plus
  // fréquente : 2 occurrences contre 1) -> +2 sur la taille 40 uniquement.
  assert.equal(l40.qte_reunion, 4); // 2 (réel) + 2 (prévisionnel)
  assert.equal(l40.nb_employes, 2); // le décompte "employés" ne compte que les vrais employés, pas le prévisionnel
  assert.equal(l42.qte_reunion, 1);
  assert.equal(r.anomalies.taille_a_preciser.length, 0);
});

test('epiCalculerBesoinAnnuel : "taille à préciser" quand aucun employé réel du profil/territoire n\'existe pour servir de référence', () => {
  setFixtures(sandbox, {
    epiGrille: [{ affectation: 'Z', type_article: 'Pantalon', quantite: 1, renouvellement_mois: 12 }],
    epiCatalogue: [{ type_article: 'Pantalon', taille_salarie: '40', reference: 'PANT-40', stock_actuel: 5 }],
    employesList: [], // aucun employé réel affectation Z
    employesByCode: {},
  });
  const r = epiCalculerBesoinAnnuel(2027, { 'Z|Reunion': { entrees: 2, sorties: 0 } }, 0);
  assert.equal(r.lignes.length, 0);
  assert.deepEqual(plain(r.anomalies.taille_a_preciser), [{ affectation: 'Z', type_article: 'Pantalon', site: 'Reunion', effectif: 2 }]);
});

test('epiCalculerBesoinAnnuel : affectation EPI non reconnue et site non exploitable excluent l\'employé (compté "exclu", pas dans le total)', () => {
  setFixtures(sandbox, {
    epiGrille: [{ affectation: 'C', type_article: 'Standard', quantite: 1, renouvellement_mois: 12 }],
    epiCatalogue: [{ type_article: 'Standard', reference: 'STD-1', stock_actuel: 0 }],
    employesList: [
      { Code: 'OK', Nom: 'OK', Actif: true, AffectationEPI: 'C', Site: 'Reunion' },
      { Code: 'BADAFF', Nom: 'BadAff', Actif: true, AffectationEPI: 'X', Site: 'Reunion' },
      { Code: 'BADSITE', Nom: 'BadSite', Actif: true, AffectationEPI: 'C', Site: '' },
    ],
    employesByCode: { OK: {}, BADAFF: {}, BADSITE: {} },
  });
  const r = epiCalculerBesoinAnnuel(2027, {}, 0);
  assert.equal(r.effectif.eligibles, 3);
  assert.equal(r.effectif.exclus, 2);
  assert.equal(r.effectif.comptes, 1);
  assert.deepEqual(plain(r.anomalies.affectation_inconnue), [{ code: 'BADAFF', nom: 'BadAff', affectation: 'X' }]);
  assert.deepEqual(plain(r.anomalies.site_inexploitable), [{ code: 'BADSITE', nom: 'BadSite', site: '' }]);
  const l = r.lignes.find((x) => x.type_article === 'Standard');
  assert.equal(l.qte_reunion, 1); // seul OK est compté
});

// ── Non-divergence des deux tables de mapping taille -> article (worker.js / dashboard.html) ──
// Les deux implémentations existent volontairement en double (deux runtimes, zéro build — voir
// CADRAGE_MODULE_BESOIN_EPI.md §1.2) : même ensemble de types d'article, et pour chaque type, le
// même champ de taille CONCEPTUEL malgré des conventions de nommage différentes (SharePoint
// 'Taille_Pantalon' côté worker.js vs 'taillePantalon' côté dashboard.html).
function canonicaliserChampTaille(champ) {
  return champ.replace(/^(taille_|taille|pointure_|pointure)/i, '').toLowerCase();
}

test('TAILLE_FIELD_PAR_TYPE (worker.js) et EPI_TAILLE_FIELD_PAR_TYPE (dashboard.html) ne divergent pas', () => {
  // 'var' plutôt que 'const' : une déclaration top-level 'const'/'let' exécutée via vm.runInContext
  // reste dans une portée lexicale interne au script et n'est PAS exposée comme propriété du sandbox
  // (contrairement à 'var', qui devient une propriété de l'objet global du contexte) — sans ce
  // remplacement, sbWorker.TAILLE_FIELD_PAR_TYPE resterait undefined après l'exécution.
  const workerObjLiteral = ('var ' + sliceBetween(workerSrc, 'const TAILLE_FIELD_PAR_TYPE = {', '\n    };', 'TAILLE_FIELD_PAR_TYPE (worker.js)').slice('const '.length)) + '\n    };';
  const dashboardObjLiteral = sliceBetween(dashboardSrc, 'var EPI_TAILLE_FIELD_PAR_TYPE={', '\n};', 'EPI_TAILLE_FIELD_PAR_TYPE (dashboard.html)') + '\n};';

  const sbWorker = {};
  vm.createContext(sbWorker);
  vm.runInContext(workerObjLiteral, sbWorker, { filename: 'worker.js (TAILLE_FIELD_PAR_TYPE, extrait)' });

  const sbDash = {};
  vm.createContext(sbDash);
  vm.runInContext(dashboardObjLiteral, sbDash, { filename: 'dashboard.html (EPI_TAILLE_FIELD_PAR_TYPE, extrait)' });

  const workerMap = sbWorker.TAILLE_FIELD_PAR_TYPE;
  const dashMap = sbDash.EPI_TAILLE_FIELD_PAR_TYPE;
  assert.ok(workerMap && Object.keys(workerMap).length > 0, 'TAILLE_FIELD_PAR_TYPE (worker.js) doit être un objet non vide');
  assert.ok(dashMap && Object.keys(dashMap).length > 0, 'EPI_TAILLE_FIELD_PAR_TYPE (dashboard.html) doit être un objet non vide');

  const workerKeys = Object.keys(workerMap).sort();
  const dashKeys = Object.keys(dashMap).sort();
  assert.deepEqual(dashKeys, workerKeys, 'les deux mappings doivent couvrir exactement le même ensemble de types d\'article');

  for (const type of workerKeys) {
    assert.equal(
      canonicaliserChampTaille(dashMap[type]),
      canonicaliserChampTaille(workerMap[type]),
      `type "${type}" : champ de taille divergent (worker.js="${workerMap[type]}" vs dashboard.html="${dashMap[type]}")`
    );
  }
});

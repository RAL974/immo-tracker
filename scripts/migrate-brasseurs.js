// Migration de l'historique du module « Brasseurs d'air » (négoce + pose) depuis le classeur Excel
// `Fichiers divers/Brasseurs d'air/1.1.3.1. Suivi des entrées et sorties.xlsx` vers les listes
// SharePoint Brasseurs_* (voir CADRAGE_MODULE_BRASSEURS.md dans le même dossier). Sur le modèle de
// seed-staging-data.js : cible la RECETTE par défaut, refuse la production sauf argument explicite.
//
// ⚠️ ZÉRO npm install : lit le .xlsx via scripts/xlsx-lite.js (lecteur maison, zéro dépendance,
// cohérent avec le reste du projet — voir 01_ARCHITECTURE_TECHNIQUE.md "zéro build"). Vérifié par
// comparaison avec les TCD (tableaux croisés dynamiques) déjà présents dans le classeur — voir le
// mode --dry-run ci-dessous.
//
// Modes :
//   node scripts/migrate-brasseurs.js --dry-run
//       Lit le classeur, calcule le stock par Dépôt×Référence×Propriétaire, compare aux TCD du
//       classeur, liste toutes les anomalies/décisions de reprise à confirmer. AUCUNE écriture,
//       AUCUN appel réseau. C'est le mode par défaut si aucun mode n'est précisé.
//
//   node scripts/migrate-brasseurs.js --apply --token=<jeton admin recette>
//       Rejoue les mouvements sur le Worker de RECETTE (immo-proxy-staging par défaut). Refuse de
//       cibler une URL ne contenant pas "staging" sauf --allow-prod ET --confirm=MIGRER-EN-PRODUCTION
//       (double garde-fou volontaire vu la nature réelle — pas fictive — de ces données).
//       Idempotent : chaque mouvement écrit porte le Document d'origine dans Commentaire sous forme
//       d'une clé (voir buildDedupeKey) ; le script interroge d'abord Brasseurs_Mouvements existants
//       et saute toute clé déjà présente avant d'écrire.
//
// Usage :
//   node scripts/migrate-brasseurs.js --dry-run
//   node scripts/migrate-brasseurs.js --apply --token=<jeton> [--worker=https://immo-proxy-staging.ral-85d.workers.dev/]
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readXlsx, headerMap } = require('./xlsx-lite');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));

const REPO_ROOT = path.resolve(__dirname, '..');
const XLSX_PATH = args.xlsx || path.join(REPO_ROOT, "Fichiers divers", "Brasseurs d'air", '1.1.3.1. Suivi des entrées et sorties.xlsx');
const EMPLOYES_JSON_PATH = args['employes-json'] || path.join(REPO_ROOT, 'employes.json');

// ── Règles de reprise (tranchées avec William, voir CADRAGE_MODULE_BRASSEURS.md §1) ─────────────

// §1.1 : la PI écrit "DCF-FS52920" (sans suffixe couleur) pour "DCF-FS52920B" (blanc). Le catalogue
// validé fait foi. Extensible si d'autres écarts de référence sont trouvés (aucun autre trouvé dans
// le classeur lui-même à ce jour — seule la PI PDF a cet écart, voir le rapport de commande).
const REFERENCE_CORRESPONDANCE = {
  'DCF-FS52920': 'DCF-FS52920B',
};

// Catalogue de départ attendu (cadrage §4) — sert à détecter toute référence du classeur qui ne
// serait pas dans le catalogue déjà créé par William en SharePoint (signalé, jamais auto-créé ici).
const CATALOGUE_ATTENDU = ['DCF-FS52920B', 'DCF-FS52920N', 'CMBF-FS5016', 'CMBF-FS5020', 'CMD-M', 'CMD-T',
  'T30', 'T90', 'KITFIX', 'PALES', 'CACHES', 'CARTONS', 'VISSERIE', 'ECL'];

// §1.4/§3.d : "ESPACE SOLEIL" est l'ancien nom, à normaliser vers la raison sociale actuelle.
const PROPRIETAIRE_LEGACY_VERS_ACTUEL = { 'ESPACE SOLEIL': 'ELECTRICITE SERVICES REUNION' };
const PROPRIETAIRES_VALIDES = ['ELECTRICITE SERVICES REUNION', '1ST SHINE'];

// Dépôts à migrer : nom de feuille "mouvements" + nom de feuille TCD associée + code dépôt cible.
// ⚠️ Prefixe_Document réel de chaque dépôt (colonne Brasseurs_Depots) N'EST PAS connu de ce script
// (dépend de ce que William a saisi en créant les 2 lignes SharePoint) — voir le rappel dans le
// rapport. Les Document d'origine sont de toute façon conservés tels quels (jamais régénérés), donc
// cette valeur n'intervient QUE pour vérifier après coup que la numérotation auto ne collisionne pas
// (elle ne peut pas, car nextBrasseurDocument() recalcule son max à partir des Document déjà écrits
// à CHAQUE appel — voir worker.js — donc aucune seed manuelle de compteur n'est nécessaire ici).
const DEPOTS = [
  { depot: 'OMT', feuilleMouvements: 'Stock OM Transit', feuilleTCD: 'TCD', tcdAvecProprietaire: true },
  { depot: 'TC2', feuilleMouvements: 'Stock TC2', feuilleTCD: 'TCD TC2', tcdAvecProprietaire: false },
];

// ── Extraction du code employé depuis le commentaire libre ──────────────────────────────────────
// Motifs observés dans le classeur : "Pris par XXXX", "Préparé par XXXX" / "préparé par XXXX",
// "Inventaire par XXXX", "Récupération par XXXX". Règle explicite de la mission : seul "Pris par
// XXXX" était demandé — les 3 autres motifs (même sémantique : la personne associée au mouvement)
// ont été proposés en extension et CONFIRMÉS par William (2026-08-11, voir échange de cadrage) —
// appliqués ici sur le même plan que "Pris par".
const MOTIFS_PRIS_PAR = [/\bpris\s*par\s+([A-Za-zÀ-ÿ]{4})\b/i];
const MOTIFS_ETENDUS = [/\bpr[ée]par[ée]e?\s+par\s+([A-Za-zÀ-ÿ]{4})\b/i, /\binventaire\s+par\s+([A-Za-zÀ-ÿ]{4})\b/i, /\br[ée]cup[ée]ration\s+par\s+([A-Za-zÀ-ÿ]{4})\b/i];

function extractEmployeeCode(commentaire) {
  const c = String(commentaire || '');
  for (const re of MOTIFS_PRIS_PAR) { const m = re.exec(c); if (m) return { code: m[1].toUpperCase(), motif: 'pris_par' }; }
  for (const re of MOTIFS_ETENDUS) { const m = re.exec(c); if (m) return { code: m[1].toUpperCase(), motif: 'motif_etendu' }; }
  return null;
}

// ── Normalisation d'un type brut ("E"/"S"/"s"/"S "/"inventaire"/"TRANSFERT"...) ──────────────────
// Règle retenue et CONFIRMÉE par William (2026-08-11) : le Type_Mouvement cible est DÉRIVÉ DU SIGNE
// de la quantité, pas recopié tel quel depuis la colonne "Type" du classeur — celle-ci contient des
// erreurs de signe confirmées comme accidentelles par William (cadrage §1.4, personne non formée),
// pas un pattern métier. Exception : toute ligne dont le Document commence par "INV." OU dont le
// Type brut vaut "inventaire" (insensible à la casse) est un recalage d'inventaire — la quantité du
// classeur y est un NIVEAU CIBLE, pas un delta (même convention que Type_Mouvement='Inventaire' dans
// creer_mouvement_brasseur : écart = cible − stock actuel avant cette ligne).
function isLigneInventaireCible(documentBrut, typeBrut) {
  return /^INV\./i.test(String(documentBrut || '').trim()) || String(typeBrut || '').trim().toLowerCase() === 'inventaire';
}

// ── Lecture du classeur ──────────────────────────────────────────────────────────────────────────
function chargerClasseur() {
  if (!fs.existsSync(XLSX_PATH)) throw new Error('Classeur introuvable : ' + XLSX_PATH);
  return readXlsx(XLSX_PATH);
}

function chargerCodesEmployesConnus() {
  if (!fs.existsSync(EMPLOYES_JSON_PATH)) return { codes: new Set(), source: null, avertissement: 'employes.json introuvable — aucune validation de code employé possible.' };
  const data = JSON.parse(fs.readFileSync(EMPLOYES_JSON_PATH, 'utf8'));
  return {
    codes: new Set(data.map((e) => e.Code)),
    source: EMPLOYES_JSON_PATH,
    avertissement: 'employes.json est un instantané statique (catalogue léger PWA) : peut être légèrement désynchronisé de la liste SharePoint Employes en temps réel. Suffisant pour ce contrôle de cohérence, à revalider en cas de doute au moment de l\'exécution réelle.',
  };
}

// ── Parsing d'une feuille "Stock <dépôt>" en mouvements normalisés ──────────────────────────────
function parseFeuilleMouvements(rows, depotCfg, codesEmployesConnus) {
  const hm = headerMap(rows, 0);
  const need = ['Document', 'Date', 'Type', 'Tiers', 'Propriétaire du Stock', 'Chantier Espace Soleil', 'Référence', 'Désignation', 'Quantité', 'Commentaire'];
  const missing = need.filter((h) => hm[h] === undefined);
  if (missing.length) throw new Error('Feuille "' + depotCfg.feuilleMouvements + '" : en-têtes manquants : ' + missing.join(', '));

  const mouvements = [];
  const lignesExclues = [];
  const anomalies = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const ligneExcel = i + 1;
    const documentBrut = r[hm['Document']];
    const referenceBrut = r[hm['Référence']];
    const typeBrut = r[hm['Type']];
    const quantiteBrut = r[hm['Quantité']];

    // Lignes de fin de feuille sans aucune donnée exploitable ("PROBLEME"/"PB" résiduels observés
    // dans le classeur réel — mise en forme parasite en fin de tableau, pas de vrais mouvements).
    if (!documentBrut && !referenceBrut && typeof quantiteBrut !== 'number') {
      const desig = r[hm['Désignation']];
      if (desig) lignesExclues.push({ ligneExcel, raison: 'ligne vide sans Document/Référence/Quantité (résidu "' + desig + '")' });
      continue;
    }

    const document = String(documentBrut || '').trim();
    const date = r[hm['Date']];
    const tiers = String(r[hm['Tiers']] || '').trim();
    const chantier = String(r[hm['Chantier Espace Soleil']] || '').trim();
    const designation = String(r[hm['Désignation']] || '').trim();
    const commentaire = String(r[hm['Commentaire']] || '').trim();

    // Référence : normalisation via la table de correspondance, puis vérification catalogue.
    const referenceBrute = String(referenceBrut || '').trim().toUpperCase();
    const reference = REFERENCE_CORRESPONDANCE[referenceBrute] || referenceBrute;
    if (!reference) { anomalies.push({ ligneExcel, type: 'reference_manquante', detail: 'Aucune référence sur cette ligne (Document ' + document + ').' }); continue; }
    if (CATALOGUE_ATTENDU.indexOf(reference) === -1) {
      anomalies.push({ ligneExcel, type: 'reference_hors_catalogue', detail: 'Référence "' + reference + '" absente du catalogue de départ attendu (Document ' + document + ').' });
    }

    // Propriétaire : "ESPACE SOLEIL" → raison sociale actuelle ; vide (TC2) → défaut ESR (§1.7, à
    // confirmer) ; toute autre valeur (ex. un Tiers tapé par erreur dans cette colonne) = anomalie,
    // défaut ESR appliqué mais signalé explicitement pour arbitrage.
    const proprietaireBrut = String(r[hm['Propriétaire du Stock']] || '').trim();
    let proprietaire;
    if (!proprietaireBrut) {
      proprietaire = 'ELECTRICITE SERVICES REUNION';
      anomalies.push({ ligneExcel, type: 'proprietaire_vide', detail: 'Propriétaire du Stock vide (Document ' + document + ', dépôt ' + depotCfg.depot + ') — défaut ELECTRICITE SERVICES REUNION appliqué (confirmé par William 2026-08-11 : ESR partout, aucun épisode 1ST SHINE spécifique identifié à isoler).' });
    } else if (PROPRIETAIRE_LEGACY_VERS_ACTUEL[proprietaireBrut]) {
      proprietaire = PROPRIETAIRE_LEGACY_VERS_ACTUEL[proprietaireBrut];
    } else if (PROPRIETAIRES_VALIDES.indexOf(proprietaireBrut) !== -1) {
      proprietaire = proprietaireBrut;
    } else {
      proprietaire = 'ELECTRICITE SERVICES REUNION';
      anomalies.push({ ligneExcel, type: 'proprietaire_invalide', detail: 'Valeur "' + proprietaireBrut + '" hors liste fermée (Document ' + document + ') — probable erreur de saisie (ex. un Tiers tapé dans cette colonne). Défaut ELECTRICITE SERVICES REUNION appliqué (même règle confirmée par William 2026-08-11 que pour les valeurs vides).' });
    }

    // Quantité et type dérivé (voir isLigneInventaireCible / commentaire de fonction plus haut).
    const quantiteBrute = typeof quantiteBrut === 'number' ? quantiteBrut : parseFloat(quantiteBrut);
    if (isNaN(quantiteBrute)) { anomalies.push({ ligneExcel, type: 'quantite_illisible', detail: 'Quantité non numérique sur Document ' + document + '.' }); continue; }

    const estRecalageInventaire = isLigneInventaireCible(document, typeBrut);
    const typeBrutNorm = String(typeBrut || '').trim().toUpperCase();
    let typeDeriveProvisoire = null; // renseigné plus bas pour les lignes non-inventaire
    if (!estRecalageInventaire) {
      if (quantiteBrute > 0) typeDeriveProvisoire = 'Entree';
      else if (quantiteBrute < 0) typeDeriveProvisoire = 'Sortie';
      else typeDeriveProvisoire = typeBrutNorm === 'E' ? 'Entree' : 'Sortie'; // qté=0 (mouvement annulé) : retombe sur la lettre d'origine
      const typeLettreAttendu = typeDeriveProvisoire === 'Entree' ? 'E' : 'S';
      if (typeBrutNorm && typeBrutNorm !== typeLettreAttendu) {
        anomalies.push({ ligneExcel, type: 'signe_type_incoherent', detail: 'Document ' + document + ' (' + depotCfg.depot + ') : colonne Type="' + typeBrut + '" mais quantité=' + quantiteBrute + ' → Type_Mouvement dérivé="' + typeDeriveProvisoire + '" (dérivation par signe confirmée par William 2026-08-11, cadrage §1.4 : erreurs de saisie accidentelles, pas un pattern).' });
      }
    }

    // Extraction employé (voir extractEmployeeCode) — validation contre employes.json.
    const extraction = extractEmployeeCode(commentaire);
    if (extraction) {
      if (codesEmployesConnus.codes.size && !codesEmployesConnus.codes.has(extraction.code)) {
        anomalies.push({ ligneExcel, type: 'code_employe_inconnu', detail: 'Code "' + extraction.code + '" extrait de "' + commentaire + '" (Document ' + document + ') introuvable dans employes.json — laissé en commentaire uniquement, PAS reporté vers Code_Employe.' });
      }
    }
    const codeEmployeValide = extraction && (!codesEmployesConnus.codes.size || codesEmployesConnus.codes.has(extraction.code)) ? extraction.code : null;

    // Détection "plusieurs personnes" (ex. "Pris par POGU et ANFL") : la 2e+ n'est pas représentable
    // dans Code_Employe (un seul champ) — signalé, reste uniquement dans le commentaire.
    const autresCodesRegex = /\b([A-Z]{4})\b/g;
    const tousLesCodesTrouves = new Set();
    let mm;
    while ((mm = autresCodesRegex.exec(commentaire.toUpperCase()))) { if (codesEmployesConnus.codes.has(mm[1])) tousLesCodesTrouves.add(mm[1]); }
    if (tousLesCodesTrouves.size > 1) {
      anomalies.push({ ligneExcel, type: 'plusieurs_employes_cites', detail: 'Document ' + document + ' : plusieurs codes employé valides trouvés dans "' + commentaire + '" (' + Array.from(tousLesCodesTrouves).join(', ') + ') — un seul (' + codeEmployeValide + ') reporté vers Code_Employe, les autres restent uniquement dans le commentaire.' });
    }

    mouvements.push({
      ligneExcel, depot: depotCfg.depot, document, date, typeBrut: typeBrutNorm, tiers,
      proprietaireBrut: proprietaireBrut || '(vide)', proprietaire, destination: chantier,
      referenceBrute, reference, designation, quantiteBrute, commentaire,
      codeEmploye: codeEmployeValide, estRecalageInventaire, estAnnule: quantiteBrute === 0,
    });
  }

  return { mouvements, lignesExclues, anomalies };
}

// ── Calcul du stock (séquentiel, dans l'ordre du classeur — voir justification dans le rapport) ──
// Convertit aussi les lignes de recalage d'inventaire (quantité = niveau CIBLE) en écart signé, en
// mutant chaque mouvement avec un champ `quantiteEcriture` (= ce qui serait réellement écrit dans
// Brasseurs_Mouvements.Quantit_x00e9_) et `typeMouvement` final.
function calculerStockEtEcarts(mouvements) {
  const stock = {}; // clé "depot|reference|proprietaire" -> total courant
  const cle = (m) => m.depot + '|' + m.reference + '|' + m.proprietaire;

  mouvements.forEach((m) => {
    const k = cle(m);
    const avant = stock[k] || 0;
    if (m.estRecalageInventaire) {
      const ecart = m.quantiteBrute - avant;
      m.quantiteEcriture = ecart;
      m.typeMouvement = 'Inventaire';
      m.stockAvant = avant;
      m.ecartInventaire = ecart;
    } else {
      m.quantiteEcriture = m.quantiteBrute;
      m.typeMouvement = m.quantiteBrute >= 0 ? (m.typeBrut === 'S' && m.quantiteBrute === 0 ? 'Sortie' : 'Entree') : 'Sortie';
      m.stockAvant = avant;
    }
    stock[k] = avant + m.quantiteEcriture;
  });

  return stock;
}

// ── Comparaison aux TCD du classeur ─────────────────────────────────────────────────────────────
function comparerAuxTCD(wb, depotCfg, stock) {
  const rows = wb.sheets[depotCfg.feuilleTCD];
  if (!rows) return { erreur: 'Feuille TCD "' + depotCfg.feuilleTCD + '" introuvable.' };
  const divergences = [];
  const conformes = [];

  if (depotCfg.tcdAvecProprietaire) {
    // Feuille "TCD" (OMT) : en-tête à la ligne 4 (index 3) : Référence, Désignation, 1ST SHINE,
    // ESPACE SOLEIL, (vide), Total général.
    const hm = headerMap(rows, 3);
    for (let i = 4; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[hm['Référence']] || r[hm['Référence']] === 'Total général' || r[hm['Référence']] === '(vide)') continue;
      const reference = String(r[hm['Référence']]).trim();
      const attenduESR = r[hm['ESPACE SOLEIL']];
      const attendu1ST = r[hm['1ST SHINE']];
      const calculeESR = stock[depotCfg.depot + '|' + reference + '|ELECTRICITE SERVICES REUNION'] || 0;
      const calcule1ST = stock[depotCfg.depot + '|' + reference + '|1ST SHINE'] || 0;
      [['ELECTRICITE SERVICES REUNION (TCD: ESPACE SOLEIL)', attenduESR, calculeESR], ['1ST SHINE', attendu1ST, calcule1ST]].forEach(([label, attendu, calcule]) => {
        const attenduNum = typeof attendu === 'number' ? attendu : 0;
        if (attenduNum === calcule) conformes.push({ depot: depotCfg.depot, reference, proprietaire: label, valeur: calcule });
        else divergences.push({ depot: depotCfg.depot, reference, proprietaire: label, attenduTCD: attenduNum, calcule });
      });
    }
  } else {
    // Feuille "TCD TC2" : en-tête ligne 3 (index 2) : Référence, Désignation, Somme de Quantité.
    const hm = headerMap(rows, 2);
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[hm['Référence']] || r[hm['Référence']] === 'Total général' || r[hm['Référence']] === '(vide)') continue;
      const reference = String(r[hm['Référence']]).trim();
      const attendu = r[hm['Somme de Quantité']];
      const attenduNum = typeof attendu === 'number' ? attendu : 0;
      // TC2 n'a pas de propriétaire dans son TCD (toujours vide dans le classeur → tout ramené sur
      // ELECTRICITE SERVICES REUNION par notre règle) : on compare à la somme des deux propriétaires
      // calculés, pour rester correct même si une ligne anormale (ex. "ALCLIMA") avait été routée
      // différemment.
      const calcule = (stock[depotCfg.depot + '|' + reference + '|ELECTRICITE SERVICES REUNION'] || 0) + (stock[depotCfg.depot + '|' + reference + '|1ST SHINE'] || 0);
      if (attenduNum === calcule) conformes.push({ depot: depotCfg.depot, reference, proprietaire: '(TC2, non ventilé)', valeur: calcule });
      else divergences.push({ depot: depotCfg.depot, reference, proprietaire: '(TC2, non ventilé)', attenduTCD: attenduNum, calcule });
    }
  }
  return { divergences, conformes };
}

// ── Clé de déduplication (pour --apply idempotent) ──────────────────────────────────────────────
// Un mouvement migré est identifiable de façon unique par (Depot, Document d'origine, Référence,
// ligne Excel source) — le Document seul ne suffit pas (plusieurs lignes de référence par Document).
// Transmise telle quelle (SANS le préfixe "MIG:") à l'action Worker migrer_mouvement_brasseur, qui
// l'enveloppe elle-même dans un marqueur "[MIG:<clé>]" ajouté en fin de Commentaire, et la relit
// sous cette même forme avant chaque écriture pour sauter ce qui a déjà été migré.
function buildDedupeKey(m) {
  return m.depot + ':' + m.document + ':' + m.reference + ':L' + m.ligneExcel;
}

// ── Rapport texte (mode --dry-run) ──────────────────────────────────────────────────────────────
function imprimerRapport({ wb, parAvecDepot, employesInfo }) {
  console.log('='.repeat(100));
  console.log('MIGRATION BRASSEURS D\'AIR — RAPPORT À BLANC (aucune écriture, aucun appel réseau)');
  console.log('Classeur : ' + XLSX_PATH);
  console.log('='.repeat(100));

  if (employesInfo.avertissement) console.log('\n⚠️  ' + employesInfo.avertissement);

  let totalMouvements = 0, totalExclues = 0, totalAnomalies = 0, totalDivergences = 0, totalConformes = 0;

  parAvecDepot.forEach(({ depotCfg, parsed, stock, comparaison }) => {
    console.log('\n' + '-'.repeat(100));
    console.log('DÉPÔT ' + depotCfg.depot + '  (feuille "' + depotCfg.feuilleMouvements + '", TCD "' + depotCfg.feuilleTCD + '")');
    console.log('-'.repeat(100));
    console.log('Mouvements retenus     : ' + parsed.mouvements.length);
    console.log('Lignes exclues (résidu) : ' + parsed.lignesExclues.length);
    parsed.lignesExclues.forEach((l) => console.log('   • ligne Excel ' + l.ligneExcel + ' — ' + l.raison));

    // Répartition par type de mouvement final
    const parType = {};
    parsed.mouvements.forEach((m) => { parType[m.typeMouvement] = (parType[m.typeMouvement] || 0) + 1; });
    console.log('Répartition par Type_Mouvement (dérivé) : ' + JSON.stringify(parType));

    console.log('\nStock final calculé (Référence × Propriétaire) :');
    const parRef = {};
    Object.keys(stock).filter((k) => k.startsWith(depotCfg.depot + '|')).forEach((k) => {
      const [, ref, prop] = k.split('|');
      if (!parRef[ref]) parRef[ref] = {};
      parRef[ref][prop] = stock[k];
    });
    Object.keys(parRef).sort().forEach((ref) => {
      const line = Object.entries(parRef[ref]).map(([p, v]) => p.slice(0, 4) + '=' + v).join('  ');
      console.log('   ' + ref.padEnd(14) + line);
    });

    console.log('\nComparaison au TCD du classeur :');
    if (comparaison.erreur) {
      console.log('   ⚠️  ' + comparaison.erreur);
    } else {
      console.log('   Conformes   : ' + comparaison.conformes.length);
      console.log('   Divergences : ' + comparaison.divergences.length);
      comparaison.divergences.forEach((d) => console.log('   ❌ ' + d.reference + ' / ' + d.proprietaire + '  →  TCD=' + d.attenduTCD + '  vs  calculé=' + d.calcule + '  (écart ' + (d.calcule - d.attenduTCD) + ')'));
      totalDivergences += comparaison.divergences.length;
      totalConformes += comparaison.conformes.length;
    }

    if (parsed.anomalies.length) {
      console.log('\nAnomalies / décisions de reprise à confirmer (' + parsed.anomalies.length + ') :');
      const parTypeAnomalie = {};
      parsed.anomalies.forEach((a) => { (parTypeAnomalie[a.type] = parTypeAnomalie[a.type] || []).push(a); });
      Object.keys(parTypeAnomalie).forEach((type) => {
        console.log('   [' + type + '] × ' + parTypeAnomalie[type].length);
        parTypeAnomalie[type].forEach((a) => console.log('      L' + a.ligneExcel + ' — ' + a.detail));
      });
    }

    totalMouvements += parsed.mouvements.length;
    totalExclues += parsed.lignesExclues.length;
    totalAnomalies += parsed.anomalies.length;
  });

  console.log('\n' + '='.repeat(100));
  console.log('RÉSUMÉ');
  console.log('='.repeat(100));
  console.log('Mouvements à migrer (tous dépôts) : ' + totalMouvements);
  console.log('Lignes exclues (résidus classeur)  : ' + totalExclues);
  console.log('Anomalies signalées                : ' + totalAnomalies);
  console.log('Références × Propriétaire conformes au TCD : ' + totalConformes);
  console.log('Références × Propriétaire EN DIVERGENCE     : ' + totalDivergences);
  if (totalDivergences === 0) console.log('\n✅ Stock recalculé 100% conforme aux TCD du classeur pour les deux dépôts.');
  else console.log('\n❌ Des divergences subsistent — NE PAS PASSER À L\'ÉTAPE D\'ÉCRITURE avant explication.');
}

function main() {
  const mode = args.apply ? 'apply' : 'dry-run';
  const wb = chargerClasseur();
  const employesInfo = chargerCodesEmployesConnus();

  const parAvecDepot = DEPOTS.map((depotCfg) => {
    const rows = wb.sheets[depotCfg.feuilleMouvements];
    if (!rows) throw new Error('Feuille "' + depotCfg.feuilleMouvements + '" introuvable dans le classeur.');
    const parsed = parseFeuilleMouvements(rows, depotCfg, employesInfo);
    const stock = calculerStockEtEcarts(parsed.mouvements);
    const comparaison = comparerAuxTCD(wb, depotCfg, stock);
    return { depotCfg, parsed, stock, comparaison };
  });

  // Le stock est calculé indépendamment par dépôt (clé incluant depot|...), mais calculerStockEtEcarts
  // a été appelé séparément par dépôt ci-dessus donc les clés ne se mélangent pas — fusion pour la
  // comparaison TCD qui a besoin de lire union des deux (aucun cas réel où un même depot appairait
  // deux fois, un seul objet stock par dépôt suffit tel quel).

  if (mode === 'dry-run') {
    imprimerRapport({ wb, parAvecDepot, employesInfo });
    console.log('\nProchaine étape : node scripts/migrate-brasseurs.js --apply --token=<jeton admin recette>');
    return;
  }

  applyMode(parAvecDepot).catch((e) => { console.error('Erreur : ' + e.message); console.error(e.stack); process.exit(1); });
}

// ── Mode --apply : écriture réelle via l'action Worker migrer_mouvement_brasseur ────────────────
const DEFAULT_WORKER = 'https://immo-proxy-staging.ral-85d.workers.dev/';

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Construit le corps attendu par migrer_mouvement_brasseur pour un mouvement déjà calculé par
// calculerStockEtEcarts (m.quantiteEcriture / m.typeMouvement) — écriture directe, aucune
// re-dérivation côté serveur (les règles ont déjà été arbitrées et vérifiées ici, contre les TCD).
function buildLigneEcriture(m) {
  return {
    cle_migration: buildDedupeKey(m), depot: m.depot, document: m.document, date: m.date,
    type_mouvement: m.typeMouvement, tiers: m.tiers, proprietaire: m.proprietaire, destination: m.destination,
    reference: m.reference, quantite: m.quantiteEcriture, code_employe: m.codeEmploye || '', commentaire: m.commentaire,
  };
}

async function postMigrerLot(worker, token, lignes) {
  const res = await fetch(worker + '?action=migrer_mouvement_brasseur', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, lignes }),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { data = { success: false, error: 'reponse_non_json', status: res.status }; }
  return data;
}

async function applyMode(parAvecDepot) {
  const worker = args.worker || DEFAULT_WORKER;
  const token = args.token;
  if (!token) { console.error('Usage : node scripts/migrate-brasseurs.js --apply --token=<jeton de session admin recette>'); process.exit(1); }

  const estStaging = worker.indexOf('staging') !== -1;
  if (!estStaging) {
    const confirmationAttendue = 'MIGRER-EN-PRODUCTION';
    if (!args['allow-prod'] || args.confirm !== confirmationAttendue) {
      console.error('Sécurité : l\'URL du Worker cible ne contient pas "staging" (' + worker + ').');
      console.error('Pour cibler la production, il faut EXPLICITEMENT --allow-prod --confirm=' + confirmationAttendue);
      console.error('Ceci n\'est à faire QU\'APRÈS validation complète du résultat en recette. Abandon.');
      process.exit(1);
    }
    console.warn('⚠️  ⚠️  ⚠️  CIBLE = PRODUCTION (' + worker + ') — confirmation explicite reçue, poursuite.');
  } else {
    console.log('Worker de recette cible : ' + worker);
  }

  // Garde-fou : on ne réapplique jamais si le calcul ne reconcilie plus avec les TCD du classeur —
  // soit le classeur a changé depuis le dry-run validé, soit une régression s'est glissée dans le
  // script. --force permet de passer outre en connaissance de cause (jamais par défaut).
  const totalDivergences = parAvecDepot.reduce((s, d) => s + d.comparaison.divergences.length, 0);
  if (totalDivergences > 0 && !args.force) {
    console.error('❌ ' + totalDivergences + ' divergence(s) vs les TCD du classeur — relancer --dry-run pour le détail.');
    console.error('Refus d\'écrire tant que ce n\'est pas expliqué. Passer --force pour outrepasser (déconseillé).');
    process.exit(1);
  }

  let totalEcrites = 0, totalSautees = 0, totalErreurs = 0;
  for (const { depotCfg, parsed } of parAvecDepot) {
    console.log('\n→ Dépôt ' + depotCfg.depot + ' (' + parsed.mouvements.length + ' mouvements)…');
    const lots = chunk(parsed.mouvements.map(buildLigneEcriture), 20);
    for (let i = 0; i < lots.length; i++) {
      const data = await postMigrerLot(worker, token, lots[i]);
      if (data.success) {
        console.log('  ✅ lot ' + (i + 1) + '/' + lots.length + ' — écrites=' + (data.ecrites || 0) + ' sautées(déjà migrées)=' + (data.sautees || 0));
        totalEcrites += data.ecrites || 0; totalSautees += data.sautees || 0;
      } else {
        console.error('  ❌ lot ' + (i + 1) + '/' + lots.length + ' → ' + JSON.stringify(data));
        totalErreurs++;
      }
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('Terminé. Écrites=' + totalEcrites + '  Déjà migrées (sautées)=' + totalSautees + '  Lots en erreur=' + totalErreurs);
  console.log('='.repeat(100));
  if (totalErreurs) { console.error('Des lots ont échoué — relancer le script (idempotent) après correction sautera ce qui est déjà écrit.'); process.exit(1); }
  console.log('\nVérification recommandée : recharger le dashboard de recette, onglet Brasseurs d\'air, et comparer');
  console.log('au rapport --dry-run (stock par dépôt × référence × propriétaire).');
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Erreur : ' + e.message); console.error(e.stack); process.exit(1); }
}

module.exports = { parseFeuilleMouvements, calculerStockEtEcarts, comparerAuxTCD, extractEmployeeCode, isLigneInventaireCible, buildDedupeKey, buildLigneEcriture, REFERENCE_CORRESPONDANCE, PROPRIETAIRE_LEGACY_VERS_ACTUEL };

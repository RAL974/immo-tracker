// Peuple les listes SharePoint TEST_* (site de recette) avec un jeu de données factice réaliste,
// via les actions Worker déjà existantes (ajouter_employe / ajouter_immo / importer_affectation_immo)
// — aucune nouvelle action Worker créée pour ce script. Ne touche JAMAIS la production : il cible
// exclusivement l'URL du Worker de recette (immo-proxy-staging), jamais immo-proxy.
//
// Prérequis, une seule fois avant d'exécuter ce script (voir PROCEDURE_RECETTE.md) :
//   1. Les listes SharePoint TEST ont été créées manuellement sur le site de recette.
//   2. Une ligne a été ajoutée À LA MAIN dans la liste Employes du site de recette :
//        Title=AIWI, field_2=Oui, Code_CT=Admin, Site=Reunion
//      (bootstrap obligatoire : on ne peut pas se connecter au dashboard tant qu'aucun employé
//      n'existe, et on ne peut pas créer un employé via l'app tant qu'on n'est pas connecté.)
//   3. Connexion au dashboard de recette (.../staging/dashboard.html) avec le code AIWI, création
//      d'un mot de passe de recette (première connexion — distinct du mot de passe prod), puis
//      récupération du jeton de session depuis la console du navigateur :
//        sessionStorage.getItem('admin_token')
//
// Usage :
//   node scripts/seed-staging-data.js --token=<jeton>
//   node scripts/seed-staging-data.js --token=<jeton> --worker=https://immo-proxy-staging.ral-85d.workers.dev/
//
// Idempotent pour les employés/immos/dépôts/catalogue Brasseurs (le Worker refuse les doublons de
// code) — un simple avertissement s'affiche pour les lignes déjà créées. ⚠️ PAS idempotent pour les
// mouvements Brasseurs (creer_mouvement_brasseur n'a pas de notion de doublon, chaque appel ajoute
// du stock) : relancer ce script après un premier passage réussi double le stock de départ. Sans
// conséquence réelle (données 100% fictives, recette uniquement) mais à savoir avant de comparer un
// chiffre de stock affiché à ce qui est décrit ici.
'use strict';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));

const WORKER = args.worker || 'https://immo-proxy-staging.ral-85d.workers.dev/';
const TOKEN = args.token;

if (!TOKEN) {
  console.error('Usage : node scripts/seed-staging-data.js --token=<jeton de session admin recette>');
  console.error('Voir PROCEDURE_RECETTE.md pour obtenir ce jeton (première connexion au dashboard de recette).');
  process.exit(1);
}

if (WORKER.indexOf('staging') === -1) {
  console.error('Sécurité : l\'URL du Worker cible ne contient pas "staging" (' + WORKER + ').');
  console.error('Ce script ne doit jamais être pointé sur le Worker de production. Abandon.');
  process.exit(1);
}

async function call(action, body) {
  const res = await fetch(WORKER + '?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, body, { token: TOKEN })),
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  const label = (body.code_im || body.code || body.reference || body.depot || '?');
  if (data.success) console.log('  ✅ ' + action + ' ' + label);
  else console.warn('  ⚠️  ' + action + ' ' + label + ' → ' + JSON.stringify(data));
  return data;
}

// ── Employés fictifs (aucune donnée personnelle réelle — noms génériques "(test)") ──────────────
const EMPLOYES = [
  { code: 'FIC1', nom: 'DUPONT Jean (test)',   poste: 'Gestionnaire dépôt',     role: 'Logistique',          site: 'Reunion' },
  { code: 'FIC2', nom: 'MARTIN Alice (test)',  poste: 'Référente matériel',     role: 'Logistique_Mayotte',  site: 'Mayotte' },
  { code: 'FIC3', nom: 'BERNARD Marc (test)',  poste: "Responsable d'affaires", role: 'RA',                  site: 'Reunion' },
  { code: 'FIC4', nom: 'PETIT Sophie (test)',  poste: 'Conductrice de travaux', role: 'CT',                  site: 'Reunion' },
  { code: 'FIC5', nom: 'DURAND Paul (test)',   poste: 'CT spécialisé',          role: 'CT_Specialise',       site: 'Mayotte' },
  { code: 'FIC6', nom: 'MOREAU Julie (test)',  poste: 'Ouvrier',                role: 'Ouvrier',             site: 'Reunion' },
  { code: 'FIC7', nom: 'LEROY Thomas (test)',  poste: 'Ouvrier spécialisé',     role: 'Ouvrier_Specialise',  site: 'Reunion' },
  { code: 'FIC8', nom: 'SIMON Claire (test)',  poste: 'Encadrement',            role: 'Encadrement',         site: 'Reunion' },
  { code: 'FIC9', nom: 'MICHEL Paul (test)',   poste: 'Renfort inventaire',     role: 'Compteur_Inventaire', site: 'Reunion' },
];

// ── Immobilisations fictives — plage IM9000xx, hors de toute plage réelle utilisée en prod ──────
const IMMOS = [
  { code_im: 'IM900001', libelle: 'Perceuse-visseuse (test)',      categorie: 'Électroportatif',             compte_immobilisation: '21541', site: 'Reunion' },
  { code_im: 'IM900002', libelle: 'Meuleuse (test)',                categorie: 'Électroportatif',             compte_immobilisation: '21541', site: 'Reunion' },
  { code_im: 'IM900003', libelle: 'Multimètre (test)',              categorie: 'Mesure & test',               compte_immobilisation: '21542', site: 'Reunion' },
  { code_im: 'IM900004', libelle: 'Pince ampèremétrique (test)',    categorie: 'Mesure & test',               compte_immobilisation: '21542', site: 'Mayotte' },
  { code_im: 'IM900005', libelle: 'Échafaudage roulant (test)',     categorie: 'Matériel de chantier',        compte_immobilisation: '21543', site: 'Reunion' },
  { code_im: 'IM900006', libelle: 'Groupe électrogène (test)',      categorie: 'Matériel de chantier',        compte_immobilisation: '21543', site: 'Reunion' },
  { code_im: 'IM900007', libelle: 'Coffret de chantier (test)',     categorie: 'Coffrets & armoires',         compte_immobilisation: '21544', site: 'Mayotte' },
  { code_im: 'IM900008', libelle: 'Camion benne (test)',            categorie: 'Véhicules',                   compte_immobilisation: '2182',  site: 'Reunion' },
  { code_im: 'IM900009', libelle: 'Fourgon utilitaire (test)',      categorie: 'Véhicules',                   compte_immobilisation: '2182',  site: 'Reunion' },
  { code_im: 'IM900010', libelle: 'Ordinateur portable (test)',     categorie: 'Informatique & bureautique',  compte_immobilisation: '2183',  site: 'Reunion' },
  { code_im: 'IM900011', libelle: 'Étiqueteuse (test)',             categorie: 'Informatique & bureautique',  compte_immobilisation: '2183',  site: 'Reunion' },
  { code_im: 'IM900012', libelle: 'Bureau réglable (test)',         categorie: 'Mobilier',                    compte_immobilisation: '2184',  site: 'Reunion' },
  { code_im: 'IM900013', libelle: 'Armoire de rangement (test)',    categorie: 'Mobilier',                    compte_immobilisation: '2184',  site: 'Mayotte' },
  { code_im: 'IM900014', libelle: 'Logiciel de devis (test)',       categorie: 'Logiciels & licences',        compte_immobilisation: '205',   site: 'Reunion' },
  { code_im: 'IM900015', libelle: 'Niveau laser (test)',            categorie: 'Mesure & test',               compte_immobilisation: '21542', site: 'Reunion' },
  { code_im: 'IM900016', libelle: 'Marteau-piqueur (test)',         categorie: 'Électroportatif',             compte_immobilisation: '21541', site: 'Mayotte' },
  { code_im: 'IM900017', libelle: 'Poste à souder (test)',          categorie: 'Électroportatif',             compte_immobilisation: '21541', site: 'Reunion' },
  { code_im: 'IM900018', libelle: 'Compresseur (test)',             categorie: 'Matériel de chantier',        compte_immobilisation: '21543', site: 'Reunion' },
  { code_im: 'IM900019', libelle: 'Caution locaux (test)',          categorie: 'Immobilisations financières', compte_immobilisation: '2718',  site: 'Reunion' },
  { code_im: 'IM900020', libelle: 'Table à tréteaux (test)',        categorie: 'Mobilier',                    compte_immobilisation: '2184',  site: 'Reunion' },
];

// Affectations initiales (qui détient quoi) — le reste des immos reste "au dépôt" par défaut.
const AFFECTATIONS = [
  { code_im: 'IM900001', code_employe: 'FIC4', nom_employe: 'PETIT Sophie (test)', etat: 'Bon état' },
  { code_im: 'IM900002', code_employe: 'FIC6', nom_employe: 'MOREAU Julie (test)', etat: 'Usé' },
  { code_im: 'IM900005', code_employe: 'FIC5', nom_employe: 'DURAND Paul (test)',  etat: 'Bon état' },
  { code_im: 'IM900008', code_employe: 'FIC3', nom_employe: 'BERNARD Marc (test)', etat: 'Neuf' },
  { code_im: 'IM900010', code_employe: 'FIC8', nom_employe: 'SIMON Claire (test)', etat: 'Bon état' },
];

// ── Module Brasseurs d'air : dépôts + catalogue + quelques mouvements de départ ─────────────────
// Codes de dépôt/référence réalistes (pas de suffixe "(test)" : ce ne sont pas des données
// personnelles, juste une structure de catalogue générique — voir Fichiers divers/Brasseurs d'air/
// CADRAGE_MODULE_BRASSEURS.md pour le catalogue de départ complet attendu en production).
const BRASSEURS_DEPOTS = [
  { code: 'OMT', nom_complet: 'OM Transit', site: 'Reunion' },
  { code: 'TC2', nom_complet: 'TC N°2', site: 'Reunion' },
];
const BRASSEURS_CATALOGUE = [
  { reference: 'DCF-FS52920B', designation: "Brasseur d'air blanc", categorie: 'Brasseur' },
  { reference: 'DCF-FS52920N', designation: "Brasseur d'air noir", categorie: 'Brasseur' },
  { reference: 'PALES', designation: 'Jeu de pales', categorie: 'Pièce détachée' },
  { reference: 'CMD-M', designation: 'Commande murale', categorie: 'Pièce détachée' },
  { reference: 'T90', designation: 'Télécommande T90', categorie: 'Accessoire' },
];
// Quelques mouvements Entrée pour donner du stock de départ à OMT (proprietaire par défaut : ESR).
const BRASSEURS_MOUVEMENTS = [
  { depot: 'OMT', type_mouvement: 'Entree', proprietaire: 'ELECTRICITE SERVICES REUNION', tiers: '1stShine Industrial (test)',
    lignes: [{ reference: 'DCF-FS52920B', quantite: 20 }, { reference: 'DCF-FS52920N', quantite: 8 }, { reference: 'PALES', quantite: 25 }] },
  { depot: 'OMT', type_mouvement: 'Entree', proprietaire: 'ELECTRICITE SERVICES REUNION', tiers: 'Stock initial (test)',
    lignes: [{ reference: 'CMD-M', quantite: 15 }, { reference: 'T90', quantite: 10 }] },
];

async function main() {
  console.log('Worker de recette cible : ' + WORKER);

  console.log('\n→ Employés factices…');
  for (const e of EMPLOYES) await call('ajouter_employe', e);

  console.log('\n→ Immobilisations factices…');
  for (const i of IMMOS) await call('ajouter_immo', i);

  console.log('\n→ Affectations initiales…');
  for (const a of AFFECTATIONS) await call('importer_affectation_immo', a);

  console.log('\n→ Dépôts Brasseurs d\'air factices…');
  for (const d of BRASSEURS_DEPOTS) await call('ajouter_depot_brasseur', d);

  console.log('\n→ Catalogue Brasseurs d\'air factice…');
  for (const c of BRASSEURS_CATALOGUE) await call('ajouter_reference_brasseur', c);

  console.log('\n→ Stock de départ Brasseurs d\'air (mouvements Entrée)…');
  for (const m of BRASSEURS_MOUVEMENTS) await call('creer_mouvement_brasseur', m);

  console.log('\nTerminé. Rechargez le dashboard de recette pour voir les données.');
}

main().catch((e) => { console.error(e); process.exit(1); });

# Procédure — Environnement de recette (staging)

*Créé en août 2026. Objectif : pouvoir tester des changements (Worker + PWA + Dashboard) sans jamais
écrire dans les données réelles (1023+ immobilisations, ~97 collaborateurs). Coût : 0 € — un second
site SharePoint (inclus dans le forfait M365 déjà payé) + un second Worker Cloudflare (free tier) +
un sous-dossier du site GitHub Pages déjà existant.*

Voir `04_HISTORIQUE_DECISIONS.md` pour le raisonnement complet (comparaison des options envisagées)
et `01_ARCHITECTURE_TECHNIQUE.md` pour le schéma d'ensemble.

## Principe

| | Production | Recette |
|---|---|---|
| Worker Cloudflare | `immo-proxy` | `immo-proxy-staging` |
| Site SharePoint | `espacesoleil97.sharepoint.com/sites/Logistique-Immos` | **un site séparé, à créer** — mêmes noms de liste que la prod (pas de préfixe `TEST_` : l'isolation vient du site, pas d'une convention de nommage) |
| Pages web | `https://ral974.github.io/immo-tracker/` | `https://ral974.github.io/immo-tracker/staging/` |
| Détection | — | Le code (identique à la prod) détecte le chemin `/staging/` au chargement et bascule le Worker cible + affiche un bandeau rouge permanent |

Le code de `app.js`/`dashboard.html`/`index.html` est **strictement le même** entre les deux — le
dossier `staging/` n'est qu'une copie miroir (voir `scripts/sync-staging.js`), jamais éditée à la
main. Seuls trois fichiers diffèrent volontairement dans `staging/` : `manifest.json` (nom/couleur/
URL de démarrage distincts, pour qu'une PWA installée depuis la recette ne se confonde jamais avec
la vraie), et `immos.json`/`employes.json` (catalogues **fictifs**, jamais les vraies données).

## Mise en place (une seule fois)

### 1. Site SharePoint de recette

Créez un nouveau site SharePoint (même tenant M365, gratuit). Notez son identifiant Graph (même
format que `SITE_ID` documenté dans `01_ARCHITECTURE_TECHNIQUE.md` — obtenu via
`GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{chemin}` ou l'explorateur Graph).

Aucune démarche Azure AD supplémentaire : l'app "Immo Tracker" a déjà une permission Graph
tenant-wide (`Sites.ReadWrite.All`), donc un accès automatique au nouveau site.

### 2. Listes SharePoint à créer sur ce nouveau site

**Méthode recommandée (rapide, quelques minutes) : dupliquer la structure depuis la production,
sans copier les données.** SharePoint moderne sait créer une liste à partir d'une liste existante,
même située sur un autre site :

1. Sur le nouveau site de recette : **+ Nouveau → Liste**.
2. Choisissez **"À partir d'une liste existante"**.
3. Recherchez/parcourez jusqu'au site de production `Logistique-Immos` et sélectionnez la liste réelle.
4. Donnez le **même nom exact** à la nouvelle liste (sans préfixe — le code y fait référence par ce nom).
5. Validez → colonnes identiques, **aucune donnée copiée**.

Répétez pour chacune des 32 listes ci-dessous (dupliquer une liste supplémentaire présente sur le site
source mais non listée ici ne pose aucun problème — elle sera simplement inutilisée).

⚠️ *Table mise à jour le 9 septembre 2026 : les 5 listes `Brasseurs_*` (module Brasseurs d'air, 11 août
2026) et les 5 listes `Fournisseurs`/`EPI_Consultations`/`EPI_Consultation_Lignes`/`EPI_Offres`/
`EPI_Offres_Lignes` (module Besoin EPI/Consultations, sept. 2026) manquaient de cette table — ajoutées
ci-dessous. Colonnes détaillées dans `02_MODELE_DONNEES.md`.*

**Méthode de repli** (si cette fonctionnalité n'est pas disponible sur votre tenant) : recréez
chaque liste colonne par colonne. Pour chaque liste ci-dessous dont le détail est déjà documenté
dans `02_MODELE_DONNEES.md`, reprenez-le tel quel. Pour les 3 listes marquées ⚠️ (schéma non
intégralement documenté), obtenez le détail exact en interrogeant la **production en lecture
seule** (aucun risque, endpoint de diagnostic déjà existant) :

```
https://immo-proxy.ral-85d.workers.dev/?debug_columns=<NomDeLaListe>
```

| Liste | Colonnes | Référence |
|---|---|---|
| `Immos` | `Title, Libelle, Categorie, N_Serie, Etat, Valeur_Achat, Date_Achat, Date_Mise_Service, Compte_Immobilisation, Compte_Amortissement, Compte_Dotation, Site, Actif, FDS_URL` | `02_MODELE_DONNEES.md` § Liste Immos |
| `Employes` | `Title, field_1, field_2, Poste, Code_CT, Site, MotDePasse, Affectation_EPI, Taille_Pantalon, Taille_Tshirt, Taille_Veste, Pointure_Chaussures, Taille_Gants, Service_Outillage` | idem § Liste Employes + § module EPI/Outillage |
| `Mouvements` | `Title, Code_Employe, Type_Mouvement, Code_Chantier, Commentaire, Etat, Note, Cout_Reparation, Horodatage` | idem § Liste Mouvements |
| `Transferts_En_Attente` | ⚠️ vérifier via `?debug_columns=Transferts_En_Attente` | — |
| `Reservations` | ⚠️ vérifier via `?debug_columns=Reservations` | — |
| `Absences` | ⚠️ vérifier via `?debug_columns=Absences` (liste non détaillée dans `02_MODELE_DONNEES.md`, voir écart documenté dans `04_HISTORIQUE_DECISIONS.md`) | — |
| `Campagnes_Inventaire` | `Title, Date_Debut, Date_Fin, Statut, Cree_Par, Cloture_Par, Date_Cloture` | § Liste Campagnes_Inventaire |
| `Lignes_Inventaire` | `Title, Zone, Site, Chantier, Fabricant, Reference, Designation, Quantite, Chute_Cable, Observations, Code_Employe, Horodatage` | § Liste Lignes_Inventaire |
| `Campagnes_Inventaire_Immos` | `Title, Date_Debut, Date_Fin, Statut, Cree_Par, Cloture_Par, Date_Cloture` | § Liste Campagnes_Inventaire_Immos |
| `Scans_Inventaire_Immos` | `Title, Campagne, Code_Employe, Nom_Employe, Site, Horodatage` | § Liste Scans_Inventaire_Immos |
| `Catalogue_Articles_EPI` | `Title, Type_Article, Taille_Salarie, Taille_Affichage, Reference, Designation, Fournisseur, Stock_Actuel, Stock_Mini` | § Liste Catalogue_Articles_EPI |
| `Grille_Dotation_EPI` | `Title, Type_Article, Quantite` | § Liste Grille_Dotation_EPI |
| `Dotations_EPI` | `Title, Type_Dotation, Annee_Civile, Nom_Destinataire, Site, Statut, Genere_Par, Genere_Le, Emarge_Par, Emarge_Le, Photo_Fiche` | § Liste Dotations_EPI |
| `Lignes_Dotation_EPI` | `Title, Type_Article, Taille_Article, Reference_Article, Quantite` | § Liste Lignes_Dotation_EPI |
| `Catalogue_Outillage` | `Title, Reference, Distributeur, Marque, Prix_Unitaire, Stock_Actuel, Duree_Amortissement_Mois, Stock_Mini` | § Liste Catalogue_Outillage |
| `Grille_Outillage` | `Title, Type_Article, Quantite` | § Liste Grille_Outillage |
| `Lignes_Outillage` | `Title, Type_Article, Date_Remise, Emarge_Par, Photo_Fiche, Lot_Distribution` | § Liste Lignes_Outillage |
| `Materiel_IT` | `Title, Type_Materiel, Marque, Modele, N_Serie, Site, Statut, Date_Sortie_Service, Cout_Mensuel, N_Telephone, Operateur, N_Carte_SIM, Code_PIN, Code_PUK, Code_RIO, Code_deverouillage, Commentaire` | § Liste Materiel_IT (⚠️ nom exact `Code_deverouillage`, sans le 2ᵉ "r") |
| `Mouvements_Materiel_IT` | `Title, Code_Employe, Nom_Detenteur, Note, Horodatage` | § Liste Mouvements_Materiel_IT |
| `Lignes_Telephoniques` | `Title, N_Telephone, Operateur, N_Carte_SIM, Code_PIN, Code_PUK, Code_RIO, Site, Statut, Commentaire` | § Liste Lignes_Telephoniques |
| `Mouvements_Lignes_Telephoniques` | `Title, Code_Employe, Nom_Detenteur, Note, Horodatage` | § Liste Mouvements_Lignes_Telephoniques |
| `Journal_Audit` | `Title, Horodatage, Code_Employe, Action, Cible, Detail, Resultat` | § Liste Journal_Audit |
| `Brasseurs_Depots` | `Title, Nom_Complet, Prefixe_Document, Site, Actif` | § `Brasseurs_Depots` |
| `Brasseurs_Catalogue` | `Title, Designation, Categorie, Stock_Mini, Actif` | § `Brasseurs_Catalogue` |
| `Brasseurs_Mouvements` | ⚠️ vérifier via `?debug_columns=Brasseurs_Mouvements` — la colonne quantité s'appelle en interne `Quantit_x00e9_` (« Quantité » avec accent, encodé par SharePoint), pas `Quantite` | § `Brasseurs_Mouvements` |
| `Brasseurs_Commandes` | `Title, Origine, Fournisseur, Date_Commande, Montant_Total, Devise, Acompte_Pourcentage, Incoterm, Delai_Estime_Jours, Date_Arrivee_Estimee, Date_Arrivee_Reelle, Statut, Cree_Par, Notes` (⚠️ `Notes` en **« Une seule ligne de texte »** tronque au-delà de ~255 caractères — vécu réellement, voir `04_HISTORIQUE_DECISIONS.md`) | § `Brasseurs_Commandes` |
| `Brasseurs_Lignes_Commande` | `Title, Reference, Quantite_Commandee, Prix_Unitaire, Quantite_Recue` | § `Brasseurs_Lignes_Commande` |
| `Fournisseurs` | `Title, Contact_Nom, Contact_Email, Contact_Telephone, Domaines, Actif, Notes` (⚠️ `Notes` en **« Plusieurs lignes de texte »**) | § `Fournisseurs` |
| `EPI_Consultations` | `Title, Annee_Cible, Statut, Date_Creation` (**Date et heure**), `Date_Limite_Reponse, Cree_Par, Parametres, Notes` (⚠️ `Parametres`/`Notes` en **« Plusieurs lignes de texte »**) | § `EPI_Consultations` |
| `EPI_Consultation_Lignes` | `Title, Type_Article, Taille_Article, Reference_Interne, Designation, Quantite_Reunion, Quantite_Mayotte, Quantite_Calculee, Quantite_Retenue, Commentaire, Fournisseur_Retenu, Motif_Choix` (⚠️ `Motif_Choix` en **« Plusieurs lignes de texte »**) | § `EPI_Consultation_Lignes` |
| `EPI_Offres` | `Title, Fournisseur, Date_Reception, Validite_Offre, Delai_Livraison_Jours, Frais_Port, Franco_A_Partir_De, Remise_Globale_Pct, Devise, Statut, Notes` (⚠️ `Notes` en **« Plusieurs lignes de texte »**) | § `EPI_Offres` |
| `EPI_Offres_Lignes` | `Title, Ligne_Consultation_Id, Type_Article, Taille_Article, Reference_Fournisseur, Designation_Proposee, Prix_Unitaire_HT, Conditionnement, Quantite_Minimum, Delai_Jours, Non_Propose, Commentaire` (⚠️ `Commentaire` en **« Plusieurs lignes de texte »**) | § `EPI_Offres_Lignes` |

Ne créez **pas** de liste `Chantiers` : elle n'existe pas réellement côté code (`Code_Chantier` est
un champ texte libre) — voir l'écart documenté dans `04_HISTORIQUE_DECISIONS.md`.

### 3. Worker Cloudflare de recette

1. Dans Cloudflare, créez une nouvelle ressource Worker nommée `immo-proxy-staging`.
2. Connectez-la au **même dépôt GitHub** (`RAL974/immo-tracker`), branche `main`.
3. ⚠️ **Point à ne pas manquer** : dans les réglages de build de cette ressource (Settings → Build →
   "Build configuration", icône crayon), remplacez **à la fois** "Deploy command" et "Version
   command" par : `npx wrangler deploy --env staging` (au lieu de `npx wrangler deploy` par défaut).
   Sans ça, Cloudflare déploie quand même un Worker nommé "immo-proxy-staging", mais avec la
   configuration de **premier niveau** de `wrangler.toml` — donc sans `SITE_ID_ENV`, avec repli
   silencieux sur le site de **production**. Le journal de build signale cette erreur explicitement
   ("Failed to match Worker name... Overriding using the CI provided Worker name") si vous l'avez
   ratée : dans ce cas, corrigez la commande puis redéclenchez un déploiement (un simple commit,
   même vide, sur `main` suffit à relancer le build).
4. Dans `wrangler.toml` (déjà commité), remplacez `REMPLACER_PAR_L_ID_DU_SITE_SHAREPOINT_TEST` dans
   le bloc `[env.staging]` par l'identifiant obtenu à l'étape 1 (format
   `hostname,guid-collection,guid-web` — s'obtient via Graph Explorer,
   `https://graph.microsoft.com/v1.0/sites/espacesoleil97.sharepoint.com:/sites/<nom-du-site>`,
   champ `id` de la réponse).
5. Dans Settings → Variables and Secrets **de cette ressource `immo-proxy-staging`** (pas celle de
   `immo-proxy`), ajoutez :
   - `CLIENT_SECRET_ENV` : la même valeur que la production si vous l'avez encore sous la main,
     sinon un **nouveau** secret créé sur la même application Azure AD "Immo Tracker" (Azure Portal
     → App registrations → Immo Tracker → Certificates & secrets → New client secret — copier la
     valeur immédiatement, elle ne sera plus jamais affichée).
   - `SESSION_SECRET_ENV` : une **valeur différente** de la production (texte aléatoire, 32+
     caractères) — pour qu'un jeton de session émis par la recette ne soit jamais valide côté prod.
6. **Vérification obligatoire avant d'aller plus loin** : ouvrez
   `https://immo-proxy-staging.<votre-sous-domaine>.workers.dev/?debug_immos=1` dans un navigateur.
   La production contient 1023 immos ; la recette doit répondre une liste **vide** (`"value":[]`).
   Si de vraies immos apparaissent, **ne continuez pas** — le point 3 ci-dessus n'a probablement pas
   été appliqué correctement.

### 4. Bootstrap du premier compte (obligatoire, dans cet ordre)

Impossible de se connecter au dashboard tant qu'aucun employé n'existe dans `Employes` (le Worker
répond `employe_introuvable`), et impossible de créer un employé via l'app tant qu'on n'est pas
connecté — il faut donc une première ligne créée **à la main** dans SharePoint, exactement comme au
tout premier démarrage du vrai système :

1. Dans la liste `Employes` du site de recette, ajoutez une ligne : `Title=AIWI`, `field_2=Oui`,
   `Code_CT=Admin`, `Site=Reunion`.
2. Ouvrez `https://ral974.github.io/immo-tracker/staging/dashboard.html`, connectez-vous avec le
   code `AIWI` et créez un mot de passe (première connexion — **distinct** de votre mot de passe de
   production, c'est un environnement totalement séparé).
3. Récupérez le jeton de session depuis la console du navigateur (F12) :
   `sessionStorage.getItem('admin_token')`

### 5. Peupler le jeu de données factice

```bash
node scripts/seed-staging-data.js --token=<jeton récupéré à l'étape précédente>
```

Crée ~9 employés fictifs (codes `FIC1`…`FIC9`, noms génériques suivis de `(test)`, aucune donnée
personnelle réelle) et 20 immobilisations fictives (codes `IM900001`…`IM900020`, hors de toute plage
utilisée en production), avec quelques affectations initiales. Le script est idempotent (relançable
sans dupliquer). Le contenu exact est visible dans `scripts/seed-staging-data.js`.

Rechargez le dashboard de recette : les données factices apparaissent.

## Workflow au quotidien

```
développer  →  synchroniser  →  tester en recette  →  valider  →  pousser en production
```

1. **Développer** normalement sur `worker.js`/`app.js`/`dashboard.html`.
2. **Synchroniser** le miroir de recette : `npm run sync:staging` (copie `index.html`, `dashboard.html`,
   `app.js`, `style.css`, `design-system.css`, `sw.js`, les logos — dans `staging/`).
   `npm run check` (donc `npm run verify`) **échoue** si vous avez oublié cette étape.
3. **Tester en recette**, deux façons possibles, à combiner selon le besoin :
   - **Local, le plus rapide** : servez le dépôt avec un serveur statique (`python3 -m http.server`,
     pratique déjà utilisée dans les sessions précédentes), ouvrez `http://localhost:xxxx/staging/`.
     Itération immédiate, aucun déploiement nécessaire.
   - **Sur un vrai appareil** (téléphone, caméra, installation PWA, mode hors-ligne) : poussez sur
     `main` (le dossier `staging/` étant commité, il se déploie avec `deploy.yml`, **sans aucune
     modification** de ce workflow existant) puis ouvrez
     `https://ral974.github.io/immo-tracker/staging/`.
   - Dans les deux cas : le bandeau rouge **« 🧪 RECETTE »** doit être visible en permanence. S'il
     n'apparaît pas, ne continuez pas — quelque chose ne pointe pas là où vous le croyez.
4. **Valider** : vous êtes satisfait du comportement observé en recette (données 100% fictives, donc
   aucune conséquence si un test tourne mal).
5. **Pousser en production** : rien de spécial — `git push` sur `main` comme d'habitude. Le Worker
   `immo-proxy` et les pages de production se déploient indépendamment de la recette (pipelines
   Cloudflare séparés par ressource, même s'ils partagent la même branche `main`).

## Scénario de bout en bout — Besoin EPI & Consultations fournisseurs (ajouté sept. 2026)

*Jouable intégralement sur `https://ral974.github.io/immo-tracker/staging/dashboard.html` (ou en local,
voir § Workflow au quotidien), avec les seules données 100% fictives déjà en place (`FIC1`…`FIC9`,
`IM900001`…`IM900020`) — aucune conséquence, quel que soit le résultat. Objectif : vérifier le module
de bout en bout avant la première consultation réelle, en connaissance de cause plutôt qu'en devinant.
Connectez-vous en `AIWI` (Admin) ou tout compte `Logistique`/`Logistique_Mayotte` — `peutGererEPI` est
la seule capacité requise, aucune nouvelle capacité `ROLE_CAPS` n'existe pour ce module.*

**Préalable bloquant** (§ 2 ci-dessus, mise en place unique) : les 5 listes SharePoint du module
(`Fournisseurs`, `EPI_Consultations`, `EPI_Consultation_Lignes`, `EPI_Offres`, `EPI_Offres_Lignes`)
doivent exister sur le site de recette — vérifiez avec `?debug_columns=<Liste>` sur
`immo-proxy-staging` avant de commencer. Sans ça, chaque étape ci-dessous échouera avec une erreur
Graph explicite (`itemNotFound`), pas une erreur silencieuse.

**Étape 0 — préparer un minimum de données EPI en recette** (le script `seed-staging-data.js` ne
touche à aucun champ EPI — normal, il date d'avant ce module) :
1. Onglet EPI → Grille de dotation : si vide, ajoutez au moins une ligne (bouton "➕ Ajouter article",
   ex. affectation `C`, type `Pantalon`, quantité `1`). Laissez `Renouvellement_Mois` non renseigné —
   le calcul retombera sur 12 mois par défaut, comportement normal tant que William n'a pas créé cette
   colonne.
2. Onglet EPI → Stock : si le catalogue est vide, ajoutez au moins un article correspondant (bouton
   "➕ Ajouter article", ex. type `Pantalon`, taille `M`).
3. Fiche employé de 2 `FIC` actifs (ex. `FIC1`, `FIC2`) : renseignez `Affectation_EPI=C` et
   `Taille_Pantalon=M` (bouton d'édition des tailles sur la fiche, action `maj_taille_employe`) —
   sans employé éligible, le besoin calculé sera 0 partout et la suite n'aura rien à figer.

**1. Calcul du besoin** — Onglet EPI → sous-onglet "📋 Besoin annuel". Saisissez une année (ex. l'année
suivante), une marge de sécurité (ex. `10`), laissez l'effectif prévisionnel à 0 pour ce premier essai
(pas de recrue fictive à inventer). Le tableau "Besoin par article" doit afficher au moins une ligne
(`Pantalon`/`M`) avec une quantité Réunion/Mayotte cohérente avec le site des 2 employés préparés à
l'étape 0.

**2. Contrôle des anomalies** — Les 6 tableaux d'anomalies (tailles manquantes, article introuvable,
type absent du catalogue, affectation non reconnue, site non exploitable, taille à préciser) doivent
tous s'afficher, vides ou pleins selon les données. Pour vérifier qu'ils réagissent réellement (pas
juste vides par défaut) : videz temporairement `Taille_Pantalon` sur `FIC2`, rechargez le besoin —
la ligne "Tailles manquantes" doit lister `FIC2`/`Pantalon`. Remettez la taille ensuite.

**3. Figeage** — Bouton "🧊 Figer en consultation" : donnez un nom (ex. `Consultation EPI TEST`),
confirmez. Bascule automatique vers l'onglet "📑 Consultations", la nouvelle consultation apparaît en
statut `Brouillon`. Ouvrez-la : les lignes de besoin (`Quantite_Retenue` éditable) sont bien celles
calculées à l'étape 1, figées — modifier ensuite la grille de dotation ou l'effectif réel ne doit
**jamais** changer ces lignes (vérifiable en rouvrant la consultation après une modification de la
grille).

**4. Trois fournisseurs** — Onglet "🏭 Fournisseurs" : créez 3 fournisseurs fictifs actifs, par exemple
`Fournisseur Test A`, `Fournisseur Test B`, `Fournisseur Test C` (jamais un nom réel — voir § Sécurité
plus bas). Un nom déjà pris doit être refusé (`doublon`) — testez-le en recréant `Fournisseur Test A`
une seconde fois.

**5. Trois offres, dont une incomplète** — Retour sur la consultation, bouton "➕ Enregistrer une
offre" pour chacun des 3 fournisseurs :
- **Fournisseur Test A** : prix bas sur la ligne `Pantalon`/`M` (ex. `15€`).
- **Fournisseur Test B** : prix plus élevé (ex. `18€`), avec un `Conditionnement=5` pour observer son
  effet sur le comparatif (arrondi de la quantité commandée au multiple de 5 supérieur).
- **Fournisseur Test C** : **offre volontairement incomplète** — laissez le prix vide et cochez
  `Non proposé` sur la ligne, pour vérifier que le comparatif affiche bien "non proposé" et non un
  prix à 0€ (distinction testée explicitement par le code, voir `04_HISTORIQUE_DECISIONS.md`).

  *Variante pour tester le cadre de réponse fournisseur (session 4)* : plutôt que de saisir Fournisseur
  Test B à la main, utilisez "📤 Cadre de réponse" (choisissez Fournisseur Test B), remplissez les
  colonnes I à P du fichier Excel généré, puis "📥 Importer un cadre" pour le réimporter — l'écran de
  contrôle doit afficher la ligne comme "✅ Reconnue" (identifiant technique en colonne A intact).

**6. Comparatif** — Toujours sur la consultation, le tableau comparatif doit afficher les 3 offres côte
à côte, `Fournisseur Test C` marqué "non proposé" (jamais 0€) sur sa ligne, et le total de
`Fournisseur Test B` recalculé avec l'arrondi de conditionnement (surcoût affiché explicitement).
Vérifiez le scénario A (mono-fournisseur) : comme aucun des 3 ne couvre 100% des lignes s'il y a
plusieurs lignes de besoin, il doit être signalé "non calculable" plutôt que de forcer un résultat.

**7. Attribution panachée** — Utilisez "Tout attribuer au moins-disant" (doit retenir Fournisseur Test
A sur la ligne testée, le moins cher). Passez la consultation en `Depouillement` (statut) puis modifiez
manuellement l'attribution d'une ligne pour vérifier qu'elle reste éditable à ce stade (mais plus une
fois passée en `Envoyee` — testez le refus en essayant d'éditer après être passé par `Envoyee` puis
retour impossible, les transitions sont à sens unique sauf vers `Annulee`).

**8. Export et report au catalogue** — "📥 Export Excel" : vérifiez les 4 onglets (Synthèse et
scénarios, Comparatif détaillé, un onglet par fournisseur, Attribution retenue). Puis, avec la
consultation en `Depouillement` ou `Attribuee`, bouton de report au catalogue : le tableau de contrôle
doit proposer la référence/le fournisseur retenu pour `Pantalon`/`M` — validez, puis vérifiez sur
`Catalogue_Articles_EPI` (onglet Stock) que seuls `Reference`/`Fournisseur` ont changé, jamais
`Stock_Actuel`.

**Nettoyage** : aucun nécessaire — tout ceci reste dans le site de recette, sans aucune conséquence sur
la production. Vous pouvez annuler la consultation de test (`Annulee`) ou la laisser en l'état pour une
prochaine session de vérification.

## Checklist — avant la première consultation EPI réelle (production)

*À dérouler dans cet ordre. Le code est fait et testé (341/341, voir `04_HISTORIQUE_DECISIONS.md`) —
ce qui reste est entièrement côté données, pas côté développement.*

1. **Créer les 5 listes SharePoint sur le site de production** (`Fournisseurs`, `EPI_Consultations`,
   `EPI_Consultation_Lignes`, `EPI_Offres`, `EPI_Offres_Lignes`) — méthode "À partir d'une liste
   existante" en dupliquant depuis la recette une fois qu'elle a servi de gabarit, ou colonne par
   colonne depuis `02_MODELE_DONNEES.md`. Vérifier avec `?debug_columns=<Liste>` sur `immo-proxy`
   (production) avant tout usage réel — même geste que pour la recette, sur les noms de colonnes
   accentués/Date-heure/Notes-tronquées (voir § 2 ci-dessus, "Pièges à ne pas reproduire").
2. **Créer la colonne `Renouvellement_Mois` sur `Grille_Dotation_EPI`** (production **et** recette si
   pas déjà fait) — Nombre, optionnelle. Tant qu'elle est absente ou vide sur une ligne, le calcul
   applique 12 mois par défaut sans régression : ce n'est donc **pas** bloquant pour démarrer, mais la
   précision du besoin en dépend directement (un article renouvelé tous les 24 mois calculé sur une
   base de 12 mois par défaut double le besoin annuel estimé). Renseigner ligne par ligne depuis
   l'onglet EPI → Grille de dotation (lien "🔁" sous chaque quantité) — pas d'import en masse prévu
   pour ce champ, la grille ne compte qu'une quarantaine de lignes.
3. **Collecter les tailles manquantes auprès des salariés** : le module signale (tableau "Tailles
   manquantes" de l'écran Besoin annuel) chaque employé éligible sans une des 5 tailles requises pour
   un type d'article donné — mais ne peut évidemment pas les deviner. À rapprocher du processus
   d'embauche déjà en place (le formulaire "Ajouter un employé" du dashboard capture déjà l'affectation
   + les 5 tailles à la création) — le point d'attention porte sur les employés déjà présents avant ce
   formulaire, dont une taille pourrait manquer.
4. **Fiabiliser le champ `Site` sur les employés mahorais avant de faire confiance à la ventilation
   Réunion/Mayotte du besoin.** Vérifié le 9 sept. 2026 (`?employes=1`, 102 employés) : 0 valeur vide
   sur les actifs (75 Réunion / 24 Mayotte) — mais cette vérification ne contrôle que l'absence de
   valeur, pas son exactitude (un employé physiquement à Mayotte mais coché `Reunion` par erreur de
   saisie ne serait pas détecté). Ce projet a déjà eu ce type d'erreur par le passé sur d'autres
   entités (véhicules mal localisés entre les deux sites, corrigés lors de la migration EBP de juillet
   2026) — un contrôle humain rapide de la colonne `Site` sur les ~24 employés actifs de Mayotte, avant
   de figer une première consultation, évite qu'une erreur silencieuse fausse durablement la
   ventilation territoriale du besoin (elle serait ensuite figée dans `EPI_Consultation_Lignes` et ne
   se recalculerait jamais automatiquement).
5. **Saisir les vrais fournisseurs dans le référentiel** (onglet Fournisseurs) — contact, email,
   téléphone, domaines. Le répertoire est vide en production comme en recette au 9 septembre 2026 ;
   aucune donnée fournisseur réelle n'a été saisie où que ce soit dans ce dépôt à cette date (vérifié,
   voir `04_HISTORIQUE_DECISIONS.md`).
6. **Dérouler une première consultation réelle à faible enjeu** avant la campagne annuelle complète —
   par exemple un seul type d'article, pour se familiariser avec le cycle Brouillon → Envoyee →
   Depouillement → Attribuee → Cloturee sans le stress d'une consultation complète en jeu.

## Ce que la recette NE fait PAS

- Elle ne gate pas le déploiement : la recette et la production se déploient depuis le **même
  commit** sur `main` (choix simple retenu — voir `04_HISTORIQUE_DECISIONS.md`). Le vrai test
  "avant que ce soit en ligne" se fait **localement**, avant de pousser.
- Elle ne remplace pas `npm run verify` : c'est toujours le seul filet qui bloque un `git push` cassé
  au niveau syntaxe/logique pure (hook `pre-push`).

## Sécurité

- Les secrets `CLIENT_SECRET_ENV`/`SESSION_SECRET_ENV` de la recette vivent **uniquement** dans
  Cloudflare (ressource `immo-proxy-staging`), jamais dans le dépôt Git.
- Le CORS du Worker de recette est **identique** à celui de la production (`ral974.github.io`
  uniquement) — les pages prod et recette partagent la même origine, seul le chemin diffère ; ce
  n'est de toute façon pas le CORS qui isole les deux environnements, c'est le site SharePoint
  distinct côté serveur.
- Ne donnez jamais le jeton de session de recette à quelqu'un d'autre que vous — même s'il n'a accès
  qu'à des données fictives, un jeton valide reste une preuve d'identité sur ce Worker.
- **Tout scénario de test (y compris le scénario Besoin EPI/Consultations ci-dessus) doit utiliser des
  noms de fournisseurs et des prix inventés** (ex. `Fournisseur Test A`, jamais le nom d'un fournisseur
  réel de l'entreprise) — la recette reste un environnement partagé et loggé, même s'il n'a aucune
  conséquence fonctionnelle. Même règle déjà appliquée aux fixtures des tests automatisés du module
  (`ACME Corp`, `Beta SARL`, aucune donnée réelle — vérifié le 9 sept. 2026, voir
  `04_HISTORIQUE_DECISIONS.md`).

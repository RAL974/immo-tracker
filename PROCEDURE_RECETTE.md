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

Répétez pour chacune des 22 listes ci-dessous (dupliquer une 23ᵉ liste présente sur le site source
mais non listée ici ne pose aucun problème — elle sera simplement inutilisée).

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

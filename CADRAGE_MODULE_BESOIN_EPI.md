# Cadrage — Module « Besoin EPI » (consultation fournisseurs)

*Document de cadrage, non livré au code. Rédigé après audit du code réel (`worker.js`,
`dashboard.html`, `tests/`) et vérification en direct sur le Worker de production
(`?debug_columns=Employes`, `?employes=1`) — le code et les données réelles font foi, pas
la documentation `00_*`-`05_*`/`CLAUDE.md`, qui a plusieurs sessions de retard (voir §1.5).
Aucune ligne de code écrite. Aucune liste SharePoint créée. Aucun fichier de code modifié.*

*Objectif du module : construire le besoin EPI de l'année à venir (quantités par article ×
taille × territoire), lancer une consultation auprès de plusieurs fournisseurs, saisir
leurs offres, comparer, arbitrer ligne à ligne, puis reporter les références retenues au
catalogue — en s'ajoutant à l'onglet EPI existant (dotation annuelle, catalogue, grille,
stock, suggestion de commande, historique), sans le modifier.*

*Les 6 questions ouvertes de la v1 de ce document ont toutes été tranchées par William en
session (voir §8, qui documente désormais l'état après réponses) — ce document intègre
ses choix, tous alignés sur l'option recommandée.*

---

## 1. Constats de l'audit (code réel, pas la doc)

### 1.1 Chaîne de calcul du besoin existante — étendre, pas réécrire

- **`worker.js:2489-2510`** : `TAILLE_FIELD_PAR_TYPE` (10 types d'article → champ de taille
  employé SharePoint, ex. `'Pantalon':'Taille_Pantalon'`) et `trouverArticleCatalogue()`
  (recherche catalogue par type + taille, comparaison `trim().toLowerCase()`, gère les
  articles à taille unique). Utilisée par `generer_dotation_epi` (`worker.js:2680-2723`).
- **`dashboard.html:2626-2650`** : miroir client `EPI_TAILLE_FIELD_PAR_TYPE` +
  `epiTrouverArticleCatalogue()` + **`epiCalculerBesoinStock(affectation,tailles)`** — la
  vraie brique réutilisable : pour un profil et un jeu de 5 tailles donnés, renvoie le
  besoin ligne à ligne (type, taille, quantité requise, stock dispo, suffisant). **Générique,
  ne suppose rien sur la population appelante — directement réutilisable telle quelle.**
- **`epiEmployesSansFiche(annee)`** (`dashboard.html:2652-2657`) : filtre
  `employesList` sur `Actif && AffectationEPI`, **puis exclut ceux qui ont déjà une fiche
  Annuelle/Entree pour l'année** — c'est un filtre de *rattrapage*, pas un recensement de
  l'effectif complet.
- **`calculerManquantsEPI(annee)`** (`dashboard.html:2662-2676`) : appelle
  `epiEmployesSansFiche`, puis pour chacun `epiCalculerBesoinStock`, agrège par
  `(type_article, taille)` en sommant `quantite_requise`. **Périmètre exact aujourd'hui :
  uniquement les employés actifs+éligibles n'ayant PAS encore de fiche cette année** — sert
  la vue "Suggestion de commande" (combler le stock pour les rattrapages en attente), pas
  un besoin annuel total. La carte "🆕 Nouveaux entrants sans dotation"
  (`dashboard.html:2551-2568`) affiche le même périmètre par employé.
- **Conséquence pour le module besoin/consultation** : `calculerManquantsEPI` **ne peut
  pas être réutilisée telle quelle** (mauvais périmètre — elle ignore délibérément tout
  employé déjà doté cette année, alors qu'une consultation fournisseurs doit couvrir
  l'effectif complet pour l'année *suivante*). En revanche `epiCalculerBesoinStock` (le
  cœur du calcul par profil) est **directement réutilisable sans modification** — voir §2.
  Une nouvelle fonction d'agrégation est nécessaire, sur le modèle de
  `calculerManquantsEPI` mais avec une autre population source (voir §2, étape A).

### 1.2 Mapping taille → article : les deux implémentations sont strictement équivalentes

Comparaison ligne à ligne faite sur le code réel (pas supposée) :

| | `worker.js:2489-2496` | `dashboard.html:2628-2633` |
|---|---|---|
| 10 types d'article | identiques, y compris accents (`'Gants à picot'`, `'Gants gros œuvre'` — la graphie corrigée après le bug historique documenté dans `04_HISTORIQUE_DECISIONS.md`) | identiques |
| Champ de taille cible | nom de colonne SharePoint (`'Taille_Pantalon'`) | propriété locale camelCase (`'taillePantalon'`) |
| Comparaison | `trim().toLowerCase()` sur `Taille_Salarie` OU `Taille_Affichage` | identique, sur `taille_salarie`/`taille_affichage` |
| Articles à taille unique | même liste implicite (absents des deux objets) → `catalogue.find(type seul)` | idem |

La différence de casse des clés (`Taille_Pantalon` vs `taillePantalon`) n'est **pas une
divergence** : c'est la conséquence normale et cohérente de la chaîne de transformation
`Employes.Taille_Pantalon` (SharePoint) → `?employes=1` → `taille_pantalon` (snake, JSON)
→ `dashboard.html:1013` → `TaillePantalon` (Pascal, `employesList`) →
`dashboard.html:1023` → `taillePantalon` (camel, `employesByCode`). Vérifié bout en bout
sur le code réel — aucune rupture dans la chaîne.

### 1.3 Export, filtres, territoire — réutilisables sans rien inventer

- **`territoireLabel(site)`** (`dashboard.html:8605`) : `Mayotte`→`'Mayotte'`, sinon
  `'Réunion'`. Fonction pure, un seul point de vérité pour l'affichage territorial.
- **`SITE_FILTERS`** (`dashboard.html:5957`) + **`setSiteFilter(tab,val)`**
  (`:5958`) : objet global par onglet (`SITE_FILTERS.circulation`, etc.), pas de nouvel
  onglet dans cet objet nécessaire tant que le module n'a pas de filtre Réunion/Mayotte
  *transversal* — voir §6 (les lignes du besoin sont déjà scindées par territoire dans
  leurs propres colonnes, D1, donc un filtre par site n'est probablement pas nécessaire
  au même sens que sur Circulation/Dépôt ; à confirmer à l'usage, hors périmètre bloquant).
- **`ligneFiltresActifs(filtres)`** (`:8617-8621`) : construit la ligne "Filtres actifs :
  ... " ou "Aucun filtre actif (export complet)" en tête de chaque export — **contrat
  déjà appliqué à tous les exports existants**, à reprendre à l'identique.
- **`exporterExcel(nomFichier, ongletsSpec)`** (`:8626-8637`) : point d'entrée unique
  (SheetJS déjà chargé), multi-onglets, en-têtes stylées automatiquement. **Aucune
  modification requise** — le module besoin l'appelle comme tous les `exporterXxx()`
  existants (`exporterCommandeEPI`, `exporterDotationsEPI`, etc., même fichier).

Les trois briques sont génériques et directement réutilisables.

### 1.4 Pattern « commande fournisseur » (module Brasseurs d'air) — partiellement réutilisable

Le module Brasseurs d'air (négoce + pose), **entièrement codé et testé** (voir §1.5),
a déjà un cycle de vie commande complet dans `worker.js:3730-3871` :

- **`creer_commande_brasseur`** (`:3730-3770`, `requireGarant`) : valide chaque ligne
  contre le catalogue (référence connue, quantité > 0), génère un `Title` (numéro PI ou
  numérotation auto via `nextBrasseurDocument`), écrit l'en-tête `Brasseurs_Commandes`
  puis les lignes `Brasseurs_Lignes_Commande` en `$batch`, `Statut` initial `'En attente'`.
- **`editer_commande_brasseur`** (`:3774-3807`, `requireGarant`) : PATCH partiel —
  pattern `if (body.x !== undefined) fields.X = ...` par champ, **jamais `''` sur une
  colonne Date** (Graph refuse, toujours `null`), `Statut` contraint à une liste fermée
  (`STATUTS_COMMANDE`, dont `'Annulee'` — **exactement le mécanisme demandé en D9**, déjà
  en production, pas à réinventer).
- **`reception_commande_brasseur`** (`:3815-3871`, `requireGarant`) : écrit un mouvement
  de stock par ligne reçue + incrémente `Quantite_Recue` en `$batch`, puis **recalcule le
  statut de la commande depuis TOUTES ses lignes** (pas seulement celles reçues dans cet
  appel) — `Recue` / `Recue_Partielle` / inchangé.

**Réutilisable pour le module besoin** : la mécanique en-tête/lignes sans colonne Lookup
(`Title` = id parent en texte), l'écriture `$batch`, le PATCH partiel avec
`undefined`-check, la convention `null` (jamais `''`) sur les colonnes Date, le statut en
liste fermée avec `'Annulee'` comme état terminal plutôt qu'une suppression.

**Non réutilisable tel quel** : `Brasseurs_Commandes` est un modèle **un seul fournisseur
par commande** (achat déjà décidé). Le module besoin a besoin de **plusieurs offres
concurrentes par ligne, comparées puis arbitrées** (D7) — une dimension que le modèle
Brasseurs n'a pas du tout. C'est un nouveau modèle de données à construire (§4), le cycle
de vie "commande confirmée" du pattern Brasseurs n'intervenant qu'*après* l'arbitrage
(report au catalogue, §2 étape D / §5).

### 1.5 Écarts documentation/code constatés — signalés, non corrigés dans cette session

*(Conformément à la consigne : ces écarts ne sont pas corrigés ici, seulement signalés,
sur le modèle de l'aparté §1.2 de `CADRAGE_MODULE_BRASSEURS.md`.)*

- **Module « Brasseurs d'air » entièrement construit et testé, absent de `00_*`-`05_*`
  et `CLAUDE.md`.** Onglet dashboard complet (`dashboard.html:440,723,8024-8298`, sous-vues
  Stock/Mouvements/Commandes), 9 actions Worker gated (`creer_mouvement_brasseur`,
  `transfert_brasseur`, `creer_commande_brasseur`, `editer_commande_brasseur`,
  `reception_commande_brasseur`, `annuler_mouvement_brasseur`, `ajouter_depot_brasseur`,
  `ajouter_reference_brasseur`, `migrer_mouvement_brasseur`), 3 actions PWA partagées
  (`sortie_stock_brasseur_pwa`, `transfert_stock_brasseur_pwa`, `upload_fiche_brasseur`),
  **82 tests dédiés** (`tests/worker.brasseurs.test.js`). `CADRAGE_MODULE_BRASSEURS.md`
  lui-même est daté (son §5 affirme encore "pas de code, pas d'action Worker écrite, pas
  d'écran PWA" — obsolète, le module a été implémenté depuis).
- **Environnement de recette (staging) déjà en place**, contredisant
  `04_HISTORIQUE_DECISIONS.md` ("Pas de site de préprod avec vraies données pour l'instant
  ... resterait à faire si besoin"). `PROCEDURE_RECETTE.md` (racine du dépôt) documente un
  second Worker (`immo-proxy-staging`), un second site SharePoint, un sous-dossier
  `/staging/` des Pages, détection par chemin d'URL (`dashboard.html:805`), et un script
  `scripts/sync-staging.js` — confirmé par un test dédié (`tests/worker.staging-env.test.js`,
  vérifie que le Worker interroge bien le site de recette quand `SITE_ID_ENV`/`ENV_NAME_ENV`
  sont définis). **C'est ce qui justifie la double section "PRODUCTION ET RECETTE" en §4
  ci-dessous** — la demande initiale du prompt de cadrage était donc parfaitement fondée.
- **Journal d'audit (`Journal_Audit`, `GATED_ACTIONS_AUDIT` dans `worker.js:495`)**,
  absent de `02_MODELE_DONNEES.md`/`03_REGLES_METIER_ET_ROLES.md` : journalise
  automatiquement les 71 actions gated + les échecs de connexion. **Conséquence directe
  pour ce cadrage** : toute nouvelle action gated doit être ajoutée à **trois** listes
  synchronisées (pas deux) — voir §5.
- **Suite de tests bien plus large que la dernière trace documentée** : 253 tests passent
  actuellement (`npm test`, vérifié en session — 0 échec), répartis sur 21 fichiers, contre
  "62" comme dernier chiffre documenté dans `04_HISTORIQUE_DECISIONS.md`. Nouveaux fichiers
  non mentionnés : `worker.brasseurs.test.js`, `worker.digest.test.js`,
  `worker.rate-limit.test.js`, `worker.security-headers.test.js`,
  `worker.password-policy.test.js`, `worker.photos.test.js`,
  `worker.noms-employes-endpoint.test.js`, `security.materiel-it-gets.test.js`,
  `security.export-liste.test.js`, `security.digest-endpoint.test.js`,
  `security.employes-sans-nom.test.js`, `security.journal-audit-endpoint.test.js`,
  `security.debug-employes-redaction.test.js`, `worker.audit-log.test.js`,
  `worker.audit-helpers.test.js`, `backup.export-structure.test.js`,
  `dashboard.global-search.test.js`. **Ces modules (digest, rate-limit, password policy,
  export de sauvegarde...) ne sont pas davantage documentés dans `00_*`-`05_*`.**
- **`npm run verify` échoue actuellement en local** (constaté en session, pas causé par
  cette session) : `scripts/check-staging-sync.js` signale que `staging/dashboard.html` et
  `staging/design-system.css` divergent de la racine. Cohérent avec le `git status`
  affiché en tête de session (`M dashboard.html`, `M design-system.css`, non commités) —
  probablement une session précédente ("Synthèse direction") pas encore synchronisée vers
  `staging/` ni commitée. **Non touché ici** (hors périmètre, fichiers de code). `npm test`
  seul (sans le check de syntaxe/sync) passe intégralement (253/253).
- **Incohérence interne mineure repérée dans le code lui-même** (pas doc vs code, code vs
  son propre commentaire) : `worker.js:1523`, le commentaire dit *"Site de rattachement
  (Reunion/Mayotte). Défaut Reunion si vide."* mais le ternaire renvoie en réalité `''`
  (chaîne vide) quand `Site` est vide, pas `'Reunion'`. Sans conséquence aujourd'hui (voir
  §1.6 — 0 employé actif concerné), mais pertinent pour l'anomalie "employé sans Site
  exploitable" traitée en §3.

### 1.6 Fiabilité du champ `Employes.Site` — vérifiée en direct sur la production

- Nom interne confirmé **`Site`** (`?debug_columns=Employes`, correspond au nom déjà
  documenté dans `02_MODELE_DONNEES.md` — pas d'écart ici).
- Données réelles (`?employes=1`, 9 sept. 2026, 102 employés) : **99 actifs / 3 inactifs**.
  Répartition `Site` sur les actifs : **75 Réunion / 24 Mayotte, 0 vide**. Le seul employé
  à `Site` vide sur l'ensemble des 102 est inactif (sans conséquence).
- Actifs avec `Affectation_EPI` renseignée (population éligible au module besoin) :
  **63**, répartition par (affectation × site) :

  | Affectation | Réunion | Mayotte |
  |---|---:|---:|
  | C (Chantier/Travaux Neufs) | 19 | 17 |
  | M (Maintenance) | 18 | 0 |
  | Z (Conducteur de Travaux) | 6 | 2 |
  | A (Atelier) | 0 | 1 |

  Aucune anomalie de tailles constatée sur ces 63 : **les 5 champs de taille sont
  renseignés à 100%** aujourd'hui (aucun manquant, aucun partiel) — le traitement de
  l'anomalie "taille manquante" (§3) doit néanmoins être codé, ce cas se présentera
  nécessairement à la prochaine embauche.
- **Conclusion : la donnée `Site` est fiable pour porter le découpage territorial D1** —
  aucune donnée corrective à prévoir avant de bâtir dessus.

---

## 2. Formule de calcul du besoin

*Ordre des opérations, tel que demandé : dotation de base → renouvellement → effectif
prévisionnel → marge → arrondi. Deux points d'arrondi existent dans le détail (D2 et D5
en imposent chacun un, explicitement) — le second (marge) est l'arrondi final de la
chaîne, ce qui correspond à "→ arrondi" en dernière position.*

Le calcul se fait **par territoire** (Réunion / Mayotte), en deux composantes qui
s'additionnent avant la marge : l'effectif **réel actuel** (tailles connues, individuelles)
et l'effectif **prévisionnel** (têtes sans identité, D3).

### Étape A — Besoin lié à l'effectif réel actuel

Réutilise `epiCalculerBesoinStock()` telle quelle (§1.1), appelée pour **tout employé actif
avec `Affectation_EPI` renseignée** — pas `epiEmployesSansFiche` (mauvais périmètre, voir
§1.1). Pour chaque employé *e* et chaque ligne de `Grille_Dotation_EPI` où
`Title = e.Affectation_EPI` et `Quantite > 0` :

1. **Dotation de base** = `Grille_Dotation_EPI.Quantite` (quantité standard du profil).
2. **Renouvellement** (D2) : `Renouvellement_Mois` = valeur de la grille pour cette ligne
   si renseignée et `> 0`, **sinon 12** (colonne absente ou vide ⇒ 12 ⇒ aucune régression,
   comportement identique à aujourd'hui pour toute ligne non révisée par William).
   `Quantite_Annuelle_Ligne = CEIL(Dotation_base × 12 / Renouvellement_Mois)`.
3. Taille recherchée = champ de taille de *e* correspondant au type d'article
   (`TAILLE_FIELD_PAR_TYPE`), vide pour un article à taille unique.
4. Résolution catalogue (`trouverArticleCatalogue`) → anomalies possibles, voir §3.
5. Ajouter `Quantite_Annuelle_Ligne` à l'accumulateur `(Type_Article, Taille, Site(e))`.

### Étape B — Besoin lié à l'effectif prévisionnel (D3)

Pour chaque ligne saisie dans `Effectif_Previsionnel_EPI` (Affectation *aff*, Site *T*,
`Entrees_Prevues`, `Sorties_Prevues`) :

1. `Delta = Entrees_Prevues − Sorties_Prevues`, **plafonné à 0** si négatif — **tranché
   (§8.2)** : un solde net de départs ne retire jamais de besoin déjà couvert par des
   employés réellement en poste aujourd'hui.
2. Si `Delta > 0` : pour chaque ligne de grille de ce profil, même calcul de
   `Quantite_Annuelle_Ligne` qu'à l'étape A.
3. **Taille provisionnée** : les futures recrues n'ont pas de taille connue. **Tranché
   (§8.1)** : la taille **la plus fréquente** observée à l'étape A pour ce
   `(aff, Type_Article, T)` parmi les employés réels actuels de ce profil sur ce
   territoire. Si aucun employé réel actuel de ce profil sur ce territoire n'existe (pas
   de référence de taille disponible) → anomalie "taille à préciser" (§3), ligne comptée
   mais signalée plutôt que devinée au hasard.
4. Ajouter `Quantite_Annuelle_Ligne × Delta` à l'accumulateur `(Type_Article, Taille, T)`.

### Étape C — Territoire et marge de sécurité (D1 + D5)

Les accumulateurs des étapes A et B sont déjà tenus séparément par territoire (jamais
fusionnés avant ce stade). Pour chaque ligne `(Type_Article, Taille)` :

1. `Total_Reunion` = somme des quantités accumulées avec `Site = Reunion`.
2. `Total_Mayotte` = somme des quantités accumulées avec `Site = Mayotte`.
3. **Marge appliquée ligne à ligne, par territoire, jamais sur un total global** (D5) :
   `Quantite_Reunion = CEIL(Total_Reunion × (1 + Marge% / 100))`
   `Quantite_Mayotte = CEIL(Total_Mayotte × (1 + Marge% / 100))`
4. `Quantite_Totale = Quantite_Reunion + Quantite_Mayotte` (somme des deux quantités déjà
   arrondies — jamais l'inverse : jamais calculer un total non territorialisé puis lui
   appliquer la marge, conformément à D5).

Le résultat de cette étape est ce qui est **figé** dans `Lignes_Consultation_EPI` au
moment de la validation du besoin (action `valider_besoin_consultation_epi`, §5) — un
changement ultérieur de la grille, du catalogue ou des effectifs ne doit **jamais**
modifier silencieusement une consultation déjà lancée.

### Étape D — Après arbitrage (hors formule de besoin, pour mémoire)

Le prix n'entre à aucun moment dans le calcul du besoin (D6 : le prix vient des offres,
après coup). Voir §5 pour le cycle de vie offres → arbitrage → report catalogue.

---

## 3. Traitement des anomalies — aucune silencieuse

| # | Anomalie | Déclenchement | Traitement |
|---|---|---|---|
| 1 | **Taille manquante** | Employé actif+éligible, type d'article à taille (non "taille unique"), champ de taille correspondant vide | Ligne exclue du calcul pour cet employé+type ; employé+type listés dans un tableau "Tailles manquantes" dédié de l'écran Besoin (§6) — les *autres* lignes de cet employé (tailles renseignées) restent comptées normalement |
| 2 | **Taille sans référence au catalogue** | `trouverArticleCatalogue` renvoie `null` bien que la taille soit renseignée (aucune ligne `Catalogue_Articles_EPI` ne correspond à ce type+cette taille) | Même traitement que #1, tableau "Article introuvable pour cette taille" — réutilise exactement la sémantique déjà en place (`non_trouves` de `generer_dotation_epi`, `article_trouve:false` de `epiCalculerBesoinStock`) |
| 3 | **Type d'article de la grille absent du catalogue** | Un `Type_Article` de `Grille_Dotation_EPI` n'a **aucune** ligne dans `Catalogue_Articles_EPI`, pour aucune taille | Anomalie de configuration (pas par employé) : affichée une seule fois par type, en tête de l'écran Besoin, avec un avertissement explicite — ce cas correspond exactement à la classe de bug historique "Gants a picot" vs "Gants à picot" (grille et catalogue désynchronisés par une graphie différente) ; zéro besoin calculé pour ce type tant que ce n'est pas corrigé |
| 4 | **Affectation hors C/M/Z/A** | `Employes.Affectation_EPI` renseigné mais différent de `C`/`M`/`Z`/`A` (typo, ancienne valeur) | Employé exclu entièrement du calcul (aucune ligne de grille ne peut lui être rattachée) ; listé dans un tableau "Affectation EPI non reconnue", sans bloquer le calcul pour les autres employés |
| 5 | **Employé sans Site exploitable** | `Employes.Site` vide ou valeur non reconnue (ni `Reunion` ni variante de `Mayotte`) | Employé exclu du découpage territorial (ne peut être compté ni côté Réunion ni côté Mayotte) ; listé dans un tableau "Site non exploitable" — cas rarissime aujourd'hui (0 actif concerné, §1.6) mais géré défensivement |

Chaque tableau d'anomalie est affiché même vide (état "Aucune anomalie détectée"), pour
qu'un William pressé sache que le contrôle a bien tourné, pas seulement qu'il n'y a rien
à afficher.

---

## 4. Listes SharePoint à créer — prêtes à copier (PRODUCTION **et** RECETTE)

*Une session de recette existe déjà (§1.5) — toute liste créée doit l'être sur les
**deux** sites, idéalement via **"+ Nouveau → Liste → À partir d'une liste existante"**
en dupliquant depuis la production (méthode déjà documentée et pratiquée,
`PROCEDURE_RECETTE.md` §2). Vérification après création : `?debug_columns=<Liste>` sur
les deux Workers (`immo-proxy` et `immo-proxy-staging`) avant d'écrire le code — c'est
exactement ainsi qu'a été repéré `BRASSEUR_QTE_FIELD` (`worker.js:478-485` : `Quantité`
tapé avec l'accent a été encodé en interne `Quantit_x00e9_` par SharePoint, sur les
**deux** sites). **Pour cette raison, aucune colonne ci-dessous n'utilise de caractère
accentué dans son nom** — choix délibéré pour ne pas reproduire l'incident.*

**Pièges à ne pas reproduire (vécus sur ce projet, rappelés explicitement colonne par
colonne ci-dessous) :**
- Un champ **Notes/Commentaire/Motif** créé en texte **"Une seule ligne"** tronque
  silencieusement au-delà de 255 caractères (`Brasseurs_Commandes.Notes`) → toujours
  créer ces colonnes en **"Plusieurs lignes de texte"**.
- Une colonne **Date et heure** oubliée à la création (`Dotations_EPI.Genere_Le`/
  `Emarge_Le`, découvert après coup) → chaque colonne "Date/heure" ci-dessous est
  marquée explicitement, à ne pas rater.
- Un nom de colonne **réservé par SharePoint** (`Type` sur `Brasseurs_Mouvements`,
  devenu `Type_Mouvement`) → aucune colonne ci-dessous ne s'appelle `Type` seul.

### `Consultations_EPI` (nouvelle liste)

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Nom de la consultation, ex. `Consultation EPI 2027` |
| `Annee_Cible` | Nombre | Année de dotation visée par cette consultation |
| `Marge_Securite_Pourcentage` | Nombre | % de marge appliqué ligne à ligne (D5), ex. `10` |
| `Statut` | Texte | `Brouillon` / `Besoin_Valide` / `En_Consultation` / `Offres_Recues` / `Arbitree` / `Cloturee` / `Annulee` |
| `Cree_Par` | Texte | Code employé résolu du jeton de session (jamais du corps de la requête) |
| `Date_Creation` | **Date et heure** ⚠️ | ISO |
| `Cloture_Par` | Texte | Vide tant qu'en cours |
| `Date_Cloture` | **Date et heure** ⚠️ | ISO, vide tant qu'en cours |

### `Effectif_Previsionnel_EPI` (nouvelle liste)

*Une ligne = un couple (Affectation, Site) pour une consultation donnée (D3).*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | ID SharePoint de la consultation parente (texte, pas de Lookup — cohérent avec `Lignes_Inventaire`/`Lignes_Dotation_EPI`) |
| `Affectation` | Texte | `C` / `M` / `Z` / `A` |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Effectif_Actuel` | Nombre | Photo de l'effectif réel au moment de la saisie (figée, pour que la consultation reste cohérente si l'effectif réel change ensuite) |
| `Entrees_Prevues` | Nombre | Saisie manuelle (D3) |
| `Sorties_Prevues` | Nombre | Saisie manuelle (D3) |

### `Lignes_Consultation_EPI` (nouvelle liste)

*Le besoin calculé et figé (résultat de l'étape C, §2), puis l'arbitrage final (D8) sur
les mêmes lignes — évite une liste séparée redondante pour l'arbitrage.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | ID SharePoint de la consultation parente |
| `Type_Article` | Texte | |
| `Taille` | Texte | Vide pour un article à taille unique |
| `Quantite_Reunion` | Nombre | Figée au moment de la validation du besoin (§2 étape C) |
| `Quantite_Mayotte` | Nombre | idem |
| `Quantite_Totale` | Nombre | idem (somme des deux, jamais recalculée séparément) |
| `Stock_Actuel_Info` | Nombre | Photo du stock au moment du calcul — **information seule, n'entre jamais dans le calcul (D4)** |
| `Statut_Ligne` | Texte | `A_Arbitrer` / `Arbitree` / `Reportee_Catalogue` |
| `Fournisseur_Retenu` | Texte | Vide tant que non arbitrée |
| `Prix_Retenu_HT` | Nombre | Copie figée du prix retenu (indépendante d'un futur changement de prix catalogue), EUR (D6) |

### `Fournisseurs_EPI` (nouvelle liste)

*Répertoire des fournisseurs, indépendant des consultations — un fournisseur peut être
invité à plusieurs consultations successives.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Nom du fournisseur |
| `Contact` | Texte | Nom du contact |
| `Email` | Texte | |
| `Telephone` | Texte | |
| `Actif` | Texte | `Oui` / `Non` |
| `Notes` | **Plusieurs lignes de texte** ⚠️ | Libre |

### `Fournisseurs_Consultation_EPI` (nouvelle liste)

*Quels fournisseurs sont invités à quelle consultation, et où ils en sont.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | ID SharePoint de la consultation parente |
| `Fournisseur` | Texte | Correspond à `Fournisseurs_EPI.Title` |
| `Statut` | Texte | `Invite` / `Offre_Recue` / `Ecarte` |
| `Date_Invitation` | **Date et heure** ⚠️ | |
| `Date_Reception_Offre` | **Date et heure** ⚠️ | Vide tant que non reçue |
| `Notes` | **Plusieurs lignes de texte** ⚠️ | Libre |

### `Lignes_Offres_EPI` (nouvelle liste)

*Une ligne = un prix proposé par un fournisseur pour une ligne de besoin (D6, D7).*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | ID SharePoint de la consultation parente |
| `Fournisseur` | Texte | |
| `Type_Article` | Texte | Correspond à `Lignes_Consultation_EPI.Type_Article` |
| `Taille` | Texte | Correspond à `Lignes_Consultation_EPI.Taille` |
| `Prix_Unitaire_HT` | Nombre | EUR (D6) |
| `Devise` | Texte | Figée `EUR` (D6 — pas de conversion) |
| `Reference_Fournisseur` | Texte | Référence/SKU du fournisseur, optionnelle |
| `Delai_Estime_Jours` | Nombre | Optionnel, non critique (même statut que côté Brasseurs) |

### Modification d'une liste existante : `Grille_Dotation_EPI`

| Colonne à ajouter (nom interne) | Type | Contenu |
|---|---|---|
| `Renouvellement_Mois` | Nombre | Fréquence de renouvellement en mois (D2). **Absente ou vide ⇒ 12 par défaut, appliqué automatiquement par le code — aucune régression sur les lignes non révisées.** À ajouter sur la liste **existante**, donc sur les **deux** exemplaires (production ET recette) séparément — la méthode "dupliquer depuis une liste existante" (§4 intro) ne s'applique qu'à la création d'une liste neuve, pas à l'ajout d'une colonne sur une liste déjà dupliquée. |

---

## 5. Endpoints GET et actions Worker à créer

**Rappel du mécanisme réel (pas seulement `GATED_ACTIONS`, voir §1.5)** : toute action
POST protégée doit être ajoutée à **trois** endroits synchronisés, vérifiés par
`tests/security.gated-actions.test.js` (4 tests) : le bloc `if (action==='...')` dans
`worker.js` (avec `requireAdmin(body)`/`requireGarant(body)` en première ligne), le
tableau `GATED_ACTIONS` (`dashboard.html:825`, injection automatique du jeton), et le
`Set` `GATED_ACTIONS_AUDIT` (`worker.js:495`, journalisation automatique). Une lecture GET
sensible (prix) suit un mécanisme **différent** (jeton en paramètre `&token=`, comme
`?materiel_it=1`/`?export_liste=`/`?lignes_telephoniques=1`) — `GATED_ACTIONS` ne
concerne que les POST, ne protège jamais un GET.

### Actions POST (à ajouter à `GATED_ACTIONS` + bloc protégé + `GATED_ACTIONS_AUDIT`)

| Action | Niveau | Rôle |
|---|---|---|
| `creer_consultation_epi` | `requireAdmin` | Lance une nouvelle consultation (`Cree_Par` résolu du jeton, jamais du corps) |
| `maj_effectif_previsionnel_epi` | `requireGarant` | Upsert d'une ligne `Effectif_Previsionnel_EPI` (affectation × site) |
| `valider_besoin_consultation_epi` | `requireAdmin` | Calcule et **fige** les lignes `Lignes_Consultation_EPI` (§2 étape C), transition `Brouillon`→`Besoin_Valide` |
| `ajouter_fournisseur_epi` | `requireGarant` | Crée une ligne `Fournisseurs_EPI` |
| `maj_fournisseur_epi` | `requireGarant` | Édite une ligne `Fournisseurs_EPI` |
| `inviter_fournisseur_consultation_epi` | `requireGarant` | Crée une ligne `Fournisseurs_Consultation_EPI` (`Statut='Invite'`) |
| `saisir_offre_epi` | `requireGarant` | Écrit/actualise les lignes `Lignes_Offres_EPI` d'un fournisseur pour une consultation (`$batch`, sur le modèle de `reception_commande_brasseur`) |
| `arbitrer_ligne_consultation_epi` | `requireAdmin` | Fixe `Fournisseur_Retenu`/`Prix_Retenu_HT`/`Statut_Ligne='Arbitree'` sur une ligne — réversible tant que non reportée |
| `reporter_arbitrage_catalogue_epi` | `requireAdmin` | Étape finale D8 : écrit `Reference`/`Fournisseur` sur `Catalogue_Articles_EPI` pour toutes les lignes `Arbitree` d'une consultation, en une fois, après validation explicite du tableau de contrôle ; passe `Statut_Ligne='Reportee_Catalogue'` |
| `cloturer_consultation_epi` | `requireAdmin` | `Statut='Cloturee'` (terminal) |
| `annuler_consultation_epi` | `requireAdmin` | `Statut='Annulee'` — jamais de suppression (D9) |

### Lectures GET

| Endpoint | Protection | Contenu |
|---|---|---|
| `?consultations_epi=1` | `requireGarant` (jeton `&token=`) — tranché (§8.6), cohérence avec le reste du module | En-têtes des consultations |
| `?consultation_epi_detail=1&id=...` | `requireGarant` (jeton `&token=`) | Lignes de besoin + effectif prévisionnel + fournisseurs invités + offres d'**une** consultation (contient les prix) |
| `?fournisseurs_epi=1` | Public, comme `?catalogue_epi=1` | Répertoire fournisseurs (aucune donnée sensible) |

---

## 6. Écrans

Nouveaux sous-onglets dans l'onglet **EPI** existant, **placés après "🛒 Suggestion de
commande"** (ne modifie ni ne réordonne les sous-onglets actuels) :

1. **"🗒️ Consultations"** — liste des consultations (statut, année cible), création.
2. **"📋 Besoin"** — effectif prévisionnel par affectation×site, tableau du besoin calculé
   (§2), les 5 tableaux d'anomalies (§3, toujours visibles), bouton "Valider le besoin"
   (fige les lignes).
3. **"🏭 Fournisseurs & Offres"** — répertoire, invitation, saisie des offres, **tableau
   comparatif des deux scénarios** (D7) : *fournisseur unique* (moins-disant sur le
   montant total de la consultation) vs *ligne à ligne* (meilleur prix par ligne, panaché
   entre fournisseurs) — calculés à la volée depuis `Lignes_Offres_EPI`, jamais stockés.
4. **"✅ Arbitrage"** — tableau de contrôle ligne à ligne (pré-rempli depuis l'un des deux
   scénarios, éditable/panachable manuellement), validation explicite, bouton "Reporter au
   catalogue" (D8, action finale, distincte de l'arbitrage ligne à ligne pour rester
   réversible jusqu'au dernier moment).

**Droits — tranché (§8.3, §8.4)** : `peutGererEPI`/`peutVoirEPI` existent déjà mais n'ont
jamais porté de données tarifaires — nouvelle capacité dédiée `peutGererBesoinEPI` (même
population : Admin, Logistique, Logistique_Mayotte), distincte de `peutGererEPI`.
**Encadrement (`peutVoirBesoinEPI`, view-only)** garde un accès lecture seule sur
"Consultations" et "Besoin" (quantités uniquement) ; **"Fournisseurs & Offres" et
"Arbitrage" (prix) restent masqués même en lecture seule** pour Encadrement — seule
nuance par rapport à `peutGererBrasseurs` (`dashboard.html:1207-1217`, qui n'a
**aucune** variante "voir" du tout), justifiée ici par le fait que le besoin en
quantités seul (sans prix) reste une information utile à la RH/aux services support,
alors que Brasseurs n'a pas cette distinction quantité/prix dans son périmètre.

---

## 7. Découpage en sessions

Chaque session se termine par `npm run verify` vert (baseline actuelle : **253 tests, 0
échec** — voir §1.5 sur l'échec actuel du check de syntaxe, sans lien avec ce module et à
ne pas confondre avec les tests eux-mêmes) et un livrable vérifiable concret.

| Session | Contenu | Livrable vérifiable |
|---|---|---|
| **1** | William crée les 6 listes + la colonne `Renouvellement_Mois` (§4), PROD et RECETTE | `?debug_columns=<Liste>` confirmé sur les 8 combinaisons (6 listes + 1 liste modifiée × 2 sites) avant tout code |
| **2** | `Effectif_Previsionnel_EPI` (saisie), calcul du besoin côté client (§2, réutilise `epiCalculerBesoinStock`), les 5 tableaux d'anomalies (§3), action `valider_besoin_consultation_epi` | Une consultation de test avec un jeu de données réel (63 employés actuels) produit un tableau de besoin vérifié à la main sur 2-3 lignes, anomalies affichées correctement (y compris "aucune anomalie" quand c'est le cas) |
| **3** | `Fournisseurs_EPI`, invitation, `Lignes_Offres_EPI`, tableau comparatif 2 scénarios | 2 fournisseurs fictifs, offres saisies, les deux scénarios (fournisseur unique / ligne à ligne) calculés correctement sur un cas où ils divergent |
| **4** | Arbitrage ligne à ligne, `reporter_arbitrage_catalogue_epi` | Un cas de test arbitré puis reporté : `Catalogue_Articles_EPI.Reference`/`Fournisseur` mis à jour uniquement après validation explicite, jamais avant |
| **5** | Clôture/Annulation, export Excel (réutilise `exporterExcel`/`ligneFiltresActifs`), garde-fous (`GATED_ACTIONS`/`GATED_ACTIONS_AUDIT` synchronisés — le test existant `security.gated-actions.test.js` doit passer sans modification propre) | `npm run verify` vert, export Excel d'une consultation clôturée conforme au contrat d'export existant |

---

## 8. Décisions prises en session (état après réponses de William)

*Les 6 questions posées ont toutes été tranchées en faveur de l'option recommandée.*

1. **Taille des entrées prévisionnelles → tranché : la plus fréquente.** Le besoin des
   entrées prévues (D3, sans identité donc sans taille connue) est provisionné sur la
   taille **la plus fréquente** actuellement observée pour ce profil/territoire (§2 étape
   B.3), plutôt qu'une distribution proportionnelle (plus fidèle mais plus complexe) ou
   qu'un renvoi systématique en anomalie "à préciser" (ce dernier cas reste le
   comportement de repli quand aucun employé réel de ce profil/territoire n'existe pour
   servir de référence).
2. **Sorties prévisionnelles nettes → tranché : plafonné à 0.** Un solde net de départs
   sur une ligne d'effectif prévisionnel ne retire **jamais** de besoin déjà couvert par
   les employés réellement en poste aujourd'hui (§2 étape B.1) — seul un solde net positif
   (plus d'entrées que de sorties) ajoute du volume.
3. **Droits → tranché : nouvelle capacité `peutGererBesoinEPI`** (même population
   qu'aujourd'hui : Admin, Logistique, Logistique_Mayotte), distincte de `peutGererEPI`,
   pour garder ce module tarifaire séparé de la gestion EPI courante (qui ne porte
   aujourd'hui aucun prix) — voir §6.
4. **Encadrement → tranché : accès lecture seule maintenu**, sur les onglets
   Consultations/Besoin uniquement (quantités, jamais les prix) — nouvelle fonction
   `peutVoirBesoinEPI`, voir §6.
5. **Report au catalogue (D8) → tranché : aucun prix stocké sur le catalogue.**
   `reporter_arbitrage_catalogue_epi` écrit uniquement `Reference` et `Fournisseur` sur
   `Catalogue_Articles_EPI` (§5) — le prix retenu reste seulement dans la consultation
   (`Lignes_Consultation_EPI.Prix_Retenu_HT`). `Catalogue_Articles_EPI` ne gagne donc
   **aucune** nouvelle colonne dans ce cadrage.
6. **Lectures GET du besoin → tranché : protégées `requireGarant`.** Cohérence retenue :
   tout le module reste derrière le même niveau de protection que les offres/prix, y
   compris les lignes de besoin seules (elles révèlent des effectifs prévisionnels par
   affectation/site, une donnée RH-adjacente) — contrairement à `?catalogue_epi=1`/
   `?grille_dotation_epi=1`, qui restent publics et non concernés par ce cadrage (§5).

---

## 9. Ce qui n'est PAS dans ce cadrage (volontairement)

- Pas de code, pas d'action Worker écrite, pas de liste SharePoint créée — sera fait après
  validation des réponses (§8) et création des listes (§7, session 1).
- Pas d'écran PWA — module 100% dashboard, comme EPI/Outillage/Brasseurs (aucune décision
  D1-D9 ne le demande).
- Pas de correction des écarts documentation/code relevés en §1.5 (Brasseurs d'air non
  documenté, environnement de recette non documenté, tests non recensés, incohérence
  commentaire/code sur `Site`) — signalés pour mémoire, à traiter dans une session dédiée
  si William le souhaite.
- Pas de valorisation monétaire permanente du catalogue EPI (tranché §8.5) — cohérent
  avec l'absence de prix dans `Catalogue_Articles_EPI` aujourd'hui.

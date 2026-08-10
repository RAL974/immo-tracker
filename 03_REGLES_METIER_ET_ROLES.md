# Immo Tracker — Règles métier et modèle de rôles

## Le modèle de droits centralisé (`ROLE_CAPS`)

Les droits sont définis dans **une seule table** (`ROLE_CAPS`, dans `app.js`), reprise avec la même logique côté `dashboard.html`. Chaque rôle déclare ses capacités — pour changer un droit, une seule ligne à modifier.

Cinq capacités possibles :
- **`reserver`** : peut réserver / recevoir du matériel
- **`bisite`** : voit et agit sur les deux îles (sinon limité à son site)
- **`garant`** : peut valider un retour dépôt (atteste de l'état du matériel)
- **`voitTout`** : voit toutes les catégories, y compris les comptes administratifs
- **`admin`** : gère la solution (rôles, ajouts, mots de passe, migration…)
- **`comptesExtra`** : liste de comptes normalement masqués mais visibles en exception pour ce rôle

## Matrice des 9 rôles

| Rôle | reserver | bisite | garant | voitTout | admin | Particularité |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | Tous droits |
| **Logistique** (Gestionnaire Dépôt RUN) | ✅ | ✅ | ✅ | ✅ | — | — |
| **Logistique_Mayotte** | ✅ | ❌ (Mayotte only) | ✅ | ❌ | — | `comptesExtra: ['2182']` — voit aussi les véhicules pour l'entretien sur place |
| **RA** (Responsable d'affaires) | ✅ | ✅ | — | — | — | — |
| **CT_Specialise** | ✅ | ✅ | — | — | — | — |
| **CT** (Conducteur de travaux) | ✅ | ❌ (son site) | — | — | — | — |
| **Ouvrier_Specialise** | ✅ | ✅ | — | — | — | — |
| **Ouvrier** | — | — | — | — | — | Aucun droit particulier |
| **Encadrement** | — | ✅ | — | ✅ | — | View-only : voit tout (2 îles, toutes catégories) pour export/consultation, mais ne réserve pas, n'est pas garant. Destiné à la RH et services support. |

## Super-administrateur permanent

Le code **`AIWI`** est super-admin permanent : conserve tous les droits **même si son rôle SharePoint est modifié**. Protection inscrite en dur dans le code (ne peut pas être retirée depuis l'interface), pour éviter qu'un administrateur soit évincé par erreur ou malveillance.

Codes admin historiques (dashboard, pouvoirs d'administration) : `CONI, AIWI, NAXA, BAKA` — **ET** toute personne dont le rôle SharePoint est `Admin` (unification faite en juillet 2026 : avant cette date, attribuer le rôle "Admin" via le menu ne donnait pas les pouvoirs admin du dashboard si le code n'était pas dans cette liste en dur).

## Qui voit les données comptables sur les fiches immo ?

Le bloc "🧾 Données comptables" (date de mise en service, comptes immobilisation/amortissement/dotation) et les montants (valeur d'achat, VNC) dans le module maintenance sont réservés à : **Admin, Gestionnaire Dépôt RUN (Logistique), Encadrement**. Fonction : `peutVoirCompta(code)`.

## Flux de validation d'un retour dépôt

Principe : un retour déclaré par un rôle **terrain** doit être validé par un **garant** avant d'être définitivement enregistré. Un retour déclaré par un **garant lui-même** est enregistré immédiatement (il atteste lui-même de l'état).

- **Retour par un rôle terrain** → crée un "transfert vers DEPOT" en **attente de validation**.
- **Validation par un garant** → le mouvement final enregistre :
  - `Code_Employe` = le **déclarant terrain** (celui qui a physiquement ramené le matériel)
  - `Code_Chantier` = `DEPOT|code_validateur|nom_validateur` (le garant)
  - Affichage dashboard : colonne "Employé" = déclarant, colonne "Donneur / Validé par" = ✅ validateur
- **Retour direct par un garant** → `Code_Chantier = 'DEPOT'` (sans suffixe), pas de séparation déclarant/validateur.

Seuls les garants voient le bouton de validation dans le dashboard (`estGarant()`).

## Photos de mouvement (ajouté août 2026, roadmap item B)

*Reprend l'item B de `05_ROADMAP_EVOLUTIONS_FUTURES.md` : joindre une preuve visuelle à un retour/transfert/panne, pour éviter les litiges "c'était déjà abîmé avant". Réutilise le proxy photos déjà existant depuis le socle applicatif (`Photos_Immos/{code_im}/` sur le drive, actions Worker `upload_photo`/`delete_photo`, jamais documenté jusqu'ici) — aucun nouveau stockage créé pour ce chantier.*

**Écrans concernés** (PWA terrain) : Retour, Transfert (donneur), Réception d'un transfert (receveur), Déclaration de panne, Résolution de panne/réparation. **Jusqu'à 3 photos par mouvement**, chacune ajoutée en un geste (bouton → appareil photo mobile via `capture="environment"` → vignette avec bouton de suppression).

**Toujours optionnelle, jamais bloquante** — y compris en mode dégradé/hors-ligne : l'upload d'une photo est une tâche de fond, jamais attendue avant l'enregistrement du mouvement lui-même (`preparerPhotosMouvement()` dans `app.js`). Si le réseau tombe pendant l'upload, le mouvement reste enregistré normalement ; seule la photo peut manquer. Seule exception à "toujours optionnelle" : un **message de confirmation non bloquant** (pas un blocage réel) s'affiche si l'état saisi à un Retour est Abîmé/Hors service sans aucune photo jointe — l'utilisateur peut toujours continuer sans photo.

**Compression côté client** : redimensionnement à 1200px max + paliers de qualité JPEG (0.75 → 0.6 → 0.5 → 0.4) jusqu'à passer sous 500 Ko, pour limiter le volume/temps d'upload en 4G chantier (`compressPhotoDataUrl()` dans `app.js`).

**Lien photo ↔ mouvement** : la colonne structurée `Mouvements.Photos` (voir `02_MODELE_DONNEES.md`) est la source de vérité — même principe déjà retenu pour `Cout_Reparation` (structuré plutôt qu'inféré). Deux mécanismes selon le type de mouvement :
- **Déclaration/résolution de panne** (`declarer_panne`/`resoudre_panne`) : les noms de fichiers sont transmis directement dans le corps de la requête qui crée le `Mouvement`, écrits dans `Photos` en une seule opération.
- **Retour/Transfert** (`transfert` → `valider`, en deux temps car un garant peut valider bien après la déclaration terrain) : le nom des photos prises au moment de la déclaration voyage via un marqueur transitoire dans `Transferts_En_Attente.Note` (`##PHOTOS:...##`), extrait et reporté vers `Mouvements.Photos` à la validation — combiné avec les photos prises par le validateur/receveur lui-même à ce moment-là. Le marqueur n'est jamais montré tel quel à l'utilisateur (retiré de tout affichage, y compris `?dashboard=1`).

**Affichage dashboard** : un badge "🖼️ N" apparaît sur la ligne d'un mouvement (onglets Historique et Transferts en attente) dès qu'il a des photos liées, ouvrant une galerie filtrée à ce mouvement précis (`ouvrirPhotosMouvementModal`) — à distinguer de la galerie complète par immo déjà existante (`ouvrirPhotosModal`, bouton "🖼️ Photos" sur la fiche immo/onglet Documents), qui montre toutes les photos de l'immo sans distinction de mouvement. Comme pour les FDS, jamais d'URL SharePoint directe exposée : toujours via le proxy `?photo=code/fichier`.

**Sécurité de `upload_photo`** : action volontairement **non protégée par jeton de session**, comme `reserver`/`transfert` (identité = badge scanné côté PWA terrain, sans mot de passe — voir § Autorisation côté serveur ci-dessus). Cette absence d'authentification est un choix de conception assumé depuis le socle applicatif, pas une faille propre aux photos ; en revanche, avant août 2026 cette action n'avait **aucun garde-fou serveur** (ni taille, ni type réel du fichier). Ajoutés à cette occasion : taille max stricte (1,5 Mo décodés, marge au-dessus de la cible de compression 500 Ko), vérification de la signature réelle des octets (JPEG, `FF D8 FF` — le `Content-Type` déclaré par le client n'est jamais fiable en soi), validation du nom de fichier. Pas de quota/rate-limit dédié construit (infra disproportionnée, risque résiduel équivalent aux autres actions déjà partagées avec la PWA) — voir `04_HISTORIQUE_DECISIONS.md` pour le raisonnement complet.

## Immos "d'activité" vs "administratives"

Distinction utilisée pour filtrer l'onglet "Au dépôt" et les statistiques d'Analyses (top mouvementées, pannes, taux d'utilisation par catégorie, coûts de réparation) : on exclut par défaut les immos dont le compte d'immobilisation est administratif (voir liste dans `02_MODELE_DONNEES.md`), sauf les étiqueteuses. Un bouton permet de révéler ponctuellement les immos administratives dans l'onglet dépôt.

Cette règle répond au besoin de William : les statistiques d'usage terrain ne doivent refléter que ce que voient réellement les conducteurs de travaux, pas le mobilier de bureau ou les véhicules de service.

## Règle des "immos dormantes" (module maintenance préventive)

Une immobilisation est candidate à cession ("dormante") si :
1. Elle est **au dépôt** depuis plus d'un seuil réglable (3 / 6 / 12 mois, défaut 6 mois), **ET**
2. Elle a **au moins un mouvement enregistré** dans son historique.

**Règle explicite de William : une immo qui n'a JAMAIS eu de mouvement (`since = null`, "Jamais sorti") n'est PAS comptée comme dormante** — l'absence de mouvement peut simplement signifier une immo jamais mise en service ou mal suivie historiquement, pas un signal d'inutilité à traiter en priorité.

## Amortissement linéaire et valeur nette comptable (VNC)

- **Mode** : linéaire uniquement (pas de dégressif).
- **Durée** : déduite **automatiquement et uniquement** du compte d'amortissement de l'immo (barème dans `02_MODELE_DONNEES.md`). Il n'existe plus de saisie manuelle de durée depuis juillet 2026 (fonctionnalité retirée à la demande de William, qui a fourni un barème comptable officiel).
- **Date de référence** : date de mise en service si renseignée, sinon date d'achat.
- **Calcul** : `annuité = valeur_achat / durée` ; `cumul = min(valeur_achat, annuité × années_écoulées)` ; `VNC = max(0, valeur_achat − cumul)`. La VNC ne descend jamais sous 0.
- **Non amortissable** : comptes 28718 et 28752 (cautions).

## Export comptable

Export CSV (18 colonnes) réservé aux admins, disponible depuis l'onglet Analyses. Compatible Excel français (BOM UTF-8, séparateur `;`, décimales à la virgule, dates JJ/MM/AAAA). Contient pour chaque immo : identité, comptes, dates, valeur d'achat, durée, annuité, amortissement cumulé, VNC, % amorti, état — plus une ligne de totaux. Sert de base au rapprochement avec la comptabilité EBP.

## Campagne d'inventaire de stock (articles/consommables — août 2026)

*À ne pas confondre avec l'inventaire des immobilisations (QR codes), un chantier séparé non encore validé par la direction.*

Deux nouvelles capacités `ROLE_CAPS` :
- **`gererInventaire`** : peut lancer/clôturer une campagne (Admin, Logistique, Logistique_Mayotte).
- **`compterInventaire`** : peut saisir des lignes de comptage (Admin, Logistique, Logistique_Mayotte, CT, CT_Specialise, RA, et le nouveau rôle `Compteur_Inventaire`).

**Nouveau rôle `Compteur_Inventaire`** : rôle allégé sans aucune autre capacité, destiné au personnel temporaire (intérim, accompagnants logistique/achats) lors d'une campagne. Ces comptes sont créés via le flux existant d'ajout d'employé, avant chaque campagne, puis peuvent rester inactifs entre deux campagnes.

**Cycle de vie d'une campagne** : `En cours` → `Clôturée` (action explicite, irréversible). Une ligne de comptage ne peut être modifiée/supprimée que par son auteur ou un admin, et uniquement tant que la campagne est `En cours` — vérifié côté Worker, pas seulement côté interface.

**État du stock, pas d'écart entre campagnes** (dashboard, onglet Inventaire stock) : chaque campagne affiche simplement l'état du stock compté à l'instant T, groupé par clé `(Zone, Site, Référence)` avec quantités sommées. **Aucune comparaison à la campagne précédente** : pour une entreprise du bâtiment, sans stock minimum fixe et avec des chantiers qui se terminent/changent de nature, il n'y a pas de continuité à mesurer d'une campagne à l'autre (règle explicite de William, cf. `04_HISTORIQUE_DECISIONS.md`). Aucune valorisation (prix/valeur) n'est calculée dans l'outil : la base de prix historique évolue trop vite pour être fiable — seules les quantités comptées sont produites, à valoriser ensuite en externe si besoin.

**Zone obligatoire, Chantier optionnel** : la zone dépôt (n° de rack, lettre d'étage) est le seul axe de comptage obligatoire et structurant — c'est elle qui sert de clé de regroupement dans l'état du stock. Le chantier n'est qu'une information complémentaire facultative (quand on sait à quel chantier un article est destiné), pas un second axe de comptage indépendant.

**Scan du code-barres fabricant** : la PWA réutilise le scanner déjà présent pour les immos (`Html5Qrcode`, détecte QR ET codes-barres EAN/UPC/Code128 sans configuration supplémentaire) pour lire le code-barres imprimé par le fabricant sur l'emballage (Legrand, Hager, Schneider Electric en priorité, puis Eurohm, SIB, BLM, Clareo, Courant...) : le code scanné remplit directement le champ Référence. Saisie manuelle toujours possible en repli (la boîte d'origine n'est pas toujours disponible sur le terrain).

Détail technique dans `02_MODELE_DONNEES.md` et l'historique dans `04_HISTORIQUE_DECISIONS.md`.

## Campagne d'inventaire physique des immobilisations par scan (roadmap item A1, ajouté août 2026)

*À ne pas confondre avec la campagne d'inventaire de stock ci-dessus (articles/consommables, sans code) : ici on recense les **immobilisations elles-mêmes**, une par une, par scan de leur QR code. Deux paires de listes SharePoint séparées (`Campagnes_Inventaire_Immos`/`Scans_Inventaire_Immos`), deux onglets distincts.*

**Lancement/clôture réservés au dashboard, requireAdmin** : contrairement à la campagne de stock (ouverte à plusieurs rôles terrain pour la saisie), le lancement (`creer_campagne_inventaire_immos`) et la clôture (`cloturer_campagne_inventaire_immos`) d'une campagne physique sont strictement Admin — cohérent avec le fait qu'une seule campagne à la fois doit être active et que sa clôture déclenche le calcul définitif du rapport d'écarts. `Cree_Par`/`Cloture_Par` sont toujours résolus depuis le jeton de session vérifié (`_auth.session.code`), jamais depuis le corps de la requête.

**Le scan lui-même reste une action PWA, profils admin uniquement, sans mot de passe** : `enregistrer_scan_inventaire_immo` suit le même modèle de confiance que `reserver`/`transfert`/`ajouter_ligne_inventaire` (badge scanné, pas de jeton de session possible côté terrain) — volontairement **non protégée** par le mécanisme `requireAdmin`/`requireGarant` (elle casserait pour tout le monde sinon, voir `security.gated-actions.test.js`). L'accès à l'écran de scan lui-même est filtré côté PWA aux seuls codes admin (`CONFIG.admins`), comme le reste de la "Section admin" déjà présente sur l'écran d'accueil terrain.

**Un scan n'est jamais un mouvement** : contrairement à toute autre action de l'app, scanner une immo pendant une campagne d'inventaire n'écrit **aucune** ligne dans `Mouvements` et ne change ni le détenteur courant ni la localisation affichée ailleurs dans l'app — c'est un simple relevé de présence physique ("vu, ici, par untel, à telle date"), isolé dans `Scans_Inventaire_Immos`. Ce choix protège la logique métier existante ("détenteur = dernier Mouvement", utilisée partout : circulation, dépôt, analyses, amortissement) de tout effet de bord.

**Scan en continu** : contrairement aux écrans de scan classiques (un scan → une action → retour à l'accueil), l'écran d'inventaire physique ré-arme la caméra automatiquement après chaque scan enregistré, pour enchaîner sur l'immo suivante sans repasser par un menu — geste terrain répétitif par nature (on scanne toutes les immos d'un dépôt ou d'un chantier à la suite).

**Rapport d'écarts, calculé à la clôture (ou à tout moment en cours de campagne)** : comparaison entre les scans enregistrés et la localisation théorique déjà connue (`immoMeta`, alimentée par `Immos.Site`/`Immos.Actif` — jamais par un nouveau champ). Deux catégories d'écart, construites uniquement à partir de données déjà fiables (pas de nouvelle source de vérité) :
- **Immo scannée mais sortie du parc** (`Immos.Actif = Non`, ex. hors service/perdue/volée) — anomalie potentielle : soit le statut est erroné, soit une immo réformée est encore utilisée sur le terrain.
- **Site du scan ≠ site théorique** (`Immos.Site`) — signale une immo mal localisée entre Réunion et Mayotte, exactement le type d'écart qui avait motivé la migration EBP de juillet 2026 (véhicules mal affectés).
- **Immos non scannées** (actives, absentes de tous les scans de la campagne) : listées séparément comme "manquantes possibles", sans affirmer qu'elles sont réellement perdues — une immo peut simplement ne pas avoir été présentée au scan (chantier isolé, oubli), ce rapport est une aide au contrôle, pas un verdict.

Ce rapport ne calcule **aucun taux au sens strict de "immos perdues"** : le taux de couverture affiché ("Immos vues") ne compte que les immos actives réellement scannées au moins une fois, rapporté au total des immos actives — une immo scannée mais déjà sortie du parc est comptée dans les écarts, pas dans "vues", pour ne pas gonfler artificiellement le taux de couverture.

Détail des colonnes dans `02_MODELE_DONNEES.md`, raisonnement complet dans `04_HISTORIQUE_DECISIONS.md`.

## Module EPI — dotation & stock (ajouté août 2026)

Chaque salarié "hors bureau" (poste chantier, maintenance, atelier, conducteur de travaux) reçoit un paquetage d'EPI à son entrée puis à chaque nouvelle année civile, dont le contenu dépend uniquement de son `Affectation_EPI` (C/M/Z/A — voir `02_MODELE_DONNEES.md`).

**Module 100% piloté depuis le dashboard, aucun écran PWA** : contrairement aux autres modules terrain (retours, campagne d'inventaire...), la génération des fiches, l'émargement et la réception de stock sont des actions de gestion faites par William/la Logistique, pas par les salariés eux-mêmes. Pas de nouvelle capacité `ROLE_CAPS` dans `app.js` — les droits vivent uniquement côté `dashboard.html`, sur le même principe que `peutGererInventaire`/`peutVoirInventaire` :
- **`peutGererEPI(code)`** : Admin, Logistique, Logistique_Mayotte — gère la grille de dotation, génère/annule les fiches, enregistre les émargements, saisit les réceptions de commande.
- **`peutVoirEPI(code)`** : `peutGererEPI` + Encadrement — consultation seule.

**Grille de dotation éditable** (onglet EPI → "Grille de dotation") : contrairement au barème d'amortissement (figé dans le code), la quantité standard par profil × type d'article est modifiable directement dans le dashboard — si la politique EPI change, William l'ajuste lui-même sans intervention de développement.

**Stock vivant par article/taille** : un solde par référence (`Stock_Actuel` dans `Catalogue_Articles_EPI`), décrémenté **uniquement à l'émargement** d'une fiche (jamais à sa simple génération, pour ne pas fausser le stock avec des fiches produites mais jamais signées ou perdues), incrémenté manuellement à chaque réception de commande fournisseur.

**Trois types de fiches** (`Dotations_EPI.Type_Dotation`) :
- **`Annuelle`** : générée en masse une fois par an (bouton "Générer les fiches manquantes [année]"), pour tous les employés actifs ayant une `Affectation_EPI` renseignée et n'ayant pas déjà une fiche Annuelle/Entree pour cette année.
- **`Entree`** : générée individuellement depuis la fiche employé, pour un nouveau salarié en cours d'année.
- **`Ponctuelle`** : remise libre (ex. "30 paires de gants pour l'équipe de untel"), destinataire en texte libre (pas forcément un employé nommé), articles/tailles/quantités choisis à la volée depuis le catalogue. **Ne compte pas** dans le suivi de dotation annuelle individuelle (pas de vérification anti-doublon par année pour ce type).

**Émargement = preuve photo, comme les FDS des immos** : une fois la fiche imprimée et signée à la main par le destinataire, la Logistique enregistre l'émargement en joignant une photo/scan de la fiche signée (même pipeline que les photos d'immos — upload vers le drive SharePoint, dossier dédié `Fiches_EPI`). C'est cet enregistrement qui décrémente le stock, pas la génération de la fiche.

**Fiche imprimable = HTML + impression navigateur, pas de nouvelle dépendance** : le bouton "Voir/Imprimer" ouvre un nouvel onglet avec une mise en page reprenant le gabarit de l'ancienne fiche papier (en-tête Electricité Services Réunion, bloc destinataire, tableau détail, pied date/nom/signature), avec un bouton déclenchant `window.print()`. Pas de librairie PDF ajoutée.

**Correspondance taille salarié → article** : chaque type d'article consulte un champ de taille précis sur la fiche employé (`Taille_Pantalon`, `Taille_Tshirt`, `Taille_Veste`, `Pointure_Chaussures`, `Taille_Gants`) — Polos, T-shirts manches longues et Ensemble pluie réutilisent l'échelle `Taille_Tshirt`, faute de champ dédié pour ces articles annexes. Si aucun article du catalogue ne correspond à la taille recherchée pour un type donné, la ligne est omise de la fiche et signalée à l'utilisateur (`non_trouves` dans la réponse), plutôt que de générer une ligne incomplète silencieusement.

**Seuils d'alerte "stock bas" (ajouté août 2026)** : chaque référence du catalogue (`Catalogue_Articles_EPI.Stock_Mini`) peut avoir un seuil d'alerte personnalisé, édité un par un depuis l'onglet Stock (bouton "🎚️ Seuil", action `maj_stock_mini_epi`). Sans seuil personnalisé (valeur `0`/vide), le dashboard applique un seuil par défaut de 5 — comportement identique à avant cette fonctionnalité, pour ne rien casser tant que William n'a pas encore renseigné de seuils par article. Sous ce seuil, une pastille "stock bas" (`.badge bu`) s'affiche sur la ligne et l'article remonte dans une carte récapitulative en tête de l'onglet Stock. Un nouvel onglet **"🛒 Suggestion de commande"** calcule, pour chaque article dont le stock ne couvre plus le besoin, une quantité à commander = besoin restant à distribuer aux nouveaux entrants de l'année sans fiche encore générée + seuil mini − stock actuel (jamais négatif) — le "besoin restant" est calculé exactement comme la carte "Nouveaux entrants sans dotation", agrégé par article plutôt que par employé.

## Module Prime d'outillage (ajouté août 2026)

Kit d'outils remis en nature aux salariés de terrain, valorisé comme un avantage — distinct des EPI (vêtements/protection) : les outils sont des articles durables donnés **une seule fois**, complétés plus tard si des articles manquants sont distribués, sans cycle de renouvellement annuel.

**Périmètre** : uniquement les employés rattachés à un `Service_Outillage` (`Travaux Neufs` ou `Maintenance`). **Ce rattachement est indépendant de `Affectation_EPI`** : un Conducteur de travaux ou un salarié Atelier peut être rattaché à l'un de ces 2 services pour la prime d'outillage sans que ça reflète son profil EPI — les deux dimensions sont gérées séparément.

**100% piloté depuis le dashboard, aucun écran PWA** (même principe que les EPI) :
- **`peutGererOutillage(code)`** : Admin, Logistique, Logistique_Mayotte — gère la grille, distribue des outils, saisit les réceptions de commande.
- **`peutVoirOutillage(code)`** : `peutGererOutillage` + Encadrement — consultation seule.

**Grille par service éditable** (onglet Prime d'outillage → "Grille par service") : kit standard (2 colonnes, Travaux Neufs / Maintenance) modifiable directement dans le dashboard.

**Stock vivant** : un solde par outil (`Stock_Actuel` dans `Catalogue_Outillage`), décrémenté à chaque distribution actée, incrémenté à chaque réception de commande. Contrairement aux EPI, il n'y a **pas d'étape "fiche générée en attente"** : la distribution (`distribuer_outillage`) décrémente le stock directement dès l'enregistrement de la preuve photo — pas de fiche "orpheline" possible.

**Vue "Ce qui reste à distribuer"** (besoin explicitement exprimé par William) : pour chaque outil du catalogue, nombre d'employés de son service qui ne l'ont pas encore reçu, calculé dynamiquement en soustrayant les lignes déjà reçues (`Lignes_Outillage`) de la grille du service — équivalent direct de la colonne "Manquant" du fichier Excel d'origine, mais toujours à jour.

**Seuils d'alerte "stock bas" et suggestion de commande (ajouté août 2026)** : même principe que les EPI — `Catalogue_Outillage.Stock_Mini` par outil (action `maj_stock_mini_outillage`), seuil par défaut de 3 si non renseigné, pastille + carte récapitulative sur l'onglet Stock, nouvel onglet "🛒 Suggestion de commande" (quantité à commander = besoin restant à distribuer, calculé exactement comme "Ce qui reste à distribuer" ci-dessus, agrégé tous services confondus + seuil mini − stock actuel).

**Distribution par employé** : sélection d'un employé → cases à cocher sur les articles manquants de son kit → génération d'une fiche imprimable ("PRIME D'OUTILLAGE", même gabarit HTML que les fiches EPI mais sans colonne Taille) → émargement (photo de la fiche signée), qui enregistre les lignes de distribution et décrémente le stock en une seule action.

**Import historique sans reconstitution de preuve** : les distributions déjà faites (connues via les fichiers Excel de suivi et les fiches PDF déjà signées et classées) sont importées directement comme des lignes `Lignes_Outillage` "reçues", **sans re-scanner les PDF existants** — `Photo_Fiche` reste vide pour ces lignes historiques, l'original papier fait foi. Seules les distributions faites *depuis* l'app auront une preuve photo numérique.

**Prime annuelle versée en paie de décembre (ajouté août 2026)** : la prime d'outillage n'est pas qu'un suivi physique — c'est aussi une **prime monétaire**, calculée sur la valeur amortie des outils que chaque salarié détient effectivement (pas sur le kit cible de la grille). Formule (confirmée par William, issue du document de conception `1.6.5.115. Kit outillage électricien et EPI.xlsx`) : `montant annuel = Prix_Unitaire × 12 / Duree_Amortissement_Mois`, sommé sur tous les outils reçus par l'employé (`Lignes_Outillage`). Vue "💶 Prime annuelle" (onglet Prime d'outillage) : tableau par employé avec export CSV pour transmission au service paie — calcul entièrement dynamique, aucun montant n'est stocké/persisté dans l'app (l'export CSV sert de trace externe si besoin de garder un historique de ce qui a été versé).

## Relevé de matériel à restituer (sortie d'employé, ajouté août 2026)

Bouton "📋 Relevé de matériel (sortie)" sur la fiche employé (dashboard, à côté de "🔄 Transférer une immo") : génère un document imprimable combinant **immobilisations actuellement en possession** de l'employé et **outils de la prime d'outillage reçus** (tout ce qui figure dans `Lignes_Outillage` pour ce code — il n'existe pas de notion de "restitution" enregistrée côté outillage, donc la totalité des outils déjà reçus apparaît). **Les EPI sont volontairement exclus** de ce relevé : ils ne sont pas repris au départ d'un salarié (vêtements/protections à usage personnel), une mention explicite l'indique sur le document. Chaque ligne a une case "Restitué" vierge, à cocher manuellement lors de la collecte physique — aucun suivi de restitution n'est enregistré dans l'app à ce stade (document imprimable uniquement, pas de nouvelle donnée persistée). Disponible à tout moment depuis la fiche employé, pas seulement au moment de la bascule "Inactif".

## Autorisation côté serveur des actions sensibles du Worker (ajouté août 2026)

Jusqu'à cette date, les droits n'étaient vérifiés que **côté affichage** (boutons cachés selon le rôle dans `dashboard.html`) — le Worker exécutait n'importe quelle action reçue sans jamais vérifier qui l'appelait. Depuis que `worker.js` est commité sur GitHub (public), les noms d'actions et leurs paramètres sont visibles par n'importe qui : cette absence de contrôle côté serveur était une faille réelle, pas seulement théorique.

**Mécanisme** : à la connexion réussie au dashboard (`verify_password` / `set_password`), le Worker émet un **jeton de session signé** (HMAC-SHA256, secret `SESSION_SECRET_ENV`) encodant le code de l'employé, son rôle, et une expiration à 12h. Ce jeton est stocké côté client (`ADMIN_SESSION.token`) et injecté automatiquement sur chaque action protégée via une interception unique de `window.fetch` (liste `GATED_ACTIONS` dans `dashboard.html`) — pas besoin de modifier chacun des points d'appel individuellement. Côté Worker, chaque action protégée vérifie ce jeton (`requireAdmin` ou `requireGarant`) avant d'exécuter quoi que ce soit, et refuse sinon (`droits_insuffisants`, `session_invalide`, ou `session_secret_manquant` si la variable Cloudflare n'est pas configurée).

**Portée volontairement limitée aux actions exclusivement dashboard** (51 actions) : les actions partagées avec la PWA terrain (`reserver`, `transfert`, `declarer_panne`, `signaler_absence`, `valider`, `declarer_vol`, `resoudre_panne`...) ne sont **pas** protégées par ce mécanisme, car les 97 collaborateurs terrain s'identifient par simple scan de badge, sans mot de passe — c'est un choix de conception assumé depuis le début du projet (friction minimale sur le terrain), pas la faille visée. Deux niveaux :

**Règle d'identité pour toute action gated (ajoutée août 2026)** : l'auteur d'un mouvement/écriture doit toujours être résolu depuis `_auth.session.code` (le jeton vérifié), jamais depuis un champ du corps de la requête (`body.par_code` ou équivalent) — même si le client envoie ce champ, il ne doit servir qu'à titre informatif côté client, pas être la source de vérité côté serveur. Un bug répandu (`body.par_code || 'CONI'`/`'ADMIN'`) a été corrigé sur plusieurs actions déjà gated (`maj_panne`, `enregistrer_reparation`, `marquer_statut_immo`, `bulk_import_lignes_inventaire`) : le jeton garantissait déjà les *droits*, mais pas l'*identité* effectivement enregistrée dans les mouvements SharePoint. Voir `04_HISTORIQUE_DECISIONS.md` pour le détail de l'incident qui a révélé ce problème (transfert attribué au mauvais employé).
- **Admin strict** (`requireAdmin`) : création de comptes, changement de rôle/droits, réinitialisation de mot de passe, migrations en masse (EBP, EPI, Outillage, inventaire déc. 2025, Matériel IT), création/import d'immobilisations et d'appareils Matériel IT.
- **Garant** (`requireGarant`, Admin + Logistique + Logistique_Mayotte) : gestion courante EPI/Outillage/inventaire stock/Matériel IT, réparations/pannes, ajout de FDS — même population que `estGarant()` déjà utilisée côté client pour la validation des retours dépôt.

## Module Matériel IT (téléphones, puis ordinateurs — ajouté août 2026)

Suivi de qui détient quel téléphone/ordinateur professionnel, **hors circuit des immobilisations** (pas amortis comptablement, pas dans `ROLE_CAPS`/`app.js` — module 100% dashboard, aucun écran PWA, même logique que EPI/Outillage). Droits : `peutGererEPI()` réutilisée telle quelle côté dashboard (Admin, Logistique, Logistique_Mayotte) — pas de nouvelle capacité dédiée, le périmètre est identique à la gestion EPI/Outillage.

Le détenteur courant d'un appareil est déduit du dernier `Mouvement_Materiel_IT` enregistré (même principe que les Mouvements des immos), pas d'un champ figé — ce qui permet de retrouver l'historique complet des détenteurs successifs et la durée de détention, comme demandé par William. Contrairement aux immos, aucun workflow panne/réservation/validation par un garant tiers : une simple action "Affecter" enregistre directement le changement de détenteur.

## Garde-fous complémentaires ajoutés lors de la punch-list dashboard (août 2026)

- **Employé inactif = plus aucune nouvelle affectation de matériel** : `reserver`, `transfert` (côté receveur) et `generer_dotation_epi` refusent désormais l'action côté Worker si l'employé cible est inactif (`Employes.field_2`). Un `transfert` vers `DEPOT` reste explicitement autorisé même si le donneur est inactif — un retour de matériel par quelqu'un qui vient de sortir de l'effectif doit rester possible. La distribution d'outillage (`distribuer_outillage`) a le même garde-fou. **L'émargement EPI (`emarger_dotation_epi`) n'a volontairement pas ce contrôle** : il ne fait que confirmer une remise déjà survenue, contrairement aux autres actions qui décident de la remise elle-même.
- **Stock jamais négatif en distribution d'outillage** : `distribuer_outillage` vérifie le stock disponible par article avant toute écriture et refuse si insuffisant. Ce contrôle n'existe pour l'instant que côté outillage, pas côté émargement EPI (même raisonnement que ci-dessus — voir `04_HISTORIQUE_DECISIONS.md` pour le détail).
- **Circuit de retour du matériel outillage après sortie d'un employé** : une fois un employé passé inactif, sa fiche affiche un bandeau "⏳ EN ATTENTE RETOUR FICHE DE SORTIE" sur le bloc Outillage, avec un bouton "↩️ Retour en stock" par ligne encore détenue — recrédite le stock et retire la ligne de `Lignes_Outillage` (réutilise l'action `annuler_ligne_outillage`, déjà existante côté serveur).
- **Édition directe du stock EPI/Outillage** (`bulk_maj_stock_epi` côté EPI, nouvelle action `editer_stock_outillage` côté Outillage) : fixe une valeur absolue plutôt que d'ajouter un delta, réservé aux mêmes rôles que la réception de commande (`peutGererEPI`/`peutGererOutillage`). À utiliser tant que le comptage physique de référence de ces deux stocks n'a pas été fait.
- **Filtre actif/inactif à 3 états**, généralisé sur les listes du dashboard (Utilisateurs, Au dépôt, Historique des mouvements) : "tout" / "actifs seulement" / "inactifs seulement", même pattern partout pour la cohérence — le statut actif d'une immo est lu depuis `immoMeta[code].actif` (issu de `Immos.Actif`, remonté par `?immo_metadata=1`).

## Onglet Historique EPI/Outillage et suivi des émargements (ajouté août 2026)

- **Filtre Statut + compteur "en attente"** (onglet EPI → Dotations) : sélecteur Tous/Émargées/En attente sur la liste des fiches de l'année sélectionnée, plus un badge visible du nombre de fiches en attente — répond au besoin explicite de William de voir clairement qui n'a pas encore émargé.
- **Garde-fou "déjà généré cette année"** : `genererDotationAnnuelleComplete` avertit désormais explicitement (confirm bloquant) si au moins un employé éligible a déjà une fiche pour l'année saisie, avant de créer les fiches manquantes et de régénérer tous les PDF de l'année (y compris ceux déjà émargés) — la dotation annuelle ne doit normalement se lancer qu'une fois par an.
- **Onglet "🕘 Historique"** (EPI et Outillage, même principe des deux côtés) : deux sous-vues.
  - **Par employé** : tableau employés (lignes) × années (colonnes). Côté EPI, deux colonnes par année ("Dotation" = statut ✅ Reçue/⏳ En attente de la dotation annuelle/entrée, cliquable vers la fiche ; "Ponctuelles" = nombre de remises ponctuelles **nommément adressées** à cet employé cette année, cliquable vers le détail). Côté Outillage, une colonne par année (nombre d'outils reçus, cliquable vers le détail avec lien vers la preuve photo si disponible).
  - **Consommation par année** : quantités distribuées par article pour l'année sélectionnée, filtrable par type de dotation côté EPI (Tous / Annuelles / Ponctuelles), export CSV. Aucune valorisation monétaire (cohérent avec l'absence de prix dans le catalogue EPI ; côté Outillage la prime annuelle valorisée existe déjà dans sa propre vue dédiée, pas dupliquée ici).
- **Remise ponctuelle EPI — destinataire nommé** : en plus du texte libre pour les remises de groupe, un sélecteur permet de choisir un employé actif précis comme destinataire — dans ce cas le `Title` de la fiche `Dotations_EPI` devient son code (au lieu de l'identifiant synthétique `PONCTUEL-...`), ce qui la fait apparaître automatiquement dans son historique individuel (colonne "Ponctuelles" ci-dessus, et bloc EPI de sa fiche employé). Une remise de groupe (texte libre) reste possible et n'est comptée nulle part par employé.
- **Import de scans en lot (EPI uniquement)** : lecture optique (OCR, `Tesseract.js`) **best-effort** du code employé sur plusieurs fichiers à la fois (images ou PDF, 1ère page rendue via `pdf.js`), pour accélérer le rattrapage d'un arriéré de fiches signées. La reconnaissance est volontairement limitée à l'univers des fiches jamais émargées (tous types/années) pour réduire les faux positifs, et **rien n'est jamais écrit automatiquement** : un tableau de contrôle (aperçu, code détecté, sélecteur de correction manuelle par ligne) doit être validé explicitement avant tout appel aux actions d'émargement (mêmes actions que le flux individuel, `upload_fiche_epi` + `emarger_dotation_epi`). **Non appliqué à l'outillage** : contrairement aux EPI, la distribution d'outillage exige déjà la photo au moment même de l'action (`distribuer_outillage`) — il n'existe pas d'état "en attente de signature" à rattacher a posteriori, donc pas de scénario d'import en lot pertinent avec le modèle actuel.
- **Scans PDF acceptés partout** : tous les flux d'émargement (EPI individuel, EPI en lot, Outillage) acceptent désormais un PDF en plus d'une photo — un helper partagé (`fichierVersJPEGBase64`) rend la 1ère page via `pdf.js` puis suit le même chemin de compression que les photos.

## Signature obligatoire à l'émargement (ajouté août 2026)

Une fiche sans signature détectée dans la case prévue à cet effet ne peut pas être validée comme émargée — ni en import individuel (EPI, Outillage), ni en import en lot. Détection best-effort par analyse de pixels (`detecterSignatureDataURL`) sur la zone "Signature" de la fiche, pas de l'OCR de texte donc pas garantie à 100%. Un déblocage explicite reste possible (case "Forcer malgré tout" en import lot, confirmation en flux individuel) après vérification visuelle de l'aperçu — le blocage protège contre un oubli, pas contre une décision consciente de l'utilisateur.

## Nouveaux entrants EPI (ajouté août 2026)

Tout employé actif d'un service concerné par la dotation EPI (`Affectation_EPI` renseignée) doit recevoir sa fiche "Entree" dès son embauche, **peu importe la date** — ce n'est pas conditionné à une saisie manuelle proactive. L'onglet Dotations EPI affiche une carte dédiée listant ces employés, avec leur besoin en articles comparé au stock disponible, et un accès direct à la génération de leur fiche (même circuit de validation qu'une dotation annuelle classique).

**Ajout d'un employé** (dashboard, onglet Utilisateurs) : le formulaire de création permet de saisir directement l'affectation EPI et les 5 tailles (au lieu de devoir repasser ensuite par sa fiche individuelle) — règle de saisie : la taille de veste se remplit par défaut sur celle du t-shirt (modifiable si différente, cf. mode de réception des demandes d'embauche par mail). Si le stock est insuffisant pour son profil, une alerte informative (non bloquante) liste les articles concernés juste après la création.

## Recherche globale dashboard (ajoutée août 2026)

Champ de recherche unique en en-tête du dashboard (raccourci clavier `/`, comme GitHub/Slack — n'intercepte pas la frappe si un autre champ a déjà le focus), cherchant simultanément dans les données déjà chargées en mémoire : immobilisations (code, libellé, n° série), employés (code, nom), articles EPI et outillage (type, référence, désignation/marque, taille pour les EPI). Résultats groupés par type, plafonnés à 8 par groupe pour rester lisible (pas de pagination — c'est un accès rapide, pas un écran de recherche exhaustive).

**Aucune donnée supplémentaire chargée pour ce besoin** : purement client-side sur ce qui est déjà en mémoire pour l'onglet courant ou déjà visité (`im`, `employesList`, `epiCatalogue`, `outilCatalogue`) — aucun nouvel appel Worker. Conséquence assumée : tant que les onglets EPI/Outillage n'ont jamais été ouverts dans la session, leurs catalogues ne sont pas encore en mémoire et n'apparaissent pas dans les résultats (les immos et employés, eux, sont chargés dès l'ouverture du dashboard, donc toujours cherchables).

**Navigation à la sélection d'un résultat** : les immobilisations et employés ont une fiche existante (panneau latéral) qui s'ouvre directement, sans changer d'onglet. Les articles EPI/outillage n'ont pas de fiche individuelle : la sélection bascule vers l'onglet concerné (chargeant ses données si pas encore fait), force la sous-vue "Stock", et pré-remplit le champ de filtre déjà existant sur cette vue avec la référence de l'article — réutilise telle quelle la logique de filtrage déjà en place (`refreshEPIStockResults`/`refreshOutilStockResults`), aucun nouveau mécanisme de recherche par article.

**Aucun nouveau droit** : la recherche elle-même est disponible à tout utilisateur connecté au dashboard (elle ne fait que filtrer des données déjà visibles pour lui) ; la navigation vers un article EPI/outillage revérifie `peutVoirEPI`/`peutVoirOutillage` au moment du clic (au cas où le rôle aurait changé depuis le chargement de la page), cohérent avec le contrôle déjà appliqué à l'ouverture normale de ces onglets.

## Journal d'audit des actions sensibles (ajouté août 2026)

Les mouvements de matériel sont tracés dans `Mouvements`, mais jusqu'à cette date les actions d'**administration** (changement de mot de passe, modification de droits/rôles, suppressions, migrations en masse...) ne laissaient aucune trace exploitable. Nouvelle liste `Journal_Audit` (voir `02_MODELE_DONNEES.md`) : une ligne = une tentative d'action sensible, réussie ou non.

**Périmètre exact : les 62 actions déjà protégées `requireAdmin`/`requireGarant`** (`GATED_ACTIONS` côté dashboard.html) + les échecs de connexion (`verify_password`) — rien de plus. Ni les 15 actions partagées avec la PWA terrain (badge sans mot de passe), ni les ~35 endpoints GET publics de fonctionnement courant.

**Mécanisme (point d'insertion unique, pas 62 modifications)** : dans `worker.js`, tout le bloc `if (action === 'xxx') {...}` des actions POST est désormais enveloppé dans une fonction interne `dispatchPost()`, appelée une seule fois. Après coup, si l'action appelée fait partie de `GATED_ACTIONS_AUDIT` (duplicata de `GATED_ACTIONS`, synchronisation garantie par `tests/security.gated-actions.test.js`), la réponse déjà produite (clonée, jamais consommée deux fois) est inspectée pour en déduire Succès/Échec, sans qu'aucun des 62 blocs d'action n'ait eu besoin d'être modifié individuellement.

**Identité toujours résolue depuis le jeton, jamais depuis le corps de la requête** — même règle que pour l'attribution des mouvements (voir plus haut) : `Code_Employe` vient d'une ré-vérification de `body.token` faite au point d'insertion unique, jamais d'un champ envoyé par le client. **Exception explicite et volontaire pour les échecs de connexion** (`verify_password` raté ou verrou anti brute-force déclenché) : par définition, aucune session n'existe encore à ce stade, donc `Code_Employe` reste vide et le code **tenté** (non vérifié, potentiellement usurpé) va dans `Cible` — c'est un suivi de tentative anonyme, pas une attribution d'action.

**Aucune écriture d'audit si l'authentification échoue** (`session_invalide`, `droits_insuffisants`, `session_secret_manquant`) : ces réponses sont explicitement exclues de la journalisation. Deux raisons : (1) préserve la garantie déjà testée « zéro écriture SharePoint si l'auth échoue » (voir `tests/worker.integration.test.js`) — y compris pour le journal d'audit lui-même ; (2) aucune identité vérifiée n'est disponible à ce stade, et journaliser sans discrimination transformerait le journal en vecteur de spam pour quiconque envoie des jetons invalides en boucle. Conséquence assumée : une tentative avec un jeton invalide/absent n'apparaît pas dans `Journal_Audit` (elle est déjà rejetée par le 401/403 renvoyé, juste sans trace persistée).

**Écriture best-effort, ne bloque jamais l'action métier** : `logAudit()` s'exécute **après** que l'action métier a déjà eu lieu (ou échoué pour une raison métier) ; un échec d'écriture Graph vers `Journal_Audit` est absorbé (`try/catch`), avec une trace Sentry (projet existant, tag `environment: 'worker'`, jamais de corps de requête ni de code employé transmis — seulement le nom de l'action et un message d'erreur généré par le Worker lui-même).

**RGPD — colonne `Detail`** : mots de passe, codes PIN/PUK/RIO/déverrouillage de cartes SIM et le jeton de session lui-même ne sont **jamais** recopiés (liste noire de clés, insensible à la casse). Les charges de fichier (uploads photo/FDS/fiches EPI-Outillage, champ `data`) sont exclues. Les imports en masse (tableaux/objets) sont résumés en un simple compte d'éléments plutôt que recopiés intégralement — évite de dupliquer les données de dizaines d'employés/immos dans une seule ligne d'audit.

**Lecture réservée Admin** : nouvel endpoint `?journal_audit=1` (GET, jeton en paramètre `&token=`, même mécanisme que `?export_liste=`), protégé `requireAdmin` — ce n'est **pas** une donnée de fonctionnement courant comme les endpoints GET publics existants. Côté dashboard, nouvel onglet "🗂️ Journal d'audit" (groupe "ADMINISTRATION" en bas de la barre latérale), masqué par défaut et révélé uniquement pour `estAdmin(ADMIN_SESSION.code)` — réutilise cette fonction déjà existante, aucun nouveau mécanisme de droits inventé. Lecture seule : filtres par employé, action, résultat et période, aucune action possible depuis cet onglet.

## Demande de matériel planifiée (roadmap item D, Lot 1 — ajouté août 2026)

*Passage d'un mode 100% réactif (réservation immédiate d'une immo précise) à une vraie planification logistique : un CT peut demander une **catégorie de matériel** pour une date future, sans savoir laquelle sera fournie. Voir `04_HISTORIQUE_DECISIONS.md` pour le cadrage complet et le choix d'étendre `Reservations` plutôt que créer une nouvelle liste.*

**Aucune nouvelle capacité `ROLE_CAPS`** : la création d'une demande (précise ou par catégorie) réutilise exactement la population déjà autorisée à réserver (capacité `reserver`) ; le traitement (Confirmer/Refuser une demande) réutilise `estGarant()` — même population que la validation des retours dépôt et la gestion EPI/Outillage/Matériel IT (Admin, Logistique, Logistique_Mayotte).

**Transitions de statut** : `Demandee` → `Confirmee` (le dépôt honore la demande) ou `Refusee` (le dépôt ne peut pas la satisfaire) ; `Annulee` à tout moment par le demandeur ou un garant, tant que la ligne n'est pas `Rendue`. Aucune transition n'est vérifiée côté serveur au-delà d'une liste blanche de valeurs (`statut_resa`) — cohérent avec le modèle de confiance déjà en place pour cette action, partagée PWA (voir plus bas).

**Aucun blocage automatique des immos** : une demande planifiée ne réserve rien de force à la date voulue — c'est une intention, l'arbitrage reste humain au moment de la préparation réelle. Une immo-précise garde en revanche l'avertissement de conflit de dates déjà existant (affiché, pas bloquant).

**Isolation stricte vis-à-vis de `Mouvements`, confirmée** : aucun statut de `Reservations` (existant ou nouveau) n'écrit jamais de mouvement — la logique "détenteur courant = dernier `Mouvement`" n'est touchée nulle part par ce chantier. Seule la remise physique réelle, via `transfert`/`valider` (flux déjà existant, inchangé), déplace effectivement une immo.

**`reserver`/`statut_resa`/`modifier_resa` restent des actions partagées PWA (`PWA_SHARED_ACTIONS`), volontairement non protégées par jeton de session** — décision déjà prise et testée avant ce chantier (pas une régression introduite ici) : `statut_resa` sert aussi bien au CT qui annule sa propre demande qu'au profil admin terrain (badge sans mot de passe) qui confirme/refuse depuis la PWA, qu'au gestionnaire dépôt depuis le dashboard. Seul ajout de sécurité : `statut_resa` vérifie désormais la valeur de `Statut` contre une liste blanche avant écriture (elle acceptait auparavant n'importe quelle chaîne).

**Lot 2 (ajouté août 2026)** : sous-onglet "📅 Planning" dans l'onglet Réservations du dashboard (à côté de "📋 Liste", même pattern que les sous-onglets EPI/Outillage) — regroupe les demandes encore actionnables (`Demandee`/`Confirmee`/`En retard`, jamais `Refusee`/`Rendue`/`Annulee`) par semaine (lundi-dimanche, une semaine "⚠️ En retard / date dépassée" en tête pour les dates déjà dépassées) puis par chantier, avec les boutons Confirmer/Refuser directement sur chaque ligne `Demandee`. Complète le Gantt existant (qui reste utile pour visualiser l'occupation d'une immo précise) sans le remplacer — deux angles différents sur les mêmes données, aucune nouvelle donnée stockée.

Extension du digest hebdomadaire (`?digest=1`) avec une 6e règle : `digestDemandesReservationEnAttente` remonte les demandes restées `Demandee` (aucune décision Confirmer/Refuser) depuis plus de `DIGEST_SEUILS.demandeJours` (5 jours, plus court que `transfertJours`=7 — une demande de planification non traitée risque de bloquer un chantier avant même la sortie du matériel). Même principe que les 5 règles existantes (fonction pure testée isolément, seuil ajustable dans `DIGEST_SEUILS`, section HTML dédiée dans `renderDigestHtml`).

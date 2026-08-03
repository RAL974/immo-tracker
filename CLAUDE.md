# Immo Tracker — Contexte projet (fichier de référence automatique)

*Ce fichier est lu automatiquement par Claude Code à l'ouverture du dépôt. Il regroupe les 6 documents de connaissance du projet. Ne pas le renommer ni le déplacer hors de la racine du dépôt.*

---


---

# Immo Tracker — Contexte du projet

*Document de référence à charger en connaissance de projet. Dernière mise à jour : juillet 2026.*

## Qui, quoi, pourquoi

**Porteur du projet :** William, Responsable Achats & Logistique chez Espace Soleil (entreprise d'électricité basée à La Réunion, opérant aussi à Mayotte). William est autodidacte en développement (Python, VS Code, GitHub, Cloudflare, SharePoint, Power Automate) et développe/maintient seul cette solution.

**Ce qu'est Immo Tracker :** une application de suivi des immobilisations et du parc matériel (outillage, matériel de chantier, véhicules, informatique…) pour Espace Soleil, sur les deux territoires La Réunion et Mayotte. Elle remplace un suivi Excel manuel.

**Pourquoi ça existe :** la direction d'Espace Soleil a demandé d'évaluer des alternatives commerciales (Organilog, Hector). Une note de synthèse a comparé les options et conclu à la supériorité économique et fonctionnelle de la solution interne (voir `Note_Synthese_Immo_Tracker.docx`). Le principal risque identifié est la dépendance à une seule personne (« bus factor ») — d'où l'existence de ce projet structuré et de la documentation de pérennité.

## Les deux interfaces

1. **PWA terrain** (`app.js` + `index.html`) : utilisée par les collaborateurs sur le terrain pour scanner, réserver, transférer, retourner du matériel. Mobile-first, fonctionne en mode dégradé.
2. **Dashboard** (`dashboard.html`, fichier autonome) : réservé à l'encadrement. Vue complète du parc (circulation, dépôt, historique, transferts, réservations, maintenance, alertes, analyses) + administration.

## Chiffres clés (juillet 2026)

- **1023 immobilisations actives** suivies, dont **812 liées à l'activité terrain** (211 « administratives » : mobilier, informatique, véhicules, logiciels, financières)
- **~97 collaborateurs** référencés
- **Coût d'hébergement : ≈ 0 €** (GitHub Pages + Cloudflare Workers gratuits + Microsoft 365 déjà en place chez Espace Soleil)
- Bi-site : **1013 immos Réunion / ~154 Mayotte** (après correction via la migration EBP)

## Statut d'avancement (juillet 2026)

✅ **Fait et en production :**
- Cœur applicatif (réservation, transfert, retour, historique)
- Filtres site + badges Réunion/Mayotte sur toutes les rubriques
- Authentification dashboard par mots de passe hachés (PBKDF2/SHA-256)
- Super-admin permanent (AIWI)
- Modèle de droits centralisé (`ROLE_CAPS`) avec 9 rôles dont Encadrement (view-only)
- Flux de validation des retours dépôt par « garants »
- Sortie d'employé (passage inactif, historique conservé)
- **Axe 1** : Amortissement linéaire + Valeur Nette Comptable, durée déduite automatiquement du compte d'amortissement
- **Axe 2** : Export comptable CSV (rapprochement expert-comptable / EBP)
- **Axe 3** : Module de maintenance préventive (garanties, entretiens, immos dormantes)
- Migration complète des données comptables EBP → SharePoint (dates, comptes, sites corrigés)
- Documentation de pérennité (`Immo_Tracker_Documentation.docx`)
- Note de synthèse comparative pour la direction (`Note_Synthese_Immo_Tracker.docx`)

🔜 **Évoquées pour la suite** (voir `05_ROADMAP_EVOLUTIONS_FUTURES.md`) :
- Module de report d'heures / temps chantier
- Inventaire physique annuel assisté par scan
- Photos et constat d'état en image
- Coûts de réparation structurés + seuil de réforme
- Demandes de matériel planifiées à l'avance
- Interface simplifiée pour Mayotte
- Digest de notifications hebdomadaire

## Comment utiliser cette base de connaissance

Ce projet contient plusieurs documents complémentaires :

| Fichier | Contenu |
|---|---|
| `00_CONTEXTE_PROJET.md` | Ce document — vue d'ensemble |
| `01_ARCHITECTURE_TECHNIQUE.md` | Composants techniques, URLs, déploiement, pièges connus |
| `02_MODELE_DONNEES.md` | Listes SharePoint, colonnes, comptes comptables, catégories |
| `03_REGLES_METIER_ET_ROLES.md` | Rôles, droits, workflows métier |
| `04_HISTORIQUE_DECISIONS.md` | Journal chronologique des décisions et évolutions |
| `05_ROADMAP_EVOLUTIONS_FUTURES.md` | Idées d'évolution non encore développées |

**Conseil d'usage avec Claude :** quand une conversation démarre sur ce projet, ces documents donnent tout le contexte nécessaire sans avoir à tout réexpliquer. Après chaque évolution significative, penser à mettre à jour `04_HISTORIQUE_DECISIONS.md` (et les autres documents concernés) pour que la base de connaissance reste fidèle au code réel.


---

# Immo Tracker — Architecture technique

*Document de référence technique. Voir aussi `Immo_Tracker_Documentation.docx` pour la version formelle destinée à un tiers.*

## Vue d'ensemble de la chaîne

```
Navigateur (PWA / Dashboard)  →  Worker Cloudflare  →  Microsoft Graph API  →  SharePoint (données)
```

Les interfaces web ne parlent jamais directement à SharePoint : tout passe par le Worker, qui seul détient les identifiants d'accès (secret Azure). Ce découpage évite d'exposer des identifiants dans du code public (GitHub Pages).

## Composants et fichiers

| Composant | Fichier(s) | Hébergement | Adresse |
|---|---|---|---|
| PWA terrain | `app.js`, `index.html` | GitHub Pages | https://ral974.github.io/immo-tracker/ |
| Dashboard | `dashboard.html` (autonome HTML+CSS+JS) | GitHub Pages | https://ral974.github.io/immo-tracker/dashboard.html |
| Worker (proxy sécurisé) | `worker.js` | Cloudflare Workers | https://immo-proxy.ral-85d.workers.dev/ |
| Catalogue immos (léger) | `immos.json` — **tableau** `[...]` de 1023 immos | GitHub Pages (racine) | .../immos.json |
| Catalogue immos (complet, migration) | `immos_full.json` — **objet** `{...}` de 1167 immos | GitHub Pages (racine) | .../immos_full.json |
| Base de données | Listes SharePoint | Microsoft 365 Espace Soleil | espacesoleil97.sharepoint.com/sites/Logistique-Immos |
| Authentification API | App Azure AD "Immo Tracker" | Azure / Entra ID | — |
| Notifications | Flux "Notification_Mouvement_Immo" | Power Automate | — |

⚠️ **`immos.json` et `immos_full.json` ont des structures différentes** (tableau vs objet) et des usages différents (catalogue courant vs migration EBP one-shot). Ne jamais les confondre au déploiement — un mauvais fichier casse silencieusement l'affichage des libellés/catégories dans le dashboard.

## Identifiants Azure (non sensibles)

- Tenant ID : `c7875e38-b2b0-4c10-a8c5-687c5a214e44`
- Client ID (app) : `3a901471-86c0-4fc7-8d37-319ead2c4b88`
- SITE_ID Graph : `espacesoleil97.sharepoint.com,4157ffef-a5f6-4e7e-8a19-4f6ab57d7128,d15dad00-7bed-4e78-bb2f-d0156e6e49a7`
- Endpoint Graph listes : `https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists`

Le **secret client** (sensible) est stocké chiffré dans les variables Cloudflare du Worker (`CLIENT_SECRET_ENV`), jamais dans le code. Procédure de renouvellement (tous les ~24 mois) détaillée dans `Immo_Tracker_Documentation.docx` §6.2.

## Procédures de déploiement

### Fichiers web (PWA, Dashboard, JSON)
1. Dépôt GitHub `RAL974/immo-tracker`, tous les fichiers **à la racine** (aucun sous-dossier à créer).
2. Modifier via l'éditeur GitHub (crayon) ou **Add file → Upload files** pour un nouveau fichier.
3. **Commit changes** sur la branche `main` → publication automatique en 1-2 min.
4. **Vérifier après coup** en ouvrant l'URL du fichier dans un navigateur.

### Worker Cloudflare
1. Cloudflare → Workers → `immo-proxy` → Edit code.
2. Tout sélectionner, remplacer par le nouveau contenu, **Deploy**.
3. Le `worker.js` n'est **jamais** publié sur GitHub (contient la logique d'accès) — conserver une sauvegarde hors ligne séparée.

## Pièges connus (vécus, à éviter)

| Symptôme | Cause | Solution |
|---|---|---|
| Erreur "Multiple artifacts named github-pages" | Ré-exécution d'un job de publication | Ne **jamais** utiliser "Re-run jobs" ; faire un nouveau petit commit |
| `404` sur un fichier JSON alors qu'il a été uploadé | Nom de fichier avec une majuscule (GitHub Pages est sensible à la casse) ou fichier dans un sous-dossier | Vérifier que le nom est strictement en minuscules et à la racine |
| Dashboard cassé (codes affichés à la place des libellés, catégories vides) | `immos.json` écrasé/absent, ou confondu avec `immos_full.json` (mauvaise structure) | Vérifier `immos.json` commence par `[`, `immos_full.json` par `{` |
| `tb-depot null` / panneau vide après clic sur un onglet | Ancien bug : le code détruisait le HTML interne du panneau avant que les données soient prêtes | Corrigé : `goTab` ne détruit plus la structure des panneaux |
| Catégories dupliquées ×5 dans un menu déroulant | `appendChild` répété sans vider le `<select>` au préalable | Toujours réinitialiser `innerHTML` avant de repeupler une liste |
| `Field 'X' is not recognized` à l'écriture SharePoint | Colonne inexistante dans la liste SharePoint (le code suppose son existence) | Vérifier la liste des colonnes réelles avant tout ajout de champ (voir `02_MODELE_DONNEES.md`) |
| Erreur silencieuse sur écriture liste Employés | La liste **Employes n'a pas de colonne `Actif`** ; le statut est dans `field_2` | Toujours utiliser `field_2` pour le statut actif/inactif d'un employé |

## Outils de diagnostic

Adresses à ouvrir directement dans un navigateur (Worker) :
```
?debug_immos=1
?debug_employes=1
?debug_mouvements=1
?next_code_im=1
```

## Anomalies bénignes (sans conséquence)
- `favicon.ico 404` — icône d'onglet absente, sans impact.
- `ERR_NAME_NOT_RESOLVED` — problème réseau/DNS côté poste client, pas un défaut applicatif.

## Environnement de développement (côté Claude / assistant)

- Validation systématique avant livraison : `node --check worker.js`, `node --check app.js` ; pour `dashboard.html`, extraire les balises `<script>` vers un fichier temporaire puis `node --check`.
- Génération de documents Word via la librairie `docx` (Node.js) — scripts `gen_doc.js` (helpers) + `build.js`/`build_note.js` (contenu), conversion PDF de vérification via LibreOffice avant livraison.
- Migration EBP : lecture des fichiers `.xls` via `xlrd` (Python), écriture SharePoint par lots de 20 via l'action Worker `bulk_patch_immos` (Graph `$batch`).


---

# Immo Tracker — Modèle de données (SharePoint)

*Les données résident dans le site SharePoint `espacesoleil97.sharepoint.com/sites/Logistique-Immos`, 6 listes. Les noms indiqués sont les noms internes techniques (à respecter impérativement lors de toute modification de colonne dans SharePoint).*

## Liste `Immos`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code immobilisation, ex. `IM000123` |
| `Libelle` | Texte | Désignation |
| `Categorie` | Texte | Catégorie (dérivée du compte d'immobilisation, voir plus bas) |
| `N_Serie` | Texte | Numéro de série |
| `Etat` | Texte | Neuf / Bon / Usé / Abîmé / Hors service |
| `Valeur_Achat` | Nombre | Prix d'achat HT |
| `Date_Achat` | Date | Date d'achat |
| `Date_Mise_Service` | Date | Date de mise en service (ajoutée juillet 2026) |
| `Compte_Immobilisation` | Texte | Compte comptable d'immobilisation (ajoutée juillet 2026) |
| `Compte_Amortissement` | Texte | Compte d'amortissement — **pilote la durée d'amortissement automatique** (ajoutée juillet 2026) |
| `Compte_Dotation` | Texte | Compte de dotation (ajoutée juillet 2026) |
| `Duree_Amortissement` | Nombre | ⚠️ Existe dans SharePoint mais **n'est plus utilisée par le code** depuis le passage à la durée 100% automatique par compte d'amortissement (voir `03_REGLES_METIER_ET_ROLES.md`). Peut être supprimée sans impact. |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Actif` | Texte | `Oui` / `Non` (Non = immo sortie) |
| `FDS_URL` | Texte/lien | Lien vers fiche/document |

Content-type de la liste : `Élément`.

## Liste `Employes`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code collaborateur, ex. `AIWI` |
| `field_1` | Texte | Nom complet |
| `field_2` | Texte | **Statut actif** : `Oui` / `Non`. ⚠️ **Il n'existe PAS de colonne `Actif` sur cette liste** — piège rencontré et corrigé en juillet 2026 (le code utilisait par erreur `Actif`, qui n'existe que sur la liste Immos). |
| `Poste` | Texte | Intitulé du poste |
| `Code_CT` | Texte | Rôle / droits (voir `03_REGLES_METIER_ET_ROLES.md`) |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `MotDePasse` | Texte | Empreinte PBKDF2/SHA-256 (format `saltHex:hashHex`), jamais en clair |

Content-type de la liste : `Item`.

## Liste `Mouvements`

| Colonne | Contenu |
|---|---|
| `Title` | Code immobilisation concernée |
| `Code_Employe` | Auteur du mouvement (pour un retour validé : le **déclarant terrain**, pas le validateur — voir ci-dessous) |
| `Type_Mouvement` | `Transfert` / `Retour` / `Panne` / `Réparation` / `Archivage` |
| `Code_Chantier` | Destination. Pour un transfert classique : code du receveur. Pour un retour **validé par un garant** : format spécial `DEPOT|code_validateur|nom_validateur` |
| `Commentaire` | Utilisé pour stocker le nom du déclarant terrain dans le cas d'un retour validé |
| `Etat` | État constaté à ce mouvement |
| `Note` | Commentaire libre + traçabilité automatique (ex. `[retour validé par COUTAREL Nicolas]`) |
| `Horodatage` | Date et heure ISO |

## Autres listes

| Liste | Rôle |
|---|---|
| `Transferts_En_Attente` | Transferts et retours dépôt en attente de validation |
| `Reservations` | Réservations de matériel |
| `Chantiers` | Référentiel des chantiers |

## Catégories dérivées du compte d'immobilisation

| Compte | Catégorie |
|---|---|
| 21541 | Électroportatif |
| 21542 | Mesure & test |
| 21543 | Matériel de chantier |
| 21544 | Coffrets & armoires |
| 2154 / 2181 | Matériel & installations |
| 2182 | Véhicules |
| 2183 | Informatique & bureautique |
| 2184 | Mobilier |
| 205 | Logiciels & licences |
| 2718 / 2752 | Immobilisations financières (cautions) |
| 2315 | En cours |

## Durées d'amortissement — barème officiel par compte d'amortissement

*Transmis par William en juillet 2026, remplace toute logique de durée par catégorie ou saisie manuelle. Source unique de vérité : `DUREES_AMORT_MOIS` dans `dashboard.html`.*

| Compte amortissement | Durée |
|---|---|
| 2805 | 12 mois (1 an) |
| 28154 | 120 mois (10 ans) |
| 281541 | 36 mois (3 ans) |
| 281542 | 48 mois (4 ans) |
| 281543 | 60 mois (5 ans) |
| 281544 | 48 mois (4 ans) |
| 28181 | 60 mois (5 ans) |
| 28182 | 12 mois (1 an) |
| 28183 | 36 mois (3 ans) |
| 28184 | 60 mois (5 ans) |
| 28315 | 36 mois (3 ans) |
| 28718 | Non amortissable (caution) |
| 28752 | Non amortissable (caution) |
| *(compte inconnu/absent)* | 60 mois (5 ans) par défaut |

## Comptes "administratifs" masqués aux rôles terrain

Les rôles terrain (CT, Ouvrier, RA, Logistique_Mayotte, CT_Specialise, Ouvrier_Specialise) ne voient pas les immobilisations dont le compte d'immobilisation est : `205, 2154, 2181, 2182, 2183, 2184, 2718, 2752`.

**Exception** : 19 étiqueteuses BROTHER (compte 2183 historiquement mal affecté) restent visibles pour tous : `IM000272, IM000495, IM000496, IM000605, IM000606, IM000607, IM000643, IM000685, IM000686, IM000771, IM000889, IM000897, IM000898, IM000899, IM000900, IM000901, IM000902, IM000903, IM000904`.

**Exception Logistique_Mayotte** : ce rôle, bien que mono-site, voit en plus la catégorie Véhicules (compte 2182) pour gérer l'entretien sur place — sans droit d'action sur les véhicules de La Réunion.

Cette distinction "immo d'activité" vs "immo administrative" est utilisée pour filtrer l'onglet "Au dépôt" et toutes les statistiques d'usage (Analyses) — avec un bouton pour révéler les immos administratives si besoin.

## Fichiers JSON associés

- **`immos.json`** (tableau) : catalogue léger utilisé par la PWA et le Dashboard pour les libellés/catégories/comptes en lecture rapide. Généré à partir de SharePoint, redéployé après modifications importantes.
- **`immos_full.json`** (objet, clé = code IM) : catalogue complet utilisé uniquement par l'outil de migration EBP → SharePoint (`enrichirImmosEBP()` dans le dashboard). Contient 1167 immos (1023 actives + 144 sorties), issu de l'export comptable EBP (`Export_immos_030726_avec_sites.xls`).


---

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


---

# Immo Tracker — Historique des décisions

*Journal chronologique des choix structurants et de leur raison d'être. Objectif : ne jamais perdre le "pourquoi" derrière une fonctionnalité. À compléter à chaque évolution notable.*

## Socle applicatif (avant juillet 2026)
- Choix d'une architecture PWA + Dashboard + Worker Cloudflare + SharePoint : zéro coût d'hébergement, propriété totale du code et des données par Espace Soleil.
- Filtres site (Réunion/Mayotte) et badges drapeaux déployés sur toutes les rubriques d'inventaire.
- Authentification dashboard : passage de mots de passe en clair à un hachage PBKDF2/SHA-256 (100k itérations, sel par utilisateur).
- Création du super-admin permanent AIWI, protégé contre toute rétrogradation accidentelle.
- Sécurisation du secret Azure : passage en variable d'environnement Cloudflare chiffrée (au lieu d'être en dur dans le code).
- Filtrage des catégories visibles par rôle/compte comptable, avec l'exception des 19 étiqueteuses BROTHER mal affectées comptablement à l'origine.
- Ajout du rôle Encadrement (RH / services support), view-only, initialement oublié du menu de rôles assignables — corrigé.
- Fonction "sortir un employé" (passage inactif via `field_2`, historique conservé) — bug initial car le code visait à tort une colonne `Actif` inexistante sur la liste Employés ; corrigé.
- Flux de validation des retours dépôt par "garants" (Admin, Logistique, Logistique_Mayotte), avec distinction déclarant terrain / validateur dans l'affichage ("Donneur / Validé par").
- Refactoring des droits : passage de 5 tableaux de rôles séparés à une table centrale unique `ROLE_CAPS`.

## Veille concurrentielle (juillet 2026)
- La direction a demandé d'évaluer des alternatives : **Organilog** (GMAO généraliste, 19-59 €/utilisateur/mois) et **Hector** (gestion d'actifs, dès 19,99 €/mois facturé au nombre d'actifs).
- Constat : Immo Tracker est très économique et sur-mesure, mais avait 3 écarts fonctionnels face à Hector : pas de calcul d'amortissement/VNC, pas d'export comptable, module maintenance incomplet.
- **Décision** : combler ces 3 écarts avant de présenter tout argumentaire à la direction (ne pas plaider une position qu'on n'a pas encore rendue solide).

## Axe 1 — Amortissement & VNC
- V1 : durée par catégorie (table de correspondance compte → durée), avec possibilité de saisie manuelle par immo en cas d'exception, priorité saisie > catégorie > défaut 5 ans.
- Ajout de la colonne SharePoint `Duree_Amortissement`.
- **Révision (juillet 2026)** : William a transmis un barème officiel basé sur le **compte d'amortissement** (et non plus le compte d'immobilisation ni une saisie manuelle). Décision : durée **100% automatique**, plus aucune saisie manuelle. La colonne `Duree_Amortissement` et la fonction `modifierDureeAmort` ont été retirées de la logique (colonne SharePoint conservée mais inerte, peut être supprimée).
- VNC affichée sur chaque fiche immo + panorama consolidé "Valeur du parc" par site dans l'onglet Analyses.

## Axe 2 — Export comptable
- Export CSV 18 colonnes, format Excel français, réservé aux admins, accessible depuis Analyses.
- Objectif explicite : permettre le rapprochement avec EBP et détecter les incohérences (ex. véhicules mal localisés entre sites).

## Axe 3 — Maintenance préventive
- Remplacement de l'ancien onglet Maintenance (qui dépendait de colonnes SharePoint jamais renseignées) par un panneau **entièrement calculé** à partir des données déjà présentes : garanties estimées (2 ans après mise en service), immos à entretenir (état dégradé ou pannes récurrentes), immos dormantes.
- Règle métier précisée par William : une immo sans aucun mouvement enregistré n'est jamais comptée comme dormante, quelle que soit son ancienneté.

## Migration des données comptables EBP → SharePoint (juillet 2026)
- Constat : SharePoint ne contenait pas encore date de mise en service, comptes amortissement/dotation — ces données existaient uniquement dans l'export comptable EBP (`Export_immos_030726_avec_sites.xls`, 1167 immos, dont 1023 actives correspondant exactement aux 1023 immos SharePoint).
- Le fichier "avec_sites" corrige au passage la localisation Réunion/Mayotte de plusieurs immos (notamment des véhicules mal localisés depuis longtemps).
- 4 colonnes SharePoint créées : `Date_Mise_Service`, `Compte_Immobilisation`, `Compte_Amortissement`, `Compte_Dotation`.
- Outil de migration one-shot dans le dashboard (`enrichirImmosEBP()`), écriture par lots de 20 via Graph `$batch`.
- **Incident de déploiement** : confusion entre `immos.json` (tableau, catalogue courant) et `immos_full.json` (objet, migration), plus un problème de casse dans le nom de fichier uploadé sur GitHub → 404 et affichage cassé (codes affichés au lieu des libellés). Résolu ; leçon retenue dans `01_ARCHITECTURE_TECHNIQUE.md`.
- Migration exécutée avec succès : les 1023 immos actives enrichies, 0 orpheline.

## Affinage du filtre "immo d'activité" (juillet 2026)
- Un premier essai de filtre appliqué à tort sur l'onglet "Au dépôt" a cassé l'affichage ("8 immos" au lieu de ~800) à cause d'une lecture de compte comptable pas encore fiable (colonnes SharePoint pas encore migrées à ce stade). Corrigé en priorisant la lecture depuis `immos.json` (toujours fiable) plutôt que `immoMeta` (SharePoint, alors incomplet).
- Clarification de la demande réelle de William : exclure des **statistiques d'Analyses** (pas de l'inventaire "Au dépôt" qui doit tout montrer) les immos que les conducteurs de travaux ne voient pas normalement, en réutilisant exactement la même logique de comptes administratifs que la PWA.
- Le filtre a finalement été appliqué aux deux endroits une fois la cause du bug comprise : "Au dépôt" (avec bouton pour révéler les immos administratives) et toutes les stats d'Analyses (top mouvementées, pannes, taux d'utilisation par catégorie, coûts réparation).

## Affichage des données comptables sur les fiches (juillet 2026)
- Après la migration EBP réussie, ajout d'un bloc "🧾 Données comptables" sur les fiches immo (date mise en service, 3 comptes, N° série), visible uniquement par Admin, Gestionnaire Dépôt RUN et Encadrement (`peutVoirCompta()`).

## Documentation et gouvernance (juillet 2026)
- Rédaction de `Immo_Tracker_Documentation.docx` (documentation de pérennité, destinée à un repreneur potentiel de la solution).
- Rédaction de `Note_Synthese_Immo_Tracker.docx` (note comparative pour la direction, avec tarifs Organilog/Hector vérifiés par recherche web en juillet 2026).
- Passage en gestion "mode projet" avec base de connaissance structurée (ce jeu de documents) pour sécuriser la continuité malgré la dépendance à une seule personne.

## Comment utiliser ce journal
Ajouter une entrée à chaque décision structurante : la date approximative, ce qui a été décidé, et surtout **pourquoi** (le contexte qui a motivé le choix). Ne pas y mettre le détail technique (qui vit dans le code et les autres documents) mais le raisonnement métier.


---

# Immo Tracker — Roadmap des évolutions futures

*Idées évoquées avec William en juillet 2026, non développées à ce stade. Ce document sert de mémoire pour ne pas perdre ces pistes et pour cadrer leur développement futur. Aucune de ces évolutions n'est un engagement ferme — à prioriser selon les besoins réels.*

## Proposée par William : module de gestion des temps

**Besoin exprimé :** report d'heures des collaborateurs (terrain ou ailleurs), saisie des congés, notes des managers sur les heures/travaux effectués.

**Analyse et mise en garde :** ce module change le périmètre de l'application (on sort du suivi d'immobilisations pour entrer en gestion des temps / RH). Deux angles distincts à ne pas confondre :

1. **Pré-pointage opérationnel par chantier** (recommandé) : un CT ou ouvrier déclare "tant d'heures sur tel chantier, telle date", pour ventiler les coûts et remonter une donnée exploitable. C'est un ajout naturel — l'infrastructure (employés, chantiers, rôles, auth, PWA mobile) s'y prête directement. Une liste SharePoint `Heures` (Code_Employe, Code_Chantier, Date, Nb_Heures, Note_Manager) suffirait techniquement.
2. **Gestion RH des congés/compteurs légaux** (à éviter en l'état) : implique des obligations légales (droit du travail), un risque d'erreur à conséquence salariale, et un possible doublon avec un outil paie déjà existant chez Espace Soleil (à vérifier — Silae, PayFit, module EBP Paie ?). Ne pas construire de "faux outil RH" en interne sans validation de la direction / du service paie.

**Recommandation :** si ce module est lancé, le cadrer strictement comme "suivi opérationnel des heures par chantier" (donnée de gestion, pas de paie), avec validation manager et export — pas comme un système de gestion des congés légaux. Prévoir une phase de cadrage dédiée avant tout développement : qui saisit, qui valide, quel export, quelle articulation avec l'outil paie existant.

## Proposées par l'assistant

### A. Inventaire physique annuel assisté (priorité suggérée : haute)
Mode "campagne d'inventaire" : lancement d'une campagne, chaque gestionnaire scanne les QR codes du matériel physiquement présent, l'application calcule l'écart entre le théorique (SharePoint) et le constaté (scans), et liste les manquants / mal localisés / retrouvés. Répond directement au problème vécu par William (véhicules mal localisés pendant un an entre Réunion et Mayotte). Argument fort en interne : réponse à l'obligation comptable d'inventaire physique périodique.

### B. Photos et constat d'état en image
À la réception ou au retour d'un matériel, possibilité de joindre une photo (stockage SharePoint). Utile en particulier pour les retours en mauvais état validés par un garant : preuve visuelle qui évite les litiges "c'était déjà abîmé avant". Techniquement : accès à l'appareil photo du navigateur mobile + stockage lié au mouvement.

### C. Coûts de réparation structurés + seuil de réforme
Actuellement le dashboard affiche un ratio (coût réparations / valeur d'achat) de façon informelle. Évolution : saisie structurée du coût à chaque réparation, et déclenchement d'une alerte quand le cumul dépasse un seuil (ex. 60% de la VNC) → proposition automatique de mise en cession/réforme. Complète naturellement le module maintenance préventive (axe 3) et donne un chiffre d'arbitrage réparer/remplacer directement exploitable par la direction.

### D. Demandes de matériel planifiées à l'avance
Un CT peut demander du matériel pour une date future (ex. "2 perceuses + 1 échafaudage semaine 32 sur tel chantier"), au lieu du mode réactif actuel (réservation immédiate uniquement). Le gestionnaire dépôt voit un planning de demandes à préparer. Fait passer l'app du suivi réactif à la planification logistique — cohérent avec le métier de William (achats/logistique).

### E. Interface simplifiée pour Mayotte
Constat : le référent matériel à Mayotte (Logistique_Mayotte) est peu à l'aise avec l'informatique (imprime des documents, envoie des photos par email plutôt que d'utiliser l'app). Évolution : une vue ultra-simplifiée à 3 actions principales ("Je reçois", "Je rends", "Signaler panne"), sans les fonctions avancées, pour ce profil spécifiquement. Petit effort de développement, gain d'adoption potentiellement important sur le terrain à Mayotte.

### F. Digest de notifications hebdomadaire
Aujourd'hui : un email par mouvement (flux Power Automate existant). Évolution : ajout d'un digest hebdomadaire automatique récapitulant les points nécessitant une action (transferts en attente depuis plus de 7 jours, retours à valider, garanties expirant dans le mois). Évite que des actions en attente restent "oubliées" dans le flux continu d'emails individuels.

## Priorisation suggérée (à valider avec William)

1. **A — Inventaire physique** : consolide la fiabilité de toute la base de données, sur laquelle s'appuient déjà l'amortissement, l'export comptable et la maintenance préventive.
2. **Module temps chantier** (cadré comme suivi opérationnel, pas RH) : valeur métier forte pour le pilotage des coûts de chantier.
3. **B — Photos / constat d'état** : effort modéré, réduit les litiges au quotidien.
4. **C — Coûts de réparation + seuil de réforme** : extension naturelle de l'axe 3 déjà en place.
5. **D, E, F** : à considérer selon les retours d'usage une fois les priorités ci-dessus en place.

## Note pour toute reprise de ce document

Avant de développer l'une de ces pistes, revalider avec William : le besoin a-t-il changé, une contrainte nouvelle est-elle apparue (ex. outil RH externe déjà choisi), le périmètre reste-t-il pertinent ? Ce document est une mémoire d'intentions, pas un cahier des charges figé.


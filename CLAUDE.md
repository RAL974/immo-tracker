# Immo Tracker — Contexte projet (fichier de référence automatique)

*Ce fichier est lu automatiquement par Claude Code à l'ouverture du dépôt. Il regroupe les 6 documents de connaissance du projet. Ne pas le renommer ni le déplacer hors de la racine du dépôt.*

---


---

# Immo Tracker — Contexte du projet

*Document de référence à charger en connaissance de projet. Dernière mise à jour : juillet 2026.*

## Qui, quoi, pourquoi

**Porteur du projet :** William, Responsable Achats & Logistique chez Electricité Services Réunion (entreprise d'électricité basée à La Réunion, opérant aussi à Mayotte). William est autodidacte en développement (Python, VS Code, GitHub, Cloudflare, SharePoint, Power Automate) et développe/maintient seul cette solution.

**Ce qu'est Immo Tracker :** une application de suivi des immobilisations et du parc matériel (outillage, matériel de chantier, véhicules, informatique…) pour Electricité Services Réunion, sur les deux territoires La Réunion et Mayotte. Elle remplace un suivi Excel manuel.

**Pourquoi ça existe :** la direction d'Electricité Services Réunion a demandé d'évaluer des alternatives commerciales (Organilog, Hector). Une note de synthèse a comparé les options et conclu à la supériorité économique et fonctionnelle de la solution interne (voir `Note_Synthese_Immo_Tracker.docx`). Le principal risque identifié est la dépendance à une seule personne (« bus factor ») — d'où l'existence de ce projet structuré et de la documentation de pérennité.

## Les deux interfaces

1. **PWA terrain** (`app.js` + `index.html`) : utilisée par les collaborateurs sur le terrain pour scanner, réserver, transférer, retourner du matériel. Mobile-first, fonctionne en mode dégradé.
2. **Dashboard** (`dashboard.html`, fichier autonome) : réservé à l'encadrement. Vue complète du parc (circulation, dépôt, historique, transferts, réservations, maintenance, alertes, analyses) + administration.

## Chiffres clés (juillet 2026)

- **1023 immobilisations actives** suivies, dont **812 liées à l'activité terrain** (211 « administratives » : mobilier, informatique, véhicules, logiciels, financières)
- **~97 collaborateurs** référencés
- **Coût d'hébergement : ≈ 0 €** (GitHub Pages + Cloudflare Workers gratuits + Microsoft 365 déjà en place chez Electricité Services Réunion)
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
- Coûts de réparation structurés + seuil de réforme réglable (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Worker Cloudflare (`worker.js`) désormais commité et déployé automatiquement via Git (août 2026, voir `01_ARCHITECTURE_TECHNIQUE.md`)
- Campagne d'inventaire de stock d'articles/consommables (août 2026, distinct de l'inventaire des immobilisations — voir `04_HISTORIQUE_DECISIONS.md`)
- Autorisation côté serveur des actions sensibles du Worker + tests automatisés + garde-fous avant push (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Module Matériel IT — téléphones, puis ordinateurs — hors circuit immobilisations (août 2026, code livré, **en attente de la création des 2 listes SharePoint par William** avant mise en service, voir `04_HISTORIQUE_DECISIONS.md`)
- Seuils d'alerte stock EPI + Outillage, avec suggestion de commande (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Campagne d'inventaire physique des immobilisations par scan QR — roadmap item A1 (août 2026, listes SharePoint créées et fonctionnalité en service, voir `04_HISTORIQUE_DECISIONS.md`)
- Recherche globale dashboard, raccourci clavier `/` (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Audit et durcissement de sécurité — limitation de débit sur la connexion, en-têtes CORS/sécurité resserrés, scrubbing PII Sentry, secrets retirés du dépôt public (août 2026, voir `SECURITE_ETAT.md` et `04_HISTORIQUE_DECISIONS.md`)

🔜 **Évoquées pour la suite** (voir `05_ROADMAP_EVOLUTIONS_FUTURES.md`) :
- Module de report d'heures / temps chantier
- Photos et constat d'état en image
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
| PWA terrain | `app.js`, `index.html`, `sw.js` (ajouté août 2026, coquille hors-ligne) | GitHub Pages | https://ral974.github.io/immo-tracker/ |
| Dashboard | `dashboard.html` (autonome HTML+CSS+JS) | GitHub Pages | https://ral974.github.io/immo-tracker/dashboard.html |
| Worker (proxy sécurisé) | `worker.js` + `wrangler.toml` (dans le dépôt depuis août 2026, voir plus bas) | Cloudflare Workers | https://immo-proxy.ral-85d.workers.dev/ |
| Catalogue immos (léger) | `immos.json` — **tableau** `[...]` de 1023 immos | GitHub Pages (racine) | .../immos.json |
| Catalogue immos (complet, migration) | `immos_full.json` — **objet** `{...}` de 1167 immos | GitHub Pages (racine) | .../immos_full.json |
| Base de données | Listes SharePoint | Microsoft 365 Electricité Services Réunion | espacesoleil97.sharepoint.com/sites/Logistique-Immos |
| Authentification API | App Azure AD "Immo Tracker" | Azure / Entra ID | — |
| Notifications | Flux "Notification_Mouvement_Immo" | Power Automate | — |
| Observabilité (erreurs JS, ajouté août 2026) | SDK chargé via CDN dans `index.html`/`dashboard.html`, `environment` distinct `pwa`/`dashboard` | Sentry (compte gratuit de William) | sentry.io — DSN dans le code (pas un secret) |
| Génération PDF locale (ajouté août 2026) | `html2canvas` + `jsPDF` chargés via CDN dans `dashboard.html` (même logique CDN que Chart.js/SheetJS/Sentry) — rasterisent le gabarit HTML des fiches EPI hors-écran pour produire un vrai fichier PDF, écrit directement sur le disque via la File System Access API du navigateur (`showDirectoryPicker`, Chrome/Edge uniquement) | Aucun (librairies statiques CDN) | — |
| Lecture de scans PDF / OCR (ajouté août 2026) | `pdf.js` (rendu de la 1ère page d'un PDF scanné en image, utilisé par tous les flux d'émargement EPI/Outillage) + `Tesseract.js` (OCR client-side, uniquement pour l'import de scans en lot EPI) chargés via CDN, même logique zéro-backend | Aucun (librairies statiques CDN) | — |

⚠️ **`immos.json` et `immos_full.json` ont des structures différentes** (tableau vs objet) et des usages différents (catalogue courant vs migration EBP one-shot). Ne jamais les confondre au déploiement — un mauvais fichier casse silencieusement l'affichage des libellés/catégories dans le dashboard.

## Identifiants Azure (non sensibles)

- Tenant ID : `c7875e38-b2b0-4c10-a8c5-687c5a214e44`
- Client ID (app) : `3a901471-86c0-4fc7-8d37-319ead2c4b88`
- SITE_ID Graph : `espacesoleil97.sharepoint.com,4157ffef-a5f6-4e7e-8a19-4f6ab57d7128,d15dad00-7bed-4e78-bb2f-d0156e6e49a7`
- Endpoint Graph listes : `https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists`

Le **secret client** (sensible) est stocké chiffré dans les variables Cloudflare du Worker (`CLIENT_SECRET_ENV`), jamais dans le code. Procédure de renouvellement (tous les ~24 mois) détaillée dans `Immo_Tracker_Documentation.docx` §6.2.

⚠️ **`SESSION_SECRET_ENV`** (ajoutée août 2026, variable Cloudflare distincte de `CLIENT_SECRET_ENV`) : signe les jetons de session du dashboard, vérifiés côté Worker avant toute action sensible (voir `03_REGLES_METIER_ET_ROLES.md` § Autorisation côté serveur). **À ajouter par William dans Cloudflare (Settings → Variables and Secrets, même écran que `CLIENT_SECRET_ENV`)** — n'importe quelle valeur aléatoire suffisamment longue (ex. 32+ caractères) convient, aucune contrainte de format. Tant qu'elle est absente, le dashboard reste utilisable en lecture mais les actions protégées échouent explicitement (`session_secret_manquant`) plutôt que de rester ouvertes sans contrôle.

## Procédures de déploiement

### Fichiers web (PWA, Dashboard, JSON)
1. Dépôt GitHub `RAL974/immo-tracker`, tous les fichiers **à la racine** (aucun sous-dossier à créer).
2. Modifier via l'éditeur GitHub (crayon) ou **Add file → Upload files** pour un nouveau fichier.
3. **Commit changes** sur la branche `main` → publication automatique en 1-2 min.
4. **Vérifier après coup** en ouvrant l'URL du fichier dans un navigateur.

### Worker Cloudflare
**Depuis août 2026 : déploiement automatique via Git.** William a connecté le Worker `immo-proxy` au dépôt `RAL974/immo-tracker` (Cloudflare → Workers → immo-proxy → Settings → Build → Git repository). Désormais :
1. `worker.js` est commité normalement dans le dépôt (racine), avec un fichier `wrangler.toml` (`name = "immo-proxy"`, `main = "worker.js"`) obligatoire pour que le build sache quoi déployer.
2. Un `git push` sur `main` déclenche automatiquement `npx wrangler deploy` côté Cloudflare — plus besoin de copier-coller manuellement le code dans l'éditeur Cloudflare.
3. Le **secret Azure reste protégé** : `CLIENT_SECRET_ENV` est une variable d'environnement Cloudflare (Settings → Variables and Secrets), jamais dans le code ni dans le dépôt Git. Un déploiement Git ne touche pas à cette configuration.
4. **Vérification après un push** : onglet *Deployments* du Worker dans Cloudflare (statut du build), puis tester une lecture simple ex. `?debug_mouvements=1` dans un navigateur pour confirmer que l'API répond toujours.

⚠️ **Avant août 2026**, `worker.js` n'était jamais commité (l'app GitHub "Claude" n'avait pas les droits d'écriture nécessaires pour un dépôt gérant un secret, et le Worker n'était pas encore connecté en Git) : toute modification se faisait par copier-coller manuel dans l'éditeur Cloudflare. Cette contrainte n'existe plus, mais rester prudent : un déploiement Worker cassé coupe l'API pour tous les utilisateurs immédiatement (contrairement à un bug PWA/Dashboard, sans risque et facile à corriger).

## Pièges connus (vécus, à éviter)

| Symptôme | Cause | Solution |
|---|---|---|
| Erreur "Multiple artifacts named github-pages" | Ré-exécution d'un job de publication | Ne **jamais** utiliser "Re-run jobs" ; faire un nouveau petit commit |
| Email "Deploy to GitHub Pages: All jobs have failed", étape `deploy-pages` bloquée ~10 min avant d'échouer (août 2026) | `.github/workflows/deploy.yml` (déploiement Pages par Actions, préexistant, jamais commité auparavant) n'avait pas de bloc `concurrency` — recommandation officielle GitHub absente, un déploiement peut rester bloqué en attente d'un autre. Le contenu de l'artefact s'était uploadé sans problème (seule l'étape finale de publication a expiré) : le site restait sur la version précédente, aucune coupure de service. | Ajout de `concurrency: {group: "pages", cancel-in-progress: false}` + `timeout-minutes: 5` sur le job — même remède de fond que "Multiple artifacts" ci-dessus (un seul déploiement à la fois), plus un échec rapide et net si ça se reproduit plutôt qu'un blocage silencieux de 10 minutes. Vérifiable en lecture seule via l'API publique `api.github.com/repos/RAL974/immo-tracker/actions/runs` (pas besoin d'être connecté à GitHub pour diagnostiquer un run public). |
| `404` sur un fichier JSON alors qu'il a été uploadé | Nom de fichier avec une majuscule (GitHub Pages est sensible à la casse) ou fichier dans un sous-dossier | Vérifier que le nom est strictement en minuscules et à la racine |
| Dashboard cassé (codes affichés à la place des libellés, catégories vides) | `immos.json` écrasé/absent, ou confondu avec `immos_full.json` (mauvaise structure) | Vérifier `immos.json` commence par `[`, `immos_full.json` par `{` |
| `tb-depot null` / panneau vide après clic sur un onglet | Ancien bug : le code détruisait le HTML interne du panneau avant que les données soient prêtes | Corrigé : `goTab` ne détruit plus la structure des panneaux |
| Catégories dupliquées ×5 dans un menu déroulant | `appendChild` répété sans vider le `<select>` au préalable | Toujours réinitialiser `innerHTML` avant de repeupler une liste |
| `Field 'X' is not recognized` à l'écriture SharePoint | Colonne inexistante dans la liste SharePoint, **ou renommée** : le nom interne peut différer du nom affiché après un renommage dans l'interface | Vérifier la liste des colonnes réelles avant tout ajout de champ (voir `02_MODELE_DONNEES.md`) ; en cas de doute sur le nom interne, interroger `?debug_inventaire_columns=1` (ou l'équivalent Graph `/lists/{liste}/columns`) plutôt que de se fier au nom affiché |
| Erreur silencieuse sur écriture liste Employés | La liste **Employes n'a pas de colonne `Actif`** ; le statut est dans `field_2` | Toujours utiliser `field_2` pour le statut actif/inactif d'un employé |
| OCR (Tesseract.js) qui se dégrade après quelques fichiers en import de lot, alors que les documents sont identiques/propres | `Tesseract.recognize()` appelé à chaque fichier crée et détruit un worker WASM à chaque appel — anti-pattern documenté par Tesseract.js lui-même | Créer **un seul** `Tesseract.createWorker(...)` avant la boucle, le réutiliser pour tous les fichiers (`worker.recognize(...)` par fichier), `worker.terminate()` une seule fois à la fin |

## Outils de diagnostic

Adresses à ouvrir directement dans un navigateur (Worker) :
```
?debug_immos=1
?debug_employes=1
?debug_mouvements=1
?next_code_im=1
```

## Anomalies bénignes (sans conséquence)
- `favicon.ico 404` — icône d'onglet absente, sans impact (atténué depuis août 2026 par l'ajout d'un `<link rel="icon">` explicite dans `index.html`/`dashboard.html`, qui évite la sonde automatique du navigateur dans la plupart des cas).
- `ERR_NAME_NOT_RESOLVED` — problème réseau/DNS côté poste client, pas un défaut applicatif.

## Contrainte navigateur : génération PDF locale des dotations EPI (ajouté août 2026)
Le bouton "📁 Générer les PDF" (dashboard → EPI → Dotations) écrit les PDF directement dans un dossier local via la File System Access API (`showDirectoryPicker`). **Fonctionne uniquement sur Chrome et Edge** (pas Firefox/Safari) — message d'erreur explicite si l'API est absente. Le dossier n'est choisi qu'une fois : le "handle" est persisté dans IndexedDB (`immo_tracker_fs`, base du navigateur), donc pas de re-sélection à chaque session — sauf changement de poste/navigateur ou vidage du cache, où William devra re-choisir le dossier une fois (bouton "Changer de dossier PDF" prévu pour ce cas).

## Environnement de développement (côté Claude / assistant)

- Validation systématique avant livraison : `node --check worker.js`, `node --check app.js` ; pour `dashboard.html`, extraire les balises `<script>` vers un fichier temporaire puis `node --check` (formalisé depuis août 2026 par `scripts/check-dashboard.js`, voir ci-dessous).
- **Tests automatisés (ajouté août 2026)** : `npm test` (Node.js natif, `node --test`, zéro dépendance à installer) — voir `tests/` dans le dépôt et le `README.md`. Couvre la logique des jetons de session (signature/vérification HMAC, expiration, falsification), la cohérence entre les actions protégées côté Worker et la liste `GATED_ACTIONS` côté dashboard (anti-régression sur l'oubli d'un des deux côtés), et un test d'intégration bout-en-bout de `handleRequest()` avec Microsoft Graph entièrement mocké (aucun appel réseau réel, zéro risque sur les données). `npm run check` reprend les vérifications de syntaxe existantes (`node --check` sur les 3 fichiers). `npm run verify` = les deux. Un hook `pre-push` (`.githooks/`, installé via `git config core.hooksPath .githooks`) bloque le push local si `npm run verify` échoue ; un workflow GitHub Actions (`.github/workflows/tests.yml`) relance la même vérification à chaque push sur `main` en filet de sécurité (n'empêche pas le déploiement, qui reste indépendant — seulement une alerte rapide).
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
| `FDS_URL` | Texte/lien | Lien vers fiche/document. Deux formats possibles (août 2026) : un lien de partage SharePoint classique saisi manuellement (`https://...sharepoint.com/...`), ou un repère `FDS:CODE_IM/nom_fichier.ext` généré par le bouton "➕ Ajouter FDS" du dashboard (fichier stocké dans `/FDS_Immos/{code}/{fichier}` sur le drive, servi via le proxy `?fds=code`). Les deux formats sont lus indifféremment par `getFdsUrl()` côté dashboard. |

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
| `Type_Mouvement` | `Transfert` / `Retour` / `Panne` / `Réparation` / `Archivage` / `Entretien` (ajouté août 2026, voir ci-dessous) |
| `Code_Chantier` | Destination. Pour un transfert classique : code du receveur. Pour un retour **validé par un garant** : format spécial `DEPOT|code_validateur|nom_validateur` |
| `Commentaire` | Utilisé pour stocker le nom du déclarant terrain dans le cas d'un retour validé |
| `Etat` | État constaté à ce mouvement |
| `Note` | Commentaire libre + traçabilité automatique (ex. `[retour validé par COUTAREL Nicolas]`) |
| `Cout_Reparation` | Nombre (ajoutée août 2026) — coût structuré d'une réparation/entretien. Source de vérité pour les calculs de ratio (voir `03_REGLES_METIER_ET_ROLES.md`) ; le dashboard se replie sur l'ancien format texte (`##COUT:X##` dans `Note`) pour les mouvements créés avant l'ajout de cette colonne. |
| `Horodatage` | Date et heure ISO |

⚠️ **`Entretien` vs `Réparation`** : un mouvement `Réparation` (créé lors de la résolution d'une panne) signifie que l'immo **revient au dépôt** — il est traité comme un changement de possession dans le calcul de localisation. Un mouvement `Entretien` (créé via le bouton "🔧 Enregistrer réparation", indépendant d'une panne déclarée — entretien préventif, réparation ponctuelle) **n'affecte pas** la localisation courante de l'immo, au même titre que `Panne`/`Suivi_Panne`. Les deux types comptent dans le cumul de coûts utilisé pour le seuil de réforme.

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

## Liste `Campagnes_Inventaire` (ajoutée août 2026)

*Campagnes de comptage physique du **stock d'articles/consommables** (visserie, câbles, appareillage électrique…) — à ne pas confondre avec l'inventaire des immobilisations (QR codes), projet séparé non encore validé par la direction.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Nom de la campagne (ex. `Inventaire annuel 2026`) |
| `Date_Debut` | Date | |
| `Date_Fin` | Date | Optionnelle, indicative |
| `Statut` | Texte | `En cours` / `Clôturée` |
| `Cree_Par` | Texte | Code employé |
| `Cloture_Par` | Texte | Code employé (vide tant qu'en cours) |
| `Date_Cloture` | Date/heure | ISO |

## Liste `Lignes_Inventaire` (ajoutée août 2026)

*Une ligne = une référence comptée à un endroit donné, pendant une campagne. Une même référence peut apparaître plusieurs fois dans une campagne (endroits différents).*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Nom de la campagne (référence texte simple, pas de colonne Lookup SharePoint — cohérent avec le reste du modèle) |
| `Zone` | Texte | **Obligatoire à la saisie.** Emplacement physique dans le dépôt (n° de rack, lettre d'étage — ex. `30E`, `Atelier`, `Carton`). C'est l'axe de comptage principal : l'entreprise compte son stock par zone de dépôt, pas par chantier (voir `03_REGLES_METIER_ET_ROLES.md`) |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Chantier` | Texte | Optionnel — information complémentaire quand on sait à quel chantier l'article est destiné, sans remplacer la zone |
| `Fabricant` | Texte | Tel que saisi par l'opérateur, ou tel que lu automatiquement sur le code-barres scanné (voir plus bas) |
| `Reference` | Texte | Référence article — soit saisie manuellement, soit remplie automatiquement par le code-barres fabricant (EAN) scanné à la caméra (aucun catalogue de prix rattaché) |
| `Designation` | Texte | Désignation libre |
| `Quantite` | Nombre | |
| `Chute_Cable` | Texte | `Oui` / vide — règle métier : un câble dont le métrage n'est pas un multiple des bobines standard (50/100/250/500/1000m, 3000/4000m pour RJ45 Telenco) est par définition une chute |
| `Observations` | Texte | Libre, optionnel |
| `Code_Employe` | Texte | Auteur de la ligne |
| `Horodatage` | Date/heure | ISO |

⚠️ Aucune valorisation (prix, valeur) n'est stockée : la base de prix utilisée lors du comptage de décembre 2025 a trop évolué depuis pour être fiable. Voir `04_HISTORIQUE_DECISIONS.md` pour le raisonnement complet.

⚠️ Le dashboard **ne compare pas** une campagne à la précédente (pas d'écart calculé) : chaque campagne restitue simplement l'état du stock à l'instant T (regroupé par Zone + Site + Référence). Pour une entreprise du bâtiment, il n'y a pas de stock minimum fixe ni de continuité garantie entre deux campagnes (chantiers qui se terminent, nature des chantiers qui change) — comparer à décembre 2025 n'a pas de sens métier. Voir `04_HISTORIQUE_DECISIONS.md`.

## Liste `Campagnes_Inventaire_Immos` (ajoutée août 2026)

*Campagnes de comptage physique des **immobilisations elles-mêmes** par scan QR (roadmap item A1) — à ne pas confondre avec `Campagnes_Inventaire`/`Lignes_Inventaire` ci-dessus, qui portent sur le stock d'articles/consommables. Deux sujets, deux paires de listes, deux onglets dashboard distincts. Mêmes noms de colonnes que `Campagnes_Inventaire` par cohérence (même gabarit de cycle de vie), mais des listes SharePoint physiquement séparées, pour ne jamais mélanger les deux jeux de données.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Nom de la campagne (ex. `Inventaire physique immos 2026`) |
| `Date_Debut` | Date | |
| `Date_Fin` | Date | Optionnelle, indicative |
| `Statut` | Texte | `En cours` / `Clôturée` |
| `Cree_Par` | Texte | Code employé (résolu depuis le jeton de session — `requireAdmin`) |
| `Cloture_Par` | Texte | Code employé (vide tant qu'en cours) |
| `Date_Cloture` | Date/heure | ISO |

## Liste `Scans_Inventaire_Immos` (ajoutée août 2026)

*Une ligne = un événement "immo vue physiquement" pendant une campagne : qui, où, quand. **Ne crée jamais de `Mouvement`** — aucun effet sur le détenteur courant d'une immo (toujours déduit du dernier `Mouvement` réel, ailleurs dans l'app). Le rapport d'écarts se calcule à la lecture, en comparant ces scans à la localisation théorique déjà connue (`immoMeta` côté dashboard), jamais en modifiant les données de possession.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code de l'immo scannée, ex. `IM000123` |
| `Campagne` | Texte | Nom de la campagne (référence texte simple, pas de colonne Lookup — cohérent avec `Lignes_Inventaire`/`Lignes_Dotation_EPI`) |
| `Code_Employe` | Texte | Auteur du scan (reçu depuis le corps de la requête, comme `reserver`/`transfert` — cette action est **partagée avec la PWA terrain**, profils admin uniquement mais sans mot de passe, donc pas de jeton de session possible ici, voir `03_REGLES_METIER_ET_ROLES.md`) |
| `Nom_Employe` | Texte | |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Horodatage` | Date/heure | ISO |

⚠️ Une même immo peut être scannée plusieurs fois pendant une campagne (erreur, contrôle redondant) : toutes les occurrences sont conservées, le rapport d'écarts ne retient que le scan le plus récent par immo pour le détail affiché, mais compte chaque scan dans le total brut.

## Module EPI — extension de la liste `Employes` (ajoutée août 2026)

6 nouvelles colonnes, permettant de générer automatiquement les fiches de dotation EPI :

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Affectation_EPI` | Texte | `C` (Chantier/Travaux Neufs) / `M` (Maintenance) / `Z` (Conducteur de Travaux) / `A` (Atelier). Vide = non concerné (personnel bureau). Pilote la grille de dotation standard (voir `03_REGLES_METIER_ET_ROLES.md`). |
| `Taille_Pantalon` | Texte | Valeur telle que communiquée par le salarié (`M` ou `40`, indifféremment) |
| `Taille_Tshirt` | Texte | Réutilisée aussi pour Polos, T-shirts manches longues, Ensemble pluie (même échelle de taille) |
| `Taille_Veste` | Texte | |
| `Pointure_Chaussures` | Texte | |
| `Taille_Gants` | Texte | |

## Liste `Catalogue_Articles_EPI` (ajoutée août 2026)

*Catalogue des articles EPI par taille, avec stock vivant. Une ligne = une référence commandable pour une taille donnée.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Type d'article (ex. `Pantalon`) — regroupement lisible dans SharePoint |
| `Type_Article` | Texte | Identique à `Title`, utilisé pour les filtres côté Worker |
| `Taille_Salarie` | Texte | Valeur de taille telle qu'elle apparaît sur la fiche salarié (`42`, `M`...) — clé de correspondance |
| `Taille_Affichage` | Texte | Taille normalisée pour affichage (`L`, `42`...) |
| `Reference` | Texte | SKU fournisseur |
| `Designation` | Texte | |
| `Fournisseur` | Texte | |
| `Stock_Actuel` | Nombre | Solde vivant : décrémenté à l'émargement d'une fiche de dotation, incrémenté à la réception d'une commande |
| `Stock_Mini` | Nombre | Ajoutée août 2026 — seuil d'alerte "stock bas" propre à cet article/taille. `0` ou vide = pas de seuil personnalisé : le dashboard applique alors un seuil par défaut (5) pour ne pas casser le comportement déjà en place. Éditable depuis l'onglet EPI → Stock (bouton "🎚️ Seuil"). |

⚠️ La correspondance taille salarié → référence a été importée telle quelle depuis le fichier Excel source (`Liste EPI.xlsx` / onglet "Correspondance tailles articles"), **confirmée exacte par William** malgré des apparences de doublons de référence entre tailles voisines (ex. Pantalon 46 et 48 pointent vers la même référence) — ne pas "corriger" cette table sans revalider avec lui.

Recherche d'un article pour une taille employé donnée : `Type_Article` = X **et** (`Taille_Salarie` = valeur **ou** `Taille_Affichage` = valeur), comparaison insensible à la casse — gère nativement le cas où la taille est communiquée sous forme numérique ou alphabétique, sans normalisation forcée à la saisie.

## Liste `Grille_Dotation_EPI` (ajoutée août 2026)

*Grille de dotation standard par profil — éditable depuis le dashboard (Admin/Logistique), pas figée dans le code.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Affectation (`C`/`M`/`Z`/`A`) |
| `Type_Article` | Texte | Doit correspondre à un `Type_Article` du catalogue |
| `Quantite` | Nombre | Quantité standard remise pour ce profil |

## Liste `Dotations_EPI` (ajoutée août 2026)

*Une fiche = un événement de remise EPI (dotation annuelle, entrée, ou remise ponctuelle).*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code employé, ou identifiant libre pour une remise ponctuelle (ex. `PONCTUEL-CONI-1234567890`) |
| `Type_Dotation` | Texte | `Annuelle` / `Entree` / `Ponctuelle` |
| `Annee_Civile` | Nombre | Renseigné pour Annuelle/Entree — sert à éviter une double génération pour la même année |
| `Nom_Destinataire` | Texte | Nom complet employé, ou texte libre pour une remise ponctuelle (ex. "Équipe de Nicolas CAZAMBO") |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Statut` | Texte | `Generee` (en attente de signature) / `Emargee` (signée, stock décrémenté) |
| `Genere_Par` / `Genere_Le` | Texte / Date-heure | |
| `Emarge_Par` / `Emarge_Le` | Texte / Date-heure | Vides tant que `Statut = Generee` |
| `Photo_Fiche` | Texte | Nom de fichier dans `/Fiches_EPI/{id}/` une fois émargée (même mécanisme que les photos d'immos, dossier dédié) |

## Liste `Lignes_Dotation_EPI` (ajoutée août 2026)

*Détail des articles d'une fiche de dotation.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | ID SharePoint de la fiche `Dotations_EPI` parente (texte, pas de colonne Lookup — cohérent avec `Lignes_Inventaire`) |
| `Type_Article` | Texte | |
| `Taille_Article` | Texte | |
| `Reference_Article` | Texte | |
| `Quantite` | Nombre | |

## Extension de la liste `Employes` — module Prime d'outillage (ajoutée août 2026)

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Service_Outillage` | Texte | `Travaux Neufs` / `Maintenance` / vide (non concerné). **Indépendant de `Affectation_EPI`** : un CT ou un salarié Atelier peut très bien être rattaché à l'un de ces 2 services pour la prime d'outillage sans que ça corresponde à son profil EPI (C/M/Z/A). |

## Liste `Catalogue_Outillage` (ajoutée août 2026)

*Catalogue des outils de la prime d'outillage, avec stock vivant. Une ligne = un outil (pas de déclinaison par taille, contrairement aux EPI).*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Désignation de l'outil |
| `Reference` | Texte | Référence fournisseur |
| `Distributeur` | Texte | |
| `Marque` | Texte | |
| `Prix_Unitaire` | Nombre | Prix final négocié (et non le prix catalogue TTC) |
| `Stock_Actuel` | Nombre | Solde vivant : décrémenté à chaque distribution, incrémenté à chaque réception de commande |
| `Duree_Amortissement_Mois` | Nombre | Durée retenue (12 à 60 mois selon l'article), ajoutée août 2026 — pilote le calcul de la prime annuelle versée en paie de décembre (voir `03_REGLES_METIER_ET_ROLES.md`) |
| `Stock_Mini` | Nombre | Ajoutée août 2026 — seuil d'alerte "stock bas" propre à cet outil. `0` ou vide = pas de seuil personnalisé : le dashboard applique alors un seuil par défaut (3). Éditable depuis l'onglet Prime d'outillage → Stock (bouton "🎚️ Seuil"). |

## Liste `Grille_Outillage` (ajoutée août 2026)

*Kit standard par service — éditable depuis le dashboard.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Service (`Travaux Neufs` / `Maintenance`) |
| `Type_Article` | Texte | Doit correspondre à un `Title` du catalogue |
| `Quantite` | Nombre | Quantité cible du kit standard (quasi toujours 1) |

## Liste `Lignes_Outillage` (ajoutée août 2026)

*État de distribution : une ligne = un outil réellement remis à un employé. Contrairement aux EPI (fiche + lignes séparées avec statut Generee/Emargee), une seule liste plate suffit ici : pas de notion d'année civile, et la distribution est actée directement (pas d'étape intermédiaire "fiche générée en attente"). "Ce qui reste à distribuer" se calcule en soustrayant les lignes déjà reçues de la grille du service de l'employé — les lignes "non reçues" ne sont jamais matérialisées.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code employé |
| `Type_Article` | Texte | Désignation de l'outil (correspond au catalogue) |
| `Date_Remise` | Date/heure | ISO ; vide/approximative pour les lignes importées de l'historique |
| `Emarge_Par` | Texte | Code de qui a enregistré la distribution (vide pour l'import historique) |
| `Photo_Fiche` | Texte | Nom de fichier preuve dans `/Fiches_Outillage/{code}/` (vide pour l'historique — les fiches papier existantes n'ont pas été re-scannées) |
| `Lot_Distribution` | Texte | Identifiant de lot regroupant les lignes distribuées ensemble en une seule action/photo (`MIGRATION` pour l'import historique) |

## Module Matériel IT — téléphones, puis ordinateurs (ajouté août 2026)

*Suivi du parc de téléphones et ordinateurs professionnels, **hors circuit des immobilisations** (ces articles ne sont pas immobilisés comptablement) — voir `04_HISTORIQUE_DECISIONS.md` pour le contexte. Même principe que les immos (détenteur courant dérivé du dernier mouvement), mais sans le workflow panne/réservation, inutile ici : 100% piloté depuis le dashboard, réservé à Admin/Logistique/Logistique_Mayotte (même population que la gestion EPI/Outillage, `peutGererEPI()` réutilisée côté dashboard).*

⚠️ **2 listes SharePoint à créer par William avant mise en service** (étape bloquante, comme pour chaque nouveau module) : `Materiel_IT` et `Mouvements_Materiel_IT`.

### Liste `Materiel_IT`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code interne, ex. `TEL000001` (téléphones) / `PC000001` (ordinateurs, à venir) — préfixe + 6 chiffres, généré automatiquement (`?next_code_materiel_it=<préfixe>`) |
| `Type_Materiel` | Texte | `Téléphone` / `Ordinateur` (extensible) |
| `Marque` | Texte | |
| `Modele` | Texte | |
| `N_Serie` | Texte | N° de série / IMEI |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Statut` | Texte | `En service` / `Hors service` / `Perdu` / `Volé` |
| `Date_Sortie_Service` | Date | Vide si en service |
| `Cout_Mensuel` | Nombre | Coût mensuel de l'abonnement associé (vide si non applicable, ex. ordinateur ou téléphone sans ligne active) |
| `N_Telephone` | Texte | (téléphonie uniquement) |
| `Operateur` | Texte | |
| `N_Carte_SIM` | Texte | |
| `Code_PIN` | Texte | |
| `Code_PUK` | Texte | |
| `Code_RIO` | Texte | |
| `Code_deverouillage` | Texte | ⚠️ Nom interne réel tel que créé par William dans SharePoint (sans le 2e "r", casse différente de "Code_Deverrouillage") — corrigé dans le code après incident de migration, voir `04_HISTORIQUE_DECISIONS.md` |
| `Commentaire` | Texte | Libre |

### Liste `Mouvements_Materiel_IT`

*Historique de détention — une ligne = un changement de détenteur. Le détenteur courant d'un appareil est déduit du mouvement le plus récent (`Horodatage`), exactement comme pour les Mouvements des immos. Un appareil sans aucun mouvement n'a personne d'affecté ("en stock").*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code de l'appareil (ex. `TEL000001`) |
| `Code_Employe` | Texte | Code du détenteur, ou l'une des valeurs spéciales `RESERVE` / `ASTREINTE` / `ALARME` / `SANS AFFECTATION` / `STAGIAIRE` (matériel non affecté à une personne nommée — reprises du fichier de suivi historique) |
| `Nom_Detenteur` | Texte | Nom affiché (nom complet si code employé réel, sinon la valeur spéciale elle-même) |
| `Note` | Texte | Optionnel |
| `Horodatage` | Date/heure | ISO — début de cette détention |

## Lignes téléphoniques (ajouté août 2026)

*Entité **indépendante** du téléphone (`Materiel_IT`) — un employé peut garder sa ligne (numéro/SIM/opérateur) en changeant d'appareil, ou l'inverse. Même principe de détenteur courant dérivé du dernier mouvement, miroir exact du modèle `Materiel_IT`/`Mouvements_Materiel_IT`.*

### Liste `Lignes_Telephoniques`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code interne, ex. `LIG000001` — préfixe fixe `LIG` + 6 chiffres, généré automatiquement (`?next_code_ligne_tel=1`) |
| `N_Telephone` | Texte | |
| `Operateur` | Texte | |
| `N_Carte_SIM` | Texte | |
| `Code_PIN` | Texte | |
| `Code_PUK` | Texte | |
| `Code_RIO` | Texte | |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Statut` | Texte | `Active` / `Résiliée` |
| `Commentaire` | Texte | Libre |

### Liste `Mouvements_Lignes_Telephoniques`

Mêmes colonnes et même principe que `Mouvements_Materiel_IT` (`Title` = code de la ligne, `Code_Employe`, `Nom_Detenteur`, `Note`, `Horodatage`).

⚠️ `Materiel_IT` conserve ses colonnes `N_Telephone`/`Operateur`/etc. telles quelles en base (pas de suppression) mais le dashboard n'écrit plus dedans pour les nouveaux appareils — ces champs sont désormais l'affaire de `Lignes_Telephoniques`. Une migration one-shot (bouton dans l'onglet Lignes) crée une ligne pour chaque téléphone existant ayant déjà un numéro, en reprenant son détenteur actuel comme point de départ de l'historique.

## Recherche globale dashboard (ajoutée août 2026)

Aucun nouveau modèle de données : la recherche du header (voir `03_REGLES_METIER_ET_ROLES.md`) lit exclusivement les structures déjà chargées en mémoire côté dashboard (`im`, `employesList`, `epiCatalogue`, `outilCatalogue`) — aucune colonne SharePoint ni action Worker ajoutée.

## Fichiers JSON associés

- **`immos.json`** (tableau) : catalogue léger utilisé par la PWA et le Dashboard pour les libellés/catégories/comptes en lecture rapide. Généré à partir de SharePoint, redéployé après modifications importantes.
- **`immos_full.json`** (objet, clé = code IM) : catalogue complet utilisé uniquement par l'outil de migration EBP → SharePoint (`enrichirImmosEBP()` dans le dashboard). Contient 1167 immos (1023 actives + 144 sorties), issu de l'export comptable EBP (`Export_immos_030726_avec_sites.xls`).
- **`inventaire_dec2025.json`** (tableau, ajouté août 2026) : ~2417 lignes de comptage brut du stock d'articles de décembre 2025 (zone, site, chantier, fabriquant, référence, désignation, quantité, chute de câble, observations — sans les colonnes de valorisation du fichier Excel d'origine, obsolètes). Utilisé une seule fois par l'outil de migration (`importerInventaireDec2025()` dans le dashboard) pour créer la première campagne de référence dans `Lignes_Inventaire`.
- **`epi_personnel.json`** (tableau, ajouté août 2026) : 73 salariés avec affectation EPI et 5 tailles, issu de `Liste EPI.xlsx` / "Liste Personnel". Utilisé une seule fois par l'outil de migration (`importerDonneesEPI()` dans le dashboard) pour enrichir la liste `Employes`.
- **`epi_catalogue.json`** (tableau, ajouté août 2026) : ~58 lignes du catalogue d'articles EPI par taille (dont les 2 articles Polo "IMPERIUM" et T-shirt manches longues "MOTECARLO LS", initialement sans taille dans le fichier source, complétés en 5 tailles S à XXL chacun), issu de `Liste EPI.xlsx` / "Correspondance tailles articles" + "Liste articles". Stock initial à 0 partout — à alimenter via une réception initiale correspondant au stock physique réel.
- **`epi_grille_dotation.json`** (tableau, ajouté août 2026) : 40 lignes (4 profils C/M/Z/A × ~10 types d'article), déduites des quantités observées dans `Liste EPI.xlsx` / "Liste Personnel" (identiques pour tous les salariés d'un même profil).
- **`outillage_catalogue.json`** (tableau, ajouté août 2026) : ~41 outils avec référence/marque/prix final/stock actuel, issu de `Détail prime d'outillage.xlsx` / "Commande globale". Stock initial calculé (`Total reçu` − quantités déjà distribuées comptées dans les onglets par service), pas remis à 0 comme pour les EPI (donnée fiable disponible dès le départ).
- **`outillage_grille.json`** (tableau, ajouté août 2026) : ~66 lignes (2 services × ~33 outils en moyenne), issues des colonnes quantité cible des onglets "Tx Neufs"/"Maintenance".
- **`outillage_services.json`** (tableau, ajouté août 2026) : ~63 salariés avec leur service outillage, déduit de la colonne dans laquelle leur code apparaît dans le fichier source.
- **`outillage_lignes.json`** (tableau, ajouté août 2026) : ~1895 lignes de distribution historique (une ligne = un outil déjà remis à un employé), issues des matrices 0/1 des onglets "Tx Neufs"/"Maintenance". Utilisés une seule fois par l'outil de migration (`importerDonneesOutillage()` dans le dashboard).
- **`materiel_it_catalogue.json`** (tableau, ajouté août 2026) : 40 téléphones, issu de `1.5.3. Matériel et utilisateurs 2026.05.23.xlsx` (onglet "2"). Coût mensuel (23,22€ HT, tarif plat Free Pro constaté sur facture) appliqué uniquement aux appareils actifs avec une ligne téléphonique FREE en cours.
- **`materiel_it_mouvements.json`** (tableau, ajouté août 2026) : 40 lignes d'historique initial (un mouvement par appareil, détenteur actuel), issues du même fichier. Date de détention = date d'entrée si connue, sinon date du fichier source (23/05/2026) en repli — voir `04_HISTORIQUE_DECISIONS.md` pour la limite assumée de cette approximation. 3 codes détenteurs (`ADWI`, `HOAL`, `VIMA`) non retrouvés dans `Employes` au moment de la migration, importés tels quels — à corriger par William si nécessaire.

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

---

# Immo Tracker — Historique des décisions

*Journal chronologique des choix structurants et de leur raison d'être. Objectif : ne jamais perdre le "pourquoi" derrière une fonctionnalité. À compléter à chaque évolution notable.*

## Socle applicatif (avant juillet 2026)
- Choix d'une architecture PWA + Dashboard + Worker Cloudflare + SharePoint : zéro coût d'hébergement, propriété totale du code et des données par Electricité Services Réunion.
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

## Coûts de réparation structurés & seuil de réforme (août 2026)
- Besoin exprimé par William (repris de `05_ROADMAP_EVOLUTIONS_FUTURES.md`, item C) : le ratio coût réparations / valeur d'achat affiché dans Analyses était calculé en extrayant un montant du texte libre de la `Note` d'un mouvement — fragile, et basé uniquement sur la valeur d'achat (pas la VNC).
- **Décisions prises avec William avant développement** : (1) coût stocké dans une colonne SharePoint dédiée `Cout_Reparation` sur `Mouvements` (une ligne = une réparation datée, donc plusieurs réparations sur la même immo = plusieurs lignes, cumul par simple somme) ; (2) le coût doit pouvoir être saisi non seulement à la résolution d'une panne, mais aussi indépendamment (entretien préventif) → nouveau type de mouvement `Entretien` ; (3) les **deux ratios** (valeur d'achat ET VNC) sont calculés et affichés, pas un seul ; (4) le seuil de déclenchement (60% suggéré) est **réglable** dans le dashboard (40/60/80%), sur le même principe que le seuil de dormance déjà existant.
- Distinction `Réparation` (résolution de panne, l'immo revient au dépôt) vs `Entretien` (coût structuré indépendant, sans effet sur la localisation courante de l'immo) — évite qu'un simple enregistrement de coût d'entretien fasse apparaître à tort une immo comme "revenue au dépôt" alors qu'elle est toujours sur un chantier.
- **Rétrocompatibilité** : les réparations enregistrées avant l'ajout de la colonne `Cout_Reparation` restent comptées, via un repli automatique sur l'ancien format texte (`##COUT:X##` dans `Note`) quand la colonne structurée est vide.
- **Changement d'infrastructure majeur au passage** : William a connecté le Worker Cloudflare `immo-proxy` au dépôt GitHub `RAL974/immo-tracker` (build automatique sur push). Cela lève la contrainte historique qui empêchait de committer `worker.js` (voir `01_ARCHITECTURE_TECHNIQUE.md`) : le fichier est désormais versionné normalement, accompagné d'un `wrangler.toml`. Premier déploiement Git testé et vérifié en lecture (endpoints `?debug_mouvements=1` et `?dashboard=1`) avant validation par William en conditions réelles.
- Bugs corrigés au passage : l'ancienne liste "Candidats au remplacement" ne regardait que les 8 immos aux coûts cumulés les plus élevés (plus les immos en panne), ce qui pouvait faire passer à côté d'une immo à faible valeur d'achat mais à ratio élevé ; élargi à toutes les immos concernées.

## Campagne d'inventaire de stock (articles/consommables — août 2026)
- Repris de la roadmap (`05_ROADMAP_EVOLUTIONS_FUTURES.md`, item A), mais **le besoin initialement décrit était en fait une confusion** : la roadmap parlait de scanner les QR codes des immobilisations, mais William a clarifié que ce chantier (QR codes immos) est un projet **séparé, non encore validé par la direction**. Le vrai besoin exprimé était un inventaire annuel du **stock d'articles/consommables** (visserie, câbles, appareillage électrique…), sans code-barres ni QR existants, et sans aucune liste de référence suivie au quotidien.
- Seul point de départ disponible : l'inventaire manuel mené fin décembre 2025 (fichier Excel `INV 226`, ~2417 lignes de comptage physique, valorisation totale 864 033 € à l'époque). La procédure `LS04V2 - Procédure immobilisations.docx` fournie en référence s'est avérée décrire le circuit des immobilisations (existant), pas ce comptage de stock — les deux sujets ne doivent pas être confondus.
- **Décisions de cadrage prises avec William avant développement** :
  - Portée : outil de **campagne ponctuelle** (pas de suivi de stock continu — rien ne justifiait de tracer chaque sortie/entrée au quotidien).
  - Comptage **manuel uniquement** (pas de code-barres/QR sur les articles) ; **aucune valorisation** dans cette version — seules les quantités sont comparées, car la base de prix historique évolue trop vite pour être fiable en l'état.
  - Périmètre : dépôt/atelier **et** chantiers actifs (le fichier déc. 2025 montrait 1891 lignes en dépôt/atelier vs 527 rattachées à un chantier précis).
  - Les données brutes de décembre 2025 sont importées comme première campagne clôturée, pour permettre un calcul d'écart dès la 2e campagne.
  - Saisie ouverte à un périmètre large : gestionnaires dépôt, CT/RA pour leur propre chantier, **et personnel temporaire d'agence d'intérim** — d'où la création d'un nouveau rôle allégé `Compteur_Inventaire` (voir `03_REGLES_METIER_ET_ROLES.md`).
  - Corrections : auteur ou admin, tant que la campagne est "En cours" ; figée à la clôture (comme un PV d'inventaire signé).
- **Conséquence technique** : comme le personnel temporaire n'a pas de carte BTP imprimée, une option "Saisir mon code manuellement" a été ajoutée à l'écran d'activation de la PWA (`activationManuelle()` dans `app.js`), en plus du scan QR existant.
- Implémentation : 2 nouvelles listes SharePoint (`Campagnes_Inventaire`, `Lignes_Inventaire`), 7 nouvelles actions Worker, nouvel écran PWA ("📋 Campagne d'inventaire"), nouvel onglet dashboard ("📦 Inventaire stock") avec rapport d'écart (Confirmé / Écart quantité / Manquant / Nouveau ou retrouvé) et export CSV.
- **Incident au premier essai d'import** : la migration décembre 2025 s'est terminée sans erreur visible mais avec 0 ligne réellement écrite — SharePoint rejetait le champ `Fabriquant` ("not recognized"). Diagnostiqué via un nouvel endpoint de debug (`?debug_inventaire_columns=1`, sur le même principe que les `debug_*` existants) qui liste les noms internes réels des colonnes. Cause : la colonne avait été recréée sous le nom `Fabricant` (orthographe standard, différente du nom `Fabriquant` initialement spécifié — le fichier Excel d'origine de déc. 2025 avait justement les deux orthographes sur deux colonnes distinctes, source de la confusion). Code et documentation alignés sur `Fabricant`. Leçon retenue : en cas d'erreur "Field 'X' is not recognized", vérifier le nom **interne** de la colonne (peut différer du nom affiché après un renommage), pas seulement le nom visible dans l'interface SharePoint.
- **Affinage du rapport d'écart (août 2026)** : le premier jet plafonnait l'affichage à 300 lignes sans filtre, et fusionnait à tort toutes les lignes sans référence sous une même clé de rapprochement (faussant les quantités comparées). Corrigé : les lignes sans référence sont désormais exclues du rapprochement automatique et listées à part dans une section dédiée ("Sans référence", non classées) ; ajout de filtres combinables (recherche texte, site, statut, "sans désignation uniquement") et d'un sélecteur d'affichage (100/300/1000/Tous) avec bouton de réinitialisation — reproduit à l'identique dans l'export CSV. À cette occasion, un bouton "🔄 Réinitialiser" a aussi été ajouté à tous les autres onglets ayant des filtres (Circulation, Dépôt, Historique, Transferts, Réservations, Documents, Utilisateurs), qui n'en avaient pas jusque-là.
- **Bug de recherche corrigé (août 2026)** : la recherche du rapport d'écart perdait le focus à chaque caractère tapé (un seul caractère s'appliquait à la fois), rendant la recherche inutilisable en pratique. Cause : la fonction de rendu reconstruisait tout le panneau — y compris le champ de recherche lui-même — à chaque frappe (`oninput`), ce qui détruit et recrée le `<input>` et casse le focus. Contrairement aux autres onglets (Circulation, Dépôt…) qui ne redessinent que la zone de résultats, jamais les champs de filtre. Corrigé en séparant la "coquille" (construite une seule fois à l'ouverture d'une campagne) des résultats (recalculés à chaque frappe dans une zone dédiée, sans toucher aux champs de filtre). *Piste initialement explorée par erreur* : une suspicion de corruption d'encodage UTF-8 (accents devenus illisibles côté SharePoint) s'est révélée être un faux positif causé par les propres outils de diagnostic de l'assistant (terminal Windows mal configuré pour l'UTF-8) — les données réelles n'ont jamais été corrompues. Leçon retenue : toujours valider un diagnostic d'encodage avec une méthode de lecture fiable (fichier + décodage explicite) avant de conclure à un bug de données.

## Pivot majeur : état du stock plutôt qu'écart entre campagnes (août 2026)
- **Retour terrain de William après le premier déploiement** : le rapport d'écart (comparaison à la campagne précédente) ne correspond pas au métier. Electricité Services Réunion est une entreprise du bâtiment : pas de stock minimum à tenir, la nature des chantiers varie (tertiaire vs logements neufs), des chantiers se terminent et d'autres démarrent — **il n'y a donc aucun rapport de continuité entre le stock de décembre 2025 et celui d'aujourd'hui**. Comparer les deux n'a pas de sens et produisait un rapport trompeur (tout apparaissait "Manquant" ou "Nouveau" sans que ça ne signifie quoi que ce soit).
- **Décision** : suppression complète de la logique d'écart/comparaison entre campagnes (`calculerEcartInventaire`, statuts Confirmé/Écart quantité/Manquant/Nouveau). Remplacée par un simple **état du stock à l'instant T** : pour la campagne consultée, un tableau regroupé par `(Zone, Site, Référence)` avec les quantités comptées, sans aucune référence à une campagne antérieure. Objectif clarifié par William : savoir ce qui est en stock maintenant, pour pouvoir le valoriser ensuite (en externe, pas dans l'outil).
- **Zone vs Chantier, deux axes différents** : le champ "Lieu" du rapport (qui fusionnait Zone et Chantier en un seul affichage) a été supprimé au profit de deux colonnes distinctes. Clarification de William : la **zone dépôt est obligatoire** (c'est l'unique axe de comptage — "nous nous attachons uniquement à compter le matériel par zone") et correspond à un emplacement physique précis (n° de rack, lettre d'étage) ; le **chantier reste optionnel**, simple information complémentaire quand on sait où l'article ira, pas un second périmètre de comptage indépendant comme envisagé initialement. La clé de regroupement de l'état du stock est donc passée de `(Référence, Site, Chantier ou Zone)` à `(Zone, Site, Référence)`.
- **Ajout du scan de code-barres fabricant** : pour accélérer la saisie sur les grandes marques (Legrand, Hager, Schneider Electric, puis Eurohm, SIB, BLM, Clareo, Courant...), qui ont presque toujours un code-barres (EAN) sur l'emballage. Réutilise le scanner déjà en place dans la PWA pour les immos (`Html5Qrcode`, qui détecte nativement QR ET codes-barres 1D sans configuration supplémentaire) : le code scanné remplit directement le champ Référence. La saisie manuelle reste toujours possible (motif de William : "il n'y a pas toujours la boîte", donc pas toujours de code-barres disponible sur le terrain).
- **Bug corrigé au passage** : "Sans référence" affichait 0 alors que des lignes en étaient dépourvues. Cause : ce compteur était calculé dans le bloc de comparaison à la campagne précédente, qui ne s'affichait donc que pour une campagne ayant une "précédente" — si l'utilisateur consultait une campagne sans précédente (ex. la toute première), ou une campagne vide comparée à une campagne bien remplie, le chiffre affiché ne reflétait pas ce qu'on croyait regarder. Résolu de fait par la suppression de toute la logique de comparaison : "Sans référence" est désormais calculé directement à partir des lignes de la campagne consultée, sans dépendance à une autre campagne.

## Ergonomie de saisie zone par zone (août 2026)
- Retour terrain de William après la mise en place de l'état du stock : le comptage se fait physiquement **zone par zone** (on reste devant un rack/un étage et on scanne/saisit tous les articles qui s'y trouvent avant de passer au suivant), mais le formulaire effaçait la zone après chaque ligne ajoutée — obligeant à la retaper à chaque article, contraire au geste réel sur le terrain.
- **Décision** : le champ Zone n'est plus effacé automatiquement après l'ajout d'une ligne (seuls chantier/fabricant/référence/désignation/quantité/chute de câble/observations le sont) ; il n'est vidé qu'à l'ouverture de l'écran ou via un bouton explicite "🔁 Changer" à côté du champ, pour signaler le passage à la zone suivante. Le focus revient automatiquement sur le champ Référence après l'ajout d'une ligne, pour enchaîner directement sur l'article suivant de la même zone sans re-cliquer.
- La zone reste **obligatoire** à la soumission (contrôle déjà en place, conservé).

## Module EPI — dotation & stock (août 2026)
- Besoin exprimé par William : automatiser la gestion des EPI (équipements de protection individuelle — pantalons, t-shirts, vestes, chaussures, gants, casques...), aujourd'hui gérée via 2 fichiers Excel séparés (`Liste EPI.xlsx` : personnel/tailles/catalogue, `1.3.3.4. EPI - Dotations.xlsx` : calculateur de commande + modèle de fiche papier) et une fiche de dotation remplie/imprimée manuellement, sans stock suivi.
- **Cadrage validé avec William avant développement** (questions posées, réponses retenues) : (1) **stock vivant** par (article, taille), décrémenté à l'émargement d'une fiche et incrémenté à la réception d'une commande — pas un simple suivi de distribution sans compteur ; (2) **grille de dotation standard éditable depuis le dashboard** (pas figée dans le code comme le barème d'amortissement), pour que William puisse l'ajuster lui-même si la politique EPI change ; (3) **fiche générée en HTML imprimable** + bouton "Imprimer / Enregistrer en PDF" via l'impression navigateur, plutôt qu'une librairie PDF externe — zéro nouvelle dépendance ; (4) **remise ponctuelle allégée** (destinataire en texte libre, ex. "Équipe de untel"), distincte du suivi de dotation annuelle individuelle ; (5) **émargement = photo/scan de la fiche signée jointe**, comme les FDS des immobilisations.
- **Analyse des données source** : le fichier `Liste EPI.xlsx` a révélé que les quantités par article dans l'onglet "Liste Personnel" sont en réalité entièrement déterminées par la colonne `Affectation` (C = Chantier/Travaux Neufs, M = Maintenance, Z = Conducteur de Travaux, A = Atelier) — 4 profils fixes, pas une personnalisation individuelle. Ceci a simplifié le modèle : une grille à 4 lignes plutôt qu'une dotation calculée par salarié.
- **Point de vigilance signalé puis levé** : la table de correspondance taille salarié → référence article (onglet "Correspondance tailles articles") présentait des apparences d'incohérence avec le catalogue (ex. taille 40 pointant vers la référence de la taille S, tailles 46 et 48 partageant la même référence). **William a confirmé que cette table est correcte telle quelle** ("mes correspondances sont correctes et valables par rapport aux articles et tailles des gars") — importée sans modification, leçon retenue : ne pas "corriger" des données métier sur la base d'une supposition technique sans validation du terrain.
- **Complément du catalogue** : les 2 articles signalés incomplets par William (T-shirt manches longues "MOTECARLO LS" rouge, Polo "IMPERIUM") ont été complétés avec les 5 tailles S/M/L/XL/XXL demandées, en réutilisant la même référence fournisseur pour toutes les tailles (cohérent avec la table de correspondance source, qui listait déjà ces 5 tailles pour ces 2 articles).
- **Décision de conception non re-demandée à William, actée dans le plan puis confirmée par son approbation globale** : le module est **100% piloté depuis le dashboard**, sans nouvel écran PWA — la génération des fiches, l'émargement et la réception de stock sont des actions de gestion (Logistique), pas des actions terrain des salariés eux-mêmes.
- **Réutilisation systématique de patterns existants** plutôt que nouvelle mécanique : le pipeline d'upload de fichier vers SharePoint (`upload_photo`, déjà utilisé pour les photos d'immos) a été dupliqué tel quel pour les photos de fiches EPI signées (dossier `Fiches_EPI` dédié) ; le modèle liste parent/liste enfant sans colonne Lookup (`Campagnes_Inventaire`/`Lignes_Inventaire`) a servi de gabarit pour `Dotations_EPI`/`Lignes_Dotation_EPI` ; l'écriture par lots `$batch` (`bulk_patch_immos`, `bulk_import_lignes_inventaire`) a servi pour l'import initial des 73 salariés, du catalogue (~58 références) et de la grille de dotation.
- **Stock initial à 0** : faute de comptage fiable du stock EPI actuel au moment du développement, le stock de chaque référence démarre à 0 après la migration initiale — à William de saisir une réception initiale correspondant à son stock physique réel via l'écran "Réception commande", plutôt que d'inventer un chiffre de départ.
- **Étapes bloquantes côté William avant mise en service** : création de 4 nouvelles listes SharePoint (`Catalogue_Articles_EPI`, `Grille_Dotation_EPI`, `Dotations_EPI`, `Lignes_Dotation_EPI`) et de 6 nouvelles colonnes sur `Employes` (`Affectation_EPI` + 5 tailles) — comme pour chaque évolution précédente ayant nécessité de nouvelles listes.

## Retours terrain après mise en production du module EPI (août 2026)
- **Colonne manquante découverte au déploiement** : `Dotations_EPI` créée par William sans les colonnes `Genere_Le`/`Emarge_Le` (Date/heure) — repéré via un nouvel endpoint générique `?debug_columns=<liste>` (généralisation de `?debug_inventaire_columns=1`), conservé comme outil réutilisable pour tout futur diagnostic de colonne. Corrigé côté SharePoint par William, sans impact sur le code.
- **Bug de correspondance taille "Gants"** : la grille de dotation avait été importée avec "Gants a picot"/"Gants gros oeuvre" (sans accent, tirés de l'onglet "Liste Personnel") alors que le catalogue utilise "Gants à picot"/"Gants gros œuvre" (avec accent, tiré de l'onglet "Correspondance tailles articles") — deux onglets source avec une graphie différente pour le même article réel. La comparaison stricte de chaîne de caractères échouait silencieusement (aucune ligne générée pour cet article). Corrigé dans le code et recréé en base avec la bonne orthographe.
- **5 articles universels absents de la grille** : Casque anti-bruit, Casque de chantier, Jugulaire pour casque, Lunettes incolores, Lunettes fumées existaient dans le catalogue mais n'apparaissaient dans aucune colonne de quantité par profil du fichier source (donnés en quantité 1 à tous, donc jamais isolés comme variable dans le tableur d'origine). **William a confirmé** qu'ils sont donnés en quantité 1 pour les 4 profils sans exception — ajoutés à la grille (60 lignes au total). A nécessité d'ajouter la notion d'"article à taille unique" (sans champ de taille employé associé) dans la logique de génération de fiche.
- **Fiche imprimable jugée trop sommaire** : William a demandé un rendu plus proche du document Excel d'origine, logo inclus. Refonte avec le logo Electricité Services Réunion (réutilisation de `logo.png` déjà hébergé), bandeau de titre, encadré destinataire structuré, tableau avec en-tête colorée.
- **Accès à la fiche émargée depuis le profil employé** : le flux d'émargement (upload photo) existait déjà mais n'était accessible que depuis l'onglet EPI. William voulait pouvoir cliquer directement depuis la fiche employé pour voir la preuve signée ou émarger une fiche en attente — ajouté comme lien contextuel dans le bloc EPI de la fiche employé (et dans les tableaux Dotations/Ponctuelle pour cohérence).

## Module Prime d'outillage (août 2026)
- Besoin exprimé par William : intégrer le suivi de la "prime d'outillage" (kit d'outils remis en nature aux salariés de terrain), aujourd'hui géré via `Détail prime d'outillage.xlsx` (3 onglets : Tx Neufs, Maintenance, Commande globale) et des fiches PDF signées individuelles déjà classées. Besoin explicite : voir facilement ce qui a été distribué et ce qui reste à distribuer, prix des articles intégré.
- **Analyse du fichier source** : structure en matrice (une ligne = un outil, une colonne = un employé, cellule 0/1 = reçu ou non) par service, plus un onglet `Commande globale` donnant quantités commandées/reçues et prix négocié par article. Le calcul du stock disponible (`Total reçu` − quantités déjà distribuées comptées dans les onglets par service) a été vérifié manuellement sur plusieurs lignes avant d'être retenu comme fiable (ex. Pince ampermétrique 600V : 63 reçus, 20 distribués, 0 en Tx Neufs → 43 en stock, cohérent avec la colonne `Surplus` du fichier).
- **Fiches PDF déjà signées repérées** (`Documents\Dotaçaos\Prime d'outillage - Dotations - <CODE>.pdf`) : même gabarit que les fiches EPI — a confirmé la pertinence de réutiliser directement le pipeline émargement + photo déjà construit pour les EPI, plutôt que d'inventer un nouveau mécanisme.
- **Cadrage validé avec William avant développement** : (1) périmètre = exactement les employés des 2 onglets `Tx Neufs`/`Maintenance` (William a précisé que ces listes contiennent déjà des CT et de l'Atelier — le service outillage est une dimension indépendante de `Affectation_EPI`, pas une redite) ; (2) **dotation ponctuelle et complétable**, sans cycle annuel comme les EPI (les outils sont durables, donnés une fois) ; (3) **stock vivant**, initialisé depuis les quantités déjà reçues du fichier source plutôt qu'à 0 (donnée fiable disponible, contrairement aux EPI où le stock de départ était inconnu) ; (4) source unique `Détail prime d'outillage.xlsx`, les autres fichiers `Prime d'outillage*.xlsx` repérés dans les Documents de William ignorés (probables exports antérieurs).
- **Modèle simplifié par rapport aux EPI** : une seule liste plate `Lignes_Outillage` (pas de fiche/lignes séparées avec statut Generee/Emargee) — la distribution est actée directement à l'émargement, sans étape intermédiaire, ce qui évite le risque de fiches "orphelines" jamais signées qui aurait faussé le stock.
- **Anomalie de données signalée sans être corrigée arbitrairement** : le code `ELSA` apparaît avec des données réelles distinctes dans les deux onglets de service (Tx Neufs ET Maintenance). Plutôt que de deviner lequel est le bon, les deux jeux de lignes ont été importés tels quels ; le modèle de données n'impose pas un service unique par employé côté `Lignes_Outillage`, seul le champ `Service_Outillage` sur `Employes` (utilisé pour le calcul de la grille cible) a dû recevoir une valeur unique — le premier service rencontré (Travaux Neufs) a été retenu par défaut, à corriger par William si ce n'est pas le bon.
- **Réutilisation systématique** : mêmes patterns que les EPI (upload de fichier vers un dossier drive dédié `Fiches_Outillage`, écriture par lots `$batch`, gabarit de fiche imprimable HTML avec logo) — quasiment aucune nouvelle mécanique inventée pour ce module.
- **Étapes bloquantes côté William avant mise en service** : création de 3 nouvelles listes SharePoint (`Catalogue_Outillage`, `Grille_Outillage`, `Lignes_Outillage`) et d'une colonne `Service_Outillage` sur `Employes`.

## Retour terrain Prime d'outillage : durée d'amortissement & prime annuelle (août 2026)
- **Bug signalé après mise en production** : William a constaté que la vue "Grille par service" n'affichait que 37 articles sur 41 (ex. Tenaille russe, Règle à échelle triangulaire absentes). Cause identifiée : la grille avait été construite à partir des colonnes de quantité des onglets opérationnels `Tx Neufs`/`Maintenance`, qui n'incluaient pas 4 articles pourtant présents dans le catalogue (ceux-ci avaient une quantité cible dans l'onglet `Commande globale` du fichier source, mais n'étaient jamais devenus des lignes de suivi dans les feuilles opérationnelles) — pas un bug de code, une incomplétude du fichier source utilisé pour la première migration.
- **Nouveau fichier de référence transmis** : `1.6.5.115. Kit outillage électricien et EPI.xlsx` (onglet "Liste matériel retenu") — le document de conception initial du kit, avec une colonne **durée d'amortissement retenue** par article et une note explicite *"Versement prime sur la paie du mois de décembre"*. Révèle que la prime d'outillage n'est pas qu'un suivi physique : c'est aussi une **prime monétaire versée en paie**.
- **Vérifications avant d'agir** : les 41 désignations et références du fichier "Kit" correspondent exactement à celles déjà en base (aucune recréation nécessaire) ; le diff entre l'ancienne grille et celle recalculée depuis le fichier Kit ne montre que 4 ajouts, 0 suppression, 0 changement de quantité — correction purement additive.
- **Formule de la prime annuelle vérifiée** : `Prix_Unitaire × 12 / Duree_Amortissement_Mois`, recoupée sur plusieurs lignes du fichier (ex. jeu de tournevis 24,90€/60 mois → 4,98€/an, exact) — appliquée par employé en sommant sur les outils **réellement reçus** (pas la grille cible).
- **2 lignes ignorées sur demande de William** : le fichier contenait 2 pistes de devis non tranchées ("A faire chiffrer par Leroy Merlin Le Port") — une 2e référence pour "Pince coupante de précision" et un "Tire-fil Polyester Tressé" alternatif — non intégrées, le catalogue actuel reste la référence tant que ces devis ne sont pas conclus.
- **Choix de conception** : la prime annuelle est calculée entièrement à la volée (aucun montant stocké) à partir des données déjà en base — cohérent avec le reste du module (pas de snapshot persistant) ; export CSV fourni pour la transmission au service paie, qui sert de trace externe si un historique est nécessaire.

## Relevé de matériel à restituer, sortie d'employé (août 2026)
- Besoin exprimé par William : pouvoir générer automatiquement, au départ d'un salarié, une liste regroupant tout le matériel qui lui a été attribué ou qu'il n'a pas rendu — immobilisations **et** prime d'outillage.
- **Exclusion explicite des EPI demandée par William** : "on ne peut pas les reprendre malheureusement" — les vêtements/protections ne sont pas repris au départ d'un salarié, donc cette catégorie ne doit pas apparaître sur le relevé. Une mention explicite l'indique sur le document généré pour éviter toute ambiguïté.
- **Réutilisation des données déjà suivies, aucun nouveau modèle** : le relevé combine simplement ce qui est déjà tracké — immobilisations actuellement en possession (même source que le bloc "En sa possession" de la fiche employé) et outils reçus (`Lignes_Outillage`, qui n'a pas de notion de "restitution" donc la totalité des outils déjà reçus y figure naturellement, cohérent avec l'objectif "ce qu'il n'a pas rendu"). Gabarit imprimable identique aux autres fiches (logo, bandeau, tableaux) pour rester cohérent visuellement.
- **Pas de suivi de restitution implémenté** : le document a une case "Restitué" vierge à cocher à la main lors de la collecte physique — aucune donnée de retour n'est enregistrée dans l'app à ce stade, ce point n'a pas été demandé et n'a donc pas été construit (à réévaluer si le besoin se confirme).
- Accessible à tout moment depuis la fiche employé (pas seulement au moment de la bascule "Inactif"), pour permettre de préparer la collecte avant la sortie effective.

## Ajout d'articles EPI, import Excel du stock & pagination "Au dépôt" (août 2026)
- Besoin exprimé par William : pouvoir ajouter un nouvel article au catalogue EPI en cours d'année (ex. nouveau modèle de chaussures acheté en promotion) sans repasser par une migration, et de même ajouter un article à la grille de dotation annuelle standard — jusque-là ces deux listes n'étaient modifiables que via l'import initial ou l'édition des quantités déjà existantes, pas la création.
- **Stock EPI — bouton "➕ Ajouter article"** : formulaire (type d'article, taille salarié/affichage, référence, désignation, fournisseur, stock initial) → nouvelle action Worker `ajouter_article_epi` (création simple, une ligne), par opposition aux imports `bulk_import_catalogue_epi` réservés à la migration initiale.
- **Grille de dotation — bouton "➕ Ajouter article"** : ajoute un nouveau type d'article à la grille (ligne vide, quantités à 0 pour les 4 profils), réutilise l'action `maj_grille_dotation_epi` déjà existante (upsert) plutôt qu'une nouvelle action dédiée — les quantités par profil restent ensuite éditables directement dans le tableau comme avant.
- **Import Excel du comptage de stock EPI** : au lieu de ressaisir manuellement chaque quantité après un inventaire physique des EPI, un fichier Excel (colonnes "Référence" + "Quantité"/"Stock", détection flexible de l'en-tête) peut être importé depuis la vue Stock. Réutilise la bibliothèque SheetJS déjà chargée dans le dashboard (jusque-là utilisée uniquement pour l'export du rapport complet Immos) — aucune nouvelle dépendance. Un aperçu (références reconnues/non reconnues, ancien vs nouveau stock) est affiché avant validation ; la quantité importée **remplace** le stock actuel (c'est un comptage, pas une réception à additionner — différence volontaire avec l'action `reception_commande_epi` existante). Nouvelle action Worker `bulk_maj_stock_epi` (PATCH par lots de 20, même pattern `$batch` que les autres imports).
- **Pagination de l'onglet "Au dépôt"** : retour terrain de William — en cherchant des immos achetées à une date précise, la limite d'affichage (50/100/200/Tous) sans possibilité de "page suivante" rendait la recherche peu pratique au-delà de la première page. Ajout de boutons Précédent/Suivant sous le tableau, la page revenant automatiquement à 1 dès qu'un filtre, un tri ou la taille de page change.
- Aucun de ces trois ajouts ne nécessite de nouvelle liste ou colonne SharePoint côté William — déployables immédiatement.

## Ajout d'immo/affectation depuis "Au dépôt", réservation manuelle & ajout de FDS (août 2026)
- **"Ajouter une immobilisation" dupliqué dans "Au dépôt"** : le formulaire existait déjà (onglet Utilisateurs) mais William devait changer d'onglet pour l'utiliser en travaillant sur le dépôt — même bouton, même formulaire (`ouvrirAjoutImmo()`), juste un deuxième point d'entrée là où le besoin se présente naturellement.
- **Import fichier "Au dépôt"** : besoin exprimé par William de pouvoir importer un fichier pour soit ajouter des immos en masse, soit renseigner l'affectation courante (qui détient quoi) d'immos déjà suivies — **un seul upload pour les deux cas**, le code IM (toujours présent dans les fichiers de William) faisant foi pour distinguer une création d'une mise à jour d'affectation. Anti-doublon **garanti côté Worker** (l'action `ajouter_immo` fait déjà une vérification bloquante avant toute création, réutilisée telle quelle) — jamais de doublon même en cas de ré-import du même fichier.
  - Code IM déjà connu → nouvelle action Worker `importer_affectation_immo` : crée directement un Mouvement (Transfert vers le détenteur indiqué, ou Retour vers DEPOT), **hors du flux "en attente de validation"** habituel — cohérent avec le fait qu'il s'agit d'une correction/reprise de données, pas d'un vrai transfert terrain à faire valider par quelqu'un.
  - Code IM inconnu → création via `ajouter_immo` (déjà existant) ; si le fichier indique aussi un détenteur ou un état, un mouvement initial est également créé dans la foulée pour que l'immo n'apparaisse pas à tort comme "Jamais sorti"/"Inconnu".
  - Aperçu de contrôle avant validation (créations / affectations / lignes ignorées avec motif), en-têtes de colonnes détectés de façon souple (accents et casse ignorés).
- **"Ajouter une réservation" dans le dashboard** : besoin de William — pouvoir enregistrer une réservation pour le compte de quelqu'un directement depuis le dashboard, le réseau étant parfois indisponible sur le terrain (à Mayotte en particulier), et en attendant la généralisation complète du flux PWA. Réutilise l'action Worker `reserver` déjà existante (celle utilisée par la PWA) — aucune nouvelle mécanique côté Worker. Réservé à Admin/Logistique/Logistique_Mayotte (même population que les garants), avec la même vérification de conflit de dates que la PWA avant enregistrement.
- **"Ajouter FDS" dans Documents** : jusque-là, aucune FDS ne pouvait être ajoutée depuis l'app — `FDS_URL` devait être renseigné manuellement dans SharePoint. Nouveau bouton (+ lien direct "Manquante → ajouter" sur chaque ligne sans FDS) : upload du fichier (PDF ou image) vers un nouveau dossier drive `FDS_Immos/{code_im}/`, puis `FDS_URL` renseigné avec un repère `FDS:code/fichier` (et non un lien de partage SharePoint) — le proxy `?fds=code` sait servir les deux formats, donc les FDS déjà présentes (liens de partage saisis à la main) continuent de fonctionner sans migration. Réservé à Admin/Logistique/Logistique_Mayotte.
- Aucun de ces trois ajouts ne nécessite de nouvelle liste ou colonne SharePoint côté William.

## Autorisation côté serveur des actions sensibles du Worker (août 2026)
- **Faille identifiée par l'assistant à la demande de William** ("que peut-on améliorer pour être au niveau d'un éditeur professionnel ?") : aucune des actions du Worker ne vérifiait les droits de l'appelant côté serveur — seule l'interface cachait les boutons selon le rôle. Depuis que `worker.js` est commité sur GitHub (août 2026, voir plus haut), les noms d'actions sont publics : n'importe qui connaissant l'URL du Worker pouvait appeler directement `ajouter_immo`, `maj_droits`, etc. sans jamais se connecter.
- **Portée volontairement limitée aux actions réservées au dashboard** : les actions utilisées aussi par la PWA terrain sans mot de passe (`reserver`, `transfert`, `declarer_panne`, `signaler_absence`...) reposent sur un modèle de confiance différent, assumé depuis le début du projet (identité = badge scanné, pas de mot de passe pour les 97 collaborateurs terrain) — les protéger aurait cassé ce flux pour tout le monde et n'était pas le problème signalé. Seules les **46 actions exclusivement dashboard** (créées ou modifiées uniquement via le dashboard admin) ont été protégées.
- **Mécanisme** : un jeton de session signé (HMAC-SHA256) est émis par le Worker à la connexion réussie (`verify_password`/`set_password`), encodant le code et le rôle de l'employé avec une expiration de 12h. Chaque action sensible vérifie ce jeton côté serveur avant de faire quoi que ce soit (`requireAdmin`/`requireGarant` selon le niveau requis, aligné sur les fonctions `estAdmin()`/`estGarant()` déjà utilisées côté client). Secret de signature (`SESSION_SECRET_ENV`) distinct de `CLIENT_SECRET_ENV`, à ajouter par William dans Cloudflare (Settings → Variables and Secrets) — **étape bloquante avant que la protection soit réellement active** ; tant que cette variable n'existe pas, la connexion au dashboard continue de fonctionner mais les 46 actions protégées échouent explicitement (`session_secret_manquant`) plutôt que de rester ouvertes sans contrôle.
- **Choix technique côté dashboard** : plutôt que de modifier individuellement les ~46 points d'appel `fetch(...)` dispersés dans `dashboard.html` (risque d'en oublier un), le jeton est injecté automatiquement par une interception unique de `window.fetch` au chargement de la page — un seul endroit à maintenir, la liste `GATED_ACTIONS` faisant le lien avec les actions protégées côté Worker.
- **Incident constaté pendant les tests** : en testant le mécanisme en local contre le Worker de production (erreur de ma part — j'aurais dû utiliser un environnement isolé), un appel `ajouter_immo` avec un code de test `IM999999` a répondu "doublon, existe déjà". Vérification faite : `IM999999` est bien un code déjà présent dans la base réelle (confirmé via `next_code_im` qui renvoie `max_num: 999999`), donc mon appel test n'a rien créé de nouveau — mais l'origine de ce code (visiblement un test, très éloigné de la plage réelle ~IM000001-IM001200) reste inexpliquée et n'a pas été investiguée plus loin. À vérifier par William et à nettoyer si c'est bien un résidu de test.
- **Vérification effectuée** : logique de signature/vérification testée unitairement en isolation (round-trip valide, rejet clé fausse, rejet payload modifié, rejet jeton expiré, aucun jeton émis si le secret n'est pas configuré) — tous les cas passent. Le mécanisme d'injection du jeton côté dashboard a été vérifié directement dans le navigateur (46 actions listées sans doublon, `window.fetch` bien intercepté).
- **Bug corrigé au passage** (retour terrain de William après un premier test réel d'ajout d'employé) : après création réussie, la liste ne se rafraîchissait pas (`loadEmployes()` appelé sans forcer le rechargement + mauvaise fonction de rendu) — l'employé était bien créé côté SharePoint mais invisible jusqu'à un rechargement complet de la page. Bug pré-existant, sans lien avec le contrôle d'accès, mis en lumière par ce test.

## Tests automatisés & garde-fous avant push (août 2026)
- Besoin exprimé par William après la mise en place du contrôle d'accès : un jeu de tests automatisés et une "préprod", en insistant sur le **zéro risque pour la production**. Question posée avant de commencer : comment isoler les données de test pour que ce soit vraiment zéro risque (site SharePoint séparé à créer, vs tests entièrement mockés sans nouvelle infra) ? **William a choisi les tests automatisés isolés dans un premier temps**, la préprod avec vraies données restant à évaluer plus tard si le besoin se confirme.
- **Choix technique** : `node --test` (natif depuis Node 18, zéro dépendance npm à installer) plutôt qu'un framework de test tiers — cohérent avec la philosophie du projet (aucun build, aucun `npm install` nécessaire jusqu'ici).
- **Refactorisation préalable, comportement inchangé** : la logique de session (signature/vérification du jeton, calcul des rôles) a été extraite de l'intérieur de `handleRequest()` vers le haut du fichier (fonctions pures paramétrées, ex. `signSessionWith(code, role, secret)` au lieu d'un `signSession(code, role)` fermé sur une variable interne) — uniquement pour la rendre testable indépendamment d'une vraie requête HTTP, sans changer le comportement en production (vérifié par re-passage des mêmes tests avant/après). `handleRequest()` continue de lire `SESSION_SECRET_ENV` exactement comme avant et se contente de le transmettre à ces fonctions.
- **Trois familles de tests, aucune ne touche SharePoint/Graph** :
  1. `tests/worker.session.test.js` : logique pure du jeton (signature, vérification, expiration, rejet falsification, normalisation de rôle).
  2. `tests/security.gated-actions.test.js` : **garde-fou anti-régression** — vérifie que la liste des actions protégées côté Worker et `GATED_ACTIONS` côté dashboard restent synchronisées (exactement le genre d'oubli qui a permis la faille initiale), et qu'aucune action partagée avec la PWA terrain n'est protégée par erreur.
  3. `tests/worker.integration.test.js` : simule de vraies requêtes HTTP contre `handleRequest()` (le vrai routeur), avec Microsoft Graph entièrement mocké (aucun appel réseau réel) — vérifie que le contrôle d'accès est bien branché de bout en bout, pas seulement dans les fonctions testées isolément.
- **Bug réel trouvé par les tests dès la première exécution** : `roleNorm()` ne retirait pas les espaces en début/fin avant de les remplacer par des underscores (`' admin '` devenait `'_admin_'`, pas reconnu comme `'admin'`) — corrigé (`.trim()` ajouté). Risque réel : un rôle SharePoint avec un espace superflu (saisie manuelle) aurait pu faire perdre ses droits admin à quelqu'un de légitime. Bonne illustration de la valeur des tests dès le premier jour.
- **Deux niveaux de garde-fou avant un push**, cohérents avec le mode de fonctionnement du projet (push direct sur `main`, sans revue de code, solo) :
  1. **Hook `pre-push` local** (`.githooks/pre-push`, activé via `git config core.hooksPath .githooks` — fait automatiquement au premier `npm install` via le script `prepare`) : bloque le push si `npm run verify` (syntaxe + tests) échoue. Contournable volontairement avec `git push --no-verify`.
  2. **GitHub Actions** (`.github/workflows/tests.yml`) : relance la même vérification à chaque push sur `main`, en filet de sécurité (n'empêche pas le déploiement GitHub Pages / Cloudflare, qui reste indépendant — sert juste à être alerté rapidement si le hook a été sauté).
- **Pas de site de préprod avec vraies données pour l'instant** (décision explicite de William) — resterait à faire si besoin : site SharePoint dédié + Worker en preview de branche Cloudflare (fonctionnalité déjà disponible côté Cloudflare, pas de nouvelle infra à payer) + un second repo/branche GitHub Pages pour le frontend (pour ne pas risquer de casser l'URL de la PWA installée sur les téléphones du terrain).

## Module Matériel IT — téléphones, puis ordinateurs (août 2026)

- Besoin exprimé par William : suivre les ordinateurs et téléphones professionnels, aujourd'hui difficiles à savoir "qui a quoi, depuis quand" — explicitement **hors circuit des immobilisations** ("ces articles ne sont pas des immos"). Fourni en pièce jointe : un fichier Excel de suivi de la flotte de téléphones (40 appareils, "incomplet" de son propre aveu) et la facture globale Free Pro.
- **Fichier Excel analysé** : onglet "2" (Téléphonie Mobile) — Type/Marque/Modèle/N° série, `N°Immobilisation` toujours "Non Immobilisé" (confirme le hors-périmètre immos), Date d'entrée/sortie, Utilisateur (codes employés existants + valeurs spéciales `RESERVE`/`ASTREINTE`/`ALARME`/`SANS AFFECTATION`), N° téléphone/Opérateur/SIM/codes PIN-PUK-RIO/déverrouillage. L'onglet "1" (Téléphonie Fixe) laissé hors périmètre (non demandé). Certains codes employés apparaissaient deux fois avec des dates d'entrée/sortie différentes (ex. IADA, PALO, TOHO) — pas une anomalie, juste deux appareils physiques différents successifs pour la même personne, correctement gérés par une entrée catalogue par ligne Excel.
- **Facture Free Pro analysée** : en réalité 4 pages (le fichier joint annoncé comme "168 pages" par l'outil de lecture ne correspondait pas au fichier réel sur le lecteur réseau — vérifié directement, 4 pages scannées). 29 lignes actives à 23,22€ HT/mois chacune (tarif plat "Forfait Mobile Free Pro 5G — Sans engagement"), avec le **nom complet réel** du porteur par ligne (pas le code employé) — utile pour confirmer que le numéro de téléphone est la clé de rapprochement fiable entre les deux sources (le nom sur la facture est parfois tronqué par le système de Free, ex. "Jean Bernard RI" pour RIJB).
- **Cadrage validé avec William avant développement** (questions posées, recommandations retenues) : (1) **historique complet des détenteurs successifs** (pas juste un détenteur actuel figé), pour retrouver la durée de détention comme demandé — même principe que les Mouvements des immos, mais sans le workflow panne/réservation ; (2) **coût mensuel inclus** (champ simple par appareil, pas d'amortissement comme les immos) ; (3) **100% dashboard**, pas d'écran PWA — cohérent avec EPI/Outillage (attribution pilotée par la logistique, pas en libre-service).
- **Modèle de données** : 2 nouvelles listes, `Materiel_IT` (catalogue) et `Mouvements_Materiel_IT` (historique de détention, détenteur courant = dernier mouvement par appareil). Codes générés par préfixe de type (`TEL######` pour les téléphones, `PC######` prévu pour les ordinateurs) plutôt qu'un préfixe unique, pour rester lisible une fois les deux catégories mélangées dans une même liste — décision anticipée pour éviter une refonte quand William fournira les PC dans un second temps (annoncé par lui, pas encore livré).
- **Droits réutilisés sans nouvelle capacité** : `peutGererEPI()` (Admin/Logistique/Logistique_Mayotte) réutilisée telle quelle côté dashboard pour ce module — même population que EPI/Outillage, pas de nouvelle ligne dans `ROLE_CAPS`.
- **Sécurité dès la conception** : les 5 nouvelles actions Worker (`ajouter_materiel_it`, `maj_materiel_it`, `affecter_materiel_it`, `bulk_import_materiel_it`, `bulk_import_mouvements_materiel_it`) ont été protégées par le mécanisme de jeton de session dès leur écriture (voir section précédente), pas ajoutées après coup — le test `security.gated-actions.test.js` a validé automatiquement la cohérence sans modification.
- **Migration préparée, données transparentes sur les incertitudes** : 40 appareils convertis en catalogue + historique initial. Coût mensuel (23,22€) appliqué uniquement aux appareils actifs avec une ligne FREE en cours (28 sur 40) — pas de tentative de reconstituer un rapprochement ligne à ligne avec la facture (dont les 29 lignes ne correspondent pas exactement aux 40 lignes Excel, celui-ci étant "incomplet" de l'aveu de William : au moins une ligne facturée — ex. "STAGIAIRE" — n'a pas de contrepartie identifiable dans le fichier de suivi). Date de détention = date d'entrée Excel si connue, sinon date du fichier source (23/05/2026) en repli assumé — la durée affichée pour ces appareils sera donc une approximation par défaut, pas la date réelle de première attribution. 3 codes détenteurs (`ADWI`, `HOAL`, `VIMA`) non retrouvés dans la liste `Employes` actuelle au moment de la vérification — importés tels quels plutôt que devinés, à corriger par William si besoin (probable erreur de saisie ou ancien collaborateur).
- **Étape bloquante côté William avant mise en service** : création des 2 listes SharePoint (`Materiel_IT`, `Mouvements_Materiel_IT`), comme pour chaque nouveau module.
- **Incident au premier import** : `Mouvements_Materiel_IT` importée correctement (40 lignes), mais `Materiel_IT` restée totalement vide. Diagnostiqué en lecture seule via `?debug_columns=Materiel_IT` (aucune donnée touchée) : la colonne créée par William pour le code de déverrouillage s'appelle en interne `Code_deverouillage` (sans le 2e "r", casse différente) et non `Code_Deverrouillage` comme écrit dans le code — un seul champ non reconnu suffit à faire échouer la création de **toute** la ligne SharePoint (pas seulement ce champ), d'où la liste entièrement vide malgré un import qui semblait progresser normalement à l'écran. Corrigé dans `worker.js` (4 occurrences) pour matcher le nom réel plutôt que de redemander à William de renommer la colonne — même logique que l'incident `Fabricant`/`Fabriquant` de la campagne d'inventaire (voir plus haut) : toujours vérifier le nom interne réel via `?debug_columns=<liste>` en cas de doute, jamais se fier au nom tel que tapé à la création.

## Mode hors-ligne de la PWA (service worker, août 2026)

- Suite à la question de l'assistant "que peut-on améliorer pour être au niveau d'un éditeur professionnel ?", deux points retenus par William : l'observabilité (voir plus bas) et l'absence de mode hors-ligne réel de la PWA malgré son nom — gênant vu les zones à réseau instable à Mayotte.
- **Périmètre choisi avec William** (deux options proposées) : coquille applicative + données en cache (l'app s'ouvre même sans réseau, affiche les dernières données connues, indique clairement quand une action nécessite le réseau), **pas** la mise en file d'attente des actions faites hors-ligne (scan, réservation...) — jugée trop risquée pour une première étape (conflits de données possibles, ex. deux personnes affectant la même immo) et à traiter dans une réflexion dédiée si le besoin se confirme.
- **Mécanisme** : nouveau fichier `sw.js` (service worker), enregistré depuis `index.html`. Met en cache la coquille applicative (`index.html`, `app.js`, `manifest.json`, logos) en stratégie réseau-d'abord-repli-cache (fraîcheur à chaque déploiement, mais fonctionne hors-ligne), et les catalogues statiques `immos.json`/`employes.json` en stratégie cache-d'abord-rafraîchi-en-arrière-plan (affichage instantané). **Les appels au Worker (réservations, transferts, données live) ne sont jamais interceptés** par le service worker — ils échouent proprement avec le message d'erreur réseau déjà existant si hors-ligne, pas de données périmées présentées comme à jour sur ce qui compte vraiment.
- **Bannière hors-ligne** ajoutée dans `index.html` (écoute `online`/`offline` + `navigator.onLine`) pour prévenir clairement l'utilisateur plutôt que de le laisser découvrir le problème en tapant sur un bouton qui échoue.
- **Vérifié** : enregistrement et activation du service worker confirmés dans le navigateur, les 8 ressources de la coquille effectivement mises en cache, bascule de la bannière testée directement (affichage/masquage corrects selon l'état réseau).

## Observabilité : intégration Sentry (août 2026)

- Suite au point "zéro observabilité" soulevé par l'assistant, William a choisi Sentry (recommandé) plutôt qu'une solution maison sur liste SharePoint — le regroupement automatique des erreurs similaires et les alertes email en cas de pic étaient jugés plus utiles qu'une solution 100% interne mais plus basique.
- **Mise en œuvre** : SDK Sentry Browser chargé via CDN (`https://browser.sentry-cdn.com/10.69.0/bundle.min.js`, cohérent avec la philosophie "zéro build" du projet — même pattern que Chart.js/SheetJS/html5-qrcode déjà utilisés) dans `index.html` (PWA) **et** `dashboard.html`, chacun avec son propre tag `environment` (`pwa` / `dashboard`) pour distinguer l'origine des erreurs dans Sentry. Script chargé tôt dans le `<head>` pour capter aussi les erreurs des scripts suivants.
- Le DSN fourni par William n'est pas un secret (conçu pour être embarqué côté client, comme une clé Firebase) — commité en clair dans le code, cohérent avec le reste de la configuration déjà publique du projet.
- **Vérifié** : `Sentry.getClient()` confirmé actif avec le bon DSN et le bon tag d'environnement dans le navigateur ; un message de test envoyé pour confirmer la réception côté Sentry (à vérifier par William dans son tableau de bord Sentry).

## Correctif : erreur non interceptée lors de l'activation manuelle (`stopScanner`, août 2026)

- **Signalé par William** en testant l'activation manuelle (saisie du code au lieu du scan) : erreur console `Uncaught Cannot stop, scanner is not running or paused`.
- **Cause identifiée en inspectant directement le code source de la librairie `html5-qrcode`** (récupéré en lecture seule depuis le CDN public, aucune donnée touchée) : `Html5Qrcode.stop()` lance une exception **synchrone** (`throw "Cannot stop, scanner is not running or paused."`, une chaîne de caractères, pas un objet `Error`) si le scanner n'est pas déjà en train de scanner — typiquement quand la caméra n'a jamais fini de démarrer (permission refusée, ou navigation vers l'écran manuel avant que le scanner ait pu se lancer). Le `.catch()` déjà présent sur `stopScanner()` ne protégeait que contre une **promesse rejetée**, pas contre ce rejet synchrone survenant avant même la création de la promesse — donc totalement inefficace dans ce cas précis.
- **Corrigé** dans `app.js` : `stopScanner()` encadre désormais l'appel dans un `try/catch` classique (en plus du `.catch()` conservé pour le cas où une promesse est bien retournée et rejetée), ce qui couvre les deux scénarios possibles.
- **Vérifié** : reproduit fidèlement la situation réelle (caméra bloquée → scanner jamais démarré) dans un navigateur de test, confirmé que l'ancienne version lève bien l'erreur et que la nouvelle l'absorbe proprement sans planter la navigation.
- **Second incident au retest par William** (même écran, après déploiement) : nouvelle erreur console `Uncaught (in promise) TypeError: Failed to execute 'clone' on 'Response': Response body is already used`, cette fois dans `sw.js` (mode hors-ligne, livré juste avant). Cause : dans la branche "coquille applicative" du service worker, `res.clone()` était appelé **à l'intérieur** d'un `.then()` différé (`caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()))`) au lieu d'être appelé immédiatement à réception de la réponse — le temps que cette promesse se résolve, le corps de la réponse pouvait déjà être en cours de lecture ailleurs (la réponse est aussi renvoyée telle quelle au navigateur), rendant le clone impossible. Corrigé en appelant `res.clone()` de façon synchrone dès réception de la réponse, avant tout passage asynchrone. Vérifié : plusieurs rechargements sans erreur, les 9 ressources de la coquille toujours mises en cache correctement.

## Punch-list dashboard : correctifs et petites fonctionnalités (août 2026)

Grosse session de retours terrain groupés par William ("grosse session dashboard uniquement"), 11 points traités d'affilée. Détail par point :

- **404 à l'ouverture du dashboard** : diagnostiqué comme la simple sonde automatique `/favicon.ico` du navigateur (déjà documentée comme anomalie bénigne dans `01_ARCHITECTURE_TECHNIQUE.md`) — aucune ressource référencée dans le code n'était réellement manquante. Corrigé quand même proprement en ajoutant `<link rel="icon" href="logo-icon.jpg">` dans `index.html` et `dashboard.html`, plutôt que de laisser l'erreur silencieuse.
- **Logo trop petit sur les fiches imprimables** : hauteur du logo passée de 64px à 110px sur les trois gabarits qui le partagent (EPI, Outillage, relevé de sortie).
- **Référence + marque manquantes sur les documents de pointage terrain** : les gars pointent le matériel reçu sur la base du document imprimé — un intitulé seul ne suffit pas à distinguer deux outils similaires. Ajouté sur la fiche outillage et sur le relevé de sortie d'employé.
- **Stock négatif possible en distribution d'outillage** : `distribuer_outillage` (Worker) vérifie désormais le stock disponible par type d'article *avant* toute écriture et refuse la distribution si insuffisant (message explicite listant les articles concernés). **Décision volontairement limitée à l'outillage** : l'émargement EPI (`emarger_dotation_epi`) n'a pas reçu le même blocage dans cette passe, car sa sémantique diffère — l'émargement *confirme* une remise qui a souvent déjà eu lieu physiquement (le salarié a déjà le matériel en main), alors que la distribution d'outillage *est* le moment de la décision. Bloquer l'émargement risquerait de laisser une remise réelle non enregistrée dans l'outil. À rediscuter avec William si le même problème se présente côté EPI.
- **Actions impossibles pour un employé inactif** : ajout d'un contrôle serveur (`estEmployeActifServeur`, lit `Employes.field_2`) sur `reserver`, `transfert` (receveur — le donneur "DEPOT" reste explicitement exempté, un retour de matériel par quelqu'un qui vient de sortir de l'effectif doit rester possible) et `generer_dotation_epi`. Volontairement une vérification **serveur**, pas seulement côté interface, cohérent avec le principe déjà acté pour l'autorisation des actions sensibles (voir plus bas dans ce journal).
- **Fiche de sortie sans quantités attendues** : ajout des colonnes Attendu/Rendu (immos : toujours 1 ; outillage : agrégé par type d'article, une même référence pouvant avoir été remise en plusieurs exemplaires au fil du temps puisque `Lignes_Outillage` n'a pas de colonne quantité).
- **Pas de circuit de retour physique après la fiche de sortie** : ajout d'un état "⏳ EN ATTENTE RETOUR FICHE DE SORTIE" affiché sur la fiche employé (bloc outillage) dès que l'employé est inactif, avec un bouton "↩️ Retour en stock" par ligne. Réutilise l'action Worker `annuler_ligne_outillage`, qui existait déjà côté serveur et dans `GATED_ACTIONS` mais n'était appelée par aucun point du dashboard (orpheline depuis sa création) — repris tel quel plutôt que dupliqué.
- **Filtre actif/inactif illisible sur les listes** : ajouté sur Utilisateurs, "Au dépôt" et Historique des mouvements, même pattern à 3 options (tout / actifs seulement / inactifs seulement) partout. A révélé au passage que le statut actif/inactif d'une immo (`Immos.Actif`, déjà utilisé côté écriture par `marquer_statut_immo`) n'était **jamais remonté au dashboard** : ajouté à la réponse `?immo_metadata=1` du Worker (`actif: (f.Actif||'Oui')!=='Non'`) — un seul point de correction côté serveur suffit puisque `immoMeta` est chargé intégralement sans fusion côté client.
- **Sélection d'immo à la main dans "Ajouter une réservation"** : remplacé le simple champ code-exact par une recherche en direct (tape un fragment de code, de libellé ou de marque, ex. "532", "rainureuse", "Makita") avec liste de suggestions cliquable — même logique de correspondance (`code.includes(...) || libellé.includes(...)`) que les recherches déjà utilisées partout ailleurs dans le dashboard (Circulation, Au dépôt...), pour que l'expérience soit cohérente d'un écran à l'autre.
- **Pas de correction manuelle du stock EPI/Outillage** : le comptage physique réel n'a pas encore été fait pour ces deux modules (stock parti de 0 ou de valeurs calculées à la migration) — un bouton "✏️ Éditer" à côté du "+ Réception" existant permet de fixer une valeur absolue plutôt que d'ajouter un delta. Côté EPI, réutilise l'action déjà existante `bulk_maj_stock_epi` (appelée avec un tableau d'un seul élément) ; côté Outillage, nouvelle action `editer_stock_outillage` (n'existait pas, seul un delta de réception était possible).
- **Génération massive des dotations annuelles EPI en PDF locaux** : bouton "📁 Générer les PDF" dans l'onglet EPI → Dotations, qui écrit un PDF par fiche (`Dotation_annuelle_EPI_<année>_<code>.pdf`) directement dans un dossier local choisi par William, sans repasser par l'impression navigateur fiche par fiche. **Question posée explicitement à William avant implémentation** (aucune API web ne peut écrire silencieusement dans un dossier arbitraire du disque) : accès dossier direct via la File System Access API (Chrome/Edge uniquement, un choix de dossier une fois pour toutes via `showDirectoryPicker`, handle persisté en IndexedDB pour ne pas le redemander à chaque session) vs. téléchargement d'un ZIP à extraire manuellement. **William a choisi l'accès dossier direct.** Implémentation : `html2canvas` + `jsPDF` ajoutés en CDN (cohérent avec la philosophie "zéro build" déjà en place pour Chart.js/SheetJS/Sentry/html5-qrcode), le gabarit HTML de la fiche EPI (déjà utilisé par l'aperçu imprimable existant) est rendu hors-écran puis rasterisé en PDF, un fichier par fiche de l'année sélectionnée. Fonctionne uniquement sur Chrome/Edge — message explicite si le navigateur ne supporte pas `showDirectoryPicker`.

## Retour terrain sur la génération PDF des dotations EPI (août 2026)

Premier essai réel par William du bouton "📁 Générer les PDF" livré juste avant : signalé comme "pas ce que je t'avais demandé". Trois points corrigés :

- **Deux boutons au lieu d'un, flux pas clair** : William avait demandé un unique bouton "Générer dotation annuelle" avec une popup demandant l'année, qui fait tout d'un coup (fiches + PDF) pour tous les employés actifs éligibles. La première implémentation avait scindé ça en deux boutons séparés ("Générer les fiches manquantes" puis "Générer les PDF"), ce qui explique aussi le premier symptôme signalé ("j'ai cliqué sur Générer les PDF, rien ne s'est passé") : sans fiches déjà générées pour l'année, le bouton PDF n'avait rien à traiter. **Fusionné en une seule fonction** (`genererDotationAnnuelleComplete`) déclenchée par un unique bouton : `prompt()` pour l'année, création des fiches SharePoint manquantes (avec confirmation), puis génération de tous les PDF de l'année dans la foulée, sans étape intermédiaire à comprendre.
- **Bruit console `Unable to clone canvas as it is tainted`** : répété pour chaque employé lors de la génération, mais sans conséquence réelle (William a confirmé que tous les PDF étaient malgré tout générés et bien nommés). Cause : `html2canvas` clone l'intégralité du document (pas seulement l'élément ciblé) pour préserver le contexte de rendu, et tombe donc sur les `<canvas>` des graphiques Chart.js de l'onglet Analyses — toujours présents dans le DOM même quand cet onglet n'est pas affiché — qu'il ne parvient pas à recopier. Corrigé avec l'option `ignoreElements` d'html2canvas pour écarter tout `<canvas>` de la capture (la fiche EPI elle-même n'en contient aucun), qui supprime l'avertissement à la source plutôt que de le laisser s'accumuler dans la console.
- **Fiche sans moyen de cocher la réception** : le tableau de la fiche (Référence/Désignation/Taille/Quantité) n'avait pas de colonne pour que l'employé coche chaque article reçu à la signature — pourtant présente dans le gabarit papier d'origine. Ajout d'une colonne "Émargement" (case à cocher vide) par ligne d'article, dans le gabarit HTML partagé par l'aperçu imprimable et la génération PDF (`epiFicheBodyHtml`) — un seul point de correction pour les deux sorties.

## Suivi des émargements EPI/Outillage : historique, filtre, import de scans en lot (août 2026)

Après le premier retour terrain sur la génération des dotations annuelles, William a détaillé une liste de manques qu'il avait en tête depuis le départ. Question explicitement posée avant de trancher l'un des points (le lien scan → fiche) via `AskUserQuestion`, plan écrit et validé avant implémentation vu l'ampleur du sujet.

- **Décisions validées** : (1) lien scan → fiche : le flux individuel existant (upload direct sur la fiche d'un employé précis) suffit au quotidien **et** un import en lot avec lecture automatique du code employé est utile pour rattraper un arriéré ou une session de signature groupée — les deux sont conservés ; (2) remises ponctuelles EPI : ajout d'une option "destinataire = employé nommé" (au lieu de deviner par recherche approximative dans le texte libre, jugé trop peu fiable) ; (3) portée outillage : parité complète avec les EPI pour la présentation des fiches et l'historique — **sauf l'import de scans en lot**, qui ne peut pas s'appliquer tel quel car l'outillage n'a pas d'état "en attente de signature" (la photo est déjà exigée au moment de la distribution) ; signalé explicitement à William plutôt que de forcer une fausse parité.
- **Présentation uniforme** : `voirFicheOutillage` était un gabarit dupliqué avec sa propre feuille de style — aligné sur le gabarit partagé des fiches EPI (`EPI_FICHE_CSS_RULES`/`EPI_FICHE_LOGO_URL`), avec la même colonne "Émargement" (case à cocher) ajoutée sur chaque ligne d'article. Le relevé de sortie d'employé n'est volontairement pas concerné (ce n'est pas une fiche d'émargement, il a déjà ses propres colonnes Attendu/Rendu).
- **Garde-fou "déjà généré cette année"** : le bouton unique de génération vérifie désormais si des fiches existent déjà pour l'année saisie et prévient explicitement avant de continuer (la dotation annuelle ne doit normalement se lancer qu'une fois par an) — remplace un confirm plus vague qui ne portait que sur les fiches manquantes.
- **Nouvel onglet "Historique"** (EPI et Outillage) : tableau employé × année (statut de dotation + nombre de remises ponctuelles nommées côté EPI, nombre d'outils reçus côté Outillage, cellules cliquables vers le détail) et une vue "consommation par année" (quantités par article, filtrable par type de dotation côté EPI, export CSV). Aucune nouvelle colonne/liste SharePoint requise : la matrice se lit entièrement depuis les données déjà chargées en mémoire (`epiDotations`, `outilLignes`) ; seule la vue consommation nécessitait un accès à toutes les lignes de détail en un seul appel, d'où un nouvel endpoint de lecture `?lignes_dotation_epi_toutes=1` (non gated, même famille que les endpoints `?dotations_epi=1`/`?catalogue_epi=1` existants).
- **Filtre Statut** (Tous/Émargées/En attente) + compteur visible sur l'onglet Dotations EPI, pour répondre directement au besoin de voir clairement qui n'a pas encore signé.
- **Scans PDF acceptés partout** : jusque-là, l'émargement (EPI comme Outillage) n'acceptait qu'une image (`accept="image/*"`), alors que William parlait explicitement de "PDF scanné". Un helper partagé (`fichierVersJPEGBase64`) a été introduit pour factoriser la logique dupliquée entre les flux EPI et Outillage, et rend désormais aussi la 1ère page d'un PDF (via `pdf.js`) avant de suivre le même chemin de compression JPEG que les photos.
- **Import de scans en lot (EPI)** : lecture optique best-effort (`Tesseract.js`, chargé via CDN, aucune infra serveur — même philosophie que les autres bibliothèques du projet) du code employé sur plusieurs scans à la fois. Choix de conception pour limiter les faux positifs : la reconnaissance ne cherche que des fragments de 4 lettres correspondant à un code parmi les fiches **jamais émargées** (univers volontairement restreint), et **aucun rattachement n'est appliqué automatiquement** — un tableau de contrôle (aperçu miniature, code détecté, sélecteur de correction manuelle par ligne) doit être validé explicitement avant tout appel aux actions d'émargement réelles. Assumé et documenté comme une aide, pas une garantie : la qualité d'un scan/photo de terrain reste très variable.
- **Remise ponctuelle EPI nommée** : `Title` de la fiche devient le code employé (au lieu de l'identifiant synthétique `PONCTUEL-...`) quand un destinataire nommé est choisi — sans risque de collision avec la logique anti-doublon des dotations Annuelle/Entree, qui filtre déjà explicitement par `Type_Dotation`.

## Retour terrain : mauvaise identité attribuée aux mouvements, liste "Transférer à" incomplète (août 2026)

William a signalé plusieurs symptômes en testant le lot précédent : la liste déroulante "Transférer à" (bouton rapide depuis la fiche immo) ne montrait qu'une poignée d'employés, avec en plus des comptes admin ("Dashboard Admin (ADMIN)", "AIMAR William... (AIWI)") qui n'ont rien à faire dans une liste de destinataires terrain ; un transfert fait vers GOLU s'est retrouvé enregistré avec "Utilisateur AIWI, donné par vide" dans l'historique des mouvements ; l'utilisateur fantôme "Dashboard Admin" réapparaissait à plusieurs endroits.

**Cause racine, la même partout** : ce bouton rapide "Créer un transfert"/"Créer un retour" (fonction `ouvrirActionMouvement`/`soumettreAction`, vestige antérieur au système de jetons de session mis en place plus tôt cet été) construisait sa liste d'employés en piochant dans l'historique des mouvements déjà enregistrés (`d.all_movements`) au lieu de la liste réelle des employés, et postait directement un mouvement SharePoint via un point d'entrée générique du Worker **sans aucune authentification ni vérification de droits** — l'identité du "donneur" n'était jamais celle de la personne réellement connectée, remplacée par un marqueur statique `'DASH|Dashboard'` ou par des codes codés en dur (`'CONI'`, `'ADMIN'`) selon les endroits. En creusant, le même anti-pattern (`body.par_code || 'CONI'` ou `'ADMIN'`) est apparu dans plusieurs autres actions déjà protégées par jeton de session (`maj_panne`, `enregistrer_reparation`, `marquer_statut_immo`, la migration `bulk_import_lignes_inventaire`) : ces actions faisaient bien vérifier les **droits** du jeton, mais utilisaient encore l'identité fournie par le client plutôt que celle, vérifiée, du jeton lui-même — un même compte pouvait donc se voir attribuer une action réalisée par quelqu'un d'autre si le code envoyé dans le corps de la requête ne correspondait pas à la session réelle.

- **Nouvelle action Worker `creer_mouvement_direct`** (gated `requireGarant`) remplace l'ancien point d'entrée générique non protégé : le donneur/déclarant est désormais toujours l'identité vérifiée de la session (`_auth.session.code`, résolue en nom via `getNomResolver()`), jamais une valeur envoyée par le client. Pour un Transfert, `Code_Employe` = receveur (fourni par le client, ce n'est qu'une désignation de destinataire, pas une identité à protéger) et `Code_Chantier` = `donneur_code|donneur_nom` — exactement le même format que celui déjà utilisé par l'action `valider` (retours/transferts en attente), pour que la colonne "Donneur / Validé par" de l'historique fonctionne enfin pour ce flux aussi. Pour un Retour, `Code_Employe` = l'identité de session (remplace le `'CONI'` codé en dur).
- **Liste "Transférer à" reconstruite depuis `employesList`** (la liste réelle des employés, déjà chargée) au lieu de l'historique des mouvements, filtrée aux comptes actifs et non-admin (`estAdmin()`, exclut AIWI/CONI/NAXA/BAKA et tout rôle SharePoint "Admin") — corrige à la fois l'absence de certains ouvriers/CT/RA (qui n'apparaissaient que s'ils avaient déjà été l'auteur d'un mouvement) et la présence des comptes admin qui n'en faisaient historiquement partie que par fuite de données. Recherche floue (tape un code ou un nom, clique une suggestion) ajoutée sur ce champ ET sur "Changer le receveur" (modification d'un transfert en attente), même pattern que la recherche d'immo — nouvelle fonction partagée `attacherRechercheEmploye()`.
- **Fallbacks `||'CONI'` retirés de tous les appels dashboard** (suivi de panne, résolution de panne, réparation/entretien, déclaration de vol, sortie définitive, marquage de statut, déclaration de panne) — remplacés par `ADMIN_SESSION.code`/`ADMIN_SESSION.nom` sans repli vers un nom codé en dur, cohérent avec "le vrai utilisateur connecté doit apparaître".
- **`declarer_vol` et `resoudre_panne` : tentative de les protéger par jeton de session annulée après coup** — ces deux actions sont en réalité **partagées avec la PWA terrain** (utilisées par le profil "admin" du badge scanné, sans mot de passe, voir `app.js`), contrairement à ce qu'une première lecture du code laissait penser. Le test automatisé `security.gated-actions.test.js` (garde-fou déjà en place depuis l'implémentation initiale de l'autorisation serveur) a immédiatement signalé l'erreur avant tout déploiement — les protéger aurait cassé ces deux actions pour les collaborateurs terrain. Laissées volontairement non protégées, avec juste le retrait du nom codé en dur en repli.
- **Remise ponctuelle EPI** : le sélecteur d'employé nommé (ajouté au lot précédent) a été refondu en un seul champ de recherche floue (au lieu d'un select + champ texte séparés) — cohérent avec "généraliser la liste déroulante" demandé par William, et supprime le risque de faute de frappe en saisie libre (l'exemple "CANi" au lieu de "CANI" cité par William) : taper un code/nom propose maintenant des suggestions cliquables, la saisie libre restant possible uniquement pour les remises de groupe.
- **Anomalie non corrigée, à surveiller** : `marquer_statut_immo` est protégé par jeton de session (`requireGarant`) alors que ce même endpoint est aussi appelé par `app.js` (PWA, profil "admin" terrain sans mot de passe) pour la sortie définitive d'une immo — un gel pré-existant, pas introduit par ce correctif (la protection avait déjà été ajoutée lors du chantier "Autorisation côté serveur"). Si William confirme que ce flux PWA "admin" est réellement utilisé sur le terrain, il faudra soit lui fournir un jeton (login PWA "admin"), soit sortir cette action de la protection comme `declarer_vol`/`resoudre_panne` — non tranché, à valider avec lui avant de toucher au code.

## Lot 3 : OCR fiable, signature obligatoire, Lignes téléphoniques, liens partout, nouveaux entrants EPI (août 2026)

Nouveau lot de retours après le lot précédent (historique EPI/Outillage, import de scans en lot).

- **Bug OCR réel, pas une question de qualité de scan** : William a testé en important en lot les PDF *déjà générés par l'appli elle-même* (texte net, pas un vrai scan) — les premiers étaient bien lus puis ça devenait incohérent. Cause confirmée en consultant la doc officielle de Tesseract.js : `analyserLotEPI` appelait `Tesseract.recognize()` à chaque fichier, créant et détruisant un worker WASM à chaque appel — l'anti-pattern explicitement documenté par la librairie elle-même ("users should create a worker once... rather than running the above snippet for every image"). Corrigé : un seul `Tesseract.createWorker('eng')` créé avant la boucle, réutilisé pour tous les fichiers, terminé une fois à la fin.
- **Détection de signature bloquante** : William a précisé vouloir une lecture directe dans la case "Signature" du document (pas une simple case à cocher de confiance). Implémenté en best-effort : analyse de pixels (`detecterSignatureDataURL`) sur une bande large en bas-droite de la page rendue (la position exacte varie selon le nombre de lignes d'articles, d'où une zone de recherche généreuse plutôt que des coordonnées fixes), qui compte la proportion de pixels non-blancs. **Bloquant par défaut** sur l'import en lot ET l'émargement individuel (EPI et Outillage) : une fiche sans signature détectée ne peut pas être validée sans une confirmation explicite ("Forcer malgré tout"), l'aperçu miniature déjà présent permettant de vérifier visuellement avant de forcer. Assumé comme un heuristique, pas une garantie à 100% (ce n'est pas de l'OCR de texte).
- **Lignes téléphoniques, entité indépendante des téléphones** : William a précisé qu'un employé peut garder sa ligne (numéro/SIM/opérateur) en changeant d'appareil, ou l'inverse — le modèle initial (tout sur le même enregistrement `Materiel_IT`) ne le permettait pas. Nouvelles listes `Lignes_Telephoniques`/`Mouvements_Lignes_Telephoniques`, miroir exact du modèle `Materiel_IT`/`Mouvements_Materiel_IT` (mêmes patterns d'actions, même principe de détenteur courant dérivé du dernier mouvement). L'onglet "Matériel IT" devient un conteneur à sous-onglets (Téléphones / Lignes, extensible plus tard pour Ordinateurs — "en attendant les PC" dixit William), même principe que les sous-onglets EPI/Outillage. **Migration one-shot** : pour chaque téléphone existant ayant un numéro, crée la ligne correspondante avec le même détenteur actuel comme point de départ de l'historique (bouton "Migrer maintenant" dans le nouvel onglet Lignes, tant qu'aucune ligne n'existe encore).
- **Codes cliquables généralisés dans EPI/Outillage** : le pattern `.link-emp` (délégation de clic globale déjà en place partout ailleurs dans le dashboard) était absent des vues EPI/Outillage. Nouvelle fonction `lienEmpSiConnu(code, texte)` qui ne rend cliquable que les codes correspondant à un employé réel (les identifiants synthétiques des remises ponctuelles de groupe, ex. `PONCTUEL-...`, restent du texte brut).
- **Vue "Nouveaux entrants EPI"** : règle métier précisée par William — tout employé actif d'un service concerné par la dotation doit recevoir sa fiche "Entree" dès l'embauche, peu importe la date. Nouvelle carte en tête de l'onglet Dotations EPI listant les employés actifs avec une affectation EPI mais sans fiche cette année, avec pour chacun le besoin en articles vs le stock disponible (nouveau helper client `epiCalculerBesoinStock`, miroir exact de `trouverArticleCatalogue`/`TAILLE_FIELD_PAR_TYPE` côté serveur) et un bouton direct pour générer sa fiche.
- **Formulaire "Ajouter un employé" étendu** : William reçoit les demandes d'embauche par mail avec un tableau (service, tailles, kits) — le formulaire de création d'employé n'avait aucun champ EPI, il fallait repasser ensuite par la fiche employé. Ajout de l'affectation + 5 tailles directement à la création, avec la règle confirmée par William "taille veste = taille t-shirt" (auto-remplie, reste modifiable). Après création, si une affectation est renseignée, une alerte informative (non bloquante, décision validée avec William) liste les articles en stock insuffisant pour son profil — réutilise `epiCalculerBesoinStock`, aucune nouvelle action Worker nécessaire (les tailles sont sauvegardées via l'action existante `maj_taille_employe`, appelée juste après `ajouter_employe`).

## Rollback de session, export de sauvegarde et cartographie d'architecture (août 2026)

- **Incident constaté en tout début de session : deux dossiers de travail divergents.** Le dépôt git réel (`C:\Users\ral\immo-tracker`, remote `RAL974/immo-tracker`) avait un code à jour (dernier commit "Lot 3", 9 août) mais des documents `00_*`-`05_*`/`CLAUDE.md` figés au 6 août, ne mentionnant même pas "Lot 3". Un second dossier (`Desktop\Immos`, sans `.git`, sans `worker.js`/`package.json`/`tests/`) avait l'inverse : documents à jour au 9 août (mentionnant déjà "Lot 3") mais du code du 3 août. Signalé par William en cours de session. **Résolu** en resynchronisant les documents du dépôt git depuis la version la plus récente (`Desktop\Immos`), après vérification qu'elle correspondait bien à l'état réel du code (présence de l'entrée "Lot 3"). Le dossier `Desktop\Immos` reste à traiter séparément par William si des sessions y sont encore actives — ne pas repartir de ce dossier pour du travail futur sur le code.
- **Besoin exprimé** : un filet de sécurité pour revenir en arrière après une session de modifications ratée, sans jamais toucher à l'historique git partagé (pas de `reset --force`/`push --force` sur `main`, conformément au mode de fonctionnement du projet — push direct, solo, sans branche de préprod).
- **Outillage ajouté** : `npm run session:start` (pose un tag git local `session-AAAAMMJJ-HHMM` sur HEAD) et `npm run session:rollback` (liste les tags, demande confirmation explicite "OUI", puis `git revert` — jamais de réécriture d'historique — de tous les commits postérieurs au tag choisi ; ne pousse jamais automatiquement). Deux scripts Node purs (`scripts/session-start.js`, `scripts/session-rollback.js`), cohérents avec le principe "zéro dépendance" déjà en place pour `scripts/check-dashboard.js`.
- **Distinction explicite code vs données**, documentée dans le nouveau `PROCEDURE_ROLLBACK.md` : un rollback git ne touche que ce dépôt (PWA, Dashboard, Worker) — **jamais** les données déjà écrites dans SharePoint par une session avant qu'elle soit annulée. D'où la règle : exporter en JSON les listes SharePoint concernées **avant** toute migration ou import de masse.
- **Nouvel endpoint de lecture seule `?export_liste=<nom_liste>&token=<jeton>`** dans `worker.js`, protégé `requireAdmin` (même mécanisme HMAC que les actions gated existantes, transmis en paramètre d'URL car c'est un GET sans corps JSON — les autres actions gated le reçoivent via l'interception `window.fetch` du dashboard, qui ne patche que les POST). Liste blanche `EXPORTABLE_LISTS` des listes réellement utilisées par le Worker (voir point suivant). Bouton dashboard "💾 Exporter une liste (sauvegarde)" ajouté dans Utilisateurs → Outils de maintenance avancés, à côté des autres outils d'administration ponctuels.
- **Bug découvert et corrigé pendant l'implémentation** : la liste blanche `EXPORTABLE_LISTS` avait été rédigée d'après `02_MODELE_DONNEES.md`, qui inclut `Chantiers` parmi les listes SharePoint. Vérification faite dans `worker.js` (grep sur tous les appels Graph `GL + '/NomListe'`) : **aucune liste `Chantiers` n'est réellement utilisée** — `Code_Chantier`/`Nom_Chantier` sont de simples champs texte libre sur `Reservations`/`Mouvements`, et `chantiers.json` à la racine n'est référencé nulle part dans le code. Retiré de `EXPORTABLE_LISTS` (aurait échoué à l'export) ; `Absences` (liste réellement utilisée mais absente de la doc, voir plus bas) ajoutée à la place. Leçon retenue : vérifier une liste blanche contre le code réel, pas seulement contre la documentation.
- **Nouveau test `tests/security.export-liste.test.js`**, sur le même principe que `security.gated-actions.test.js` mais adapté : `export_liste` étant un endpoint GET (paramètre de requête), il n'est pas capturé par le mécanisme `GATED_ACTIONS`/interception `window.fetch` (réservé aux POST), donc pas couvert par le test existant. Le nouveau test vérifie explicitement que le bloc `export_liste` appelle `requireAdmin`, que la liste blanche est bien vérifiée avant tout appel Graph, que le dashboard transmet bien le jeton de session dans l'URL, et qu'il n'a pas été ajouté par erreur à `GATED_ACTIONS` (où il n'aurait aucun effet).
- **`ARCHITECTURE_GLOBALE.md` créé à la racine** : cartographie complète générée en lisant le code réel (`worker.js`, `app.js`, `dashboard.html`) plutôt que la documentation seule — schéma de la chaîne, inventaire des modules/écrans, les 74 actions du Worker classées par niveau de protection (25 `requireAdmin`, 33 `requireGarant`, 16 publiques dont une orpheline), les listes SharePoint et leurs relations, l'inventaire des fichiers du dépôt, les dépendances CDN.
- **Écarts doc/code trouvés au passage et documentés dans `ARCHITECTURE_GLOBALE.md` §7, non corrigés dans le comportement** (hors périmètre de cette session, qui ne devait modifier aucun comportement métier existant) :
  - Le module **Absences** (liste SharePoint `Absences`, action `signaler_absence`, onglet dashboard, capacités `ROLE_CAPS.absences`/`voitAbsences`) existe pleinement dans le code mais n'est mentionné nulle part dans `00_*`-`05_*`.
  - `Chantiers` référencé comme liste SharePoint dans `02_MODELE_DONNEES.md` alors qu'aucune liste de ce nom n'est utilisée en pratique (voir plus haut).
  - Deux fichiers JSON orphelins supplémentaires à la racine (`outillage_durees.json`, `outillage_grille_ajouts.json`), 0 référence dans le code — probablement les données sources d'une migration ponctuelle déjà appliquée puis jamais nettoyées du dépôt.
  - L'action Worker `maj_duree_amort` existe encore, **sans protection `requireAdmin`/`requireGarant`**, mais n'est plus appelée nulle part dans `dashboard.html` — un endpoint d'écriture public orphelin sur une colonne (`Duree_Amortissement`) documentée comme inerte depuis juillet 2026. Signalé mais non supprimé cette session (respect de la consigne de ne rien changer au comportement métier existant) — à traiter dans une session dédiée.
  - `ROLE_CAPS` (`app.js`) a plus de capacités que les « cinq capacités possibles » présentées en introduction de `03_REGLES_METIER_ET_ROLES.md` (`absences`, `voitAbsences` non documentées du tout ; `gererInventaire`/`compterInventaire` documentées plus loin dans le même fichier mais pas rattachées à la liste générale).
- **Vérification finale** : `npm run verify` (syntaxe + 33 tests, dont les 4 nouveaux) passe avant tout push, comme l'exige le hook `pre-push`.

## Refonte visuelle du dashboard — design system (août 2026)

- **Demande de William** : faire passer `dashboard.html` au niveau visuel d'un éditeur SaaS professionnel, sans changer aucun comportement fonctionnel — navigation, cartes KPI, tableaux, formulaires, badges de statut harmonisés, toasts/modales à la place des `alert()`/`confirm()` natifs, squelettes de chargement, états vides, tablette. Contrainte forte : zéro framework, zéro build, gabarits imprimables (fiches EPI/Outillage/relevé de sortie) strictement inchangés.
- **Incident constaté avant de commencer, résolu en amont** : `Desktop\Immos` (dossier de travail sans `.git`) avait une doc plus récente (mentionnant déjà "Lot 3") que le vrai dépôt `immo-tracker`, qui lui avait le code le plus à jour. Les deux sessions avaient divergé. Resynchronisé (`00_*`-`05_*` + `CLAUDE.md` copiés depuis `Desktop\Immos` vers `immo-tracker`) avant de commencer ce travail, comme la session précédente l'avait déjà fait une fois — `Desktop\Immos` reste un dossier à ne plus utiliser pour du travail sur le code, seul `C:\Users\ral\immo-tracker` est le dépôt git réel.
- **`design-system.css`** (nouveau fichier racine, simple `<link>` depuis `dashboard.html`) : palette dérivée du logo Espace Soleil (dégradé or/bronze sur noir/charbon) — plutôt que d'étaler l'or en aplat sur toute l'interface (peu lisible en grande surface), il sert d'**accent de marque** (CTA, indicateur actif, focus, liens) sur un habillage neutre charbon/blanc, pattern courant des interfaces pro. Typo, espacements, rayons, ombres et transitions sur une échelle cohérente. Variables de mode sombre prêtes (`:root[data-theme="dark"]`) mais **non activées** (aucun bouton de bascule, hors périmètre demandé).
- **Aucune variable CSS historique renommée** : `--blue`, `--orange`, `--green`, `--red`, `--yellow`, `--grey`, `--bg`, `--card` (utilisées des centaines de fois dans `dashboard.html`) sont conservées telles quelles, mais leur valeur dans le `:root` inline de `dashboard.html` a été changée en une seule ligne pour pointer vers les nouveaux tokens `--ds-*` (ex. `--blue:var(--ds-primary)`). Toute l'interface hérite donc de la nouvelle palette sans qu'aucun des centaines d'usages de `var(--blue)` dans le fichier n'ait eu besoin d'être touché — le principal levier de cette refonte, à risque de régression quasi nul.
- **Contraste texte blanc / fond doré vérifié avant de choisir la teinte finale** : un or trop clair (gold-500) tombait sous un ratio de contraste lisible pour les nombreux boutons `background:var(--orange);color:#fff` déjà existants dans le fichier. Choix d'un gold-600 plus soutenu (`#A67A1E`) qui reste clairement "or" tout en gardant le texte blanc lisible partout où c'était déjà le cas — zéro bouton à corriger individuellement.
- **Navigation** : sidebar et barre mobile modernisées en place (mêmes ids/classes, `#sidebar`, `.nav-item`, `#bottom-nav`, `.bnav-item`) — indicateur actif remplacé par une barre d'accent dorée + fond teinté (au lieu d'un bloc orange plein), transitions affinées.
- **Nouveau palier tablette** (`@media(min-width:769px) and (max-width:1024px)`) : sidebar transformée en rail d'icônes (60px, labels masqués, badges en pastille) plutôt que de basculer directement en navigation basse pensée pour un pouce — le breakpoint mobile existant (768px) n'est pas modifié.
- **Cartes KPI** : puce d'icône colorée (teinte sémantique reprise des classes `.badge` existantes) ajoutée devant chaque valeur — un seul point de rendu JS à modifier (`renderVueGenerale`), classe `.kpi-icon` au lieu d'un style inline.
- **Tableaux** : `.tbl-wrap` devient un conteneur à hauteur bornée (`max-height:65vh`) avec en-tête `<th>` collant (`position:sticky`) — pattern universel qui fonctionne quel que soit l'endroit où le tableau est monté (page, tiroir fiche, modale), puisque sticky reste toujours relatif à son propre conteneur scrollable. Zébrage discret + survol teinté d'or clair. Indicateur visuel (fond doré + flèche ▲▼) ajouté sur les boutons de tri déjà existants de l'onglet Dépôt (`sortDepot`), sans ajouter de nouveau comportement de tri.
- **Badges de statut harmonisés entre modules** : plusieurs modules affichaient le même concept avec un traitement visuel différent de celui des Immos — statut Matériel IT et Lignes téléphoniques en texte coloré simple converti en pastille `.badge` (même classes `bn`/`bh`/`ba` que les états d'immo) ; stock bas EPI/Outillage (texte coloré) converti en pastille `.badge` `bn`/`bu`/`ba` (les seuils métier de rupture, différents entre les deux catalogues, n'ont pas été touchés) ; bouton actif/inactif employé passé des couleurs hex dupliquées aux tokens `--ds-success-bg`/`--ds-danger-bg` (même source de vérité que les badges).
- **Toasts** (remplacent `alert()`) : `window.alert` est surchargé pour afficher un toast non bloquant au lieu du popup natif — **aucun des ~144 sites d'appel `alert(...)` n'a eu besoin d'être modifié**, puisque `alert()` ne retourne jamais de valeur exploitée par l'appelant. Le type de toast (succès/erreur/avertissement/info) est déduit automatiquement du texte du message (préfixe ✅/❌/⚠️ déjà utilisé de façon quasi systématique dans les messages existants).
- **Modale de confirmation** (remplace `confirm()`) : `confirm()` natif est synchrone, une modale stylée ne peut pas l'être — `confirmModal()` retourne donc une `Promise<boolean>`. Les **34 sites d'appel** de `confirm()` ont été convertis en `await confirmModal(...)` un par un (jamais en bloc automatisé, pour vérifier chaque contexte individuellement) : la plupart des fonctions englobantes étaient déjà `async` ; 5 fonctions top-niveau (`declarerVol`, `validerSortieDefinitive`, `declarerPanneDash`, `marquerImmoInactive`, `resoudrePanne`) et 2 gestionnaires `onclick`/`onchange` anonymes imbriqués (dans `renderTransferts`/`renderResa`) ont dû être rendus `async`. Comportement de gating vérifié bout en bout dans le navigateur (exécution suspendue à l'`await`, reprise correcte après clic) avant de considérer la conversion terminée.
- **Découverte incidente, non corrigée (hors périmètre)** : `declarerVol`, `marquerImmoInactive` et `resoudrePanne` ne sont en réalité **appelées nulle part** dans `dashboard.html` (aucune référence trouvée en dehors de leur propre définition, aucun dispatch dynamique `window[...]` dans le fichier) — du code mort préexistant, dans le même esprit que l'action Worker orpheline `maj_duree_amort` déjà relevée dans `ARCHITECTURE_GLOBALE.md`. Signalé pour une éventuelle session de nettoyage, non touché ici.
- **Squelettes de chargement** : `#loading-screen` (l'unique écran de chargement de l'app — les données sont chargées en un seul appel global, pas par onglet) remplacé par un aperçu squelette (4 blocs KPI + lignes de texte, animation shimmer) plutôt qu'un simple spinner, pour préfigurer la forme du contenu à venir.
- **États vides** : la classe `.es`, déjà utilisée par une trentaine de messages "Aucun·e..." à travers tous les modules, enrichie d'une icône et d'une mise en forme plus posée — un seul point de CSS à modifier profite à tous les écrans vides existants sans toucher au JS.
- **Palette Chart.js harmonisée** : les 3 graphiques (répartition circulation/dépôt, distribution des états, top détenteurs) utilisaient des couleurs hexadécimales figées correspondant à l'ancienne palette — remplacées par les valeurs de la nouvelle palette (or, vert, bleu/orange/gris déjà utilisés ailleurs pour les états).
- **Gabarits imprimables vérifiés strictement inchangés** : les 3 gabarits (fiches EPI, fiche Outillage, relevé de sortie) sont des documents HTML autonomes générés par `window.open('','_blank')` — jamais liés au `<style>`/`design-system.css` de la page parente, donc structurellement immunisés contre cette refonte. Vérifié malgré tout par comparaison **octet pour octet** avec le dernier commit (script Node comparant les 3 blocs `'<style>'+...+'</style></head><body>'+...` et leur template complet jusqu'à `</html>`) : les trois sont strictement identiques. Vérification visuelle complémentaire faite en générant une vraie fiche EPI de test dans le navigateur (via les fonctions réelles `epiFicheBodyHtml`/`EPI_FICHE_CSS_RULES`) : rendu bleu marine d'origine inchangé, fichier de test supprimé après coup.
- **Méthode de travail** : par tranches (navigation → KPI → tableaux → formulaires/badges → toasts → confirmation → squelettes/vides → tablette → charts → vérif impression), avec `npm run verify` après chaque tranche et vérification visuelle réelle dans un navigateur (serveur statique local + `.claude/launch.json`, contournant les limites de rendu d'un simple `file://`) plutôt qu'une relecture de code seule.
- **Aucune donnée réelle consultée** : toutes les vérifications visuelles ont été faites avec des données factices injectées côté client (le Worker de production n'a reçu aucun appel d'écriture) — le login réel n'a jamais été nécessaire.

## Application du design system à la PWA terrain (août 2026)

- **Demande de William** : étendre le design system créé pour le dashboard à la PWA terrain (`index.html` + `app.js`), en pensant explicitement au public réel — ~97 collaborateurs de chantier, sur smartphone, parfois en plein soleil, parfois avec des gants, parfois sans réseau (Mayotte). Question posée en aparté avant de commencer : mode sombre pour le dashboard — **confirmé hors périmètre pour la PWA** (un fond sombre est moins lisible en plein soleil), scope dashboard-only, timing laissé à l'appréciation de l'assistant — reporté à une session dédiée pour ne pas mélanger deux sujets sans rapport dans la même session.
- **Deux fichiers CSS concurrents découverts dans la PWA** : `style.css` (feuille externe) et un `<style>` inline dans `index.html`, tous deux définissant un `:root` avec les mêmes noms de variables (`--blue`, `--orange`...) et plusieurs classes en double (`.btn-tertiary` notamment, avec des valeurs différentes). L'inline gagne toujours la cascade (chargé après), rendant une partie de `style.css` silencieusement morte — un piège de désynchronisation si jamais l'ordre de chargement changeait. Les deux `:root` ont été alignés sur les mêmes tokens `--ds-*` plutôt que de refactoriser l'architecture (hors périmètre d'une session de style pur) ; `.btn-tertiary` réconcilié entre les deux fichiers.
- **Bonne surprise** : les couleurs de badges d'état de la PWA (`.etat-neuf/.etat-bon/.etat-use/.etat-abime/.etat-horsservice` dans `style.css`) étaient déjà, par le hasard d'un développement antérieur cohérent, strictement identiques aux couleurs `.badge .bn/.bb/.bu/.ba/.bh` du dashboard. Ces classes CSS se sont toutefois révélées **jamais utilisées** dans `app.js` (harmonisées quand même, sans effet visuel, par cohérence) — le vrai rendu des badges d'état passe par une fonction JS distincte, `ebadge()`, qui avait deux couleurs légèrement différentes du dashboard (Abîmé, Hors service) : corrigées pour pointer sur les mêmes tokens `--ds-*`. `rsLabel()` (statuts de réservation) suffixe un canal alpha directement sur une chaîne hexadécimale (`${c}22`) — incompatible avec `var(...)`, donc converti en valeurs hex littérales recopiées des tokens plutôt qu'en `var()`.
- **Cibles tactiles ≥48px** : mesuré au pixel près dans le navigateur (`getBoundingClientRect`) plutôt que déduit du CSS — `.btn` mesurait 47px (à 1px de la cible), `.btn-link` 34-39px, `.photo-btn-label` ~32px, le label de la case à cocher "chute de câble" ~20px de haut malgré une largeur pleine. Tout remonté à `min-height:48px` (floor qui survit aux surcharges de padding plus spécifiques comme `.btn-group .btn`), revérifié après coup : tous les boutons de tous les écrans testés mesurent désormais 48-53px.
- **CTA principaux ancrés en bas d'écran (accessibles au pouce)** : nouvelle classe utilitaire `.sticky-actions` (`position:sticky;bottom:0`), appliquée au bouton principal + son "Annuler"/"Retour" adjacent sur une dizaine d'écrans de formulaire. Choix technique validé par la mesure : `position:sticky` reste relatif à son propre conteneur (`.screen`, qui défile avec la page) — fonctionne quel que soit l'endroit où il est monté, sans JS, et cède naturellement la place une fois la fin réelle du contenu atteinte (pas de recouvrement permanent du bouton "Retour" qui suit parfois derrière). Vérifié par mesure de position avant/pendant/après défilement, pas seulement visuellement.
- **États "envoi en cours" anti double-soumission** : nouveau helper `setBusy(btn, libellé)`/`clearBusy(btn)` (généralise le pattern `dataset.busy` déjà utilisé une fois pour l'inventaire), appliqué aux 8 fonctions de soumission qui attendent réellement une réponse réseau avant tout changement d'écran (`accepterTransfert`, `validerForceAttribution`, `soumettreAbsence`, `soumettreLigneInventaire`, `soumettreReservation`, `validerModifResa`, `soumettrePanne`, `soumettreResolution`, `retraitConfirm2`). Chaque bouton passe `this` en argument à l'`onclick` (seul changement de signature — aucune fonction n'était appelée depuis un autre endroit, vérifié un par un avant modification). **`confirmerAvecEtat` volontairement exclue** : elle navigue déjà de façon optimiste vers l'écran de confirmation *avant* d'attendre le réseau (`showRecap()` appelé en premier), donc le risque de double-soumission y était déjà nul par un mécanisme différent, antérieur — ajouter un état "busy" n'aurait rien apporté. Cycle busy→clear vérifié de bout en bout dans le navigateur (bouton désactivé + libellé "⏳ Envoi..." pendant l'attente, restauré après réponse).
- **Flux de scan retravaillé** : état "📷 Démarrage de la caméra..." affiché avant le flux vidéo (auparavant rien, ou directement l'erreur de permission) ; confirmation systématique (vibration + toast "✅ Scanné !") sur chaque scan réussi, centralisée dans `startScanner()` plutôt que dupliquée dans chacun des 9 callbacks ; **repli de saisie manuelle générique**, injecté sous la zone de scan sur tous les écrans de scan (auparavant réservé au seul écran d'activation) — réutilise exactement le même callback qu'un scan réussi (`cb(codeDécodé)`), donc zéro logique dupliquée, et fonctionne même caméra bloquée. **Écran d'activation explicitement exclu** de cette injection générique : il a déjà son propre repli manuel (`activationManuelle()`, un `prompt()` dédié), dont le callback attend un format `code|nom` différent de ce qu'un humain taperait dans un champ texte simple — les faire cohabiter aurait cassé l'un des deux chemins silencieusement. Son bouton existant a été rendu plus visible (`.btn-link` gris 12px → `.btn-tertiary` pleine largeur 48px) pour répondre à la même demande ("bascule bien visible") sans dupliquer le mécanisme.
- **Bannière hors-ligne avec horodatage** : nouvelle fonction `marquerSyncReussie()` (appelée après chaque chargement réussi de `immos.json`/`employes.json`, les deux seuls fichiers mis en cache par `sw.js` — les appels au Worker sont sur une autre origine, jamais interceptés) écrit un horodatage en `localStorage`, uniquement si `navigator.onLine` est vrai au moment du fetch (un fetch qui aboutit alors qu'on est hors-ligne vient forcément du cache, pas d'une donnée fraîche — l'horodater comme "maintenant" aurait été trompeur). La bannière affiche "Hors ligne — données du [date/heure]" en réutilisant `fmtDT()` déjà existant, avec un repli explicite ("données jamais synchronisées") si aucun horodatage n'existe encore. Vérifié dans le navigateur en simulant `navigator.onLine=false` (les deux cas).
- **`sw.js`** : `design-system.css` ajouté à `APP_SHELL`, `CACHE_VERSION` passé à `v2`. **Gap découvert au passage** : `style.css` n'était lui-même jamais mis en cache explicitement (seul `app.js` l'était) — corrigé dans la même liste, cohérent avec l'objectif de la tâche (compléter la coquille applicative). Clonage de réponse synchrone du gestionnaire `fetch` (déjà correct depuis l'incident précédent, voir plus haut dans ce journal) non touché. Vérifié par un cycle complet désinscription → réinscription → inspection du cache : les 10 fichiers de la coquille sont bien présents.
- **Vérification systématique à 380px** : les 12 écrans les plus représentatifs testés un par un (`document.documentElement.scrollWidth` vs `clientWidth`) — aucun débordement horizontal détecté sur aucun.
- **Mode sombre dashboard : non traité cette session**, comme convenu — les variables `--ds-*` sombres restent prêtes (préparées la session précédente) mais sans bascule fonctionnelle. À faire dans une session dédiée si confirmé.

## Seuils d'alerte stock EPI + Outillage (août 2026)

- **Demande de William** : trois fonctionnalités indépendantes dans une même session (seuils d'alerte stock, campagne d'inventaire physique par scan, recherche globale dashboard), livrées une par une avec `npm run verify` entre chaque. Cette entrée couvre la première.
- **Colonne `Stock_Mini`** ajoutée sur `Catalogue_Articles_EPI` et `Catalogue_Outillage` (Nombre) — créée par William en tout début de session, avant même que le code ne soit écrit (étape bloquante communiquée en premier, comme pour chaque nouveau module).
- **Repli sur les seuils historiques codés en dur** : `0`/vide sur `Stock_Mini` → seuil par défaut de 5 (EPI) / 3 (Outillage), exactement les valeurs déjà utilisées avant cette fonctionnalité pour colorer les badges de stock. Décision pour que la fonctionnalité soit utile dès le déploiement (badges déjà corrects) sans obliger William à renseigner 40+ seuils avant que quoi que ce soit ne s'affiche, et sans changer le comportement des articles pas encore configurés.
- **Deux nouvelles actions Worker** (`maj_stock_mini_epi`, `maj_stock_mini_outillage`), protégées `requireGarant` (même population que les actions de stock existantes `editer_stock_outillage`/`bulk_maj_stock_epi`), ajoutées à `GATED_ACTIONS`. Édition un par un via `prompt()`, même pattern que l'édition de stock existante — pas de saisie en masse, jugée inutile pour un réglage ponctuel.
- **Suggestion de commande — réutilisation exacte de la logique "reste à distribuer"** plutôt qu'un nouveau calcul : côté Outillage, `calculerManquantsOutillage()` (déjà utilisé par l'onglet du même nom) est directement réemployé, juste agrégé par article. Côté EPI, qui n'a pas d'équivalent direct (la dotation est annuelle, pas un kit one-shot comme l'outillage), une nouvelle fonction `calculerManquantsEPI(annee)` reproduit le même principe que la carte "Nouveaux entrants sans dotation" déjà existante (même source : `epiEmployesSansFiche`, même calcul par employé via `epiCalculerBesoinStock`), simplement agrégée par article plutôt que listée par employé.
- Formule de suggestion (identique EPI/Outillage) : `à commander = besoin restant à distribuer + seuil mini − stock actuel`, plafonnée à 0. Vérifiée par calcul manuel sur un jeu de données factices avant d'être considérée correcte (pas seulement relue).
- **Carte récapitulative "articles sous seuil"** en tête de chaque onglet Stock (EPI et Outillage), cliquable pour filtrer directement la liste sur l'article concerné.
- **Nouvel onglet "🛒 Suggestion de commande"** ajouté aux deux modules, même emplacement dans la barre de sous-onglets (juste après "Stock").
- Aucune nouvelle capacité `ROLE_CAPS`/droit : réutilise `peutGererEPI`/`peutGererOutillage` déjà en place.

## Campagne d'inventaire physique des immobilisations par scan (roadmap item A1, août 2026)

- **Deuxième des trois fonctionnalités de la session** (voir entrée précédente pour le cadrage global). Reprend la roadmap item A1 (`05_ROADMAP_EVOLUTIONS_FUTURES.md`), jamais développée jusqu'ici, jugée dépendante de la pose préalable de QR codes/plaques sur les immos — supposée déjà en place ou en cours côté William pour que cette fonctionnalité ait un sens à l'usage.
- **Décision structurante : isolation totale vis-à-vis de `Mouvements`**. La logique "détenteur courant = dernier Mouvement" est le cœur de tout le reste de l'app (circulation, dépôt, analyses, amortissement, export comptable) — y toucher pour un scan d'inventaire aurait été le risque le plus élevé de cette fonctionnalité. Choix : deux nouvelles listes entièrement séparées (`Campagnes_Inventaire_Immos`, `Scans_Inventaire_Immos`), un scan n'écrit jamais de `Mouvement`, review explicite de ce point avant d'écrire la moindre ligne de code.
- **Deux nouvelles listes SharePoint annoncées avant codage** (colonnes exactes dans `02_MODELE_DONNEES.md`), même principe bloquant que pour chaque module précédent — création confirmée par William avant la mise en service réelle (le code est livré et testé en isolation dans l'intervalle, comme d'habitude).
- **Écarts calculés uniquement à partir de données déjà fiables** : par manque de signal de "détenteur théorique" au sens propre (rien dans le modèle actuel ne dit qui est censé avoir une immo à un instant T, hors dernier mouvement réel), le rapport se limite à deux écarts défendables avec les données existantes — site du scan ≠ `Immos.Site`, et immo scannée alors que `Immos.Actif = Non` (sortie du parc). Pas de tentative de deviner un "détenteur théorique" qui n'existe pas dans le modèle de données — aurait produit un rapport trompeur.
- **Bug trouvé par test en navigateur avant livraison, pas par relecture de code** : la première version du calcul du taux de couverture ("Immos vues") comptait toutes les immos scannées (y compris celles hors service/sorties) au numérateur, contre le total des immos actives au dénominateur — avec un jeu de données factice (2 immos actives, 1 sortie ; 1 active scannée, 1 active non scannée, la sortie scannée), affichait à tort "2/2 (100%)" au lieu de "1/2 (50%)". Corrigé en ne comptant au numérateur que les immos **actives** effectivement vues — une immo sortie scannée reste un écart, pas une preuve de couverture.
- **Scan PWA volontairement non protégé par jeton de session**, cohérent avec la contrainte du sujet ("respecte le modèle de confiance de la PWA terrain, pas de mot de passe") : `enregistrer_scan_inventaire_immo` suit exactement le même modèle que `reserver`/`transfert`/`ajouter_ligne_inventaire` (identité reçue du corps de la requête, pas de jeton), ajoutée à `PWA_SHARED_ACTIONS` dans `security.gated-actions.test.js` pour que le garde-fou anti-régression ne la signale pas à tort comme un oubli de protection. Accès à l'écran filtré côté PWA aux codes admin uniquement (`CONFIG.admins`), comme le reste de la section admin déjà présente sur l'écran d'accueil.
- **Lancement/clôture de campagne, à l'inverse, strictement `requireAdmin`** côté dashboard : une seule campagne active à la fois, sa clôture fige le rapport d'écarts — identité (`Cree_Par`/`Cloture_Par`) toujours résolue depuis `_auth.session.code`, jamais depuis le corps de la requête, conformément à la contrainte explicite du sujet.
- **Scan en continu côté PWA** : contrairement à tous les autres écrans de scan de l'app (un scan → une action → navigation), l'écran d'inventaire ré-arme la caméra automatiquement après chaque scan enregistré (`startScanner` gère déjà lui-même l'arrêt/redémarrage du flux vidéo précédent, réutilisé tel quel) — le geste terrain (scanner toutes les immos d'un dépôt à la suite) est répétitif par nature, contrairement aux autres flux qui traitent une immo puis reviennent à un menu.
- **Petit oubli corrigé au passage** : `ajouter_ligne_inventaire` (campagne de stock, déjà existante) manquait de `PWA_SHARED_ACTIONS` dans le test de garde-fou — gap pré-existant sans lien avec cette fonctionnalité, repéré en modifiant ce même fichier de test, corrigé dans la foulée plutôt que laissé de côté.
- Aucune nouvelle capacité `ROLE_CAPS` : l'accès dashboard réutilise `estAdmin()` (déjà utilisé pour d'autres actions strictement admin), l'accès PWA réutilise `CONFIG.admins` (déjà utilisé pour la section admin existante).

## Recherche globale dashboard (août 2026)

- **Troisième et dernière des trois fonctionnalités de la session** (voir les deux entrées précédentes pour le cadrage global). La plus petite des trois par surface de code, volontairement : sujet spécifié comme "purement client-side, aucune nouvelle action Worker" dès le départ, donc pas de nouvelle liste SharePoint ni de nouveau garde-fou de sécurité à concevoir.
- **Décision de conception principale : réutiliser plutôt qu'inventer**. Les immobilisations et employés ont déjà une fiche (panneau latéral `ouvrirFiche`) : la recherche s'y branche directement, aucun nouvel écran de détail. Les articles EPI/outillage n'ont pas de fiche individuelle et n'en ont jamais eu besoin ailleurs dans l'app — plutôt que d'en créer une pour ce seul usage, la sélection redirige vers l'onglet Stock déjà existant, pré-rempli avec la référence dans le champ de filtre déjà en place. Zéro nouvelle UI de détail construite.
- **Compromis assumé sur la fraîcheur des catalogues EPI/outillage** : la recherche lit `epiCatalogue`/`outilCatalogue`, qui ne sont chargés en mémoire qu'à la première ouverture de leur onglet respectif dans la session (comportement de chargement paresseux déjà en place, pas modifié par cette fonctionnalité). Un article EPI ne sera donc pas trouvable tant que l'onglet EPI n'a pas été ouvert au moins une fois — accepté plutôt que de forcer le chargement anticipé de toutes les données au démarrage du dashboard (coût réseau non justifié pour un gain marginal, les immos/employés étant de toute façon déjà chargés en premier).
- **Raccourci `/` avec garde anti-collision** : n'intercepte la frappe que si aucun autre champ texte n'a le focus (input/textarea/select/contenteditable), sur le modèle de GitHub/Slack — testé explicitement (frappe `/` dans le champ PIN de connexion ne détourne pas le focus).
- **Vérifié en navigateur avant livraison** (pas seulement relu) : recherche par n° de série d'immo, par nom d'employé, par référence EPI et par marque d'outillage, chacune retournant le bon groupe ; état vide correct ; seuil de 2 caractères minimum respecté (pas de recherche sur un caractère isolé, trop bruyant sur ~1000 immos) ; `/` focalise bien le champ ; Échap ferme le panneau et vide le champ.
- Aucune nouvelle capacité `ROLE_CAPS`/droit dashboard : la recherche elle-même est ouverte à tout utilisateur connecté (elle ne fait que filtrer des données déjà chargées pour lui), la navigation vers un article EPI/outillage revérifie `peutVoirEPI`/`peutVoirOutillage` au moment du clic.
- **Session terminée** : les trois fonctionnalités demandées sont livrées, chacune vérifiée par `npm run verify` (33/33 tests) avant de passer à la suivante. Deux nouvelles listes SharePoint restent à créer par William (`Campagnes_Inventaire_Immos`, `Scans_Inventaire_Immos`, colonnes détaillées dans `02_MODELE_DONNEES.md`) avant mise en service réelle de la campagne d'inventaire physique — étape bloquante communiquée en cours de session, comme pour chaque nouveau module.

## Audit et durcissement de sécurité (9-10 août 2026)

- **Demande de William** : après création par lui des listes `Campagnes_Inventaire_Immos`/`Scans_Inventaire_Immos` (session précédente), audit et durcissement de sécurité en 6 points — limitation de débit sur la connexion, audit d'exhaustivité des actions protégées, en-têtes de sécurité/CORS, scrubbing PII sur Sentry, absence de secrets dans le dépôt public, rapport de synthèse. Contrainte explicite et rappelée en tête de consigne : ne jamais casser le modèle assumé de la PWA terrain (badge scanné, sans mot de passe).
- **Limitation de débit** : verrou progressif en mémoire du Worker (Map au niveau module, pas de KV/Durable Object — reste dans la philosophie "zéro infrastructure" du projet, assumé "best effort" et documenté comme tel plutôt que présenté comme une garantie). Paliers 5/7/10 échecs → 30s/5min/15min. Un piège évité dès la conception : le dashboard sonde `verify_password` avec un mot de passe sentinel (`__probe__`) avant même que l'utilisateur ait tapé quoi que ce soit (pour savoir s'il doit créer un mot de passe ou en saisir un) — sans exclusion explicite, chaque connexion légitime aurait consommé une tentative avant de commencer. `reset_password` (admin) lève désormais aussi le verrou du code concerné, pour ne pas laisser un employé bloqué après une intervention légitime.
- **Vulnérabilité trouvée en creusant `set_password` pour brancher le verrou** : un flag `body.is_reset`, jamais envoyé par le dashboard (vérifié par grep) mais lu et respecté par le Worker sans aucune vérification d'identité, permettait de sauter la vérification de l'ancien mot de passe. Concrètement : n'importe qui connaissant le code d'un employé (les 97 codes terrain ne sont pas secrets — affichés sur les cartes BTP) pouvait écraser son mot de passe dashboard sans le connaître, juste en forgeant une requête POST avec `is_reset:true`. Corrigé en ne se fiant plus qu'à la présence réelle d'un hash existant (`withHash`) pour décider si l'ancien mot de passe est exigé — exactement le même critère que le flux légitime (`reset_password`, gated `requireAdmin`, efface le hash ; puis `set_password` sans hash à vérifier). Zéro changement de comportement réel puisque `is_reset` n'était de toute façon jamais envoyé — correction pure, sans régression possible.
- **Audit d'exhaustivité `GATED_ACTIONS`** : recompté par script indépendant (pas seulement relancé le test existant) — 27 `requireAdmin` + 35 `requireGarant` = 62 actions protégées, exactement les 62 entrées de `GATED_ACTIONS`, zéro écart. Le nombre total d'actions a grossi de 74 à 79 depuis le dernier inventaire (`ARCHITECTURE_GLOBALE.md`, 9 août) à cause des 5 actions ajoutées par la session précédente (seuils de stock, campagne d'inventaire immos) — toutes correctement classées, rien oublié. Seule anomalie confirmée : l'action orpheline `maj_duree_amort` (déjà signalée le 9 août, non traitée à l'époque pour respecter la consigne « ne rien changer au comportement métier » de cette session-là) — neutralisée cette fois sur le modèle déjà existant de `bulk_maj_immos` (`{success:false,error:'deprecated'}`), cohérent avec le fait que cette session est justement celle du durcissement.
- **CORS et en-têtes de sécurité** : `Access-Control-Allow-Origin: '*'` remplacé par une réflexion dynamique de l'origine réelle de la requête, limitée à `https://ral974.github.io` (repli sur cette même valeur si l'origine n'est pas reconnue — jamais de wildcard). N'affecte que les appels `fetch`/XHR cross-origin depuis du JS tiers, pas les visites directes d'URL (`?debug_*`, téléchargements de photos/FDS) ni les appels de la PWA/du dashboard eux-mêmes (même origine). Ajout groupé de `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`, `Strict-Transport-Security` sur toutes les réponses — un seul objet `cors` déjà partagé par toutes les réponses du fichier (~20 `new Response(...)`), donc un seul point de correction pour tout couvrir d'un coup.
- **Scrubbing Sentry** : constat de départ rassurant — aucun `Sentry.setUser`/`captureException`/`captureMessage` explicite nulle part dans le projet (vérifié par grep), donc pas de fuite directe déjà en place. Le risque réel identifié est plus subtil : les breadcrumbs *automatiques* de Sentry (clics DOM, URLs de requêtes fetch/XHR, logs console) pouvaient embarquer un code employé — en particulier via les nombreux éléments `.link-emp`/`.link-im` du dashboard, qui portent des attributs `data-emp`/`data-cim`/`data-nom` sur chaque code/immo cliquable de l'app. Plutôt que d'auditer un par un les milliers de `console.log`/clics possibles, un scrubber générique (`beforeBreadcrumb`/`beforeSend`) a été ajouté dans les deux fichiers (`index.html`, `dashboard.html`, dupliqué comme le reste de la config Sentry faute de build partagé) : les breadcrumbs de catégorie `ui.click` sont supprimés entièrement plutôt que scrubés (le risque d'un attribut `data-*` non prévu dépassait la valeur de debug d'un simple clic), et le reste passe par un scrubber heuristique par motif (codes dans des paramètres d'URL connus, "NOM Prénom"/"Prénom NOM"). Vérifié en navigateur : `Sentry.getClient().getOptions()` confirme les deux callbacks actifs, et un breadcrumb `ui.click` de test est bien renvoyé `null`.
- **Audit des secrets, la partie la plus sérieuse de cette session** : trois trouvailles réelles, pas seulement théoriques.
  1. `?debug_employes=1` (endpoint de diagnostic non authentifié par conception, comme tous les `?debug_*`) faisait un echo brut de la réponse Graph — `MotDePasse` (le hash PBKDF2) y compris. Corrigé par redaction du champ (`[redacted]`) sans toucher au reste de la réponse, pour que le diagnostic reste utile.
  2. `?materiel_it=1` et `?lignes_telephoniques=1` renvoyaient en clair, sans aucune authentification, les codes PIN/PUK/RIO/déverrouillage des cartes SIM réelles de l'entreprise (~40 téléphones) — une classe de sensibilité très différente d'une simple donnée de localisation d'immo : un PUK ou un RIO connu permet de déverrouiller une carte ou de porter un numéro à l'insu de l'entreprise. Protégés `requireGarant`, jeton transmis en paramètre d'URL (`&token=`) sur le même modèle que `?export_liste=` (GET, pas de corps JSON). Ces deux modules sont 100% dashboard (aucun écran PWA) : le durcissement ne touche donc jamais le modèle de confiance terrain.
  3. **La plus grave** : `materiel_it_catalogue.json`, le fichier source de la migration Matériel IT (toujours suivi par git, servi tel quel par GitHub Pages), contenait ces mêmes PIN/PUK/RIO/déverrouillage réels en clair, dans un dépôt **public**. Les champs ont été redactés dans l'arbre de travail. **William a choisi de réécrire l'historique** (`git filter-repo --path materiel_it_catalogue.json --invert-paths` puis force-push) plutôt que de laisser le commit d'origine (`b48a4f7`) accessible — opération destructive assumée en connaissance de cause (casse tout autre clone existant du dépôt ; aucun autre clone connu à ce jour). Sauvegarde complète du dépôt prise avant l'opération par précaution. **Recommandation transmise, indépendante du sort de l'historique git** : ces codes doivent être considérés comme compromis (ils ont été exposés publiquement pendant plusieurs jours) et idéalement changés auprès de l'opérateur (Free Pro) — la réécriture d'historique seule ne suffit pas si les valeurs elles-mêmes ne sont jamais renouvelées, et ne couvre de toute façon pas d'éventuels autres clones/caches hors de portée de ce dépôt.
  4. **Décision de William : le PIN partagé reste en l'état.** `dashboard.html` contient un code d'accès partagé en clair (`var PIN='ES974'`) affiché avant le sélecteur d'identité. Ce n'est pas la vraie barrière de sécurité (le mot de passe par employé, vérifié serveur, reste intact et maintenant protégé par le verrou anti brute-force) — plutôt un filtre "cosmétique" contre les visiteurs curieux. Question posée explicitement (le retirer / le garder en connaissance de cause / le remplacer) : William a choisi de le garder tel quel, décision produit assumée et documentée plutôt que changée unilatéralement.
- **29 nouveaux tests** (4 nouveaux fichiers), suite passée de 33 à 62 — chaque durcissement vérifié par un test qui échouerait si la régression réapparaissait (pas seulement relu). `npm run verify` avant chaque commit, comme toujours sur ce projet.
- Aucune des 6 corrections n'a demandé de toucher au modèle de confiance de la PWA terrain — vérifié explicitement à chaque étape (actions partagées PWA jamais gated, testé par `security.gated-actions.test.js`, module Matériel IT/Lignes téléphoniques 100% dashboard donc gatable sans impact terrain).

## Comment utiliser ce journal
Ajouter une entrée à chaque décision structurante : la date approximative, ce qui a été décidé, et surtout **pourquoi** (le contexte qui a motivé le choix). Ne pas y mettre le détail technique (qui vit dans le code et les autres documents) mais le raisonnement métier.

---

# Immo Tracker — Roadmap des évolutions futures

*Idées évoquées avec William en juillet 2026, non développées à ce stade. Ce document sert de mémoire pour ne pas perdre ces pistes et pour cadrer leur développement futur. Aucune de ces évolutions n'est un engagement ferme — à prioriser selon les besoins réels.*

## Proposée par William : module de gestion des temps

**Besoin exprimé :** report d'heures des collaborateurs (terrain ou ailleurs), saisie des congés, notes des managers sur les heures/travaux effectués.

**Analyse et mise en garde :** ce module change le périmètre de l'application (on sort du suivi d'immobilisations pour entrer en gestion des temps / RH). Deux angles distincts à ne pas confondre :

1. **Pré-pointage opérationnel par chantier** (recommandé) : un CT ou ouvrier déclare "tant d'heures sur tel chantier, telle date", pour ventiler les coûts et remonter une donnée exploitable. C'est un ajout naturel — l'infrastructure (employés, chantiers, rôles, auth, PWA mobile) s'y prête directement. Une liste SharePoint `Heures` (Code_Employe, Code_Chantier, Date, Nb_Heures, Note_Manager) suffirait techniquement.
2. **Gestion RH des congés/compteurs légaux** (à éviter en l'état) : implique des obligations légales (droit du travail), un risque d'erreur à conséquence salariale, et un possible doublon avec un outil paie déjà existant chez Electricité Services Réunion (à vérifier — Silae, PayFit, module EBP Paie ?). Ne pas construire de "faux outil RH" en interne sans validation de la direction / du service paie.

**Recommandation :** si ce module est lancé, le cadrer strictement comme "suivi opérationnel des heures par chantier" (donnée de gestion, pas de paie), avec validation manager et export — pas comme un système de gestion des congés légaux. Prévoir une phase de cadrage dédiée avant tout développement : qui saisit, qui valide, quel export, quelle articulation avec l'outil paie existant.

## Proposées par l'assistant

### A. Inventaire physique annuel assisté — deux sujets distincts, à ne pas confondre

**A1. Immobilisations (scan QR codes) — ✅ FAIT (août 2026)**, code livré et vérifié : lancement/clôture de campagne côté dashboard (`requireAdmin`), mode scan continu côté PWA (profils admin uniquement), rapport d'écarts (site ≠ théorique, immo sortie du parc scannée, immos non scannées) construit sans jamais créer de `Mouvement` — isolation totale vis-à-vis de la logique de détenteur courant existante. **En attente de la création de 2 listes SharePoint par William** (`Campagnes_Inventaire_Immos`, `Scans_Inventaire_Immos`, voir `02_MODELE_DONNEES.md`) avant mise en service réelle — suppose aussi la pose préalable de QR codes/plaques sur les immos. Détail complet dans `04_HISTORIQUE_DECISIONS.md`.

**A2. Stock d'articles/consommables — ✅ FAIT (août 2026)**, développé après clarification que le besoin réel décrit ci-dessus (au moment de la première rédaction de cette roadmap) concernait en fait ce sujet, distinct des immobilisations. Campagne de comptage manuel (pas de QR/codes-barres sur les articles), dépôt + chantiers actifs, comparaison quantités vs comptage précédent (import du comptage décembre 2025 comme référence). Détail complet dans `04_HISTORIQUE_DECISIONS.md`.

### B. Photos et constat d'état en image
À la réception ou au retour d'un matériel, possibilité de joindre une photo (stockage SharePoint). Utile en particulier pour les retours en mauvais état validés par un garant : preuve visuelle qui évite les litiges "c'était déjà abîmé avant". Techniquement : accès à l'appareil photo du navigateur mobile + stockage lié au mouvement.

### C. Coûts de réparation structurés + seuil de réforme — ✅ FAIT (août 2026)
Développé et déployé : coût structuré (colonne SharePoint `Cout_Reparation` sur `Mouvements`), saisie possible à la résolution d'une panne ou indépendamment (entretien, nouveau type de mouvement `Entretien`), double ratio (valeur d'achat ET VNC), seuil de réforme réglable (40/60/80%, défaut 60%) dans l'onglet Analyses. Détail complet dans `04_HISTORIQUE_DECISIONS.md`.

### D. Demandes de matériel planifiées à l'avance
Un CT peut demander du matériel pour une date future (ex. "2 perceuses + 1 échafaudage semaine 32 sur tel chantier"), au lieu du mode réactif actuel (réservation immédiate uniquement). Le gestionnaire dépôt voit un planning de demandes à préparer. Fait passer l'app du suivi réactif à la planification logistique — cohérent avec le métier de William (achats/logistique).

### E. Interface simplifiée pour Mayotte
Constat : le référent matériel à Mayotte (Logistique_Mayotte) est peu à l'aise avec l'informatique (imprime des documents, envoie des photos par email plutôt que d'utiliser l'app). Évolution : une vue ultra-simplifiée à 3 actions principales ("Je reçois", "Je rends", "Signaler panne"), sans les fonctions avancées, pour ce profil spécifiquement. Petit effort de développement, gain d'adoption potentiellement important sur le terrain à Mayotte.

### F. Digest de notifications hebdomadaire
Aujourd'hui : un email par mouvement (flux Power Automate existant). Évolution : ajout d'un digest hebdomadaire automatique récapitulant les points nécessitant une action (transferts en attente depuis plus de 7 jours, retours à valider, garanties expirant dans le mois). Évite que des actions en attente restent "oubliées" dans le flux continu d'emails individuels.

## Priorisation suggérée (à valider avec William)

1. ~~**A — Inventaire physique**~~ : **fait (août 2026)**, code livré pour les deux volets (stock A2, immobilisations A1) — consolide la fiabilité de la base de données sur laquelle s'appuient déjà l'amortissement, l'export comptable et la maintenance préventive.
2. **Module temps chantier** (cadré comme suivi opérationnel, pas RH) : valeur métier forte pour le pilotage des coûts de chantier.
3. **B — Photos / constat d'état** : effort modéré, réduit les litiges au quotidien.
4. ~~**C — Coûts de réparation + seuil de réforme**~~ : **fait (août 2026)**.
5. **D, E, F** : à considérer selon les retours d'usage une fois les priorités ci-dessus en place.

## Note pour toute reprise de ce document

Avant de développer l'une de ces pistes, revalider avec William : le besoin a-t-il changé, une contrainte nouvelle est-elle apparue (ex. outil RH externe déjà choisi), le périmètre reste-t-il pertinent ? Ce document est une mémoire d'intentions, pas un cahier des charges figé.

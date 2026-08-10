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
| Worker de recette (ajouté août 2026) | même `worker.js`, environnement `[env.staging]` de `wrangler.toml` — voir § Environnement de recette plus bas et `PROCEDURE_RECETTE.md` | Cloudflare Workers (ressource séparée) | https://immo-proxy-staging.ral-85d.workers.dev/ |
| Pages de recette (ajouté août 2026) | miroir de `index.html`/`dashboard.html`/`app.js`/... généré par `scripts/sync-staging.js`, jamais édité à la main | GitHub Pages (sous-dossier `staging/`) | https://ral974.github.io/immo-tracker/staging/ |
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

## Environnement de recette (staging, ajouté août 2026)

*Procédure complète (mise en place + workflow quotidien) : `PROCEDURE_RECETTE.md`. Raisonnement et
comparaison des options envisagées : `04_HISTORIQUE_DECISIONS.md`.*

Avant août 2026, tout changement était testé directement contre les données de production (1023+
immobilisations réelles) — risqué pour toute action d'écriture. Un second environnement, isolé au
niveau des **données** (jamais du code, qui reste strictement identique), permet de tester sans
conséquence :

- **Worker** : `worker.js` accepte un environnement `[env.staging]` (`wrangler.toml`) déployé comme
  une ressource Cloudflare séparée (`immo-proxy-staging`), connectée au même dépôt Git mais avec sa
  propre commande de build (`npx wrangler deploy --env staging`) et ses propres secrets Cloudflare.
  Le seul changement de code nécessaire : `SITE_ID` (et un `ENV_NAME` purement diagnostic, exposé en
  en-tête de réponse `X-Immo-Env`) sont désormais lus depuis des variables d'environnement
  (`SITE_ID_ENV`/`ENV_NAME_ENV`), avec repli sur les valeurs de production actuelles si elles sont
  absentes — comportement de production strictement inchangé tant que ces variables ne sont pas
  définies (vérifié par test, `tests/worker.staging-env.test.js`).
- **Données** : un **second site SharePoint**, entièrement séparé (mêmes noms de liste que la
  production, pas de préfixe) — préféré à l'alternative envisagée (mêmes listes préfixées `TEST_`
  sur le même site), qui aurait exigé de paramétrer ~150 occurrences littérales de noms de liste
  dispersées dans `worker.js`, avec un risque réel d'oubli (une seule occurrence non préfixée aurait
  écrit dans une vraie liste). Voir `04_HISTORIQUE_DECISIONS.md` pour le détail du calcul.
- **Pages web** : `staging/` est un sous-dossier du même dépôt/site GitHub Pages, miroir **strictement
  identique** de `index.html`/`dashboard.html`/`app.js`/`style.css`/`design-system.css`/`sw.js`/les
  logos (généré par `scripts/sync-staging.js`, jamais édité à la main — `npm run check` échoue si le
  miroir a dérivé). Seuls `manifest.json` (nom/couleur/URL de démarrage distincts) et
  `immos.json`/`employes.json` (catalogues **fictifs**) diffèrent volontairement.
- **Bascule** : détectée par le **chemin** de la page (`/staging/`), jamais par un paramètre d'URL —
  un chemin persiste au rechargement/partage/marque-page, un `?recette=1` se perd dès qu'on navigue
  sans le reporter. Un bandeau rouge permanent (« 🧪 RECETTE ») s'affiche dès que ce chemin est
  détecté, avant même la connexion au dashboard.
- **Déploiement** : `staging/` et la production se déploient depuis le **même commit** sur `main`
  (choix simple retenu plutôt qu'une branche git dédiée avec pipeline découplé — voir
  `04_HISTORIQUE_DECISIONS.md`) — `deploy.yml` n'a **pas été modifié**, il uploade déjà tout le dépôt
  tel quel. Le vrai test "avant que ce soit en ligne" se fait localement (serveur statique pointé sur
  `/staging/`), avant de pousser.

## Pseudonymisation d'employes.json — résolution de noms via le Worker (chantier en cours, août 2026)

*Raisonnement complet et statut détaillé : `04_HISTORIQUE_DECISIONS.md` et `SECURITE_ETAT.md`. Point de départ : `employes.json`/`immos.json` sont documentés depuis l'audit du 9-10 août comme des catalogues publics contenant des données personnelles (noms des ~99 salariés) — la direction a demandé de corriger ce point. `immos.json` ne contient aucune donnée personnelle (vérifié) ; seul `employes.json` est concerné.*

**⚠️ État actuel (transitoire, rien n'a encore été retiré des sources publiques)** : la nouvelle voie de résolution a été construite et testée, mais `employes.json` et `?employes=1` (Worker) continuent tous les deux de porter un champ nom en clair, exactement comme avant. C'est volontaire — voir le déroulé en 2 étapes plus bas. **Ne pas confondre « nouvelle voie posée » avec « exposition publique corrigée »** : tant que l'étape 2 (bascule) n'est pas faite, le risque RGPD documenté dans `SECURITE_ETAT.md` reste entier.

**Nouvel endpoint dédié `?noms_employes=1`** (worker.js) : renvoie uniquement `[{code, nom}]`, rien d'autre (ni poste, ni rôle, ni site, ni statut actif, ni indicateur de mot de passe — ces champs restent l'affaire de `?employes=1`). Contrairement à la quasi-totalité des actions sensibles du Worker, cet endpoint **ne peut pas être protégé par jeton de session** : il est appelé par la PWA terrain, dont le modèle de confiance (scan de badge, sans mot de passe) ne fournit jamais de session — voir `03_REGLES_METIER_ET_ROLES.md` § Autorisation côté serveur. Deux protections *best effort* à la place (aucune garantie cryptographique, documentées comme telles dans `SECURITE_ETAT.md`) :
- **Vérification d'origine** (`origineReconnue`, worker.js) : accepte uniquement les requêtes dont l'en-tête `Origin` (ou à défaut `Referer`) correspond à `ALLOWED_ORIGINS` (`https://ral974.github.io`, couvre aussi `/staging/`, même origine). Bloque la visite directe d'URL et les scripts qui n'envoient aucun des deux en-têtes — un attaquant qui les forge n'est pas arrêté.
- **Limitation de débit par IP** (`NOM_LOOKUP_ATTEMPTS`, Map en mémoire du Worker) : 20 appels/minute par IP, seuil volontairement large pour ne jamais bloquer un dépôt/atelier avec plusieurs téléphones derrière la même IP partagée. Même limite « best effort » que le verrou anti brute-force existant (isolate recyclable, pas de KV provisionné).

**Cache navigateur, PAS le service worker** : `sw.js` n'intercepte jamais les appels cross-origine au Worker (`immo-proxy.ral-85d.workers.dev` ≠ `ral974.github.io`, voir `fetch` handler de `sw.js`) — donc un futur mode hors-ligne pour les noms ne peut pas passer par le mécanisme de cache existant. Un cache applicatif dédié (`localStorage`, clé `immo_noms_resolus`) a été ajouté en parallèle dans `app.js` et `dashboard.html` (code dupliqué, pas de build partagé entre les deux — cohérent avec le reste du projet) : peuplé à chaque résolution réussie, réutilisé si l'appel échoue (hors-ligne, endpoint limité en débit, Worker indisponible). Dégradation gracieuse vers le **code seul** si aucune résolution n'a jamais eu lieu sur l'appareil (ex. toute première visite hors-ligne).

**Déroulé en 2 étapes, chacune vérifiée avant la suivante** (voir `04_HISTORIQUE_DECISIONS.md` pour le détail) :
1. **Fait** : nouvel endpoint + cache ajoutés, `chargerEmployes()` (app.js) et `loadEmployes()` (dashboard.html) rebranchés pour préférer le nom résolu par ce nouveau mécanisme — avec repli transitoire sur l'ancien champ nom de `?employes=1`/`employes.json` si la résolution échoue (zéro régression). Vérifié par des tests automatisés (`tests/worker.noms-employes-endpoint.test.js`) et par simulation en navigateur (réponses mockées : résolution réussie, échec avec repli sur l'ancien champ, cache réutilisé hors-ligne, non-régression du badge de scan qui ne dépend d'aucun des deux). **Pas encore déployé en production à ce stade.**
2. **À faire, sur feu vert explicite** : une fois l'étape 1 vérifiée en conditions réelles après déploiement, retirer le champ nom de `?employes=1` et basculer `employes.json` en version pseudonymisée (codes + poste uniquement). C'est cette étape qui ferme réellement l'exposition publique — l'étape 1 seule ne change rien à ce qui est aujourd'hui accessible publiquement.

**Hors périmètre de ce chantier, signalé séparément** (voir `SECURITE_ETAT.md` § Reste à faire) : `getNomResolver()` (worker.js) attache un nom résolu à de nombreux autres endpoints publics non authentifiés (`?dashboard=1` en tête — jusqu'à 5000 mouvements, chacun avec `nom_employe`), plus deux fichiers de migration one-shot déjà exécutée mais toujours publics avec des noms complets (`epi_personnel.json`, `materiel_it_mouvements.json`). Ampleur nettement plus grande que ce chantier — décision explicite de rester borné à `employes.json`/`?employes=1` pour cette session.

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

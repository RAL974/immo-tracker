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

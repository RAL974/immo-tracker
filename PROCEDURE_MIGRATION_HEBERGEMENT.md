# Procédure — Migration de l'hébergement (GitHub Pages → Cloudflare Pages) + passage du dépôt en privé

*Document de référence technique, à lire avant de démarrer la migration. Placé à la racine du
dépôt, au même niveau que les autres documents `NN_*.md`, `CLAUDE.md`, `PROCEDURE_RECETTE.md` et
`PROCEDURE_ROLLBACK.md` (pas de dossier `docs/` dans ce projet).*

## Contexte et objectif

Deux décisions liées, à exécuter ensemble :
1. **Passer le dépôt `RAL974/immo-tracker` en privé** — un commit orphelin (`b48a4f7`, la fuite
   PIN/PUK/RIO déjà corrigée par réécriture d'historique, voir `SECURITE_ETAT.md`) reste
   accessible par SHA direct tant que le dépôt est public.
2. **Migrer l'hébergement statique** de GitHub Pages vers Cloudflare Pages — le Worker Cloudflare
   (`immo-proxy` / `immo-proxy-staging`) ne bouge pas, seul l'hébergement des fichiers statiques
   (PWA, Dashboard, JSON) change.

Ces deux décisions sont liées parce que, sur le plan GitHub de William (**Free**), **GitHub Pages
ne peut être servi que depuis un dépôt public** — passer le dépôt en privé coupe donc
automatiquement le site GitHub Pages actuel. Il faut migrer l'hébergement *avant* de passer en
privé, avec une vraie période de transition, pour ne jamais couper le service aux ~97
collaborateurs terrain qui utilisent l'application au quotidien.

**Décisions déjà actées avec William avant rédaction de ce document** :
- Plan GitHub : **Free** (conséquence : voir ci-dessus).
- Nouvelle URL : un **sous-domaine du site existant `espace-soleil.re`** (ex.
  `immo.espace-soleil.re` — nom exact à confirmer au moment de la configuration), plutôt qu'un
  sous-domaine gratuit `*.pages.dev`. Conséquence directe : l'application sera servie à la
  **racine** de ce sous-domaine, sans reproduire le préfixe `/immo-tracker/` hérité de la
  convention GitHub "page de projet" (`utilisateur.github.io/repo/`).
- DNS d'`espace-soleil.re` : chez **OVH**, William y a accès.
- **La bascule du domaine personnalisé (CNAME chez OVH) ne se fera pas tout de suite** — William
  doit obtenir des validations avant. C'est un jalon à **moyen terme**, pas un préalable qui
  bloque le reste : la mise en place de Cloudflare Pages, le CORS, et toute la répétition générale
  via la recette peuvent démarrer immédiatement sur l'URL gratuite `*.pages.dev`, en attendant.

## Principe directeur

`worker.js`, `dashboard.html`, `app.js`, `manifest.json` sont des fichiers **uniques, partagés**
par la production et la recette (même commit, même branche `main` — `staging/` n'est qu'une copie
miroir synchronisée par `npm run sync:staging`, voir `PROCEDURE_RECETTE.md`). On ne peut donc pas
"migrer la recette" sans que le code touche potentiellement la prod au même moment.

Conséquence sur la méthode : les changements de code (élargissement CORS, etc.) s'appliquent
globalement dès le push, mais les **actions irréversibles côté utilisateurs réels**
(communication, remplacement du contenu sur l'ancien host, passage en privé) sont strictement
séquencées *après* une validation complète et réussie du parcours recette sur le nouvel
hébergement. La recette sert de répétition générale à risque nul (données fictives, aucun
utilisateur réel dessus) pour tout le mécanisme, avant de l'appliquer "pour de vrai" à la prod.

---

## Inventaire exhaustif des références à l'ancienne origine

*Vérifié directement dans le code, pas seulement déduit de la documentation existante.*

### 1. `worker.js` (partagé par les DEUX ressources Cloudflare : `immo-proxy` et `immo-proxy-staging`, même fichier)

- **`ALLOWED_ORIGINS = ['https://ral974.github.io']`** (ligne ~578) — utilisé par `corsOriginFor()`
  (en-tête CORS des réponses JSON) **et** par `origineReconnue()` (protection best-effort de
  `?noms_employes=1`). Un seul tableau, partagé par les deux environnements : impossible de
  changer le CORS "juste pour la recette" indépendamment de la prod.
- **`renderDigestHtml()`** (ligne ~420) : fallback `dashboardUrl =
  'https://ral974.github.io/immo-tracker/dashboard.html'`. Le flux Power Automate du digest
  hebdomadaire (`?digest=1`) n'envoie jamais de `dashboardUrl` — ce fallback codé en dur est donc
  **la valeur réellement utilisée** dans les e-mails de digest actuels.

### 2. Fichiers statiques racine (auto-synchronisés vers `staging/` par `npm run sync:staging`, sauf mention contraire)

- `dashboard.html` — `EPI_FICHE_LOGO_URL` (fiches EPI imprimables/PDF) : URL absolue vers le logo.
- `dashboard.html` — `LOGO_URL` (relevé de matériel à restituer, sortie d'employé) : idem.
- `app.js` — `BRASSEUR_FICHE_LOGO_URL` (fiches "Brasseur", PWA terrain) : idem.
- **`manifest.json`** — `start_url: "/immo-tracker/"`. **Non auto-synchronisé** (exclu
  volontairement de `sync-staging.js`) : `staging/manifest.json` a sa propre valeur
  (`start_url: "/immo-tracker/staging/"`, nom/couleur "RECETTE" distincts) et doit être édité
  séparément.
- Pas de clé `scope` explicite dans `manifest.json` : repose sur le comportement par défaut du
  navigateur. À fixer explicitement (`"scope": "/"`) pendant la migration pour lever toute
  ambiguïté sur la nouvelle origine.

### 3. `sw.js` — aucune modification de code nécessaire

`APP_SHELL` n'utilise que des chemins relatifs (`./index.html`, etc.) et `self.location.origin`
pour filtrer les requêtes interceptées. Le sujet du service worker dans cette migration n'est pas
"le faire pointer ailleurs" (il fonctionne déjà correctement sur n'importe quelle origine) mais
**neutraliser proprement celui déjà installé chez les utilisateurs sur l'ANCIENNE origine** — voir
Phase D.

### 4. Détection recette/prod — non affectée par le changement d'origine

`IS_RECETTE` (`app.js`, `dashboard.html`) teste `location.pathname.indexOf('/staging/')`, **pas**
l'origine. Tant que la structure relative `/staging/...` est reproduite sur le nouvel hébergement,
la bascule Worker prod/recette continue de fonctionner sans changement de code — un point qui
réduit sensiblement le risque de cette migration.

### 5. QR codes physiques — vérifié, aucun risque

Le scanner (`Html5Qrcode`, `startScanner()` dans `app.js`) traite systématiquement la valeur
décodée comme un **code métier brut** (`IM000123`, comparaisons directes du type
`code.startsWith('IM')`, `code !== codeIM`...), jamais comme une URL à parser. Aucune génération
de QR code n'existe dans le dépôt (recherche `QRCode`/`toDataURL` : uniquement compression JPEG et
rendu PDF). **Les plaques/étiquettes physiques sur les immos encodent le code immo seul — la
migration d'hébergement n'a strictement aucun impact dessus.**

### 6. Tests automatisés à mettre à jour dans le même commit que `worker.js`

`tests/worker.security-headers.test.js`, `tests/worker.noms-employes-endpoint.test.js`,
`tests/worker.staging-env.test.js` assertent tous `'https://ral974.github.io'` en dur (en-tête
`Origin` envoyée et/ou valeur `Access-Control-Allow-Origin` attendue). Les oublier casse
`npm run verify` et donc le hook `pre-push` (voir `README.md`).

### 7. Hors dépôt — à vérifier manuellement par William

- **Flux Power Automate "Notification_Mouvement_Immo"** (e-mail par mouvement) : contenu du
  modèle non accessible depuis ce dépôt — vérifier un éventuel lien codé en dur vers le dashboard.
- **Flux Power Automate du digest hebdomadaire** : aucune URL codée en dur côté flux lui-même (il
  relaie simplement les champs `html`/`objet` renvoyés par `?digest=1`) — corrigé automatiquement
  en corrigeant le fallback `renderDigestHtml()` côté `worker.js` (point 1 ci-dessus). Rien à
  changer côté flux Power Automate pour ce cas précis.
- **Réglages Sentry** (projet de William sur sentry.io) : DSN inchangé (pas un secret, pas lié à
  l'origine), mais si une allow-list de domaines/référents est configurée côté projet (option
  native Sentry), y ajouter la nouvelle origine.
- **Favoris / icônes "Ajouter à l'écran d'accueil"** installées par les ~97 collaborateurs terrain
  et les comptes Encadrement/dashboard : traité comme point de communication utilisateur en
  Phase D, pas comme point technique.

---

## Déroulé, phase par phase

### Phase A — Cloudflare Pages en parallèle, sur l'URL gratuite (additif, zéro impact, réversible à 100%)

**Peut démarrer immédiatement, sans attendre la validation OVH.**

**A1. Créer le projet Cloudflare Pages** (dépôt encore public à ce stade), déploiement statique
pur (pas de commande de build, racine du dépôt = racine servie), connecté à `main`. Publie
automatiquement `/` (contenu prod actuel) et `/staging/` (miroir recette) sur l'URL
`<projet>.pages.dev` par défaut, **sans toucher à rien côté github.io**.
- *Réversibilité* : suppression du projet Cloudflare Pages, aucune trace ailleurs.
- *Test de validation* : les deux chemins se chargent (HTML/CSS/JS) sur `<projet>.pages.dev`, mais
  les appels au Worker échouent encore (CORS) — attendu à ce stade.
- *Ce qui casse si on s'arrête là* : rien.

**A2. Élargir `ALLOWED_ORIGINS` dans `worker.js`** pour **ajouter** `https://<projet>.pages.dev`
(sans retirer `https://ral974.github.io`) ; mettre à jour les 3 fichiers de tests en conséquence
(ajout d'assertions, aucune suppression). `npm run verify` doit rester vert. Un seul commit,
déployé automatiquement sur les deux ressources Worker (même fichier `worker.js`).
- *Réversibilité* : revert du commit.
- *Test de validation* : `fetch()` depuis la console du navigateur sur `<projet>.pages.dev` vers
  `immo-proxy` **et** `immo-proxy-staging` (endpoints `?debug_*`, lecture seule) réussit sans
  erreur CORS.
- *Ce qui casse si on s'arrête là* : rien — double hébergement passif, github.io reste la seule
  URL réellement utilisée par quiconque.

**A3 (moyen terme, gaté sur les validations de William) — Domaine personnalisé.** Une fois les
validations obtenues : Cloudflare Pages → Custom domains → ajouter le sous-domaine retenu (ex.
`immo.espace-soleil.re`). Cloudflare fournit une cible CNAME (généralement `<projet>.pages.dev`) :
créer l'enregistrement **CNAME** correspondant chez **OVH** (zone DNS d'`espace-soleil.re`).
Abaisser le TTL du sous-domaine avant cette étape si un délai de propagation court est souhaité.
Cloudflare provisionne le certificat TLS automatiquement une fois le CNAME validé. Ajouter aussi
cette nouvelle origine à `ALLOWED_ORIGINS` (même logique additive qu'en A2).
- *Réversibilité* : retirer le CNAME chez OVH + retirer le domaine personnalisé côté Cloudflare
  Pages — `*.pages.dev` continue de fonctionner en repli, github.io inchangé.
- *Test de validation* : `https://immo.espace-soleil.re/` répond (certificat valide, pas
  d'avertissement navigateur), en parallèle de `<projet>.pages.dev/` qui continue de fonctionner.
- *Ce qui casse si on s'arrête là* : rien — toujours additif.
- ⚠️ **Cette étape est un préalable bloquant pour la Phase D** (la bascule finale doit se faire
  directement sur l'URL définitive `espace-soleil.re`, jamais sur `*.pages.dev`, pour ne pas faire
  vivre deux migrations d'affilée aux 97 collaborateurs terrain).

### Phase B — Répétition générale complète via le chemin recette ("le staging migre en premier")

**Peut démarrer dès la fin de A2, sur `<projet>.pages.dev` (pas besoin d'attendre A3).**

**B1.** Dérouler l'intégralité du parcours `PROCEDURE_RECETTE.md` mais depuis
`<projet>.pages.dev/staging/` : connexion dashboard recette, scan caméra, transfert, réservation,
génération PDF EPI (html2canvas/jsPDF), mode hors-ligne (installer le service worker depuis la
nouvelle origine, couper le réseau, vérifier la coquille applicative).

**B2.** **Installer réellement la PWA de recette** ("Immo Tracker (test)") depuis cette nouvelle
URL sur un téléphone de test — pratique concrète du point le plus délicat de cette migration (voir
Phase D) dans un cadre entièrement sans risque, avec des données 100% fictives.

- *Test de validation* : bandeau rouge "RECETTE" visible en permanence (confirme le bon Worker
  ciblé), toutes les actions passent, `npm run check` (`check-staging-sync.js`) toujours vert.
- *Ce qui casse si on s'arrête là* : rien, uniquement des données fictives.

### Phase C — Préparation du contenu de bascule (toujours sans effet utilisateur tant que non poussé)

**C1. Structure d'URL** : racine (`https://immo.espace-soleil.re/` et `/staging/`), déjà tranchée
— pas de préfixe `/immo-tracker/` à reproduire.

⚠️ **Mise en garde à respecter strictement** : `manifest.json` est un fichier **partagé** avec la
prod actuelle sur github.io. Le modifier (`start_url` racine) *avant* la bascule finale changerait
ce que voit aussi github.io (risque limité : n'affecte que les installations **fraîches** faites
depuis l'ancienne URL pendant la fenêtre de transition, jamais les PWA déjà installées — un
navigateur ne relit pas `start_url` pour une icône déjà posée sur l'écran d'accueil). Pour
supprimer ce risque plutôt que l'accepter, ce changement doit être regroupé dans le **même
commit** que le remplacement du contenu de l'ancien host (Phase D, étape D2) — à cet instant précis,
plus personne ne peut "installer fraîchement" depuis github.io puisque son contenu devient la
page de redirection.

**C2.** Préparer (sans pousser tant que la Phase D n'est pas déclenchée) les changements de
contenu :
- Fallback `dashboardUrl` dans `renderDigestHtml()` (`worker.js`).
- `EPI_FICHE_LOGO_URL` / `LOGO_URL` / `BRASSEUR_FICHE_LOGO_URL` (`dashboard.html`/`app.js`).
- Les deux `manifest.json` (racine + `staging/`, édités indépendamment).
- Mise à jour documentaire (`01_ARCHITECTURE_TECHNIQUE.md`, `CLAUDE.md`, etc.) — cosmétique, zéro
  impact fonctionnel, mais évite une documentation mensongère dès la bascule.

**C3.** Préparer les deux fichiers de bascule pour l'ancien host (github.io) :
- **Page de redirection statique** (remplace `index.html`/`dashboard.html` à la racine du dépôt
  côté github.io) : HTML autonome, `<meta http-equiv="refresh">` + lien cliquable +
  `location.replace()` en JS, message explicite ("Immo Tracker a déménagé — réinstalle
  l'application depuis ce lien : [nouvelle URL]").
- **Service worker "fossoyeur"** (remplace `sw.js`) : à l'activation,
  `self.registration.unregister()` + suppression de tous les caches existants (`caches.keys()` →
  `caches.delete()` pour chacun). Sans ce mécanisme, une PWA déjà installée continuerait de servir
  sa coquille en cache au lieu de charger la page de redirection, potentiellement pendant
  plusieurs jours (un navigateur ne revérifie pas un service worker à chaque lancement de l'app).
- Ces fichiers de bascule ne doivent **pas** être écrasés par un `npm run sync:staging` ultérieur
  avant que `/staging/` soit lui-même décommissionné — à isoler proprement de sorte que la bascule
  ne touche que les chemins racine, `/staging/` continuant de fonctionner normalement sur la
  nouvelle URL tant qu'on ne décide pas explicitement de l'arrêter aussi.

### Phase D — Bascule de production (point de non-retour progressif)

**Ne démarre qu'une fois A3 (domaine personnalisé) validé et Phase B concluante.**

**D1. Communication aux utilisateurs, AVANT bascule** (~97 collaborateurs terrain + Encadrement) :
date annoncée à l'avance, explication qu'une réinstallation sera nécessaire, capture d'écran du
geste "supprimer l'icône actuelle / réinstaller depuis le nouveau lien". Canal, contenu exact et
expéditeur : décision William (voir liste finale).

**D2.** Un **seul commit/push** regroupant :
- Le contenu de redirection + service worker fossoyeur (C3) sur les chemins racine de l'ancien
  host.
- La structure finale (`manifest.json` racine, C1/C2) sur le nouveau host.

...pour qu'il n'existe jamais un instant où le manifeste dit une chose et l'hébergement réel en
dit une autre.
- *Réversibilité* : `git revert` du commit tant que le dépôt reste public et Pages actif.
- *Test de validation* : navigateur "propre" (jamais visité) sur l'ancienne URL → page de
  redirection puis bascule effective. Appareil ayant déjà le SW/PWA installé → détecte la mise à
  jour du service worker (peut prendre jusqu'à ~24h ou nécessiter un relancement complet de l'app
  selon le navigateur), désinstalle son propre cache, affiche la redirection au lancement suivant.
- *Ce qui casse si on s'arrête là* : **attendu et assumé** — les icônes PWA déjà installées ne
  rouvrent plus l'app réelle mais un message de redirection (une PWA installée ne "suit" pas un
  changement d'origine ; ce n'est pas un bug, c'est le comportement documenté et pratiqué en B2).
  Les nouvelles installations, elles, fonctionnent normalement dès cette étape.

**D3. Fenêtre de transition** (durée à définir avec William — voir décisions finales ; sur plan
Free, à traiter **large plutôt que serrée**, puisque le passage en privé coupera la page de
redirection d'un coup, sans repli). Les deux hébergements coexistent : github.io affiche la
redirection, `espace-soleil.re` est la vraie app. Suivre Sentry (tag `environment`) pour objectiver
la décroissance du trafic sur l'ancienne origine au fil des semaines.

**D4.** Une fois la fenêtre passée :
- Vérification manuelle du flux Power Automate "Notification_Mouvement_Immo" + réglages Sentry
  (point 7 de l'inventaire).
- **Passage du dépôt en privé.** Sur ce plan Free, cet acte coupe net GitHub Pages : aucune
  désactivation manuelle séparée à faire, mais aussi aucun filet — s'assurer que plus personne
  n'a besoin de la page de redirection avant de basculer, puisqu'elle disparaît instantanément
  avec le dépôt (github.io renverra une page d'indisponibilité, pas la redirection).

### Phase E — Ce qui devient possible une fois le dépôt privé

**E1.** Demande au support GitHub pour la purge définitive du commit orphelin `b48a4f7` (déjà
recommandée dans `SECURITE_ETAT.md`) — devient une mesure de défense en profondeur plutôt
qu'urgente, le dépôt privé bloquant déjà l'accès public normal à ce commit et à tout le reste de
l'historique/du code.

**E2.** Retirer `https://ral974.github.io` d'`ALLOWED_ORIGINS` dans `worker.js` (+ mise à jour des
3 fichiers de tests en conséquence) — n'est plus nécessaire, referme la porte pour tout clone
existant du dépôt qui pointerait encore vers l'ancien Worker.

**E3.** Nettoyage documentaire final (`01_ARCHITECTURE_TECHNIQUE.md`, `CLAUDE.md`,
`04_HISTORIQUE_DECISIONS.md` — entrée de clôture du chantier, retrait de toute mention de
github.io comme hébergement actif).

---

## Croisement avec `SECURITE_ETAT.md` / `PROCEDURE_ROLLBACK.md`

- `npm run session:start` / `npm run session:rollback` (existants, voir `PROCEDURE_ROLLBACK.md`)
  couvrent le code de cette migration comme n'importe quelle autre session — poser un repère en
  tout début de Phase A. Le rollback par `git revert` reste valable tant que le dépôt est
  public/Pages actif (Phases A à D) ; **après la Phase E** (privé, `ALLOWED_ORIGINS` nettoyé), un
  retour arrière complet nécessiterait de rouvrir le dépôt en public, de réactiver Pages et de
  rétablir l'ancienne origine dans le code — réversibilité **nettement réduite** au-delà de ce
  point, à noter explicitement avant de s'y engager.
- `immos.json` / `employes.json` restent des fichiers publics servis par le nouvel hébergement, par
  choix de conception déjà documenté et **inchangé** par cette migration (le passage en privé du
  *dépôt source* n'a aucun effet sur ces fichiers, déjà pseudonymisés/expurgés séparément — voir
  `SECURITE_ETAT.md`). À rappeler pour éviter toute confusion : **"dépôt privé" ne veut pas dire
  "site fermé au public"** — l'application reste un site web accessible à tous, c'est le code
  source et l'historique git qui deviennent privés.
- Aucune donnée SharePoint n'est touchée par cette migration (uniquement hébergement statique +
  CORS Worker) — pas d'étape d'export de sauvegarde de données nécessaire au sens de
  `PROCEDURE_ROLLBACK.md`.

---

## Décisions déjà tranchées par William

- Plan GitHub : **Free**.
- URL cible : sous-domaine d'**espace-soleil.re** (nom exact à confirmer, ex.
  `immo.espace-soleil.re`).
- DNS d'espace-soleil.re : chez **OVH**, accès confirmé.
- Structure d'URL : **racine** (conséquence du sous-domaine dédié).
- **La bascule OVH (Phase A3) se fera à moyen terme**, après obtention de validations par William —
  ce n'est pas un préalable qui bloque les Phases A1/A2/B/C, seulement la Phase D.

## Décisions restant à valider par William

1. **Nom exact du sous-domaine** (`immo.espace-soleil.re` ou autre) — à trancher au moment de la
   Phase A3.
2. **Canal et contenu exact de la communication** aux ~97 collaborateurs terrain + Encadrement, et
   qui l'envoie.
3. **Durée de la fenêtre de transition** (Phase D3) avant décommissionnement effectif — à traiter
   large plutôt que serrée, vu l'absence de filet une fois le dépôt passé en privé (plan Free).
4. **Date de bascule cible** (Phase D2) — à caler une fois la Phase A3 (domaine personnalisé)
   validée et la Phase B jugée concluante.
5. **Timing de la demande de purge GitHub** du commit orphelin — avant ou après le passage en
   privé ? Recommandation de ce document : **après**, ce n'est qu'une mesure de défense en
   profondeur secondaire une fois le dépôt déjà privé.

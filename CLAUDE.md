# Immo Tracker — Index de connaissance projet (lu automatiquement par Claude Code)

*Ce fichier est lu automatiquement à l'ouverture du dépôt. Il doit rester un **index court** — les
6 documents `00_*` à `05_*` (plus les documents de procédure listés plus bas) restent la seule
source détaillée. Ne pas renommer ni déplacer ce fichier hors de la racine du dépôt. Ne pas y
recopier de contenu détaillé/historique : si une info a une date ou un "pourquoi", elle va dans
`04_HISTORIQUE_DECISIONS.md`, pas ici.*

## Qui, quoi, pourquoi (résumé)

**Immo Tracker** est l'application de suivi des immobilisations et du parc matériel d'Electricité
Services Réunion (La Réunion + Mayotte), développée et maintenue seul par William (Responsable
Achats & Logistique, autodidacte dev). Elle remplace un suivi Excel manuel. Deux interfaces :
**PWA terrain** (`app.js`+`index.html`, collaborateurs) et **Dashboard** (`dashboard.html`,
encadrement/admin). Détail complet, chiffres clés et statut d'avancement → `00_CONTEXTE_PROJET.md`.

## Règles permanentes de travail

- **Avant toute livraison** : `node --check` sur `worker.js`/`app.js`, extraction+check des
  `<script>` de `dashboard.html` (`scripts/check-dashboard.js`) — voir « Commandes utiles » ci-dessous.
- **Toujours vérifier après un push** : déploiement GitHub Pages (onglet *Actions*) et déploiement
  Cloudflare Worker (onglet *Deployments*) — un Worker cassé coupe l'API pour tout le monde
  immédiatement, contrairement à un bug PWA/Dashboard.
- **Avant toute migration/import en masse** : exporter d'abord en JSON les listes SharePoint
  concernées (`PROCEDURE_ROLLBACK.md` § export). Un rollback git ne restaure jamais les données
  SharePoint.
- **Piste de diagnostic en cas d'erreur SharePoint `Field 'X' is not recognized`** : vérifier le nom
  **interne** réel de la colonne (`?debug_columns=<liste>`), jamais se fier au nom affiché — deux
  incidents distincts (`Fabriquant`/`Fabricant`, `Code_deverouillage`) l'ont déjà démontré, voir
  `04_HISTORIQUE_DECISIONS.md`.
- **Ne jamais deviner/corriger une donnée métier fournie par William sans validation** (ex. table
  de correspondance tailles EPI, jugée incohérente à tort puis confirmée correcte par lui).
- **Après chaque évolution significative** : mettre à jour `04_HISTORIQUE_DECISIONS.md` (et les
  autres documents `00-05` concernés) pour que la base de connaissance reste fidèle au code réel —
  voir aussi la 3ᵉ règle du chantier Industrialisation 2.0 ci-dessous, qui la rend obligatoire à
  chaque session.

## Règles du chantier « Industrialisation 2.0 »

Chantier en cours visant à faire évoluer la solution vers des pratiques d'outillage plus robustes,
sans renier les choix fondateurs du projet (zéro coût, zéro build, un seul développeur). Règles à
respecter pour tout travail relevant de ce chantier :

- **Le principe zéro build reste la règle** : modules ES natifs côté PWA/Dashboard (pas de
  bundler, pas d'étape de compilation pour ce qui s'exécute dans le navigateur) ; côté Worker,
  `wrangler` peut assembler plusieurs modules au déploiement (`main` dans `wrangler.toml` peut
  pointer vers un point d'entrée qui importe des modules) — c'est la seule construction tolérée,
  et elle reste transparente (pas de build à lancer soi-même, pas de dépendance npm à installer).
- **Aucune donnée réelle n'entre jamais dans le dépôt** : ni noms, ni codes PIN/PUK/RIO, ni aucune
  autre donnée de production. Seules des fixtures synthétiques sont commitées (voir l'incident de
  fuite `materiel_it_catalogue.json` dans `04_HISTORIQUE_DECISIONS.md`, qui a motivé cette règle).
- **Toute session se termine par `npm run verify` vert ET une entrée datée dans
  `04_HISTORIQUE_DECISIONS.md`** — pas l'un sans l'autre.
- **Ne jamais faire grossir `worker.js`, `app.js` ou `dashboard.html`** : tout nouveau code va dans
  un module séparé, importé par le fichier principal plutôt qu'ajouté en ligne.
- **La recette se fait sur staging, jamais sur la production** — voir `PROCEDURE_RECETTE.md` pour
  l'environnement dédié (Worker, site SharePoint et Pages séparés).

## Quel document lire pour quel sujet

| Sujet | Document |
|---|---|
| Vue d'ensemble, chiffres clés, statut d'avancement | `00_CONTEXTE_PROJET.md` |
| Composants techniques, URLs, déploiement, pièges connus, environnement de dev assistant | `01_ARCHITECTURE_TECHNIQUE.md` |
| Listes SharePoint, colonnes, comptes comptables, catégories, fichiers JSON | `02_MODELE_DONNEES.md` |
| Rôles, droits (`ROLE_CAPS`), workflows métier de chaque module | `03_REGLES_METIER_ET_ROLES.md` |
| Journal chronologique des décisions et du « pourquoi » — mémoire longue du projet | `04_HISTORIQUE_DECISIONS.md` |
| Idées d'évolution non encore développées | `05_ROADMAP_EVOLUTIONS_FUTURES.md` |
| Cartographie technique générée depuis le code réel (vérification croisée de la doc) | `ARCHITECTURE_GLOBALE.md` |
| État de la sécurité (ce qui est protégé, ce qui reste à surveiller) | `SECURITE_ETAT.md` |
| Rollback de code (tags de session, `git revert`) + export de sauvegarde avant migration | `PROCEDURE_ROLLBACK.md` |
| Restauration de données SharePoint depuis une sauvegarde complète | `PROCEDURE_RESTAURATION.md` |
| Environnement de recette (staging) : mise en place et usage | `PROCEDURE_RECETTE.md` |
| Lancer les tests, structure du dépôt côté dev | `README.md` |

Si un sujet ne trouve sa place dans aucun de ces documents, c'est probablement un écart doc/code à
signaler (voir `ARCHITECTURE_GLOBALE.md` § écarts) plutôt qu'une raison de l'ajouter ici.

## Commandes utiles

```bash
npm test           # tests automatisés (node --test, zéro dépendance), voir tests/
npm run check       # syntaxe : worker.js, app.js, <script> de dashboard.html, cohérence staging
npm run verify       # check + test — c'est ce que lance le hook pre-push avant chaque git push
npm run session:start     # pose un tag git local avant une session de travail
npm run session:rollback  # revert propre (jamais reset --force) jusqu'à un tag de session
npm run sync:staging      # copie miroir app.js/dashboard.html/index.html vers staging/
npm run seed:staging      # jeu de données fictif pour l'environnement de recette
```

`tests/` contient une famille par sujet (`worker.*`, `security.*`, `dashboard.*`, `backup.*`) —
zéro appel réseau réel, Microsoft Graph entièrement mocké. Détail des commandes et du hook
`pre-push` → `README.md`. Procédure complète de rollback (code) et d'export (données) avant
migration → `PROCEDURE_ROLLBACK.md`.

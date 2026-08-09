# Procédure de rollback de session

*Document de référence technique, à lire avant d'utiliser `npm run session:start` / `npm run session:rollback`. Placé à la racine du dépôt, au même niveau que les autres documents `NN_*.md` et `CLAUDE.md` (pas de dossier `docs/` dans ce projet).*

## Quand l'utiliser

Avant de démarrer une session de travail (soi-même ou via Claude Code) susceptible de modifier plusieurs fichiers d'affilée — refactoring, nouveau module, migration —, poser un repère :

```bash
npm run session:start
```

Cela crée un tag git local `session-AAAAMMJJ-HHMM` sur le commit courant (HEAD). Si la session tourne mal (régression découverte après coup, changement qu'on veut annuler proprement), on peut revenir à ce repère :

```bash
npm run session:rollback
```

Le script liste les tags `session-*` disponibles, demande une confirmation explicite (taper `OUI`), puis annule **proprement** (`git revert`) tous les commits postérieurs au tag choisi. Rien n'est jamais poussé automatiquement vers `origin` — c'est à vous de vérifier le résultat (`git log`, `git diff`) puis de faire `git push` vous-même quand vous êtes prêt.

## Ce que ça couvre

**Uniquement le code versionné dans ce dépôt git** : `worker.js`, `app.js`, `dashboard.html`, `index.html`, les fichiers `.json` statiques commités, les tests, la config (`wrangler.toml`, `package.json`...). Un rollback ramène ces fichiers à l'état du tag choisi, via de nouveaux commits de revert (jamais de réécriture d'historique, jamais de `reset --force` sur `main`) — cohérent avec le mode de fonctionnement du projet (push direct sur `main`, sans branche de préprod, voir `01_ARCHITECTURE_TECHNIQUE.md`).

Après un rollback suivi d'un `git push` :
- **GitHub Pages** redéploie automatiquement la PWA et le Dashboard (1-2 min).
- **Cloudflare Worker** (`immo-proxy`) redéploie automatiquement via son intégration Git.

➡️ **Toujours vérifier après un push de rollback** : l'onglet *Actions* du dépôt GitHub (déploiement Pages) et l'onglet *Deployments* du Worker sur Cloudflare — exactement comme après un déploiement normal.

## Ce que ça ne couvre PAS

**Les données SharePoint** (`Immos`, `Employes`, `Mouvements`, et toutes les autres listes décrites dans `02_MODELE_DONNEES.md`) sont **totalement indépendantes de git**. Annuler un commit de code n'annule et ne restaure **aucune** ligne SharePoint déjà écrite, modifiée ou supprimée pendant la session — que ce soit par une action normale (réservation, transfert...) ou par un import/migration en masse.

Si une session a introduit un bug qui a **déjà écrit des données incorrectes** dans SharePoint avant d'être repérée, `session:rollback` ne répare que le code : il faut corriger les données séparément (manuellement dans SharePoint, ou en réimportant une sauvegarde — voir procédure ci-dessous).

## Procédure données : exporter avant toute migration ou import de masse

**Règle** : avant de lancer toute action de migration ou d'import en masse (ex. `enrichirImmosEBP`, `bulk_import_*`, `dedupe_employes`, `seed_roles_sites`, ou tout nouvel outil de migration one-shot à venir), **exporter d'abord en JSON les listes SharePoint qui vont être touchées**, depuis le dashboard.

### Comment exporter

1. Se connecter au dashboard avec un compte administrateur.
2. Onglet **Utilisateurs → Outils de maintenance avancés → Exporter une liste (sauvegarde)**.
3. Choisir la liste concernée dans le menu déroulant, cliquer sur le bouton — un fichier `Backup_<Liste>_<date>.json` est téléchargé localement.
4. Répéter pour chaque liste que la migration va modifier (ex. une migration EPI touche généralement `Employes`, `Catalogue_Articles_EPI` et `Grille_Dotation_EPI`).
5. Conserver ces fichiers (poste local, ou copie dans le dossier de suivi du projet) jusqu'à ce que la migration soit validée comme correcte.

Techniquement, ce bouton appelle un nouvel endpoint de **lecture seule** du Worker, `?export_liste=<nom_liste>`, protégé par le même mécanisme de jeton de session que les actions sensibles existantes (`requireAdmin` — voir `03_REGLES_METIER_ET_ROLES.md` § *Autorisation côté serveur*). Il ne modifie jamais rien côté SharePoint, il ne fait que lire et renvoyer les lignes de la liste demandée.

### En cas de besoin de restauration

Ce mécanisme produit une **sauvegarde de secours en lecture**, pas un outil de restauration en un clic (aucune action `import_backup` n'existe côté Worker à ce jour — décision volontaire, pour ne pas ajouter une action d'écriture en masse supplémentaire sans besoin confirmé). En cas de données à corriger après une migration ratée :
1. Comparer le fichier de sauvegarde JSON exporté à l'état actuel de la liste dans SharePoint (manuellement, ou via un script ponctuel si le volume le justifie).
2. Corriger dans SharePoint directement (interface web), ou écrire un script de correction ciblé réutilisant les actions Worker existantes (`bulk_patch_immos` et équivalents) — jamais en modifiant SharePoint hors de l'app sans comprendre l'écart d'abord.

## Résumé

| | Code (git) | Données (SharePoint) |
|---|---|---|
| Repère avant session | `npm run session:start` | Export JSON par liste (dashboard) |
| Annulation après incident | `npm run session:rollback` (`git revert`, jamais `reset --force`) | Pas d'annulation automatique — comparaison manuelle avec l'export, correction ciblée |
| Après action | Vérifier déploiement Pages + onglet *Deployments* Cloudflare | Vérifier les listes concernées dans SharePoint |

# Procédure de restauration des données SharePoint

*Document de référence, à lire avant toute tentative de restauration à partir d'un fichier de sauvegarde produit par le bouton « 🗄️ Sauvegarde complète » du dashboard. Placé à la racine du dépôt, au même niveau que les autres documents `NN_*.md` et `CLAUDE.md`.*

## À quoi sert ce document

Le bouton **« 🗄️ Sauvegarde complète (toutes les listes) »** (Dashboard → Utilisateurs → Outils de maintenance avancés) télécharge un instantané JSON de l'ensemble des listes SharePoint (voir `04_HISTORIQUE_DECISIONS.md`, entrée « Sauvegarde complète des listes SharePoint »). Ce fichier est un **filet de sécurité côté données** — complémentaire du rollback git (`PROCEDURE_ROLLBACK.md`), qui ne touche jamais SharePoint.

Ce document décrit comment **relire** et **réinjecter** ces données en cas de perte. Il n'existe volontairement **aucun bouton « tout restaurer »** — voir ci-dessous pourquoi.

## Principe directeur : restauration assistée, jamais automatique

Une ré-injection de masse mal maîtrisée (mauvaise liste, doublons, écrasement de données plus récentes) est **plus dangereuse que le problème qu'elle corrige**. La restauration est donc **manuelle et liste par liste**, avec vérification à chaque étape. Ne jamais écrire un script qui reverse aveuglément tout le fichier dans SharePoint.

## Étape 0 (à tenter EN PREMIER) : la corbeille SharePoint

Avant toute réinjection depuis le fichier JSON, vérifier la **corbeille SharePoint** du site `Logistique-Immos` :

- SharePoint conserve les éléments supprimés **93 jours** (corbeille du site, puis corbeille de second niveau).
- Restaurer depuis la corbeille remet les éléments **à l'identique** (mêmes `id`, mêmes relations) — c'est toujours préférable à une réinjection, qui recrée des éléments avec de nouveaux `id`.

N'utiliser le fichier de sauvegarde que si la corbeille ne contient plus les données (supprimées il y a plus de 93 jours, ou vidée).

## Structure du fichier de sauvegarde

```json
{
  "date": "2026-08-10T09:00:00.000Z",
  "genere_par": "AIWI",
  "source": "immo-tracker/sauvegardeComplete",
  "nb_listes": 21,
  "complete": true,
  "total_items": 12345,
  "listes": {
    "Immos": [ { "id": "123", "Title": "IM000123", "Libelle": "...", ... }, ... ],
    "Employes": [ ... ],
    ...
  },
  "meta": {
    "Immos": { "count": 1023, "complete": true, "exporte_le": "..." },
    ...
  }
}
```

- `listes[nomListe]` : le tableau des éléments de chaque liste, un objet par ligne. Chaque objet contient les colonnes SharePoint (noms internes, voir `02_MODELE_DONNEES.md`) **plus** un champ `id` (l'identifiant SharePoint interne au moment de l'export).
- `meta[nomListe]` : `count` (nombre de lignes), `complete` (`false` si la liste a été **tronquée** à l'export — voir plus bas), `exporte_le`.
- `complete` (racine) : `true` seulement si **toutes** les listes ont été exportées intégralement, sans échec ni troncature. Si `false`, le fichier a été nommé `..._INCOMPLETE.json` — **ne pas le considérer comme une source fiable** pour une restauration.

⚠️ **Ne JAMAIS réutiliser le champ `id`** lors d'une réinjection : SharePoint attribue lui-même un nouvel `id` à chaque création. Le champ `id` du fichier ne sert qu'à la lecture/au diagnostic (retrouver un élément précis, comparer). La **clé métier de rapprochement est `Title`** (code IM pour `Immos`, code employé pour `Employes`, etc. — voir `02_MODELE_DONNEES.md`).

## Deux situations de restauration

### Situation A — la liste existe encore (données partiellement perdues)

Exemple : une migration a écrasé/supprimé une partie des lignes, mais la liste SharePoint et ses colonnes sont intactes.

1. Ouvrir le fichier de sauvegarde, isoler le tableau `listes[nomListe]`.
2. Comparer avec l'état actuel de la liste (via le dashboard, ou `?export_liste=<liste>&token=...` pour un export frais d'une seule liste).
3. **Ré-injecter uniquement les éléments manquants**, en identifiant par `Title` (ne jamais recréer un `Title` déjà présent — cela ferait un doublon).
4. Réutiliser les **actions `bulk_import_*` déjà existantes** du Worker (`bulk_import_lignes_inventaire`, `bulk_patch_immos`, imports EPI/Outillage/Matériel IT…), qui écrivent par lots `$batch` de 20 — ne pas inventer de nouvelle mécanique d'écriture. Choisir l'action adaptée à la liste concernée (voir `ARCHITECTURE_GLOBALE.md` pour la correspondance action ↔ liste).
5. Vérifier le résultat dans le dashboard avant de considérer la restauration terminée.

### Situation B — la liste a été entièrement supprimée

La restauration d'une liste supprimée passe **d'abord par la corbeille** (étape 0). Si la corbeille ne l'a plus :

1. **William recrée la liste et ses colonnes à la main** dans SharePoint, en suivant `02_MODELE_DONNEES.md` (noms internes exacts des colonnes — un seul nom de colonne erroné fait échouer silencieusement toute écriture, cf. incidents `Fabricant`/`Fabriquant` et `Code_deverouillage` dans `04_HISTORIQUE_DECISIONS.md`). En cas de doute sur un nom interne, le vérifier avec `?debug_columns=<liste>`.
2. Une fois la liste recréée vide, se ramener à la **situation A** : réinjecter toutes les lignes du fichier via les actions `bulk_import_*`, clé `Title`, sans réutiliser les `id`.

## Cas d'une liste tronquée à l'export (`complete: false`)

Le plafond de pagination (45 pages Graph par invocation, pour rester sous le budget ~50 sous-requêtes du plan gratuit Cloudflare) permet d'exporter jusqu'à ~9000 lignes par liste. Au-delà, `meta[nomListe].complete` vaut `false` et la liste concernée n'est **pas complète** dans le fichier.

Pour une telle liste (aucune ne l'est aujourd'hui, mais `Mouvements` grossit avec le temps) :
- Soit l'exporter séparément depuis SharePoint directement (**Liste → Exporter vers Excel**), qui n'a pas cette limite ;
- Soit passer le Worker Cloudflare en **plan payant** (lève le plafond de sous-requêtes), puis relancer la sauvegarde complète.

Ne jamais restaurer à partir d'une liste marquée `complete:false` : on réinjecterait un sous-ensemble en croyant restaurer le tout.

## Limite connue

Cette sauvegarde ne couvre **que les listes SharePoint** (les données structurées). Elle **ne sauvegarde pas les fichiers du drive** : photos d'immos, photos de fiches EPI/Outillage signées (`Fiches_EPI/`, `Fiches_Outillage/`), FDS (`FDS_Immos/`). Ces fichiers sont hébergés sur le drive SharePoint et relèvent des mécanismes de sauvegarde/versioning natifs de Microsoft 365 (corbeille, historique de versions OneDrive/SharePoint), pas de cet outil.

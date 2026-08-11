# Cadrage — Module « Brasseurs d'air » (négoce + pose)

*Document de cadrage, non livré au code. Rédigé après lecture intégrale de
`1.1.3.1. Suivi des entrées et sorties.xlsx` (5 feuilles, ~200 lignes de mouvements),
de la proforma `PI  FS202603051 1stShine validated.pdf` (commande 2026 en cours,
DCF-FS52920 blanc) et de `PI FS202502041 validated.pdf` (commande 2025, DCF-FS52920
**noir**, fournie par William en session pour clarifier la nuance de couleur), ainsi
que de la base de connaissance du dépôt (00-05, ARCHITECTURE_GLOBALE.md,
SECURITE_ETAT.md). Aucune ligne de code écrite. Aucune liste SharePoint créée.
Toutes les questions ouvertes de la v1 de ce document ont été tranchées par William
(voir §6) — ce document intègre ses réponses.*

*Accès vérifiés en amont : dépôt git local à jour et synchronisé avec
`github.com/RAL974/immo-tracker` (`git fetch` OK) ; fichiers sources dans
`C:\Users\ral\immo-tracker\Fichiers divers\Brasseurs d'air\`.*

---

## 1. Subtilités trouvées dans les sources

### 1.1 Référence + couleur — confirmé et tranché
`DCF-FS52920` est la référence utilisée par 1stShine **quelle que soit la couleur**.
La PI `FS202502041` (27/02/2025, fournie par William en session) confirme un achat de
42 unités **noires** ("Color: Full black color") sous cette même référence de base —
Espace Soleil a donc bien acheté du noir par le passé, pas seulement du blanc.
**Tranché avec William** : suffixe intégré à la référence catalogue —
`DCF-FS52920B` (blanc, déjà en place) et `DCF-FS52920N` (noir, **toujours actif
aujourd'hui**, pas seulement historique — à créer dans le catalogue dès la mise en
service, `Actif = Oui`).

### 1.2 Entité juridique — non pertinent, résolu par le contexte
Le tampon acheteur de la PI 2026 porte "ELECTRICITÉ SERVICES RÉUNION" (RCS
Saint-Denis 523 514 958) ; celui de la PI 2025 porte "ESPACE SOLEIL" (RCS Saint-Denis
523 514 958 — **même SIREN**). Confirmé par William : **il s'agit de la même société**,
renommée d'Espace Soleil en Electricité Services Réunion courant juin 2026 (vérifiable
sur l'annuaire des entreprises). **Aucune 3e valeur de propriétaire n'est donc
nécessaire pour cette raison** — la question posée en §3.d (v1) était mal fondée sur
une fausse hypothèse de deux entités distinctes. *(Point hors périmètre de ce cadrage,
signalé pour mémoire : les documents `00_CONTEXTE_PROJET.md`/`CLAUDE.md` mentionnent
déjà "Electricité Services Réunion" comme raison sociale et "Espace Soleil" ne survit
que dans le nom du site SharePoint et le domaine e-mail historiques — cohérent, rien à
corriger dans la doc à ce sujet.)*

### 1.3 Délai de livraison — non critique, confirmé
William confirme que la date d'arrivée n'est pas une donnée critique à ce stade.
L'ambiguïté relevée en v1 (35 j en en-tête de PI vs 50-55 j pour un moteur DC en
remarque) reste vraie mais n'a pas besoin d'être résolue — les champs de délai restent
dans le modèle comme information indicative optionnelle, pas comme donnée pilotante.

### 1.4 Origine des incohérences historiques — confirmée, sans conséquence sur le modèle
William confirme : le registre était tenu par l'ancien responsable logistique, "pas du
tout à l'aise avec les outils informatiques" et "sans rigueur" — ce qui explique
directement les dérives de numérotation (§1.4 v1), les réutilisations de n° (§1.5 v1)
et les erreurs de signe (§1.6 v1). Confirme que ces anomalies sont des accidents de
saisie individuels, pas un pattern métier à modéliser — pas de changement de modèle
nécessaire de ce fait, juste une confirmation que l'automatisation proposée (§3.a/c)
est le bon remède.

### 1.5 Achats locaux — nouvelle subtilité, à intégrer au modèle
William précise : il arrive qu'Espace Soleil/ESR **achète des brasseurs en local**
(donc hors Chine, sans PI/FOB/acompte), exemple récent : achat **chez Alclima**, une
société à laquelle des brasseurs avaient pourtant été **vendus par le passé**
(`Alclima` apparaît en Tiers côté Négoce dans le classeur, ex. `OM.25.09.003`,
`OM.25.12.002`). Un même tiers peut donc être tour à tour client et fournisseur —
aucune contrainte à poser sur ce champ (`Tiers` reste un texte libre, pas une liste
fermée fournisseurs/clients séparée). **Tranché avec William** : les achats locaux
passent par le même modèle `Brasseurs_Commandes`/`Brasseurs_Lignes_Commande` que les
commandes Chine (voir §3.e révisé), avec les champs propres à l'international laissés
vides.

### 1.6 Accessoires liés (pales) — tranché
William confirme la règle : **report manuel pour tous les accessoires, sauf les
pales**. Un brasseur (DCF-FS52920B/N) sorti entraîne par défaut la sortie d'un jeu de
pales correspondant (1 pour 1), **mais cette liaison doit être modifiable au moment de
la sortie** — exemple donné : un technicien remplace un moteur déjà en place chez un
client mais réutilise les pales d'origine (pas de nouvelle sortie de pales dans ce
cas). CACHES/KITFIX/VISSERIE/CARTONS/ECL/CMD-T restent en report manuel pur, aucune
liaison automatique. Voir §3.h (nouveau) pour la mécanique retenue.

### 1.7 Propriétaire du stock à TC2 — confirmé, la notion doit rester active partout
William confirme : *"Nous avons eu une fois du stock 1stShine en configuration"* — la
présence, même rare, de stock 1ST SHINE à TC2 est un cas réel vécu, pas une hypothèse
théorique. **Révision de la recommandation §1.9/v1** : plutôt que de présenter le champ
`Proprietaire` comme "verrouillé sur ELECTRICITE SERVICES REUNION par défaut" à TC2,
l'écran doit proposer les deux valeurs partout, sur tous les dépôts, avec un défaut
pré-rempli "ELECTRICITE SERVICES REUNION" (cas très majoritaire) mais jamais
grisé/désactivé pour "1ST SHINE".

*(Les autres constats de la v1 — §§1.8/1.10/1.11/1.13, numéro de mouvement non fiable,
transferts non liés formellement, mécanisme "inventaire" abandonné après sa première
utilisation, bruit mineur — restent valables tels quels, non repris en détail ici,
voir la version précédente de ce document dans l'historique de conversation si besoin.)*

---

## 2. Modèle de données — inchangé sur le fond, ajustements de détail

Le choix **stock calculé** (SUM des mouvements par Référence×Dépôt×Propriétaire,
jamais un solde stocké) reste la recommandation — rien dans les réponses de William ne
remet ce choix en cause, voir §2.1 de la version précédente pour l'argumentaire complet
(pattern EPI/Outillage vs pattern Mouvements immos, preuve par les TCD déjà calculés
du classeur actuel).

Ajustements liés aux décisions de cette session :
- `Brasseurs_Catalogue` doit désormais inclure `DCF-FS52920N` dès la mise en service
  (pas seulement `DCF-FS52920B`), `Actif = Oui`.
- `Brasseurs_Commandes` doit couvrir aussi bien une commande internationale (PI Chine)
  qu'un achat local — voir §3.e révisé et le modèle de colonnes révisé en §4.
- `Brasseurs_Mouvements` n'a besoin d'aucune nouvelle colonne pour la liaison
  pales↔brasseur (§1.6) : le champ `Document` existant regroupe déjà plusieurs lignes
  de référence sous un même mouvement (exactement comme dans le classeur actuel, ex.
  `OM.25.05.001` qui regroupe 6 lignes de références différentes) — la liaison
  BA/pales est donc un **comportement d'écran** (proposer automatiquement une ligne
  PALES à la même quantité, modifiable/supprimable), pas une contrainte de données.

---

## 3. Questions ouvertes — état après réponses de William

### a, b, c, f, g — inchangés
Numérotation auto (§3.a), transfert inter-dépôts lié (§3.b), inventaire en mode
"pose" (§3.c), seuils d'alerte réutilisés (§3.f), capacité dédiée `gererBrasseurs`
(§3.g) : aucune remise en cause, voir version précédente pour l'argumentaire complet.

### d) Propriétaires de stock → **tranché : liste fermée à 2 valeurs, définitivement**

`ELECTRICITE SERVICES REUNION` / `1ST SHINE` — pas de 3e valeur (§1.2 : même société,
un seul nom légal actuel, renommée mi-2026). Contrôle côté serveur maintenu (liste
fermée, rejet si valeur hors liste) — la preuve du §1.8/v1 (ligne "ALCLIMA" en
Propriétaire, très probable erreur de saisie) reste un argument valide pour la
validation serveur, indépendamment de la question réglée ici.

**Tranché par William** : le libellé stocké dans `Proprietaire` est
`ELECTRICITE SERVICES REUNION` (raison sociale actuelle), pas `ESPACE SOLEIL`.
Cohérent avec les mouvements passés dans le classeur qui utilisaient "ESPACE SOLEIL" à
l'époque : ce sont des données historiques d'avant renommage, à migrer/normaliser vers
la nouvelle valeur au moment de la migration (pas une valeur alternative à conserver
en parallèle dans le nouveau module).

### e) Prix d'achat → **tranché : Option A partout, y compris achats locaux**

Confirmé : prix stockés dans `Brasseurs_Lignes_Commande.Prix_Unitaire`, lecture
protégée `requireGarant` (jeton en `&token=`, même mécanisme que
`?materiel_it=1`/`?export_liste=`). William confirme explicitement que cette règle
s'applique **aussi aux achats locaux**, pas seulement à la commande Chine — un seul
mécanisme de protection, uniforme, quel que soit le fournisseur.

### h) [Nouveau] Mécanique de la liaison automatique BA↔pales

Comprise ainsi, à valider une dernière fois avant le code : à l'écran de sortie, dès
qu'une ligne `DCF-FS52920B`/`DCF-FS52920N` est saisie avec une quantité, une ligne
`PALES` est **automatiquement pré-remplie à la même quantité**, sur le même
`Document` — l'utilisateur peut ensuite modifier cette quantité (y compris la mettre à
0, cas du technicien qui réutilise les pales déjà en place) ou supprimer la ligne
avant validation. Aucune liaison structurelle en base (pas de champ "pales liées à
telle ligne BA") — uniquement un comportement d'écran au moment de la saisie. Les
autres accessoires (CACHES/KITFIX/VISSERIE/CARTONS/ECL/CMD-T) ne déclenchent aucune
pré-proposition automatique, ajout manuel uniquement si besoin.

---

## 4. Listes SharePoint à créer — version révisée, prête à copier (production ET recette)

*Changements par rapport à la v1 du 11/08 : ajout d'un exemple de ligne catalogue
noire, généralisation de `Brasseurs_Commandes` aux achats locaux (nouveau champ
`Origine`, champs internationaux devenus optionnels).*

### `Brasseurs_Depots`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code court du dépôt, ex. `OMT`, `TC2` |
| `Nom_Complet` | Texte | Ex. `OM Transit`, `TC N°2` |
| `Prefixe_Document` | Texte | Préfixe utilisé par la numérotation auto, ex. `OM`, `TC2` |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Actif` | Texte | `Oui` / `Non` |

### `Brasseurs_Catalogue`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Référence, ex. `DCF-FS52920B`, `DCF-FS52920N`, `T90`, `CMD-M`... |
| `Designation` | Texte | Ex. `Brasseur d'air blanc`, `Brasseur d'air noir` |
| `Categorie` | Texte | Optionnel — ex. `Brasseur`, `Pièce détachée`, `Consommable` |
| `Stock_Mini` | Nombre | Seuil d'alerte global (0/vide = seuil par défaut, même logique qu'EPI/Outillage) |
| `Actif` | Texte | `Oui` / `Non` |

*Catalogue de départ attendu : `DCF-FS52920B`, `DCF-FS52920N` (les deux actives),
`CMBF-FS5016`, `CMBF-FS5020`, `CMD-M`, `CMD-T`, `T30`, `T90`, `KITFIX`, `PALES`,
`CACHES`, `CARTONS`, `VISSERIE`, `ECL` — 14 références au total.*

### `Brasseurs_Mouvements`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Référence (correspond à `Brasseurs_Catalogue.Title`) |
| `Document` | Texte | Numéro généré, ex. `OMT.26.08.003` / `TC2.26.08.001` / `TRF.26.08.001` |
| `Depot` | Texte | Correspond à `Brasseurs_Depots.Title` |
| `Date` | Date | Date du mouvement |
| `Type` | Texte | `Entree` / `Sortie` / `Inventaire` / `Transfert_Sortie` / `Transfert_Entree` |
| `Tiers` | Texte | Fournisseur ou client (libre — un même tiers peut être les deux selon la période, voir §1.5) |
| `Proprietaire` | Texte | `ELECTRICITE SERVICES REUNION` / `1ST SHINE` (liste fermée à 2 valeurs, contrôlée côté Worker) |
| `Destination` | Texte | Libre — `Négoce`, `Maintenance`, nom de chantier, `EDF AGIR+`, etc. |
| `Quantite` | Nombre | Signée (positif = entrée de stock, négatif = sortie) |
| `Code_Employe` | Texte | Code employé 4 lettres (remplace le "Pris par XXXX" en texte libre) |
| `Commentaire` | Texte | Libre |
| `Transfert_Lien` | Texte | ID SharePoint de la ligne miroir, uniquement pour `Transfert_Sortie`/`Transfert_Entree` |
| `Horodatage` | Date/heure | ISO |
| `Cree_Par` | Texte | Code employé résolu du jeton de session (jamais du corps de la requête) |

### `Brasseurs_Commandes` (révisée — couvre commandes Chine ET achats locaux)

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Référence de commande — n° de PI fournisseur s'il existe (ex. `FS202603051`), sinon identifiant généré (ex. `CMD.26.08.001`, même logique de numérotation que `Brasseurs_Mouvements.Document`) |
| `Origine` | Texte | `International` / `Local` — pilote quels champs ci-dessous sont pertinents |
| `Fournisseur` | Texte | Ex. `1stShine Industrial`, ou un fournisseur local (ex. `Alclima`) |
| `Date_Commande` | Date | |
| `Montant_Total` | Nombre | |
| `Devise` | Texte | `USD` (Chine) / `EUR` (local) — texte libre, pas de conversion automatique |
| `Acompte_Pourcentage` | Nombre | Optionnel — pertinent surtout pour l'international |
| `Incoterm` | Texte | Optionnel — ex. `FOB Shenzhen`, vide pour un achat local |
| `Delai_Estime_Jours` | Nombre | Optionnel, non critique (§1.3) |
| `Date_Arrivee_Estimee` | Date | Optionnel, non critique (§1.3) |
| `Statut` | Texte | `En attente` / `Recue_Partielle` / `Recue` / `Annulee` |
| `Cree_Par` | Texte | Code employé résolu du jeton de session |
| `Notes` | Texte | Libre |

### `Brasseurs_Lignes_Commande`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | ID SharePoint de la commande parente (texte, pas de Lookup — cohérent avec `Lignes_Inventaire`/`Lignes_Dotation_EPI`) |
| `Reference` | Texte | Correspond à `Brasseurs_Catalogue.Title` |
| `Quantite_Commandee` | Nombre | |
| `Prix_Unitaire` | Nombre | Dans la devise de la commande parente (`Brasseurs_Commandes.Devise`) — lecture protégée `requireGarant`, toutes origines confondues (§3.e) |
| `Quantite_Recue` | Nombre | 0 par défaut, incrémentée à chaque réception |

---

## 5. Ce qui n'est toujours PAS dans ce cadrage (volontairement)

- Pas de code, pas d'action Worker écrite, pas de `GATED_ACTIONS`/`GATED_ACTIONS_AUDIT`
  rempli — sera fait après validation finale des listes par William.
- Pas d'écran PWA (§3.g, session D dédiée).
- Pas de migration des données historiques du classeur (erreurs de signe, dérive de
  numérotation, valeurs manquantes — à arbitrer ligne par ligne au moment de la
  migration).

## 6. Historique des questions tranchées (pour mémoire)

Toutes les questions ouvertes de la version précédente sont désormais tranchées :
1. ~~2 ou 3 propriétaires~~ → 2, définitivement (§1.2, §3.d).
2. ~~Option A ou B pour les prix~~ → Option A, étendue aux achats locaux (§3.e).
3. ~~Accessoires auto-décrémentés ou report manuel~~ → report manuel sauf pales,
   liaison 1-pour-1 éditable (§1.6, §3.h).
4. ~~TC2 peut-il porter du stock 1ST SHINE~~ → oui, cas réel vécu, champ toujours actif
   sur tous les dépôts (§1.7).

**Dernier point tranché par William** (§3.d) : la valeur stockée dans `Proprietaire`
est `ELECTRICITE SERVICES REUNION` (raison sociale actuelle), pas `ESPACE SOLEIL`.
Le cadrage est désormais entièrement clos — plus aucune question ouverte. William
crée les listes SharePoint (§4) manuellement sur les deux sites (production et
recette) ; le code sera écrit une fois cette création confirmée.

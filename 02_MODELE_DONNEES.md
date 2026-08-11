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
| `Photos` | Texte (ajoutée août 2026) — noms de fichiers photo liés à ce mouvement, séparés par `;` (jusqu'à 3), ex. `20260810_143000_0.jpg;20260810_143000_1.jpg`. Toujours écrite (vide si aucune photo) par les actions `declarer_panne`/`resoudre_panne` (directement) et `transfert`→`valider` (voir plus bas, mécanisme en deux temps). Les fichiers eux-mêmes vivent dans `Photos_Immos/{code_im}/` sur le drive (même emplacement que les photos "documentaires" ajoutées hors mouvement depuis le dashboard/l'écran PWA dédié) — cette colonne ne fait que pointer vers un sous-ensemble de ces fichiers, celui pris au moment de ce mouvement précis. Voir `03_REGLES_METIER_ET_ROLES.md` § Photos de mouvement. |
| `Horodatage` | Date et heure ISO |

⚠️ **`Entretien` vs `Réparation`** : un mouvement `Réparation` (créé lors de la résolution d'une panne) signifie que l'immo **revient au dépôt** — il est traité comme un changement de possession dans le calcul de localisation. Un mouvement `Entretien` (créé via le bouton "🔧 Enregistrer réparation", indépendant d'une panne déclarée — entretien préventif, réparation ponctuelle) **n'affecte pas** la localisation courante de l'immo, au même titre que `Panne`/`Suivi_Panne`. Les deux types comptent dans le cumul de coûts utilisé pour le seuil de réforme.

⚠️ **Marqueur transitoire sur `Transferts_En_Attente.Note`** : cette liste (retours/transferts en attente de validation, voir plus bas) n'a pas sa propre colonne `Photos` — pas nécessaire, le mécanisme est déjà bien couvert par le texte libre existant (même logique que les marqueurs `##COUT:X##`/`##PRESTA:X##` déjà utilisés ailleurs, voir `04_HISTORIQUE_DECISIONS.md`). Le nom des photos prises par le déclarant à ce stade est porté par un marqueur `##PHOTOS:fichier1;fichier2##` ajouté à `Note`, retiré et reporté vers la colonne structurée `Photos` de `Mouvements` au moment de la validation (`?action=valider`) — jamais affiché tel quel à l'utilisateur (le Worker le retire avant toute restitution en lecture, `?dashboard=1` compris).

## Liste `Reservations`

*Réservation de matériel, immédiate ou planifiée à l'avance. Étendue en août 2026 (roadmap item D, "planification logistique") pour couvrir aussi la **demande par catégorie sans immo précise** — voir `04_HISTORIQUE_DECISIONS.md` pour le raisonnement (extension de cette liste existante plutôt que création d'une liste séparée, après relecture de ce qui existait déjà : conflit de dates, Gantt planning, contre-proposition).*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code employé demandeur |
| `Nom_Employe` | Texte | |
| `Code_Chantier` / `Nom_Chantier` | Texte | Optionnel |
| `Date_Debut` / `Date_Fin` | Date | Départ prévu / retour prévu — peut être une date future, c'est ce qui permet la planification |
| `Statut` | Texte | `Demandee` / `Confirmee` / `Refusee` (ajoutée août 2026) / `Rendue` / `Annulee` / `Contre-proposition`. Liste blanche vérifiée côté Worker (`statut_resa`) depuis août 2026 — ce PATCH acceptait n'importe quelle chaîne auparavant. `En retard` est calculé à la lecture (jamais stocké), et jamais posé sur une ligne `Refusee` (une demande refusée n'est pas "en retard"). |
| `Note` | Texte | Commentaire libre + marqueur transitoire `##INIT:code_im##` (immo initialement demandée, avant une contre-proposition de la logistique) |
| `Code_IM` | Texte | Immo précise demandée. **Optionnel depuis août 2026** — vide pour une demande par catégorie |
| `Categorie` | Texte | Ajoutée août 2026. Renseignée uniquement si `Code_IM` est vide — catégorie recherchée (mêmes valeurs que les catégories dérivées des comptes) |
| `Quantite` | Nombre | Ajoutée août 2026. Défaut 1, pertinente seulement quand `Code_IM` est vide (une immo précise = toujours 1) |
| `Libelle_Libre` | Texte | Ajoutée août 2026. Précision optionnelle (ex. "échafaudage 6m") pour une demande par catégorie |

⚠️ **Une demande cible toujours soit une immo précise, soit une catégorie — jamais aucune des deux** : `reserver` refuse la création (`destination_manquante`) si `code_im` et `categorie` sont tous les deux absents.

⚠️ **Aucun mouvement n'est jamais créé à partir de `Reservations`, quel que soit le statut** (y compris `Confirmee`/`Rendue`) — la remise physique réelle passe exclusivement par `transfert`/`valider`, ailleurs. Voir `04_HISTORIQUE_DECISIONS.md`.

## Liste `Absences`

*Registre à sens unique des absences signalées par l'encadrement de terrain (CT/RA/Logistique) pour un ouvrier — pas un module RH complet (pas de validation, pas de type d'absence, pas de plage de dates). Voir `03_REGLES_METIER_ET_ROLES.md` § Module Absences pour les règles métier.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code de l'employé **absent** |
| `Code_Declarant` | Texte | Code de la personne qui signale l'absence |
| `Date_Absence` | Date | Obligatoire |
| `Motif` | Texte | Libre, optionnel — pas de liste de valeurs contrôlée |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Horodatage` | Date/heure | ISO, moment de la déclaration |

⚠️ Pas de colonne nom (`Nom_Declarant`/`Nom_Absent`) : les noms sont résolus côté client à l'affichage. L'action `signaler_absence` reçoit un champ `nom_declarant` côté client mais il n'est jamais recopié dans SharePoint (ignoré côté Worker).

## Autres listes

| Liste | Rôle |
|---|---|
| `Transferts_En_Attente` | Transferts et retours dépôt en attente de validation |

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

## Liste `Journal_Audit` (ajoutée août 2026)

*Journal d'audit des actions sensibles d'administration — distinct de `Mouvements` (qui trace les mouvements de matériel, pas les actions d'administration : mots de passe, droits, suppressions, migrations en masse...). Une ligne = une tentative d'action (réussie ou non) parmi les 62 actions déjà protégées `requireAdmin`/`requireGarant`, plus les échecs de connexion. Détail complet du raisonnement et du mécanisme dans `03_REGLES_METIER_ET_ROLES.md` et `04_HISTORIQUE_DECISIONS.md`.*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Nom de l'action (ex. `reset_password`), dupliqué dans `Action` — permet un aperçu lisible par défaut dans SharePoint |
| `Horodatage` | Date et heure | ISO |
| `Code_Employe` | Texte | Auteur, résolu depuis le jeton de session vérifié — **jamais** depuis le corps de la requête. Vide pour un échec de connexion (`verify_password`, aucune session n'existe encore à ce stade) |
| `Action` | Texte | Nom de l'action |
| `Cible` | Texte | Meilleur identifiant disponible dans le corps de la requête (`code_im`, `code_employe`, `code`, `id`) — best-effort, pas garanti homogène d'une action à l'autre. Pour un échec de connexion : le code **tenté** (non vérifié) |
| `Detail` | Texte multiligne | JSON court du reste du corps de la requête (~800 caractères max). Exclut mots de passe, codes PIN/PUK/RIO/déverrouillage SIM, jeton de session, charges de fichier base64 (RGPD). Les tableaux/objets (imports en masse) sont résumés en `{"__count": N}` plutôt que recopiés intégralement |
| `Resultat` | Texte | `Succès` / `Échec` |

⚠️ Aucune écriture n'a lieu si l'authentification échoue (`session_invalide`/`droits_insuffisants`/`session_secret_manquant`) — voir `03_REGLES_METIER_ET_ROLES.md` pour le raisonnement. `Journal_Audit` fait partie des listes couvertes par `?export_liste=` (sauvegarde admin, voir `PROCEDURE_ROLLBACK.md`).

## Module « Brasseurs d'air » — négoce + pose (ajouté août 2026)

*Cadrage complet : `Fichiers divers/Brasseurs d'air/CADRAGE_MODULE_BRASSEURS.md`. Suivi du stock de
brasseurs d'air et accessoires liés (négoce et pose), **hors circuit des immobilisations** — module
isolé au même titre qu'EPI/Outillage/Matériel IT, aucune interaction avec la liste `Mouvements` des
immobilisations. Stock **calculé** (jamais un solde stocké) : somme des mouvements par
Dépôt×Référence×Propriétaire, même principe que EPI/Outillage. 5 nouvelles listes SharePoint,
créées par William sur les deux sites (production et recette) avant le développement du code.*

⚠️ **Piège de nommage constaté à la création des listes** (même classe d'incident que
`Fabricant`/`Fabriquant` et `Code_deverouillage`, voir `04_HISTORIQUE_DECISIONS.md`) : la colonne
quantité de `Brasseurs_Mouvements` a été tapée "Quantité" (avec l'accent) — SharePoint l'a stockée
en interne sous le nom échappé **`Quantit_x00e9_`**, pas `Quantite` comme documenté dans le cadrage
initial. Constaté via `?debug_columns=Brasseurs_Mouvements` sur les deux sites avant d'écrire le
code (identique sur production et recette). Le code (`worker.js`, constante `BRASSEUR_QTE_FIELD`)
utilise systématiquement ce nom interne réel — ne jamais écrire `Quantite` en dur pour cette liste.

### `Brasseurs_Depots`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Code court du dépôt, ex. `OMT`, `TC2` |
| `Nom_Complet` | Texte | Ex. `OM Transit`, `TC N°2` |
| `Prefixe_Document` | Texte | Préfixe utilisé par la numérotation auto des documents, ex. `OM`, `TC2` |
| `Site` | Texte | `Reunion` / `Mayotte` |
| `Actif` | Texte | `Oui` / `Non` |

### `Brasseurs_Catalogue`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Référence, ex. `DCF-FS52920B` (blanc), `DCF-FS52920N` (noir), `PALES`, `CMD-M`... |
| `Designation` | Texte | Ex. `Brasseur d'air blanc` |
| `Categorie` | Texte | Optionnel — ex. `Brasseur`, `Pièce détachée`, `Consommable` |
| `Stock_Mini` | Nombre | Seuil d'alerte global (0/vide = seuil par défaut, même logique qu'EPI/Outillage) |
| `Actif` | Texte | `Oui` / `Non` |

### `Brasseurs_Mouvements`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Référence (correspond à `Brasseurs_Catalogue.Title`) |
| `Document` | Texte | Numéro généré côté serveur, format `{PREFIXE}.{AA}.{MM}.{NNN}` (ex. `OMT.26.08.003`, `TRF.26.08.001`) — repris à 1 chaque mois pour chaque préfixe |
| `Depot` | Texte | Correspond à `Brasseurs_Depots.Title` |
| `Date` | Date | Date du mouvement |
| `Type_Mouvement` | Texte | `Entree` / `Sortie` / `Inventaire` / `Transfert_Sortie` / `Transfert_Entree` — nommée `Type_Mouvement` et non `Type` (nom réservé SharePoint, même raison que `Type_Dotation`/`Type_Article`/`Type_Materiel` ailleurs dans le projet) |
| `Tiers` | Texte | Fournisseur ou client, texte libre — un même tiers peut être tour à tour client et fournisseur |
| `Proprietaire` | Texte | `ELECTRICITE SERVICES REUNION` / `1ST SHINE` — liste fermée à 2 valeurs, contrôlée côté Worker |
| `Destination` | Texte | Libre — `Négoce`, `Maintenance`, nom de chantier, `EDF AGIR+`, etc. |
| **`Quantit_x00e9_`** | Nombre | ⚠️ Nom interne réel (voir piège ci-dessus). Signée : positif = entrée de stock, négatif = sortie |
| `Code_Employe` | Texte | Auteur, toujours résolu depuis `_auth.session.code` (jeton vérifié), jamais depuis le corps de la requête |
| `Commentaire` | Texte | Libre. Porte aussi la trace d'annulation (`[ANNULÉ par CODE le ISO — motif]`, voir plus bas) |
| `Transfert_Lien` | Texte | ID SharePoint de la ligne miroir, uniquement pour `Transfert_Sortie`/`Transfert_Entree` |
| `Horodatage` | Date/heure | ISO |
| `Cree_Par` | Texte | Code employé résolu du jeton de session (identique à `Code_Employe` dans ce module) |

⚠️ **Annulation = quantité ramenée à 0, jamais de suppression** (convention reprise du classeur Excel
d'origine, qui montrait déjà des « mouvements annulés » à quantité 0) : l'historique des numéros de
document et la traçabilité restent intacts. Un mouvement à `Quantit_x00e9_ = 0` est donc à
interpréter comme annulé, pas comme une anomalie.

### `Brasseurs_Commandes`

*Couvre aussi bien une commande internationale (PI fournisseur, ex. Chine) qu'un achat local — un
même modèle, `Origine` pilote quels champs sont pertinents (les achats locaux existent réellement,
ex. fournisseur Alclima, qui a aussi été client par le passé).*

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | Référence de commande — n° de PI fournisseur s'il existe (ex. `FS202603051`), sinon identifiant généré `CMD.AA.MM.NNN` (même numérotation que `Brasseurs_Mouvements.Document`) |
| `Origine` | Texte | `International` / `Local` |
| `Fournisseur` | Texte | |
| `Date_Commande` | Date | |
| `Montant_Total` | Nombre | ⚠️ Donnée financière — lecture protégée `requireGarant` (voir plus bas) |
| `Devise` | Texte | `USD` (international) / `EUR` (local) — texte libre, pas de conversion automatique |
| `Acompte_Pourcentage` | Nombre | Optionnel |
| `Incoterm` | Texte | Optionnel — ex. `FOB Shenzhen`, vide pour un achat local |
| `Delai_Estime_Jours` | Nombre | Optionnel, non critique |
| `Date_Arrivee_Estimee` | Date | Optionnel, non critique — modifiable à tout moment depuis le dashboard (bouton "✏️ Arrivée") |
| `Date_Arrivee_Reelle` | Date | Ajoutée août 2026 — date d'arrivée physique effective, saisie manuellement (jamais déduite automatiquement d'une réception SharePoint, qui peut être enregistrée un autre jour que l'arrivée réelle). Le délai (`Date_Commande` → arrivée réelle si connue, sinon estimée) est calculé à la volée côté dashboard, jamais stocké. |
| `Statut` | Texte | `En attente` / `Recue_Partielle` / `Recue` / `Annulee` — recalculé automatiquement à chaque réception depuis l'ensemble des lignes |
| `Cree_Par` | Texte | Code employé résolu du jeton de session |
| `Notes` | Texte | Libre — ⚠️ colonne texte sur une seule ligne (limite ≈255 caractères côté SharePoint), pas "plusieurs lignes" : un texte plus long fait échouer l'écriture avec un message Graph générique ("Invalid request", sans nommer le champ). Vérifié en pratique (août 2026, saisie de la PI FS202603051). |

### `Brasseurs_Lignes_Commande`

| Colonne (nom interne) | Type | Contenu |
|---|---|---|
| `Title` | Texte | ID SharePoint de la commande parente (texte, pas de Lookup — cohérent avec `Lignes_Inventaire`/`Lignes_Dotation_EPI`) |
| `Reference` | Texte | Correspond à `Brasseurs_Catalogue.Title` |
| `Quantite_Commandee` | Nombre | |
| `Prix_Unitaire` | Nombre | ⚠️ Donnée financière — lecture protégée `requireGarant`, dans la devise de la commande parente. Cadrage : « Option A partout, y compris achats locaux » — un seul mécanisme de protection, uniforme quel que soit le fournisseur |
| `Quantite_Recue` | Nombre | 0 par défaut, incrémentée à chaque réception — l'écart se lit directement (`Quantite_Commandee − Quantite_Recue`), aucun champ dédié |

### Protection des prix (endpoints GET)

`?brasseurs_commandes=1` et `?brasseurs_lignes_commande=1` sont protégés `requireGarant` (jeton en
`&token=`, GET sans corps JSON — même mécanisme que `?materiel_it=1`/`?export_liste=`), car ils
exposent respectivement `Montant_Total` et `Prix_Unitaire`. `?brasseurs_depots=1`,
`?brasseurs_catalogue=1`, `?brasseurs_mouvements=1` et `?brasseurs_stock=1` restent publics (aucun
prix, seulement des quantités — même niveau de confiance que `?catalogue_epi=1`).

### Liaison automatique pales↔brasseur

Aucune colonne dédiée : purement un comportement d'écran (dashboard) — à la saisie d'une ligne de
sortie `DCF-FS52920B`/`DCF-FS52920N`, une ligne `PALES` est pré-remplie à la même quantité sur le
même `Document`, modifiable/supprimable avant validation (ex. technicien qui réutilise les pales déjà
en place chez le client). Les autres accessoires (`CACHES`/`KITFIX`/`VISSERIE`/`CARTONS`/`ECL`/`CMD-T`)
n'ont aucune pré-proposition automatique.

### Alimentation des listes de configuration (`Brasseurs_Depots`/`Brasseurs_Catalogue`)

Contrairement au cadrage initial (qui ne prévoyait qu'une création manuelle ponctuelle par William),
2 actions dédiées ont été ajoutées après un premier essai en recette qui a révélé qu'aucune action
n'existait pour peupler ces deux listes ni depuis le dashboard ni depuis un script — `ajouter_depot_brasseur`
et `ajouter_reference_brasseur` (`requireGarant`, doublon refusé côté serveur), avec un bouton dédié
dans la vue Stock du dashboard (« ➕ Dépôt » / « ➕ Référence »), même pattern que `ajouter_article_epi`.

### `EXPORTABLE_LISTS`

Les 5 listes ci-dessus ont été ajoutées à `EXPORTABLE_LISTS` (`worker.js` et `dashboard.html`,
synchronisation vérifiée par `tests/backup.export-structure.test.js`) — sauvegarde possible via
`?export_liste=<nom>` comme le reste du modèle de données, voir `PROCEDURE_ROLLBACK.md`.

## Recherche globale dashboard (ajoutée août 2026)

Aucun nouveau modèle de données : la recherche du header (voir `03_REGLES_METIER_ET_ROLES.md`) lit exclusivement les structures déjà chargées en mémoire côté dashboard (`im`, `employesList`, `epiCatalogue`, `outilCatalogue`, et depuis août 2026 `brasseursCatalogue`) — aucune colonne SharePoint ni action Worker ajoutée.

## Fichiers JSON associés

- **`immos.json`** (tableau) : catalogue léger utilisé par la PWA et le Dashboard pour les libellés/catégories/comptes en lecture rapide. Généré à partir de SharePoint, redéployé après modifications importantes.
- **`immos_full.json`** (objet, clé = code IM) : catalogue complet utilisé uniquement par l'outil de migration EBP → SharePoint (`enrichirImmosEBP()` dans le dashboard). Contient 1167 immos (1023 actives + 144 sorties), issu de l'export comptable EBP (`Export_immos_030726_avec_sites.xls`).
- **`inventaire_dec2025.json`** (tableau, ajouté août 2026) : ~2417 lignes de comptage brut du stock d'articles de décembre 2025 (zone, site, chantier, fabriquant, référence, désignation, quantité, chute de câble, observations — sans les colonnes de valorisation du fichier Excel d'origine, obsolètes). Utilisé une seule fois par l'outil de migration (`importerInventaireDec2025()` dans le dashboard) pour créer la première campagne de référence dans `Lignes_Inventaire`.
- **`epi_personnel.json`** (tableau, ajouté août 2026) : 73 salariés avec affectation EPI et 5 tailles, issu de `Liste EPI.xlsx` / "Liste Personnel". Utilisé une seule fois par l'outil de migration (`importerDonneesEPI()` dans le dashboard) pour enrichir la liste `Employes`. **Pseudonymisé fin août 2026** (voir `04_HISTORIQUE_DECISIONS.md`) : `nom`/`prenom` retirés — la correspondance se fait uniquement par `code`, ces deux champs n'étaient de toute façon jamais lus par `importerDonneesEPI()`.
- **`epi_catalogue.json`** (tableau, ajouté août 2026) : ~58 lignes du catalogue d'articles EPI par taille (dont les 2 articles Polo "IMPERIUM" et T-shirt manches longues "MOTECARLO LS", initialement sans taille dans le fichier source, complétés en 5 tailles S à XXL chacun), issu de `Liste EPI.xlsx` / "Correspondance tailles articles" + "Liste articles". Stock initial à 0 partout — à alimenter via une réception initiale correspondant au stock physique réel.
- **`epi_grille_dotation.json`** (tableau, ajouté août 2026) : 40 lignes (4 profils C/M/Z/A × ~10 types d'article), déduites des quantités observées dans `Liste EPI.xlsx` / "Liste Personnel" (identiques pour tous les salariés d'un même profil).
- **`outillage_catalogue.json`** (tableau, ajouté août 2026) : ~41 outils avec référence/marque/prix final/stock actuel, issu de `Détail prime d'outillage.xlsx` / "Commande globale". Stock initial calculé (`Total reçu` − quantités déjà distribuées comptées dans les onglets par service), pas remis à 0 comme pour les EPI (donnée fiable disponible dès le départ).
- **`outillage_grille.json`** (tableau, ajouté août 2026) : ~66 lignes (2 services × ~33 outils en moyenne), issues des colonnes quantité cible des onglets "Tx Neufs"/"Maintenance".
- **`outillage_services.json`** (tableau, ajouté août 2026) : ~63 salariés avec leur service outillage, déduit de la colonne dans laquelle leur code apparaît dans le fichier source.
- **`outillage_lignes.json`** (tableau, ajouté août 2026) : ~1895 lignes de distribution historique (une ligne = un outil déjà remis à un employé), issues des matrices 0/1 des onglets "Tx Neufs"/"Maintenance". Utilisés une seule fois par l'outil de migration (`importerDonneesOutillage()` dans le dashboard).
- **`materiel_it_catalogue.json`** (tableau, ajouté août 2026) : 40 téléphones, issu de `1.5.3. Matériel et utilisateurs 2026.05.23.xlsx` (onglet "2"). Coût mensuel (23,22€ HT, tarif plat Free Pro constaté sur facture) appliqué uniquement aux appareils actifs avec une ligne téléphonique FREE en cours.
- **`materiel_it_mouvements.json`** (tableau, ajouté août 2026) : 40 lignes d'historique initial (un mouvement par appareil, détenteur actuel), issues du même fichier. Date de détention = date d'entrée si connue, sinon date du fichier source (23/05/2026) en repli — voir `04_HISTORIQUE_DECISIONS.md` pour la limite assumée de cette approximation. 3 codes détenteurs (`ADWI`, `HOAL`, `VIMA`) non retrouvés dans `Employes` au moment de la migration, importés tels quels — à corriger par William si nécessaire. **Pseudonymisé fin août 2026** : `nom_detenteur` retiré — sans effet sur l'affichage réel, qui a toujours résolu le détenteur en priorité depuis `employesByCode` (`nomDetenteurMaterielIT()` dans le dashboard), ce champ statique n'étant qu'un repli pour un code introuvable dans `Employes`.

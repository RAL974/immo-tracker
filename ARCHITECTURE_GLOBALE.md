# Immo Tracker — Architecture globale

*Cartographie générée en lisant le code réel du dépôt (`worker.js`, `app.js`, `dashboard.html`, `index.html`, tests, config) le 9 août 2026 — pas seulement les documents `00_*` à `05_*`. Sert de vérification croisée de ces documents ; les écarts constatés sont listés en fin de fichier plutôt que silencieusement corrigés dans la doc existante.*

## 1. Schéma de la chaîne

```mermaid
flowchart LR
    subgraph Client["Navigateur"]
        PWA["PWA terrain\napp.js + index.html + sw.js"]
        DASH["Dashboard\ndashboard.html (autonome)"]
    end

    subgraph CF["Cloudflare"]
        WORKER["Worker immo-proxy\nworker.js"]
    end

    subgraph MS["Microsoft 365"]
        GRAPH["Microsoft Graph API"]
        SP[("SharePoint\nespacesoleil97.sharepoint.com/sites/Logistique-Immos")]
        PA["Power Automate\n(notifications email)"]
    end

    subgraph Static["GitHub Pages (statique)"]
        JSON["Catalogues JSON\nimmos.json, employes.json, ..."]
    end

    PWA -- "fetch (action=...)" --> WORKER
    DASH -- "fetch (action=... / ?debug_*, ?export_liste...)" --> WORKER
    PWA -. "lecture rapide, mode dégradé" .-> JSON
    DASH -. "lecture rapide" .-> JSON
    WORKER -- "OAuth2 client_credentials\n(CLIENT_SECRET_ENV)" --> GRAPH
    GRAPH <--> SP
    SP -. "déclenche sur écriture" .-> PA

    style WORKER fill:#1A3A6B,color:#fff
    style SP fill:#0277BD,color:#fff
```

Aucun appel direct navigateur → SharePoint : le Worker détient seul le secret Azure (`CLIENT_SECRET_ENV`), jamais exposé côté client — nécessaire car `worker.js` est public sur GitHub Pages.

## 2. Inventaire des modules et de leurs écrans

### PWA terrain (`app.js` + `index.html`, écrans `showScreen('screen-*')`)

| Module | Écrans |
|---|---|
| Activation / connexion | `screen-activation` (scan badge + saisie manuelle), `screen-login` (mot de passe dashboard), `screen-accueil` |
| Immobilisations (scan) | `screen-scan-immo`, `screen-etat`, `screen-accepter`, `screen-receveur`, `screen-scan-receveur`, `screen-confirmation` |
| Recherche / dépôt | `screen-stock-depot`, `screen-scan-recherche`, `screen-rechercher`, `screen-photos` |
| Attribution forcée (admin terrain) | `screen-scan-force`, `screen-force-attribution` |
| Réservations | `screen-reserver`, `screen-scan-resa`, `screen-modifier-resa`, `screen-mes-reservations`, `screen-reservations-admin` |
| Absences | `screen-signaler-absence` *(module non documenté dans 00-05, voir § 7)* |
| Campagne d'inventaire de stock | écran dédié "📋 Campagne d'inventaire" (saisie zone/référence/quantité, scan code-barres réutilisant `Html5Qrcode`) |

Pas d'écran PWA pour EPI, Outillage, Matériel IT, Lignes téléphoniques — ces modules sont **100% dashboard** (confirmé par grep : aucune de leurs actions n'apparaît dans `app.js`).

### Dashboard (`dashboard.html`, un seul fichier, tabs `data-tab`)

| Onglet | Fonctions de rendu principales |
|---|---|
| Vue générale | `renderVueGenerale` |
| Circulation | `renderCirc` |
| Dépôt | `renderDepot` |
| Transferts | `renderTransferts` |
| Réservations | `renderResa` |
| Absences | `renderAbsences` *(non documenté dans 00-05)* |
| Alertes | `renderAlertes` |
| Historique | (rendu dans le même bloc que Circulation/mouvements) |
| Documents (FDS) | `renderDocs` |
| Maintenance | `renderMaint` |
| Inventaire stock | `renderInventaireStock`, `renderDetailCampagneInventaire` |
| EPI | `renderEPI`, `renderEPIVue`, `renderEPIDotations`, `renderEPIStock`, `renderEPIGrille`, `renderEPIPonctuelle`, `renderEPIHistorique`, `renderEPIHistMatrice`, `renderEPIHistConsommation` |
| Prime d'outillage | `renderOutillage`, `renderOutillageVue`, `renderOutilStock`, `renderOutilGrille`, `renderOutilDistribution`, `renderOutilManquant`, `renderOutilPrime`, `renderOutilEmployeDetail`, `renderOutilHistorique`, `renderOutilHistMatrice`, `renderOutilHistConsommation` |
| Matériel IT | `renderMaterielIT`, `renderMaterielITTelephones`, `renderMaterielITLignes`, `renderMaterielITDetail`, `renderLigneTelDetail` |
| Analyses | `renderAnalyse` (VNC, export comptable, coûts réparation, top mouvementées...) |
| Utilisateurs (+ admin) | `renderUsers` — contient aussi les outils d'administration (ajout immo/employé, seed rôles/sites, dédoublonnage, export de sauvegarde — voir § 6) |

## 3. Actions du Worker (`worker.js`) et niveau de protection

*Recompté par script (grep sur chaque bloc `if (action === '...')`) lors de l'audit de sécurité du 9 août 2026 (voir § 8) — nombres à jour à cette date, 5 actions de plus qu'au premier inventaire (9 août, avant l'ajout des seuils d'alerte stock et de la campagne d'inventaire immos par scan).*

78 actions POST (`?action=<nom>`) exécutables, dispatchées après `const body = await request.json()`, plus une action retirée mais dont le nom reste réservé (`maj_duree_amort`, voir plus bas). Trois niveaux.

### `requireAdmin` (27 actions — admin strict)

`reset_password`, `maj_droits`, `maj_site_employe`, `ajouter_immo`, `importer_affectation_immo`, `ajouter_employe`, `bulk_patch_immos`, `dedupe_employes`, `maj_actif`, `seed_immo_sites`, `seed_roles_sites`, `creer_campagne_inventaire_immos`, `cloturer_campagne_inventaire_immos`, `bulk_import_lignes_inventaire`, `bulk_import_tailles_epi`, `bulk_import_catalogue_epi`, `bulk_import_grille_dotation_epi`, `bulk_import_catalogue_outillage`, `bulk_maj_duree_outillage`, `bulk_import_grille_outillage`, `bulk_import_lignes_outillage`, `ajouter_materiel_it`, `bulk_import_materiel_it`, `bulk_import_mouvements_materiel_it`, `ajouter_ligne_telephonique`, `bulk_import_lignes_telephoniques`, `bulk_import_mouvements_lignes_telephoniques`

*(Ces 27 sont des actions POST. `export_liste` est aussi protégé `requireAdmin` mais c'est un endpoint GET distinct — voir le tableau des endpoints GET plus bas dans cette section.)*

### `requireGarant` (Admin + Logistique + Logistique_Mayotte — 35 actions)

`upload_fds`, `maj_site_immo`, `marquer_statut_immo`, `maj_panne`, `enregistrer_reparation`, `creer_campagne_inventaire`, `cloturer_campagne_inventaire`, `maj_taille_employe`, `maj_grille_dotation_epi`, `supprimer_grille_dotation_epi`, `ajouter_article_epi`, `bulk_maj_stock_epi`, `maj_stock_mini_epi`, `reception_commande_epi`, `generer_dotation_epi`, `generer_remise_ponctuelle_epi`, `emarger_dotation_epi`, `upload_fiche_epi`, `annuler_dotation_epi`, `maj_service_outillage`, `maj_grille_outillage`, `supprimer_grille_outillage`, `reception_commande_outillage`, `editer_stock_outillage`, `maj_stock_mini_outillage`, `distribuer_outillage`, `upload_fiche_outillage`, `annuler_ligne_outillage`, `maj_materiel_it`, `affecter_materiel_it`, `maj_ligne_telephonique`, `affecter_ligne_telephonique`, `annuler_transfert`, `maj_transfert`, `creer_mouvement_direct`

### Publiques — partagées avec la PWA terrain (badge sans mot de passe — 16 actions)

`verify_password`, `set_password` *(actions d'entrée qui produisent le jeton — ne peuvent pas déjà en exiger un ; désormais protégées par un verrou anti brute-force, voir § 8)*, `upload_photo`, `delete_photo`, `reserver`, `statut_resa`, `modifier_resa`, `transfert`, `declarer_panne`, `resoudre_panne`, `signaler_absence`, `ajouter_ligne_inventaire`, `supprimer_ligne_inventaire`, `enregistrer_scan_inventaire_immo`, `declarer_vol`, `valider`

✅ **`maj_duree_amort` — orpheline, retirée (corrigé lors de l'audit du 9 août 2026)** : ce bloc écrivait encore la colonne `Duree_Amortissement` sans aucune authentification, alors qu'aucun appel n'existe plus dans `dashboard.html`/`app.js` depuis le passage à la durée 100% automatique (voir `02_MODELE_DONNEES.md`). Neutralisé sur le même modèle que `bulk_maj_immos` juste au-dessus dans le code (`{ success: false, error: 'deprecated' }`) plutôt que supprimé, pour ne rien casser si un appel resterait en cache quelque part. Voir § 8 et `SECURITE_ETAT.md`.

### Endpoints GET en lecture (paramètres de requête, avant le branchement POST)

| Paramètre | Protection | Contenu |
|---|---|---|
| `?debug_immos=1`, `?debug_resa=1`, `?debug_transferts=1`, `?debug_employes=1`, `?debug_mouvements=1` | Aucune | Échantillon brut Graph (2-5 lignes) d'une liste, à but diagnostic |
| `?debug_inventaire_columns=1`, `?debug_columns=<liste>` | Aucune | Noms internes réels des colonnes d'une liste SharePoint |
| `?next_code_im=1`, `?next_code_ligne_tel=1`, `?next_code_materiel_it=<préfixe>` | Aucune | Prochain code disponible |
| `?immo_metadata=1`, `?fds_map=1`, `?photos_map=1`, `?employes=1`, `?reservations=1`, `?transferts=1`, `?campagnes_inventaire=1`, `?lignes_inventaire=<id>`, `?campagnes_inventaire_immos=1`, `?scans_inventaire_immos=<nom>`, `?catalogue_epi=1`, `?grille_dotation_epi=1`, `?dotations_epi=1`, `?lignes_dotation_epi=<id>`, `?lignes_dotation_epi_toutes=1`, `?catalogue_outillage=1`, `?grille_outillage=1`, `?lignes_outillage=1`, `?materiel_it=1`, `?mouvements_materiel_it=1`, `?lignes_telephoniques=1`, `?mouvements_lignes_telephoniques=1`, `?absences=1`, `?maintenance=1`, `?mes_reservations=<code>`, `?dashboard=1` | Aucune | Données consolidées pour l'affichage dashboard/PWA — lecture seule mais sans authentification (cohérent avec le choix de conception documenté : friction minimale, PWA sans mot de passe) |
| `?photo=<id>`, `?photos=<code>`, `?fds=<code>`, `?fiche_epi=<id>`, `?fiche_outillage=<id>` | Aucune | Récupération de fichiers/photos déposés sur le drive SharePoint |
| **`?export_liste=<nom_liste>&token=<jeton>`** | **`requireAdmin`** | Export JSON complet d'une liste blanche de listes SharePoint (sauvegarde manuelle avant migration — voir `PROCEDURE_ROLLBACK.md`). Seul endpoint GET protégé du Worker ; le jeton HMAC est transmis en query string (`&token=`) car requireAdmin attend normalement un corps JSON POST — adapté ici pour un GET |

### Audit d'exhaustivité (méthode et résultat, 9 août 2026)

Script de comptage indépendant (regex sur chaque bloc `if (action === 'xxx') {`, classification par présence de `requireAdmin(body)`/`requireGarant(body)` sur la ligne suivante) recoupé avec `GATED_ACTIONS` de `dashboard.html` : **27 requireAdmin + 35 requireGarant = 62 actions protégées, exactement les 62 entrées de `GATED_ACTIONS` — aucun écart, ni manquant ni en trop.** Ce même recoupement est réévalué automatiquement à chaque `npm test` par `tests/security.gated-actions.test.js` (garde-fou anti-régression déjà en place depuis le chantier "Autorisation côté serveur") — cet audit manuel confirme simplement que l'état actuel est sain et documente le chiffre exact à cette date ; la vérification continue reste le test, pas cette page.

## 4. Listes SharePoint et relations

Site `espacesoleil97.sharepoint.com/sites/Logistique-Immos`. Aucune colonne `Lookup` SharePoint nulle part dans le modèle : toutes les relations parent/enfant se font par un champ texte simple portant le code/l'identifiant du parent (ex. `Title` d'une ligne = code de campagne, ou id numérique de la fiche parente) — choix de conception délibéré, cohérent sur l'ensemble du projet.

| Liste | Rôle | Relation |
|---|---|---|
| `Immos` | Catalogue des 1023 immobilisations | — |
| `Employes` | Collaborateurs (+ colonnes EPI, Service_Outillage) | — |
| `Mouvements` | Historique des transferts/retours/pannes/réparations/entretiens (une ligne = un événement) | `Title` = code immo |
| `Transferts_En_Attente` | Transferts/retours non encore validés par un garant | `Title` = code immo |
| `Reservations` | Réservations de matériel | `Code_IM` = code immo |
| `Absences` ⚠️ *non documentée dans 00-05* | Registre à sens unique des absences signalées | `Title` = code employé absent |
| `Campagnes_Inventaire` → `Lignes_Inventaire` | Campagnes de comptage du stock d'articles/consommables | `Lignes_Inventaire.Title` = nom de la campagne (texte, pas de lookup) |
| `Catalogue_Articles_EPI`, `Grille_Dotation_EPI` | Référentiels EPI (stock vivant, grille par profil) | — |
| `Dotations_EPI` → `Lignes_Dotation_EPI` | Fiches de dotation EPI + détail articles | `Lignes_Dotation_EPI.Title` = id SharePoint de la fiche parente |
| `Catalogue_Outillage`, `Grille_Outillage` | Référentiels outillage (stock vivant, kit par service) | — |
| `Lignes_Outillage` | État de distribution outillage (liste plate, pas de fiche séparée) | `Title` = code employé |
| `Materiel_IT` → `Mouvements_Materiel_IT` | Téléphones/ordinateurs + historique de détenteurs | `Mouvements_Materiel_IT.Title` = code appareil |
| `Lignes_Telephoniques` → `Mouvements_Lignes_Telephoniques` | Lignes téléphoniques (indépendantes des appareils) + historique | `Mouvements_Lignes_Telephoniques.Title` = code ligne |

*(Chantiers : voir écart § 7 — aucune liste SharePoint de ce nom n'est utilisée en pratique.)*

## 5. Fichiers du dépôt

| Fichier / dossier | Rôle |
|---|---|
| `index.html`, `app.js`, `sw.js`, `manifest.json`, `style.css` | PWA terrain (coquille + logique + mode hors-ligne) |
| `dashboard.html` | Dashboard encadrement, fichier HTML+CSS+JS autonome (~9000 lignes) |
| `worker.js`, `wrangler.toml` | Proxy sécurisé Cloudflare Worker vers Microsoft Graph |
| `immos.json` (tableau) | Catalogue léger courant, PWA + dashboard |
| `immos_full.json` (objet) | Catalogue complet, migration EBP uniquement |
| `employes.json` | Repli statique si le Worker est indisponible |
| `epi_catalogue.json`, `epi_grille_dotation.json`, `epi_personnel.json` | Données sources de la migration EPI (import one-shot, toujours référencées) |
| `outillage_catalogue.json`, `outillage_grille.json`, `outillage_lignes.json`, `outillage_services.json` | Données sources de la migration Outillage (toujours référencées) |
| `outillage_durees.json`, `outillage_grille_ajouts.json` | ⚠️ **Orphelins** — 0 référence dans `dashboard.html`/`app.js` (voir § 7) |
| `materiel_it_catalogue.json`, `materiel_it_mouvements.json` | Données sources de la migration Matériel IT (toujours référencées) |
| `inventaire_dec2025.json` | Données sources de la migration inventaire déc. 2025 (toujours référencé) |
| `chantiers.json` | ⚠️ **Orphelin** — 0 référence dans le code (voir § 7) |
| `logo.jpg`, `logo-dark.jpg`, `logo-icon.jpg`, `logos/` | Assets graphiques (fiches imprimables, favicon) |
| `package.json`, `scripts/check-dashboard.js`, `scripts/session-start.js`, `scripts/session-rollback.js` | Outillage de développement (vérif syntaxe, rollback de session) |
| `tests/*.test.js`, `tests/helpers/loadWorker.js` | Suite de tests `node --test`, Graph entièrement mocké |
| `.githooks/pre-push` | Bloque le push si `npm run verify` échoue |
| `.github/workflows/tests.yml`, `.github/workflows/deploy.yml` | CI (filet de sécurité tests) + déploiement GitHub Pages |
| `README.md` | Notes de développement (tests, hooks) |
| `PROCEDURE_ROLLBACK.md` | Procédure de rollback (cette session) |
| `00_CONTEXTE_PROJET.md` … `05_ROADMAP_EVOLUTIONS_FUTURES.md`, `CLAUDE.md` | Base de connaissance métier (chargée automatiquement par Claude Code via `CLAUDE.md`) |

## 6. Dépendances CDN

| Librairie | Où | Usage |
|---|---|---|
| Sentry Browser SDK 10.69.0 | `index.html` + `dashboard.html` | Observabilité (erreurs JS), tag `environment` distinct pwa/dashboard |
| `html5-qrcode` 2.3.8 (unpkg) | `index.html` uniquement | Scan QR/codes-barres (immos + inventaire stock) |
| Chart.js 4.4.0 | `dashboard.html` | Graphiques (Analyses) |
| SheetJS (`xlsx`) 0.18.5 | `dashboard.html` | Import Excel (stock EPI, import "Au dépôt") |
| html2canvas 1.4.1 + jsPDF 2.5.1 | `dashboard.html` | Génération PDF locale des fiches de dotation EPI (File System Access API) |
| pdf.js 3.11.174 | `dashboard.html` | Rendu 1ère page des PDF scannés (émargements EPI/Outillage) |
| Tesseract.js 5 (jsdelivr) | `dashboard.html` | OCR best-effort, import de scans EPI en lot |

Aucune de ces dépendances n'est installée via npm — chargement direct par balise `<script src="https://...">`, cohérent avec le principe "zéro build" du projet.

## 7. Écarts constatés entre le code réel et les documents 00-05

1. **Module "Absences" totalement absent des docs 00-05.** Existe pourtant pleinement dans le code : liste SharePoint `Absences`, action `signaler_absence` (PWA, publique), onglet dashboard "Absences" (`renderAbsences`), capacités `ROLE_CAPS.absences`/`voitAbsences` dans `app.js` (non mentionnées dans `03_REGLES_METIER_ET_ROLES.md`, qui ne liste que reserver/bisite/garant/voitTout/admin/comptesExtra). À documenter dans `02_MODELE_DONNEES.md` et `03_REGLES_METIER_ET_ROLES.md` si confirmé comme fonctionnalité durable.
2. **`Chantiers` n'est pas une liste SharePoint utilisée en pratique**, malgré son entrée dans `02_MODELE_DONNEES.md` ("Autres listes → Référentiel des chantiers"). Le code ne fait aucun appel Graph sur une liste de ce nom ; `Code_Chantier`/`Nom_Chantier` sont de simples champs texte libre sur `Reservations`/`Mouvements`. Le fichier `chantiers.json` à la racine (85 Ko) n'est référencé nulle part non plus. À corriger dans la doc, ou à réellement implémenter si le besoin existe.
3. **Deux fichiers JSON orphelins supplémentaires** : `outillage_durees.json` et `outillage_grille_ajouts.json` (0 référence dans le code). Probablement les données sources du correctif documenté dans `04_HISTORIQUE_DECISIONS.md` (« Retour terrain Prime d'outillage : durée d'amortissement & prime annuelle ») — la migration a dû être appliquée une fois puis le code de chargement retiré, sans que les fichiers sources aient été nettoyés du dépôt.
4. ~~**Action Worker `maj_duree_amort` non protégée et orpheline**~~ — **corrigé lors de l'audit de sécurité du 9 août 2026** (voir § 3 et § 8, et `SECURITE_ETAT.md`) : neutralisée sur le modèle `bulk_maj_immos` (`{success:false, error:'deprecated'}`), plus aucune écriture possible sans authentification.
5. **`ROLE_CAPS` a plus de capacités que les « cinq capacités possibles » présentées dans `03_REGLES_METIER_ET_ROLES.md`.** En plus de `reserver`/`bisite`/`garant`/`voitTout`/`admin`/`comptesExtra`, le code définit `absences`, `voitAbsences`, `gererInventaire`, `compterInventaire` — ces deux dernières sont bien documentées plus loin dans le même fichier (section campagne d'inventaire), mais pas rattachées à l'introduction générale du modèle de droits, qui reste présentée comme n'ayant que cinq capacités.
6. **Divergence de dates résolue en amont de cette session** : au démarrage, ce dépôt (`C:\Users\ral\immo-tracker`) avait un code à jour (dernier commit "Lot 3", 9 août) mais une documentation figée au 6 août (n'incluant pas Lot 3), tandis qu'un second dossier de travail (`Desktop\Immos`, non git) avait l'inverse — documentation à jour au 9 août mais code du 3 août. Les fichiers `00_*` à `05_*` et `CLAUDE.md` de ce dépôt ont été resynchronisés depuis `Desktop\Immos` (version confirmée la plus récente : elle mentionne déjà "Lot 3") avant de démarrer le travail de cette session. Si un autre poste/dossier existe encore avec une version divergente, il faudra le rapprocher séparément.

*Aucun de ces écarts n'a été corrigé silencieusement dans le comportement du code — seuls `worker.js`/`dashboard.html` liés directement au Volet A (export de sauvegarde) ont été modifiés cette session. Les corrections de documentation (points 1, 2, 5) restent à appliquer à `02_MODELE_DONNEES.md`/`03_REGLES_METIER_ET_ROLES.md` dans une passe dédiée.*

## 8. Audit et durcissement de sécurité (9-10 août 2026)

*Session dédiée, distincte des sessions fonctionnelles ci-dessus — objectif : durcir sans casser le modèle assumé de la PWA terrain (identité par badge scanné, sans mot de passe). Détail complet, y compris ce qui reste ouvert par choix de conception, dans `SECURITE_ETAT.md`.*

1. **Limitation de débit sur `verify_password`/`set_password`** : verrou progressif par code employé (30s → 5min → 15min selon le nombre d'échecs), compteur en mémoire du Worker (pas de KV/Durable Object provisionné, "best effort" documenté comme tel). La sonde utilisée par le dashboard pour savoir si un mot de passe existe déjà (`__probe__`) est explicitement exclue du comptage. Message explicite côté dashboard (`msgTropDeTentatives`).
2. **Vulnérabilité trouvée et corrigée : bypass `is_reset` dans `set_password`.** Un flag `body.is_reset` non authentifié permettait de sauter la vérification de l'ancien mot de passe — n'importe qui connaissant le code d'un employé pouvait écraser son mot de passe sans le connaître. Jamais envoyé par le dashboard en pratique (vérifié), donc correction sans impact sur l'usage réel. Retiré : la vérification ne dépend plus que de l'existence d'un hash, jamais d'un indicateur fourni par le client.
3. **Audit d'exhaustivité `GATED_ACTIONS`** : voir § 3, aucun écart trouvé (62/62). Action orpheline `maj_duree_amort` neutralisée (voir § 7 point 4).
4. **CORS resserré + en-têtes standards** : `Access-Control-Allow-Origin: '*'` remplacé par une réflexion dynamique limitée à `https://ral974.github.io` (fonction pure `corsOriginFor`, testée). Ajout de `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`, `Strict-Transport-Security`, `Vary: Origin` sur toutes les réponses (un seul objet `cors` partagé par tous les `new Response(...)` du fichier, donc un seul point de correction).
5. **Scrubbing PII sur Sentry** : aucun `Sentry.setUser`/`captureException`/`captureMessage` explicite nulle part dans le projet (vérifié). Vecteur réel identifié : les breadcrumbs automatiques (clics DOM sur `.link-emp`/`.link-im` porteurs de `data-emp`/`data-cim`/`data-nom`, URLs de `fetch` GET avec un code en paramètre). `beforeBreadcrumb`/`beforeSend` ajoutés dans `index.html` et `dashboard.html` : les breadcrumbs `ui.click` sont supprimés entièrement, le reste passe par un scrubber heuristique (codes dans les paramètres d'URL connus, motif "NOM Prénom"/"Prénom NOM").
6. **Audit des secrets dans le dépôt public** — trois trouvailles corrigées :
   - `?debug_employes=1` faisait un echo brut de la réponse Graph, `MotDePasse` (hash PBKDF2) inclus. Redacté (`[redacted]`), les autres champs restent visibles (le diagnostic reste utile).
   - `?materiel_it=1` et `?lignes_telephoniques=1` renvoyaient des codes PIN/PUK/RIO/déverrouillage SIM réels sans aucune authentification. Protégés `requireGarant` (jeton en paramètre `&token=`, même mécanisme que `?export_liste=`) — sans impact PWA, ces deux modules sont 100% dashboard.
   - `materiel_it_catalogue.json` (fichier source de migration, toujours suivi par git) contenait les PIN/PUK/RIO/déverrouillage réels de 40 téléphones. Champs redactés dans l'arbre de travail actuel, **et historique git réécrit** (`git filter-repo`, décision confirmée par William) : le commit d'origine (`b48a4f7`) qui introduisait ces valeurs n'existe plus sous son SHA d'origine dans le dépôt distant après force-push. La réécriture ne remplace pas la rotation des codes eux-mêmes auprès de l'opérateur — voir "reste à faire" dans `SECURITE_ETAT.md`.
   - `dashboard.html` contient un code d'accès partagé en clair (`var PIN='ES974'`) avant l'écran de sélection d'identité. **Décision de William : conservé tel quel**, assumé explicitement comme un filtre cosmétique (l'authentification réelle reste le mot de passe par employé, vérifié serveur) — documenté dans `SECURITE_ETAT.md`.
7. **29 nouveaux tests** répartis sur 4 nouveaux fichiers (`worker.rate-limit.test.js` : 11, `worker.security-headers.test.js` : 7, `security.materiel-it-gets.test.js` : 10, `security.debug-employes-redaction.test.js` : 1) — suite complète passée de 33 à 62 tests, tous verts avant chaque commit de cette session (`npm run verify`, hook `pre-push`).

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

**A1. Immobilisations (scan QR codes) — ✅ FAIT et en service (août 2026)**, code livré et vérifié : lancement/clôture de campagne côté dashboard (`requireAdmin`), mode scan continu côté PWA (profils admin uniquement), rapport d'écarts (site ≠ théorique, immo sortie du parc scannée, immos non scannées) construit sans jamais créer de `Mouvement` — isolation totale vis-à-vis de la logique de détenteur courant existante. Les 2 listes SharePoint (`Campagnes_Inventaire_Immos`, `Scans_Inventaire_Immos`, voir `02_MODELE_DONNEES.md`) ont été créées par William et la fonctionnalité est en service. Détail complet dans `04_HISTORIQUE_DECISIONS.md`.

**A2. Stock d'articles/consommables — ✅ FAIT (août 2026)**, développé après clarification que le besoin réel décrit ci-dessus (au moment de la première rédaction de cette roadmap) concernait en fait ce sujet, distinct des immobilisations. Campagne de comptage manuel (pas de QR/codes-barres sur les articles), dépôt + chantiers actifs, comparaison quantités vs comptage précédent (import du comptage décembre 2025 comme référence). Détail complet dans `04_HISTORIQUE_DECISIONS.md`.

### B. Photos et constat d'état en image — ✅ FAIT (août 2026)
Développé et déployé : jusqu'à 3 photos par mouvement (Retour, Transfert, Réception, Déclaration de panne, Résolution), compression client sous 500 Ko, toujours optionnel/jamais bloquant (mode dégradé compris), lien structuré vers le mouvement via une nouvelle colonne `Mouvements.Photos`. Réutilise le mécanisme de proxy photos déjà présent (mais jusque-là non documenté) depuis le socle applicatif — aucun nouveau stockage créé. Détail complet dans `03_REGLES_METIER_ET_ROLES.md` § Photos de mouvement et `04_HISTORIQUE_DECISIONS.md`.

### C. Coûts de réparation structurés + seuil de réforme — ✅ FAIT (août 2026)
Développé et déployé : coût structuré (colonne SharePoint `Cout_Reparation` sur `Mouvements`), saisie possible à la résolution d'une panne ou indépendamment (entretien, nouveau type de mouvement `Entretien`), double ratio (valeur d'achat ET VNC), seuil de réforme réglable (40/60/80%, défaut 60%) dans l'onglet Analyses. Détail complet dans `04_HISTORIQUE_DECISIONS.md`.

### D. Demandes de matériel planifiées à l'avance — ✅ FAIT (août 2026)
Un CT peut demander du matériel pour une date future (ex. "2 perceuses semaine 32 sur tel chantier"), au lieu du mode réactif d'origine (réservation immédiate d'une immo précise uniquement). Développé et livré en 2 lots : **Lot 1** — demande par catégorie+quantité sans immo précise (extension de la liste `Reservations` existante plutôt qu'une nouvelle liste — voir `04_HISTORIQUE_DECISIONS.md`), statut `Refusee` formalisé, vue liste côté gestionnaire (dashboard) avec Confirmer/Refuser. **Lot 2** — sous-onglet "📅 Planning" (demandes actionnables groupées par semaine puis chantier) + extension du digest hebdomadaire (item F) avec les demandes en attente de traitement depuis plus de 5 jours. Détail complet dans `04_HISTORIQUE_DECISIONS.md` et `03_REGLES_METIER_ET_ROLES.md`.

### E. Interface simplifiée pour Mayotte — ✅ FAIT (août 2026)
Constat : le référent matériel à Mayotte (Logistique_Mayotte) est peu à l'aise avec l'informatique (imprime des documents, envoie des photos par email plutôt que d'utiliser l'app). Développé : un accueil PWA réduit à 3 gros boutons ("✅ Je reçois", "📤 Je rends", "🔧 Signaler une panne"), déclenché automatiquement pour ce rôle (nouvelle capacité `ROLE_CAPS.modeSimplifie`, extensible à d'autres profils plus tard). Couche de présentation uniquement — mêmes actions Worker, mêmes règles, aucun nouvel endpoint. Détail complet dans `03_REGLES_METIER_ET_ROLES.md` et `04_HISTORIQUE_DECISIONS.md`.

### F. Digest de notifications hebdomadaire — ✅ FAIT (août 2026)
Développé et déployé : nouvel endpoint `?digest=1` (Worker, protégé par `DIGEST_TOKEN_ENV`) calculé et envoyé chaque lundi par un nouveau flux Power Automate planifié, en complément du flux "Notification_Mouvement_Immo" existant (qui reste inchangé — un email par mouvement continue d'être envoyé). Récapitule 5 points d'action : transferts/retours en attente > 7 jours, garanties expirant sous 30 jours, pannes non résolues > 7 jours, stock bas EPI/Outillage (seuils déjà en place), campagnes d'inventaire immos ouvertes à faible couverture (< 50%, ouvertes depuis > 14 jours) — les 3 derniers points ajoutés par l'assistant en complément de la demande initiale de William, à sa validation lors du cadrage. Digest vide = pas d'email (décision prise côté flux Power Automate, via une Condition sur le champ `vide`). Détail complet dans `01_ARCHITECTURE_TECHNIQUE.md` § Digest hebdomadaire et `04_HISTORIQUE_DECISIONS.md`.

### G. Module Besoin annuel EPI & Consultations fournisseurs — évolutions différées (sept. 2026)

Le module (calcul du besoin, figeage en consultation, répertoire fournisseurs, offres, comparatif,
attribution, report au catalogue, cadre de réponse Excel exportable/réimportable) est **fait et testé**
— voir `04_HISTORIQUE_DECISIONS.md`. Quatre points ont été identifiés en cours de développement mais
volontairement reportés, aucun n'ayant été demandé par William ni figurant dans le cadrage initial
(`CADRAGE_MODULE_BESOIN_EPI.md`) :

- **Multi-devise réelle** (taux de change, conversion) : `EPI_Offres.Devise` accepte n'importe quelle
  valeur transmise et ne retombe sur `EUR` que si rien n'est fourni, mais aucune conversion n'existe
  nulle part dans le code — un fournisseur qui répond en USD ou CNY (cas déjà vécu côté Brasseurs d'air
  avec 1ST SHINE) verrait ses prix comparés tels quels aux offres en EUR, sans conversion, faussant le
  comparatif. Pas un bug (comportement documenté, cohérent avec D6 — prix jamais dans le calcul du
  besoin, seulement dans l'arbitrage) mais une limite réelle si un fournisseur international répond un
  jour à une consultation EPI.
- **Notation qualité fournisseur** : le comparatif (`epiCalculerComparatifOffres`) et l'attribution ne
  tiennent compte que du prix (et du conditionnement/délai déjà saisis par ligne) — aucune note de
  fiabilité, de qualité de service ou d'historique de litige par fournisseur n'existe, contrairement à
  ce qu'un outil d'achat plus mature proposerait. Le répertoire `Fournisseurs` a une colonne `Notes`
  libre, mais rien de structuré ni d'exploité dans le calcul.
- **Suivi de la commande réelle après attribution** : le module s'arrête au report au catalogue (D8) —
  une fois `Reference`/`Fournisseur` écrits sur `Catalogue_Articles_EPI`, rien ne trace la commande
  d'achat réelle qui en découle (bon de commande, date de passation, réception, écarts commandé/reçu).
  Le module Brasseurs d'air a ce cycle complet (`Brasseurs_Commandes`/`Brasseurs_Lignes_Commande`,
  réception avec gestion des écarts) — rien d'équivalent n'existe côté EPI après l'attribution. Le flux
  de réception de stock EPI déjà existant (`reception_commande_epi`, incrémente `Stock_Actuel`) reste
  totalement indépendant d'une consultation/attribution : rien ne relie une réception physique à
  l'offre qui l'a justifiée.
- **Rapprochement facture** : aucun lien entre une offre attribuée (prix retenu, ligne à ligne) et une
  facture fournisseur reçue ensuite — pas de vérification automatique que ce qui a été facturé
  correspond à ce qui a été arbitré. À rapprocher manuellement en dehors de l'outil aujourd'hui.

Aucun de ces points n'est un engagement — à cadrer avec William si l'usage réel du module (une fois les
5 listes SharePoint créées et une vraie consultation menée) en révèle le besoin concret.

## Priorisation suggérée (à valider avec William)

1. ~~**A — Inventaire physique**~~ : **fait (août 2026)**, code livré pour les deux volets (stock A2, immobilisations A1) — consolide la fiabilité de la base de données sur laquelle s'appuient déjà l'amortissement, l'export comptable et la maintenance préventive.
2. **Module temps chantier** (cadré comme suivi opérationnel, pas RH) : valeur métier forte pour le pilotage des coûts de chantier.
3. ~~**B — Photos / constat d'état**~~ : **fait (août 2026)**.
4. ~~**C — Coûts de réparation + seuil de réforme**~~ : **fait (août 2026)**.
5. ~~**F — Digest hebdomadaire**~~ : **fait (août 2026)**.
6. ~~**D — Demandes planifiées**~~ : **fait (août 2026)**, Lot 1 et Lot 2 livrés.
7. ~~**E — Interface simplifiée Mayotte**~~ : **fait (août 2026)**, en attente du test d'acceptation par le référent Mayotte lui-même (scénario guidé fourni à William).

Seul le module temps chantier (point 2) reste non développé à ce stade.

## Note pour toute reprise de ce document

Avant de développer l'une de ces pistes, revalider avec William : le besoin a-t-il changé, une contrainte nouvelle est-elle apparue (ex. outil RH externe déjà choisi), le périmètre reste-t-il pertinent ? Ce document est une mémoire d'intentions, pas un cahier des charges figé.

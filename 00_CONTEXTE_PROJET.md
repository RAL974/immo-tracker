# Immo Tracker — Contexte du projet

*Document de référence à charger en connaissance de projet. Dernière mise à jour : août 2026.*

## Qui, quoi, pourquoi

**Porteur du projet :** William, Responsable Achats & Logistique chez Electricité Services Réunion (entreprise d'électricité basée à La Réunion, opérant aussi à Mayotte). William est autodidacte en développement (Python, VS Code, GitHub, Cloudflare, SharePoint, Power Automate) et développe/maintient seul cette solution.

**Ce qu'est Immo Tracker :** une application de suivi des immobilisations et du parc matériel (outillage, matériel de chantier, véhicules, informatique…) pour Electricité Services Réunion, sur les deux territoires La Réunion et Mayotte. Elle remplace un suivi Excel manuel.

**Pourquoi ça existe :** la direction d'Electricité Services Réunion a demandé d'évaluer des alternatives commerciales (Organilog, Hector). Une note de synthèse a comparé les options et conclu à la supériorité économique et fonctionnelle de la solution interne (voir `Note_Synthese_Immo_Tracker.docx`). Le principal risque identifié est la dépendance à une seule personne (« bus factor ») — d'où l'existence de ce projet structuré et de la documentation de pérennité.

## Les deux interfaces

1. **PWA terrain** (`app.js` + `index.html`) : utilisée par les collaborateurs sur le terrain pour scanner, réserver, transférer, retourner du matériel. Mobile-first, fonctionne en mode dégradé.
2. **Dashboard** (`dashboard.html`, fichier autonome) : réservé à l'encadrement. Vue complète du parc (circulation, dépôt, historique, transferts, réservations, maintenance, alertes, analyses) + administration.

## Chiffres clés (juillet 2026)

- **1023 immobilisations actives** suivies, dont **812 liées à l'activité terrain** (211 « administratives » : mobilier, informatique, véhicules, logiciels, financières)
- **~97 collaborateurs** référencés
- **Coût d'hébergement : ≈ 0 €** (GitHub Pages + Cloudflare Workers gratuits + Microsoft 365 déjà en place chez Electricité Services Réunion)
- Bi-site : **1013 immos Réunion / ~154 Mayotte** (après correction via la migration EBP)

## Statut d'avancement (août 2026)

✅ **Fait et en production :**
- Cœur applicatif (réservation, transfert, retour, historique)
- Filtres site + badges Réunion/Mayotte sur toutes les rubriques
- Authentification dashboard par mots de passe hachés (PBKDF2/SHA-256)
- Super-admin permanent (AIWI)
- Modèle de droits centralisé (`ROLE_CAPS`) avec 9 rôles dont Encadrement (view-only)
- Flux de validation des retours dépôt par « garants »
- Sortie d'employé (passage inactif, historique conservé)
- **Axe 1** : Amortissement linéaire + Valeur Nette Comptable, durée déduite automatiquement du compte d'amortissement
- **Axe 2** : Export comptable CSV (rapprochement expert-comptable / EBP)
- **Axe 3** : Module de maintenance préventive (garanties, entretiens, immos dormantes)
- Migration complète des données comptables EBP → SharePoint (dates, comptes, sites corrigés)
- Documentation de pérennité (`Immo_Tracker_Documentation.docx`)
- Note de synthèse comparative pour la direction (`Note_Synthese_Immo_Tracker.docx`)
- Coûts de réparation structurés + seuil de réforme réglable (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Worker Cloudflare (`worker.js`) désormais commité et déployé automatiquement via Git (août 2026, voir `01_ARCHITECTURE_TECHNIQUE.md`)
- Campagne d'inventaire de stock d'articles/consommables (août 2026, distinct de l'inventaire des immobilisations — voir `04_HISTORIQUE_DECISIONS.md`)
- Autorisation côté serveur des actions sensibles du Worker + tests automatisés + garde-fous avant push (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Module Matériel IT — téléphones (puis Lignes téléphoniques, indépendantes des appareils) — hors circuit immobilisations, en service (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Seuils d'alerte stock EPI + Outillage, avec suggestion de commande (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Campagne d'inventaire physique des immobilisations par scan QR — roadmap item A1 (août 2026, listes SharePoint créées et fonctionnalité en service, voir `04_HISTORIQUE_DECISIONS.md`)
- Recherche globale dashboard, raccourci clavier `/` (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Audit et durcissement de sécurité — limitation de débit sur la connexion, en-têtes CORS/sécurité resserrés, scrubbing PII Sentry, secrets retirés du dépôt public (août 2026, voir `SECURITE_ETAT.md` et `04_HISTORIQUE_DECISIONS.md`)
- Mode sombre du dashboard, nettoyage de code mort, cohérence visuelle des vues EPI/Outillage (août 2026, voir `04_HISTORIQUE_DECISIONS.md`)
- Module Brasseurs d'air (négoce + pose) — mouvements, transferts inter-dépôts, commandes fournisseur avec réception et gestion des écarts, stock calculé par dépôt × référence × propriétaire (août 2026, code livré, poussé sur `main` et déployé — cadrage dans `Fichiers divers/Brasseurs d'air/CADRAGE_MODULE_BRASSEURS.md`, détail et bugs corrigés après premier test réel dans `02_MODELE_DONNEES.md`/`03_REGLES_METIER_ET_ROLES.md`/`04_HISTORIQUE_DECISIONS.md`. **Testé et validé de bout en bout en recette** (données 100% fictives) ; les listes `Brasseurs_*` de **production** existent mais restent vides — aucun dépôt/référence catalogue réel saisi à ce stade, à faire par William avant un usage réel). **Sortie de stock déclarée par le technicien depuis la PWA** (retour terrain, écran « 📦 Sortie de stock », action `sortie_stock_brasseur_pwa`, plafond de quantité selon le rôle) — **poussé sur `main` et déployé** (production et recette). **Mode avancé pour la population garant** (Admin/Logistique/Logistique_Mayotte) — transfert inter-dépôts (`transfert_stock_brasseur_pwa`), destination Client/Négoce, génération de bon imprimable (Bon de livraison / Bon de transfert, deux gabarits distincts) et archivage de la preuve signée (`upload_fiche_brasseur`, colonne `Photo_Fiche` sur `Brasseurs_Mouvements`) — code écrit et vérifié en recette (navigateur, écritures simulées, `npm run verify` 240/240), **pas encore poussé sur `main`** au moment de la rédaction de cette ligne : voir `04_HISTORIQUE_DECISIONS.md` pour le statut à jour avant de s'y fier
- Sauvegarde complète des listes SharePoint (bouton dashboard, un fichier JSON de toutes les listes, orchestrée liste par liste pour rester sous les limites du plan gratuit Cloudflare) + procédure de restauration documentée (PROCEDURE_RESTAURATION.md) — août 2026
- Environnement de recette (staging) séparé de la production — Worker Cloudflare (`immo-proxy-staging`) et site SharePoint dédiés (`Logistique-Immos-Recette`), données 100% fictives, bandeau permanent, coût 0 €, **en service** (août 2026, voir `PROCEDURE_RECETTE.md` et `01_ARCHITECTURE_TECHNIQUE.md`).
- Pseudonymisation d'`employes.json` — plus de noms dans le catalogue statique public ni dans `?employes=1` ; résolution de noms via l'endpoint dédié `?noms_employes=1` (août 2026, voir `01_ARCHITECTURE_TECHNIQUE.md` et `SECURITE_ETAT.md`).
- Politique de mot de passe renforcée (8 caractères minimum) + verrou anti brute-force persistant via Cloudflare KV (août 2026, voir `SECURITE_ETAT.md`).
- Journal d'audit des actions sensibles du dashboard (liste `Journal_Audit`, onglet dédié, réservé Admin) (août 2026, voir `03_REGLES_METIER_ET_ROLES.md`).
- Module Absences (signalement par l'encadrement de terrain, registre consultable Admin/Encadrement) (voir `03_REGLES_METIER_ET_ROLES.md` et `02_MODELE_DONNEES.md`).
- **Roadmap item B** — Photos et constat d'état lors d'un mouvement (retour/transfert/panne/résolution) (août 2026, voir `04_HISTORIQUE_DECISIONS.md`).
- **Roadmap item D** — Demande de matériel planifiée par catégorie (sans immo précise) + planning dashboard par semaine/chantier, Lot 1 et Lot 2 (août 2026, voir `04_HISTORIQUE_DECISIONS.md`).
- **Roadmap item E** — Accueil PWA simplifié pour le référent Mayotte (`ROLE_CAPS.modeSimplifie`) (août 2026, voir `04_HISTORIQUE_DECISIONS.md`).
- **Roadmap item F** — Digest hebdomadaire de notifications (`?digest=1` + flux Power Automate) (août 2026, voir `04_HISTORIQUE_DECISIONS.md`).

🔜 **Évoquées pour la suite** (voir `05_ROADMAP_EVOLUTIONS_FUTURES.md`) :
- Module de report d'heures / temps chantier (seule évolution de la roadmap non encore développée)

## Comment utiliser cette base de connaissance

Ce projet contient plusieurs documents complémentaires :

| Fichier | Contenu |
|---|---|
| `00_CONTEXTE_PROJET.md` | Ce document — vue d'ensemble |
| `01_ARCHITECTURE_TECHNIQUE.md` | Composants techniques, URLs, déploiement, pièges connus |
| `02_MODELE_DONNEES.md` | Listes SharePoint, colonnes, comptes comptables, catégories |
| `03_REGLES_METIER_ET_ROLES.md` | Rôles, droits, workflows métier |
| `04_HISTORIQUE_DECISIONS.md` | Journal chronologique des décisions et évolutions |
| `05_ROADMAP_EVOLUTIONS_FUTURES.md` | Idées d'évolution non encore développées |

**Conseil d'usage avec Claude :** quand une conversation démarre sur ce projet, ces documents donnent tout le contexte nécessaire sans avoir à tout réexpliquer. Après chaque évolution significative, penser à mettre à jour `04_HISTORIQUE_DECISIONS.md` (et les autres documents concernés) pour que la base de connaissance reste fidèle au code réel.

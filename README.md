# immo-tracker
Suivi des immobilisations Electricité Services Réunion

## Développement

Zéro dépendance à installer (Node.js suffit, aucun `npm install` nécessaire pour les tests eux-mêmes).

```bash
npm test      # lance les tests automatisés (tests/)
npm run check # vérifie la syntaxe de worker.js, app.js et du JS inline de dashboard.html
npm run verify # les deux d'un coup — c'est ce que lance le hook pre-push avant chaque git push
```

Un hook `pre-push` (voir `.githooks/`) bloque le push si `npm run verify` échoue. Il s'installe automatiquement au premier `npm install` (script `prepare`), ou manuellement avec `git config core.hooksPath .githooks`. Pour l'outrepasser volontairement (déconseillé) : `git push --no-verify`.

Un workflow GitHub Actions (`.github/workflows/tests.yml`) relance la même vérification à chaque push sur `main`, en filet de sécurité (le hook local reste la protection principale — le projet est en push direct sans revue de code).

Aucun test ne touche SharePoint/Graph : Microsoft Graph est entièrement mocké (`tests/worker.integration.test.js`), donc zéro risque sur les données réelles.

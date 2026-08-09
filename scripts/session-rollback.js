'use strict';
// Revert propre (git revert — jamais reset --hard/--force) de tous les commits postérieurs à un
// tag "session-*" choisi par l'utilisateur. Ne pousse jamais automatiquement vers origin : le
// rollback reste local tant qu'un "git push" explicite n'est pas fait. Voir PROCEDURE_ROLLBACK.md.
const { execSync } = require('node:child_process');
const readline = require('node:readline/promises');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function runInherit(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function listSessionTags() {
  const raw = run('git tag -l "session-*" --sort=-creatordate');
  const names = raw ? raw.split('\n').filter(Boolean) : [];
  return names.map(function (name) {
    let date = '';
    try { date = run('git log -1 --format=%ci ' + name).slice(0, 16).replace('T', ' '); }
    catch (e) { date = '?'; }
    return { name: name, date: date };
  });
}

async function main() {
  try { run('git rev-parse --is-inside-work-tree'); }
  catch (e) { console.error('Ce dossier n\'est pas un dépôt git.'); process.exit(1); }

  const statusPorcelain = run('git status --porcelain');
  if (statusPorcelain) {
    console.error('Des modifications non commitées sont présentes dans le dépôt.');
    console.error('Commit ou stash (git stash -u) avant de lancer un rollback, pour ne rien perdre.');
    process.exit(1);
  }

  const tags = listSessionTags();
  if (tags.length === 0) {
    console.log('Aucun tag session-* trouvé. Rien à faire (créer un repère avec "npm run session:start").');
    process.exit(0);
  }

  console.log('Tags de session disponibles :');
  tags.forEach(function (t, i) { console.log('  ' + (i + 1) + ') ' + t.name + '  (' + t.date + ')'); });

  const branch = run('git rev-parse --abbrev-ref HEAD');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let choice = process.argv[2];
  if (!choice) {
    choice = await rl.question('\nNuméro ou nom du tag à restaurer (Ctrl+C pour annuler) : ');
  }
  choice = (choice || '').trim();

  let target = null;
  const idx = parseInt(choice, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= tags.length) target = tags[idx - 1].name;
  else if (tags.some(function (t) { return t.name === choice; })) target = choice;

  if (!target) {
    console.error('Choix invalide : "' + choice + '".');
    rl.close();
    process.exit(1);
  }

  const range = target + '..HEAD';
  let count;
  try { count = parseInt(run('git rev-list --count ' + range), 10); }
  catch (e) {
    console.error('Tag introuvable ou invalide : ' + target);
    rl.close();
    process.exit(1);
  }

  if (!count) {
    console.log('HEAD est déjà égal (ou antérieur) au tag ' + target + ' — rien à annuler.');
    rl.close();
    process.exit(0);
  }

  console.log('\n' + count + ' commit(s) seront annulés (via "git revert", un nouveau commit de revert par commit annulé)');
  console.log('sur la branche "' + branch + '", entre ' + target + ' et HEAD.');
  console.log('Cela ne touche QUE le code du dépôt git — aucune donnée SharePoint n\'est concernée (voir PROCEDURE_ROLLBACK.md).');
  console.log('Rien ne sera poussé automatiquement sur origin.');

  const confirm = await rl.question('\nTaper OUI en majuscules pour confirmer : ');
  rl.close();

  if (confirm.trim() !== 'OUI') {
    console.log('Annulé — aucun changement effectué.');
    process.exit(0);
  }

  try {
    runInherit('git revert --no-edit ' + range);
  } catch (e) {
    console.error('\nLe revert s\'est interrompu, probablement à cause d\'un conflit.');
    console.error('Résoudre manuellement (git status), puis "git revert --continue", ou "git revert --abort" pour tout annuler.');
    process.exit(1);
  }

  console.log('\nRollback terminé localement (' + count + ' commit(s) annulé(s) par de nouveaux commits de revert).');
  console.log('Rien n\'a été poussé automatiquement — vérifier "git log" puis "git push" quand vous êtes prêt.');
  console.log('\nRappel : vérifier le déploiement Pages et l\'onglet Deployments du Worker Cloudflare.');
}

main();

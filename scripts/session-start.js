'use strict';
// Crée un tag git de repère avant de commencer une session de travail (voir PROCEDURE_ROLLBACK.md).
// Purement local : rien n'est poussé vers origin, le tag ne sert qu'à un rollback local éventuel.
const { execSync } = require('node:child_process');

function pad(n) { return String(n).padStart(2, '0'); }

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function main() {
  try { run('git rev-parse --is-inside-work-tree'); }
  catch (e) { console.error('Ce dossier n\'est pas un dépôt git.'); process.exit(1); }

  const now = new Date();
  const tag = 'session-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());

  let head, subject, branch;
  try {
    head = run('git rev-parse --short HEAD');
    subject = run('git log -1 --format=%s');
    branch = run('git rev-parse --abbrev-ref HEAD');
  } catch (e) {
    console.error('Impossible de lire HEAD (aucun commit dans ce dépôt ?) : ' + e.message);
    process.exit(1);
  }

  try {
    run('git tag -a ' + tag + ' -m "Repere de session avant modifications"');
  } catch (e) {
    console.error('Échec de la création du tag ' + tag + ' (existe-t-il déjà ?) : ' + e.message);
    process.exit(1);
  }

  console.log('Tag de session créé : ' + tag);
  console.log('  branche : ' + branch);
  console.log('  HEAD    : ' + head + ' — ' + subject);
  console.log('');
  console.log('Ce tag est local uniquement (non poussé sur origin) — voir PROCEDURE_ROLLBACK.md.');
  console.log('En cas de besoin de revenir en arrière : npm run session:rollback');
}

main();

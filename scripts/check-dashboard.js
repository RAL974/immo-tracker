// Extrait et vérifie la syntaxe du JS inline de dashboard.html (pas de <script> externe testable
// directement puisque le fichier n'est pas un module — ce script formalise la vérification faite
// manuellement à chaque changement depuis le début du projet).
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const file = path.join(__dirname, '..', 'dashboard.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

if (!scripts.length) {
  console.error('Aucun bloc <script> trouvé dans dashboard.html — le fichier a-t-il changé de structure ?');
  process.exit(1);
}

const combined = scripts.join('\n;\n');
try {
  new vm.Script(combined, { filename: 'dashboard.html (inline scripts)' });
  console.log('dashboard.html : JS inline syntaxiquement valide (' + scripts.length + ' bloc(s), ' + combined.length + ' caractères).');
} catch (e) {
  console.error('Erreur de syntaxe dans le JS inline de dashboard.html :');
  console.error(e.message);
  process.exit(1);
}

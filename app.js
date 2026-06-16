// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  webhookUrl: 'WEBHOOK_URL_ICI',
  sharepointSite: 'https://espacesoleil97.sharepoint.com/sites/Logistique-Immos',
  admins: ['HEGE', 'CONI'], // Gérard HEURTIN + Nicolas COUTAREL
};

// ── État de l'application ───────────────────────────────────────
let state = {
  employe: null,
  typeMouvement: null,
  codeIM: null,
  scanner: null,
  mouvements: JSON.parse(localStorage.getItem('mouvements') || '[]'),
};

// ── Initialisation ──────────────────────────────────────────────
window.addEventListener('load', () => {
  const employe = localStorage.getItem('employe');
  if (employe) {
    state.employe = JSON.parse(employe);
    afficherEmploye();
  }
  chargerChantiers();
});

// ── Navigation ──────────────────────────────────────────────────
function showScreen(id) {
  stopScanner();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  if (id === 'screen-mon-materiel') afficherMonMateriel();
  if (id === 'screen-admin') reinitAdmin();
}

// ── Affichage employé connecté ──────────────────────────────────
function afficherEmploye() {
  const badge = document.getElementById('user-info');
  badge.textContent = '👷 ' + state.employe.nom;
  badge.classList.remove('hidden');

  // Afficher bouton admin si administrateur
  const isAdmin = CONFIG.admins.includes(state.employe.code);
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !isAdmin);
  });
}

// ── Changer d'utilisateur ───────────────────────────────────────
function changerUtilisateur() {
  if (confirm('Changer d\'utilisateur ? La session actuelle sera fermée.')) {
    localStorage.removeItem('employe');
    state.employe = null;
    const badge = document.getElementById('user-info');
    badge.classList.add('hidden');
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    showScreen('screen-activation');
  }
}

// ── Démarrer un mouvement ───────────────────────────────────────
function startMouvement(type) {
  if (!state.employe) {
    alert('Tu dois d\'abord activer l\'application.\nScanne le QR code de ta carte BTP.');
    showScreen('screen-activation');
    return;
  }
  state.typeMouvement = type;
  document.getElementById('titre-mouvement').textContent = type;
  showScreen('screen-scan-immo');
  startScanner('scanner-immo', onScanImmo);
}

// ── Scanner QR ──────────────────────────────────────────────────
function startScanner(elementId, callback) {
  stopScanner();
  state.scanner = new Html5Qrcode(elementId);
  state.scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    callback,
    () => {}
  ).catch(err => {
    console.error('Erreur scanner:', err);
    alert('Impossible d\'accéder à la caméra. Vérifie les autorisations.');
  });
}

function stopScanner() {
  if (state.scanner) {
    state.scanner.stop().catch(() => {});
    state.scanner = null;
  }
}

// ── Activation : scan carte BTP ─────────────────────────────────
function onScanActivation(code) {
  stopScanner();
  const parts = code.split('|');
  if (parts.length < 2 || parts[0].startsWith('IM')) {
    alert('Ce QR code n\'est pas une carte employé.\nScanne le QR code de ta carte BTP.');
    startScanner('scanner-activation', onScanActivation);
    return;
  }
  const employe = {
    code: parts[0].trim(),
    nom: parts[1].trim(),
  };
  localStorage.setItem('employe', JSON.stringify(employe));
  state.employe = employe;
  afficherEmploye();
  alert('✅ Activation réussie ! Bienvenue ' + employe.nom + '.');
  showScreen('screen-accueil');
}

// ── Scan immo ───────────────────────────────────────────────────
function onScanImmo(code) {
  if (!code.startsWith('IM')) {
    alert('Ce QR code n\'est pas une immobilisation.\nScanne une étiquette immo.');
    return;
  }
  stopScanner();
  state.codeIM = code;
  const result = document.getElementById('immo-result');
  result.textContent = '✅ Immo scannée : ' + code;
  result.classList.remove('hidden');

  setTimeout(() => {
    if (state.typeMouvement === 'Retour') {
      confirmerMouvement();
    } else {
      showScreen('screen-chantier');
    }
  }, 800);
}

// ── Chargement chantiers ────────────────────────────────────────
async function chargerChantiers() {
  const chantiers = [
    { code: 'TEST', nom: 'Chantier test' },
    // Sera remplacé par appel SharePoint via Power Automate
  ];
  const select = document.getElementById('select-chantier');
  chantiers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = c.nom;
    select.appendChild(opt);
  });
}

// ── Confirmation mouvement ──────────────────────────────────────
async function confirmerMouvement() {
  const chantier = state.typeMouvement === 'Retour'
    ? 'DEPOT'
    : document.getElementById('select-chantier').value;

  if (!chantier) {
    alert('Sélectionne un chantier.');
    return;
  }

  const mouvement = {
    code_im: state.codeIM,
    code_employe: state.employe.code,
    nom_employe: state.employe.nom,
    type_mouvement: state.typeMouvement,
    code_chantier: chantier,
    horodatage: new Date().toISOString(),
    commentaire: '',
  };

  // Sauvegarder localement
  state.mouvements.push(mouvement);
  localStorage.setItem('mouvements', JSON.stringify(state.mouvements));

  // Affichage récap avec animation
  document.getElementById('recap').innerHTML = `
    <strong>Immo :</strong> ${mouvement.code_im}<br>
    <strong>Employé :</strong> ${mouvement.nom_employe}<br>
    <strong>Type :</strong> ${mouvement.type_mouvement}<br>
    <strong>Chantier :</strong> ${mouvement.code_chantier}<br>
    <strong>Heure :</strong> ${new Date().toLocaleTimeString('fr-FR')}
  `;
  showScreen('screen-confirmation');

  // Envoi webhook
  try {
    await envoyerMouvement(mouvement);
  } catch (e) {
    console.warn('Envoi webhook différé:', e);
  }
}

// ── Mon matériel ────────────────────────────────────────────────
function afficherMonMateriel() {
  if (!state.employe) {
    showScreen('screen-activation');
    return;
  }

  document.getElementById('mon-materiel-user').textContent =
    '👷 ' + state.employe.nom;

  // Calculer le stock actuel de l'employé depuis l'historique local
  const stock = {};
  state.mouvements
    .filter(m => m.code_employe === state.employe.code)
    .forEach(m => {
      if (m.type_mouvement === 'Sortie') {
        stock[m.code_im] = m;
      } else if (m.type_mouvement === 'Retour') {
        delete stock[m.code_im];
      } else if (m.type_mouvement === 'Transfert') {
        stock[m.code_im] = m;
      }
    });

  const liste = document.getElementById('liste-materiel');
  const items = Object.values(stock);

  if (items.length === 0) {
    liste.innerHTML = '<p class="empty-msg">Aucun matériel en ta possession.</p>';
    return;
  }

  liste.innerHTML = items.map(m => `
    <div class="materiel-card">
      <strong>${m.code_im}</strong>
      <span class="chantier-tag">${m.code_chantier}</span>
      <small>${new Date(m.horodatage).toLocaleDateString('fr-FR')}</small>
    </div>
  `).join('');
}

// ── Administration ──────────────────────────────────────────────
function reinitAdmin() {
  document.getElementById('admin-search').value = '';
  document.getElementById('admin-resultats').innerHTML = '';
}

function adminRechercher() {
  const query = document.getElementById('admin-search').value.trim().toUpperCase();
  if (!query) return;

  const resultats = state.mouvements.filter(m =>
    m.code_im.includes(query) ||
    m.code_employe.includes(query) ||
    m.nom_employe.toUpperCase().includes(query) ||
    m.code_chantier.includes(query)
  ).slice(-50).reverse();

  const div = document.getElementById('admin-resultats');
  if (resultats.length === 0) {
    div.innerHTML = '<p class="empty-msg">Aucun résultat.</p>';
    return;
  }

  div.innerHTML = resultats.map(m => `
    <div class="materiel-card">
      <strong>${m.code_im}</strong> — ${m.type_mouvement}
      <span class="chantier-tag">${m.code_chantier}</span><br>
      <small>👷 ${m.nom_employe} — ${new Date(m.horodatage).toLocaleString('fr-FR')}</small>
    </div>
  `).join('');
}

// ── Envoi webhook ───────────────────────────────────────────────
async function envoyerMouvement(mouvement) {
  if (CONFIG.webhookUrl === 'WEBHOOK_URL_ICI') return;
  const response = await fetch(CONFIG.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mouvement),
  });
  if (!response.ok) throw new Error('Erreur envoi: ' + response.status);
}

// ── Démarrage scanner activation ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btnActivation = document.getElementById('screen-activation');
  if (btnActivation) {
    const observer = new MutationObserver(() => {
      if (btnActivation.classList.contains('active')) {
        startScanner('scanner-activation', onScanActivation);
      }
    });
    observer.observe(btnActivation, { attributes: true });
  }
});

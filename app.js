// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  webhookUrl: 'WEBHOOK_URL_ICI',
  sharepointSite: 'https://espacesoleil97.sharepoint.com/sites/Logistique-Immos',
};

// ── État de l'application ───────────────────────────────────────
let state = {
  employe: null,
  typeMouvement: null,
  codeIM: null,
  scanner: null,
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
}

// ── Affichage employé connecté ──────────────────────────────────
function afficherEmploye() {
  const badge = document.getElementById('user-info');
  badge.textContent = '👷 ' + state.employe.nom;
  badge.classList.remove('hidden');
}

// ── Changer d'utilisateur ───────────────────────────────────────
function changerUtilisateur() {
  if (confirm('Changer d\'utilisateur ? La session actuelle sera fermée.')) {
    localStorage.removeItem('employe');
    state.employe = null;
    const badge = document.getElementById('user-info');
    badge.classList.add('hidden');
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
  // Format QR employé : CODE|NOM_COMPLET
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
  // Vérifier que c'est bien un QR immo (commence par IM)
  if (!code.startsWith('IM')) {
    alert('Ce QR code n\'est pas une immobilisation.\nScanne une étiquette immo.');
    return; // On ne stoppe pas le scanner, l'utilisateur peut réessayer
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
  // Chantiers en dur pour l'instant — sera remplacé par appel SharePoint
  const chantiers = [
    { code: 'TEST', nom: 'Chantier test' },
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
    type_mouvement: state.typeMouvement,
    code_chantier: chantier,
    horodatage: new Date().toISOString(),
    commentaire: '',
  };

  // Affichage récap
  document.getElementById('recap').innerHTML = `
    <strong>Immo :</strong> ${mouvement.code_im}<br>
    <strong>Employé :</strong> ${state.employe.nom}<br>
    <strong>Type :</strong> ${mouvement.type_mouvement}<br>
    <strong>Chantier :</strong> ${mouvement.code_chantier}<br>
    <strong>Heure :</strong> ${new Date().toLocaleTimeString('fr-FR')}
  `;
  showScreen('screen-confirmation');

  // Envoi au webhook (sera activé quand Azure sera configuré)
  try {
    await envoyerMouvement(mouvement);
  } catch (e) {
    console.warn('Envoi webhook différé:', e);
  }
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

// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  webhookMouvements: 'https://immo-proxy.ral-85d.workers.dev/',
  admins: ['HEGE', 'CONI', 'BAKA', 'AUAR', 'BOMA', 'AIWI', 'NAXA'],
};

// ── État ────────────────────────────────────────────────────────
let state = {
  employe: null,
  typeMouvement: null,
  codeIM: null,
  scanner: null,
  mouvements: JSON.parse(localStorage.getItem('mouvements') || '[]'),
};

// ── Initialisation ──────────────────────────────────────────────
window.addEventListener('load', async function() {
  const employe = localStorage.getItem('employe');
  if (employe) {
    state.employe = JSON.parse(employe);
    afficherEmploye();
  }
  await chargerChantiers();
});

// ── Navigation ──────────────────────────────────────────────────
function showScreen(id) {
  stopScanner();
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  if (id === 'screen-mon-materiel') afficherMonMateriel();
  if (id === 'screen-admin') reinitAdmin();
  if (id === 'screen-suivi-immo') reinitSuiviImmo();
}

// ── Affichage employé ───────────────────────────────────────────
function afficherEmploye() {
  const badge = document.getElementById('user-info');
  badge.textContent = '👷 ' + state.employe.nom;
  badge.classList.remove('hidden');
  const isAdmin = CONFIG.admins.includes(state.employe.code);
  // Boutons admin uniquement
  document.querySelectorAll('.admin-only').forEach(function(el) {
    el.classList.toggle('hidden', !isAdmin);
  });
}

function changerUtilisateur() {
  if (confirm('Changer d\'utilisateur ? La session actuelle sera fermée.')) {
    localStorage.removeItem('employe');
    state.employe = null;
    document.getElementById('user-info').classList.add('hidden');
    document.querySelectorAll('.admin-only').forEach(function(el) { el.classList.add('hidden'); });
    showScreen('screen-activation');
  }
}

// ── Chargement chantiers ────────────────────────────────────────
async function chargerChantiers() {
  const select = document.getElementById('select-chantier');
  select.innerHTML = '<option value="">-- Chargement... --</option>';
  try {
    const res = await fetch('chantiers.json');
    const chantiers = await res.json();
    select.innerHTML = '<option value="">-- Sélectionne un chantier --</option>';
    chantiers.forEach(function(c) {
      const opt = document.createElement('option');
      opt.value = c.Code_Chantier;
      opt.textContent = c.Sous_Chantier ? c.Nom_Chantier + ' — ' + c.Sous_Chantier : c.Nom_Chantier;
      select.appendChild(opt);
    });
  } catch (e) {
    select.innerHTML = '<option value="">-- Non disponible --</option>';
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

// ── Scanner ─────────────────────────────────────────────────────
function startScanner(elementId, callback) {
  stopScanner();
  state.scanner = new Html5Qrcode(elementId);
  state.scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    callback,
    function() {}
  ).catch(function(err) {
    console.error('Erreur scanner:', err);
    alert('Impossible d\'accéder à la caméra. Vérifie les autorisations.');
  });
}

function stopScanner() {
  if (state.scanner) {
    state.scanner.stop().catch(function() {});
    state.scanner = null;
  }
}

function onScanActivation(code) {
  stopScanner();
  const parts = code.split('|');
  if (parts.length < 2 || parts[0].startsWith('IM')) {
    alert('Ce QR code n\'est pas une carte employé.\nScanne le QR code de ta carte BTP.');
    startScanner('scanner-activation', onScanActivation);
    return;
  }
  const employe = { code: parts[0].trim(), nom: parts[1].trim() };
  localStorage.setItem('employe', JSON.stringify(employe));
  state.employe = employe;
  afficherEmploye();
  alert('✅ Activation réussie ! Bienvenue ' + employe.nom + '.');
  showScreen('screen-accueil');
}

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
  setTimeout(function() {
    if (state.typeMouvement === 'Retour') {
      confirmerMouvement();
    } else {
      showScreen('screen-chantier');
    }
  }, 800);
}

// ── Confirmation mouvement ──────────────────────────────────────
function confirmerMouvement() {
  const chantier = state.typeMouvement === 'Retour'
    ? 'DEPOT'
    : document.getElementById('select-chantier').value;
  if (!chantier) { alert('Sélectionne un chantier.'); return; }

  const mouvement = {
    code_im: state.codeIM,
    code_employe: state.employe.code,
    nom_employe: state.employe.nom,
    type_mouvement: state.typeMouvement,
    code_chantier: chantier,
    horodatage: new Date().toISOString(),
  };

  state.mouvements.push(mouvement);
  localStorage.setItem('mouvements', JSON.stringify(state.mouvements));

  document.getElementById('recap').innerHTML =
    '<strong>Immo :</strong> ' + mouvement.code_im + '<br>' +
    '<strong>Employé :</strong> ' + mouvement.nom_employe + '<br>' +
    '<strong>Type :</strong> ' + mouvement.type_mouvement + '<br>' +
    '<strong>Chantier :</strong> ' + mouvement.code_chantier + '<br>' +
    '<strong>Heure :</strong> ' + new Date().toLocaleTimeString('fr-FR');

  showScreen('screen-confirmation');

  fetch(CONFIG.webhookMouvements, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mouvement),
  }).then(function(res) { return res.json(); })
    .then(function(data) { console.log('Mouvement:', data.success ? '✅' : '❌', data.status); })
    .catch(function(e) { console.error('Erreur envoi:', e.message); });
}

// ── Mon matériel ────────────────────────────────────────────────
function afficherMonMateriel() {
  if (!state.employe) { showScreen('screen-activation'); return; }
  document.getElementById('mon-materiel-user').textContent = '👷 ' + state.employe.nom;
  const stock = {};
  state.mouvements
    .filter(function(m) { return m.code_employe === state.employe.code; })
    .forEach(function(m) {
      if (m.type_mouvement === 'Sortie' || m.type_mouvement === 'Transfert') {
        stock[m.code_im] = m;
      } else if (m.type_mouvement === 'Retour') {
        delete stock[m.code_im];
      }
    });
  const items = Object.values(stock);
  const liste = document.getElementById('liste-materiel');
  liste.innerHTML = items.length === 0
    ? '<p class="empty-msg">Aucun matériel en ta possession.</p>'
    : items.map(function(m) {
        return '<div class="materiel-card"><strong>' + m.code_im + '</strong>' +
          '<span class="chantier-tag">' + m.code_chantier + '</span>' +
          '<small>' + new Date(m.horodatage).toLocaleDateString('fr-FR') + '</small></div>';
      }).join('');
}

// ── Administration ──────────────────────────────────────────────
function reinitAdmin() {
  document.getElementById('admin-search').value = '';
  document.getElementById('admin-resultats').innerHTML = '<p class="empty-msg">Tapez un code immo, un nom ou un chantier.</p>';
}

async function adminRechercher() {
  const query = document.getElementById('admin-search').value.trim();
  if (!query) return;
  const div = document.getElementById('admin-resultats');
  div.innerHTML = '<p class="empty-msg">Recherche en cours...</p>';
  try {
    const res = await fetch(CONFIG.webhookMouvements + '?q=' + encodeURIComponent(query.toUpperCase()));
    const resultats = await res.json();
    const q = query.toUpperCase();
    const filtres = resultats.filter(function(m) {
      return m.code_im.toUpperCase().includes(q) ||
        m.code_employe.toUpperCase().includes(q) ||
        m.nom_employe.toUpperCase().includes(q) ||
        m.code_chantier.toUpperCase().includes(q);
    });
    div.innerHTML = filtres.length === 0
      ? '<p class="empty-msg">Aucun résultat pour "' + query + '".</p>'
      : filtres.map(function(m) {
          return '<div class="materiel-card"><strong>' + m.code_im + '</strong> — ' + m.type_mouvement +
            ' <span class="chantier-tag">' + m.code_chantier + '</span><br>' +
            '<small>👷 ' + m.nom_employe + ' (' + m.code_employe + ') — ' +
            new Date(m.horodatage).toLocaleString('fr-FR') + '</small></div>';
        }).join('');
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

// ── Suivi par immo ──────────────────────────────────────────────
function reinitSuiviImmo() {
  document.getElementById('suivi-immo-code').value = '';
  document.getElementById('suivi-immo-resultats').innerHTML = '<p class="empty-msg">Scanne ou tape un code immo pour voir son historique.</p>';
  document.getElementById('suivi-immo-localisation').innerHTML = '';
}

function scannerPourSuivi() {
  showScreen('screen-scan-suivi');
  startScanner('scanner-suivi', function(code) {
    stopScanner();
    showScreen('screen-suivi-immo');
    document.getElementById('suivi-immo-code').value = code;
    rechercherSuiviImmo();
  });
}

async function rechercherSuiviImmo() {
  const code = document.getElementById('suivi-immo-code').value.trim().toUpperCase();
  if (!code) return;
  const div = document.getElementById('suivi-immo-resultats');
  const loc = document.getElementById('suivi-immo-localisation');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  loc.innerHTML = '';
  try {
    const res = await fetch(CONFIG.webhookMouvements + '?immo=' + encodeURIComponent(code));
    const mouvements = await res.json();
    if (!Array.isArray(mouvements) || mouvements.length === 0) {
      div.innerHTML = '<p class="empty-msg">Aucun mouvement trouvé pour ' + code + '.</p>';
      return;
    }
    // Localisation actuelle = dernier mouvement
    const dernier = mouvements[0];
    const locActuelle = dernier.type_mouvement === 'Retour' ? '🏭 Au dépôt' : '📍 ' + dernier.code_chantier + ' — ' + dernier.nom_employe;
    loc.innerHTML = '<div class="localisation-badge">' + locActuelle + '</div>';

    // Historique complet
    div.innerHTML = '<h3 style="margin:8px 0;font-size:14px;color:#1a3a6b;">Historique complet (' + mouvements.length + ' mouvements)</h3>' +
      mouvements.map(function(m) {
        const icon = m.type_mouvement === 'Retour' ? '📥' : m.type_mouvement === 'Transfert' ? '🔄' : '📤';
        return '<div class="materiel-card">' + icon + ' <strong>' + m.type_mouvement + '</strong>' +
          ' <span class="chantier-tag">' + m.code_chantier + '</span><br>' +
          '<small>👷 ' + m.nom_employe + ' (' + m.code_employe + ') — ' +
          new Date(m.horodatage).toLocaleString('fr-FR') + '</small></div>';
      }).join('');
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

// ── Démarrage scanner activation ────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  const screen = document.getElementById('screen-activation');
  if (screen) {
    new MutationObserver(function() {
      if (screen.classList.contains('active')) {
        startScanner('scanner-activation', onScanActivation);
      }
    }).observe(screen, { attributes: true });
  }
});

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
  employes: [],
  mouvements: JSON.parse(localStorage.getItem('mouvements') || '[]'),
};

// ── Initialisation ──────────────────────────────────────────────
window.addEventListener('load', async function() {
  const employe = localStorage.getItem('employe');
  if (employe) {
    state.employe = JSON.parse(employe);
    afficherEmploye();
  }
  await chargerEmployes();
  if (state.employe) await verifierTransfertsEnAttente();
});

// ── Navigation ──────────────────────────────────────────────────
function showScreen(id) {
  stopScanner();
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  if (id === 'screen-mon-materiel') afficherMonMateriel();
  if (id === 'screen-admin') reinitAdmin();
  if (id === 'screen-suivi-immo') reinitSuiviImmo();
  if (id === 'screen-suivi-employe') reinitSuiviEmploye();
  if (id === 'screen-transferts-attente') afficherTransfertsEnAttente();
}

// ── Affichage employé ───────────────────────────────────────────
function afficherEmploye() {
  const badge = document.getElementById('user-info');
  badge.textContent = '👷 ' + state.employe.nom;
  badge.classList.remove('hidden');
  const isAdmin = CONFIG.admins.includes(state.employe.code);
  document.querySelectorAll('.admin-only').forEach(function(el) {
    el.classList.toggle('hidden', !isAdmin);
  });
}

function changerUtilisateur() {
  if (confirm('Changer d\'utilisateur ? La session actuelle sera fermée.')) {
    localStorage.removeItem('employe');
    state.employe = null;
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('badge-attente').classList.add('hidden');
    document.querySelectorAll('.admin-only').forEach(function(el) { el.classList.add('hidden'); });
    showScreen('screen-activation');
  }
}

// ── Chargement employés ─────────────────────────────────────────
async function chargerEmployes() {
  try {
    const res = await fetch('employes.json');
    state.employes = await res.json();
    const select = document.getElementById('select-receveur');
    if (select) {
      select.innerHTML = '<option value="">-- Sélectionne un employé --</option>';
      state.employes.forEach(function(e) {
        if (!state.employe || e.Code !== state.employe.code) {
          const opt = document.createElement('option');
          opt.value = e.Code;
          opt.textContent = e.Nom + ' (' + e.Poste + ')';
          select.appendChild(opt);
        }
      });
    }
  } catch (e) {
    console.warn('Employés non chargés:', e);
  }
}

// ── Vérifier transferts en attente ─────────────────────────────
async function verifierTransfertsEnAttente() {
  if (!state.employe) return;
  try {
    const res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    const data = await res.json();
    const badge = document.getElementById('badge-attente');
    if (data.length > 0) {
      badge.textContent = '⚠️ ' + data.length + ' transfert(s) en attente';
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) {
    console.warn('Vérification transferts échouée:', e);
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
  // Recharger la liste employés sans l'utilisateur courant
  chargerEmployes();
  verifierTransfertsEnAttente();
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
  setTimeout(async function() {
    if (state.typeMouvement === 'Retour') {
      confirmerMouvement();
      return;
    }
    // Vérifier si cette immo correspond à un transfert en attente pour moi
    const pending = await chercherTransfertEnAttentePourImmo(code);
    if (pending) {
      state.transfertEnCours = pending;
      document.getElementById('accepter-texte').textContent =
        'Accepter ' + code + ' de la part de ' + pending.nom_donneur + ' ?';
      showScreen('screen-accepter');
    } else {
      showScreen('screen-receveur');
    }
  }, 800);
}

// ── Chercher un transfert en attente pour une immo précise ──────
async function chercherTransfertEnAttentePourImmo(code) {
  try {
    const res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    const transferts = await res.json();
    return transferts.find(function(t) { return t.code_im === code; }) || null;
  } catch (e) {
    return null;
  }
}

// ── Accepter / refuser un transfert détecté au scan ──────────────
function accepterTransfert() {
  const t = state.transfertEnCours;
  fetch(CONFIG.webhookMouvements + '?action=valider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: t.id, code_im: t.code_im, code_employe: state.employe.code, nom_employe: state.employe.nom }),
  }).then(function(res) { return res.json(); })
    .then(function(data) {
      document.getElementById('recap').innerHTML =
        '<strong>✅ Transfert accepté !</strong><br>' +
        '<strong>Immo :</strong> ' + t.code_im + '<br>' +
        '<strong>De :</strong> ' + t.nom_donneur + '<br>' +
        '<strong>Reçu par :</strong> ' + state.employe.nom;
      showScreen('screen-confirmation');
      verifierTransfertsEnAttente();
    })
    .catch(function(e) { console.error('Erreur validation:', e.message); });
}

function refuserTransfert() {
  showScreen('screen-accueil');
}

// ── Confirmation mouvement classique (Retour) ───────────────────
function confirmerMouvement() {
  const mouvement = {
    code_im: state.codeIM,
    code_employe: state.employe.code,
    nom_employe: state.employe.nom,
    type_mouvement: state.typeMouvement,
    code_chantier: 'DEPOT',
    horodatage: new Date().toISOString(),
  };
  enregistrerMouvement(mouvement);
}

// ── Confirmer transfert (étape 1 — donneur) ─────────────────────
function confirmerTransfert() {
  const select = document.getElementById('select-receveur');
  const codeReceveur = select.value;
  const nomReceveur = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
  if (!codeReceveur) { alert('Sélectionne un employé.'); return; }

  const transfert = {
    code_im: state.codeIM,
    code_employe_donneur: state.employe.code,
    nom_donneur: state.employe.nom,
    code_employe_receveur: codeReceveur,
    nom_receveur: nomReceveur.split(' (')[0],
    statut: 'En attente',
    horodatage: new Date().toISOString(),
  };

  document.getElementById('recap').innerHTML =
    '<strong>Immo :</strong> ' + transfert.code_im + '<br>' +
    '<strong>De :</strong> ' + transfert.nom_donneur + '<br>' +
    '<strong>À :</strong> ' + transfert.nom_receveur + '<br>' +
    '<strong>Statut :</strong> En attente de validation<br>' +
    '<strong>Heure :</strong> ' + new Date().toLocaleTimeString('fr-FR');

  showScreen('screen-confirmation');

  // Créer le transfert en attente dans SharePoint
  fetch(CONFIG.webhookMouvements + '?action=transfert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transfert),
  }).then(function(res) { return res.json(); })
    .then(function(data) { console.log('Transfert créé:', data.success ? '✅' : '❌'); })
    .catch(function(e) { console.error('Erreur:', e.message); });
}

// ── Afficher transferts en attente (receveur) ───────────────────
async function afficherTransfertsEnAttente() {
  const div = document.getElementById('liste-attente');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    const transferts = await res.json();
    if (transferts.length === 0) {
      div.innerHTML = '<p class="empty-msg">Aucun transfert en attente.</p>';
      return;
    }
    div.innerHTML = transferts.map(function(t) {
      return '<div class="materiel-card">' +
        '<strong>' + t.code_im + '</strong><br>' +
        '<small>De : ' + t.nom_donneur + '</small><br>' +
        '<small>' + new Date(t.horodatage).toLocaleString('fr-FR') + '</small><br>' +
        '<button class="btn btn-primary" style="margin-top:8px" onclick="validerTransfert(\'' + t.id + '\',\'' + t.code_im + '\')">📷 Scanner pour valider</button>' +
        '</div>';
    }).join('');
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

// ── Valider un transfert (receveur) ─────────────────────────────
function validerTransfert(transfertId, codeIM) {
  state.codeIM = codeIM;
  state.transfertId = transfertId;
  showScreen('screen-scan-validation');
  startScanner('scanner-validation', function(code) {
    stopScanner();
    if (code !== codeIM) {
      alert('Ce n\'est pas le bon matériel. Attendu : ' + codeIM);
      showScreen('screen-transferts-attente');
      return;
    }
    // Valider le transfert
    fetch(CONFIG.webhookMouvements + '?action=valider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: transfertId, code_im: codeIM, code_employe: state.employe.code, nom_employe: state.employe.nom }),
    }).then(function(res) { return res.json(); })
      .then(function(data) {
        document.getElementById('recap').innerHTML =
          '<strong>✅ Transfert validé !</strong><br>' +
          '<strong>Immo :</strong> ' + codeIM + '<br>' +
          '<strong>Reçu par :</strong> ' + state.employe.nom;
        showScreen('screen-confirmation');
        verifierTransfertsEnAttente();
      })
      .catch(function(e) { console.error('Erreur validation:', e.message); });
  });
}

// ── Enregistrer mouvement simple ────────────────────────────────
function enregistrerMouvement(mouvement) {
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
    .then(function(data) { console.log('Mouvement:', data.success ? '✅' : '❌'); })
    .catch(function(e) { console.error('Erreur:', e.message); });
}

// ── Mon matériel ────────────────────────────────────────────────
async function afficherMonMateriel() {
  if (!state.employe) { showScreen('screen-activation'); return; }
  document.getElementById('mon-materiel-user').textContent = '👷 ' + state.employe.nom;
  const liste = document.getElementById('liste-materiel');
  liste.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const res = await fetch(CONFIG.webhookMouvements + '?employe=' + encodeURIComponent(state.employe.code));
    const data = await res.json();
    const items = data.actuel || [];
    liste.innerHTML = items.length === 0
      ? '<p class="empty-msg">Aucun matériel en ta possession.</p>'
      : items.map(function(m) {
          return '<div class="materiel-card"><strong>' + m.code_im + '</strong>' +
            '<small>' + new Date(m.horodatage).toLocaleDateString('fr-FR') + '</small></div>';
        }).join('');
  } catch (e) {
    liste.innerHTML = '<p class="empty-msg">Erreur de connexion. Vérifie ta connexion internet.</p>';
  }
}

// ── Suivi immo ──────────────────────────────────────────────────
function reinitSuiviImmo() {
  document.getElementById('suivi-immo-code').value = '';
  document.getElementById('suivi-immo-resultats').innerHTML = '<p class="empty-msg">Scanne ou tape un code immo.</p>';
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

// ── Mise en forme d'une ligne de mouvement (gère le détail des transferts) ──
function formatMouvementBadge(m) {
  if (m.type_mouvement === 'Transfert' && m.code_chantier && m.code_chantier.indexOf('|') !== -1) {
    const parts = m.code_chantier.split('|');
    const donneurNom = parts[1] || parts[0];
    return '<span class="chantier-tag">' + donneurNom + ' → ' + m.nom_employe + '</span>';
  }
  if (m.type_mouvement === 'Retour') {
    return '<span class="chantier-tag">🏭 Dépôt</span>';
  }
  return '<span class="chantier-tag">' + (m.code_chantier || '') + '</span>';
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
    const dernier = mouvements[0];
    const locActuelle = dernier.type_mouvement === 'Retour'
      ? '🏭 Au dépôt'
      : '👤 Avec ' + dernier.nom_employe + ' (' + dernier.code_employe + ')';
    loc.innerHTML = '<div class="localisation-badge">' + locActuelle + '</div>';
    div.innerHTML = '<h3 style="margin:8px 0;font-size:14px;color:#1a3a6b;">Historique (' + mouvements.length + ' mouvements)</h3>' +
      mouvements.map(function(m) {
        const icon = m.type_mouvement === 'Retour' ? '📥' : m.type_mouvement === 'Transfert' ? '🔄' : '📤';
        return '<div class="materiel-card">' + icon + ' <strong>' + m.type_mouvement + '</strong>' +
          ' ' + formatMouvementBadge(m) + '<br>' +
          '<small>👷 ' + m.nom_employe + ' (' + m.code_employe + ') — ' +
          new Date(m.horodatage).toLocaleString('fr-FR') + '</small></div>';
      }).join('');
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

// ── Suivi par employé ────────────────────────────────────────────
function reinitSuiviEmploye() {
  document.getElementById('suivi-employe-search').value = '';
  document.getElementById('suivi-employe-suggestions').innerHTML = '';
  document.getElementById('suivi-employe-resultats').innerHTML = '<p class="empty-msg">Tape un nom ou un code employé.</p>';
}

function rechercherSuggestionsEmploye() {
  const query = document.getElementById('suivi-employe-search').value.trim().toUpperCase();
  const div = document.getElementById('suivi-employe-suggestions');
  if (!query) { div.innerHTML = ''; return; }

  const matches = state.employes.filter(function(e) {
    return e.Code.toUpperCase().includes(query) || e.Nom.toUpperCase().includes(query);
  }).slice(0, 8);

  if (matches.length === 0) {
    div.innerHTML = '<p class="empty-msg">Aucun employé trouvé.</p>';
    return;
  }

  div.innerHTML = matches.map(function(e) {
    return '<div class="suggestion-item" onclick="afficherSuiviEmploye(\'' + e.Code + '\',\'' + e.Nom.replace(/'/g, "\\'") + '\')">' +
      '<strong>' + e.Nom + '</strong> <span class="chantier-tag">' + e.Code + '</span>' +
      '<small> — ' + e.Poste + '</small></div>';
  }).join('');
}

async function afficherSuiviEmploye(code, nom) {
  document.getElementById('suivi-employe-search').value = nom + ' (' + code + ')';
  document.getElementById('suivi-employe-suggestions').innerHTML = '';
  const div = document.getElementById('suivi-employe-resultats');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';

  try {
    const res = await fetch(CONFIG.webhookMouvements + '?employe=' + encodeURIComponent(code));
    const data = await res.json();

    let html = '<h3 style="margin:8px 0;font-size:14px;color:#1a3a6b;">📦 Actuellement en sa possession (' + data.actuel.length + ')</h3>';
    if (data.actuel.length === 0) {
      html += '<p class="empty-msg">Aucun matériel en ce moment.</p>';
    } else {
      html += data.actuel.map(function(m) {
        return '<div class="materiel-card"><strong>' + m.code_im + '</strong>' +
          '<small> — ' + new Date(m.horodatage).toLocaleDateString('fr-FR') + '</small></div>';
      }).join('');
    }

    html += '<h3 style="margin:16px 0 8px;font-size:14px;color:#1a3a6b;">🕓 Historique complet (' + data.historique.length + ' mouvements)</h3>';
    if (data.historique.length === 0) {
      html += '<p class="empty-msg">Aucun mouvement enregistré.</p>';
    } else {
      html += data.historique.map(function(m) {
        const icon = m.type_mouvement === 'Retour' ? '📥' : m.type_mouvement === 'Transfert' ? '🔄' : '📤';
        return '<div class="materiel-card">' + icon + ' <strong>' + m.code_im + '</strong> — ' + m.type_mouvement + '<br>' +
          '<small>' + new Date(m.horodatage).toLocaleString('fr-FR') + '</small></div>';
      }).join('');
    }

    div.innerHTML = html;
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
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
            ' ' + formatMouvementBadge(m) + '<br>' +
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

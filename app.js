// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  webhookMouvements: 'https://immo-proxy.ral-85d.workers.dev/',
  admins: ['HEGE', 'CONI', 'BAKA', 'AUAR', 'BOMA', 'AIWI', 'NAXA'],
  retourRapide: ['CONI', 'HEGE'],
  etatsRanking: { 'Neuf': 5, 'Bon état': 4, 'Usé': 3, 'Abîmé': 2, 'Hors service': 1 },
};

// ── État ────────────────────────────────────────────────────────
let state = {
  employe: null,
  typeMouvement: null,
  codeIM: null,
  codeReceveur: null,
  nomReceveur: null,
  etatChoisi: 'Bon état',
  noteTexte: '',
  scanner: null,
  employes: [],
  immos: {},
  transfertEnCours: null,
  photoImmo: null,
  transfertId: null,
  mouvements: JSON.parse(localStorage.getItem('mouvements') || '[]'),
  resaImmoCode: null,
  resaImmoLibelle: null,
};

// ── Vibration ───────────────────────────────────────────────────
function vibrer(ms) {
  if (navigator.vibrate) navigator.vibrate(ms || 150);
}

// ── Initialisation ──────────────────────────────────────────────
window.addEventListener('load', async function() {
  var employe = localStorage.getItem('employe');
  if (employe) {
    state.employe = JSON.parse(employe);
    afficherEmploye();
    verifierTransfertsEnAttente();
    chargerBadgeMateriel();
  }
  await chargerEmployes();
  await chargerImmos();
});

// ── Navigation ──────────────────────────────────────────────────
function showScreen(id) {
  stopScanner();
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  if (id === 'screen-mon-materiel') afficherMonMateriel();
  if (id === 'screen-mes-reservations') afficherMesReservations();
  if (id === 'screen-reserver') { state.resaImmoCode = null; state.resaImmoLibelle = null; document.getElementById('resa-immo-info').textContent = ''; document.getElementById('resa-immo-search').value = ''; document.getElementById('resa-immo-suggestions').innerHTML = ''; document.getElementById('resa-date-debut').value = ''; document.getElementById('resa-date-fin').value = ''; document.getElementById('resa-chantier').value = ''; document.getElementById('resa-note').value = ''; }
  if (id === 'screen-admin') reinitAdmin();
  if (id === 'screen-suivi-immo') reinitSuiviImmo();
  if (id === 'screen-suivi-employe') reinitSuiviEmploye();
  if (id === 'screen-transferts-attente') afficherTransfertsEnAttente();
}

// ── Affichage employé ───────────────────────────────────────────
function afficherEmploye() {
  var badge = document.getElementById('user-info');
  badge.textContent = '👷 ' + state.employe.nom;
  badge.classList.remove('hidden');
  var isAdmin = CONFIG.admins.includes(state.employe.code);
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
    document.getElementById('badge-materiel').classList.add('hidden');
    document.querySelectorAll('.admin-only').forEach(function(el) { el.classList.add('hidden'); });
    showScreen('screen-activation');
  }
}

// ── Badge compteur "Mon matériel" ───────────────────────────────
async function chargerBadgeMateriel() {
  if (!state.employe) return;
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?employe=' + encodeURIComponent(state.employe.code));
    var data = await res.json();
    var count = (data.actuel || []).length;
    var badge = document.getElementById('badge-materiel');
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) { /* silencieux */ }
}

// ── Chargement employés (CONI et HEGE en premier) ──────────────
async function chargerEmployes() {
  try {
    var res = await fetch('employes.json');
    state.employes = await res.json();
    var select = document.getElementById('select-receveur');
    if (!select) return;
    select.innerHTML = '<option value="">-- Sélectionne un employé --</option>';

    // CONI et HEGE en tête (sauf si c'est moi)
    var prioritaires = state.employes.filter(function(e) {
      return CONFIG.retourRapide.includes(e.Code) && (!state.employe || e.Code !== state.employe.code);
    });
    var autres = state.employes.filter(function(e) {
      return !CONFIG.retourRapide.includes(e.Code) && (!state.employe || e.Code !== state.employe.code);
    });

    var optGroup1 = document.createElement('optgroup');
    optGroup1.label = '⭐ Gestionnaires dépôt';
    prioritaires.forEach(function(e) {
      var opt = document.createElement('option');
      opt.value = e.Code;
      opt.textContent = e.Nom + ' (' + e.Code + ')';
      optGroup1.appendChild(opt);
    });
    if (prioritaires.length) select.appendChild(optGroup1);

    var optGroup2 = document.createElement('optgroup');
    optGroup2.label = 'Tous les employés';
    autres.forEach(function(e) {
      var opt = document.createElement('option');
      opt.value = e.Code;
      opt.textContent = e.Nom + ' (' + e.Code + ')';
      optGroup2.appendChild(opt);
    });
    select.appendChild(optGroup2);
  } catch (e) {
    console.warn('Employés non chargés:', e);
  }
}

// ── Chargement immos (libellés et FDS) ─────────────────────────────
async function chargerImmos() {
  try {
    var res = await fetch('immos.json');
    var arr = await res.json();
    arr.forEach(function(i) { state.immos[i.Code_IM] = i; });
  } catch (e) { console.warn('immos.json non chargé:', e); }
}

function getFdsUrl(fdsValue, codeIM) {
  if (!fdsValue) return '';
  if (!fdsValue.startsWith('http')) return CONFIG.webhookMouvements + '?fds=' + encodeURIComponent(codeIM || '');
  if (fdsValue.includes('sharepoint.com')) return CONFIG.webhookMouvements + '?fds=' + encodeURIComponent(codeIM || '');
  return fdsValue;
}

function getLibelle(codeIM) {
  return state.immos[codeIM] ? state.immos[codeIM].Libelle : codeIM;
}

function getFDS(codeIM) {
  return state.immos[codeIM] ? state.immos[codeIM].FDS_URL : '';
}

function immoCard(codeIM, extraInfo, date) {
  var libelle = getLibelle(codeIM);
  var fds = getFDS(codeIM);
  var fdsProxyUrl = getFdsUrl(fds, codeIM);
  var fdsBtn = fdsProxyUrl ? '<a href="' + fdsProxyUrl + '" target="_blank" style="display:inline-block;margin-left:6px;font-size:11px;padding:2px 8px;background:#E3F2FD;color:#0D47A1;border-radius:8px;text-decoration:none;font-weight:600;">📄 FDS</a>' : '';
  return '<div class="materiel-card">' +
    '<strong style="font-size:15px">' + libelle + '</strong>' + fdsBtn + '<br>' +
    '<span style="font-size:11px;color:#999;font-family:monospace">' + codeIM + '</span>' +
    (extraInfo ? ' ' + extraInfo : '') +
    (date ? '<br><small>' + date + '</small>' : '') +
    '</div>';
}

// ── Vérifier transferts en attente ─────────────────────────────
async function verifierTransfertsEnAttente() {
  if (!state.employe) return;
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    var data = await res.json();
    var badge = document.getElementById('badge-attente');
    if (Array.isArray(data) && data.length > 0) {
      badge.textContent = '⚠️ ' + data.length + ' transfert(s) en attente de ta validation';
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) { /* silencieux */ }
}

// ── Démarrer un mouvement ───────────────────────────────────────
function startMouvement(type) {
  if (!state.employe) {
    alert('Tu dois d\'abord activer l\'application.\nScanne le QR code de ta carte BTP.');
    showScreen('screen-activation');
    return;
  }
  state.typeMouvement = type;
  state.codeReceveur = null;
  state.nomReceveur = null;
  document.getElementById('titre-mouvement').textContent = type;
  document.getElementById('immo-result').classList.add('hidden');
  showScreen('screen-scan-immo');
  startScanner('scanner-immo', onScanImmo);
}

// ── Retour rapide (CONI ou HEGE pré-sélectionné) ───────────────
function retourRapide(codeDestinataire) {
  if (!state.employe) {
    alert('Tu dois d\'abord activer l\'application.\nScanne le QR code de ta carte BTP.');
    showScreen('screen-activation');
    return;
  }
  var employe = state.employes.find(function(e) { return e.Code === codeDestinataire; });
  if (!employe) { alert('Gestionnaire introuvable.'); return; }
  state.typeMouvement = 'Transfert';
  state.codeReceveur = codeDestinataire;
  state.nomReceveur = employe.Nom;
  document.getElementById('titre-mouvement').textContent = 'Rendre à ' + employe.Nom.split(' ')[0];
  document.getElementById('immo-result').classList.add('hidden');
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

// ── Activation ──────────────────────────────────────────────────
function onScanActivation(code) {
  stopScanner();
  var parts = code.split('|');
  if (parts.length < 2 || parts[0].startsWith('IM')) {
    vibrer(50);
    alert('Ce QR code n\'est pas une carte employé.\nScanne le QR code de ta carte BTP.');
    startScanner('scanner-activation', onScanActivation);
    return;
  }
  vibrer(200);
  var employe = { code: parts[0].trim(), nom: parts[1].trim() };
  localStorage.setItem('employe', JSON.stringify(employe));
  state.employe = employe;
  afficherEmploye();
  chargerEmployes();
  verifierTransfertsEnAttente();
  chargerBadgeMateriel();
  verifierReservationsEnRetard();
  alert('✅ Activation réussie ! Bienvenue ' + employe.nom + '.');
  showScreen('screen-accueil');
}

// ── Scan immo ───────────────────────────────────────────────────
function onScanImmo(code) {
  if (!code.startsWith('IM')) {
    vibrer(50);
    alert('Ce QR code n\'est pas une immobilisation.\nScanne une étiquette immo.');
    return;
  }
  stopScanner();
  vibrer(200);
  state.codeIM = code;
  var result = document.getElementById('immo-result');
  result.textContent = '✅ Immo scannée : ' + code;
  result.classList.remove('hidden');

  setTimeout(async function() {
    if (state.typeMouvement === 'Retour') {
      // Retour admin → passe directement à l'état
      document.getElementById('etat-immo-info').textContent = code + ' → Dépôt';
      document.getElementById('select-etat').value = 'Bon état';
      document.getElementById('note-texte').value = '';
      showScreen('screen-etat');
      return;
    }

    // Vérifier si transfert en attente pour moi sur cette immo
    var pending = await chercherTransfertEnAttentePourImmo(code);
    if (pending) {
      state.transfertEnCours = pending;
      document.getElementById('accepter-texte').textContent =
        'Accepter ' + getLibelle(code) + ' (' + code + ') de ' + pending.nom_donneur + ' ?';
      // Afficher état déclaré par le donneur
      var etatDiv = document.getElementById('accepter-etat-donneur');
      var noteDiv = document.getElementById('accepter-note-donneur');
      if (pending.etat) {
        etatDiv.textContent = 'État déclaré par ' + pending.nom_donneur + ' : ' + pending.etat;
        etatDiv.classList.remove('hidden');
      } else {
        etatDiv.classList.add('hidden');
      }
      if (pending.note) {
        noteDiv.innerHTML = '<p style="font-size:13px;color:#666;padding:8px;background:#f9f9f9;border-radius:8px;margin-top:6px;">📝 ' + pending.note + '</p>';
      } else {
        noteDiv.innerHTML = '';
      }
      document.getElementById('accepter-select-etat').value = pending.etat || 'Bon état';
      document.getElementById('accepter-note').value = '';
      showScreen('screen-accepter');
      return;
    }

    // Pas de transfert en attente → flux normal
    if (state.codeReceveur) {
      // Retour rapide : destinataire déjà défini
      document.getElementById('etat-immo-info').textContent = code + ' → ' + state.nomReceveur;
      document.getElementById('select-etat').value = 'Bon état';
      document.getElementById('note-texte').value = '';
      showScreen('screen-etat');
    } else {
      // Sélection du receveur
      document.getElementById('receveur-immo-info').textContent = 'Immo : ' + code;
      showScreen('screen-receveur');
    }
  }, 600);
}

// ── Chercher transfert en attente pour une immo ─────────────────
async function chercherTransfertEnAttentePourImmo(code) {
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    var transferts = await res.json();
    return transferts.find(function(t) { return t.code_im === code; }) || null;
  } catch (e) { return null; }
}

// ── Valider le receveur → aller à l'état ───────────────────────
function validerReceveur() {
  var select = document.getElementById('select-receveur');
  var code = select.value;
  var opt = select.options[select.selectedIndex];
  if (!code) { alert('Sélectionne un employé.'); return; }
  state.codeReceveur = code;
  state.nomReceveur = opt ? opt.textContent.split(' (')[0] : code;
  document.getElementById('etat-immo-info').textContent = state.codeIM + ' → ' + state.nomReceveur;
  document.getElementById('select-etat').value = 'Bon état';
  document.getElementById('note-texte').value = '';
  showScreen('screen-etat');
}

// ── Confirmer avec état et note ─────────────────────────────────
function confirmerAvecEtat() {
  state.etatChoisi = document.getElementById('select-etat').value;
  state.noteTexte = document.getElementById('note-texte').value.trim();

  if (state.typeMouvement === 'Retour') {
    // Retour dépôt admin
    var mouvement = {
      code_im: state.codeIM,
      code_employe: state.employe.code,
      nom_employe: state.employe.nom,
      type_mouvement: 'Retour',
      code_chantier: 'DEPOT',
      etat: state.etatChoisi,
      note: state.noteTexte,
      horodatage: new Date().toISOString(),
    };
    afficherRecap(mouvement);
    enregistrerMouvement(mouvement);
    return;
  }

  // Transfert (normal ou retour rapide)
  var transfert = {
    code_im: state.codeIM,
    code_employe_donneur: state.employe.code,
    nom_donneur: state.employe.nom,
    code_employe_receveur: state.codeReceveur,
    nom_receveur: state.nomReceveur,
    etat: state.etatChoisi,
    note: state.noteTexte,
    horodatage: new Date().toISOString(),
  };

  document.getElementById('recap').innerHTML =
    '<strong>Immo :</strong> ' + transfert.code_im + '<br>' +
    '<strong>De :</strong> ' + transfert.nom_donneur + '<br>' +
    '<strong>À :</strong> ' + transfert.nom_receveur + '<br>' +
    '<strong>État :</strong> ' + transfert.etat + (transfert.note ? '<br><strong>Note :</strong> ' + transfert.note : '') + '<br>' +
    '<strong>Statut :</strong> En attente de validation<br>' +
    '<strong>Heure :</strong> ' + new Date().toLocaleTimeString('fr-FR');

  document.getElementById('alerte-degradation').classList.add('hidden');
  vibrer(300);
  showScreen('screen-confirmation');

  fetch(CONFIG.webhookMouvements + '?action=transfert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transfert),
  }).then(function(r) { return r.json(); })
    .then(function(d) { console.log('Transfert créé:', d.success ? '✅' : '❌', d.status); })
    .catch(function(e) { console.error('Erreur:', e.message); });
}

// ── Accepter un transfert (receveur) ────────────────────────────
function accepterTransfert() {
  var t = state.transfertEnCours;
  var etatReception = document.getElementById('accepter-select-etat').value;
  var noteReception = document.getElementById('accepter-note').value.trim();

  // Vérifier dégradation
  var etatDonneurRank = CONFIG.etatsRanking[t.etat] || 4;
  var etatReceveurRank = CONFIG.etatsRanking[etatReception] || 4;
  var degradation = etatReceveurRank < etatDonneurRank;

  fetch(CONFIG.webhookMouvements + '?action=valider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: t.id,
      code_im: t.code_im,
      code_employe: state.employe.code,
      nom_employe: state.employe.nom,
      etat_reception: etatReception,
      note_reception: noteReception,
      etat_donneur: t.etat || '',
    }),
  }).then(function(r) { return r.json(); })
    .then(function(data) {
      document.getElementById('recap').innerHTML =
        '<strong>✅ Transfert accepté !</strong><br>' +
        '<strong>Immo :</strong> ' + t.code_im + '<br>' +
        '<strong>De :</strong> ' + t.nom_donneur + '<br>' +
        '<strong>Reçu par :</strong> ' + state.employe.nom + '<br>' +
        '<strong>État constaté :</strong> ' + etatReception +
        (noteReception ? '<br><strong>Note :</strong> ' + noteReception : '');

      var alertDiv = document.getElementById('alerte-degradation');
      if (degradation) {
        alertDiv.textContent = '⚠️ Dégradation constatée ! Déclaré "' + (t.etat || '?') + '" par ' + t.nom_donneur + ', reçu "' + etatReception + '"';
        alertDiv.classList.remove('hidden');
      } else {
        alertDiv.classList.add('hidden');
      }

      vibrer(300);
      showScreen('screen-confirmation');
      verifierTransfertsEnAttente();
      chargerBadgeMateriel();
    })
    .catch(function(e) { console.error('Erreur validation:', e.message); });
}

function refuserTransfert() {
  showScreen('screen-accueil');
}

// ── Afficher les transferts en attente ──────────────────────────
async function afficherTransfertsEnAttente() {
  var div = document.getElementById('liste-attente');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    var transferts = await res.json();
    if (transferts.length === 0) {
      div.innerHTML = '<p class="empty-msg">Aucun transfert en attente.</p>';
      return;
    }
    div.innerHTML = transferts.map(function(t) {
      var etatInfo = t.etat ? ' — État déclaré : <strong>' + t.etat + '</strong>' : '';
      var noteInfo = t.note ? '<br><small>📝 ' + t.note + '</small>' : '';
      return '<div class="materiel-card">' +
        '<strong>' + getLibelle(t.code_im) + '</strong> <span style="font-size:11px;color:#999;font-family:monospace">(' + t.code_im + ')</span><br>' +
        '<small>De : ' + t.nom_donneur + etatInfo + '</small>' + noteInfo + '<br>' +
        '<small>' + new Date(t.horodatage).toLocaleString('fr-FR') + '</small><br>' +
        '<button class="btn btn-primary" style="margin-top:8px;padding:10px" onclick="demarrerValidationTransfert(\'' + t.id + '\',\'' + t.code_im + '\')">📷 Scanner pour valider</button>' +
        '</div>';
    }).join('');
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

function demarrerValidationTransfert(transfertId, codeIM) {
  state.transfertId = transfertId;
  showScreen('screen-scan-validation');
  startScanner('scanner-validation', function(code) {
    stopScanner();
    if (code !== codeIM) {
      alert('Ce n\'est pas le bon matériel. Attendu : ' + codeIM);
      showScreen('screen-transferts-attente');
      return;
    }
    state.codeIM = code;
    // Chercher les infos complètes du transfert
    var pending = null;
    fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code)
      .then(function(r) { return r.json(); })
      .then(function(transferts) {
        pending = transferts.find(function(t) { return t.id === transfertId; });
        state.transfertEnCours = pending || { id: transfertId, code_im: code, nom_donneur: '?', etat: '', note: '' };
        document.getElementById('accepter-texte').textContent = 'Accepter ' + code + ' ?';
        var etatDiv = document.getElementById('accepter-etat-donneur');
        var noteDiv = document.getElementById('accepter-note-donneur');
        if (pending && pending.etat) {
          etatDiv.textContent = 'État déclaré : ' + pending.etat;
          etatDiv.classList.remove('hidden');
        } else {
          etatDiv.classList.add('hidden');
        }
        noteDiv.innerHTML = (pending && pending.note) ? '<p style="font-size:13px;color:#666;padding:8px;background:#f9f9f9;border-radius:8px;margin-top:6px;">📝 ' + pending.note + '</p>' : '';
        document.getElementById('accepter-select-etat').value = (pending && pending.etat) || 'Bon état';
        document.getElementById('accepter-note').value = '';
        vibrer(200);
        showScreen('screen-accepter');
      });
  });
}

// ── Enregistrer mouvement simple ────────────────────────────────
function afficherRecap(mouvement) {
  document.getElementById('recap').innerHTML =
    '<strong>Immo :</strong> ' + mouvement.code_im + '<br>' +
    '<strong>Employé :</strong> ' + mouvement.nom_employe + '<br>' +
    '<strong>Type :</strong> ' + mouvement.type_mouvement + '<br>' +
    '<strong>Destination :</strong> ' + mouvement.code_chantier + '<br>' +
    '<strong>État :</strong> ' + (mouvement.etat || '—') +
    (mouvement.note ? '<br><strong>Note :</strong> ' + mouvement.note : '') + '<br>' +
    '<strong>Heure :</strong> ' + new Date().toLocaleTimeString('fr-FR');
  document.getElementById('alerte-degradation').classList.add('hidden');
  vibrer(300);
  showScreen('screen-confirmation');
}

function enregistrerMouvement(mouvement) {
  state.mouvements.push(mouvement);
  localStorage.setItem('mouvements', JSON.stringify(state.mouvements));
  fetch(CONFIG.webhookMouvements, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mouvement),
  }).then(function(r) { return r.json(); })
    .then(function(d) {
      console.log('Mouvement:', d.success ? '✅' : '❌', d.status);
      chargerBadgeMateriel();
    })
    .catch(function(e) { console.error('Erreur:', e.message); });
}

// ── Mon matériel (depuis SharePoint) ───────────────────────────
async function afficherMonMateriel() {
  if (!state.employe) { showScreen('screen-activation'); return; }
  document.getElementById('mon-materiel-user').textContent = '👷 ' + state.employe.nom;
  var liste = document.getElementById('liste-materiel');
  liste.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?employe=' + encodeURIComponent(state.employe.code));
    var data = await res.json();
    var items = data.actuel || [];
    liste.innerHTML = items.length === 0
      ? '<p class="empty-msg">Aucun matériel en ta possession.</p>'
      : items.map(function(m) {
          var etatBadgeHtml = m.etat ? ' <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:#E3F2FD;color:#0D47A1">' + m.etat + '</span>' : '';
          var noteHtml = m.note ? '<br><small style="color:#888">📝 ' + m.note + '</small>' : '';
          return immoCard(m.code_im, etatBadgeHtml, new Date(m.horodatage).toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' }) + noteHtml);
        }).join('');
  } catch (e) {
    liste.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
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
    vibrer(150);
    showScreen('screen-suivi-immo');
    document.getElementById('suivi-immo-code').value = code;
    rechercherSuiviImmo();
  });
}

async function rechercherSuiviImmo() {
  var code = document.getElementById('suivi-immo-code').value.trim().toUpperCase();
  if (!code) return;
  var div = document.getElementById('suivi-immo-resultats');
  var loc = document.getElementById('suivi-immo-localisation');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  loc.innerHTML = '';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?immo=' + encodeURIComponent(code));
    var mouvements = await res.json();
    if (!Array.isArray(mouvements) || mouvements.length === 0) {
      // Chercher dans immos.json même si aucun mouvement
      var immoTrouve = null;
      for (var k in state.immos) {
        if (k.toUpperCase().includes(code) || code.includes(k.replace('IM','').replace(/^0+/,''))) {
          immoTrouve = state.immos[k];
          break;
        }
      }
      if (immoTrouve) {
        loc.innerHTML = '<div class="localisation-badge">🏭 Au dépôt — jamais sorti</div>';
        div.innerHTML = '<div class="materiel-card">' +
          '<strong style="font-size:15px">' + immoTrouve.Libelle + '</strong><br>' +
          '<span style="font-size:11px;color:#999;font-family:monospace">' + immoTrouve.Code_IM + '</span>' +
          (immoTrouve.Categorie ? ' · <span style="font-size:11px;color:#666">' + immoTrouve.Categorie + '</span>' : '') +
          (immoTrouve.N_Serie ? '<br><small style="color:#888">N° série : ' + immoTrouve.N_Serie + '</small>' : '') +
          '</div>' +
          '<p class="empty-msg">Aucun mouvement enregistré pour cette immo.</p>';
        var btnPhotos = document.getElementById('btn-photos-suivi');
        if (btnPhotos) btnPhotos.style.display = 'block';
        state.photoImmo = immoTrouve.Code_IM;
        document.getElementById('suivi-immo-code').value = immoTrouve.Code_IM;
      } else {
        loc.innerHTML = '';
        div.innerHTML = '<p class="empty-msg">Aucun mouvement trouvé pour "' + code + '".</p>';
      }
      return;
    }
    var GESTIONNAIRES = ['HEGE', 'CONI'];
    // Cacher le bouton photos générique (on met les boutons par immo ci-dessous)
    var btnPhotos = document.getElementById('btn-photos-suivi');
    if (btnPhotos) btnPhotos.style.display = 'none';
    loc.innerHTML = '';

    // Grouper par immo (si recherche partielle retourne plusieurs immos)
    var groupes = {};
    mouvements.forEach(function(m) {
      if (!groupes[m.code_im]) groupes[m.code_im] = [];
      groupes[m.code_im].push(m);
    });

    var html = '';
    Object.keys(groupes).forEach(function(codeIM) {
      var mvts = groupes[codeIM];
      var immoInfo = state.immos[codeIM] || null;
      var libelle = immoInfo ? immoInfo.Libelle : codeIM;
      var fdsUrl = immoInfo ? (immoInfo.FDS_URL || '') : '';
      var dernier = mvts[0];
      var estGest = GESTIONNAIRES.includes(dernier.code_employe);
      var estRetour = dernier.type_mouvement === 'Retour' || dernier.code_chantier === 'DEPOT';
      var locActuelle = (estRetour || estGest) ? '🏭 Au dépôt' : '👤 Avec ' + dernier.nom_employe + ' (' + dernier.code_employe + ')';

      html += '<div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 12px rgba(0,0,0,0.09);margin-bottom:12px;border-left:4px solid #E87722">';
      html += '<div style="font-weight:700;font-size:16px;color:#1A3A6B;margin-bottom:2px">' + libelle + '</div>';
      html += '<div style="font-size:11px;color:#999;font-family:monospace;margin-bottom:8px">' + codeIM;
      if (immoInfo && immoInfo.Categorie) html += ' · ' + immoInfo.Categorie;
      if (immoInfo && immoInfo.N_Serie) html += ' · N° ' + immoInfo.N_Serie;
      html += '</div>';
      html += '<div style="background:#1A3A6B;color:white;padding:8px 12px;border-radius:8px;font-weight:600;font-size:13px;margin-bottom:8px">' + locActuelle + '</div>';
      html += '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">';
      if (fdsUrl) {
        var fdsProxyUrl2 = getFdsUrl(fdsUrl, codeIM);
        html += '<a href="' + fdsProxyUrl2 + '" target="_blank" style="padding:7px 14px;background:#E3F2FD;color:#0D47A1;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">📄 Voir la FDS</a>';
      } else {
        html += '<span style="padding:7px 14px;background:#F5F5F5;color:#999;border-radius:8px;font-size:12px">📄 FDS non renseignée</span>';
      }
      var photoCode = codeIM;
      html += '<button data-code="' + photoCode + '" onclick="ouvrirPhotos(this.getAttribute(\"data-code\"))" style="padding:7px 14px;background:#FFF8F0;color:#E87722;border:2px solid #E87722;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Photos</button>';
      html += '</div>';
      html += '<div style="font-size:12px;font-weight:600;color:#7F8C8D;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Historique (' + mvts.length + ' mouvements)</div>';
      html += mvts.map(function(m) {
        var icon = m.type_mouvement === 'Retour' ? '📥' : m.type_mouvement === 'Transfert' ? '🔄' : '📤';
        return '<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px">' +
          icon + ' <strong>' + m.type_mouvement + '</strong> ' + formatMouvementBadge(m) +
          (m.etat ? ' <span style="font-size:11px;font-weight:600;padding:1px 7px;background:#E3F2FD;color:#0D47A1;border-radius:8px">' + m.etat + '</span>' : '') + '<br>' +
          '<small style="color:#888">👷 ' + m.nom_employe + ' — ' + new Date(m.horodatage).toLocaleString('fr-FR', { timeZone: 'Indian/Reunion' }) + '</small>' +
          (m.note ? '<br><small style="color:#E87722">📝 ' + m.note + '</small>' : '') +
          '</div>';
      }).join('');
      html += '</div>';
    });
    div.innerHTML = html;
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

// ── Formatage mouvement (donneur → receveur) ────────────────────
function formatMouvementBadge(m) {
  if (m.type_mouvement === 'Transfert' && m.code_chantier && m.code_chantier.indexOf('|') !== -1) {
    var parts = m.code_chantier.split('|');
    return '<span class="chantier-tag">' + (parts[1] || parts[0]) + ' → ' + m.nom_employe + '</span>';
  }
  if (m.type_mouvement === 'Retour') {
    return '<span class="chantier-tag">🏭 Dépôt</span>';
  }
  return '<span class="chantier-tag">' + (m.code_chantier || '') + '</span>';
}

// ── Suivi par employé ─────────────────────────────────────────────
function reinitSuiviEmploye() {
  document.getElementById('suivi-employe-search').value = '';
  document.getElementById('suivi-employe-suggestions').innerHTML = '';
  document.getElementById('suivi-employe-resultats').innerHTML = '<p class="empty-msg">Tape un nom ou un code employé.</p>';
}

function rechercherSuggestionsEmploye() {
  var query = document.getElementById('suivi-employe-search').value.trim().toUpperCase();
  var div = document.getElementById('suivi-employe-suggestions');
  if (!query) { div.innerHTML = ''; return; }
  var matches = state.employes.filter(function(e) {
    return e.Code.toUpperCase().includes(query) || e.Nom.toUpperCase().includes(query);
  }).slice(0, 8);
  if (matches.length === 0) { div.innerHTML = '<p class="empty-msg">Aucun employé trouvé.</p>'; return; }
  div.innerHTML = matches.map(function(e) {
    return '<div class="suggestion-item" onclick="afficherSuiviEmploye(\'' + e.Code + '\',\'' + e.Nom.replace(/'/g, "\\'") + '\')"><strong>' + e.Nom + '</strong> <span class="chantier-tag">' + e.Code + '</span><small> — ' + e.Poste + '</small></div>';
  }).join('');
}

async function afficherSuiviEmploye(code, nom) {
  document.getElementById('suivi-employe-search').value = nom + ' (' + code + ')';
  document.getElementById('suivi-employe-suggestions').innerHTML = '';
  var div = document.getElementById('suivi-employe-resultats');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?employe=' + encodeURIComponent(code));
    var data = await res.json();
    var html = '<h3>📦 Actuellement en sa possession (' + data.actuel.length + ')</h3>';
    html += data.actuel.length === 0
      ? '<p class="empty-msg">Aucun matériel en ce moment.</p>'
      : data.actuel.map(function(m) {
          return '<div class="materiel-card"><strong>' + m.code_im + '</strong>' +
            (m.etat ? ' <span class="etat-badge">' + m.etat + '</span>' : '') + '<br>' +
            '<small>' + new Date(m.horodatage).toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' }) + '</small>' +
            (m.note ? '<br><small>📝 ' + m.note + '</small>' : '') + '</div>';
        }).join('');
    html += '<h3>🕓 Historique complet (' + data.historique.length + ' mouvements)</h3>';
    html += data.historique.length === 0
      ? '<p class="empty-msg">Aucun mouvement enregistré.</p>'
      : data.historique.map(function(m) {
          var icon = m.type_mouvement === 'Retour' ? '📥' : m.type_mouvement === 'Transfert' ? '🔄' : '📤';
          return '<div class="materiel-card">' + icon + ' <strong>' + m.code_im + '</strong> — ' + m.type_mouvement + '<br>' +
            '<small>' + new Date(m.horodatage).toLocaleString('fr-FR', { timeZone: 'Indian/Reunion' }) + '</small></div>';
        }).join('');
    div.innerHTML = html;
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

// ── Photos ───────────────────────────────────────────────────────
function ouvrirPhotos(codeIM) {
  if (!codeIM) return;
  // Trouver le code complet si partiel
  var codeComplet = codeIM;
  if (!codeIM.startsWith('IM')) {
    // chercher dans les immos
    var found = Object.keys(state.immos).find(function(k) { return k.includes(codeIM.toUpperCase()); });
    if (found) codeComplet = found;
  }
  state.photoImmo = codeComplet;
  var libelle = getLibelle(codeComplet);
  document.getElementById('photos-immo-titre').textContent = libelle + ' (' + codeComplet + ')';

  // Afficher zone upload aux admins
  var uploadZone = document.getElementById('upload-zone');
  if (uploadZone) {
    var isAdmin = state.employe && CONFIG.admins.includes(state.employe.code);
    uploadZone.classList.toggle('hidden', !isAdmin);
  }
  document.getElementById('upload-progress').textContent = '';
  showScreen('screen-photos');
  chargerPhotos(codeComplet);
}

async function chargerPhotos(codeIM) {
  var galerie = document.getElementById('galerie-photos');
  galerie.innerHTML = '<p class="empty-msg">Chargement des photos...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?photos=' + encodeURIComponent(codeIM));
    var photos = await res.json();
    if (!Array.isArray(photos) || photos.length === 0) {
      galerie.innerHTML = '<p class="empty-msg">Aucune photo pour cette immo.<br>Sois le premier à en ajouter une !</p>';
      return;
    }
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%">';
    photos.forEach(function(p) {
      var dateStr = new Date(p.created).toLocaleDateString('fr-FR');
      var supprBtn = '';
      if (state.employe && CONFIG.admins.includes(state.employe.code)) {
        var fn = p.name;
        supprBtn = '<button onclick="supprimerPhoto(\'' + fn + '\')" style="width:100%;padding:6px;background:#FDECEA;border:none;color:#C0392B;font-size:12px;cursor:pointer">Supprimer</button>';
      }
      html += '<div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">';
      html += '<img src="' + p.url + '" style="width:100%;height:160px;object-fit:cover;display:block;cursor:pointer" loading="lazy" onclick="agrandirPhoto(this.src)">';
      html += '<p style="font-size:11px;color:#999;padding:4px 8px;margin:0">' + dateStr + '</p>';
      html += supprBtn;
      html += '</div>';
    });
    html += '</div>';
    galerie.innerHTML = html;
  } catch (e) {
    galerie.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

async function uploadPhoto(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var progress = document.getElementById('upload-progress');
  progress.textContent = '⏳ Compression en cours...';

  try {
    // Compression via Canvas (max 1200px, qualité 0.75)
    var base64 = await new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var maxDim = 1200;
          var ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    var now = new Date();
    var filename = now.getFullYear() + '' +
      String(now.getMonth()+1).padStart(2,'0') +
      String(now.getDate()).padStart(2,'0') + '_' +
      String(now.getHours()).padStart(2,'0') +
      String(now.getMinutes()).padStart(2,'0') +
      String(now.getSeconds()).padStart(2,'0') + '.jpg';

    progress.textContent = '⬆️ Upload en cours...';

    var res = await fetch(CONFIG.webhookMouvements + '?action=upload_photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_im: state.photoImmo, data: base64, filename: filename }),
    });
    var result = await res.json();

    if (result.success) {
      progress.textContent = '✅ Photo ajoutée !';
      vibrer(200);
      input.value = '';
      setTimeout(function() {
        progress.textContent = '';
        chargerPhotos(state.photoImmo);
      }, 1000);
    } else {
      progress.textContent = '❌ Échec : ' + (result.status || '');
    }
  } catch (e) {
    progress.textContent = '❌ Erreur : ' + e.message;
  }
}

function agrandirPhoto(url) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
  overlay.onclick = function() { document.body.removeChild(overlay); };
  var img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:95vw;max-height:90vh;border-radius:8px;object-fit:contain';
  overlay.appendChild(img);
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:white;border:none;border-radius:50%;width:36px;height:36px;font-size:18px;cursor:pointer;font-weight:700';
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

async function supprimerPhoto(filename) {
  if (!confirm('Supprimer cette photo ?')) return;
  try {
    var deleteUrl = 'https://graph.microsoft.com/v1.0/sites/espacesoleil97.sharepoint.com:/sites/Logistique-Immos:/drive/root:/Photos_Immos/' + state.photoImmo + '/' + filename;
    // La suppression doit passer par le Worker
    var res = await fetch(CONFIG.webhookMouvements + '?action=delete_photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_im: state.photoImmo, filename: filename }),
    });
    chargerPhotos(state.photoImmo);
  } catch (e) {
    alert('Erreur lors de la suppression.');
  }
}

// ── Administration ──────────────────────────────────────────────
function reinitAdmin() {
  document.getElementById('admin-search').value = '';
  document.getElementById('admin-resultats').innerHTML = '<p class="empty-msg">Tapez un code immo, un nom ou un chantier.</p>';
}

async function adminRechercher() {
  var query = document.getElementById('admin-search').value.trim();
  if (!query) return;
  var div = document.getElementById('admin-resultats');
  div.innerHTML = '<p class="empty-msg">Recherche en cours...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?q=' + encodeURIComponent(query.toUpperCase()));
    var resultats = await res.json();
    var q = query.toUpperCase();
    var filtres = resultats.filter(function(m) {
      return m.code_im.toUpperCase().includes(q) ||
        m.code_employe.toUpperCase().includes(q) ||
        m.nom_employe.toUpperCase().includes(q) ||
        m.code_chantier.toUpperCase().includes(q);
    });

    var html = '';

    // Chercher aussi dans immos.json pour les immos sans mouvement
    var immosMatchs = [];
    if (filtres.length === 0 || q.match(/^[0-9]+$/) || q.startsWith('IM')) {
      for (var k in state.immos) {
        var im = state.immos[k];
        if (k.toUpperCase().includes(q) ||
            (im.Libelle || '').toUpperCase().includes(q) ||
            (im.N_Serie || '').toUpperCase().includes(q)) {
          // Vérifier si cette immo a des mouvements dans filtres
          var aMouvements = filtres.some(function(m) { return m.code_im === k; });
          if (!aMouvements) immosMatchs.push(im);
        }
      }
    }

    // Afficher d'abord les immos sans mouvement
    if (immosMatchs.length > 0) {
      html += immosMatchs.map(function(im) {
        var fdsBtn = im.FDS_URL ? '<a href="' + im.FDS_URL + '" target="_blank" style="font-size:11px;padding:2px 8px;background:#E3F2FD;color:#0D47A1;border-radius:8px;text-decoration:none;margin-left:6px">📄 FDS</a>' : '';
        return '<div class="materiel-card" style="border-left-color:#27AE60">' +
          '<strong style="font-size:15px">' + im.Libelle + '</strong>' + fdsBtn + '<br>' +
          '<span style="font-size:11px;color:#999;font-family:monospace">' + im.Code_IM + '</span>' +
          (im.Categorie ? ' · <span style="font-size:11px;color:#666">' + im.Categorie + '</span>' : '') +
          (im.N_Serie ? '<br><small style="color:#888">N° série : ' + im.N_Serie + '</small>' : '') +
          '<br><small style="color:var(--green, #27AE60);font-weight:600">🏭 Au dépôt — aucun mouvement enregistré</small>' +
          '</div>';
      }).join('');
    }

    // Puis les mouvements
    if (filtres.length > 0) {
      html += filtres.map(function(m) {
        return '<div class="materiel-card">' +
          '<strong style="font-size:15px">' + getLibelle(m.code_im) + '</strong><br>' +
          '<span style="font-size:11px;color:#999;font-family:monospace">' + m.code_im + '</span>' +
          ' — ' + m.type_mouvement + ' ' + formatMouvementBadge(m) + '<br>' +
          '<small>👷 ' + m.nom_employe + ' (' + m.code_employe + ') — ' +
          new Date(m.horodatage).toLocaleString('fr-FR', { timeZone: 'Indian/Reunion' }) + '</small>' +
          (m.etat ? '<br><small>État : ' + m.etat + '</small>' : '') +
          (m.note ? '<br><small>📝 ' + m.note + '</small>' : '') +
          '</div>';
      }).join('');
    }

    div.innerHTML = html || '<p class="empty-msg">Aucun résultat pour "' + query + '".</p>';

  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>';
  }
}

// ── Démarrage scanner activation ────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var screen = document.getElementById('screen-activation');
  if (screen) {
    new MutationObserver(function() {
      if (screen.classList.contains('active')) {
        startScanner('scanner-activation', onScanActivation);
      }
    }).observe(screen, { attributes: true });
  }
});

// ══════════════════════════════════════════════════════
// ── MODULE RÉSERVATIONS ───────────────────────────────
// ══════════════════════════════════════════════════════

var STATUT_COLORS = {
  'Demandee':   { bg: '#FFF8E1', color: '#E65100', label: '⏳ Demandée' },
  'Confirmee':  { bg: '#E8F5E9', color: '#1B5E20', label: '✅ Confirmée' },
  'En cours':   { bg: '#E3F2FD', color: '#0D47A1', label: '🔄 En cours' },
  'Rendue':     { bg: '#F5F5F5', color: '#757575', label: '📦 Rendue' },
  'En retard':  { bg: '#FFEBEE', color: '#B71C1C', label: '⚠️ En retard' },
  'Annulee':    { bg: '#F5F5F5', color: '#9E9E9E', label: '❌ Annulée' },
};

function statutBadgeResa(statut) {
  var s = STATUT_COLORS[statut] || STATUT_COLORS['Demandee'];
  return '<span style="display:inline-block;padding:2px 9px;border-radius:8px;font-size:11px;font-weight:700;background:' + s.bg + ';color:' + s.color + '">' + s.label + '</span>';
}

// Vérifier les réservations en retard au chargement
async function verifierReservationsEnRetard() {
  if (!state.employe) return;
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?mes_reservations=' + state.employe.code);
    var resas = await res.json();
    var retards = resas.filter(function(r) { return r.statut === 'En retard'; });
    var badge = document.getElementById('badge-resa-retard');
    if (badge) {
      if (retards.length > 0) { badge.textContent = retards.length; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    }
  } catch (e) {}
}

// Recherche immo pour réservation
function rechercherImmoResa() {
  var q = document.getElementById('resa-immo-search').value.trim().toUpperCase();
  var div = document.getElementById('resa-immo-suggestions');
  if (!q || q.length < 2) { div.innerHTML = ''; return; }
  var results = [];
  for (var k in state.immos) {
    var im = state.immos[k];
    if (k.includes(q) || (im.Libelle || '').toUpperCase().includes(q) || k.replace('IM0*','').includes(q)) {
      results.push(im);
    }
    if (results.length >= 8) break;
  }
  div.innerHTML = results.length === 0
    ? '<p class="empty-msg">Aucune immo trouvée.</p>'
    : results.map(function(im) {
        return '<div class="suggestion-item" onclick="selectionnerImmoResa(\'' + im.Code_IM + '\',\'' + (im.Libelle||'').replace(/'/g,"\\'") + '\')">' +
          '<strong>' + im.Libelle + '</strong> <span class="chantier-tag">' + im.Code_IM + '</span>' +
          (im.Categorie ? '<small> — ' + im.Categorie + '</small>' : '') + '</div>';
      }).join('');
}

function selectionnerImmoResa(code, libelle) {
  state.resaImmoCode = code;
  state.resaImmoLibelle = libelle;
  document.getElementById('resa-immo-info').textContent = libelle + ' (' + code + ')';
  document.getElementById('resa-immo-search').value = libelle + ' — ' + code;
  document.getElementById('resa-immo-suggestions').innerHTML = '';
}

function scannerPourResa() {
  showScreen('screen-scan-resa');
  startScanner('scanner-resa', function(code) {
    stopScanner();
    if (!code.startsWith('IM')) { alert('Ce QR code n\'est pas une immobilisation.'); showScreen('screen-reserver'); return; }
    vibrer(200);
    var libelle = getLibelle(code);
    selectionnerImmoResa(code, libelle);
    showScreen('screen-reserver');
  });
}

// Vérifier les conflits de réservation
async function verifierConflits(codeIM, dateDebut, dateFin) {
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?reservations=1');
    var resas = await res.json();
    var debut = new Date(dateDebut);
    var fin = new Date(dateFin);
    return resas.filter(function(r) {
      if (r.code_im !== codeIM) return false;
      if (r.statut === 'Annulee' || r.statut === 'Rendue') return false;
      var rDebut = new Date(r.date_debut);
      var rFin = new Date(r.date_fin);
      return !(fin < rDebut || debut > rFin);
    });
  } catch (e) { return []; }
}

// Soumettre la demande de réservation
async function soumettreReservation() {
  if (!state.resaImmoCode) { alert('Sélectionne ou scanne une immo.'); return; }
  var debut = document.getElementById('resa-date-debut').value;
  var fin = document.getElementById('resa-date-fin').value;
  if (!debut || !fin) { alert('Indique les dates de départ et de retour.'); return; }
  if (new Date(fin) <= new Date(debut)) { alert('La date de retour doit être après la date de départ.'); return; }

  // Vérifier conflits
  var conflits = await verifierConflits(state.resaImmoCode, debut, fin);
  if (conflits.length > 0) {
    var msg = conflits.map(function(c) {
      return c.nom_employe + ' du ' + new Date(c.date_debut).toLocaleDateString('fr-FR') + ' au ' + new Date(c.date_fin).toLocaleDateString('fr-FR') + ' (' + c.statut + ')';
    }).join(' | ');
    var continuer = confirm('Cette immo est deja reservee : ' + msg + '. Envoyer quand meme ?');
    if (!continuer) return;
  }
  var chantier = document.getElementById('resa-chantier').value.trim();
  var note = document.getElementById('resa-note').value.trim();

  var payload = {
    code_im: state.resaImmoCode,
    code_employe: state.employe.code,
    nom_employe: state.employe.nom,
    code_chantier: chantier,
    nom_chantier: chantier,
    date_debut: new Date(debut).toISOString(),
    date_fin: new Date(fin).toISOString(),
    note: note,
  };

  try {
    var res = await fetch(CONFIG.webhookMouvements + '?action=reserver', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    var data = await res.json();
    if (data.success) {
      vibrer(300);
      document.getElementById('recap').innerHTML =
        '<strong>✅ Demande envoyée !</strong><br>' +
        '<strong>Immo :</strong> ' + state.resaImmoLibelle + ' (' + state.resaImmoCode + ')<br>' +
        '<strong>Du :</strong> ' + new Date(debut).toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' }) + '<br>' +
        '<strong>Au :</strong> ' + new Date(fin).toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' }) + '<br>' +
        '<strong>Statut :</strong> En attente de confirmation logistique';
      document.getElementById('alerte-degradation').classList.add('hidden');
      showScreen('screen-confirmation');
    } else {
      alert('Erreur lors de la création de la réservation.');
    }
  } catch (e) {
    alert('Erreur de connexion : ' + e.message);
  }
}

// Afficher mes réservations
async function afficherMesReservations() {
  if (!state.employe) { showScreen('screen-activation'); return; }
  var div = document.getElementById('mes-resa-liste');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?mes_reservations=' + state.employe.code);
    var resas = await res.json();
    if (!Array.isArray(resas) || !resas.length) {
      div.innerHTML = '<p class="empty-msg">Aucune réservation en cours.</p>';
      return;
    }
    var actives  = resas.filter(function(r) { return r.statut !== 'Rendue' && r.statut !== 'Annulee'; });
    var termines = resas.filter(function(r) { return r.statut === 'Rendue' || r.statut === 'Annulee'; });
    var retards  = actives.filter(function(r) { return r.statut === 'En retard'; });
    var html = '';
    if (retards.length > 0) {
      html += '<div style="background:#FFEBEE;border-radius:10px;padding:12px 14px;margin-bottom:8px;border-left:4px solid #E74C3C">' +
        '<strong style="color:#B71C1C">⚠️ ' + retards.length + ' retard(s) de restitution</strong><br>' +
        '<small style="color:#666">Retourne le matériel au dépôt dès que possible.</small></div>';
    }
    function carteResa(r) {
      var lib = r.code_im ? getLibelle(r.code_im) : '—';
      var s = STATUT_COLORS[r.statut] || STATUT_COLORS['Demandee'];
      var dDebut = r.date_debut ? new Date(r.date_debut).toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' }) : '—';
      var dFin   = r.date_fin   ? new Date(r.date_fin).toLocaleDateString('fr-FR',   { timeZone: 'Indian/Reunion' }) : '—';
      return '<div class="materiel-card" style="border-left:4px solid ' + s.color + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div><strong style="font-size:15px;color:#1A3A6B">' + lib + '</strong>' +
        (r.code_im ? '<br><span style="font-size:11px;color:#999;font-family:monospace">' + r.code_im + '</span>' : '') + '</div>' +
        '<span style="display:inline-block;padding:2px 9px;border-radius:8px;font-size:11px;font-weight:700;background:' + s.bg + ';color:' + s.color + '">' + s.label + '</span>' +
        '</div>' +
        '<div style="margin-top:6px;font-size:13px">📅 ' + dDebut + ' → ' + dFin + '</div>' +
        (r.nom_chantier ? '<div style="font-size:12px;color:#666;margin-top:2px">🏗️ ' + r.nom_chantier + '</div>' : '') +
        (r.note ? '<div style="font-size:12px;color:#888;margin-top:2px">📝 ' + r.note + '</div>' : '') +
        '</div>';
    }
    if (actives.length) {
      html += '<h3 style="color:#1A3A6B;font-size:14px;margin:8px 0 6px">En cours (' + actives.length + ')</h3>';
      html += actives.map(carteResa).join('');
    }
    if (termines.length) {
      html += '<h3 style="color:#999;font-size:13px;margin:12px 0 6px">Terminées / Annulées (' + termines.length + ')</h3>';
      html += termines.map(carteResa).join('');
    }
    div.innerHTML = html;
  } catch (e) {
    div.innerHTML = '<p class="empty-msg">Erreur de connexion : ' + e.message + '</p>';
  }
}

// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  webhookMouvements: 'https://immo-proxy.ral-85d.workers.dev/',
  admins: ['CONI', 'BAKA', 'AUAR', 'BOMA', 'AIWI', 'NAXA'],
  etatsRanking: { 'Neuf': 5, 'Bon état': 4, 'Usé': 3, 'Abîmé': 2, 'Hors service': 1 },
};

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
  transfertId: null,
  photoEtatBase64: null,
  photoReceptionBase64: null,
  resaImmoCode: null,
  resaImmoLibelle: null,
  resaEnCoursId: null,
  forceImmoCode: null,
  mouvements: JSON.parse(localStorage.getItem('mouvements') || '[]'),
};

// ── Utilitaires ─────────────────────────────────────────────────
function vibrer(ms) { if (navigator.vibrate) navigator.vibrate(ms || 150); }

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' });
}

// ── Init ────────────────────────────────────────────────────────
window.addEventListener('load', async function () {
  var employe = localStorage.getItem('employe');
  if (employe) {
    state.employe = JSON.parse(employe);
    afficherEmploye();
    verifierTransfertsEnAttente();
    chargerBadgeMateriel();
    verifierReservationsEnRetard();
  }
  await chargerEmployes();
  await chargerImmos();
});

// ── Navigation ──────────────────────────────────────────────────
function showScreen(id) {
  stopScanner();
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  if (id === 'screen-mon-materiel') afficherMonMateriel();
  if (id === 'screen-transferts-attente') afficherTransfertsEnAttente();
  if (id === 'screen-mes-reservations') afficherMesReservations();
  if (id === 'screen-rechercher') {
    document.getElementById('rech-input').value = '';
    document.getElementById('rech-resultats').innerHTML = '<p class="empty-msg">Tape un code immo, un libellé ou un nom d\'employé.</p>';
  }
  if (id === 'screen-reserver') initReservationScreen();
}

// ── Affichage employé ───────────────────────────────────────────
function afficherEmploye() {
  var badge = document.getElementById('user-info');
  badge.textContent = '👷 ' + state.employe.nom;
  badge.classList.remove('hidden');
  var isAdmin = CONFIG.admins.includes(state.employe.code);
  document.querySelectorAll('.admin-only').forEach(function (el) {
    el.classList.toggle('hidden', !isAdmin);
  });
  document.querySelectorAll('.non-admin-only').forEach(function (el) {
    el.classList.toggle('hidden', isAdmin);
  });
  // Peupler les selects catégorie si immos déjà chargés
  if (Object.keys(state.immos).length > 0) {
    ['resa-categorie', 'rech-cat', 'force-cat', 'stock-cat'].forEach(function(id) {
      buildCatSelect(id);
    });
  }
}

function changerUtilisateur() {
  if (!confirm('Changer d\'utilisateur ?')) return;
  localStorage.removeItem('employe');
  state.employe = null;
  document.getElementById('user-info').classList.add('hidden');
  document.getElementById('badge-attente').classList.add('hidden');
  document.querySelectorAll('.admin-only').forEach(function (el) { el.classList.add('hidden'); });
  showScreen('screen-activation');
}

// ── Chargement données ──────────────────────────────────────────
async function chargerImmos() {
  try {
    var res = await fetch('immos.json');
    var arr = await res.json();
    arr.forEach(function (i) { state.immos[i.Code_IM] = i; });
    // Peupler les selects catégorie
    ['resa-categorie', 'rech-cat', 'force-cat', 'stock-cat'].forEach(function(id) {
      buildCatSelect(id);
    });
  } catch (e) {}
}

function getLibelle(codeIM) {
  return state.immos[codeIM] ? state.immos[codeIM].Libelle : codeIM;
}

function getFDS(codeIM) {
  return state.immos[codeIM] ? state.immos[codeIM].FDS_URL || '' : '';
}

function getFdsUrl(fdsValue, codeIM) {
  if (!fdsValue) return '';
  if (!fdsValue.startsWith('http')) return CONFIG.webhookMouvements + '?fds=' + encodeURIComponent(codeIM);
  if (fdsValue.includes('sharepoint.com')) return CONFIG.webhookMouvements + '?fds=' + encodeURIComponent(codeIM);
  return fdsValue;
}

async function chargerEmployes() {
  try {
    var res = await fetch('employes.json');
    state.employes = await res.json();
    var selectors = ['select-receveur', 'resa-pour-qui', 'force-receveur'];
    selectors.forEach(function (selId) {
      var select = document.getElementById(selId);
      if (!select) return;
      select.innerHTML = select.id === 'resa-pour-qui'
        ? '<option value="">-- Moi-même --</option>'
        : '<option value="">-- Sélectionne un employé --</option>';
      var coniFirst = state.employes.filter(function (e) { return e.Code === 'CONI'; });
      var autres = state.employes.filter(function (e) {
        return e.Code !== 'CONI' && (!state.employe || e.Code !== state.employe.code);
      });
      if (coniFirst.length) {
        var og = document.createElement('optgroup');
        og.label = '⭐ Dépôt logistique';
        coniFirst.forEach(function (e) {
          var opt = document.createElement('option');
          opt.value = e.Code; opt.textContent = e.Nom + ' (' + e.Code + ')';
          og.appendChild(opt);
        });
        select.appendChild(og);
      }
      var og2 = document.createElement('optgroup');
      og2.label = 'Tous les employés';
      autres.forEach(function (e) {
        var opt = document.createElement('option');
        opt.value = e.Code; opt.textContent = e.Nom + ' (' + e.Code + ')';
        og2.appendChild(opt);
      });
      select.appendChild(og2);
    });
  } catch (e) {}
}

// ── Badges ──────────────────────────────────────────────────────
async function chargerBadgeMateriel() {
  if (!state.employe) return;
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?employe=' + state.employe.code);
    var data = await res.json();
    var count = (data.actuel || []).length;
    var badge = document.getElementById('badge-materiel');
    if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
  } catch (e) {}
}

async function verifierTransfertsEnAttente() {
  if (!state.employe) return;
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    var data = await res.json();
    var badge = document.getElementById('badge-attente');
    if (Array.isArray(data) && data.length > 0) {
      badge.textContent = '⚠️ ' + data.length + ' transfert(s) en attente de validation';
      badge.classList.remove('hidden');
    } else { badge.classList.add('hidden'); }
  } catch (e) {}
}

async function verifierReservationsEnRetard() {
  if (!state.employe) return;
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?mes_reservations=' + state.employe.code);
    var resas = await res.json();
    var retards = (resas || []).filter(function (r) { return r.statut === 'En retard'; });
    var badge = document.getElementById('badge-resa-retard');
    if (badge) { badge.textContent = retards.length; badge.classList.toggle('hidden', retards.length === 0); }
  } catch (e) {}
}

// ── Scanner ──────────────────────────────────────────────────────
function startScanner(elementId, callback) {
  stopScanner();
  state.scanner = new Html5Qrcode(elementId);
  state.scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    callback, function () {}
  ).catch(function () { alert('Impossible d\'accéder à la caméra.'); });
}

function stopScanner() {
  if (state.scanner) { state.scanner.stop().catch(function () {}); state.scanner = null; }
}

// ── Activation ───────────────────────────────────────────────────
function onScanActivation(code) {
  stopScanner();
  var parts = code.split('|');
  if (parts.length < 2 || code.startsWith('IM')) {
    alert('Ce QR code n\'est pas une carte employé. Scanne ta carte BTP.');
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
  showScreen('screen-accueil');
}

document.addEventListener('DOMContentLoaded', function () {
  var screen = document.getElementById('screen-activation');
  if (screen) {
    new MutationObserver(function () {
      if (screen.classList.contains('active')) startScanner('scanner-activation', onScanActivation);
    }).observe(screen, { attributes: true });
  }
});

// ── Démarrer mouvement ───────────────────────────────────────────
function startMouvement(type) {
  if (!state.employe) { showScreen('screen-activation'); return; }
  state.typeMouvement = type;
  state.codeIM = null;
  state.codeReceveur = null;
  state.nomReceveur = null;
  state.photoEtatBase64 = null;
  document.getElementById('titre-mouvement').textContent = type === 'Retour' ? 'Retour au dépôt' : 'Transfert';
  document.getElementById('immo-result').classList.add('hidden');
  showScreen('screen-scan-immo');
  startScanner('scanner-immo', onScanImmo);
}

// ── Scan immo ────────────────────────────────────────────────────
function onScanImmo(code) {
  if (!code.startsWith('IM')) { vibrer(50); return; }
  stopScanner(); vibrer(200);
  state.codeIM = code;
  var result = document.getElementById('immo-result');
  result.textContent = '✅ ' + getLibelle(code) + ' (' + code + ')';
  result.classList.remove('hidden');

  setTimeout(async function () {
    if (state.typeMouvement === 'Retour') {
      document.getElementById('etat-immo-info').textContent = getLibelle(code) + ' → Dépôt';
      document.getElementById('select-etat').value = 'Bon état';
      document.getElementById('note-texte').value = '';
      document.getElementById('photo-etat-preview').innerHTML = '';
      state.photoEtatBase64 = null;
      showScreen('screen-etat');
      return;
    }
    // Vérifier transfert en attente
    var pending = await chercherTransfertEnAttentePourImmo(code);
    if (pending) {
      state.transfertEnCours = pending;
      document.getElementById('accepter-texte').textContent = 'Accepter ' + getLibelle(code) + ' de ' + pending.nom_donneur + ' ?';
      var etatDiv = document.getElementById('accepter-etat-donneur');
      var noteDiv = document.getElementById('accepter-note-donneur');
      if (pending.etat) { etatDiv.textContent = 'État déclaré : ' + pending.etat; etatDiv.classList.remove('hidden'); }
      else etatDiv.classList.add('hidden');
      noteDiv.innerHTML = pending.note ? '<p style="font-size:13px;color:#666;padding:8px;background:#f9f9f9;border-radius:8px;margin-top:6px">📝 ' + pending.note + '</p>' : '';
      document.getElementById('accepter-select-etat').value = pending.etat || 'Bon état';
      document.getElementById('accepter-note').value = '';
      document.getElementById('photo-reception-preview').innerHTML = '';
      state.photoReceptionBase64 = null;
      showScreen('screen-accepter');
      return;
    }
    // Sélection receveur
    document.getElementById('receveur-immo-info').textContent = getLibelle(code) + ' (' + code + ')';
    showScreen('screen-receveur');
  }, 500);
}

async function chercherTransfertEnAttentePourImmo(code) {
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    var transferts = await res.json();
    return (transferts || []).find(function (t) { return t.code_im === code; }) || null;
  } catch (e) { return null; }
}

// ── Receveur → État ──────────────────────────────────────────────
function validerReceveur() {
  var select = document.getElementById('select-receveur');
  var code = select.value;
  if (!code) { alert('Sélectionne un employé.'); return; }
  var opt = select.options[select.selectedIndex];
  state.codeReceveur = code;
  state.nomReceveur = opt ? opt.textContent.split(' (')[0] : code;
  document.getElementById('etat-immo-info').textContent = getLibelle(state.codeIM) + ' → ' + state.nomReceveur;
  document.getElementById('select-etat').value = 'Bon état';
  document.getElementById('note-texte').value = '';
  document.getElementById('photo-etat-preview').innerHTML = '';
  state.photoEtatBase64 = null;
  showScreen('screen-etat');
}

// ── Photo optionnelle lors transfert ────────────────────────────
function previewPhotoEtat(input) {
  if (!input.files || !input.files[0]) return;
  compresserPhoto(input.files[0], function (base64) {
    state.photoEtatBase64 = base64;
    document.getElementById('photo-etat-preview').innerHTML =
      '<img src="' + base64 + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin-top:6px">';
  });
}

function previewPhotoReception(input) {
  if (!input.files || !input.files[0]) return;
  compresserPhoto(input.files[0], function (base64) {
    state.photoReceptionBase64 = base64;
    document.getElementById('photo-reception-preview').innerHTML =
      '<img src="' + base64 + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin-top:6px">';
  });
}

function compresserPhoto(file, callback) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var ratio = Math.min(1200 / img.width, 1200 / img.height, 1);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function uploadPhotoSiPresente(codeIM, base64) {
  if (!base64) return;
  try {
    var now = new Date();
    var filename = now.getFullYear() + '' + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + now.getHours() + now.getMinutes() + now.getSeconds() + '.jpg';
    await fetch(CONFIG.webhookMouvements + '?action=upload_photo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_im: codeIM, data: base64, filename: filename }),
    });
  } catch (e) {}
}

// ── Confirmer avec état ──────────────────────────────────────────
function confirmerAvecEtat() {
  state.etatChoisi = document.getElementById('select-etat').value;
  state.noteTexte = document.getElementById('note-texte').value.trim();

  if (state.typeMouvement === 'Retour') {
    var mouvement = {
      code_im: state.codeIM, code_employe: state.employe.code,
      nom_employe: state.employe.nom, type_mouvement: 'Retour',
      code_chantier: 'DEPOT', etat: state.etatChoisi,
      note: state.noteTexte, horodatage: new Date().toISOString(),
    };
    afficherRecap(mouvement);
    enregistrerMouvement(mouvement);
    if (state.photoEtatBase64) uploadPhotoSiPresente(state.codeIM, state.photoEtatBase64);
    return;
  }

  var transfert = {
    code_im: state.codeIM, code_employe_donneur: state.employe.code,
    nom_donneur: state.employe.nom, code_employe_receveur: state.codeReceveur,
    nom_receveur: state.nomReceveur, etat: state.etatChoisi,
    note: state.noteTexte,
  };
  document.getElementById('recap').innerHTML =
    '<strong>Immo :</strong> ' + getLibelle(state.codeIM) + ' (' + state.codeIM + ')<br>' +
    '<strong>De :</strong> ' + state.employe.nom + '<br>' +
    '<strong>À :</strong> ' + state.nomReceveur + '<br>' +
    '<strong>État :</strong> ' + state.etatChoisi +
    (state.noteTexte ? '<br><strong>Note :</strong> ' + state.noteTexte : '') + '<br>' +
    '<strong>Statut :</strong> En attente de validation';
  document.getElementById('alerte-degradation').classList.add('hidden');
  vibrer(300);
  showScreen('screen-confirmation');

  fetch(CONFIG.webhookMouvements + '?action=transfert', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transfert),
  }).catch(function () {});
  if (state.photoEtatBase64) uploadPhotoSiPresente(state.codeIM, state.photoEtatBase64);
}

// ── Accepter transfert ───────────────────────────────────────────
function accepterTransfert() {
  var t = state.transfertEnCours;
  var etatReception = document.getElementById('accepter-select-etat').value;
  var noteReception = document.getElementById('accepter-note').value.trim();
  var etatDonneurRank = CONFIG.etatsRanking[t.etat] || 4;
  var etatReceveurRank = CONFIG.etatsRanking[etatReception] || 4;
  var degradation = etatReceveurRank < etatDonneurRank;

  fetch(CONFIG.webhookMouvements + '?action=valider', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: t.id, code_im: t.code_im, code_employe: state.employe.code, nom_employe: state.employe.nom, etat_reception: etatReception, note_reception: noteReception, etat_donneur: t.etat || '' }),
  }).then(function (r) { return r.json(); })
    .then(function () {
      document.getElementById('recap').innerHTML =
        '<strong>✅ Transfert accepté !</strong><br>' +
        '<strong>Immo :</strong> ' + getLibelle(t.code_im) + '<br>' +
        '<strong>De :</strong> ' + t.nom_donneur + '<br>' +
        '<strong>État constaté :</strong> ' + etatReception +
        (noteReception ? '<br><strong>Note :</strong> ' + noteReception : '');
      var alertDiv = document.getElementById('alerte-degradation');
      if (degradation) {
        alertDiv.textContent = '⚠️ Dégradation constatée ! Déclaré "' + (t.etat || '?') + '" reçu "' + etatReception + '"';
        alertDiv.classList.remove('hidden');
      } else { alertDiv.classList.add('hidden'); }
      vibrer(300);
      showScreen('screen-confirmation');
      verifierTransfertsEnAttente();
      chargerBadgeMateriel();
      if (state.photoReceptionBase64) uploadPhotoSiPresente(t.code_im, state.photoReceptionBase64);
    });
}

function refuserTransfert() { showScreen('screen-accueil'); }

// ── Transferts en attente ────────────────────────────────────────
async function afficherTransfertsEnAttente() {
  var div = document.getElementById('liste-attente');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code);
    var transferts = await res.json();
    if (!transferts.length) { div.innerHTML = '<p class="empty-msg">Aucun transfert en attente.</p>'; return; }
    div.innerHTML = transferts.map(function (t) {
      return '<div class="materiel-card"><strong>' + getLibelle(t.code_im) + '</strong><br>' +
        '<span style="font-size:11px;color:#999;font-family:monospace">' + t.code_im + '</span><br>' +
        '<small>De : ' + t.nom_donneur + (t.etat ? ' — État : <strong>' + t.etat + '</strong>' : '') + '</small>' +
        (t.note ? '<br><small>📝 ' + t.note + '</small>' : '') + '<br>' +
        '<button class="btn btn-primary" style="margin-top:8px;padding:10px" onclick="demarrerValidationTransfert(\'' + t.id + '\',\'' + t.code_im + '\')">📷 Scanner pour valider</button>' +
        '</div>';
    }).join('');
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>'; }
}

function demarrerValidationTransfert(transfertId, codeIM) {
  state.transfertId = transfertId;
  showScreen('screen-scan-validation');
  startScanner('scanner-validation', function (code) {
    stopScanner();
    if (code !== codeIM) { alert('Ce n\'est pas le bon matériel. Attendu : ' + codeIM); showScreen('screen-transferts-attente'); return; }
    state.codeIM = code;
    fetch(CONFIG.webhookMouvements + '?transferts=' + state.employe.code)
      .then(function (r) { return r.json(); })
      .then(function (transferts) {
        var pending = (transferts || []).find(function (t) { return t.id === transfertId; });
        state.transfertEnCours = pending || { id: transfertId, code_im: code, nom_donneur: '?', etat: '', note: '' };
        document.getElementById('accepter-texte').textContent = 'Accepter ' + getLibelle(code) + ' de ' + state.transfertEnCours.nom_donneur + ' ?';
        var etatDiv = document.getElementById('accepter-etat-donneur');
        if (pending && pending.etat) { etatDiv.textContent = 'État déclaré : ' + pending.etat; etatDiv.classList.remove('hidden'); }
        else etatDiv.classList.add('hidden');
        document.getElementById('accepter-note-donneur').innerHTML = (pending && pending.note) ? '<p style="font-size:13px;color:#666;padding:8px;background:#f9f9f9;border-radius:8px">📝 ' + pending.note + '</p>' : '';
        document.getElementById('accepter-select-etat').value = (pending && pending.etat) || 'Bon état';
        document.getElementById('accepter-note').value = '';
        document.getElementById('photo-reception-preview').innerHTML = '';
        state.photoReceptionBase64 = null;
        vibrer(200);
        showScreen('screen-accepter');
      });
  });
}

// ── Mon matériel ─────────────────────────────────────────────────
async function afficherMonMateriel() {
  if (!state.employe) { showScreen('screen-activation'); return; }
  document.getElementById('mon-materiel-user').textContent = '👷 ' + state.employe.nom;
  var liste = document.getElementById('liste-materiel');
  liste.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?employe=' + state.employe.code);
    var data = await res.json();
    var items = data.actuel || [];
    if (!items.length) { liste.innerHTML = '<p class="empty-msg">Aucun matériel en ta possession.</p>'; return; }
    liste.innerHTML = items.map(function (m) {
      var lib = getLibelle(m.code_im);
      var fds = getFDS(m.code_im);
      var fdsUrl = getFdsUrl(fds, m.code_im);
      var fdsBtn = fdsUrl ? '<a href="' + fdsUrl + '" target="_blank" style="font-size:11px;padding:2px 8px;background:#E3F2FD;color:#0D47A1;border-radius:8px;text-decoration:none;margin-left:6px">📄 FDS</a>' : '';
      return '<div class="materiel-card">' +
        '<strong style="font-size:15px">' + lib + '</strong>' + fdsBtn + '<br>' +
        '<span style="font-size:11px;color:#999;font-family:monospace">' + m.code_im + '</span>' +
        (m.etat ? ' <span style="font-size:11px;font-weight:600;padding:1px 7px;background:#E3F2FD;color:#0D47A1;border-radius:8px">' + m.etat + '</span>' : '') +
        '<br><small>' + fmtDate(m.horodatage) + '</small>' +
        (m.note ? '<br><small style="color:#888">📝 ' + m.note + '</small>' : '') +
        '</div>';
    }).join('');
  } catch (e) { liste.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>'; }
}

// ── Enregistrer mouvement ────────────────────────────────────────
function afficherRecap(mouvement) {
  document.getElementById('recap').innerHTML =
    '<strong>Immo :</strong> ' + getLibelle(mouvement.code_im) + ' (' + mouvement.code_im + ')<br>' +
    '<strong>Employé :</strong> ' + mouvement.nom_employe + '<br>' +
    '<strong>Type :</strong> ' + mouvement.type_mouvement + '<br>' +
    '<strong>État :</strong> ' + (mouvement.etat || '—') +
    (mouvement.note ? '<br><strong>Note :</strong> ' + mouvement.note : '');
  document.getElementById('alerte-degradation').classList.add('hidden');
  vibrer(300);
  showScreen('screen-confirmation');
}

function enregistrerMouvement(mouvement) {
  fetch(CONFIG.webhookMouvements, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mouvement),
  }).then(function () { chargerBadgeMateriel(); }).catch(function () {});
}

// ── Recherche unifiée (admin) ────────────────────────────────────
async function rechercheAuto() {
  var q = document.getElementById('rech-input').value.trim().toUpperCase();
  var div = document.getElementById('rech-resultats');
  if (!q || q.length < 2) { div.innerHTML = '<p class="empty-msg">Tape un code immo, un libellé ou un nom d\'employé.</p>'; return; }
  div.innerHTML = '<p class="empty-msg">Recherche...</p>';

  var html = '';

  // Immos correspondantes
  var cat = (document.getElementById('rech-cat') || {}).value || '';
  var immosMatch = immosFiltrees(cat, q).slice(0, 8);

  // Employés correspondants
  var empMatch = state.employes.filter(function (e) {
    return e.Code.toUpperCase().includes(q) || e.Nom.toUpperCase().includes(q);
  }).slice(0, 4);

  if (immosMatch.length > 0) {
    html += '<h3 style="color:#1A3A6B;font-size:13px;margin:8px 0 6px;text-transform:uppercase;letter-spacing:.5px">Immos (' + immosMatch.length + ')</h3>';
    html += immosMatch.map(function (im) {
      var fds = im.FDS_URL || '';
      var fdsUrl = getFdsUrl(fds, im.Code_IM);
      var fdsBtn = fdsUrl ? '<a href="' + fdsUrl + '" target="_blank" style="font-size:11px;padding:2px 8px;background:#E3F2FD;color:#0D47A1;border-radius:8px;text-decoration:none;margin-left:6px">📄 FDS</a>' : '';
      var photoBtn = '<button onclick="ouvrirPhotos(\'' + im.Code_IM + '\')" style="font-size:11px;padding:2px 8px;background:#FFF8F0;color:#E87722;border:1px solid #E87722;border-radius:8px;cursor:pointer;margin-left:4px">🖼️ Photos</button>';
      var detailBtn = '<button onclick="voirDetailImmo(\'' + im.Code_IM + '\')" style="font-size:11px;padding:2px 8px;background:#E8F5E9;color:#1B5E20;border:none;border-radius:8px;cursor:pointer;margin-left:4px">📋 Détail</button>';
      return '<div class="materiel-card" style="border-left-color:#27AE60">' +
        '<strong style="font-size:15px;color:#1A3A6B">' + im.Libelle + '</strong>' + fdsBtn + photoBtn + detailBtn + '<br>' +
        '<span style="font-size:11px;color:#999;font-family:monospace">' + im.Code_IM + '</span>' +
        (im.Categorie ? ' · <span style="font-size:11px;color:#666">' + im.Categorie + '</span>' : '') +
        (im.N_Serie ? '<br><small style="color:#888">N° série : ' + im.N_Serie + '</small>' : '') +
        '</div>';
    }).join('');
  }

  if (empMatch.length > 0) {
    html += '<h3 style="color:#1A3A6B;font-size:13px;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.5px">Employés (' + empMatch.length + ')</h3>';
    html += empMatch.map(function (e) {
      return '<div class="suggestion-item" onclick="voirDetailEmploye(\'' + e.Code + '\',\'' + e.Nom.replace(/'/g, "\\'") + '\')">' +
        '<strong>' + e.Nom + '</strong> <span class="chantier-tag">' + e.Code + '</span>' +
        '<small> — ' + e.Poste + '</small></div>';
    }).join('');
  }

  if (!html) html = '<p class="empty-msg">Aucun résultat pour "' + q + '".</p>';
  div.innerHTML = html;
}

function scannerPourRecherche() {
  showScreen('screen-scan-recherche');
  startScanner('scanner-recherche', function (code) {
    stopScanner(); vibrer(150);
    document.getElementById('rech-input').value = code;
    showScreen('screen-rechercher');
    rechercheAuto();
    // Si c'est une immo, montrer le détail
    if (code.startsWith('IM')) voirDetailImmo(code);
  });
}

async function voirDetailImmo(codeIM) {
  var div = document.getElementById('rech-resultats');
  div.innerHTML = '<p class="empty-msg">Chargement historique...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?immo=' + encodeURIComponent(codeIM));
    var mouvements = await res.json();
    var immoInfo = state.immos[codeIM];
    var lib = immoInfo ? immoInfo.Libelle : codeIM;
    var html = '<div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 12px rgba(0,0,0,.09);border-left:4px solid #E87722;margin-bottom:10px">';
    html += '<strong style="font-size:16px;color:#1A3A6B">' + lib + '</strong><br>';
    html += '<span style="font-size:11px;color:#999;font-family:monospace">' + codeIM + '</span>';
    if (immoInfo) {
      if (immoInfo.Categorie) html += ' · <span style="font-size:11px;color:#666">' + immoInfo.Categorie + '</span>';
      if (immoInfo.N_Serie) html += '<br><small style="color:#888">N° série : ' + immoInfo.N_Serie + '</small>';
    }
    // Localisation actuelle
    if (mouvements.length > 0) {
      var dernier = mouvements[0];
      var est = (dernier.type_mouvement === 'Retour' || dernier.code_chantier === 'DEPOT') ? '🏭 Au dépôt' : '👤 Avec ' + dernier.nom_employe;
      html += '<div style="background:#1A3A6B;color:white;padding:8px 12px;border-radius:8px;font-weight:600;font-size:13px;margin:8px 0">' + est + '</div>';
    } else {
      html += '<div style="background:#27AE60;color:white;padding:8px 12px;border-radius:8px;font-weight:600;font-size:13px;margin:8px 0">🏭 Au dépôt — jamais sorti</div>';
    }
    // Boutons
    var fds = immoInfo ? (immoInfo.FDS_URL || '') : '';
    var fdsUrl = getFdsUrl(fds, codeIM);
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    if (fdsUrl) html += '<a href="' + fdsUrl + '" target="_blank" style="padding:7px 14px;background:#E3F2FD;color:#0D47A1;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">📄 Voir FDS</a>';
    else html += '<span style="padding:7px 14px;background:#F5F5F5;color:#999;border-radius:8px;font-size:12px">📄 FDS non renseignée</span>';
    var esc = codeIM.replace(/'/g, "\\'");
    html += '<button onclick="ouvrirPhotos(\'' + esc + '\')" style="padding:7px 14px;background:#FFF8F0;color:#E87722;border:2px solid #E87722;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">🖼️ Photos</button>';
    html += '</div></div>';
    // Historique
    if (mouvements.length > 0) {
      html += '<h3 style="color:#1A3A6B;font-size:13px;margin:8px 0;text-transform:uppercase">Historique (' + mouvements.length + ')</h3>';
      html += mouvements.map(function (m) {
        var icon = m.type_mouvement === 'Retour' ? '📥' : '🔄';
        var donneur = '';
        if (m.type_mouvement === 'Transfert' && m.code_chantier && m.code_chantier.includes('|')) {
          donneur = ' <span style="font-size:11px;color:#888">de ' + m.code_chantier.split('|')[1] + '</span>';
        }
        return '<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px">' +
          icon + ' <strong>' + m.type_mouvement + '</strong>' + donneur +
          (m.etat ? ' <span style="font-size:11px;padding:1px 7px;background:#E3F2FD;color:#0D47A1;border-radius:8px">' + m.etat + '</span>' : '') + '<br>' +
          '<small style="color:#888">👷 ' + m.nom_employe + ' — ' + new Date(m.horodatage).toLocaleString('fr-FR', { timeZone: 'Indian/Reunion' }) + '</small>' +
          (m.note ? '<br><small style="color:#E87722">📝 ' + m.note + '</small>' : '') +
          '</div>';
      }).join('');
    }
    div.innerHTML = html;
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur : ' + e.message + '</p>'; }
}

async function voirDetailEmploye(code, nom) {
  var div = document.getElementById('rech-resultats');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?employe=' + encodeURIComponent(code));
    var data = await res.json();
    var html = '<div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 12px rgba(0,0,0,.09);border-left:4px solid #1A3A6B;margin-bottom:10px">';
    html += '<strong style="font-size:16px;color:#1A3A6B">' + nom + '</strong> <span class="chantier-tag">' + code + '</span>';
    html += '</div>';
    html += '<h3 style="color:#1A3A6B;font-size:13px;margin:8px 0;text-transform:uppercase">En sa possession (' + (data.actuel || []).length + ')</h3>';
    if (!(data.actuel || []).length) html += '<p class="empty-msg">Aucun matériel.</p>';
    else html += (data.actuel || []).map(function (m) {
      return '<div class="materiel-card"><strong>' + getLibelle(m.code_im) + '</strong><br>' +
        '<span style="font-size:11px;color:#999;font-family:monospace">' + m.code_im + '</span>' +
        (m.etat ? ' <span style="font-size:11px;padding:1px 7px;background:#E3F2FD;color:#0D47A1;border-radius:8px">' + m.etat + '</span>' : '') +
        '<br><small>' + fmtDate(m.horodatage) + '</small></div>';
    }).join('');
    div.innerHTML = html;
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur.</p>'; }
}

// ── Force attribution (admin) ─────────────────────────────────────
var forceImmoCode = null;

function rechercherImmoPourForce() {
  var cat = (document.getElementById('force-cat') || {}).value || '';
  var q = document.getElementById('force-immo-search').value.trim();
  var div = document.getElementById('force-suggestions');
  var results = immosFiltrees(cat, q);
  if (results.length === 1) {
    forceImmoCode = results[0].Code_IM;
    document.getElementById('force-immo-info').textContent = '✅ ' + results[0].Libelle + ' (' + results[0].Code_IM + ')';
    if (div) div.innerHTML = '';
    return;
  }
  forceImmoCode = null;
  document.getElementById('force-immo-info').textContent = results.length > 1 ? results.length + ' immos correspondantes' : '';
  if (!div) return;
  div.innerHTML = (!q && !cat) ? '' : results.length === 0 ? '<p class="empty-msg">Aucune immo.</p>' :
    results.slice(0, 8).map(function(im) {
      var esc = im.Code_IM.replace(/'/g, "\'");
      var lib = (im.Libelle||'').replace(/'/g, "\'");
      return '<div class="suggestion-item" onclick="selForceImmo(\''+esc+'\',\''+lib+'\')"><strong>'+im.Libelle+'</strong> <span class="chantier-tag">'+im.Code_IM+'</span></div>';
    }).join('');
}

function selForceImmo(code, lib) {
  forceImmoCode = code;
  document.getElementById('force-immo-search').value = lib;
  document.getElementById('force-immo-info').textContent = '✅ ' + lib + ' (' + code + ')';
  var div = document.getElementById('force-suggestions');
  if (div) div.innerHTML = '';
}

function scannerPourForce() {
  showScreen('screen-scan-force');
  startScanner('scanner-force', function (code) {
    stopScanner(); vibrer(150);
    if (!code.startsWith('IM')) { alert('Ce QR code n\'est pas une immo.'); showScreen('screen-force-attribution'); return; }
    forceImmoCode = code;
    document.getElementById('force-immo-search').value = getLibelle(code) + ' (' + code + ')';
    document.getElementById('force-immo-info').textContent = '✅ ' + getLibelle(code) + ' (' + code + ')';
    showScreen('screen-force-attribution');
  });
}

async function validerForceAttribution() {
  if (!forceImmoCode) { alert('Sélectionne une immo.'); return; }
  var select = document.getElementById('force-receveur');
  var codeReceveur = select.value;
  if (!codeReceveur) { alert('Sélectionne un employé.'); return; }
  var nomReceveur = select.options[select.selectedIndex].textContent.split(' (')[0];
  var etat = document.getElementById('force-etat').value;
  var note = document.getElementById('force-note').value.trim();

  if (!confirm('Attribuer ' + getLibelle(forceImmoCode) + ' à ' + nomReceveur + ' sans validation ? Cette action est immédiate.')) return;

  try {
    var mouvement = {
      code_im: forceImmoCode, code_employe: codeReceveur,
      nom_employe: nomReceveur, type_mouvement: 'Transfert',
      code_chantier: state.employe.code + '|' + state.employe.nom,
      etat: etat, note: (note || '') + (note ? ' ' : '') + '[Attribution forcée par ' + state.employe.nom + ']',
      horodatage: new Date().toISOString(),
    };
    var res = await fetch(CONFIG.webhookMouvements, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mouvement),
    });
    var data = await res.json();
    if (data.success !== false) {
      document.getElementById('recap').innerHTML =
        '<strong>⚡ Attribution forcée !</strong><br>' +
        '<strong>Immo :</strong> ' + getLibelle(forceImmoCode) + '<br>' +
        '<strong>Attribuée à :</strong> ' + nomReceveur + '<br>' +
        '<strong>Par :</strong> ' + state.employe.nom;
      document.getElementById('alerte-degradation').classList.add('hidden');
      vibrer(300);
      showScreen('screen-confirmation');
      forceImmoCode = null;
    } else { alert('Erreur lors de l\'attribution.'); }
  } catch (e) { alert('Erreur de connexion.'); }
}

// ── Photos ───────────────────────────────────────────────────────
function ouvrirPhotos(codeIM) {
  if (!codeIM) return;
  state.photoImmo = codeIM;
  var lib = getLibelle(codeIM);
  document.getElementById('photos-immo-titre').textContent = lib + ' (' + codeIM + ')';
  var uploadZone = document.getElementById('upload-zone');
  if (uploadZone) {
    var isAdmin = state.employe && CONFIG.admins.includes(state.employe.code);
    uploadZone.classList.toggle('hidden', !isAdmin);
  }
  document.getElementById('upload-progress').textContent = '';
  showScreen('screen-photos');
  chargerPhotos(codeIM);
}

async function chargerPhotos(codeIM) {
  var galerie = document.getElementById('galerie-photos');
  galerie.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?photos=' + encodeURIComponent(codeIM));
    var photos = await res.json();
    if (!photos.length) { galerie.innerHTML = '<p class="empty-msg">Aucune photo.</p>'; return; }
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%">';
    photos.forEach(function (p) {
      var dateStr = new Date(p.created).toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' });
      var isAdmin = state.employe && CONFIG.admins.includes(state.employe.code);
      html += '<div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">';
      html += '<img src="' + p.url + '" style="width:100%;height:160px;object-fit:cover;display:block;cursor:pointer" loading="lazy" onclick="agrandirPhoto(this.src)">';
      html += '<p style="font-size:11px;color:#999;padding:4px 8px;margin:0">' + dateStr + '</p>';
      if (isAdmin) {
        var fn = p.name;
        html += '<button onclick="supprimerPhoto(\'' + fn + '\')" style="width:100%;padding:6px;background:#FDECEA;border:none;color:#C0392B;font-size:12px;cursor:pointer">🗑️ Supprimer</button>';
      }
      html += '</div>';
    });
    html += '</div>';
    galerie.innerHTML = html;
  } catch (e) { galerie.innerHTML = '<p class="empty-msg">Erreur.</p>'; }
}

async function uploadPhoto(input) {
  if (!input.files || !input.files[0]) return;
  var progress = document.getElementById('upload-progress');
  progress.textContent = '⏳ Compression...';
  compresserPhoto(input.files[0], async function (base64) {
    progress.textContent = '⬆️ Upload...';
    var now = new Date();
    var filename = now.getFullYear() + '' + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + now.getHours() + now.getMinutes() + now.getSeconds() + '.jpg';
    try {
      var res = await fetch(CONFIG.webhookMouvements + '?action=upload_photo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_im: state.photoImmo, data: base64, filename: filename }),
      });
      var result = await res.json();
      if (result.success) { progress.textContent = '✅ Photo ajoutée !'; input.value = ''; setTimeout(function () { progress.textContent = ''; chargerPhotos(state.photoImmo); }, 1000); }
      else progress.textContent = '❌ Échec.';
    } catch (e) { progress.textContent = '❌ Erreur.'; }
  });
}

function agrandirPhoto(url) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
  overlay.onclick = function () { document.body.removeChild(overlay); };
  var img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:95vw;max-height:90vh;border-radius:8px;object-fit:contain';
  overlay.appendChild(img);
  document.body.appendChild(overlay);
}

async function supprimerPhoto(filename) {
  if (!confirm('Supprimer cette photo ?')) return;
  await fetch(CONFIG.webhookMouvements + '?action=delete_photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code_im: state.photoImmo, filename: filename }) });
  chargerPhotos(state.photoImmo);
}

// ── Réservations ─────────────────────────────────────────────────
var STATUT_COLORS = {
  'Demandee': { bg: '#FFF8E1', color: '#E65100', label: '⏳ En attente' },
  'Confirmee': { bg: '#E8F5E9', color: '#1B5E20', label: '✅ Confirmée' },
  'En cours':  { bg: '#E3F2FD', color: '#0D47A1', label: '🔄 En cours' },
  'Rendue':    { bg: '#F5F5F5', color: '#757575', label: '📦 Rendue' },
  'En retard': { bg: '#FFEBEE', color: '#B71C1C', label: '⚠️ En retard' },
  'Annulee':   { bg: '#F5F5F5', color: '#9E9E9E', label: '❌ Annulée' },
};

function statutBadgeResa(statut) {
  var s = STATUT_COLORS[statut] || STATUT_COLORS['Demandee'];
  return '<span style="display:inline-block;padding:2px 9px;border-radius:8px;font-size:11px;font-weight:700;background:' + s.bg + ';color:' + s.color + '">' + s.label + '</span>';
}

async function verifierReservationsEnRetard() {
  if (!state.employe) return;
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?mes_reservations=' + state.employe.code);
    var resas = await res.json();
    var retards = (resas || []).filter(function (r) { return r.statut === 'En retard'; });
    var badge = document.getElementById('badge-resa-retard');
    if (badge) { badge.textContent = retards.length; badge.classList.toggle('hidden', retards.length === 0); }
  } catch (e) {}
}

function rechercherImmoResa() {
  var cat = (document.getElementById('resa-categorie') || {}).value || '';
  var q = document.getElementById('resa-immo-search').value.trim();
  var div = document.getElementById('resa-immo-suggestions');
  if (!q && !cat) { div.innerHTML = ''; return; }
  var results = immosFiltrees(cat, q);
  div.innerHTML = results.length === 0 ? '<p class="empty-msg">Aucune immo.</p>' :
    results.map(function (im) {
      var esc = im.Code_IM.replace(/'/g, "\\'");
      var lib = (im.Libelle || '').replace(/'/g, "\\'");
      return '<div class="suggestion-item" onclick="selectionnerImmoResa(\'' + esc + '\',\'' + lib + '\')">' +
        '<strong>' + im.Libelle + '</strong> <span class="chantier-tag">' + im.Code_IM + '</span>' +
        (im.Categorie ? '<small> — ' + im.Categorie + '</small>' : '') + '</div>';
    }).join('');
}

function selectionnerImmoResa(code, libelle) {
  state.resaImmoCode = code;
  state.resaImmoLibelle = libelle;
  document.getElementById('resa-immo-info').textContent = libelle + ' (' + code + ')';
  document.getElementById('resa-immo-search').value = libelle;
  document.getElementById('resa-immo-suggestions').innerHTML = '';
}

function scannerPourResa() {
  showScreen('screen-scan-resa');
  startScanner('scanner-resa', function (code) {
    stopScanner(); vibrer(200);
    if (!code.startsWith('IM')) { alert('Ce n\'est pas une immo.'); showScreen('screen-reserver'); return; }
    selectionnerImmoResa(code, getLibelle(code));
    showScreen('screen-reserver');
  });
}

function initReservationScreen() {
  state.resaImmoCode = null;
  state.resaImmoLibelle = null;
  document.getElementById('resa-immo-info').textContent = '';
  document.getElementById('resa-immo-search').value = '';
  document.getElementById('resa-immo-suggestions').innerHTML = '';
  document.getElementById('resa-date-debut').value = '';
  document.getElementById('resa-date-fin').value = '';
  document.getElementById('resa-chantier').value = '';
  document.getElementById('resa-note').value = '';
  buildCatSelect('resa-categorie', rechercherImmoResa);
}

async function verifierConflits(codeIM, dateDebut, dateFin) {
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?reservations=1');
    var resas = await res.json();
    var debut = new Date(dateDebut), fin = new Date(dateFin);
    return (resas || []).filter(function (r) {
      if (r.code_im !== codeIM || r.statut === 'Annulee' || r.statut === 'Rendue') return false;
      var rd = new Date(r.date_debut), rf = new Date(r.date_fin);
      return !(fin < rd || debut > rf);
    });
  } catch (e) { return []; }
}

async function soumettreReservation() {
  if (!state.resaImmoCode) { alert('Sélectionne ou scanne une immo.'); return; }
  var debut = document.getElementById('resa-date-debut').value;
  var fin = document.getElementById('resa-date-fin').value;
  if (!debut || !fin) { alert('Indique les dates.'); return; }
  if (new Date(fin) <= new Date(debut)) { alert('La date de retour doit être après le départ.'); return; }

  var conflits = await verifierConflits(state.resaImmoCode, debut, fin);
  if (conflits.length > 0) {
    var msg = conflits.map(function (c) { return c.nom_employe + ' du ' + fmtDate(c.date_debut) + ' au ' + fmtDate(c.date_fin); }).join(' | ');
    if (!confirm('Cette immo est deja reservee : ' + msg + '. Envoyer quand meme ?')) return;
  }

  var chantier = document.getElementById('resa-chantier').value.trim();
  var note = document.getElementById('resa-note').value.trim();
  // Pour qui (admin peut réserver pour quelqu'un)
  var pourQuiSelect = document.getElementById('resa-pour-qui');
  var pourQuiCode = pourQuiSelect ? pourQuiSelect.value : '';
  var pourQuiNom = '';
  if (pourQuiCode && pourQuiSelect) {
    var opt = pourQuiSelect.options[pourQuiSelect.selectedIndex];
    pourQuiNom = opt ? opt.textContent.split(' (')[0] : pourQuiCode;
  }
  var codeEmp = pourQuiCode || state.employe.code;
  var nomEmp = pourQuiNom || state.employe.nom;

  try {
    var res = await fetch(CONFIG.webhookMouvements + '?action=reserver', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_im: state.resaImmoCode, code_employe: codeEmp, nom_employe: nomEmp, code_chantier: chantier, nom_chantier: chantier, date_debut: new Date(debut).toISOString(), date_fin: new Date(fin).toISOString(), note: note }),
    });
    var data = await res.json();
    if (data.success) {
      vibrer(300);
      document.getElementById('recap').innerHTML =
        '<strong>✅ Demande envoyée !</strong><br>' +
        '<strong>Immo :</strong> ' + state.resaImmoLibelle + '<br>' +
        (pourQuiNom ? '<strong>Pour :</strong> ' + pourQuiNom + '<br>' : '') +
        '<strong>Du :</strong> ' + new Date(debut).toLocaleDateString('fr-FR') + '<br>' +
        '<strong>Au :</strong> ' + new Date(fin).toLocaleDateString('fr-FR') + '<br>' +
        '<strong>Statut :</strong> En attente de confirmation logistique';
      document.getElementById('alerte-degradation').classList.add('hidden');
      showScreen('screen-confirmation');
    } else { alert('Erreur lors de la réservation.'); }
  } catch (e) { alert('Erreur : ' + e.message); }
}

async function afficherMesReservations() {
  if (!state.employe) { showScreen('screen-activation'); return; }
  var div = document.getElementById('mes-resa-liste');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?mes_reservations=' + state.employe.code);
    var resas = await res.json();
    if (!Array.isArray(resas) || !resas.length) { div.innerHTML = '<p class="empty-msg">Aucune réservation.</p>'; return; }
    var actives = resas.filter(function (r) { return r.statut !== 'Rendue' && r.statut !== 'Annulee'; });
    var terminees = resas.filter(function (r) { return r.statut === 'Rendue' || r.statut === 'Annulee'; });
    var html = '';
    if (actives.filter(function (r) { return r.statut === 'En retard'; }).length > 0) {
      html += '<div style="background:#FFEBEE;border-radius:10px;padding:12px 14px;margin-bottom:8px;border-left:4px solid #E74C3C"><strong style="color:#B71C1C">⚠️ Retard de restitution — retourne le matériel au dépôt.</strong></div>';
    }
    function carteResa(r) {
      var lib = r.code_im ? getLibelle(r.code_im) : '—';
      var s = STATUT_COLORS[r.statut] || STATUT_COLORS['Demandee'];
      var canEdit = r.statut === 'Demandee' || r.statut === 'Confirmee' || r.statut === 'En cours';
      var rid = r.id;
      return '<div class="materiel-card" style="border-left:4px solid ' + s.color + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<strong style="font-size:15px;color:#1A3A6B">' + lib + '</strong>' +
        '<span style="padding:2px 9px;border-radius:8px;font-size:11px;font-weight:700;background:' + s.bg + ';color:' + s.color + '">' + s.label + '</span>' +
        '</div>' +
        (r.code_im ? '<span style="font-size:11px;color:#999;font-family:monospace">' + r.code_im + '</span><br>' : '') +
        '<div style="font-size:13px;margin-top:4px">📅 ' + fmtDate(r.date_debut) + ' → ' + fmtDate(r.date_fin) + '</div>' +
        (r.nom_chantier ? '<div style="font-size:12px;color:#666">🏗️ ' + r.nom_chantier + '</div>' : '') +
        (r.note ? '<div style="font-size:12px;color:#888">📝 ' + r.note + '</div>' : '') +
        (canEdit ? '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<button onclick="ouvrirModifResa(\'' + rid + '\')" style="flex:1;padding:8px;background:#E3F2FD;color:#0D47A1;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px">✏️ Modifier</button>' +
          '<button onclick="annulerResa(\'' + rid + '\')" style="flex:1;padding:8px;background:#FFEBEE;color:#C0392B;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px">❌ Annuler</button>' +
          '</div>' : '') +
        '</div>';
    }
    if (actives.length) { html += '<h3 style="color:#1A3A6B;font-size:14px;margin:8px 0 6px">En cours (' + actives.length + ')</h3>'; html += actives.map(carteResa).join(''); }
    if (terminees.length) { html += '<h3 style="color:#999;font-size:13px;margin:12px 0 6px">Terminées (' + terminees.length + ')</h3>'; html += terminees.map(carteResa).join(''); }
    div.innerHTML = html;
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur : ' + e.message + '</p>'; }
}

async function annulerResa(id) {
  if (!confirm('Annuler cette réservation ?')) return;
  try {
    await fetch(CONFIG.webhookMouvements + '?action=statut_resa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, statut: 'Annulee' }) });
    afficherMesReservations();
    verifierReservationsEnRetard();
  } catch (e) { alert('Erreur.'); }
}

var resaEnCoursId = null;
async function ouvrirModifResa(id) {
  resaEnCoursId = id;
  try {
    var res = await fetch(CONFIG.webhookMouvements + '?mes_reservations=' + state.employe.code);
    var resas = await res.json();
    var resa = (resas || []).find(function (r) { return r.id === id; });
    if (!resa) { alert('Réservation introuvable.'); return; }
    var lib = getLibelle(resa.code_im);
    document.getElementById('modif-resa-info').textContent = lib + ' (' + resa.code_im + ')';
    if (resa.date_debut) document.getElementById('modif-date-debut').value = resa.date_debut.slice(0, 10);
    if (resa.date_fin) document.getElementById('modif-date-fin').value = resa.date_fin.slice(0, 10);
    document.getElementById('modif-chantier').value = resa.nom_chantier || '';
    document.getElementById('modif-note').value = resa.note || '';
    showScreen('screen-modifier-resa');
  } catch (e) { alert('Erreur.'); }
}

async function validerModifResa() {
  if (!resaEnCoursId) return;
  var debut = document.getElementById('modif-date-debut').value;
  var fin = document.getElementById('modif-date-fin').value;
  if (!debut || !fin) { alert('Indique les dates.'); return; }
  try {
    await fetch(CONFIG.webhookMouvements + '?action=modifier_resa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: resaEnCoursId, date_debut: new Date(debut).toISOString(), date_fin: new Date(fin).toISOString(), nom_chantier: document.getElementById('modif-chantier').value, note: document.getElementById('modif-note').value }),
    });
    resaEnCoursId = null;
    showScreen('screen-mes-reservations');
  } catch (e) { alert('Erreur.'); }
}

// ── Stock au dépôt (admin/CONI) ─────────────────────────────────────────
async function ouvrirStockDepot() {
  showScreen('screen-stock-depot');
  buildCatSelect('stock-cat', filtrerStockDepot);
  filtrerStockDepot();
}

async function filtrerStockDepot() {
  var cat = (document.getElementById('stock-cat') || {}).value || '';
  var q = (document.getElementById('stock-search') || {}).value || '';
  var div = document.getElementById('stock-depot-liste');
  if (!div) return;
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    var enCircSet = {};
    try {
      var r = await fetch(CONFIG.webhookMouvements + '?dashboard=1');
      var dd = await r.json();
      (dd.en_circulation || []).forEach(function(i) { enCircSet[i.code_im] = true; });
    } catch(e2) {}
    var filtered = immosFiltrees(cat, q).filter(function(im) { return !enCircSet[im.Code_IM]; });
    filtered.sort(function(a, b) { return a.Code_IM.localeCompare(b.Code_IM); });
    var countEl = document.getElementById('stock-count');
    if (countEl) countEl.textContent = filtered.length + ' immos';
    if (!filtered.length) { div.innerHTML = '<p class="empty-msg">Aucune immo au dépôt.</p>'; return; }
    div.innerHTML = filtered.map(function(im) {
      var fdsUrl = getFdsUrl(im.FDS_URL || '', im.Code_IM);
      var fdsBtn = fdsUrl ? '<a href="' + fdsUrl + '" target="_blank" style="font-size:11px;padding:2px 8px;background:#E3F2FD;color:#0D47A1;border-radius:8px;text-decoration:none;margin-left:6px">📄 FDS</a>' : '';
      return '<div class="materiel-card">' +
        '<strong style="font-size:14px;color:#1A3A6B">' + im.Libelle + '</strong>' + fdsBtn + '<br>' +
        '<span style="font-size:11px;color:#999;font-family:monospace">' + im.Code_IM + '</span>' +
        (im.Categorie ? ' · <span style="font-size:11px;color:#888">' + im.Categorie + '</span>' : '') +
        '</div>';
    }).join('');
  } catch(e) { div.innerHTML = '<p class="empty-msg">Erreur : ' + e.message + '</p>'; }
}

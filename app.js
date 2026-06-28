// ══════════════════════════════════════════════════════════
// IMMO TRACKER — Espace Soleil — app.js
// ══════════════════════════════════════════════════════════

const CONFIG = {
  proxy:   'https://immo-proxy.ral-85d.workers.dev/',
  // Admins / logistique
  admins:  ['CONI', 'AIWI', 'NAXA', 'BAKA'],
  // Responsables d'affaires + CTs + admins : tous autorisés à réserver
  autorises: ['CONI', 'AIWI', 'NAXA', 'BAKA', 'ROJO', 'AUAR', 'BOMA', 'ADWI',
              'RIJB', 'MEJO', 'GOLU', 'SCST', 'CANI', 'DACH', 'TOHO'],
  etats:   { 'Neuf': 5, 'Bon état': 4, 'Usé': 3, 'Abîmé': 2, 'Hors service': 1 },
};

// Peut-on faire une réservation ?
function peutReserver(code) {
  if (!code) return false;
  return CONFIG.autorises.includes(code);
}

// ── État global ───────────────────────────────────────────
const S = {
  employe:             null,
  typeMouvement:       null,
  codeIM:              null,
  codeReceveur:        null,
  nomReceveur:         null,
  transfertEnCours:    null,
  photoEtatBase64:     null,
  photoReceptionBase64:null,
  resaImmoCode:        null,
  resaImmoLibelle:     null,
  resaEnCoursId:       null,
  forceImmoCode:       null,
  photoImmo:           null,
  immos:               {},
  employes:            [],
  scanner:             null,
};

// ── Utilitaires ───────────────────────────────────────────
function vib(ms) { if (navigator.vibrate) navigator.vibrate(ms || 150); }

function toast(msg, type, ms) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms || 2500);
}

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion', day: '2-digit', month: '2-digit', year: 'numeric' });
}
const fmtDate = fmt; // alias

function fmtDT(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { timeZone: 'Indian/Reunion', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function lib(code) { return S.immos[code] ? S.immos[code].Libelle || code : code; }
function cat(code) { return S.immos[code] ? S.immos[code].Categorie || '' : ''; }
function fds(code) { return S.immos[code] ? S.immos[code].FDS_URL || '' : ''; }

function fdsUrl(code) {
  const u = fds(code);
  if (!u) return '';
  if (u.includes('sharepoint.com')) return CONFIG.proxy + '?fds=' + encodeURIComponent(code);
  return u;
}

function ebadge(e) {
  const map = { 'Neuf': '#E8F5E9:#1B5E20', 'Bon état': '#E3F2FD:#0D47A1', 'Usé': '#FFF8E1:#E65100', 'Abîmé': '#FFEBEE:#B71C1C', 'Hors service': '#F5F5F5:#616161' };
  const c = map[e] || '#F5F5F5:#9E9E9E';
  const [bg, fg] = c.split(':');
  return e ? `<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;background:${bg};color:${fg}">${e}</span>` : '';
}

const SCOL = { 'Demandee': '#F39C12', 'Confirmee': '#27AE60', 'En cours': '#2980B9', 'En retard': '#E74C3C', 'Rendue': '#95A5A6', 'Annulee': '#BDC3C7' };
const SLAB = { 'Demandee': '⏳ En attente', 'Confirmee': '✅ Confirmée', 'En cours': '🔄 En cours', 'En retard': '⚠️ En retard', 'Rendue': '📦 Rendue', 'Annulee': '❌ Annulée' };
function rsLabel(s) { const c = SCOL[s] || '#999'; const l = SLAB[s] || s; return `<span style="padding:2px 9px;border-radius:8px;font-size:11px;font-weight:700;background:${c}22;color:${c}">${l}</span>`; }

// ── Catégories ────────────────────────────────────────────
function getCats() {
  const c = {};
  for (const k in S.immos) { c[S.immos[k].Categorie || 'Sans catégorie'] = true; }
  return Object.keys(c).sort();
}

function buildCatSelect(id, fn) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const v = sel.value;
  sel.innerHTML = '<option value="">Toutes catégories</option>' + getCats().map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = v;
  if (fn) sel.onchange = fn;
}

function immosFilt(cat, q) {
  const qu = (q || '').trim().toUpperCase();
  const res = [];
  for (const k in S.immos) {
    const im = S.immos[k];
    const mc = !cat || (im.Categorie || 'Sans catégorie') === cat;
    const num = k.replace('IM', '').replace(/^0+/, '');
    const mq = !qu || k.toUpperCase().includes(qu) || (im.Libelle || '').toUpperCase().includes(qu) || num === qu;
    if (mc && mq) res.push(im);
    if (res.length >= 30) break;
  }
  return res;
}

// ── Scanner ───────────────────────────────────────────────
function startScanner(elId, cb) {
  stopScanner();
  const el = document.getElementById(elId);
  if (!el) return;
  S.scanner = new Html5Qrcode(elId);
  S.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, cb, () => {}).catch(() => {
    if (el) el.innerHTML = '<p style="color:#fff;text-align:center;padding:40px 20px;font-size:14px">⚠️ Impossible d\'accéder à la caméra.<br>Vérifie les permissions.</p>';
  });
}

function stopScanner() {
  if (S.scanner) { S.scanner.stop().catch(() => {}); S.scanner = null; }
}

// ── Navigation ────────────────────────────────────────────
function showScreen(id, skipInit) {
  stopScanner();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const sc = document.getElementById(id);
  if (sc) sc.classList.add('active');

  switch (id) {
    case 'screen-activation':
      setTimeout(() => startScanner('scanner-activation', onScanActivation), 200);
      break;
    case 'screen-mon-materiel':       afficherMonMateriel(); break;
    case 'screen-transferts-attente': afficherTransfertsEnAttente(); break;
    case 'screen-mes-reservations':   afficherMesReservations(); break;
    case 'screen-reserver':           if (!skipInit) initReservationScreen(false); break;
  }
}

// ── Init au chargement ────────────────────────────────────
window.addEventListener('load', async () => {
  const saved = localStorage.getItem('employe');
  if (saved) {
    S.employe = JSON.parse(saved);
    afficherEmploye();
  } else {
    // Première visite → aller directement au scan
    showScreen('screen-activation');
    return;
  }
  await Promise.all([chargerImmos(), chargerEmployes()]);
  rafraichirBadges();
});

async function chargerImmos() {
  try {
    const r = await fetch('immos.json');
    const arr = await r.json();
    arr.forEach(i => { S.immos[i.Code_IM] = i; });
    ['resa-categorie', 'rech-cat', 'force-cat', 'stock-cat'].forEach(id => buildCatSelect(id));
  } catch (e) {}
}

async function chargerEmployes() {
  try {
    const r = await fetch('employes.json');
    S.employes = await r.json();
    const selIds = ['select-receveur', 'force-receveur', 'resa-pour-qui'];
    selIds.forEach(selId => {
      const sel = document.getElementById(selId);
      if (!sel) return;
      const def = selId === 'resa-pour-qui' ? '<option value="">-- Moi-même --</option>' : '<option value="">-- Sélectionne --</option>';
      sel.innerHTML = def;
      const coniFirst = S.employes.filter(e => e.Code === 'CONI');
      const autres    = S.employes.filter(e => e.Code !== 'CONI' && (!S.employe || e.Code !== S.employe.code));
      if (coniFirst.length) {
        const og = document.createElement('optgroup'); og.label = '⭐ Dépôt logistique';
        coniFirst.forEach(e => { const o = document.createElement('option'); o.value = e.Code; o.textContent = e.Nom + ' (' + e.Code + ')'; og.appendChild(o); });
        sel.appendChild(og);
      }
      const og2 = document.createElement('optgroup'); og2.label = 'Équipes';
      autres.sort((a, b) => a.Nom.localeCompare(b.Nom)).forEach(e => { const o = document.createElement('option'); o.value = e.Code; o.textContent = e.Nom + ' (' + e.Code + ')'; og2.appendChild(o); });
      sel.appendChild(og2);
    });
  } catch (e) {}
}

// ── Affichage employé ─────────────────────────────────────
function afficherEmploye() {
  const badge = document.getElementById('user-info');
  if (badge) { badge.textContent = '👷 ' + S.employe.nom; badge.classList.remove('hidden'); }
  const isAdmin = CONFIG.admins.includes(S.employe.code);
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
  const btnMat   = document.getElementById('btn-mon-materiel');
  const btnStock = document.getElementById('btn-stock-depot');
  if (btnMat)   btnMat.classList.toggle('hidden', isAdmin);
  if (btnStock) btnStock.classList.toggle('hidden', !isAdmin);
  // Adapter le bouton réservations selon le rôle
  const btnResa = document.getElementById('btn-resa');
  if (btnResa) {
    if (!peutReserver(S.employe.code)) {
      btnResa.style.display = 'none';
    } else {
      btnResa.style.display = '';
      const label = isAdmin ? '📋 Réservations' : '📅 Mes réservations';
      btnResa.innerHTML = label + ' <span id="badge-resa" class="badge-count hidden"></span>';
    }
  }
}

function changerUtilisateur() {
  if (!confirm('Changer d\'utilisateur ?')) return;
  localStorage.removeItem('employe');
  S.employe = null;
  // Reset tous les badges
  ['user-info','badge-attente','badge-mon-mat','badge-materiel','badge-resa'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.classList.add('hidden');
  });
  document.querySelectorAll('.admin-only').forEach(function(el) { el.classList.add('hidden'); });
  var btnMat = document.getElementById('btn-mon-materiel');
  var btnStock = document.getElementById('btn-stock-depot');
  if (btnMat) btnMat.classList.remove('hidden');
  if (btnStock) btnStock.classList.add('hidden');
  showScreen('screen-activation');
}

// ── Badges ────────────────────────────────────────────────
async function rafraichirBadges() {
  if (!S.employe) return;
  await Promise.all([majBadgeTransferts(), majBadgeMateriel(), majBadgeResas()]);
}

async function majBadgeMateriel() {
  if (!S.employe) return;
  try {
    const r = await fetch(CONFIG.proxy + '?employe=' + S.employe.code);
    const d = await r.json();
    const n = (d.actuel || []).length;
    const el = document.getElementById('badge-mon-mat');
    if (el) { el.textContent = n; el.classList.toggle('hidden', n === 0); }
    // Aussi mettre à jour le badge sur le bouton Transfert
    const bm = document.getElementById('badge-materiel');
    if (bm) { bm.textContent = n; bm.classList.toggle('hidden', n === 0); }
  } catch (e) {}
}

async function majBadgeTransferts() {
  if (!S.employe) return;
  try {
    const r = await fetch(CONFIG.proxy + '?transferts=' + S.employe.code);
    const d = await r.json();
    const n = (d || []).length;
    const el = document.getElementById('badge-attente');
    if (el) {
      if (n > 0) {
        el.textContent = '⚠️ ' + n + ' transfert' + (n > 1 ? 's' : '') + ' en attente — Cliquer pour valider';
        el.classList.remove('hidden');
      } else { el.classList.add('hidden'); }
    }
  } catch (e) {}
}

async function majBadgeResas() {
  if (!S.employe) return;
  const isAdmin = CONFIG.admins.includes(S.employe.code);
  try {
    let resas;
    if (isAdmin) {
      // Admin/CONI : charger TOUTES les réservations, compter les "Demandee"
      const r = await fetch(CONFIG.proxy + '?reservations=1');
      resas = await r.json();
      const demandees = resas.filter(function(r) { return r.statut === 'Demandee'; }).length;
      const retards   = resas.filter(function(r) { return r.statut === 'En retard'; }).length;
      const el = document.getElementById('badge-resa');
      if (el) {
        const total = demandees + retards;
        if (total > 0) {
          el.textContent = total;
          el.style.background = retards > 0 ? 'var(--red)' : 'var(--orange)';
          el.classList.remove('hidden');
        } else { el.classList.add('hidden'); }
      }
    } else {
      // Utilisateur : ses propres réservations actives
      const r = await fetch(CONFIG.proxy + '?mes_reservations=' + S.employe.code);
      resas = await r.json();
      const actives = resas.filter(function(r) { return r.statut !== 'Rendue' && r.statut !== 'Annulee'; });
      const retards = actives.filter(function(r) { return r.statut === 'En retard'; });
      const el = document.getElementById('badge-resa');
      if (el) {
        const n = actives.length;
        if (n > 0) {
          el.textContent = n;
          el.style.background = retards.length > 0 ? 'var(--red)' : 'var(--orange)';
          el.classList.remove('hidden');
        } else { el.classList.add('hidden'); }
      }
    }
  } catch (e) {}
}

// ── Activation (scan carte BTP) ───────────────────────────
function onScanActivation(code) {
  const parts = code.split('|');
  if (parts.length < 2 || code.startsWith('IM')) {
    // Pas une carte employé
    toast('Ce QR code n\'est pas une carte employé', 'error');
    return;
  }
  stopScanner(); vib(300);
  const employe = { code: parts[0].trim(), nom: parts[1].trim() };
  localStorage.setItem('employe', JSON.stringify(employe));
  S.employe = employe;
  afficherEmploye();
  showScreen('screen-accueil');
  toast('👋 Bienvenue ' + employe.nom + ' !', 'success', 3500);
  chargerEmployes();
  rafraichirBadges();
  chargerImmos().then(() => { ['resa-categorie', 'rech-cat', 'force-cat', 'stock-cat'].forEach(id => buildCatSelect(id)); });
}

// ── Démarrer mouvement ────────────────────────────────────
function startMouvement(type) {
  if (!S.employe) { showScreen('screen-activation'); return; }
  S.typeMouvement = type;
  S.codeIM = null; S.codeReceveur = null; S.nomReceveur = null;
  S.photoEtatBase64 = null;
  document.getElementById('titre-mouvement').textContent = type === 'Retour' ? '📥 Retour au dépôt' : '🔄 Transférer';
  document.getElementById('immo-result')?.classList.add('hidden');
  showScreen('screen-scan-immo');
  startScanner('scanner-immo', onScanImmo);
}

async function onScanImmo(code) {
  if (!code.startsWith('IM')) { return; } // Ignorer les non-immos
  stopScanner(); vib(200);
  S.codeIM = code;
  const res = document.getElementById('immo-result');
  if (res) { res.textContent = '✅ ' + lib(code) + ' (' + code + ')'; res.classList.remove('hidden'); }
  toast('📦 ' + lib(code), 'success', 2000);

  await new Promise(r => setTimeout(r, 600));

  if (S.typeMouvement === 'Retour') {
    document.getElementById('etat-immo-info').textContent = lib(code) + ' → 🏭 Dépôt';
    document.getElementById('select-etat').value = 'Bon état';
    document.getElementById('note-texte').value = '';
    document.getElementById('photo-etat-preview').innerHTML = '';
    S.photoEtatBase64 = null;
    showScreen('screen-etat');
    return;
  }

  // Vérifier si transfert en attente pour cet employé sur cette immo
  try {
    const r   = await fetch(CONFIG.proxy + '?transferts=' + S.employe.code);
    const trs = await r.json();
    const pending = (trs || []).find(t => t.code_im === code);
    if (pending) {
      S.transfertEnCours = pending;
      const elTxt = document.getElementById('accepter-texte');
      if (elTxt) elTxt.textContent = lib(code) + ' de ' + pending.nom_donneur;
      const elEtat = document.getElementById('accepter-etat-donneur');
      if (elEtat) { if (pending.etat) { elEtat.textContent = 'État déclaré : ' + pending.etat; elEtat.classList.remove('hidden'); } else elEtat.classList.add('hidden'); }
      const elNote = document.getElementById('accepter-note-donneur');
      if (elNote) elNote.innerHTML = pending.note ? `<p style="font-size:13px;color:var(--grey);padding:8px;background:#f9f9f9;border-radius:8px">📝 ${pending.note}</p>` : '';
      document.getElementById('accepter-etat').value = pending.etat || 'Bon état';
      document.getElementById('accepter-note').value = '';
      document.getElementById('photo-reception-preview').innerHTML = '';
      S.photoReceptionBase64 = null;
      showScreen('screen-accepter');
      return;
    }
  } catch (e) {}

  // Aller à sélection receveur
  document.getElementById('receveur-immo-info').textContent = lib(code) + ' (' + code + ')';
  showScreen('screen-receveur');
}

// ── Receveur — scan carte ─────────────────────────────────
function scannerCarteReceveur() {
  showScreen('screen-scan-receveur');
  startScanner('scanner-receveur', code => {
    const parts = code.split('|');
    if (parts.length < 2 || code.startsWith('IM')) {
      toast('Ce n\'est pas une carte employé', 'error');
      return;
    }
    stopScanner(); vib(200);
    S.codeReceveur = parts[0].trim();
    S.nomReceveur  = parts[1].trim();
    toast('✅ ' + S.nomReceveur + ' sélectionné', 'success');
    // Aller directement à l'état
    document.getElementById('etat-immo-info').textContent = lib(S.codeIM) + ' → ' + S.nomReceveur;
    document.getElementById('select-etat').value = 'Bon état';
    document.getElementById('note-texte').value = '';
    document.getElementById('photo-etat-preview').innerHTML = '';
    S.photoEtatBase64 = null;
    showScreen('screen-etat');
  });
}

// ── Receveur — liste déroulante ───────────────────────────
function validerReceveur() {
  const sel = document.getElementById('select-receveur');
  if (!sel || !sel.value) { toast('Sélectionne un employé', 'error'); return; }
  S.codeReceveur = sel.value;
  S.nomReceveur  = sel.options[sel.selectedIndex]?.textContent.split(' (')[0] || sel.value;
  document.getElementById('etat-immo-info').textContent = lib(S.codeIM) + ' → ' + S.nomReceveur;
  document.getElementById('select-etat').value = 'Bon état';
  document.getElementById('note-texte').value = '';
  document.getElementById('photo-etat-preview').innerHTML = '';
  S.photoEtatBase64 = null;
  showScreen('screen-etat');
}

// ── Photos inline ─────────────────────────────────────────
function previewPhoto(input, previewId, stateKey) {
  if (!input.files?.[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio  = Math.min(1200 / img.width, 1200 / img.height, 1);
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', 0.75);
      S[stateKey] = b64;
      const prev = document.getElementById(previewId);
      if (prev) prev.innerHTML = `<img src="${b64}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin-top:6px">`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}

async function uploadPhotoSiPresente(codeIM, b64) {
  if (!b64) return;
  const now = new Date();
  const fn  = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${now.getHours()}${now.getMinutes()}${now.getSeconds()}.jpg`;
  try {
    await fetch(CONFIG.proxy + '?action=upload_photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code_im: codeIM, data: b64, filename: fn }) });
  } catch (e) {}
}

// ── Confirmer état ────────────────────────────────────────
async function confirmerAvecEtat() {
  const etat = document.getElementById('select-etat').value;
  const note = document.getElementById('note-texte').value.trim();

  if (S.typeMouvement === 'Retour') {
    const noteTrace = (note ? note + ' — ' : '') + '[retour enregistré par ' + S.employe.nom + ']';
    const mouv = { code_im: S.codeIM, code_employe: S.employe.code, nom_employe: S.employe.nom, type_mouvement: 'Retour', code_chantier: 'DEPOT', etat, note: noteTrace, horodatage: new Date().toISOString() };
    showRecap('📥 Retour enregistré', mouv, null);
    enregistrerMouvement(mouv);
    uploadPhotoSiPresente(S.codeIM, S.photoEtatBase64);
    return;
  }

  // Transfert
  const transfertNote = (note ? note + ' — ' : '') + '[transfert initié par ' + S.employe.nom + ']';
  const transfert = { code_im: S.codeIM, code_employe_donneur: S.employe.code, nom_donneur: S.employe.nom, code_employe_receveur: S.codeReceveur, nom_receveur: S.nomReceveur, etat, note: transfertNote };
  showRecap('🔄 Transfert envoyé', { code_im: S.codeIM, nom_employe: S.nomReceveur, type_mouvement: 'Transfert', etat, note }, 'En attente de validation par ' + S.nomReceveur);
  try {
    const r = await fetch(CONFIG.proxy + '?action=transfert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transfert) });
    const d = await r.json();
    if (!d.success) toast('Erreur lors de la création du transfert', 'error');
    else toast('✅ Transfert créé — en attente de ' + S.nomReceveur, 'success', 3500);
  } catch (e) { toast('Erreur réseau', 'error'); }
  uploadPhotoSiPresente(S.codeIM, S.photoEtatBase64);
}

function showRecap(titre, mouv, mention) {
  document.getElementById('recap').innerHTML =
    `<strong>${titre}</strong><br>
     <strong>Immo :</strong> ${lib(mouv.code_im)} (${mouv.code_im})<br>
     <strong>Employé :</strong> ${mouv.nom_employe}<br>
     <strong>Type :</strong> ${mouv.type_mouvement}<br>
     <strong>État :</strong> ${mouv.etat || '—'}` +
    (mouv.note ? `<br><strong>Note :</strong> ${mouv.note}` : '') +
    (mention ? `<br><em style="color:var(--grey)">${mention}</em>` : '');
  document.getElementById('alerte-degradation')?.classList.add('hidden');
  vib(300); showScreen('screen-confirmation');
}

function enregistrerMouvement(m) {
  fetch(CONFIG.proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) })
    .then(() => rafraichirBadges())
    .catch(() => {});
}

// ── Accepter un transfert ─────────────────────────────────
async function accepterTransfert() {
  const t    = S.transfertEnCours;
  const etat = document.getElementById('accepter-etat').value;
  const note = document.getElementById('accepter-note').value.trim();
  const dRank = CONFIG.etats[t?.etat] || 4;
  const rRank = CONFIG.etats[etat] || 4;
  try {
    const r = await fetch(CONFIG.proxy + '?action=valider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, code_im: t.code_im, code_employe: S.employe.code, nom_employe: S.employe.nom, etat_reception: etat, note_reception: note, etat_donneur: t.etat || '' }) });
    const d = await r.json();
    if (d.success !== false) {
      const alertDiv = document.getElementById('alerte-degradation');
      document.getElementById('recap').innerHTML = `<strong>✅ Réception confirmée !</strong><br><strong>Immo :</strong> ${lib(t.code_im)}<br><strong>De :</strong> ${t.nom_donneur}<br><strong>État constaté :</strong> ${etat}`;
      if (rRank < dRank) { alertDiv.textContent = `⚠️ Dégradation constatée : déclaré "${t.etat}" → reçu "${etat}"`; alertDiv.classList.remove('hidden'); }
      else alertDiv?.classList.add('hidden');
      vib(300); showScreen('screen-confirmation');
      uploadPhotoSiPresente(t.code_im, S.photoReceptionBase64);
      rafraichirBadges();
    } else { toast('Erreur lors de la validation', 'error'); }
  } catch (e) { toast('Erreur réseau', 'error'); }
}

function refuserTransfert() { showScreen('screen-accueil'); }

// ── Transferts en attente ─────────────────────────────────
async function afficherTransfertsEnAttente() {
  const div = document.getElementById('liste-attente');
  if (!div) return;
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const r = await fetch(CONFIG.proxy + '?transferts=' + S.employe.code);
    const trs = await r.json();
    if (!trs.length) { div.innerHTML = '<p class="empty-msg">Aucun transfert en attente.</p>'; return; }
    div.innerHTML = trs.map(t => `
      <div class="materiel-card">
        <strong>${lib(t.code_im)}</strong>
        <span class="chantier-tag" style="margin-left:6px">${t.code_im}</span><br>
        <small>📤 De : <strong>${t.nom_donneur}</strong></small>
        ${t.etat ? ` — <small>État déclaré : <strong>${t.etat}</strong></small>` : ''}
        ${t.note ? `<br><small style="color:var(--grey)">📝 ${t.note}</small>` : ''}
        <br><button class="btn btn-secondary" style="margin-top:8px;font-size:14px;padding:10px"
          onclick="demarrerValidation('${t.id}','${t.code_im}')">📷 Scanner pour valider</button>
      </div>`).join('');
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>'; return; }
  // Attacher boutons panne
  document.querySelectorAll('.btn-panne-mat').forEach(function(btn) {
    btn.onclick = function() { signalerPannePWA(btn.dataset.cim); };
  });
}

function demarrerValidation(tid, codeIM) {
  showScreen('screen-scan-validation');
  startScanner('scanner-validation', code => {
    if (code !== codeIM) { toast('Mauvais QR code — attendu : ' + codeIM, 'error'); return; }
    stopScanner(); vib(200);
    S.codeIM = code;
    fetch(CONFIG.proxy + '?transferts=' + S.employe.code).then(r => r.json()).then(trs => {
      const t = (trs || []).find(t => t.id === tid) || { id: tid, code_im: code, nom_donneur: '—', etat: '', note: '' };
      S.transfertEnCours = t;
      document.getElementById('accepter-texte').textContent = lib(code) + ' de ' + t.nom_donneur;
      const elE = document.getElementById('accepter-etat-donneur');
      if (elE) { if (t.etat) { elE.textContent = 'État déclaré : ' + t.etat; elE.classList.remove('hidden'); } else elE.classList.add('hidden'); }
      document.getElementById('accepter-note-donneur').innerHTML = t.note ? `<p style="font-size:13px;color:var(--grey);padding:8px;background:#f9f9f9;border-radius:8px">📝 ${t.note}</p>` : '';
      document.getElementById('accepter-etat').value = t.etat || 'Bon état';
      document.getElementById('accepter-note').value = '';
      document.getElementById('photo-reception-preview').innerHTML = '';
      S.photoReceptionBase64 = null;
      showScreen('screen-accepter');
    }).catch(() => { S.transfertEnCours = { id: tid, code_im: code, nom_donneur: '—', etat: '', note: '' }; showScreen('screen-accepter'); });
  });
}

// ── Mon matériel ──────────────────────────────────────────
async function afficherMonMateriel() {
  if (!S.employe) { showScreen('screen-activation'); return; }
  document.getElementById('mon-materiel-user').textContent = S.employe.nom;
  const div = document.getElementById('liste-materiel');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const r = await fetch(CONFIG.proxy + '?employe=' + S.employe.code);
    const d = await r.json();
    const items = d.actuel || [];
    if (!items.length) { div.innerHTML = '<p class="empty-msg">Aucun matériel en ta possession.</p>'; return; }
    div.innerHTML = items.map(m => {
      const u = fdsUrl(m.code_im);
      const fdsBtn = u ? `<a href="${u}" target="_blank" style="font-size:11px;padding:2px 8px;background:#E3F2FD;color:#0D47A1;border-radius:8px;text-decoration:none;margin-left:6px">📄 FDS</a>` : '';
      const code_snap = m.code_im;
      const libelle_snap = lib(m.code_im);
      return `<div class="materiel-card">
        <strong>${libelle_snap}</strong>${fdsBtn}<br>
        <span class="chantier-tag">${code_snap}</span>
        ${ebadge(m.etat)} <small style="color:var(--grey)">${fmt(m.horodatage)}</small>
        ${m.note ? `<br><small style="color:var(--grey)">📝 ${m.note}</small>` : ''}
        <div style="margin-top:8px">
          <button class="btn-panne-mat" data-cim="${code_snap}"
            style="padding:6px 12px;background:#FFF3E0;color:#E65100;border:2px solid #E65100;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;width:100%">
            📢 Signaler une panne sur ${libelle_snap}
          </button>
        </div>
      </div>`;
    }).join('');
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur de connexion.</p>'; }
}

// ── Stock au dépôt (admin) ────────────────────────────────
async function ouvrirStockDepot() {
  showScreen('screen-stock-depot');
  buildCatSelect('stock-cat', filtrerStockDepot);
  await filtrerStockDepot();
}

async function filtrerStockDepot() {
  const cat = document.getElementById('stock-cat')?.value || '';
  const q   = document.getElementById('stock-search')?.value || '';
  const div = document.getElementById('stock-depot-liste');
  if (!div) return;
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    // Chercher les immos en circulation
    let enCircSet = {};
    try {
      const r   = await fetch(CONFIG.proxy + '?dashboard=1');
      const d   = await r.json();
      (d.en_circulation || []).forEach(i => { enCircSet[i.code_im] = true; });
    } catch (e) {}
    const filtered = immosFilt(cat, q).filter(im => !enCircSet[im.Code_IM]);
    filtered.sort((a, b) => a.Code_IM.localeCompare(b.Code_IM));
    const countEl = document.getElementById('stock-count');
    if (countEl) countEl.textContent = filtered.length + ' immos au dépôt';
    if (!filtered.length) { div.innerHTML = '<p class="empty-msg">Aucune immo.</p>'; return; }
    div.innerHTML = filtered.map(im => {
      const u = fdsUrl(im.Code_IM);
      const fdsBtn = u ? `<a href="${u}" target="_blank" style="font-size:11px;padding:2px 8px;background:#E3F2FD;color:#0D47A1;border-radius:8px;text-decoration:none;margin-left:6px">📄 FDS</a>` : '';
      return `<div class="materiel-card" style="border-left-color:#27AE60">
        <strong>${im.Libelle}</strong>${fdsBtn}<br>
        <span class="chantier-tag">${im.Code_IM}</span>
        ${im.Categorie ? `<small style="color:var(--grey)"> · ${im.Categorie}</small>` : ''}
      </div>`;
    }).join('');
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur : ' + e.message + '</p>'; }
}

// ── Recherche unifiée (admin) ─────────────────────────────
async function rechercheAuto() {
  const cat  = document.getElementById('rech-cat')?.value || '';
  const q    = document.getElementById('rech-input')?.value.trim() || '';
  const div  = document.getElementById('rech-resultats');
  if (!div) return;
  if (!q && !cat) { div.innerHTML = '<p class="empty-msg">Sélectionne une catégorie ou tape ta recherche.</p>'; return; }

  let html = '';
  const immosMatch = immosFilt(cat, q).slice(0, 8);
  const empMatch   = q ? S.employes.filter(e => e.Code?.toUpperCase().includes(q.toUpperCase()) || e.Nom?.toUpperCase().includes(q.toUpperCase())).slice(0, 4) : [];

  if (immosMatch.length) {
    html += `<h3 style="color:var(--blue);font-size:12px;margin:6px 0 4px;text-transform:uppercase;letter-spacing:.5px">Immos (${immosMatch.length})</h3>`;
    html += immosMatch.map(im => {
      const u = fdsUrl(im.Code_IM);
      const fdsBtn = u ? `<a href="${u}" target="_blank" style="font-size:11px;padding:2px 8px;background:#E3F2FD;color:#0D47A1;border-radius:8px;text-decoration:none;margin-left:6px">📄 FDS</a>` : '';
      return `<div class="materiel-card" style="border-left-color:#27AE60;cursor:pointer" onclick="voirDetailImmo('${im.Code_IM}')">
        <strong>${im.Libelle}</strong>${fdsBtn}
        <button onclick="event.stopPropagation();ouvrirPhotos('${im.Code_IM}')" style="font-size:11px;padding:2px 8px;background:#FFF8F0;color:var(--orange);border:1px solid var(--orange);border-radius:8px;cursor:pointer;margin-left:4px">🖼️</button><br>
        <span class="chantier-tag">${im.Code_IM}</span>
        ${im.Categorie ? `<small style="color:var(--grey)"> · ${im.Categorie}</small>` : ''}
        ${im.N_Serie ? `<br><small style="color:var(--grey)">N° série : ${im.N_Serie}</small>` : ''}
      </div>`;
    }).join('');
  }

  if (empMatch.length) {
    html += `<h3 style="color:var(--blue);font-size:12px;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.5px">Employés (${empMatch.length})</h3>`;
    html += empMatch.map(e => `<div class="suggestion-item" onclick="voirDetailEmploye('${e.Code}','${e.Nom.replace(/'/g,"\\'")}')"><strong>${e.Nom}</strong> <span class="chantier-tag">${e.Code}</span></div>`).join('');
  }

  if (!html) html = `<p class="empty-msg">Aucun résultat pour "${q || cat}".</p>`;
  div.innerHTML = html;
}

function scannerPourRecherche() {
  showScreen('screen-scan-recherche');
  startScanner('scanner-recherche', code => {
    stopScanner(); vib(150);
    document.getElementById('rech-input').value = code;
    showScreen('screen-rechercher');
    if (code.startsWith('IM')) voirDetailImmo(code);
    else rechercheAuto();
  });
}

async function voirDetailImmo(codeIM) {
  const div = document.getElementById('rech-resultats');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const r = await fetch(CONFIG.proxy + '?immo=' + encodeURIComponent(codeIM));
    const hist = await r.json();
    const dernier = hist[0] || null;
    const estDepot = !dernier || dernier.type_mouvement === 'Retour' || dernier.code_chantier === 'DEPOT';
    const locStyle = estDepot ? 'background:#E8F5E9;color:#1B5E20' : 'background:#FFF3E0;color:#E65100';
    const locTxt   = estDepot ? '🏭 Au dépôt' : `👤 Avec ${dernier.nom_employe} depuis ${fmt(dernier.horodatage)}`;
    const u = fdsUrl(codeIM);
    let html = `<div class="materiel-card" style="border-left-color:var(--orange)">
      <strong style="font-size:16px;color:var(--blue)">${lib(codeIM)}</strong><br>
      <span class="chantier-tag">${codeIM}</span>
      ${cat(codeIM) ? `<small style="color:var(--grey)"> · ${cat(codeIM)}</small>` : ''}<br>
      <div class="localisation-badge" style="${locStyle};margin:8px 0">${locTxt}</div>
      <div id="fiche-act-immo-${codeIM}" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px"></div>
    </div>
    <h3 style="color:var(--blue);font-size:13px;margin:8px 0 4px">Historique (${hist.length})</h3>`;
    if (!hist.length) html += '<p class="empty-msg">Aucun mouvement.</p>';
    else html += hist.map(m => {
      const donneur = m.type_mouvement === 'Transfert' && m.code_chantier?.includes('|') ? ' <small style="color:var(--grey)">de ' + m.code_chantier.split('|')[1] + '</small>' : '';
      return `<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px">
        ${m.type_mouvement === 'Retour' ? '📥' : '🔄'} <strong>${m.type_mouvement}</strong>${donneur}
        ${ebadge(m.etat)}<br>
        <small style="color:var(--grey)">👷 ${m.nom_employe} — ${fmtDT(m.horodatage)}</small>
        ${m.note ? `<br><small style="color:var(--orange)">📝 ${m.note}</small>` : ''}
      </div>`;
    }).join('');
    div.innerHTML = html;
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur.</p>'; }
}

async function voirDetailEmploye(code, nom) {
  const div = document.getElementById('rech-resultats');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const r = await fetch(CONFIG.proxy + '?employe=' + encodeURIComponent(code));
    const d = await r.json();
    const actuel = d.actuel || [], hist = d.historique || [];
    let html = `<div class="materiel-card" style="border-left-color:var(--blue)">
      <strong style="font-size:16px;color:var(--blue)">${nom}</strong> <span class="chantier-tag">${code}</span><br>
      <small style="color:var(--grey)">${actuel.length} immo(s) en possession · ${hist.length} mouvements au total</small>
    </div>
    <h3 style="color:var(--blue);font-size:13px;margin:8px 0 4px">En sa possession (${actuel.length})</h3>`;
    if (!actuel.length) html += '<p class="empty-msg">Aucun matériel.</p>';
    else html += actuel.map(m => `<div class="materiel-card"><strong>${lib(m.code_im)}</strong> <span class="chantier-tag" onclick="voirDetailImmo('${m.code_im}')" style="cursor:pointer">${m.code_im}</span> ${ebadge(m.etat)}<br><small style="color:var(--grey)">${fmt(m.horodatage)}</small></div>`).join('');
    div.innerHTML = html;
    // Attacher handlers (boutons admin : FDS, photos, panne, vol)
    const actDiv2 = document.getElementById('fiche-act-immo-' + codeIM);
    if (actDiv2) {
      const u = fdsUrl(codeIM);
      if (u) { const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.style.cssText = 'padding:7px 14px;background:#E3F2FD;color:#0D47A1;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none'; a.textContent = '📄 FDS'; actDiv2.appendChild(a); }
      const bPh = document.createElement('button'); bPh.style.cssText = 'padding:7px 14px;background:#FFF8F0;color:var(--orange);border:2px solid var(--orange);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer'; bPh.textContent = '🖼️ Photos'; (function(_c){ bPh.onclick = function(){ ouvrirPhotos(_c); }; })(codeIM); actDiv2.appendChild(bPh);
      const isAdminLocal2 = S.employe && CONFIG.admins.includes(S.employe.code);
      if (isAdminLocal2) {
        // Panne
        const estEnPannePWA = hist.length > 0 && hist.some(function(m, i) { if(m.type_mouvement !== 'Panne') return false; for(let j = 0; j < i; j++){ if(hist[j].type_mouvement === 'Réparation' && new Date(hist[j].horodatage) > new Date(m.horodatage)) return false; } return true; });
        const bPa = document.createElement('button'); bPa.style.cssText = 'padding:7px 14px;background:#FFF3E0;color:#E65100;border:2px solid #E65100;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer'; bPa.textContent = estEnPannePWA ? '✅ Panne résolue' : '📢 Signaler panne'; (function(_c, _ep){ bPa.onclick = function(){ if(_ep) resoudrePannePWA(_c); else signalerPannePWA(_c); }; })(codeIM, estEnPannePWA); actDiv2.appendChild(bPa);
        // Vol / Disparu
        const bVol = document.createElement('button'); bVol.style.cssText = 'padding:7px 14px;background:#4A148C;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer'; bVol.textContent = '🚨 Volé / Disparu'; (function(_c){ bVol.onclick = function(){ declarerVolPWA(_c); }; })(codeIM); actDiv2.appendChild(bVol);
        // HS définitif / Perdu
        const bHS = document.createElement('button'); bHS.style.cssText = 'padding:7px 14px;background:#424242;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer'; bHS.textContent = '⚫ HS définitif'; (function(_c){ bHS.onclick = function(){ marquerImmoHSPWA(_c); }; })(codeIM); actDiv2.appendChild(bHS);
      }
    }
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur.</p>'; }
}

// ── Photos ────────────────────────────────────────────────
function ouvrirPhotos(codeIM) {
  S.photoImmo = codeIM;
  document.getElementById('photos-immo-titre').textContent = lib(codeIM) + ' (' + codeIM + ')';
  const isAdmin = S.employe && CONFIG.admins.includes(S.employe.code);
  document.getElementById('upload-zone')?.classList.toggle('hidden', !isAdmin);
  showScreen('screen-photos');
  chargerPhotos(codeIM);
}

async function chargerPhotos(codeIM) {
  const div = document.getElementById('galerie-photos');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const r = await fetch(CONFIG.proxy + '?photos=' + encodeURIComponent(codeIM));
    const photos = await r.json();
    if (!photos.length) { div.innerHTML = '<p class="empty-msg">Aucune photo.</p>'; return; }
    const isAdmin = S.employe && CONFIG.admins.includes(S.employe.code);
    div.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%">' + photos.map(p => `
      <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
        <img src="${p.url}" style="width:100%;height:160px;object-fit:cover;cursor:pointer;display:block" loading="lazy" onclick="agrandirPhoto(this.src)">
        <p style="font-size:11px;color:var(--grey);padding:4px 8px;margin:0">${fmt(p.created)}</p>
        ${isAdmin ? `<button onclick="supprimerPhoto('${p.name}')" style="width:100%;padding:6px;background:#FDECEA;border:none;color:var(--red);font-size:12px;cursor:pointer">🗑️ Supprimer</button>` : ''}
      </div>`).join('') + '</div>';
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur.</p>'; }
}

async function uploadPhoto(input) {
  if (!input.files?.[0]) return;
  const prog = document.getElementById('upload-progress');
  if (prog) prog.textContent = '⏳ Compression...';
  previewPhoto(input, '__dummy', '__dummy');
  const reader = new FileReader();
  reader.onload = async e => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const ratio  = Math.min(1200 / img.width, 1200 / img.height, 1);
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', 0.75);
      const now = new Date();
      const fn  = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${now.getHours()}${now.getMinutes()}${now.getSeconds()}.jpg`;
      if (prog) prog.textContent = '⬆️ Upload en cours...';
      try {
        const r = await fetch(CONFIG.proxy + '?action=upload_photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code_im: S.photoImmo, data: b64, filename: fn }) });
        const d = await r.json();
        if (d.success) { if (prog) prog.textContent = '✅ Ajoutée !'; input.value = ''; setTimeout(() => { if (prog) prog.textContent = ''; chargerPhotos(S.photoImmo); }, 1000); }
        else if (prog) prog.textContent = '❌ Échec.';
      } catch (e) { if (prog) prog.textContent = '❌ Erreur réseau.'; }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}

function agrandirPhoto(url) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
  ov.onclick = () => document.body.removeChild(ov);
  const img = document.createElement('img');
  img.src = url; img.style.cssText = 'max-width:95vw;max-height:90vh;border-radius:8px;object-fit:contain';
  ov.appendChild(img); document.body.appendChild(ov);
}

async function supprimerPhoto(filename) {
  if (!confirm('Supprimer cette photo ?')) return;
  await fetch(CONFIG.proxy + '?action=delete_photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code_im: S.photoImmo, filename }) });
  chargerPhotos(S.photoImmo);
}

// ── Force attribution ─────────────────────────────────────
let forceImmoCode = null;

function rechercherImmoPourForce() {
  const cat  = document.getElementById('force-cat')?.value || '';
  const q    = document.getElementById('force-immo-search')?.value || '';
  const div  = document.getElementById('force-suggestions');
  const info = document.getElementById('force-immo-info');
  const res  = immosFilt(cat, q).slice(0, 8);
  if (res.length === 1) { forceImmoCode = res[0].Code_IM; if (info) info.textContent = '✅ ' + res[0].Libelle + ' (' + res[0].Code_IM + ')'; if (div) div.innerHTML = ''; return; }
  forceImmoCode = null;
  if (info) info.textContent = res.length > 1 ? res.length + ' résultats — affinez la recherche' : '';
  if (!div) return;
  div.innerHTML = (!q && !cat) ? '' : res.length === 0 ? '<p class="empty-msg">Aucune immo.</p>' :
    res.map(im => `<div class="suggestion-item" onclick="selForceImmo('${im.Code_IM}','${(im.Libelle||'').replace(/'/g,"\\'")}')"><strong>${im.Libelle}</strong> <span class="chantier-tag">${im.Code_IM}</span></div>`).join('');
}

function selForceImmo(code, libelle) {
  forceImmoCode = code;
  const fi = document.getElementById('force-immo-search');
  const inf = document.getElementById('force-immo-info');
  const div = document.getElementById('force-suggestions');
  if (fi) fi.value = libelle;
  if (inf) inf.textContent = '✅ ' + libelle + ' (' + code + ')';
  if (div) div.innerHTML = '';
}

function scannerPourForce() {
  showScreen('screen-scan-force');
  startScanner('scanner-force', code => {
    if (!code.startsWith('IM')) { toast('Ce n\'est pas une immo', 'error'); return; }
    stopScanner(); vib(150);
    selForceImmo(code, lib(code));
    showScreen('screen-force-attribution');
  });
}

async function validerForceAttribution() {
  if (!forceImmoCode) { toast('Sélectionne une immo', 'error'); return; }
  const sel = document.getElementById('force-receveur');
  if (!sel?.value) { toast('Sélectionne un employé', 'error'); return; }
  const codeRec = sel.value;
  const nomRec  = sel.options[sel.selectedIndex]?.textContent.split(' (')[0] || codeRec;
  const etat    = document.getElementById('force-etat')?.value || 'Bon état';
  const note    = document.getElementById('force-note')?.value.trim() || '';
  if (!confirm(`Attribuer ${lib(forceImmoCode)} à ${nomRec} sans validation ?`)) return;
  try {
    const m = { code_im: forceImmoCode, code_employe: codeRec, nom_employe: nomRec, type_mouvement: 'Transfert', code_chantier: S.employe.code + '|' + S.employe.nom, etat, note: (note ? note + ' — ' : '') + '[Attribution forcée par ' + S.employe.nom + ']', horodatage: new Date().toISOString() };
    const r = await fetch(CONFIG.proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) });
    const d = await r.json();
    if (d.success !== false) { showRecap('⚡ Attribution forcée', { ...m, nom_employe: nomRec }, null); forceImmoCode = null; rafraichirBadges(); }
    else toast('Erreur lors de l\'attribution', 'error');
  } catch (e) { toast('Erreur réseau', 'error'); }
}

// ── Réservations ──────────────────────────────────────────
function initReservationScreen(pourQuelquunDautre) {
  S.resaImmoCode = null; S.resaImmoLibelle = null;
  const elInfo = document.getElementById('resa-immo-info');
  if (elInfo) elInfo.textContent = '';
  const elSearch = document.getElementById('resa-immo-search');
  if (elSearch) elSearch.value = '';
  const elSugg = document.getElementById('resa-immo-suggestions');
  if (elSugg) elSugg.innerHTML = '';
  document.getElementById('resa-date-debut').value = '';
  document.getElementById('resa-date-fin').value = '';
  document.getElementById('resa-chantier').value = '';
  document.getElementById('resa-note').value = '';
  const isAdmin = S.employe && CONFIG.admins.includes(S.employe.code);
  const sectionPourQui = document.getElementById('resa-pour-qui-section');
  if (sectionPourQui) sectionPourQui.classList.toggle('hidden', !isAdmin);
  buildCatSelect('resa-categorie', rechercherImmoResa);
  showScreen('screen-reserver');
}

function rechercherImmoResa() {
  const cat  = document.getElementById('resa-categorie')?.value || '';
  const q    = document.getElementById('resa-immo-search')?.value || '';
  const div  = document.getElementById('resa-immo-suggestions');
  if (!div) return;
  if (!q && !cat) { div.innerHTML = ''; return; }
  const res = immosFilt(cat, q).slice(0, 8);
  div.innerHTML = res.length === 0 ? '<p class="empty-msg">Aucune immo.</p>' :
    res.map(im => `<div class="suggestion-item" onclick="selImmoResa('${im.Code_IM}','${(im.Libelle||'').replace(/'/g,"\\'")}')"><strong>${im.Libelle}</strong> <span class="chantier-tag">${im.Code_IM}</span>${im.Categorie ? `<small style="color:var(--grey)"> · ${im.Categorie}</small>` : ''}</div>`).join('');
}

function selImmoResa(code, libelle) {
  S.resaImmoCode = code; S.resaImmoLibelle = libelle;
  const el = document.getElementById('resa-immo-info');
  if (el) el.textContent = '✅ ' + libelle + ' (' + code + ')';
  const inp = document.getElementById('resa-immo-search');
  if (inp) inp.value = libelle;
  const div = document.getElementById('resa-immo-suggestions');
  if (div) div.innerHTML = '';
}

function scannerPourResa() {
  showScreen('screen-scan-resa');
  startScanner('scanner-resa', code => {
    if (!code.startsWith('IM')) { toast('Ce n\'est pas une immo', 'error'); return; }
    stopScanner(); vib(200);
    // Passer skipInit=true pour ne pas effacer les données
    showScreen('screen-reserver', true);
    selImmoResa(code, lib(code));
    toast('📦 ' + lib(code) + ' sélectionné', 'success', 2000);
  });
}

async function soumettreReservation() {
  if (!S.resaImmoCode) { toast('Sélectionne une immo', 'error'); return; }
  const debut = document.getElementById('resa-date-debut').value;
  const fin   = document.getElementById('resa-date-fin').value;
  if (!debut || !fin) { toast('Indique les dates', 'error'); return; }
  if (new Date(fin) <= new Date(debut)) { toast('La date de retour doit être après le départ', 'error'); return; }
  // Vérifier conflits
  try {
    const r = await fetch(CONFIG.proxy + '?reservations=1');
    const resas = await r.json();
    const conflits = resas.filter(r => r.code_im === S.resaImmoCode && r.statut !== 'Annulee' && r.statut !== 'Rendue' && !(new Date(fin) < new Date(r.date_debut) || new Date(debut) > new Date(r.date_fin)));
    if (conflits.length > 0) {
      const msg = conflits.map(c => `${c.nom_employe} (${fmt(c.date_debut)} → ${fmt(c.date_fin)})`).join(' | ');
      if (!confirm(`Cette immo est déjà réservée : ${msg}. Envoyer quand même ?`)) return;
    }
  } catch (e) {}

  const selPQ = document.getElementById('resa-pour-qui');
  const pourQCode = selPQ?.value || '';
  const pourQNom  = pourQCode ? (selPQ?.options[selPQ.selectedIndex]?.textContent.split(' (')[0] || pourQCode) : '';
  const codeEmp = pourQCode || S.employe.code;
  const nomEmp  = pourQNom  || S.employe.nom;

  try {
    const r = await fetch(CONFIG.proxy + '?action=reserver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      code_im: S.resaImmoCode, code_employe: codeEmp, nom_employe: nomEmp,
      code_chantier: document.getElementById('resa-chantier').value,
      nom_chantier:  document.getElementById('resa-chantier').value,
      date_debut: new Date(debut).toISOString(), date_fin: new Date(fin).toISOString(),
      note: document.getElementById('resa-note').value,
    }) });
    const d = await r.json();
    if (d.success) {
      vib(300); toast('✅ Demande de réservation envoyée !', 'success', 3500);
      document.getElementById('recap').innerHTML = `<strong>✅ Demande envoyée !</strong><br><strong>Immo :</strong> ${S.resaImmoLibelle}<br>${pourQNom ? `<strong>Pour :</strong> ${pourQNom}<br>` : ''}<strong>Du :</strong> ${fmt(debut)}<br><strong>Au :</strong> ${fmt(fin)}<br><em style="color:var(--grey)">En attente de confirmation logistique</em>`;
      document.getElementById('alerte-degradation')?.classList.add('hidden');
      showScreen('screen-confirmation');
      majBadgeResas();
    } else toast('Erreur lors de la réservation', 'error');
  } catch (e) { toast('Erreur réseau', 'error'); }
}

async function afficherMesReservations() {
  if (!S.employe) { showScreen('screen-activation'); return; }
  if (CONFIG.admins.includes(S.employe.code)) {
    await afficherReservationsAdmin();
    return;
  }
  if (!S.employe) { showScreen('screen-activation'); return; }
  const div = document.getElementById('mes-resa-liste');
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const r = await fetch(CONFIG.proxy + '?mes_reservations=' + S.employe.code);
    const resas = await r.json();
    if (!resas.length) { div.innerHTML = '<p class="empty-msg">Aucune réservation.</p>'; return; }
    const actives  = resas.filter(r => r.statut !== 'Rendue' && r.statut !== 'Annulee');
    const terminees= resas.filter(r => r.statut === 'Rendue' || r.statut === 'Annulee');
    const retards  = actives.filter(r => r.statut === 'En retard');
    let html = '';
    if (retards.length) html += `<div style="background:#FFEBEE;border-radius:10px;padding:12px;margin-bottom:8px;border-left:4px solid var(--red)"><strong style="color:var(--red)">⚠️ ${retards.length} retard(s) — retourne le matériel au dépôt</strong></div>`;
    const carte = r => {
      const c = SCOL[r.statut] || '#999';
      const canEdit = r.statut === 'Demandee' || r.statut === 'Confirmee' || r.statut === 'En cours' || r.statut === 'En retard';
      return `<div class="materiel-card" style="border-left-color:${c}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <strong style="color:var(--blue)">${lib(r.code_im) || '—'}</strong>
          ${rsLabel(r.statut)}
        </div>
        ${r.code_im ? `<span class="chantier-tag">${r.code_im}</span><br>` : ''}
        <div style="font-size:13px;margin-top:4px">📅 ${fmt(r.date_debut)} → ${fmt(r.date_fin)}</div>
        ${r.nom_chantier ? `<div style="font-size:12px;color:var(--grey)">🏗️ ${r.nom_chantier}</div>` : ''}
        ${r.note ? `<div style="font-size:12px;color:var(--grey)">📝 ${r.note}</div>` : ''}
        ${r.statut === 'Contre-proposition' ? `<div style="background:#EDE7F6;border-radius:8px;padding:8px;margin-top:6px;font-size:12px;color:#4527A0"><strong>✏️ Proposition de la logistique :</strong> voir les nouvelles dates ci-dessus<br><div style="display:flex;gap:8px;margin-top:6px"><button onclick="accepterContreProp('${r.id}')" style="flex:1;padding:7px;background:#27AE60;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px">✅ Accepter</button><button onclick="annulerResa('${r.id}')" style="flex:1;padding:7px;background:#FFEBEE;color:var(--red);border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px">❌ Refuser</button></div></div>` : ''}
        ${canEdit && r.statut !== 'Contre-proposition' ? `<div style="display:flex;gap:8px;margin-top:8px">
          <button onclick="ouvrirModifResa('${r.id}')" style="flex:1;padding:8px;background:#E3F2FD;color:#0D47A1;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px">✏️ Modifier</button>
          <button onclick="annulerResa('${r.id}')" style="flex:1;padding:8px;background:#FFEBEE;color:var(--red);border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px">❌ Annuler</button>
        </div>` : ''}
      </div>`;
    };
    if (actives.length) html += `<h3 style="color:var(--blue);font-size:14px;margin:8px 0 6px">En cours (${actives.length})</h3>` + actives.map(carte).join('');
    if (terminees.length) html += `<h3 style="color:var(--grey);font-size:13px;margin:12px 0 6px">Terminées (${terminees.length})</h3>` + terminees.map(carte).join('');
    div.innerHTML = html;
  } catch (e) { div.innerHTML = '<p class="empty-msg">Erreur : ' + e.message + '</p>'; }
}

async function accepterContreProp(id) {
  if (!confirm('Accepter la proposition de la logistique ?')) return;
  try {
    await fetch(CONFIG.proxy + '?action=statut_resa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, statut: 'Confirmee' }),
    });
    toast('✅ Proposition acceptée — réservation confirmée', 'success', 3000);
    afficherMesReservations();
    majBadgeResas();
  } catch (e) { toast('Erreur', 'error'); }
}

async function annulerResa(id) {
  if (!confirm('Annuler cette réservation ?')) return;
  await fetch(CONFIG.proxy + '?action=statut_resa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, statut: 'Annulee' }) });
  toast('Réservation annulée', 'success');
  afficherMesReservations(); majBadgeResas();
}

let resaEnCoursId = null;
async function ouvrirModifResa(id) {
  resaEnCoursId = id;
  try {
    const r = await fetch(CONFIG.proxy + '?mes_reservations=' + S.employe.code);
    const resas = await r.json();
    const resa = resas.find(r => r.id === id);
    if (!resa) { toast('Réservation introuvable', 'error'); return; }
    document.getElementById('modif-resa-info').textContent = lib(resa.code_im) + ' (' + resa.code_im + ')';
    if (resa.date_debut) document.getElementById('modif-date-debut').value = resa.date_debut.slice(0, 10);
    if (resa.date_fin)   document.getElementById('modif-date-fin').value   = resa.date_fin.slice(0, 10);
    document.getElementById('modif-chantier').value = resa.nom_chantier || '';
    document.getElementById('modif-note').value     = resa.note || '';
    showScreen('screen-modifier-resa');
  } catch (e) { toast('Erreur', 'error'); }
}

async function validerModifResa() {
  if (!resaEnCoursId) return;
  const debut = document.getElementById('modif-date-debut').value;
  const fin   = document.getElementById('modif-date-fin').value;
  if (!debut || !fin) { toast('Indique les dates', 'error'); return; }
  try {
    await fetch(CONFIG.proxy + '?action=modifier_resa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: resaEnCoursId, date_debut: new Date(debut).toISOString(), date_fin: new Date(fin).toISOString(), nom_chantier: document.getElementById('modif-chantier').value, note: document.getElementById('modif-note').value }) });
    toast('Réservation modifiée', 'success');
    resaEnCoursId = null;
    showScreen('screen-mes-reservations');
  } catch (e) { toast('Erreur', 'error'); }
}

// ── Scanner pour déclarer une panne (admin) ─────────────────────────────
function scannerPourPanne() {
  showScreen('screen-scan-immo', true);
  document.getElementById('titre-mouvement').textContent = '📢 Scanner pour déclarer une panne';
  document.getElementById('immo-result')?.classList.add('hidden');
  startScanner('scanner-immo', function(code) {
    if (!code.startsWith('IM')) { return; }
    stopScanner(); vib(200);
    showScreen('screen-accueil');
    signalerPannePWA(code);
  });
}

// ── Résoudre une panne depuis la PWA (admin) ─────────────────────────────
async function resoudrePannePWA(codeIM) {
  const libIM = lib(codeIM);
  const note = prompt('Résolution panne ' + libIM + ' — Décrivez la réparation (obligatoire) :');
  if (!note || note.trim().length < 10) { toast('Note obligatoire (10 car. min.)', 'error'); return; }
  const prest = prompt('Prestataire SAV (optionnel) :') || '';
  const cout  = prompt('Coût réel de réparation en € (optionnel) :') || '';
  if (!confirm('Confirmer le retour de ' + codeIM + ' dans le parc ?')) return;
  try {
    const r = await fetch(CONFIG.proxy + '?action=resoudre_panne', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_im: codeIM, etat_resolution: 'Bon état', prestataire: prest, cout_reel: cout, note, par_code: S.employe.code, par_nom: S.employe.nom }),
    });
    const d = await r.json();
    if (d.success !== false) {
      vib(300);
      document.getElementById('recap').innerHTML = '<strong>✅ Panne résolue !</strong><br><strong>Immo :</strong> ' + libIM + '<br><strong>Note :</strong> ' + note + '<br>' + (prest ? '<strong>Prestataire :</strong> ' + prest + '<br>' : '') + (cout ? '<strong>Coût :</strong> ' + cout + '€<br>' : '') + '<em style="color:var(--grey)">Immo de retour dans le parc.</em>';
      document.getElementById('alerte-degradation')?.classList.add('hidden');
      showScreen('screen-confirmation');
    } else { toast('Erreur lors de la résolution', 'error'); }
  } catch (e) { toast('Erreur réseau', 'error'); }
}

// ── Déclarer vol / disparition depuis PWA (admin) ─────────────────────────
async function declarerVolPWA(codeIM) {
  const libIM = lib(codeIM);
  const type = confirm('Cliquez OK pour "Volé", Annuler pour "Disparu"') ? 'Volé' : 'Disparu';
  const motif = prompt('Motif obligatoire pour [' + type + '] ' + codeIM + ' (min 10 car.) :');
  if (!motif || motif.trim().length < 10) { toast('Motif obligatoire', 'error'); return; }
  if (!confirm('1ère CONFIRMATION : ' + codeIM + ' sera déclaré [' + type + '] et retiré du parc.')) return;
  if (!confirm('CONFIRMATION FINALE IRRÉVERSIBLE : Confirmer [' + type + '] pour ' + codeIM + ' ?')) return;
  try {
    const r = await fetch(CONFIG.proxy + '?action=declarer_vol', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_im: codeIM, type_vol: type, motif, par_code: S.employe.code, par_nom: S.employe.nom }),
    });
    const d = await r.json();
    if (d.success !== false) {
      vib(300); toast('✅ ' + codeIM + ' déclaré ' + type, 'success', 4000);
      showScreen('screen-accueil');
    } else { toast('Erreur', 'error'); }
  } catch (e) { toast('Erreur réseau', 'error'); }
}

// ── Déclarer une panne depuis la PWA ────────────────────────────────────
async function signalerPannePWA(codeIM) {
  const libIM = lib(codeIM);
  const motif = prompt('Signaler une panne sur ' + libIM + ' (' + codeIM + ')\nDécrivez brièvement le problème (obligatoire, 5 car. min.) :');
  if (!motif || motif.trim().length < 5) {
    toast('Motif obligatoire pour signaler une panne', 'error');
    return;
  }
  try {
    const r = await fetch(CONFIG.proxy + '?action=declarer_panne', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code_im: codeIM,
        code_employe: S.employe.code,
        nom_employe: S.employe.nom,
        motif: motif.trim() + ' [signalé par ' + S.employe.nom + ']',
      }),
    });
    const d = await r.json();
    if (d.success !== false) {
      vib(300);
      toast('📢 Panne signalée — la logistique est notifiée', 'success', 4000);
      // Afficher un écran de confirmation
      document.getElementById('recap').innerHTML =
        '<strong>📢 Panne signalée</strong><br>' +
        '<strong>Immo :</strong> ' + libIM + ' (' + codeIM + ')<br>' +
        '<strong>Signalé par :</strong> ' + S.employe.nom + '<br>' +
        '<strong>Motif :</strong> ' + motif + '<br>' +
        '<em style="color:var(--grey)">La logistique va être contactée pour intervention.</em>';
      document.getElementById('alerte-degradation')?.classList.add('hidden');
      showScreen('screen-confirmation');
      rafraichirBadges();
    } else {
      toast('Erreur lors du signalement', 'error');
    }
  } catch (e) { toast('Erreur réseau : ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// VUE RÉSERVATIONS POUR CONI / ADMIN
// ══════════════════════════════════════════════════════════

async function afficherReservationsAdmin() {
  const div = document.getElementById('mes-resa-liste');
  // Changer le titre
  const h2 = document.querySelector('#screen-mes-reservations h2');
  if (h2) h2.textContent = '📋 Réservations en cours';
  div.innerHTML = '<p class="empty-msg">Chargement...</p>';
  try {
    const r = await fetch(CONFIG.proxy + '?reservations=1');
    const resas = await r.json();
    const actives = resas.filter(r => r.statut !== 'Rendue' && r.statut !== 'Annulee');
    actives.sort((a, b) => {
      const order = { 'En retard': 0, 'Demandee': 1, 'Contre-proposition': 2, 'Confirmee': 3, 'En cours': 4 };
      return (order[a.statut] || 9) - (order[b.statut] || 9);
    });
    if (!actives.length) { div.innerHTML = '<p class="empty-msg">Aucune réservation en cours.</p>'; return; }
    // Compteurs par statut
    const counts = {};
    actives.forEach(r => { counts[r.statut] = (counts[r.statut] || 0) + 1; });
    let html = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">';
    Object.keys(counts).forEach(s => {
      const c = STATUT_COLORS[s] || { bg: '#F5F5F5', color: '#999', label: s };
      html += `<span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${c.bg};color:${c.color}">${c.label} · ${counts[s]}</span>`;
    });
    html += '</div>';
    html += actives.map(r => {
      const l = lib(r.code_im) || '—';
      const s = STATUT_COLORS[r.statut] || { bg: '#F5F5F5', color: '#999', label: r.statut };
      const dDebut = r.date_debut ? fmtDate(r.date_debut) : '—';
      const dFin   = r.date_fin   ? fmtDate(r.date_fin)   : '—';
      return `<div class="materiel-card" style="border-left:4px solid ${s.color}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <div><strong style="color:var(--blue)">${r.nom_employe}</strong> <small style="color:var(--grey)">${r.code_employe}</small></div>
          <span style="padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;background:${s.bg};color:${s.color}">${s.label}</span>
        </div>
        <strong>${l}</strong> <span style="font-size:11px;color:#999;font-family:monospace">${r.code_im}</span>
        <div style="font-size:13px;margin-top:4px">📅 ${dDebut} → ${dFin}</div>
        ${r.nom_chantier ? `<div style="font-size:12px;color:var(--grey)">🏗️ ${r.nom_chantier}</div>` : ''}
        ${r.note ? `<div style="font-size:12px;color:var(--orange)">📝 ${r.note}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          ${r.statut === 'Demandee' ? `<button onclick="actionResaPWA('${r.id}','Confirmee','${r.nom_employe.replace(/'/g,"\\'")}','${r.code_im}')" style="flex:1;padding:8px;background:#E8F5E9;color:#1B5E20;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px">✅ Confirmer</button>` : ''}
          <button onclick="proposerModifPWA('${r.id}','${r.code_im}','${r.nom_employe.replace(/'/g,"\\'")}','${r.date_debut ? r.date_debut.slice(0,10) : ''}','${r.date_fin ? r.date_fin.slice(0,10) : ''}')" style="flex:1;padding:8px;background:#E3F2FD;color:#0D47A1;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px">✏️ Modifier</button>
          <button onclick="actionResaPWA('${r.id}','Annulee','${r.nom_employe.replace(/'/g,"\\'")}','${r.code_im}')" style="flex:1;padding:8px;background:#FFEBEE;color:var(--red);border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px">❌ Annuler</button>
        </div>
      </div>`;
    }).join('');
    div.innerHTML = html;
  } catch (e) {
    div.innerHTML = `<p class="empty-msg">Erreur : ${e.message}</p>`;
  }
}

async function actionResaPWA(id, statut, nomEmp, codeIM) {
  const action = statut === 'Confirmee' ? 'Confirmer' : 'Annuler';
  if (!confirm(`${action} la réservation de ${nomEmp} pour ${lib(codeIM)} ?`)) return;
  try {
    await fetch(CONFIG.proxy + '?action=statut_resa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, statut }),
    });
    toast(action === 'Confirmer' ? '✅ Réservation confirmée' : '❌ Réservation annulée', 'success');
    afficherReservationsAdmin();
  } catch (e) { toast('Erreur', 'error'); }
}

function proposerModifPWA(id, codeIM, nomEmp, dateDebut, dateFin) {
  S.resaEnCoursId = id;
  document.getElementById('modif-resa-info').textContent = `${lib(codeIM)} — demande de ${nomEmp}`;
  if (dateDebut) document.getElementById('modif-date-debut').value = dateDebut;
  if (dateFin)   document.getElementById('modif-date-fin').value   = dateFin;
  document.getElementById('modif-chantier').value = '';
  document.getElementById('modif-note').value = '';
  showScreen('screen-modifier-resa');
}

// Remplacer validerModifResa pour supporter la contre-proposition admin
const _origValiderModif = validerModifResa;
validerModifResa = async function() {
  if (!S.resaEnCoursId) return;
  const debut = document.getElementById('modif-date-debut').value;
  const fin   = document.getElementById('modif-date-fin').value;
  const note  = document.getElementById('modif-note').value;
  if (!debut || !fin) { toast('Indique les dates', 'error'); return; }
  const isAdmin = S.employe && CONFIG.admins.includes(S.employe.code);
  const noteComplete = isAdmin
    ? (note ? `[Modification par ${S.employe.nom} : ${note}]` : `[Dates modifiées par ${S.employe.nom}]`)
    : note;
  const statut = isAdmin ? 'Contre-proposition' : undefined;
  try {
    const body = { id: S.resaEnCoursId, date_debut: new Date(debut).toISOString(), date_fin: new Date(fin).toISOString(), nom_chantier: document.getElementById('modif-chantier').value, note: noteComplete };
    if (statut) body.statut = statut;
    await fetch(CONFIG.proxy + '?action=modifier_resa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    toast(isAdmin ? '✏️ Contre-proposition envoyée' : '✅ Réservation modifiée', 'success');
    S.resaEnCoursId = null;
    showScreen('screen-mes-reservations');
  } catch (e) { toast('Erreur', 'error'); }
};

// Couleurs pour les statuts (utilisé dans afficherReservationsAdmin)
const STATUT_COLORS = {
  'Demandee':           { bg: '#FFF8E1', color: '#E65100', label: '⏳ En attente' },
  'Confirmee':          { bg: '#E8F5E9', color: '#1B5E20', label: '✅ Confirmée' },
  'En cours':           { bg: '#E3F2FD', color: '#0D47A1', label: '🔄 En cours' },
  'Rendue':             { bg: '#F5F5F5', color: '#757575', label: '📦 Rendue' },
  'En retard':          { bg: '#FFEBEE', color: '#B71C1C', label: '⚠️ En retard' },
  'Annulee':            { bg: '#F5F5F5', color: '#9E9E9E', label: '❌ Annulée' },
  'Contre-proposition': { bg: '#EDE7F6', color: '#4527A0', label: '✏️ Contre-proposition' },
};

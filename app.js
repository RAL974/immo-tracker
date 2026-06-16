// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  clientId: '3a901471-86c0-4fc7-8d37-319ead2c4b88',
  tenantId: 'c7875e38-b2b0-4c10-a8c5-687c5a214e44',
  sharepointSite: 'https://espacesoleil97.sharepoint.com/sites/Logistique-Immos',
  admins: ['HEGE', 'CONI'],
};

// ── État de l'application ───────────────────────────────────────
let state = {
  employe: null,
  typeMouvement: null,
  codeIM: null,
  scanner: null,
  msalInstance: null,
  msalAccount: null,
  mouvements: JSON.parse(localStorage.getItem('mouvements') || '[]'),
};

// ── Initialisation MSAL (non bloquante) ────────────────────────
async function initMsal() {
  try {
    const msalConfig = {
      auth: {
        clientId: CONFIG.clientId,
        authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: 'localStorage' },
    };
    state.msalInstance = new msal.PublicClientApplication(msalConfig);
    await state.msalInstance.initialize();
    await state.msalInstance.handleRedirectPromise();
    const accounts = state.msalInstance.getAllAccounts();
    if (accounts.length > 0) state.msalAccount = accounts[0];
  } catch (e) {
    console.warn('MSAL init échouée, mode hors ligne:', e);
    state.msalInstance = null;
  }
}

// ── Initialisation principale ───────────────────────────────────
window.addEventListener('load', async () => {
  // Charger l'employé mémorisé
  const employe = localStorage.getItem('employe');
  if (employe) {
    state.employe = JSON.parse(employe);
    afficherEmploye();
  }

  // MSAL en arrière-plan — ne bloque pas l'app
  initMsal().then(() => chargerChantiers());
});

// ── Obtenir un token SharePoint ─────────────────────────────────
async function getToken() {
  if (!state.msalInstance) throw new Error('MSAL non initialisé');
  const scopes = [`${CONFIG.sharepointSite}/AllSites.Read`,
                  `${CONFIG.sharepointSite}/AllSites.Write`];
  const request = { scopes, account: state.msalAccount };
  try {
    const result = await state.msalInstance.acquireTokenSilent(request);
    state.msalAccount = result.account;
    return result.accessToken;
  } catch (e) {
    const result = await state.msalInstance.acquireTokenPopup(request);
    state.msalAccount = result.account;
    return result.accessToken;
  }
}

// ── Appels API SharePoint ───────────────────────────────────────
async function spGet(endpoint) {
  const token = await getToken();
  const res = await fetch(`${CONFIG.sharepointSite}/_api/${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
    }
  });
  if (!res.ok) throw new Error(`SP GET ${res.status}`);
  return res.json();
}

async function spPost(endpoint, body) {
  const token = await getToken();
  // Récupérer le digest
  const digestRes = await fetch(`${CONFIG.sharepointSite}/_api/contextinfo`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
    }
  });
  const digestData = await digestRes.json();
  const digest = digestData.FormDigestValue;

  const res = await fetch(`${CONFIG.sharepointSite}/_api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`SP POST ${res.status}`);
  return res.json();
}

// ── Navigation ──────────────────────────────────────────────────
function showScreen(id) {
  stopScanner();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'screen-mon-materiel') afficherMonMateriel();
  if (id === 'screen-admin') reinitAdmin();
}

// ── Affichage employé ───────────────────────────────────────────
function afficherEmploye() {
  const badge = document.getElementById('user-info');
  badge.textContent = '👷 ' + state.employe.nom;
  badge.classList.remove('hidden');
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
    document.getElementById('user-info').classList.add('hidden');
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

// ── Activation ──────────────────────────────────────────────────
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
  const select = document.getElementById('select-chantier');
  try {
    const data = await spGet("lists/getbytitle('Chantiers')/items?$select=Code_Chantier,Nom_Chantier,Sous_Chantier&$orderby=Nom_Chantier&$top=500");
    select.innerHTML = '<option value="">-- Sélectionne un chantier --</option>';
    data.value.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.Code_Chantier;
      opt.textContent = c.Sous_Chantier
        ? `${c.Nom_Chantier} — ${c.Sous_Chantier}`
        : c.Nom_Chantier;
      select.appendChild(opt);
    });
  } catch (e) {
    console.warn('Chantiers non chargés (hors ligne):', e);
    select.innerHTML = '<option value="DEPOT">Mode hors ligne — Dépôt uniquement</option>';
  }
}

// ── Confirmation mouvement ──────────────────────────────────────
async function confirmerMouvement() {
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

  document.getElementById('recap').innerHTML = `
    <strong>Immo :</strong> ${mouvement.code_im}<br>
    <strong>Employé :</strong> ${mouvement.nom_employe}<br>
    <strong>Type :</strong> ${mouvement.type_mouvement}<br>
    <strong>Chantier :</strong> ${mouvement.code_chantier}<br>
    <strong>Heure :</strong> ${new Date().toLocaleTimeString('fr-FR')}
  `;
  showScreen('screen-confirmation');

  // Écriture SharePoint en arrière-plan
  try {
    await spPost("lists/getbytitle('Mouvements')/items", {
      Code_IM: mouvement.code_im,
      Code_Employe: mouvement.code_employe,
      Type_Mouvement: mouvement.type_mouvement,
      Code_Chantier: mouvement.code_chantier,
    });
  } catch (e) {
    console.warn('Écriture SharePoint échouée, sauvegardé localement:', e);
  }
}

// ── Mon matériel ────────────────────────────────────────────────
function afficherMonMateriel() {
  if (!state.employe) { showScreen('screen-activation'); return; }
  document.getElementById('mon-materiel-user').textContent = '👷 ' + state.employe.nom;
  const stock = {};
  state.mouvements
    .filter(m => m.code_employe === state.employe.code)
    .forEach(m => {
      if (m.type_mouvement === 'Sortie' || m.type_mouvement === 'Transfert') {
        stock[m.code_im] = m;
      } else if (m.type_mouvement === 'Retour') {
        delete stock[m.code_im];
      }
    });
  const items = Object.values(stock);
  const liste = document.getElementById('liste-materiel');
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

// ── Démarrage scanner activation ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const screen = document.getElementById('screen-activation');
  if (screen) {
    const observer = new MutationObserver(() => {
      if (screen.classList.contains('active')) {
        startScanner('scanner-activation', onScanActivation);
      }
    });
    observer.observe(screen, { attributes: true });
  }
});

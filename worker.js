addEventListener('fetch', event => { event.respondWith(handleRequest(event.request)); });

// ── Fonctions pures de session (jeton HMAC-SHA256), hors de handleRequest ────────────────────
// Isolées en haut de fichier pour être testables indépendamment de la requête en cours
// (voir tests/worker.session.test.js). Comportement inchangé : handleRequest() délègue à ces
// fonctions en leur passant le secret lu à chaque requête (SESSION_SECRET_ENV), exactement
// comme avant ce réagencement — aucun changement de comportement, seulement d'organisation.
const GESTIONNAIRES = ['CONI', 'AIWI', 'NAXA', 'BAKA'];
const SESSION_DUREE_MS = 12 * 3600 * 1000; // 12h — une session dure une journée de travail large
function b64url(bytes) { return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(bytes)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlToBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function getSessionKeyFor(secret) {
  if (!secret) return null;
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSessionWith(code, role, secret, dureeMs) {
  const key = await getSessionKeyFor(secret);
  if (!key) return null;
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify({ code: code, role: role || '', exp: Date.now() + (dureeMs || SESSION_DUREE_MS) })));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return payloadB64 + '.' + b64url(sig);
}
async function verifySessionWith(token, secret) {
  if (!token || token.indexOf('.') === -1) return null;
  const key = await getSessionKeyFor(secret);
  if (!key) return null;
  const parts = token.split('.');
  let valid;
  try { valid = await crypto.subtle.verify('HMAC', key, b64urlToBytes(parts[1]), new TextEncoder().encode(parts[0])); } catch (e) { return null; }
  if (!valid) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))); } catch (e) { return null; }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload; // { code, role, exp }
}
function roleNorm(r) { return (r || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }
function estAdminSessionPure(session, gestionnaires) {
  if (!session) return false;
  if ((gestionnaires || GESTIONNAIRES).includes(session.code)) return true; // super-admins permanents (ex. AIWI), comme côté client
  return roleNorm(session.role) === 'admin';
}
function estGarantSessionPure(session, gestionnaires) {
  if (estAdminSessionPure(session, gestionnaires)) return true;
  const r = roleNorm(session.role);
  return r === 'logistique' || r === 'logistique_mayotte';
}
async function requireAdminWith(reqBody, secret, gestionnaires) {
  if (!secret) return { ok: false, error: 'session_secret_manquant' };
  const session = await verifySessionWith(reqBody.token, secret);
  if (!session) return { ok: false, error: 'session_invalide' };
  if (!estAdminSessionPure(session, gestionnaires)) return { ok: false, error: 'droits_insuffisants' };
  return { ok: true, session: session };
}
async function requireGarantWith(reqBody, secret, gestionnaires) {
  if (!secret) return { ok: false, error: 'session_secret_manquant' };
  const session = await verifySessionWith(reqBody.token, secret);
  if (!session) return { ok: false, error: 'session_invalide' };
  if (!estGarantSessionPure(session, gestionnaires)) return { ok: false, error: 'droits_insuffisants' };
  return { ok: true, session: session };
}

// ── Photos de mouvement (retour/transfert/panne/résolution) ─────────────────────────────────────
// Fonctions pures, testables indépendamment (voir tests/worker.photos.test.js). `upload_photo`
// reste volontairement partagé avec la PWA terrain sans jeton de session (même modèle de confiance
// que reserver/transfert, voir PWA_SHARED_ACTIONS dans security.gated-actions.test.js) : ces
// vérifications (taille, signature JPEG réelle, nom de fichier) sont la seule protection contre
// l'abus de cette action non authentifiée — pas de quota/rate-limit dédié (infra disproportionnée
// pour un risque déjà accepté sur les autres actions partagées PWA).
const MAX_PHOTO_BYTES = 1500000; // 1,5 Mo décodés — marge au-dessus de la cible de compression client (500 Ko)
const PHOTO_MAX_COUNT = 3;
const PHOTO_FILENAME_RE = /^[A-Za-z0-9_.-]{1,120}\.(jpg|jpeg|png|webp)$/i;
function isValidPhotoFilename(name) { return typeof name === 'string' && PHOTO_FILENAME_RE.test(name); }
// Le Content-Type déclaré par le client n'est jamais fiable en soi (voir upload_photo) : on vérifie
// la signature réelle des octets (FF D8 FF, en-tête JPEG) avant d'écrire quoi que ce soit sur le drive.
function isValidJpegBytes(bytes) { return !!bytes && bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF; }
function sanitizePhotoList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(f => (f || '').toString().trim()).filter(isValidPhotoFilename).slice(0, PHOTO_MAX_COUNT);
}
function joinPhotos(list) { return sanitizePhotoList(list).join(';'); }
function parsePhotosField(text) { return (text || '').split(';').map(s => s.trim()).filter(Boolean); }
// Marqueur transitoire porté par Transferts_En_Attente.Note le temps qu'un retour/transfert soit
// validé — cette liste n'a pas sa propre colonne Photos (contrairement à Mouvements, seule liste
// permanente) : le marqueur est retiré du texte à la validation (stripPhotosMarker), jamais affiché
// tel quel à l'utilisateur, même pattern que ##PRESTA:##/##COUT:## déjà utilisés ailleurs.
const PHOTOS_MARKER_RE = /##PHOTOS:([^#]*)##/;
function buildPhotosMarker(list) { const j = joinPhotos(list); return j ? '##PHOTOS:' + j + '##' : ''; }
function extractPhotosMarker(note) { const m = PHOTOS_MARKER_RE.exec(note || ''); return m ? parsePhotosField(m[1]) : []; }
function stripPhotosMarker(note) { return (note || '').replace(PHOTOS_MARKER_RE, '').replace(/\s{2,}/g, ' ').trim(); }

// ── Limitation de débit sur les tentatives de mot de passe (verify_password, et l'ancien mot de
// passe côté set_password — même secret deviné dans les deux cas) ──────────────────────────────
// Verrou progressif par code employé : compteur en mémoire du Worker (Map au niveau module, donc
// partagée entre les requêtes tant que l'isolate Cloudflare est réutilisé). C'est un "best effort",
// pas une garantie : un isolate peut être recyclé (compteur remis à zéro) et une requête peut
// atterrir sur un autre nœud edge avec son propre compteur — pas de KV/Durable Object provisionné
// pour rester dans la philosophie "zéro infrastructure" du projet (voir 01_ARCHITECTURE_TECHNIQUE.md
// et SECURITE_ETAT.md). Suffisant pour dissuader un brute-force scripté basique contre un mot de
// passe court (minimum 4 caractères) ; pas une garantie cryptographique.
const LOGIN_ATTEMPTS = new Map(); // code -> { fails: n, lockedUntil: timestampMs }
// Paliers croissants : à partir de N échecs, verrouillage pour la durée indiquée. Le premier palier
// atteint (dans l'ordre décroissant de N) l'emporte — évite de complexifier avec une formule.
const LOGIN_LOCK_THRESHOLDS = [
  [10, 15 * 60 * 1000], // 10e échec et suivants : 15 min
  [7, 5 * 60 * 1000],   // 7e-9e échec : 5 min
  [5, 30 * 1000],       // 5e-6e échec : 30s (laisse passer une faute de frappe sans blocage)
];
// Chaîne envoyée par dashboard.html (etapeMotDePasse()) pour savoir si un mot de passe existe déjà
// AVANT que l'utilisateur ait tapé quoi que ce soit — ne doit jamais compter comme une tentative
// réelle ni être bloquée par un verrou en cours, sinon chaque connexion légitime consommerait un
// essai (ou resterait bloquée à l'étape "êtes-vous déjà inscrit ?") avant même d'avoir commencé.
const LOGIN_PROBE_SENTINEL = '__probe__';
function loginLockStatus(code) {
  const e = LOGIN_ATTEMPTS.get(code);
  if (!e || !e.lockedUntil || e.lockedUntil <= Date.now()) return { locked: false };
  return { locked: true, retryAfterS: Math.ceil((e.lockedUntil - Date.now()) / 1000) };
}
function registerLoginFailure(code) {
  const e = LOGIN_ATTEMPTS.get(code) || { fails: 0, lockedUntil: 0 };
  e.fails++;
  const palier = LOGIN_LOCK_THRESHOLDS.find(t => e.fails >= t[0]);
  if (palier) e.lockedUntil = Date.now() + palier[1];
  LOGIN_ATTEMPTS.set(code, e);
}
function clearLoginAttempts(code) { LOGIN_ATTEMPTS.delete(code); }

// ── Persistance optionnelle du verrou ci-dessus via Cloudflare KV (ajoutée août 2026) ───────────
// Le compteur en mémoire ci-dessus (LOGIN_ATTEMPTS) reste le seul mécanisme pour set_password et
// reste le repli automatique de verify_password : un isolate Cloudflare recyclé perd son historique,
// et deux requêtes successives peuvent atterrir sur deux isolates différents. Un binding KV nommé
// LOGIN_ATTEMPTS_KV, s'il est provisionné (voir wrangler.toml et SECURITE_ETAT.md — étape manuelle
// requise côté tableau de bord Cloudflare, jamais supposée exister), rend ce compteur persistant et
// partagé entre tous les nœuds edge. Repli gracieux total si le binding est absent ou qu'un appel KV
// échoue (quota dépassé, incident réseau) : on retombe alors silencieusement sur le comportement
// actuel (Map en mémoire), jamais d'échec de connexion à cause de KV. Reste un "best effort" — KV est
// éventuellement cohérent (propagation entre nœuds edge non instantanée), pas une garantie stricte,
// dans la même philosophie que le reste des protections déjà documentées dans SECURITE_ETAT.md.
//
// Volontairement scopé à verify_password uniquement (pas set_password, pas reset_password ni aucune
// autre action) : c'est le seul chemin appelé à chaque tentative de connexion réelle, celui qui doit
// bénéficier de la protection renforcée. Ajouter KV ailleurs n'apporterait rien tant que ces autres
// chemins sont peu fréquents (set_password : uniquement à la création initiale d'un compte) ou déjà
// protégés autrement (reset_password : requireAdmin) — et ajouterait une latence réseau inutile.
function loginAttemptsKv() {
  if (typeof LOGIN_ATTEMPTS_KV !== 'undefined' && LOGIN_ATTEMPTS_KV) return LOGIN_ATTEMPTS_KV;
  return (typeof globalThis !== 'undefined' && globalThis.LOGIN_ATTEMPTS_KV) || null;
}
const LOGIN_ATTEMPTS_KV_PREFIX = 'login:';
// TTL généreux (1h), très supérieur au plus long palier (15 min) : la clé s'auto-nettoie côté KV
// même si clearLoginAttempts n'est jamais appelé (ex. compte jamais réutilisé après un pic d'échecs).
const LOGIN_ATTEMPTS_KV_TTL_S = 3600;
// Lecture : source de vérité KV si disponible (et alors recopiée en mémoire locale, pour que set_password
// — qui ne lit que la mémoire — voie lui aussi l'état le plus récent connu sur cet isolate). Sinon,
// repli sur l'état mémoire local tel quel (comportement strictement identique à avant cette migration).
async function loginLockStatusAsync(code) {
  const kv = loginAttemptsKv();
  if (!kv) return loginLockStatus(code);
  try {
    const raw = await kv.get(LOGIN_ATTEMPTS_KV_PREFIX + code);
    if (!raw) return loginLockStatus(code);
    const e = JSON.parse(raw);
    LOGIN_ATTEMPTS.set(code, e);
    if (!e || !e.lockedUntil || e.lockedUntil <= Date.now()) return { locked: false };
    return { locked: true, retryAfterS: Math.ceil((e.lockedUntil - Date.now()) / 1000) };
  } catch (e) {
    return loginLockStatus(code); // KV indisponible/quota dépassé : repli gracieux
  }
}
// Écriture : toujours appliquée en mémoire d'abord (garantie inchangée, coût négligeable), puis
// répercutée sur KV en best-effort — un échec d'écriture KV ne doit jamais faire échouer la connexion.
async function registerLoginFailureAsync(code) {
  registerLoginFailure(code);
  const kv = loginAttemptsKv();
  if (!kv) return;
  try {
    const e = LOGIN_ATTEMPTS.get(code);
    await kv.put(LOGIN_ATTEMPTS_KV_PREFIX + code, JSON.stringify(e), { expirationTtl: LOGIN_ATTEMPTS_KV_TTL_S });
  } catch (e) {}
}
async function clearLoginAttemptsAsync(code) {
  clearLoginAttempts(code);
  const kv = loginAttemptsKv();
  if (!kv) return;
  try { await kv.delete(LOGIN_ATTEMPTS_KV_PREFIX + code); } catch (e) {}
}

// ── Politique de longueur minimale du mot de passe (set_password, ajoutée août 2026) ────────────
// Relevé de 4 à 8 caractères — un mot de passe de 4 caractères reste intrinsèquement faible en cas
// de fuite de hash, même haché en PBKDF2-SHA256 100k itérations (voir SECURITE_ETAT.md "reste à
// faire" #3). Ne s'applique qu'aux NOUVEAUX mots de passe (création ou changement, action
// set_password) : les comptes déjà créés avec un mot de passe plus court restent utilisables tels
// quels à la connexion (verify_password ne vérifie jamais la longueur, seulement le hash) — aucune
// migration forcée, aucun compte cassé rétroactivement.
const PASSWORD_MIN_LENGTH = 8;

// ── Limitation de débit sur la résolution de noms employés (?noms_employes=1, ajoutée lors de la
// pseudonymisation d'employes.json, voir 04_HISTORIQUE_DECISIONS.md) ───────────────────────────
// Endpoint volontairement non authentifié : la PWA terrain n'a aucune session (scan de badge sans
// mot de passe, voir 03_REGLES_METIER_ET_ROLES.md § Autorisation côté serveur) et ne peut donc pas
// présenter de jeton. Seuls freins possibles : un verrou par IP ("best effort" comme LOGIN_ATTEMPTS
// ci-dessus — Map en mémoire, pas de garantie entre isolates/nœuds edge Cloudflare) et la
// vérification de l'en-tête Origin (voir origineReconnue plus bas). Aucun des deux n'est une
// garantie cryptographique — un attaquant déterminé qui forge ses en-têtes contourne les deux —
// mais ça ferme la porte "un simple GET sans rien d'autre renvoie tout instantanément", cohérent
// avec le reste des protections "best effort" déjà documentées dans SECURITE_ETAT.md.
const NOM_LOOKUP_ATTEMPTS = new Map(); // ip -> { count, windowStart }
const NOM_LOOKUP_WINDOW_MS = 60 * 1000;
// Seuil volontairement large : un dépôt/atelier avec plusieurs téléphones terrain derrière la même
// IP partagée (NAT opérateur mobile ou Wifi dépôt) ne doit jamais être bloqué par un usage normal —
// seul un appel en boucle (scraping automatisé) dépasse ce seuil en pratique.
const NOM_LOOKUP_MAX_PER_WINDOW = 20;
function clientIpFrom(request) {
  return (request && request.headers && (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For'))) || 'ip-inconnue';
}
function nomLookupRateLimited(ip) {
  const now = Date.now();
  const e = NOM_LOOKUP_ATTEMPTS.get(ip);
  if (!e || now - e.windowStart > NOM_LOOKUP_WINDOW_MS) { NOM_LOOKUP_ATTEMPTS.set(ip, { count: 1, windowStart: now }); return false; }
  e.count++;
  return e.count > NOM_LOOKUP_MAX_PER_WINDOW;
}
// Best effort également (voir plus haut) : accepte si l'en-tête Origin correspond à une origine
// connue, ou à défaut si Referer commence par une origine connue (certaines requêtes GET peuvent
// omettre Origin mais garder Referer). Filtre malgré tout la visite directe d'URL et les scripts
// sans navigateur qui n'envoient ni l'un ni l'autre.
function origineReconnue(request, allowedOrigins) {
  const list = allowedOrigins || ALLOWED_ORIGINS;
  const origin = (request && request.headers && request.headers.get('Origin')) || '';
  if (origin && list.indexOf(origin) !== -1) return true;
  const referer = (request && request.headers && request.headers.get('Referer')) || '';
  return list.some(function (o) { return referer.indexOf(o) === 0; });
}

// ── Digest hebdomadaire (récapitulatif d'actions, ajouté août 2026, endpoint ?digest=1 plus bas) ──
// Fonctions pures hoistées ici pour être testables indépendamment d'une vraie requête HTTP/Graph
// (voir tests/worker.digest.test.js), même principe que signSessionWith/requireAdminWith plus haut.
// Ce mécanisme calcule un digest à la demande — pas de cron Worker : un flux Power Automate planifié
// (lundi matin) appelle ?digest=1 puis envoie l'e-mail lui-même, cohérent avec le flux
// "Notification_Mouvement_Immo" déjà en place (voir 01_ARCHITECTURE_TECHNIQUE.md). Le Worker reste un
// pur fournisseur de données, jamais expéditeur d'e-mail.
//
// Comparaison à temps constant (évite qu'un attaquant déduise le secret DIGEST_TOKEN_ENV octet par
// octet à partir du temps de réponse) — même volume de travail que les chaînes comparées le justifie
// ici (secret court comparé à chaque appel), contrairement au hash de mot de passe qui a sa propre
// dérivation PBKDF2 (déjà à temps non déterministe par nature).
function timingSafeEqualStr(a, b) {
  a = String(a == null ? '' : a); b = String(b == null ? '' : b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// Pas requireAdmin/requireGarant ici : ce flux tourne sans utilisateur connecté (Power Automate
// planifié), donc pas de jeton de session dashboard (12h, lié à un employé) possible. Secret dédié
// statique à la place — même famille que CLIENT_SECRET_ENV/SESSION_SECRET_ENV (variable Cloudflare,
// Settings > Variables and Secrets), comparaison directe plutôt que vérification HMAC de session.
function requireDigestTokenWith(reqToken, secret) {
  if (!secret) return { ok: false, error: 'digest_token_manquant' };
  if (!timingSafeEqualStr(reqToken, secret)) return { ok: false, error: 'token_invalide' };
  return { ok: true };
}

// Seuils du digest — constantes ajustables ici (pas de réglage dashboard pour cette V1, cohérent
// avec une demande volontairement minimale ; à revisiter si l'usage réel le justifie).
const DIGEST_SEUILS = {
  transfertJours: 7,          // Transferts_En_Attente en attente depuis plus de N jours
  garantieAns: 2,              // durée de garantie type — DOIT rester égal à GARANTIE_ANS (dashboard.html,
                                // onglet Maintenance) : synchronisation vérifiée par tests/worker.digest.test.js
  garantieJours: 30,           // remonté dans le digest seulement si expiration < N jours (plus resserré
                                // que les 180 jours affichés dans l'onglet Maintenance — le digest ne
                                // remonte que l'urgent)
  panneJours: 7,                // dernier mouvement d'une immo = Panne, non résolue depuis plus de N jours
  demandeJours: 5,              // demande de matériel (Reservations, roadmap item D) restée "Demandee" (sans
                                // Confirmee/Refusee) depuis plus de N jours — plus court que transfertJours
                                // (7) : une demande de planification non traitée risque de bloquer un
                                // chantier avant même que le matériel ne soit sorti, contrairement à un
                                // transfert déjà en cours qui n'a "que" un retard de validation
  campagneCouverturePct: 50,   // % de couverture en-dessous duquel une campagne ouverte est signalée
  campagneMinJours: 14,         // ...et seulement si elle est ouverte depuis au moins N jours (ne pas
                                // alerter une campagne qui vient de démarrer)
};
// Comptes administratifs / étiqueteuses exceptées : dupliqués depuis COMPTES_ADMIN_DASH/ETIQUETEUSES_DASH
// (dashboard.html, onglet Maintenance) — impossible de vraiment partager le code entre le Worker (edge,
// zéro build) et le dashboard (navigateur, fichier HTML autonome), donc dupliqué avec la même logique ;
// dérive empêchée par un test dédié (tests/worker.digest.test.js) qui compare les deux listes littérales.
const COMPTES_ADMIN_DIGEST = ['205', '2154', '2181', '2182', '2183', '2184', '2718', '2752'];
const ETIQUETEUSES_DIGEST = ['IM000272', 'IM000495', 'IM000496', 'IM000605', 'IM000606', 'IM000607', 'IM000643', 'IM000685', 'IM000686', 'IM000771', 'IM000889', 'IM000897', 'IM000898', 'IM000899', 'IM000900', 'IM000901', 'IM000902', 'IM000903', 'IM000904'];
function estImmoActiviteDigest(compteImmobilisation, codeIM) {
  const compte = (compteImmobilisation || '').toString().trim();
  if (COMPTES_ADMIN_DIGEST.indexOf(compte) === -1) return true; // compte non administratif
  return ETIQUETEUSES_DIGEST.indexOf(codeIM) !== -1;             // étiqueteuse (exception)
}

// ── Règle 1 : transferts/retours en attente depuis plus de N jours ──
// `pending` : forme normalisée { code_im, donneur_code, donneur_nom, receveur_code, receveur_nom,
// statut, horodatage }. Filtre explicite sur statut === 'En attente' (allow-list) plutôt que la
// deny-list utilisée par ?dashboard=1 (qui, elle, ne exclut pas 'Annulé' — écart pré-existant, signalé
// dans 04_HISTORIQUE_DECISIONS.md, non corrigé ici pour ne pas changer le comportement de l'onglet
// Transferts déjà en production).
function digestTransfertsEnAttente(pending, nowMs, seuilJours) {
  return (pending || [])
    .filter(t => (t.statut || 'En attente') === 'En attente')
    .map(t => Object.assign({}, t, { jours: Math.floor((nowMs - new Date(t.horodatage).getTime()) / 86400000) }))
    .filter(t => Number.isFinite(t.jours) && t.jours >= seuilJours)
    .sort((a, b) => b.jours - a.jours);
}

// ── Règle 2 : garanties expirant sous N jours ──
// Reprend exactement le calcul de l'onglet Maintenance (dashboard.html, "Garanties à surveiller") :
// date de référence = mise en service, ou achat à défaut ; + garantieAns. `immos` normalisé
// { code_im, libelle, date_mise_service, date_achat, valeur_achat, compte_immobilisation, actif }.
function digestGarantiesProches(immos, nowMs, seuils) {
  const out = [];
  (immos || []).forEach(i => {
    if (i.actif === false) return;
    if (!estImmoActiviteDigest(i.compte_immobilisation, i.code_im)) return;
    const dref = i.date_mise_service || i.date_achat;
    if (!dref) return;
    const fin = new Date(dref);
    if (isNaN(fin.getTime())) return;
    fin.setFullYear(fin.getFullYear() + seuils.garantieAns);
    const jours = Math.round((fin.getTime() - nowMs) / 86400000);
    if (jours > 0 && jours <= seuils.garantieJours) out.push(Object.assign({}, i, { jours_restants: jours, fin_garantie: fin.toISOString() }));
  });
  return out.sort((a, b) => a.jours_restants - b.jours_restants);
}

// ── Règle 3 : pannes non résolues depuis plus de N jours ──
// Une immo est "en panne" si son dernier mouvement (tous types confondus) est de type Panne — même
// définition que estEnPanneDash côté dashboard.html (dernier élément de l'historique trié). `mouvements`
// normalisé { code_im, type_mouvement, horodatage, code_employe }.
function digestPannesNonResolues(mouvements, nowMs, seuilJours) {
  const dernier = {};
  (mouvements || []).forEach(m => {
    if (!m.code_im) return;
    const prev = dernier[m.code_im];
    if (!prev || new Date(m.horodatage).getTime() > new Date(prev.horodatage).getTime()) dernier[m.code_im] = m;
  });
  return Object.keys(dernier).map(c => dernier[c])
    .filter(m => m.type_mouvement === 'Panne')
    .map(m => Object.assign({}, m, { jours: Math.floor((nowMs - new Date(m.horodatage).getTime()) / 86400000) }))
    .filter(m => Number.isFinite(m.jours) && m.jours >= seuilJours)
    .sort((a, b) => b.jours - a.jours);
}

// ── Règle 3bis : demandes de matériel (Reservations, roadmap item D) en attente de traitement ──
// Une demande reste "Demandee" tant que le dépôt n'a pas Confirmé/Refusé — ce digest ne signale que
// celles-là (Confirmee/Refusee/Rendue/Annulee sont déjà traitées, rien à faire). `reservations`
// normalisé { code_im, categorie, libelle_libre, quantite, code_employe, nom_employe, nom_chantier,
// statut, horodatage }, même principe que digestTransfertsEnAttente (horodatage = date de soumission,
// pas la date de besoin — ce digest alerte sur un retard de DÉCISION, pas sur l'échéance elle-même).
function digestDemandesReservationEnAttente(reservations, nowMs, seuilJours) {
  return (reservations || [])
    .filter(r => (r.statut || 'Demandee') === 'Demandee')
    .map(r => Object.assign({}, r, { jours: Math.floor((nowMs - new Date(r.horodatage).getTime()) / 86400000) }))
    .filter(r => Number.isFinite(r.jours) && r.jours >= seuilJours)
    .sort((a, b) => b.jours - a.jours);
}

// ── Règle 4 : stock bas EPI/Outillage ──
// Réutilise le seuil personnalisé Stock_Mini s'il est renseigné, sinon le défaut historique (5 EPI /
// 3 Outillage) — mêmes valeurs que côté dashboard.html (STOCK_MINI_DEFAUT_EPI/OUTILLAGE).
const STOCK_MINI_DEFAUT_EPI = 5;
const STOCK_MINI_DEFAUT_OUTILLAGE = 3;
function digestStockBas(catalogueEpi, catalogueOutillage) {
  const sousLeSeuil = (articles, defaut) => (articles || [])
    .map(a => Object.assign({}, a, { seuil_effectif: (a.stock_mini && a.stock_mini > 0) ? a.stock_mini : defaut }))
    .filter(a => (a.stock_actuel || 0) < a.seuil_effectif)
    .sort((a, b) => (a.stock_actuel || 0) - (b.stock_actuel || 0));
  return { epi: sousLeSeuil(catalogueEpi, STOCK_MINI_DEFAUT_EPI), outillage: sousLeSeuil(catalogueOutillage, STOCK_MINI_DEFAUT_OUTILLAGE) };
}

// ── Règle 5 : campagne d'inventaire immos ouverte avec faible couverture ──
// Couverture = immos ACTIVES distinctement scannées / total immos actives — même définition que
// calculerEcartsInventaireImmos (dashboard.html) : une immo inactive scannée n'est jamais comptée
// comme "vue" (dénominateur cohérent). `campagnes` normalisé { nom, statut, date_debut }, `scans`
// normalisé { code_im, campagne }, `immosActives` = immos avec actif !== false.
function digestCampagnesFaibleCouverture(campagnes, scans, immosActives, nowMs, seuils) {
  const codesActifs = new Set((immosActives || []).map(i => i.code_im));
  const totalActives = codesActifs.size;
  const vusParCampagne = {};
  (scans || []).forEach(s => {
    if (!codesActifs.has(s.code_im)) return; // une immo inactive/inconnue scannée n'est jamais comptée comme "vue"
    (vusParCampagne[s.campagne] = vusParCampagne[s.campagne] || new Set()).add(s.code_im);
  });
  return (campagnes || [])
    .filter(c => (c.statut || 'En cours') === 'En cours')
    .map(c => {
      const jours = Math.floor((nowMs - new Date(c.date_debut).getTime()) / 86400000);
      const vues = vusParCampagne[c.nom] ? vusParCampagne[c.nom].size : 0;
      const pct = totalActives ? Math.round(vues / totalActives * 100) : 0;
      return Object.assign({}, c, { jours_ouverte: jours, couverture_pct: pct, vues: vues, total_actives: totalActives });
    })
    .filter(c => Number.isFinite(c.jours_ouverte) && c.jours_ouverte >= seuils.campagneMinJours && c.couverture_pct < seuils.campagneCouverturePct);
}

// ── Assemblage ──
function buildDigest(data, nowMs, seuils) {
  const s = seuils || DIGEST_SEUILS;
  const immosActives = (data.immos || []).filter(i => i.actif !== false);
  const transferts = digestTransfertsEnAttente(data.pending, nowMs, s.transfertJours);
  const garanties = digestGarantiesProches(data.immos, nowMs, s);
  const pannes = digestPannesNonResolues(data.mouvements, nowMs, s.panneJours);
  const stock = digestStockBas(data.catalogueEpi, data.catalogueOutillage);
  const campagnes = digestCampagnesFaibleCouverture(data.campagnes, data.scans, immosActives, nowMs, s);
  const demandes = digestDemandesReservationEnAttente(data.reservations, nowMs, s.demandeJours);
  const vide = !transferts.length && !garanties.length && !pannes.length && !stock.epi.length && !stock.outillage.length && !campagnes.length && !demandes.length;
  return { genere_le: new Date(nowMs).toISOString(), vide, transferts, garanties, pannes, stock, campagnes, demandes, seuils: s };
}

function escapeHtmlDigest(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Rendu HTML — sobre, tables uniquement (pas de flex/grid, compatibilité client mail), pensé pour
// être lu sur mobile Outlook. Un seul lien "Ouvrir le dashboard" par section : dashboard.html ne fait
// pas de routage par onglet via l'URL (pas de #hash), donc pas de lien profond possible vers un onglet
// précis — le texte de chaque ligne précise l'onglet à ouvrir.
function renderDigestHtml(digest, dashboardUrl) {
  const url = dashboardUrl || 'https://ral974.github.io/immo-tracker/dashboard.html';
  const section = (titre, emoji, count, bodyHtml, videTexte) => {
    if (!count) return '';
    return '<tr><td style="padding:18px 0 6px">' +
      '<div style="font-size:15px;font-weight:700;color:#1A2B3C;margin-bottom:8px">' + emoji + ' ' + escapeHtmlDigest(titre) + ' (' + count + ')</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">' + bodyHtml + '</table>' +
      '</td></tr>';
  };
  const ligne = (texte, sousTexte) => '<tr><td style="padding:6px 0;border-bottom:1px solid #EEE;color:#333">' + escapeHtmlDigest(texte) +
    (sousTexte ? '<br><span style="color:#888;font-size:12px">' + escapeHtmlDigest(sousTexte) + '</span>' : '') + '</td></tr>';

  let body = '';
  body += section('Transferts/retours en attente', '🔄', digest.transferts.length,
    digest.transferts.map(t => ligne(t.code_im + ' — ' + (t.donneur_nom || t.donneur_code || '?') + ' → ' + (t.receveur_nom || t.receveur_code || 'DEPOT'), t.jours + ' jour(s) en attente — onglet Transferts')).join(''));
  body += section('Garanties à surveiller', '🛡️', digest.garanties.length,
    digest.garanties.map(g => ligne(g.code_im + ' — ' + (g.libelle || ''), 'expire dans ' + g.jours_restants + ' jour(s) — onglet Maintenance')).join(''));
  body += section('Pannes non résolues', '🔧', digest.pannes.length,
    digest.pannes.map(p => ligne(p.code_im, 'en panne depuis ' + p.jours + ' jour(s) — onglet Circulation/Dépôt')).join(''));
  const stockLignes = digest.stock.epi.map(a => ligne('[EPI] ' + (a.designation || a.type_article) + ' — ' + (a.taille_affichage || a.taille_salarie || ''), 'stock ' + a.stock_actuel + ' / seuil ' + a.seuil_effectif + ' — onglet EPI › Stock'))
    .concat(digest.stock.outillage.map(a => ligne('[Outillage] ' + (a.title || a.designation || ''), 'stock ' + a.stock_actuel + ' / seuil ' + a.seuil_effectif + ' — onglet Prime d\'outillage › Stock')));
  body += section('Stock bas EPI/Outillage', '📦', digest.stock.epi.length + digest.stock.outillage.length, stockLignes.join(''));
  body += section('Campagnes d\'inventaire ouvertes, faible couverture', '📋', digest.campagnes.length,
    digest.campagnes.map(c => ligne(c.nom, c.vues + ' / ' + c.total_actives + ' immos vues (' + c.couverture_pct + '%), ouverte depuis ' + c.jours_ouverte + ' jour(s) — onglet Inventaire immos')).join(''));
  body += section('Demandes de matériel en attente', '📅', digest.demandes.length,
    digest.demandes.map(d => ligne((d.code_im || (d.categorie || 'Catégorie') + (d.libelle_libre ? ' — ' + d.libelle_libre : '')) + ' — ' + (d.nom_employe || d.code_employe || '?') + (d.nom_chantier ? ' · ' + d.nom_chantier : ''), d.jours + ' jour(s) sans décision — onglet Réservations')).join(''));

  if (digest.vide) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#333">' +
      '<h2 style="color:#1A2B3C">📋 Digest hebdomadaire Immo Tracker</h2>' +
      '<p>Rien à signaler cette semaine — aucun transfert en attente depuis plus de ' + digest.seuils.transfertJours + ' jours, aucune garantie proche, aucune panne non résolue, aucun stock bas, aucune campagne à faible couverture, aucune demande de matériel en attente depuis plus de ' + digest.seuils.demandeJours + ' jours.</p>' +
      '</td></tr></table>';
  }
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif">' +
    '<tr><td style="padding:0 0 10px"><h2 style="color:#1A2B3C;margin:0 0 4px">📋 Digest hebdomadaire Immo Tracker</h2>' +
    '<span style="color:#888;font-size:12px">Généré le ' + new Date(digest.genere_le).toLocaleDateString('fr-FR') + '</span></td></tr>' +
    body +
    '<tr><td style="padding:20px 0 0"><a href="' + url + '" style="display:inline-block;background:#A67A1E;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:13px">Ouvrir le dashboard</a></td></tr>' +
    '</table>';
}

// ── Journal d'audit des actions sensibles (liste SharePoint Journal_Audit, ajoutée août 2026) ──
// Périmètre : exactement les 62 actions POST protégées requireAdmin/requireGarant (mêmes noms que
// GATED_ACTIONS côté dashboard.html) + les échecs de connexion (verify_password, voir plus bas).
// Cette liste est DUPLIQUÉE ici plutôt que dérivée dynamiquement du code : le point d'insertion
// unique (dispatchPost, dans handleRequest) doit savoir "dois-je journaliser cette action ?" à
// partir du seul nom d'action, avant d'avoir inspecté le contenu du bloc exécuté. Synchronisation
// garantie par un test dédié (tests/security.gated-actions.test.js) qui compare les trois listes
// (ici, GATED_ACTIONS du dashboard, et les blocs réellement protégés dans worker.js).
const GATED_ACTIONS_AUDIT = new Set([
  'ajouter_employe', 'ajouter_immo', 'maj_droits', 'maj_actif', 'maj_site_employe', 'reset_password',
  'dedupe_employes', 'seed_immo_sites', 'seed_roles_sites', 'bulk_patch_immos', 'importer_affectation_immo',
  'bulk_import_tailles_epi', 'bulk_import_catalogue_epi', 'bulk_import_grille_dotation_epi',
  'bulk_import_catalogue_outillage', 'bulk_import_grille_outillage', 'bulk_import_lignes_outillage',
  'bulk_import_lignes_inventaire', 'bulk_maj_duree_outillage', 'marquer_statut_immo', 'enregistrer_reparation',
  'maj_panne', 'creer_mouvement_direct', 'maj_transfert', 'annuler_transfert', 'maj_site_immo',
  'ajouter_article_epi', 'maj_grille_dotation_epi', 'supprimer_grille_dotation_epi', 'reception_commande_epi',
  'generer_dotation_epi', 'generer_remise_ponctuelle_epi', 'annuler_dotation_epi', 'emarger_dotation_epi',
  'upload_fiche_epi', 'bulk_maj_stock_epi', 'maj_stock_mini_epi', 'maj_grille_outillage',
  'supprimer_grille_outillage', 'reception_commande_outillage', 'editer_stock_outillage',
  'maj_stock_mini_outillage', 'distribuer_outillage', 'upload_fiche_outillage', 'maj_service_outillage',
  'annuler_ligne_outillage', 'cloturer_campagne_inventaire', 'creer_campagne_inventaire',
  'cloturer_campagne_inventaire_immos', 'creer_campagne_inventaire_immos', 'upload_fds', 'maj_taille_employe',
  'ajouter_materiel_it', 'maj_materiel_it', 'affecter_materiel_it', 'bulk_import_materiel_it',
  'bulk_import_mouvements_materiel_it', 'ajouter_ligne_telephonique', 'maj_ligne_telephonique',
  'affecter_ligne_telephonique', 'bulk_import_lignes_telephoniques', 'bulk_import_mouvements_lignes_telephoniques'
]);
// Réponses renvoyées par requireAdmin/requireGarant AVANT toute exécution métier : ne jamais
// journaliser ces cas. Deux raisons : (1) aucune écriture n'a eu lieu, rien à auditer côté métier ;
// (2) aucune identité vérifiée n'est disponible pour renseigner Code_Employe. Préserve aussi une
// garantie déjà testée (tests/worker.integration.test.js) : "zéro écriture SharePoint si l'auth
// échoue" — y compris pour le journal d'audit lui-même, qui aurait pu sinon devenir un vecteur de
// spam en réponse à des jetons invalides envoyés en boucle par n'importe qui.
const AUDIT_AUTH_ERRORS = new Set(['session_invalide', 'droits_insuffisants', 'session_secret_manquant']);
// Clés jamais recopiées dans la colonne Detail, quelle que soit l'action (RGPD) : mots de passe,
// codes PIN/PUK/RIO/déverrouillage des cartes SIM (voir Materiel_IT/Lignes_Telephoniques dans
// 02_MODELE_DONNEES.md), le jeton de session lui-même, et toute charge de fichier encodée en
// base64 (uploads photo/FDS/fiches EPI-Outillage, champ `data`).
const AUDIT_DETAIL_EXCLUDED_KEYS = new Set(['password', 'old_password', 'new_password', 'pwd', 'token',
  'code_pin', 'code_puk', 'code_rio', 'code_deverouillage', 'code_deverrouillage', 'data']);
// Résumé best-effort du corps de la requête pour la colonne Detail. Les valeurs tableau/objet (les
// actions bulk_import_*/bulk_patch_* notamment) ne sont jamais recopiées telles quelles — ça
// dupliquerait les données de dizaines d'employés/immos dans une seule ligne d'audit — seulement
// un compte d'éléments.
function auditDetailFrom(body) {
  const out = {};
  Object.keys(body || {}).forEach(function (k) {
    if (AUDIT_DETAIL_EXCLUDED_KEYS.has(k.toLowerCase())) return;
    const v = body[k];
    if (v === undefined) return;
    if (v !== null && typeof v === 'object') { out[k] = { __count: Array.isArray(v) ? v.length : Object.keys(v).length }; return; }
    out[k] = v;
  });
  return out;
}
// Meilleur identifiant disponible pour la colonne Cible — best-effort, pas garanti homogène d'une
// action à l'autre (chaque action a ses propres champs de corps de requête).
function auditCibleFrom(body) {
  const b = body || {};
  return String(b.code_im || b.code_employe || b.code || b.id || '').slice(0, 255);
}

// ── Trace Sentry best-effort en cas d'échec d'écriture du journal d'audit (jamais l'action métier
// elle-même, voir logAudit plus bas) ── Même projet Sentry que dashboard.html/index.html (DSN non
// sensible, voir 04_HISTORIQUE_DECISIONS.md), tag environment='worker' pour le distinguer. Utilise
// l'API HTTP "Store" de Sentry (POST brut, sans SDK) plutôt que @sentry/cloudflare : ce Worker n'a
// ni build ni npm install (voir 01_ARCHITECTURE_TECHNIQUE.md), et un SDK à bundler casserait ce
// mode de déploiement "zéro build". Ne transmet jamais le corps de la requête ni de code employé —
// seulement le nom de l'action et un message d'erreur généré par ce fichier (jamais un texte fourni
// par le client) : rien à scruber ici, contrairement au scrubbing PII côté dashboard/PWA (voir
// sentryScrubPII dans dashboard.html) qui protège des breadcrumbs/événements riches en contexte.
const SENTRY_STORE_URL = 'https://o4511863564533760.ingest.de.sentry.io/api/4511863574560848/store/';
const SENTRY_PUBLIC_KEY = '8823eceab72dee7235becd4b7bd40e26';
async function reportAuditFailureToSentry(action, message) {
  await fetch(SENTRY_STORE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': 'Sentry sentry_version=7, sentry_key=' + SENTRY_PUBLIC_KEY + ', sentry_client=immo-tracker-worker/1.0' },
    body: JSON.stringify({ message: 'Échec écriture Journal_Audit', level: 'warning', environment: 'worker', tags: { action: action || 'inconnue' }, extra: { detail: String(message || '').slice(0, 300) } })
  });
}

// ── Origines autorisées à appeler ce Worker depuis du JS navigateur (fetch/XHR) ─────────────────
// Avant durcissement : Access-Control-Allow-Origin: '*' — n'importe quel site tiers pouvait lire
// les réponses du Worker depuis du JS embarqué sur une page piégée (moissonnage à grande échelle
// des endpoints GET publics, ou requêtes faites "au nom" d'une victime dont le navigateur a déjà
// un jeton de session en mémoire). Resserré à l'origine GitHub Pages réelle de la PWA/du dashboard.
// N'affecte PAS les visites directes d'URL (ex. `?debug_immos=1` tapé dans la barre d'adresse, ou
// le téléchargement d'une photo/FDS) : le CORS ne s'applique qu'aux requêtes cross-origin
// initiées par du JavaScript (fetch/XHR), jamais à la navigation classique — voir SECURITE_ETAT.md.
const ALLOWED_ORIGINS = ['https://ral974.github.io'];
function corsOriginFor(request, allowedOrigins) {
  const origin = (request && request.headers && request.headers.get('Origin')) || '';
  const list = allowedOrigins || ALLOWED_ORIGINS;
  return list.indexOf(origin) !== -1 ? origin : list[0];
}
function securityHeadersFor(request, allowedOrigins) {
  return {
    'Access-Control-Allow-Origin': corsOriginFor(request, allowedOrigins),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin', // la valeur d'ACAO dépend de l'Origin de la requête : ne jamais mettre ceci en cache partagé entre origines différentes
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

// N'existe pas dans le runtime Cloudflare Worker (pas de CommonJS) : ce bloc ne s'exécute
// jamais en production, uniquement quand le fichier est chargé via require() par les tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { signSessionWith, verifySessionWith, estAdminSessionPure, estGarantSessionPure, roleNorm, requireAdminWith, requireGarantWith, b64url, b64urlToBytes, GESTIONNAIRES, SESSION_DUREE_MS, handleRequest,
    LOGIN_ATTEMPTS, loginLockStatus, registerLoginFailure, clearLoginAttempts, LOGIN_LOCK_THRESHOLDS, LOGIN_PROBE_SENTINEL,
    loginAttemptsKv, loginLockStatusAsync, registerLoginFailureAsync, clearLoginAttemptsAsync, LOGIN_ATTEMPTS_KV_PREFIX, LOGIN_ATTEMPTS_KV_TTL_S,
    PASSWORD_MIN_LENGTH,
    ALLOWED_ORIGINS, corsOriginFor, securityHeadersFor,
    NOM_LOOKUP_ATTEMPTS, NOM_LOOKUP_WINDOW_MS, NOM_LOOKUP_MAX_PER_WINDOW, clientIpFrom, nomLookupRateLimited, origineReconnue,
    GATED_ACTIONS_AUDIT, AUDIT_AUTH_ERRORS, AUDIT_DETAIL_EXCLUDED_KEYS, auditDetailFrom, auditCibleFrom, reportAuditFailureToSentry,
    MAX_PHOTO_BYTES, PHOTO_MAX_COUNT, isValidPhotoFilename, isValidJpegBytes, sanitizePhotoList, joinPhotos, parsePhotosField,
    buildPhotosMarker, extractPhotosMarker, stripPhotosMarker,
    timingSafeEqualStr, requireDigestTokenWith, DIGEST_SEUILS, COMPTES_ADMIN_DIGEST, ETIQUETEUSES_DIGEST, estImmoActiviteDigest,
    digestTransfertsEnAttente, digestGarantiesProches, digestPannesNonResolues, digestStockBas, digestCampagnesFaibleCouverture, digestDemandesReservationEnAttente,
    STOCK_MINI_DEFAUT_EPI, STOCK_MINI_DEFAUT_OUTILLAGE, buildDigest, escapeHtmlDigest, renderDigestHtml };
}

async function handleRequest(request) {
  const cors = securityHeadersFor(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const TENANT_ID    = 'c7875e38-b2b0-4c10-a8c5-687c5a214e44';
  const CLIENT_ID    = '3a901471-86c0-4fc7-8d37-319ead2c4b88';
  // Secret lu depuis la variable d'environnement Cloudflare "CLIENT_SECRET_ENV" (Settings > Variables and Secrets).
  // Jamais écrit en dur → n'apparaît nulle part dans le code source.
  const CLIENT_SECRET= (typeof CLIENT_SECRET_ENV !== 'undefined' && CLIENT_SECRET_ENV) || (typeof globalThis !== 'undefined' && globalThis.CLIENT_SECRET_ENV) || '';
  if (!CLIENT_SECRET) return new Response(JSON.stringify({ error: 'config', message: 'La variable CLIENT_SECRET_ENV n\'est pas configurée dans le Worker.' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  // SITE_ID : site SharePoint de production par défaut. Surchargeable par la variable d'environnement
  // Cloudflare "SITE_ID_ENV" (Settings > Variables and Secrets, non sensible — un ID de site n'est pas
  // un secret) — utilisée uniquement par le Worker de recette (immo-proxy-staging, [env.staging] dans
  // wrangler.toml) pour pointer vers un site SharePoint TEST séparé, sans jamais toucher au
  // comportement de ce Worker en production (repli sur la valeur ci-dessous si la variable est
  // absente, exactement le même pattern que CLIENT_SECRET_ENV/SESSION_SECRET_ENV ci-dessus).
  const SITE_ID      = (typeof SITE_ID_ENV !== 'undefined' && SITE_ID_ENV) || (typeof globalThis !== 'undefined' && globalThis.SITE_ID_ENV) || 'espacesoleil97.sharepoint.com,4157ffef-a5f6-4e7e-8a19-4f6ab57d7128,d15dad00-7bed-4e78-bb2f-d0156e6e49a7';
  const GL           = 'https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/lists';
  // Nom d'environnement, exposé en en-tête de réponse (X-Immo-Env) — pur diagnostic, ne change aucun
  // comportement métier. Permet au front (ou à William en devtools) de vérifier que le Worker appelé
  // est bien celui attendu (staging vs production), même si l'URL a été mal configurée quelque part.
  const ENV_NAME     = (typeof ENV_NAME_ENV !== 'undefined' && ENV_NAME_ENV) || (typeof globalThis !== 'undefined' && globalThis.ENV_NAME_ENV) || 'production';
  cors['X-Immo-Env'] = ENV_NAME;

  const tok = await fetch('https://login.microsoftonline.com/' + TENANT_ID + '/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=' + CLIENT_ID + '&client_secret=' + encodeURIComponent(CLIENT_SECRET) + '&scope=https://graph.microsoft.com/.default'
  });
  const td = await tok.json();
  if (!td.access_token) return new Response(JSON.stringify({ error: 'token', d: td }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

  const H = { 'Authorization': 'Bearer ' + td.access_token, 'Content-Type': 'application/json', 'Prefer': 'HonorNonIndexedQueriesWarningMayFailRandomly' };
  const url = new URL(request.url);
  const p   = url.searchParams;
  const json = (data, s) => new Response(JSON.stringify(data), { status: s || 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

  // ── Jeton de session signé (HMAC-SHA256), émis à la connexion dashboard (verify_password) ──
  // Vérifié côté serveur avant toute action sensible (admin ou gestion dépôt) — avant août 2026,
  // ces actions n'étaient protégées que côté affichage (boutons cachés), jamais côté Worker :
  // n'importe qui connaissant l'URL du Worker (public depuis que worker.js est commité sur GitHub)
  // pouvait appeler ajouter_immo, maj_droits, etc. sans être authentifié. Corrigé ici.
  // SESSION_SECRET_ENV est une variable d'environnement Cloudflare distincte de CLIENT_SECRET_ENV
  // (Settings > Variables and Secrets) — si elle n'est pas définie, la connexion au dashboard
  // continue de fonctionner mais aucune action protégée ne pourra s'exécuter (échec explicite
  // 'session_secret_manquant'), plutôt qu'une panne totale du Worker pour tout le monde.
  // Logique pure (signature, vérification, rôles) hoistée en haut de fichier — voir le bloc
  // signSessionWith/verifySessionWith/requireAdminWith/requireGarantWith juste après
  // addEventListener() ; ces wrappers ne font que lui passer le secret lu à chaque requête.
  const SESSION_SECRET = (typeof SESSION_SECRET_ENV !== 'undefined' && SESSION_SECRET_ENV) || (typeof globalThis !== 'undefined' && globalThis.SESSION_SECRET_ENV) || '';
  const signSession = (code, role) => signSessionWith(code, role, SESSION_SECRET);
  const requireAdmin = (reqBody) => requireAdminWith(reqBody, SESSION_SECRET, GESTIONNAIRES);
  const requireGarant = (reqBody) => requireGarantWith(reqBody, SESSION_SECRET, GESTIONNAIRES);

  // Secret dédié au digest hebdomadaire (?digest=1 plus bas) — distinct de CLIENT_SECRET_ENV/
  // SESSION_SECRET_ENV, variable Cloudflare (Settings > Variables and Secrets) à ajouter par William.
  // Une simple comparaison (pas un jeton de session HMAC) : ce endpoint est appelé par un flux Power
  // Automate planifié, sans utilisateur connecté derrière — voir requireDigestTokenWith plus haut.
  const DIGEST_TOKEN = (typeof DIGEST_TOKEN_ENV !== 'undefined' && DIGEST_TOKEN_ENV) || (typeof globalThis !== 'undefined' && globalThis.DIGEST_TOKEN_ENV) || '';

  // ── Hachage sécurisé des mots de passe (PBKDF2 / SHA-256, jamais stocké en clair) ──
  const bytesToHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const hexToBytes = (hex) => { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; };
  async function hashPassword(password, saltHex) {
    const enc = new TextEncoder();
    const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, km, 256);
    return bytesToHex(salt) + ':' + bytesToHex(bits);
  }
  async function verifyPassword(password, stored) {
    if (!stored || stored.indexOf(':') === -1) return false;
    const saltHex = stored.split(':')[0];
    const recomputed = await hashPassword(password, saltHex);
    return recomputed === stored;
  }
  // Retrouve l'itemId (le hash stocké et le rôle) d'un employé par son code
  async function getEmployeAuth(code) {
    const cur = await fetch(GL + "/Employes/items?$expand=fields&$filter=fields/Title eq '" + code + "'&$top=5", { headers: H });
    const cd = await cur.json();
    const items = (cd.value || []).map(i => ({ id: i.id, hash: (i.fields || {}).MotDePasse || '', role: (i.fields || {}).Code_CT || (i.fields || {}).Droits || '' }));
    return items;
  }

  async function paginate(url, max) {
    let items = [], next = url, pages = 0;
    while (next && pages < (max || 10)) {
      const r = await fetch(next, { headers: H });
      const d = await r.json();
      items = items.concat(d.value || []);
      next = d['@odata.nextLink'] || null;
      pages++;
    }
    return items;
  }

  // Variante de paginate() qui signale si la pagination s'est arrêtée AVANT la fin de la liste
  // (plafond de pages atteint alors qu'un @odata.nextLink reste). Utilisée par la sauvegarde
  // (?export_liste=) pour ne JAMAIS présenter une liste tronquée comme complète.
  async function paginateStatus(url, max) {
    let items = [], next = url, pages = 0;
    const cap = max || 10;
    while (next && pages < cap) {
      const r = await fetch(next, { headers: H });
      const d = await r.json();
      items = items.concat(d.value || []);
      next = d['@odata.nextLink'] || null;
      pages++;
    }
    return { items: items, complete: !next };
  }

  // Exécute un lot Graph $batch (max 20 requêtes) et résume le résultat — réutilisé par les imports EPI
  async function graphBatch(requests) {
    const r = await fetch('https://graph.microsoft.com/v1.0/$batch', { method: 'POST', headers: H, body: JSON.stringify({ requests }) });
    const rd = await r.json();
    const resp = rd.responses || [];
    let ok = 0, ko = 0; const errs = [];
    resp.forEach(x => { if (x.status >= 200 && x.status < 300) ok++; else { ko++; if (errs.length < 3) errs.push({ status: x.status, body: x.body }); } });
    return { success: ko === 0, ok: ok, ko: ko, erreurs: errs };
  }

  // Résolution du vrai nom d'un employé depuis son code (évite les doublons "CONI" vs "COUTAREL Nicolas")
  let _nomParCode = null;
  async function getNomResolver() {
    if (!_nomParCode) {
      _nomParCode = {};
      try {
        const emp = await paginate(GL + '/Employes/items?$expand=fields&$top=200', 5);
        emp.forEach(i => {
          const f = i.fields || {};
          const c = f.Title || f.Code || f.Code_Employe || '';
          // Le nom réel est stocké dans field_1 (colonne interne SharePoint)
          const n = f.field_1 || f.Nom || f.Nom_Employe || f.Name || '';
          if (c && n) _nomParCode[c] = n;
        });
      } catch (e) { /* si Employes inaccessible, fallback sur les noms bruts */ }
    }
    return (code, fallback) => (code && _nomParCode[code]) || fallback || code || '';
  }

  // Vérifie si un employé est actif (field_2 !== 'Non') — utilisé pour bloquer réservations,
  // transferts et dotations vers un employé sorti. Un code introuvable ou vide n'est PAS bloqué
  // (hors périmètre de ce contrôle, qui ne porte que sur les employés explicitement inactifs).
  let _actifParCode = null;
  async function estEmployeActifServeur(code) {
    if (!code) return true;
    if (!_actifParCode) {
      _actifParCode = {};
      try {
        const emp = await paginate(GL + '/Employes/items?$expand=fields&$top=200', 5);
        emp.forEach(i => { const f = i.fields || {}; const c = f.Title || ''; if (c) _actifParCode[c] = f.field_2 !== 'Non'; });
      } catch (e) {}
    }
    return _actifParCode[code] !== false;
  }

  // ── Journal d'audit (écriture) — best-effort ────────────────────────────────
  // Un échec ici ne doit JAMAIS remonter à l'appelant ni empêcher l'action métier déjà exécutée
  // (elle a déjà eu lieu quand cette fonction est appelée, voir le point d'insertion unique après
  // dispatchPost plus bas, et les deux appels directs dans le bloc verify_password). Sentry ne
  // reçoit que le nom de l'action et un message d'erreur généré ici (jamais body/code employé).
  async function logAudit(opts) {
    try {
      const fields = {
        Title: opts.action,
        Horodatage: new Date().toISOString(),
        Code_Employe: opts.code || '',
        Action: opts.action,
        Cible: String(opts.cible || '').slice(0, 255),
        Detail: JSON.stringify(opts.detail || {}).slice(0, 800),
        Resultat: opts.success ? 'Succès' : 'Échec'
      };
      const r = await fetch(GL + '/Journal_Audit/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: fields }) });
      if (!r.ok) throw new Error('graph_status_' + r.status);
    } catch (e) {
      try { await reportAuditFailureToSentry(opts.action, e && e.message); } catch (e2) { /* best-effort jusqu'au bout */ }
    }
  }

  // ── Debugs ──────────────────────────────────────────────────────────────────
  if (p.get('debug_immos')    === '1') { const r = await fetch(GL + '/Immos/items?$expand=fields&$top=2', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }

  // Prochain code IM disponible (max + 1), en parcourant toutes les pages
  if (p.get('next_code_im') === '1') {
    let maxNum = 0;
    let url = GL + "/Immos/items?$expand=fields($select=Title)&$top=200";
    let guard = 0;
    while (url && guard < 30) {
      guard++;
      const r = await fetch(url, { headers: H });
      const d = await r.json();
      (d.value || []).forEach(it => {
        const t = (it.fields && it.fields.Title) || '';
        const m = /^IM(\d{1,6})$/.exec(t);
        if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
      });
      url = d['@odata.nextLink'] || null;
    }
    const next = 'IM' + String(maxNum + 1).padStart(6, '0');
    return json({ next_code: next, max_num: maxNum });
  }
  if (p.get('debug_resa')     === '1') { const r = await fetch(GL + '/Reservations/items?$expand=fields&$top=2', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  if (p.get('debug_transferts')=== '1') { const r = await fetch(GL + '/Transferts_En_Attente/items?$expand=fields&$top=5', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  if (p.get('debug_employes') === '1') {
    const r = await fetch(GL + '/Employes/items?$expand=fields&$top=3', { headers: H });
    const d = await r.json();
    // Endpoint de diagnostic non authentifié par conception (comme les autres ?debug_*) : ne
    // jamais faire écho au hash de mot de passe (MotDePasse), même en diagnostic — un hash PBKDF2
    // reste une donnée sensible (brute-force hors-ligne possible, hors de portée du verrou anti
    // brute-force appliqué à verify_password/set_password). Voir SECURITE_ETAT.md.
    (d.value || []).forEach(it => { if (it.fields && 'MotDePasse' in it.fields) it.fields.MotDePasse = '[redacted]'; });
    return json(d);
  }
  if (p.get('debug_mouvements')=== '1') { const r = await fetch(GL + '/Mouvements/items?$expand=fields&$top=3&$orderby=fields/Created desc', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  // Noms internes réels des colonnes (peuvent différer du nom affiché après un renommage dans SharePoint)
  if (p.get('debug_inventaire_columns') === '1') {
    const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/lists/Lignes_Inventaire/columns?$select=name,displayName', { headers: H });
    return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  // Noms internes réels des colonnes d'une liste quelconque (?debug_columns=NomDeLaListe) — utile après
  // toute création manuelle de liste côté SharePoint pour vérifier avant d'écrire dedans.
  if (p.get('debug_columns')) {
    const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/lists/' + encodeURIComponent(p.get('debug_columns')) + '/columns?$select=name,displayName', { headers: H });
    return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // ── Export JSON en lecture seule d'une liste SharePoint (sauvegarde manuelle avant migration/import
  // de masse — voir PROCEDURE_ROLLBACK.md). Protégé requireAdmin, même mécanisme de jeton HMAC que
  // les actions gated POST ; transmis ici en paramètre de requête (&token=) puisqu'il s'agit d'un GET
  // sans corps JSON. Liste blanche des listes connues du modèle de données (02_MODELE_DONNEES.md)
  // plutôt qu'un nom de liste Graph arbitraire, pour éviter toute faute de frappe silencieuse.
  if (p.get('export_liste')) {
    const _auth = await requireAdmin({ token: p.get('token') });
    if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
    // Toutes les listes Graph du modèle ; rester synchro avec dashboard.html (garde-fou tests/backup.export-structure.test.js).
    const EXPORTABLE_LISTS = ['Immos', 'Employes', 'Mouvements', 'Transferts_En_Attente', 'Reservations', 'Absences',
      'Campagnes_Inventaire', 'Lignes_Inventaire', 'Catalogue_Articles_EPI', 'Grille_Dotation_EPI', 'Dotations_EPI',
      'Lignes_Dotation_EPI', 'Catalogue_Outillage', 'Grille_Outillage', 'Lignes_Outillage', 'Materiel_IT',
      'Mouvements_Materiel_IT', 'Lignes_Telephoniques', 'Mouvements_Lignes_Telephoniques',
      'Campagnes_Inventaire_Immos', 'Scans_Inventaire_Immos', 'Journal_Audit'];
    const nomListe = p.get('export_liste');
    if (EXPORTABLE_LISTS.indexOf(nomListe) === -1) return json({ success: false, error: 'liste_inconnue', listes_valides: EXPORTABLE_LISTS }, 400);
    const res = await paginateStatus(GL + '/' + encodeURIComponent(nomListe) + '/items?$expand=fields&$top=200', 45);
    return json({ success: true, liste: nomListe, exporte_le: new Date().toISOString(), count: res.items.length, complete: res.complete, items: res.items.map(i => Object.assign({ id: i.id }, i.fields)) });
  }

  // ── Journal d'audit des actions sensibles (lecture) — Journal_Audit, ajoutée août 2026 ─────────
  // PAS un endpoint GET public comme les ~35 autres (?dashboard=1, ?employes=1...) : ce n'est pas
  // une donnée de fonctionnement courant, c'est un journal de qui a fait quoi (mots de passe,
  // droits, suppressions...). Protégé requireAdmin, même mécanisme que ?export_liste= (jeton en
  // paramètre de requête &token=, puisque c'est un GET sans corps JSON).
  if (p.get('journal_audit') === '1') {
    const _auth = await requireAdmin({ token: p.get('token') });
    if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
    const items = await paginate(GL + '/Journal_Audit/items?$expand=fields&$orderby=fields/Horodatage%20desc&$top=3000', 8);
    return json(items.map(i => {
      const f = i.fields || {};
      let detail = {};
      try { detail = f.Detail ? JSON.parse(f.Detail) : {}; } catch (e) { detail = { __raw: f.Detail || '' }; }
      return { id: i.id, horodatage: f.Horodatage || '', code_employe: f.Code_Employe || '', action: f.Action || f.Title || '', cible: f.Cible || '', detail: detail, resultat: f.Resultat || '' };
    }));
  }

  // ── Digest hebdomadaire (récapitulatif d'actions, ajouté août 2026) ─────────────────────────────
  // Consommé par un flux Power Automate planifié (voir 01_ARCHITECTURE_TECHNIQUE.md) — protégé par
  // DIGEST_TOKEN_ENV (comparaison à temps constant, pas requireAdmin : pas d'utilisateur connecté
  // derrière un flux planifié). Les données agrégées ici (Immos, Mouvements, Transferts_En_Attente,
  // Campagnes_Inventaire_Immos/Scans, catalogues EPI/Outillage) sont déjà toutes individuellement
  // publiques (?dashboard=1, ?catalogue_epi=1, ?campagnes_inventaire_immos=1...) — ce garde-fou est
  // une précaution supplémentaire (éviter un calcul lourd déclenchable par n'importe qui), pas une
  // fuite de données nouvelle qu'il faudrait combler.
  if (p.get('digest') === '1') {
    const _auth = requireDigestTokenWith(p.get('token'), DIGEST_TOKEN);
    if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'digest_token_manquant' ? 500 : 401);

    const [immoItems, movR, pendItems, campItems, scanItems, epiItems, outilItems, resaItems] = await Promise.all([
      paginate(GL + '/Immos/items?$expand=fields&$top=200', 6),
      fetch(GL + '/Mouvements/items?$expand=fields&$top=5000', { headers: H }),
      paginate(GL + '/Transferts_En_Attente/items?$expand=fields&$top=200', 5),
      paginate(GL + '/Campagnes_Inventaire_Immos/items?$expand=fields&$top=200', 5),
      paginate(GL + '/Scans_Inventaire_Immos/items?$expand=fields($select=Title,Campagne)&$top=5000', 15),
      paginate(GL + '/Catalogue_Articles_EPI/items?$expand=fields&$top=200', 5),
      paginate(GL + '/Catalogue_Outillage/items?$expand=fields&$top=200', 5),
      paginate(GL + '/Reservations/items?$expand=fields&$top=200', 5),
    ]);
    const movData = await movR.json();

    const immos = immoItems.map(i => {
      const f = i.fields || {};
      return { code_im: f.Title || '', libelle: f.Libelle || '', date_mise_service: f.Date_Mise_Service || '', date_achat: f.Date_Achat || '', valeur_achat: parseFloat(f.Valeur_Achat) || 0, compte_immobilisation: (f.Compte_Immobilisation || '').toString().trim(), actif: (f.Actif || 'Oui') !== 'Non' };
    });
    const mouvements = (movData.value || []).map(i => { const f = i.fields || {}; return { code_im: f.Title || '', type_mouvement: f.Type_Mouvement || '', horodatage: f.Horodatage || f.Created || '', code_employe: f.Code_Employe || '' }; });
    const pending = pendItems
      .filter(i => { const s = (i.fields || {}).Statut || ''; return s !== 'Validé' && s !== 'Valide' && s !== 'Refused'; })
      .map(i => { const f = i.fields || {}; return { code_im: f.Title || '', donneur_code: f.Code_Employe_Donneur || '', donneur_nom: f.Nom_Donneur || '', receveur_code: f.Code_Employe_Receveur || '', receveur_nom: f.Nom_Receveur || '', statut: f.Statut || 'En attente', horodatage: f.Created || '' }; });
    const campagnes = campItems.map(i => { const f = i.fields || {}; return { nom: f.Title || '', statut: f.Statut || 'En cours', date_debut: f.Date_Debut || '' }; });
    const scans = scanItems.map(i => { const f = i.fields || {}; return { code_im: f.Title || '', campagne: f.Campagne || '' }; });
    const catalogueEpi = epiItems.map(i => { const f = i.fields || {}; return { type_article: f.Type_Article || f.Title || '', designation: f.Designation || '', taille_affichage: f.Taille_Affichage || '', taille_salarie: f.Taille_Salarie || '', stock_actuel: f.Stock_Actuel != null ? f.Stock_Actuel : 0, stock_mini: f.Stock_Mini != null ? f.Stock_Mini : 0 }; });
    const catalogueOutillage = outilItems.map(i => { const f = i.fields || {}; return { title: f.Title || '', stock_actuel: f.Stock_Actuel != null ? f.Stock_Actuel : 0, stock_mini: f.Stock_Mini != null ? f.Stock_Mini : 0 }; });
    const reservations = resaItems.map(i => { const f = i.fields || {}; return { code_im: f.Code_IM || '', categorie: f.Categorie || '', libelle_libre: f.Libelle_Libre || '', quantite: f.Quantite != null ? f.Quantite : null, code_employe: f.Title || '', nom_employe: f.Nom_Employe || '', nom_chantier: f.Nom_Chantier || '', statut: f.Statut || 'Demandee', horodatage: f.Created || '' }; });

    const digest = buildDigest({ immos, mouvements, pending, campagnes, scans, catalogueEpi, catalogueOutillage, reservations }, Date.now(), DIGEST_SEUILS);
    const nbPoints = digest.transferts.length + digest.garanties.length + digest.pannes.length + digest.stock.epi.length + digest.stock.outillage.length + digest.campagnes.length + digest.demandes.length;
    const objet = digest.vide ? 'Immo Tracker — Digest hebdomadaire : rien à signaler' : 'Immo Tracker — Digest hebdomadaire : ' + nbPoints + ' point(s) à traiter';
    return json({ success: true, digest: digest, html: renderDigestHtml(digest), objet: objet, nb_points: nbPoints });
  }

  // ── Métadonnées achat (valeur + date) ──────────────────────────────────────
  if (p.get('immo_metadata') === '1') {
    const items = await paginate(GL + '/Immos/items?$expand=fields&$top=200', 6);
    const meta = {};
    items.forEach(i => {
      const f = i.fields || {};
      const code = f.Title || f.Code_IM || '';
      // Site : source de vérité = colonne Site de la liste Immos. Défaut 'Reunion' (transition sans régression).
      let site = (f.Site || '').trim();
      if (site) { const s = site.toLowerCase(); site = s.startsWith('may') ? 'Mayotte' : 'Reunion'; } else { site = 'Reunion'; }
      if (code) meta[code] = {
        valeur_achat: parseFloat(f.Valeur_Achat) || 0,
        date_achat:   f.Date_Achat || '',
        date_mise_service: f.Date_Mise_Service || '',
        duree_amort:  parseInt(f.Duree_Amortissement, 10) || 0,
        compte:       (f.Compte_Immobilisation || '').toString().trim(),
        compte_amort: (f.Compte_Amortissement || '').toString().trim(),
        compte_dot:   (f.Compte_Dotation || '').toString().trim(),
        n_serie:      (f.N_Serie || '').toString().trim(),
        etat:         (f.Etat || '').toString().trim(),
        site:         site,
        actif:        (f.Actif || 'Oui') !== 'Non',
        id:           i.id
      };
    });
    return json(meta);
  }

  // ── FDS map ─────────────────────────────────────────────────────────────────
  if (p.get('fds_map') === '1') {
    const items = await paginate(GL + '/Immos/items?$expand=fields&$top=200', 6);
    const map = {};
    items.forEach(i => { const f = i.fields || {}; const c = f.Code_IM || f.Title || ''; const u = f.FDS_URL || ''; if (c && u) map[c] = u; });
    return json(map);
  }

  // ── Photos map ───────────────────────────────────────────────────────────────
  if (p.get('photos_map') === '1') {
    const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Photos_Immos:/children?$select=name', { headers: { 'Authorization': 'Bearer ' + td.access_token } });
    if (r.status === 404) return json({});
    const d = await r.json();
    const map = {};
    (d.value || []).forEach(f => { map[f.name] = true; });
    return json(map);
  }

  // ── FDS proxy ────────────────────────────────────────────────────────────────
  if (p.get('fds')) {
    const code = p.get('fds');
    const ir = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + code + "'&$top=1", { headers: H });
    const id = await ir.json();
    const u = id.value && id.value[0] && id.value[0].fields ? id.value[0].fields.FDS_URL || '' : '';
    if (u.indexOf('FDS:') === 0) {
      const path = u.slice(4).split('/').map(encodeURIComponent).join('/');
      const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/FDS_Immos/' + path + ':/content', { headers: { 'Authorization': 'Bearer ' + td.access_token } });
      if (r.ok) { const buf = await r.arrayBuffer(); return new Response(buf, { status: 200, headers: { ...cors, 'Content-Type': r.headers.get('Content-Type') || 'application/pdf', 'Cache-Control': 'max-age=3600' } }); }
      return new Response('FDS non trouvee', { status: 404, headers: cors });
    }
    if (u && u.includes('sharepoint.com')) {
      const sid = 'u!' + btoa(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sr = await fetch('https://graph.microsoft.com/v1.0/shares/' + encodeURIComponent(sid) + '/driveItem/content', { headers: { 'Authorization': 'Bearer ' + td.access_token } });
      if (sr.ok) { const buf = await sr.arrayBuffer(); return new Response(buf, { status: 200, headers: { ...cors, 'Content-Type': 'application/pdf', 'Cache-Control': 'max-age=3600' } }); }
    }
    return new Response('FDS non trouvee', { status: 404, headers: cors });
  }

  // ── Photo proxy ──────────────────────────────────────────────────────────────
  if (p.get('photo')) {
    const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Photos_Immos/' + p.get('photo') + ':/content', { headers: { 'Authorization': 'Bearer ' + td.access_token } });
    if (!r.ok) return new Response('Photo non trouvee', { status: 404, headers: cors });
    return new Response(await r.arrayBuffer(), { status: 200, headers: { ...cors, 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' } });
  }

  // ── Fiche EPI émargée (photo/scan) proxy ──────────────────────────────────────
  if (p.get('fiche_epi')) {
    const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Fiches_EPI/' + p.get('fiche_epi') + ':/content', { headers: { 'Authorization': 'Bearer ' + td.access_token } });
    if (!r.ok) return new Response('Fiche non trouvee', { status: 404, headers: cors });
    return new Response(await r.arrayBuffer(), { status: 200, headers: { ...cors, 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' } });
  }

  // ── Fiche Prime d'outillage émargée (photo/scan) proxy ────────────────────────
  if (p.get('fiche_outillage')) {
    const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Fiches_Outillage/' + p.get('fiche_outillage') + ':/content', { headers: { 'Authorization': 'Bearer ' + td.access_token } });
    if (!r.ok) return new Response('Fiche non trouvee', { status: 404, headers: cors });
    return new Response(await r.arrayBuffer(), { status: 200, headers: { ...cors, 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' } });
  }

  // ── Photos liste ─────────────────────────────────────────────────────────────
  if (p.get('photos')) {
    const code = p.get('photos');
    const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Photos_Immos/' + encodeURIComponent(code) + ':/children?$select=name,id,createdDateTime,size', { headers: { 'Authorization': 'Bearer ' + td.access_token } });
    if (r.status === 404) return json([]);
    const d = await r.json();
    const photos = (d.value || []).filter(f => f.name.match(/\.(jpg|jpeg|png|webp)$/i)).map(f => ({
      name: f.name, url: 'https://immo-proxy.ral-85d.workers.dev/?photo=' + encodeURIComponent(code + '/' + f.name), created: f.createdDateTime, size: f.size
    }));
    return json(photos);
  }

  // ── Maintenance ───────────────────────────────────────────────────────────────
  if (p.get('maintenance') === '1') {
    const items = await paginate(GL + '/Immos/items?$expand=fields&$top=200', 6);
    const now = new Date(), j30 = new Date(now.getTime() + 30 * 86400000), j7 = new Date(now.getTime() + 7 * 86400000);
    const all = items.map(i => { const f = i.fields || {}; return { code_im: f.Title || '', libelle: f.Libelle || '', categorie: f.Categorie || '', date_garantie_fin: f.Date_Garantie_Fin || '', periodicite_mois: f.Periodicite_Maintenance_Mois || 0, prochaine_maintenance: f.Prochaine_Maintenance || '', prestataire_sav: f.Prestataire_SAV || '', cout_maintenance: f.Cout_Maintenance || 0, valeur_achat: parseFloat(f.Valeur_Achat) || 0, date_achat: f.Date_Achat || '' }; });
    return json({ all, maintenances_urgentes: all.filter(i => i.prochaine_maintenance && new Date(i.prochaine_maintenance) <= j7), maintenances_bientot: all.filter(i => i.prochaine_maintenance && new Date(i.prochaine_maintenance) > j7 && new Date(i.prochaine_maintenance) <= j30), garanties_bientot: all.filter(i => i.date_garantie_fin && new Date(i.date_garantie_fin) > now && new Date(i.date_garantie_fin) <= j30), garanties_expirees: all.filter(i => i.date_garantie_fin && new Date(i.date_garantie_fin) <= now) });
  }

  // ── Réservations liste ────────────────────────────────────────────────────────
  if (p.get('reservations') === '1') {
    const items = await paginate(GL + '/Reservations/items?$expand=fields&$orderby=fields/Created%20desc&$top=200', 5);
    const now = new Date();
    return json(items.map(item => {
      const f = item.fields || {};
      const fin = f.Date_Fin ? new Date(f.Date_Fin) : null;
      let statut = f.Statut || 'Demandee';
      if (statut !== 'Rendue' && statut !== 'Annulee' && statut !== 'Refusee' && fin && fin < now) statut = 'En retard';
      const noteRaw = f.Note || '';
      const initMatch = noteRaw.match(/##INIT:([^#]+)##/);
      const codeInitial = initMatch ? initMatch[1] : '';
      const noteClean = noteRaw.replace(/##INIT:[^#]+##/g, '').trim();
      return { id: item.id, code_im: f.Code_IM || '', code_im_initial: codeInitial, code_employe: f.Title || '', nom_employe: f.Nom_Employe || '', code_chantier: f.Code_Chantier || '', nom_chantier: f.Nom_Chantier || '', date_debut: f.Date_Debut || '', date_fin: f.Date_Fin || '', statut, note: noteClean, created: f.Created || '', categorie: f.Categorie || '', quantite: f.Quantite != null ? f.Quantite : null, libelle_libre: f.Libelle_Libre || '' };
    }));
  }

  // ── Absences signalées (registre à sens unique, consultable Admin/Encadrement) ──
  if (p.get('absences') === '1') {
    const items = await paginate(GL + '/Absences/items?$expand=fields&$orderby=fields/Created%20desc&$top=500', 5);
    return json(items.map(i => {
      const f = i.fields || {};
      return { code_employe: f.Title || '', code_declarant: f.Code_Declarant || '', date_absence: f.Date_Absence || '', motif: f.Motif || '', site: f.Site || '', horodatage: f.Horodatage || f.Created || '' };
    }));
  }

  // ── Campagnes d'inventaire de stock (articles/consommables) ─────────────────
  if (p.get('campagnes_inventaire') === '1') {
    const [campItems, ligneItems] = await Promise.all([
      paginate(GL + '/Campagnes_Inventaire/items?$expand=fields&$orderby=fields/Created%20desc&$top=200', 5),
      paginate(GL + '/Lignes_Inventaire/items?$expand=fields($select=Title)&$top=5000', 15)
    ]);
    const counts = {};
    ligneItems.forEach(i => { const c = (i.fields || {}).Title || ''; counts[c] = (counts[c] || 0) + 1; });
    return json(campItems.map(i => {
      const f = i.fields || {};
      return { id: i.id, nom: f.Title || '', date_debut: f.Date_Debut || '', date_fin: f.Date_Fin || '', statut: f.Statut || 'En cours', cree_par: f.Cree_Par || '', cloture_par: f.Cloture_Par || '', date_cloture: f.Date_Cloture || '', nb_lignes: counts[f.Title || ''] || 0 };
    }));
  }

  // Lignes d'une campagne d'inventaire donnée (nom passé tel quel, filtré côté Worker pour éviter tout souci d'échappement OData)
  if (p.get('lignes_inventaire')) {
    const nom = p.get('lignes_inventaire');
    const items = await paginate(GL + '/Lignes_Inventaire/items?$expand=fields&$top=5000', 15);
    return json(items.filter(i => (i.fields || {}).Title === nom).map(i => {
      const f = i.fields || {};
      return { id: i.id, campagne: f.Title || '', zone: f.Zone || '', site: f.Site || '', chantier: f.Chantier || '', fabriquant: f.Fabricant || '', reference: f.Reference || '', designation: f.Designation || '', quantite: f.Quantite || 0, chute_cable: f.Chute_Cable === 'Oui', observations: f.Observations || '', code_employe: f.Code_Employe || '', horodatage: f.Horodatage || f.Created || '' };
    }));
  }

  // ── Campagne d'inventaire physique des IMMOBILISATIONS par scan QR (à ne pas confondre avec
  // Campagnes_Inventaire/Lignes_Inventaire ci-dessus, qui portent sur le stock d'articles/
  // consommables — deux sujets distincts, voir 04_HISTORIQUE_DECISIONS.md). Une ligne de
  // Scans_Inventaire_Immos = un événement "vu, par untel, à telle date" ; jamais de Mouvement créé
  // (pas d'effet sur le détenteur courant, purement un relevé de présence physique comparé après
  // coup à la localisation théorique déjà déduite du dernier Mouvement ailleurs dans l'app).
  if (p.get('campagnes_inventaire_immos') === '1') {
    const [campItems, scanItems] = await Promise.all([
      paginate(GL + '/Campagnes_Inventaire_Immos/items?$expand=fields&$orderby=fields/Created%20desc&$top=200', 5),
      paginate(GL + '/Scans_Inventaire_Immos/items?$expand=fields($select=Title,Campagne)&$top=5000', 15)
    ]);
    const counts = {};
    scanItems.forEach(i => { const c = (i.fields || {}).Campagne || ''; counts[c] = (counts[c] || 0) + 1; });
    return json(campItems.map(i => {
      const f = i.fields || {};
      return { id: i.id, nom: f.Title || '', date_debut: f.Date_Debut || '', date_fin: f.Date_Fin || '', statut: f.Statut || 'En cours', cree_par: f.Cree_Par || '', cloture_par: f.Cloture_Par || '', date_cloture: f.Date_Cloture || '', nb_scans: counts[f.Title || ''] || 0 };
    }));
  }

  // Scans d'une campagne donnée (nom passé tel quel, filtré côté Worker comme pour lignes_inventaire)
  if (p.get('scans_inventaire_immos')) {
    const nom = p.get('scans_inventaire_immos');
    const items = await paginate(GL + '/Scans_Inventaire_Immos/items?$expand=fields&$top=5000', 15);
    return json(items.filter(i => (i.fields || {}).Campagne === nom).map(i => {
      const f = i.fields || {};
      return { id: i.id, code_im: f.Title || '', campagne: f.Campagne || '', code_employe: f.Code_Employe || '', nom_employe: f.Nom_Employe || '', site: f.Site || '', horodatage: f.Horodatage || f.Created || '' };
    }));
  }

  // ── Module EPI : catalogue, grille de dotation, fiches ──────────────────────
  if (p.get('catalogue_epi') === '1') {
    const items = await paginate(GL + '/Catalogue_Articles_EPI/items?$expand=fields&$top=200', 5);
    return json(items.map(i => {
      const f = i.fields || {};
      return { id: i.id, type_article: f.Type_Article || f.Title || '', taille_salarie: f.Taille_Salarie || '', taille_affichage: f.Taille_Affichage || '', reference: f.Reference || '', designation: f.Designation || '', fournisseur: f.Fournisseur || '', stock_actuel: f.Stock_Actuel != null ? f.Stock_Actuel : 0, stock_mini: f.Stock_Mini != null ? f.Stock_Mini : 0 };
    }));
  }

  if (p.get('grille_dotation_epi') === '1') {
    const items = await paginate(GL + '/Grille_Dotation_EPI/items?$expand=fields&$top=200', 5);
    return json(items.map(i => {
      const f = i.fields || {};
      return { id: i.id, affectation: f.Title || '', type_article: f.Type_Article || '', quantite: f.Quantite || 0 };
    }));
  }

  if (p.get('dotations_epi') === '1') {
    const items = await paginate(GL + '/Dotations_EPI/items?$expand=fields&$orderby=fields/Created%20desc&$top=1000', 10);
    let mapped = items.map(i => {
      const f = i.fields || {};
      return { id: i.id, code: f.Title || '', type_dotation: f.Type_Dotation || '', annee_civile: f.Annee_Civile || null, nom_destinataire: f.Nom_Destinataire || '', site: f.Site || '', statut: f.Statut || 'Generee', genere_par: f.Genere_Par || '', genere_le: f.Genere_Le || '', emarge_par: f.Emarge_Par || '', emarge_le: f.Emarge_Le || '', photo_fiche: f.Photo_Fiche || '' };
    });
    const codeF = p.get('code'); const anneeF = p.get('annee');
    if (codeF) mapped = mapped.filter(d => d.code === codeF);
    if (anneeF) mapped = mapped.filter(d => String(d.annee_civile) === anneeF);
    return json(mapped);
  }

  // Lignes d'une fiche de dotation donnée (id passé tel quel, filtré côté Worker)
  if (p.get('lignes_dotation_epi')) {
    const dotId = p.get('lignes_dotation_epi');
    const items = await paginate(GL + '/Lignes_Dotation_EPI/items?$expand=fields&$top=2000', 10);
    return json(items.filter(i => (i.fields || {}).Title === dotId).map(i => {
      const f = i.fields || {};
      return { id: i.id, type_article: f.Type_Article || '', taille_article: f.Taille_Article || '', reference_article: f.Reference_Article || '', quantite: f.Quantite || 0 };
    }));
  }

  // Toutes les lignes de dotation EPI en un seul appel (avec dotation_id) — utilisé par la vue
  // "Consommation par année" de l'onglet Historique, pour éviter un appel par fiche.
  if (p.get('lignes_dotation_epi_toutes') === '1') {
    const items = await paginate(GL + '/Lignes_Dotation_EPI/items?$expand=fields&$top=2000', 10);
    return json(items.map(i => {
      const f = i.fields || {};
      return { id: i.id, dotation_id: f.Title || '', type_article: f.Type_Article || '', taille_article: f.Taille_Article || '', reference_article: f.Reference_Article || '', quantite: f.Quantite || 0 };
    }));
  }

  // ── Module Prime d'outillage : catalogue, grille, lignes de distribution ────
  if (p.get('catalogue_outillage') === '1') {
    const items = await paginate(GL + '/Catalogue_Outillage/items?$expand=fields&$top=200', 5);
    return json(items.map(i => {
      const f = i.fields || {};
      return { id: i.id, type_article: f.Title || '', reference: f.Reference || '', distributeur: f.Distributeur || '', marque: f.Marque || '', prix_unitaire: f.Prix_Unitaire != null ? f.Prix_Unitaire : 0, stock_actuel: f.Stock_Actuel != null ? f.Stock_Actuel : 0, stock_mini: f.Stock_Mini != null ? f.Stock_Mini : 0, duree_amortissement_mois: f.Duree_Amortissement_Mois || 0 };
    }));
  }

  if (p.get('grille_outillage') === '1') {
    const items = await paginate(GL + '/Grille_Outillage/items?$expand=fields&$top=200', 5);
    return json(items.map(i => {
      const f = i.fields || {};
      return { id: i.id, service: f.Title || '', type_article: f.Type_Article || '', quantite: f.Quantite || 0 };
    }));
  }

  if (p.get('lignes_outillage') === '1') {
    const items = await paginate(GL + '/Lignes_Outillage/items?$expand=fields&$top=5000', 15);
    let mapped = items.map(i => {
      const f = i.fields || {};
      return { id: i.id, code: f.Title || '', type_article: f.Type_Article || '', date_remise: f.Date_Remise || '', emarge_par: f.Emarge_Par || '', photo_fiche: f.Photo_Fiche || '', lot_distribution: f.Lot_Distribution || '' };
    });
    const codeF = p.get('code');
    if (codeF) mapped = mapped.filter(l => l.code === codeF);
    return json(mapped);
  }

  // ── Module Matériel IT (téléphones, puis ordinateurs) — hors circuit immobilisations,
  // détenteur courant dérivé du dernier Mouvement_Materiel_IT par appareil (même principe que
  // Mouvements/Immos, mais sans le workflow panne/réservation, pas nécessaire ici) ───────────
  // Protégé requireGarant (jeton en paramètre `&token=`, GET sans corps JSON — même mécanisme que
  // `?export_liste=`) : contrairement aux autres endpoints GET publics de ce fichier, celui-ci
  // renvoie des codes PIN/PUK/RIO/déverrouillage SIM réels (Materiel_IT.Code_PIN etc.), une classe
  // de sensibilité différente d'une simple donnée de localisation d'immo — un tiers connaissant
  // ces codes peut usurper une ligne (portabilité RIO) ou débloquer une carte SIM. Ce module est
  // 100% dashboard (aucun écran PWA), donc ce garde-fou ne touche jamais le modèle de confiance de
  // la PWA terrain. Voir SECURITE_ETAT.md et l'audit de sécurité du 9 août 2026.
  if (p.get('materiel_it') === '1') {
    const _auth = await requireGarant({ token: p.get('token') });
    if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
    const [items, mouvements] = await Promise.all([
      paginate(GL + '/Materiel_IT/items?$expand=fields&$top=500', 8),
      paginate(GL + '/Mouvements_Materiel_IT/items?$expand=fields&$top=2000', 10)
    ]);
    const mvByCode = {};
    mouvements.forEach(i => {
      const f = i.fields || {};
      const code = f.Title || '';
      const h = f.Horodatage || f.Created || '';
      if (!mvByCode[code] || new Date(h) > new Date(mvByCode[code].horodatage)) {
        mvByCode[code] = { code_employe: f.Code_Employe || '', nom_detenteur: f.Nom_Detenteur || '', horodatage: h };
      }
    });
    return json(items.map(i => {
      const f = i.fields || {};
      const code = f.Title || '';
      const det = mvByCode[code] || null;
      return {
        id: i.id, code, type_materiel: f.Type_Materiel || '', marque: f.Marque || '', modele: f.Modele || '',
        n_serie: f.N_Serie || '', site: f.Site || '', statut: f.Statut || 'En service',
        date_sortie_service: f.Date_Sortie_Service || '', cout_mensuel: f.Cout_Mensuel != null ? f.Cout_Mensuel : 0,
        n_telephone: f.N_Telephone || '', operateur: f.Operateur || '', n_carte_sim: f.N_Carte_SIM || '',
        code_pin: f.Code_PIN || '', code_puk: f.Code_PUK || '', code_rio: f.Code_RIO || '', code_deverrouillage: f.Code_deverouillage || '',
        commentaire: f.Commentaire || '',
        detenteur_code: det ? det.code_employe : '', detenteur_nom: det ? det.nom_detenteur : '', depuis: det ? det.horodatage : ''
      };
    }));
  }

  if (p.get('mouvements_materiel_it')) {
    const code = p.get('mouvements_materiel_it');
    const items = await paginate(GL + "/Mouvements_Materiel_IT/items?$expand=fields&$top=2000", 10);
    const mapped = items.filter(i => (i.fields || {}).Title === code).map(i => {
      const f = i.fields || {};
      return { id: i.id, code_employe: f.Code_Employe || '', nom_detenteur: f.Nom_Detenteur || '', note: f.Note || '', horodatage: f.Horodatage || f.Created || '' };
    }).sort((a, b) => new Date(b.horodatage) - new Date(a.horodatage));
    return json(mapped);
  }

  if (p.get('next_code_materiel_it')) {
    const prefixe = (p.get('next_code_materiel_it') || 'TEL').toUpperCase().replace(/[^A-Z]/g, '') || 'TEL';
    let maxNum = 0;
    const items = await paginate(GL + "/Materiel_IT/items?$expand=fields($select=Title)&$top=200", 10);
    items.forEach(it => {
      const t = (it.fields && it.fields.Title) || '';
      const m = new RegExp('^' + prefixe + '(\\d{1,6})$').exec(t);
      if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
    });
    const next = prefixe + String(maxNum + 1).padStart(6, '0');
    return json({ next_code: next, max_num: maxNum });
  }

  // ── Lignes téléphoniques (ajouté août 2026) — entité indépendante du téléphone (Materiel_IT) :
  // un employé peut garder sa ligne en changeant d'appareil, ou l'inverse. Même principe de
  // détenteur courant dérivé du dernier mouvement, calqué sur Materiel_IT/Mouvements_Materiel_IT.
  // Même garde-fou que `?materiel_it=1` ci-dessus (mêmes champs sensibles : PIN/PUK/RIO SIM).
  if (p.get('lignes_telephoniques') === '1') {
    const _auth = await requireGarant({ token: p.get('token') });
    if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
    const [items, mouvements] = await Promise.all([
      paginate(GL + '/Lignes_Telephoniques/items?$expand=fields&$top=500', 8),
      paginate(GL + '/Mouvements_Lignes_Telephoniques/items?$expand=fields&$top=2000', 10)
    ]);
    const mvByCode = {};
    mouvements.forEach(i => {
      const f = i.fields || {};
      const code = f.Title || '';
      const h = f.Horodatage || f.Created || '';
      if (!mvByCode[code] || new Date(h) > new Date(mvByCode[code].horodatage)) {
        mvByCode[code] = { code_employe: f.Code_Employe || '', nom_detenteur: f.Nom_Detenteur || '', horodatage: h };
      }
    });
    return json(items.map(i => {
      const f = i.fields || {};
      const code = f.Title || '';
      const det = mvByCode[code] || null;
      return {
        id: i.id, code, n_telephone: f.N_Telephone || '', operateur: f.Operateur || '', n_carte_sim: f.N_Carte_SIM || '',
        code_pin: f.Code_PIN || '', code_puk: f.Code_PUK || '', code_rio: f.Code_RIO || '',
        site: f.Site || '', statut: f.Statut || 'Active', commentaire: f.Commentaire || '',
        detenteur_code: det ? det.code_employe : '', detenteur_nom: det ? det.nom_detenteur : '', depuis: det ? det.horodatage : ''
      };
    }));
  }

  if (p.get('mouvements_lignes_telephoniques')) {
    const code = p.get('mouvements_lignes_telephoniques');
    const items = await paginate(GL + "/Mouvements_Lignes_Telephoniques/items?$expand=fields&$top=2000", 10);
    const mapped = items.filter(i => (i.fields || {}).Title === code).map(i => {
      const f = i.fields || {};
      return { id: i.id, code_employe: f.Code_Employe || '', nom_detenteur: f.Nom_Detenteur || '', note: f.Note || '', horodatage: f.Horodatage || f.Created || '' };
    }).sort((a, b) => new Date(b.horodatage) - new Date(a.horodatage));
    return json(mapped);
  }

  if (p.get('next_code_ligne_tel')) {
    let maxNum = 0;
    const items = await paginate(GL + "/Lignes_Telephoniques/items?$expand=fields($select=Title)&$top=500", 10);
    items.forEach(it => {
      const t = (it.fields && it.fields.Title) || '';
      const m = /^LIG(\d{1,6})$/.exec(t);
      if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
    });
    return json({ next_code: 'LIG' + String(maxNum + 1).padStart(6, '0'), max_num: maxNum });
  }

  // ── Réservations par employé ──────────────────────────────────────────────────
  if (p.get('mes_reservations')) {
    const code = p.get('mes_reservations');
    const r = await fetch(GL + "/Reservations/items?$expand=fields&$filter=fields/Title eq '" + code + "'&$orderby=fields/Created%20desc&$top=100", { headers: H });
    if (!r.ok) return json([]);
    const d = await r.json();
    const now = new Date();
    return json((d.value || []).map(item => {
      const f = item.fields || {};
      const fin = f.Date_Fin ? new Date(f.Date_Fin) : null;
      let statut = f.Statut || 'Demandee';
      if (statut !== 'Rendue' && statut !== 'Annulee' && statut !== 'Refusee' && fin && fin < now) statut = 'En retard';
      const noteRaw = f.Note || '';
      const initMatch = noteRaw.match(/##INIT:([^#]+)##/);
      return { id: item.id, code_im: f.Code_IM || '', code_im_initial: initMatch ? initMatch[1] : '', code_employe: f.Title || '', nom_employe: f.Nom_Employe || '', code_chantier: f.Code_Chantier || '', nom_chantier: f.Nom_Chantier || '', date_debut: f.Date_Debut || '', date_fin: f.Date_Fin || '', statut, note: noteRaw.replace(/##INIT:[^#]+##/g, '').trim(), categorie: f.Categorie || '', quantite: f.Quantite != null ? f.Quantite : null, libelle_libre: f.Libelle_Libre || '' };
    }));
  }

  // ── Liste des employés (avec rôle/statut) ─────────────────────────────────────
  // Ne renvoie plus de nom depuis le 4cb2990+1 (pseudonymisation d'employes.json, voir
  // 04_HISTORIQUE_DECISIONS.md) : la résolution nom<->code passe désormais exclusivement par
  // l'endpoint dédié ?noms_employes=1 (protégé par vérification d'origine + limitation de débit),
  // pas par cet endpoint-ci qui reste public et sans aucune de ces deux protections.
  if (p.get('employes') === '1') {
    const items = await paginate(GL + '/Employes/items?$expand=fields&$top=200', 5);
    const mapped = items.map(i => {
      const f = i.fields || {};
      return {
        code: f.Title || f.Code || f.Code_Employe || '',
        poste: f.Poste || '',
        // Code_CT réutilisé comme champ "Droits"
        role: f.Code_CT || f.Droits || '',
        // Site de rattachement (Reunion/Mayotte). Défaut Reunion si vide.
        site: (function(){ var s=(f.Site||'').trim().toLowerCase(); return s.startsWith('may')?'Mayotte':(s?'Reunion':''); })(),
        // Actif employé : stocké dans field_2 ("Oui"/"Non"). Défaut actif si vide.
        actif: (function(){ var a=(f.field_2||'').trim().toLowerCase(); return a==='non'||a==='no'||a==='false'?false:true; })(),
        // Un mot de passe est-il défini ? (booléen uniquement — le hash n'est JAMAIS exposé)
        has_password: !!(f.MotDePasse && String(f.MotDePasse).trim()),
        // Module EPI : affectation (C/M/Z/A, vide = non concerné) + tailles telles que communiquées
        affectation_epi: f.Affectation_EPI || '',
        taille_pantalon: f.Taille_Pantalon || '',
        taille_tshirt: f.Taille_Tshirt || '',
        taille_veste: f.Taille_Veste || '',
        pointure_chaussures: f.Pointure_Chaussures || '',
        taille_gants: f.Taille_Gants || '',
        // Module Prime d'outillage : service concerné ('Travaux Neufs'/'Maintenance'), indépendant de l'affectation EPI
        service_outillage: f.Service_Outillage || '',
        itemId: i.id // nécessaire pour les mises à jour PATCH
      };
    });
    // Déduplication par code (la liste SharePoint peut contenir des doublons).
    // On garde en priorité l'occurrence qui a un rôle renseigné.
    const byCode = {};
    mapped.forEach(e => {
      if (!e.code) return;
      const ex = byCode[e.code];
      if (!ex) { byCode[e.code] = e; return; }
      // Préférer celle avec un rôle défini, puis mot de passe, puis site
      const score = (x) => (x.role ? 4 : 0) + (x.has_password ? 2 : 0) + (x.site ? 1 : 0);
      if (score(e) > score(ex)) byCode[e.code] = e;
    });
    return json(Object.values(byCode));
  }

  // ── Résolution de noms (endpoint dédié, minimal) — ajouté lors de la pseudonymisation
  // d'employes.json (voir 04_HISTORIQUE_DECISIONS.md) ────────────────────────────────────────
  // Sépare la résolution code→nom (seul besoin des menus déroulants terrain de la PWA et de
  // l'affichage dashboard une fois employes.json/immos.json réduits aux codes) du reste des
  // données de ?employes=1 (rôle, site, actif, mot de passe défini...), qui n'ont pas à transiter
  // par ce chemin volontairement minimal. Toujours non authentifié (contrainte terrain, voir
  // NOM_LOOKUP_ATTEMPTS ci-dessus) mais protégé par la vérification d'origine + le verrou par IP —
  // ?employes=1 lui n'a aucune de ces deux protections, à traiter séparément si besoin.
  if (p.get('noms_employes') === '1') {
    if (!origineReconnue(request)) return json({ error: 'origine_non_reconnue' }, 403);
    if (nomLookupRateLimited(clientIpFrom(request))) return json({ error: 'trop_de_requetes' }, 429);
    const items = await paginate(GL + '/Employes/items?$expand=fields&$top=200', 5);
    const byCode = {};
    items.forEach(i => {
      const f = i.fields || {};
      const code = f.Title || f.Code || f.Code_Employe || '';
      if (!code || byCode[code]) return;
      byCode[code] = { code: code, nom: f.field_1 || f.Nom || f.Nom_Employe || f.Name || '' };
    });
    return json(Object.values(byCode));
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  if (p.get('dashboard') === '1') {
    const [movR, pendR] = await Promise.all([
      fetch(GL + '/Mouvements/items?$expand=fields&$top=5000', { headers: H }),
      fetch(GL + '/Transferts_En_Attente/items?$expand=fields&$top=200', { headers: H }) // Pas de filtre OData, filtre JS côté client
    ]);
    const movData  = await movR.json();
    const pendData = await pendR.json();
    // Résolveur de noms (résout les doublons type "CONI" vs "COUTAREL Nicolas")
    const vraiNom = await getNomResolver();

    const allMovRaw = (movData.value || []).map(i => { const code = i.fields.Code_Employe || ''; return { code_im: i.fields.Title || '', code_employe: code, nom_employe: vraiNom(code, i.fields.Commentaire || ''), type_mouvement: i.fields.Type_Mouvement || '', code_chantier: i.fields.Code_Chantier || '', etat: i.fields.Etat || '', note: i.fields.Note || '', cout_reparation: (i.fields.Cout_Reparation!=null && i.fields.Cout_Reparation!=='')?i.fields.Cout_Reparation:null, photos: parsePhotosField(i.fields.Photos), horodatage: i.fields.Horodatage || i.fields.Created || '' }; });
    const allMov = allMovRaw.sort((a, b) => new Date(b.horodatage) - new Date(a.horodatage));

    // Filtrer les transferts en attente côté JS (évite les problèmes OData)
    const pending = (pendData.value || [])
      .filter(i => { const s = (i.fields || {}).Statut || ''; return s !== 'Validé' && s !== 'Valide' && s !== 'Refused'; })
      // note : marqueur ##PHOTOS:...## (voir action `transfert`) retiré de l'affichage, jamais montré tel
      // quel — les noms de fichiers sont exposés séparément dans `photos` pour un futur usage éventuel.
      .map(i => ({ id: i.id, code_im: i.fields.Title || '', donneur_code: i.fields.Code_Employe_Donneur || '', donneur_nom: i.fields.Nom_Donneur || '', receveur_code: i.fields.Code_Employe_Receveur || '', receveur_nom: i.fields.Nom_Receveur || '', etat: i.fields.Etat || '', note: stripPhotosMarker(i.fields.Note || ''), photos: extractPhotosMarker(i.fields.Note), statut: i.fields.Statut || 'En attente', horodatage: i.fields.Created || '' }));

    // ── Inventaire courant : dernier mouvement de POSSESSION par immo ──────────
    // Important : une déclaration de panne (Panne / Suivi_Panne) ou un enregistrement
    // d'entretien (Entretien) n'est PAS un changement de possession. L'immo reste
    // avec son dernier détenteur réel jusqu'à un vrai Transfert, Retour, ou
    // Réparation (résolution de panne = retour dépôt).
    const inv = {};
    allMov.forEach(m => {
      if (inv[m.code_im]) return; // déjà déterminé par un mouvement plus récent
      if (m.type_mouvement === 'Panne' || m.type_mouvement === 'Suivi_Panne' || m.type_mouvement === 'Entretien') return; // ignoré pour la possession
      const isGest = GESTIONNAIRES.includes(m.code_employe);
      // Une Réparation = la panne est résolue = l'immo revient au dépôt, quel que soit l'admin qui a traité
      const isRetour = m.type_mouvement === 'Retour' || m.type_mouvement === 'Réparation' || (m.code_chantier || '').indexOf('DEPOT') === 0 || isGest;
      inv[m.code_im] = { code_im: m.code_im, statut: isRetour ? 'Au depot' : 'En circulation', detenteur_code: isRetour ? 'DEPOT' : m.code_employe, detenteur_nom: isRetour ? 'Depot' : m.nom_employe, etat: m.etat || 'Inconnu', note: m.note || '', since: m.horodatage, dernier_mouvement: m.type_mouvement };
    });

    // ── Détection des pannes actives + prestataire éventuel (localisation spéciale) ──
    const lastPanneByCode = {}; const lastRepByCode = {};
    allMov.forEach(m => {
      if (m.type_mouvement === 'Panne' && !lastPanneByCode[m.code_im]) lastPanneByCode[m.code_im] = m;
      if (m.type_mouvement === 'Réparation' && !lastRepByCode[m.code_im]) lastRepByCode[m.code_im] = m;
    });
    Object.keys(lastPanneByCode).forEach(code => {
      const lp = lastPanneByCode[code]; const lr = lastRepByCode[code];
      const panneActive = !lr || new Date(lp.horodatage) > new Date(lr.horodatage);
      if (!panneActive || !inv[code]) return;
      // Chercher le prestataire le plus récent renseigné depuis la déclaration de panne
      let presta = null; let prestaSince = lp.horodatage;
      for (const m of allMov) {
        if (m.code_im !== code) continue;
        if (new Date(m.horodatage) < new Date(lp.horodatage)) break; // avant la panne : on arrête
        const match = (m.note || '').match(/##PRESTA:([^#]+)##/);
        if (match) { presta = match[1]; prestaSince = m.horodatage; break; }
      }
      if (presta) {
        inv[code].statut = 'Chez prestataire';
        inv[code].detenteur_code = 'PRESTA';
        inv[code].detenteur_nom = 'Prestataire : ' + presta;
        inv[code].since = prestaSince;
      } else {
        inv[code].en_panne = true; // le détenteur affiché reste le dernier réel, juste signalé
      }
    });

    const inventory      = Object.values(inv);
    const enCirc         = inventory.filter(i => i.statut === 'En circulation');
    const auDepot        = inventory.filter(i => i.statut === 'Au depot');
    const chezPrestataire= inventory.filter(i => i.statut === 'Chez prestataire');
    const horsService    = inventory.filter(i => i.etat === 'Hors service');
    const now         = Date.now();
    const alertes     = pending.filter(t => (now - new Date(t.horodatage).getTime()) > 86400000);

    const etats = ['Neuf', 'Bon état', 'Usé', 'Abîmé', 'Hors service'];
    const parEtat = {};
    etats.forEach(e => { parEtat[e] = inventory.filter(i => i.etat === e).length; });
    parEtat['Inconnu'] = inventory.filter(i => !etats.includes(i.etat)).length;

    const detMap = {};
    enCirc.forEach(i => { if (!detMap[i.detenteur_code]) detMap[i.detenteur_code] = { nom: i.detenteur_nom, count: 0 }; detMap[i.detenteur_code].count++; });
    const durMap = {};
    enCirc.forEach(i => { const d = i.since ? (now - new Date(i.since).getTime()) / 3600000 : 0; if (!durMap[i.detenteur_code]) durMap[i.detenteur_code] = { nom: i.detenteur_nom, h: 0, n: 0 }; durMap[i.detenteur_code].h += d; durMap[i.detenteur_code].n++; });
    const moyenneJ = enCirc.length ? Math.round(enCirc.reduce((a, i) => a + (i.since ? (now - new Date(i.since).getTime()) / 86400000 : 0), 0) / enCirc.length * 10) / 10 : 0;

    return json({ inventory, en_circulation: enCirc, au_depot: auDepot, chez_prestataire: chezPrestataire, pending, hors_service: horsService, all_movements: allMov,
      top_detenteurs: Object.values(detMap).sort((a, b) => b.count - a.count).slice(0, 10),
      classement_duree: Object.keys(durMap).map(code => ({ code, nom: durMap[code].nom, count: durMap[code].n, moyenneJours: Math.round(durMap[code].h / durMap[code].n / 24 * 10) / 10, totalJours: Math.round(durMap[code].h / 24 * 10) / 10 })).sort((a, b) => b.moyenneJours - a.moyenneJours).slice(0, 10),
      stats: { total_mouvementes: inventory.length, total_mouvements: allMov.length, en_circulation: enCirc.length, au_depot: auDepot.length, chez_prestataire: chezPrestataire.length, transferts_en_attente: pending.length, par_etat: parEtat, alertes_delai: alertes.length, hors_service: horsService.length, moyenne_jours_hors_depot: moyenneJ }
    });
  }

  // ── GET simples ───────────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const immo      = p.get('immo');
    const employe   = p.get('employe');
    const transferts= p.get('transferts');

    if (transferts) {
      const r = await fetch(GL + "/Transferts_En_Attente/items?$expand=fields&$filter=fields/Code_Employe_Receveur eq '" + transferts + "'&$top=50", { headers: H });
      const d = await r.json();
      return json((d.value || []).filter(i => { const s = (i.fields || {}).Statut || ''; return s !== 'Validé' && s !== 'Valide'; }).map(i => ({ id: i.id, code_im: i.fields.Title || '', code_employe_donneur: i.fields.Code_Employe_Donneur || '', nom_donneur: i.fields.Nom_Donneur || '', etat: i.fields.Etat || '', note: stripPhotosMarker(i.fields.Note || ''), horodatage: i.fields.Created || '' })));
    }

    if (immo) {
      const all = await paginate(GL + '/Mouvements/items?$expand=fields&$orderby=fields/Created%20desc&$top=2000', 3);
      const q = immo.toUpperCase();
      const resolveNom = await getNomResolver();
      return json(all.map(i => { const code = i.fields.Code_Employe || ''; return { code_im: i.fields.Title || '', code_employe: code, nom_employe: resolveNom(code, i.fields.Commentaire || ''), type_mouvement: i.fields.Type_Mouvement || '', code_chantier: i.fields.Code_Chantier || '', etat: i.fields.Etat || '', note: i.fields.Note || '', cout_reparation: (i.fields.Cout_Reparation!=null && i.fields.Cout_Reparation!=='')?i.fields.Cout_Reparation:null, horodatage: i.fields.Horodatage || i.fields.Created || '' }; }).filter(m => m.code_im.toUpperCase().includes(q)));
    }

    if (employe) {
      const all = await paginate(GL + '/Mouvements/items?$expand=fields&$orderby=fields/Created%20desc&$top=2000', 3);
      const resolveNom = await getNomResolver();
      const movs = all.map(i => { const code = i.fields.Code_Employe || ''; return { code_im: i.fields.Title || '', code_employe: code, nom_employe: resolveNom(code, i.fields.Commentaire || ''), type_mouvement: i.fields.Type_Mouvement || '', code_chantier: i.fields.Code_Chantier || '', etat: i.fields.Etat || '', note: i.fields.Note || '', cout_reparation: (i.fields.Cout_Reparation!=null && i.fields.Cout_Reparation!=='')?i.fields.Cout_Reparation:null, horodatage: i.fields.Horodatage || i.fields.Created || '' }; });
      const seen = {}, actuel = [];
      // Une Panne/Suivi_Panne/Entretien n'est pas un changement de possession : on l'ignore pour déterminer le détenteur actuel
      movs.forEach(m => {
        if (m.type_mouvement === 'Panne' || m.type_mouvement === 'Suivi_Panne' || m.type_mouvement === 'Entretien') return;
        if (!seen[m.code_im]) { seen[m.code_im] = true; if (m.code_employe === employe && m.type_mouvement !== 'Retour' && m.type_mouvement !== 'Réparation' && (m.code_chantier || '').indexOf('DEPOT') !== 0 && !GESTIONNAIRES.includes(m.code_employe)) actuel.push(m); }
      });
      return json({ actuel, historique: movs.filter(m => m.code_employe === employe) });
    }

    const all = await paginate(GL + '/Mouvements/items?$expand=fields&$orderby=fields/Created%20desc&$top=2000', 3);
    const resolveNomAll = await getNomResolver();
    return json(all.map(i => { const code = i.fields.Code_Employe || ''; return { code_im: i.fields.Title || '', code_employe: code, nom_employe: resolveNomAll(code, i.fields.Commentaire || ''), type_mouvement: i.fields.Type_Mouvement || '', code_chantier: i.fields.Code_Chantier || '', etat: i.fields.Etat || '', note: i.fields.Note || '', cout_reparation: (i.fields.Cout_Reparation!=null && i.fields.Cout_Reparation!=='')?i.fields.Cout_Reparation:null, horodatage: i.fields.Horodatage || i.fields.Created || '' }; }));
  }

  // ── POST ──────────────────────────────────────────────────────────────────────
  if (request.method === 'POST') {
    const action = p.get('action');
    const body   = await request.json();

    // Point d'insertion unique du journal d'audit (voir plus bas, juste après l'appel à
    // dispatchPost()) : TOUS les blocs d'action ci-dessous restent EXACTEMENT comme avant, aucun
    // n'a été modifié individuellement pour ce besoin — seule cette fonction englobante a été
    // ajoutée. Elle capture la Response déjà produite par le bloc exécuté (clonée, jamais
    // consommée deux fois) pour journaliser après coup sans toucher à la logique métier de chacun
    // des 62 blocs gated. Voir 04_HISTORIQUE_DECISIONS.md pour le raisonnement complet.
    const dispatchPost = async () => {

    // ── Vérifier un mot de passe (login dashboard) ──
    if (action === 'verify_password') {
      const code = (body.code || '').trim();
      if (!code) return json({ success: false, error: 'code_manquant' });
      const items = await getEmployeAuth(code);
      if (!items.length) return json({ success: false, error: 'employe_introuvable' });
      // Un mot de passe est-il défini (sur au moins une occurrence) ?
      const withHash = items.find(it => it.hash);
      if (!withHash) return json({ success: false, needs_setup: true });
      // Sonde du dashboard (etapeMotDePasse()) pour savoir si un mot de passe existe déjà, avant
      // même que l'utilisateur ait tapé quoi que ce soit — ne doit ni compter comme une tentative,
      // ni être bloquée par un verrou déjà en cours (voir LOGIN_PROBE_SENTINEL plus haut).
      if (body.password === LOGIN_PROBE_SENTINEL) return json({ success: false, needs_setup: false });
      // Verrou anti brute-force persistant (Cloudflare KV si provisionné, sinon repli mémoire
      // automatique — voir loginLockStatusAsync/SECURITE_ETAT.md). Seul verify_password lit KV.
      const lock = await loginLockStatusAsync(code);
      // Échec de connexion journalisé sans identité vérifiée (aucune session n'existe à ce stade) :
      // Code_Employe reste vide, `code` (celui tapé, pas garanti être le bon employé) va dans Cible
      // — cohérent avec la règle "Code_Employe jamais depuis le corps de la requête", qui porte sur
      // l'ATTRIBUTION d'une action, pas sur le suivi d'une tentative de connexion anonyme par nature.
      if (lock.locked) { await logAudit({ code: '', action: 'verify_password', cible: code, detail: { motif: 'verrou_actif' }, success: false }); return json({ success: false, error: 'trop_de_tentatives', retry_after_s: lock.retryAfterS }, 429); }
      const ok = await verifyPassword(body.password || '', withHash.hash);
      if (!ok) { await registerLoginFailureAsync(code); await logAudit({ code: '', action: 'verify_password', cible: code, detail: { motif: 'mot_de_passe_incorrect' }, success: false }); return json({ success: false, needs_setup: false }); }
      await clearLoginAttemptsAsync(code);
      const token = await signSession(code, withHash.role);
      return json({ success: true, needs_setup: false, token: token, role: withHash.role || '' });
    }

    // ── Définir / changer un mot de passe ──
    if (action === 'set_password') {
      const code = (body.code || '').trim();
      const pwd = body.password || '';
      if (!code) return json({ success: false, error: 'invalide' });
      // Règle relevée à 8 caractères (voir PASSWORD_MIN_LENGTH) : ne s'applique qu'ici, à la création
      // ou au changement d'un mot de passe — jamais à la vérification (verify_password, plus haut),
      // pour ne jamais casser un compte existant créé avant ce durcissement.
      if (pwd.length < PASSWORD_MIN_LENGTH) return json({ success: false, error: 'mot_de_passe_trop_court', min_length: PASSWORD_MIN_LENGTH });
      const items = await getEmployeAuth(code);
      if (!items.length) return json({ success: false, error: 'employe_introuvable' });
      // Si un mot de passe existe déjà, exiger l'ancien pour pouvoir le changer soi-même. La SEULE
      // façon légitime de contourner cette vérification est qu'un admin l'ait déjà effacé au
      // préalable via l'action `reset_password` (requireAdmin, ci-dessous) — auquel cas `withHash`
      // est naturellement absent ici, sans avoir besoin d'un indicateur envoyé par le client.
      // Avant durcissement, un flag `body.is_reset` non authentifié permettait de sauter cette
      // vérification sans passer par `reset_password` : n'importe qui connaissant le code d'un
      // employé pouvait écraser son mot de passe sans connaître l'ancien. Retiré (voir SECURITE_ETAT.md).
      const withHash = items.find(it => it.hash);
      if (withHash) {
        const lock = loginLockStatus(code);
        if (lock.locked) return json({ success: false, error: 'trop_de_tentatives', retry_after_s: lock.retryAfterS }, 429);
        const ok = await verifyPassword(body.old_password || '', withHash.hash);
        if (!ok) { registerLoginFailure(code); return json({ success: false, error: 'ancien_incorrect' }); }
        clearLoginAttempts(code);
      }
      const newHash = await hashPassword(pwd);
      // Écrire le hash sur TOUTES les occurrences du code (robuste aux doublons résiduels)
      let okCount = 0;
      for (const it of items) {
        try { const r = await fetch(GL + '/Employes/items/' + it.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ MotDePasse: newHash }) }); if (r.ok) okCount++; } catch (e) {}
      }
      if (okCount === 0) return json({ success: false });
      const role = (items.find(it => it.role) || {}).role || '';
      const token = await signSession(code, role);
      return json({ success: true, token: token, role: role });
    }

    // ── Réinitialiser un mot de passe (efface le hash → l'employé en recrée un) ──
    if (action === 'reset_password') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      if (body.confirm !== 'ESR-CONFIRME') return json({ success: false, error: 'confirmation_requise' });
      const code = (body.code || '').trim();
      const items = await getEmployeAuth(code);
      if (!items.length) return json({ success: false, error: 'employe_introuvable' });
      let okCount = 0;
      for (const it of items) {
        try { const r = await fetch(GL + '/Employes/items/' + it.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ MotDePasse: '' }) }); if (r.ok) okCount++; } catch (e) {}
      }
      // Un admin qui réinitialise le mot de passe efface aussi un éventuel verrou en cours sur ce
      // code : sinon l'employé resterait bloqué par ses propres échecs même après l'intervention.
      // Efface mémoire ET KV (voir clearLoginAttemptsAsync) : un verrou posé par verify_password
      // peut désormais vivre dans KV, pas seulement en mémoire — une action admin ponctuelle comme
      // celle-ci n'est pas concernée par la contrainte "pas de latence KV hors verify_password"
      // (elle ne s'exécute qu'à la demande explicite d'un admin, jamais à chaque connexion).
      if (okCount > 0) await clearLoginAttemptsAsync(code);
      return json({ success: okCount > 0 });
    }

    if (action === 'upload_photo') {
      try {
        const codeImP = (body.code_im || '').trim();
        const filename = (body.filename || (Date.now() + '.jpg')).toString().trim();
        if (!codeImP || !isValidPhotoFilename(filename)) return json({ success: false, error: 'nom_fichier_invalide' });
        const b64 = (body.data || '').includes(',') ? body.data.split(',')[1] : body.data;
        if (!b64) return json({ success: false, error: 'donnees_invalides' });
        let bytes;
        try { bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); } catch (e) { return json({ success: false, error: 'donnees_invalides' }); }
        // Garde-fous contre l'abus de cette action non authentifiée (voir commentaire plus haut,
        // section "Photos de mouvement") : taille max stricte + signature JPEG réelle vérifiée,
        // le Content-Type déclaré par le client n'étant jamais fiable en soi.
        if (bytes.length > MAX_PHOTO_BYTES) return json({ success: false, error: 'fichier_trop_volumineux', max_bytes: MAX_PHOTO_BYTES });
        if (!isValidJpegBytes(bytes)) return json({ success: false, error: 'type_fichier_invalide' });
        const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Photos_Immos/' + encodeURIComponent(codeImP) + '/' + encodeURIComponent(filename) + ':/content', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + td.access_token, 'Content-Type': 'image/jpeg' }, body: bytes.buffer });
        return json({ success: r.ok, url: r.ok ? 'https://immo-proxy.ral-85d.workers.dev/?photo=' + encodeURIComponent(codeImP + '/' + filename) : null });
      } catch (e) { return json({ success: false, error: e.message }); }
    }

    // Upload d'une FDS (fiche de données de sécurité) pour une immo : stocke le fichier dans le drive
    // SharePoint puis marque FDS_URL sur l'immo avec un repère "FDS:code/filename" — le proxy de lecture
    // (?fds=code) sert alors le fichier directement depuis le drive, sans passer par un lien de partage.
    if (action === 'upload_fds') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const codeIm = (body.code_im || '').trim().toUpperCase();
      if (!codeIm || !body.data) return json({ success: false, error: 'donnees_invalides' });
      try {
        const b64 = (body.data || '').includes(',') ? body.data.split(',')[1] : body.data;
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const filename = body.filename || (Date.now() + '.pdf');
        const putRes = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/FDS_Immos/' + encodeURIComponent(codeIm) + '/' + encodeURIComponent(filename) + ':/content', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + td.access_token, 'Content-Type': body.mime || 'application/pdf' }, body: bytes.buffer });
        if (!putRes.ok) return json({ success: false, error: 'upload_echec' });
        const ir = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + codeIm.replace(/'/g, "''") + "'&$top=1", { headers: H });
        const idata = await ir.json();
        const itemId = idata.value && idata.value[0] ? idata.value[0].id : null;
        if (!itemId) return json({ success: false, error: 'immo_introuvable' });
        const marker = 'FDS:' + codeIm + '/' + filename;
        const pr = await fetch(GL + '/Immos/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ FDS_URL: marker }) });
        return json({ success: pr.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'delete_photo') {
      const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Photos_Immos/' + encodeURIComponent(body.code_im) + '/' + encodeURIComponent(body.filename), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + td.access_token } });
      return json({ success: r.ok });
    }

    // ── Mettre à jour le rôle/droits d'un employé ──
    if (action === 'maj_droits') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      let itemId = body.item_id;
      if (!itemId) {
        // Retrouver l'item par code (essai Title puis Code)
        const cur = await fetch(GL + "/Employes/items?$expand=fields&$filter=fields/Title eq '" + body.code + "'&$top=1", { headers: H });
        const curData = await cur.json();
        itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
        if (!itemId) {
          const cur2 = await fetch(GL + "/Employes/items?$expand=fields&$filter=fields/Code eq '" + body.code + "'&$top=1", { headers: H });
          const curData2 = await cur2.json();
          itemId = curData2.value && curData2.value[0] ? curData2.value[0].id : null;
        }
      }
      if (!itemId) return json({ success: false, error: 'employe_introuvable', code: body.code });
      // Écrire dans Code_CT (réutilisé comme "Droits") — tenter les deux noms de colonnes possibles
      let ok = false;
      try {
        const r = await fetch(GL + '/Employes/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Code_CT: body.role }) });
        ok = r.ok;
        if (!ok) { const r2 = await fetch(GL + '/Employes/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Droits: body.role }) }); ok = r2.ok; }
      } catch (e) { ok = false; }
      return json({ success: ok, item_id: itemId });
    }

    // ── Mettre à jour le site de rattachement d'un employé ──
    if (action === 'maj_site_employe') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      let itemId = body.item_id;
      if (!itemId) {
        const cur = await fetch(GL + "/Employes/items?$expand=fields&$filter=fields/Title eq '" + body.code + "'&$top=1", { headers: H });
        const curData = await cur.json();
        itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
      }
      if (!itemId) return json({ success: false, error: 'employe_introuvable', code: body.code });
      const site = (body.site === 'Mayotte') ? 'Mayotte' : 'Reunion';
      let ok = false;
      try {
        const r = await fetch(GL + '/Employes/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Site: site }) });
        ok = r.ok;
      } catch (e) { ok = false; }
      return json({ success: ok, item_id: itemId, site: site });
    }

    // ── Mettre à jour l'emplacement (site) d'une immo ──
    // ── Ajouter une immobilisation ──
    if (action === 'ajouter_immo') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code_im || '').trim().toUpperCase();
      if (!/^IM\d{6}$/.test(code)) return json({ success: false, error: 'code_invalide', message: 'Le code doit être au format IMxxxxxx (6 chiffres).' });
      // Vérification anti-doublon BLOQUANTE
      const dup = await fetch(GL + "/Immos/items?$filter=fields/Title eq '" + code + "'&$top=1", { headers: H });
      const dupData = await dup.json();
      if ((dupData.value || []).length > 0) return json({ success: false, error: 'doublon', message: 'Le code ' + code + ' existe déjà.' });
      // Construire les champs (seuls les champs fournis sont écrits)
      const f = { Title: code };
      if (body.libelle) f.Libelle = body.libelle;
      if (body.categorie) f.Categorie = body.categorie;
      if (body.n_serie) f.N_Serie = body.n_serie;
      if (body.etat) f.Etat = body.etat;
      if (body.valeur_achat != null && body.valeur_achat !== '') f.Valeur_Achat = Number(body.valeur_achat);
      if (body.date_achat) f.Date_Achat = body.date_achat;
      if (body.date_mise_service) f.Date_Mise_Service = body.date_mise_service;
      if (body.compte_amortissement) f.Compte_Amortissement = body.compte_amortissement;
      if (body.compte_dotation) f.Compte_Dotation = body.compte_dotation;
      if (body.compte_immobilisation) f.Compte_Immobilisation = body.compte_immobilisation;
      if (body.duree_amort != null && body.duree_amort !== '') f.Duree_Amortissement = parseInt(body.duree_amort, 10) || null;
      f.Site = (body.site === 'Mayotte') ? 'Mayotte' : 'Reunion';
      f.Actif = 'Oui';
      try {
        const r = await fetch(GL + '/Immos/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: f }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, code: code, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import en masse : fixe l'affectation courante (détenteur) d'une immo déjà existante en créant
    // directement un Mouvement (Transfert vers un détenteur, ou Retour vers DEPOT) — hors flux "en attente
    // de validation", utilisé par l'import fichier du dashboard (immos ajoutées "déjà sur le terrain").
    if (action === 'importer_affectation_immo') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const codeIm = (body.code_im || '').trim().toUpperCase();
      if (!codeIm) return json({ success: false, error: 'donnees_invalides' });
      try {
        const versDepot = !body.code_employe || body.code_employe === 'DEPOT';
        const f = versDepot
          ? { Title: codeIm, Code_Employe: '', Type_Mouvement: 'Retour', Code_Chantier: 'DEPOT', Commentaire: 'Depot', Etat: body.etat || '', Note: body.note || 'Affectation importée', Horodatage: new Date().toISOString() }
          : { Title: codeIm, Code_Employe: body.code_employe, Type_Mouvement: 'Transfert', Code_Chantier: '', Commentaire: body.nom_employe || body.code_employe, Etat: body.etat || '', Note: body.note || 'Affectation importée', Horodatage: new Date().toISOString() };
        const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: f }) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Ajouter un employé ──
    if (action === 'ajouter_employe') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code || '').trim().toUpperCase();
      if (!code || code.length < 2) return json({ success: false, error: 'code_invalide', message: 'Code employé requis (min. 2 caractères).' });
      // Anti-doublon BLOQUANT
      const dup = await fetch(GL + "/Employes/items?$filter=fields/Title eq '" + code + "'&$top=1", { headers: H });
      const dupData = await dup.json();
      if ((dupData.value || []).length > 0) return json({ success: false, error: 'doublon', message: 'Le code ' + code + ' existe déjà.' });
      const f = { Title: code };
      if (body.nom) f.field_1 = body.nom;            // nom complet
      f.field_2 = 'Oui';                              // (champ existant Oui/Non)
      if (body.poste) f.Poste = body.poste;
      if (body.role) f.Code_CT = body.role;           // rôle / droits
      f.Site = (body.site === 'Mayotte') ? 'Mayotte' : 'Reunion';
      // Statut actif = field_2 (déjà positionné à 'Oui' ci-dessus). La liste Employes n'a pas de colonne 'Actif'.
      try {
        const r = await fetch(GL + '/Employes/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: f }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, code: code, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Mettre à jour la durée d'amortissement d'une immo ──
    // ── Mise à jour groupée d'immos (migration EBP) via Graph $batch ──
    if (action === 'bulk_patch_immos') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const patches = body.patches || []; // [{id, fields}, ...] max 20
      if (!patches.length) return json({ success: false, error: 'aucun_patch' });
      const requests = patches.slice(0, 20).map((pp, idx) => ({
        id: String(idx),
        method: 'PATCH',
        url: "/sites/" + SITE_ID + "/lists/Immos/items/" + pp.id + "/fields",
        headers: { 'Content-Type': 'application/json' },
        body: pp.fields
      }));
      try {
        const r = await fetch('https://graph.microsoft.com/v1.0/$batch', {
          method: 'POST', headers: H, body: JSON.stringify({ requests })
        });
        const rd = await r.json();
        const resp = rd.responses || [];
        let ok = 0, ko = 0; const errs = [];
        resp.forEach(x => { if (x.status >= 200 && x.status < 300) ok++; else { ko++; if (errs.length < 3) errs.push({ status: x.status, body: x.body }); } });
        return json({ success: ko === 0, ok: ok, ko: ko, erreurs: errs });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'bulk_maj_immos') { return json({ success: false, error: 'deprecated' }); }

    // Orpheline (0 appel côté dashboard.html/app.js) depuis le passage à la durée d'amortissement
    // 100% automatique par compte d'amortissement (voir 02_MODELE_DONNEES.md/04_HISTORIQUE...) —
    // laissée exécutable et sans authentification jusqu'à l'audit de sécurité d'août 2026
    // (ARCHITECTURE_GLOBALE.md § 7), qui a signalé un endpoint d'écriture public sans utilité
    // fonctionnelle. Retirée sur le même modèle que `bulk_maj_immos` ci-dessus plutôt que
    // supprimée : le nom d'action reste réservé (au cas où un appel resterait en cache quelque
    // part) mais ne fait plus rien.
    if (action === 'maj_duree_amort') { return json({ success: false, error: 'deprecated' }); }

    if (action === 'maj_site_immo') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code_im || '').trim();
      if (!code) return json({ success: false, error: 'code_manquant' });
      const site = (body.site === 'Mayotte') ? 'Mayotte' : 'Reunion';
      // Retrouver toutes les occurrences (robuste aux doublons)
      const cur = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + code + "'&$top=10", { headers: H });
      const curData = await cur.json();
      const ids = (curData.value || []).map(i => i.id);
      if (!ids.length) return json({ success: false, error: 'immo_introuvable', code: code });
      let okCount = 0;
      for (const id of ids) {
        try { const r = await fetch(GL + '/Immos/items/' + id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Site: site }) }); if (r.ok) okCount++; } catch (e) {}
      }
      return json({ success: okCount > 0, site: site, maj: okCount });
    }
    // ── Nettoyage des doublons d'employés (garde 1 ligne par code) ──
    if (action === 'dedupe_employes') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      if (body.confirm !== 'ESR-CONFIRME') return json({ success: false, error: 'confirmation_requise' });
      const emp = await paginate(GL + '/Employes/items?$expand=fields&$top=300', 6);
      // Grouper par code (Title)
      const groupes = {};
      emp.forEach(i => { const f = i.fields || {}; const c = f.Title || f.Code || ''; if (c) (groupes[c] = groupes[c] || []).push(i); });
      // Pour chaque groupe, garder l'item le plus complet (rôle+site), supprimer les autres
      const aSupprimer = [];
      for (const code in groupes) {
        const items = groupes[code];
        if (items.length <= 1) continue;
        const score = (it) => { const f = it.fields || {}; return (f.Code_CT ? 2 : 0) + (f.Site ? 1 : 0); };
        items.sort((a, b) => score(b) - score(a) || (parseInt(a.id, 10) - parseInt(b.id, 10)));
        // items[0] est gardé, le reste supprimé
        for (let k = 1; k < items.length; k++) aSupprimer.push(items[k].id);
      }
      // Supprimer par lots de 20 via $batch
      const relBase = '/sites/' + SITE_ID + '/lists/Employes/items/';
      let supprimes = 0; const erreurs = [];
      for (let i = 0; i < aSupprimer.length; i += 20) {
        const chunk = aSupprimer.slice(i, i + 20);
        const requests = chunk.map((id, idx) => ({ id: String(idx), method: 'DELETE', url: relBase + id }));
        try {
          const rb = await fetch('https://graph.microsoft.com/v1.0/$batch', { method: 'POST', headers: H, body: JSON.stringify({ requests }) });
          const rbData = await rb.json();
          (rbData.responses || []).forEach(resp => { if (resp.status >= 200 && resp.status < 300) supprimes++; else erreurs.push(resp.status); });
        } catch (e) { erreurs.push('batch_exception'); }
      }
      return json({ success: true, doublons_trouves: aSupprimer.length, supprimes, erreurs });
    }

    // ── Basculer Actif / Inactif d'un employé ──
    if (action === 'maj_actif') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      let itemId = body.item_id;
      if (!itemId) {
        const cur = await fetch(GL + "/Employes/items?$expand=fields&$filter=fields/Title eq '" + body.code + "'&$top=1", { headers: H });
        const curData = await cur.json();
        itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
      }
      if (!itemId) return json({ success: false, error: 'employe_introuvable', code: body.code });
      const val = body.actif ? 'Oui' : 'Non';
      let ok = false;
      try {
        const r = await fetch(GL + '/Employes/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ field_2: val }) });
        ok = r.ok;
      } catch (e) { ok = false; }
      return json({ success: ok, item_id: itemId, actif: val });
    }

    // ── SEED : appliquer les sites aux immos (one-shot) ──
    if (action === 'seed_immo_sites') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      if (body.confirm !== 'ESR-CONFIRME') return json({ success: false, error: 'confirmation_requise' });
      const SITES = {"IM000018":"Reunion","IM000021":"Reunion","IM000178":"Reunion","IM000179":"Reunion","IM000180":"Reunion","IM000182":"Reunion","IM000204":"Reunion","IM000210":"Reunion","IM000809":"Reunion","IM000810":"Reunion","IM000928":"Reunion","IM000929":"Reunion","IM000931":"Reunion","IM001153":"Reunion","IM001154":"Reunion","IM001155":"Reunion","IM001156":"Reunion","IM001157":"Reunion","IM001158":"Reunion","IM001159":"Reunion","IM001025":"Reunion","IM000009":"Reunion","IM000037":"Reunion","IM000047":"Reunion","IM000064":"Reunion","IM000076":"Reunion","IM000078":"Reunion","IM000080":"Reunion","IM000087":"Reunion","IM000102":"Reunion","IM000148":"Reunion","IM000174":"Reunion","IM000226":"Mayotte","IM000227":"Reunion","IM000228":"Reunion","IM000229":"Reunion","IM000230":"Reunion","IM000232":"Reunion","IM000234":"Reunion","IM000237":"Reunion","IM000238":"Reunion","IM000240":"Reunion","IM000241":"Reunion","IM000242":"Reunion","IM000247":"Reunion","IM000250":"Reunion","IM000251":"Reunion","IM000252":"Mayotte","IM000253":"Reunion","IM000265":"Reunion","IM000281":"Reunion","IM000319":"Mayotte","IM000322":"Reunion","IM000323":"Reunion","IM000331":"Reunion","IM000350":"Mayotte","IM000351":"Reunion","IM000352":"Reunion","IM000353":"Reunion","IM000362":"Reunion","IM000363":"Reunion","IM000364":"Reunion","IM000365":"Reunion","IM000367":"Reunion","IM000400":"Reunion","IM000401":"Reunion","IM000403":"Mayotte","IM000404":"Reunion","IM000405":"Reunion","IM000407":"Reunion","IM000408":"Reunion","IM000409":"Reunion","IM000410":"Reunion","IM000411":"Reunion","IM000415":"Reunion","IM000416":"Mayotte","IM000445":"Mayotte","IM000446":"Reunion","IM000455":"Reunion","IM000459":"Mayotte","IM000460":"Mayotte","IM000462":"Reunion","IM000464":"Reunion","IM000465":"Reunion","IM000466":"Reunion","IM000467":"Reunion","IM000468":"Reunion","IM000482":"Reunion","IM000486":"Reunion","IM000487":"Reunion","IM000502":"Reunion","IM000503":"Reunion","IM000507":"Reunion","IM000515":"Reunion","IM000516":"Reunion","IM000517":"Reunion","IM000518":"Reunion","IM000519":"Reunion","IM000527":"Reunion","IM000528":"Reunion","IM000531":"Reunion","IM000532":"Reunion","IM000533":"Reunion","IM000534":"Reunion","IM000535":"Reunion","IM000536":"Reunion","IM000541":"Reunion","IM000542":"Reunion","IM000543":"Reunion","IM000556":"Reunion","IM000557":"Reunion","IM000560":"Reunion","IM000561":"Reunion","IM000562":"Reunion","IM000563":"Reunion","IM000564":"Reunion","IM000565":"Reunion","IM000567":"Mayotte","IM000568":"Mayotte","IM000569":"Mayotte","IM000582":"Reunion","IM000583":"Reunion","IM000584":"Reunion","IM000585":"Reunion","IM000591":"Reunion","IM000600":"Reunion","IM000603":"Reunion","IM000614":"Mayotte","IM000615":"Mayotte","IM000616":"Mayotte","IM000637":"Reunion","IM000640":"Reunion","IM000642":"Reunion","IM000652":"Reunion","IM000660":"Mayotte","IM000661":"Mayotte","IM000676":"Reunion","IM000687":"Reunion","IM000688":"Reunion","IM000699":"Mayotte","IM000700":"Mayotte","IM000701":"Mayotte","IM000702":"Mayotte","IM000703":"Mayotte","IM000704":"Mayotte","IM000705":"Mayotte","IM000706":"Mayotte","IM000718":"Reunion","IM000720":"Reunion","IM000725":"Mayotte","IM000758":"Reunion","IM000766":"Mayotte","IM000775":"Mayotte","IM000776":"Mayotte","IM000777":"Mayotte","IM000781":"Reunion","IM000782":"Mayotte","IM000783":"Mayotte","IM000784":"Mayotte","IM000785":"Mayotte","IM000786":"Mayotte","IM000787":"Mayotte","IM000788":"Mayotte","IM000815":"Reunion","IM000832":"Reunion","IM000835":"Reunion","IM000857":"Reunion","IM000869":"Reunion","IM000890":"Reunion","IM000894":"Reunion","IM000895":"Reunion","IM000905":"Reunion","IM000909":"Reunion","IM000917":"Reunion","IM000918":"Reunion","IM000919":"Reunion","IM000932":"Reunion","IM000933":"Reunion","IM000934":"Reunion","IM000935":"Reunion","IM000936":"Reunion","IM000937":"Reunion","IM000938":"Reunion","IM000939":"Reunion","IM000942":"Reunion","IM000943":"Reunion","IM000944":"Reunion","IM000945":"Reunion","IM000946":"Reunion","IM000950":"Reunion","IM000951":"Reunion","IM000952":"Reunion","IM000953":"Reunion","IM000954":"Reunion","IM000955":"Reunion","IM000956":"Reunion","IM000957":"Reunion","IM001029":"Reunion","IM001030":"Reunion","IM001031":"Reunion","IM001041":"Reunion","IM001042":"Reunion","IM001043":"Reunion","IM001044":"Reunion","IM001056":"Reunion","IM001057":"Reunion","IM001062":"Reunion","IM001088":"Reunion","IM001089":"Reunion","IM001090":"Reunion","IM001091":"Reunion","IM001092":"Reunion","IM001104":"Reunion","IM001105":"Reunion","IM001106":"Reunion","IM001107":"Reunion","IM001108":"Reunion","IM001109":"Reunion","IM001110":"Reunion","IM001111":"Reunion","IM001112":"Reunion","IM001113":"Reunion","IM001114":"Reunion","IM001115":"Reunion","IM001117":"Reunion","IM001119":"Reunion","IM001120":"Reunion","IM001121":"Reunion","IM001122":"Reunion","IM001123":"Mayotte","IM001124":"Mayotte","IM001125":"Mayotte","IM001133":"Reunion","IM001151":"Reunion","IM001161":"Reunion","IM001162":"Reunion","IM000046":"Reunion","IM000058":"Reunion","IM000105":"Reunion","IM000137":"Reunion","IM000146":"Reunion","IM000156":"Reunion","IM000162":"Reunion","IM000194":"Reunion","IM000222":"Reunion","IM000243":"Reunion","IM000245":"Reunion","IM000254":"Reunion","IM000255":"Reunion","IM000269":"Reunion","IM000293":"Mayotte","IM000318":"Reunion","IM000337":"Mayotte","IM000349":"Reunion","IM000357":"Reunion","IM000372":"Mayotte","IM000387":"Reunion","IM000427":"Reunion","IM000431":"Reunion","IM000432":"Reunion","IM000434":"Reunion","IM000436":"Reunion","IM000437":"Reunion","IM000438":"Reunion","IM000440":"Reunion","IM000442":"Reunion","IM000443":"Reunion","IM000456":"Reunion","IM000470":"Reunion","IM000476":"Reunion","IM000485":"Reunion","IM000499":"Reunion","IM000520":"Reunion","IM000523":"Reunion","IM000524":"Reunion","IM000529":"Mayotte","IM000537":"Reunion","IM000538":"Reunion","IM000539":"Reunion","IM000544":"Reunion","IM000551":"Reunion","IM000552":"Reunion","IM000553":"Reunion","IM000554":"Reunion","IM000555":"Reunion","IM000570":"Reunion","IM000608":"Reunion","IM000609":"Reunion","IM000610":"Reunion","IM000636":"Reunion","IM000638":"Reunion","IM000639":"Reunion","IM000647":"Reunion","IM000648":"Reunion","IM000669":"Reunion","IM000670":"Reunion","IM000684":"Reunion","IM000696":"Reunion","IM000722":"Mayotte","IM000727":"Mayotte","IM000728":"Mayotte","IM000737":"Reunion","IM000738":"Reunion","IM000739":"Reunion","IM000742":"Reunion","IM000743":"Reunion","IM000744":"Reunion","IM000745":"Reunion","IM000746":"Reunion","IM000748":"Reunion","IM000749":"Reunion","IM000759":"Reunion","IM000773":"Reunion","IM000778":"Mayotte","IM000779":"Mayotte","IM000780":"Mayotte","IM000801":"Reunion","IM000802":"Reunion","IM000803":"Reunion","IM000804":"Reunion","IM000833":"Reunion","IM000837":"Reunion","IM000864":"Reunion","IM000865":"Reunion","IM000866":"Reunion","IM000867":"Reunion","IM000877":"Mayotte","IM000891":"Reunion","IM000892":"Reunion","IM000893":"Reunion","IM000912":"Reunion","IM000914":"Reunion","IM000915":"Reunion","IM000926":"Reunion","IM000941":"Reunion","IM001026":"Reunion","IM001058":"Reunion","IM001059":"Reunion","IM001152":"Reunion","IM000024":"Reunion","IM000025":"Reunion","IM000029":"Reunion","IM000054":"Reunion","IM000055":"Reunion","IM000060":"Mayotte","IM000062":"Reunion","IM000063":"Reunion","IM000071":"Reunion","IM000113":"Reunion","IM000118":"Reunion","IM000135":"Reunion","IM000139":"Reunion","IM000140":"Reunion","IM000145":"Reunion","IM000166":"Reunion","IM000167":"Reunion","IM000168":"Reunion","IM000186":"Reunion","IM000189":"Reunion","IM000198":"Reunion","IM000203":"Reunion","IM000206":"Reunion","IM000207":"Reunion","IM000208":"Reunion","IM000211":"Reunion","IM000212":"Reunion","IM000213":"Reunion","IM000214":"Reunion","IM000216":"Reunion","IM000217":"Reunion","IM000220":"Reunion","IM000221":"Reunion","IM000257":"Reunion","IM000258":"Reunion","IM000263":"Reunion","IM000264":"Reunion","IM000266":"Reunion","IM000268":"Reunion","IM000270":"Reunion","IM000271":"Reunion","IM000274":"Reunion","IM000275":"Reunion","IM000276":"Reunion","IM000277":"Reunion","IM000278":"Reunion","IM000279":"Reunion","IM000280":"Reunion","IM000282":"Mayotte","IM000283":"Reunion","IM000284":"Reunion","IM000285":"Mayotte","IM000286":"Reunion","IM000289":"Reunion","IM000290":"Reunion","IM000291":"Reunion","IM000292":"Reunion","IM000294":"Reunion","IM000303":"Reunion","IM000304":"Reunion","IM000305":"Reunion","IM000306":"Reunion","IM000308":"Reunion","IM000309":"Reunion","IM000310":"Reunion","IM000311":"Reunion","IM000312":"Mayotte","IM000313":"Reunion","IM000314":"Reunion","IM000320":"Mayotte","IM000321":"Mayotte","IM000325":"Reunion","IM000326":"Reunion","IM000327":"Reunion","IM000328":"Reunion","IM000329":"Reunion","IM000330":"Reunion","IM000334":"Reunion","IM000348":"Reunion","IM000354":"Reunion","IM000355":"Reunion","IM000358":"Reunion","IM000360":"Reunion","IM000366":"Mayotte","IM000373":"Mayotte","IM000374":"Mayotte","IM000375":"Mayotte","IM000377":"Mayotte","IM000391":"Mayotte","IM000392":"Mayotte","IM000393":"Reunion","IM000394":"Mayotte","IM000395":"Mayotte","IM000396":"Mayotte","IM000397":"Mayotte","IM000399":"Reunion","IM000402":"Reunion","IM000417":"Mayotte","IM000418":"Mayotte","IM000419":"Mayotte","IM000420":"Mayotte","IM000421":"Reunion","IM000422":"Reunion","IM000424":"Reunion","IM000425":"Reunion","IM000426":"Reunion","IM000428":"Reunion","IM000429":"Reunion","IM000430":"Reunion","IM000433":"Reunion","IM000435":"Reunion","IM000448":"Reunion","IM000452":"Reunion","IM000457":"Mayotte","IM000458":"Mayotte","IM000469":"Reunion","IM000471":"Reunion","IM000472":"Reunion","IM000474":"Reunion","IM000475":"Mayotte","IM000479":"Reunion","IM000480":"Reunion","IM000481":"Reunion","IM000483":"Reunion","IM000488":"Reunion","IM000489":"Reunion","IM000492":"Reunion","IM000497":"Reunion","IM000498":"Reunion","IM000501":"Reunion","IM000508":"Reunion","IM000509":"Reunion","IM000510":"Reunion","IM000511":"Reunion","IM000512":"Reunion","IM000513":"Reunion","IM000514":"Reunion","IM000521":"Reunion","IM000522":"Reunion","IM000530":"Mayotte","IM000540":"Reunion","IM000545":"Reunion","IM000546":"Reunion","IM000558":"Reunion","IM000559":"Reunion","IM000566":"Mayotte","IM000571":"Mayotte","IM000572":"Mayotte","IM000573":"Mayotte","IM000574":"Mayotte","IM000575":"Reunion","IM000576":"Reunion","IM000586":"Reunion","IM000587":"Reunion","IM000588":"Reunion","IM000594":"Reunion","IM000595":"Reunion","IM000596":"Reunion","IM000597":"Reunion","IM000598":"Reunion","IM000599":"Reunion","IM000604":"Reunion","IM000611":"Mayotte","IM000612":"Mayotte","IM000613":"Mayotte","IM000617":"Mayotte","IM000632":"Reunion","IM000633":"Reunion","IM000634":"Reunion","IM000635":"Reunion","IM000644":"Mayotte","IM000645":"Mayotte","IM000646":"Reunion","IM000649":"Reunion","IM000650":"Reunion","IM000651":"Reunion","IM000662":"Reunion","IM000663":"Reunion","IM000664":"Reunion","IM000665":"Reunion","IM000672":"Reunion","IM000673":"Reunion","IM000674":"Reunion","IM000675":"Reunion","IM000677":"Reunion","IM000678":"Reunion","IM000697":"Reunion","IM000707":"Reunion","IM000708":"Mayotte","IM000710":"Mayotte","IM000711":"Mayotte","IM000712":"Mayotte","IM000713":"Mayotte","IM000714":"Mayotte","IM000715":"Mayotte","IM000716":"Mayotte","IM000717":"Reunion","IM000719":"Reunion","IM000723":"Mayotte","IM000724":"Mayotte","IM000726":"Reunion","IM000729":"Mayotte","IM000730":"Mayotte","IM000731":"Mayotte","IM000732":"Mayotte","IM000733":"Mayotte","IM000736":"Reunion","IM000740":"Reunion","IM000741":"Reunion","IM000750":"Reunion","IM000751":"Reunion","IM000752":"Reunion","IM000753":"Reunion","IM000754":"Reunion","IM000755":"Reunion","IM000756":"Reunion","IM000757":"Reunion","IM000760":"Reunion","IM000761":"Reunion","IM000767":"Reunion","IM000768":"Reunion","IM000769":"Reunion","IM000770":"Reunion","IM000772":"Reunion","IM000774":"Mayotte","IM000789":"Mayotte","IM000790":"Mayotte","IM000791":"Mayotte","IM000792":"Mayotte","IM000793":"Mayotte","IM000794":"Mayotte","IM000795":"Mayotte","IM000796":"Mayotte","IM000797":"Mayotte","IM000798":"Mayotte","IM000805":"Reunion","IM000806":"Mayotte","IM000811":"Reunion","IM000812":"Reunion","IM000813":"Reunion","IM000814":"Reunion","IM000816":"Reunion","IM000819":"Reunion","IM000820":"Reunion","IM000823":"Reunion","IM000825":"Reunion","IM000830":"Reunion","IM000834":"Reunion","IM000838":"Reunion","IM000839":"Reunion","IM000840":"Reunion","IM000843":"Reunion","IM000844":"Reunion","IM000848":"Reunion","IM000849":"Mayotte","IM000850":"Reunion","IM000851":"Reunion","IM000852":"Reunion","IM000853":"Reunion","IM000854":"Reunion","IM000855":"Reunion","IM000856":"Reunion","IM000862":"Reunion","IM000863":"Reunion","IM000868":"Reunion","IM000872":"Reunion","IM000873":"Reunion","IM000874":"Reunion","IM000875":"Mayotte","IM000876":"Mayotte","IM000878":"Reunion","IM000879":"Reunion","IM000880":"Reunion","IM000881":"Reunion","IM000882":"Reunion","IM000885":"Reunion","IM000886":"Reunion","IM000887":"Reunion","IM000888":"Reunion","IM000896":"Reunion","IM000907":"Reunion","IM000908":"Reunion","IM000920":"Reunion","IM000921":"Reunion","IM000922":"Reunion","IM000923":"Reunion","IM000924":"Reunion","IM000925":"Reunion","IM000927":"Reunion","IM000947":"Reunion","IM000948":"Reunion","IM000964":"Reunion","IM000965":"Reunion","IM000966":"Reunion","IM000967":"Reunion","IM000968":"Reunion","IM000969":"Reunion","IM000970":"Reunion","IM000971":"Reunion","IM000972":"Reunion","IM000973":"Reunion","IM000974":"Reunion","IM000975":"Reunion","IM000976":"Reunion","IM000977":"Reunion","IM000978":"Reunion","IM000979":"Reunion","IM000980":"Reunion","IM000981":"Reunion","IM000982":"Reunion","IM000983":"Reunion","IM000984":"Reunion","IM000985":"Reunion","IM000986":"Reunion","IM000987":"Reunion","IM000988":"Reunion","IM000989":"Reunion","IM000990":"Reunion","IM000991":"Reunion","IM000992":"Reunion","IM000993":"Reunion","IM000994":"Reunion","IM000995":"Reunion","IM000996":"Reunion","IM000997":"Reunion","IM000998":"Reunion","IM000999":"Reunion","IM001000":"Reunion","IM001001":"Reunion","IM001002":"Reunion","IM001003":"Reunion","IM001004":"Reunion","IM001005":"Reunion","IM001006":"Reunion","IM001007":"Reunion","IM001008":"Reunion","IM001009":"Reunion","IM001010":"Reunion","IM001011":"Reunion","IM001012":"Reunion","IM001013":"Reunion","IM001014":"Reunion","IM001015":"Reunion","IM001016":"Reunion","IM001017":"Reunion","IM001018":"Reunion","IM001019":"Reunion","IM001020":"Reunion","IM001021":"Reunion","IM001022":"Reunion","IM001023":"Reunion","IM001024":"Reunion","IM001027":"Reunion","IM001028":"Reunion","IM001035":"Reunion","IM001036":"Reunion","IM001037":"Reunion","IM001038":"Reunion","IM001039":"Reunion","IM001048":"Reunion","IM001049":"Reunion","IM001050":"Reunion","IM001051":"Reunion","IM001052":"Reunion","IM001053":"Reunion","IM001054":"Reunion","IM001055":"Reunion","IM001060":"Reunion","IM001061":"Reunion","IM001063":"Mayotte","IM001065":"Reunion","IM001066":"Reunion","IM001067":"Reunion","IM001068":"Reunion","IM001069":"Reunion","IM001070":"Reunion","IM001071":"Reunion","IM001072":"Reunion","IM001073":"Reunion","IM001074":"Reunion","IM001075":"Reunion","IM001076":"Reunion","IM001077":"Reunion","IM001078":"Reunion","IM001079":"Reunion","IM001080":"Reunion","IM001081":"Reunion","IM001082":"Reunion","IM001083":"Reunion","IM001084":"Reunion","IM001085":"Reunion","IM001086":"Reunion","IM001087":"Reunion","IM001093":"Reunion","IM001094":"Reunion","IM001095":"Reunion","IM001096":"Reunion","IM001097":"Reunion","IM001098":"Reunion","IM001099":"Reunion","IM001100":"Reunion","IM001101":"Reunion","IM001102":"Reunion","IM001103":"Reunion","IM001118":"Reunion","IM001131":"Reunion","IM001132":"Reunion","IM001137":"Mayotte","IM001138":"Mayotte","IM001139":"Reunion","IM001140":"Reunion","IM001142":"Reunion","IM001144":"Reunion","IM001147":"Reunion","IM001148":"Reunion","IM001149":"Reunion","IM001150":"Reunion","IM000041":"Reunion","IM000042":"Reunion","IM000091":"Reunion","IM000092":"Reunion","IM000094":"Reunion","IM000095":"Reunion","IM000096":"Reunion","IM000097":"Reunion","IM000098":"Reunion","IM000099":"Reunion","IM000100":"Reunion","IM000101":"Reunion","IM000120":"Reunion","IM000121":"Reunion","IM000122":"Reunion","IM000123":"Reunion","IM000124":"Reunion","IM000125":"Reunion","IM000127":"Reunion","IM000129":"Reunion","IM000130":"Reunion","IM000185":"Reunion","IM000187":"Reunion","IM000188":"Reunion","IM000287":"Reunion","IM000299":"Reunion","IM000300":"Reunion","IM000301":"Reunion","IM000339":"Mayotte","IM000340":"Mayotte","IM000341":"Mayotte","IM000342":"Mayotte","IM000378":"Mayotte","IM000379":"Mayotte","IM000380":"Mayotte","IM000381":"Mayotte","IM000382":"Mayotte","IM000383":"Mayotte","IM000384":"Mayotte","IM000385":"Mayotte","IM000386":"Mayotte","IM000618":"Mayotte","IM000619":"Mayotte","IM000620":"Mayotte","IM000621":"Mayotte","IM000622":"Mayotte","IM000623":"Mayotte","IM000624":"Mayotte","IM000625":"Mayotte","IM000626":"Mayotte","IM000627":"Mayotte","IM000628":"Mayotte","IM000629":"Mayotte","IM000630":"Mayotte","IM000631":"Mayotte","IM000653":"Reunion","IM000654":"Reunion","IM000108":"Reunion","IM000119":"Reunion","IM000133":"Reunion","IM000136":"Reunion","IM000138":"Reunion","IM000143":"Reunion","IM000169":"Reunion","IM000171":"Reunion","IM000176":"Reunion","IM000183":"Reunion","IM000262":"Reunion","IM000361":"Reunion","IM000376":"Mayotte","IM000389":"Reunion","IM000423":"Reunion","IM000451":"Reunion","IM000453":"Mayotte","IM000454":"Mayotte","IM000473":"Reunion","IM000493":"Reunion","IM000671":"Reunion","IM000679":"Reunion","IM000680":"Reunion","IM000681":"Reunion","IM000682":"Reunion","IM000695":"Reunion","IM000721":"Mayotte","IM000735":"Reunion","IM000765":"Reunion","IM000799":"Reunion","IM000800":"Reunion","IM000836":"Reunion","IM000845":"Reunion","IM000883":"Reunion","IM000884":"Reunion","IM000906":"Reunion","IM000940":"Reunion","IM000958":"Reunion","IM000959":"Reunion","IM000960":"Reunion","IM000961":"Reunion","IM000962":"Reunion","IM000963":"Reunion","IM001116":"Reunion","IM001129":"Reunion","IM001130":"Reunion","IM001141":"Reunion","IM001164":"Reunion","IM001166":"Reunion","IM001168":"Reunion","IM001169":"Reunion","IM000526":"Reunion","IM000589":"Reunion","IM000592":"Reunion","IM000747":"Reunion","IM000870":"Reunion","IM000019":"Reunion","IM000020":"Reunion","IM000106":"Reunion","IM000109":"Reunion","IM000177":"Reunion","IM000184":"Reunion","IM000272":"Reunion","IM000273":"Reunion","IM000343":"Reunion","IM000344":"Reunion","IM000345":"Reunion","IM000346":"Reunion","IM000347":"Reunion","IM000390":"Reunion","IM000412":"Reunion","IM000413":"Reunion","IM000414":"Reunion","IM000449":"Reunion","IM000450":"Reunion","IM000477":"Reunion","IM000478":"Reunion","IM000495":"Reunion","IM000496":"Reunion","IM000525":"Reunion","IM000547":"Reunion","IM000548":"Reunion","IM000550":"Reunion","IM000577":"Reunion","IM000578":"Reunion","IM000579":"Reunion","IM000580":"Reunion","IM000581":"Reunion","IM000605":"Reunion","IM000606":"Reunion","IM000607":"Reunion","IM000643":"Reunion","IM000655":"Reunion","IM000656":"Reunion","IM000657":"Reunion","IM000658":"Reunion","IM000659":"Reunion","IM000666":"Reunion","IM000667":"Reunion","IM000668":"Reunion","IM000685":"Reunion","IM000686":"Reunion","IM000689":"Reunion","IM000690":"Reunion","IM000691":"Reunion","IM000692":"Reunion","IM000693":"Reunion","IM000694":"Reunion","IM000734":"Reunion","IM000763":"Reunion","IM000764":"Reunion","IM000771":"Mayotte","IM000807":"Reunion","IM000808":"Reunion","IM000826":"Reunion","IM000827":"Reunion","IM000828":"Reunion","IM000829":"Reunion","IM000831":"Reunion","IM000871":"Reunion","IM000889":"Reunion","IM000897":"Reunion","IM000898":"Reunion","IM000899":"Reunion","IM000900":"Reunion","IM000901":"Reunion","IM000902":"Reunion","IM000903":"Reunion","IM000904":"Reunion","IM000930":"Reunion","IM000949":"Reunion","IM001032":"Reunion","IM001033":"Reunion","IM001034":"Reunion","IM001040":"Reunion","IM001045":"Reunion","IM001046":"Reunion","IM001128":"Reunion","IM001145":"Reunion","IM001146":"Reunion","IM001165":"Reunion","IM000032":"Reunion","IM000107":"Reunion","IM000114":"Reunion","IM000202":"Reunion","IM000267":"Reunion","IM000302":"Reunion","IM000388":"Reunion","IM000444":"Reunion","IM000447":"Reunion","IM000491":"Reunion","IM000504":"Reunion","IM000505":"Reunion","IM000506":"Reunion","IM000549":"Reunion","IM000593":"Reunion","IM000683":"Reunion","IM000709":"Reunion","IM000817":"Reunion","IM000818":"Reunion","IM000824":"Reunion","IM000858":"Reunion","IM000859":"Reunion","IM000860":"Reunion","IM000861":"Reunion","IM000910":"Reunion","IM000911":"Reunion","IM001127":"Reunion","IM001134":"Reunion","IM001135":"Reunion","IM001136":"Reunion","IM001163":"Reunion","IM001167":"Reunion","IM000111":"Reunion","IM000142":"Reunion","IM000181":"Reunion","IM000246":"Reunion","IM000368":"Reunion","IM000369":"Reunion","IM000461":"Reunion","IM000601":"Reunion","IM000602":"Reunion","IM000821":"Reunion","IM001143":"Reunion","IM000004":"Reunion","IM000005":"Reunion","IM000008":"Reunion","IM000016":"Reunion","IM000110":"Reunion","IM000141":"Reunion","IM000201":"Reunion","IM000205":"Reunion","IM000248":"Reunion","IM000249":"Reunion","IM000261":"Reunion","IM000336":"Reunion","IM000356":"Reunion","IM000359":"Reunion","IM000370":"Reunion","IM000490":"Reunion","IM000494":"Reunion","IM000590":"Reunion","IM000641":"Reunion","IM000762":"Reunion","IM000822":"Reunion","IM000842":"Reunion","IM001047":"Reunion","IM001064":"Reunion","IM001126":"Reunion","IM001160":"Reunion"};
      const items = await paginate(GL + '/Immos/items?$expand=fields&$top=500', 10);
      const idsByCode = {};
      items.forEach(i => { const f = i.fields || {}; const c = f.Title || f.Code_IM || ''; if (c) (idsByCode[c] = idsByCode[c] || []).push(i.id); });
      const ops = [];
      const introuvables = [];
      for (const code in SITES) {
        const ids = idsByCode[code];
        if (!ids || !ids.length) { introuvables.push(code); continue; }
        ids.forEach(id => ops.push({ code: code, id: id, site: SITES[code] }));
      }
      const relBase = '/sites/' + SITE_ID + '/lists/Immos/items/';
      const report = { ok: 0, erreurs: [] };
      for (let i = 0; i < ops.length; i += 20) {
        const chunk = ops.slice(i, i + 20);
        const requests = chunk.map((op, idx) => ({ id: String(idx), method: 'PATCH', url: relBase + op.id + '/fields', headers: { 'Content-Type': 'application/json' }, body: { Site: op.site } }));
        try {
          const rb = await fetch('https://graph.microsoft.com/v1.0/$batch', { method: 'POST', headers: H, body: JSON.stringify({ requests }) });
          const rbData = await rb.json();
          (rbData.responses || []).forEach(resp => { if (resp.status >= 200 && resp.status < 300) report.ok++; else report.erreurs.push(resp.status); });
        } catch (e) { report.erreurs.push('batch_exception'); }
      }
      return json({ success: true, total: Object.keys(SITES).length, operations: ops.length, appliques: report.ok, introuvables: introuvables.length, erreurs: report.erreurs.slice(0, 20) });
    }

    if (action === 'seed_roles_sites') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      if (body.confirm !== 'ESR-CONFIRME') return json({ success: false, error: 'confirmation_requise' });
      const SEED = {"CANI":["CT_Specialise","Reunion"],"PALO":["Ouvrier","Reunion"],"BOMA":["RA","Reunion"],"BAKA":["Admin","Reunion"],"ROJO":["RA","Reunion"],"GRWI":["Ouvrier","Reunion"],"BADA":["Ouvrier","Reunion"],"LAHU":["CT","Reunion"],"POGU":["Ouvrier","Reunion"],"NAJE":["Ouvrier","Reunion"],"MEJO":["CT","Reunion"],"PACH":["Ouvrier","Reunion"],"IADA":["Ouvrier","Reunion"],"BLFA":["Ouvrier","Reunion"],"LAJC":["Ouvrier","Reunion"],"FLDA":["Ouvrier","Reunion"],"REST":["Ouvrier","Reunion"],"RIJB":["CT","Reunion"],"PIBE":["Ouvrier_Specialise","Reunion"],"SEJU":["Ouvrier_Specialise","Reunion"],"PACA":["RA","Reunion"],"LEMI":["Ouvrier","Reunion"],"JADI":["Ouvrier","Reunion"],"LEWI":["Ouvrier","Reunion"],"AIWI":["Admin","Reunion"],"SAMA":["Ouvrier","Reunion"],"BIFL":["Ouvrier","Reunion"],"ROCH":["Ouvrier","Reunion"],"TUJM":["Ouvrier","Reunion"],"SCST":["CT","Reunion"],"MAMA":["Ouvrier","Reunion"],"MASA":["Ouvrier","Reunion"],"LEDI":["Ouvrier","Reunion"],"ROJY":["Ouvrier","Reunion"],"SIDE":["Ouvrier","Reunion"],"BENO":["Ouvrier","Reunion"],"AUAR":["Admin","Reunion"],"GASE":["Ouvrier","Reunion"],"SOBE":["Ouvrier","Reunion"],"PAYV":["Ouvrier","Reunion"],"CALU":["Ouvrier","Reunion"],"LAJD":["Ouvrier","Reunion"],"GOLU":["CT","Reunion"],"NAXA":["RA","Reunion"],"NALU":["Ouvrier","Reunion"],"COSY":["Ouvrier","Reunion"],"ORFA":["Ouvrier","Reunion"],"DUDE":["Ouvrier","Reunion"],"ANFL":["Ouvrier","Reunion"],"VILO":["Ouvrier","Reunion"],"ATMA":["Ouvrier","Reunion"],"MILU":["Ouvrier","Reunion"],"JEDA":["RA","Reunion"],"DEFR":["Ouvrier","Reunion"],"ZEYO":["Ouvrier","Reunion"],"VIMT":["Ouvrier","Reunion"],"RAJE":["Ouvrier","Reunion"],"IATH":["Ouvrier","Reunion"],"TASE":["Ouvrier","Reunion"],"LEPR":["Ouvrier","Reunion"],"DOYO":["RA","Reunion"],"BUAN":["Ouvrier","Reunion"],"MASE":["Ouvrier","Reunion"],"DUJU":["Ouvrier","Reunion"],"LAME":["Ouvrier","Reunion"],"ABLU":["Ouvrier","Reunion"],"COTA":["Ouvrier","Reunion"],"MIJE":["Ouvrier","Reunion"],"MOIB":["Ouvrier","Reunion"],"GAAN":["Ouvrier","Reunion"],"CONI":["Admin","Reunion"],"ELSL":["Ouvrier","Reunion"],"PARO":["Ouvrier","Reunion"],"ICPH":["Ouvrier","Reunion"],"FRLU":["Ouvrier","Reunion"],"DACH":["CT","Mayotte"],"FAZI":["Ouvrier","Mayotte"],"TOHO":["CT","Mayotte"],"CHMO":["Ouvrier","Mayotte"],"MIAN":["Ouvrier","Mayotte"],"ATAB":["Ouvrier","Mayotte"],"SOMO":["Ouvrier","Mayotte"],"SAAL":["Ouvrier","Mayotte"],"BOFA":["Ouvrier","Mayotte"],"MKSA":["Ouvrier","Mayotte"],"ELSA":["Ouvrier","Mayotte"],"MOEL":["Ouvrier","Mayotte"],"ABNA":["Ouvrier","Mayotte"],"AHAB":["Ouvrier","Mayotte"],"NAIR":["Ouvrier","Mayotte"],"SAEL":["Logistique_Mayotte","Mayotte"],"MOAS":["Ouvrier","Mayotte"],"MACH":["Ouvrier","Mayotte"],"SAAB":["Ouvrier","Mayotte"],"TOAO":["Ouvrier","Mayotte"],"YOAN":["Ouvrier","Mayotte"],"ALMH":["Ouvrier","Mayotte"]};
      // Charger tous les employés une fois. Gérer les DOUBLONS : un code peut avoir plusieurs itemId.
      const emp = await paginate(GL + '/Employes/items?$expand=fields&$top=200', 5);
      const idsByCode = {};
      emp.forEach(i => { const f = i.fields || {}; const c = f.Title || f.Code || ''; if (c) { (idsByCode[c] = idsByCode[c] || []).push(i.id); } });

      // Construire la liste des opérations PATCH (une par occurrence de chaque code)
      const relBase = '/sites/' + SITE_ID + '/lists/Employes/items/';
      const ops = [];
      const introuvables = [];
      for (const code in SEED) {
        const ids = idsByCode[code];
        if (!ids || !ids.length) { introuvables.push(code); continue; }
        const [role, site] = SEED[code];
        ids.forEach(id => ops.push({ code: code, id: id, role: role, site: site }));
      }

      // Envoyer par lots de 20 via l'API $batch de Graph (1 sous-requête Cloudflare par lot)
      const report = { ok: [], erreurs: [] };
      for (let i = 0; i < ops.length; i += 20) {
        const chunk = ops.slice(i, i + 20);
        const requests = chunk.map((op, idx) => ({
          id: String(idx),
          method: 'PATCH',
          url: relBase + op.id + '/fields',
          headers: { 'Content-Type': 'application/json' },
          body: { Code_CT: op.role, Site: op.site }
        }));
        try {
          const rb = await fetch('https://graph.microsoft.com/v1.0/$batch', { method: 'POST', headers: H, body: JSON.stringify({ requests }) });
          const rbData = await rb.json();
          (rbData.responses || []).forEach(resp => {
            const op = chunk[parseInt(resp.id, 10)];
            if (resp.status >= 200 && resp.status < 300) report.ok.push(op.code);
            else report.erreurs.push(op.code + ':' + resp.status);
          });
        } catch (e) {
          chunk.forEach(op => report.erreurs.push(op.code + ':batch_exception'));
        }
      }
      return json({ success: true, total_seed: Object.keys(SEED).length, total_operations: ops.length, appliques: report.ok.length, introuvables: introuvables, erreurs: report.erreurs });
    }

    if (action === 'reserver') {
      if (!(await estEmployeActifServeur(body.code_employe))) return json({ success: false, error: 'employe_inactif', message: 'Cet employé est inactif — réservation impossible.' });
      // Une demande cible soit une immo précise (Code_IM), soit une catégorie + quantité (roadmap
      // item D, "planification logistique") — jamais aucune des deux, sinon rien à préparer.
      if (!body.code_im && !body.categorie) return json({ success: false, error: 'destination_manquante', message: 'Précise une immo ou une catégorie.' });
      const r = await fetch(GL + '/Reservations/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
        Title: body.code_employe || '', Nom_Employe: body.nom_employe || '', Code_Chantier: body.code_chantier || '', Nom_Chantier: body.nom_chantier || '',
        Date_Debut: body.date_debut, Date_Fin: body.date_fin, Statut: 'Demandee', Note: body.note || '', Code_IM: body.code_im || '',
        Categorie: body.code_im ? '' : (body.categorie || ''), Quantite: body.code_im ? null : (parseInt(body.quantite, 10) || 1), Libelle_Libre: body.code_im ? '' : (body.libelle_libre || '')
      } }) });
      return json({ success: r.ok, status: r.status, detail: await r.text() });
    }

    if (action === 'statut_resa') {
      // Liste blanche : ce PATCH acceptait n'importe quelle chaîne jusqu'ici — resserré au passage
      // (voir 04_HISTORIQUE_DECISIONS.md, item D) sans changer le comportement des valeurs déjà utilisées.
      const STATUTS_RESA_VALIDES = ['Demandee', 'Confirmee', 'Refusee', 'Rendue', 'Annulee', 'Contre-proposition'];
      if (!STATUTS_RESA_VALIDES.includes(body.statut)) return json({ success: false, error: 'statut_invalide' });
      const r = await fetch(GL + '/Reservations/items/' + body.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Statut: body.statut }) });
      return json({ success: r.ok });
    }

    if (action === 'modifier_resa') {
      const fields = {};
      if (body.date_debut)                 fields.Date_Debut   = body.date_debut;
      if (body.date_fin)                   fields.Date_Fin     = body.date_fin;
      if (body.nom_chantier !== undefined) fields.Nom_Chantier = body.nom_chantier;
      if (body.statut !== undefined)       fields.Statut       = body.statut;
      // Si on change l'immo (contre-proposition), on conserve la trace de l'immo initialement demandée.
      let noteFinale = body.note;
      if (body.code_im_alt) {
        // Lire la résa actuelle pour connaître l'immo demandée avant modification
        const cur = await fetch(GL + '/Reservations/items/' + body.id + '?$expand=fields', { headers: H });
        const curData = await cur.json();
        const curFields = curData.fields || {};
        const immoActuelle = curFields.Code_IM || '';
        const noteActuelle = curFields.Note || '';
        // Ne mémoriser l'immo initiale que si elle n'a pas déjà été enregistrée
        let codeInitial = immoActuelle;
        const dejaInit = noteActuelle.match(/##INIT:([^#]+)##/);
        if (dejaInit) codeInitial = dejaInit[1]; // garder la toute première demande
        fields.Code_IM = body.code_im_alt;
        // Reconstituer la note : marqueur INIT + note métier fournie
        const noteBase = (body.note !== undefined ? body.note : noteActuelle).replace(/##INIT:[^#]+##/g, '').trim();
        noteFinale = '##INIT:' + codeInitial + '## ' + noteBase;
      }
      if (noteFinale !== undefined) fields.Note = noteFinale;
      const r = await fetch(GL + '/Reservations/items/' + body.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(fields) });
      return json({ success: r.ok });
    }

    if (action === 'transfert') {
      // Le donneur (retour dépôt) peut être sorti (il rend simplement son matériel) — seul le
      // receveur d'un vrai transfert (pas un retour vers DEPOT) doit être un employé actif.
      if (body.code_employe_receveur !== 'DEPOT' && !(await estEmployeActifServeur(body.code_employe_receveur))) {
        return json({ success: false, error: 'employe_inactif', message: 'Cet employé est inactif — transfert impossible.' });
      }
      // Transferts_En_Attente n'a pas sa propre colonne Photos (seule Mouvements en a une) : le nom
      // des photos prises par le donneur à la déclaration voyage dans Note via un marqueur transitoire
      // (##PHOTOS:...##), retiré et reporté vers la colonne structurée à la validation (action `valider`).
      const noteAvecPhotos = (body.note || '') + (buildPhotosMarker(body.photos) ? (body.note ? ' ' : '') + buildPhotosMarker(body.photos) : '');
      const r = await fetch(GL + '/Transferts_En_Attente/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: body.code_im, Code_Employe_Donneur: body.code_employe_donneur, Nom_Donneur: body.nom_donneur, Code_Employe_Receveur: body.code_employe_receveur, Nom_Receveur: body.nom_receveur, Statut: 'En attente', Etat: body.etat || '', Note: noteAvecPhotos } }) });
      return json({ success: r.ok, status: r.status });
    }

    // ── Marquer statut immo (HS définitive / Perdu / En panne) ──
    if (action === 'marquer_statut_immo') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const fields = { Etat: body.etat };
      if (body.actif !== undefined) fields.Actif = body.actif;
      // Stocker le motif dans Note si dispo, sinon dans Commentaire
      if (body.motif) fields.Note = body.motif;
      const r = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + body.code_im + "'&$top=1", { headers: H });
      const rd = await r.json();
      const itemId = rd.value && rd.value[0] ? rd.value[0].id : null;
      if (!itemId) return json({ success: false, error: 'Immo non trouvée' });
      const rp = await fetch(GL + '/Immos/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(fields) });
      // Créer aussi un mouvement pour la traçabilité — identité de l'auteur = session vérifiée,
      // jamais une valeur fournie par le client (évite l'attribution à un faux compte 'ADMIN').
      const vraiNom1 = await getNomResolver();
      await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: body.code_im, Code_Employe: _auth.session.code, Type_Mouvement: body.type_mouv || 'Archivage', Commentaire: vraiNom1(_auth.session.code, _auth.session.code), Etat: body.etat, Note: body.motif || '', Horodatage: new Date().toISOString() } }) });
      return json({ success: rp.ok });
    }

    // ── Mettre à jour le suivi d'une panne (prestataire, coût, note) ──
    if (action === 'maj_panne') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const vraiNomSuivi = await getNomResolver();
      const nomAuteur = vraiNomSuivi(_auth.session.code, _auth.session.code);
      // Créer un mouvement de suivi — marqueur ##PRESTA:Nom## non-ambigu pour la localisation
      const note = '[SUIVI ' + new Date().toLocaleDateString('fr-FR') + ']' +
        (body.prestataire ? ' ##PRESTA:' + body.prestataire + '## Prestataire: ' + body.prestataire : '') +
        (body.cout_estime ? ' Cout estime: ' + body.cout_estime + 'EUR' : '') +
        ' ' + (body.note_suivi || '');
      const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
        Title: body.code_im, Code_Employe: _auth.session.code, Type_Mouvement: 'Suivi_Panne',
        Commentaire: nomAuteur, Etat: 'En panne', Note: note, Horodatage: new Date().toISOString()
      } }) });
      return json({ success: r.ok });
    }

    // ── Déclarer une panne ──
    if (action === 'declarer_panne') {
      // Mettre à jour l'immo
      const ri = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + body.code_im + "'&$top=1", { headers: H });
      const rid = await ri.json();
      const itemId = rid.value && rid.value[0] ? rid.value[0].id : null;
      if (itemId) await fetch(GL + '/Immos/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Etat: 'En panne' }) });
      // Créer un mouvement de type Panne
      const rp = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: body.code_im, Code_Employe: body.code_employe || '', Type_Mouvement: 'Panne', Commentaire: body.nom_employe || '', Etat: 'En panne', Note: body.motif || '', Horodatage: new Date().toISOString(), Photos: joinPhotos(body.photos) } }) });
      return json({ success: rp.ok });
    }

    // ── Résoudre une panne ── (partagée avec la PWA terrain, badge sans mot de passe — pas de
    // jeton de session disponible dans ce flux, l'identité vient donc du corps de la requête,
    // comme declarer_panne/reserver/transfert ; jamais de nom codé en dur en repli)
    if (action === 'resoudre_panne') {
      const ri = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + body.code_im + "'&$top=1", { headers: H });
      const rid = await ri.json();
      const itemId = rid.value && rid.value[0] ? rid.value[0].id : null;
      if (itemId) await fetch(GL + '/Immos/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Etat: body.etat_resolution || 'Bon état', Actif: true }) });
      const coutNum = parseFloat((body.cout_reel || '').toString().replace(',', '.')) || 0;
      const noteRep = 'RESOLUTION ' + new Date().toLocaleDateString('fr-FR') +
        (body.prestataire ? ' | Prestataire: ' + body.prestataire : '') +
        (coutNum > 0 ? ' | ##COUT:' + coutNum + '## ' + coutNum + 'EUR' : '') +
        ' | ' + (body.note || '');
      // Coût de réparation écrit à la fois dans la colonne structurée Cout_Reparation
      // (source de vérité pour les calculs) et dans Note (lisible tel quel dans SharePoint,
      // et compatible avec les mouvements historiques créés avant l'ajout de la colonne).
      const mvFields = {
        Title: body.code_im, Code_Employe: body.par_code || '', Type_Mouvement: 'Réparation',
        Commentaire: body.par_nom || body.par_code || '', Etat: body.etat_resolution || 'Bon état',
        Note: noteRep, Horodatage: new Date().toISOString(), Photos: joinPhotos(body.photos)
      };
      if (coutNum > 0) mvFields.Cout_Reparation = coutNum;
      await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: mvFields }) });
      return json({ success: true });
    }

    // ── Enregistrer une réparation/entretien indépendant d'une panne ──
    // (entretien préventif, réparation ponctuelle sans passer par le circuit "Déclarer une panne")
    // Mouvement de type "Entretien" : coût structuré compté dans le seuil de réforme du dashboard,
    // mais SANS impact sur la localisation actuelle de l'immo (contrairement à "Réparation").
    if (action === 'enregistrer_reparation') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const coutNum = parseFloat((body.cout_reparation || '').toString().replace(',', '.')) || 0;
      if (!body.code_im || coutNum <= 0) return json({ success: false, error: 'donnees_invalides' });
      let horodatage;
      try { horodatage = body.date_reparation ? new Date(body.date_reparation + 'T12:00:00').toISOString() : new Date().toISOString(); }
      catch (e) { horodatage = new Date().toISOString(); }
      const note = 'ENTRETIEN ' + new Date().toLocaleDateString('fr-FR') +
        (body.prestataire ? ' | Prestataire: ' + body.prestataire : '') +
        ' | ##COUT:' + coutNum + '## ' + coutNum + 'EUR | ' + (body.note || '');
      const vraiNomEnt = await getNomResolver();
      const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
        Title: body.code_im, Code_Employe: _auth.session.code, Type_Mouvement: 'Entretien',
        Commentaire: vraiNomEnt(_auth.session.code, _auth.session.code), Note: note, Cout_Reparation: coutNum, Horodatage: horodatage
      } }) });
      return json({ success: r.ok });
    }

    // ── Signaler l'absence d'un employé (registre à sens unique) ──
    if (action === 'signaler_absence') {
      const codeAbsent = (body.code_employe || '').trim();
      const dateAbsence = body.date_absence || '';
      if (!codeAbsent || !dateAbsence) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Absences/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: codeAbsent, Code_Declarant: body.code_declarant || '', Date_Absence: dateAbsence,
          Motif: body.motif || '', Site: body.site || 'Reunion', Horodatage: new Date().toISOString()
        } }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Campagne d'inventaire de stock (articles/consommables — distinct des immobilisations) ──
    if (action === 'creer_campagne_inventaire') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const nom = (body.nom || '').trim();
      if (!nom) return json({ success: false, error: 'nom_manquant' });
      try {
        const r = await fetch(GL + '/Campagnes_Inventaire/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: nom, Date_Debut: body.date_debut || new Date().toISOString().slice(0, 10), Date_Fin: body.date_fin || null,
          Statut: body.statut === 'Clôturée' ? 'Clôturée' : 'En cours', Cree_Par: body.par_code || ''
        } }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'cloturer_campagne_inventaire') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const nom = (body.nom || '').trim();
      if (!nom) return json({ success: false, error: 'nom_manquant' });
      try {
        const cur = await fetch(GL + "/Campagnes_Inventaire/items?$expand=fields&$filter=fields/Title eq '" + nom.replace(/'/g, "''") + "'&$top=1", { headers: H });
        const curData = await cur.json();
        const itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
        if (!itemId) return json({ success: false, error: 'campagne_introuvable' });
        const r = await fetch(GL + '/Campagnes_Inventaire/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({
          Statut: 'Clôturée', Cloture_Par: body.par_code || '', Date_Cloture: body.date_cloture || new Date().toISOString()
        }) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Campagne d'inventaire physique des immos par scan (distincte de la campagne stock
    // ci-dessus) — lancement/clôture réservés au dashboard (requireAdmin), identité toujours
    // résolue depuis le jeton (_auth.session.code), jamais depuis le corps de la requête.
    if (action === 'creer_campagne_inventaire_immos') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const nom = (body.nom || '').trim();
      if (!nom) return json({ success: false, error: 'nom_manquant' });
      try {
        const r = await fetch(GL + '/Campagnes_Inventaire_Immos/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: nom, Date_Debut: body.date_debut || new Date().toISOString().slice(0, 10), Date_Fin: body.date_fin || null,
          Statut: 'En cours', Cree_Par: _auth.session.code
        } }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'cloturer_campagne_inventaire_immos') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const nom = (body.nom || '').trim();
      if (!nom) return json({ success: false, error: 'nom_manquant' });
      try {
        const cur = await fetch(GL + "/Campagnes_Inventaire_Immos/items?$expand=fields&$filter=fields/Title eq '" + nom.replace(/'/g, "''") + "'&$top=1", { headers: H });
        const curData = await cur.json();
        const itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
        if (!itemId) return json({ success: false, error: 'campagne_introuvable' });
        const r = await fetch(GL + '/Campagnes_Inventaire_Immos/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({
          Statut: 'Clôturée', Cloture_Par: _auth.session.code, Date_Cloture: new Date().toISOString()
        }) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'ajouter_ligne_inventaire') {
      const campagne = (body.campagne || '').trim();
      if (!campagne || !body.reference) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Lignes_Inventaire/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: campagne, Zone: body.zone || '', Site: body.site || 'Reunion', Chantier: body.chantier || '',
          Fabricant: body.fabriquant || '', Reference: String(body.reference || ''), Designation: body.designation || '',
          Quantite: parseFloat(body.quantite) || 0, Chute_Cable: body.chute_cable ? 'Oui' : '',
          Observations: body.observations || '', Code_Employe: body.code_employe || '', Horodatage: new Date().toISOString()
        } }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Scan d'une immo pendant une campagne d'inventaire physique (PWA, profil admin terrain —
    // badge scanné sans mot de passe, même modèle de confiance que reserver/transfert/
    // ajouter_ligne_inventaire ci-dessus : jamais de jeton de session côté PWA, donc identité
    // reçue du corps de la requête comme pour toutes les actions partagées avec la PWA). Ne crée
    // jamais de Mouvement : un simple relevé "vu, par untel, à telle date", sans effet sur le
    // détenteur courant de l'immo (comparé après coup à la localisation théorique côté rapport
    // d'écarts, calculée comme partout ailleurs depuis le dernier Mouvement réel).
    if (action === 'enregistrer_scan_inventaire_immo') {
      const campagne = (body.campagne || '').trim();
      const codeIm = (body.code_im || '').trim().toUpperCase();
      if (!campagne || !codeIm) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Scans_Inventaire_Immos/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: codeIm, Campagne: campagne, Code_Employe: body.code_employe || '', Nom_Employe: body.nom_employe || '',
          Site: body.site || 'Reunion', Horodatage: new Date().toISOString()
        } }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Édition/suppression d'une ligne : réservé à son auteur ou à un admin (body.est_admin, asserté côté client
    // comme le reste de l'app), et uniquement tant que la campagne associée est "En cours".
    if (action === 'modifier_ligne_inventaire' || action === 'supprimer_ligne_inventaire') {
      const ligneId = body.id;
      if (!ligneId) return json({ success: false, error: 'id_manquant' });
      try {
        const cur = await fetch(GL + '/Lignes_Inventaire/items/' + ligneId + '?$expand=fields', { headers: H });
        const curData = await cur.json();
        const f = curData.fields || {};
        if (!f.Title) return json({ success: false, error: 'ligne_introuvable' });
        const estAuteur = (f.Code_Employe || '') === (body.par_code || '');
        if (!estAuteur && !body.est_admin) return json({ success: false, error: 'non_autorise' });
        const camp = await fetch(GL + "/Campagnes_Inventaire/items?$expand=fields&$filter=fields/Title eq '" + f.Title.replace(/'/g, "''") + "'&$top=1", { headers: H });
        const campData = await camp.json();
        const statutCamp = campData.value && campData.value[0] ? (campData.value[0].fields || {}).Statut : '';
        if (statutCamp === 'Clôturée') return json({ success: false, error: 'campagne_cloturee' });
        if (action === 'supprimer_ligne_inventaire') {
          const r = await fetch(GL + '/Lignes_Inventaire/items/' + ligneId, { method: 'DELETE', headers: H });
          return json({ success: r.ok || r.status === 204 });
        }
        const fields = {
          Zone: body.zone || '', Site: body.site || 'Reunion', Chantier: body.chantier || '',
          Fabricant: body.fabriquant || '', Reference: String(body.reference || ''), Designation: body.designation || '',
          Quantite: parseFloat(body.quantite) || 0, Chute_Cable: body.chute_cable ? 'Oui' : '', Observations: body.observations || ''
        };
        const r = await fetch(GL + '/Lignes_Inventaire/items/' + ligneId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(fields) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Migration one-shot d'un comptage historique (ex: décembre 2025) par lots de 20 — même pattern que bulk_patch_immos
    if (action === 'bulk_import_lignes_inventaire') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const campagne = (body.campagne || '').trim();
      const lignes = body.lignes || [];
      if (!campagne || !lignes.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = lignes.slice(0, 20).map((l, idx) => ({
        id: String(idx), method: 'POST',
        url: "/sites/" + SITE_ID + "/lists/Lignes_Inventaire/items",
        headers: { 'Content-Type': 'application/json' },
        body: { fields: {
          Title: campagne, Zone: l.zone || '', Site: l.site || 'Reunion', Chantier: l.chantier || '',
          Fabricant: l.fabriquant || '', Reference: String(l.reference || ''), Designation: l.designation || '',
          Quantite: l.quantite || 0, Chute_Cable: l.chute_cable ? 'Oui' : '', Observations: l.observations || '',
          Code_Employe: _auth.session.code, Horodatage: body.horodatage || new Date().toISOString()
        } }
      }));
      try {
        const r = await fetch('https://graph.microsoft.com/v1.0/$batch', { method: 'POST', headers: H, body: JSON.stringify({ requests }) });
        const rd = await r.json();
        const resp = rd.responses || [];
        let ok = 0, ko = 0; const errs = [];
        resp.forEach(x => { if (x.status >= 200 && x.status < 300) ok++; else { ko++; if (errs.length < 3) errs.push({ status: x.status, body: x.body }); } });
        return json({ success: ko === 0, ok: ok, ko: ko, erreurs: errs });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Module EPI : dotation & stock ────────────────────────────────────────────
    // Quel champ de taille employé consulter pour un type d'article donné (veste/polo/t-shirt manches
    // longues/ensemble pluie suivent la même échelle de taille que le t-shirt, faute de champ dédié).
    const TAILLE_FIELD_PAR_TYPE = {
      'Pantalon': 'Taille_Pantalon', 'T-Shirts': 'Taille_Tshirt', 'T-Shirts manches longues': 'Taille_Tshirt',
      'Polos': 'Taille_Tshirt', 'Veste': 'Taille_Veste', 'Ensemble pluie': 'Taille_Tshirt',
      'Chaussures hautes': 'Pointure_Chaussures', 'Chaussures basses': 'Pointure_Chaussures',
      'Gants à picot': 'Taille_Gants', 'Gants gros œuvre': 'Taille_Gants'
      // Casque anti-bruit, Casque de chantier, Jugulaire pour casque, Lunettes incolores, Lunettes fumées :
      // articles à taille unique (pas de champ de taille employé associé) — voir trouverArticleCatalogue ci-dessous.
    };
    // Un article catalogue matche si la taille employé correspond à la taille salarié OU à la taille affichage
    // (gère nativement le cas où la taille est communiquée sous forme numérique OU alphabétique). Pour un type
    // sans champ de taille associé (article à taille unique type "Standard"), on prend directement l'entrée
    // catalogue de ce type, sans comparaison de taille.
    function trouverArticleCatalogue(catalogue, typeArticle, tailleValeur) {
      if (!TAILLE_FIELD_PAR_TYPE[typeArticle]) {
        return catalogue.find(c => (c.Type_Article || '') === typeArticle) || null;
      }
      const v = (tailleValeur || '').toString().trim().toLowerCase();
      if (!v) return null;
      return catalogue.find(c => (c.Type_Article || '') === typeArticle &&
        (((c.Taille_Salarie || '').toString().trim().toLowerCase() === v) || ((c.Taille_Affichage || '').toString().trim().toLowerCase() === v))
      ) || null;
    }

    // Mise à jour de l'affectation EPI + des 5 tailles d'un employé (édition individuelle)
    if (action === 'maj_taille_employe') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      let itemId = body.item_id;
      if (!itemId) {
        const cur = await fetch(GL + "/Employes/items?$expand=fields&$filter=fields/Title eq '" + (body.code || '').replace(/'/g, "''") + "'&$top=1", { headers: H });
        const curData = await cur.json();
        itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
      }
      if (!itemId) return json({ success: false, error: 'employe_introuvable', code: body.code });
      try {
        const r = await fetch(GL + '/Employes/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({
          Affectation_EPI: body.affectation_epi || '', Taille_Pantalon: body.taille_pantalon || '', Taille_Tshirt: body.taille_tshirt || '',
          Taille_Veste: body.taille_veste || '', Pointure_Chaussures: body.pointure_chaussures || '', Taille_Gants: body.taille_gants || ''
        }) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import initial en masse des tailles/affectation (74 salariés, par lots de 20 — item_id déjà résolu côté client)
    if (action === 'bulk_import_tailles_epi') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = (body.rows || []).filter(x => x.item_id);
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'PATCH', url: "/sites/" + SITE_ID + "/lists/Employes/items/" + x.item_id + "/fields",
        headers: { 'Content-Type': 'application/json' }, body: {
          Affectation_EPI: x.affectation_epi || '', Taille_Pantalon: x.taille_pantalon || '', Taille_Tshirt: x.taille_tshirt || '',
          Taille_Veste: x.taille_veste || '', Pointure_Chaussures: x.pointure_chaussures || '', Taille_Gants: x.taille_gants || ''
        }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import initial du catalogue articles/tailles/références (par lots de 20)
    if (action === 'bulk_import_catalogue_epi') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Catalogue_Articles_EPI/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: {
          Title: x.type_article || '', Type_Article: x.type_article || '', Taille_Salarie: x.taille_salarie || '',
          Taille_Affichage: x.taille_affichage || '', Reference: String(x.reference || ''), Designation: x.designation || '',
          Fournisseur: x.fournisseur || '', Stock_Actuel: x.stock_actuel || 0
        } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import initial de la grille de dotation standard (4 profils × ~10 types, par lots de 20)
    if (action === 'bulk_import_grille_dotation_epi') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Grille_Dotation_EPI/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: { Title: x.affectation || '', Type_Article: x.type_article || '', Quantite: x.quantite || 0 } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Upsert d'une ligne de la grille de dotation (édition depuis le dashboard, Admin/Logistique)
    if (action === 'maj_grille_dotation_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const affectation = (body.affectation || '').trim();
      const typeArticle = (body.type_article || '').trim();
      const quantite = parseFloat(body.quantite);
      if (!affectation || !typeArticle || isNaN(quantite)) return json({ success: false, error: 'donnees_invalides' });
      try {
        const cur = await fetch(GL + "/Grille_Dotation_EPI/items?$expand=fields&$filter=fields/Title eq '" + affectation.replace(/'/g, "''") + "' and fields/Type_Article eq '" + typeArticle.replace(/'/g, "''") + "'&$top=1", { headers: H });
        const curData = await cur.json();
        const itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
        if (itemId) {
          const r = await fetch(GL + '/Grille_Dotation_EPI/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Quantite: quantite }) });
          return json({ success: r.ok, id: itemId });
        }
        const r = await fetch(GL + '/Grille_Dotation_EPI/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: affectation, Type_Article: typeArticle, Quantite: quantite } }) });
        const rd = await r.json();
        return json({ success: r.ok, id: rd.id });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Supprime une ligne de la grille de dotation (ex : type d'article retiré de la grille, ou correction
    // d'une ligne mal orthographiée) — Admin/Logistique
    if (action === 'supprimer_grille_dotation_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const id = body.id;
      if (!id) return json({ success: false, error: 'id_manquant' });
      const r = await fetch(GL + '/Grille_Dotation_EPI/items/' + id, { method: 'DELETE', headers: H });
      return json({ success: r.ok || r.status === 204 });
    }

    // Ajoute un nouvel article au catalogue EPI (ex : nouveau modèle de chaussures acheté en promotion)
    if (action === 'ajouter_article_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const typeArticle = (body.type_article || '').trim();
      const reference = (body.reference || '').trim();
      if (!typeArticle || !reference) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Catalogue_Articles_EPI/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: typeArticle, Type_Article: typeArticle, Taille_Salarie: body.taille_salarie || '', Taille_Affichage: body.taille_affichage || '',
          Reference: reference, Designation: body.designation || '', Fournisseur: body.fournisseur || '', Stock_Actuel: parseFloat(body.stock_actuel) || 0
        } }) });
        const rd = await r.json();
        if (!r.ok) return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
        return json({ success: true, id: rd.id });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Inventaire physique du stock EPI : fixe (et non incrémente) le Stock_Actuel de plusieurs lignes
    // catalogue d'un coup, par lots de 20 — utilisé par l'import Excel du comptage stock dans le dashboard.
    if (action === 'bulk_maj_stock_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || []; // [{id, quantite}]
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'PATCH', url: "/sites/" + SITE_ID + "/lists/Catalogue_Articles_EPI/items/" + x.id + "/fields",
        headers: { 'Content-Type': 'application/json' }, body: { Stock_Actuel: parseFloat(x.quantite) || 0 }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Seuil d'alerte "stock bas" par article — édité un par un (moins fréquent qu'une réception,
    // pas besoin d'un lot comme bulk_maj_stock_epi). 0/absent côté lecture = pas de seuil
    // personnalisé, le dashboard applique alors un seuil par défaut (voir 03_REGLES_METIER_ET_ROLES.md).
    if (action === 'maj_stock_mini_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const catId = body.id;
      const seuil = parseFloat(body.stock_mini);
      if (!catId || isNaN(seuil) || seuil < 0) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Catalogue_Articles_EPI/items/' + catId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Stock_Mini: seuil }) });
        return json({ success: r.ok, nouveau_seuil: seuil });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Réception d'une commande fournisseur : incrémente le stock d'une ligne catalogue
    if (action === 'reception_commande_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const catId = body.id;
      const qte = parseFloat(body.quantite);
      if (!catId || !qte || qte <= 0) return json({ success: false, error: 'donnees_invalides' });
      try {
        const cur = await fetch(GL + '/Catalogue_Articles_EPI/items/' + catId + '?$expand=fields', { headers: H });
        const curData = await cur.json();
        const stockActuel = parseFloat((curData.fields || {}).Stock_Actuel) || 0;
        const nouveauStock = stockActuel + qte;
        const r = await fetch(GL + '/Catalogue_Articles_EPI/items/' + catId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Stock_Actuel: nouveauStock }) });
        return json({ success: r.ok, nouveau_stock: nouveauStock });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Génère une fiche de dotation standard (Annuelle/Entree) pour un employé + une année, depuis la grille
    // et ses tailles. Ne touche pas au stock (seulement à l'émargement, pour ne pas fausser le stock avec
    // des fiches générées mais jamais signées).
    if (action === 'generer_dotation_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code || '').trim().toUpperCase();
      const annee = parseInt(body.annee, 10);
      const typeDotation = body.type_dotation === 'Entree' ? 'Entree' : 'Annuelle';
      if (!code || !annee) return json({ success: false, error: 'donnees_invalides' });
      try {
        const existRes = await fetch(GL + "/Dotations_EPI/items?$expand=fields&$filter=fields/Title eq '" + code.replace(/'/g, "''") + "' and fields/Annee_Civile eq " + annee + "&$top=5", { headers: H });
        const existData = await existRes.json();
        if ((existData.value || []).some(i => { const t = (i.fields || {}).Type_Dotation; return t === 'Annuelle' || t === 'Entree'; })) {
          return json({ success: false, error: 'deja_generee' });
        }
        const empRes = await fetch(GL + "/Employes/items?$expand=fields&$filter=fields/Title eq '" + code.replace(/'/g, "''") + "'&$top=1", { headers: H });
        const empData = await empRes.json();
        const emp = empData.value && empData.value[0] ? empData.value[0].fields : null;
        if (!emp) return json({ success: false, error: 'employe_introuvable' });
        if (emp.field_2 === 'Non') return json({ success: false, error: 'employe_inactif', message: 'Cet employé est inactif — dotation impossible.' });
        const affectation = (emp.Affectation_EPI || '').trim();
        if (!affectation) return json({ success: false, error: 'affectation_manquante' });
        const [grilleItems, catItems] = await Promise.all([
          paginate(GL + '/Grille_Dotation_EPI/items?$expand=fields&$top=200', 5),
          paginate(GL + '/Catalogue_Articles_EPI/items?$expand=fields&$top=200', 5)
        ]);
        const grille = grilleItems.map(i => i.fields || {}).filter(f => (f.Title || '') === affectation);
        const catalogue = catItems.map(i => i.fields || {});
        const lignes = [], nonTrouves = [];
        grille.forEach(g => {
          const qte = parseFloat(g.Quantite) || 0;
          if (qte <= 0) return;
          const type = g.Type_Article || '';
          const champTaille = TAILLE_FIELD_PAR_TYPE[type];
          const tailleEmploye = champTaille ? emp[champTaille] : '';
          const art = trouverArticleCatalogue(catalogue, type, tailleEmploye);
          if (!art) { nonTrouves.push({ type_article: type, taille_recherchee: tailleEmploye || '' }); return; }
          lignes.push({ type_article: type, taille_article: art.Taille_Affichage || '', reference_article: art.Reference || '', quantite: qte });
        });
        const nomDest = emp.field_1 || code;
        const site = (emp.Site === 'Mayotte') ? 'Mayotte' : 'Reunion';
        const dotRes = await fetch(GL + '/Dotations_EPI/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: code, Type_Dotation: typeDotation, Annee_Civile: annee, Nom_Destinataire: nomDest, Site: site,
          Statut: 'Generee', Genere_Par: body.par_code || '', Genere_Le: new Date().toISOString()
        } }) });
        const dotData = await dotRes.json();
        if (!dotRes.ok) return json({ success: false, error: 'sharepoint', message: (dotData.error && dotData.error.message) || 'Erreur écriture', details: dotData });
        const dotId = dotData.id;
        if (lignes.length) {
          const requests = lignes.slice(0, 20).map((l, idx) => ({
            id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Lignes_Dotation_EPI/items",
            headers: { 'Content-Type': 'application/json' }, body: { fields: {
              Title: String(dotId), Type_Article: l.type_article, Taille_Article: l.taille_article, Reference_Article: l.reference_article, Quantite: l.quantite
            } }
          }));
          await graphBatch(requests);
        }
        return json({ success: true, id: dotId, nb_lignes: lignes.length, non_trouves: nonTrouves });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Remise ponctuelle (ex. "30 gants pour l'équipe de untel") : destinataire libre, lignes choisies à la
    // volée depuis le catalogue. Ne compte pas dans le suivi de dotation annuelle individuelle.
    if (action === 'generer_remise_ponctuelle_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const destinataire = (body.destinataire || '').trim();
      const lignes = body.lignes || [];
      if (!destinataire || !lignes.length) return json({ success: false, error: 'donnees_invalides' });
      try {
        // Destinataire nommé (employé précis) : Title = son code, pour que la ponctuelle apparaisse
        // dans son historique individuel — sinon (remise de groupe), identifiant synthétique inerte.
        const employeCode = (body.employe_code || '').trim().toUpperCase();
        const idLibre = employeCode || ('PONCTUEL-' + (body.par_code || 'X') + '-' + Date.now());
        const site = (body.site === 'Mayotte') ? 'Mayotte' : 'Reunion';
        const dotRes = await fetch(GL + '/Dotations_EPI/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: idLibre, Type_Dotation: 'Ponctuelle', Nom_Destinataire: destinataire, Site: site,
          Statut: 'Generee', Genere_Par: body.par_code || '', Genere_Le: new Date().toISOString()
        } }) });
        const dotData = await dotRes.json();
        if (!dotRes.ok) return json({ success: false, error: 'sharepoint', message: (dotData.error && dotData.error.message) || 'Erreur écriture', details: dotData });
        const dotId = dotData.id;
        const requests = lignes.slice(0, 20).map((l, idx) => ({
          id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Lignes_Dotation_EPI/items",
          headers: { 'Content-Type': 'application/json' }, body: { fields: {
            Title: String(dotId), Type_Article: l.type_article || '', Taille_Article: l.taille_article || '', Reference_Article: l.reference_article || '', Quantite: parseFloat(l.quantite) || 0
          } }
        }));
        if (requests.length) await graphBatch(requests);
        return json({ success: true, id: dotId });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Émargement d'une fiche (photo déjà uploadée via upload_fiche_epi) : décrémente le stock des lignes
    if (action === 'emarger_dotation_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const dotId = body.id;
      if (!dotId) return json({ success: false, error: 'id_manquant' });
      try {
        const curRes = await fetch(GL + '/Dotations_EPI/items/' + dotId + '?$expand=fields', { headers: H });
        const curData = await curRes.json();
        const f = curData.fields || {};
        if (!f.Title) return json({ success: false, error: 'fiche_introuvable' });
        if (f.Statut === 'Emargee') return json({ success: false, error: 'deja_emargee' });
        const lignesItems = await paginate(GL + '/Lignes_Dotation_EPI/items?$expand=fields&$top=2000', 10);
        const lignes = lignesItems.filter(i => (i.fields || {}).Title === String(dotId)).map(i => i.fields || {});
        if (lignes.length) {
          const catItems = await paginate(GL + '/Catalogue_Articles_EPI/items?$expand=fields&$top=200', 5);
          const catByKey = {};
          catItems.forEach(i => { const cf = i.fields || {}; catByKey[(cf.Type_Article || '') + '|' + (cf.Taille_Affichage || '')] = { id: i.id, stock: parseFloat(cf.Stock_Actuel) || 0 }; });
          const decrByCatId = {};
          lignes.forEach(l => {
            const cat = catByKey[(l.Type_Article || '') + '|' + (l.Taille_Article || '')];
            if (!cat) return;
            if (!decrByCatId[cat.id]) decrByCatId[cat.id] = { stockActuel: cat.stock, total: 0 };
            decrByCatId[cat.id].total += (parseFloat(l.Quantite) || 0);
          });
          const requests = Object.keys(decrByCatId).slice(0, 20).map((catId, idx) => ({
            id: String(idx), method: 'PATCH', url: "/sites/" + SITE_ID + "/lists/Catalogue_Articles_EPI/items/" + catId + "/fields",
            headers: { 'Content-Type': 'application/json' }, body: { Stock_Actuel: decrByCatId[catId].stockActuel - decrByCatId[catId].total }
          }));
          if (requests.length) await graphBatch(requests);
        }
        const upRes = await fetch(GL + '/Dotations_EPI/items/' + dotId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({
          Statut: 'Emargee', Emarge_Par: body.par_code || '', Emarge_Le: new Date().toISOString(), Photo_Fiche: body.filename || ''
        }) });
        return json({ success: upRes.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Upload de la photo/scan de la fiche signée (même pattern que upload_photo, dossier dédié)
    if (action === 'upload_fiche_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      try {
        const b64 = (body.data || '').includes(',') ? body.data.split(',')[1] : body.data;
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Fiches_EPI/' + encodeURIComponent(body.dotation_id) + '/' + encodeURIComponent(body.filename || (Date.now() + '.jpg')) + ':/content', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + td.access_token, 'Content-Type': 'image/jpeg' }, body: bytes.buffer });
        return json({ success: r.ok, url: r.ok ? 'https://immo-proxy.ral-85d.workers.dev/?fiche_epi=' + encodeURIComponent(body.dotation_id + '/' + body.filename) : null });
      } catch (e) { return json({ success: false, error: e.message }); }
    }

    // Annule une fiche générée par erreur — uniquement tant qu'elle n'est pas émargée (le stock n'a alors
    // pas encore été touché, donc rien à recréditer)
    if (action === 'annuler_dotation_epi') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const dotId = body.id;
      if (!dotId) return json({ success: false, error: 'id_manquant' });
      try {
        const cur = await fetch(GL + '/Dotations_EPI/items/' + dotId + '?$expand=fields', { headers: H });
        const curData = await cur.json();
        const f = curData.fields || {};
        if (!f.Title) return json({ success: false, error: 'fiche_introuvable' });
        if (f.Statut === 'Emargee') return json({ success: false, error: 'deja_emargee_non_annulable' });
        const lignesItems = await paginate(GL + "/Lignes_Dotation_EPI/items?$expand=fields&$top=2000", 10);
        const aSupprimer = lignesItems.filter(i => (i.fields || {}).Title === String(dotId));
        for (const l of aSupprimer) { try { await fetch(GL + '/Lignes_Dotation_EPI/items/' + l.id, { method: 'DELETE', headers: H }); } catch (e) {} }
        const r = await fetch(GL + '/Dotations_EPI/items/' + dotId, { method: 'DELETE', headers: H });
        return json({ success: r.ok || r.status === 204 });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Module Prime d'outillage : distribution ponctuelle & stock ──────────────

    // Assigne le service outillage d'un employé (Travaux Neufs / Maintenance / vide) — indépendant de l'affectation EPI
    if (action === 'maj_service_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      let itemId = body.item_id;
      if (!itemId) {
        const cur = await fetch(GL + "/Employes/items?$expand=fields&$filter=fields/Title eq '" + (body.code || '').replace(/'/g, "''") + "'&$top=1", { headers: H });
        const curData = await cur.json();
        itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
      }
      if (!itemId) return json({ success: false, error: 'employe_introuvable', code: body.code });
      try {
        const r = await fetch(GL + '/Employes/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Service_Outillage: body.service_outillage || '' }) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import initial du catalogue (par lots de 20)
    if (action === 'bulk_import_catalogue_outillage') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Catalogue_Outillage/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: {
          Title: x.type_article || '', Reference: String(x.reference || ''), Distributeur: x.distributeur || '',
          Marque: x.marque || '', Prix_Unitaire: x.prix_unitaire || 0, Stock_Actuel: x.stock_actuel || 0
        } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Backfill de la durée d'amortissement sur des articles catalogue existants (par désignation), par lots de 20.
    // Sert au calcul de la prime annuelle (Prix_Unitaire × 12 / Duree_Amortissement_Mois) versée en paie.
    if (action === 'bulk_maj_duree_outillage') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || []; // [{type_article, duree_mois}]
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      try {
        const catItems = await paginate(GL + '/Catalogue_Outillage/items?$expand=fields&$top=200', 5);
        const idByType = {};
        catItems.forEach(i => { idByType[(i.fields || {}).Title || ''] = i.id; });
        const requests = [];
        const nonTrouves = [];
        rows.forEach((x, idx) => {
          const catId = idByType[x.type_article];
          if (!catId) { nonTrouves.push(x.type_article); return; }
          requests.push({ id: String(idx), method: 'PATCH', url: "/sites/" + SITE_ID + "/lists/Catalogue_Outillage/items/" + catId + "/fields", headers: { 'Content-Type': 'application/json' }, body: { Duree_Amortissement_Mois: x.duree_mois || 0 } });
        });
        let ok = 0, ko = 0, errs = [];
        for (let i = 0; i < requests.length; i += 20) {
          const chunk = requests.slice(i, i + 20).map((r, idx) => ({ ...r, id: String(idx) }));
          const res = await graphBatch(chunk);
          ok += res.ok; ko += res.ko; errs = errs.concat(res.erreurs);
        }
        return json({ success: ko === 0, ok, ko, erreurs: errs.slice(0, 3), non_trouves: nonTrouves });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import initial de la grille (par lots de 20)
    if (action === 'bulk_import_grille_outillage') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Grille_Outillage/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: { Title: x.service || '', Type_Article: x.type_article || '', Quantite: x.quantite || 0 } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import initial des lignes de distribution historiques (par lots de 20)
    if (action === 'bulk_import_lignes_outillage') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Lignes_Outillage/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: {
          Title: x.code || '', Type_Article: x.type_article || '', Date_Remise: x.date_remise || null,
          Emarge_Par: x.emarge_par || '', Photo_Fiche: x.photo_fiche || '', Lot_Distribution: x.lot_distribution || 'MIGRATION'
        } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Upsert d'une ligne de la grille (édition depuis le dashboard, Admin/Logistique)
    if (action === 'maj_grille_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const service = (body.service || '').trim();
      const typeArticle = (body.type_article || '').trim();
      const quantite = parseFloat(body.quantite);
      if (!service || !typeArticle || isNaN(quantite)) return json({ success: false, error: 'donnees_invalides' });
      try {
        const cur = await fetch(GL + "/Grille_Outillage/items?$expand=fields&$filter=fields/Title eq '" + service.replace(/'/g, "''") + "' and fields/Type_Article eq '" + typeArticle.replace(/'/g, "''") + "'&$top=1", { headers: H });
        const curData = await cur.json();
        const itemId = curData.value && curData.value[0] ? curData.value[0].id : null;
        if (itemId) {
          const r = await fetch(GL + '/Grille_Outillage/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Quantite: quantite }) });
          return json({ success: r.ok, id: itemId });
        }
        const r = await fetch(GL + '/Grille_Outillage/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: service, Type_Article: typeArticle, Quantite: quantite } }) });
        const rd = await r.json();
        return json({ success: r.ok, id: rd.id });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Supprime une ligne de la grille (type d'article retiré du kit standard)
    if (action === 'supprimer_grille_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const id = body.id;
      if (!id) return json({ success: false, error: 'id_manquant' });
      const r = await fetch(GL + '/Grille_Outillage/items/' + id, { method: 'DELETE', headers: H });
      return json({ success: r.ok || r.status === 204 });
    }

    // Réception d'une commande fournisseur : incrémente le stock d'un article
    if (action === 'reception_commande_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const catId = body.id;
      const qte = parseFloat(body.quantite);
      if (!catId || !qte || qte <= 0) return json({ success: false, error: 'donnees_invalides' });
      try {
        const cur = await fetch(GL + '/Catalogue_Outillage/items/' + catId + '?$expand=fields', { headers: H });
        const curData = await cur.json();
        const stockActuel = parseFloat((curData.fields || {}).Stock_Actuel) || 0;
        const nouveauStock = stockActuel + qte;
        const r = await fetch(GL + '/Catalogue_Outillage/items/' + catId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Stock_Actuel: nouveauStock }) });
        return json({ success: r.ok, nouveau_stock: nouveauStock });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Édition directe (valeur absolue) du stock d'un article outillage — état des stocks pas encore fait,
    // permet de corriger un chiffre sans passer par un delta de réception.
    if (action === 'editer_stock_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const catId = body.id;
      const qte = parseFloat(body.quantite);
      if (!catId || isNaN(qte) || qte < 0) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Catalogue_Outillage/items/' + catId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Stock_Actuel: qte }) });
        return json({ success: r.ok, nouveau_stock: qte });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Seuil d'alerte "stock bas" par outil — même principe que maj_stock_mini_epi.
    if (action === 'maj_stock_mini_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const catId = body.id;
      const seuil = parseFloat(body.stock_mini);
      if (!catId || isNaN(seuil) || seuil < 0) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Catalogue_Outillage/items/' + catId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Stock_Mini: seuil }) });
        return json({ success: r.ok, nouveau_seuil: seuil });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Distribue un ou plusieurs articles à un employé en une seule action (photo de la preuve signée déjà
    // uploadée via upload_fiche_outillage) : crée les lignes de distribution et décrémente le stock. Pas
    // d'étape "générée en attente" intermédiaire comme les EPI — la distribution est actée directement.
    if (action === 'distribuer_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code || '').trim().toUpperCase();
      const lignes = body.lignes || []; // [{type_article}]
      if (!code || !lignes.length) return json({ success: false, error: 'donnees_invalides' });
      if (!(await estEmployeActifServeur(code))) return json({ success: false, error: 'employe_inactif', message: 'Cet employé est inactif — distribution impossible.' });
      try {
        const catItems = await paginate(GL + '/Catalogue_Outillage/items?$expand=fields&$top=200', 5);
        const catByType = {};
        catItems.forEach(i => { const cf = i.fields || {}; catByType[cf.Title || ''] = { id: i.id, stock: parseFloat(cf.Stock_Actuel) || 0 }; });
        const decrParType = {};
        lignes.forEach(l => { decrParType[l.type_article] = (decrParType[l.type_article] || 0) + 1; });
        // Vérification stock suffisant AVANT toute écriture — jamais de stock négatif sur un article distribué
        const insuffisants = Object.keys(decrParType).filter(type => { const cat = catByType[type]; return !cat || cat.stock - decrParType[type] < 0; });
        if (insuffisants.length) return json({ success: false, error: 'stock_insuffisant', message: 'Stock insuffisant pour : ' + insuffisants.join(', ') });
        const stockRequests = Object.keys(decrParType).map((type, idx) => {
          const cat = catByType[type];
          if (!cat) return null;
          return { id: String(idx), method: 'PATCH', url: "/sites/" + SITE_ID + "/lists/Catalogue_Outillage/items/" + cat.id + "/fields", headers: { 'Content-Type': 'application/json' }, body: { Stock_Actuel: cat.stock - decrParType[type] } };
        }).filter(Boolean);
        if (stockRequests.length) await graphBatch(stockRequests);
        const lot = body.lot || ('LOT-' + Date.now());
        const horodatage = new Date().toISOString();
        const ligneRequests = lignes.slice(0, 20).map((l, idx) => ({
          id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Lignes_Outillage/items",
          headers: { 'Content-Type': 'application/json' }, body: { fields: {
            Title: code, Type_Article: l.type_article, Date_Remise: horodatage, Emarge_Par: body.par_code || '',
            Photo_Fiche: body.filename || '', Lot_Distribution: lot
          } }
        }));
        const res = await graphBatch(ligneRequests);
        return json({ success: res.success, ok: res.ok, ko: res.ko, lot: lot });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Upload de la photo/scan de la fiche de remise signée (même pattern que upload_fiche_epi)
    if (action === 'upload_fiche_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      try {
        const b64 = (body.data || '').includes(',') ? body.data.split(',')[1] : body.data;
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Fiches_Outillage/' + encodeURIComponent(body.code) + '/' + encodeURIComponent(body.filename || (Date.now() + '.jpg')) + ':/content', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + td.access_token, 'Content-Type': 'image/jpeg' }, body: bytes.buffer });
        return json({ success: r.ok, url: r.ok ? 'https://immo-proxy.ral-85d.workers.dev/?fiche_outillage=' + encodeURIComponent(body.code + '/' + body.filename) : null });
      } catch (e) { return json({ success: false, error: e.message }); }
    }

    // Annule une ligne de distribution (erreur de saisie) : recrédite le stock de l'article
    if (action === 'annuler_ligne_outillage') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const ligneId = body.id;
      if (!ligneId) return json({ success: false, error: 'id_manquant' });
      try {
        const cur = await fetch(GL + '/Lignes_Outillage/items/' + ligneId + '?$expand=fields', { headers: H });
        const curData = await cur.json();
        const f = curData.fields || {};
        if (!f.Title) return json({ success: false, error: 'ligne_introuvable' });
        const catRes = await fetch(GL + "/Catalogue_Outillage/items?$expand=fields&$filter=fields/Title eq '" + (f.Type_Article || '').replace(/'/g, "''") + "'&$top=1", { headers: H });
        const catData = await catRes.json();
        const catItem = catData.value && catData.value[0] ? catData.value[0] : null;
        if (catItem) {
          const stockActuel = parseFloat((catItem.fields || {}).Stock_Actuel) || 0;
          await fetch(GL + '/Catalogue_Outillage/items/' + catItem.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Stock_Actuel: stockActuel + 1 }) });
        }
        const r = await fetch(GL + '/Lignes_Outillage/items/' + ligneId, { method: 'DELETE', headers: H });
        return json({ success: r.ok || r.status === 204 });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Module Matériel IT (téléphones, puis ordinateurs) — hors circuit immobilisations ────
    // Ajouter un appareil au catalogue (code auto-généré côté dashboard via ?next_code_materiel_it=)
    if (action === 'ajouter_materiel_it') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code || '').trim().toUpperCase();
      if (!/^[A-Z]{2,4}\d{6}$/.test(code)) return json({ success: false, error: 'code_invalide', message: 'Le code doit être au format préfixe + 6 chiffres (ex: TEL000001).' });
      const dup = await fetch(GL + "/Materiel_IT/items?$filter=fields/Title eq '" + code + "'&$top=1", { headers: H });
      const dupData = await dup.json();
      if ((dupData.value || []).length > 0) return json({ success: false, error: 'doublon', message: 'Le code ' + code + ' existe déjà.' });
      const f = { Title: code, Site: (body.site === 'Mayotte') ? 'Mayotte' : 'Reunion', Statut: 'En service' };
      if (body.type_materiel) f.Type_Materiel = body.type_materiel;
      if (body.marque) f.Marque = body.marque;
      if (body.modele) f.Modele = body.modele;
      if (body.n_serie) f.N_Serie = body.n_serie;
      if (body.cout_mensuel != null && body.cout_mensuel !== '') f.Cout_Mensuel = Number(body.cout_mensuel);
      if (body.n_telephone) f.N_Telephone = body.n_telephone;
      if (body.operateur) f.Operateur = body.operateur;
      if (body.n_carte_sim) f.N_Carte_SIM = body.n_carte_sim;
      if (body.code_pin) f.Code_PIN = body.code_pin;
      if (body.code_puk) f.Code_PUK = body.code_puk;
      if (body.code_rio) f.Code_RIO = body.code_rio;
      if (body.code_deverrouillage) f.Code_deverouillage = body.code_deverrouillage;
      if (body.commentaire) f.Commentaire = body.commentaire;
      try {
        const r = await fetch(GL + '/Materiel_IT/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: f }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, code: code, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Modifier les champs d'un appareil (fiche technique, statut, sortie de service, coût mensuel...)
    if (action === 'maj_materiel_it') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const id = body.id;
      if (!id) return json({ success: false, error: 'id_manquant' });
      const f = {};
      if (body.type_materiel != null) f.Type_Materiel = body.type_materiel;
      if (body.marque != null) f.Marque = body.marque;
      if (body.modele != null) f.Modele = body.modele;
      if (body.n_serie != null) f.N_Serie = body.n_serie;
      if (body.site) f.Site = body.site === 'Mayotte' ? 'Mayotte' : 'Reunion';
      if (body.statut != null) f.Statut = body.statut;
      if (body.date_sortie_service != null) f.Date_Sortie_Service = body.date_sortie_service || null;
      if (body.cout_mensuel != null) f.Cout_Mensuel = body.cout_mensuel === '' ? null : Number(body.cout_mensuel);
      if (body.n_telephone != null) f.N_Telephone = body.n_telephone;
      if (body.operateur != null) f.Operateur = body.operateur;
      if (body.n_carte_sim != null) f.N_Carte_SIM = body.n_carte_sim;
      if (body.code_pin != null) f.Code_PIN = body.code_pin;
      if (body.code_puk != null) f.Code_PUK = body.code_puk;
      if (body.code_rio != null) f.Code_RIO = body.code_rio;
      if (body.code_deverrouillage != null) f.Code_deverouillage = body.code_deverrouillage;
      if (body.commentaire != null) f.Commentaire = body.commentaire;
      try {
        const r = await fetch(GL + '/Materiel_IT/items/' + id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(f) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Affecter un appareil (crée un Mouvement_Materiel_IT — le dernier mouvement par appareil
    // détermine le détenteur courant, même principe que les Mouvements des immos mais sans le
    // workflow panne/réservation, inutile ici)
    if (action === 'affecter_materiel_it') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code || '').trim().toUpperCase();
      if (!code) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Mouvements_Materiel_IT/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: code, Code_Employe: body.code_employe || '', Nom_Detenteur: body.nom_detenteur || '', Note: body.note || '', Horodatage: new Date().toISOString()
        } }) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import initial du catalogue (migration one-shot depuis le fichier Excel de suivi)
    if (action === 'bulk_import_materiel_it') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Materiel_IT/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: {
          Title: x.code || '', Type_Materiel: x.type_materiel || '', Marque: x.marque || '', Modele: x.modele || '',
          N_Serie: x.n_serie || '', Site: x.site || 'Reunion', Statut: x.statut || 'En service',
          Date_Sortie_Service: x.date_sortie_service || null, Cout_Mensuel: x.cout_mensuel != null ? x.cout_mensuel : null,
          N_Telephone: x.n_telephone || '', Operateur: x.operateur || '', N_Carte_SIM: x.n_carte_sim || '',
          Code_PIN: x.code_pin || '', Code_PUK: x.code_puk || '', Code_RIO: x.code_rio || '', Code_deverouillage: x.code_deverrouillage || '',
          Commentaire: x.commentaire || ''
        } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // Import initial de l'historique de détention (une ligne = un mouvement, migration one-shot)
    if (action === 'bulk_import_mouvements_materiel_it') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Mouvements_Materiel_IT/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: {
          Title: x.code || '', Code_Employe: x.code_employe || '', Nom_Detenteur: x.nom_detenteur || '', Note: x.note || '', Horodatage: x.horodatage || new Date().toISOString()
        } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Lignes téléphoniques : ajouter/modifier/affecter/importer (miroir exact de Materiel_IT) ──
    if (action === 'ajouter_ligne_telephonique') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code || '').trim().toUpperCase();
      if (!/^LIG\d{6}$/.test(code)) return json({ success: false, error: 'code_invalide', message: 'Le code doit être au format LIG + 6 chiffres (ex: LIG000001).' });
      const dup = await fetch(GL + "/Lignes_Telephoniques/items?$filter=fields/Title eq '" + code + "'&$top=1", { headers: H });
      const dupData = await dup.json();
      if ((dupData.value || []).length > 0) return json({ success: false, error: 'doublon', message: 'Le code ' + code + ' existe déjà.' });
      const f = { Title: code, Site: (body.site === 'Mayotte') ? 'Mayotte' : 'Reunion', Statut: 'Active' };
      if (body.n_telephone) f.N_Telephone = body.n_telephone;
      if (body.operateur) f.Operateur = body.operateur;
      if (body.n_carte_sim) f.N_Carte_SIM = body.n_carte_sim;
      if (body.code_pin) f.Code_PIN = body.code_pin;
      if (body.code_puk) f.Code_PUK = body.code_puk;
      if (body.code_rio) f.Code_RIO = body.code_rio;
      if (body.commentaire) f.Commentaire = body.commentaire;
      try {
        const r = await fetch(GL + '/Lignes_Telephoniques/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: f }) });
        const rd = await r.json();
        if (r.ok) return json({ success: true, code: code, id: rd.id });
        return json({ success: false, error: 'sharepoint', message: (rd.error && rd.error.message) || 'Erreur écriture', details: rd });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'maj_ligne_telephonique') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const id = body.id;
      if (!id) return json({ success: false, error: 'id_manquant' });
      const f = {};
      if (body.site) f.Site = body.site === 'Mayotte' ? 'Mayotte' : 'Reunion';
      if (body.statut != null) f.Statut = body.statut;
      if (body.n_telephone != null) f.N_Telephone = body.n_telephone;
      if (body.operateur != null) f.Operateur = body.operateur;
      if (body.n_carte_sim != null) f.N_Carte_SIM = body.n_carte_sim;
      if (body.code_pin != null) f.Code_PIN = body.code_pin;
      if (body.code_puk != null) f.Code_PUK = body.code_puk;
      if (body.code_rio != null) f.Code_RIO = body.code_rio;
      if (body.commentaire != null) f.Commentaire = body.commentaire;
      try {
        const r = await fetch(GL + '/Lignes_Telephoniques/items/' + id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(f) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'affecter_ligne_telephonique') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const code = (body.code || '').trim().toUpperCase();
      if (!code) return json({ success: false, error: 'donnees_invalides' });
      try {
        const r = await fetch(GL + '/Mouvements_Lignes_Telephoniques/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
          Title: code, Code_Employe: body.code_employe || '', Nom_Detenteur: body.nom_detenteur || '', Note: body.note || '', Horodatage: new Date().toISOString()
        } }) });
        return json({ success: r.ok });
      } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'bulk_import_lignes_telephoniques') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Lignes_Telephoniques/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: {
          Title: x.code || '', Site: x.site || 'Reunion', Statut: x.statut || 'Active',
          N_Telephone: x.n_telephone || '', Operateur: x.operateur || '', N_Carte_SIM: x.n_carte_sim || '',
          Code_PIN: x.code_pin || '', Code_PUK: x.code_puk || '', Code_RIO: x.code_rio || '', Commentaire: x.commentaire || ''
        } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    if (action === 'bulk_import_mouvements_lignes_telephoniques') {
      const _auth = await requireAdmin(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const rows = body.rows || [];
      if (!rows.length) return json({ success: false, error: 'donnees_invalides' });
      const requests = rows.slice(0, 20).map((x, idx) => ({
        id: String(idx), method: 'POST', url: "/sites/" + SITE_ID + "/lists/Mouvements_Lignes_Telephoniques/items",
        headers: { 'Content-Type': 'application/json' }, body: { fields: {
          Title: x.code || '', Code_Employe: x.code_employe || '', Nom_Detenteur: x.nom_detenteur || '', Note: x.note || '', Horodatage: x.horodatage || new Date().toISOString()
        } }
      }));
      try { return json(await graphBatch(requests)); } catch (e) { return json({ success: false, error: 'exception', message: e.message }); }
    }

    // ── Déclarer vol ou disparition ──
    // Partagée avec la PWA terrain (badge sans mot de passe) — pas de jeton de session dans ce
    // flux, l'identité vient donc du corps de la requête, comme declarer_panne/reserver/transfert ;
    // jamais de nom codé en dur ('ADMIN'/'Admin') en repli.
    if (action === 'declarer_vol') {
      const etatVol = body.type_vol || 'Volé';
      const nomAuteurVol = body.par_nom || body.par_code || '';
      const ri = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + body.code_im + "'&$top=1", { headers: H });
      const rid = await ri.json();
      const itemId = rid.value && rid.value[0] ? rid.value[0].id : null;
      if (itemId) await fetch(GL + '/Immos/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Etat: etatVol, Actif: false }) });
      await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
        Title: body.code_im, Code_Employe: body.par_code || '', Type_Mouvement: 'Archivage',
        Commentaire: nomAuteurVol, Etat: etatVol,
        Note: body.motif + ' [' + etatVol + ' déclaré par ' + (nomAuteurVol || 'inconnu') + ']',
        Horodatage: new Date().toISOString()
      } }) });
      return json({ success: true });
    }

    // ── Annuler un transfert en attente ──
    if (action === 'annuler_transfert') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const r = await fetch(GL + '/Transferts_En_Attente/items/' + body.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Statut: 'Annulé' }) });
      return json({ success: r.ok });
    }

    // ── Modifier le receveur d'un transfert en attente ──
    if (action === 'maj_transfert') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      const fields = {};
      if (body.code_employe_receveur) fields.Code_Employe_Receveur = body.code_employe_receveur;
      if (body.nom_receveur)          fields.Nom_Receveur = body.nom_receveur;
      if (body.note !== undefined)    fields.Note = body.note;
      const r = await fetch(GL + '/Transferts_En_Attente/items/' + body.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(fields) });
      return json({ success: r.ok });
    }

    if (action === 'valider') {
      const item = await fetch(GL + '/Transferts_En_Attente/items/' + body.id + '?$expand=fields', { headers: H });
      const idata = await item.json();
      const f = idata.fields || {};
      await fetch(GL + '/Transferts_En_Attente/items/' + body.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Statut: 'Validé' }) });
      // Si le receveur est le DÉPÔT → c'est un retour dépôt validé (mouvement Retour), sinon un transfert classique
      const versDepot = (f.Code_Employe_Receveur || '') === 'DEPOT';
      // Photos du déclarant (donneur), portées par le marqueur transitoire de Transferts_En_Attente.Note
      // (voir action `transfert`) + photos éventuelles prises par le validateur/receveur lui-même au
      // moment de cette validation — combinées dans la colonne structurée Photos du mouvement final.
      const photosDonneur = extractPhotosMarker(f.Note);
      const photosFinal = joinPhotos([...photosDonneur, ...sanitizePhotoList(body.photos)]);
      let mouvFields;
      if (versDepot) {
        // Retour dépôt validé : l'AUTEUR du mouvement est le déclarant terrain (celui qui a ramené la machine),
        // le VALIDATEUR (garant) est encodé dans Code_Chantier sous la forme DEPOT|code|nom.
        const declCode = f.Code_Employe_Donneur || '';
        const declNom  = f.Nom_Donneur || '';
        const valCode  = body.code_employe || '';
        const valNom   = body.nom_employe || 'gestionnaire';
        mouvFields = { Title: f.Title || body.code_im || '', Code_Employe: declCode, Type_Mouvement: 'Retour', Code_Chantier: 'DEPOT|' + valCode + '|' + valNom, Commentaire: declNom, Etat: body.etat_reception || f.Etat || '', Note: stripPhotosMarker(f.Note || '') + (body.note_reception && body.note_reception !== 'Validé depuis le tableau de bord' ? ' — ' + body.note_reception : '') + ' [validé par ' + valNom + ']', Horodatage: new Date().toISOString(), Photos: photosFinal };
      } else {
        mouvFields = { Title: f.Title || body.code_im || '', Code_Employe: f.Code_Employe_Receveur || body.code_employe || '', Type_Mouvement: 'Transfert', Code_Chantier: (f.Code_Employe_Donneur || '') + '|' + (f.Nom_Donneur || ''), Commentaire: f.Nom_Receveur || body.nom_employe || '', Etat: body.etat_reception || f.Etat || '', Note: body.note_reception || '', Horodatage: new Date().toISOString(), Photos: photosFinal };
      }
      const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: mouvFields }) });
      return json({ success: r.ok, vers_depot: versDepot });
    }

    // Transfert/retour rapide déclenché depuis la fiche immo du dashboard (remplace l'ancien point
    // d'entrée générique "Mouvement direct", qui n'exigeait ni jeton de session ni identité vérifiée
    // — le donneur/déclarant est désormais toujours l'identité de la session, jamais une valeur
    // fournie par le client, pour éviter qu'un mouvement soit attribué à la mauvaise personne).
    if (action === 'creer_mouvement_direct') {
      const _auth = await requireGarant(body); if (!_auth.ok) return json({ success: false, error: _auth.error }, _auth.error === 'droits_insuffisants' ? 403 : 401);
      if (!body.code_im) return json({ success: false, error: 'donnees_invalides' });
      const vraiNom = await getNomResolver();
      const donneurCode = _auth.session.code;
      const donneurNom = vraiNom(donneurCode, donneurCode);
      let mvFields;
      if (body.type_mouvement === 'Retour') {
        mvFields = { Title: body.code_im, Code_Employe: donneurCode, Type_Mouvement: 'Retour', Code_Chantier: 'DEPOT', Commentaire: donneurNom, Etat: body.etat || '', Note: body.note || '', Horodatage: new Date().toISOString() };
      } else {
        const receveur = (body.code_employe_receveur || '').trim().toUpperCase();
        if (!receveur) return json({ success: false, error: 'donnees_invalides' });
        if (!(await estEmployeActifServeur(receveur))) return json({ success: false, error: 'employe_inactif', message: 'Cet employé est inactif — transfert impossible.' });
        const receveurNom = body.nom_receveur || vraiNom(receveur, receveur);
        mvFields = { Title: body.code_im, Code_Employe: receveur, Type_Mouvement: 'Transfert', Code_Chantier: donneurCode + '|' + donneurNom, Commentaire: receveurNom, Etat: body.etat || '', Note: body.note || '', Horodatage: new Date().toISOString() };
      }
      const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: mvFields }) });
      return json({ success: r.ok, status: r.status });
    }

    // ── Retour direct par un garant (PWA terrain) ──
    // Même cas métier que la branche "Retour" de creer_mouvement_direct ci-dessus, mais côté PWA :
    // un garant (Admin/Logistique/Logistique_Mayotte) qui rend lui-même du matériel enregistre son
    // retour immédiatement, sans passer par le flux "en attente de validation" (réservé au retour
    // déclaré par un rôle terrain, action `transfert`). La PWA s'identifie par badge scanné, sans
    // mot de passe : pas de jeton de session possible ici, donc pas de requireGarant — même modèle
    // de confiance que reserver/transfert/declarer_panne (voir PWA_SHARED_ACTIONS dans
    // tests/security.gated-actions.test.js). Remplace l'ancien point d'entrée générique "Mouvement
    // direct" (retiré par erreur du côté PWA lors de l'introduction de creer_mouvement_direct, voir
    // 04_HISTORIQUE_DECISIONS.md). Type_Mouvement et Code_Chantier sont fixés côté serveur (jamais
    // lus du corps de la requête) : cette action ne sert que ce seul cas, pas de généricité à
    // protéger contre une valeur forgée. Photos (ajoutées en parallèle, voir "Photos de mouvement"
    // dans 04_HISTORIQUE_DECISIONS.md) transmises directement dans ce même appel, comme
    // declarer_panne/resoudre_panne — pas de flux "en attente" ici, donc pas besoin du marqueur
    // transitoire utilisé par transfert/valider.
    if (action === 'creer_retour_direct_garant') {
      const code = (body.code_im || '').trim().toUpperCase();
      const garantCode = (body.code_employe || '').trim().toUpperCase();
      if (!code || !garantCode) return json({ success: false, error: 'donnees_invalides' });
      const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
        Title: code, Code_Employe: garantCode, Type_Mouvement: 'Retour', Code_Chantier: 'DEPOT',
        Commentaire: body.nom_employe || garantCode, Etat: body.etat || '', Note: body.note || '',
        Horodatage: body.horodatage || new Date().toISOString(), Photos: joinPhotos(body.photos)
      } }) });
      return json({ success: r.ok, status: r.status });
    }

      return null;
    };

    const resp = await dispatchPost();
    if (resp) {
      // Journal d'audit : point d'insertion unique pour les 62 actions gated (voir commentaire au
      // début de ce bloc POST). On n'inspecte la réponse qu'après coup, sans jamais modifier ce
      // que dispatchPost() a déjà renvoyé — resp.clone() garantit que resp reste lisible telle
      // quelle par le retour ci-dessous, quoi qu'il arrive dans le bloc de journalisation.
      if (GATED_ACTIONS_AUDIT.has(action)) {
        try {
          const cloned = await resp.clone().json();
          if (!AUDIT_AUTH_ERRORS.has(cloned && cloned.error)) {
            const auditSession = await verifySessionWith(body.token, SESSION_SECRET);
            await logAudit({ code: auditSession && auditSession.code, action: action, cible: auditCibleFrom(body), detail: auditDetailFrom(body), success: !!(cloned && cloned.success) });
          }
        } catch (e) { /* réponse non-JSON ou parsing impossible : rien de fiable à journaliser, ne bloque jamais l'action */ }
      }
      return resp;
    }
  }

  return new Response('Not found', { status: 404, headers: cors });
}

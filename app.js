addEventListener('fetch', event => { event.respondWith(handleRequest(event.request)); });

async function handleRequest(request) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const TENANT_ID    = 'c7875e38-b2b0-4c10-a8c5-687c5a214e44';
  const CLIENT_ID    = '3a901471-86c0-4fc7-8d37-319ead2c4b88';
  const CLIENT_SECRET= 'PR88Q~DDRtCdh9FZ2r1n7xcxqgw2.z-6WSXKAaLX';
  const SITE_ID      = 'espacesoleil97.sharepoint.com,4157ffef-a5f6-4e7e-8a19-4f6ab57d7128,d15dad00-7bed-4e78-bb2f-d0156e6e49a7';
  const GL           = 'https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/lists';
  const GESTIONNAIRES= ['CONI', 'AIWI', 'NAXA', 'BAKA'];

  const tok = await fetch('https://login.microsoftonline.com/' + TENANT_ID + '/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=' + CLIENT_ID + '&client_secret=' + encodeURIComponent(CLIENT_SECRET) + '&scope=https://graph.microsoft.com/.default'
  });
  const td = await tok.json();
  if (!td.access_token) return new Response(JSON.stringify({ error: 'token', d: td }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

  const H = { 'Authorization': 'Bearer ' + td.access_token, 'Content-Type': 'application/json', 'Prefer': 'HonorNonIndexedQueriesWarningMayFailRandomly' };
  const url = new URL(request.url);
  const p   = url.searchParams;
  const json = (data, s) => new Response(JSON.stringify(data), { status: s || 200, headers: { ...cors, 'Content-Type': 'application/json' } });

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

  // ── Debugs ──────────────────────────────────────────────────────────────────
  if (p.get('debug_immos')    === '1') { const r = await fetch(GL + '/Immos/items?$expand=fields&$top=2', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  if (p.get('debug_resa')     === '1') { const r = await fetch(GL + '/Reservations/items?$expand=fields&$top=2', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  if (p.get('debug_transferts')=== '1') { const r = await fetch(GL + '/Transferts_En_Attente/items?$expand=fields&$top=5', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  if (p.get('debug_employes') === '1') { const r = await fetch(GL + '/Employes/items?$expand=fields&$top=3', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }
  if (p.get('debug_mouvements')=== '1') { const r = await fetch(GL + '/Mouvements/items?$expand=fields&$top=3&$orderby=fields/Created desc', { headers: H }); return new Response(await r.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }

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
        site:         site
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
      if (statut !== 'Rendue' && statut !== 'Annulee' && fin && fin < now) statut = 'En retard';
      const noteRaw = f.Note || '';
      const initMatch = noteRaw.match(/##INIT:([^#]+)##/);
      const codeInitial = initMatch ? initMatch[1] : '';
      const noteClean = noteRaw.replace(/##INIT:[^#]+##/g, '').trim();
      return { id: item.id, code_im: f.Code_IM || '', code_im_initial: codeInitial, code_employe: f.Title || '', nom_employe: f.Nom_Employe || '', code_chantier: f.Code_Chantier || '', nom_chantier: f.Nom_Chantier || '', date_debut: f.Date_Debut || '', date_fin: f.Date_Fin || '', statut, note: noteClean, created: f.Created || '' };
    }));
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
      if (statut !== 'Rendue' && statut !== 'Annulee' && fin && fin < now) statut = 'En retard';
      const noteRaw = f.Note || '';
      const initMatch = noteRaw.match(/##INIT:([^#]+)##/);
      return { id: item.id, code_im: f.Code_IM || '', code_im_initial: initMatch ? initMatch[1] : '', code_employe: f.Title || '', nom_employe: f.Nom_Employe || '', code_chantier: f.Code_Chantier || '', nom_chantier: f.Nom_Chantier || '', date_debut: f.Date_Debut || '', date_fin: f.Date_Fin || '', statut, note: noteRaw.replace(/##INIT:[^#]+##/g, '').trim() };
    }));
  }

  // ── Liste des employés (avec rôle/statut) ─────────────────────────────────────
  if (p.get('employes') === '1') {
    const items = await paginate(GL + '/Employes/items?$expand=fields&$top=200', 5);
    const mapped = items.map(i => {
      const f = i.fields || {};
      return {
        code: f.Title || f.Code || f.Code_Employe || '',
        nom: f.field_1 || f.Nom || f.Nom_Employe || f.Name || '',
        poste: f.Poste || '',
        // Code_CT réutilisé comme champ "Droits"
        role: f.Code_CT || f.Droits || '',
        // Site de rattachement (Reunion/Mayotte). Défaut Reunion si vide.
        site: (function(){ var s=(f.Site||'').trim().toLowerCase(); return s.startsWith('may')?'Mayotte':(s?'Reunion':''); })(),
        // Actif : la colonne SharePoint "Actif" vaut "Oui"/"Non". Défaut actif si vide.
        actif: (function(){ var a=(f.Actif||'').trim().toLowerCase(); return a==='non'||a==='no'||a==='false'?false:true; })(),
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
      // Préférer celle avec un rôle défini, sinon avec un site défini
      const score = (x) => (x.role ? 2 : 0) + (x.site ? 1 : 0);
      if (score(e) > score(ex)) byCode[e.code] = e;
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

    const allMovRaw = (movData.value || []).map(i => { const code = i.fields.Code_Employe || ''; return { code_im: i.fields.Title || '', code_employe: code, nom_employe: vraiNom(code, i.fields.Commentaire || ''), type_mouvement: i.fields.Type_Mouvement || '', code_chantier: i.fields.Code_Chantier || '', etat: i.fields.Etat || '', note: i.fields.Note || '', horodatage: i.fields.Horodatage || i.fields.Created || '' }; });
    const allMov = allMovRaw.sort((a, b) => new Date(b.horodatage) - new Date(a.horodatage));

    // Filtrer les transferts en attente côté JS (évite les problèmes OData)
    const pending = (pendData.value || [])
      .filter(i => { const s = (i.fields || {}).Statut || ''; return s !== 'Validé' && s !== 'Valide' && s !== 'Refused'; })
      .map(i => ({ id: i.id, code_im: i.fields.Title || '', donneur_code: i.fields.Code_Employe_Donneur || '', donneur_nom: i.fields.Nom_Donneur || '', receveur_code: i.fields.Code_Employe_Receveur || '', receveur_nom: i.fields.Nom_Receveur || '', etat: i.fields.Etat || '', note: i.fields.Note || '', statut: i.fields.Statut || 'En attente', horodatage: i.fields.Created || '' }));

    // ── Inventaire courant : dernier mouvement de POSSESSION par immo ──────────
    // Important : une déclaration de panne (Panne / Suivi_Panne) n'est PAS un
    // changement de possession. L'immo reste avec son dernier détenteur réel
    // jusqu'à un vrai Transfert, Retour, ou Réparation (résolution = retour dépôt).
    const inv = {};
    allMov.forEach(m => {
      if (inv[m.code_im]) return; // déjà déterminé par un mouvement plus récent
      if (m.type_mouvement === 'Panne' || m.type_mouvement === 'Suivi_Panne') return; // ignoré pour la possession
      const isGest = GESTIONNAIRES.includes(m.code_employe);
      // Une Réparation = la panne est résolue = l'immo revient au dépôt, quel que soit l'admin qui a traité
      const isRetour = m.type_mouvement === 'Retour' || m.type_mouvement === 'Réparation' || m.code_chantier === 'DEPOT' || isGest;
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
      return json((d.value || []).filter(i => { const s = (i.fields || {}).Statut || ''; return s !== 'Validé' && s !== 'Valide'; }).map(i => ({ id: i.id, code_im: i.fields.Title || '', code_employe_donneur: i.fields.Code_Employe_Donneur || '', nom_donneur: i.fields.Nom_Donneur || '', etat: i.fields.Etat || '', note: i.fields.Note || '', horodatage: i.fields.Created || '' })));
    }

    if (immo) {
      const all = await paginate(GL + '/Mouvements/items?$expand=fields&$orderby=fields/Created%20desc&$top=2000', 3);
      const q = immo.toUpperCase();
      const resolveNom = await getNomResolver();
      return json(all.map(i => { const code = i.fields.Code_Employe || ''; return { code_im: i.fields.Title || '', code_employe: code, nom_employe: resolveNom(code, i.fields.Commentaire || ''), type_mouvement: i.fields.Type_Mouvement || '', code_chantier: i.fields.Code_Chantier || '', etat: i.fields.Etat || '', note: i.fields.Note || '', horodatage: i.fields.Horodatage || i.fields.Created || '' }; }).filter(m => m.code_im.toUpperCase().includes(q)));
    }

    if (employe) {
      const all = await paginate(GL + '/Mouvements/items?$expand=fields&$orderby=fields/Created%20desc&$top=2000', 3);
      const resolveNom = await getNomResolver();
      const movs = all.map(i => { const code = i.fields.Code_Employe || ''; return { code_im: i.fields.Title || '', code_employe: code, nom_employe: resolveNom(code, i.fields.Commentaire || ''), type_mouvement: i.fields.Type_Mouvement || '', code_chantier: i.fields.Code_Chantier || '', etat: i.fields.Etat || '', note: i.fields.Note || '', horodatage: i.fields.Horodatage || i.fields.Created || '' }; });
      const seen = {}, actuel = [];
      // Une Panne/Suivi_Panne n'est pas un changement de possession : on l'ignore pour déterminer le détenteur actuel
      movs.forEach(m => {
        if (m.type_mouvement === 'Panne' || m.type_mouvement === 'Suivi_Panne') return;
        if (!seen[m.code_im]) { seen[m.code_im] = true; if (m.code_employe === employe && m.type_mouvement !== 'Retour' && m.type_mouvement !== 'Réparation' && m.code_chantier !== 'DEPOT' && !GESTIONNAIRES.includes(m.code_employe)) actuel.push(m); }
      });
      return json({ actuel, historique: movs.filter(m => m.code_employe === employe) });
    }

    const all = await paginate(GL + '/Mouvements/items?$expand=fields&$orderby=fields/Created%20desc&$top=2000', 3);
    const resolveNomAll = await getNomResolver();
    return json(all.map(i => { const code = i.fields.Code_Employe || ''; return { code_im: i.fields.Title || '', code_employe: code, nom_employe: resolveNomAll(code, i.fields.Commentaire || ''), type_mouvement: i.fields.Type_Mouvement || '', code_chantier: i.fields.Code_Chantier || '', etat: i.fields.Etat || '', note: i.fields.Note || '', horodatage: i.fields.Horodatage || i.fields.Created || '' }; }));
  }

  // ── POST ──────────────────────────────────────────────────────────────────────
  if (request.method === 'POST') {
    const action = p.get('action');
    const body   = await request.json();

    if (action === 'upload_photo') {
      try {
        const b64 = (body.data || '').includes(',') ? body.data.split(',')[1] : body.data;
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Photos_Immos/' + encodeURIComponent(body.code_im) + '/' + encodeURIComponent(body.filename || (Date.now() + '.jpg')) + ':/content', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + td.access_token, 'Content-Type': 'image/jpeg' }, body: bytes.buffer });
        return json({ success: r.ok, url: r.ok ? 'https://immo-proxy.ral-85d.workers.dev/?photo=' + encodeURIComponent(body.code_im + '/' + body.filename) : null });
      } catch (e) { return json({ success: false, error: e.message }); }
    }

    if (action === 'delete_photo') {
      const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + SITE_ID + '/drive/root:/Photos_Immos/' + encodeURIComponent(body.code_im) + '/' + encodeURIComponent(body.filename), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + td.access_token } });
      return json({ success: r.ok });
    }

    // ── Mettre à jour le rôle/droits d'un employé ──
    if (action === 'maj_droits') {
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

    // ── SEED : appliquer en masse les rôles + sites aux employés (one-shot) ──
    // Sécurité : nécessite body.confirm === 'ESPACE-SOLEIL' pour s'exécuter.
    // ── Nettoyage des doublons d'employés (garde 1 ligne par code) ──
    if (action === 'dedupe_employes') {
      if (body.confirm !== 'ESPACE-SOLEIL') return json({ success: false, error: 'confirmation_requise' });
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
        const r = await fetch(GL + '/Employes/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Actif: val }) });
        ok = r.ok;
      } catch (e) { ok = false; }
      return json({ success: ok, item_id: itemId, actif: val });
    }

    // ── SEED : appliquer les sites aux immos (one-shot) ──
    if (action === 'seed_immo_sites') {
      if (body.confirm !== 'ESPACE-SOLEIL') return json({ success: false, error: 'confirmation_requise' });
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
      if (body.confirm !== 'ESPACE-SOLEIL') return json({ success: false, error: 'confirmation_requise' });
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
      const r = await fetch(GL + '/Reservations/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: body.code_employe || '', Nom_Employe: body.nom_employe || '', Code_Chantier: body.code_chantier || '', Nom_Chantier: body.nom_chantier || '', Date_Debut: body.date_debut, Date_Fin: body.date_fin, Statut: 'Demandee', Note: body.note || '', Code_IM: body.code_im || '' } }) });
      return json({ success: r.ok, status: r.status, detail: await r.text() });
    }

    if (action === 'statut_resa') {
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
      const r = await fetch(GL + '/Transferts_En_Attente/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: body.code_im, Code_Employe_Donneur: body.code_employe_donneur, Nom_Donneur: body.nom_donneur, Code_Employe_Receveur: body.code_employe_receveur, Nom_Receveur: body.nom_receveur, Statut: 'En attente', Etat: body.etat || '', Note: body.note || '' } }) });
      return json({ success: r.ok, status: r.status });
    }

    // ── Marquer statut immo (HS définitive / Perdu / En panne) ──
    if (action === 'marquer_statut_immo') {
      const fields = { Etat: body.etat };
      if (body.actif !== undefined) fields.Actif = body.actif;
      // Stocker le motif dans Note si dispo, sinon dans Commentaire
      if (body.motif) fields.Note = body.motif;
      const r = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + body.code_im + "'&$top=1", { headers: H });
      const rd = await r.json();
      const itemId = rd.value && rd.value[0] ? rd.value[0].id : null;
      if (!itemId) return json({ success: false, error: 'Immo non trouvée' });
      const rp = await fetch(GL + '/Immos/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(fields) });
      // Créer aussi un mouvement pour la traçabilité
      await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: body.code_im, Code_Employe: body.par_code || 'ADMIN', Type_Mouvement: body.type_mouv || 'Archivage', Commentaire: body.par_nom || 'Admin', Etat: body.etat, Note: body.motif || '', Horodatage: new Date().toISOString() } }) });
      return json({ success: rp.ok });
    }

    // ── Mettre à jour le suivi d'une panne (prestataire, coût, note) ──
    if (action === 'maj_panne') {
      // Créer un mouvement de suivi — marqueur ##PRESTA:Nom## non-ambigu pour la localisation
      const note = '[SUIVI ' + new Date().toLocaleDateString('fr-FR') + ']' +
        (body.prestataire ? ' ##PRESTA:' + body.prestataire + '## Prestataire: ' + body.prestataire : '') +
        (body.cout_estime ? ' Cout estime: ' + body.cout_estime + 'EUR' : '') +
        ' ' + (body.note_suivi || '');
      const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
        Title: body.code_im, Code_Employe: body.par_code || 'CONI', Type_Mouvement: 'Suivi_Panne',
        Commentaire: body.par_nom || body.par_code || 'CONI', Etat: 'En panne', Note: note, Horodatage: new Date().toISOString()
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
      const rp = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: body.code_im, Code_Employe: body.code_employe || '', Type_Mouvement: 'Panne', Commentaire: body.nom_employe || '', Etat: 'En panne', Note: body.motif || '', Horodatage: new Date().toISOString() } }) });
      return json({ success: rp.ok });
    }

    // ── Résoudre une panne ──
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
      await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
        Title: body.code_im, Code_Employe: body.par_code || 'CONI', Type_Mouvement: 'Réparation',
        Commentaire: body.par_nom || body.par_code || 'CONI', Etat: body.etat_resolution || 'Bon état',
        Note: noteRep, Horodatage: new Date().toISOString()
      } }) });
      return json({ success: true });
    }

    // ── Déclarer vol ou disparition ──
    if (action === 'declarer_vol') {
      const etatVol = body.type_vol || 'Volé';
      const ri = await fetch(GL + "/Immos/items?$expand=fields&$filter=fields/Title eq '" + body.code_im + "'&$top=1", { headers: H });
      const rid = await ri.json();
      const itemId = rid.value && rid.value[0] ? rid.value[0].id : null;
      if (itemId) await fetch(GL + '/Immos/items/' + itemId + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Etat: etatVol, Actif: false }) });
      await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: {
        Title: body.code_im, Code_Employe: body.par_code || 'ADMIN', Type_Mouvement: 'Archivage',
        Commentaire: body.par_nom || 'Admin', Etat: etatVol,
        Note: body.motif + ' [' + etatVol + ' déclaré par ' + (body.par_nom || 'Admin') + ']',
        Horodatage: new Date().toISOString()
      } }) });
      return json({ success: true });
    }

    // ── Annuler un transfert en attente ──
    if (action === 'annuler_transfert') {
      const r = await fetch(GL + '/Transferts_En_Attente/items/' + body.id + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify({ Statut: 'Annulé' }) });
      return json({ success: r.ok });
    }

    // ── Modifier le receveur d'un transfert en attente ──
    if (action === 'maj_transfert') {
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
      const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: f.Title || body.code_im || '', Code_Employe: f.Code_Employe_Receveur || body.code_employe || '', Type_Mouvement: 'Transfert', Code_Chantier: (f.Code_Employe_Donneur || '') + '|' + (f.Nom_Donneur || ''), Commentaire: f.Nom_Receveur || body.nom_employe || '', Etat: body.etat_reception || f.Etat || '', Note: body.note_reception || '', Horodatage: new Date().toISOString() } }) });
      return json({ success: r.ok });
    }

    // Mouvement direct
    const r = await fetch(GL + '/Mouvements/items', { method: 'POST', headers: H, body: JSON.stringify({ fields: { Title: body.code_im, Code_Employe: body.code_employe, Type_Mouvement: body.type_mouvement, Code_Chantier: body.code_chantier, Commentaire: body.nom_employe, Etat: body.etat || '', Note: body.note || '', Horodatage: body.horodatage } }) });
    return json({ success: r.ok, status: r.status });
  }

  return new Response('Not found', { status: 404, headers: cors });
}

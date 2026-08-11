// Lecteur XLSX minimal, ZÉRO dépendance npm (cohérent avec le reste du projet — voir
// 01_ARCHITECTURE_TECHNIQUE.md, "zéro build"). Un fichier .xlsx est une archive ZIP contenant des
// fragments XML (OOXML) : ce module lit directement le conteneur ZIP (en-têtes binaires + inflate
// via le module natif node:zlib) et les XML qui nous intéressent (workbook.xml, sharedStrings.xml,
// styles.xml, worksheets/sheetN.xml) avec des regex ciblées plutôt qu'un parseur XML général —
// suffisant pour la structure simple d'une feuille de calcul (pas de XML imbriqué complexe côté
// cellules). Utilisé UNIQUEMENT par les scripts de migration (Node, exécutés localement), jamais
// par worker.js/app.js/dashboard.html.
'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');

// ── Étage 1 : conteneur ZIP ───────────────────────────────────────────────────────────────────
function readZipEntries(buf) {
  // End Of Central Directory : signature PK\x05\x06, dans les 65557 derniers octets max (22 fixes +
  // 65535 de commentaire possible).
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const searchStart = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= searchStart; i--) {
    if (buf[i] === sig[0] && buf[i + 1] === sig[1] && buf[i + 2] === sig[2] && buf[i + 3] === sig[3]) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Fichier non reconnu comme .xlsx (signature ZIP EOCD introuvable).');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const cdEntries = buf.readUInt16LE(eocd + 10);

  const entries = {};
  let p = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('En-tête de répertoire central ZIP invalide à l\'offset ' + p);
    const compMethod = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries[name] = { compMethod, compSize, uncompSize, localHeaderOffset };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractEntry(buf, entry) {
  const p = entry.localHeaderOffset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error('En-tête local ZIP invalide à l\'offset ' + p);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const dataStart = p + 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + entry.compSize);
  if (entry.compMethod === 0) return Buffer.from(data);
  if (entry.compMethod === 8) return zlib.inflateRawSync(data);
  throw new Error('Méthode de compression ZIP non supportée (' + entry.compMethod + ') pour cette entrée.');
}

function readPart(buf, entries, name) {
  const e = entries[name];
  if (!e) return null;
  return extractEntry(buf, e).toString('utf8');
}

// ── Étage 2 : décodage XML minimal ────────────────────────────────────────────────────────────
const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeXmlText(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, code) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return XML_ENTITIES[code] !== undefined ? XML_ENTITIES[code] : m;
  });
}
function attr(tag, name) {
  const m = new RegExp(name + '="([^"]*)"').exec(tag);
  return m ? decodeXmlText(m[1]) : null;
}

// ── Étage 3 : sharedStrings.xml ───────────────────────────────────────────────────────────────
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    // Concatène tous les <t>...</t> (texte simple ou runs <r><t>...</t></r> de texte enrichi)
    let text = '';
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>|<t[^>]*\/>/g;
    let tm;
    while ((tm = tRe.exec(inner))) text += decodeXmlText(tm[1] || '');
    out.push(text);
  }
  return out;
}

// ── Étage 4 : styles.xml (juste ce qu'il faut pour détecter les cellules "date") ────────────────
// Formats de date/heure intégrés à Excel (ids réservés par la spec OOXML) — table standard reprise
// par les lecteurs XLSX usuels (ex. SheetJS SSF.js), pas une invention ad hoc.
const BUILTIN_DATE_NUMFMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 57]);
function looksLikeDateFormatCode(code) {
  if (!code) return false;
  // Retire les segments [..] (couleurs, locales, conditions : ex. [$-409], [Red]) avant l'heuristique
  const stripped = code.replace(/\[[^\]]*\]/g, '');
  if (/general|@/i.test(stripped) && !/[dmy]/i.test(stripped)) return false;
  return /[dmy]{1,4}|hh?:mm|mm:ss/i.test(stripped);
}
function parseStyles(xml) {
  if (!xml) return { cellXfNumFmtId: [] };
  const customFmts = {}; // numFmtId -> formatCode
  const numFmtsBlock = /<numFmts[^>]*>([\s\S]*?)<\/numFmts>/.exec(xml);
  if (numFmtsBlock) {
    const re = /<numFmt\s+[^>]*\/>/g;
    let m;
    while ((m = re.exec(numFmtsBlock[1]))) {
      const id = parseInt(attr(m[0], 'numFmtId'), 10);
      const code = attr(m[0], 'formatCode');
      if (Number.isFinite(id)) customFmts[id] = code;
    }
  }
  const cellXfsBlock = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  const cellXfNumFmtId = [];
  if (cellXfsBlock) {
    const re = /<xf\b[^>]*?\/?>/g;
    let m;
    while ((m = re.exec(cellXfsBlock[1]))) {
      const nf = attr(m[0], 'numFmtId');
      cellXfNumFmtId.push(nf !== null ? parseInt(nf, 10) : 0);
    }
  }
  function isDateStyle(styleIndex) {
    if (styleIndex === null || styleIndex === undefined || styleIndex === '') return false;
    const numFmtId = cellXfNumFmtId[parseInt(styleIndex, 10)];
    if (numFmtId === undefined) return false;
    if (BUILTIN_DATE_NUMFMT_IDS.has(numFmtId)) return true;
    if (customFmts[numFmtId]) return looksLikeDateFormatCode(customFmts[numFmtId]);
    return false;
  }
  return { isDateStyle };
}

// Numéro de série Excel (epoch 1899-12-30, cf. bug historique de l'an 1900) → chaîne ISO. Formule
// standard (ex. utilisée par SheetJS) : 25569 = nb de jours entre le 01/01/1900 (série 1) et le
// 01/01/1970 (epoch Unix), correcte pour toute date réelle postérieure à mars 1900.
function excelSerialToISO(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const hasTime = Math.abs(serial - Math.floor(serial)) > 1e-6;
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  if (!hasTime) return datePart;
  return datePart + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
}

// ── Étage 5 : conversion référence de cellule ("B7") → {col, row} (col 0-based, A=0) ────────────
function colLetterToIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}
function splitCellRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  return { col: colLetterToIndex(m[1]), row: parseInt(m[2], 10) };
}

// ── Étage 6 : parsing d'une feuille (sheetN.xml) → tableau de lignes (0-indexées), chaque ligne
// étant un tableau de valeurs (0-indexé, A=index 0). Cellules vides = undefined (trous).
function parseSheet(xml, sharedStrings, styles) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const rowTag = rm[0];
    const rowNumAttr = attr(rowTag, 'r');
    const rowInner = rm[1] || '';
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    const rowIdx = rowNumAttr ? parseInt(rowNumAttr, 10) - 1 : rows.length;
    if (!rows[rowIdx]) rows[rowIdx] = [];
    while ((cm = cellRe.exec(rowInner))) {
      const cAttrs = cm[1];
      const cInner = cm[2] || '';
      const ref = attr('<c ' + cAttrs + '/>', 'r');
      const type = attr('<c ' + cAttrs + '/>', 't');
      const styleIdx = attr('<c ' + cAttrs + '/>', 's');
      const pos = ref ? splitCellRef(ref) : null;
      const colIdx = pos ? pos.col : 0;
      let value;
      if (type === 'inlineStr') {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cInner);
        value = t ? decodeXmlText(t[1]) : '';
      } else {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(cInner);
        const raw = vm ? vm[1] : '';
        if (type === 's') {
          const idx = parseInt(raw, 10);
          value = sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
        } else if (type === 'str') {
          value = decodeXmlText(raw); // résultat texte d'une formule
        } else if (type === 'b') {
          value = raw === '1';
        } else if (raw === '') {
          value = undefined;
        } else {
          const num = parseFloat(raw);
          if (styles.isDateStyle && styles.isDateStyle(styleIdx)) value = excelSerialToISO(num);
          else value = num;
        }
      }
      rows[rowIdx][colIdx] = value;
    }
  }
  // Comble les lignes totalement vides entre deux lignes numérotées (SharePoint/Excel peut sauter des r=)
  const maxRow = rows.length;
  for (let i = 0; i < maxRow; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

// ── API publique ──────────────────────────────────────────────────────────────────────────────
function readXlsx(filePath) {
  const buf = fs.readFileSync(filePath);
  const entries = readZipEntries(buf);

  const workbookXml = readPart(buf, entries, 'xl/workbook.xml');
  if (!workbookXml) throw new Error('xl/workbook.xml introuvable — fichier non conforme.');
  const relsXml = readPart(buf, entries, 'xl/_rels/workbook.xml.rels') || '';
  const sharedStrings = parseSharedStrings(readPart(buf, entries, 'xl/sharedStrings.xml'));
  const styles = parseStyles(readPart(buf, entries, 'xl/styles.xml'));

  // Résout r:id → chemin réel de la partie (xl/worksheets/sheetN.xml), car l'ordre/numérotation des
  // fichiers ne correspond pas forcément à l'ordre des onglets déclaré dans workbook.xml.
  const relTarget = {};
  const relRe = /<Relationship\b([^>]*)\/>/g;
  let rm;
  while ((rm = relRe.exec(relsXml))) {
    const id = attr('<r ' + rm[1] + '/>', 'Id');
    const target = attr('<r ' + rm[1] + '/>', 'Target');
    if (id && target) relTarget[id] = target.replace(/^\/?/, '');
  }

  const sheetNames = [];
  const sheetParts = [];
  const sheetRe = /<sheet\b([^>]*)\/>/g;
  let sm;
  while ((sm = sheetRe.exec(workbookXml))) {
    const name = attr('<s ' + sm[1] + '/>', 'name');
    const rid = attr('<s ' + sm[1] + '/>', 'r:id') || attr('<s ' + sm[1] + '/>', 'id');
    sheetNames.push(name);
    const target = relTarget[rid];
    sheetParts.push(target ? ('xl/' + target.replace(/^xl\//, '')) : null);
  }

  const sheets = {};
  sheetNames.forEach((name, idx) => {
    const partPath = sheetParts[idx];
    const xml = partPath ? readPart(buf, entries, partPath) : null;
    sheets[name] = xml ? parseSheet(xml, sharedStrings, styles) : [];
  });

  return { sheetNames, sheets };
}

// Aide au repérage de colonnes par en-tête (ligne d'en-tête = 1ère ligne non vide par défaut).
// Renvoie un objet { "Nom d'en-tête": colIndex0Based }. Comparaison texte normalisée (trim,
// espaces multiples réduits) pour tolérer les petites variations de saisie dans le classeur.
function normalizeHeader(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
}
function headerMap(rows, headerRowIdx) {
  const row = rows[headerRowIdx] || [];
  const map = {};
  row.forEach((v, i) => { const h = normalizeHeader(v); if (h) map[h] = i; });
  return map;
}

module.exports = { readXlsx, excelSerialToISO, normalizeHeader, headerMap };

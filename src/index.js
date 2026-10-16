// Vnosko Lite by PN Scripts (MIT): reading CSV, TSV and XLSX, finding the header row, matching columns
// to your fields, and checking and converting every cell. No dependencies; browsers and Node 18+.

/* ----- text and CSV ---------------------------------------------------------------------------- */

/** Bytes to text: UTF-8 (with or without BOM), UTF-16 with BOM, otherwise the fallback (default windows-1252). */
export function decode(bytes, fallback = 'windows-1252') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, '');
  } catch {
    return new TextDecoder(fallback).decode(b);
  }
}

/** The delimiter used most consistently over the first lines (outside quotes): , ; tab or |. */
export function sniffDelimiter(text) {
  const lines = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length && lines.length < 20; i++) {
    const c = text[i];
    if (c === '"') q = !q;
    if (!q && (c === '\n' || c === '\r')) {
      if (cur) lines.push(cur);
      cur = '';
      continue;
    }
    if (!q) cur += c;
  }
  if (cur) lines.push(cur);
  let best = ',';
  let score = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const nonzero = counts.filter((n) => n > 0);
    if (!nonzero.length) continue;
    const mode = nonzero.sort((a, b) => nonzero.filter((x) => x === b).length - nonzero.filter((x) => x === a).length)[0];
    const s = counts.filter((n) => n === mode).length * 10 + mode;
    if (s > score) {
      score = s;
      best = d;
    }
  }
  return best;
}

/** RFC 4180 CSV: quoted fields, "" inside quotes, line breaks inside quotes, \r\n or \n. Returns rows of strings. */
export function parseCSV(text, delimiter) {
  const d = delimiter || sniffDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') q = true;
    else if (c === d) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/* ----- XLSX ----------------------------------------------------------------------------------- */

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** The files of a ZIP archive by name (stored or deflated entries), read from the central directory. */
export async function unzip(buffer) {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP file');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('damaged ZIP directory');
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = b.subarray(start, start + size);
    files[name] = { method, data };
    p += 46 + nameLen + extra + comment;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const f = files[name];
      if (!f) return null;
      const raw = f.method === 0 ? f.data : f.method === 8 ? await inflateRaw(f.data) : null;
      if (!raw) throw new Error(`unsupported ZIP compression in ${name}`);
      return dec.decode(raw);
    },
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()]));
}
function textOf(xml) {
  let s = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)) s += m[1] ? unescapeXml(m[1]) : '';
  return s;
}
function colIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Excel's day number to YYYY-MM-DD (the 1900 system; times of day are dropped). */
export function excelDate(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The sheets of an XLSX workbook: [{ name, rows }]. Numbers stay numbers as text ("1250.5"), cells formatted
 * as dates become YYYY-MM-DD, booleans TRUE/FALSE, shared and inline strings text.
 */
export async function parseXLSX(buffer) {
  const zip = await unzip(buffer);
  const shared = [];
  const ss = await zip.text('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const dateStyles = new Set();
  const styles = await zip.text('xl/styles.xml');
  if (styles) {
    const custom = new Set();
    for (const m of styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
      const code = unescapeXml(m[2]).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
      if (/[dmy]/i.test(code) && !/^[#0.,\s%]*$/.test(code)) custom.add(+m[1]);
    }
    const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles);
    if (xfs) {
      let i = 0;
      for (const m of xfs[1].matchAll(/<xf\s[^>]*?numFmtId="(\d+)"[^>]*?\/?>/g)) {
        const id = +m[1];
        if (BUILTIN_DATE_FORMATS.has(id) || custom.has(id)) dateStyles.add(i);
        i++;
      }
    }
  }
  const wb = (await zip.text('xl/workbook.xml')) || '';
  const rels = (await zip.text('xl/_rels/workbook.xml.rels')) || '';
  const target = {};
  for (const m of rels.matchAll(/<Relationship\s[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) target[m[1]] = m[2];
  for (const m of rels.matchAll(/<Relationship\s[^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)) target[m[2]] = target[m[2]] || m[1];
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
    const name = unescapeXml((/name="([^"]*)"/.exec(m[1]) || [])[1] || 'Sheet');
    const rid = (/r:id="([^"]*)"/.exec(m[1]) || /\bid="([^"]*)"/.exec(m[1]) || [])[1];
    let path = target[rid] || '';
    path = path.startsWith('/') ? path.slice(1) : path.startsWith('xl/') ? path : `xl/${path}`;
    const xml = await zip.text(path);
    if (xml === null) continue;
    const rows = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rn = +((/\br="(\d+)"/.exec(r[1]) || [])[1] || rows.length + 1);
      const cells = [];
      let next = 0;
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = (/\br="([A-Z]+\d+)"/.exec(attrs) || [])[1];
        const col = ref ? colIndex(ref) : next;
        next = col + 1;
        const t = (/\bt="(\w+)"/.exec(attrs) || [])[1] || 'n';
        const s = +((/\bs="(\d+)"/.exec(attrs) || [])[1] || 0);
        const inner = c[2] || '';
        const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
        let val = '';
        if (t === 's') val = shared[+v] ?? '';
        else if (t === 'inlineStr') val = textOf(inner);
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') val = v === undefined ? '' : unescapeXml(v);
        else if (v !== undefined) val = dateStyles.has(s) ? excelDate(+v) : String(+(+v).toPrecision(15));
        cells[col] = val;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
      rows[rn - 1] = cells;
    }
    const dense = [];
    for (let i = 0; i < rows.length; i++) dense.push(rows[i] || []);
    sheets.push({ name, rows: dense.filter((row) => row.some((x) => String(x).trim() !== '')) });
  }
  return sheets;
}

/** Any supported file: { name, sheets: [{ name, rows }] }. */
export async function readFile(file, { encoding } = {}) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = file.name || 'file';
  if (buf[0] === 0x50 && buf[1] === 0x4b) return { name, sheets: await parseXLSX(buf) };
  if (/\.xls$/i.test(name) || (buf[0] === 0xd0 && buf[1] === 0xcf)) throw new VnoskoError('xls');
  const text = decode(buf, encoding);
  return { name, sheets: [{ name, rows: parseCSV(text, /\.tsv$/i.test(name) ? '\t' : undefined) }] };
}

export class VnoskoError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/* ----- columns -------------------------------------------------------------------------------- */

export function norm(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ').trim();
}

/** The row that holds the headings: among the first 10, the one with the most cells that match a field, else the first full row. */
export function findHeaderRow(rows, fields) {
  let best = 0;
  let score = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const s = rows[i].filter((c) => fields.some((f) => names(f).includes(norm(c)))).length * 10 + rows[i].filter((c) => String(c).trim()).length / 100;
    if (s > score) {
      score = s;
      best = i;
    }
  }
  return best;
}

function names(f) {
  return [f.key, f.label, ...(f.aliases || [])].map(norm).filter(Boolean);
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  // The last word carries the meaning in headings such as "Customer email" or "Order date".
  const last = (x) => x.slice(x.lastIndexOf(' ') + 1);
  const tok = common / Math.max(ta.size, tb.size) + (common && last(a) === last(b) ? 0.25 : 0);
  const compact = (s) => s.replace(/ /g, '');
  const ca = compact(a);
  const cb = compact(b);
  const sub = ca.length >= 3 && cb.length >= 3 && (ca.includes(cb) || cb.includes(ca)) ? Math.min(ca.length, cb.length) / Math.max(ca.length, cb.length) : 0;
  return Math.min(1, Math.max(tok, sub * 0.9));
}

/** Column index for each field key ({ key: index or -1 }), best matches first, each column used once. */
export function autoMap(headers, fields) {
  const h = headers.map(norm);
  const pairs = [];
  fields.forEach((f, fi) => h.forEach((col, ci) => {
    const s = Math.max(...names(f).map((n) => similarity(n, col)));
    if (s >= 0.5) pairs.push([s, fi, ci]);
  }));
  pairs.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  const map = Object.fromEntries(fields.map((f) => [f.key, -1]));
  const usedCol = new Set();
  const usedField = new Set();
  for (const [, fi, ci] of pairs) {
    if (usedCol.has(ci) || usedField.has(fi)) continue;
    map[fields[fi].key] = ci;
    usedCol.add(ci);
    usedField.add(fi);
  }
  return map;
}

/* ----- values --------------------------------------------------------------------------------- */

const TRUE = ['true', 'yes', 'y', '1', 'x', 'да', 'ja', 'oui', 'si', 'sí', 'on', '✓'];
const FALSE = ['false', 'no', 'n', '0', 'не', 'nein', 'non', 'off', ''];

/** A number written 1250.5, 1,250.50, 1.250,50, 1 250,50, 12,5 or (12.50); 1,250 is 1250 and 1.250 is 1.25. Returns a number or null. */
export function parseNumber(text) {
  let s = String(text).trim().replace(/[\s  ']/g, '').replace(/^\((.*)\)$/, '-$1').replace(/[€$£¥%]|[A-Z]{3}$/gi, '');
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lastComma >= 0) {
    // 1,250 and 1,250,000: thousands; 12,5 and 12,50: a decimal comma.
    const commas = s.match(/,/g).length;
    if (commas > 1 && !/^[-+]?\d{1,3}(,\d{3})+$/.test(s)) return null;
    s = commas > 1 || s.length - lastComma - 1 === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    if (!/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) return null;
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A date written 2026-10-15, 15.10.2026, 15/10/2026, 10/15/2026 (dateOrder 'mdy') or an Excel day number; YYYY-MM-DD or null. */
export function parseDate(text, dateOrder = 'dmy') {
  const s = String(text).trim();
  let y;
  let m;
  let d;
  let r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) {
    [d, m] = dateOrder === 'mdy' ? [+r[2], +r[1]] : [+r[1], +r[2]];
    y = +r[3] < 100 ? 2000 + +r[3] : +r[3];
  } else if (/^\d{5}(\.\d+)?$/.test(s)) return excelDate(+s);
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

/** One cell for a field: { value, error } where error is a message code or null. */
export function convert(raw, field, opts = {}) {
  const text = raw === undefined || raw === null ? '' : String(raw).trim();
  if (text === '') return { value: field.default ?? null, error: field.required ? 'required' : null };
  let value = text;
  let error = null;
  switch (field.type || 'string') {
    case 'number':
    case 'integer': {
      const n = parseNumber(text);
      if (n === null) error = 'number';
      else if (field.type === 'integer' && !Number.isInteger(n)) error = 'integer';
      else if (field.min !== undefined && n < field.min) error = 'min';
      else if (field.max !== undefined && n > field.max) error = 'max';
      value = n;
      break;
    }
    case 'boolean': {
      const t = norm(text);
      if (TRUE.includes(t) || text === '✓') value = true;
      else if (FALSE.includes(t)) value = false;
      else error = 'boolean';
      break;
    }
    case 'date':
      value = parseDate(text, opts.dateOrder);
      if (!value) {
        value = text;
        error = 'date';
      }
      break;
    case 'email':
      value = text.toLowerCase();
      if (!EMAIL.test(value)) error = 'email';
      break;
    case 'url':
      if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(text)) error = 'url';
      break;
    case 'phone': {
      const digits = text.replace(/[\s().\-/]/g, '');
      if (!/^\+?\d{6,15}$/.test(digits)) error = 'phone';
      value = digits;
      break;
    }
    case 'enum': {
      const opt = (field.options || []).find((o) => {
        const o2 = typeof o === 'string' ? { value: o } : o;
        return [o2.value, o2.label, ...(o2.aliases || [])].map(norm).includes(norm(text));
      });
      if (opt) value = typeof opt === 'string' ? opt : opt.value;
      else error = 'enum';
      break;
    }
    default:
      if (field.maxLength && text.length > field.maxLength) error = 'maxLength';
      if (!error && field.pattern && !new RegExp(field.pattern).test(text)) error = 'pattern';
  }
  if (!error && field.validate) {
    const msg = field.validate(value);
    if (msg) error = { message: String(msg) };
  }
  return { value, error };
}

/**
 * Every data row checked against the fields: [{ index, values: {key: value}, raw: {key: text}, errors: {key: code} }].
 * Unique fields are checked across rows (case-insensitive for text).
 */
export function checkRows(rows, mapping, fields, opts = {}) {
  const out = rows.map((cells, index) => {
    const values = {};
    const raw = {};
    const errors = {};
    for (const f of fields) {
      const col = mapping[f.key];
      const text = col >= 0 ? (cells[col] ?? '') : '';
      raw[f.key] = String(text);
      const r = convert(text, f, opts);
      values[f.key] = r.value;
      if (r.error) errors[f.key] = r.error;
    }
    return { index, values, raw, errors };
  });
  for (const f of fields.filter((x) => x.unique)) {
    const seen = new Map();
    for (const r of out) {
      const v = r.values[f.key];
      if (v === null || v === '' || r.errors[f.key]) continue;
      const k = typeof v === 'string' ? v.toLowerCase() : String(v);
      if (seen.has(k)) {
        r.errors[f.key] = 'unique';
        const first = out[seen.get(k)];
        if (!first.errors[f.key]) first.errors[f.key] = 'unique';
      } else seen.set(k, r.index);
    }
  }
  return out;
}

/* ----- messages ------------------------------------------------------------------------------- */

/** An example cell that passes the field's own checks (or field.example when given). */
export function exampleValue(field, opts = {}) {
  if (field.example !== undefined && field.example !== null) return String(field.example);
  const first = (field.options || [])[0];
  switch (field.type || 'string') {
    case 'integer': return String(field.min !== undefined ? Math.max(field.min, Math.min(field.max ?? field.min, 1)) : 1);
    case 'number': return String(field.min !== undefined ? Math.max(field.min, Math.min(field.max ?? field.min, 9.5)) : 9.5);
    case 'boolean': return 'yes';
    case 'date': return opts.dateOrder === 'mdy' ? '12/31/2026' : '2026-12-31';
    case 'email': return 'name@example.com';
    case 'url': return 'https://example.com';
    case 'phone': return '+44 20 7946 0000';
    case 'enum': return first === undefined ? '' : typeof first === 'string' ? first : first.label || first.value;
    default: {
      const text = field.pattern ? '' : field.label || field.key;
      return field.maxLength ? String(text).slice(0, field.maxLength) : String(text);
    }
  }
}

function csvCell(v, d) {
  const s = String(v ?? '');
  return /["\r\n]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * A CSV template for the fields: the labels as headings and one example row that imports without errors.
 * Starts with a UTF-8 byte order mark so Excel opens non-Latin labels correctly.
 */
export function templateCsv(fields, { delimiter = ',', example = true, dateOrder = 'dmy' } = {}) {
  const lines = [fields.map((f) => csvCell(f.label || f.key, delimiter)).join(delimiter)];
  if (example) lines.push(fields.map((f) => csvCell(exampleValue(f, { dateOrder }), delimiter)).join(delimiter));
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

export const MESSAGES = {
  en: {
    step_upload: 'Upload', step_map: 'Match columns', step_review: 'Review', step_done: 'Done',
    drop: 'Drop a CSV or Excel file here', or: 'or', choose: 'Choose a file', paste: 'Paste from a spreadsheet', pasteHint: 'Paste rows here (Ctrl+V)', usePaste: 'Use pasted rows',
    formats: 'CSV, TSV or XLSX, up to {max} rows.', template: 'Download a template (CSV)', sheet: 'Sheet', headerRow: 'Headings are in row', column: 'Column in your file', field: 'Field', sample: 'First values',
    notImported: 'Do not import', required: 'required', next: 'Next', back: 'Back', importRows: 'Import {n} rows',
    rows: '{n} rows', errorsLeft: '{n} cells to fix', allGood: 'All cells are valid.', onlyErrors: 'Show only rows with errors', removeRow: 'Remove row', skipInvalid: 'Skip rows with errors',
    imported: '{n} rows imported.', skipped: '{n} rows skipped.', again: 'Import another file',
    rows_one: '1 row', errorsLeft_one: '1 cell to fix', importRows_one: 'Import 1 row', imported_one: '1 row imported.', skipped_one: '1 row skipped.', unmappedRequired: 'Match a column to: {fields}',
    e_required: 'Required', e_number: 'Not a number', e_integer: 'Must be a whole number', e_min: 'Too small (at least {min})', e_max: 'Too large (at most {max})', e_boolean: 'Yes or no',
    e_date: 'Not a date', e_email: 'Not an e-mail address', e_url: 'Not a web address', e_phone: 'Not a phone number', e_enum: 'One of: {options}', e_maxLength: 'At most {maxLength} characters',
    e_pattern: 'Wrong format', e_unique: 'Appears more than once', e_xls: 'Old .xls files cannot be read; save as .xlsx or CSV.', e_empty: 'The file has no rows.', e_tooMany: 'The file has more than {max} rows.', e_read: 'The file could not be read.',
  },
  bg: {
    step_upload: 'Качване', step_map: 'Колони', step_review: 'Проверка', step_done: 'Готово',
    drop: 'Пуснете тук CSV или Excel файл', or: 'или', choose: 'Изберете файл', paste: 'Поставете от таблица', pasteHint: 'Поставете редовете тук (Ctrl+V)', usePaste: 'Използвай поставените редове',
    formats: 'CSV, TSV или XLSX, до {max} реда.', template: 'Изтеглете шаблон (CSV)', sheet: 'Лист', headerRow: 'Заглавията са на ред', column: 'Колона във вашия файл', field: 'Поле', sample: 'Първи стойности',
    notImported: 'Не се внася', required: 'задължително', next: 'Напред', back: 'Назад', importRows: 'Внеси {n} реда',
    rows: '{n} реда', errorsLeft: '{n} клетки за поправка', allGood: 'Всички клетки са верни.', onlyErrors: 'Само редовете с грешки', removeRow: 'Премахни реда', skipInvalid: 'Пропусни редовете с грешки',
    imported: 'Внесени са {n} реда.', skipped: 'Пропуснати са {n} реда.', again: 'Внеси друг файл',
    rows_one: '1 ред', errorsLeft_one: '1 клетка за поправка', importRows_one: 'Внеси 1 ред', imported_one: 'Внесен е 1 ред.', skipped_one: 'Пропуснат е 1 ред.', unmappedRequired: 'Изберете колона за: {fields}',
    e_required: 'Задължително', e_number: 'Не е число', e_integer: 'Трябва да е цяло число', e_min: 'Твърде малко (поне {min})', e_max: 'Твърде голямо (най-много {max})', e_boolean: 'Да или не',
    e_date: 'Не е дата', e_email: 'Не е имейл адрес', e_url: 'Не е уеб адрес', e_phone: 'Не е телефонен номер', e_enum: 'Едно от: {options}', e_maxLength: 'Най-много {maxLength} знака',
    e_pattern: 'Грешен формат', e_unique: 'Среща се повече от веднъж', e_xls: 'Старите .xls файлове не се четат; запазете като .xlsx или CSV.', e_empty: 'Файлът няма редове.', e_tooMany: 'Файлът има повече от {max} реда.', e_read: 'Файлът не може да се прочете.',
  },
};

export function message(lang, overrides, key, vars = {}) {
  // "_one" forms for a count of 1 (rows_one: '1 row'); other counts use the plain key.
  const pick = (k) => (overrides && overrides[k]) ?? (MESSAGES[lang] || MESSAGES.en)[k] ?? MESSAGES.en[k];
  // Your own text for a key is used for every count unless you also give its "_one" form.
  const one = overrides && overrides[key] !== undefined && overrides[`${key}_one`] === undefined ? undefined : pick(`${key}_one`);
  const m = (vars.n === 1 && one) || pick(key) || key;
  return String(m).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function errorText(error, field, lang, overrides) {
  if (error && typeof error === 'object') return error.message;
  const options = (field.options || []).map((o) => (typeof o === 'string' ? o : o.label || o.value)).join(', ');
  return message(lang, overrides, `e_${error}`, { min: field.min, max: field.max, maxLength: field.maxLength, options });
}

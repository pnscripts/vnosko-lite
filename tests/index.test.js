import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as V from '../src/index.js';
import { FIELDS } from './fields.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));

test('CSV: quotes, doubled quotes, line breaks inside quotes, BOM, delimiter found', () => {
  const rows = V.parseCSV(V.decode(fx('customers.csv')));
  assert.equal(V.sniffDelimiter('a;b;c\n1;2,5;3'), ';');
  assert.equal(V.sniffDelimiter('a,b\n"x;y",2'), ',');
  assert.equal(V.sniffDelimiter('a\tb\n1\t2'), '\t');
  assert.deepEqual(rows[1], ['Full name', 'E-mail address', 'Plan', 'Seats', 'Signed up', 'Newsletter'], 'BOM removed');
  assert.equal(rows[2][0], 'Müller, Anna');
  assert.equal(rows[3][0], 'Ivan "Vanko" Petrov');
  assert.equal(rows[6][0], 'Line\nbreak');
  assert.equal(rows.length, 7);
  assert.deepEqual(V.parseCSV('a,b\r\n\r\n1,2\r\n'), [['a', 'b'], ['1', '2']], 'empty lines skipped');
});

test('text encodings: UTF-8, UTF-16 with BOM, Windows-1252 fallback', () => {
  assert.equal(V.parseCSV(V.decode(fx('latin1.csv')))[1][0], 'Renée François');
  const u16 = new Uint8Array([0xff, 0xfe, ...Buffer.from('a,b', 'utf16le')]);
  assert.equal(V.decode(u16), 'a,b');
});

test('XLSX saved by LibreOffice: sheets, numbers, dates, booleans', async () => {
  const sheets = await V.parseXLSX(fx('orders.xlsx'));
  assert.deepEqual(sheets.map((s) => s.name), ['Orders', 'Notes']);
  assert.deepEqual(sheets[0].rows, [['Order no', 'Date', 'Customer email', 'Total', 'Paid'], ['1001', '2026-10-14', 'anna.mueller@example.com', '149.9', '1'], ['1002', '2026-10-15', 'kenji@example.jp', '1250', '0']]);
  assert.deepEqual(sheets[1].rows, [['Second sheet & notes']]);
  assert.equal(V.excelDate(46310), '2026-10-15');
  const f = await V.readFile(new Blob([fx('orders.xlsx')]));
  assert.equal(f.sheets.length, 2, 'readFile tells XLSX from CSV by its bytes');
  await assert.rejects(V.readFile(Object.assign(new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])]), { name: 'old.xls' })), (e) => e.code === 'xls');
});

test('header row and column matching', () => {
  const rows = V.parseCSV(V.decode(fx('customers.csv')));
  const hr = V.findHeaderRow(rows, FIELDS);
  assert.equal(hr, 1, 'the title line above the headings is skipped');
  assert.deepEqual(V.autoMap(rows[hr], FIELDS), { name: 0, email: 1, plan: 2, seats: 3, signedUp: 4, newsletter: 5 });
  assert.deepEqual(V.autoMap(['Customer email', 'Order no', 'Total'], FIELDS), { name: -1, email: 0, plan: -1, seats: -1, signedUp: -1, newsletter: -1 });
  assert.deepEqual(V.autoMap(['EMAIL', 'e-mail'], FIELDS).email, 0, 'each field takes one column');
  assert.equal(V.autoMap(['Създаден'], [{ key: 'created', label: 'Създаден' }]).created, 0, 'Cyrillic headings match too');
});

test('numbers and dates the way spreadsheets write them', () => {
  const n = { '1250.5': 1250.5, '1,250.50': 1250.5, '1.250,50': 1250.5, '1 250,50': 1250.5, '12,5': 12.5, '(12.50)': -12.5, '1,250': 1250, '1.250': 1.25, '1.250.000': 1250000, '€ 99': 99, abc: null, '1,2,3': null };
  for (const [k, v] of Object.entries(n)) assert.equal(V.parseNumber(k), v, k);
  assert.equal(V.parseDate('15.10.2026'), '2026-10-15');
  assert.equal(V.parseDate('10/15/2026', 'mdy'), '2026-10-15');
  assert.equal(V.parseDate('10/15/2026'), null, 'day first by default');
  assert.equal(V.parseDate('31/02/2026'), null);
  assert.equal(V.parseDate('46310'), '2026-10-15', 'an Excel day number');
});

test('every cell checked and converted; unique across rows', () => {
  const rows = V.parseCSV(V.decode(fx('customers.csv')));
  const map = V.autoMap(rows[1], FIELDS);
  const out = V.checkRows(rows.slice(2), map, FIELDS);
  assert.deepEqual(out[0].values, { name: 'Müller, Anna', email: 'anna.mueller@example.com', plan: 'pro', seats: 12, signedUp: '2026-10-15', newsletter: true });
  assert.deepEqual(out[0].errors, { email: 'unique' }, 'the same e-mail is in the last row');
  assert.deepEqual(out[1].errors, { email: 'email' });
  assert.equal(out[1].values.plan, 'pro', 'premium is an alias of Pro');
  assert.deepEqual(out[2].errors, { plan: 'enum', seats: 'max', signedUp: 'date' });
  assert.equal(out[2].values.newsletter, true, 'ja is yes');
  assert.deepEqual(out[3].errors, { seats: 'integer' });
  assert.equal(out[3].values.newsletter, null);
  assert.deepEqual(out[4].errors, { email: 'unique' });
  const custom = V.convert('600', { key: 's', type: 'integer', validate: (v) => (v > 500 ? 'Call us for more than 500 seats' : null) });
  assert.deepEqual(custom.error, { message: 'Call us for more than 500 seats' });
  assert.deepEqual(V.convert('', { key: 'x', required: true }), { value: null, error: 'required' });
  assert.deepEqual(V.convert('+44 (20) 7946-0958', { key: 'p', type: 'phone' }), { value: '+442079460958', error: null });
  assert.equal(V.convert('https://example.com/a', { key: 'u', type: 'url' }).error, null);
});

test('messages in English and Bulgarian, with your own texts on top', () => {
  assert.deepEqual(Object.keys(V.MESSAGES.bg).sort(), Object.keys(V.MESSAGES.en).sort());
  assert.equal(V.errorText('max', FIELDS[3], 'en'), 'Too large (at most 500)');
  assert.equal(V.errorText('enum', FIELDS[2], 'bg'), 'Едно от: Free, Pro, Team');
  assert.equal(V.message('de', { next: 'Weiter' }, 'next'), 'Weiter');
  assert.equal(V.message('de', {}, 'back'), 'Back', 'unknown languages fall back to English');
  assert.equal(V.message('en', {}, 'rows', { n: 1 }), '1 row');
  assert.equal(V.message('bg', {}, 'rows', { n: 3 }), '3 реда');
  assert.equal(V.message('de', { rows: '{n} Zeilen' }, 'rows', { n: 1 }), '1 Zeilen', 'your own text wins over the built-in singular');
  assert.equal(V.message('de', { rows: '{n} Zeilen', rows_one: '1 Zeile' }, 'rows', { n: 1 }), '1 Zeile');
});

test('templateCsv: labels as headings, one example row that imports with 0 errors, for every field type', () => {
  const all = [
    ...FIELDS,
    { key: 'site', label: 'Website', type: 'url' },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'price', label: 'Price', type: 'number', min: 0, max: 5 },
    { key: 'code', label: 'Code', pattern: '^[A-Z]{3}$', example: 'ABC' },
    { key: 'note', label: 'Note, "quoted"', maxLength: 3 },
    { key: 'city', label: 'Град' },
  ];
  const csv = V.templateCsv(all);
  assert.ok(csv.startsWith('﻿'), 'BOM for Excel');
  assert.ok(csv.includes('"Note, ""quoted"""'), 'labels with commas and quotes are quoted');
  const rows = V.parseCSV(V.decode(new TextEncoder().encode(csv)).replace(/\r?\n$/, ''));
  assert.equal(rows.length, 2);
  const mapping = V.autoMap(rows[0], all);
  assert.equal(Object.keys(mapping).length, all.length, 'every column maps back to its field');
  const checked = V.checkRows(rows.slice(1), mapping, all);
  assert.deepEqual(checked[0].errors, {}, JSON.stringify(checked[0]));
  assert.equal(checked[0].values.email, 'name@example.com');
  assert.equal(checked[0].values.code, 'ABC');
  for (const order of ['dmy', 'mdy']) {
    const r = V.parseCSV(V.templateCsv([{ key: 'd', label: 'Date', type: 'date' }], { dateOrder: order }).slice(1).trim());
    assert.equal(V.convert(r[1][0], { type: 'date' }, { dateOrder: order }).value, '2026-12-31');
  }
  assert.equal(V.templateCsv([{ key: 'a' }], { example: false }), '﻿a\r\n');
  assert.equal(V.templateCsv([{ key: 'a' }, { key: 'b' }], { delimiter: ';' }).split('\r\n')[0], '﻿a;b');
});

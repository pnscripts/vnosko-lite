#!/usr/bin/env bash
# Buyer check: npm pack, a fresh project installs the tarball, then ESM and CommonJS read a real XLSX
# and a Windows-1252 CSV, match columns and check rows. Copyright (c) 2026 PN Scripts. MIT.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
B="$ROOT/build/buyer"; rm -rf "$B" && mkdir -p "$B/app"
(cd "$ROOT" && npm pack --silent --pack-destination "$B" >/dev/null)
TGZ=$(ls "$B"/*.tgz); echo "== packed $(basename "$TGZ"): $(tar -tzf "$TGZ" | tr '\n' ' ')"
cd "$B/app" && npm init -y >/dev/null && npm install --silent --no-audit --no-fund "$TGZ"
cp "$ROOT/tests/fixtures/orders.xlsx" "$ROOT/tests/fixtures/latin1.csv" .
cat > esm.mjs <<'JS'
import { readFileSync } from 'node:fs';
import { parseXLSX, autoMap, checkRows, decode, parseCSV, templateCsv } from '@pnscripts/vnosko-lite';
const fields = [{ key: 'order', label: 'Order no', type: 'integer', required: true }, { key: 'email', label: 'Email', type: 'email', aliases: ['customer email'] }, { key: 'total', type: 'number' }];
const sheets = await parseXLSX(readFileSync('orders.xlsx'));
const rows = checkRows(sheets[0].rows.slice(1), autoMap(sheets[0].rows[0], fields), fields);
const csv = parseCSV(decode(readFileSync('latin1.csv')));
const ok = rows.length === 2 && rows[0].values.total === 149.9 && csv.length > 1 && templateCsv(fields).includes('Order no');
console.log('ESM: XLSX ' + rows.length + ' rows, total ' + rows[0].values.total + ', Windows-1252 CSV ' + csv.length + ' rows, template ' + (ok ? 'OK' : 'FAILED'));
if (!ok) process.exit(1);
JS
cat > cjs.cjs <<'JS'
const V = require('@pnscripts/vnosko-lite');
const ok = typeof V.parseXLSX === 'function' && V.parseNumber('1 299,90') === 1299.9 && V.parseDate('31.12.2026') === '2026-12-31';
console.log('CommonJS: ' + (ok ? 'OK' : 'FAILED'));
if (!ok) process.exit(1);
JS
node esm.mjs && node cjs.cjs
echo "Node $(node --version)"

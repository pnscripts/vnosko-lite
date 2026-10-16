# Vnosko Lite by PN Scripts

Read **CSV, TSV and XLSX** files in the browser or in Node with **no dependencies**, find the header
row, match the columns to your fields by name and aliases, and get **typed, checked rows**: numbers
as numbers, dates as `YYYY-MM-DD`, booleans, choices, e-mails, URLs, phone numbers, required and
unique values. MIT.

```
npm install @pnscripts/vnosko-lite
```

```js
import { readFile, findHeaderRow, autoMap, checkRows } from '@pnscripts/vnosko-lite';

const fields = [
  { key: 'name', label: 'Name', required: true, aliases: ['full name', 'customer'] },
  { key: 'email', label: 'Email', type: 'email', required: true, unique: true },
  { key: 'plan', label: 'Plan', type: 'enum', options: ['free', { value: 'pro', label: 'Pro', aliases: ['premium'] }] },
  { key: 'seats', label: 'Seats', type: 'integer', min: 1, max: 500 },
  { key: 'signedUp', label: 'Signed up', type: 'date' },
];

const file = await readFile(input.files[0]);          // a File/Blob (browser) or { arrayBuffer } (Node)
const rows = file.sheets[0].rows;                     // string[][]
const header = findHeaderRow(rows, fields);           // skips title lines above the headings
const mapping = autoMap(rows[header], fields);        // { name: 0, email: 2, ... }
const checked = checkRows(rows.slice(header + 1), mapping, fields);
// [{ index, values: { name, email, plan, seats, signedUp }, raw, errors: { email: 'email' } }, ...]
```

## What it reads

- **CSV and TSV** in UTF-8 (with or without BOM), UTF-16 or Windows-1252; `,` `;` tab or `|` found
  automatically; quotes, doubled quotes and line breaks inside quotes.
- **XLSX** with several sheets, shared strings, dates (Excel serial numbers and date formats) and
  booleans, unzipped with the browser's own `DecompressionStream` (Node 18+ too). Old `.xls` files
  are refused with a clear error.
- **Numbers** written `1 299,90`, `1,299.90` or `1.299,90`; **dates** day-first (default) or
  month-first; **yes/no** in several languages.

## Also included

- `templateCsv(fields)`: a CSV your users can fill in, with your labels and one example row that
  imports without errors.
- `message()` / `errorText()`: error texts in English and Bulgarian, or your own.
- TypeScript types; ESM and CommonJS builds.

## Tested

- 8 tests with Node's runner (`npm test`), including real XLSX and Windows-1252 files.
- `tools/buyer_check.sh`: `npm pack`, a fresh project installs the tarball, ESM and CommonJS read
  the files. Node 22. Browsers: the same code runs in the full edition's Chrome demo check.

## Vnosko (full edition)

Vnosko adds the **React import wizard** on top of this engine: drag and drop or paste from a
spreadsheet, column matching your users can correct, **errors shown per cell and fixed by typing**,
remove or skip bad rows, a template download and English/Bulgarian texts:
https://pnscripts.com/marketplace/react-vnosko. Lite is complete for reading and checking and never
asks for payment.

## Licence

MIT, see LICENSE. Copyright (c) 2026 ПН СКРИПТС ЕООД (PN Scripts).

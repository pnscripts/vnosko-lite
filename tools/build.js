// Builds dist/: ESM and CommonJS bundles and the types. Copyright (c) 2026 PN Scripts. MIT.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
const common = { bundle: true, platform: 'neutral', target: 'es2020', legalComments: 'none',
  banner: { js: `/* Vnosko Lite by PN Scripts ${version}, https://pnscripts.com. MIT licence. */` }, entryPoints: ['src/index.js'] };
await build({ ...common, format: 'esm', outfile: 'dist/index.js' });
await build({ ...common, format: 'cjs', outfile: 'dist/index.cjs' });
copyFileSync('types/index.d.ts', 'dist/index.d.ts');
console.log('dist/ written');

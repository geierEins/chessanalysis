// Runs every tests/*.test.js under Node and exits non-zero if one fails - the
// same suite as tests/index.html, for CI (.github/workflows/tests.yml).
// The https-loader lets Node import chess.js from cdnjs, as the app does.
import { register } from 'node:module';
import { readdirSync } from 'node:fs';

register('../scripts/auto-analysis/https-loader.mjs', import.meta.url);

const { testResults } = await import('./test-runner.js');
const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.js')).sort();
for (const f of files) await import(`./${f}`);

const results = testResults();
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗'} [${r.suite}] ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} / ${results.length} Tests bestanden (${files.length} Dateien)`);
process.exit(failed || !results.length ? 1 : 0);

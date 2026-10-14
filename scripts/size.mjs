// Reports gzipped sizes of the built JavaScript and fails above the budget.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = 60 * 1024;
const dir = 'dist/assets';
let total = 0;
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith('.js') && !file.endsWith('.css')) continue;
  const raw = readFileSync(join(dir, file));
  const gz = gzipSync(raw, { level: 9 }).length;
  if (file.endsWith('.js')) total += gz;
  process.stdout.write(`${file.padEnd(36)} ${(raw.length / 1024).toFixed(1).padStart(6)} KB  ${(gz / 1024).toFixed(1).padStart(5)} KB gzip\n`);
}
process.stdout.write(`Total JS gzip: ${(total / 1024).toFixed(1)} KB (budget ${BUDGET / 1024} KB)\n`);
if (total > BUDGET) {
  process.stderr.write('JavaScript bundle is over budget.\n');
  process.exit(1);
}

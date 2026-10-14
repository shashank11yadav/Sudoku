// Regenerates docs/screenshot.png and docs/solver.gif from the production build.
// Needs ffmpeg on PATH. Usage: npm run build && npx vite preview --port 5401 & node scripts/capture-media.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';

const URL = process.env.CAPTURE_URL ?? 'http://localhost:5401/Sudoku/';
const TMP = '/tmp/sudoku-scratch/frames';
const EASY = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync('docs', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 850 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await page.goto(URL);
await page.waitForSelector('#board[aria-busy="false"]');
const clip = { x: 0, y: 0, width: 1000, height: 700 };

// Still: a game in progress with notes and a hint on screen.
await page.click('#open-io');
await page.fill('#io-input', EASY);
await page.click('#io-load');
await page.waitForSelector('#io-dialog', { state: 'hidden' });
for (const [cell, key] of [[0, '4'], [1, '8'], [9, '9']]) {
  await page.click(`#cell-${cell}`);
  await page.keyboard.press(key);
}
await page.click('#auto-notes');
await page.click('#cell-40');
await page.keyboard.press('h');
await page.waitForSelector('#hint-panel:not([hidden])');
await page.screenshot({ path: `${TMP}/still.png`, clip: { ...clip, height: 850 } });

// Animation: MRV backtracking on the Inkala puzzle, slow first, then fast.
await page.click('#tab-watch');
await page.selectOption('#viz-source', 'inkala');
await page.selectOption('#viz-algo', 'mrv');
await page.fill('#viz-speed', '40');
await page.click('#viz-play');
let n = 0;
const grab = async () => page.screenshot({ path: `${TMP}/f${String(n++).padStart(4, '0')}.png`, clip });
for (let i = 0; i < 24; i++) await grab();
await page.fill('#viz-speed', '86');
for (let i = 0; i < 400; i++) {
  await grab();
  if ((await page.textContent('#viz-status')) === 'Solved') break;
}
for (let i = 0; i < 8; i++) await grab();
await browser.close();

const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
ff(['-i', `${TMP}/still.png`, '-vf', 'scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none', 'docs/screenshot.png']);
ff([
  '-framerate', '8', '-i', `${TMP}/f%04d.png`,
  '-vf', 'scale=600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
  '-loop', '0', 'docs/solver.gif',
]);

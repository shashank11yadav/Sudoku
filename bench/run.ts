/**
 * Prints the benchmark tables used in the README.
 *
 *   npm run bench
 *
 * Solve times are the median of repeated runs; generation times are over a
 * fixed list of seeds so two runs on the same machine measure the same work.
 */
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { DIFFICULTIES, generatePuzzle, parseGrid, searchBacktracking, searchDlx, type Grid } from '../src/engine';
import { AI_ESCARGOT, EASTER_MONSTER, EASY, INKALA_2012, SEVENTEEN, type Fixture } from '../tests/fixtures';

const BUDGET_MS = 400;
const MAX_RUNS = 50;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid]) : ((s[mid - 1]) + (s[mid])) / 2;
}

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

/** Runs fn until the time budget or run cap is used up, returning the median time and last result. */
function measure<T>(fn: () => T): { ms: number; result: T } {
  const times: number[] = [];
  let result = fn(); // warm-up, also gives the result
  const start = performance.now();
  while (times.length < MAX_RUNS && (times.length < 3 || performance.now() - start < BUDGET_MS)) {
    const t = performance.now();
    result = fn();
    times.push(performance.now() - t);
  }
  return { ms: median(times), result };
}

function fmtMs(ms: number): string {
  if (ms < 0.1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  return `${ms.toFixed(0)} ms`;
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function solveRow(f: Fixture, label: string): string {
  const grid: Grid = parseGrid(f.puzzle);
  const naive = measure(() => searchBacktracking(grid, { heuristic: 'naive' }));
  const mrv = measure(() => searchBacktracking(grid, { heuristic: 'mrv' }));
  const dlx = measure(() => searchDlx(grid));
  const unique = measure(() => searchDlx(grid, 2));
  return `| ${f.name} | ${label} | ${fmtMs(naive.ms)} | ${fmtMs(mrv.ms)} | ${fmtMs(dlx.ms)} | ${fmtInt(naive.result.nodes)} | ${fmtInt(mrv.result.nodes)} | ${fmtInt(dlx.result.nodes)} | ${fmtMs(unique.ms)} |`;
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

const cpu = os.cpus()[0]?.model ?? 'unknown CPU';
print(`Machine: ${cpu}, ${os.platform()} ${os.arch()}, Node ${process.version}\n`);

print('### Solving (median time, nodes = digit placements tried)\n');
print('| Puzzle | Givens | Naive | MRV | DLX | Naive nodes | MRV nodes | DLX nodes | DLX uniqueness check |');
print('|---|---|---|---|---|---|---|---|---|');
for (const f of [EASY, SEVENTEEN, AI_ESCARGOT, INKALA_2012, EASTER_MONSTER]) {
  const givens = parseGrid(f.puzzle).filter((d) => d !== 0).length;
  print(solveRow(f, String(givens)));
}

const SEEDS = 20;
print(`\n### Generating (${SEEDS} seeds per level, rotational symmetry)\n`);
print('| Difficulty | Median | p95 | Max | Avg full grids tried | Avg givens | Grade matched |');
print('|---|---|---|---|---|---|---|');
for (const difficulty of DIFFICULTIES) {
  const times: number[] = [];
  let attempts = 0;
  let givens = 0;
  let matched = 0;
  for (let i = 0; i < SEEDS; i++) {
    const t = performance.now();
    const p = generatePuzzle({ difficulty, seed: `bench-${i}` });
    times.push(performance.now() - t);
    attempts += p.attempts;
    givens += p.givens;
    if (p.matched) matched++;
  }
  print(
    `| ${difficulty} | ${fmtMs(median(times))} | ${fmtMs(percentile(times, 95))} | ${fmtMs(Math.max(...times))} | ${(attempts / SEEDS).toFixed(1)} | ${(givens / SEEDS).toFixed(1)} | ${matched}/${SEEDS} |`,
  );
}

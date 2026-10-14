import { ALL_DIGITS, BOX, CELLS, COL, DIGITS, POPCOUNT, ROW, bit, firstDigit, type Grid } from './board';
import { findConflicts } from './parse';
import { shuffle, type Rng } from './random';

/**
 * "naive" fills the first empty cell in reading order, like the textbook
 * recursive solver. "mrv" (minimum remaining values) always branches on the
 * empty cell with the fewest candidates, which prunes far more of the tree.
 */
export type Heuristic = 'naive' | 'mrv';

export interface SearchOptions {
  heuristic?: Heuristic;
  /** Stop after this many solutions. 1 = solve, 2 = uniqueness check. */
  limit?: number;
  /** Randomizes digit order; used by the generator to build random full grids. */
  rng?: Rng;
}

export interface SearchResult {
  /** Solutions found, capped at the limit. */
  count: number;
  /** The first solution, or null when there is none. */
  solution: Grid | null;
  /** Digit placements tried. Comparable with the DLX row count. */
  nodes: number;
}

/**
 * Bitmask backtracking. Row, column and box usage live in three 9-entry
 * arrays, so a cell's candidates are one OR and one NOT away, and the search
 * stops as soon as `limit` solutions are found instead of walking the tree.
 */
export function searchBacktracking(givens: Grid, options: SearchOptions = {}): SearchResult {
  const heuristic = options.heuristic ?? 'mrv';
  const limit = options.limit ?? 1;
  const rng = options.rng;

  if (findConflicts(givens).length > 0) return { count: 0, solution: null, nodes: 0 };

  const grid = Uint8Array.from(givens);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  const empties: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    const d = grid[i];
    if (d) {
      const b = bit(d);
      rows[ROW[i]] |= b;
      cols[COL[i]] |= b;
      boxes[BOX[i]] |= b;
    } else {
      empties.push(i);
    }
  }

  const n = empties.length;
  let nodes = 0;
  let count = 0;
  let first: Grid | null = null;

  const candidatesOf = (cell: number): number => ALL_DIGITS & ~(rows[ROW[cell]] | cols[COL[cell]] | boxes[BOX[cell]]);

  // Returns true when the caller should stop searching.
  const recurse = (k: number): boolean => {
    if (k === n) {
      count++;
      first ??= grid.slice();
      return count >= limit;
    }

    let mask: number;
    if (heuristic === 'mrv') {
      let bestPos = k;
      let bestCount = 10;
      mask = 0;
      for (let j = k; j < n; j++) {
        const m = candidatesOf(empties[j]);
        const pc = POPCOUNT[m];
        if (pc < bestCount) {
          bestCount = pc;
          bestPos = j;
          mask = m;
          if (pc <= 1) break;
        }
      }
      // Moving the chosen cell to position k keeps empties[k..n) the set of open cells.
      const tmp = empties[k];
      empties[k] = empties[bestPos];
      empties[bestPos] = tmp;
    } else {
      mask = candidatesOf(empties[k]);
    }

    if (mask === 0) return false;
    const cell = empties[k];
    const r = ROW[cell];
    const c = COL[cell];
    const b = BOX[cell];
    const digits = rng ? shuffle([...DIGITS[mask]], rng) : DIGITS[mask];

    for (const d of digits) {
      const m = bit(d);
      nodes++;
      rows[r] |= m;
      cols[c] |= m;
      boxes[b] |= m;
      grid[cell] = d;
      if (recurse(k + 1)) return true;
      rows[r] &= ~m;
      cols[c] &= ~m;
      boxes[b] &= ~m;
    }
    grid[cell] = 0;
    return false;
  };

  recurse(0);
  return { count, solution: first, nodes };
}

export function solve(givens: Grid, heuristic: Heuristic = 'mrv'): Grid | null {
  return searchBacktracking(givens, { heuristic, limit: 1 }).solution;
}

/** Counts solutions up to `limit`. The default of 2 is all a uniqueness check needs. */
export function countSolutions(givens: Grid, limit = 2): number {
  return searchBacktracking(givens, { heuristic: 'mrv', limit }).count;
}

export function hasUniqueSolution(givens: Grid): boolean {
  return countSolutions(givens, 2) === 1;
}

export type TraceEvent =
  | { type: 'place'; cell: number; digit: number }
  | { type: 'remove'; cell: number; deadEnd: number | null }
  | { type: 'solved' }
  | { type: 'unsolvable' };

/**
 * The same search as searchBacktracking, written with an explicit stack so it
 * can be advanced one placement at a time. The visualizer calls step() a few
 * times per animation frame, which keeps the page responsive without needing
 * the trace to be precomputed.
 */
export class BacktrackStepper {
  readonly grid: Grid;
  nodes = 0;
  backtracks = 0;
  done = false;

  private readonly heuristic: Heuristic;
  private readonly rows = new Uint16Array(9);
  private readonly cols = new Uint16Array(9);
  private readonly boxes = new Uint16Array(9);
  private readonly empties: number[] = [];
  private readonly remaining: number[] = [];
  private depth = 0;
  private needsCell = true;
  private pendingDeadEnd: number | null = null;

  constructor(givens: Grid, heuristic: Heuristic) {
    this.heuristic = heuristic;
    this.grid = Uint8Array.from(givens);
    if (findConflicts(givens).length > 0) {
      this.done = true;
      return;
    }
    for (let i = 0; i < CELLS; i++) {
      const d = this.grid[i];
      if (d) this.mark(i, d);
      else this.empties.push(i);
    }
  }

  private candidatesOf(cell: number): number {
    return ALL_DIGITS & ~(this.rows[ROW[cell]] | this.cols[COL[cell]] | this.boxes[BOX[cell]]);
  }

  private mark(cell: number, d: number): void {
    const m = bit(d);
    this.rows[ROW[cell]] |= m;
    this.cols[COL[cell]] |= m;
    this.boxes[BOX[cell]] |= m;
  }

  private unmark(cell: number, d: number): void {
    const m = ~bit(d);
    this.rows[ROW[cell]] &= m;
    this.cols[COL[cell]] &= m;
    this.boxes[BOX[cell]] &= m;
  }

  step(): TraceEvent {
    if (this.done) return this.depth === this.empties.length ? { type: 'solved' } : { type: 'unsolvable' };

    if (this.needsCell) {
      if (this.depth === this.empties.length) {
        this.done = true;
        return { type: 'solved' };
      }
      const k = this.depth;
      let pos = k;
      let mask = this.candidatesOf(this.empties[k]);
      if (this.heuristic === 'mrv') {
        let best = POPCOUNT[mask];
        for (let j = k + 1; j < this.empties.length && best > 1; j++) {
          const m = this.candidatesOf(this.empties[j]);
          if (POPCOUNT[m] < best) {
            best = POPCOUNT[m];
            pos = j;
            mask = m;
          }
        }
        const tmp = this.empties[k];
        this.empties[k] = this.empties[pos];
        this.empties[pos] = tmp;
      }
      this.remaining[k] = mask;
      this.needsCell = false;
      if (mask === 0) this.pendingDeadEnd = this.empties[k];
    }

    const k = this.depth;
    const cell = this.empties[k];
    const mask = this.remaining[k];
    if (mask === 0) {
      // Every digit for this cell failed, so undo the previous placement.
      this.grid[cell] = 0;
      if (k === 0) {
        this.done = true;
        return { type: 'unsolvable' };
      }
      this.depth--;
      this.backtracks++;
      const prev = this.empties[this.depth];
      this.unmark(prev, this.grid[prev]);
      this.grid[prev] = 0;
      const deadEnd = this.pendingDeadEnd;
      this.pendingDeadEnd = null;
      return { type: 'remove', cell: prev, deadEnd };
    }

    const d = firstDigit(mask);
    this.remaining[k] = mask & ~bit(d);
    this.grid[cell] = d;
    this.mark(cell, d);
    this.nodes++;
    this.depth++;
    this.needsCell = true;
    return { type: 'place', cell, digit: d };
  }
}

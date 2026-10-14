import { describe, expect, it } from 'vitest';
import {
  BacktrackStepper,
  PEERS,
  countSolutions,
  formatGrid,
  hasUniqueSolution,
  parseGrid,
  searchBacktracking,
  searchDlx,
  solve,
  solveDlx,
  type Grid,
  type Heuristic,
} from '../../src/engine';
import { EASY, INKALA_2012, NORVIG_HARD1, SEVENTEEN, UNIQUE, UNSOLVABLE } from '../fixtures';

function isValidSolution(puzzle: Grid, solution: Grid): boolean {
  for (let i = 0; i < 81; i++) {
    const d = solution[i];
    if (d < 1 || d > 9) return false;
    if (puzzle[i] && puzzle[i] !== d) return false;
    if (PEERS[i].some((p) => solution[p] === d)) return false;
  }
  return true;
}

describe.each(UNIQUE)('$name', ({ puzzle, solution }) => {
  const grid = parseGrid(puzzle);

  it('MRV backtracking finds the known solution', () => {
    const result = solve(grid, 'mrv');
    expect(result).not.toBeNull();
    expect(formatGrid(result ?? new Uint8Array(81))).toBe(solution);
    expect(isValidSolution(grid, result ?? new Uint8Array(81))).toBe(true);
  });

  it('DLX finds the same solution', () => {
    expect(formatGrid(solveDlx(grid) ?? new Uint8Array(81))).toBe(solution);
  });

  it('has exactly one solution according to both solvers', () => {
    expect(countSolutions(grid)).toBe(1);
    expect(searchDlx(grid, 2).count).toBe(1);
  });

  it('does not modify its input', () => {
    const copy = grid.slice();
    solve(grid);
    solveDlx(grid);
    expect(grid).toEqual(copy);
  });
});

describe('naive backtracking', () => {
  it('agrees with MRV but visits more nodes', () => {
    for (const f of [EASY, INKALA_2012]) {
      const grid = parseGrid(f.puzzle);
      const naive = searchBacktracking(grid, { heuristic: 'naive' });
      const mrv = searchBacktracking(grid, { heuristic: 'mrv' });
      expect(formatGrid(naive.solution ?? new Uint8Array(81))).toBe(f.solution);
      expect(naive.nodes).toBeGreaterThan(mrv.nodes);
    }
  });
});

describe('uniqueness', () => {
  it('detects multiple solutions and stops at the limit', () => {
    const grid = parseGrid(NORVIG_HARD1);
    expect(countSolutions(grid, 2)).toBe(2);
    expect(searchDlx(grid, 2).count).toBe(2);
    expect(hasUniqueSolution(grid)).toBe(false);
  });

  it('an empty grid has many solutions, and the search still returns quickly', () => {
    const empty = new Uint8Array(81);
    expect(countSolutions(empty, 2)).toBe(2);
    expect(countSolutions(empty, 50)).toBe(50);
    expect(searchDlx(empty, 50).count).toBe(50);
  });

  it('reports zero solutions for consistent but unsolvable givens', () => {
    const grid = parseGrid(UNSOLVABLE);
    expect(countSolutions(grid)).toBe(0);
    expect(searchDlx(grid, 2).count).toBe(0);
    expect(solve(grid)).toBeNull();
    expect(solveDlx(grid)).toBeNull();
  });

  it('reports zero solutions for conflicting givens instead of searching', () => {
    const grid = parseGrid('55' + '.'.repeat(79));
    expect(searchBacktracking(grid)).toEqual({ count: 0, solution: null, nodes: 0 });
    expect(searchDlx(grid)).toEqual({ count: 0, solution: null, nodes: 0 });
  });

  it('a solved grid is its own unique solution', () => {
    const grid = parseGrid(EASY.solution);
    expect(countSolutions(grid)).toBe(1);
    expect(formatGrid(solveDlx(grid) ?? new Uint8Array(81))).toBe(EASY.solution);
  });
});

describe('BacktrackStepper', () => {
  function run(puzzle: string, heuristic: Heuristic): BacktrackStepper {
    const stepper = new BacktrackStepper(parseGrid(puzzle), heuristic);
    for (let i = 0; i < 1e6 && !stepper.done; i++) stepper.step();
    return stepper;
  }

  it.each<Heuristic>(['naive', 'mrv'])('replays the %s search placement for placement', (heuristic) => {
    for (const f of [EASY, SEVENTEEN]) {
      if (heuristic === 'naive' && f === SEVENTEEN) continue; // millions of nodes; covered by MRV
      const stepper = run(f.puzzle, heuristic);
      const reference = searchBacktracking(parseGrid(f.puzzle), { heuristic });
      expect(formatGrid(stepper.grid)).toBe(f.solution);
      expect(stepper.nodes).toBe(reference.nodes);
    }
  });

  it('emits place and remove events that keep the grid consistent', () => {
    const stepper = new BacktrackStepper(parseGrid(INKALA_2012.puzzle), 'mrv');
    const shadow = parseGrid(INKALA_2012.puzzle);
    let sawDeadEnd = false;
    while (!stepper.done) {
      const ev = stepper.step();
      if (ev.type === 'place') {
        expect(shadow[ev.cell]).toBe(0);
        shadow[ev.cell] = ev.digit;
      } else if (ev.type === 'remove') {
        expect(shadow[ev.cell]).not.toBe(0);
        shadow[ev.cell] = 0;
        if (ev.deadEnd !== null) sawDeadEnd = true;
      }
      expect(shadow).toEqual(stepper.grid);
    }
    expect(formatGrid(stepper.grid)).toBe(INKALA_2012.solution);
    expect(stepper.backtracks).toBeGreaterThan(0);
    expect(sawDeadEnd).toBe(true);
  });

  it('reports unsolvable puzzles', () => {
    const stepper = run(UNSOLVABLE, 'mrv');
    expect(stepper.done).toBe(true);
    expect(stepper.step()).toEqual({ type: 'unsolvable' });
  });
});

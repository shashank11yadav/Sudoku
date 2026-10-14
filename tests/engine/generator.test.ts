import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  PEERS,
  countSolutions,
  createRng,
  findConflicts,
  formatGrid,
  generatePuzzle,
  generateSolution,
  gradePuzzle,
  searchDlx,
} from '../../src/engine';

describe('generateSolution', () => {
  it('produces complete, valid and seed-dependent grids', () => {
    const a = generateSolution(createRng(1));
    const b = generateSolution(createRng(2));
    for (const g of [a, b]) {
      expect(g.includes(0)).toBe(false);
      expect(findConflicts(g)).toEqual([]);
    }
    expect(formatGrid(a)).not.toBe(formatGrid(b));
    expect(generateSolution(createRng(1))).toEqual(a);
  });
});

describe.each(DIFFICULTIES)('generatePuzzle(%s)', (difficulty) => {
  const puzzles = Array.from({ length: 5 }, (_, i) => generatePuzzle({ difficulty, seed: `test-${i}` }));

  it('always has exactly one solution, confirmed by both solvers', () => {
    for (const p of puzzles) {
      expect(countSolutions(p.puzzle)).toBe(1);
      expect(searchDlx(p.puzzle, 2).count).toBe(1);
    }
  });

  it('matches the requested grade', () => {
    for (const p of puzzles) {
      expect(p.matched).toBe(true);
      expect(p.grade.difficulty).toBe(difficulty);
      expect(gradePuzzle(p.puzzle).difficulty).toBe(difficulty);
    }
  });

  it('returns a solution consistent with the givens', () => {
    for (const p of puzzles) {
      for (let i = 0; i < 81; i++) {
        if (p.puzzle[i]) expect(p.puzzle[i]).toBe(p.solution[i]);
        expect(PEERS[i].some((j) => p.solution[j] === p.solution[i])).toBe(false);
      }
      expect(p.givens).toBe(p.puzzle.filter((d) => d !== 0).length);
    }
  });

  it('keeps 180-degree rotational symmetry by default', () => {
    for (const p of puzzles) {
      for (let i = 0; i < 81; i++) expect(p.puzzle[i] === 0).toBe(p.puzzle[80 - i] === 0);
    }
  });
});

describe('generator determinism and options', () => {
  it('returns the same puzzle for the same seed', () => {
    const a = generatePuzzle({ difficulty: 'medium', seed: 'daily:2026-10-14' });
    const b = generatePuzzle({ difficulty: 'medium', seed: 'daily:2026-10-14' });
    const c = generatePuzzle({ difficulty: 'medium', seed: 'daily:2026-10-15' });
    expect(formatGrid(a.puzzle)).toBe(formatGrid(b.puzzle));
    expect(formatGrid(a.puzzle)).not.toBe(formatGrid(c.puzzle));
  });

  it('can skip symmetry', () => {
    const p = generatePuzzle({ difficulty: 'easy', seed: 7, symmetry: 'none' });
    expect(countSolutions(p.puzzle)).toBe(1);
    expect(p.grade.difficulty).toBe('easy');
  });

  it('keeps easier puzzles roomier', () => {
    const easy = generatePuzzle({ difficulty: 'easy', seed: 3 });
    expect(easy.givens).toBeGreaterThanOrEqual(36);
  });

  it('falls back to the closest grade when attempts run out', () => {
    const p = generatePuzzle({ difficulty: 'expert', seed: 'fallback-0', maxAttempts: 1 });
    expect(p.attempts).toBe(1);
    expect(countSolutions(p.puzzle)).toBe(1);
    if (!p.matched) expect(p.grade.difficulty).not.toBe('expert');
  });
});

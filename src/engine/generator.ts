import { CELLS, emptyGrid, type Grid } from './board';
import { countSolutions, searchBacktracking } from './backtrack';
import { createRng, shuffle, type Rng } from './random';
import { DIFFICULTIES, TECHNIQUES, solveLogically, type Difficulty, type TechniqueId } from './techniques';

export interface Grade {
  /** null when the puzzle needs something beyond the techniques this solver knows. */
  difficulty: Difficulty | null;
  hardest: TechniqueId | null;
  steps: number;
  counts: Partial<Record<TechniqueId, number>>;
}

/** Rates a puzzle by the hardest technique the logical solver needed to finish it. */
export function gradePuzzle(givens: Grid): Grade {
  const { steps, solved } = solveLogically(givens);
  const counts: Partial<Record<TechniqueId, number>> = {};
  let hardest: TechniqueId | null = null;
  let level = -1;
  for (const step of steps) {
    counts[step.technique] = (counts[step.technique] ?? 0) + 1;
    const l = DIFFICULTIES.indexOf(TECHNIQUES[step.technique].difficulty);
    if (l > level) {
      level = l;
      hardest = step.technique;
    }
  }
  return {
    difficulty: solved ? (DIFFICULTIES[level] ?? 'easy') : null,
    hardest,
    steps: steps.length,
    counts,
  };
}

export type Symmetry = 'none' | 'rotational';

export interface GenerateOptions {
  difficulty: Difficulty;
  seed: string | number;
  symmetry?: Symmetry;
  /** Give up looking for an exact grade match after this many full grids. */
  maxAttempts?: number;
}

export interface GeneratedPuzzle {
  puzzle: Grid;
  solution: Grid;
  grade: Grade;
  difficulty: Difficulty;
  /** False only if maxAttempts ran out and the closest easier puzzle was returned. */
  matched: boolean;
  attempts: number;
  givens: number;
}

/**
 * Removal stops at this many givens. Grade alone does not make a puzzle feel
 * easy: a 24-clue singles-only puzzle is still a slog, so easier levels keep
 * more clues on the board.
 */
const MIN_GIVENS: Readonly<Record<Difficulty, number>> = {
  easy: 36,
  medium: 30,
  hard: 25,
  expert: 22,
};

/** A random complete grid: MRV backtracking on an empty board with shuffled digit order. */
export function generateSolution(rng: Rng): Grid {
  const result = searchBacktracking(emptyGrid(), { heuristic: 'mrv', limit: 1, rng });
  if (!result.solution) throw new Error('An empty grid always has a solution.');
  return result.solution;
}

function levelOf(grade: Grade): number {
  return grade.difficulty ? DIFFICULTIES.indexOf(grade.difficulty) : Infinity;
}

/**
 * Builds one candidate puzzle: start from a full grid and try to blank cells
 * (in symmetric pairs if asked) in random order. A removal is kept only if the
 * solution stays unique and the logical solver can still finish the puzzle
 * without going above the target level. That keeps the grade from
 * overshooting, so most attempts land on the target or just below it.
 */
function carve(solution: Grid, target: Difficulty, symmetry: Symmetry, rng: Rng): { puzzle: Grid; grade: Grade } {
  const puzzle = solution.slice();
  const targetLevel = DIFFICULTIES.indexOf(target);
  const order = shuffle(
    Array.from({ length: CELLS }, (_, i) => i),
    rng,
  );
  let givens = CELLS;
  let grade = gradePuzzle(puzzle);

  for (const cell of order) {
    if (!puzzle[cell]) continue;
    const mirror = CELLS - 1 - cell;
    const group = symmetry === 'rotational' && mirror !== cell && puzzle[mirror] ? [cell, mirror] : [cell];
    if (givens - group.length < MIN_GIVENS[target]) continue;

    for (const c of group) puzzle[c] = 0;
    let keep = countSolutions(puzzle, 2) === 1;
    let next = grade;
    if (keep) {
      next = gradePuzzle(puzzle);
      keep = levelOf(next) <= targetLevel;
    }
    if (keep) {
      givens -= group.length;
      grade = next;
    } else {
      for (const c of group) puzzle[c] = solution[c];
    }
  }
  return { puzzle, grade };
}

export function generatePuzzle(options: GenerateOptions): GeneratedPuzzle {
  const { difficulty, seed, symmetry = 'rotational', maxAttempts = 3000 } = options;
  const rng = createRng(`${String(seed)}:${difficulty}:${symmetry}`);
  const target = DIFFICULTIES.indexOf(difficulty);
  let best: { puzzle: Grid; solution: Grid; grade: Grade } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = generateSolution(rng);
    const { puzzle, grade } = carve(solution, difficulty, symmetry, rng);
    const level = levelOf(grade);
    if (level === target) {
      return { puzzle, solution, grade, difficulty, matched: true, attempts: attempt, givens: countGivens(puzzle) };
    }
    if (!best || level > levelOf(best.grade)) best = { puzzle, solution, grade };
  }

  if (!best) throw new Error('maxAttempts must be at least 1.');
  return { ...best, difficulty, matched: false, attempts: maxAttempts, givens: countGivens(best.puzzle) };
}

function countGivens(grid: Grid): number {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (grid[i]) n++;
  return n;
}

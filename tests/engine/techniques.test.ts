import { describe, expect, it } from 'vitest';
import {
  ALL_DIGITS,
  DIFFICULTIES,
  applyStep,
  bit,
  createLogicState,
  findNextStep,
  findStep,
  formatGrid,
  generatePuzzle,
  gradePuzzle,
  parseGrid,
  solve,
  solveLogically,
  TECHNIQUES,
  type Grid,
  type LogicState,
  type TechniqueId,
} from '../../src/engine';
import { AI_ESCARGOT, EASTER_MONSTER, EASY, INKALA_2012, SEVENTEEN } from '../fixtures';

/** An empty board with every candidate open, to build technique patterns by hand. */
function blankState(): LogicState {
  return { values: new Uint8Array(81), cands: new Uint16Array(81).fill(ALL_DIGITS) };
}

function remove(state: LogicState, digit: number, cells: Iterable<number>): void {
  for (const c of cells) state.cands[c] &= ~bit(digit);
}

const rowCells = (r: number): number[] => Array.from({ length: 9 }, (_, c) => r * 9 + c);
const colCells = (c: number): number[] => Array.from({ length: 9 }, (_, r) => r * 9 + c);

function elimsOf(state: LogicState, technique: TechniqueId): string[] {
  const step = findStep(state, technique);
  expect(step?.technique).toBe(technique);
  return (step?.eliminations ?? []).map((e) => `${e.cell}:${e.digit}`).sort();
}

describe('techniques on hand-built patterns', () => {
  it('pointing pair removes the digit from the rest of the row', () => {
    const s = blankState();
    remove(s, 5, [2, 9, 10, 11, 18, 19, 20]); // 5 left only in r1c1, r1c2 within box 1
    expect(elimsOf(s, 'pointing')).toEqual([3, 4, 5, 6, 7, 8].map((c) => `${c}:5`).sort());
  });

  it('claiming pair removes the digit from the rest of the box', () => {
    const s = blankState();
    remove(s, 4, [3, 4, 5, 6, 7, 8]); // in row 1, 4 is confined to box 1
    expect(elimsOf(s, 'claiming')).toEqual([9, 10, 11, 18, 19, 20].map((c) => `${c}:4`).sort());
  });

  it('naked pair clears both digits from the rest of the unit', () => {
    const s = blankState();
    s.cands[0] = bit(1) | bit(2);
    s.cands[1] = bit(1) | bit(2);
    const expected = rowCells(0)
      .slice(2)
      .flatMap((c) => [`${c}:1`, `${c}:2`])
      .sort();
    expect(elimsOf(s, 'naked-pair')).toEqual(expected);
  });

  it('hidden pair clears every other digit from the pair cells', () => {
    const s = blankState();
    remove(s, 1, rowCells(0).slice(2));
    remove(s, 2, rowCells(0).slice(2));
    const expected = [0, 1].flatMap((c) => [3, 4, 5, 6, 7, 8, 9].map((d) => `${c}:${d}`)).sort();
    expect(elimsOf(s, 'hidden-pair')).toEqual(expected);
  });

  it('naked triple clears its three digits from the unit', () => {
    const s = blankState();
    s.cands[0] = bit(1) | bit(2);
    s.cands[1] = bit(2) | bit(3);
    s.cands[2] = bit(1) | bit(3);
    const step = findStep(s, 'naked-triple');
    // Box 1 is checked after row 1 and holds the same three cells, so row 1 is reported.
    expect(step?.focus).toEqual([0, 1, 2]);
    expect(step?.eliminations).toHaveLength(6 * 3);
  });

  it('X-Wing removes the digit from both cover columns', () => {
    const s = blankState();
    remove(s, 1, rowCells(0).filter((c) => c !== 2 && c !== 6));
    remove(s, 1, rowCells(4).filter((c) => c !== 38 && c !== 42));
    const expected = [...colCells(2), ...colCells(6)]
      .filter((c) => ![2, 6, 38, 42].includes(c))
      .map((c) => `${c}:1`)
      .sort();
    expect(elimsOf(s, 'x-wing')).toEqual(expected);
  });

  it('Swordfish removes the digit from three cover columns', () => {
    const s = blankState();
    const keep: Record<number, number[]> = { 0: [0, 3], 3: [3, 6], 6: [0, 6] };
    for (const [r, cols] of Object.entries(keep)) {
      remove(s, 7, rowCells(Number(r)).filter((c) => !cols.includes(c % 9)));
    }
    const base = new Set([0, 3, 6].flatMap(rowCells));
    const expected = [...colCells(0), ...colCells(3), ...colCells(6)]
      .filter((c) => !base.has(c))
      .map((c) => `${c}:7`)
      .sort();
    expect(elimsOf(s, 'swordfish')).toEqual(expected);
  });

  it('XY-Wing removes the shared digit from cells that see both wings', () => {
    const s = blankState();
    s.cands[0] = bit(1) | bit(2); // pivot r1c1
    s.cands[4] = bit(1) | bit(3); // wing r1c5
    s.cands[36] = bit(2) | bit(3); // wing r5c1
    expect(elimsOf(s, 'xy-wing')).toEqual(['40:3']);
  });

  it('returns null when a pattern is absent', () => {
    const s = blankState();
    for (const id of Object.keys(TECHNIQUES) as TechniqueId[]) expect(findStep(s, id)).toBeNull();
  });
});

/**
 * Every step must agree with the unique solution: placed digits are correct
 * and no elimination removes the true digit. Run over fixtures and a batch of
 * generated puzzles so every technique gets exercised on real boards.
 */
describe('every logical step is sound', () => {
  const boards: { puzzle: Grid; solution: Grid }[] = [EASY, SEVENTEEN, INKALA_2012, AI_ESCARGOT, EASTER_MONSTER].map(
    (f) => ({ puzzle: parseGrid(f.puzzle), solution: parseGrid(f.solution) }),
  );
  for (const difficulty of DIFFICULTIES) {
    for (let seed = 0; seed < 6; seed++) {
      const g = generatePuzzle({ difficulty, seed: `sound-${seed}` });
      boards.push({ puzzle: g.puzzle, solution: g.solution });
    }
  }

  it('checks every step on every board', () => {
    const used = new Set<TechniqueId>();
    for (const { puzzle, solution } of boards) {
      const state = createLogicState(puzzle);
      for (let guard = 0; guard < 400; guard++) {
        const step = findNextStep(state);
        if (!step) break;
        used.add(step.technique);
        expect(step.placements.length + step.eliminations.length).toBeGreaterThan(0);
        expect(step.description.length).toBeGreaterThan(10);
        for (const p of step.placements) {
          expect(state.values[p.cell]).toBe(0);
          expect(p.digit).toBe(solution[p.cell]);
        }
        for (const e of step.eliminations) {
          expect(state.cands[e.cell] & bit(e.digit)).not.toBe(0);
          expect(e.digit).not.toBe(solution[e.cell]);
        }
        applyStep(state, step);
      }
    }
    for (const id of ['full-house', 'naked-single', 'hidden-single', 'pointing', 'naked-pair'] as const) {
      expect(used.has(id)).toBe(true);
    }
  });
});

describe('solveLogically and gradePuzzle', () => {
  it('solves an easy puzzle with singles only', () => {
    const result = solveLogically(parseGrid(EASY.puzzle));
    expect(result.solved).toBe(true);
    expect(formatGrid(result.values)).toBe(EASY.solution);
    expect(gradePuzzle(parseGrid(EASY.puzzle)).difficulty).toBe('easy');
  });

  it('leaves extreme puzzles ungraded instead of guessing', () => {
    for (const f of [INKALA_2012, EASTER_MONSTER]) {
      const grade = gradePuzzle(parseGrid(f.puzzle));
      expect(grade.difficulty).toBeNull();
    }
  });

  it('respects the level cap', () => {
    const g = generatePuzzle({ difficulty: 'medium', seed: 'cap' });
    expect(solveLogically(g.puzzle, 'easy').solved).toBe(false);
    expect(solveLogically(g.puzzle, 'medium').solved).toBe(true);
    expect(solve(g.puzzle)).toEqual(g.solution);
  });
});

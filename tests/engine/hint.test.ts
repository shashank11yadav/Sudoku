import { describe, expect, it } from 'vitest';
import { getHint, parseGrid } from '../../src/engine';
import { EASTER_MONSTER, EASY } from '../fixtures';

describe('getHint', () => {
  const puzzle = parseGrid(EASY.puzzle);
  const solution = parseGrid(EASY.solution);

  it('names the technique for the next step', () => {
    const hint = getHint(puzzle, solution);
    expect(hint.kind).toBe('step');
    if (hint.kind === 'step') {
      expect(hint.step.technique).toBe('naked-single');
      expect(hint.step.placements[0]?.digit).toBe(solution[hint.step.placements[0]?.cell ?? 0]);
    }
  });

  it('points at wrong digits before anything else', () => {
    const board = puzzle.slice();
    board[0] = solution[0] === 1 ? 2 : 1;
    const hint = getHint(board, solution);
    expect(hint).toMatchObject({ kind: 'mistake', cells: [0] });
    if (hint.kind === 'mistake') expect(hint.description).toContain('r1c1 does not match');
  });

  it('reveals a cell when no known technique applies', () => {
    const hard = parseGrid(EASTER_MONSTER.puzzle);
    const hint = getHint(hard, parseGrid(EASTER_MONSTER.solution));
    expect(hint.kind).toBe('reveal');
    if (hint.kind === 'reveal') expect(hint.digit).toBe(parseGrid(EASTER_MONSTER.solution)[hint.cell]);
  });

  it('says so when the board is already solved', () => {
    expect(getHint(solution, solution).kind).toBe('solved');
  });
});

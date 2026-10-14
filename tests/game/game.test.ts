import { describe, expect, it } from 'vitest';
import { bit, formatGrid, parseGrid } from '../../src/engine';
import { Game, restoreGame } from '../../src/game/game';
import { dailyPuzzle, localDateKey } from '../../src/game/daily';
import { EASY } from '../fixtures';

function newGame(): Game {
  return new Game({ puzzle: parseGrid(EASY.puzzle), solution: parseGrid(EASY.solution), kind: 'easy', label: 'Test' });
}

describe('Game', () => {
  it('places, replaces and clears digits in empty cells only', () => {
    const g = newGame();
    expect(g.setDigit(2, 9)).toBe(false); // r1c3 is a given
    expect(g.setDigit(0, 4)).toBe(true);
    expect(g.values[0]).toBe(4);
    expect(g.setDigit(0, 4)).toBe(true); // same digit again clears it
    expect(g.values[0]).toBe(0);
  });

  it('removes a placed digit from peer notes and undoes both together', () => {
    const g = newGame();
    g.toggleNote(1, 4);
    g.toggleNote(1, 8);
    g.toggleNote(80, 4); // not a peer of r1c1
    g.setDigit(0, 4);
    expect(g.notes[1]).toBe(bit(8));
    expect(g.notes[80]).toBe(bit(4));
    g.undo();
    expect(g.values[0]).toBe(0);
    expect(g.notes[1]).toBe(bit(4) | bit(8));
    g.redo();
    expect(g.values[0]).toBe(4);
    expect(g.notes[1]).toBe(bit(8));
  });

  it('undo and redo walk the history and a new move clears redo', () => {
    const g = newGame();
    g.setDigit(0, 4);
    g.setDigit(1, 8);
    expect(g.undo()).toEqual([1]);
    expect(g.canRedo).toBe(true);
    g.setDigit(3, 9);
    expect(g.canRedo).toBe(false);
    g.undo();
    g.undo();
    expect(g.canUndo).toBe(false);
    expect(formatGrid(g.values, '0')).toBe(EASY.puzzle);
  });

  it('ignores notes on filled cells and no-op moves', () => {
    const g = newGame();
    expect(g.toggleNote(2, 1)).toBe(false);
    expect(g.erase(0)).toBe(false);
    expect(g.canUndo).toBe(false);
  });

  it('reports conflicts and wrong cells separately', () => {
    const g = newGame();
    g.setDigit(0, 3); // 3 is already in row 1
    expect(g.conflicts().has(0)).toBe(true);
    g.setDigit(0, 5); // no conflict, but the solution has 4 here
    expect(g.conflicts().size).toBe(0);
    expect(g.wrongCells()).toEqual([0]);
  });

  it('detects a solved board', () => {
    const g = newGame();
    const solution = parseGrid(EASY.solution);
    for (let i = 0; i < 81; i++) if (!g.isGiven(i)) g.setDigit(i, solution[i]);
    expect(g.solved).toBe(true);
    expect(g.digitCounts().slice(1)).toEqual(new Array(9).fill(9));
  });

  it('fills notes from candidates and applies eliminations as one move', () => {
    const g = newGame();
    g.fillNotes();
    expect(g.notes[0] & bit(4)).not.toBe(0);
    expect(g.notes[2]).toBe(0);
    g.eliminate([{ cell: 0, digit: 4 }]);
    expect(g.notes[0] & bit(4)).toBe(0);
    g.undo();
    expect(g.notes[0] & bit(4)).not.toBe(0);
  });

  it('clears several cells as one move', () => {
    const g = newGame();
    g.setDigit(0, 4);
    g.setDigit(1, 8);
    g.clearCells([0, 1, 2]);
    expect(g.values[0]).toBe(0);
    expect(g.values[2]).toBe(3); // givens survive
    g.undo();
    expect([g.values[0], g.values[1]]).toEqual([4, 8]);
  });

  it('reset clears every player entry', () => {
    const g = newGame();
    g.setDigit(0, 4);
    g.toggleNote(1, 2);
    g.reset();
    expect(formatGrid(g.values, '0')).toBe(EASY.puzzle);
    expect(g.notes.every((n) => n === 0)).toBe(true);
  });
});

describe('restoreGame', () => {
  it('round-trips a saved game', () => {
    const g = newGame();
    g.setDigit(0, 4);
    g.toggleNote(1, 7);
    g.elapsedMs = 12345;
    const restored = restoreGame(JSON.parse(JSON.stringify(g.toJSON())));
    expect(restored).not.toBeNull();
    expect(restored?.values[0]).toBe(4);
    expect(restored?.notes[1]).toBe(bit(7));
    expect(restored?.elapsedMs).toBe(12345);
  });

  it.each([
    ['null', null],
    ['a string', 'hello'],
    ['the wrong version', { ...newGame().toJSON(), version: 1 }],
    ['a short puzzle', { ...newGame().toJSON(), puzzle: '123' }],
    ['markup in the label', { ...newGame().toJSON(), label: 'x'.repeat(200) }],
    ['an unknown kind', { ...newGame().toJSON(), kind: 'impossible' }],
    ['bad notes', { ...newGame().toJSON(), notes: [1, 2, 3] }],
    ['out of range notes', { ...newGame().toJSON(), notes: new Array(81).fill(1024) }],
    ['negative time', { ...newGame().toJSON(), elapsedMs: -1 }],
    ['a solution that contradicts the givens', { ...newGame().toJSON(), solution: EASY.solution.replace(/^4/, '5') }],
    ['an overwritten given', { ...newGame().toJSON(), values: EASY.puzzle.slice(0, 2) + '9' + EASY.puzzle.slice(3) }],
  ])('rejects %s', (_label, data) => {
    expect(restoreGame(data)).toBeNull();
  });
});

describe('daily puzzle', () => {
  it('derives a stable seed from the local date', () => {
    const date = new Date(2026, 9, 14, 23, 59);
    expect(localDateKey(date)).toBe('2026-10-14');
    expect(dailyPuzzle(date)).toEqual({ seed: 'daily:2026-10-14', difficulty: 'medium', label: 'Daily 2026-10-14' });
    expect(dailyPuzzle(new Date(2026, 9, 18)).difficulty).toBe('expert');
  });
});

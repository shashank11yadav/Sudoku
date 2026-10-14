import { describe, expect, it } from 'vitest';
import { PuzzleError, findConflicts, formatGrid, parseGrid, validateGivens } from '../../src/engine';
import { EASY } from '../fixtures';

function errorOf(fn: () => unknown): PuzzleError {
  try {
    fn();
  } catch (e) {
    if (e instanceof PuzzleError) return e;
    throw e;
  }
  throw new Error('expected a PuzzleError');
}

describe('parseGrid', () => {
  it('reads digits, zeros and dots', () => {
    const grid = parseGrid(EASY.puzzle);
    expect(grid).toHaveLength(81);
    expect(grid[2]).toBe(3);
    expect(grid[0]).toBe(0);
    expect(formatGrid(parseGrid(EASY.puzzle.replace(/0/g, '.')), '0')).toBe(EASY.puzzle);
  });

  it('ignores whitespace so multi-line grids paste cleanly', () => {
    const lines = EASY.puzzle.match(/.{9}/g)?.join('\n  ') ?? '';
    expect(formatGrid(parseGrid(`  ${lines}\n`), '0')).toBe(EASY.puzzle);
  });

  it('rejects the wrong number of cells', () => {
    expect(errorOf(() => parseGrid(EASY.puzzle.slice(1))).message).toBe('Expected 81 cells but found 80.');
    expect(errorOf(() => parseGrid(`${EASY.puzzle}1`)).code).toBe('length');
    expect(errorOf(() => parseGrid('   ')).code).toBe('empty');
  });

  it('rejects unknown characters and names their position', () => {
    const err = errorOf(() => parseGrid(`x${EASY.puzzle.slice(1)}`));
    expect(err.code).toBe('character');
    expect(err.message).toContain('"x" at position 1');
  });

  it('describes control and markup characters by code point instead of echoing them', () => {
    expect(errorOf(() => parseGrid(`\u0000${EASY.puzzle.slice(1)}`)).message).toContain('U+0000');
    expect(errorOf(() => parseGrid(`<${EASY.puzzle.slice(1)}`)).message).toContain('"<"');
  });

  it('refuses very long input before scanning it', () => {
    expect(errorOf(() => parseGrid('1'.repeat(5000))).code).toBe('too-long');
  });
});

describe('validateGivens', () => {
  it('accepts a consistent puzzle', () => {
    expect(() => {
      validateGivens(parseGrid(EASY.puzzle));
    }).not.toThrow();
  });

  it.each([
    ['row', '11' + '.'.repeat(79), 'Row 1 has two 1s (r1c1 and r1c2).'],
    ['column', '1' + '.'.repeat(8) + '1' + '.'.repeat(71), 'Column 1 has two 1s (r1c1 and r2c1).'],
    ['box', '1' + '.'.repeat(9) + '1' + '.'.repeat(70), 'Box 1 has two 1s (r1c1 and r2c2).'],
  ])('reports duplicate digits in a %s', (_kind, puzzle, message) => {
    const err = errorOf(() => {
      validateGivens(parseGrid(puzzle));
    });
    expect(err.code).toBe('conflict');
    expect(err.message).toBe(message);
    expect(err.cells).toHaveLength(2);
  });

  it('findConflicts lists every clashing cell', () => {
    expect(findConflicts(parseGrid('11' + '.'.repeat(79)))).toEqual([0, 1]);
    expect(findConflicts(parseGrid(EASY.puzzle))).toEqual([]);
  });
});

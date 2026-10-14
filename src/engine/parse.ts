import { CELLS, PEERS, BOX, COL, ROW, cellName, type Grid } from './board';

export type PuzzleErrorCode = 'empty' | 'too-long' | 'length' | 'character' | 'conflict' | 'unsolvable' | 'multiple';

/** Raised for any puzzle input the app refuses to load. The message is shown to the user as is. */
export class PuzzleError extends Error {
  readonly code: PuzzleErrorCode;
  readonly cells: readonly number[];

  constructor(code: PuzzleErrorCode, message: string, cells: readonly number[] = []) {
    super(message);
    this.name = 'PuzzleError';
    this.code = code;
    this.cells = cells;
  }
}

/** Pasted text longer than this is rejected before any per-character work. */
const MAX_INPUT_LENGTH = 1000;

function describeChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x21 && code <= 0x7e ? `"${ch}"` : `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Parses an 81-character puzzle string. Digits 1-9 are givens, "0" or "." are
 * empty cells, and whitespace is ignored so grids pasted over several lines
 * still load. Anything else is an error, which keeps the format unambiguous.
 */
export function parseGrid(input: string): Grid {
  if (input.length > MAX_INPUT_LENGTH) {
    throw new PuzzleError('too-long', `Input is ${input.length} characters; a puzzle needs 81.`);
  }
  const compact = input.replace(/\s+/g, '');
  if (compact.length === 0) throw new PuzzleError('empty', 'Paste an 81-character puzzle string.');

  const grid = new Uint8Array(CELLS);
  let count = 0;
  for (const ch of compact) {
    if (count >= CELLS) {
      count++;
      continue;
    }
    if (ch >= '1' && ch <= '9') grid[count] = ch.charCodeAt(0) - 48;
    else if (ch !== '0' && ch !== '.') {
      throw new PuzzleError(
        'character',
        `Unexpected character ${describeChar(ch)} at position ${count + 1}. Use 1-9 for givens and 0 or . for blanks.`,
      );
    }
    count++;
  }
  if (count !== CELLS) {
    throw new PuzzleError('length', `Expected 81 cells but found ${count}.`);
  }
  return grid;
}

export function formatGrid(grid: Grid, blank = '.'): string {
  let out = '';
  for (let i = 0; i < CELLS; i++) out += grid[i] ? String(grid[i]) : blank;
  return out;
}

/** Every filled cell that shares its digit with a peer. */
export function findConflicts(grid: Grid): number[] {
  const conflicts: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    const d = grid[i];
    if (d && PEERS[i].some((p) => grid[p] === d)) conflicts.push(i);
  }
  return conflicts;
}

/** Throws a PuzzleError naming the first duplicated digit, if any. */
export function validateGivens(grid: Grid): void {
  if (grid.length !== CELLS) throw new PuzzleError('length', `Expected 81 cells but found ${grid.length}.`);
  for (let i = 0; i < CELLS; i++) {
    const d = grid[i];
    if (d > 9) throw new PuzzleError('character', `Cell ${cellName(i)} holds ${d}, which is not a digit 1-9.`);
    if (!d) continue;
    for (const p of PEERS[i]) {
      if (p > i && grid[p] === d) {
        const where =
          ROW[p] === ROW[i] ? `Row ${ROW[i] + 1}` : COL[p] === COL[i] ? `Column ${COL[i] + 1}` : `Box ${BOX[i] + 1}`;
        throw new PuzzleError('conflict', `${where} has two ${d}s (${cellName(i)} and ${cellName(p)}).`, [i, p]);
      }
    }
  }
}

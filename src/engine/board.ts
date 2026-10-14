/**
 * Board geometry and bitmask helpers shared by every solver.
 *
 * A grid is a flat Uint8Array of 81 cells in row-major order, 0 meaning empty.
 * Candidate sets are 9-bit masks where bit (d - 1) stands for digit d, so set
 * operations on candidates are single integer operations.
 */

export type Grid = Uint8Array;

export const CELLS = 81;
export const ALL_DIGITS = 0x1ff;

export const ROW = new Uint8Array(CELLS);
export const COL = new Uint8Array(CELLS);
export const BOX = new Uint8Array(CELLS);

for (let i = 0; i < CELLS; i++) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  ROW[i] = r;
  COL[i] = c;
  BOX[i] = Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

export type UnitKind = 'row' | 'column' | 'box';

export interface Unit {
  readonly kind: UnitKind;
  /** 0-based index within its kind. */
  readonly index: number;
  readonly cells: readonly number[];
}

function buildUnits(): Unit[] {
  const units: Unit[] = [];
  for (let r = 0; r < 9; r++) {
    units.push({ kind: 'row', index: r, cells: Array.from({ length: 9 }, (_, c) => r * 9 + c) });
  }
  for (let c = 0; c < 9; c++) {
    units.push({ kind: 'column', index: c, cells: Array.from({ length: 9 }, (_, r) => r * 9 + c) });
  }
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3;
    const c0 = (b % 3) * 3;
    const cells: number[] = [];
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) cells.push((r0 + dr) * 9 + c0 + dc);
    units.push({ kind: 'box', index: b, cells });
  }
  return units;
}

/** 27 units: rows 0-8, columns 9-17, boxes 18-26. */
export const UNITS: readonly Unit[] = buildUnits();
export const ROWS = UNITS.slice(0, 9);
export const COLS = UNITS.slice(9, 18);
export const BOXES = UNITS.slice(18, 27);

function buildPeers(): number[][] {
  const peers: number[][] = [];
  for (let i = 0; i < CELLS; i++) {
    const list: number[] = [];
    for (let j = 0; j < CELLS; j++) {
      if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) list.push(j);
    }
    peers.push(list);
  }
  return peers;
}

/** The 20 cells that share a row, column or box with each cell. */
export const PEERS: readonly (readonly number[])[] = buildPeers();

export function sees(a: number, b: number): boolean {
  return a !== b && (ROW[a] === ROW[b] || COL[a] === COL[b] || BOX[a] === BOX[b]);
}

/** Popcount for every 9-bit mask, precomputed because it sits in every inner loop. */
export const POPCOUNT = new Uint8Array(512);
/** Digits contained in every 9-bit mask, ascending. */
export const DIGITS: readonly (readonly number[])[] = Array.from({ length: 512 }, (_, m) => {
  const ds: number[] = [];
  for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) ds.push(d);
  POPCOUNT[m] = ds.length;
  return ds;
});

export function bit(digit: number): number {
  return 1 << (digit - 1);
}

/** Lowest digit in a non-empty mask. */
export function firstDigit(mask: number): number {
  return 32 - Math.clz32(mask & -mask);
}

export function emptyGrid(): Grid {
  return new Uint8Array(CELLS);
}

export function cellName(i: number): string {
  return `r${ROW[i] + 1}c${COL[i] + 1}`;
}

export function unitName(unit: Unit): string {
  return `${unit.kind} ${unit.index + 1}`;
}

/** Candidates of every empty cell given the digits already placed (0 for filled cells). */
export function computeCandidates(grid: Grid): Uint16Array {
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  for (let i = 0; i < CELLS; i++) {
    const d = grid[i];
    if (d) {
      const b = bit(d);
      rows[ROW[i]] |= b;
      cols[COL[i]] |= b;
      boxes[BOX[i]] |= b;
    }
  }
  const cands = new Uint16Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    if (!grid[i]) {
      cands[i] = ALL_DIGITS & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
    }
  }
  return cands;
}

import { BOX, CELLS, COL, ROW, type Grid } from './board';
import { findConflicts } from './parse';

/**
 * Knuth's Algorithm X with Dancing Links.
 *
 * Sudoku becomes an exact cover problem with 324 constraint columns
 * (each cell filled, each digit once per row, column and box) and 729
 * candidate rows (one per cell and digit). Every row covers exactly four
 * columns. Links live in flat Int32Arrays instead of objects so covering and
 * uncovering are plain index writes.
 */

const COLUMNS = 324;
const ROWS = 729;
const NODES = 1 + COLUMNS + ROWS * 4;

export interface DlxResult {
  count: number;
  solution: Grid | null;
  /** Candidate rows selected during the search. */
  nodes: number;
}

export function searchDlx(givens: Grid, limit = 1): DlxResult {
  if (findConflicts(givens).length > 0) return { count: 0, solution: null, nodes: 0 };

  const L = new Int32Array(NODES);
  const R = new Int32Array(NODES);
  const U = new Int32Array(NODES);
  const D = new Int32Array(NODES);
  const C = new Int32Array(NODES);
  const size = new Int32Array(COLUMNS + 1);
  const rowOf = new Int32Array(NODES);
  const firstNodeOfRow = new Int32Array(ROWS);

  // Node 0 is the root; nodes 1..324 are column headers.
  for (let i = 0; i <= COLUMNS; i++) {
    L[i] = i === 0 ? COLUMNS : i - 1;
    R[i] = i === COLUMNS ? 0 : i + 1;
    U[i] = i;
    D[i] = i;
    C[i] = i;
  }

  let next = COLUMNS + 1;
  for (let cell = 0; cell < CELLS; cell++) {
    for (let d = 0; d < 9; d++) {
      const row = cell * 9 + d;
      const cols = [
        1 + cell,
        1 + 81 + ROW[cell] * 9 + d,
        1 + 162 + COL[cell] * 9 + d,
        1 + 243 + BOX[cell] * 9 + d,
      ];
      firstNodeOfRow[row] = next;
      for (let k = 0; k < 4; k++) {
        const node = next + k;
        const col = cols[k];
        C[node] = col;
        rowOf[node] = row;
        // Append to the bottom of the column.
        U[node] = U[col];
        D[node] = col;
        D[U[col]] = node;
        U[col] = node;
        size[col]++;
        L[node] = k === 0 ? next + 3 : node - 1;
        R[node] = k === 3 ? next : node + 1;
      }
      next += 4;
    }
  }

  const cover = (c: number): void => {
    R[L[c]] = R[c];
    L[R[c]] = L[c];
    for (let i = D[c]; i !== c; i = D[i]) {
      for (let j = R[i]; j !== i; j = R[j]) {
        D[U[j]] = D[j];
        U[D[j]] = U[j];
        size[C[j]]--;
      }
    }
  };

  const uncover = (c: number): void => {
    for (let i = U[c]; i !== c; i = U[i]) {
      for (let j = L[i]; j !== i; j = L[j]) {
        size[C[j]]++;
        D[U[j]] = j;
        U[D[j]] = j;
      }
    }
    R[L[c]] = c;
    L[R[c]] = c;
  };

  // Givens are selected up front by covering every column their row touches.
  for (let cell = 0; cell < CELLS; cell++) {
    const d = givens[cell];
    if (!d) continue;
    const start = firstNodeOfRow[cell * 9 + d - 1];
    cover(C[start]);
    for (let j = R[start]; j !== start; j = R[j]) cover(C[j]);
  }

  const chosen: number[] = [];
  let nodes = 0;
  let count = 0;
  let solution: Grid | null = null;

  const search = (): boolean => {
    if (R[0] === 0) {
      count++;
      if (!solution) {
        solution = Uint8Array.from(givens);
        for (const row of chosen) solution[Math.floor(row / 9)] = (row % 9) + 1;
      }
      return count >= limit;
    }

    // Knuth's S heuristic: branch on the column with the fewest rows left.
    let col = R[0];
    let best = size[col];
    for (let j = R[col]; j !== 0 && best > 1; j = R[j]) {
      if (size[j] < best) {
        best = size[j];
        col = j;
      }
    }
    if (best === 0) return false;

    cover(col);
    for (let r = D[col]; r !== col; r = D[r]) {
      nodes++;
      chosen.push(rowOf[r]);
      for (let j = R[r]; j !== r; j = R[j]) cover(C[j]);
      const stop = search();
      for (let j = L[r]; j !== r; j = L[j]) uncover(C[j]);
      chosen.pop();
      if (stop) {
        uncover(col);
        return true;
      }
    }
    uncover(col);
    return false;
  };

  search();
  return { count, solution, nodes };
}

export function solveDlx(givens: Grid): Grid | null {
  return searchDlx(givens, 1).solution;
}

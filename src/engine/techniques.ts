import {
  BOXES,
  BOX,
  CELLS,
  COL,
  COLS,
  DIGITS,
  PEERS,
  POPCOUNT,
  ROW,
  ROWS,
  UNITS,
  bit,
  cellName,
  computeCandidates,
  firstDigit,
  sees,
  unitName,
  type Grid,
  type Unit,
} from './board';

/**
 * A human-style solver. Each technique looks for one pattern on the current
 * pencil marks and returns a Step describing what it found, or null. Steps
 * are what the hint button shows and what the grader counts.
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export type TechniqueId =
  | 'full-house'
  | 'naked-single'
  | 'hidden-single'
  | 'pointing'
  | 'claiming'
  | 'naked-pair'
  | 'hidden-pair'
  | 'naked-triple'
  | 'hidden-triple'
  | 'x-wing'
  | 'swordfish'
  | 'xy-wing';

export interface TechniqueInfo {
  readonly name: string;
  readonly difficulty: Difficulty;
}

export const TECHNIQUES: Readonly<Record<TechniqueId, TechniqueInfo>> = {
  'full-house': { name: 'Full house', difficulty: 'easy' },
  'naked-single': { name: 'Naked single', difficulty: 'easy' },
  'hidden-single': { name: 'Hidden single', difficulty: 'easy' },
  pointing: { name: 'Pointing pair', difficulty: 'medium' },
  claiming: { name: 'Claiming pair', difficulty: 'medium' },
  'naked-pair': { name: 'Naked pair', difficulty: 'medium' },
  'hidden-pair': { name: 'Hidden pair', difficulty: 'medium' },
  'naked-triple': { name: 'Naked triple', difficulty: 'hard' },
  'hidden-triple': { name: 'Hidden triple', difficulty: 'hard' },
  'x-wing': { name: 'X-Wing', difficulty: 'hard' },
  swordfish: { name: 'Swordfish', difficulty: 'expert' },
  'xy-wing': { name: 'XY-Wing', difficulty: 'expert' },
};

export interface Placement {
  cell: number;
  digit: number;
}

export interface Elimination {
  cell: number;
  digit: number;
}

export interface Step {
  technique: TechniqueId;
  placements: Placement[];
  eliminations: Elimination[];
  /** Cells that form the pattern, for highlighting. */
  focus: number[];
  description: string;
}

export interface LogicState {
  values: Grid;
  /** Candidate mask per empty cell; 0 for filled cells. */
  cands: Uint16Array;
}

export function createLogicState(grid: Grid): LogicState {
  return { values: Uint8Array.from(grid), cands: computeCandidates(grid) };
}

export function applyStep(state: LogicState, step: Step): void {
  for (const { cell, digit } of step.placements) {
    state.values[cell] = digit;
    state.cands[cell] = 0;
    const m = ~bit(digit);
    for (const p of PEERS[cell]) state.cands[p] &= m;
  }
  for (const { cell, digit } of step.eliminations) state.cands[cell] &= ~bit(digit);
}

function listCells(cells: readonly number[]): string {
  const names = cells.map(cellName);
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function listDigits(digits: readonly number[]): string {
  return digits.join('/');
}

function eliminationText(elims: readonly Elimination[]): string {
  const byDigit = new Map<number, number[]>();
  for (const e of elims) {
    const list = byDigit.get(e.digit) ?? [];
    list.push(e.cell);
    byDigit.set(e.digit, list);
  }
  return [...byDigit].map(([d, cells]) => `${d} from ${listCells(cells)}`).join('; ');
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const go = (start: number): void => {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i]);
      go(i + 1);
      pick.pop();
    }
  };
  go(0);
  return out;
}

function placedInUnit(state: LogicState, unit: Unit): number {
  let m = 0;
  for (const c of unit.cells) if (state.values[c]) m |= bit(state.values[c]);
  return m;
}

function cellsWithDigit(state: LogicState, unit: Unit, digit: number): number[] {
  const b = bit(digit);
  return unit.cells.filter((c) => (state.cands[c] & b) !== 0);
}

function fullHouse(state: LogicState): Step | null {
  for (const unit of UNITS) {
    const empty = unit.cells.filter((c) => !state.values[c]);
    if (empty.length !== 1) continue;
    const cell = empty[0];
    const missing = 0x1ff & ~placedInUnit(state, unit);
    if (POPCOUNT[missing] !== 1 || (state.cands[cell] & missing) === 0) continue;
    const digit = firstDigit(missing);
    return {
      technique: 'full-house',
      placements: [{ cell, digit }],
      eliminations: [],
      focus: [...unit.cells],
      description: `${cellName(cell)} is the last empty cell in ${unitName(unit)}, so it must be ${digit}.`,
    };
  }
  return null;
}

function nakedSingle(state: LogicState): Step | null {
  for (let cell = 0; cell < CELLS; cell++) {
    if (state.values[cell] || POPCOUNT[state.cands[cell]] !== 1) continue;
    const digit = firstDigit(state.cands[cell]);
    return {
      technique: 'naked-single',
      placements: [{ cell, digit }],
      eliminations: [],
      focus: PEERS[cell].filter((p) => state.values[p] !== 0),
      description: `${cellName(cell)} can only be ${digit}: every other digit already appears in its row, column or box.`,
    };
  }
  return null;
}

function hiddenSingle(state: LogicState): Step | null {
  // Boxes first, because that is where people tend to spot these.
  for (const unit of [...BOXES, ...ROWS, ...COLS]) {
    const placed = placedInUnit(state, unit);
    for (let d = 1; d <= 9; d++) {
      if (placed & bit(d)) continue;
      const spots = cellsWithDigit(state, unit, d);
      if (spots.length !== 1) continue;
      const cell = spots[0];
      return {
        technique: 'hidden-single',
        placements: [{ cell, digit: d }],
        eliminations: [],
        focus: [...unit.cells],
        description: `In ${unitName(unit)}, ${d} fits only in ${cellName(cell)}.`,
      };
    }
  }
  return null;
}

function pointing(state: LogicState): Step | null {
  for (const box of BOXES) {
    for (let d = 1; d <= 9; d++) {
      const spots = cellsWithDigit(state, box, d);
      if (spots.length < 2) continue;
      for (const lines of [ROWS, COLS]) {
        const key = lines === ROWS ? ROW : COL;
        const first = spots[0];
        if (!spots.every((c) => key[c] === key[first])) continue;
        const line = lines[key[first]];
        const elims = line.cells
          .filter((c) => BOX[c] !== box.index && (state.cands[c] & bit(d)) !== 0)
          .map((cell) => ({ cell, digit: d }));
        if (elims.length === 0) continue;
        return {
          technique: 'pointing',
          placements: [],
          eliminations: elims,
          focus: spots,
          description: `In ${unitName(box)}, ${d} can only go in ${unitName(line)} (${listCells(spots)}), so remove ${eliminationText(elims)}.`,
        };
      }
    }
  }
  return null;
}

function claiming(state: LogicState): Step | null {
  for (const line of [...ROWS, ...COLS]) {
    for (let d = 1; d <= 9; d++) {
      const spots = cellsWithDigit(state, line, d);
      if (spots.length < 2) continue;
      const first = spots[0];
      if (!spots.every((c) => BOX[c] === BOX[first])) continue;
      const box = BOXES[BOX[first]];
      const elims = box.cells
        .filter((c) => !line.cells.includes(c) && (state.cands[c] & bit(d)) !== 0)
        .map((cell) => ({ cell, digit: d }));
      if (elims.length === 0) continue;
      return {
        technique: 'claiming',
        placements: [],
        eliminations: elims,
        focus: spots,
        description: `In ${unitName(line)}, ${d} can only go inside ${unitName(box)} (${listCells(spots)}), so remove ${eliminationText(elims)}.`,
      };
    }
  }
  return null;
}

function nakedSubset(state: LogicState, size: 2 | 3): Step | null {
  const technique: TechniqueId = size === 2 ? 'naked-pair' : 'naked-triple';
  for (const unit of UNITS) {
    const open = unit.cells.filter((c) => !state.values[c] && POPCOUNT[state.cands[c]] >= 2 && POPCOUNT[state.cands[c]] <= size);
    if (open.length < size) continue;
    for (const group of combinations(open, size)) {
      let union = 0;
      for (const c of group) union |= state.cands[c];
      if (POPCOUNT[union] !== size) continue;
      const elims: Elimination[] = [];
      for (const c of unit.cells) {
        if (group.includes(c) || state.values[c]) continue;
        for (const d of DIGITS[state.cands[c] & union]) elims.push({ cell: c, digit: d });
      }
      if (elims.length === 0) continue;
      return {
        technique,
        placements: [],
        eliminations: elims,
        focus: group,
        description: `${listCells(group)} in ${unitName(unit)} hold only ${listDigits(DIGITS[union])} between them, so those digits leave the rest of the ${unit.kind}: remove ${eliminationText(elims)}.`,
      };
    }
  }
  return null;
}

function hiddenSubset(state: LogicState, size: 2 | 3): Step | null {
  const technique: TechniqueId = size === 2 ? 'hidden-pair' : 'hidden-triple';
  for (const unit of UNITS) {
    const placed = placedInUnit(state, unit);
    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) {
      if (placed & bit(d)) continue;
      const n = cellsWithDigit(state, unit, d).length;
      if (n >= 2 && n <= size) digits.push(d);
    }
    if (digits.length < size) continue;
    for (const group of combinations(digits, size)) {
      let mask = 0;
      for (const d of group) mask |= bit(d);
      const cells = unit.cells.filter((c) => (state.cands[c] & mask) !== 0);
      if (cells.length !== size) continue;
      const elims: Elimination[] = [];
      for (const c of cells) for (const d of DIGITS[state.cands[c] & ~mask]) elims.push({ cell: c, digit: d });
      if (elims.length === 0) continue;
      return {
        technique,
        placements: [],
        eliminations: elims,
        focus: cells,
        description: `In ${unitName(unit)}, ${listDigits(group)} can only go in ${listCells(cells)}, so those cells hold nothing else: remove ${eliminationText(elims)}.`,
      };
    }
  }
  return null;
}

/** X-Wing (size 2) and Swordfish (size 3), with rows or columns as the base. */
function fish(state: LogicState, size: 2 | 3): Step | null {
  const technique: TechniqueId = size === 2 ? 'x-wing' : 'swordfish';
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    for (const [bases, covers] of [
      [ROWS, COLS],
      [COLS, ROWS],
    ] as const) {
      const coverIndex = bases === ROWS ? COL : ROW;
      const candidates: { unit: Unit; spots: number[]; mask: number }[] = [];
      for (const unit of bases) {
        const spots = cellsWithDigit(state, unit, d);
        if (spots.length < 2 || spots.length > size) continue;
        let mask = 0;
        for (const c of spots) mask |= 1 << coverIndex[c];
        candidates.push({ unit, spots, mask });
      }
      if (candidates.length < size) continue;
      for (const group of combinations(candidates, size)) {
        let mask = 0;
        for (const g of group) mask |= g.mask;
        if (POPCOUNT[mask] !== size) continue;
        const baseCells = new Set(group.flatMap((g) => g.unit.cells));
        const coverUnits = DIGITS[mask].map((i) => covers[i - 1]);
        const elims: Elimination[] = [];
        for (const cover of coverUnits) {
          for (const c of cover.cells) {
            if (!baseCells.has(c) && (state.cands[c] & b) !== 0) elims.push({ cell: c, digit: d });
          }
        }
        if (elims.length === 0) continue;
        const focus = group.flatMap((g) => g.spots);
        const baseKind = bases === ROWS ? 'rows' : 'columns';
        const coverKind = bases === ROWS ? 'columns' : 'rows';
        const baseNames = group.map((g) => g.unit.index + 1).join(', ');
        const coverNames = coverUnits.map((u) => u.index + 1).join(', ');
        return {
          technique,
          placements: [],
          eliminations: elims,
          focus,
          description: `In ${baseKind} ${baseNames}, ${d} is confined to ${coverKind} ${coverNames}, so ${d} cannot appear elsewhere in those ${coverKind}: remove ${eliminationText(elims)}.`,
        };
      }
    }
  }
  return null;
}

function xyWing(state: LogicState): Step | null {
  const bivalue: number[] = [];
  for (let c = 0; c < CELLS; c++) if (!state.values[c] && POPCOUNT[state.cands[c]] === 2) bivalue.push(c);
  for (const pivot of bivalue) {
    const pm = state.cands[pivot];
    const wings = bivalue.filter((c) => sees(c, pivot) && POPCOUNT[state.cands[c] & pm] === 1);
    for (let i = 0; i < wings.length; i++) {
      for (let j = i + 1; j < wings.length; j++) {
        const a = wings[i];
        const b = wings[j];
        const am = state.cands[a];
        const bm = state.cands[b];
        // The wings must use different pivot digits and share a third digit z.
        if ((am & pm) === (bm & pm)) continue;
        const z = am & bm & ~pm;
        if (POPCOUNT[z] !== 1) continue;
        const elims: Elimination[] = [];
        for (let c = 0; c < CELLS; c++) {
          if (c === a || c === b || c === pivot || state.values[c]) continue;
          if ((state.cands[c] & z) !== 0 && sees(c, a) && sees(c, b)) elims.push({ cell: c, digit: firstDigit(z) });
        }
        if (elims.length === 0) continue;
        const zd = firstDigit(z);
        return {
          technique: 'xy-wing',
          placements: [],
          eliminations: elims,
          focus: [pivot, a, b],
          description: `${cellName(pivot)} (${listDigits(DIGITS[pm])}) sees ${cellName(a)} (${listDigits(DIGITS[am])}) and ${cellName(b)} (${listDigits(DIGITS[bm])}). Whichever digit the pivot takes, one wing becomes ${zd}, so remove ${eliminationText(elims)}.`,
        };
      }
    }
  }
  return null;
}

interface Finder {
  readonly id: TechniqueId;
  readonly find: (state: LogicState) => Step | null;
}

/** Techniques in the order a person would usually try them, cheapest first. */
const FINDERS: readonly Finder[] = [
  { id: 'full-house', find: fullHouse },
  { id: 'naked-single', find: nakedSingle },
  { id: 'hidden-single', find: hiddenSingle },
  { id: 'pointing', find: pointing },
  { id: 'claiming', find: claiming },
  { id: 'naked-pair', find: (s) => nakedSubset(s, 2) },
  { id: 'hidden-pair', find: (s) => hiddenSubset(s, 2) },
  { id: 'naked-triple', find: (s) => nakedSubset(s, 3) },
  { id: 'hidden-triple', find: (s) => hiddenSubset(s, 3) },
  { id: 'x-wing', find: (s) => fish(s, 2) },
  { id: 'swordfish', find: (s) => fish(s, 3) },
  { id: 'xy-wing', find: xyWing },
];

/** Finds the easiest available step, or null when none of the techniques apply. */
export function findNextStep(state: LogicState): Step | null {
  for (const { find } of FINDERS) {
    const step = find(state);
    if (step) return step;
  }
  return null;
}

/** Looks for one specific technique only. */
export function findStep(state: LogicState, technique: TechniqueId): Step | null {
  return FINDERS.find((f) => f.id === technique)?.find(state) ?? null;
}

/** True when some empty cell has no candidates left, which means a wrong digit was placed. */
export function hasContradiction(state: LogicState): boolean {
  for (let c = 0; c < CELLS; c++) if (!state.values[c] && state.cands[c] === 0) return true;
  return false;
}

export interface LogicResult {
  steps: Step[];
  solved: boolean;
  values: Grid;
}

/** Applies steps until the grid is full or no technique applies. */
export function solveLogically(grid: Grid, maxLevel: Difficulty = 'expert'): LogicResult {
  const state = createLogicState(grid);
  const cap = DIFFICULTIES.indexOf(maxLevel);
  const steps: Step[] = [];
  for (;;) {
    if (!state.values.includes(0)) return { steps, solved: true, values: state.values };
    const step = findNextStep(state);
    if (!step || DIFFICULTIES.indexOf(TECHNIQUES[step.technique].difficulty) > cap) {
      return { steps, solved: false, values: state.values };
    }
    applyStep(state, step);
    steps.push(step);
  }
}

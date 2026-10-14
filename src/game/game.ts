import { CELLS, PEERS, bit, computeCandidates, findConflicts, formatGrid, type Difficulty, type Grid } from '../engine';

interface CellChange {
  cell: number;
  prevValue: number;
  prevNotes: number;
  value: number;
  notes: number;
}

type Move = CellChange[];

export type GameKind = Difficulty | 'custom';

export interface GameInit {
  puzzle: Grid;
  solution: Grid;
  kind: GameKind;
  label: string;
  values?: Grid;
  notes?: Uint16Array;
  elapsedMs?: number;
}

/** Undo history is capped so a long session cannot grow memory without bound. */
const MAX_HISTORY = 500;

/**
 * Board state for one game, with undo and redo. Kept free of DOM code so it
 * can be unit tested and so the UI only ever renders from it.
 */
export class Game {
  readonly puzzle: Grid;
  readonly solution: Grid;
  readonly kind: GameKind;
  readonly label: string;
  readonly values: Grid;
  readonly notes: Uint16Array;
  elapsedMs: number;

  private undoStack: Move[] = [];
  private redoStack: Move[] = [];

  constructor(init: GameInit) {
    this.puzzle = init.puzzle.slice();
    this.solution = init.solution.slice();
    this.kind = init.kind;
    this.label = init.label;
    this.values = (init.values ?? init.puzzle).slice();
    this.notes = init.notes ? init.notes.slice() : new Uint16Array(CELLS);
    this.elapsedMs = init.elapsedMs ?? 0;
  }

  isGiven(cell: number): boolean {
    return this.puzzle[cell] !== 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get solved(): boolean {
    for (let i = 0; i < CELLS; i++) if (this.values[i] !== this.solution[i]) return false;
    return true;
  }

  /** Cells holding a digit that also appears in a peer. */
  conflicts(): Set<number> {
    return new Set(findConflicts(this.values));
  }

  /** Filled cells that disagree with the solution. */
  wrongCells(): number[] {
    const wrong: number[] = [];
    for (let i = 0; i < CELLS; i++) if (this.values[i] && this.values[i] !== this.solution[i]) wrong.push(i);
    return wrong;
  }

  /** How many times each digit 1-9 is on the board (index 0 unused). */
  digitCounts(): number[] {
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < CELLS; i++) counts[this.values[i]]++;
    return counts;
  }

  private commit(move: Move): boolean {
    const real = move.filter((c) => c.prevValue !== c.value || c.prevNotes !== c.notes);
    if (real.length === 0) return false;
    for (const c of real) {
      this.values[c.cell] = c.value;
      this.notes[c.cell] = c.notes;
    }
    this.undoStack.push(real);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }

  private change(cell: number, value: number, notes: number): CellChange {
    return { cell, prevValue: this.values[cell], prevNotes: this.notes[cell], value, notes };
  }

  /**
   * Places a digit, or clears it if the same digit is already there. Placing
   * also removes that digit from the notes of every peer, which is what
   * players expect and is undone together with the placement.
   */
  setDigit(cell: number, digit: number): boolean {
    if (this.isGiven(cell) || digit < 1 || digit > 9) return false;
    if (this.values[cell] === digit) return this.erase(cell);
    const move: Move = [this.change(cell, digit, 0)];
    const b = bit(digit);
    for (const p of PEERS[cell]) {
      if (this.notes[p] & b) move.push(this.change(p, this.values[p], this.notes[p] & ~b));
    }
    return this.commit(move);
  }

  toggleNote(cell: number, digit: number): boolean {
    if (this.values[cell] || digit < 1 || digit > 9) return false;
    return this.commit([this.change(cell, 0, this.notes[cell] ^ bit(digit))]);
  }

  erase(cell: number): boolean {
    if (this.isGiven(cell)) return false;
    return this.commit([this.change(cell, 0, 0)]);
  }

  /** Fills every empty cell's notes with its current candidates. */
  fillNotes(): boolean {
    const cands = computeCandidates(this.values);
    const move: Move = [];
    for (let i = 0; i < CELLS; i++) if (!this.values[i]) move.push(this.change(i, 0, cands[i]));
    return this.commit(move);
  }

  /**
   * Removes candidates from notes as one undoable move. Cells without notes
   * are first filled with their candidates so the elimination is visible.
   */
  eliminate(eliminations: readonly { cell: number; digit: number }[]): boolean {
    const cands = computeCandidates(this.values);
    const next = new Map<number, number>();
    for (const { cell, digit } of eliminations) {
      if (this.values[cell]) continue;
      const base = next.get(cell) ?? (this.notes[cell] || cands[cell]);
      next.set(cell, base & ~bit(digit));
    }
    return this.commit([...next].map(([cell, notes]) => this.change(cell, 0, notes)));
  }

  undo(): number[] {
    const move = this.undoStack.pop();
    if (!move) return [];
    for (let i = move.length - 1; i >= 0; i--) {
      const c = move[i] as CellChange;
      this.values[c.cell] = c.prevValue;
      this.notes[c.cell] = c.prevNotes;
    }
    this.redoStack.push(move);
    return move.map((c) => c.cell);
  }

  redo(): number[] {
    const move = this.redoStack.pop();
    if (!move) return [];
    for (const c of move) {
      this.values[c.cell] = c.value;
      this.notes[c.cell] = c.notes;
    }
    this.undoStack.push(move);
    return move.map((c) => c.cell);
  }

  /** Restarts the same puzzle from its givens. */
  reset(): boolean {
    const move: Move = [];
    for (let i = 0; i < CELLS; i++) if (!this.isGiven(i)) move.push(this.change(i, 0, 0));
    return this.commit(move);
  }

  toJSON(): SavedGame {
    return {
      version: SAVE_VERSION,
      puzzle: formatGrid(this.puzzle, '0'),
      solution: formatGrid(this.solution, '0'),
      values: formatGrid(this.values, '0'),
      notes: Array.from(this.notes),
      kind: this.kind,
      label: this.label,
      elapsedMs: Math.round(this.elapsedMs),
    };
  }
}

export const SAVE_VERSION = 2;

export interface SavedGame {
  version: number;
  puzzle: string;
  solution: string;
  values: string;
  notes: number[];
  kind: GameKind;
  label: string;
  elapsedMs: number;
}

const KINDS: readonly string[] = ['easy', 'medium', 'hard', 'expert', 'custom'];
const DIGIT_STRING = /^[0-9]{81}$/;

function toGrid(s: string): Grid {
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0) - 48);
}

/**
 * Rebuilds a game from untrusted saved data (localStorage can be edited by
 * hand or left over from an older version). Anything that does not describe
 * a consistent game returns null and the app starts fresh.
 */
export function restoreGame(data: unknown): Game | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<Record<keyof SavedGame, unknown>>;
  if (d.version !== SAVE_VERSION) return null;
  if (typeof d.puzzle !== 'string' || !DIGIT_STRING.test(d.puzzle)) return null;
  if (typeof d.solution !== 'string' || !DIGIT_STRING.test(d.solution)) return null;
  if (typeof d.values !== 'string' || !DIGIT_STRING.test(d.values)) return null;
  if (typeof d.kind !== 'string' || !KINDS.includes(d.kind)) return null;
  if (typeof d.label !== 'string' || d.label.length > 80) return null;
  if (typeof d.elapsedMs !== 'number' || !Number.isFinite(d.elapsedMs) || d.elapsedMs < 0) return null;
  if (!Array.isArray(d.notes) || d.notes.length !== CELLS) return null;
  if (!d.notes.every((n): n is number => Number.isInteger(n) && n >= 0 && n <= 0x1ff)) return null;

  const puzzle = toGrid(d.puzzle);
  const solution = toGrid(d.solution);
  const values = toGrid(d.values);
  if (solution.includes(0) || findConflicts(solution).length > 0) return null;
  for (let i = 0; i < CELLS; i++) {
    if (puzzle[i] && (puzzle[i] !== solution[i] || values[i] !== puzzle[i])) return null;
  }

  return new Game({
    puzzle,
    solution,
    values,
    notes: Uint16Array.from(d.notes),
    kind: d.kind as GameKind,
    label: d.label,
    elapsedMs: d.elapsedMs,
  });
}

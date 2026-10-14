import {
  BOX,
  CELLS,
  COL,
  DIFFICULTIES,
  PEERS,
  ROW,
  TECHNIQUES,
  bit,
  formatGrid,
  parseGrid,
  sees,
  type Difficulty,
  type Hint,
} from '../engine';
import { Game, restoreGame } from '../game/game';
import { dailyPuzzle } from '../game/daily';
import { readJson, writeJson } from '../game/storage';
import type { EngineClient } from '../worker/client';
import type { PuzzlePayload } from '../worker/protocol';
import { Announcer, byId, formatTime, spokenTime } from './dom';
import { GridView } from './grid-view';

const SAVE_KEY = 'sudoku.game.v2';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function randomSeed(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36)).join('');
}

function isTextField(el: Element | null): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/** Digit from a key event: the printed key first, then the physical key for Shift+digit. */
function digitFromEvent(e: KeyboardEvent): number | null {
  if (e.key.length === 1 && e.key >= '1' && e.key <= '9') return Number(e.key);
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return m ? Number(m[1]) : null;
}

export class PlayController {
  game: Game | null = null;
  private readonly engine: EngineClient;
  private readonly announcer: Announcer;
  private readonly grid: GridView;
  private selected = 40;
  private notesMode = false;
  private hint: Hint | null = null;
  private checked = new Set<number>();
  private busy = false;
  private active = true;
  private winShown = false;
  private lastTick = performance.now();

  private readonly board = byId('board');
  private readonly label = byId('game-label');
  private readonly timer = byId('timer');
  private readonly difficulty = byId('difficulty', HTMLSelectElement);
  private readonly keypad = document.querySelector<HTMLElement>('.keypad');
  private readonly keys = Array.from(document.querySelectorAll<HTMLButtonElement>('.key'));
  private readonly notesToggle = byId('notes-toggle', HTMLButtonElement);
  private readonly undoBtn = byId('undo', HTMLButtonElement);
  private readonly redoBtn = byId('redo', HTMLButtonElement);
  private readonly hintPanel = byId('hint-panel');
  private readonly winDialog = byId('win-dialog', HTMLDialogElement);
  private readonly ioDialog = byId('io-dialog', HTMLDialogElement);
  private readonly ioInput = byId('io-input', HTMLTextAreaElement);
  private readonly ioError = byId('io-error');
  private readonly busyButtons = ['new-game', 'daily', 'io-load', 'hint'].map((id) => byId(id, HTMLButtonElement));

  constructor(engine: EngineClient, announcer: Announcer) {
    this.engine = engine;
    this.announcer = announcer;
    this.grid = new GridView(this.board, 'cell');
    this.bindBoard();
    this.bindControls();
    this.bindDialogs();
    document.addEventListener('keydown', (e) => {
      this.onGlobalKey(e);
    });
    window.setInterval(() => {
      this.tick();
    }, 1000);
    document.addEventListener('visibilitychange', () => {
      this.tick();
      if (document.visibilityState === 'hidden') this.save();
    });
    window.addEventListener('pagehide', () => {
      this.tick();
      this.save();
    });
  }

  async start(): Promise<void> {
    const restored = restoreGame(readJson(SAVE_KEY));
    if (restored) {
      this.setGame(restored);
      if (restored.kind !== 'custom') this.difficulty.value = restored.kind;
      return;
    }
    await this.newGame('medium');
  }

  /** Called by the tab switcher so the clock only runs while the board is visible. */
  setActive(active: boolean): void {
    this.tick();
    this.active = active;
  }

  // ----- game lifecycle -----

  private setGame(game: Game): void {
    this.game = game;
    this.selected = game.values.includes(0) ? game.values.indexOf(0) : 40;
    this.hint = null;
    this.checked.clear();
    this.winShown = game.solved;
    this.lastTick = performance.now();
    this.label.textContent = game.label;
    this.board.setAttribute('aria-busy', 'false');
    this.render();
    this.save();
  }

  private setBusy(busy: boolean, message?: string): void {
    this.busy = busy;
    this.board.setAttribute('aria-busy', String(busy));
    for (const b of this.busyButtons) b.disabled = busy;
    if (message) this.label.textContent = message;
  }

  private async loadPayload(
    promise: Promise<PuzzlePayload>,
    kind: (p: PuzzlePayload) => Game['kind'],
    label: (p: PuzzlePayload) => string,
  ): Promise<void> {
    try {
      const payload = await promise;
      const game = new Game({
        puzzle: parseGrid(payload.puzzle),
        solution: parseGrid(payload.solution),
        kind: kind(payload),
        label: label(payload),
      });
      this.setGame(game);
      if (game.kind !== 'custom') this.difficulty.value = game.kind;
      this.announcer.say(`New puzzle loaded: ${game.label}. ${81 - game.puzzle.filter((d) => d === 0).length} givens.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load the puzzle.';
      if (this.game) this.label.textContent = this.game.label;
      throw new Error(message, { cause: err });
    } finally {
      this.setBusy(false);
    }
  }

  async newGame(difficulty: Difficulty): Promise<void> {
    if (this.busy) return;
    this.setBusy(true, `Generating ${difficulty} puzzle`);
    this.announcer.say(`Generating a ${difficulty} puzzle.`);
    try {
      await this.loadPayload(
        this.engine.request({ type: 'generate', difficulty, seed: randomSeed() }),
        () => difficulty,
        () => capitalize(difficulty),
      );
    } catch (err) {
      this.announcer.say(err instanceof Error ? err.message : 'Could not generate a puzzle.', true);
    }
  }

  async daily(): Promise<void> {
    if (this.busy) return;
    const d = dailyPuzzle(new Date());
    this.setBusy(true, `Generating ${d.label}`);
    try {
      await this.loadPayload(
        this.engine.request({ type: 'generate', difficulty: d.difficulty, seed: d.seed }),
        () => d.difficulty,
        () => `${d.label}, ${d.difficulty}`,
      );
    } catch (err) {
      this.announcer.say(err instanceof Error ? err.message : 'Could not generate a puzzle.', true);
    }
  }

  private async importPuzzle(input: string): Promise<void> {
    if (this.busy) return;
    this.ioError.textContent = '';
    this.setBusy(true);
    try {
      await this.loadPayload(
        this.engine.request({ type: 'load', input }),
        (p) => p.grade.difficulty ?? 'custom',
        (p) => `Imported, ${p.grade.difficulty ?? 'beyond the grader'}`,
      );
      this.ioDialog.close();
      this.cellAt(this.selected).focus();
    } catch (err) {
      this.ioError.textContent = err instanceof Error ? err.message : 'Could not load the puzzle.';
      this.ioInput.focus();
    }
  }

  // ----- input -----

  private bindBoard(): void {
    this.board.addEventListener('click', (e) => {
      const target = (e.target as Element).closest<HTMLElement>('.cell');
      if (!target) return;
      this.select(Number(target.dataset['cell']));
    });
    this.board.addEventListener('keydown', (e) => {
      this.onBoardKey(e);
    });
  }

  private bindControls(): void {
    for (const key of this.keys) {
      key.addEventListener('click', () => {
        this.input(Number(key.dataset['digit']), this.notesMode);
      });
    }
    byId('notes-toggle').addEventListener('click', () => {
      this.toggleNotesMode();
    });
    byId('erase').addEventListener('click', () => {
      this.erase();
    });
    this.undoBtn.addEventListener('click', () => {
      this.undo();
    });
    this.redoBtn.addEventListener('click', () => {
      this.redo();
    });
    byId('hint').addEventListener('click', () => {
      void this.requestHint();
    });
    byId('check').addEventListener('click', () => {
      this.check();
    });
    byId('auto-notes').addEventListener('click', () => {
      if (this.game?.fillNotes()) this.afterChange('Notes filled for every empty cell.');
    });
    byId('restart').addEventListener('click', () => {
      if (this.game?.reset()) this.afterChange('Board cleared back to the givens. Undo restores it.');
    });
    byId('new-game').addEventListener('click', () => {
      void this.newGame(this.chosenDifficulty());
    });
    byId('daily').addEventListener('click', () => {
      void this.daily();
    });
    byId('hint-apply').addEventListener('click', () => {
      this.applyHint();
    });
    byId('hint-dismiss').addEventListener('click', () => {
      this.clearHint();
      this.cellAt(this.selected).focus();
    });
  }

  private bindDialogs(): void {
    byId('open-io').addEventListener('click', () => {
      this.ioError.textContent = '';
      this.ioInput.value = '';
      this.ioDialog.showModal();
      this.ioInput.focus();
    });
    byId('io-close').addEventListener('click', () => {
      this.ioDialog.close();
    });
    byId('io-form').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.importPuzzle(this.ioInput.value);
    });
    byId('io-copy-puzzle').addEventListener('click', () => {
      if (this.game) void this.copy(formatGrid(this.game.puzzle, '.'), 'Puzzle');
    });
    byId('io-copy-board').addEventListener('click', () => {
      if (this.game) void this.copy(formatGrid(this.game.values, '.'), 'Board');
    });
    byId('win-new').addEventListener('click', () => {
      this.winDialog.close();
      void this.newGame(this.chosenDifficulty());
    });
    byId('win-close').addEventListener('click', () => {
      this.winDialog.close();
    });
    this.winDialog.addEventListener('close', () => {
      this.cellAt(this.selected).focus();
    });
  }

  private async copy(text: string, what: string): Promise<void> {
    // The textarea doubles as the fallback: if the clipboard API is blocked the
    // string is left selected there for a manual copy.
    this.ioInput.value = text;
    try {
      await navigator.clipboard.writeText(text);
      this.ioError.textContent = '';
      this.announcer.say(`${what} copied to the clipboard.`);
    } catch {
      this.ioInput.select();
      this.announcer.say(`${what} string is selected in the text box. Copy it with your keyboard.`);
    }
  }

  private onBoardKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const r = Math.floor(this.selected / 9);
    const c = this.selected % 9;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowUp':
        next = ((r + 8) % 9) * 9 + c;
        break;
      case 'ArrowDown':
        next = ((r + 1) % 9) * 9 + c;
        break;
      case 'ArrowLeft':
        next = r * 9 + ((c + 8) % 9);
        break;
      case 'ArrowRight':
        next = r * 9 + ((c + 1) % 9);
        break;
      case 'Home':
        next = r * 9;
        break;
      case 'End':
        next = r * 9 + 8;
        break;
      case 'PageUp':
        next = c;
        break;
      case 'PageDown':
        next = 72 + c;
        break;
      case 'Backspace':
      case 'Delete':
      case '0':
        e.preventDefault();
        this.erase();
        return;
      case 'n':
      case 'N':
        e.preventDefault();
        this.toggleNotesMode();
        return;
      case 'h':
      case 'H':
        e.preventDefault();
        if (this.hint) this.applyHint();
        else void this.requestHint();
        return;
      case 'Escape':
        if (this.hint) {
          e.preventDefault();
          this.clearHint();
        }
        return;
    }
    if (next !== null) {
      e.preventDefault();
      this.select(next);
      return;
    }
    const digit = digitFromEvent(e);
    if (digit !== null) {
      e.preventDefault();
      this.input(digit, this.notesMode || e.shiftKey);
    }
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (!this.active || isTextField(document.activeElement) || this.winDialog.open || this.ioDialog.open) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      this.redo();
    }
  }

  private select(cell: number): void {
    this.selected = cell;
    this.render();
    this.cellAt(cell).focus();
  }

  private cellAt(i: number): HTMLElement {
    return this.grid.cells[i];
  }

  private toggleNotesMode(): void {
    this.notesMode = !this.notesMode;
    this.notesToggle.setAttribute('aria-pressed', String(this.notesMode));
    this.keypad?.classList.toggle('notes-mode', this.notesMode);
    this.render();
    this.announcer.say(this.notesMode ? 'Notes mode on.' : 'Notes mode off.');
  }

  private input(digit: number, asNote: boolean): void {
    const g = this.game;
    if (!g || this.busy) return;
    const cell = this.selected;
    if (g.isGiven(cell)) {
      this.announcer.say('That cell is a given and cannot be changed.');
      return;
    }
    if (asNote) {
      if (g.values[cell]) {
        this.announcer.say('Clear the digit before adding notes.');
        return;
      }
      if (g.toggleNote(cell, digit)) {
        const on = (g.notes[cell] & bit(digit)) !== 0;
        this.afterChange(`Note ${digit} ${on ? 'added' : 'removed'}.`);
      }
      return;
    }
    if (g.setDigit(cell, digit)) this.afterChange(this.describePlacement(cell));
  }

  private erase(): void {
    const g = this.game;
    if (!g || this.busy) return;
    if (g.isGiven(this.selected)) {
      this.announcer.say('That cell is a given and cannot be changed.');
      return;
    }
    if (g.erase(this.selected)) this.afterChange('Cleared.');
  }

  private undo(): void {
    const cells = this.game?.undo() ?? [];
    if (cells.length) this.afterChange('Undone.', cells[0]);
    else this.announcer.say('Nothing to undo.');
  }

  private redo(): void {
    const cells = this.game?.redo() ?? [];
    if (cells.length) this.afterChange('Redone.', cells[0]);
    else this.announcer.say('Nothing to redo.');
  }

  /** "5 placed" or "5 placed. Conflict: row 3 already has a 5." */
  private describePlacement(cell: number): string {
    const g = this.game;
    if (!g) return '';
    const d = g.values[cell];
    if (!d) return 'Cleared.';
    const clash = PEERS[cell].find((p) => g.values[p] === d);
    if (clash === undefined) return `${d} placed.`;
    const where =
      ROW[clash] === ROW[cell] ? `row ${ROW[cell] + 1}` : COL[clash] === COL[cell] ? `column ${COL[cell] + 1}` : `box ${BOX[cell] + 1}`;
    return `${d} placed. Conflict: ${where} already has a ${d}.`;
  }

  private afterChange(message: string, focusCell?: number): void {
    const g = this.game;
    if (!g) return;
    this.hint = null;
    this.hintPanel.hidden = true;
    this.checked.clear();
    if (focusCell !== undefined) this.selected = focusCell;
    this.render();
    this.save();
    if (g.solved && !this.winShown) {
      this.win();
      return;
    }
    this.announcer.say(message);
  }

  // ----- hints and checking -----

  private async requestHint(): Promise<void> {
    const g = this.game;
    if (!g || this.busy) return;
    try {
      const hint = await this.engine.request({
        type: 'hint',
        board: formatGrid(g.values, '0'),
        solution: formatGrid(g.solution, '0'),
      });
      if (this.game !== g) return;
      this.showHint(hint);
    } catch (err) {
      this.announcer.say(err instanceof Error ? err.message : 'No hint available.');
    }
  }

  private showHint(hint: Hint): void {
    this.hint = hint;
    let title: string;
    let text: string;
    switch (hint.kind) {
      case 'mistake':
        title = 'Mistake.';
        text = hint.description;
        break;
      case 'step':
        title = `${TECHNIQUES[hint.step.technique].name}.`;
        text = hint.step.description;
        break;
      case 'reveal':
        title = 'Reveal.';
        text = hint.description;
        break;
      case 'solved':
        title = 'Done.';
        text = hint.description;
        break;
    }
    byId('hint-title').textContent = title;
    byId('hint-text').textContent = text;
    byId('hint-apply', HTMLButtonElement).hidden = hint.kind === 'solved';
    this.hintPanel.hidden = false;
    this.render();
    this.announcer.say(`Hint. ${title} ${text}`);
  }

  private clearHint(): void {
    this.hint = null;
    this.hintPanel.hidden = true;
    this.render();
  }

  private applyHint(): void {
    const g = this.game;
    const hint = this.hint;
    if (!g || !hint) return;
    let changed = false;
    let target = this.selected;
    switch (hint.kind) {
      case 'mistake':
        changed = g.clearCells(hint.cells);
        target = hint.cells[0] ?? target;
        break;
      case 'step': {
        const { placements, eliminations } = hint.step;
        for (const p of placements) changed = g.setDigit(p.cell, p.digit) || changed;
        if (eliminations.length) changed = g.eliminate(eliminations) || changed;
        const first = placements.length ? placements[0] : eliminations.length ? eliminations[0] : null;
        if (first) target = first.cell;
        break;
      }
      case 'reveal':
        changed = g.setDigit(hint.cell, hint.digit);
        target = hint.cell;
        break;
      case 'solved':
        break;
    }
    if (changed) this.afterChange('Hint applied.', target);
    else this.clearHint();
    this.cellAt(this.selected).focus();
  }

  private check(): void {
    const g = this.game;
    if (!g) return;
    const wrong = g.wrongCells();
    this.checked = new Set(wrong);
    this.render();
    const empty = g.values.filter((d) => d === 0).length;
    if (wrong.length === 0) {
      this.announcer.say(empty ? `Everything so far is correct. ${empty} cells to go.` : 'Everything is correct.');
    } else {
      this.announcer.say(`${wrong.length} cell${wrong.length === 1 ? ' is' : 's are'} wrong and marked with a strike-through.`);
    }
  }

  private win(): void {
    const g = this.game;
    if (!g) return;
    this.winShown = true;
    this.tick();
    this.save();
    byId('win-text').textContent = `You solved ${g.label} in ${formatTime(g.elapsedMs)}.`;
    this.announcer.say(`Puzzle solved in ${spokenTime(g.elapsedMs)}.`, true);
    this.winDialog.showModal();
    byId('win-new').focus();
  }

  // ----- timer and persistence -----

  private tick(): void {
    const now = performance.now();
    const g = this.game;
    if (g && this.active && !g.solved && !this.busy && document.visibilityState === 'visible') {
      g.elapsedMs += Math.min(now - this.lastTick, 5000);
    }
    this.lastTick = now;
    if (g) this.timer.textContent = formatTime(g.elapsedMs);
    if (g && Math.floor(g.elapsedMs / 1000) % 10 === 0) this.save();
  }

  private save(): void {
    if (this.game) writeJson(SAVE_KEY, this.game.toJSON());
  }

  // ----- rendering -----

  render(): void {
    const g = this.game;
    if (!g) return;
    const conflicts = g.conflicts();
    const sel = this.selected;
    const selValue = g.values[sel];

    const focus = new Set<number>();
    const targets = new Set<number>();
    const struck = new Map<number, number>();
    const hint = this.hint;
    if (hint?.kind === 'step') {
      for (const c of hint.step.focus) focus.add(c);
      for (const p of hint.step.placements) targets.add(p.cell);
      for (const e of hint.step.eliminations) {
        targets.add(e.cell);
        struck.set(e.cell, (struck.get(e.cell) ?? 0) | bit(e.digit));
      }
    } else if (hint?.kind === 'mistake') {
      for (const c of hint.cells) targets.add(c);
    } else if (hint?.kind === 'reveal') {
      targets.add(hint.cell);
    }

    for (let i = 0; i < CELLS; i++) {
      const v = g.values[i];
      const classes: string[] = [];
      const status: string[] = [];
      if (i === sel) classes.push('selected');
      else if (selValue && v === selValue) classes.push('same');
      else if (sees(i, sel)) classes.push('peer');
      if (conflicts.has(i)) {
        classes.push('conflict');
        status.push('conflict');
      }
      if (this.checked.has(i)) {
        classes.push('wrong');
        status.push('wrong');
      }
      if (targets.has(i)) {
        classes.push('hint-target');
        status.push('hint');
      } else if (focus.has(i)) {
        classes.push('hint-focus');
      }
      this.grid.update(i, {
        value: v,
        given: g.isGiven(i),
        notes: g.notes[i],
        struck: struck.get(i) ?? 0,
        classes,
        status,
      });
      const cell = this.cellAt(i);
      cell.tabIndex = i === sel ? 0 : -1;
      cell.setAttribute('aria-selected', String(i === sel));
    }

    const counts = g.digitCounts();
    for (const key of this.keys) {
      const d = Number(key.dataset['digit']);
      const done = counts[d] >= 9;
      key.classList.toggle('done', done);
      key.setAttribute('aria-label', `${this.notesMode ? 'Note' : 'Enter'} ${d}${done ? ', all nine placed' : ''}`);
    }
    this.undoBtn.disabled = !g.canUndo;
    this.redoBtn.disabled = !g.canRedo;
    this.timer.textContent = formatTime(g.elapsedMs);
  }

  /** The visualizer can replay the current game's puzzle. */
  currentPuzzle(): Uint8Array | null {
    return this.game ? this.game.puzzle.slice() : null;
  }

  private chosenDifficulty(): Difficulty {
    const value = this.difficulty.value;
    return DIFFICULTIES.find((d) => d === value) ?? 'medium';
  }
}

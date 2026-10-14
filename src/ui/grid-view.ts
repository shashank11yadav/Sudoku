import { COL, DIGITS, ROW, bit } from '../engine';

export interface CellState {
  value: number;
  given: boolean;
  notes: number;
  /** Note digits to draw struck through (eliminations from a hint). */
  struck: number;
  classes: readonly string[];
  /** Extra words for the accessible name, such as "conflict". */
  status: readonly string[];
}

/**
 * Builds the 9x9 ARIA grid once and patches individual cells afterwards.
 * Rows are real elements with role="row" so screen readers can report
 * row and column positions.
 */
export class GridView {
  readonly root: HTMLElement;
  readonly cells: HTMLElement[] = [];
  private readonly valueEls: HTMLElement[] = [];
  private readonly noteEls: HTMLElement[][] = [];
  private readonly last: string[] = [];

  constructor(root: HTMLElement, idPrefix: string) {
    this.root = root;
    root.replaceChildren();
    for (let r = 0; r < 9; r++) {
      const row = document.createElement('div');
      row.className = 'board-row';
      row.setAttribute('role', 'row');
      for (let c = 0; c < 9; c++) {
        const i = r * 9 + c;
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `${idPrefix}-${i}`;
        cell.dataset['cell'] = String(i);
        cell.setAttribute('role', 'gridcell');
        cell.tabIndex = -1;

        const value = document.createElement('span');
        value.className = 'value';
        value.setAttribute('aria-hidden', 'true');

        const notes = document.createElement('span');
        notes.className = 'notes';
        notes.setAttribute('aria-hidden', 'true');
        const noteSpans: HTMLElement[] = [];
        for (let d = 1; d <= 9; d++) {
          const n = document.createElement('span');
          notes.append(n);
          noteSpans.push(n);
        }

        cell.append(value, notes);
        row.append(cell);
        this.cells.push(cell);
        this.valueEls.push(value);
        this.noteEls.push(noteSpans);
        this.last.push('');
      }
      root.append(row);
    }
  }

  update(i: number, s: CellState): void {
    const key = `${s.value}|${s.given ? 1 : 0}|${s.notes}|${s.struck}|${s.classes.join(' ')}|${s.status.join(' ')}`;
    if (this.last[i] === key) return;
    this.last[i] = key;

    const cell = this.cells[i];
    cell.className = ['cell', ...(s.given ? ['given'] : []), ...s.classes].join(' ');
    (this.valueEls[i]).textContent = s.value ? String(s.value) : '';
    const noteSpans = this.noteEls[i];
    for (let d = 1; d <= 9; d++) {
      const span = noteSpans[d - 1];
      const shown = !s.value && (s.notes & bit(d)) !== 0;
      span.textContent = shown ? String(d) : '';
      span.className = shown && (s.struck & bit(d)) !== 0 ? 'struck' : '';
    }
    cell.setAttribute('aria-label', describeCell(i, s));
  }
}

function describeCell(i: number, s: CellState): string {
  const parts = [`Row ${ROW[i] + 1}, column ${COL[i] + 1}`];
  if (s.value) parts.push(s.given ? `${s.value}, given` : String(s.value));
  else if (s.notes) parts.push(`empty, notes ${DIGITS[s.notes].join(' ')}`);
  else parts.push('empty');
  parts.push(...s.status);
  return parts.join(', ');
}

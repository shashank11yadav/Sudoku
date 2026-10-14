import { CELLS, cellName, type Grid } from './board';
import { createLogicState, findNextStep, hasContradiction, type Step } from './techniques';

export type Hint =
  | { kind: 'mistake'; cells: number[]; description: string }
  | { kind: 'step'; step: Step }
  | { kind: 'reveal'; cell: number; digit: number; description: string }
  | { kind: 'solved'; description: string };

/**
 * The next thing a player should do from their current board. Wrong digits
 * come first, because any logic built on a wrong digit is meaningless. If the
 * known techniques run out (possible with imported puzzles), fall back to
 * revealing one cell from the solution.
 */
export function getHint(board: Grid, solution: Grid): Hint {
  const wrong: number[] = [];
  for (let i = 0; i < CELLS; i++) if (board[i] && board[i] !== solution[i]) wrong.push(i);
  if (wrong.length > 0) {
    const names = wrong.slice(0, 3).map(cellName).join(', ');
    const more = wrong.length > 3 ? ` and ${wrong.length - 3} more` : '';
    return {
      kind: 'mistake',
      cells: wrong,
      description: `${names}${more} ${wrong.length === 1 ? 'does' : 'do'} not match the solution. Clear ${wrong.length === 1 ? 'it' : 'them'} first.`,
    };
  }

  if (!board.includes(0)) return { kind: 'solved', description: 'The puzzle is already solved.' };

  const state = createLogicState(board);
  const step = hasContradiction(state) ? null : findNextStep(state);
  if (step) return { kind: 'step', step };

  let cell = board.indexOf(0);
  // Prefer the most constrained empty cell so the reveal is as useful as possible.
  let fewest = 10;
  for (let i = 0; i < CELLS; i++) {
    if (board[i]) continue;
    let n = 0;
    for (let m = state.cands[i]; m; m &= m - 1) n++;
    if (n < fewest) {
      fewest = n;
      cell = i;
    }
  }
  return {
    kind: 'reveal',
    cell,
    digit: solution[cell],
    description: `None of the techniques this solver knows apply here, so here is one cell: ${cellName(cell)} is ${solution[cell]}.`,
  };
}

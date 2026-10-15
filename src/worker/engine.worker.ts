import {
  PuzzleError,
  countSolutions,
  formatGrid,
  generatePuzzle,
  getHint,
  gradePuzzle,
  parseGrid,
  solve,
  validateGivens,
} from '../engine';
import { isEnvelope, requestId, type EngineResponse, type EngineResults, type Envelope, type PuzzlePayload } from './protocol';

/** Validates an imported puzzle string: format, duplicate givens, solvable, unique. */
function loadPuzzle(input: string): PuzzlePayload {
  const puzzle = parseGrid(input);
  validateGivens(puzzle);
  const count = countSolutions(puzzle, 2);
  if (count === 0) throw new PuzzleError('unsolvable', 'This puzzle has no solution.');
  if (count > 1) {
    throw new PuzzleError('multiple', 'This puzzle has more than one solution, so it cannot be checked or hinted.');
  }
  const solution = solve(puzzle);
  if (!solution) throw new PuzzleError('unsolvable', 'This puzzle has no solution.');
  return { puzzle: formatGrid(puzzle, '0'), solution: formatGrid(solution, '0'), grade: gradePuzzle(puzzle) };
}

function handle(msg: Envelope): EngineResults[keyof EngineResults] {
  switch (msg.type) {
    case 'generate': {
      const g = generatePuzzle({ difficulty: msg.difficulty, seed: msg.seed });
      return { puzzle: formatGrid(g.puzzle, '0'), solution: formatGrid(g.solution, '0'), grade: g.grade };
    }
    case 'load':
      return loadPuzzle(msg.input);
    case 'hint':
      return getHint(parseGrid(msg.board), parseGrid(msg.solution));
  }
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: EngineResponse) => void;
};

// A dedicated worker only receives messages from the page that created it, and
// event.origin is always empty here, so there is no origin to check. The payload
// is validated instead.
scope.onmessage = (event) => {
  const msg = event.data;
  if (!isEnvelope(msg)) {
    const id = requestId(msg);
    if (id !== null) scope.postMessage({ id, ok: false, error: 'The puzzle engine received a malformed request.' });
    return;
  }
  let response: EngineResponse;
  try {
    response = { id: msg.id, ok: true, result: handle(msg) };
  } catch (err) {
    // Only PuzzleError messages are written for players; anything else is a bug.
    const error = err instanceof PuzzleError ? err.message : 'Something went wrong in the puzzle engine.';
    response = { id: msg.id, ok: false, error };
  }
  scope.postMessage(response);
};

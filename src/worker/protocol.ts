import type { Difficulty, Grade, Hint } from '../engine';
import { DIFFICULTIES } from '../engine/techniques';

export interface PuzzlePayload {
  puzzle: string;
  solution: string;
  grade: Grade;
}

export type EngineRequest =
  | { type: 'generate'; difficulty: Difficulty; seed: string }
  | { type: 'load'; input: string }
  | { type: 'hint'; board: string; solution: string };

export interface EngineResults {
  generate: PuzzlePayload;
  load: PuzzlePayload;
  hint: Hint;
}

export type Envelope = EngineRequest & { id: number };

export type EngineResponse =
  | { id: number; ok: true; result: EngineResults[keyof EngineResults] }
  | { id: number; ok: false; error: string };

// Imports are capped at 1,000 characters by the parser; this only stops oversized strings early.
const MAX_FIELD_LENGTH = 1000;

const isField = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_FIELD_LENGTH;

type RawRequest = Partial<Record<'id' | 'type' | 'difficulty' | 'seed' | 'input' | 'board' | 'solution', unknown>>;

/** The worker checks every request's shape before it reaches the engine. */
export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as RawRequest;
  if (!Number.isSafeInteger(msg.id)) return false;
  switch (msg.type) {
    case 'generate':
      return (DIFFICULTIES as readonly unknown[]).includes(msg.difficulty) && isField(msg.seed);
    case 'load':
      return isField(msg.input);
    case 'hint':
      return isField(msg.board) && isField(msg.solution);
    default:
      return false;
  }
}

/** The request id, if there is a usable one, so a malformed request can still get an error reply. */
export function requestId(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const id = (value as RawRequest).id;
  return typeof id === 'number' && Number.isSafeInteger(id) ? id : null;
}

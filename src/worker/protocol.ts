import type { Difficulty, Grade, Hint } from '../engine';

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

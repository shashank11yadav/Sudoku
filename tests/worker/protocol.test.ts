import { describe, expect, it } from 'vitest';
import { isEnvelope, requestId } from '../../src/worker/protocol';

describe('isEnvelope', () => {
  it('accepts each request type', () => {
    expect(isEnvelope({ id: 1, type: 'generate', difficulty: 'hard', seed: '2026-10-15' })).toBe(true);
    expect(isEnvelope({ id: 2, type: 'load', input: '.'.repeat(81) })).toBe(true);
    expect(isEnvelope({ id: 3, type: 'hint', board: '0'.repeat(81), solution: '1'.repeat(81) })).toBe(true);
  });

  it('rejects malformed requests', () => {
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope('generate')).toBe(false);
    expect(isEnvelope({ type: 'load', input: '' })).toBe(false);
    expect(isEnvelope({ id: 1.5, type: 'load', input: '' })).toBe(false);
    expect(isEnvelope({ id: 1, type: 'solve', input: '' })).toBe(false);
    expect(isEnvelope({ id: 1, type: 'generate', difficulty: 'impossible', seed: 'x' })).toBe(false);
    expect(isEnvelope({ id: 1, type: 'generate', difficulty: 'easy', seed: 42 })).toBe(false);
    expect(isEnvelope({ id: 1, type: 'hint', board: '0'.repeat(81) })).toBe(false);
    expect(isEnvelope({ id: 1, type: 'load', input: 'x'.repeat(1001) })).toBe(false);
  });
});

describe('requestId', () => {
  it('recovers a usable id so the caller still gets a reply', () => {
    expect(requestId({ id: 7, type: 'nonsense' })).toBe(7);
    expect(requestId({ id: '7' })).toBeNull();
    expect(requestId(undefined)).toBeNull();
  });
});

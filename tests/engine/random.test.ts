import { describe, expect, it } from 'vitest';
import { createRng, hashString, shuffle } from '../../src/engine';

describe('seeded randomness', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRng('daily:2026-10-14');
    const b = createRng('daily:2026-10-14');
    const c = createRng('daily:2026-10-15');
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 10000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('hashes strings to unsigned 32-bit integers', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
  });

  it('shuffle is a permutation', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const shuffled = shuffle([...items], createRng(1));
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });
});

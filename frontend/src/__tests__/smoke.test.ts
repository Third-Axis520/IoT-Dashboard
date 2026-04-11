import { describe, it, expect } from 'vitest';

describe('Vitest smoke test', () => {
  it('framework loads and assertions work', () => {
    expect(1 + 1).toBe(2);
  });

  it.each([
    [1, 1, 2],
    [2, 3, 5],
    [0, 0, 0],
  ])('adds %i + %i = %i', (a, b, expected) => {
    expect(a + b).toBe(expected);
  });
});

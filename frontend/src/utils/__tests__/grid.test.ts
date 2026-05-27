import { describe, it, expect } from 'vitest';
import { getGridStyle } from '../grid';

describe('getGridStyle', () => {
  it('returns a 1×1 layout for an empty or single-tile line', () => {
    expect(getGridStyle(0)).toEqual({ gridTemplateColumns: '1fr', gridTemplateRows: '1fr' });
    expect(getGridStyle(1)).toEqual({ gridTemplateColumns: '1fr', gridTemplateRows: '1fr' });
  });

  it('packs 2 tiles into a single row', () => {
    expect(getGridStyle(2)).toEqual({
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: '1fr',
    });
  });

  it('uses 3:3 (3 cols × 2 rows) for the canonical 5–6 equipment line', () => {
    const expected = {
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
    };
    expect(getGridStyle(5)).toEqual(expected);
    expect(getGridStyle(6)).toEqual(expected);
  });

  it('switches to 2×2 for 4 tiles', () => {
    expect(getGridStyle(4)).toEqual({
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
    });
  });

  it('extends to 4-col grid for 7–8 tiles', () => {
    expect(getGridStyle(7)).toEqual({
      gridTemplateColumns: 'repeat(4, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
    });
    expect(getGridStyle(8)).toEqual({
      gridTemplateColumns: 'repeat(4, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
    });
  });

  it('approximates a 16:9 aspect ratio for counts beyond 12', () => {
    const style = getGridStyle(20);
    // 20 → cols ≈ ceil(sqrt(20 × 16/9)) = 6, rows = ceil(20/6) = 4
    expect(style.gridTemplateColumns).toBe('repeat(6, 1fr)');
    expect(style.gridTemplateRows).toBe('repeat(4, 1fr)');
  });
});

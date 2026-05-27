import { describe, it, expect } from 'vitest';
import { getGridStyle, tileSpan, tileSpanStyle, TILE_SPAN_BY_VISTYPE } from '../grid';

describe('getGridStyle', () => {
  it('returns single 1fr column for an empty line', () => {
    expect(getGridStyle(0)).toEqual({ gridTemplateColumns: '1fr' });
  });

  it('returns 12-col grid with dense flow for any non-zero count', () => {
    for (const count of [1, 3, 6, 12]) {
      const style = getGridStyle(count);
      expect(style.gridTemplateColumns).toBe('repeat(12, minmax(0, 1fr))');
      expect(style.gridAutoFlow).toBe('row dense');
      expect(style.gridAutoRows).toBe('minmax(0, 1fr)');
    }
  });
});

describe('tileSpan', () => {
  it('assigns the canonical 6-equipment line correctly', () => {
    // From grid.ts header comment:
    //   single_kpi(2) + dual_side_spark(4) + single_kpi(2) +
    //   four_rings(3) + pressing_machine_lr(6) + visual_marking_machine(2) = 19
    expect(tileSpan('single_kpi')).toBe(2);
    expect(tileSpan('dual_side_spark')).toBe(4);
    expect(tileSpan('four_rings')).toBe(3);
    expect(tileSpan('pressing_machine_lr')).toBe(6);
    expect(tileSpan('visual_marking_machine')).toBe(2);
  });

  it('gives wide tiles to information-dense visTypes', () => {
    expect(tileSpan('pressing_machine_lr')).toBeGreaterThan(tileSpan('single_kpi'));
    expect(tileSpan('dual_side_spark')).toBeGreaterThan(tileSpan('single_kpi'));
  });

  it('falls back to 3 for unknown visType so layout never collapses to 0', () => {
    expect(tileSpan('totally_made_up_vis_type')).toBe(3);
    expect(tileSpan('')).toBe(3);
  });

  it('keeps every span within the 12-col grid', () => {
    for (const span of Object.values(TILE_SPAN_BY_VISTYPE)) {
      expect(span).toBeGreaterThanOrEqual(1);
      expect(span).toBeLessThanOrEqual(12);
    }
  });
});

describe('tileSpanStyle', () => {
  it('produces the inline gridColumn property a CSS Grid child needs', () => {
    expect(tileSpanStyle('pressing_machine_lr')).toEqual({ gridColumn: 'span 6' });
    expect(tileSpanStyle('single_kpi')).toEqual({ gridColumn: 'span 2' });
    expect(tileSpanStyle('unknown')).toEqual({ gridColumn: 'span 3' });
  });
});

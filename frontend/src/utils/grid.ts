/**
 * 12-column grid container style — each tile sets its own col-span via
 * `tileSpanStyle(visType)` so wide-info equipments (pressing_machine_lr
 * with 14 sensors) get more horizontal room while single_kpi (one giant
 * number) doesn't gobble a quarter of the screen.
 *
 * `grid-auto-flow: dense` packs irregular spans tightly without leaving
 * empty cells.
 */
export const getGridStyle = (count: number) => {
  if (count === 0) return { gridTemplateColumns: '1fr' };
  return {
    gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
    gridAutoRows: 'minmax(0, 1fr)',
    gridAutoFlow: 'row dense' as const,
  };
};

/**
 * Per-tile column span on the 12-col grid, by visType. Tuned so a typical
 * production line (mix of single_kpi + dual_side_spark + four_rings +
 * pressing_machine_lr + visual_marking_machine) packs into 2 rows on a
 * 1920px viewport with each tile's content readable at its native density.
 *
 * Total spans for the canonical 6-equipment line:
 *   single_kpi(2) + dual_side_spark(4) + single_kpi(2) +
 *   four_rings(3) + pressing_machine_lr(6) + visual_marking_machine(2)
 *   = 19 → packs as row1[2+4+2+3=11] + row2[6+2=8] with dense flow.
 */
export const tileSpan = (visType: string, sensorCount: number): number => {
  switch (visType) {
    case 'pressing_machine_lr':       return 6;  // 14 sensors, L/R columns
    case 'dual_side_spark':           return 4;  // 6 stacked values
    case 'molding_matrix':            return 4;
    case 'four_rings':                return 3;  // 4 horizontal gauges 2x2
    case 'custom_grid':               return Math.max(3, Math.min(6, Math.ceil(sensorCount / 2)));
    case 'single_kpi':
    case 'visual_marking_machine':    return 2;  // one large readout
    default:                          return 3;
  }
};

export const tileSpanStyle = (visType: string, sensorCount: number) =>
  ({ gridColumn: `span ${tileSpan(visType, sensorCount)}` });

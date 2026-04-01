/**
 * 感測器設定：定義每個感測器 ID（1-12）的 UCL/LCL 限值，
 * 以及對應到哪台設備（equipmentId）的哪個測量點（pointId）。
 *
 * UCL/LCL 為預設值，使用者可透過 UI 調整並持久化到 DB。
 */
export interface SensorConfig {
  label: string;
  unit: string;
  ucl: number;
  lcl: number;
  equipmentId: string;
  pointId: string;
}

export const SENSOR_CONFIG: Record<number, SensorConfig> = {
  1:  { label: '設備溫度', unit: '℃', ucl: 185, lcl: 130, equipmentId: 'eq_vul_01',    pointId: 'pt_vul_temp'   },
  2:  { label: '大底溫度', unit: '℃', ucl: 85,  lcl: 55,  equipmentId: 'eq_chem_01',   pointId: 'pt_chem_top'   },
  3:  { label: '鞋面溫度', unit: '℃', ucl: 80,  lcl: 50,  equipmentId: 'eq_chem_01',   pointId: 'pt_chem_bot'   },
  4:  { label: '大底溫度', unit: '℃', ucl: 80,  lcl: 50,  equipmentId: 'eq_glue1_01',  pointId: 'pt_g1_top'     },
  5:  { label: '鞋面溫度', unit: '℃', ucl: 75,  lcl: 45,  equipmentId: 'eq_glue1_01',  pointId: 'pt_g1_bot'     },
  6:  { label: '大底溫度', unit: '℃', ucl: 80,  lcl: 50,  equipmentId: 'eq_glue2_01',  pointId: 'pt_g2_top'     },
  7:  { label: '鞋面溫度', unit: '℃', ucl: 75,  lcl: 45,  equipmentId: 'eq_glue2_01',  pointId: 'pt_g2_bot'     },
  8:  { label: '設備溫度', unit: '℃', ucl: -10, lcl: -30, equipmentId: 'eq_frz_01',    pointId: 'pt_frz_temp'   },
  9:  { label: '熱定型右', unit: '℃', ucl: 135, lcl: 100, equipmentId: 'eq_mold_01',   pointId: 'pt_mh_right'   },
  10: { label: '冷定型右', unit: '℃', ucl: 20,  lcl: 3,   equipmentId: 'eq_mold_01',   pointId: 'pt_mc_right'   },
  11: { label: '熱定型左', unit: '℃', ucl: 135, lcl: 100, equipmentId: 'eq_mold_01',   pointId: 'pt_mh_left'    },
  12: { label: '冷定型左', unit: '℃', ucl: 20,  lcl: 3,   equipmentId: 'eq_mold_01',   pointId: 'pt_mc_left'    },
};

/** 反向查詢：pointId → sensorId */
export const POINT_TO_SENSOR: Record<string, number> = Object.fromEntries(
  Object.entries(SENSOR_CONFIG).map(([id, cfg]) => [cfg.pointId, Number(id)])
);

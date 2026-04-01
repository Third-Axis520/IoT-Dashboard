import type { MachineTemplate, PointStatus, ProductionLine } from '../types';
import { createEquipmentFromTemplate } from '../utils/simulation';

export const COLORS = {
  bg: 'var(--bg-panel)',
  cardBg: 'var(--bg-card)',
  border: 'var(--border-base)',
  textPrimary: 'var(--text-main)',
  textSecondary: 'var(--text-muted)',
  normal: 'var(--accent-green)',
  warning: 'var(--accent-yellow)',
  danger: 'var(--accent-red)',
  hot: 'var(--accent-orange)',
  cold: 'var(--accent-blue)',
};

export const getStatusColor = (status: PointStatus) => {
  if (status === 'danger') return COLORS.danger;
  if (status === 'warning') return COLORS.warning;
  return COLORS.normal;
};

export const INITIAL_TEMPLATES: MachineTemplate[] = [
  {
    id: 'tpl_hot_cold', name: '冷热定型机模板', visType: 'four_rings',
    points: [
      { name: '热区上', type: 'temperature', defaultUcl: 130, defaultLcl: 110, defaultBase: 120 },
      { name: '热区下', type: 'temperature', defaultUcl: 130, defaultLcl: 110, defaultBase: 120 },
      { name: '冷区上', type: 'temperature', defaultUcl: 20, defaultLcl: 10, defaultBase: 15 },
      { name: '冷区下', type: 'temperature', defaultUcl: 20, defaultLcl: 10, defaultBase: 15 },
    ]
  },
  {
    id: 'tpl_vulcanizer', name: '加硫机模板', visType: 'single_kpi',
    points: [{ name: '加硫温度', type: 'temperature', defaultUcl: 160, defaultLcl: 140, defaultBase: 150 }]
  },
  {
    id: 'tpl_scribing', name: '划线机模板', visType: 'single_kpi',
    points: [{ name: '系统压力', type: 'pressure', defaultUcl: 7, defaultLcl: 3, defaultBase: 5.2 }]
  },
  {
    id: 'tpl_molding', name: '烘箱模板', visType: 'molding_matrix',
    points: [
      { name: '上层前', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 85 },
      { name: '上层中', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 85 },
      { name: '上层后', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 85 },
      { name: '下层前', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 82 },
      { name: '下层中', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 82 },
      { name: '下层后', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 82 },
    ]
  },
  {
    id: 'tpl_press', name: '万能压机模板', visType: 'dual_side_spark',
    points: [
      { name: '左边束紧', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '左边二次', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '左边押边', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '右边束紧', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '右边二次', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '右边押边', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
    ]
  },
  {
    id: 'tpl_freezer', name: '冷冻机模板', visType: 'single_kpi',
    points: [{ name: '冷冻温度', type: 'temperature', defaultUcl: -10, defaultLcl: -25, defaultBase: -18 }]
  }
];

export const INITIAL_LINES: ProductionLine[] = [
  {
    id: 'line_a',
    name: 'Line A',
    equipments: [
      createEquipmentFromTemplate(INITIAL_TEMPLATES[0], '冷热定型机 01', 'LN1-CR-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[1], '加硫机 01', 'LN1-JL-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[2], '划线机 01', 'LN1-HX-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[3], '烘箱 01', 'LN1-CX-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[4], '万能压机 01', 'LN1-YJ-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[5], '冷冻机 01', 'LN1-LD-01'),
    ]
  },
  {
    id: 'line_b',
    name: 'Line B',
    equipments: [
      createEquipmentFromTemplate(INITIAL_TEMPLATES[0], '冷热定型机 02', 'LN2-CR-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[1], '加硫机 02', 'LN2-JL-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[2], '划线机 02', 'LN2-HX-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[3], '烘箱 02', 'LN2-CX-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[4], '万能压机 02', 'LN2-YJ-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[5], '冷冻机 02', 'LN2-LD-01'),
    ]
  }
];

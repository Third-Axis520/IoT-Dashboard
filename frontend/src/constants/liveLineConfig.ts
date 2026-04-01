import type { ProductionLine } from '../types';
import { SENSOR_CONFIG } from './sensorConfig';

/**
 * 真實感測器產線定義。
 * 使用固定的穩定 ID（不用 generateId()），避免 hot-reload 時 ID 飄移。
 * UCL/LCL 從 SENSOR_CONFIG 引用，確保單一來源。
 * deviceId 留空：由用戶透過 UI 設定 AssetCode 後生效。
 */

export const LIVE_LINE_ID = 'line_live';

const s = SENSOR_CONFIG;

export const LIVE_LINE: ProductionLine = {
  id: LIVE_LINE_ID,
  name: '烤箱生產線',
  equipments: [
    {
      id: 'eq_vul_01',
      deviceId: '',
      templateId: 'tpl_live',
      name: '高速加熱定型機',
      visType: 'single_kpi',
      points: [
        {
          id: 'pt_vul_temp', name: s[1].label, type: 'temperature',
          value: 0, unit: s[1].unit, status: 'offline',
          history: [], ucl: s[1].ucl, lcl: s[1].lcl,
          sensorId: 1,
        },
      ],
    },
    {
      id: 'eq_chem_01',
      deviceId: '',
      templateId: 'tpl_live',
      name: '藥水箱',
      visType: 'dual_side_spark',
      points: [
        {
          id: 'pt_chem_top', name: '藥水箱上', type: 'temperature',
          value: 0, unit: s[2].unit, status: 'offline',
          history: [], ucl: s[2].ucl, lcl: s[2].lcl,
          sensorId: 2,
        },
        {
          id: 'pt_chem_bot', name: '藥水箱下', type: 'temperature',
          value: 0, unit: s[3].unit, status: 'offline',
          history: [], ucl: s[3].ucl, lcl: s[3].lcl,
          sensorId: 3,
        },
      ],
    },
    {
      id: 'eq_glue1_01',
      deviceId: '',
      templateId: 'tpl_live',
      name: '一次膠',
      visType: 'dual_side_spark',
      points: [
        {
          id: 'pt_g1_top', name: '一次膠上', type: 'temperature',
          value: 0, unit: s[4].unit, status: 'offline',
          history: [], ucl: s[4].ucl, lcl: s[4].lcl,
          sensorId: 4,
        },
        {
          id: 'pt_g1_bot', name: '一次膠下', type: 'temperature',
          value: 0, unit: s[5].unit, status: 'offline',
          history: [], ucl: s[5].ucl, lcl: s[5].lcl,
          sensorId: 5,
        },
      ],
    },
    {
      id: 'eq_glue2_01',
      deviceId: '',
      templateId: 'tpl_live',
      name: '二次膠',
      visType: 'dual_side_spark',
      points: [
        {
          id: 'pt_g2_top', name: '二次膠上', type: 'temperature',
          value: 0, unit: s[6].unit, status: 'offline',
          history: [], ucl: s[6].ucl, lcl: s[6].lcl,
          sensorId: 6,
        },
        {
          id: 'pt_g2_bot', name: '二次膠下', type: 'temperature',
          value: 0, unit: s[7].unit, status: 'offline',
          history: [], ucl: s[7].ucl, lcl: s[7].lcl,
          sensorId: 7,
        },
      ],
    },
    {
      id: 'eq_frz_01',
      deviceId: '',
      templateId: 'tpl_live',
      name: '冷凍機',
      visType: 'single_kpi',
      points: [
        {
          id: 'pt_frz_temp', name: s[8].label, type: 'temperature',
          value: 0, unit: s[8].unit, status: 'offline',
          history: [], ucl: s[8].ucl, lcl: s[8].lcl,
          sensorId: 8,
        },
      ],
    },
    {
      id: 'eq_mold_01',
      deviceId: '',
      templateId: 'tpl_live',
      name: '後跟定型',
      visType: 'four_rings',
      points: [
        // four_rings: index 0=左上, 1=右上, 2=左下, 3=右下
        {
          id: 'pt_mh_right', name: s[9].label, type: 'temperature',
          value: 0, unit: s[9].unit, status: 'offline',
          history: [], ucl: s[9].ucl, lcl: s[9].lcl,
          sensorId: 9,
        },
        {
          id: 'pt_mc_right', name: s[10].label, type: 'temperature',
          value: 0, unit: s[10].unit, status: 'offline',
          history: [], ucl: s[10].ucl, lcl: s[10].lcl,
          sensorId: 10,
        },
        {
          id: 'pt_mh_left', name: s[11].label, type: 'temperature',
          value: 0, unit: s[11].unit, status: 'offline',
          history: [], ucl: s[11].ucl, lcl: s[11].lcl,
          sensorId: 11,
        },
        {
          id: 'pt_mc_left', name: s[12].label, type: 'temperature',
          value: 0, unit: s[12].unit, status: 'offline',
          history: [], ucl: s[12].ucl, lcl: s[12].lcl,
          sensorId: 12,
        },
      ],
    },
  ],
};

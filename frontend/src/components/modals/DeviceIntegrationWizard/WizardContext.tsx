import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { DiscoveredPoint } from '../../../lib/apiDiscovery';

// ── State ────────────────────────────────────────────────────────────────────

export interface SensorLabel {
  name: string;
  propertyTypeId: number;
  unit: string;
}

export interface WizardState {
  step: number;
  protocol: string | null;
  config: Record<string, string>;
  connectionName: string;
  discoveryPoints: DiscoveredPoint[];
  selectedPointIndices: Set<number>;
  labels: Map<number, SensorLabel>;
  equipmentName: string;
  visType: string;
  description: string;
  error: string | null;
}

const initialState: WizardState = {
  step: 1,
  protocol: null,
  config: {},
  connectionName: '',
  discoveryPoints: [],
  selectedPointIndices: new Set(),
  labels: new Map(),
  equipmentName: '',
  visType: 'single_kpi',
  description: '',
  error: null,
};

// ── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SELECT_PROTOCOL'; protocol: string }
  | { type: 'UPDATE_CONFIG'; field: string; value: string }
  | { type: 'SET_CONFIG'; config: Record<string, string> }
  | { type: 'SET_CONNECTION_NAME'; name: string }
  | { type: 'SET_DISCOVERY_RESULT'; points: DiscoveredPoint[] }
  | { type: 'TOGGLE_POINT'; index: number }
  | { type: 'SELECT_ALL_POINTS' }
  | { type: 'DESELECT_ALL_POINTS' }
  | { type: 'SET_LABEL'; index: number; label: SensorLabel }
  | { type: 'SET_EQUIPMENT_INFO'; name: string; visType: string; description: string }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };

export function wizardReducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'SELECT_PROTOCOL':
      return { ...state, protocol: action.protocol, error: null };

    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, [action.field]: action.value } };

    case 'SET_CONFIG':
      return { ...state, config: action.config };

    case 'SET_CONNECTION_NAME':
      return { ...state, connectionName: action.name };

    case 'SET_DISCOVERY_RESULT':
      return { ...state, discoveryPoints: action.points, error: null };

    case 'TOGGLE_POINT': {
      const next = new Set(state.selectedPointIndices);
      if (next.has(action.index)) next.delete(action.index);
      else next.add(action.index);
      return { ...state, selectedPointIndices: next };
    }

    case 'SELECT_ALL_POINTS':
      return {
        ...state,
        selectedPointIndices: new Set(state.discoveryPoints.map((_, i) => i)),
      };

    case 'DESELECT_ALL_POINTS':
      return { ...state, selectedPointIndices: new Set() };

    case 'SET_LABEL': {
      const next = new Map(state.labels);
      next.set(action.index, action.label);
      return { ...state, labels: next };
    }

    case 'SET_EQUIPMENT_INFO':
      return {
        ...state,
        equipmentName: action.name,
        visType: action.visType,
        description: action.description,
      };

    case 'NEXT_STEP': {
      // Validation
      if (state.step === 1 && !state.protocol)
        return { ...state, error: '請選擇通訊協議' };
      if (state.step === 2 && !state.connectionName.trim())
        return { ...state, error: '請輸入連線名稱' };
      if (state.step === 4 && state.selectedPointIndices.size === 0)
        return { ...state, error: '請至少選擇一個資料點' };
      if (state.step === 6 && !state.equipmentName.trim())
        return { ...state, error: '請輸入設備類型名稱' };
      return { ...state, step: Math.min(state.step + 1, 7), error: null };
    }

    case 'PREV_STEP':
      return { ...state, step: Math.max(state.step - 1, 1), error: null };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
}

const WizardCtx = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  return <WizardCtx.Provider value={{ state, dispatch }}>{children}</WizardCtx.Provider>;
}

export function useWizard() {
  const ctx = useContext(WizardCtx);
  if (!ctx) throw new Error('useWizard must be inside WizardProvider');
  return ctx;
}

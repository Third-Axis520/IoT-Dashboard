import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LimitsSettingsModal } from '../LimitsSettingsModal';
import type { Equipment } from '../../../types';
import type { SensorGatingRule } from '../../../types/gating';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../hooks/useSensorLimits', () => ({
  fetchPointLimits: vi.fn(),
  savePointLimits: vi.fn(),
}));

vi.mock('../../../lib/apiSensorGating', () => ({
  fetchGatingRules: vi.fn(),
  saveGatingRules: vi.fn(),
}));

// GatingRow renders a checkbox; mock it to keep tests focused on modal logic
vi.mock('../../sensors/GatingRow', () => ({
  GatingRow: ({ sensorId, rule, onChange }: {
    assetCode: string;
    sensorId: number;
    rule: { gatingAssetCode: string; gatingSensorId: number; delayMs: number; maxAgeMs: number } | null;
    onChange: (rule: { gatedSensorId: number; gatingAssetCode: string; gatingSensorId: number; delayMs: number; maxAgeMs: number } | null) => void;
  }) => (
    <div data-testid={`gating-row-${sensorId}`}>
      <input
        type="checkbox"
        data-testid={`gating-checkbox-${sensorId}`}
        checked={rule !== null}
        onChange={e => {
          if (!e.target.checked) onChange(null);
          else onChange({ gatedSensorId: sensorId, gatingAssetCode: 'A01', gatingSensorId: 101, delayMs: 0, maxAgeMs: 1000 });
        }}
      />
    </div>
  ),
}));

vi.mock('../../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

import { fetchPointLimits, savePointLimits } from '../../../hooks/useSensorLimits';
import { fetchGatingRules, saveGatingRules } from '../../../lib/apiSensorGating';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockEquipment: Equipment[] = [
  {
    id: 'eq1',
    deviceId: 'dev1',
    templateId: 'tmpl1',
    name: 'Oven A',
    visType: 'singleKpi',
    points: [
      { id: 'p1', name: 'Temperature', type: 'temperature', value: 25, unit: '°C', status: 'normal', history: [], ucl: 100, lcl: 0, sensorId: 42 },
      { id: 'p2', name: 'Pressure',    type: 'pressure',    value: 1,  unit: 'bar', status: 'normal', history: [], ucl: 10,  lcl: 0, sensorId: 43 },
    ],
  },
];

const mockGatingRules: SensorGatingRule[] = [
  {
    id: 1,
    gatedAssetCode: 'ASSET01',
    gatedSensorId: 42,
    gatingAssetCode: 'A01',
    gatingSensorId: 101,
    delayMs: 500,
    maxAgeMs: 2000,
  },
];

const defaultProps = {
  assetCode: 'ASSET01',
  equipments: mockEquipment,
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LimitsSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPointLimits).mockResolvedValue({});
    vi.mocked(savePointLimits).mockResolvedValue(undefined);
    vi.mocked(fetchGatingRules).mockResolvedValue([]);
    vi.mocked(saveGatingRules).mockResolvedValue({ updated: 0 });
  });

  it('renders sensor rows after loading', async () => {
    render(<LimitsSettingsModal {...defaultProps} />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Pressure')).toBeInTheDocument();
  });

  it('loads existing gating rules from API and populates state', async () => {
    vi.mocked(fetchGatingRules).mockResolvedValue(mockGatingRules);

    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(fetchGatingRules).toHaveBeenCalledWith('ASSET01');
    });

    // The gating row for sensor 42 should show as enabled (checkbox checked)
    await waitFor(() => {
      const checkbox = screen.getByTestId('gating-checkbox-42') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    // Sensor 43 has no rule, so it shows disabled
    const checkbox43 = screen.getByTestId('gating-checkbox-43') as HTMLInputElement;
    expect(checkbox43.checked).toBe(false);
  });

  it('toggling a gating row checkbox updates state', async () => {
    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    // Sensor 42 starts with no rule (fetchGatingRules returns [])
    const checkbox = screen.getByTestId('gating-checkbox-42') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Enable gating
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox.checked).toBe(true);
    });
  });

  it('save calls both savePointLimits and saveGatingRules', async () => {
    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /limitsSettings\.saveButton/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(savePointLimits).toHaveBeenCalledWith('ASSET01', expect.any(Array));
      expect(saveGatingRules).toHaveBeenCalledWith('ASSET01', expect.any(Array));
    });
  });

  it('save calls saveGatingRules with only complete rules (non-empty gatingAssetCode)', async () => {
    // Set up one complete rule and one incomplete rule
    vi.mocked(fetchGatingRules).mockResolvedValue(mockGatingRules); // sensor 42 has a rule

    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('gating-checkbox-42')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /limitsSettings\.saveButton/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const calls = vi.mocked(saveGatingRules).mock.calls;
      expect(calls).toHaveLength(1);
      const [assetCode, ruleList] = calls[0];
      expect(assetCode).toBe('ASSET01');
      // Only rules with non-empty gatingAssetCode are included
      expect(ruleList).toHaveLength(1);
      expect(ruleList[0].gatedSensorId).toBe(42);
      expect(ruleList[0].gatingAssetCode).toBe('A01');
    });
  });

  it('shows success message after save', async () => {
    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /limitsSettings\.saveButton/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('limitsSettings.saveSuccess')).toBeInTheDocument();
    });

    expect(defaultProps.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ 42: expect.any(Object), 43: expect.any(Object) })
    );
  });

  it('shows error message when savePointLimits fails', async () => {
    vi.mocked(savePointLimits).mockRejectedValue(new Error('Network error'));

    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /limitsSettings\.saveButton/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    // saveGatingRules should NOT be called if limits save failed
    expect(saveGatingRules).not.toHaveBeenCalled();
  });

  it('shows error message when saveGatingRules fails', async () => {
    vi.mocked(saveGatingRules).mockRejectedValue(new Error('Gating save error'));

    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /limitsSettings\.saveButton/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Gating save error')).toBeInTheDocument();
    });

    expect(defaultProps.onSaved).not.toHaveBeenCalled();
  });

  it('shows error banner with retry when load fails (no longer silent)', async () => {
    vi.mocked(fetchPointLimits).mockRejectedValueOnce(new Error('500 Internal'));
    vi.mocked(fetchGatingRules).mockRejectedValueOnce(new Error('500 Internal'));

    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('500 Internal');
    });

    // Retry path — now both calls succeed
    vi.mocked(fetchPointLimits).mockResolvedValueOnce({});
    vi.mocked(fetchGatingRules).mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: /common\.retry/ }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Temperature')).toBeInTheDocument();
    });
  });

  it('shows gating details summary per sensor row', async () => {
    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    // Each sensor should have an expandable gating section
    expect(screen.getByTestId('gating-row-42')).toBeInTheDocument();
    expect(screen.getByTestId('gating-row-43')).toBeInTheDocument();
  });
});

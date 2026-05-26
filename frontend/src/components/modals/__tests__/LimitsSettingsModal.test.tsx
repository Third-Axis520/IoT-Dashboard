import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LimitsSettingsModal } from '../LimitsSettingsModal';
import type { Equipment } from '../../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../hooks/useSensorLimits', () => ({
  fetchPointLimits: vi.fn(),
  savePointLimits: vi.fn(),
}));

vi.mock('../../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

import { fetchPointLimits, savePointLimits } from '../../../hooks/useSensorLimits';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockEquipment: Equipment[] = [
  {
    id: 'eq1',
    deviceId: 'ASSET01',
    templateId: 'tmpl1',
    name: 'Oven A',
    visType: 'singleKpi',
    points: [
      { id: 'p1', name: 'Temperature', type: 'temperature', value: 25, unit: '°C', status: 'normal', history: [], ucl: 100, lcl: 0, sensorId: 42 },
      { id: 'p2', name: 'Pressure',    type: 'pressure',    value: 1,  unit: 'bar', status: 'normal', history: [], ucl: 10,  lcl: 0, sensorId: 43 },
    ],
  },
];

const defaultProps = {
  scopeLabel: 'Test Line',
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
  });

  it('renders sensor rows after loading', async () => {
    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Pressure')).toBeInTheDocument();
  });

  it('save calls savePointLimits with correct data', async () => {
    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('limitsSettings.loading')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /limitsSettings\.saveButton/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(savePointLimits).toHaveBeenCalledWith('ASSET01', expect.any(Array));
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

    expect(defaultProps.onSaved).not.toHaveBeenCalled();
  });

  it('does not re-fetch when parent re-renders with a new equipments array (same content)', async () => {
    // Regression: SSE pushes a sensor reading every poll tick → parent's
    // boundEquipments useMemo produces a new array reference → caused
    // loadAll to re-fire and stomp the user's in-flight edits.
    const { rerender } = render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(fetchPointLimits).toHaveBeenCalledTimes(1);
    });

    // Simulate parent re-render with structurally identical but new-reference array
    const cloned: Equipment[] = mockEquipment.map(eq => ({
      ...eq,
      points: eq.points.map(p => ({ ...p })),
    }));
    rerender(<LimitsSettingsModal {...defaultProps} equipments={cloned} />);

    // Give any stale effect a chance to fire
    await new Promise(r => setTimeout(r, 50));

    // No additional fetch should have happened — assetCode didn't change
    expect(fetchPointLimits).toHaveBeenCalledTimes(1);
  });

  it('shows error banner with retry when load fails', async () => {
    vi.mocked(fetchPointLimits).mockRejectedValueOnce(new Error('500 Internal'));

    render(<LimitsSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('500 Internal');
    });

    // Retry path — now call succeeds
    vi.mocked(fetchPointLimits).mockResolvedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: /common\.retry/ }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Temperature')).toBeInTheDocument();
    });
  });
});

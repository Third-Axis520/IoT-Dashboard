import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SensorManagementSection, { type SensorRow } from '../SensorManagementSection';

// Isolated unit tests for SensorManagementSection. Covers the in-section
// label-edit, remove (with confirm), and scan-and-add gate that the
// integration tests through EditDeviceConnectionModal couldn't reach
// reliably (vitest+jsdom timing of nested mocks).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('../../../lib/apiDiscovery', () => ({
  scanDiscovery: vi.fn(),
}));

vi.mock('../../../lib/apiPropertyTypes', () => ({
  fetchPropertyTypes: vi.fn().mockResolvedValue([]),
}));

function fixtureSensors(): SensorRow[] {
  return [
    { sensorId: 1001, pointId: 'p1', rawAddress: '40001', label: 'Temp', unit: '°C', propertyTypeId: 1, sortOrder: 0 },
    { sensorId: 1002, pointId: 'p2', rawAddress: '40002', label: 'Humid', unit: '%', propertyTypeId: 2, sortOrder: 1 },
  ];
}

function renderSection(overrides: Partial<{
  sensors: SensorRow[];
  onChange: (next: SensorRow[]) => void;
  onAdd: (drafts: unknown) => void;
  defaultOpen: boolean;
  loading: boolean;
  loadError: string | null;
}> = {}) {
  const onChange = overrides.onChange ?? vi.fn();
  const onAdd = overrides.onAdd ?? vi.fn();
  render(
    <SensorManagementSection
      sensors={overrides.sensors ?? fixtureSensors()}
      onChange={onChange}
      onAdd={onAdd}
      protocol="modbus_tcp"
      configJson="{}"
      loading={overrides.loading ?? false}
      loadError={overrides.loadError ?? null}
      defaultOpen={overrides.defaultOpen ?? true}
    />,
  );
  return { onChange, onAdd };
}

describe('SensorManagementSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists existing sensors when expanded', () => {
    renderSection();
    expect(screen.getByDisplayValue('Temp')).toBeDefined();
    expect(screen.getByDisplayValue('Humid')).toBeDefined();
  });

  it('shows the empty-state hint when there are no sensors', () => {
    renderSection({ sensors: [] });
    expect(screen.queryByText(/noSensors/)).not.toBeNull();
  });

  it('shows the loading indicator when loading is true', () => {
    renderSection({ sensors: [], loading: true });
    expect(screen.queryByText(/common\.loading/)).not.toBeNull();
  });

  it('shows the load-error message when loadError is set', () => {
    renderSection({ sensors: [], loadError: 'fetch failed' });
    expect(screen.queryByText('fetch failed')).not.toBeNull();
  });

  it('editing a label emits onChange with the updated row', () => {
    const onChange = vi.fn();
    renderSection({ onChange });
    fireEvent.change(screen.getByDisplayValue('Temp'), { target: { value: 'Temp renamed' } });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ sensorId: 1001, label: 'Temp renamed' }),
      expect.objectContaining({ sensorId: 1002, label: 'Humid' }),
    ]);
  });

  it('clicking remove with window.confirm=true emits onChange without the row', () => {
    const onChange = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSection({ onChange });
    fireEvent.click(screen.getByRole('button', { name: /remove sensor 1001/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ sensorId: 1002, label: 'Humid' }),
    ]);
    confirmSpy.mockRestore();
  });

  it('clicking remove with window.confirm=false keeps the row', () => {
    const onChange = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderSection({ onChange });
    fireEvent.click(screen.getByRole('button', { name: /remove sensor 1001/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('clicking "+ Scan & Add" reveals the SensorAddPanel cancel button', async () => {
    renderSection();
    // Outer "+" button is the section's add-affordance; the panel's cancel
    // button shows up only after the section toggles `adding=true`.
    fireEvent.click(screen.getByText(/scanAndAddButton/));
    await screen.findByText(/cancelAddButton/);
  });

  it('section can be collapsed and re-expanded', () => {
    renderSection({ defaultOpen: false });
    // Collapsed: no input visible
    expect(screen.queryByDisplayValue('Temp')).toBeNull();
    // Expand
    fireEvent.click(screen.getByText(/sectionTitle/));
    expect(screen.getByDisplayValue('Temp')).toBeDefined();
  });
});

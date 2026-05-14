import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SensorAddPanel from '../SensorAddPanel';

// Isolated unit tests for SensorAddPanel. The integration tests through
// EditDeviceConnectionModal hit a vitest+jsdom microtask timing snag and stay
// skipped; this file exercises the same flow directly against the panel and
// gives us coverage of the scan / filter / pick / apply behaviour.

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
  fetchPropertyTypes: vi.fn(),
}));

import { scanDiscovery } from '../../../lib/apiDiscovery';
import { fetchPropertyTypes } from '../../../lib/apiPropertyTypes';

describe('SensorAddPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPropertyTypes).mockResolvedValue([
      { id: 1, key: 'temperature', name: 'Temperature', icon: '🌡', defaultUnit: '°C', defaultUcl: 100, defaultLcl: 0, behavior: 'normal', isBuiltIn: true, sortOrder: 0, createdAt: '2026-01-01' },
      { id: 2, key: 'humidity', name: 'Humidity', icon: '💧', defaultUnit: '%', defaultUcl: 100, defaultLcl: 0, behavior: 'normal', isBuiltIn: true, sortOrder: 1, createdAt: '2026-01-01' },
    ] as never);
    vi.mocked(scanDiscovery).mockResolvedValue({
      success: true,
      points: [
        { rawAddress: '40003', currentValue: 25.5, dataType: 'int16', suggestedLabel: 'NewTemp' },
        { rawAddress: '40001', currentValue: 10, dataType: 'int16', suggestedLabel: 'Existing' },
      ],
      error: null,
    } as never);
  });

  function renderPanel(overrides: Partial<{
    existingRawAddresses: Set<string>;
    onAdd: (drafts: unknown) => void;
    onCancel: () => void;
  }> = {}) {
    const onAdd = overrides.onAdd ?? vi.fn();
    const onCancel = overrides.onCancel ?? vi.fn();
    render(
      <SensorAddPanel
        protocol="modbus_tcp"
        configJson="{}"
        existingRawAddresses={overrides.existingRawAddresses ?? new Set()}
        onAdd={onAdd}
        onCancel={onCancel}
      />,
    );
    return { onAdd, onCancel };
  }

  it('renders the scan button in idle state', () => {
    renderPanel();
    expect(screen.getAllByText(/scanAndAddButton/).length).toBeGreaterThan(0);
  });

  it('clicking scan triggers scanDiscovery and shows candidates', async () => {
    renderPanel({ existingRawAddresses: new Set() });
    fireEvent.click(screen.getAllByText(/scanAndAddButton/)[0]);
    await waitFor(() => expect(scanDiscovery).toHaveBeenCalled());
    await screen.findByLabelText('select 40003');
    expect(screen.queryByLabelText('select 40001')).not.toBeNull();
  });

  it('filters candidates against existingRawAddresses', async () => {
    renderPanel({ existingRawAddresses: new Set(['40001']) });
    fireEvent.click(screen.getAllByText(/scanAndAddButton/)[0]);
    await screen.findByLabelText('select 40003');
    expect(screen.queryByLabelText('select 40001')).toBeNull();
  });

  it('shows "no new points" when every candidate is already bound', async () => {
    renderPanel({ existingRawAddresses: new Set(['40001', '40003']) });
    fireEvent.click(screen.getAllByText(/scanAndAddButton/)[0]);
    await screen.findByText(/noNewPoints/);
    expect(screen.queryByLabelText('select 40003')).toBeNull();
  });

  it('selecting a candidate reveals label and propertyType inputs', async () => {
    renderPanel({ existingRawAddresses: new Set() });
    fireEvent.click(screen.getAllByText(/scanAndAddButton/)[0]);
    const checkbox = await screen.findByLabelText('select 40003');
    await waitFor(() => expect(fetchPropertyTypes).toHaveBeenCalled());
    fireEvent.click(checkbox);
    await screen.findByLabelText('label 40003');
    expect(screen.queryByLabelText('property type 40003')).not.toBeNull();
  });

  it('apply emits the draft list to onAdd with default propertyType', async () => {
    const onAdd = vi.fn();
    renderPanel({ existingRawAddresses: new Set(), onAdd });
    fireEvent.click(screen.getAllByText(/scanAndAddButton/)[0]);
    const checkbox = await screen.findByLabelText('select 40003');
    await waitFor(() => expect(fetchPropertyTypes).toHaveBeenCalled());
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText(/applyAddButton/));
    expect(onAdd).toHaveBeenCalledWith([
      expect.objectContaining({
        rawAddress: '40003',
        label: 'NewTemp',
        propertyTypeId: 1,  // first propertyType in the mock list
      }),
    ]);
  });

  it('cancel button calls onCancel without emitting onAdd', async () => {
    const onAdd = vi.fn();
    const onCancel = vi.fn();
    renderPanel({ onAdd, onCancel });
    fireEvent.click(screen.getByText(/cancelAddButton/));
    expect(onCancel).toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('scan failure shows error and does not list candidates', async () => {
    vi.mocked(scanDiscovery).mockResolvedValue({
      success: false,
      points: null,
      error: 'connection refused',
    } as never);
    renderPanel();
    fireEvent.click(screen.getAllByText(/scanAndAddButton/)[0]);
    await screen.findByText(/connection refused/);
    expect(screen.queryByLabelText('select 40003')).toBeNull();
  });
});

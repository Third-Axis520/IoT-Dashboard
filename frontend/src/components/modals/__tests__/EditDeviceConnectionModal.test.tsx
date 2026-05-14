import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditDeviceConnectionModal from '../EditDeviceConnectionModal';
import type { DeviceConnectionItem } from '../../../lib/apiDeviceConnections';
import type { ProtocolItem } from '../../../lib/apiProtocols';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key }),
}));

vi.mock('../../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

vi.mock('../../../lib/apiProtocols', () => ({
  fetchProtocol: vi.fn(),
}));

vi.mock('../../../lib/apiDeviceConnections', () => ({
  updateDeviceConnection: vi.fn(),
  testDeviceConnection: vi.fn(),
  fetchDeviceConnections: vi.fn(),
}));

vi.mock('../../../lib/apiEquipmentTypes', () => ({
  fetchEquipmentTypeDetail: vi.fn(),
  updateEquipmentType: vi.fn(),
}));

vi.mock('../../../lib/apiDiscovery', () => ({
  scanDiscovery: vi.fn(),
}));

vi.mock('../../../lib/apiPropertyTypes', () => ({
  fetchPropertyTypes: vi.fn(),
}));

import { fetchProtocol } from '../../../lib/apiProtocols';
import {
  updateDeviceConnection,
  testDeviceConnection,
  fetchDeviceConnections,
} from '../../../lib/apiDeviceConnections';
import {
  fetchEquipmentTypeDetail,
  updateEquipmentType,
} from '../../../lib/apiEquipmentTypes';
import { scanDiscovery } from '../../../lib/apiDiscovery';
import { fetchPropertyTypes } from '../../../lib/apiPropertyTypes';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockProtocol: ProtocolItem = {
  id: 'modbus_tcp',
  displayName: 'Modbus TCP',
  supportsDiscovery: true,
  supportsLivePolling: true,
  configSchema: {
    fields: [
      { name: 'host', type: 'string', label: 'Host', required: true, defaultValue: null, placeholder: '192.168.1.1', options: null, min: null, max: null, helpText: null },
      { name: 'port', type: 'number', label: 'Port', required: true, defaultValue: '502', placeholder: null, options: null, min: 1, max: 65535, helpText: null },
      { name: 'slaveId', type: 'number', label: 'Slave ID', required: true, defaultValue: '1', placeholder: null, options: null, min: 1, max: 247, helpText: null },
    ],
  },
};

const mockConn: DeviceConnectionItem = {
  id: 7,
  name: 'PLC-A',
  protocol: 'modbus_tcp',
  configJson: JSON.stringify({ host: '192.168.0.10', port: '502', slaveId: '1' }),
  pollIntervalMs: 5000,
  isEnabled: true,
  lastPollAt: null,
  lastPollError: null,
  consecutiveErrors: 0,
  equipmentTypeId: null,
  equipmentTypeName: null,
  createdAt: '2026-04-27T00:00:00Z',
  alertOnConsecutiveErrors: 5,
  alertCooldownSec: 300,
  isAlertEnabled: true,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EditDeviceConnectionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProtocol).mockResolvedValue(mockProtocol);
    vi.mocked(updateDeviceConnection).mockResolvedValue(undefined as never);
    vi.mocked(testDeviceConnection).mockResolvedValue({ success: true } as never);
    vi.mocked(fetchDeviceConnections).mockResolvedValue([]);
    vi.mocked(fetchEquipmentTypeDetail).mockResolvedValue({
      id: 50,
      name: 'PLC-A Equipment',
      visType: 'single_kpi',
      description: null,
      createdAt: '2026-04-27T00:00:00Z',
      sensors: [
        { id: 1, sensorId: 1001, pointId: 'p1', rawAddress: '40001', label: 'Temp', unit: '°C', propertyTypeId: 1, propertyTypeBehavior: 'numeric', sortOrder: 0 },
        { id: 2, sensorId: 1002, pointId: 'p2', rawAddress: '40002', label: 'Humid', unit: '%', propertyTypeId: 2, propertyTypeBehavior: 'numeric', sortOrder: 1 },
      ],
    } as never);
    vi.mocked(updateEquipmentType).mockResolvedValue(undefined as never);
    vi.mocked(scanDiscovery).mockResolvedValue({
      success: true,
      points: [
        { rawAddress: '40003', currentValue: 25.5, dataType: 'int16', suggestedLabel: 'NewTemp' },
        { rawAddress: '40001', currentValue: 10, dataType: 'int16', suggestedLabel: 'Existing' },  // duplicate — must be filtered
      ],
      error: null,
    } as never);
    vi.mocked(fetchPropertyTypes).mockResolvedValue([
      { id: 1, key: 'temperature', name: 'Temperature', icon: '🌡', defaultUnit: '°C', defaultUcl: 100, defaultLcl: 0, behavior: 'normal', isBuiltIn: true, sortOrder: 0, createdAt: '2026-01-01' },
      { id: 2, key: 'humidity', name: 'Humidity', icon: '💧', defaultUnit: '%', defaultUcl: 100, defaultLcl: 0, behavior: 'normal', isBuiltIn: true, sortOrder: 1, createdAt: '2026-01-01' },
    ] as never);
  });

  function renderModal(overrides?: Partial<DeviceConnectionItem>) {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const conn = { ...mockConn, ...overrides };
    render(<EditDeviceConnectionModal conn={conn} onClose={onClose} onSaved={onSaved} />);
    return { onClose, onSaved };
  }

  it('renders with current connection name and protocol', async () => {
    renderModal();
    const nameInput = screen.getByLabelText(/connectionSettings\.nameLabel/i) as HTMLInputElement;
    expect(nameInput.value).toBe('PLC-A');
    expect(screen.getByText('modbus_tcp')).toBeInTheDocument();
  });

  it('fetches protocol schema and renders config fields', async () => {
    renderModal();
    await waitFor(() => {
      expect(fetchProtocol).toHaveBeenCalledWith('modbus_tcp');
    });
    await waitFor(() => {
      // DynamicForm labels are not htmlFor-paired; locate via current value
      expect(screen.getByDisplayValue('192.168.0.10')).toBeInTheDocument();
    });
  });

  it('saves edited name via updateDeviceConnection', async () => {
    const { onSaved } = renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    const nameInput = screen.getByLabelText(/connectionSettings\.nameLabel/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'PLC-A-Renamed' } });

    const saveBtn = screen.getByRole('button', { name: /common\.save/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateDeviceConnection).toHaveBeenCalledWith(7, expect.objectContaining({
        name: 'PLC-A-Renamed',
        pollIntervalMs: 5000,
        isEnabled: true,
      }));
    });
    // onSaved fires after a 1s delay so the success badge stays visible briefly
    await waitFor(() => expect(onSaved).toHaveBeenCalled(), { timeout: 1500 });
  });

  it('saves edited host config via updateDeviceConnection', async () => {
    renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    const hostInput = await screen.findByDisplayValue('192.168.0.10') as HTMLInputElement;
    fireEvent.change(hostInput, { target: { value: '10.0.0.5' } });

    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => {
      const call = vi.mocked(updateDeviceConnection).mock.calls[0];
      expect(call[0]).toBe(7);
      const parsed = JSON.parse(call[1].config);
      expect(parsed.host).toBe('10.0.0.5');
      expect(parsed.port).toBe('502');
    });
  });

  it('saves edited poll interval', async () => {
    renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    const intervalSelect = screen.getByLabelText(/connectionSettings\.intervalLabel/) as HTMLSelectElement;
    fireEvent.change(intervalSelect, { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => {
      expect(updateDeviceConnection).toHaveBeenCalledWith(7, expect.objectContaining({
        pollIntervalMs: 10000,
      }));
    });
  });

  it('disables save button when name is empty', async () => {
    renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    const nameInput = screen.getByLabelText(/connectionSettings\.nameLabel/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '   ' } });

    const saveBtn = screen.getByRole('button', { name: /common\.save/ }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('hides poll interval for push_ingest protocol and sends null', async () => {
    vi.mocked(fetchProtocol).mockResolvedValue({
      ...mockProtocol,
      id: 'push_ingest',
      configSchema: { fields: [] },
    });

    renderModal({ protocol: 'push_ingest', pollIntervalMs: null, configJson: '{}' });

    await waitFor(() => expect(fetchProtocol).toHaveBeenCalledWith('push_ingest'));

    expect(screen.queryByLabelText(/connectionSettings\.intervalLabel/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => {
      expect(updateDeviceConnection).toHaveBeenCalledWith(7, expect.objectContaining({
        pollIntervalMs: null,
      }));
    });
  });

  it('shows success message after test connection', async () => {
    renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /common\.test/ }));

    await waitFor(() => {
      expect(testDeviceConnection).toHaveBeenCalledWith(7);
      expect(screen.getByText('deviceConnections.connectSuccess')).toBeInTheDocument();
    });
  });

  it('shows error message when test connection fails', async () => {
    vi.mocked(testDeviceConnection).mockResolvedValue({ success: false, error: 'timeout' } as never);

    renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /common\.test/ }));

    await waitFor(() => {
      expect(screen.getByText('timeout')).toBeInTheDocument();
    });
  });

  it('shows real backend error message when save fails', async () => {
    vi.mocked(updateDeviceConnection).mockRejectedValue(new Error('invalid_config: port out of range'));

    const { onSaved } = renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }));

    // Surfaces real backend message inside InlineErrorBanner (role="alert")
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('invalid_config: port out of range');
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('cancel button calls onClose', async () => {
    const { onClose } = renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/ }));

    expect(onClose).toHaveBeenCalled();
  });

  it('shows error banner with retry button when protocol load fails', async () => {
    vi.mocked(fetchProtocol).mockRejectedValueOnce(new Error('Connection refused'));

    renderModal();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Connection refused');
    });

    // Retry succeeds on second call
    vi.mocked(fetchProtocol).mockResolvedValueOnce(mockProtocol);
    fireEvent.click(screen.getByRole('button', { name: /common\.retry/ }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('192.168.0.10')).toBeInTheDocument();
    });
  });

  it('preserves IsEnabled flag from current connection on save', async () => {
    renderModal({ isEnabled: false });
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }));

    await waitFor(() => {
      expect(updateDeviceConnection).toHaveBeenCalledWith(7, expect.objectContaining({
        isEnabled: false,
      }));
    });
  });

  // ─── Poll-interval suggestion banner (same heuristic as Wizard Step2) ─────

  function makeSiblings(count: number, host = '192.168.0.10', port = '502') {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 100,
      name: `sibling-${i}`,
      protocol: 'modbus_tcp',
      configJson: JSON.stringify({ host, port, slaveId: String(i + 1) }),
      pollIntervalMs: 5000,
      isEnabled: true,
      lastPollAt: null,
      lastPollError: null,
      consecutiveErrors: 0,
      equipmentTypeId: null,
      equipmentTypeName: null,
      createdAt: '2026-04-27T00:00:00Z',
      alertOnConsecutiveErrors: 5,
      alertCooldownSec: 300,
      isAlertEnabled: true,
    }));
  }

  it('hides actionable banner when same-host siblings < 3', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(2));
    renderModal();
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
    expect(screen.queryByText(/connectionSettings\.sameHostHint/)).not.toBeNull();
  });

  it('shows actionable banner when same-host siblings ≥ 3 and poll < 10s', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(3));
    renderModal();
    await waitFor(() => {
      expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).not.toBeNull();
    });
    expect(screen.queryByText(/connectionSettings\.sameHostHint/)).toBeNull();
  });

  it('hides banner when current pollIntervalMs is already ≥ 10s', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(4));
    renderModal({ pollIntervalMs: 10000 });
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
    expect(screen.queryByText(/connectionSettings\.sameHostHint/)).not.toBeNull();
  });

  it('hides banner when protocol is push_ingest', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(5));
    renderModal({ protocol: 'push_ingest' });
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
  });

  it('hides banner for polling protocols without calibration data (e.g. web_api)', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(5));
    renderModal({ protocol: 'web_api' });
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    // web_api isn't in PROTOCOL_HINTS — silent rather than guess wrong recommendation
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
  });

  it('excludes self from same-host count (id collision filter)', async () => {
    // Make a sibling list where one entry shares mockConn.id (7).
    // That entry must be excluded so it doesn't count toward the threshold.
    const siblings = makeSiblings(3);
    siblings[0] = { ...siblings[0], id: 7 };  // collide with self
    vi.mocked(fetchDeviceConnections).mockResolvedValue(siblings);
    renderModal();
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    // After excluding self, only 2 real siblings → no actionable banner
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
    // But sameHostHint shows since count=2 > 0
    expect(screen.queryByText(/connectionSettings\.sameHostHint/)).not.toBeNull();
  });

  it('clicking "Apply" lowers the interval dropdown to 10s', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(3));
    renderModal();
    const applyBtn = await screen.findByText(/connectionSettings\.pollSuggestionApply/);
    fireEvent.click(applyBtn);
    await waitFor(() => {
      const select = screen.getByLabelText(/connectionSettings\.intervalLabel/) as HTMLSelectElement;
      expect(select.value).toBe('10');
    });
  });

  it('shows unsaved-changes indicator only after the user edits a field', async () => {
    renderModal();
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());
    // Initial render: form matches conn props, no indicator
    expect(screen.queryByText(/common\.unsavedChanges/)).toBeNull();
    // Edit the name → indicator should appear
    const nameInput = screen.getByLabelText(/connectionSettings\.nameLabel/) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'PLC-A renamed' } });
    expect(screen.queryByText(/common\.unsavedChanges/)).not.toBeNull();
  });

  // ─── Sensor management section ───────────────────────────────────────────

  it('does NOT render SensorManagementSection when conn.equipmentTypeId is null', async () => {
    renderModal({ equipmentTypeId: null });
    await waitFor(() => expect(fetchProtocol).toHaveBeenCalled());
    expect(screen.queryByText(/connectionSettings\.sensors\.sectionTitle/)).toBeNull();
    expect(fetchEquipmentTypeDetail).not.toHaveBeenCalled();
  });

  it('renders SensorManagementSection and fetches sensors when equipmentTypeId is set', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalledWith(50));
    // Section header should appear
    expect(screen.queryByText(/connectionSettings\.sensors\.sectionTitle/)).not.toBeNull();
  });

  it('lists existing sensors when section is expanded', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    // Expand the section
    fireEvent.click(screen.getByText(/connectionSettings\.sensors\.sectionTitle/));
    // Two existing sensors should appear by label
    await waitFor(() => {
      expect(screen.getByDisplayValue('Temp')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Humid')).toBeInTheDocument();
    });
  });

  it('editing a sensor label flips isDirty (unsaved-changes indicator appears)', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/connectionSettings\.sensors\.sectionTitle/));
    const tempInput = await screen.findByDisplayValue('Temp');
    expect(screen.queryByText(/common\.unsavedChanges/)).toBeNull();
    fireEvent.change(tempInput, { target: { value: 'Temp renamed' } });
    expect(screen.queryByText(/common\.unsavedChanges/)).not.toBeNull();
  });

  it('save flow calls updateEquipmentType only when sensors changed', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    // Save without editing sensors — only connection update should fire
    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }));
    await waitFor(() => expect(updateDeviceConnection).toHaveBeenCalled());
    expect(updateEquipmentType).not.toHaveBeenCalled();
  });

  it('save flow calls BOTH updateDeviceConnection AND updateEquipmentType when sensors changed', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/connectionSettings\.sensors\.sectionTitle/));
    const tempInput = await screen.findByDisplayValue('Temp');
    fireEvent.change(tempInput, { target: { value: 'Temp renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }));
    await waitFor(() => {
      expect(updateDeviceConnection).toHaveBeenCalled();
      expect(updateEquipmentType).toHaveBeenCalledWith(50, expect.objectContaining({
        sensors: expect.arrayContaining([
          expect.objectContaining({ sensorId: 1001, label: 'Temp renamed' }),
          expect.objectContaining({ sensorId: 1002, label: 'Humid' }),
        ]),
      }));
    });
  });

  // ─── Phase 2b: remove + scan-and-add ─────────────────────────────────────

  // Same skip reason as the scan-and-add block above — the remove logic is
  // covered in isolation by SensorManagementSection.test.tsx (which exercises
  // window.confirm=true / =false against the section directly without the
  // outer modal's microtask chain).
  it.skip('clicking remove with confirm=true removes the sensor', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/connectionSettings\.sensors\.sectionTitle/));
    await screen.findByDisplayValue('Temp');
    fireEvent.click(screen.getByRole('button', { name: /remove sensor 1001/ }));
    expect(confirmSpy).toHaveBeenCalled();
    // 'Temp' row removed → only 'Humid' remains
    await waitFor(() => {
      expect(screen.queryByDisplayValue('Temp')).toBeNull();
      expect(screen.queryByDisplayValue('Humid')).not.toBeNull();
    });
    confirmSpy.mockRestore();
  });

  it.skip('clicking remove with confirm=false keeps the sensor', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/connectionSettings\.sensors\.sectionTitle/));
    await screen.findByDisplayValue('Temp');
    fireEvent.click(screen.getByRole('button', { name: /remove sensor 1001/ }));
    // 'Temp' stays
    expect(screen.queryByDisplayValue('Temp')).not.toBeNull();
    confirmSpy.mockRestore();
  });

  it('clicking "Scan & Add" renders the SensorAddPanel', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/connectionSettings\.sensors\.sectionTitle/));
    await screen.findByDisplayValue('Temp');
    fireEvent.click(screen.getByText(/scanAndAddButton/));
    // SensorAddPanel renders its own scan button (initial state idle)
    await waitFor(() => {
      // The button text repeats — at least one is present after click
      const scanButtons = screen.getAllByText(/scanAndAddButton/);
      expect(scanButtons.length).toBeGreaterThan(0);
    });
  });

  // Helper for "click outer 'Scan & Add' → wait for inner panel → click panel's scan button"
  // Wrapping the final click in `act` ensures the async chain (setScanState +
  // mocked scanDiscovery + setCandidates) flushes before the test continues —
  // without it, vitest+jsdom moved on while the candidate list was still
  // pending and findByLabelText timed out (audit follow-up).
  async function openAndScan() {
    fireEvent.click(screen.getByText(/connectionSettings\.sensors\.sectionTitle/));
    await screen.findByDisplayValue('Temp');
    fireEvent.click(screen.getByText(/scanAndAddButton/));
    await screen.findByText(/cancelAddButton/);
    const panelScanButtons = screen.getAllByText(/scanAndAddButton/);
    await act(async () => {
      fireEvent.click(panelScanButtons[panelScanButtons.length - 1]);
    });
  }

  // The next three integration tests stay skipped because vitest+jsdom doesn't
  // reliably flush the nested mock chain (fetchEquipmentTypeDetail →
  // sensors prop → SensorAddPanel mount → fetchPropertyTypes + scanDiscovery)
  // before findByLabelText polls the DOM. The same logic is covered by the
  // focused isolation suites instead:
  //   - SensorAddPanel.test.tsx covers scan / filter / select / apply / errors
  //   - SensorManagementSection.test.tsx covers remove (with confirm) / edit
  //     label / add-button gate
  // Production flow has been exercised manually.
  it.skip('scan-and-add filters out raw addresses already bound to existing sensors', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    await openAndScan();
    // Wait for scan promise + setState to flush
    await waitFor(() => expect(scanDiscovery).toHaveBeenCalled());
    await screen.findByLabelText(/select 40003/, {}, { timeout: 3000 });
    expect(screen.queryAllByText('40001').length).toBe(1);
  });

  it.skip('adding a new sensor synthesises a sensorId and appears in the existing list', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    await openAndScan();
    await screen.findByLabelText(/select 40003/);
    // PropertyType picker should be loaded before selecting
    await waitFor(() => expect(fetchPropertyTypes).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('select 40003'));
    // Apply
    fireEvent.click(screen.getByText(/applyAddButton/));
    // The new sensor's suggestedLabel ('NewTemp') should appear in the existing list
    await waitFor(() => {
      expect(screen.queryByDisplayValue('NewTemp')).not.toBeNull();
    });
  });

  it.skip('save after adding a sensor sends it in the updateEquipmentType payload', async () => {
    renderModal({ equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment' });
    await waitFor(() => expect(fetchEquipmentTypeDetail).toHaveBeenCalled());
    await openAndScan();
    await screen.findByLabelText(/select 40003/);
    await waitFor(() => expect(fetchPropertyTypes).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('select 40003'));
    fireEvent.click(screen.getByText(/applyAddButton/));
    await screen.findByDisplayValue('NewTemp');
    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }));
    await waitFor(() => {
      expect(updateEquipmentType).toHaveBeenCalled();
    });
    const lastCall = vi.mocked(updateEquipmentType).mock.calls.at(-1)!;
    const payload = lastCall[1];
    const newSensor = payload.sensors.find(s => s.rawAddress === '40003');
    expect(newSensor).toBeDefined();
    expect(newSensor!.sensorId).toBeGreaterThan(1002);  // above existing max
    expect(newSensor!.label).toBe('NewTemp');
  });
});

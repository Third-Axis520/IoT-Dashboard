import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

import { fetchProtocol } from '../../../lib/apiProtocols';
import {
  updateDeviceConnection,
  testDeviceConnection,
  fetchDeviceConnections,
} from '../../../lib/apiDeviceConnections';

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
});

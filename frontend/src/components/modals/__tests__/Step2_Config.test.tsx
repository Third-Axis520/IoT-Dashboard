import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Step2Config from '../DeviceIntegrationWizard/steps/Step2_Config';
import type { WizardState } from '../DeviceIntegrationWizard/WizardContext';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('../../../lib/apiProtocols', () => ({
  fetchProtocol: vi.fn(),
}));

vi.mock('../../../lib/apiDeviceConnections', () => ({
  fetchDeviceConnections: vi.fn(),
}));

const dispatchSpy = vi.fn();
let mockState: WizardState;
vi.mock('../DeviceIntegrationWizard/WizardContext', () => ({
  useWizard: () => ({ state: mockState, dispatch: dispatchSpy }),
}));

import { fetchProtocol } from '../../../lib/apiProtocols';
import { fetchDeviceConnections } from '../../../lib/apiDeviceConnections';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    step: 2,
    protocol: 'modbus_tcp',
    config: { host: '192.168.1.100', port: '502' },
    connectionName: 'My Connection',
    discoveryPoints: [],
    selectedPointIndices: new Set(),
    labels: new Map(),
    equipmentName: '',
    visType: 'single_kpi',
    description: '',
    pollIntervalMs: 5000,
    alertOnConsecutiveErrors: 5,
    alertCooldownSec: 300,
    isAlertEnabled: true,
    error: null,
    ...overrides,
  };
}

function makeSiblings(count: number, host = '192.168.1.100', port = '502') {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Step2Config — poll-interval suggestion banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = baseState();
    vi.mocked(fetchProtocol).mockResolvedValue({
      id: 'modbus_tcp',
      displayName: 'Modbus TCP',
      supportsDiscovery: true,
      supportsLivePolling: true,
      configSchema: { fields: [] },
    });
  });

  it('does NOT show the actionable banner when sameHostCount < 3', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(2));
    render(<Step2Config />);
    // Wait for the async fetch to settle
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    // The actionable banner key should not be in the document
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
    // The textual sameHostHint SHOULD still appear (count=2 > 0)
    expect(screen.queryByText(/connectionSettings\.sameHostHint/)).not.toBeNull();
  });

  it('shows the actionable banner when sameHostCount >= 3 and poll < 10s', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(3));
    render(<Step2Config />);
    await waitFor(() => {
      expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).not.toBeNull();
    });
    // And the textual sameHostHint should be suppressed (no duplicate noise)
    expect(screen.queryByText(/connectionSettings\.sameHostHint/)).toBeNull();
  });

  it('hides the banner when poll interval is already >= 10s', async () => {
    mockState = baseState({ pollIntervalMs: 10000 });
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(4));
    render(<Step2Config />);
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
    // Falls back to textual hint since count > 0
    expect(screen.queryByText(/connectionSettings\.sameHostHint/)).not.toBeNull();
  });

  it('hides the banner when protocol is push_ingest (no polling)', async () => {
    mockState = baseState({ protocol: 'push_ingest' });
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(5));
    render(<Step2Config />);
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
  });

  it('hides the banner for polling protocols without calibration data (e.g. web_api)', async () => {
    mockState = baseState({ protocol: 'web_api' });
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(5));
    render(<Step2Config />);
    await waitFor(() => expect(fetchDeviceConnections).toHaveBeenCalled());
    // web_api isn't in PROTOCOL_HINTS — silent rather than guess wrong recommendation
    expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
  });

  it('clicking "Apply 10s" dispatches SET_POLL_INTERVAL with 10000ms', async () => {
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(3));
    render(<Step2Config />);
    const applyBtn = await screen.findByText(/connectionSettings\.pollSuggestionApply/);
    fireEvent.click(applyBtn);
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'SET_POLL_INTERVAL', ms: 10000 });
  });

  it('hides both banners when no host is provided', async () => {
    mockState = baseState({ config: {} });
    vi.mocked(fetchDeviceConnections).mockResolvedValue(makeSiblings(5));
    render(<Step2Config />);
    // fetchDeviceConnections should not even be called when host is empty
    await waitFor(() => {
      expect(screen.queryByText(/connectionSettings\.pollSuggestionBanner/)).toBeNull();
      expect(screen.queryByText(/connectionSettings\.sameHostHint/)).toBeNull();
    });
  });
});

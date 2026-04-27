import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GatingSelector } from '../GatingSelector';
import type { GatingCandidate } from '../../../types/gating';

// Mock useGatingCandidates
vi.mock('../../../hooks/useGatingCandidates', () => ({
  useGatingCandidates: vi.fn(),
}));

import { useGatingCandidates } from '../../../hooks/useGatingCandidates';

const mockCandidates: GatingCandidate[] = [
  { assetCode: 'A01', assetName: 'Machine A', sensorId: 101, sensorLabel: 'Temperature' },
  { assetCode: 'A01', assetName: 'Machine A', sensorId: 102, sensorLabel: 'Humidity' },
  { assetCode: 'B02', assetName: 'Machine B', sensorId: 201, sensorLabel: 'Pressure' },
];

describe('GatingSelector', () => {
  beforeEach(() => {
    vi.mocked(useGatingCandidates).mockReturnValue({ data: mockCandidates, error: null });
  });

  it('renders empty option and all candidates from hook', () => {
    render(
      <GatingSelector value={null} onChange={() => {}} />
    );

    // Empty (disable) option
    expect(screen.getByRole('option', { name: '（不啟用）' })).toBeInTheDocument();

    // All three candidates appear
    expect(screen.getByRole('option', { name: 'Machine A / Temperature' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Machine A / Humidity' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Machine B / Pressure' })).toBeInTheDocument();
  });

  it('excludes the option matching excludeAssetCode + excludeSensorId', () => {
    render(
      <GatingSelector
        value={null}
        excludeAssetCode="A01"
        excludeSensorId={101}
        onChange={() => {}}
      />
    );

    expect(screen.queryByRole('option', { name: 'Machine A / Temperature' })).not.toBeInTheDocument();
    // Others still present
    expect(screen.getByRole('option', { name: 'Machine A / Humidity' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Machine B / Pressure' })).toBeInTheDocument();
  });

  it('calls onChange(null) when "（不啟用）" is selected', () => {
    const onChange = vi.fn();
    render(
      <GatingSelector
        value={{ assetCode: 'A01', sensorId: 101 }}
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('calls onChange with parsed assetCode and sensorId when a candidate is selected', () => {
    const onChange = vi.fn();
    render(
      <GatingSelector value={null} onChange={onChange} />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'B02::201' } });

    expect(onChange).toHaveBeenCalledWith({ assetCode: 'B02', sensorId: 201 });
  });

  it('shows no candidates when hook returns null', () => {
    vi.mocked(useGatingCandidates).mockReturnValue({ data: null, error: null });
    render(
      <GatingSelector value={null} onChange={() => {}} />
    );

    expect(screen.getByRole('option', { name: '（不啟用）' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Machine A / Temperature' })).not.toBeInTheDocument();
  });
});

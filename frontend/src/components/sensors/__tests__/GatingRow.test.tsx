import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GatingRow } from '../GatingRow';
import type { SaveGatingRuleItem } from '../../../types/gating';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock useGatingCandidates (used inside GatingSelector which GatingRow renders)
vi.mock('../../../hooks/useGatingCandidates', () => ({
  useGatingCandidates: vi.fn(() => ({ data: [], error: null })),
}));

const defaultRule: SaveGatingRuleItem = {
  gatedSensorId: 42,
  gatingAssetCode: 'A01',
  gatingSensorId: 101,
  delayMs: 500,
  maxAgeMs: 2000,
};

describe('GatingRow', () => {
  it('renders with rule=null: checkbox unchecked and fields hidden', () => {
    render(
      <GatingRow assetCode="B02" sensorId={42} rule={null} onChange={() => {}} />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    // Numeric fields should not be present
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('clicking checkbox when unchecked calls onChange with default rule object', () => {
    const onChange = vi.fn();
    render(
      <GatingRow assetCode="B02" sensorId={42} rule={null} onChange={onChange} />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith({
      gatedSensorId: 42,
      gatingAssetCode: '',
      gatingSensorId: 0,
      delayMs: 0,
      maxAgeMs: 1000,
    });
  });

  it('renders fields when rule is provided', () => {
    render(
      <GatingRow assetCode="B02" sensorId={42} rule={defaultRule} onChange={() => {}} />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    // Two numeric inputs (delayMs and maxAgeMs)
    const spinners = screen.getAllByRole('spinbutton');
    expect(spinners).toHaveLength(2);
    expect(spinners[0]).toHaveValue(500);   // delayMs
    expect(spinners[1]).toHaveValue(2000);  // maxAgeMs
  });

  it('changing delayMs input calls onChange with updated delayMs', () => {
    const onChange = vi.fn();
    render(
      <GatingRow assetCode="B02" sensorId={42} rule={defaultRule} onChange={onChange} />
    );

    const spinners = screen.getAllByRole('spinbutton');
    fireEvent.change(spinners[0], { target: { value: '1500' } });

    expect(onChange).toHaveBeenCalledWith({ ...defaultRule, delayMs: 1500 });
  });

  it('changing maxAgeMs input calls onChange with updated maxAgeMs', () => {
    const onChange = vi.fn();
    render(
      <GatingRow assetCode="B02" sensorId={42} rule={defaultRule} onChange={onChange} />
    );

    const spinners = screen.getAllByRole('spinbutton');
    fireEvent.change(spinners[1], { target: { value: '5000' } });

    expect(onChange).toHaveBeenCalledWith({ ...defaultRule, maxAgeMs: 5000 });
  });

  it('unchecking checkbox when rule is set calls onChange(null)', () => {
    const onChange = vi.fn();
    render(
      <GatingRow assetCode="B02" sensorId={42} rule={defaultRule} onChange={onChange} />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

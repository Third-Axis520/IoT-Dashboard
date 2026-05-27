import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedValue } from '../AnimatedValue';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'common.sensorError' ? '感測器異常' :
      key === 'common.sensorErrorTooltip' ? '感測器讀值異常' :
      key,
  }),
}));

describe('AnimatedValue', () => {
  it('renders the numeric value with one decimal place when status is normal', () => {
    render(<AnimatedValue value={42.7} status="normal" />);
    expect(screen.getByText('42.7')).toBeInTheDocument();
  });

  it('renders the error badge instead of the value when status is offline', () => {
    render(<AnimatedValue value={-3000} status="offline" />);
    expect(screen.queryByText('-3000.0')).not.toBeInTheDocument();
    expect(screen.queryByText('-3000')).not.toBeInTheDocument();
    expect(screen.getByText('感測器異常')).toBeInTheDocument();
  });

  it('does not leak the scrubbed-to-0 fallback value when offline', () => {
    // useLiveData scrubs value to 0 on offline transition; AnimatedValue
    // must NOT render that 0 (otherwise a "0.0" would still fire any LCL=0 styling).
    render(<AnimatedValue value={0} status="offline" />);
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
    expect(screen.getByText('感測器異常')).toBeInTheDocument();
  });

  it('keeps showing the numeric value for warning and danger', () => {
    const { rerender } = render(<AnimatedValue value={75.3} status="warning" />);
    expect(screen.getByText('75.3')).toBeInTheDocument();
    rerender(<AnimatedValue value={99.9} status="danger" />);
    expect(screen.getByText('99.9')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SensorErrorBadge } from '../SensorErrorBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'common.sensorError' ? '感測器異常' :
      key === 'common.sensorErrorTooltip' ? '感測器讀值異常或回傳哨兵值，數據不可信' :
      key,
  }),
}));

describe('SensorErrorBadge', () => {
  it('renders the localized "感測器異常" label', () => {
    render(<SensorErrorBadge />);
    expect(screen.getByText('感測器異常')).toBeInTheDocument();
  });

  it('exposes role=status + aria-label so screen readers announce the error', () => {
    render(<SensorErrorBadge />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', '感測器異常');
  });

  it('uses amber accent (not danger red) — keeps sensor failure distinct from UCL/LCL alarm', () => {
    render(<SensorErrorBadge />);
    const badge = screen.getByRole('status');
    expect(badge.className).toContain('text-[var(--accent-yellow)]');
    expect(badge.className).not.toContain('accent-red');
  });

  it('pulses to draw attention', () => {
    render(<SensorErrorBadge />);
    expect(screen.getByRole('status').className).toContain('animate-pulse');
  });

  it('lays out vertically with stacked icon + label when vertical=true', () => {
    render(<SensorErrorBadge vertical />);
    expect(screen.getByRole('status').className).toContain('flex-col');
  });

  it('lays out inline by default', () => {
    render(<SensorErrorBadge />);
    const badge = screen.getByRole('status');
    expect(badge.className).toContain('inline-flex');
    expect(badge.className).not.toContain('flex-col');
  });

  it('scales the label to match the requested size', () => {
    const { rerender } = render(<SensorErrorBadge size="xs" />);
    expect(screen.getByText('感測器異常').className).toContain('text-xs');
    rerender(<SensorErrorBadge size="lg" />);
    expect(screen.getByText('感測器異常').className).toContain('text-xl');
  });
});

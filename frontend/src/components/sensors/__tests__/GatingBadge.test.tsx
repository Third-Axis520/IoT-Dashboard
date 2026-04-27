import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GatingBadge } from '../GatingBadge';

// Mock react-i18next — keys returned as-is
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GatingBadge', () => {
  it('renders nothing when state is null', () => {
    const { container } = render(<GatingBadge state={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the sampling key with green class', () => {
    render(<GatingBadge state="sampling" />);
    const badge = screen.getByText('sensor.gating.sampling');
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('text-[var(--accent-green)]');
  });

  it('renders the standby key with muted class', () => {
    render(<GatingBadge state="standby" />);
    const badge = screen.getByText('sensor.gating.standby');
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('text-[var(--text-muted)]');
  });

  it('renders the unhealthy key with amber class', () => {
    render(<GatingBadge state="unhealthy" />);
    const badge = screen.getByText('sensor.gating.unhealthy');
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('text-amber-500');
  });

  it('renders as a span element', () => {
    render(<GatingBadge state="sampling" />);
    const badge = screen.getByText('sensor.gating.sampling');
    expect(badge.tagName.toLowerCase()).toBe('span');
  });

  it('includes text-xs class for consistent sizing', () => {
    render(<GatingBadge state="standby" />);
    const badge = screen.getByText('sensor.gating.standby');
    expect(badge.className).toContain('text-xs');
  });
});

import type { PointStatus } from '../types';

export const COLORS = {
  bg: 'var(--bg-panel)',
  cardBg: 'var(--bg-card)',
  border: 'var(--border-base)',
  textPrimary: 'var(--text-main)',
  textSecondary: 'var(--text-muted)',
  normal: 'var(--accent-green)',
  warning: 'var(--accent-yellow)',
  danger: 'var(--accent-red)',
  hot: 'var(--accent-orange)',
  cold: 'var(--accent-blue)',
};

export const getStatusColor = (status: PointStatus) => {
  if (status === 'danger') return COLORS.danger;
  if (status === 'warning') return COLORS.warning;
  return COLORS.normal;
};

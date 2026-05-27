import { useTranslation } from 'react-i18next';
import {
  Trash2, Plus, ChevronDown, X, Layers, LayoutDashboard, Activity,
  Maximize, Minimize, Search, Check, Play, Pause, Lock, Unlock,
  SlidersHorizontal, Settings,
} from 'lucide-react';
import type { ProductionLine } from '../../types';
import type { ConnectionStatus } from '../../hooks/useLiveData';
import { cn } from '../../utils/cn';
import { ConnectionStatusBadge } from '../ui/ConnectionStatusBadge';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import ConnectionHealthBadge from './ConnectionHealthBadge';

export interface AppToolbarProps {
  // Line management
  data: ProductionLine[];
  activeLineId: string;
  onLineChange: (id: string) => void;
  activeLine: ProductionLine;
  onDeleteLine: (e: React.MouseEvent, lineId: string) => void;
  // View
  viewMode: 'dashboard' | 'temp_trends';
  onViewModeChange: (mode: 'dashboard' | 'temp_trends') => void;
  // Stats
  totalPoints: number;
  alarmCount: number;
  shoePresent: number;
  shoeTotal: number;
  latestRawSensors: Map<string, Map<number, number>>;
  connStatus: ConnectionStatus;
  connError: string | null;
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Edit mode
  isEditMode: boolean;
  onToggleEditMode: () => void;
  // Auto-play
  isAutoPlaying: boolean;
  onToggleAutoPlay: () => void;
  autoPlaySpeed: number;
  onAutoPlaySpeedChange: (speed: number) => void;
  // Fullscreen
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  // Theme
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  // Modal openers
  assetCode: string | null;
  onShowLimits: () => void;
}

export function AppToolbar(props: AppToolbarProps) {
  const { t } = useTranslation();
  const {
    data, activeLineId, onLineChange, activeLine,
    onDeleteLine,
    viewMode, onViewModeChange,
    totalPoints, alarmCount, shoePresent, shoeTotal, latestRawSensors, connStatus, connError,
    searchQuery, onSearchChange,
    isEditMode, onToggleEditMode,
    isAutoPlaying, onToggleAutoPlay, autoPlaySpeed, onAutoPlaySpeedChange,
    isFullscreen, onToggleFullscreen,
    theme, onThemeChange,
    assetCode,
    onShowLimits,
  } = props;

  return (
    <header className="h-14 glass-panel border-b-0 flex items-center justify-between px-4 shrink-0 z-20 gap-2">
      {/* ── Left: Line selector + view toggle + stats ── */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Production line dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md hover:border-[var(--accent-green)] transition-colors max-w-[160px]">
            <Layers className="w-4 h-4 text-[var(--accent-green)] shrink-0" />
            <span className="font-bold text-sm truncate">{activeLine.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          </button>
          <div className="absolute top-full left-0 mt-1 w-48 bg-[var(--bg-card)] border border-[var(--border-base)] rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <div className="p-1 flex flex-col">
              {data.map(line => (
                <div key={line.id} className="flex items-center group/item">
                  <button
                    onClick={() => onLineChange(line.id)}
                    className={cn(
                      "flex-1 text-left px-3 py-2 rounded-md transition-colors text-sm",
                      activeLineId === line.id ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : "hover:bg-[var(--border-base)] text-[var(--text-main)]"
                    )}
                  >
                    {line.name}
                  </button>
                  {isEditMode && data.length > 1 && (
                    <button
                      onClick={(e) => onDeleteLine(e, line.id)}
                      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-red)] opacity-0 group-hover/item:opacity-100 transition-opacity"
                      title="删除产线"
                      aria-label="Delete line"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex bg-[var(--bg-panel)] p-0.5 rounded-lg border border-[var(--border-base)]">
          <button
            onClick={() => onViewModeChange('dashboard')}
            className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-xs font-medium", viewMode === 'dashboard' ? "bg-[var(--border-base)] text-[var(--accent-green)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]")}
            title={t('app.dashboard')}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t('app.dashboard')}</span>
          </button>
          <button
            onClick={() => onViewModeChange('temp_trends')}
            className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-xs font-medium", viewMode === 'temp_trends' ? "bg-[var(--border-base)] text-[var(--accent-green)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]")}
            title={t('app.trend')}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t('app.trend')}</span>
          </button>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-2.5 text-xs">
          <span className="font-mono font-bold text-[var(--accent-blue)]" title={t('app.monitoringPoints')}>{totalPoints} {t('app.pts')}</span>
          <div className="w-px h-3 bg-[var(--border-base)]" />
          <div className="flex items-center gap-1" title={t('app.currentAlarms')}>
            <div className={cn("w-1.5 h-1.5 rounded-full", alarmCount > 0 ? "bg-[var(--accent-red)] animate-pulse" : "bg-[var(--accent-green)]")} />
            <span className={cn("font-mono font-bold", alarmCount > 0 ? "text-[var(--accent-red)]" : "text-[var(--accent-green)]")}>{alarmCount}</span>
          </div>
          {shoeTotal > 0 && (
            <>
              <div className="w-px h-3 bg-[var(--border-base)]" />
              <div className="flex items-center gap-1.5" title={t('app.shoePresentCount', { count: shoePresent, total: shoeTotal })}>
                <span className="text-[var(--text-muted)] tracking-widest">
                  {activeLine.equipments.map(eq => {
                    const v = eq.materialDetectSensorId !== undefined
                      ? latestRawSensors.get(eq.deviceId)?.get(eq.materialDetectSensorId)
                      : undefined;
                    if (v === undefined) return null;
                    return (
                      <span key={eq.id} className={cn("inline-block w-1.5 h-1.5 rounded-full mx-[1px]", v === 1 ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)] animate-pulse")} />
                    );
                  })}
                </span>
                <span className={cn("font-mono font-bold", shoePresent < shoeTotal ? "text-[var(--accent-red)]" : "text-[var(--accent-green)]")}>
                  {shoePresent}/{shoeTotal}
                </span>
                <span className="text-[var(--text-muted)]">{t('app.present')}</span>
              </div>
            </>
          )}
          <div className="w-px h-3 bg-[var(--border-base)]" />
          <ConnectionHealthBadge />
          <ConnectionStatusBadge status={connStatus} error={connError} />
        </div>
      </div>

      {/* ── Right: Actions ── */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Search */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5" />
          <input
            type="text"
            placeholder={t('app.searchDevices')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] transition-colors w-32 focus:w-44"
            style={{ transition: 'width 0.2s ease' }}
          />
        </div>

        <div className="w-px h-4 bg-[var(--border-base)]" />

        {/* Icon-only secondary actions */}
        <button
          onClick={onShowLimits}
          disabled={!assetCode}
          className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={assetCode ? t('app.limitsSettings') : t('app.limitsDisabled')}
          aria-label={t('app.limitsSettings')}
          data-testid="open-limits-modal"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Preferences dropdown */}
        <div className="relative group">
          <button
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors"
            title={t('app.systemSettings')}
            aria-label={t('app.systemSettings')}
          >
            <Settings className="w-4 h-4" />
          </button>
          <div className="absolute right-0 top-full mt-1 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[210px]">
            {/* Preferences section */}
            <div className="border-t border-[var(--border-base)]">
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('app.preferences')}</p>
              {/* Theme row */}
              <div className="px-3 py-1.5 flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--text-main)] shrink-0">{t('app.theme')}</span>
                <div className="flex items-center gap-0.5 rounded-md border border-[var(--border-base)] overflow-hidden">
                  <button
                    onClick={() => onThemeChange('dark')}
                    className={`px-2 py-1 text-xs font-medium transition-colors ${theme === 'dark' ? 'bg-[var(--border-base)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)]/50'}`}
                  >
                    {t('app.themeDark')}
                  </button>
                  <button
                    onClick={() => onThemeChange('light')}
                    className={`px-2 py-1 text-xs font-medium transition-colors ${theme === 'light' ? 'bg-[var(--border-base)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)]/50'}`}
                  >
                    {t('app.themeLight')}
                  </button>
                </div>
              </div>
              {/* Language row */}
              <div className="px-3 py-1.5 pb-3 flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--text-main)] shrink-0">{t('app.language')}</span>
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>

        <div className="w-px h-4 bg-[var(--border-base)]" />

        {/* Auto-play: icon + compact speed */}
        <div className="flex items-center bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md overflow-hidden">
          <button
            onClick={onToggleAutoPlay}
            className={cn(
              "flex items-center justify-center w-8 h-8 transition-colors border-r border-[var(--border-base)]",
              isAutoPlaying
                ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20"
                : "text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10"
            )}
            title={isAutoPlaying ? t('app.stopAutoPlay') : t('app.startAutoPlay')}
            aria-label={isAutoPlaying ? "Stop auto-play" : "Start auto-play"}
          >
            {isAutoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <select
            value={autoPlaySpeed}
            onChange={(e) => onAutoPlaySpeedChange(Number(e.target.value))}
            className="bg-transparent text-[var(--text-main)] text-xs px-1.5 py-1.5 outline-none cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
            title={t('app.playbackSpeed')}
          >
            <option value={16000} className="bg-[var(--bg-panel)]">0.5x</option>
            <option value={8000} className="bg-[var(--bg-panel)]">1x</option>
            <option value={4000} className="bg-[var(--bg-panel)]">2x</option>
            <option value={2000} className="bg-[var(--bg-panel)]">4x</option>
          </select>
        </div>

        {/* Utility icons */}
        <button
          onClick={onToggleEditMode}
          className={cn(
            "flex items-center justify-center w-8 h-8 border rounded-md transition-colors",
            isEditMode
              ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/50 hover:bg-[var(--accent-red)]/20"
              : "bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-base)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50"
          )}
          title={isEditMode ? t('app.lockLayout') : t('app.unlockLayout')}
          aria-label={isEditMode ? "Lock layout" : "Unlock layout"}
        >
          {isEditMode ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onToggleFullscreen}
          className="flex items-center justify-center w-8 h-8 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50 transition-colors"
          title={isFullscreen ? t('app.exitFullscreen') : t('app.enterFullscreen')}
          aria-label="Toggle fullscreen"
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
}

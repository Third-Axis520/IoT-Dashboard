import { useTranslation } from 'react-i18next';
import {
  Trash2, Plus, ChevronDown, X, Layers, LayoutDashboard, Activity,
  Maximize, Minimize, Search, Check, Play, Pause, Lock, Unlock,
  Cpu, SlidersHorizontal, Settings, Network, FileCode2,
} from 'lucide-react';
import type { ProductionLine } from '../../types';
import type { ConnectionStatus } from '../../hooks/useLiveData';
import { cn } from '../../utils/cn';
import { ConnectionStatusBadge } from '../ui/ConnectionStatusBadge';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

export interface AppToolbarProps {
  // Line management
  data: ProductionLine[];
  activeLineId: string;
  onLineChange: (id: string) => void;
  activeLine: ProductionLine;
  isAddingLine: boolean;
  onStartAddLine: () => void;
  onCancelAddLine: () => void;
  newLineName: string;
  onNewLineNameChange: (name: string) => void;
  onAddLine: () => void;
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
  unboundCount: number;
  assetCode: string | null;
  onShowDeviceMgmt: () => void;
  onShowLimits: () => void;
  onShowConnections: () => void;
  onShowPropertyTypes: () => void;
  onShowRegisterMap: () => void;
  onShowPlcTemplates: () => void;
  onShowWizard: () => void;
  onShowAddDevice: () => void;
}

export function AppToolbar(props: AppToolbarProps) {
  const { t } = useTranslation();
  const {
    data, activeLineId, onLineChange, activeLine,
    isAddingLine, onStartAddLine, onCancelAddLine, newLineName, onNewLineNameChange, onAddLine, onDeleteLine,
    viewMode, onViewModeChange,
    totalPoints, alarmCount, shoePresent, shoeTotal, latestRawSensors, connStatus, connError,
    searchQuery, onSearchChange,
    isEditMode, onToggleEditMode,
    isAutoPlaying, onToggleAutoPlay, autoPlaySpeed, onAutoPlaySpeedChange,
    isFullscreen, onToggleFullscreen,
    theme, onThemeChange,
    unboundCount, assetCode,
    onShowDeviceMgmt, onShowLimits, onShowConnections, onShowPropertyTypes, onShowRegisterMap, onShowPlcTemplates, onShowWizard, onShowAddDevice,
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
              <div className="h-px bg-[var(--border-base)] my-1" />
              {isAddingLine ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <input
                    autoFocus
                    value={newLineName}
                    onChange={e => onNewLineNameChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onAddLine();
                      if (e.key === 'Escape') onCancelAddLine();
                    }}
                    className="flex-1 min-w-0 bg-[var(--bg-root)] border border-[var(--border-input)] rounded px-2 py-1 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
                    placeholder={t('app.lineName')}
                  />
                  <button onClick={onAddLine} className="p-1 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 rounded shrink-0" aria-label="Confirm">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={onCancelAddLine} className="p-1 text-[var(--text-muted)] hover:bg-[var(--border-base)] rounded shrink-0" aria-label="Cancel">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onStartAddLine(); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-md transition-colors"
                >
                  <Plus className="w-3 h-3" /> {t('app.addLine')}
                </button>
              )}
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
          onClick={onShowDeviceMgmt}
          className="relative flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors"
          title={t('app.deviceManagement')}
          aria-label={t('app.deviceManagement')}
        >
          <Cpu className="w-4 h-4" />
          {unboundCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--accent-red)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unboundCount}
            </span>
          )}
        </button>

        <button
          onClick={onShowLimits}
          disabled={!assetCode}
          className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={assetCode ? t('app.limitsSettings') : t('app.limitsDisabled')}
          aria-label={t('app.limitsSettings')}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* System Settings dropdown */}
        <div className="relative group">
          <button
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors"
            title={t('app.systemSettings')}
            aria-label={t('app.systemSettings')}
          >
            <Settings className="w-4 h-4" />
          </button>
          <div className="absolute right-0 top-full mt-1 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[210px]">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('app.systemSettings')}</p>
            <button onClick={onShowConnections} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors">
              <Network className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {t('app.connectionManagement')}
            </button>
            <button onClick={onShowPropertyTypes} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {t('app.propertyManagement')}
            </button>
            <button onClick={onShowRegisterMap} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors">
              <FileCode2 className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {t('app.registerMap')}
            </button>
            <button onClick={onShowPlcTemplates} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors">
              <Cpu className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {t('app.plcTemplates')}
            </button>
            {/* Preferences section */}
            <div className="border-t border-[var(--border-base)] mt-1">
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

        {/* Primary CTA: Add Device Dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:bg-[var(--accent-green)]/20 rounded-md transition-colors font-semibold">
            <Plus className="w-3.5 h-3.5" /> {t('app.addDevice')} <ChevronDown className="w-3 h-3" />
          </button>
          <div className="absolute right-0 top-full mt-1 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[240px]">
            <button onClick={onShowWizard} className="w-full text-left px-3 py-2.5 hover:bg-[var(--bg-card)] rounded-t-lg">
              <div className="text-xs font-medium text-[var(--text-main)]">{t('app.integrateDevice')}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('app.integrateDeviceDesc')}</div>
            </button>
            <div className="h-px bg-[var(--border-base)] mx-2" />
            <button onClick={onShowAddDevice} className="w-full text-left px-3 py-2.5 hover:bg-[var(--bg-card)] rounded-b-lg">
              <div className="text-xs font-medium text-[var(--text-main)]">{t('app.useTemplate')}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('app.useTemplateDesc')}</div>
            </button>
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

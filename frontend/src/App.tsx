import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Plus, Search } from 'lucide-react';

import type { AlertRecord, Equipment, MachineTemplate, PointStatus, ProductionLine } from './types';
import { cn } from './utils/cn';
import { getGridStyle } from './utils/grid';
import {
  fetchEquipmentTypes,
  fetchLineConfigs,
  apiTypeToTemplate,
  apiLineConfigToProductionLine,
  saveLineConfig,
  deleteLineConfig,
} from './lib/apiLineConfig';
import type { ApiLineConfig } from './types';
import { useLiveData } from './hooks/useLiveData';
import { useToast } from './hooks/useToast';
import { useDevices } from './hooks/useDevices';
import { fetchHistoryByAsset, type HistoryPoint } from './lib/apiHistory';
import { TempTrendsView } from './components/panels/TempTrendsView';

import { AppToolbar } from './components/layout/AppToolbar';
import EquipmentCard from './components/layout/EquipmentCard';
import ModalContainer from './components/layout/ModalContainer';

const ALERTS_STORAGE_KEY = 'iot-dashboard-alerts';

export default function App() {
  const { t } = useTranslation();

  // ── Core data ──────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<MachineTemplate[]>([]);
  const [data, setData] = useState<ProductionLine[]>([]);
  // True until the mount-time line-configs + history-seed pipeline finishes.
  // Used to suppress the "no devices, add your first" welcome page from
  // flashing on every refresh while the async fetch is still running.
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [apiLineConfigs, setApiLineConfigs] = useState<ApiLineConfig[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>(() => {
    try { const s = localStorage.getItem(ALERTS_STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeLineId, setActiveLineId] = useState('');
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [newLineName, setNewLineName] = useState('');
  const [viewMode, setViewMode] = useState<'dashboard' | 'temp_trends'>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('iot-theme') as 'dark' | 'light') ?? 'dark');
  useEffect(() => { localStorage.setItem('iot-theme', theme); }, [theme]);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Modal toggles ──────────────────────────────────────────────────────────
  const [showLimits, setShowLimits] = useState(false);
  const [limitsFocusAsset, setLimitsFocusAsset] = useState<string | undefined>(undefined);
  const [drillDownEq, setDrillDownEq] = useState<Equipment | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmText: string; variant: 'danger' | 'default'; onConfirm: () => void } | null>(null);

  // ── Edit / autoplay / fullscreen ───────────────────────────────────────────
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(8000);
  const [autoPlayEqIndex, setAutoPlayEqIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedEqIndex, setDraggedEqIndex] = useState<number | null>(null);
  const [editingEqId, setEditingEqId] = useState<string | null>(null);
  const [editEqName, setEditEqName] = useState('');
  const [editEqDeviceId, setEditEqDeviceId] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const lastAlertIdRef = useRef<string>(
    (() => { try { const s = localStorage.getItem(ALERTS_STORAGE_KEY); const a = s ? JSON.parse(s) : []; return a.length ? a[a.length - 1].id : ''; } catch { return ''; } })()
  );

  // ── Config loading ─────────────────────────────────────────────────────────
  const reloadConfig = useCallback(async () => {
    try {
      const [types, lines] = await Promise.all([fetchEquipmentTypes(), fetchLineConfigs()]);
      const mapped = types.map(apiTypeToTemplate);
      setTemplates(mapped);
      setApiLineConfigs(lines);
      setData(prev => {
        const freshLines = lines.map(apiLineConfigToProductionLine);
        return freshLines.map(fl => {
          const pl = prev.find(l => l.id === fl.id);
          if (!pl) return fl;
          return { ...fl, equipments: fl.equipments.map(fe => {
            const pe = pl.equipments.find(e => e.deviceId === fe.deviceId);
            if (!pe) return fe;
            return { ...fe, points: fe.points.map(fp => {
              if (fp.sensorId === undefined) return fp;
              const pp = pe.points.find(p => p.sensorId === fp.sensorId);
              if (!pp) return fp;
              return { ...fp, value: pp.value, status: pp.status, history: pp.history, ucl: pp.ucl, lcl: pp.lcl };
            }) };
          }) };
        });
      });
      return mapped;
    } catch (err) { console.error('Config reload failed:', err); }
  }, []);

  const { status: connStatus, error: connError, assetCode, latestRawSensors, latestRawTimestamps } = useLiveData(data, setData, setAlerts, reloadConfig);
  const { unboundCount } = useDevices();

  useEffect(() => { try { localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts.slice(-200))); } catch {} }, [alerts]);
  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[alerts.length - 1];
    if (latest.id === lastAlertIdRef.current) return;
    lastAlertIdRef.current = latest.id;
    if (latest.status === 'danger') addToast('error', `${latest.eqName} — ${latest.pointName} ${latest.type} 超限：${latest.value.toFixed(1)}`);
  }, [alerts, addToast]);

  useEffect(() => {
    (async () => {
      try {
        const [types, lines] = await Promise.all([fetchEquipmentTypes(), fetchLineConfigs()]);
        setTemplates(types.map(apiTypeToTemplate));
        setApiLineConfigs(lines);
        const pls = lines.map(apiLineConfigToProductionLine);
        setData(pls);
        if (pls.length > 0) setActiveLineId(prev => prev || pls[0].id);

        // Eagerly fetch UCL/LCL for every assetCode at startup. Previously
        // limits only loaded on the first SSE data tick — if the PLC was
        // offline or polling failed, the dashboard would show UCL/LCL = 0
        // even though the values existed in the database.
        const assetCodes = Array.from(new Set(
          pls.flatMap(l => l.equipments.map(e => e.deviceId).filter(Boolean))
        ));
        const allLimits = await Promise.all(assetCodes.map(async ac => {
          try {
            const res = await fetch(`/api/limits/${encodeURIComponent(ac)}`);
            if (!res.ok) return [ac, []] as const;
            const limits: Array<{ sensorId: number; ucl: number; lcl: number }> = await res.json();
            return [ac, limits] as const;
          } catch { return [ac, []] as const; }
        }));
        const limitsByAsset = new Map(allLimits);
        setData(prev => prev.map(line => ({
          ...line,
          equipments: line.equipments.map(eq => {
            const limits = limitsByAsset.get(eq.deviceId) ?? [];
            if (limits.length === 0) return eq;
            return {
              ...eq,
              points: eq.points.map(p => {
                if (p.sensorId === undefined) return p;
                const lim = limits.find(l => l.sensorId === p.sensorId);
                return lim ? { ...p, ucl: lim.ucl, lcl: lim.lcl } : p;
              }),
            };
          }),
        })));

        // Seed point.history from DB so sparklines show recent values right
        // after page refresh, instead of starting empty and slowly filling
        // from SSE over the next few minutes. Last 5 minutes per AssetCode,
        // capped at 60 points (matches the SSE rolling window in useLiveData).
        const historyTo = new Date();
        const historyFrom = new Date(historyTo.getTime() - 5 * 60_000);
        const allHistory = await Promise.all(assetCodes.map(async ac => {
          try {
            const map = await fetchHistoryByAsset(ac, historyFrom, historyTo, 60);
            return [ac, map] as const;
          } catch { return [ac, {} as Record<number, HistoryPoint[]>] as const; }
        }));
        const historyByAsset = new Map(allHistory);
        setData(prev => prev.map(line => ({
          ...line,
          equipments: line.equipments.map(eq => {
            const hMap = historyByAsset.get(eq.deviceId);
            if (!hMap) return eq;
            return {
              ...eq,
              points: eq.points.map(p => {
                if (p.sensorId === undefined) return p;
                const h = hMap[p.sensorId];
                if (!h || h.length === 0) return p;
                // Seed both the rolling history series AND the current value
                // / status, so cards on Dashboard + Trend views display the
                // last DB value instead of 0 until SSE delivers its first
                // tick. Status calculation mirrors useLiveData.ts.
                const recent = h.slice(-60);
                const latest = recent[recent.length - 1].value;
                const pValue = Number(latest.toFixed(1));
                const ucl = p.ucl;
                const lcl = p.lcl;
                let status: PointStatus = 'normal';
                if ((ucl > 0 && pValue > ucl) || (lcl > 0 && pValue < lcl)) {
                  status = 'danger';
                } else if (
                  (ucl > 0 && pValue > ucl * 0.95) ||
                  (lcl > 0 && pValue < lcl * 1.05)
                ) {
                  status = 'warning';
                }
                return { ...p, history: recent, value: pValue, status };
              }),
            };
          }),
        })));
      } catch (err) { console.error('Failed to load config:', err); addToast('error', t('app.loadFailed')); }
      finally { setIsInitialLoading(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeLine = useMemo(() => data.find(l => l.id === activeLineId) || data[0] || { id: '', name: '', equipments: [] }, [data, activeLineId]);

  const displayedEquipments = useMemo(() => {
    // isHidden = backend-only entity (e.g. DI 集中器), not rendered on dashboard
    // but still loaded into `data` so it's available as a sensor gating source.
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return data.flatMap(line => line.equipments.filter(eq => !eq.isHidden && (eq.deviceId.toLowerCase().includes(q) || eq.name.toLowerCase().includes(q))).map(eq => ({ lineId: line.id, eq })));
    }
    return activeLine?.equipments.filter(eq => !eq.isHidden).map(eq => ({ lineId: activeLine.id, eq })) || [];
  }, [data, activeLine, searchQuery]);

  const liveDrillDownEq = useMemo(() => {
    if (!drillDownEq) return null;
    for (const line of data) { const eq = line.equipments.find(e => e.id === drillDownEq.id); if (eq) return eq; }
    return drillDownEq;
  }, [data, drillDownEq]);

  const { totalPoints, alarmCount } = useMemo(() => {
    let total = 0, alarms = 0;
    activeLine.equipments.forEach(e => e.points.forEach(p => { total++; if (p.status === 'danger') alarms++; }));
    return { totalPoints: total, alarmCount: alarms };
  }, [activeLine]);

  const { shoePresent, shoeTotal } = useMemo(() => {
    let present = 0, total = 0;
    activeLine.equipments.forEach(eq => {
      const matId = eq.materialDetectSensorId;
      if (matId === undefined) return;
      const v = latestRawSensors.get(eq.deviceId)?.get(matId);
      if (v !== undefined) { total++; if (v === 1) present++; }
    });
    return { shoePresent: present, shoeTotal: total };
  }, [activeLine, latestRawSensors]);

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, i: number) => { setDraggedEqIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', ''); }, []);
  const handleDragOver = useCallback((e: React.DragEvent, _i: number) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDraggedEqIndex(prev => {
      if (prev === null || prev === index) return null;
      setData(pl => { const nl = [...pl]; const li = nl.findIndex(l => l.id === activeLineId); if (li === -1) return pl; const ne = [...nl[li].equipments]; const [rm] = ne.splice(prev, 1); ne.splice(index, 0, rm); nl[li] = { ...nl[li], equipments: ne }; return nl; });
      return null;
    });
  }, [activeLineId]);
  const handleDragEnd = useCallback(() => setDraggedEqIndex(null), []);

  const handleSaveEqEdit = useCallback(async (lineId: string, eqId: string) => {
    const snap = data;
    setData(prev => prev.map(l => l.id === lineId ? { ...l, equipments: l.equipments.map(eq => eq.id === eqId ? { ...eq, name: editEqName, deviceId: editEqDeviceId } : eq) } : l));
    setEditingEqId(null);
    // Persist DisplayName + AssetCode change to backend so it survives refresh
    const lc = apiLineConfigs.find(c => c.lineId === lineId);
    if (!lc) return;
    const numericLeId = Number(eqId.replace(/^le_/, ''));
    const equipments = lc.equipments.map((le, i) => {
      if (le.id === numericLeId) {
        return { equipmentTypeId: le.equipmentTypeId, assetCode: editEqDeviceId || null, displayName: editEqName !== le.equipmentType.name ? editEqName : null, sortOrder: i, isHidden: le.isHidden };
      }
      return { equipmentTypeId: le.equipmentTypeId, assetCode: le.assetCode, displayName: le.displayName, sortOrder: i, isHidden: le.isHidden };
    });
    try {
      const updated = await saveLineConfig(lineId, lc.name, equipments);
      setApiLineConfigs(prev => prev.map(c => c.lineId === lineId ? updated : c));
    } catch (err) {
      setData(snap);
      addToast('error', `儲存設備修改失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  }, [editEqName, editEqDeviceId, data, apiLineConfigs, addToast]);

  const handlePointSwap = useCallback((lineId: string, eqId: string, drag: number, drop: number) => {
    setData(prev => prev.map(l => l.id === lineId ? { ...l, equipments: l.equipments.map(eq => {
      if (eq.id !== eqId) return eq;
      const pts = [...eq.points]; const d = pts[drag]; const p = pts[drop];
      if (!d || !p) return eq;
      pts[drag] = { ...p, name: d.name, id: d.id }; pts[drop] = { ...d, name: p.name, id: p.id };
      return { ...eq, points: pts };
    }) } : l));
  }, []);

  useEffect(() => { const h = () => setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);
  const toggleFullscreen = useCallback(() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen?.(); }, []);

  const handleUpdateLimits = useCallback((_lineId: string, _eqId: string, pointId: string, ucl: number, lcl: number) => {
    setData(prev => prev.map(l => ({ ...l, equipments: l.equipments.map(eq => ({ ...eq, points: eq.points.map(p => p.id !== pointId ? p : { ...p, ucl, lcl }) })) })));
  }, []);

  const handleLimitsSaved = useCallback((limits: Record<number, { ucl: number; lcl: number }>) => {
    setData(prev => prev.map(l => ({ ...l, equipments: l.equipments.map(eq => ({ ...eq, points: eq.points.map(p => { if (p.sensorId === undefined) return p; const lim = limits[p.sensorId]; return lim ? { ...p, ucl: lim.ucl, lcl: lim.lcl } : p; }) })) })));
  }, []);

  const handleSaveConfig = useCallback((updatedEq: Equipment) => { setData(prev => prev.map(l => l.id === activeLineId ? { ...l, equipments: l.equipments.map(e => e.id === updatedEq.id ? updatedEq : e) } : l)); setDrillDownEq(null); }, [activeLineId]);

  const toggleAutoPlay = useCallback(() => {
    if (isAutoPlaying) { setIsAutoPlaying(false); setDrillDownEq(null); }
    else if (displayedEquipments.length > 0) { setIsAutoPlaying(true); setAutoPlayEqIndex(0); setDrillDownEq(displayedEquipments[0].eq); }
  }, [isAutoPlaying, displayedEquipments]);

  const handleAutoPlayNextEq = useCallback(() => {
    if (!isAutoPlaying || displayedEquipments.length === 0) return;
    const next = (autoPlayEqIndex + 1) % displayedEquipments.length;
    setAutoPlayEqIndex(next); setDrillDownEq(displayedEquipments[next].eq);
  }, [isAutoPlaying, autoPlayEqIndex, displayedEquipments]);

  const executeDeleteEquipment = useCallback(async (lineId: string, eqId: string) => {
    // Optimistic UI: remove the card immediately
    const snap = data;
    setData(prev => prev.map(l => l.id === lineId ? { ...l, equipments: l.equipments.filter(e => e.id !== eqId) } : l));
    // Persist to backend so the deletion survives a refresh
    const lc = apiLineConfigs.find(c => c.lineId === lineId);
    if (!lc) return;
    // Map LineEquipment id `le_<id>` → numeric to filter the persisted list
    const numericLeId = Number(eqId.replace(/^le_/, ''));
    const remaining = lc.equipments
      .filter(le => le.id !== numericLeId)
      .map((le, i) => ({
        equipmentTypeId: le.equipmentTypeId,
        assetCode: le.assetCode,
        displayName: le.displayName,
        sortOrder: i,
        isHidden: le.isHidden,
      }));
    try {
      const updated = await saveLineConfig(lineId, lc.name, remaining);
      setApiLineConfigs(prev => prev.map(c => c.lineId === lineId ? updated : c));
    } catch (err) {
      // Roll back optimistic UI on failure
      setData(snap);
      addToast('error', `刪除設備失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  }, [data, apiLineConfigs, addToast]);
  const handleDeleteEquipment = useCallback((lineId: string, eqId: string, eqName: string) => {
    setConfirmDialog({ title: t('app.deleteDevice'), message: t('app.deleteDeviceConfirm', { name: eqName }), confirmText: t('common.delete'), variant: 'danger', onConfirm: () => { setConfirmDialog(null); executeDeleteEquipment(lineId, eqId); } });
  }, [executeDeleteEquipment, t]);

  const handleAddLine = useCallback(async () => {
    if (!newLineName.trim()) return;
    const name = newLineName.trim(); const id = `line-${Date.now()}`;
    setData(prev => [...prev, { id, name, equipments: [] }]); setActiveLineId(id); setNewLineName(''); setIsAddingLine(false);
    try { const saved = await saveLineConfig(id, name, []); setApiLineConfigs(prev => [...prev, saved]); }
    catch (err) { setData(prev => prev.filter(l => l.id !== id)); addToast('error', `新增產線失敗：${err instanceof Error ? err.message : '未知錯誤'}`); }
  }, [newLineName, addToast]);

  const executeDeleteLine = useCallback(async (lineId: string) => {
    if (data.length <= 1) return; const snap = data;
    setData(prev => { const nl = prev.filter(l => l.id !== lineId); if (activeLineId === lineId) setActiveLineId(nl[0].id); return nl; });
    setApiLineConfigs(prev => prev.filter(lc => lc.lineId !== lineId));
    try { await deleteLineConfig(lineId); }
    catch (err) { setData(snap); setApiLineConfigs(prev => { const lc = apiLineConfigs.find(l => l.lineId === lineId); return lc && !prev.find(l => l.lineId === lineId) ? [...prev, lc] : prev; }); addToast('error', `刪除產線失敗：${err instanceof Error ? err.message : '未知錯誤'}`); }
  }, [data, activeLineId, apiLineConfigs, addToast]);

  const handleDeleteLine = useCallback((e: React.MouseEvent, lineId: string) => {
    e.stopPropagation(); if (data.length <= 1) return;
    const name = data.find(l => l.id === lineId)?.name ?? '此產線';
    setConfirmDialog({ title: t('app.deleteLine'), message: t('app.deleteLineConfirm', { name }), confirmText: t('common.delete'), variant: 'danger', onConfirm: () => { setConfirmDialog(null); executeDeleteLine(lineId); } });
  }, [data, executeDeleteLine, t]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={cn("app-container h-screen w-screen bg-[var(--bg-root)] text-[var(--text-main)] font-sans overflow-hidden flex flex-col transition-colors duration-300", theme === 'light' && 'theme-light')}>
      <AppToolbar
        data={data} activeLineId={activeLineId} onLineChange={setActiveLineId} activeLine={activeLine}
        isAddingLine={isAddingLine} onStartAddLine={() => setIsAddingLine(true)} onCancelAddLine={() => setIsAddingLine(false)}
        newLineName={newLineName} onNewLineNameChange={setNewLineName} onAddLine={handleAddLine} onDeleteLine={handleDeleteLine}
        viewMode={viewMode} onViewModeChange={setViewMode}
        totalPoints={totalPoints} alarmCount={alarmCount} shoePresent={shoePresent} shoeTotal={shoeTotal}
        latestRawSensors={latestRawSensors} connStatus={connStatus} connError={connError}
        searchQuery={searchQuery} onSearchChange={setSearchQuery}
        isEditMode={isEditMode} onToggleEditMode={() => setIsEditMode(v => !v)}
        isAutoPlaying={isAutoPlaying} onToggleAutoPlay={toggleAutoPlay} autoPlaySpeed={autoPlaySpeed} onAutoPlaySpeedChange={setAutoPlaySpeed}
        isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen}
        theme={theme} onThemeChange={setTheme}
        unboundCount={unboundCount} assetCode={assetCode}
        onShowLimits={() => setShowLimits(true)}
      />

      <main className="flex-1 min-h-0 p-4 md:p-6 overflow-hidden flex flex-col">
        {isInitialLoading ? (
          /* Mount-time placeholder. Keeps the welcome "+ first device" prompt
             from flashing on every refresh while line-configs + history seed
             are still in flight. */
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-3" role="status" aria-live="polite">
            <div className="w-3 h-3 rounded-full bg-[var(--accent-green)] animate-pulse" />
            <p className="text-sm opacity-60">{t('common.loading')}</p>
          </div>
        ) : displayedEquipments.length === 0 ? (
          searchQuery ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-base">{t('app.noSearchResults', { query: searchQuery })}</p>
              <p className="text-sm mt-1 opacity-60">{t('app.searchHint')}</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-base)] flex items-center justify-center shadow-lg"><Activity className="w-12 h-12 text-[var(--border-base)]" /></div>
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[var(--accent-green)]/20 border border-[var(--accent-green)]/40 flex items-center justify-center"><Plus className="w-4 h-4 text-[var(--accent-green)]" /></div>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-[var(--text-main)] mb-1">{t('app.welcome')}</p>
                <p className="text-sm text-[var(--text-muted)]">「{activeLine.name}」{t('app.noDevices')}，從這裡開始建立你的監控畫面</p>
              </div>
              <button onClick={() => setShowAddDevice(true)} className="flex items-center gap-2.5 px-6 py-3 bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-xl hover:bg-[var(--accent-green-hover)] transition-colors shadow-lg shadow-[var(--accent-green)]/20 text-base">
                <Plus className="w-5 h-5" />{t('app.addFirstDevice')}
              </button>
            </div>
          )
        ) : viewMode === 'temp_trends' ? (
          <TempTrendsView
            displayedEquipments={displayedEquipments}
            alerts={alerts}
            onUpdateLimits={handleUpdateLimits}
          />
        ) : (
          <div className="grid gap-4 md:gap-6 w-full h-full animate-in fade-in duration-500" style={getGridStyle(displayedEquipments.length)}>
            {displayedEquipments.map(({ lineId, eq }, index) => (
              <EquipmentCard key={eq.id} eq={eq} lineId={lineId} index={index}
                latestRawSensors={latestRawSensors}
                isEditMode={isEditMode} editingEqId={editingEqId} editEqName={editEqName} editEqDeviceId={editEqDeviceId}
                onStartEdit={(id: string, n: string, d: string) => { setEditingEqId(id); setEditEqName(n); setEditEqDeviceId(d); }}
                onSaveEdit={handleSaveEqEdit} onCancelEdit={() => setEditingEqId(null)}
                onEditNameChange={setEditEqName} onEditDeviceIdChange={setEditEqDeviceId}
                isSearching={!!searchQuery} draggedIndex={draggedEqIndex}
                onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} onDragEnd={handleDragEnd}
                onDrillDown={setDrillDownEq}
                onDelete={handleDeleteEquipment} onPointSwap={handlePointSwap}
                onOpenLimits={(focusAsset) => { setLimitsFocusAsset(focusAsset); setShowLimits(true); }}
              />
            ))}
          </div>
        )}
      </main>

      <ModalContainer
        data={data} assetCode={assetCode}
        activeLine={activeLine}
        liveDrillDownEq={liveDrillDownEq} onCloseDrillDown={() => { setDrillDownEq(null); setIsAutoPlaying(false); }}
        showLimits={showLimits} onCloseLimits={() => { setShowLimits(false); setLimitsFocusAsset(undefined); }} limitsFocusAsset={limitsFocusAsset}
        confirmDialog={confirmDialog} onCloseConfirm={() => setConfirmDialog(null)}
        toasts={toasts} onRemoveToast={removeToast}
        onSaveConfig={handleSaveConfig}
        onLimitsSaved={handleLimitsSaved}
        isAutoPlaying={isAutoPlaying} autoPlaySpeed={autoPlaySpeed}
        onAutoPlayNextEq={handleAutoPlayNextEq} onStopAutoPlay={() => setIsAutoPlaying(false)}
      />
    </div>
  );
}

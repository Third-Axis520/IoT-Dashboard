import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Trash2, Plus, ChevronDown, X, Layers, Database, LayoutDashboard, Activity, Maximize, Minimize, Search, Sun, Moon, Check, Play, Pause, Lock, Unlock, Cpu, SlidersHorizontal, Settings, Network, FileCode2 } from 'lucide-react';

import type { Equipment, MachineTemplate, PointStatus, ProductionLine } from './types';
import { cn } from './utils/cn';
import { createEquipmentFromTemplate } from './utils/simulation';
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
import { ConnectionStatusBadge } from './components/ui/ConnectionStatusBadge';

import { MoldingMatrix } from './components/visualizations/MoldingMatrix';
import { FourRings } from './components/visualizations/FourRings';
import { DualSideSpark } from './components/visualizations/DualSideSpark';
import { SingleKpi } from './components/visualizations/SingleKpi';
import { CustomGrid } from './components/visualizations/CustomGrid';
import { UnifiedSparkline } from './components/visualizations/UnifiedSparkline';
import { AddDeviceModal } from './components/modals/AddDeviceModal';
import { DeviceDefCenterModal } from './components/modals/DeviceDefCenterModal';
import { DeviceManagementModal } from './components/modals/DeviceManagementModal';
import { LimitsSettingsModal } from './components/modals/LimitsSettingsModal';
import { DrillDownModal } from './components/modals/DrillDownModal';
import { SensorMappingModal } from './components/modals/SensorMappingModal';
import { RegisterMapModal } from './components/modals/RegisterMapModal';
import { PlcTemplateModal } from './components/modals/PlcTemplateModal';
import { PropertyTypesModal } from './components/modals/PropertyTypesModal';
import DeviceIntegrationWizard from './components/modals/DeviceIntegrationWizard';
import DeviceConnectionsModal from './components/modals/DeviceConnectionsModal';
import ToastContainer from './components/ui/Toast';
import { useToast } from './hooks/useToast';
import { TempTrendsView } from './components/panels/TempTrendsView';
import { useDevices } from './hooks/useDevices';

const ALERTS_STORAGE_KEY = 'iot-dashboard-alerts';

export default function App() {
  const [templates, setTemplates] = useState<MachineTemplate[]>([]);
  const [data, setData] = useState<ProductionLine[]>([]);
  const [apiLineConfigs, setApiLineConfigs] = useState<ApiLineConfig[]>([]);
  const [alerts, setAlerts] = useState(() => {
    try {
      const stored = localStorage.getItem(ALERTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [activeLineId, setActiveLineId] = useState<string>('');
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [newLineName, setNewLineName] = useState('');
  const [viewMode, setViewMode] = useState<'dashboard' | 'temp_trends'>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showDefCenter, setShowDefCenter] = useState(false);
  const [showDeviceMgmt, setShowDeviceMgmt] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  const [showRegisterMap, setShowRegisterMap] = useState(false);
  const [showPlcTemplates, setShowPlcTemplates] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showPropertyTypes, setShowPropertyTypes] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const [drillDownEq, setDrillDownEq] = useState<Equipment | null>(null);
  const [sensorMappingEq, setSensorMappingEq] = useState<Equipment | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(8000);
  const [autoPlayEqIndex, setAutoPlayEqIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedEqIndex, setDraggedEqIndex] = useState<number | null>(null);
  const [editingEqId, setEditingEqId] = useState<string | null>(null);
  const [editEqName, setEditEqName] = useState("");
  const [editEqDeviceId, setEditEqDeviceId] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const { status: connStatus, error: connError, assetCode, latestRawSensors } = useLiveData(data, setData, setAlerts);
  const { devices, bindDevice, unbindDevice, validateAsset, registerDevice, unboundCount } = useDevices();

  // Persist alerts
  useEffect(() => {
    try { localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts.slice(-200))); } catch { /* quota exceeded */ }
  }, [alerts]);

  // Load production line structure from API on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const [types, lines] = await Promise.all([
          fetchEquipmentTypes(),
          fetchLineConfigs(),
        ]);
        setTemplates(types.map(apiTypeToTemplate));
        setApiLineConfigs(lines);
        const productionLines = lines.map(apiLineConfigToProductionLine);
        setData(productionLines);
        if (productionLines.length > 0) {
          setActiveLineId(prev => prev || productionLines[0].id);
        }
      } catch (err) {
        console.error('Failed to load config from API:', err);
      }
    }
    loadConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const liveDrillDownEq = useMemo(() => {
    if (!drillDownEq) return null;
    for (const line of data) {
      const eq = line.equipments.find(e => e.id === drillDownEq.id);
      if (eq) return eq;
    }
    return drillDownEq;
  }, [data, drillDownEq]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedEqIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, _index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDraggedEqIndex(prev => {
      if (prev === null || prev === index) return null;
      setData(prevLines => {
        const newLines = [...prevLines];
        const lineIndex = newLines.findIndex(l => l.id === activeLineId);
        if (lineIndex === -1) return prevLines;
        const newEquipments = [...newLines[lineIndex].equipments];
        const [removed] = newEquipments.splice(prev, 1);
        newEquipments.splice(index, 0, removed);
        newLines[lineIndex] = { ...newLines[lineIndex], equipments: newEquipments };
        return newLines;
      });
      return null;
    });
  }, [activeLineId]);

  const handleDragEnd = useCallback(() => setDraggedEqIndex(null), []);

  const handleSaveEqEdit = useCallback((lineId: string, eqId: string) => {
    setData(prev => prev.map(line => {
      if (line.id === lineId) {
        return { ...line, equipments: line.equipments.map(eq => eq.id === eqId ? { ...eq, name: editEqName, deviceId: editEqDeviceId } : eq) };
      }
      return line;
    }));
    setEditingEqId(null);
  }, [editEqName, editEqDeviceId]);

  const handlePointSwap = useCallback((lineId: string, eqId: string, dragIndex: number, dropIndex: number) => {
    setData(prev => prev.map(line => line.id === lineId ? {
      ...line,
      equipments: line.equipments.map(eq => {
        if (eq.id === eqId) {
          const newPoints = [...eq.points];
          const dragPoint = newPoints[dragIndex];
          const dropPoint = newPoints[dropIndex];
          if (!dragPoint || !dropPoint) return eq;
          newPoints[dragIndex] = { ...dropPoint, name: dragPoint.name, id: dragPoint.id };
          newPoints[dropIndex] = { ...dragPoint, name: dropPoint.name, id: dropPoint.id };
          return { ...eq, points: newPoints };
        }
        return eq;
      })
    } : line));
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const activeLine = useMemo(
    () => data.find(l => l.id === activeLineId) || data[0] || { id: '', name: '', equipments: [] },
    [data, activeLineId]
  );

  const displayedEquipments = useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return data.flatMap(line =>
        line.equipments
          .filter(eq => eq.deviceId.toLowerCase().includes(q) || eq.name.toLowerCase().includes(q))
          .map(eq => ({ lineId: line.id, eq }))
      );
    }
    return activeLine?.equipments.map(eq => ({ lineId: activeLine.id, eq })) || [];
  }, [data, activeLine, searchQuery]);

  const handleUpdateLimits = useCallback((lineId: string, eqId: string, pointId: string, ucl: number, lcl: number) => {
    setData(prevData => prevData.map(line => {
      if (line.id !== lineId) return line;
      return { ...line, equipments: line.equipments.map(eq => {
        if (eq.id !== eqId) return eq;
        return { ...eq, points: eq.points.map(p => p.id !== pointId ? p : { ...p, ucl, lcl }) };
      })};
    }));
  }, []);

  // LimitsSettingsModal 儲存後，同步更新所有 point 的 ucl/lcl（keyed by sensorId）
  const handleLimitsSaved = useCallback((limits: Record<number, { ucl: number; lcl: number }>) => {
    setData(prev => prev.map(line => ({
      ...line,
      equipments: line.equipments.map(eq => ({
        ...eq,
        points: eq.points.map(p => {
          if (p.sensorId === undefined) return p;
          const lim = limits[p.sensorId];
          return lim ? { ...p, ucl: lim.ucl, lcl: lim.lcl } : p;
        }),
      })),
    })));
  }, []);

  const handleSaveConfig = useCallback((updatedEq: Equipment) => {
    setData(prev => prev.map(line => line.id === activeLineId ? {
      ...line, equipments: line.equipments.map(e => e.id === updatedEq.id ? updatedEq : e)
    } : line));
    setDrillDownEq(null);
  }, [activeLineId]);

  // SensorMappingModal 儲存後，更新對應設備的 points
  const handleSaveSensorMapping = useCallback((updatedEq: Equipment) => {
    setData(prev => prev.map(line => ({
      ...line,
      equipments: line.equipments.map(eq => eq.id === updatedEq.id ? updatedEq : eq),
    })));
    setSensorMappingEq(null);
  }, []);

  const toggleAutoPlay = useCallback(() => {
    if (isAutoPlaying) {
      setIsAutoPlaying(false);
      setDrillDownEq(null);
    } else if (displayedEquipments.length > 0) {
      setIsAutoPlaying(true);
      setAutoPlayEqIndex(0);
      setDrillDownEq(displayedEquipments[0].eq);
    }
  }, [isAutoPlaying, displayedEquipments]);

  const handleAutoPlayNextEq = useCallback(() => {
    if (!isAutoPlaying || displayedEquipments.length === 0) return;
    const nextIndex = (autoPlayEqIndex + 1) % displayedEquipments.length;
    setAutoPlayEqIndex(nextIndex);
    setDrillDownEq(displayedEquipments[nextIndex].eq);
  }, [isAutoPlaying, autoPlayEqIndex, displayedEquipments]);

  const handleDeleteEquipment = useCallback((lineId: string, eqId: string) => {
    setData(prev => prev.map(line => line.id === lineId ? { ...line, equipments: line.equipments.filter(e => e.id !== eqId) } : line));
  }, []);

  const handleAddLine = useCallback(async () => {
    if (!newLineName.trim()) return;
    const name = newLineName.trim();
    const newLineId = `line-${Date.now()}`;
    // Optimistic UI
    setData(prev => [...prev, { id: newLineId, name, equipments: [] }]);
    setActiveLineId(newLineId);
    setNewLineName('');
    setIsAddingLine(false);
    // Persist to backend
    try {
      const saved = await saveLineConfig(newLineId, name, []);
      setApiLineConfigs(prev => [...prev, saved]);
    } catch (err) {
      // Revert on failure
      setData(prev => prev.filter(l => l.id !== newLineId));
      addToast('error', `新增產線失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  }, [newLineName, addToast]);

  const handleDeleteLine = useCallback(async (e: React.MouseEvent, lineId: string) => {
    e.stopPropagation();
    if (data.length <= 1) return;
    // Optimistic UI
    const snapshot = data;
    setData(prev => {
      const newLines = prev.filter(l => l.id !== lineId);
      if (activeLineId === lineId) setActiveLineId(newLines[0].id);
      return newLines;
    });
    setApiLineConfigs(prev => prev.filter(lc => lc.lineId !== lineId));
    // Persist to backend
    try {
      await deleteLineConfig(lineId);
    } catch (err) {
      // Revert on failure
      setData(snapshot);
      setApiLineConfigs(prev => {
        const lc = apiLineConfigs.find(l => l.lineId === lineId);
        return lc && !prev.find(l => l.lineId === lineId) ? [...prev, lc] : prev;
      });
      addToast('error', `刪除產線失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  }, [data, activeLineId, apiLineConfigs, addToast]);

  const handleAddDevice = useCallback(async (
    tpl: MachineTemplate,
    name: string,
    deviceId: string,
    sensorMapping: Record<number, number>,
    pointNames: string[]
  ) => {
    const newEq = createEquipmentFromTemplate(tpl, name, deviceId, sensorMapping, pointNames);
    // Optimistic UI update
    setData(prev => prev.map(line => line.id === activeLineId ? { ...line, equipments: [...line.equipments, newEq] } : line));
    setShowAddDevice(false);
    // Persist to API
    const lineConfig = apiLineConfigs.find(lc => lc.lineId === activeLineId);
    if (lineConfig && tpl.id) {
      try {
        const updated = await saveLineConfig(
          activeLineId,
          lineConfig.name,
          [
            ...lineConfig.equipments.map((le, i) => ({
              equipmentTypeId: le.equipmentTypeId,
              assetCode: le.assetCode,
              displayName: le.displayName,
              sortOrder: i,
            })),
            {
              equipmentTypeId: Number(tpl.id),
              assetCode: deviceId || null,
              displayName: name !== tpl.name ? name : null,
              sortOrder: lineConfig.equipments.length,
            },
          ]
        );
        setApiLineConfigs(prev => prev.map(lc => lc.lineId === activeLineId ? updated : lc));
      } catch (err) {
        console.error('Failed to persist equipment to API:', err);
      }
    }
  }, [activeLineId, apiLineConfigs]);

  const handleAddTemplate = useCallback((tpl: MachineTemplate) => {
    setTemplates(prev => [...prev, tpl]);
    setShowDefCenter(false);
  }, []);

  const handleLoadDemo = useCallback(async () => {
    // Reload from API to get fresh data
    try {
      const lines = await fetchLineConfigs();
      setApiLineConfigs(lines);
      setData(lines.map(apiLineConfigToProductionLine));
    } catch (err) {
      console.error('Failed to reload from API:', err);
    }
  }, []);

  const { totalPoints, alarmCount } = useMemo(() => {
    let total = 0, alarms = 0;
    activeLine.equipments.forEach(e => e.points.forEach(p => {
      total++;
      if (p.status === 'danger') alarms++;
    }));
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

  // Equipments bound to the current assetCode (for LimitsSettingsModal)
  const boundEquipments = useMemo(() =>
    assetCode ? data.flatMap(l => l.equipments).filter(eq => eq.deviceId === assetCode) : []
  , [data, assetCode]);

  return (
    <div className={cn("app-container h-screen w-screen bg-[var(--bg-root)] text-[var(--text-main)] font-sans overflow-hidden flex flex-col transition-colors duration-300", theme === 'light' && 'theme-light')}>

      {/* Top Toolbar */}
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
                      onClick={() => setActiveLineId(line.id)}
                      className={cn(
                        "flex-1 text-left px-3 py-2 rounded-md transition-colors text-sm",
                        activeLineId === line.id ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : "hover:bg-[var(--border-base)] text-[var(--text-main)]"
                      )}
                    >
                      {line.name}
                    </button>
                    {isEditMode && data.length > 1 && (
                      <button
                        onClick={(e) => handleDeleteLine(e, line.id)}
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
                      onChange={e => setNewLineName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddLine();
                        if (e.key === 'Escape') setIsAddingLine(false);
                      }}
                      className="flex-1 min-w-0 bg-[var(--bg-root)] border border-[var(--border-input)] rounded px-2 py-1 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
                      placeholder="产线名称"
                    />
                    <button onClick={handleAddLine} className="p-1 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 rounded shrink-0" aria-label="Confirm">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => setIsAddingLine(false)} className="p-1 text-[var(--text-muted)] hover:bg-[var(--border-base)] rounded shrink-0" aria-label="Cancel">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsAddingLine(true); }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-md transition-colors"
                  >
                    <Plus className="w-3 h-3" /> 添加产线
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex bg-[var(--bg-panel)] p-0.5 rounded-lg border border-[var(--border-base)]">
            <button
              onClick={() => setViewMode('dashboard')}
              className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-xs font-medium", viewMode === 'dashboard' ? "bg-[var(--border-base)] text-[var(--accent-green)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]")}
              title="仪表盘视图"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">仪表盘</span>
            </button>
            <button
              onClick={() => setViewMode('temp_trends')}
              className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-xs font-medium", viewMode === 'temp_trends' ? "bg-[var(--border-base)] text-[var(--accent-green)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]")}
              title="温度趋势视图"
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">趋势</span>
            </button>
          </div>

          {/* Stats */}
          <div className="hidden md:flex items-center gap-2.5 text-xs">
            <span className="font-mono font-bold text-[var(--accent-blue)]" title="监控点位数">{totalPoints} pts</span>
            <div className="w-px h-3 bg-[var(--border-base)]" />
            <div className="flex items-center gap-1" title="当前报警数">
              <div className={cn("w-1.5 h-1.5 rounded-full", alarmCount > 0 ? "bg-[var(--accent-red)] animate-pulse" : "bg-[var(--accent-green)]")} />
              <span className={cn("font-mono font-bold", alarmCount > 0 ? "text-[var(--accent-red)]" : "text-[var(--accent-green)]")}>{alarmCount}</span>
            </div>
            {shoeTotal > 0 && (
              <>
                <div className="w-px h-3 bg-[var(--border-base)]" />
                <div
                  className="flex items-center gap-1.5"
                  title={`鞋子在位：${shoePresent}/${shoeTotal} 台`}
                >
                  <span className="text-[var(--text-muted)] tracking-widest">
                    {activeLine.equipments.map(eq => {
                      const v = eq.materialDetectSensorId !== undefined
                        ? latestRawSensors.get(eq.deviceId)?.get(eq.materialDetectSensorId)
                        : undefined;
                      if (v === undefined) return null;
                      return (
                        <span
                          key={eq.id}
                          className={cn(
                            "inline-block w-1.5 h-1.5 rounded-full mx-[1px]",
                            v === 1 ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)] animate-pulse"
                          )}
                        />
                      );
                    })}
                  </span>
                  <span className={cn(
                    "font-mono font-bold",
                    shoePresent < shoeTotal ? "text-[var(--accent-red)]" : "text-[var(--accent-green)]"
                  )}>
                    {shoePresent}/{shoeTotal}
                  </span>
                  <span className="text-[var(--text-muted)]">在位</span>
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
              placeholder="搜索设备..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] transition-colors w-32 focus:w-44"
              style={{ transition: 'width 0.2s ease' }}
            />
          </div>

          <div className="w-px h-4 bg-[var(--border-base)]" />

          {/* Icon-only secondary actions */}
          <button
            onClick={() => setShowDefCenter(true)}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors"
            title="设备定义中心"
            aria-label="设备定义中心"
          >
            <Database className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowDeviceMgmt(true)}
            className="relative flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors"
            title="设备管理"
            aria-label="设备管理"
          >
            <Cpu className="w-4 h-4" />
            {unboundCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--accent-red)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unboundCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowLimits(true)}
            disabled={!assetCode}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={assetCode ? '限值設定（UCL/LCL）' : '等待設備連線後可用'}
            aria-label="限值設定"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowRegisterMap(true)}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors"
            title="暫存器對應設定"
            aria-label="暫存器對應設定"
          >
            <Network className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowPlcTemplates(true)}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors"
            title="PLC 型號管理"
            aria-label="PLC 型號管理"
          >
            <FileCode2 className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-[var(--border-base)]" />

          {/* Primary CTA: Add Device Dropdown */}
          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:bg-[var(--accent-green)]/20 rounded-md transition-colors font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> 新增設備 <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[180px]">
              <button
                onClick={() => setShowWizard(true)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-card)] rounded-t-lg"
              >
                整合新設備
              </button>
              <button
                onClick={() => setShowAddDevice(true)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-card)] rounded-b-lg"
              >
                加入既有類型
              </button>
            </div>
          </div>

          {/* Management buttons */}
          <button
            onClick={() => setShowPropertyTypes(true)}
            className="px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-base)] rounded-md transition-colors"
          >
            屬性管理
          </button>
          <button
            onClick={() => setShowConnections(true)}
            className="px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-base)] rounded-md transition-colors"
          >
            連線管理
          </button>

          <div className="w-px h-4 bg-[var(--border-base)]" />

          {/* Auto-play: icon + compact speed */}
          <div className="flex items-center bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md overflow-hidden">
            <button
              onClick={toggleAutoPlay}
              className={cn(
                "flex items-center justify-center w-8 h-8 transition-colors border-r border-[var(--border-base)]",
                isAutoPlaying
                  ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20"
                  : "text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10"
              )}
              title={isAutoPlaying ? "停止自动播放" : "自动播放设备趋势"}
              aria-label={isAutoPlaying ? "Stop auto-play" : "Start auto-play"}
            >
              {isAutoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <select
              value={autoPlaySpeed}
              onChange={(e) => setAutoPlaySpeed(Number(e.target.value))}
              className="bg-transparent text-[var(--text-main)] text-xs px-1.5 py-1.5 outline-none cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
              title="播放速度"
            >
              <option value={16000} className="bg-[var(--bg-panel)]">0.5×</option>
              <option value={8000} className="bg-[var(--bg-panel)]">1×</option>
              <option value={4000} className="bg-[var(--bg-panel)]">2×</option>
              <option value={2000} className="bg-[var(--bg-panel)]">4×</option>
            </select>
          </div>

          {/* Utility icons */}
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={cn(
              "flex items-center justify-center w-8 h-8 border rounded-md transition-colors",
              isEditMode
                ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/50 hover:bg-[var(--accent-red)]/20"
                : "bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-base)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50"
            )}
            title={isEditMode ? "锁定布局" : "解锁布局（编辑模式）"}
            aria-label={isEditMode ? "Lock layout" : "Unlock layout"}
          >
            {isEditMode ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="flex items-center justify-center w-8 h-8 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50 transition-colors"
            title={theme === 'dark' ? "浅色主题" : "深色主题"}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex items-center justify-center w-8 h-8 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50 transition-colors"
            title={isFullscreen ? "退出全屏" : "全屏显示"}
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Device Grid Area */}
      <main className="flex-1 min-h-0 p-4 md:p-6 overflow-hidden flex flex-col">
        {displayedEquipments.length === 0 ? (
          searchQuery ? (
            /* 搜尋無結果 */
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-base">找不到符合「{searchQuery}」的設備</p>
              <p className="text-sm mt-1 opacity-60">請確認設備名稱或 AssetCode</p>
            </div>
          ) : (
            /* 產線空白 — 引導式首次使用畫面 */
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
              {/* 圖示區 */}
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-base)] flex items-center justify-center shadow-lg">
                  <Activity className="w-12 h-12 text-[var(--border-base)]" />
                </div>
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[var(--accent-green)]/20 border border-[var(--accent-green)]/40 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-[var(--accent-green)]" />
                </div>
              </div>

              {/* 說明文字 */}
              <div className="text-center">
                <p className="text-xl font-bold text-[var(--text-main)] mb-1">歡迎使用 IoT 監控儀表板</p>
                <p className="text-sm text-[var(--text-muted)]">「{activeLine.name}」目前沒有任何設備，從這裡開始建立你的監控畫面</p>
              </div>

              {/* 主要 CTA */}
              <button
                onClick={() => setShowAddDevice(true)}
                className="flex items-center gap-2.5 px-6 py-3 bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-xl hover:bg-[var(--accent-green-hover)] transition-colors shadow-lg shadow-[var(--accent-green)]/20 text-base"
              >
                <Plus className="w-5 h-5" />
                新增第一台設備
              </button>

              {/* 分隔線 */}
              <div className="flex items-center gap-4 w-64">
                <div className="flex-1 h-px bg-[var(--border-base)]" />
                <span className="text-xs text-[var(--text-muted)]">或</span>
                <div className="flex-1 h-px bg-[var(--border-base)]" />
              </div>

              {/* 次要 CTA — 載入示範資料 */}
              <div className="text-center">
                <button
                  onClick={handleLoadDemo}
                  className="px-5 py-2.5 border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50 hover:bg-[var(--accent-blue)]/5 rounded-lg transition-colors text-sm font-medium"
                >
                  載入示範資料
                </button>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 opacity-60">快速預覽儀表板的完整功能</p>
              </div>
            </div>
          )
        ) : viewMode === 'temp_trends' ? (
          <TempTrendsView displayedEquipments={displayedEquipments} alerts={alerts} onUpdateLimits={handleUpdateLimits} />
        ) : (
          <div
            className="grid gap-4 md:gap-6 w-full h-full animate-in fade-in duration-500"
            style={getGridStyle(displayedEquipments.length)}
          >
            {displayedEquipments.map(({ lineId, eq }, index) => {
              const hasDanger = eq.points.some(p => p.status === 'danger');
              const hasWarning = eq.points.some(p => p.status === 'warning');
              const eqStatus = hasDanger ? 'danger' : hasWarning ? 'warning' : 'normal';

              const shoeRaw = eq.materialDetectSensorId !== undefined
                ? latestRawSensors.get(eq.deviceId)?.get(eq.materialDetectSensorId)
                : undefined;
              const shoeStatus = shoeRaw === 1 ? 'present' : shoeRaw === 0 ? 'absent' : null;

              return (
                <div
                  key={eq.id}
                  draggable={isEditMode && !searchQuery}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex flex-col glass-card rounded-xl overflow-hidden transition-all duration-300 group cursor-pointer h-full w-full relative",
                    eqStatus === 'danger' ? "danger-gradient-border" : "border-[var(--border-base)] hover:border-[var(--accent-green)]/50",
                    draggedEqIndex === index ? "opacity-50 scale-95" : "",
                    shoeStatus === 'absent' ? "opacity-60 grayscale-[30%]" : ""
                  )}
                  onClick={() => setDrillDownEq(eq)}
                >
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-base)] bg-[var(--bg-panel)]/50 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        eqStatus === 'danger' ? "bg-[var(--accent-red)] shadow-[0_0_8px_var(--accent-red)] animate-pulse" :
                        eqStatus === 'warning' ? "bg-[var(--accent-yellow)]" : "bg-[var(--accent-green)]"
                      )} />
                      {editingEqId === eq.id ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input autoFocus value={editEqName} onChange={(e) => setEditEqName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEqEdit(lineId, eq.id); if (e.key === 'Escape') setEditingEqId(null); }}
                            className="bg-[var(--bg-root)] border border-[var(--border-input)] rounded px-2 py-0.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] w-24"
                            placeholder="Name" />
                          <input value={editEqDeviceId} onChange={(e) => setEditEqDeviceId(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEqEdit(lineId, eq.id); if (e.key === 'Escape') setEditingEqId(null); }}
                            className="bg-[var(--bg-root)] border border-[var(--border-input)] rounded px-2 py-0.5 text-[10px] font-mono text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] w-24"
                            placeholder="Device ID" />
                          <button onClick={() => handleSaveEqEdit(lineId, eq.id)} className="p-1 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 rounded" aria-label="Save"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditingEqId(null)} className="p-1 text-[var(--text-muted)] hover:bg-[var(--border-base)] rounded" aria-label="Cancel"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <>
                          <span
                            className={cn("text-sm font-bold text-[var(--text-main)] tracking-wide transition-colors", isEditMode ? "hover:text-[var(--accent-green)] cursor-text" : "")}
                            onClick={(e) => { if (!isEditMode) return; e.stopPropagation(); setEditingEqId(eq.id); setEditEqName(eq.name); setEditEqDeviceId(eq.deviceId); }}
                          >{eq.name}</span>
                          <span
                            className={cn(
                              "text-[10px] font-mono ml-1 border px-1 rounded bg-[var(--border-base)]/50 transition-colors",
                              eq.deviceId
                                ? "text-[var(--text-muted)] border-[var(--border-base)]"
                                : "text-[var(--accent-yellow)]/70 border-[var(--accent-yellow)]/30",
                              isEditMode ? "hover:border-[var(--accent-green)]/50 hover:text-[var(--text-main)] cursor-text" : ""
                            )}
                            onClick={(e) => { if (!isEditMode) return; e.stopPropagation(); setEditingEqId(eq.id); setEditEqName(eq.name); setEditEqDeviceId(eq.deviceId); }}
                            title={eq.deviceId ? eq.deviceId : '尚未設定 AssetCode'}
                          >
                            {eq.deviceId || '未綁定'}
                          </span>
                        </>
                      )}
                    </div>
                    {shoeStatus !== null && (
                      <span
                        className={cn(
                          "flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border",
                          shoeStatus === 'present'
                            ? "border-[#00FF66]/30 bg-[#00FF66]/10 text-[#00FF66]"
                            : "border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 text-[var(--accent-red)]"
                        )}
                        title={shoeStatus === 'present' ? '鞋子在位 (40013=1)' : '鞋子缺位 (40013=0)'}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          shoeStatus === 'present' ? "bg-[#00FF66]" : "bg-[var(--accent-red)] animate-pulse"
                        )} />
                        {shoeStatus === 'present' ? '有鞋' : '無鞋'}
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Sensor mapping button — always available on hover */}
                      <button
                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded transition-colors"
                        onClick={(e) => { e.stopPropagation(); setSensorMappingEq(eq); }}
                        title="感測器對應設定"
                        aria-label="Sensor mapping settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      {isEditMode && (
                        <button
                          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 rounded"
                          onClick={(e) => { e.stopPropagation(); handleDeleteEquipment(lineId, eq.id); }}
                          aria-label="Delete equipment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 p-4 min-h-0 flex flex-col justify-center">
                    {eq.visType === 'molding_matrix' && <MoldingMatrix points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => handlePointSwap(lineId, eq.id, drag, drop)} />}
                    {eq.visType === 'four_rings' && <FourRings points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => handlePointSwap(lineId, eq.id, drag, drop)} />}
                    {eq.visType === 'dual_side_spark' && <DualSideSpark points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => handlePointSwap(lineId, eq.id, drag, drop)} />}
                    {eq.visType === 'single_kpi' && <SingleKpi points={eq.points} />}
                    {eq.visType === 'custom_grid' && <CustomGrid points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => handlePointSwap(lineId, eq.id, drag, drop)} />}
                  </div>

                  <UnifiedSparkline points={eq.points} visType={eq.visType} />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      {showAddDevice && (
        <AddDeviceModal
          templates={templates}
          devices={devices}
          latestRawSensors={latestRawSensors}
          onClose={() => setShowAddDevice(false)}
          onAdd={handleAddDevice}
        />
      )}
      {showDefCenter && <DeviceDefCenterModal onClose={() => setShowDefCenter(false)} onSave={handleAddTemplate} />}
      {showDeviceMgmt && (
        <DeviceManagementModal
          onClose={() => setShowDeviceMgmt(false)}
          devices={devices}
          onBind={bindDevice}
          onUnbind={unbindDevice}
          onRegister={registerDevice}
          validateAsset={validateAsset}
        />
      )}
      {liveDrillDownEq && (
        <DrillDownModal
          equipment={liveDrillDownEq}
          onClose={() => { setDrillDownEq(null); setIsAutoPlaying(false); }}
          onSaveConfig={handleSaveConfig}
          assetCode={assetCode}
          isAutoPlaying={isAutoPlaying}
          autoPlaySpeed={autoPlaySpeed}
          onAutoPlayNextEq={handleAutoPlayNextEq}
          onStopAutoPlay={() => setIsAutoPlaying(false)}
        />
      )}
      {showLimits && assetCode && (
        <LimitsSettingsModal
          assetCode={assetCode}
          equipments={boundEquipments}
          onClose={() => setShowLimits(false)}
          onSaved={handleLimitsSaved}
        />
      )}
      {sensorMappingEq && (
        <SensorMappingModal
          equipment={sensorMappingEq}
          latestRawSensors={latestRawSensors}
          onClose={() => setSensorMappingEq(null)}
          onSave={handleSaveSensorMapping}
        />
      )}
      {showPlcTemplates && (
        <PlcTemplateModal onClose={() => setShowPlcTemplates(false)} />
      )}
      {showRegisterMap && (
        <RegisterMapModal
          line={activeLine}
          onClose={() => setShowRegisterMap(false)}
        />
      )}
      {showWizard && (
        <DeviceIntegrationWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            addToast('success', '設備整合成功！新連線已建立。');
            // Reload configs
            Promise.all([fetchEquipmentTypes(), fetchLineConfigs()]).then(([types, lines]) => {
              setTemplates(types.map(apiTypeToTemplate));
              setApiLineConfigs(lines);
              setData(lines.map(apiLineConfigToProductionLine));
            });
          }}
        />
      )}
      {showPropertyTypes && (
        <PropertyTypesModal onClose={() => setShowPropertyTypes(false)} />
      )}
      {showConnections && (
        <DeviceConnectionsModal onClose={() => setShowConnections(false)} />
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

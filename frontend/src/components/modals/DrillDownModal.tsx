import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, ReferenceLine, ReferenceArea } from 'recharts';
import { X, Play, Pause, Save, RefreshCw, CheckCircle } from 'lucide-react';
import type { Equipment } from '../../types';
import { cn } from '../../utils/cn';
import { getStatusColor } from '../../constants/templates';
import { savePointLimits } from '../../hooks/useSensorLimits';

interface DrillDownModalProps {
  equipment: Equipment;
  onClose: () => void;
  onSaveConfig: (eq: Equipment) => void;
  /** 若提供，Save Thresholds 時同步持久化到後端 DB */
  assetCode?: string | null;
  isAutoPlaying?: boolean;
  autoPlaySpeed?: number;
  onAutoPlayNextEq?: () => void;
  onStopAutoPlay?: () => void;
}

export const DrillDownModal = ({
  equipment,
  onClose,
  onSaveConfig,
  assetCode,
  isAutoPlaying = false,
  autoPlaySpeed = 8000,
  onAutoPlayNextEq,
  onStopAutoPlay
}: DrillDownModalProps) => {
  const [localEq, setLocalEq] = useState<Equipment>(JSON.parse(JSON.stringify(equipment)));
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalEq(prev => {
      if (prev.id !== equipment.id) {
        setProgress(0);
        return JSON.parse(JSON.stringify(equipment));
      }
      return {
        ...prev,
        points: prev.points.map(prevPt => {
          const newPt = equipment.points.find(p => p.id === prevPt.id);
          if (!newPt) return prevPt;
          return { ...prevPt, value: newPt.value, history: newPt.history, status: newPt.status };
        })
      };
    });
  }, [equipment]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const DWELL_TIME = autoPlaySpeed;
    const TICK_RATE = 50;
    const step = (TICK_RATE / DWELL_TIME) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev + step >= 100) {
          setTimeout(() => { if (onAutoPlayNextEq) onAutoPlayNextEq(); }, 0);
          return 0;
        }
        return prev + step;
      });
    }, TICK_RATE);

    return () => clearInterval(timer);
  }, [isAutoPlaying, onAutoPlayNextEq, autoPlaySpeed]);

  const handleThresholdChange = (pointId: string, field: 'ucl' | 'lcl', value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setSaved(false);
    setLocalEq(prev => ({
      ...prev,
      points: prev.points.map(p => p.id === pointId ? { ...p, [field]: num } : p)
    }));
  };

  const handleSave = useCallback(async () => {
    onSaveConfig(localEq);
    if (!assetCode) return;
    setSaving(true);
    setSaved(false);
    try {
      await savePointLimits(assetCode, localEq.points
        .filter(p => p.sensorId !== undefined)
        .map(p => ({ sensorId: p.sensorId!, label: p.name, unit: p.unit, ucl: p.ucl, lcl: p.lcl })));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // 靜默失敗：local state 已更新，DB 持久化失敗不阻斷使用
    } finally {
      setSaving(false);
    }
  }, [localEq, assetCode, onSaveConfig]);

  const getGridStyle = (count: number) => {
    if (count === 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
    if (count === 2) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' };
    if (count === 3) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr' };
    if (count === 4) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
    if (count <= 6) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr 1fr' };
    if (count <= 8) return { gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: '1fr 1fr' };
    if (count <= 9) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
    return { gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/90 backdrop-blur-md p-4 md:p-6" role="dialog" aria-modal="true" aria-labelledby="drilldown-title">
      <div className="bg-[var(--bg-card)]/90 border border-[var(--border-base)] rounded-2xl w-[94vw] max-w-[1800px] h-[94vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 relative">
        {isAutoPlaying && (
          <div className="absolute top-0 left-0 h-1 bg-[var(--accent-blue)] transition-all duration-75 ease-linear z-50" style={{ width: `${progress}%` }} />
        )}
        <div className="flex justify-between items-center p-6 border-b border-[var(--border-base)] shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 id="drilldown-title" className="font-bold text-[var(--text-main)]" style={{ fontSize: 'clamp(20px, 2vw, 32px)' }}>{localEq.name}</h2>
              <span className="text-[var(--text-muted)] font-mono border border-[var(--border-base)] px-2 py-0.5 rounded bg-[var(--border-base)]/50" style={{ fontSize: 'clamp(10px, 1vw, 16px)' }}>{localEq.deviceId}</span>
              {isAutoPlaying && (
                <span className="flex items-center gap-1 font-bold text-[var(--accent-blue)] bg-[var(--accent-blue)]/10 px-2 py-1 rounded-full animate-pulse" style={{ fontSize: 'clamp(10px, 1vw, 16px)' }}>
                  <Play className="w-3 h-3" /> Auto-Playing
                </span>
              )}
            </div>
            <p className="text-[var(--text-muted)] mt-1" style={{ fontSize: 'clamp(12px, 1.2vw, 18px)' }}>Unified Trend Matrix (Drill-down)</p>
          </div>
          <div className="flex items-center gap-3">
            {isAutoPlaying ? (
              <button onClick={onStopAutoPlay} className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/50 font-bold rounded-lg text-sm hover:bg-[var(--accent-red)]/30 transition-colors">
                <Pause className="w-4 h-4" /> Stop Auto-Play
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-lg text-sm hover:bg-[var(--accent-green-hover)] disabled:opacity-70 transition-colors"
              >
                {saving
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : saved
                    ? <CheckCircle className="w-4 h-4" />
                    : <Save className="w-4 h-4" />
                }
                {saving ? '儲存中...' : saved ? '已儲存' : 'Save Thresholds'}
              </button>
            )}
            <button onClick={onClose} className="p-2 bg-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg transition-colors" aria-label="Close">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div
          className="flex-1 min-h-0 p-6 grid gap-4 md:gap-6"
          style={getGridStyle(localEq.points.length)}
        >
          {localEq.points.map(point => (
            <div key={point.id} className="relative glass-card rounded-xl flex flex-col min-h-0 animate-in fade-in duration-300" style={{ containerType: 'inline-size' }}>
              {point.status === 'danger' && (
                <div className="absolute inset-0 rounded-xl border-2 border-[var(--accent-red)] shadow-[0_0_15px_var(--accent-red)] animate-pulse pointer-events-none z-10" />
              )}
              <div className="p-4 flex flex-col h-full w-full relative z-20">
                <div className="flex justify-between items-center mb-2 md:mb-4 shrink-0">
                  <div className="flex flex-col">
                    <span className="font-medium text-[var(--text-main)]" style={{ fontSize: 'clamp(14px, 4cqw, 24px)' }}>{point.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--accent-red)] opacity-80" style={{ fontSize: 'clamp(10px, 2.5cqw, 16px)' }}>UCL:</span>
                        <input
                          type="number"
                          value={point.ucl}
                          onChange={(e) => handleThresholdChange(point.id, 'ucl', e.target.value)}
                          className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded px-1 py-0.5 text-[var(--accent-red)] opacity-80 outline-none focus:border-[var(--accent-blue)] transition-colors"
                          style={{ width: 'clamp(4rem, 12cqw, 6rem)', fontSize: 'clamp(10px, 2.5cqw, 16px)' }}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--accent-red)] opacity-80" style={{ fontSize: 'clamp(10px, 2.5cqw, 16px)' }}>LCL:</span>
                        <input
                          type="number"
                          value={point.lcl}
                          onChange={(e) => handleThresholdChange(point.id, 'lcl', e.target.value)}
                          className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded px-1 py-0.5 text-[var(--accent-red)] opacity-80 outline-none focus:border-[var(--accent-blue)] transition-colors"
                          style={{ width: 'clamp(4rem, 12cqw, 6rem)', fontSize: 'clamp(10px, 2.5cqw, 16px)' }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={cn("font-mono font-bold text-glow")} style={{ color: getStatusColor(point.status), fontSize: 'clamp(24px, 8cqw, 64px)', lineHeight: 1 }}>{point.value.toFixed(1)}</span>
                    <span className="text-[var(--text-muted)]" style={{ fontSize: 'clamp(12px, 3cqw, 24px)' }}>{point.unit}</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <LineChart data={point.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="time" tickFormatter={(t) => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} stroke="var(--bg-scrollbar)" tick={{fill: 'var(--text-muted)', fontSize: 'clamp(10px, 2.5cqw, 16px)'}} minTickGap={30} />
                      <YAxis
                        domain={[
                          (dataMin: number) => Math.min(dataMin, point.lcl) - Math.max((point.ucl - point.lcl) * 0.1, 5),
                          (dataMax: number) => Math.max(dataMax, point.ucl) + Math.max((point.ucl - point.lcl) * 0.1, 5)
                        ]}
                        stroke="var(--bg-scrollbar)"
                        tick={{fill: 'var(--text-muted)', fontSize: 'clamp(10px, 2.5cqw, 16px)'}}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--bg-root)', borderColor: 'var(--border-trend)', color: 'var(--text-main)', borderRadius: '6px', fontSize: 'clamp(12px, 3cqw, 18px)' }}
                        itemStyle={{ color: 'var(--accent-green)' }}
                        labelFormatter={(l) => new Date(l).toLocaleTimeString()}
                      />
                      <ReferenceArea y1={point.ucl} y2={999999} fill="var(--accent-red)" fillOpacity={0.08} />
                      <ReferenceArea y1={-999999} y2={point.lcl} fill="var(--accent-red)" fillOpacity={0.08} />
                      <ReferenceLine y={point.ucl} stroke="var(--accent-red)" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />
                      <ReferenceLine y={point.lcl} stroke="var(--accent-red)" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />
                      <Line type="linear" dataKey="value" stroke={point.status === 'danger' ? "var(--accent-red)" : "var(--accent-blue)"} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

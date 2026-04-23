import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Settings, Trash2 } from 'lucide-react';

import type { Equipment } from '../../types';
import { cn } from '../../utils/cn';
import { MoldingMatrix } from '../visualizations/MoldingMatrix';
import { FourRings } from '../visualizations/FourRings';
import { DualSideSpark } from '../visualizations/DualSideSpark';
import { SingleKpi } from '../visualizations/SingleKpi';
import { CustomGrid } from '../visualizations/CustomGrid';
import { UnifiedSparkline } from '../visualizations/UnifiedSparkline';

export interface EquipmentCardProps {
  eq: Equipment;
  lineId: string;
  index: number;
  latestRawSensors: Map<string, Map<number, number>>;

  // Edit mode
  isEditMode: boolean;
  editingEqId: string | null;
  editEqName: string;
  editEqDeviceId: string;
  onStartEdit: (eqId: string, name: string, deviceId: string) => void;
  onSaveEdit: (lineId: string, eqId: string) => void;
  onCancelEdit: () => void;
  onEditNameChange: (name: string) => void;
  onEditDeviceIdChange: (deviceId: string) => void;

  // Drag
  isSearching: boolean;
  draggedIndex: number | null;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;

  // Actions
  onDrillDown: (eq: Equipment) => void;
  onSensorMapping: (eq: Equipment) => void;
  onDelete: (lineId: string, eqId: string, name: string) => void;
  onPointSwap: (lineId: string, eqId: string, drag: number, drop: number) => void;
}

const EquipmentCard = React.memo(function EquipmentCard({
  eq,
  lineId,
  index,
  latestRawSensors,
  isEditMode,
  editingEqId,
  editEqName,
  editEqDeviceId,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditNameChange,
  onEditDeviceIdChange,
  isSearching,
  draggedIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDrillDown,
  onSensorMapping,
  onDelete,
  onPointSwap,
}: EquipmentCardProps) {
  const { t } = useTranslation();

  const hasDanger = eq.points.some(p => p.status === 'danger');
  const hasWarning = eq.points.some(p => p.status === 'warning');
  const eqStatus = hasDanger ? 'danger' : hasWarning ? 'warning' : 'normal';

  const shoeRaw = eq.materialDetectSensorId !== undefined
    ? latestRawSensors.get(eq.deviceId)?.get(eq.materialDetectSensorId)
    : undefined;
  const shoeStatus = shoeRaw === 1 ? 'present' : shoeRaw === 0 ? 'absent' : null;

  return (
    <div
      draggable={isEditMode && !isSearching}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={cn(
        "flex flex-col glass-card rounded-xl overflow-hidden transition-all duration-300 group cursor-pointer h-full w-full relative",
        eqStatus === 'danger' ? "danger-gradient-border" : "border-[var(--border-base)] hover:border-[var(--accent-green)]/50",
        draggedIndex === index ? "opacity-50 scale-95" : "",
        shoeStatus === 'absent' ? "opacity-60 grayscale-[30%]" : ""
      )}
      onClick={() => onDrillDown(eq)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-base)] bg-[var(--bg-panel)]/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            eqStatus === 'danger' ? "bg-[var(--accent-red)] shadow-[0_0_8px_var(--accent-red)] animate-pulse" :
            eqStatus === 'warning' ? "bg-[var(--accent-yellow)]" : "bg-[var(--accent-green)]"
          )} />
          {editingEqId === eq.id ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input autoFocus value={editEqName} onChange={(e) => onEditNameChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(lineId, eq.id); if (e.key === 'Escape') onCancelEdit(); }}
                className="bg-[var(--bg-root)] border border-[var(--border-input)] rounded px-2 py-0.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] w-24"
                placeholder="Name" />
              <input value={editEqDeviceId} onChange={(e) => onEditDeviceIdChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(lineId, eq.id); if (e.key === 'Escape') onCancelEdit(); }}
                className="bg-[var(--bg-root)] border border-[var(--border-input)] rounded px-2 py-0.5 text-[10px] font-mono text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] w-24"
                placeholder="Device ID" />
              <button onClick={() => onSaveEdit(lineId, eq.id)} className="p-1 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 rounded" aria-label="Save"><Check className="w-3 h-3" /></button>
              <button onClick={() => onCancelEdit()} className="p-1 text-[var(--text-muted)] hover:bg-[var(--border-base)] rounded" aria-label="Cancel"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <>
              <span
                className={cn("text-sm font-bold text-[var(--text-main)] tracking-wide transition-colors", isEditMode ? "hover:text-[var(--accent-green)] cursor-text" : "")}
                onClick={(e) => { if (!isEditMode) return; e.stopPropagation(); onStartEdit(eq.id, eq.name, eq.deviceId); }}
              >{eq.name}</span>
              <span
                className={cn(
                  "text-[10px] font-mono ml-1 border px-1 rounded bg-[var(--border-base)]/50 transition-colors",
                  eq.deviceId
                    ? "text-[var(--text-muted)] border-[var(--border-base)]"
                    : "text-[var(--accent-yellow)]/70 border-[var(--accent-yellow)]/30",
                  isEditMode ? "hover:border-[var(--accent-green)]/50 hover:text-[var(--text-main)] cursor-text" : ""
                )}
                onClick={(e) => { if (!isEditMode) return; e.stopPropagation(); onStartEdit(eq.id, eq.name, eq.deviceId); }}
                title={eq.deviceId ? eq.deviceId : t('app.noAssetCode')}
              >
                {eq.deviceId || t('app.notBound')}
              </span>
            </>
          )}
        </div>
        {shoeStatus !== null && (
          <span
            className={cn(
              "flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border",
              shoeStatus === 'present'
                ? "border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10 text-[var(--accent-green)]"
                : "border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 text-[var(--accent-red)]"
            )}
            title={shoeStatus === 'present' ? t('app.shoePresentTooltip') : t('app.shoeAbsentTooltip')}
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              shoeStatus === 'present' ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)] animate-pulse"
            )} />
            {shoeStatus === 'present' ? t('app.shoePresent') : t('app.shoeAbsent')}
          </span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded transition-colors"
            onClick={(e) => { e.stopPropagation(); onSensorMapping(eq); }}
            title={t('app.sensorMapping')}
            aria-label="Sensor mapping settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          {isEditMode && (
            <button
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 rounded"
              onClick={(e) => { e.stopPropagation(); onDelete(lineId, eq.id, eq.name); }}
              aria-label="Delete equipment"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Visualization body */}
      <div className="flex-1 p-4 min-h-0 flex flex-col justify-center">
        {eq.visType === 'molding_matrix' && <MoldingMatrix points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => onPointSwap(lineId, eq.id, drag, drop)} />}
        {eq.visType === 'four_rings' && <FourRings points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => onPointSwap(lineId, eq.id, drag, drop)} />}
        {eq.visType === 'dual_side_spark' && <DualSideSpark points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => onPointSwap(lineId, eq.id, drag, drop)} />}
        {eq.visType === 'single_kpi' && <SingleKpi points={eq.points} />}
        {eq.visType === 'custom_grid' && <CustomGrid points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => onPointSwap(lineId, eq.id, drag, drop)} />}
      </div>

      {/* Sparkline footer */}
      <UnifiedSparkline points={eq.points} visType={eq.visType} />
    </div>
  );
});

export default EquipmentCard;

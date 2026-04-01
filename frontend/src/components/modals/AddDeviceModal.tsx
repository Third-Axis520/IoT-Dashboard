import React, { useState, useMemo, useEffect } from 'react';
import { Plus, X, ArrowLeft, ArrowRight, Check, Cpu, Link2, Sliders } from 'lucide-react';
import type { MachineTemplate } from '../../types';
import { SENSOR_CONFIG } from '../../constants/sensorConfig';
import type { DeviceDto } from '../../hooks/useDevices';
import { cn } from '../../utils/cn';

interface AddDeviceModalProps {
  templates: MachineTemplate[];
  devices: DeviceDto[];
  latestRawSensors: Map<string, Map<number, number>>;
  onClose: () => void;
  onAdd: (
    tpl: MachineTemplate,
    name: string,
    assetCode: string,
    sensorMapping: Record<number, number>,
    pointNames: string[]
  ) => void;
}

const STEPS = [
  { label: '基本資訊', Icon: Cpu },
  { label: '連結設備', Icon: Link2 },
  { label: '感測器對應', Icon: Sliders },
];

export const AddDeviceModal = ({
  templates,
  devices,
  latestRawSensors,
  onClose,
  onAdd,
}: AddDeviceModalProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [deviceName, setDeviceName] = useState('');
  const [selectedTplId, setSelectedTplId] = useState(templates[0]?.id ?? '');

  // Step 2
  const [assetCodeMode, setAssetCodeMode] = useState<'list' | 'manual'>('list');
  const [selectedSerial, setSelectedSerial] = useState('');
  const [manualAssetCode, setManualAssetCode] = useState('');

  // Step 3
  const [sensorMapping, setSensorMapping] = useState<Record<number, number>>({});
  const [pointNames, setPointNames] = useState<string[]>([]);

  const selectedTpl = templates.find(t => t.id === selectedTplId);

  // Reset sensor mapping when template changes
  useEffect(() => {
    if (selectedTpl) {
      setPointNames(selectedTpl.points.map(p => p.name));
      setSensorMapping({});
    }
  }, [selectedTplId]); // eslint-disable-line react-hooks/exhaustive-deps

  const boundDevices = devices.filter(d => d.assetCode !== null);

  const assetCode = useMemo(() => {
    if (assetCodeMode === 'list') {
      return devices.find(d => d.serialNumber === selectedSerial)?.assetCode ?? '';
    }
    return manualAssetCode.trim();
  }, [assetCodeMode, selectedSerial, manualAssetCode, devices]);

  const liveSensors = assetCode ? latestRawSensors.get(assetCode) : undefined;

  const sensorIds = useMemo(() => {
    if (liveSensors && liveSensors.size > 0) {
      return Array.from(liveSensors.keys()).sort((a, b) => a - b);
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [liveSensors]);

  const usedSensorIds = Object.values(sensorMapping);
  const duplicates = usedSensorIds.filter((id, idx) => usedSensorIds.indexOf(id) !== idx);
  const unsetCount = selectedTpl
    ? selectedTpl.points.filter((_, idx) => sensorMapping[idx] === undefined).length
    : 0;

  const canProceedToStep2 = deviceName.trim().length > 0 && !!selectedTpl;
  const canFinish = duplicates.length === 0;

  const handleFinish = () => {
    if (!selectedTpl || !canFinish) return;
    onAdd(selectedTpl, deviceName.trim(), assetCode, sensorMapping, pointNames);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-device-title"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 id="add-device-title" className="font-bold text-[var(--text-main)] flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--accent-green)]" />
            新增設備卡片
          </h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-label="關閉">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-5 pb-4 shrink-0">
          {STEPS.map((s, i) => {
            const stepNum = (i + 1) as 1 | 2 | 3;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <React.Fragment key={s.label}>
                <div className={cn(
                  "flex items-center gap-1.5 text-xs font-medium transition-colors",
                  isActive ? "text-[var(--accent-green)]" :
                  isDone ? "text-[var(--text-muted)]" : "text-[var(--text-muted)]/40"
                )}>
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all",
                    isActive ? "bg-[var(--accent-green)] border-[var(--accent-green)] text-[var(--bg-panel)]" :
                    isDone ? "bg-[var(--border-base)] border-[var(--border-base)] text-[var(--text-muted)]" :
                    "border-[var(--border-base)] text-[var(--text-muted)]/40"
                  )}>
                    {isDone ? <Check className="w-2.5 h-2.5" /> : stepNum}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    "flex-1 h-px mx-1 transition-colors",
                    step > i + 1 ? "bg-[var(--text-muted)]" : "bg-[var(--border-base)]"
                  )} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4 min-h-0">

          {/* ─── Step 1: Basic Info ─── */}
          {step === 1 && (
            <>
              <div>
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
                  設備顯示名稱 *
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder="例：高速加熱定型機 #2"
                  value={deviceName}
                  onChange={e => setDeviceName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canProceedToStep2) setStep(2); }}
                  className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
                  選擇設備模板
                </label>
                <div className="space-y-2">
                  {templates.map(t => (
                    <label
                      key={t.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        selectedTplId === t.id
                          ? "border-[var(--accent-green)] bg-[var(--accent-green)]/5"
                          : "border-[var(--border-base)] bg-[var(--bg-panel)] hover:border-[var(--accent-green)]/40"
                      )}
                    >
                      <input
                        type="radio"
                        name="template"
                        value={t.id}
                        checked={selectedTplId === t.id}
                        onChange={() => setSelectedTplId(t.id)}
                        className="hidden"
                      />
                      <div className={cn(
                        "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                        selectedTplId === t.id ? "border-[var(--accent-green)]" : "border-[var(--border-base)]"
                      )}>
                        {selectedTplId === t.id && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-main)]">{t.name}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          {t.points.length} 個量測點 · {t.visType}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ─── Step 2: Link Device ─── */}
          {step === 2 && (
            <>
              <div>
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
                  連結後端設備
                </label>
                {/* Tab toggle */}
                <div className="flex bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-lg p-1 mb-3">
                  {(['list', 'manual'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setAssetCodeMode(mode)}
                      className={cn(
                        "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        assetCodeMode === mode
                          ? "bg-[var(--border-base)] text-[var(--text-main)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                      )}
                    >
                      {mode === 'list' ? '從已綁定設備選擇' : '手動輸入 AssetCode'}
                    </button>
                  ))}
                </div>

                {assetCodeMode === 'list' ? (
                  boundDevices.length === 0 ? (
                    <div className="text-sm text-[var(--text-muted)] py-8 text-center border border-[var(--border-base)] rounded-lg bg-[var(--bg-panel)]">
                      尚無已綁定設備。<br />
                      <span className="text-xs">請先在「設備管理」中綁定設備，或切換至「手動輸入」。</span>
                    </div>
                  ) : (
                    <select
                      value={selectedSerial}
                      onChange={e => setSelectedSerial(e.target.value)}
                      className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
                    >
                      <option value="">— 請選擇設備 —</option>
                      {boundDevices.map(d => (
                        <option key={d.serialNumber} value={d.serialNumber}>
                          {d.friendlyName ?? d.assetName ?? d.serialNumber} · {d.assetCode}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  <input
                    autoFocus
                    type="text"
                    placeholder="例：OVEN-VUL-01"
                    value={manualAssetCode}
                    onChange={e => setManualAssetCode(e.target.value)}
                    className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] font-mono"
                  />
                )}
              </div>

              {/* Live sensor preview */}
              {assetCode ? (
                <div className={cn(
                  "p-3 rounded-lg border text-sm",
                  liveSensors && liveSensors.size > 0
                    ? "border-[var(--accent-green)]/40 bg-[var(--accent-green)]/5"
                    : "border-[var(--border-base)] bg-[var(--bg-panel)]"
                )}>
                  {liveSensors && liveSensors.size > 0 ? (
                    <>
                      <div className="text-[var(--accent-green)] text-xs font-semibold mb-2">
                        ✓ 目前 {liveSensors.size} 個感測器正在傳輸
                      </div>
                      <div className="grid grid-cols-4 gap-x-3 gap-y-1">
                        {Array.from(liveSensors.entries()).sort(([a], [b]) => a - b).map(([id, val]) => (
                          <div key={id} className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                            <span className="font-mono opacity-60">#{id}</span>
                            <span className="text-[var(--text-main)] font-mono">{val.toFixed(1)}</span>
                            <span className="opacity-50">{SENSOR_CONFIG[id]?.unit ?? '℃'}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-[var(--text-muted)] text-xs">
                      <span className="font-mono text-[var(--accent-blue)]">{assetCode}</span> 目前無即時資料
                      <br />設備上線後對應關係仍可從卡片修改。
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  ⓘ 可跳過此步驟，待設備上線後再從卡片的「感測器對應設定」綁定。
                </p>
              )}
            </>
          )}

          {/* ─── Step 3: Sensor Mapping ─── */}
          {step === 3 && selectedTpl && (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                為每個量測點指定感測器編號。資料路由會即時依此對應關係生效。
              </p>

              {duplicates.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/40 text-xs text-[var(--accent-yellow)]">
                  ⚠ 有重複的感測器編號，請確認每個點位使用不同的感測器。
                </div>
              )}

              <div className="space-y-2">
                {selectedTpl.points.map((pt, idx) => {
                  const currentSensorId = sensorMapping[idx];
                  const liveVal = currentSensorId !== undefined && liveSensors
                    ? liveSensors.get(currentSensorId)
                    : undefined;
                  const isDup = currentSensorId !== undefined &&
                    usedSensorIds.filter(id => id === currentSensorId).length > 1;

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-lg border bg-[var(--bg-panel)]",
                        isDup ? "border-[var(--accent-yellow)]/60" : "border-[var(--border-base)]"
                      )}
                    >
                      {/* Editable point name */}
                      <input
                        type="text"
                        value={pointNames[idx] ?? pt.name}
                        onChange={e => {
                          const n = [...pointNames];
                          n[idx] = e.target.value;
                          setPointNames(n);
                        }}
                        className="flex-1 min-w-0 bg-transparent border-b border-[var(--border-input)] focus:border-[var(--accent-green)] text-sm text-[var(--text-main)] outline-none pb-0.5 transition-colors"
                      />

                      {/* Sensor dropdown */}
                      <select
                        value={currentSensorId ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setSensorMapping(prev => {
                            const next = { ...prev };
                            if (val === '') delete next[idx];
                            else next[idx] = Number(val);
                            return next;
                          });
                        }}
                        className={cn(
                          "bg-[var(--bg-card)] border rounded-md px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent-green)] w-40 shrink-0",
                          isDup ? "border-[var(--accent-yellow)]" : "border-[var(--border-input)]"
                        )}
                      >
                        <option value="">— 未設定 —</option>
                        {sensorIds.map(id => {
                          const val = liveSensors?.get(id);
                          const unit = SENSOR_CONFIG[id]?.unit ?? '℃';
                          const label = SENSOR_CONFIG[id]?.label ?? '感測器';
                          return (
                            <option key={id} value={id}>
                              #{id} {val !== undefined ? `${val.toFixed(1)}${unit}` : label}
                            </option>
                          );
                        })}
                      </select>

                      {/* Live value badge */}
                      {liveVal !== undefined && (
                        <span className="text-[11px] font-mono text-[var(--accent-green)] bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded px-1.5 py-0.5 shrink-0">
                          {liveVal.toFixed(1)}{SENSOR_CONFIG[currentSensorId!]?.unit ?? '℃'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {unsetCount > 0 && (
                <p className="text-xs text-[var(--text-muted)]">
                  ⓘ {unsetCount} 個點位尚未指定感測器，完成後可從卡片「感測器對應設定」修改。
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border-base)] shrink-0">
          <button
            onClick={() => { if (step > 1) setStep((step - 1) as 1 | 2); else onClose(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 1 ? '取消' : '上一步'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as 2 | 3)}
              disabled={step === 1 && !canProceedToStep2}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:bg-[var(--accent-green)]/20 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一步
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!canFinish}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold hover:bg-[var(--accent-green-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              完成新增
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

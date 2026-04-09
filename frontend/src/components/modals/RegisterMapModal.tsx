import { useState, useEffect, useCallback } from 'react';
import {
  X, Save, Network, AlertCircle, CheckCircle, Loader,
  ChevronDown, AlertTriangle,
} from 'lucide-react';
import type { ProductionLine, PlcTemplate, PlcTemplateSummary } from '../../types';
import { cn } from '../../utils/cn';
import { toHex, newLocalId } from '../../utils/format';

// ── Types ─────────────────────────────────────────────────────────────────────
interface EntryRow {
  localId: string;
  zoneIndex: number;
  registerAddress: number;
  equipmentId: string;
  pointId: string;
  label: string;
  unit: string;
}

interface RegisterMapProfileDto {
  id: number;
  lineId: string;
  profileName: string;
  updatedAt: string;
  plcTemplateId: number | null;
  plcTemplate: PlcTemplate | null;
  entries: EntryRow[];
}

interface Props {
  line: ProductionLine;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const RegisterMapModal = ({ line, onClose }: Props) => {
  const [activeZone, setActiveZone] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');

  // ── Template state ─────────────────────────────────────────────────────────
  const [selectedTemplate, setSelectedTemplate] = useState<PlcTemplate | null>(null);
  const [templateList, setTemplateList] = useState<PlcTemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // ── 換型號確認 Dialog ──────────────────────────────────────────────────────
  const [pendingTemplateId, setPendingTemplateId] = useState<number | null>(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);

  // ── 載入設定 + 型號列表 ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadingTemplates(true);

    Promise.all([
      fetch(`/api/register-map/${encodeURIComponent(line.id)}`)
        .then(r => r.ok ? r.json() as Promise<RegisterMapProfileDto> : Promise.reject(r.statusText))
        .catch(() => null),
      fetch('/api/plc-templates')
        .then(r => r.json() as Promise<PlcTemplateSummary[]>)
        .catch(() => [] as PlcTemplateSummary[]),
    ]).then(([profile, tplList]) => {
      if (cancelled) return;
      setTemplateList(tplList);
      setLoadingTemplates(false);
      if (profile) {
        setProfileName(profile.profileName || line.name);
        setEntries(profile.entries.map(e => ({ ...e, localId: newLocalId() })));
        if (profile.plcTemplate) {
          setSelectedTemplate(profile.plcTemplate);
          const firstZoneIndex = profile.plcTemplate.zones[0]?.zoneIndex ?? 0;
          setActiveZone(firstZoneIndex);
        }
      } else {
        setProfileName(line.name);
        setEntries([]);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [line.id, line.name]);

  // ── 選擇型號（帶防呆）──────────────────────────────────────────────────────
  const handleTemplateSelect = useCallback((templateId: string) => {
    if (!templateId) {
      if (entries.some(e => e.equipmentId)) {
        setPendingTemplateId(null);
        setShowSwitchConfirm(true);
      } else {
        setSelectedTemplate(null);
        setEntries([]);
      }
      return;
    }

    const id = Number(templateId);
    if (selectedTemplate?.id === id) return;

    if (entries.some(e => e.equipmentId)) {
      setPendingTemplateId(id);
      setShowSwitchConfirm(true);
    } else {
      applyTemplate(id);
    }
  }, [entries, selectedTemplate]);

  const applyTemplate = useCallback(async (id: number | null) => {
    if (id == null) {
      setSelectedTemplate(null);
      setEntries([]);
      setActiveZone(0);
      return;
    }
    try {
      const t: PlcTemplate = await fetch(`/api/plc-templates/${id}`).then(r => r.json());
      setSelectedTemplate(t);
      setEntries([]);
      setActiveZone(t.zones[0]?.zoneIndex ?? 0);
    } catch {
      // 保持現狀
    }
  }, []);

  const confirmSwitch = useCallback(() => {
    setShowSwitchConfirm(false);
    applyTemplate(pendingTemplateId);
    setPendingTemplateId(null);
  }, [pendingTemplateId, applyTemplate]);

  const cancelSwitch = useCallback(() => {
    setShowSwitchConfirm(false);
    setPendingTemplateId(null);
  }, []);

  // ── Entry lazy-upsert ──────────────────────────────────────────────────────
  const updateEntry = useCallback((registerAddress: number, zoneIndex: number, patch: Partial<EntryRow>) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.registerAddress === registerAddress && e.zoneIndex === zoneIndex);
      if (idx >= 0) {
        return prev.map((e, i) => i === idx
          ? { ...e, ...patch, ...(patch.equipmentId !== undefined ? { pointId: '' } : {}) }
          : e
        );
      }
      return [...prev, {
        localId: newLocalId(),
        zoneIndex,
        registerAddress,
        equipmentId: '',
        pointId: '',
        label: '',
        unit: '℃',
        ...patch,
      }];
    });
  }, []);

  // ── 儲存 ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus('idle');
    setErrMsg('');
    try {
      const res = await fetch(`/api/register-map/${encodeURIComponent(line.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileName,
          plcTemplateId: selectedTemplate?.id ?? null,
          entries: entries.filter(e => e.equipmentId),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '儲存失敗');
      setSaveStatus('err');
    } finally {
      setSaving(false);
    }
  }, [line.id, profileName, selectedTemplate, entries]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const zones = selectedTemplate?.zones.slice().sort((a, b) => a.zoneIndex - b.zoneIndex) ?? [];
  const activeZoneDef = zones.find(z => z.zoneIndex === activeZone);
  const zoneRegisters = selectedTemplate?.registers.filter(r => r.defaultZoneIndex === activeZone).sort((a, b) => a.registerAddress - b.registerAddress) ?? [];

  const getPoints = (equipmentId: string) =>
    line.equipments.find(eq => eq.id === equipmentId)?.points ?? [];

  const getBadge = (zoneIndex: number) => {
    if (!selectedTemplate) return null;
    const total = selectedTemplate.registers.filter(r => r.defaultZoneIndex === zoneIndex).length;
    const bound = entries.filter(e => e.zoneIndex === zoneIndex && e.equipmentId).length;
    if (total === 0) return null;
    return { bound, total, complete: bound === total };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/90 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regmap-title"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card border border-[var(--border-base)] rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-300">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-base)] shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/20 flex items-center justify-center shrink-0">
              <Network className="w-4 h-4 text-[var(--accent-blue)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="regmap-title" className="text-base font-bold text-[var(--text-main)] tracking-wide">
                暫存器對應設定
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{line.name}</p>
              {/* PLC 型號 Inline Selector */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">PLC 型號：</span>
                <div className="relative">
                  <select
                    value={selectedTemplate?.id ?? ''}
                    onChange={e => handleTemplateSelect(e.target.value)}
                    disabled={loadingTemplates}
                    className={cn(
                      'appearance-none text-xs pr-6 pl-2 py-1 rounded-md border outline-none transition-colors cursor-pointer',
                      selectedTemplate
                        ? 'bg-[var(--accent-blue)]/10 border-[var(--accent-blue)]/30 text-[var(--accent-blue)]'
                        : 'bg-[var(--bg-panel)] border-[var(--border-input)] text-[var(--text-muted)]'
                    )}
                  >
                    <option value="">— 選擇 PLC 型號 —</option>
                    {templateList.map(t => (
                      <option key={t.id} value={t.id} className="bg-[var(--bg-panel)] text-[var(--text-main)]">
                        {t.modelName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-current opacity-60" />
                </div>
                {loadingTemplates && <Loader className="w-3 h-3 animate-spin text-[var(--text-muted)]" />}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors shrink-0"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Zone Tabs（動態，來自 Template）─────────────────────────────── */}
        {selectedTemplate && zones.length > 0 && (
          <div className="flex border-b border-[var(--border-base)] px-6 shrink-0 overflow-x-auto">
            {zones.map(z => {
              const badge = getBadge(z.zoneIndex);
              return (
                <button
                  key={z.zoneIndex}
                  onClick={() => setActiveZone(z.zoneIndex)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0',
                    activeZone === z.zoneIndex
                      ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  )}
                >
                  {z.zoneName}
                  {badge && (
                    <span className={cn(
                      'text-[10px] font-mono px-1.5 rounded-full border',
                      badge.complete
                        ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/30'
                        : badge.bound > 0
                          ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/20'
                          : 'bg-[var(--border-base)] text-[var(--text-muted)] border-transparent'
                    )}>
                      {badge.bound}/{badge.total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Zone Info Bar ──────────────────────────────────────────────── */}
        {selectedTemplate && activeZoneDef && (
          <div className="px-6 py-2.5 bg-[var(--bg-panel)]/40 border-b border-[var(--border-base)] shrink-0">
            <p className="text-xs text-[var(--text-muted)]">
              資產編號暫存器段：
              <span className="font-mono text-[var(--accent-cyan)] ml-1">
                {toHex(activeZoneDef.assetCodeRegStart)}–{toHex(activeZoneDef.assetCodeRegStart + activeZoneDef.assetCodeRegCount - 1)}
              </span>
              <span className="ml-3 opacity-50">（共 {activeZoneDef.assetCodeRegCount} 個暫存器）</span>
            </p>
          </div>
        )}

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
              <Loader className="w-6 h-6 animate-spin text-[var(--accent-blue)]" />
              <span className="text-sm">載入設定中…</span>
            </div>
          ) : !selectedTemplate ? (
            /* Empty state：請先選型號 */
            <div className="flex flex-col items-center justify-center py-16 gap-3 border border-dashed border-[var(--border-base)] rounded-xl m-6">
              <Network className="w-8 h-8 text-[var(--border-base)]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-[var(--text-muted)]">請先選擇 PLC 型號</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60 max-w-xs">
                  從上方下拉選單選擇此產線使用的 PLC 型號，以開始設定暫存器對應
                </p>
                {templateList.length === 0 && !loadingTemplates && (
                  <p className="text-xs text-[var(--accent-yellow)] mt-2">
                    目前尚無 PLC 型號範本，請先從工具列的「PLC 型號管理」建立型號
                  </p>
                )}
              </div>
            </div>
          ) : zoneRegisters.length === 0 ? (
            /* 該 Zone 沒有暫存器定義 */
            <div className="flex flex-col items-center justify-center py-12 gap-3 m-6">
              <p className="text-sm text-[var(--text-muted)]">此 Zone 在範本中尚未定義任何暫存器</p>
            </div>
          ) : (
            <div className="p-6 space-y-2">
              {/* Table Header */}
              <div className="grid grid-cols-[90px_1fr_1fr_90px] gap-2 px-3 pb-1">
                {['Reg 地址', '對應設備', '對應點位', '名稱'].map(h => (
                  <span key={h} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{h}</span>
                ))}
              </div>

              {/* Rows（來自 Template，地址唯讀）*/}
              {zoneRegisters.map(reg => {
                const entry = entries.find(e => e.registerAddress === reg.registerAddress && e.zoneIndex === activeZone);
                const equipmentId = entry?.equipmentId ?? '';
                const pointId = entry?.pointId ?? '';
                const label = entry?.label ?? '';
                const points = getPoints(equipmentId);
                const isBound = !!equipmentId;

                return (
                  <div
                    key={reg.registerAddress}
                    className={cn(
                      'grid grid-cols-[90px_1fr_1fr_90px] gap-2 items-center p-2.5 rounded-lg border transition-colors',
                      isBound
                        ? 'border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/5 hover:border-[var(--accent-blue)]/50'
                        : 'border-[var(--border-base)] bg-[var(--bg-panel)]/50 hover:border-[var(--accent-blue)]/20'
                    )}
                  >
                    {/* Register Address（唯讀）*/}
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-[var(--accent-cyan)] font-semibold">
                        {toHex(reg.registerAddress)}
                      </span>
                      {reg.defaultLabel && (
                        <span className="text-[9px] text-[var(--text-muted)] truncate">{reg.defaultLabel}</span>
                      )}
                    </div>

                    {/* Equipment */}
                    <select
                      value={equipmentId}
                      onChange={e => updateEntry(reg.registerAddress, activeZone, { equipmentId: e.target.value })}
                      className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-md px-2 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)] w-full truncate"
                    >
                      <option value="" className="bg-[var(--bg-panel)]">— 選擇設備 —</option>
                      {line.equipments.map(eq => (
                        <option key={eq.id} value={eq.id} className="bg-[var(--bg-panel)]">{eq.name}</option>
                      ))}
                    </select>

                    {/* Point */}
                    <select
                      value={pointId}
                      onChange={e => updateEntry(reg.registerAddress, activeZone, { pointId: e.target.value })}
                      disabled={!equipmentId}
                      className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-md px-2 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)] w-full disabled:opacity-40 disabled:cursor-not-allowed truncate"
                    >
                      <option value="" className="bg-[var(--bg-panel)]">— 選擇點位 —</option>
                      {points.map(pt => (
                        <option key={pt.id} value={pt.id} className="bg-[var(--bg-panel)]">{pt.name}</option>
                      ))}
                    </select>

                    {/* Label */}
                    <input
                      type="text"
                      value={label}
                      onChange={e => updateEntry(reg.registerAddress, activeZone, { label: e.target.value })}
                      placeholder={reg.defaultLabel || '名稱'}
                      className="bg-[var(--bg-card)] border border-[var(--border-input)] rounded-md px-2 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)] w-full"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-base)] shrink-0 gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <label className="text-xs text-[var(--text-muted)] shrink-0">基本檔名稱</label>
            <input
              type="text"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
              className="flex-1 min-w-0 bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)] transition-colors"
              placeholder={line.name}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saveStatus === 'ok' && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--accent-green)] animate-in fade-in duration-300">
                <CheckCircle className="w-3.5 h-3.5" /> 已儲存
              </span>
            )}
            {saveStatus === 'err' && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--accent-red)]">
                <AlertCircle className="w-3.5 h-3.5" /> {errMsg}
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
            >
              關閉
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving
                ? <><Loader className="w-3.5 h-3.5 animate-spin" /> 儲存中…</>
                : <><Save className="w-3.5 h-3.5" /> 儲存基本檔</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── 換型號確認 Dialog（z-60，疊在 modal 上）─────────────────────── */}
      {showSwitchConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="bg-[var(--bg-card)] border border-[var(--accent-yellow)]/40 rounded-2xl shadow-2xl p-6 w-80 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/30 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-[var(--accent-yellow)]" />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--text-main)]">確定更換 PLC 型號？</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  此操作將清除所有已設定的暫存器對應，無法復原。
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={cancelSwitch}
                className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmSwitch}
                className="px-4 py-2 text-xs font-bold text-[var(--accent-yellow)] border border-[var(--accent-yellow)]/30 bg-[var(--accent-yellow)]/10 hover:bg-[var(--accent-yellow)]/20 rounded-lg transition-colors"
              >
                確認更換
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

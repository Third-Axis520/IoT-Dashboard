import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Plus, Trash2, Save, FileCode2, AlertCircle, CheckCircle,
  Loader, ChevronLeft, Edit2, Layers, Cpu,
} from 'lucide-react';
import type { PlcTemplate, PlcTemplateSummary } from '../../types';
import { cn } from '../../utils/cn';
import { toHex, newLocalId } from '../../utils/format';

// ── 本地 form 用型別（ID 為 0 代表新增中，尚未存入 DB）────────────────────────
interface ZoneRow {
  localId: string;
  zoneIndex: number;
  zoneName: string;
  assetCodeRegStart: number;
  assetCodeRegCount: number;
}

interface RegRow {
  localId: string;
  registerAddress: number;
  defaultLabel: string;
  defaultUnit: string;
  defaultZoneIndex: number | null;
}

type View = 'list' | 'edit';

interface Props {
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const PlcTemplateModal = ({ onClose }: Props) => {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('list');
  const [templates, setTemplates] = useState<PlcTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null); // null = 新增
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // ── Edit form state ────────────────────────────────────────────────────────
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formZones, setFormZones] = useState<ZoneRow[]>([]);
  const [formRegs, setFormRegs] = useState<RegRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [saveError, setSaveError] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/plc-templates')
      .then(r => r.json() as Promise<PlcTemplateSummary[]>)
      .then(list => { if (!cancelled) setTemplates(list); })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // ── 進入新增模式 ─────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormDesc('');
    setFormZones([]);
    setFormRegs([]);
    setSaveStatus('idle');
    setView('edit');
  };

  // ── 進入編輯模式 ─────────────────────────────────────────────────────────
  const openEdit = async (id: number) => {
    setLoading(true);
    try {
      const tpl: PlcTemplate = await fetch(`/api/plc-templates/${id}`).then(r => r.json());
      setEditingId(id);
      setFormName(tpl.modelName);
      setFormDesc(tpl.description ?? '');
      setFormZones(tpl.zones.map(z => ({
        localId: newLocalId(),
        zoneIndex: z.zoneIndex,
        zoneName: z.zoneName,
        assetCodeRegStart: z.assetCodeRegStart,
        assetCodeRegCount: z.assetCodeRegCount,
      })));
      setFormRegs(tpl.registers.map(r => ({
        localId: newLocalId(),
        registerAddress: r.registerAddress,
        defaultLabel: r.defaultLabel,
        defaultUnit: r.defaultUnit,
        defaultZoneIndex: r.defaultZoneIndex,
      })));
      setSaveStatus('idle');
      setView('edit');
    } finally {
      setLoading(false);
    }
  };

  // ── Zone 操作 ────────────────────────────────────────────────────────────
  const addZone = () => {
    const nextIndex = formZones.length > 0 ? Math.max(...formZones.map(z => z.zoneIndex)) + 1 : 0;
    setFormZones(prev => [...prev, {
      localId: newLocalId(),
      zoneIndex: nextIndex,
      zoneName: `Zone ${nextIndex + 1}`,
      assetCodeRegStart: 0,
      assetCodeRegCount: 10,
    }]);
  };

  const updateZone = (localId: string, patch: Partial<ZoneRow>) =>
    setFormZones(prev => prev.map(z => z.localId === localId ? { ...z, ...patch } : z));

  const removeZone = (localId: string) =>
    setFormZones(prev => prev.filter(z => z.localId !== localId));

  // ── Register 操作 ─────────────────────────────────────────────────────────
  const addReg = () => {
    setFormRegs(prev => [...prev, {
      localId: newLocalId(),
      registerAddress: 1,
      defaultLabel: '',
      defaultUnit: '℃',
      defaultZoneIndex: formZones[0]?.zoneIndex ?? null,
    }]);
  };

  const updateReg = (localId: string, patch: Partial<RegRow>) =>
    setFormRegs(prev => prev.map(r => r.localId === localId ? { ...r, ...patch } : r));

  const removeReg = (localId: string) =>
    setFormRegs(prev => prev.filter(r => r.localId !== localId));

  // ── 儲存 ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formName.trim()) {
      setSaveError('請輸入型號名稱');
      setSaveStatus('err');
      return;
    }
    setSaving(true);
    setSaveStatus('idle');
    try {
      const body = {
        modelName: formName.trim(),
        description: formDesc.trim() || null,
        zones: formZones.map(z => ({
          id: 0,
          zoneIndex: z.zoneIndex,
          zoneName: z.zoneName,
          assetCodeRegStart: z.assetCodeRegStart,
          assetCodeRegCount: z.assetCodeRegCount,
        })),
        registers: formRegs.map(r => ({
          id: 0,
          registerAddress: r.registerAddress,
          defaultLabel: r.defaultLabel,
          defaultUnit: r.defaultUnit,
          defaultZoneIndex: r.defaultZoneIndex,
        })),
      };

      const url = editingId != null ? `/api/plc-templates/${editingId}` : '/api/plc-templates';
      const method = editingId != null ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      setSaveStatus('ok');
      refresh();
      setTimeout(() => {
        setSaveStatus('idle');
        setView('list');
      }, 800);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗');
      setSaveStatus('err');
    } finally {
      setSaving(false);
    }
  };

  // ── 刪除 ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setDeleteError('');
    try {
      const res = await fetch(`/api/plc-templates/${id}`, { method: 'DELETE' });
      if (res.status === 409) {
        const data = await res.json();
        setDeleteError(`無法刪除：此型號被 ${data.usedByCount} 條產線引用，請先移除引用後再刪除。`);
        return;
      }
      if (!res.ok) throw new Error();
      setDeleteConfirmId(null);
      refresh();
    } catch {
      setDeleteError('刪除失敗，請稍後再試。');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/90 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plc-tpl-title"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card border border-[var(--border-base)] rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-300">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-base)] shrink-0">
          <div className="flex items-center gap-3">
            {view === 'edit' && (
              <button
                onClick={() => setView('list')}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
                aria-label="返回列表"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/20 flex items-center justify-center">
              <FileCode2 className="w-4 h-4 text-[var(--accent-blue)]" />
            </div>
            <div>
              <h2 id="plc-tpl-title" className="text-base font-bold text-[var(--text-main)] tracking-wide">
                {view === 'list' ? t('plcTemplate.title') : editingId != null ? t('plcTemplate.editTitle') : t('plcTemplate.createTitle')}
              </h2>
              {view === 'edit' && editingId != null && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{formName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {view === 'list' && (
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/20 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('plcTemplate.createButton')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
              aria-label="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          {loading && view === 'list' ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
              <Loader className="w-6 h-6 animate-spin text-[var(--accent-blue)]" />
              <span className="text-sm">{t('common.loading')}</span>
            </div>
          ) : view === 'list' ? (
            <ListView
              templates={templates}
              deleteConfirmId={deleteConfirmId}
              deleteError={deleteError}
              onEdit={openEdit}
              onDeleteRequest={id => { setDeleteConfirmId(id); setDeleteError(''); }}
              onDeleteConfirm={handleDelete}
              onDeleteCancel={() => { setDeleteConfirmId(null); setDeleteError(''); }}
            />
          ) : (
            <EditView
              formName={formName}
              formDesc={formDesc}
              formZones={formZones}
              formRegs={formRegs}
              onNameChange={setFormName}
              onDescChange={setFormDesc}
              onAddZone={addZone}
              onUpdateZone={updateZone}
              onRemoveZone={removeZone}
              onAddReg={addReg}
              onUpdateReg={updateReg}
              onRemoveReg={removeReg}
            />
          )}
        </div>

        {/* ── Footer（Edit mode only）─────────────────────────────────────── */}
        {view === 'edit' && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border-base)] shrink-0">
            {saveStatus === 'ok' && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--accent-green)] animate-in fade-in duration-300 mr-auto">
                <CheckCircle className="w-3.5 h-3.5" /> {t('common.saved')}
              </span>
            )}
            {saveStatus === 'err' && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--accent-red)] mr-auto">
                <AlertCircle className="w-3.5 h-3.5" /> {saveError}
              </span>
            )}
            <button
              onClick={() => setView('list')}
              className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving
                ? <><Loader className="w-3.5 h-3.5 animate-spin" /> 儲存中…</>
                : <><Save className="w-3.5 h-3.5" /> {t('plcTemplate.saveModel')}</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── List View ─────────────────────────────────────────────────────────────────
interface ListViewProps {
  templates: PlcTemplateSummary[];
  deleteConfirmId: number | null;
  deleteError: string;
  onEdit: (id: number) => void;
  onDeleteRequest: (id: number) => void;
  onDeleteConfirm: (id: number) => void;
  onDeleteCancel: () => void;
}

const ListView = ({
  templates, deleteConfirmId, deleteError,
  onEdit, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
}: ListViewProps) => {
  const { t } = useTranslation();

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 border border-dashed border-[var(--border-base)] rounded-xl m-6">
        <Cpu className="w-8 h-8 text-[var(--border-base)]" />
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--text-muted)]">{t('plcTemplate.empty')}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 opacity-60">
            {t('plcTemplate.emptyHint')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      {templates.map(tpl => (
        <div key={tpl.id} className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-panel)]/50 overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-main)] truncate">{tpl.modelName}</p>
              {tpl.description && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{tpl.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20">
                  <Layers className="w-3 h-3" /> {t('plcTemplate.zonesCount', { count: tpl.zoneCount })}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20">
                  <Cpu className="w-3 h-3" /> {t('plcTemplate.registersCount', { count: tpl.registerCount })}
                </span>
              </div>
            </div>
            <button
              onClick={() => onEdit(tpl.id)}
              className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-lg transition-colors shrink-0"
              aria-label={t('common.edit')}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDeleteRequest(tpl.id)}
              className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 rounded-lg transition-colors shrink-0"
              aria-label={t('common.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* 刪除確認列 */}
          {deleteConfirmId === tpl.id && (
            <div className="border-t border-[var(--border-base)] bg-[var(--accent-red)]/5 px-4 py-3">
              {deleteError ? (
                <p className="text-xs text-[var(--accent-red)] flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {deleteError}
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[var(--accent-red)]">{t('plcTemplate.deleteConfirm', { name: tpl.modelName })}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={onDeleteCancel}
                      className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={() => onDeleteConfirm(tpl.id)}
                      className="px-3 py-1.5 text-xs font-bold text-[var(--accent-red)] border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 hover:bg-[var(--accent-red)]/20 rounded-lg transition-colors"
                    >
                      {t('plcTemplate.confirmDelete')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Edit View ─────────────────────────────────────────────────────────────────
interface EditViewProps {
  formName: string;
  formDesc: string;
  formZones: ZoneRow[];
  formRegs: RegRow[];
  onNameChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onAddZone: () => void;
  onUpdateZone: (localId: string, patch: Partial<ZoneRow>) => void;
  onRemoveZone: (localId: string) => void;
  onAddReg: () => void;
  onUpdateReg: (localId: string, patch: Partial<RegRow>) => void;
  onRemoveReg: (localId: string) => void;
}

const inputCls = 'bg-[var(--bg-card)] border border-[var(--border-input)] rounded-md px-2 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)] transition-colors w-full';

const EditView = ({
  formName, formDesc, formZones, formRegs,
  onNameChange, onDescChange,
  onAddZone, onUpdateZone, onRemoveZone,
  onAddReg, onUpdateReg, onRemoveReg,
}: EditViewProps) => {
  const { t } = useTranslation();

  return (
    <div className="p-6 space-y-6">
      {/* 基本資訊 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-3">{t('plcTemplate.basicInfo')}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">{t('plcTemplate.modelName')} <span className="text-[var(--accent-red)]">*</span></label>
            <input value={formName} onChange={e => onNameChange(e.target.value)} placeholder={t('plcTemplate.namePlaceholder')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">{t('plcTemplate.description')}</label>
            <textarea value={formDesc} onChange={e => onDescChange(e.target.value)} rows={2} placeholder={t('plcTemplate.descriptionPlaceholder')} className={cn(inputCls, 'resize-none')} />
          </div>
        </div>
      </section>

      {/* Zone 定義 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{t('plcTemplate.zoneDef')}</h3>
          <button onClick={onAddZone} className="flex items-center gap-1 text-xs text-[var(--accent-blue)] hover:underline">
            <Plus className="w-3.5 h-3.5" /> {t('plcTemplate.addZone')}
          </button>
        </div>
        {formZones.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] opacity-60 py-2">{t('plcTemplate.noZones')}</p>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[48px_1fr_120px_72px_28px] gap-2 px-3 pb-1">
              {[t('plcTemplate.colIndex'), t('plcTemplate.colZoneName'), t('plcTemplate.colAssetStart'), t('plcTemplate.colLength'), ''].map(h => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{h}</span>
              ))}
            </div>
            {formZones.map(z => (
              <div key={z.localId} className="grid grid-cols-[48px_1fr_120px_72px_28px] gap-2 items-center p-2.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-panel)]/50">
                <input
                  type="number" min={0} value={z.zoneIndex}
                  onChange={e => onUpdateZone(z.localId, { zoneIndex: Number(e.target.value) })}
                  className={inputCls}
                />
                <input
                  value={z.zoneName}
                  onChange={e => onUpdateZone(z.localId, { zoneName: e.target.value })}
                  placeholder={t('plcTemplate.zoneNamePlaceholder')}
                  className={inputCls}
                />
                <div className="flex flex-col gap-0.5">
                  <input
                    type="number" min={0} value={z.assetCodeRegStart}
                    onChange={e => onUpdateZone(z.localId, { assetCodeRegStart: Number(e.target.value) })}
                    className={inputCls}
                  />
                  <span className="text-[9px] font-mono text-[var(--accent-cyan)] pl-0.5">{toHex(z.assetCodeRegStart)}</span>
                </div>
                <input
                  type="number" min={1} value={z.assetCodeRegCount}
                  onChange={e => onUpdateZone(z.localId, { assetCodeRegCount: Number(e.target.value) })}
                  className={inputCls}
                />
                <button onClick={() => onRemoveZone(z.localId)} className="flex items-center justify-center w-7 h-7 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 rounded-md transition-colors" aria-label={t('plcTemplate.deleteZone')}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Register 定義 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{t('plcTemplate.registerDef')}</h3>
          <button onClick={onAddReg} className="flex items-center gap-1 text-xs text-[var(--accent-blue)] hover:underline">
            <Plus className="w-3.5 h-3.5" /> {t('plcTemplate.addRegister')}
          </button>
        </div>
        {formRegs.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] opacity-60 py-2">{t('plcTemplate.noRegisters')}</p>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[90px_1fr_60px_90px_28px] gap-2 px-3 pb-1">
              {[t('plcTemplate.colAddress'), t('plcTemplate.colDefaultName'), t('plcTemplate.colUnit'), t('plcTemplate.colDefaultZone'), ''].map(h => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{h}</span>
              ))}
            </div>
            {formRegs.map(r => (
              <div key={r.localId} className="grid grid-cols-[90px_1fr_60px_90px_28px] gap-2 items-center p-2.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-panel)]/50">
                <div className="flex flex-col gap-0.5">
                  <input
                    type="number" min={1} value={r.registerAddress}
                    onChange={e => onUpdateReg(r.localId, { registerAddress: Number(e.target.value) })}
                    className={inputCls}
                  />
                  <span className="text-[9px] font-mono text-[var(--accent-cyan)] pl-0.5">{toHex(r.registerAddress)}</span>
                </div>
                <input
                  value={r.defaultLabel}
                  onChange={e => onUpdateReg(r.localId, { defaultLabel: e.target.value })}
                  placeholder={t('plcTemplate.labelPlaceholder')}
                  className={inputCls}
                />
                <input
                  value={r.defaultUnit}
                  onChange={e => onUpdateReg(r.localId, { defaultUnit: e.target.value })}
                  className={inputCls}
                />
                <select
                  value={r.defaultZoneIndex ?? ''}
                  onChange={e => onUpdateReg(r.localId, { defaultZoneIndex: e.target.value === '' ? null : Number(e.target.value) })}
                  className={cn(inputCls, 'bg-[var(--bg-card)]')}
                >
                  <option value="">{t('plcTemplate.unspecified')}</option>
                  {formZones.map(z => (
                    <option key={z.localId} value={z.zoneIndex}>{z.zoneName}</option>
                  ))}
                </select>
                <button onClick={() => onRemoveReg(r.localId)} className="flex items-center justify-center w-7 h-7 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 rounded-md transition-colors" aria-label={t('plcTemplate.deleteRegister')}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

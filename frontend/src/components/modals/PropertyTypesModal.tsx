import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Edit2, Trash2, ChevronLeft, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import {
  fetchPropertyTypes, createPropertyType, updatePropertyType, deletePropertyType,
  type PropertyTypeItem, type SavePropertyTypeRequest, type UpdatePropertyTypeRequest,
} from '../../lib/apiPropertyTypes';

type View = 'list' | 'edit';

interface Props { onClose: () => void; }

const BEHAVIORS: { value: PropertyTypeItem['behavior']; label: string }[] = [
  { value: 'normal',          label: '一般數值（走 UCL/LCL 告警）' },
  { value: 'material_detect', label: '在位偵測（值=0 時跳過告警）' },
  { value: 'asset_code',      label: '資產編號' },
  { value: 'state',           label: '狀態' },
  { value: 'counter',         label: '計數器（不做 UCL/LCL）' },
];

const inp = 'bg-[var(--bg-base)] border border-[var(--border-base)] rounded-md px-2 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-primary)] transition-colors w-full';

export const PropertyTypesModal = ({ onClose }: Props) => {
  const [view, setView]         = useState<View>('list');
  const [items, setItems]       = useState<PropertyTypeItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [apiError, setApiError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // form state
  const [editingItem, setEditingItem] = useState<PropertyTypeItem | null>(null); // null = create
  const [fKey,  setFKey]  = useState('');
  const [fName, setFName] = useState('');
  const [fIcon, setFIcon] = useState('');
  const [fUnit, setFUnit] = useState('');
  const [fUcl,  setFUcl]  = useState('');
  const [fLcl,  setFLcl]  = useState('');
  const [fBehavior, setFBehavior] = useState<PropertyTypeItem['behavior']>('normal');
  const [fSort, setFSort] = useState('0');
  const [saving, setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [saveError, setSaveError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPropertyTypes()
      .then(list => { if (!cancelled) setItems(list); })
      .catch(e  => { if (!cancelled) setApiError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const openCreate = () => {
    setEditingItem(null);
    setFKey(''); setFName(''); setFIcon(''); setFUnit('');
    setFUcl(''); setFLcl(''); setFBehavior('normal'); setFSort('0');
    setSaveStatus('idle'); setApiError('');
    setView('edit');
  };

  const openEdit = (item: PropertyTypeItem) => {
    setEditingItem(item);
    setFName(item.name); setFIcon(item.icon); setFUnit(item.defaultUnit);
    setFUcl(item.defaultUcl != null ? String(item.defaultUcl) : '');
    setFLcl(item.defaultLcl != null ? String(item.defaultLcl) : '');
    setFBehavior(item.behavior); setFSort(String(item.sortOrder));
    setSaveStatus('idle'); setApiError('');
    setView('edit');
  };

  const handleSave = async () => {
    if (!fName.trim()) { setSaveError('請輸入名稱'); setSaveStatus('err'); return; }
    if (!editingItem && !fKey.trim()) { setSaveError('請輸入 Key'); setSaveStatus('err'); return; }
    setSaving(true); setSaveStatus('idle');
    try {
      if (editingItem) {
        const req: UpdatePropertyTypeRequest = {
          name: fName.trim(), icon: fIcon.trim(),
          defaultUnit: fUnit || undefined,
          defaultUcl: fUcl !== '' ? Number(fUcl) : null,
          defaultLcl: fLcl !== '' ? Number(fLcl) : null,
          sortOrder: Number(fSort) || 0,
        };
        await updatePropertyType(editingItem.id, req);
      } else {
        const req: SavePropertyTypeRequest = {
          key: fKey.trim(), name: fName.trim(), icon: fIcon.trim(),
          defaultUnit: fUnit || undefined,
          defaultUcl: fUcl !== '' ? Number(fUcl) : null,
          defaultLcl: fLcl !== '' ? Number(fLcl) : null,
          behavior: fBehavior, sortOrder: Number(fSort) || 0,
        };
        await createPropertyType(req);
      }
      setSaveStatus('ok'); refresh();
      setTimeout(() => { setSaveStatus('idle'); setView('list'); }, 800);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗');
      setSaveStatus('err');
    } finally { setSaving(false); }
  };

  const handleDelete = async (item: PropertyTypeItem) => {
    if (!confirm(`確定要刪除「${item.name}」？此操作無法復原。`)) return;
    setApiError('');
    try {
      await deletePropertyType(item.id);
      refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : '刪除失敗');
    }
  };

  const isCreate = editingItem === null;
  const isBuiltin = editingItem?.isBuiltIn ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/90 backdrop-blur-md p-4"
      role="dialog" aria-modal="true" aria-labelledby="pt-modal-title"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card border border-[var(--border-base)] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-base)] shrink-0">
          <div className="flex items-center gap-3">
            {view === 'edit' && (
              <button onClick={() => setView('list')} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors" aria-label="返回列表">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 id="pt-modal-title" className="text-base font-bold text-[var(--text-main)] tracking-wide">
              {view === 'list' ? '屬性類型管理' : isCreate ? '新增屬性類型' : `編輯：${editingItem?.name}`}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {view === 'list' && (
              <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 hover:bg-[var(--accent-primary)]/20 rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> 新增屬性
              </button>
            )}
            <button onClick={onClose} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors" aria-label="關閉">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          {apiError && (
            <div className="mx-6 mt-4 flex items-start gap-2 text-xs text-[var(--accent-red)] bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {apiError}
            </div>
          )}

          {loading && view === 'list' ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
              <Loader className="w-6 h-6 animate-spin text-[var(--accent-primary)]" />
              <span className="text-sm">載入中…</span>
            </div>
          ) : view === 'list' ? (
            <div className="p-6">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-base)] text-[var(--text-muted)]">
                    {['名稱', 'Key', '單位', '行為', '類型', ''].map(h => (
                      <th key={h} className="text-left py-2 px-2 font-semibold uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-[var(--border-base)]/50 hover:bg-[var(--bg-elevated)]/40 transition-colors">
                      <td className="py-2 px-2 font-medium text-[var(--text-main)]">{item.name}</td>
                      <td className="py-2 px-2 font-mono text-[var(--text-muted)]">{item.key}</td>
                      <td className="py-2 px-2 text-[var(--text-muted)]">{item.defaultUnit || '—'}</td>
                      <td className="py-2 px-2 text-[var(--text-muted)]">{BEHAVIORS.find(b => b.value === item.behavior)?.label.split('（')[0] ?? item.behavior}</td>
                      <td className="py-2 px-2">
                        {item.isBuiltIn
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">內建</span>
                          : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">自訂</span>
                        }
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(item)} className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 rounded-md transition-colors" aria-label="編輯">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!item.isBuiltIn && (
                            <button onClick={() => handleDelete(item)} className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 rounded-md transition-colors" aria-label="刪除">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {isCreate && (
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Key <span className="text-[var(--accent-red)]">*</span></label>
                    <input value={fKey} onChange={e => setFKey(e.target.value)} placeholder="例：temperature" className={inp} />
                  </div>
                )}
                <div className={isCreate ? '' : 'col-span-2'}>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">名稱 <span className="text-[var(--accent-red)]">*</span></label>
                  <input value={fName} onChange={e => setFName(e.target.value)} placeholder="例：溫度" className={inp} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">圖示（Emoji 或代碼）</label>
                  <input value={fIcon} onChange={e => setFIcon(e.target.value)} placeholder="例：🌡️" className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">預設單位</label>
                  <input value={fUnit} onChange={e => setFUnit(e.target.value)} placeholder="例：℃" className={inp} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">UCL（上限）</label>
                  <input type="number" value={fUcl} onChange={e => setFUcl(e.target.value)} placeholder="留空 = 不設定" className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">LCL（下限）</label>
                  <input type="number" value={fLcl} onChange={e => setFLcl(e.target.value)} placeholder="留空 = 不設定" className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">排序</label>
                  <input type="number" value={fSort} onChange={e => setFSort(e.target.value)} className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">行為{isBuiltin && <span className="ml-1 opacity-50">（內建不可修改）</span>}</label>
                <select value={fBehavior} disabled={!isCreate || isBuiltin} onChange={e => setFBehavior(e.target.value as PropertyTypeItem['behavior'])} className={`${inp} disabled:opacity-50 disabled:cursor-not-allowed`}>
                  {BEHAVIORS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer (edit mode) */}
        {view === 'edit' && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border-base)] shrink-0">
            {saveStatus === 'ok' && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--accent-green)] animate-in fade-in duration-300 mr-auto">
                <CheckCircle className="w-3.5 h-3.5" /> 已儲存
              </span>
            )}
            {saveStatus === 'err' && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--accent-red)] mr-auto">
                <AlertCircle className="w-3.5 h-3.5" /> {saveError}
              </span>
            )}
            <button onClick={() => setView('list')} className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors">
              取消
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 hover:bg-[var(--accent-primary)]/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? <><Loader className="w-3.5 h-3.5 animate-spin" /> 儲存中…</> : '儲存'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

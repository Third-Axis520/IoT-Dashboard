import React, { useState } from 'react';
import { LayoutTemplate, Plus, Trash2, X } from 'lucide-react';
import type { MachineTemplate, PointTemplate, VisType } from '../../types';
import { generateId } from '../../utils/simulation';

interface DeviceDefCenterModalProps {
  onClose: () => void;
  onSave: (tpl: MachineTemplate) => void;
}

export const DeviceDefCenterModal = ({ onClose, onSave }: DeviceDefCenterModalProps) => {
  const [name, setName] = useState('');
  const [visType, setVisType] = useState<VisType>('custom_grid');
  const [points, setPoints] = useState<PointTemplate[]>([
    { name: 'Point 1', type: 'temperature', defaultUcl: 100, defaultLcl: 0, defaultBase: 50 }
  ]);

  const handleAddPoint = () => {
    setPoints([...points, { name: `Point ${points.length + 1}`, type: 'temperature', defaultUcl: 100, defaultLcl: 0, defaultBase: 50 }]);
  };

  const handlePointChange = (index: number, field: keyof PointTemplate, value: string | number) => {
    setPoints(prev => prev.map((pt, i) =>
      i === index ? { ...pt, [field]: value } as PointTemplate : pt
    ));
  };

  const handleSave = () => {
    if (!name) return;
    onSave({
      id: `tpl_${generateId()}`,
      name,
      visType,
      points
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="def-center-title">
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-[var(--border-base)] bg-[var(--border-base)]/30 shrink-0">
          <h3 id="def-center-title" className="font-bold text-[var(--text-main)] flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-[var(--accent-blue)]" /> Device Definition Center
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-6 flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-2">Template Name</label>
              <input type="text" placeholder="e.g. 新型压合机" value={name} onChange={e => setName(e.target.value)} className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-2">UI Component Layout</label>
              <select value={visType} onChange={e => setVisType(e.target.value as VisType)} className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)]">
                <option value="custom_grid">Custom Grid (Auto)</option>
                <option value="single_kpi">Single KPI (Big Number)</option>
                <option value="dual_side_spark">Dual Columns (Left/Right)</option>
                <option value="four_rings">4 Rings (Hot/Cold style)</option>
                <option value="molding_matrix">3x2 Matrix (Molding style)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Data Points Definition</label>
              <button onClick={handleAddPoint} className="text-xs flex items-center gap-1 text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)]"><Plus className="w-3 h-3"/> Add Point</button>
            </div>
            <div className="space-y-3">
              {points.map((pt, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-[var(--bg-panel)] p-3 rounded-lg border border-[var(--border-base)]">
                  <input type="text" value={pt.name} onChange={e => handlePointChange(idx, 'name', e.target.value)} className="flex-1 bg-[var(--bg-card)] border border-[var(--border-input)] rounded px-2 py-1.5 text-sm text-[var(--text-main)] outline-none" placeholder="Point Name" />
                  <select value={pt.type} onChange={e => handlePointChange(idx, 'type', e.target.value)} className="w-28 bg-[var(--bg-card)] border border-[var(--border-input)] rounded px-2 py-1.5 text-sm text-[var(--text-main)] outline-none">
                    <option value="temperature">Temp (℃)</option>
                    <option value="pressure">Press (MPa)</option>
                  </select>
                  <input type="number" value={pt.defaultUcl} onChange={e => handlePointChange(idx, 'defaultUcl', Number(e.target.value))} className="w-20 bg-[var(--bg-card)] border border-[var(--border-input)] rounded px-2 py-1.5 text-sm text-[var(--accent-red)] outline-none" placeholder="UCL" title="Default UCL (Max)" />
                  <input type="number" value={pt.defaultLcl} onChange={e => handlePointChange(idx, 'defaultLcl', Number(e.target.value))} className="w-20 bg-[var(--bg-card)] border border-[var(--border-input)] rounded px-2 py-1.5 text-sm text-[var(--accent-blue)] outline-none" placeholder="LCL" title="Default LCL (Min)" />
                  <button onClick={() => setPoints(points.filter((_, i) => i !== idx))} className="text-[var(--text-muted)] hover:text-[var(--accent-red)]" aria-label="Remove point"><Trash2 className="w-4 h-4"/></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--border-base)] flex justify-end gap-3 bg-[var(--border-base)]/30 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name || points.length === 0} className="px-4 py-2 rounded-lg text-sm bg-[var(--accent-blue)] text-white font-bold hover:bg-[var(--accent-blue-hover)] transition-colors disabled:opacity-50">Save Template</button>
        </div>
      </div>
    </div>
  );
};

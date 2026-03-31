import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, ReferenceLine, CartesianGrid, AreaChart, Area, ReferenceArea } from 'recharts';
import { Settings, Trash2, Plus, ChevronDown, X, Layers, Database, LayoutTemplate, LayoutDashboard, Thermometer, Activity, Maximize, Minimize, AlertTriangle, Calendar, Search, Clock, Bell, Sun, Moon, Check, ChevronLeft, ChevronRight, Play, Pause, Lock, Unlock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Types ---
type PointStatus = 'normal' | 'warning' | 'danger' | 'offline';
type PointType = 'temperature' | 'pressure';
type VisType = 'molding_matrix' | 'four_rings' | 'dual_side_spark' | 'single_kpi' | 'custom_grid';

interface PointTemplate {
  name: string;
  type: PointType;
  defaultUcl: number;
  defaultLcl: number;
  defaultBase: number; // For simulation
}

interface MachineTemplate {
  id: string;
  name: string;
  visType: VisType;
  points: PointTemplate[];
}

export interface Point {
  id: string;
  name: string;
  type: PointType;
  value: number;
  unit: string;
  status: PointStatus;
  history: { time: number; value: number }[];
  ucl: number;
  lcl: number;
}

export interface AlertRecord {
  id: string;
  time: number;
  eqName: string;
  deviceId: string;
  pointName: string;
  value: number;
  limit: number;
  type: 'UCL' | 'LCL';
  status: 'warning' | 'danger';
}

export interface Equipment {
  id: string;
  deviceId: string;
  templateId: string;
  name: string;
  visType: VisType;
  points: Point[];
}

interface ProductionLine {
  id: string;
  name: string;
  equipments: Equipment[];
}

// --- Theme Colors ---
const COLORS = {
  bg: 'var(--bg-panel)',
  cardBg: 'var(--bg-card)',
  border: 'var(--border-base)',
  textPrimary: 'var(--text-main)',
  textSecondary: 'var(--text-muted)',
  normal: 'var(--accent-green)', // Emerald
  warning: 'var(--accent-yellow)', // Bright Yellow
  danger: 'var(--accent-red)', // Pulsing Red
  hot: 'var(--accent-orange)', // Orange
  cold: 'var(--accent-blue)', // Blue
};

const getStatusColor = (status: PointStatus) => {
  if (status === 'danger') return COLORS.danger;
  if (status === 'warning') return COLORS.warning;
  return COLORS.normal;
};

// --- Initial Metadata & Data ---
const INITIAL_TEMPLATES: MachineTemplate[] = [
  {
    id: 'tpl_hot_cold', name: '冷热定型机模板', visType: 'four_rings',
    points: [
      { name: '热区上', type: 'temperature', defaultUcl: 130, defaultLcl: 110, defaultBase: 120 },
      { name: '热区下', type: 'temperature', defaultUcl: 130, defaultLcl: 110, defaultBase: 120 },
      { name: '冷区上', type: 'temperature', defaultUcl: 20, defaultLcl: 10, defaultBase: 15 },
      { name: '冷区下', type: 'temperature', defaultUcl: 20, defaultLcl: 10, defaultBase: 15 },
    ]
  },
  {
    id: 'tpl_vulcanizer', name: '加硫机模板', visType: 'single_kpi',
    points: [{ name: '加硫温度', type: 'temperature', defaultUcl: 160, defaultLcl: 140, defaultBase: 150 }]
  },
  {
    id: 'tpl_scribing', name: '划线机模板', visType: 'single_kpi',
    points: [{ name: '系统压力', type: 'pressure', defaultUcl: 7, defaultLcl: 3, defaultBase: 5.2 }]
  },
  {
    id: 'tpl_molding', name: '烘箱模板', visType: 'molding_matrix',
    points: [
      { name: '上层前', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 85 },
      { name: '上层中', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 85 },
      { name: '上层后', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 85 },
      { name: '下层前', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 82 },
      { name: '下层中', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 82 },
      { name: '下层后', type: 'temperature', defaultUcl: 95, defaultLcl: 75, defaultBase: 82 },
    ]
  },
  {
    id: 'tpl_press', name: '万能压机模板', visType: 'dual_side_spark',
    points: [
      { name: '左边束紧', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '左边二次', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '左边押边', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '右边束紧', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '右边二次', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
      { name: '右边押边', type: 'pressure', defaultUcl: 10, defaultLcl: 6, defaultBase: 8.5 },
    ]
  },
  {
    id: 'tpl_freezer', name: '冷冻机模板', visType: 'single_kpi',
    points: [{ name: '冷冻温度', type: 'temperature', defaultUcl: -10, defaultLcl: -25, defaultBase: -18 }]
  }
];

const generateHistory = (base: number, variance: number, length = 60) => {
  return Array.from({ length }, (_, i) => ({
    time: Date.now() - (length - i) * 60000,
    value: Number((base + (Math.random() * variance * 2 - variance)).toFixed(1))
  }));
};

const createEquipmentFromTemplate = (template: MachineTemplate, name: string, deviceId: string): Equipment => {
  return {
    id: `eq_${generateId()}`,
    deviceId,
    templateId: template.id,
    name,
    visType: template.visType,
    points: template.points.map(pt => ({
      id: `pt_${generateId()}`,
      name: pt.name,
      type: pt.type,
      value: pt.defaultBase,
      unit: pt.type === 'temperature' ? '℃' : 'MPa',
      status: 'normal',
      history: generateHistory(pt.defaultBase, pt.type === 'temperature' ? 1 : 0.2),
      ucl: pt.defaultUcl,
      lcl: pt.defaultLcl
    }))
  };
};

const INITIAL_LINES: ProductionLine[] = [
  {
    id: 'line_a',
    name: 'Line A',
    equipments: [
      createEquipmentFromTemplate(INITIAL_TEMPLATES[0], '冷热定型机 01', 'LN1-CR-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[1], '加硫机 01', 'LN1-JL-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[2], '划线机 01', 'LN1-HX-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[3], '烘箱 01', 'LN1-CX-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[4], '万能压机 01', 'LN1-YJ-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[5], '冷冻机 01', 'LN1-LD-01'),
    ]
  },
  {
    id: 'line_b',
    name: 'Line B',
    equipments: [
      createEquipmentFromTemplate(INITIAL_TEMPLATES[0], '冷热定型机 02', 'LN2-CR-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[1], '加硫机 02', 'LN2-JL-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[2], '划线机 02', 'LN2-HX-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[3], '烘箱 02', 'LN2-CX-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[4], '万能压机 02', 'LN2-YJ-01'),
      createEquipmentFromTemplate(INITIAL_TEMPLATES[5], '冷冻机 02', 'LN2-LD-01'),
    ]
  }
];

// --- Visual Components ---

const AnimatedValue = ({ value, status, className }: { value: number, status: PointStatus, className?: string }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isFlickering, setIsFlickering] = useState(false);

  useEffect(() => {
    if (value !== displayValue) {
      setIsFlickering(true);
      setDisplayValue(value);
      const timer = setTimeout(() => setIsFlickering(false), 150);
      return () => clearTimeout(timer);
    }
  }, [value, displayValue]);

  return (
    <span 
      className={cn(
        "font-mono font-bold transition-all duration-150 text-glow",
        isFlickering ? "brightness-125 scale-[1.02]" : "brightness-100 scale-100",
        className
      )}
      style={{ color: getStatusColor(status) }}
    >
      {value.toFixed(1)}
    </span>
  );
};

// 1. 烘箱 (Molding Matrix 3x2)
const MoldingMatrix = ({ points, onPointSwap, dragScope }: { points: Point[], onPointSwap?: (dragIndex: number, dropIndex: number) => void, dragScope?: string }) => {
  const topLayer = points.slice(0, 3);
  const bottomLayer = points.slice(3, 6);

  const renderBlock = (p: Point, index: number) => {
    const isDanger = p.status === 'danger';
    const isWarning = p.status === 'warning';
    
    return (
      <div key={p.id} 
        draggable={!!onPointSwap}
        onDragStart={(e) => {
          if (onPointSwap) {
            e.dataTransfer.setData('text/plain', index.toString());
            if (dragScope) e.dataTransfer.setData('dragScope', dragScope);
            e.dataTransfer.effectAllowed = 'move';
          }
        }}
        onDragOver={(e) => {
          if (onPointSwap) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(e) => {
          if (onPointSwap) {
            e.preventDefault();
            if (dragScope && e.dataTransfer.getData('dragScope') !== dragScope) return;
            const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
            if (!isNaN(dragIndex) && dragIndex !== index) {
              onPointSwap(dragIndex, index);
            }
          }
        }}
        className={cn(
        "flex flex-col items-center justify-center p-2 rounded-md relative overflow-hidden transition-colors duration-300 h-full",
        isDanger ? "bg-[var(--accent-red)]/20 border border-[var(--accent-red)]" : 
        isWarning ? "bg-[var(--accent-yellow)]/20 border border-[var(--accent-yellow)]" : 
        "bg-[var(--border-base)] border border-transparent"
      )}>
        <div className="absolute bottom-0 left-0 right-0 h-1/2 opacity-20 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={p.history}>
              <defs>
                <linearGradient id={`grad-mold-${p.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={getStatusColor(p.status)} stopOpacity={1}/>
                  <stop offset="95%" stopColor={getStatusColor(p.status)} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="none" fill={`url(#grad-mold-${p.id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] mb-1 z-10">{p.name.replace(/上层|下层/, '') || p.name}</span>
        <div className="flex items-baseline gap-0.5 z-10">
          <AnimatedValue value={p.value} status={p.status} className="text-2xl md:text-3xl font-bold" />
          <span className="text-[9px] text-[var(--text-muted)] opacity-60">{p.unit}</span>
        </div>
        {isDanger && <div className="absolute inset-0 border-2 animate-breathe-danger pointer-events-none rounded-md z-20" />}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 h-full justify-center">
      <div className="flex items-center gap-2 flex-1 min-h-0">
        <div className="w-6 text-[10px] text-[var(--text-muted)] writing-vertical-rl text-center font-bold">上层</div>
        <div className="flex-1 grid grid-cols-3 gap-2 h-full">{topLayer.map((p, i) => renderBlock(p, i))}</div>
      </div>
      <div className="flex items-center gap-2 flex-1 min-h-0">
        <div className="w-6 text-[10px] text-[var(--text-muted)] writing-vertical-rl text-center font-bold">下层</div>
        <div className="flex-1 grid grid-cols-3 gap-2 h-full">{bottomLayer.map((p, i) => renderBlock(p, i + 3))}</div>
      </div>
    </div>
  );
};

// 2. 冷热定型机 (4 Rings)
const RingProgress = ({ point, index, onPointSwap, dragScope }: { point: Point, index?: number, onPointSwap?: (dragIndex: number, dropIndex: number) => void, dragScope?: string }) => {
  const percentage = Math.min(100, Math.max(0, ((point.value - point.lcl) / (point.ucl - point.lcl)) * 100));
  const radius = 48.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const isHot = point.name.includes('热') || point.value > 50;

  return (
    <div 
      className="flex flex-col items-center justify-center w-full h-full min-h-[80px] gap-1"
      draggable={!!onPointSwap}
      onDragStart={(e) => {
        if (onPointSwap && index !== undefined) {
          e.dataTransfer.setData('text/plain', index.toString());
          if (dragScope) e.dataTransfer.setData('dragScope', dragScope);
          e.dataTransfer.effectAllowed = 'move';
        }
      }}
      onDragOver={(e) => {
        if (onPointSwap) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        if (onPointSwap && index !== undefined) {
          e.preventDefault();
          if (dragScope && e.dataTransfer.getData('dragScope') !== dragScope) return;
          const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
          if (!isNaN(dragIndex) && dragIndex !== index) {
            onPointSwap(dragIndex, index);
          }
        }
      }}
    >
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full max-w-[200px] max-h-[200px]">
          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="var(--border-base)" strokeWidth="3" />
          <circle 
            cx="50" cy="50" r={radius} fill="transparent" 
            stroke={getStatusColor(point.status)} 
            strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset || 0} 
            strokeLinecap="round" className="transition-all duration-500 ease-out" 
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedValue value={point.value} status={point.status} className={cn("text-2xl md:text-3xl font-bold tracking-tighter", isHot ? "text-[var(--accent-orange)]" : "text-[var(--accent-blue)]")} />
        </div>
      </div>
      <span className="text-[10px] md:text-xs text-[var(--text-muted)] text-center leading-none">{point.name}</span>
    </div>
  );
};

const FourRings = ({ points, onPointSwap, dragScope }: { points: Point[], onPointSwap?: (dragIndex: number, dropIndex: number) => void, dragScope?: string }) => (
  <div className="grid grid-cols-2 gap-2 md:gap-4 h-full content-center place-items-center p-2">
    {points.slice(0, 4).map((p, i) => <RingProgress key={p.id} point={p} index={i} onPointSwap={onPointSwap} dragScope={dragScope} />)}
  </div>
);

// 3. 万能压机 (Dual Values + Side Sparkline) -> Now 6 points (Left/Right)
const DualSideSpark = ({ points, onPointSwap, dragScope }: { points: Point[], onPointSwap?: (dragIndex: number, dropIndex: number) => void, dragScope?: string }) => {
  const renderPoint = (p: Point, index: number) => (
    <div key={p.id} 
      className="bg-[var(--border-base)]/30 rounded p-2 flex justify-between items-center border border-[var(--border-base)]"
      draggable={!!onPointSwap}
      onDragStart={(e) => {
        if (onPointSwap) {
          e.dataTransfer.setData('text/plain', index.toString());
          if (dragScope) e.dataTransfer.setData('dragScope', dragScope);
          e.dataTransfer.effectAllowed = 'move';
        }
      }}
      onDragOver={(e) => {
        if (onPointSwap) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        if (onPointSwap) {
          e.preventDefault();
          if (dragScope && e.dataTransfer.getData('dragScope') !== dragScope) return;
          const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
          if (!isNaN(dragIndex) && dragIndex !== index) {
            onPointSwap(dragIndex, index);
          }
        }
      }}
    >
      <span className="text-[10px] text-[var(--text-muted)]">{p.name}</span>
      <div className="flex items-baseline gap-1">
        <AnimatedValue value={p.value} status={p.status} className="text-2xl font-bold" />
        <span className="text-[10px] text-[var(--text-muted)] opacity-60">{p.unit}</span>
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full gap-4 p-2">
      <div className="flex-1 flex flex-col gap-2">
        <div className="text-[10px] text-[var(--text-muted)] font-bold mb-1 text-center border-b border-[var(--border-base)] pb-1 tracking-widest">左侧 (LEFT)</div>
        {points.slice(0, 3).map((p, i) => renderPoint(p, i))}
      </div>
      <div className="flex-1 flex flex-col gap-2">
        <div className="text-[10px] text-[var(--text-muted)] font-bold mb-1 text-center border-b border-[var(--border-base)] pb-1 tracking-widest">右侧 (RIGHT)</div>
        {points.slice(3, 6).map((p, i) => renderPoint(p, i + 3))}
      </div>
    </div>
  );
};

// 4. 单点设备 (Single KPI)
const SingleKpi = ({ points }: { points: Point[] }) => {
  const point = points[0];
  if (!point) return null;

  return (
    <div className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden rounded-lg">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={point.history}>
            <defs>
              <linearGradient id={`grad-single-${point.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={getStatusColor(point.status)} stopOpacity={1}/>
                <stop offset="95%" stopColor={getStatusColor(point.status)} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#grad-single-${point.id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <span className="text-sm md:text-base text-[var(--text-muted)] mb-2 z-10 font-medium">{point.name}</span>
      <div className="flex items-baseline gap-1 z-10">
        <AnimatedValue value={point.value} status={point.status} className="text-7xl md:text-8xl tracking-tight font-bold" />
        <span className="text-lg md:text-xl text-[var(--text-muted)] opacity-60">{point.unit}</span>
      </div>
    </div>
  );
};

// 5. Custom Grid (Fallback for new types)
const CustomGrid = ({ points, onPointSwap, dragScope }: { points: Point[], onPointSwap?: (dragIndex: number, dropIndex: number) => void, dragScope?: string }) => (
  <div className="grid grid-cols-2 gap-2 h-full content-start overflow-y-auto custom-scrollbar pr-1">
    {points.map((p, index) => (
      <div key={p.id} 
        className="bg-[var(--border-base)]/30 rounded p-2 border border-[var(--border-base)]"
        draggable={!!onPointSwap}
        onDragStart={(e) => {
          if (onPointSwap) {
            e.dataTransfer.setData('text/plain', index.toString());
            if (dragScope) e.dataTransfer.setData('dragScope', dragScope);
            e.dataTransfer.effectAllowed = 'move';
          }
        }}
        onDragOver={(e) => {
          if (onPointSwap) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(e) => {
          if (onPointSwap) {
            e.preventDefault();
            if (dragScope && e.dataTransfer.getData('dragScope') !== dragScope) return;
            const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
            if (!isNaN(dragIndex) && dragIndex !== index) {
              onPointSwap(dragIndex, index);
            }
          }
        }}
      >
        <span className="text-[10px] text-[var(--text-muted)] block truncate">{p.name}</span>
        <AnimatedValue value={p.value} status={p.status} className="text-2xl font-bold" />
      </div>
    ))}
  </div>
);

// --- Unified Sparkline (Bottom of cards) ---
const UnifiedSparkline = ({ points, visType }: { points: Point[], visType: VisType }) => {
  return (
    <div className="h-10 shrink-0 w-full bg-[var(--bg-panel)] border-t border-[var(--border-base)] relative overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
          {points.map((p, i) => (
            <Line 
              key={p.id}
              data={p.history}
              type="monotone" 
              dataKey="value" 
              stroke={getStatusColor(p.status)} 
              strokeWidth={1.5} 
              dot={false} 
              isAnimationActive={false}
              opacity={i === 0 ? 1 : 0.2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// --- Modals ---

const AddDeviceModal = ({ templates, onClose, onAdd }: { templates: MachineTemplate[], onClose: () => void, onAdd: (tpl: MachineTemplate, name: string, deviceId: string) => void }) => {
  const [selectedTplId, setSelectedTplId] = useState(templates[0]?.id || '');
  const [deviceName, setDeviceName] = useState('');
  const [deviceId, setDeviceId] = useState('');

  const handleAdd = () => {
    const tpl = templates.find(t => t.id === selectedTplId);
    if (tpl && deviceName && deviceId) {
      onAdd(tpl, deviceName, deviceId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-[var(--border-base)] bg-[var(--border-base)]/30">
          <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--accent-green)]" /> Add Device from Template
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-2">Select Template</label>
            <select 
              value={selectedTplId} 
              onChange={e => setSelectedTplId(e.target.value)}
              className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
            >
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-2">Device Name</label>
            <input 
              type="text" 
              placeholder="e.g. 冷热定型机 03"
              value={deviceName} 
              onChange={e => setDeviceName(e.target.value)}
              className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-2">Device ID (Backend Match)</label>
            <input 
              type="text" 
              placeholder="e.g. LN2-CR-03"
              value={deviceId} 
              onChange={e => setDeviceId(e.target.value)}
              className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] font-mono"
            />
          </div>
        </div>
        <div className="p-4 border-t border-[var(--border-base)] flex justify-end gap-3 bg-[var(--border-base)]/30">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Cancel</button>
          <button onClick={handleAdd} disabled={!deviceName || !deviceId} className="px-4 py-2 rounded-lg text-sm bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold hover:bg-[var(--accent-green-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Add Device</button>
        </div>
      </div>
    </div>
  );
};

const DeviceDefCenterModal = ({ onClose, onSave }: { onClose: () => void, onSave: (tpl: MachineTemplate) => void }) => {
  const [name, setName] = useState('');
  const [visType, setVisType] = useState<VisType>('custom_grid');
  const [points, setPoints] = useState<PointTemplate[]>([
    { name: 'Point 1', type: 'temperature', defaultUcl: 100, defaultLcl: 0, defaultBase: 50 }
  ]);

  const handleAddPoint = () => {
    setPoints([...points, { name: `Point ${points.length + 1}`, type: 'temperature', defaultUcl: 100, defaultLcl: 0, defaultBase: 50 }]);
  };

  const handlePointChange = (index: number, field: keyof PointTemplate, value: any) => {
    const newPoints = [...points];
    newPoints[index] = { ...newPoints[index], [field]: value };
    setPoints(newPoints);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-[var(--border-base)] bg-[var(--border-base)]/30 shrink-0">
          <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-[var(--accent-blue)]" /> Device Definition Center
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X className="w-5 h-5" /></button>
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
                  <button onClick={() => setPoints(points.filter((_, i) => i !== idx))} className="text-[var(--text-muted)] hover:text-[var(--accent-red)]"><Trash2 className="w-4 h-4"/></button>
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

const DrillDownModal = ({ 
  equipment, 
  onClose, 
  onSaveConfig,
  isAutoPlaying = false,
  autoPlaySpeed = 8000,
  onAutoPlayNextEq,
  onStopAutoPlay
}: { 
  equipment: Equipment; 
  onClose: () => void; 
  onSaveConfig: (eq: Equipment) => void;
  isAutoPlaying?: boolean;
  autoPlaySpeed?: number;
  onAutoPlayNextEq?: () => void;
  onStopAutoPlay?: () => void;
}) => {
  const [localEq, setLocalEq] = useState<Equipment>(JSON.parse(JSON.stringify(equipment)));
  const [progress, setProgress] = useState(0);

  // Sync live data while preserving local thresholds
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
          return {
            ...prevPt,
            value: newPt.value,
            history: newPt.history,
            status: newPt.status
          };
        })
      };
    });
  }, [equipment]);

  // Auto-play timer logic
  useEffect(() => {
    if (!isAutoPlaying) return;

    const DWELL_TIME = autoPlaySpeed; // Use configurable speed
    const TICK_RATE = 50; // Update progress every 50ms
    const step = (TICK_RATE / DWELL_TIME) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          // Time to move to next equipment
          setTimeout(() => {
            if (onAutoPlayNextEq) onAutoPlayNextEq();
          }, 0);
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
    setLocalEq(prev => ({
      ...prev,
      points: prev.points.map(p => p.id === pointId ? { ...p, [field]: num } : p)
    }));
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/90 backdrop-blur-md p-4 md:p-6">
      <div className="bg-[var(--bg-card)]/90 border border-[var(--border-base)] rounded-2xl w-[94vw] max-w-[1800px] h-[94vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 relative">
        {isAutoPlaying && (
          <div className="absolute top-0 left-0 h-1 bg-[var(--accent-blue)] transition-all duration-75 ease-linear z-50" style={{ width: `${progress}%` }} />
        )}
        <div className="flex justify-between items-center p-6 border-b border-[var(--border-base)] shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-[var(--text-main)]" style={{ fontSize: 'clamp(20px, 2vw, 32px)' }}>{localEq.name}</h2>
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
              <button onClick={() => onSaveConfig(localEq)} className="px-4 py-2 bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-lg text-sm hover:bg-[var(--accent-green-hover)] transition-colors">
                Save Thresholds
              </button>
            )}
            <button onClick={onClose} className="p-2 bg-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg transition-colors">
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
                <ResponsiveContainer width="100%" height="100%">
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
                    
                    {/* Shaded areas outside limits */}
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

const getGridStyle = (count: number) => {
  if (count === 0) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
  if (count === 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
  if (count === 2) return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: '1fr' };
  if (count === 3) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr' };
  if (count === 4) return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
  if (count <= 6) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
  if (count <= 8) return { gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
  if (count <= 9) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
  if (count <= 12) return { gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
  const cols = Math.ceil(Math.sqrt(count * (16/9)));
  const rows = Math.ceil(count / cols);
  return { gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` };
};

const PointTrendCard = ({
  lineId,
  eq,
  point,
  compact = false,
  onUpdateLimits
}: {
  lineId: string;
  eq: Equipment;
  point: Point;
  compact?: boolean;
  onUpdateLimits: (lineId: string, eqId: string, pointId: string, ucl: number, lcl: number) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editUcl, setEditUcl] = useState(point.ucl.toString());
  const [editLcl, setEditLcl] = useState(point.lcl.toString());

  const handleSave = () => {
    const ucl = parseFloat(editUcl);
    const lcl = parseFloat(editLcl);
    if (!isNaN(ucl) && !isNaN(lcl)) {
      onUpdateLimits(lineId, eq.id, point.id, ucl, lcl);
    }
    setIsEditing(false);
  };

  const isWarning = point.status === 'warning';
  const isDanger = point.status === 'danger';
  const isAlarm = isWarning || isDanger;
  
  const borderColor = isDanger ? 'border-[var(--accent-red-light)] animate-breathe-danger' : isWarning ? 'border-[var(--accent-yellow-light)] animate-breathe-warning' : 'border-[var(--border-trend)]';
  const shadowColor = isDanger ? '' : isWarning ? '' : 'shadow-[0_0_15px_var(--border-base)]';
  const dotColor = isDanger ? 'bg-[var(--accent-red-light)]' : isWarning ? 'bg-[var(--accent-yellow-light)]' : 'bg-[var(--accent-green)]';
  const textColor = isDanger ? 'text-[var(--accent-red-light)]' : isWarning ? 'text-[var(--accent-yellow-light)]' : 'text-[var(--accent-green)]';

  const chartData = point.history.map(h => ({
    time: h.time,
    value: h.value
  }));

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: compact ? 5 : 10, right: 0, left: compact ? 0 : -20, bottom: 0 }
    };

    const commonAxes = (
      <>
        {!compact && (
          <XAxis 
            dataKey="time" 
            tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 
            stroke="var(--bg-scrollbar)" 
            tick={{fill: 'var(--bg-scrollbar)', fontSize: 9}} 
            axisLine={false}
            tickLine={false}
            minTickGap={30}
          />
        )}
        <YAxis 
          domain={[
            (dataMin: number) => Math.min(dataMin, point.lcl) - Math.max((point.ucl - point.lcl) * 0.1, 5),
            (dataMax: number) => Math.max(dataMax, point.ucl) + Math.max((point.ucl - point.lcl) * 0.1, 5)
          ]} 
          stroke="var(--bg-scrollbar)" 
          tick={compact ? false : {fill: 'var(--bg-scrollbar)', fontSize: 9}} 
          axisLine={false}
          tickLine={false}
          width={compact ? 0 : 35}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: 'var(--bg-root)', borderColor: 'var(--border-trend)', borderRadius: '8px', fontSize: '12px' }} 
          labelFormatter={(l) => new Date(l).toLocaleTimeString()} 
        />
        
        {/* Shaded areas outside limits */}
        <ReferenceArea y1={point.ucl} y2={999999} fill="var(--accent-red)" fillOpacity={0.08} />
        <ReferenceArea y1={-999999} y2={point.lcl} fill="var(--accent-red)" fillOpacity={0.08} />
        
        {/* Limit lines */}
        <ReferenceLine y={point.ucl} stroke="var(--accent-red)" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />
        <ReferenceLine y={point.lcl} stroke="var(--accent-red)" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />
      </>
    );

    if (eq.visType === 'molding_matrix') {
      return (
        <LineChart {...commonProps}>
          {commonAxes}
          <Line 
            type="stepAfter" 
            dataKey="value" 
            stroke={isDanger ? 'var(--accent-red-light)' : isWarning ? 'var(--accent-yellow-light)' : 'var(--accent-green)'} 
            strokeWidth={2} 
            dot={false}
            isAnimationActive={false} 
          />
        </LineChart>
      );
    }

    if (eq.visType === 'four_rings') {
      return (
        <LineChart {...commonProps}>
          {commonAxes}
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={isDanger ? 'var(--accent-red-light)' : isWarning ? 'var(--accent-yellow-light)' : 'var(--accent-green)'} 
            strokeWidth={2} 
            dot={false}
            isAnimationActive={false} 
          />
        </LineChart>
      );
    }

    // Default to AreaChart for others (dual_side_spark, single_kpi, custom_grid)
    return (
      <AreaChart {...commonProps}>
        <defs>
          <linearGradient id={`grad-trend-${point.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isDanger ? 'var(--accent-red-light)' : isWarning ? 'var(--accent-yellow-light)' : 'var(--accent-green)'} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={isDanger ? 'var(--accent-red-light)' : isWarning ? 'var(--accent-yellow-light)' : 'var(--accent-green)'} stopOpacity={0}/>
          </linearGradient>
        </defs>
        {commonAxes}
        <Area 
          type="monotone" 
          dataKey="value" 
          stroke={isDanger ? 'var(--accent-red-light)' : isWarning ? 'var(--accent-yellow-light)' : 'var(--accent-green)'} 
          fill={`url(#grad-trend-${point.id})`} 
          strokeWidth={2} 
          isAnimationActive={false} 
        />
      </AreaChart>
    );
  };

  return (
    <div className={cn("glass-panel rounded-xl flex flex-col h-full w-full overflow-hidden relative group transition-all duration-300", borderColor, shadowColor)}>
      {compact && <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-[var(--bg-panel)] to-transparent z-0 pointer-events-none" />}
      <div className={cn("flex justify-between items-start shrink-0 z-10", compact ? "absolute top-0 left-0 right-0 p-2 pointer-events-none" : "relative p-4 pb-0")}>
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn("w-2 h-2 rounded-full shadow-[0_0_5px_currentColor]", dotColor)} />
            <span className={cn("font-bold text-[var(--text-main)] tracking-wide", compact ? "text-xs drop-shadow-md" : "text-sm")}>{eq.name}</span>
            {!compact && <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 border border-[var(--border-base)] px-1 rounded bg-[var(--border-base)]/50">{eq.deviceId}</span>}
          </div>
          {!compact && <span className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase ml-4">{point.type === 'temperature' ? 'MOLD TEMP' : point.type === 'pressure' ? 'CURRENT' : point.type}</span>}
          <div className={cn("flex items-baseline gap-1 ml-4", compact ? "mt-0" : "mt-1")}>
            <span className={cn("font-bold font-mono tracking-tighter text-glow", textColor, compact ? "text-2xl drop-shadow-md" : "text-4xl")}>
              {point.value.toFixed(1)}
            </span>
            {!compact && <span className="text-xs text-[var(--text-muted)]">{point.unit}</span>}
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          <span className={cn("text-[var(--text-muted)]", compact ? "text-[9px] drop-shadow-md" : "text-[10px] mb-1")}>{point.name}</span>
          {isEditing ? (
            <div className={cn("flex flex-col items-end glass-card rounded border border-[var(--border-trend)] pointer-events-auto", compact ? "mt-1 p-1 gap-0.5" : "mt-2 p-2 gap-1")}>
              <div className="flex items-center gap-1">
                <span className={cn("text-[var(--text-muted)]", compact ? "text-[8px]" : "text-[10px]")}>UCL:</span>
                <input 
                  type="number" 
                  value={editUcl} 
                  onChange={e => setEditUcl(e.target.value)}
                  className={cn("bg-transparent border-b border-[var(--accent-blue)] text-[var(--text-main)] outline-none text-right", compact ? "w-8 text-[9px]" : "w-12 text-xs")}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className={cn("text-[var(--text-muted)]", compact ? "text-[8px]" : "text-[10px]")}>LCL:</span>
                <input 
                  type="number" 
                  value={editLcl} 
                  onChange={e => setEditLcl(e.target.value)}
                  className={cn("bg-transparent border-b border-[var(--accent-blue)] text-[var(--text-main)] outline-none text-right", compact ? "w-8 text-[9px]" : "w-12 text-xs")}
                />
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setIsEditing(false)} className={cn("text-[var(--text-muted)] hover:text-[var(--text-main)]", compact ? "text-[8px]" : "text-[10px]")}>Cancel</button>
                <button onClick={handleSave} className={cn("text-[var(--accent-green)] hover:text-[var(--accent-green-light)]", compact ? "text-[8px]" : "text-[10px]")}>Save</button>
              </div>
            </div>
          ) : (
            <div 
              className={cn("flex flex-col items-end cursor-pointer hover:bg-[var(--border-trend)]/50 rounded transition-colors", compact ? "mt-0 p-0 pointer-events-auto" : "mt-2 p-1")}
              onClick={() => setIsEditing(true)}
              title="Click to edit limits"
            >
              <div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
                <span className={cn("text-[var(--text-muted)]", compact ? "text-[8px] drop-shadow-md" : "text-[10px]")}>UCL:</span>
                <span className={cn("font-mono text-[var(--accent-red)] opacity-80 font-bold", compact ? "text-[9px] drop-shadow-md" : "text-xs")}>{point.ucl}</span>
              </div>
              <div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
                <span className={cn("text-[var(--text-muted)]", compact ? "text-[8px] drop-shadow-md" : "text-[10px]")}>LCL:</span>
                <span className={cn("font-mono text-[var(--accent-red)] opacity-80 font-bold", compact ? "text-[9px] drop-shadow-md" : "text-xs")}>{point.lcl}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={cn("flex-1 min-h-0 relative z-0", compact ? "mt-0" : "mt-2")}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const AlertPanel = ({ alerts, height, onToggleExpand }: { alerts: AlertRecord[], height: number, onToggleExpand: () => void }) => {
  const [dateFilter, setDateFilter] = useState('');
  
  const recentAlerts = alerts.slice(-10).reverse();

  const filteredAlerts = useMemo(() => {
    let filtered = [...alerts].reverse();
    if (dateFilter) {
      filtered = filtered.filter(a => {
        const d = new Date(a.time);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return dateStr === dateFilter;
      });
    }
    return filtered;
  }, [alerts, dateFilter]);

  if (height <= 80) {
    return (
      <div 
        className="h-full w-full bg-[var(--bg-card)] flex items-center px-4 cursor-pointer hover:bg-[var(--border-base)] transition-colors overflow-hidden group"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3 text-[var(--accent-red)] font-bold shrink-0">
          <Bell className="w-5 h-5 animate-pulse" />
          <span className="hidden md:inline">REAL-TIME ALERTS</span>
        </div>
        <div className="w-px h-6 bg-[var(--border-base)] mx-4 shrink-0" />
        <div className="flex-1 overflow-hidden relative h-full flex items-center">
          {recentAlerts.length > 0 ? (
            <div className="flex gap-8 animate-marquee whitespace-nowrap items-center">
              {recentAlerts.map((a, i) => (
                <div key={`${a.id}-${i}`} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] font-mono">{new Date(a.time).toLocaleTimeString()}</span>
                  <span className="text-sm font-bold text-[var(--text-main)]">
                    {a.eqName} <span className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--border-base)] px-1 rounded">{a.deviceId}</span> - {a.pointName}
                  </span>
                  <span className={cn("text-sm font-bold", a.status === 'danger' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-yellow)]')}>
                    {a.type} Violation: {a.value.toFixed(1)}
                  </span>
                </div>
              ))}
              {/* Duplicate for seamless marquee */}
              {recentAlerts.map((a, i) => (
                <div key={`dup-${a.id}-${i}`} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] font-mono">{new Date(a.time).toLocaleTimeString()}</span>
                  <span className="text-sm font-bold text-[var(--text-main)]">
                    {a.eqName} <span className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--border-base)] px-1 rounded">{a.deviceId}</span> - {a.pointName}
                  </span>
                  <span className={cn("text-sm font-bold", a.status === 'danger' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-yellow)]')}>
                    {a.type} Violation: {a.value.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">No recent alerts</span>
          )}
        </div>
        <div className="shrink-0 ml-4 text-xs text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors flex items-center gap-1">
          Drag up or click to expand <ChevronDown className="w-3 h-3 -rotate-180" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full glass-panel border-l-0">
      <div className="flex justify-between items-center p-3 border-b border-[var(--border-base)] shrink-0">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--accent-red)] text-glow" />
          <h2 className="text-lg font-bold text-[var(--text-main)]">Alert History</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-2 py-1">
            <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
            <input 
              type="date" 
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-main)] outline-none"
            />
          </div>
          {dateFilter && (
            <button onClick={() => setDateFilter('')} className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)]">
              Clear
            </button>
          )}
          <div className="text-xs text-[var(--text-muted)]">
            Total: <span className="text-[var(--text-main)] font-bold">{filteredAlerts.length}</span>
          </div>
          <button onClick={onToggleExpand} className="p-1.5 bg-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg transition-colors">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-0 min-h-0">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[var(--border-base)] sticky top-0 z-10">
            <tr>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Time</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Equipment</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Point</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Type</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Value</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Limit</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.length > 0 ? filteredAlerts.map(alert => (
              <tr key={alert.id} className="border-b border-[var(--border-base)] hover:bg-[var(--border-base)]/50 transition-colors">
                <td className="p-3 text-xs text-[var(--text-main)] whitespace-nowrap">
                  {new Date(alert.time).toLocaleString()}
                </td>
                <td className="p-3 text-xs text-[var(--text-main)]">
                  <div>{alert.eqName}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">{alert.deviceId}</div>
                </td>
                <td className="p-3 text-xs text-[var(--text-main)]">{alert.pointName}</td>
                <td className="p-3 text-xs">
                  <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold",
                    alert.status === 'danger' ? "bg-[var(--accent-red)]/20 text-[var(--accent-red)]" : "bg-[var(--accent-yellow)]/20 text-[var(--accent-yellow)]"
                  )}>
                    {alert.type} {alert.status === 'danger' ? 'ALARM' : 'WARN'}
                  </span>
                </td>
                <td className={cn("p-3 text-xs font-mono font-bold", alert.status === 'danger' ? "text-[var(--accent-red)]" : "text-[var(--accent-yellow)]")}>
                  {alert.value.toFixed(1)}
                </td>
                <td className="p-3 text-xs font-mono text-[var(--text-muted)]">{alert.limit.toFixed(1)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="p-6 text-center text-xs text-[var(--text-muted)]">
                  No alerts found for the selected criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TempTrendsView = ({ 
  displayedEquipments, 
  alerts,
  onUpdateLimits 
}: { 
  displayedEquipments: { lineId: string, eq: Equipment }[];
  alerts: AlertRecord[];
  onUpdateLimits: (lineId: string, eqId: string, pointId: string, ucl: number, lcl: number) => void;
}) => {
  const [alertHeight, setAlertHeight] = useState(48);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newHeight = containerRect.bottom - e.clientY;
    setAlertHeight(Math.max(48, Math.min(containerRect.height * 0.8, newHeight)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleMouseMove]);

  const allPoints = useMemo(() => {
    const points: { lineId: string, eq: Equipment, point: Point }[] = [];
    displayedEquipments.forEach(({ lineId, eq }) => {
      eq.points.forEach(p => {
        points.push({ lineId, eq, point: p });
      });
    });
    return points;
  }, [displayedEquipments]);

  const getFlexBasis = (count: number) => {
    if (count === 0) return '100%';
    const cols = Math.ceil(Math.sqrt(count * 1.5));
    return `calc(${100 / cols}% - 24px)`;
  };

  if (allPoints.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
        No monitoring points available in this line.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col w-full h-full min-h-0 overflow-hidden relative border border-[var(--border-base)] rounded-xl glass-panel">
      <div 
        className={cn("flex-1 min-h-0 flex flex-wrap content-stretch items-stretch animate-in fade-in duration-500 overflow-y-auto", allPoints.length > 8 ? "gap-1 p-1" : "gap-4 md:gap-6 p-4")} 
      >
        {allPoints.map(({ lineId, eq, point }) => (
          <div 
            key={`${eq.id}-${point.id}`} 
            className="flex-auto flex min-w-[150px]"
            style={{ flexBasis: getFlexBasis(allPoints.length) }}
          >
            <PointTrendCard 
              lineId={lineId} 
              eq={eq} 
              point={point} 
              compact={allPoints.length > 8}
              onUpdateLimits={onUpdateLimits}
            />
          </div>
        ))}
      </div>
      
      {/* Draggable Splitter */}
      <div 
        className="h-2 w-full cursor-row-resize bg-[var(--border-base)] hover:bg-[var(--accent-blue)] active:bg-[var(--accent-blue)] transition-colors shrink-0 z-20 relative flex items-center justify-center group"
        onMouseDown={handleMouseDown}
      >
        <div className="w-16 h-1 bg-[var(--bg-scrollbar)] group-hover:bg-[var(--accent-blue)] rounded-full transition-colors pointer-events-none" />
      </div>

      {/* Alert Panel */}
      <div style={{ height: alertHeight }} className="shrink-0 w-full glass-panel border-t-0 flex flex-col overflow-hidden">
        <AlertPanel 
          alerts={alerts} 
          height={alertHeight} 
          onToggleExpand={() => setAlertHeight(h => h > 100 ? 48 : 300)} 
        />
      </div>
    </div>
  );
};

// --- Main App ---
export default function App() {
  const [templates, setTemplates] = useState<MachineTemplate[]>(INITIAL_TEMPLATES);
  const [data, setData] = useState<ProductionLine[]>(INITIAL_LINES);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [activeLineId, setActiveLineId] = useState<string>(INITIAL_LINES[0].id);
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [newLineName, setNewLineName] = useState('');
  const [viewMode, setViewMode] = useState<'dashboard' | 'temp_trends'>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showDefCenter, setShowDefCenter] = useState(false);
  const [drillDownEq, setDrillDownEq] = useState<Equipment | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(8000);
  const [autoPlayEqIndex, setAutoPlayEqIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedEqIndex, setDraggedEqIndex] = useState<number | null>(null);
  const [editingEqId, setEditingEqId] = useState<string | null>(null);
  const [editEqName, setEditEqName] = useState("");
  const [editEqDeviceId, setEditEqDeviceId] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const liveDrillDownEq = useMemo(() => {
    if (!drillDownEq) return null;
    for (const line of data) {
      const eq = line.equipments.find(e => e.id === drillDownEq.id);
      if (eq) return eq;
    }
    return drillDownEq;
  }, [data, drillDownEq]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedEqIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedEqIndex === null || draggedEqIndex === index) return;

    setData(prevLines => {
      const newLines = [...prevLines];
      const lineIndex = newLines.findIndex(l => l.id === activeLineId);
      if (lineIndex === -1) return prevLines;

      const newEquipments = [...newLines[lineIndex].equipments];
      const [removed] = newEquipments.splice(draggedEqIndex, 1);
      newEquipments.splice(index, 0, removed);

      newLines[lineIndex] = { ...newLines[lineIndex], equipments: newEquipments };
      return newLines;
    });
    setDraggedEqIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedEqIndex(null);
  };

  const handleSaveEqEdit = (lineId: string, eqId: string) => {
    setData(prev => prev.map(line => {
      if (line.id === lineId) {
        return {
          ...line,
          equipments: line.equipments.map(eq => {
            if (eq.id === eqId) {
              return { ...eq, name: editEqName, deviceId: editEqDeviceId };
            }
            return eq;
          })
        };
      }
      return line;
    }));
    setEditingEqId(null);
  };

  const handlePointSwap = (lineId: string, eqId: string, dragIndex: number, dropIndex: number) => {
    setData(prev => prev.map(line => line.id === lineId ? {
      ...line,
      equipments: line.equipments.map(eq => {
        if (eq.id === eqId) {
          const newPoints = [...eq.points];
          const dragPoint = newPoints[dragIndex];
          const dropPoint = newPoints[dropIndex];
          
          if (!dragPoint || !dropPoint) return eq;

          // Swap data but keep names and ids
          newPoints[dragIndex] = { ...dropPoint, name: dragPoint.name, id: dragPoint.id };
          newPoints[dropIndex] = { ...dragPoint, name: dropPoint.name, id: dropPoint.id };
          
          return { ...eq, points: newPoints };
        }
        return eq;
      })
    } : line));
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const activeLine = useMemo(() => data.find(l => l.id === activeLineId) || data[0], [data, activeLineId]);

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

  const handleUpdateLimits = (lineId: string, eqId: string, pointId: string, ucl: number, lcl: number) => {
    setData(prevData => prevData.map(line => {
      if (line.id !== lineId) return line;
      return {
        ...line,
        equipments: line.equipments.map(eq => {
          if (eq.id !== eqId) return eq;
          return {
            ...eq,
            points: eq.points.map(p => {
              if (p.id !== pointId) return p;
              return { ...p, ucl, lcl };
            })
          };
        })
      };
    }));
  };

  const dataRef = useRef(data);
  dataRef.current = data;

  // Data Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      const prevData = dataRef.current;
      const newAlerts: AlertRecord[] = [];
      
      const nextData = prevData.map(line => ({
        ...line,
        equipments: line.equipments.map(eq => ({
          ...eq,
          points: eq.points.map(point => {
            const variance = point.type === 'temperature' ? 1.5 : 0.5;
            let newValue = point.value + (Math.random() * variance * 2 - variance);
            
            if (Math.random() > 0.9) newValue += (Math.random() > 0.5 ? 1 : -1) * variance * 3;
            
            const pValue = Number(newValue.toFixed(1));
            const newHistory = [...point.history.slice(1), { time: Date.now(), value: pValue }];
            
            let pStatus: PointStatus = 'normal';
            if (pValue > point.ucl || pValue < point.lcl) {
              pStatus = 'danger';
              if (point.status !== 'danger') {
                newAlerts.push({
                  id: generateId(),
                  time: Date.now(),
                  eqName: eq.name,
                  deviceId: eq.deviceId,
                  pointName: point.name,
                  value: pValue,
                  limit: pValue > point.ucl ? point.ucl : point.lcl,
                  type: pValue > point.ucl ? 'UCL' : 'LCL',
                  status: 'danger'
                });
              }
            }
            else if (pValue > point.ucl * 0.95 || pValue < point.lcl * 1.05) {
              pStatus = 'warning';
              if (point.status === 'normal') {
                newAlerts.push({
                  id: generateId(),
                  time: Date.now(),
                  eqName: eq.name,
                  deviceId: eq.deviceId,
                  pointName: point.name,
                  value: pValue,
                  limit: pValue > point.ucl * 0.95 ? point.ucl : point.lcl,
                  type: pValue > point.ucl * 0.95 ? 'UCL' : 'LCL',
                  status: 'warning'
                });
              }
            }

            return { ...point, value: pValue, history: newHistory, status: pStatus };
          })
        }))
      }));

      setData(nextData);
      if (newAlerts.length > 0) {
        setAlerts(prev => [...prev, ...newAlerts].slice(-1000));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Handlers
  const handleSaveConfig = (updatedEq: Equipment) => {
    setData(prev => prev.map(line => line.id === activeLineId ? {
      ...line, equipments: line.equipments.map(e => e.id === updatedEq.id ? updatedEq : e)
    } : line));
    setDrillDownEq(null);
  };

  const toggleAutoPlay = () => {
    if (isAutoPlaying) {
      setIsAutoPlaying(false);
      setDrillDownEq(null);
    } else {
      if (displayedEquipments.length > 0) {
        setIsAutoPlaying(true);
        setAutoPlayEqIndex(0);
        setDrillDownEq(displayedEquipments[0].eq);
      }
    }
  };

  const handleAutoPlayNextEq = useCallback(() => {
    if (!isAutoPlaying || displayedEquipments.length === 0) return;
    const nextIndex = (autoPlayEqIndex + 1) % displayedEquipments.length;
    setAutoPlayEqIndex(nextIndex);
    setDrillDownEq(displayedEquipments[nextIndex].eq);
  }, [isAutoPlaying, autoPlayEqIndex, displayedEquipments]);

  const handleDeleteEquipment = (lineId: string, eqId: string) => {
    setData(prev => prev.map(line => line.id === lineId ? {
      ...line, equipments: line.equipments.filter(e => e.id !== eqId)
    } : line));
  };

  const handleAddLine = () => {
    if (!newLineName.trim()) return;
    const newLineId = `line-${Date.now()}`;
    setData(prev => [...prev, {
      id: newLineId,
      name: newLineName.trim(),
      equipments: []
    }]);
    setActiveLineId(newLineId);
    setNewLineName('');
    setIsAddingLine(false);
  };

  const handleDeleteLine = (e: React.MouseEvent, lineId: string) => {
    e.stopPropagation();
    if (data.length <= 1) return;
    setData(prev => {
      const newLines = prev.filter(l => l.id !== lineId);
      if (activeLineId === lineId) {
        setActiveLineId(newLines[0].id);
      }
      return newLines;
    });
  };

  const handleAddDevice = (tpl: MachineTemplate, name: string, deviceId: string) => {
    const newEq = createEquipmentFromTemplate(tpl, name, deviceId);
    setData(prev => prev.map(line => line.id === activeLineId ? {
      ...line, equipments: [...line.equipments, newEq]
    } : line));
    setShowAddDevice(false);
  };

  const handleAddTemplate = (tpl: MachineTemplate) => {
    setTemplates(prev => [...prev, tpl]);
    setShowDefCenter(false);
  };

  const { totalPoints, alarmCount } = useMemo(() => {
    let total = 0, alarms = 0;
    activeLine.equipments.forEach(e => e.points.forEach(p => {
      total++;
      if (p.status === 'danger') alarms++;
    }));
    return { totalPoints: total, alarmCount: alarms };
  }, [activeLine]);

  return (
    <div className={cn("app-container h-screen w-screen bg-[var(--bg-root)] text-[var(--text-main)] font-sans overflow-hidden flex flex-col transition-colors duration-300", theme === 'light' && 'theme-light')}>
      
      {/* Top Toolbar */}
      <header className="h-16 glass-panel border-b-0 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-6">
          {/* Line Selector */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md hover:border-[var(--accent-green)] transition-colors">
              <Layers className="w-4 h-4 text-[var(--accent-green)]" />
              <span className="font-bold">{activeLine.name}</span>
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
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
                    <button onClick={handleAddLine} className="p-1 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 rounded shrink-0">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => setIsAddingLine(false)} className="p-1 text-[var(--text-muted)] hover:bg-[var(--border-base)] rounded shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsAddingLine(true); }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-md transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    添加产线
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex bg-[var(--bg-panel)] p-1 rounded-lg border border-[var(--border-base)]">
            <button 
              onClick={() => setViewMode('dashboard')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors text-xs font-medium",
                viewMode === 'dashboard' ? "bg-[var(--border-base)] text-[var(--accent-green)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              )}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              仪表盘
            </button>
            <button 
              onClick={() => setViewMode('temp_trends')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors text-xs font-medium",
                viewMode === 'temp_trends' ? "bg-[var(--border-base)] text-[var(--accent-green)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              温度趋势
            </button>
          </div>

          {/* Global Stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">点位:</span>
              <span className="font-mono font-bold text-glow text-[var(--accent-blue)]">{totalPoints}</span>
            </div>
            <div className="w-px h-4 bg-[var(--border-base)]" />
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", alarmCount > 0 ? "bg-[var(--accent-red)] animate-pulse" : "bg-[var(--accent-green)]")} />
              <span className="text-[var(--text-muted)]">报警:</span>
              <span className={cn("font-mono font-bold text-glow", alarmCount > 0 ? "text-[var(--accent-red)]" : "text-[var(--accent-green)]")}>{alarmCount}</span>
            </div>
          </div>
        </div>

        {/* Management Actions */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3" />
            <input 
              type="text" 
              placeholder="搜索设备 ID 或名称..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] transition-colors w-48 lg:w-64"
            />
          </div>
          <div className="w-px h-4 bg-[var(--border-base)] mx-1" />
          <button 
            onClick={() => setShowDefCenter(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 rounded-md transition-colors border border-transparent hover:border-[var(--accent-blue)]/30"
          >
            <Database className="w-4 h-4" />
            设备定义中心
          </button>
          <div className="w-px h-4 bg-[var(--border-base)] mx-1" />
          <button 
            onClick={() => setShowAddDevice(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:bg-[var(--accent-green)]/20 rounded-md transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            添加设备
          </button>
          <div className="w-px h-4 bg-[var(--border-base)] mx-1" />
          <div className="flex items-center bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-md overflow-hidden transition-colors">
            <button 
              onClick={toggleAutoPlay}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors font-medium border-r border-[var(--border-base)]",
                isAutoPlaying 
                  ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20" 
                  : "text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10"
              )}
              title="自动播放所有设备趋势"
            >
              {isAutoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isAutoPlaying ? "停止自动播放" : "自动播放"}
            </button>
            <select
              value={autoPlaySpeed}
              onChange={(e) => setAutoPlaySpeed(Number(e.target.value))}
              className="bg-transparent text-[var(--text-main)] text-sm px-2 py-1.5 outline-none cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
              title="播放速度"
            >
              <option value={16000} className="bg-[var(--bg-panel)]">0.5x</option>
              <option value={8000} className="bg-[var(--bg-panel)]">1.0x</option>
              <option value={4000} className="bg-[var(--bg-panel)]">2.0x</option>
              <option value={2000} className="bg-[var(--bg-panel)]">4.0x</option>
            </select>
          </div>
          <div className="w-px h-4 bg-[var(--border-base)] mx-1" />
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={cn(
              "flex items-center justify-center w-8 h-8 border rounded transition-colors",
              isEditMode 
                ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/50 hover:bg-[var(--accent-red)]/20" 
                : "bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-base)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50"
            )}
            title={isEditMode ? "锁定布局 (退出编辑模式)" : "解锁布局 (进入编辑模式)"}
          >
            {isEditMode ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </button>
          <button 
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="flex items-center justify-center w-8 h-8 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50 transition-colors"
            title={theme === 'dark' ? "切换到浅色主题" : "切换到深色主题"}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button 
            onClick={toggleFullscreen}
            className="flex items-center justify-center w-8 h-8 bg-[var(--bg-panel)] border border-[var(--border-base)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent-blue)]/50 transition-colors"
            title={isFullscreen ? "退出全屏" : "全屏显示"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Device Grid Area */}
      <main className="flex-1 min-h-0 p-4 md:p-6 overflow-hidden flex flex-col">
        {displayedEquipments.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
            <div className="w-16 h-16 mb-4 rounded-full bg-[var(--bg-panel)] flex items-center justify-center border border-[var(--border-base)]">
              <Plus className="w-8 h-8 text-[var(--border-base)]" />
            </div>
            <p className="text-lg">No equipment found</p>
            {!searchQuery && <p className="text-sm mt-2">Click "Add Device" to get started</p>}
          </div>
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
                  draggedEqIndex === index ? "opacity-50 scale-95" : ""
                )}
                onClick={() => setDrillDownEq(eq)}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-base)] bg-[var(--bg-panel)]/50 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      eqStatus === 'danger' ? "bg-[var(--accent-red)] shadow-[0_0_8px_var(--accent-red)] animate-pulse" :
                      eqStatus === 'warning' ? "bg-[var(--accent-yellow)]" : "bg-[var(--accent-green)]"
                    )} />
                    {editingEqId === eq.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editEqName}
                          onChange={(e) => setEditEqName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEqEdit(lineId, eq.id);
                            if (e.key === 'Escape') setEditingEqId(null);
                          }}
                          className="bg-[var(--bg-root)] border border-[var(--border-input)] rounded px-2 py-0.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] w-24"
                          placeholder="Name"
                        />
                        <input
                          value={editEqDeviceId}
                          onChange={(e) => setEditEqDeviceId(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEqEdit(lineId, eq.id);
                            if (e.key === 'Escape') setEditingEqId(null);
                          }}
                          className="bg-[var(--bg-root)] border border-[var(--border-input)] rounded px-2 py-0.5 text-[10px] font-mono text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] w-24"
                          placeholder="Device ID"
                        />
                        <button 
                          onClick={() => handleSaveEqEdit(lineId, eq.id)}
                          className="p-1 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 rounded"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => setEditingEqId(null)}
                          className="p-1 text-[var(--text-muted)] hover:bg-[var(--border-base)] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span 
                          className={cn("text-sm font-bold text-[var(--text-main)] tracking-wide transition-colors", isEditMode ? "hover:text-[var(--accent-green)] cursor-text" : "")}
                          onClick={(e) => {
                            if (!isEditMode) return;
                            e.stopPropagation();
                            setEditingEqId(eq.id);
                            setEditEqName(eq.name);
                            setEditEqDeviceId(eq.deviceId);
                          }}
                        >
                          {eq.name}
                        </span>
                        <span 
                          className={cn("text-[10px] text-[var(--text-muted)] font-mono ml-1 border border-[var(--border-base)] px-1 rounded bg-[var(--border-base)]/50 transition-colors", isEditMode ? "hover:border-[var(--accent-green)]/50 hover:text-[var(--text-main)] cursor-text" : "")}
                          onClick={(e) => {
                            if (!isEditMode) return;
                            e.stopPropagation();
                            setEditingEqId(eq.id);
                            setEditEqName(eq.name);
                            setEditEqDeviceId(eq.deviceId);
                          }}
                        >
                          {eq.deviceId}
                        </span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isEditMode && (
                      <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 rounded" onClick={(e) => { e.stopPropagation(); handleDeleteEquipment(lineId, eq.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Body (Visualization) */}
                <div className="flex-1 p-4 min-h-0 flex flex-col justify-center">
                  {eq.visType === 'molding_matrix' && <MoldingMatrix points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => handlePointSwap(lineId, eq.id, drag, drop)} />}
                  {eq.visType === 'four_rings' && <FourRings points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => handlePointSwap(lineId, eq.id, drag, drop)} />}
                  {eq.visType === 'dual_side_spark' && <DualSideSpark points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => handlePointSwap(lineId, eq.id, drag, drop)} />}
                  {eq.visType === 'single_kpi' && <SingleKpi points={eq.points} />}
                  {eq.visType === 'custom_grid' && <CustomGrid points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => handlePointSwap(lineId, eq.id, drag, drop)} />}
                </div>

                {/* Sparkline Footer */}
                <UnifiedSparkline points={eq.points} visType={eq.visType} />
              </div>
            );
          })}

          </div>
        )}
      </main>

      {/* Modals */}
      {showAddDevice && <AddDeviceModal templates={templates} onClose={() => setShowAddDevice(false)} onAdd={handleAddDevice} />}
      {showDefCenter && <DeviceDefCenterModal onClose={() => setShowDefCenter(false)} onSave={handleAddTemplate} />}
      {liveDrillDownEq && (
        <DrillDownModal 
          equipment={liveDrillDownEq} 
          onClose={() => {
            setDrillDownEq(null);
            setIsAutoPlaying(false);
          }} 
          onSaveConfig={handleSaveConfig} 
          isAutoPlaying={isAutoPlaying}
          autoPlaySpeed={autoPlaySpeed}
          onAutoPlayNextEq={handleAutoPlayNextEq}
          onStopAutoPlay={() => setIsAutoPlaying(false)}
        />
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-base); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--bg-scrollbar); }
        
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
          display: flex;
          width: max-content;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}

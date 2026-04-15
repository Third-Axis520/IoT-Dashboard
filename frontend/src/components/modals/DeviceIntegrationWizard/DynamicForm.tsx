import { useState } from 'react';
import type { ConfigFieldItem } from '../../../lib/apiProtocols';

interface DynamicFormProps {
  schema: ConfigFieldItem[];
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
}

function HelpTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-[var(--border-base)] text-[var(--text-muted)] text-[10px] font-bold leading-none flex items-center justify-center hover:bg-[var(--accent-blue)] hover:text-white transition-colors"
        aria-label="說明"
      >
        i
      </button>
      {visible && (
        <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 w-72 p-3 rounded-lg shadow-xl bg-[var(--bg-root)] border border-[var(--border-base)] text-xs text-[var(--text-main)] leading-relaxed whitespace-pre-line pointer-events-none">
          {text}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[var(--bg-root)]" />
        </div>
      )}
    </span>
  );
}

export default function DynamicForm({ schema, values, onChange }: DynamicFormProps) {
  return (
    <div className="space-y-4">
      {schema.map((field) => (
        <div key={field.name}>
          {field.type !== 'boolean' && (
            <label className="flex items-center text-sm font-medium text-[var(--text-main)] mb-1">
              {field.label}
              {field.required && <span className="text-[var(--accent-red)] ml-0.5">*</span>}
              {field.helpText && <HelpTooltip text={field.helpText} />}
            </label>
          )}
          {field.type === 'enum' && field.options ? (
            <select
              value={values[field.name] ?? field.defaultValue ?? ''}
              onChange={(e) => onChange(field.name, e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : field.type === 'boolean' ? (
            <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
              <input
                type="checkbox"
                checked={(values[field.name] ?? field.defaultValue) === 'true'}
                onChange={(e) => onChange(field.name, e.target.checked ? 'true' : 'false')}
                className="rounded"
              />
              <span className="font-medium">{field.label}</span>
              {field.helpText && <HelpTooltip text={field.helpText} />}
            </label>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={values[field.name] ?? field.defaultValue ?? ''}
              placeholder={field.placeholder ?? undefined}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
              onChange={(e) => onChange(field.name, e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
            />
          )}
        </div>
      ))}
    </div>
  );
}

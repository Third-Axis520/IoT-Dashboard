import type { ConfigFieldItem } from '../../../lib/apiProtocols';

interface DynamicFormProps {
  schema: ConfigFieldItem[];
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
}

export default function DynamicForm({ schema, values, onChange }: DynamicFormProps) {
  return (
    <div className="space-y-4">
      {schema.map((field) => (
        <div key={field.name}>
          <label className="block text-sm font-medium mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {field.type === 'enum' && field.options ? (
            <select
              value={values[field.name] ?? field.defaultValue ?? ''}
              onChange={(e) => onChange(field.name, e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : field.type === 'boolean' ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(values[field.name] ?? field.defaultValue) === 'true'}
                onChange={(e) => onChange(field.name, e.target.checked ? 'true' : 'false')}
                className="rounded"
              />
              {field.label}
            </label>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={values[field.name] ?? field.defaultValue ?? ''}
              placeholder={field.placeholder ?? undefined}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
              onChange={(e) => onChange(field.name, e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            />
          )}
        </div>
      ))}
    </div>
  );
}

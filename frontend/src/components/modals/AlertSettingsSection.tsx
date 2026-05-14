import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface AlertSettings {
  isAlertEnabled: boolean;
  alertOnConsecutiveErrors: number;
  alertCooldownSec: number;
}

interface Props {
  value: AlertSettings;
  onChange: (next: AlertSettings) => void;
  defaultOpen?: boolean;
}

export default function AlertSettingsSection({ value, onChange, defaultOpen = false }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-4 border-t border-[var(--border-base)] pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {t('connectionSettings.advancedTitle')}
        <span className="text-xs text-[var(--text-muted)] ml-2">— {t('connectionSettings.advancedHint')}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.isAlertEnabled}
              onChange={e => onChange({ ...value, isAlertEnabled: e.target.checked })}
            />
            <span className="text-[var(--text-main)]">{t('connectionSettings.isAlertEnabled')}</span>
          </label>

          <div>
            <label className="block text-sm text-[var(--text-main)] mb-1">
              {t('connectionSettings.alertOnConsecutiveErrors')}
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={value.alertOnConsecutiveErrors}
              onChange={e => onChange({
                ...value,
                alertOnConsecutiveErrors: Math.max(1, parseInt(e.target.value, 10) || 5),
              })}
              disabled={!value.isAlertEnabled}
              className="w-24 px-2 py-1 rounded border border-[var(--border-base)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm disabled:opacity-50"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">{t('connectionSettings.alertOnConsecutiveErrorsHelp')}</p>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-main)] mb-1">
              {t('connectionSettings.alertCooldownSec')}
            </label>
            <input
              type="number"
              min={0}
              max={86400}
              value={value.alertCooldownSec}
              onChange={e => onChange({
                ...value,
                alertCooldownSec: Math.max(0, parseInt(e.target.value, 10) || 300),
              })}
              disabled={!value.isAlertEnabled}
              className="w-24 px-2 py-1 rounded border border-[var(--border-base)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm disabled:opacity-50"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">{t('connectionSettings.alertCooldownSecHelp')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

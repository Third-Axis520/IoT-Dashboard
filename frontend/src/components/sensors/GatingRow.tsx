import { useTranslation } from 'react-i18next';
import { GatingSelector } from './GatingSelector';
import { useGatingCandidates } from '../../hooks/useGatingCandidates';
import type { SaveGatingRuleItem } from '../../types/gating';

interface GatingRowProps {
  assetCode: string;
  sensorId: number;
  rule: SaveGatingRuleItem | null;
  onChange: (rule: SaveGatingRuleItem | null) => void;
}

export function GatingRow({ assetCode, sensorId, rule, onChange }: GatingRowProps) {
  const { t } = useTranslation();
  const { data: candidates } = useGatingCandidates();
  const enabled = rule !== null;

  const sourceSelected = !!(rule && rule.gatingAssetCode);
  const sourcePoll = sourceSelected
    ? candidates?.find(c => c.assetCode === rule!.gatingAssetCode && c.sensorId === rule!.gatingSensorId)?.pollIntervalMs
    : undefined;
  // Threshold rules:
  //   - source selected + pollIntervalMs known → use that exact value
  //   - source selected + pollIntervalMs unknown (push_ingest, missing DC, etc.) → no comparison, use the production-tested floor
  //   - no source selected → no comparison
  const threshold = sourcePoll ?? 5000;
  const showWarning = enabled && rule != null && rule.maxAgeMs < threshold;

  return (
    <div className="flex flex-col gap-2 py-2 border-l-2 border-blue-200 pl-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => {
            if (!e.target.checked) onChange(null);
            else onChange({ gatedSensorId: sensorId, gatingAssetCode: '', gatingSensorId: 0, delayMs: 0, maxAgeMs: 10000 });
          }}
        />
        <div>
          <div>{t('sensor.gating.enable')}</div>
          <div className="text-xs text-[var(--text-muted)]">{t('sensor.gating.enable_hint')}</div>
        </div>
      </label>

      {enabled && rule && (
        <div className="flex flex-col gap-2 ml-6">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">{t('sensor.gating.source')}</label>
            <GatingSelector
              value={rule.gatingAssetCode ? { assetCode: rule.gatingAssetCode, sensorId: rule.gatingSensorId } : null}
              excludeAssetCode={assetCode}
              excludeSensorId={sensorId}
              onChange={src => onChange({
                ...rule,
                gatingAssetCode: src?.assetCode ?? '',
                gatingSensorId: src?.sensorId ?? 0
              })}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-[var(--text-muted)] block mb-1">{t('sensor.gating.delay_label')}</label>
              <input
                type="number" min={0} max={10000}
                value={rule.delayMs}
                onChange={e => onChange({ ...rule, delayMs: Number(e.target.value) })}
                className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--text-muted)] block mb-1">{t('sensor.gating.maxage_label')}</label>
              <input
                type="number" min={100} max={60000}
                value={rule.maxAgeMs}
                onChange={e => onChange({ ...rule, maxAgeMs: Number(e.target.value) })}
                className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded px-2 py-1 text-sm"
              />
              {showWarning && (
                <div className="text-[11px] text-[var(--accent-yellow)] mt-1">
                  {sourcePoll != null
                    ? `⚠ 必須 ≥ 來源 ${rule.gatingAssetCode} 的 PollIntervalMs (${sourcePoll}ms)，否則 cache 會被視為過期，sensor 資料會被擋掉看不到`
                    : sourceSelected
                      ? '⚠ 抓不到來源的 PollIntervalMs（可能來源是 push_ingest 或 candidates 還沒載入），建議至少 5000ms 並等載入完成後再確認'
                      : '⚠ 必須 ≥ DI 來源的 poll 間隔（通常 5000ms），否則 cache 會被視為過期'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

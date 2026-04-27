import { useGatingCandidates } from '../../hooks/useGatingCandidates';

interface GatingSource {
  assetCode: string;
  sensorId: number;
}

interface GatingSelectorProps {
  value: GatingSource | null;
  excludeAssetCode?: string;
  excludeSensorId?: number;
  onChange: (value: GatingSource | null) => void;
}

export function GatingSelector({ value, excludeAssetCode, excludeSensorId, onChange }: GatingSelectorProps) {
  const { data: candidates } = useGatingCandidates();
  const stringValue = value ? `${value.assetCode}::${value.sensorId}` : '';

  return (
    <select
      value={stringValue}
      onChange={e => {
        const v = e.target.value;
        if (!v) { onChange(null); return; }
        const [assetCode, sidStr] = v.split('::');
        onChange({ assetCode, sensorId: Number(sidStr) });
      }}
      className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm"
    >
      <option value="">（不啟用）</option>
      <option disabled>──────────</option>
      {(candidates ?? [])
        .filter(c => !(c.assetCode === excludeAssetCode && c.sensorId === excludeSensorId))
        .map(c => (
          <option key={`${c.assetCode}::${c.sensorId}`} value={`${c.assetCode}::${c.sensorId}`}>
            {c.assetName} / {c.sensorLabel}
          </option>
        ))}
    </select>
  );
}

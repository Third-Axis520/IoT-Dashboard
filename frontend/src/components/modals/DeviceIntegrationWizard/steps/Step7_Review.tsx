import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizard } from '../WizardContext';
import { createDeviceConnection, type SaveDeviceConnectionRequest } from '../../../../lib/apiDeviceConnections';

export interface WizardSuccessInfo {
  name: string;
  assetCode: string | null;
  equipmentTypeId: number | null;
}

interface Step7ReviewProps {
  onClose: () => void;
  onSuccess?: (info: WizardSuccessInfo) => void;
}

export default function Step7Review({ onClose, onSuccess }: Step7ReviewProps) {
  const { state, dispatch } = useWizard();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const selectedPoints = state.discoveryPoints
    .map((pt, i) => ({ pt, i }))
    .filter(({ i }) => state.selectedPointIndices.has(i));

  async function handleSubmit() {
    setSubmitting(true);
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      // Generate a random 7-digit base to avoid SensorId collisions across wizard runs
      const sensorIdBase = Math.floor(Math.random() * 8_900_000) + 1_000_000;
      const sensors = selectedPoints.map(({ pt, i }, idx) => {
        const label = state.labels.get(i);
        return {
          sensorId: sensorIdBase + idx,
          pointId: `pt_${pt.rawAddress}`,
          label: label?.name || pt.suggestedLabel || `Sensor ${pt.rawAddress}`,
          unit: label?.unit || '',
          propertyTypeId: label?.propertyTypeId || 0,
          rawAddress: pt.rawAddress,
          sortOrder: idx,
        };
      });

      // Coerce numeric string values to numbers so the backend can deserialize
      // typed config classes (e.g. ModbusTcpConfig.Port expects int, not string)
      const coercedConfig = Object.fromEntries(
        Object.entries(state.config).map(([k, v]) => {
          if (v === 'true') return [k, true];
          if (v === 'false') return [k, false];
          const n = Number(v);
          return [k, v !== '' && !isNaN(n) ? n : v];
        })
      );

      const req: SaveDeviceConnectionRequest = {
        name: state.connectionName,
        protocol: state.protocol!,
        config: JSON.stringify(coercedConfig),
        pollIntervalMs: state.protocol === 'push_ingest' ? null : state.pollIntervalMs,
        isEnabled: true,
        equipmentType: {
          name: state.equipmentName,
          visType: state.visType,
          description: state.description || null,
          sensors,
        },
      };

      const created = await createDeviceConnection(req);
      onSuccess?.({ name: state.connectionName, assetCode: created.assetCode, equipmentTypeId: created.equipmentTypeId });
      onClose();
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: err instanceof Error ? err.message : '建立失敗',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-4">{t('wizard.review.title')}</h3>

      <div className="space-y-4 text-sm">
        {/* Connection info */}
        <div className="p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-base)]">
          <div className="font-medium text-[var(--text-main)] mb-2">{t('wizard.review.connectionSection')}</div>
          <div className="grid grid-cols-2 gap-1 text-[var(--text-muted)]">
            <span>{t('wizard.review.colName')}</span><span className="text-[var(--text-main)]">{state.connectionName}</span>
            <span>{t('wizard.review.colProtocol')}</span><span className="text-[var(--text-main)]">{state.protocol}</span>
            {state.protocol !== 'push_ingest' && (
              <>
                <span className="text-[var(--text-muted)]">{t('wizard.review.colInterval')}</span>
                <span>{t('wizard.review.intervalValue', { seconds: state.pollIntervalMs / 1000 })}</span>
              </>
            )}
          </div>
        </div>

        {/* Equipment info */}
        <div className="p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-base)]">
          <div className="font-medium text-[var(--text-main)] mb-2">{t('wizard.review.equipmentSection')}</div>
          <div className="grid grid-cols-2 gap-1 text-[var(--text-muted)]">
            <span>{t('wizard.review.colEquipmentName')}</span><span className="text-[var(--text-main)]">{state.equipmentName}</span>
            <span>{t('wizard.review.colDisplay')}</span><span className="text-[var(--text-main)]">{state.visType}</span>
            {state.description && <><span>{t('wizard.review.colDesc')}</span><span className="text-[var(--text-main)]">{state.description}</span></>}
          </div>
        </div>

        {/* Sensors */}
        <div className="p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-base)]">
          <div className="font-medium text-[var(--text-main)] mb-2">{t('wizard.review.sensorsSection', { count: selectedPoints.length })}</div>
          <div className="space-y-1">
            {selectedPoints.map(({ pt, i }) => {
              const label = state.labels.get(i);
              return (
                <div key={i} className="flex items-center gap-2 text-[var(--text-muted)]">
                  <span className="font-mono text-xs w-12">{pt.rawAddress}</span>
                  <span className="text-[var(--text-main)]">{label?.name || pt.suggestedLabel || '-'}</span>
                  {label?.unit && <span>({label.unit})</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {state.error && (
        <div className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30 text-[var(--accent-red)] text-sm">
          {state.error}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          disabled={submitting}
          className="px-4 py-2 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] disabled:opacity-50 transition-colors"
        >
          {t('common.previous')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-bold hover:bg-[var(--accent-green-hover)] disabled:opacity-50 transition-colors"
        >
          {submitting ? t('common.creating') : t('common.create')}
        </button>
      </div>
    </div>
  );
}

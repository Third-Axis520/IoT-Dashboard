import { useState } from 'react';
import { useWizard } from '../WizardContext';
import { createDeviceConnection, type SaveDeviceConnectionRequest } from '../../../../lib/apiDeviceConnections';

interface Step7ReviewProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function Step7Review({ onClose, onSuccess }: Step7ReviewProps) {
  const { state, dispatch } = useWizard();
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

      const req: SaveDeviceConnectionRequest = {
        name: state.connectionName,
        protocol: state.protocol!,
        config: JSON.stringify(state.config),
        pollIntervalMs: state.protocol === 'push_ingest' ? null : 5000,
        isEnabled: true,
        equipmentType: {
          name: state.equipmentName,
          visType: state.visType,
          description: state.description || null,
          sensors,
        },
      };

      await createDeviceConnection(req);
      onSuccess?.();
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
      <h3 className="text-base font-medium mb-4">確認並建立</h3>

      <div className="space-y-4 text-sm">
        {/* Connection info */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <div className="font-medium mb-2">連線設定</div>
          <div className="grid grid-cols-2 gap-1 text-gray-600 dark:text-gray-300">
            <span>名稱</span><span>{state.connectionName}</span>
            <span>協議</span><span>{state.protocol}</span>
          </div>
        </div>

        {/* Equipment info */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <div className="font-medium mb-2">設備類型</div>
          <div className="grid grid-cols-2 gap-1 text-gray-600 dark:text-gray-300">
            <span>名稱</span><span>{state.equipmentName}</span>
            <span>顯示</span><span>{state.visType}</span>
            {state.description && <><span>說明</span><span>{state.description}</span></>}
          </div>
        </div>

        {/* Sensors */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <div className="font-medium mb-2">感測器 ({selectedPoints.length} 個)</div>
          <div className="space-y-1">
            {selectedPoints.map(({ pt, i }) => {
              const label = state.labels.get(i);
              return (
                <div key={i} className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <span className="font-mono text-xs w-12">{pt.rawAddress}</span>
                  <span>{label?.name || pt.suggestedLabel || '-'}</span>
                  {label?.unit && <span className="text-gray-400">({label.unit})</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {state.error && (
        <div className="mt-4 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          {state.error}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          disabled={submitting}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          上一步
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? '建立中...' : '建立'}
        </button>
      </div>
    </div>
  );
}

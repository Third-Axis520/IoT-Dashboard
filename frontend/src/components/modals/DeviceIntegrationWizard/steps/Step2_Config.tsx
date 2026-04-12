import { useEffect, useState } from 'react';
import { useWizard } from '../WizardContext';
import DynamicForm from '../DynamicForm';
import { fetchProtocol, type ProtocolItem } from '../../../../lib/apiProtocols';

export default function Step2Config() {
  const { state, dispatch } = useWizard();
  const [protocol, setProtocol] = useState<ProtocolItem | null>(null);

  useEffect(() => {
    if (state.protocol) {
      fetchProtocol(state.protocol).then(setProtocol);
    }
  }, [state.protocol]);

  // Initialize default values from schema
  useEffect(() => {
    if (!protocol) return;
    const defaults: Record<string, string> = {};
    for (const f of protocol.configSchema.fields) {
      if (f.defaultValue && !state.config[f.name]) {
        defaults[f.name] = f.defaultValue;
      }
    }
    if (Object.keys(defaults).length > 0) {
      dispatch({ type: 'SET_CONFIG', config: { ...defaults, ...state.config } });
    }
  }, [protocol, dispatch, state.config]);

  return (
    <div className="p-6">
      <h3 className="text-base font-medium mb-1">連線設定</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        輸入 {protocol?.displayName ?? state.protocol} 的連線參數
      </p>

      {/* Connection name */}
      <div className="mb-5">
        <label className="block text-sm font-medium mb-1">
          連線名稱 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={state.connectionName}
          onChange={(e) => dispatch({ type: 'SET_CONNECTION_NAME', name: e.target.value })}
          placeholder="例如：A棟 Modbus 主機"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
        />
      </div>

      {/* Protocol-specific config */}
      {protocol && (
        <DynamicForm
          schema={protocol.configSchema.fields}
          values={state.config}
          onChange={(field, value) => dispatch({ type: 'UPDATE_CONFIG', field, value })}
        />
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          上一步
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          下一步
        </button>
      </div>
    </div>
  );
}

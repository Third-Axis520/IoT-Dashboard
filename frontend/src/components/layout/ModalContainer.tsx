import type { Equipment, MachineTemplate, ProductionLine } from '../../types';
import type { useDevices } from '../../hooks/useDevices';
import type { ToastItem } from '../../hooks/useToast';

import { AddDeviceModal } from '../modals/AddDeviceModal';
import { DeviceManagementModal } from '../modals/DeviceManagementModal';
import { LimitsSettingsModal } from '../modals/LimitsSettingsModal';
import { DrillDownModal } from '../modals/DrillDownModal';
import { SensorMappingModal } from '../modals/SensorMappingModal';
import { RegisterMapModal } from '../modals/RegisterMapModal';
import { PlcTemplateModal } from '../modals/PlcTemplateModal';
import { PropertyTypesModal } from '../modals/PropertyTypesModal';
import DeviceIntegrationWizard from '../modals/DeviceIntegrationWizard';
import WizardPostPanel from '../modals/WizardPostPanel';
import DeviceConnectionsModal from '../modals/DeviceConnectionsModal';
import ToastContainer from '../ui/Toast';
import ConfirmModal from '../ui/ConfirmModal';

export interface ModalContainerProps {
  // Data
  templates: MachineTemplate[];
  data: ProductionLine[];
  latestRawSensors: Map<string, Map<number, number>>;
  assetCode: string | null;

  // Devices
  devices: ReturnType<typeof useDevices>['devices'];
  bindDevice: ReturnType<typeof useDevices>['bindDevice'];
  unbindDevice: ReturnType<typeof useDevices>['unbindDevice'];
  deleteDevice: ReturnType<typeof useDevices>['deleteDevice'];
  validateAsset: ReturnType<typeof useDevices>['validateAsset'];
  registerDevice: ReturnType<typeof useDevices>['registerDevice'];

  // Active line
  activeLine: ProductionLine;
  boundEquipments: Equipment[];

  // Modal states
  showAddDevice: boolean; onCloseAddDevice: () => void;
  wizardPostInfo: { template: MachineTemplate; initialName: string; assetCode: string | null } | null;
  onCloseWizardPost: () => void;
  showDeviceMgmt: boolean; onCloseDeviceMgmt: () => void;
  liveDrillDownEq: Equipment | null;
  onCloseDrillDown: () => void;
  showLimits: boolean; onCloseLimits: () => void;
  sensorMappingEq: Equipment | null; onCloseSensorMapping: () => void;
  showPlcTemplates: boolean; onClosePlcTemplates: () => void;
  showRegisterMap: boolean; onCloseRegisterMap: () => void;
  showWizard: boolean; onCloseWizard: () => void;
  showPropertyTypes: boolean; onClosePropertyTypes: () => void;
  showConnections: boolean; onCloseConnections: () => void;
  confirmDialog: {
    title: string;
    message: string;
    confirmText: string;
    variant: 'danger' | 'default';
    onConfirm: () => void;
  } | null;
  onCloseConfirm: () => void;

  // Toast
  toasts: ToastItem[];
  onRemoveToast: (id: string) => void;

  // Callbacks
  onAddDevice: (
    tpl: MachineTemplate, name: string, deviceId: string,
    sensorMapping: Record<number, number>, pointNames: string[],
    targetLineId?: string,
  ) => void;
  onWizardPostAdd: (
    lineId: string, name: string, assetCode: string,
    mapping: Record<number, number>, names: string[],
  ) => void;
  onSaveConfig: (eq: Equipment) => void;
  onSaveSensorMapping: (eq: Equipment) => void;
  onLimitsSaved: (limits: Record<number, { ucl: number; lcl: number }>) => void;
  onWizardSuccess: (info: {
    name: string;
    assetCode: string | null;
    equipmentTypeId: number | null;
  }) => void;

  // Auto-play
  isAutoPlaying: boolean;
  autoPlaySpeed: number;
  onAutoPlayNextEq: () => void;
  onStopAutoPlay: () => void;
}

export default function ModalContainer(props: ModalContainerProps) {
  const {
    templates, data, latestRawSensors, assetCode,
    devices, bindDevice, unbindDevice, deleteDevice, validateAsset, registerDevice,
    activeLine, boundEquipments,
    showAddDevice, onCloseAddDevice,
    wizardPostInfo, onCloseWizardPost,
    showDeviceMgmt, onCloseDeviceMgmt,
    liveDrillDownEq, onCloseDrillDown,
    showLimits, onCloseLimits,
    sensorMappingEq, onCloseSensorMapping,
    showPlcTemplates, onClosePlcTemplates,
    showRegisterMap, onCloseRegisterMap,
    showWizard, onCloseWizard,
    showPropertyTypes, onClosePropertyTypes,
    showConnections, onCloseConnections,
    confirmDialog, onCloseConfirm,
    toasts, onRemoveToast,
    onAddDevice, onWizardPostAdd, onSaveConfig, onSaveSensorMapping,
    onLimitsSaved, onWizardSuccess,
    isAutoPlaying, autoPlaySpeed, onAutoPlayNextEq, onStopAutoPlay,
  } = props;

  return (
    <>
      {showAddDevice && (
        <AddDeviceModal
          templates={templates}
          devices={devices}
          latestRawSensors={latestRawSensors}
          onClose={onCloseAddDevice}
          onAdd={(tpl, name, ac, mapping, names) => onAddDevice(tpl, name, ac, mapping, names)}
        />
      )}

      {wizardPostInfo && (
        <WizardPostPanel
          template={wizardPostInfo.template}
          initialName={wizardPostInfo.initialName}
          assetCode={wizardPostInfo.assetCode}
          lines={data}
          latestRawSensors={latestRawSensors}
          onAdd={(lineId, name, ac, mapping, names) => onWizardPostAdd(lineId, name, ac, mapping, names)}
          onClose={onCloseWizardPost}
        />
      )}

      {showDeviceMgmt && (
        <DeviceManagementModal
          onClose={onCloseDeviceMgmt}
          devices={devices}
          onBind={bindDevice}
          onUnbind={unbindDevice}
          onDelete={deleteDevice}
          onRegister={registerDevice}
          validateAsset={validateAsset}
        />
      )}

      {liveDrillDownEq && (
        <DrillDownModal
          equipment={liveDrillDownEq}
          onClose={onCloseDrillDown}
          onSaveConfig={onSaveConfig}
          assetCode={assetCode}
          isAutoPlaying={isAutoPlaying}
          autoPlaySpeed={autoPlaySpeed}
          onAutoPlayNextEq={onAutoPlayNextEq}
          onStopAutoPlay={onStopAutoPlay}
        />
      )}

      {showLimits && (
        <LimitsSettingsModal
          scopeLabel={activeLine.name}
          equipments={activeLine.equipments.filter(eq => eq.deviceId)}
          onClose={onCloseLimits}
          onSaved={onLimitsSaved}
        />
      )}

      {sensorMappingEq && (
        <SensorMappingModal
          equipment={sensorMappingEq}
          latestRawSensors={latestRawSensors}
          onClose={onCloseSensorMapping}
          onSave={onSaveSensorMapping}
        />
      )}

      {showPlcTemplates && (
        <PlcTemplateModal onClose={onClosePlcTemplates} />
      )}

      {showRegisterMap && (
        <RegisterMapModal line={activeLine} onClose={onCloseRegisterMap} />
      )}

      {showWizard && (
        <DeviceIntegrationWizard
          onClose={onCloseWizard}
          onSuccess={onWizardSuccess}
        />
      )}

      {showPropertyTypes && (
        <PropertyTypesModal onClose={onClosePropertyTypes} />
      )}

      {showConnections && (
        <DeviceConnectionsModal onClose={onCloseConnections} />
      )}

      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          variant={confirmDialog.variant}
          onConfirm={confirmDialog.onConfirm}
          onCancel={onCloseConfirm}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={onRemoveToast} />
    </>
  );
}

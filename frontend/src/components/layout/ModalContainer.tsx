import type { Equipment, ProductionLine } from '../../types';
import type { ToastItem } from '../../hooks/useToast';

import { LimitsSettingsModal } from '../modals/LimitsSettingsModal';
import { DrillDownModal } from '../modals/DrillDownModal';
import ToastContainer from '../ui/Toast';
import ConfirmModal from '../ui/ConfirmModal';

export interface ModalContainerProps {
  // Data
  data: ProductionLine[];

  // Active line
  activeLine: ProductionLine;

  // Modal states
  liveDrillDownEq: Equipment | null;
  onCloseDrillDown: () => void;
  showLimits: boolean; onCloseLimits: () => void; limitsFocusAsset?: string;
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
  onSaveConfig: (eq: Equipment) => void;
  onLimitsSaved: (limits: Record<number, { ucl: number; lcl: number }>) => void;

  // Auto-play
  isAutoPlaying: boolean;
  autoPlaySpeed: number;
  onAutoPlayNextEq: () => void;
  onStopAutoPlay: () => void;

  // DrillDown assetCode
  assetCode: string | null;
}

export default function ModalContainer(props: ModalContainerProps) {
  const {
    activeLine,
    liveDrillDownEq, onCloseDrillDown,
    showLimits, onCloseLimits, limitsFocusAsset,
    confirmDialog, onCloseConfirm,
    toasts, onRemoveToast,
    onSaveConfig, onLimitsSaved,
    isAutoPlaying, autoPlaySpeed, onAutoPlayNextEq, onStopAutoPlay,
    assetCode,
  } = props;

  return (
    <>
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
          focusAssetCode={limitsFocusAsset}
        />
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

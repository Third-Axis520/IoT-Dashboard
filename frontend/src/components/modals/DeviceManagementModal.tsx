import { CheckCircle, Cpu, Loader2, Plus, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeviceDto } from '../../hooks/useDevices';
import { cn } from '../../utils/cn';
import { useFocusTrap } from '../../hooks/useFocusTrap';

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  return `${Math.floor(hrs / 24)} 天前`;
}

interface AssetValidation {
  assetCode: string;
  assetName: string | null;
  nickName: string | null;
  departmentName: string | null;
  spec: string | null;
}

// ── 手動登記新設備表單 ─────────────────────────────────────────────────────

interface RegisterFormProps {
  onRegister: (serialNumber: string, friendlyName?: string) => Promise<void>;
  onCancel: () => void;
}

function RegisterForm({ onRegister, onCancel }: RegisterFormProps) {
  const { t } = useTranslation();
  const [sn, setSn] = useState('');
  const [name, setName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!sn.trim()) return;
    setRegistering(true);
    setError(null);
    try {
      await onRegister(sn.trim(), name.trim() || undefined);
      setDone(true);
    } catch (e) {
      if (e instanceof Error && e.message === 'DUPLICATE') {
        setError(t('deviceManagement.duplicateError', { sn: sn.trim() }));
      } else {
        setError(t('deviceManagement.registerError'));
      }
    } finally {
      setRegistering(false);
    }
  };

  if (done) {
    return (
      <div className="bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded-lg p-4 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-[var(--accent-green)] flex-shrink-0" />
        <div>
          <p className="font-medium text-[var(--accent-green)] text-sm">{t('deviceManagement.registerSuccess')}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{sn.trim()}</p>
        </div>
        <button onClick={onCancel} className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]">
          {t('common.close')}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--accent-blue)]/30 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-[var(--accent-blue)] uppercase tracking-wider">{t('deviceManagement.registerTitle')}</p>

      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">{t('deviceManagement.serialNumber')} <span className="text-[var(--accent-red)]">*</span></label>
        <input
          autoFocus
          type="text"
          placeholder={t('deviceManagement.serialPlaceholder')}
          value={sn}
          onChange={e => { setSn(e.target.value); setError(null); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className={cn(
            "w-full bg-[var(--bg-card)] border rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-main)] outline-none transition-colors",
            error ? "border-[var(--accent-red)]" : "border-[var(--border-input)] focus:border-[var(--accent-blue)]"
          )}
        />
        {error && (
          <p className="text-xs text-[var(--accent-red)] mt-1 flex items-center gap-1">
            <XCircle className="w-3 h-3 flex-shrink-0" />{error}
          </p>
        )}
      </div>

      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">{t('deviceManagement.friendlyName')}</label>
        <input
          type="text"
          placeholder={t('deviceManagement.namePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full bg-[var(--bg-card)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)] transition-colors"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <button onClick={onCancel} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!sn.trim() || registering}
          className="bg-[var(--accent-blue)] text-white font-bold rounded-lg text-sm px-4 py-1.5 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center gap-1.5"
        >
          {registering && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('common.register')}
        </button>
      </div>
    </div>
  );
}

// ── 未綁定設備卡片 ────────────────────────────────────────────────────────

interface UnboundCardProps {
  device: DeviceDto;
  onBind: (serialNumber: string, assetCode: string, friendlyName?: string) => Promise<void>;
  onDelete: (serialNumber: string) => Promise<void>;
  validateAsset: (assetCode: string) => Promise<AssetValidation | null>;
}

function UnboundCard({ device, onBind, onDelete, validateAsset }: UnboundCardProps) {
  const { t } = useTranslation();
  const [assetCodeInput, setAssetCodeInput] = useState('');
  const [friendlyNameInput, setFriendlyNameInput] = useState('');
  const [validation, setValidation] = useState<AssetValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);
  const [bindSuccess, setBindSuccess] = useState(false);
  const [skipFas, setSkipFas] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try { await onDelete(device.serialNumber); }
    finally { setDeleting(false); setConfirmingDelete(false); }
  };

  const handleValidate = async () => {
    if (!assetCodeInput.trim()) return;
    setValidating(true);
    setValidation(null);
    setValidationError(null);
    try {
      const result = await validateAsset(assetCodeInput.trim());
      if (result) {
        setValidation(result);
      } else {
        setValidationError(t('deviceManagement.validationError', { code: assetCodeInput.trim() }));
      }
    } catch {
      setValidationError(t('deviceManagement.validationNetworkError'));
    } finally {
      setValidating(false);
    }
  };

  const handleBind = async () => {
    if (!skipFas && !validation) return;
    if (!assetCodeInput.trim()) return;
    setBinding(true);
    try {
      await onBind(device.serialNumber, assetCodeInput.trim(), friendlyNameInput.trim() || undefined);
      setBindSuccess(true);
    } finally {
      setBinding(false);
    }
  };

  if (bindSuccess) {
    return (
      <div className="bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded-lg p-4 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-[var(--accent-green)] flex-shrink-0" />
        <div>
          <p className="font-medium text-[var(--accent-green)] text-sm">{t('deviceManagement.bindSuccess')}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {device.serialNumber} → {assetCodeInput.trim()}
          </p>
        </div>
      </div>
    );
  }

  const canBind = assetCodeInput.trim() && (skipFas || validation !== null);

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--accent-red)]/30 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-2 h-2 rounded-full bg-[var(--accent-red)] animate-pulse flex-shrink-0" />
        <span className="font-mono text-sm text-[var(--text-muted)] border border-[var(--border-base)] px-2 py-0.5 rounded bg-[var(--border-base)]/50">
          {device.serialNumber}
        </span>
        <span className="text-xs text-[var(--text-muted)] ml-auto">{t('deviceManagement.lastSeen', { time: relativeTime(device.lastSeen) })}</span>
      </div>

      {/* FAS validation result */}
      {!skipFas && validation && (
        <div className="bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-[var(--accent-green)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-[var(--accent-green)] text-sm">
              {validation.assetName ?? validation.nickName ?? validation.assetCode}
            </p>
            {validation.departmentName && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{validation.departmentName}</p>
            )}
            {validation.spec && (
              <p className="text-xs text-[var(--text-muted)]">{validation.spec}</p>
            )}
          </div>
        </div>
      )}

      {/* Skip FAS toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none group w-fit">
        <div
          onClick={() => { setSkipFas(v => !v); setValidation(null); setValidationError(null); }}
          className={cn(
            "w-8 h-4 rounded-full transition-colors relative flex-shrink-0",
            skipFas ? "bg-[var(--accent-blue)]" : "bg-[var(--border-base)]"
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
            skipFas ? "translate-x-4" : "translate-x-0.5"
          )} />
        </div>
        <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors">
          {t('deviceManagement.skipFas')}
        </span>
      </label>

      {/* Asset code input */}
      <div>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1">
          {skipFas ? t('deviceManagement.assetCodeLabelCustom') : t('deviceManagement.assetCodeLabel')}
        </label>
        <input
          type="text"
          placeholder={skipFas ? t('deviceManagement.assetCodeCustomPlaceholder') : t('deviceManagement.assetCodePlaceholder')}
          value={assetCodeInput}
          onChange={(e) => {
            setAssetCodeInput(e.target.value);
            setValidation(null);
            setValidationError(null);
          }}
          className={cn(
            "w-full bg-[var(--bg-panel)] border rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none transition-colors font-mono",
            validationError
              ? "border-[var(--accent-red)] focus:border-[var(--accent-red)]"
              : "border-[var(--border-input)] focus:border-[var(--accent-green)]"
          )}
        />
        {validationError && (
          <p className="text-xs text-[var(--accent-red)] mt-1 flex items-center gap-1">
            <XCircle className="w-3 h-3" />{validationError}
          </p>
        )}
      </div>

      {/* Friendly name (always shown in skip mode, or after validation) */}
      {(skipFas || validation) && (
        <div>
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1">
            {t('deviceManagement.friendlyName')}
          </label>
          <input
            type="text"
            placeholder={t('deviceManagement.namePlaceholder')}
            value={friendlyNameInput}
            onChange={(e) => setFriendlyNameInput(e.target.value)}
            className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] transition-colors"
          />
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center justify-between pt-1 gap-2">
        {!skipFas ? (
          <button
            onClick={handleValidate}
            disabled={!assetCodeInput.trim() || validating}
            className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border-base)] hover:border-[var(--accent-blue)] text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {validating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('common.validate')}
          </button>
        ) : (
          <span className="text-xs text-[var(--accent-blue)] opacity-70">{t('deviceManagement.skipFasHint')}</span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {/* Permanently delete this Device record (only valid for unbound devices) */}
          {confirmingDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--accent-red)]">{t('deviceManagement.deleteConfirm')}</span>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="text-xs px-2 py-1 rounded bg-[var(--accent-red)] text-white hover:bg-[var(--accent-red)]/80 disabled:opacity-50 flex items-center gap-1"
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                {t('common.confirm')}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-xs px-2 py-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              title={t('deviceManagement.deleteHint')}
              className="text-xs px-2 py-1.5 rounded-lg border border-[var(--accent-red)]/30 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors"
            >
              {t('common.delete')}
            </button>
          )}
          <button
            onClick={handleBind}
            disabled={!canBind || binding}
            className="bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-lg text-sm px-4 py-2 hover:bg-[var(--accent-green-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {binding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('deviceManagement.bindConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 已綁定設備卡片 ────────────────────────────────────────────────────────

interface BoundCardProps {
  device: DeviceDto;
  onUnbind: (serialNumber: string) => Promise<void>;
}

function BoundCard({ device, onUnbind }: BoundCardProps) {
  const { t } = useTranslation();
  const [unbinding, setUnbinding] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleConfirmUnbind = async () => {
    setUnbinding(true);
    try {
      await onUnbind(device.serialNumber);
    } finally {
      setUnbinding(false);
      setConfirming(false);
    }
  };

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-base)] rounded-lg p-4 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--text-main)] text-sm truncate">
          {device.friendlyName ?? device.assetName ?? device.assetCode}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="font-mono text-xs text-[var(--text-muted)]">{device.assetCode}</span>
          {device.departmentName && (
            <span className="text-xs text-[var(--text-muted)]">· {device.departmentName}</span>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          SN: <span className="font-mono">{device.serialNumber}</span> · {t('deviceManagement.lastSeen', { time: relativeTime(device.lastSeen) })}
        </p>
      </div>
      <div className="flex-shrink-0">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--accent-red)]">{t('deviceManagement.unbindConfirm')}</span>
            <button
              onClick={handleConfirmUnbind}
              disabled={unbinding}
              className="bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/50 text-xs px-3 py-1 rounded-lg hover:bg-[var(--accent-red)]/30 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {unbinding && <Loader2 className="w-3 h-3 animate-spin" />}
              {t('common.confirm')}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs px-2 py-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/50 text-xs px-3 py-1 rounded-lg hover:bg-[var(--accent-red)]/30 transition-colors"
          >
            {t('deviceManagement.unbind')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Modal 主體 ───────────────────────────────────────────────────────────

interface DeviceManagementModalProps {
  onClose: () => void;
  devices: DeviceDto[];
  onBind: (serialNumber: string, assetCode: string, friendlyName?: string) => Promise<void>;
  onUnbind: (serialNumber: string) => Promise<void>;
  onDelete: (serialNumber: string) => Promise<void>;
  onRegister: (serialNumber: string, friendlyName?: string) => Promise<void>;
  validateAsset: (assetCode: string) => Promise<AssetValidation | null>;
}

export function DeviceManagementModal({
  onClose,
  devices,
  onBind,
  onUnbind,
  onDelete,
  onRegister,
  validateAsset,
}: DeviceManagementModalProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const unbound = devices.filter((d) => !d.isBound);
  const bound = devices.filter((d) => d.isBound);

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-mgmt-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-xl w-full max-w-[600px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[var(--border-base)] bg-[var(--border-base)]/30">
          <h3 id="device-mgmt-title" className="font-bold text-[var(--text-main)] flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--accent-blue)]" />
            {t('deviceManagement.title')}
            {unbound.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/40 rounded text-xs font-bold">
                {t('deviceManagement.unboundCount', { count: unbound.length })}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRegisterForm(v => !v)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                showRegisterForm
                  ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/40"
                  : "text-[var(--text-muted)] border-[var(--border-base)] hover:border-[var(--accent-blue)]/50 hover:text-[var(--accent-blue)]"
              )}
              title="手動登記尚未連線的設備"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('deviceManagement.manualRegister')}
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-[var(--border-base)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              aria-label={t('common.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Manual register form */}
          {showRegisterForm && (
            <RegisterForm
              onRegister={onRegister}
              onCancel={() => setShowRegisterForm(false)}
            />
          )}

          {devices.length === 0 && !showRegisterForm ? (
            <div className="text-center py-10 text-[var(--text-muted)]">
              <Cpu className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('deviceManagement.noDevices')}</p>
              <p className="text-xs mt-1 opacity-60">{t('deviceManagement.noDevicesHint')}</p>
            </div>
          ) : (
            <>
              {/* Unbound section */}
              {unbound.length > 0 && (
                <section className="space-y-3">
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    {t('deviceManagement.unboundSection', { count: unbound.length })}
                  </p>
                  {unbound.map((d) => (
                    <UnboundCard
                      key={d.serialNumber}
                      device={d}
                      onBind={onBind}
                      onDelete={onDelete}
                      validateAsset={validateAsset}
                    />
                  ))}
                </section>
              )}

              {/* Bound section */}
              {bound.length > 0 && (
                <section className="space-y-3">
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    {t('deviceManagement.boundSection', { count: bound.length })}
                  </p>
                  {bound.map((d) => (
                    <BoundCard key={d.serialNumber} device={d} onUnbind={onUnbind} />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { CheckCircle, Cpu, Loader2, Plus, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { DeviceDto } from '../../hooks/useDevices';
import { cn } from '../../utils/cn';

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
        setError(`序號 "${sn.trim()}" 已存在於系統中`);
      } else {
        setError('登記失敗，請確認後重試');
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
          <p className="font-medium text-[var(--accent-green)] text-sm">登記成功</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{sn.trim()}</p>
        </div>
        <button onClick={onCancel} className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]">
          關閉
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--accent-blue)]/30 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-[var(--accent-blue)] uppercase tracking-wider">手動登記新設備</p>

      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">設備序號 SerialNumber <span className="text-[var(--accent-red)]">*</span></label>
        <input
          autoFocus
          type="text"
          placeholder="例：SHX32rDtIQc4ahtc"
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
        <label className="text-xs text-[var(--text-muted)] block mb-1">自訂名稱（選填）</label>
        <input
          type="text"
          placeholder="例：測試烤箱-01"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full bg-[var(--bg-card)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)] transition-colors"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <button onClick={onCancel} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!sn.trim() || registering}
          className="bg-[var(--accent-blue)] text-white font-bold rounded-lg text-sm px-4 py-1.5 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center gap-1.5"
        >
          {registering && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          登記
        </button>
      </div>
    </div>
  );
}

// ── 未綁定設備卡片 ────────────────────────────────────────────────────────

interface UnboundCardProps {
  device: DeviceDto;
  onBind: (serialNumber: string, assetCode: string, friendlyName?: string) => Promise<void>;
  validateAsset: (assetCode: string) => Promise<AssetValidation | null>;
}

function UnboundCard({ device, onBind, validateAsset }: UnboundCardProps) {
  const [assetCodeInput, setAssetCodeInput] = useState('');
  const [friendlyNameInput, setFriendlyNameInput] = useState('');
  const [validation, setValidation] = useState<AssetValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);
  const [bindSuccess, setBindSuccess] = useState(false);
  const [skipFas, setSkipFas] = useState(false);

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
        setValidationError(`找不到資產編號 "${assetCodeInput.trim()}"，請確認後重試`);
      }
    } catch {
      setValidationError('驗證失敗，請檢查網路連線');
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
          <p className="font-medium text-[var(--accent-green)] text-sm">綁定成功</p>
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
        <span className="text-xs text-[var(--text-muted)] ml-auto">最後連線 {relativeTime(device.lastSeen)}</span>
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
          跳過 FAS 驗證（無資產編號時使用自訂名稱）
        </span>
      </label>

      {/* Asset code input */}
      <div>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1">
          {skipFas ? '自訂資產編號 / 代號' : 'FAS 資產編號'}
        </label>
        <input
          type="text"
          placeholder={skipFas ? '例：TEST-001、OVEN-A' : '例：EQ-2024-001'}
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
            自訂名稱（選填）
          </label>
          <input
            type="text"
            placeholder="例：一號烤箱產線"
            value={friendlyNameInput}
            onChange={(e) => setFriendlyNameInput(e.target.value)}
            className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)] transition-colors"
          />
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center justify-between pt-1">
        {!skipFas ? (
          <button
            onClick={handleValidate}
            disabled={!assetCodeInput.trim() || validating}
            className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border-base)] hover:border-[var(--accent-blue)] text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {validating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            驗證
          </button>
        ) : (
          <span className="text-xs text-[var(--accent-blue)] opacity-70">⚡ 跳過 FAS 驗證模式</span>
        )}
        <button
          onClick={handleBind}
          disabled={!canBind || binding}
          className="bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-lg text-sm px-4 py-2 hover:bg-[var(--accent-green-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {binding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          確認綁定
        </button>
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
          SN: <span className="font-mono">{device.serialNumber}</span> · 最後連線 {relativeTime(device.lastSeen)}
        </p>
      </div>
      <div className="flex-shrink-0">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--accent-red)]">確認解除？</span>
            <button
              onClick={handleConfirmUnbind}
              disabled={unbinding}
              className="bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/50 text-xs px-3 py-1 rounded-lg hover:bg-[var(--accent-red)]/30 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {unbinding && <Loader2 className="w-3 h-3 animate-spin" />}
              確認
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs px-2 py-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/50 text-xs px-3 py-1 rounded-lg hover:bg-[var(--accent-red)]/30 transition-colors"
          >
            解除綁定
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
  onRegister: (serialNumber: string, friendlyName?: string) => Promise<void>;
  validateAsset: (assetCode: string) => Promise<AssetValidation | null>;
}

export function DeviceManagementModal({
  onClose,
  devices,
  onBind,
  onUnbind,
  onRegister,
  validateAsset,
}: DeviceManagementModalProps) {
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const unbound = devices.filter((d) => !d.isBound);
  const bound = devices.filter((d) => d.isBound);

  return (
    <div
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
            設備管理
            {unbound.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/40 rounded text-xs font-bold">
                {unbound.length} 待綁定
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
              手動登記
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-[var(--border-base)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              aria-label="關閉"
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
              <p className="text-sm">尚無設備連線</p>
              <p className="text-xs mt-1 opacity-60">OvenDataReceive 啟動後會自動出現，或點「手動登記」預先新增</p>
            </div>
          ) : (
            <>
              {/* Unbound section */}
              {unbound.length > 0 && (
                <section className="space-y-3">
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    待綁定設備 ({unbound.length})
                  </p>
                  {unbound.map((d) => (
                    <UnboundCard
                      key={d.serialNumber}
                      device={d}
                      onBind={onBind}
                      validateAsset={validateAsset}
                    />
                  ))}
                </section>
              )}

              {/* Bound section */}
              {bound.length > 0 && (
                <section className="space-y-3">
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    已綁定設備 ({bound.length})
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

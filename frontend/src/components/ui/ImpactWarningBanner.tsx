interface ImpactWarningBannerProps {
  errorCount: number;
  onManage: () => void;
}

export default function ImpactWarningBanner({ errorCount, onManage }: ImpactWarningBannerProps) {
  if (errorCount === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 px-4 py-2 flex items-center justify-between text-sm">
      <span className="text-amber-800 dark:text-amber-200">
        {errorCount} 個連線發生錯誤，部分資料可能無法更新
      </span>
      <button
        onClick={onManage}
        className="text-amber-700 dark:text-amber-300 underline hover:no-underline text-sm"
      >
        查看連線管理
      </button>
    </div>
  );
}

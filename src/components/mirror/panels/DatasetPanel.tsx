type Props = {
  onOpenDataset: () => void;
  onResetAllData: () => void;
  stats: MlDatasetStats | null;
  syncStatus: SyncStatus | null;
  report: {
    changedPages?: number;
    pageCount?: number;
    avgSimilarity?: number;
  } | null;
};

function formatBytes(bytes: number) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('ko-KR');
}

export function DatasetPanel({ onOpenDataset, onResetAllData, stats, syncStatus, report }: Props) {
  const latestRun = stats?.runs?.[0] ?? null;

  return (
    <div className="panel active" id="panel-dataset">
      <div className="panel-header"><span>ML Dataset</span></div>
      <div className="panel-body">
        <div className="dataset-summary-card">
          <div className="dataset-summary-row">
            <span className="dataset-summary-label">저장 위치</span>
            <span className="dataset-summary-value">{stats?.rootPath ?? 'userData/ml-dataset'}</span>
          </div>
          <div className="dataset-summary-grid">
            <div className="dataset-stat-card">
              <span className="dataset-stat-value">{stats?.imageCount ?? 0}</span>
              <span className="dataset-stat-label">이미지</span>
            </div>
            <div className="dataset-stat-card">
              <span className="dataset-stat-value">{formatBytes(stats?.totalSizeBytes ?? 0)}</span>
              <span className="dataset-stat-label">총 용량</span>
            </div>
          </div>
          <div className="dataset-summary-list">
            <div className="dataset-summary-item"><span className="sync-dot synced" /> 라벨 {stats?.labelsCount ?? 0}개</div>
            <div className="dataset-summary-item"><span className="sync-dot pending" /> feature 행 {stats?.featureRowCount ?? 0}개</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> TXT 자동승인 {stats?.autoTxtReplaceCount ?? 0}건</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> ML pair(user/train) {stats?.userLineBreakPairsCount ?? 0}/{stats?.trainLineBreakPairsCount ?? 0}</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> 변경 페이지 {report?.changedPages ?? 0}/{report?.pageCount ?? 0}</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> 평균 유사도 {Math.round((report?.avgSimilarity ?? 0) * 100)}%</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> 최근 run {latestRun ? formatDate(latestRun.updatedAt) : '-'}</div>
            <div className="dataset-summary-item"><span className={`sync-dot ${(syncStatus?.pendingCount ?? 0) > 0 ? 'pending' : 'synced'}`} /> 서버 이관 대기 {syncStatus?.pendingCount ?? 0}건</div>
          </div>
        </div>
        <button className="btn btn-primary full-width mt8" onClick={onOpenDataset}>데이터 열기</button>
        <button className="btn btn-ghost full-width mt8" onClick={onResetAllData}>DB/ML 전체 초기화</button>
      </div>
    </div>
  );
}

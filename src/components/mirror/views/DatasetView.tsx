const cleanupRules = [
  '기본은 로컬 데이터 유지',
  '서버 이관 예약은 SQLite 큐에만 적재',
  '업로드 성공 후에만 별도 정리 검토',
];

type Props = {
  stats: MlDatasetStats | null;
  syncStatus: SyncStatus | null;
  onOpenRoot: () => void;
  onExportZip: () => void;
  onQueueUpload: () => void;
  onOpenTrainingAccess: () => void;
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

function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DatasetView({ stats, syncStatus, onOpenRoot, onExportZip, onQueueUpload, onOpenTrainingAccess }: Props) {
  const storageBuckets = [
    { label: '원본 이미지', value: `${stats?.imageCount ?? 0}개`, meta: formatBytes(stats?.totalSizeBytes ?? 0), tone: 'primary' },
    { label: '라벨 매니페스트', value: 'labels.jsonl', meta: `${stats?.labelsCount ?? 0}개`, tone: 'neutral' },
    { label: 'Feature CSV', value: 'train_features.csv', meta: `${stats?.featureRowCount ?? 0}행`, tone: 'neutral' },
    { label: '이관 run', value: `${stats?.runCount ?? 0}개`, meta: `${stats?.usedImageCount ?? 0} used · ${stats?.reviewFileCount ?? 0} review`, tone: 'warning' },
  ];

  return (
    <>
      <div className="view-header">
        <span className="breadcrumb">ML Dataset</span>
        <div className="view-header-actions">
          <button className="btn btn-sm btn-ghost" onClick={onOpenTrainingAccess}>학습 시키기</button>
          <button className="btn btn-sm btn-ghost" onClick={onOpenRoot}>저장 위치 열기</button>
          <button className="btn btn-sm btn-ghost" onClick={onExportZip}>ZIP 내보내기</button>
          <button className="btn btn-sm btn-primary" onClick={onQueueUpload}>서버 이관 예약</button>
        </div>
      </div>

      <div className="dataset-content">
        <section className="dataset-hero-card">
          <div className="dataset-hero-main">
            <div className="dataset-hero-label">중앙 저장소</div>
            <div className="dataset-hero-path">{stats?.rootPath ?? 'userData/ml-dataset'}</div>
            <div className="dataset-hero-meta">
              {stats?.exists
                ? '설치 폴더와 분리된 사용자 데이터 저장소 · 이미지/라벨/feature 일괄 관리'
                : '아직 학습 데이터가 생성되지 않았습니다. Python 리뷰를 승인/거부하면 여기 누적됩니다.'}
            </div>
          </div>
          <div className="dataset-hero-stats">
            <div className="dataset-hero-stat">
              <span className="dataset-hero-value">{formatBytes(stats?.totalSizeBytes ?? 0)}</span>
              <span className="dataset-hero-caption">현재 사용량</span>
            </div>
            <div className="dataset-hero-stat">
              <span className="dataset-hero-value">{stats?.imageCount ?? 0}</span>
              <span className="dataset-hero-caption">누적 샘플</span>
            </div>
            <div className="dataset-hero-stat">
              <span className="dataset-hero-value">{stats?.runCount ?? 0}</span>
              <span className="dataset-hero-caption">이관 run</span>
            </div>
          </div>
        </section>

        <section className="dataset-section-grid">
          <div className="dataset-section-card">
            <div className="dataset-section-title">저장 구성</div>
            <div className="dataset-bucket-list">
              {storageBuckets.map((bucket) => (
                <div key={bucket.label} className={`dataset-bucket-card ${bucket.tone}`}>
                  <div className="dataset-bucket-header">
                    <span className="dataset-bucket-label">{bucket.label}</span>
                    <span className="dataset-bucket-meta">{bucket.meta}</span>
                  </div>
                  <div className="dataset-bucket-value">{bucket.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="dataset-section-card">
            <div className="dataset-section-title">관리 액션</div>
            <div className="dataset-action-list">
              <button className="dataset-action-card" onClick={onOpenTrainingAccess}>
                <span className="dataset-action-title">학습 시키기</span>
                <span className="dataset-action-desc">비밀번호를 입력한 학습 담당자만 학습 기능에 접근할 수 있습니다.</span>
              </button>
              <button className="dataset-action-card" onClick={onQueueUpload}>
                <span className="dataset-action-title">서버 이관 예약</span>
                <span className="dataset-action-desc">현재 데이터는 유지하고, 서버 전송 대상만 SQLite 큐에 등록</span>
              </button>
              <button className="dataset-action-card" onClick={onExportZip}>
                <span className="dataset-action-title">학습용 내보내기</span>
                <span className="dataset-action-desc">images, labels.jsonl, train_features.csv를 ZIP으로 묶어서 전달</span>
              </button>
              <button className="dataset-action-card" onClick={onOpenRoot}>
                <span className="dataset-action-title">저장소 열기</span>
                <span className="dataset-action-desc">중앙 ml-dataset 폴더를 탐색기에서 바로 열어 현재 파일 상태를 확인</span>
              </button>
            </div>
          </div>
        </section>

        <section className="dataset-section-card">
          <div className="dataset-section-title">최근 이관 run</div>
          <div className="dataset-transfer-list">
            {(stats?.runs ?? []).map((item) => (
              <div key={item.path} className="dataset-transfer-row">
                <div className="dataset-transfer-main">
                  <div className="dataset-transfer-batch">{item.name}</div>
                  <div className="dataset-transfer-sub">used {item.usedImageCount}개 · review {item.reviewFileCount}개 · {formatBytes(item.totalSizeBytes)}</div>
                </div>
                <span className="dataset-transfer-status done">{formatDateTime(item.updatedAt)}</span>
              </div>
            ))}
            {!stats?.runs?.length ? (
              <div className="dataset-transfer-row">
                <div className="dataset-transfer-main">
                  <div className="dataset-transfer-batch">이관 기록 없음</div>
                  <div className="dataset-transfer-sub">리뷰를 모두 처리하면 run 데이터가 여기 표시됩니다.</div>
                </div>
                <span className="dataset-transfer-status pending">대기</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="dataset-section-card">
          <div className="dataset-section-title">동기화 상태</div>
          <div className="dataset-policy-list">
            <div className="dataset-summary-item"><span className={`sync-dot ${syncStatus?.sqliteConnected ? 'synced' : 'muted'}`} /> 로컬 SQLite {syncStatus?.sqliteConnected ? '연결됨' : '대기'}</div>
            <div className="dataset-summary-item"><span className={`sync-dot ${(syncStatus?.pendingCount ?? 0) > 0 ? 'pending' : 'synced'}`} /> 대기 {syncStatus?.pendingCount ?? 0}건</div>
            <div className="dataset-summary-item"><span className={`sync-dot ${syncStatus?.ollamaAvailable ? 'synced' : 'muted'}`} /> {syncStatus?.ollamaAvailable ? 'Ollama 사용 가능' : 'Ollama 미연결'}</div>
            <div className="dataset-summary-item"><span className={`sync-dot ${(syncStatus?.pendingCount ?? 0) > 0 ? 'pending' : 'muted'}`} /> {syncStatus?.externalApiLabel ?? '외부 API 대기'}</div>
          </div>
        </section>

        <section className="dataset-section-card">
          <div className="dataset-section-title">정리 정책</div>
          <div className="dataset-policy-list">
            {cleanupRules.map((rule) => (
              <div key={rule} className="dataset-policy-item">{rule}</div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

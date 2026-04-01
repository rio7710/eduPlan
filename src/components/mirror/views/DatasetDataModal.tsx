type Props = {
  isOpen: boolean;
  loading: boolean;
  preview: MlDatasetPreviewData | null;
  onRefresh: () => void;
  onClose: () => void;
};

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DatasetDataModal({ isOpen, loading, preview, onRefresh, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="font-color-modal-backdrop" onClick={onClose}>
      <div className="font-color-modal dataset-data-modal" onClick={(event) => event.stopPropagation()}>
        <div className="font-color-modal-header">
          <div className="modal-title">데이터 미리보기</div>
        </div>
        <div className="dataset-data-modal-body">
          <div className="dataset-policy-list">
            <div className="dataset-summary-item"><span className="sync-dot online" /> 최근 자동승인 {preview?.autoTxtRows?.length ?? 0}건</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> 최근 문서 {preview?.recentDocuments?.length ?? 0}건</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> user pair 샘플 {preview?.userPairs?.length ?? 0}건</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> train pair 샘플 {preview?.trainPairs?.length ?? 0}건</div>
          </div>

          <div className="dataset-data-section">
            <div className="dataset-section-title">자동승인 최근 30건</div>
            {(preview?.autoTxtRows ?? []).map((row, index) => (
              <div key={`${row.fileName}:${row.lineStart}:${index}`} className="dataset-policy-item">
                [{formatDateTime(row.updatedAt)}] {row.fileName}:{row.lineStart} | {row.beforePreview} {'->'} {row.afterPreview}
              </div>
            ))}
            {!(preview?.autoTxtRows?.length) ? <div className="dataset-policy-item">데이터 없음</div> : null}
          </div>

          <div className="dataset-data-section">
            <div className="dataset-section-title">user_line_break_pairs 샘플</div>
            {(preview?.userPairs ?? []).map((row, index) => (
              <div key={`u:${row.sourceId}:${index}`} className="dataset-policy-item">
                [{row.label}] {row.left} | {row.right}
              </div>
            ))}
            {!(preview?.userPairs?.length) ? <div className="dataset-policy-item">데이터 없음</div> : null}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onRefresh} disabled={loading}>{loading ? '로딩...' : '새로고침'}</button>
          <button className="btn btn-primary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

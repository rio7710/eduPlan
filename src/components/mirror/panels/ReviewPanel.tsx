type Props = {
  onOpenReview: () => void;
  items: ReviewItem[];
  report: {
    txtReplaceCount?: number;
    changedPages?: number;
    pageCount?: number;
    avgSimilarity?: number;
  } | null;
};

export function ReviewPanel({ onOpenReview, items, report }: Props) {
  const pendingCount = items.filter((item) => item.status === 'pending').length;
  const approvedCount = items.filter((item) => item.status === 'approved').length;
  const txtApprovedCount = Math.max(0, Number(report?.txtReplaceCount ?? 0));
  const totalApprovedCount = approvedCount + txtApprovedCount;
  const avgConfidence = items.length
    ? Math.round((items.reduce((sum, item) => sum + Math.min(0.99, 0.55 + item.candidateCount * 0.08), 0) / items.length) * 100)
    : 0;

  return (
    <div className="panel active" id="panel-review">
      <div className="panel-header"><span>ML 데이터 검토</span></div>
      <div className="panel-body">
        <div className="review-summary">
          <div className="review-stat">
            <div className="review-stat-value">{pendingCount}</div>
            <div className="review-stat-label">검토 대기</div>
          </div>
          <div className="review-stat">
            <div className="review-stat-value">{totalApprovedCount}</div>
            <div className="review-stat-label">오늘 승인</div>
          </div>
          <div className="review-stat">
            <div className="review-stat-value">{avgConfidence}%</div>
            <div className="review-stat-label">평균 신뢰도</div>
          </div>
        </div>
        {txtApprovedCount > 0 ? (
          <div className="dataset-summary-list mt8">
            <div className="dataset-summary-item"><span className="sync-dot online" /> TXT 자동 승인 {txtApprovedCount}건</div>
          </div>
        ) : null}
        {typeof report?.changedPages === 'number' ? (
          <div className="dataset-summary-list mt8">
            <div className="dataset-summary-item"><span className="sync-dot pending" /> TXT 비교 변경 {report.changedPages}/{report.pageCount ?? 0}</div>
            <div className="dataset-summary-item"><span className="sync-dot online" /> TXT 평균 유사도 {Math.round((report.avgSimilarity ?? 0) * 100)}%</div>
          </div>
        ) : null}
        <button className="btn btn-primary full-width mt8" onClick={onOpenReview}>검토 화면 열기</button>
      </div>
    </div>
  );
}

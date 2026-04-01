type Props = {
  report: {
    fileName: string;
    path: string;
    preview: string[];
    changedPages?: number;
    pageCount?: number;
    avgSimilarity?: number;
    pages?: Array<{
      page: number;
      changed: boolean;
      similarity: number;
      imagePaths: string[];
      rawPreview: string[];
      referencePreview: string[];
    }>;
  } | null;
};

export function ReportPanel({ report }: Props) {
  return (
    <div className="panel active" id="panel-report">
      <div className="panel-header"><span>변환 레포트</span></div>
      <div className="panel-body">
        {report ? (
          <div className="dataset-summary-card">
            <div className="dataset-summary-row">
              <span className="dataset-summary-label">파일</span>
              <span className="dataset-summary-value">{report.fileName}</span>
            </div>
            {typeof report.changedPages === 'number' ? (
              <div className="dataset-summary-list">
                <div className="dataset-summary-item"><span className="sync-dot pending" /> 변경 페이지 {report.changedPages}/{report.pageCount ?? 0}</div>
                <div className="dataset-summary-item"><span className="sync-dot online" /> 평균 유사도 {Math.round((report.avgSimilarity ?? 0) * 100)}%</div>
              </div>
            ) : null}
            <div className="review-preview-box">
              <div className="review-preview-label">{report.path}</div>
              <div className="review-preview-text">{report.preview.join('\n') || '내용 없음'}</div>
            </div>
            {(report.pages ?? []).map((page) => (
              <div key={page.page} className="review-preview-box">
                <div className="review-preview-label">페이지 {page.page} · 유사도 {Math.round(page.similarity * 100)}%</div>
                <div className="review-preview-text">
                  RAW: {(page.rawPreview ?? []).join(' / ') || '-'}
                  {'\n'}
                  REF: {(page.referencePreview ?? []).join(' / ') || '-'}
                  {'\n'}
                  IMG: {(page.imagePaths ?? []).join(', ') || '-'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="tree-item">
            <span className="tree-label">최근 변환 레포트가 없습니다.</span>
          </div>
        )}
      </div>
    </div>
  );
}

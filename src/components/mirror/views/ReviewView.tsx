import { useMemo, useState } from 'react';

const HIERARCHY_LABEL_OPTIONS = [
  'heading_1',
  'heading_2',
  'heading_3',
  'heading_4',
  'bullet_1',
  'bullet_2',
  'bullet_3',
  'bullet_4',
  'page_number_noise',
  'header_noise',
  'meta_noise',
] as const;

type Props = {
  items: ReviewItem[];
  onResolveItem: (item: ReviewItem, action: 'approve' | 'reject') => Promise<void> | void;
  onApproveAll: (items: ReviewItem[]) => Promise<void> | void;
};

function toFileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return encodeURI(`file:///${normalized}`);
}

export function ReviewView({ items, onResolveItem, onApproveAll }: Props) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [resolvingIds, setResolvingIds] = useState<string[]>([]);
  const [hierarchyLabels, setHierarchyLabels] = useState<Record<string, string>>({});

  const filteredItems = useMemo(() => (
    filter === 'all'
      ? items
      : items.filter((item) => item.status === filter)
  ), [filter, items]);

  const pendingItems = useMemo(
    () => items.filter((item) => item.status === 'pending'),
    [items],
  );

  async function handleResolve(item: ReviewItem, action: 'approve' | 'reject') {
    if (resolvingIds.includes(item.id)) {
      return;
    }

    setResolvingIds((current) => [...current, item.id]);
    try {
      await onResolveItem(item, action);
    } finally {
      setResolvingIds((current) => current.filter((value) => value !== item.id));
    }
  }

  async function handleApproveAll() {
    if (!pendingItems.length) {
      return;
    }

    const pendingIds = pendingItems.map((item) => item.id);
    setResolvingIds((current) => [...new Set([...current, ...pendingIds])]);
    try {
      await onApproveAll(pendingItems);
    } finally {
      setResolvingIds((current) => current.filter((value) => !pendingIds.includes(value)));
    }
  }

  return (
    <>
      <div className="view-header">
        <span className="breadcrumb">ML 데이터 검토</span>
        <div className="view-header-actions">
          <select className="select-sm" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="all">전체</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
          <button className="btn btn-sm btn-ghost" onClick={handleApproveAll} disabled={!pendingItems.length}>일괄 승인</button>
        </div>
      </div>

      <div className="review-content">
        {filteredItems.length ? filteredItems.map((item) => {
          if (item.type === 'hierarchy_pattern') {
            const isResolving = resolvingIds.includes(item.id);
            const selectedLabel = hierarchyLabels[item.id] ?? item.finalLabel ?? item.recommendationLabel;
            const isModified = selectedLabel !== item.recommendationLabel;
            return (
              <div key={item.id} className="review-card">
                <div className="review-card-header">
                  <div className="review-meta">
                    <span className="action-badge keep">HIER</span>
                    <span className="review-engine-badge py">PY</span>
                    <span className="review-doc">{item.sourcePdfName}</span>
                    <span className="review-time">{item.createdAt.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div className="review-score">
                    <span className="score-label">추천 라벨</span>
                    <span className="score-value high">{item.recommendationLabel}</span>
                  </div>
                </div>

                <div className="logo-review-layout">
                  <div className="logo-review-preview-wrap">
                    <div className="diff-header">패턴 후보</div>
                    <div className="review-preview-box">
                      <div className="review-preview-label">후보명</div>
                      <div className="review-preview-text">{item.candidateText}</div>
                    </div>
                    <div className="review-preview-box">
                      <div className="review-preview-label">샘플 텍스트</div>
                      {item.sampleTexts.map((sample, sampleIndex) => (
                        <div key={`${item.id}:sample:${sampleIndex}`} className="review-preview-text">{sample}</div>
                      ))}
                    </div>
                  </div>

                  <div className="logo-review-info">
                    <div className="diff-header">검토 정보</div>
                    <div className="logo-review-meta-list">
                      <div className="logo-review-meta-row">
                        <span className="logo-review-meta-label">패턴 종류</span>
                        <span className="logo-review-meta-value">{item.patternKind}</span>
                      </div>
                      <div className="logo-review-meta-row">
                        <span className="logo-review-meta-label">추천 라벨</span>
                        <span className="logo-review-meta-value">{item.recommendationLabel}</span>
                      </div>
                      <div className="logo-review-meta-row">
                        <span className="logo-review-meta-label">적용 라벨</span>
                        <select
                          className="select-sm hierarchy-label-select"
                          value={selectedLabel}
                          onChange={(event) => {
                            const value = event.target.value;
                            setHierarchyLabels((current) => ({ ...current, [item.id]: value }));
                          }}
                          disabled={isResolving || item.status !== 'pending'}
                        >
                          {HIERARCHY_LABEL_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div className="logo-review-meta-row">
                        <span className="logo-review-meta-label">등장 횟수</span>
                        <span className="logo-review-meta-value">{item.candidateCount}개</span>
                      </div>
                      <div className="logo-review-meta-row">
                        <span className="logo-review-meta-label">샘플 행</span>
                        <span className="logo-review-meta-value">{item.sampleLines.join(', ') || '-'}</span>
                      </div>
                      <div className="logo-review-meta-row">
                        <span className="logo-review-meta-label">상태</span>
                        <span className={`logo-review-status ${item.status}`}>{item.status}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="review-actions">
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleResolve(item, 'reject')}
                    disabled={isResolving || item.status !== 'pending'}
                  >
                    제외
                  </button>
                  <button
                    className={`btn btn-sm ${isModified ? 'btn-primary' : 'btn-success'}`}
                    onClick={() => handleResolve({ ...item, finalLabel: selectedLabel }, 'approve')}
                    disabled={isResolving || item.status !== 'pending'}
                  >
                    {isModified ? '수정승인' : '승인'}
                  </button>
                </div>
              </div>
            );
          }

          const confidence = item.mlScore ?? item.pyScore ?? Math.min(0.99, 0.55 + item.candidateCount * 0.08);
          const scoreClass = confidence >= 0.85 ? 'high' : confidence >= 0.7 ? 'mid' : 'low';
          const isResolving = resolvingIds.includes(item.id);
          const recommendationSource = item.recommendationSource ?? 'PY';
          const mlPercent = Math.round((item.mlScore ?? 0) * 100);

          return (
            <div key={item.id} className="review-card">
              <div className="review-card-header">
                <div className="review-meta">
                  <span className="action-badge delete">LOGO</span>
                  <span className={`review-engine-badge ${recommendationSource.toLowerCase().replace('&', '-')}`}>{recommendationSource}</span>
                  <span className="review-ml-badge">{`ML ${mlPercent}%`}</span>
                  <span className="review-doc">{item.sourcePdfName}</span>
                  <span className="review-time">{item.createdAt.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div className="review-score">
                  <span className="score-label">품질 점수</span>
                  <span className={`score-value ${scoreClass}`}>{confidence.toFixed(2)}</span>
                </div>
              </div>

              <div className="logo-review-layout">
                <div className="logo-review-preview-wrap">
                  <div className="diff-header">로고 후보 미리보기</div>
                  <div className="logo-review-preview">
                    <img src={toFileUrl(item.previewImagePath)} alt={item.sourcePdfName} />
                  </div>
                </div>

                <div className="logo-review-info">
                  <div className="diff-header">검토 정보</div>
                  <div className="logo-review-meta-list">
                    <div className="logo-review-meta-row">
                      <span className="logo-review-meta-label">반복 검출</span>
                      <span className="logo-review-meta-value">{item.candidateCount}개</span>
                    </div>
                    <div className="logo-review-meta-row">
                      <span className="logo-review-meta-label">추천 엔진</span>
                      <span className="logo-review-meta-value">{recommendationSource}</span>
                    </div>
                    <div className="logo-review-meta-row">
                      <span className="logo-review-meta-label">PY 점수</span>
                      <span className="logo-review-meta-value">{item.pyScore != null ? item.pyScore.toFixed(2) : '-'}</span>
                    </div>
                    <div className="logo-review-meta-row">
                      <span className="logo-review-meta-label">ML 점수</span>
                      <span className="logo-review-meta-value">{`${mlPercent}%`}</span>
                    </div>
                    <div className="logo-review-meta-row">
                      <span className="logo-review-meta-label">상태</span>
                      <span className={`logo-review-status ${item.status}`}>{item.status}</span>
                    </div>
                    <div className="logo-review-meta-row">
                      <span className="logo-review-meta-label">미리보기 파일</span>
                      <span className="logo-review-meta-value path">{item.previewImagePath}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="review-actions">
                <button className="btn btn-ghost btn-sm" disabled>건너뛰기</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleResolve(item, 'reject')} disabled={isResolving || item.status !== 'pending'}>거부</button>
                <button className="btn btn-success btn-sm" onClick={() => handleResolve(item, 'approve')} disabled={isResolving || item.status !== 'pending'}>승인</button>
              </div>
            </div>
          );
        }) : (
          <div className="review-card review-empty-card">
            <div className="review-body">검토할 ML 후보가 없습니다.</div>
          </div>
        )}
      </div>
    </>
  );
}

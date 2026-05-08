import { useEffect, useState } from 'react';

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
  item: HierarchyPatternReviewItem;
  top: number;
  left: number;
  documentText: string;
  selectedRange?: { line: number; endLine?: number; selectedText?: string } | null;
  onApprove: (finalLabel: string) => void;
  onReject: () => void;
  onClose: () => void;
};

function describeAction(action: HierarchyPatternReviewItem['mlAction']) {
  if (action === 'approve') return '현재 추천을 그대로 써도 됩니다.';
  if (action === 'change') return '라벨을 바꿔서 적용하는 편이 낫습니다.';
  if (action === 'reject') return '위계 항목으로 보지 않는 편이 낫습니다.';
  return '추천 정보가 아직 충분하지 않습니다.';
}

function labelText(label: string | null | undefined) {
  if (!label) return '-';
  return label.replace('_', ' ');
}

function buildContext(documentText: string, lineNumber: number | null, endLine?: number | null) {
  const lines = documentText.split(/\r?\n/);
  if (!lineNumber || lineNumber < 1 || lineNumber > lines.length) {
    return { before: [], focus: '', after: [] };
  }
  const resolvedEnd = endLine && endLine >= lineNumber ? Math.min(endLine, lines.length) : lineNumber;
  return {
    before: lines.slice(Math.max(0, lineNumber - 3), lineNumber - 1),
    focus: lines.slice(lineNumber - 1, resolvedEnd).join('\n'),
    after: lines.slice(resolvedEnd, Math.min(lines.length, resolvedEnd + 2)),
  };
}

function buildPreview(label: string, text: string) {
  if (!text.trim()) return '-';
  if (label.startsWith('heading_')) {
    const level = Number(label.split('_')[1] || '1');
    return `${'#'.repeat(Math.max(1, Math.min(6, level)))} ${text.replace(/^>?\s*/, '').replace(/^\*+|\*+$/g, '').trim()}`;
  }
  if (label.startsWith('bullet_')) {
    return `- ${text.replace(/^>?\s*/, '').replace(/^\*+|\*+$/g, '').trim()}`;
  }
  return text.trim();
}

function buildReasons(item: HierarchyPatternReviewItem) {
  const reasons = [];
  if (item.patternSummary) reasons.push(`패턴 근거: ${item.patternSummary}`);
  if (item.mlAction) reasons.push(`ML 판단: ${describeAction(item.mlAction)}`);
  if (item.candidateCount > 1) reasons.push(`같은 형식이 ${item.candidateCount}회 반복되었습니다.`);
  if (!reasons.length) reasons.push('현재는 규칙 기반 추천을 우선 보여줍니다.');
  return reasons.slice(0, 3);
}

export function HierarchyReviewPopover({ item, top, left, documentText, selectedRange = null, onApprove, onReject, onClose }: Props) {
  const [selectedLabel, setSelectedLabel] = useState(item.finalLabel ?? item.mlRecommendedLabel ?? item.recommendationLabel);
  void top;
  void left;
  const focusLine = selectedRange?.line ?? item.sampleLines[0] ?? null;
  const selectedText = selectedRange?.selectedText?.trim() ?? '';
  const context = buildContext(documentText, focusLine, selectedRange?.endLine ?? null);
  const focusText = selectedText || context.focus || item.candidateText;
  const reasons = buildReasons(item);

  useEffect(() => {
    setSelectedLabel(item.finalLabel ?? item.mlRecommendedLabel ?? item.recommendationLabel);
  }, [item]);

  return (
    <div className="hierarchy-review-modal-backdrop" onMouseDown={onClose}>
      <div
        className="hierarchy-review-popover"
        role="dialog"
        aria-label="위계 검토"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="hierarchy-review-popover-header">
          <div className="hierarchy-review-popover-title">위계 검토</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
        </div>
        <div className="hierarchy-review-popover-body">
          <div className="hierarchy-review-focus">{focusText}</div>
          <div className="hierarchy-review-context">
            {context.before.map((line, index) => (
              <div key={`before-${index}`} className="hierarchy-review-context-line muted">{line || ' '}</div>
            ))}
            <div className="hierarchy-review-context-line focus">{focusText}</div>
            {context.after.map((line, index) => (
              <div key={`after-${index}`} className="hierarchy-review-context-line muted">{line || ' '}</div>
            ))}
          </div>
          <div className="hierarchy-review-summary">
            <div className="hierarchy-review-summary-title">추천 해석</div>
            <div className="hierarchy-review-summary-text">{describeAction(item.mlAction)}</div>
          </div>
          <div className="hierarchy-review-grid">
            <div className="hierarchy-review-row compact">
              <span className="hierarchy-review-label">기본 추천</span>
              <div className="hierarchy-review-value">{labelText(item.recommendationLabel)}</div>
            </div>
            <div className="hierarchy-review-row compact">
              <span className="hierarchy-review-label">검토 범위</span>
              <div className="hierarchy-review-value">
                {selectedRange?.endLine && selectedRange.endLine > focusLine
                  ? `${focusLine}-${selectedRange.endLine}행`
                  : `${focusLine ?? '-'}행`}
              </div>
            </div>
            <div className="hierarchy-review-row compact">
              <span className="hierarchy-review-label">ML 판단</span>
              <div className="hierarchy-review-value">{item.mlAction ?? '-'}</div>
            </div>
            <div className="hierarchy-review-row compact">
              <span className="hierarchy-review-label">ML 라벨</span>
              <div className="hierarchy-review-value">{labelText(item.mlRecommendedLabel)}</div>
            </div>
            <div className="hierarchy-review-row compact">
              <span className="hierarchy-review-label">신뢰도</span>
              <div className="hierarchy-review-value">{item.mlScore != null ? `${Math.round(item.mlScore * 100)}%` : '-'}</div>
            </div>
          </div>
          <div className="hierarchy-review-row">
            <span className="hierarchy-review-label">적용 라벨</span>
            <select
              className="select-sm hierarchy-label-select"
              value={selectedLabel}
              onChange={(event) => setSelectedLabel(event.target.value)}
            >
              {HIERARCHY_LABEL_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="hierarchy-review-row">
            <span className="hierarchy-review-label">근거</span>
            <div className="hierarchy-review-value">
              <div>패턴 후보: {item.candidateText}</div>
              {reasons.map((reason) => (
                <div key={reason}>{reason}</div>
              ))}
            </div>
          </div>
          <div className="hierarchy-review-row">
            <span className="hierarchy-review-label">적용 미리보기</span>
            <div className="hierarchy-review-preview">{buildPreview(selectedLabel, focusText)}</div>
          </div>
        </div>
        <div className="hierarchy-review-popover-footer">
          <button type="button" className="btn btn-danger btn-sm" onClick={onReject}>제외</button>
          <button type="button" className="btn btn-success btn-sm" onClick={() => onApprove(selectedLabel)}>승인</button>
        </div>
      </div>
    </div>
  );
}

type Props = {
  number: number;
  badge: string;
  badgeClass?: string;
  rows: number;
  kind: 'heading' | 'text' | 'image' | 'table';
  content: string;
};

export function PreviewBlockRow({ number, badge, badgeClass = '', rows, kind, content }: Props) {
  return (
    <div className="preview-block-row">
      <div className="source-block-gutter">
        {Array.from({ length: rows }, (_, index) => (
          <div key={`${number}-${index + 1}`} className={`sbg-line ${index === 0 ? 'sbg-first' : ''}`.trim()}>
            {index === 0 ? (
              <>
                <span className="block-num">{number}</span>
                <span className={`block-type-badge ${badgeClass}`.trim()}>{badge}</span>
              </>
            ) : null}
            <span className="sbg-lnum">{index + 1}</span>
          </div>
        ))}
      </div>
      <div className={`preview-block-content ${kind === 'heading' ? 'edu-heading' : kind === 'text' ? 'edu-text' : kind === 'image' ? 'edu-image' : 'edu-table'}`.trim()}>
        {kind === 'heading' ? <h1>{content}</h1> : null}
        {kind === 'text' ? <p>{content}</p> : null}
        {kind === 'image' ? (
          <div className="preview-image-box">
            <span>🖼</span><span>{content}</span>
          </div>
        ) : null}
        {kind === 'table' ? (
          <table className="block-table">
            <thead>
              <tr><th>주차</th><th>단원</th><th>학습 목표</th><th>평가</th></tr>
            </thead>
            <tbody>
              <tr><td>1주</td><td>오리엔테이션</td><td>학습 목표 및 계획 이해</td><td>-</td></tr>
              <tr><td>2주</td><td>기초 개념</td><td>핵심 개념 파악</td><td>형성평가</td></tr>
              <tr><td>3주</td><td>심화 학습</td><td>응용 능력 향상</td><td>수행평가</td></tr>
              <tr><td>4주</td><td>정리 및 평가</td><td>전체 내용 정리</td><td>총괄평가</td></tr>
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

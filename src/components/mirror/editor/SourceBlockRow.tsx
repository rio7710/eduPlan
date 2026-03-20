type Props = {
  number: number;
  badge: string;
  badgeClass?: string;
  rows: number;
  value: string;
};

export function SourceBlockRow({ number, badge, badgeClass = '', rows, value }: Props) {
  return (
    <div className="source-block-row">
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
      <textarea className="source-block-textarea" rows={rows} spellCheck={false} defaultValue={value} />
    </div>
  );
}

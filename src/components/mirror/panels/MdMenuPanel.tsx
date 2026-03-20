import { useEffect, useMemo, useRef } from 'react';
import { extractHeadings, type HeadingItem } from '@/lib/headingSections';

type Props = {
  document: ShellDocument | null;
  activeLine?: number | null;
  onSelectHeading: (lineNumber: number) => void;
  collapsedLineNumbers: number[];
  onToggleHeadingCollapse: (lineNumber: number) => void;
};

function hasChildren(headings: HeadingItem[], index: number) {
  const current = headings[index];
  const next = headings[index + 1];
  return Boolean(next && next.level > current.level);
}

function compactRepeatedHeadings(headings: HeadingItem[]) {
  return headings.reduce<Array<HeadingItem & { sourceLineNumbers: number[] }>>((acc, heading) => {
    const last = acc[acc.length - 1];
    if (last && last.level === heading.level && last.text === heading.text) {
      last.sourceLineNumbers.push(heading.lineNumber);
      return acc;
    }

    acc.push({
      ...heading,
      sourceLineNumbers: [heading.lineNumber],
    });
    return acc;
  }, []);
}

export function MdMenuPanel({
  document,
  activeLine = null,
  onSelectHeading,
  collapsedLineNumbers = [],
  onToggleHeadingCollapse = () => {},
}: Props) {
  const content = document?.content ?? '';
  const headings = useMemo(() => compactRepeatedHeadings(extractHeadings(content)), [content]);
  const imageCount = (content.match(/!\[[^\]]*]\([^)]+\)/g) ?? []).length;
  const linkCount = (content.match(/\[[^\]]+]\([^)]+\)/g) ?? []).length;
  const htmlTagCount = (content.match(/<[^>]+>/g) ?? []).length;
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  const activeHeadingId = useMemo(() => {
    if (!activeLine) {
      return null;
    }

    const activeHeading = headings.reduce<HeadingItem | null>((current, heading) => {
      if (heading.lineNumber <= activeLine) {
        return heading;
      }
      return current;
    }, null);

    return activeHeading ? activeHeading.id : null;
  }, [activeLine, headings]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeHeadingId]);

  function isVisible(index: number) {
    const current = headings[index];
    let requiredAncestorLevel = current.level;

    for (let i = index - 1; i >= 0; i -= 1) {
      const ancestor = headings[i];
      if (ancestor.level < requiredAncestorLevel) {
        if (collapsedLineNumbers.includes(ancestor.lineNumber)) {
          return false;
        }
        requiredAncestorLevel = ancestor.level;
      }
    }
    return true;
  }

  return (
    <div className="panel active" id="panel-md-menu">
      <div className="panel-header"><span>MD 문서 메뉴</span></div>
      <div className="panel-body">
        {!document ? (
          <div className="tree-empty" style={{ paddingTop: '12px' }}>
            MD 문서가 열리면 메뉴가 표시됩니다.
          </div>
        ) : (
          <div className="md-menu-layout">
            <div className="md-menu-meta">
              <div className="md-menu-file">{document.fileName}</div>
              <div className="md-menu-help">현재 MD 문서 전용 메뉴</div>
            </div>

            <div className="panel-section">
              <div className="tree-header">문서 구조</div>
              {headings.length ? (
                <div className="md-menu-tree-list">
                  {headings.map((heading, index) => {
                    if (!isVisible(index)) {
                      return null;
                    }

                    const expandable = hasChildren(headings, index);
                    const collapsed = collapsedLineNumbers.includes(heading.lineNumber);

                    return (
                      <button
                        key={heading.id}
                        ref={heading.id === activeHeadingId ? activeItemRef : null}
                        className={`tree-item md-menu-tree-row ${heading.id === activeHeadingId ? 'active' : ''}`.trim()}
                        style={{
                          paddingLeft: `${8 + (heading.level - 1) * 10}px`,
                          color: `var(--preview-h${Math.min(heading.level, 6)}-color)`,
                        }}
                        onClick={() => onSelectHeading(heading.lineNumber)}
                      >
                        <span
                          className={`md-menu-fold ${expandable ? 'expandable' : 'placeholder'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (expandable) {
                              onToggleHeadingCollapse(heading.lineNumber);
                            }
                          }}
                        >
                          {expandable ? (collapsed ? '▶' : '▼') : ''}
                        </span>
                        <span className="md-menu-text" style={{ color: `var(--preview-h${Math.min(heading.level, 6)}-color)` }}>{heading.text}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="tree-empty">문서에 헤딩이 없습니다.</div>
              )}
            </div>

            <div className="panel-section">
              <div className="tree-header">점검 항목</div>
              <button className="panel-action md-menu-action">
                <span className="md-menu-text">이미지 첨부 확인</span>
                <span className="md-menu-count">{imageCount}개</span>
              </button>
              <button className="panel-action md-menu-action">
                <span className="md-menu-text">링크 검증</span>
                <span className="md-menu-count">{linkCount}개</span>
              </button>
              <button className="panel-action md-menu-action">
                <span className="md-menu-text">HTML 태그 검토</span>
                <span className="md-menu-count">{htmlTagCount}개</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { memo, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PreviewSelectionMode } from '@/App';

type ReactMarkdownPaneProps = {
  markdownText: string;
  autoWrap?: boolean;
  selectionMode?: PreviewSelectionMode;
  scrollRequest?: { line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number; target?: 'Edit' | 'Render' | 'Both' } | null;
  onActiveLineChange?: (line: number | null) => void;
  onMouseFocus?: () => void;
  onLocationTrigger?: (kind: 'scroll' | 'keyboard') => void;
  onScrollRatioChange?: (ratio: number) => void;
  syncScrollRatio?: number | null;
};

function ReactMarkdownPaneComponent({
  markdownText,
  autoWrap = true,
  selectionMode = 'text',
  scrollRequest = null,
  onActiveLineChange,
  onMouseFocus,
  onLocationTrigger,
  onScrollRatioChange,
  syncScrollRatio = null,
}: ReactMarkdownPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suppressScrollEmitRef = useRef(false);
  const lastEmittedScrollRatioRef = useRef(-1);
  const pendingScrollRatioRef = useRef<number | null>(null);
  const scrollEmitRafRef = useRef<number | null>(null);
  const headingLines = useMemo(() => {
    return markdownText
      .split(/\r?\n/)
      .map((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (!match) {
          return null;
        }

        return {
          level: match[1].length,
          lineNumber: index + 1,
          text: match[2].trim(),
        };
      })
      .filter((item): item is { level: number; lineNumber: number; text: string } => Boolean(item));
  }, [markdownText]);

  useEffect(() => {
    if (!containerRef.current || !scrollRequest) {
      return;
    }

    const targetHeading = [...headingLines].reverse().find((item) => item.lineNumber <= scrollRequest.line) ?? null;
    if (!targetHeading) {
      return;
    }

    const target = containerRef.current.querySelector<HTMLElement>(`[data-render-line="${targetHeading.lineNumber}"]`);
    target?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [headingLines, scrollRequest]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateCurrentHeading = () => {
      const headingElements = Array.from(container.querySelectorAll<HTMLElement>('[data-render-line]'));
      if (!headingElements.length) {
        onActiveLineChange?.(null);
        return;
      }

      const containerTop = container.getBoundingClientRect().top;
      let currentLine: number | null = null;

      for (const element of headingElements) {
        if (element.getBoundingClientRect().top <= containerTop + 16) {
          const line = Number(element.dataset.renderLine || 0);
          currentLine = line > 0 ? line : currentLine;
          continue;
        }
        break;
      }

      onActiveLineChange?.(currentLine ?? (Number(headingElements[0]?.dataset.renderLine || 0) || null));
    };

    const handleScroll = () => {
      updateCurrentHeading();
      onLocationTrigger?.('scroll');

      if (suppressScrollEmitRef.current) {
        return;
      }

      const max = container.scrollHeight - container.clientHeight;
      const ratio = max > 0 ? container.scrollTop / max : 0;
      const clamped = Math.max(0, Math.min(1, ratio));
      if (Math.abs(clamped - lastEmittedScrollRatioRef.current) < 0.008) {
        return;
      }
      pendingScrollRatioRef.current = clamped;
      if (scrollEmitRafRef.current !== null) {
        return;
      }
      scrollEmitRafRef.current = window.requestAnimationFrame(() => {
        scrollEmitRafRef.current = null;
        const next = pendingScrollRatioRef.current;
        if (next === null) {
          return;
        }
        pendingScrollRatioRef.current = null;
        lastEmittedScrollRatioRef.current = next;
        onScrollRatioChange?.(next);
      });
    };

    updateCurrentHeading();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollEmitRafRef.current !== null) {
        window.cancelAnimationFrame(scrollEmitRafRef.current);
        scrollEmitRafRef.current = null;
      }
    };
  }, [headingLines, onActiveLineChange, onLocationTrigger, onScrollRatioChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || syncScrollRatio === null || Number.isNaN(syncScrollRatio)) {
      return;
    }
    const max = container.scrollHeight - container.clientHeight;
    const clamped = Math.max(0, Math.min(1, syncScrollRatio));
    const currentRatio = max > 0 ? container.scrollTop / max : 0;
    if (Math.abs(currentRatio - clamped) < 0.008) {
      return;
    }
    suppressScrollEmitRef.current = true;
    container.scrollTop = max > 0 ? max * clamped : 0;
    const timer = window.setTimeout(() => {
      suppressScrollEmitRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncScrollRatio]);

  function expandSelectionToLineTargets() {
    if (selectionMode !== 'line') {
      return;
    }

    const selection = window.getSelection();
    const container = containerRef.current;
    if (!selection || !container || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const endNode = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
    const startTable = startNode?.closest<HTMLElement>('[data-preview-table-root="true"]') ?? null;
    const endTable = endNode?.closest<HTMLElement>('[data-preview-table-root="true"]') ?? null;
    const sameTable = startTable && endTable && startTable === endTable ? startTable : null;

    let firstTarget: HTMLElement | null = null;
    let lastTarget: HTMLElement | null = null;

    if (sameTable) {
      const startRow = startNode?.closest<HTMLElement>('[data-preview-table-row="true"]') ?? null;
      const endRow = endNode?.closest<HTMLElement>('[data-preview-table-row="true"]') ?? null;
      const rowTargets = Array.from(sameTable.querySelectorAll<HTMLElement>('[data-preview-table-row="true"]'));
      if (!startRow || !endRow) {
        firstTarget = sameTable;
        lastTarget = sameTable;
      } else {
        const startIndex = rowTargets.indexOf(startRow);
        const endIndex = rowTargets.indexOf(endRow);
        if (startIndex < 0 || endIndex < 0) {
          return;
        }
        [firstTarget, lastTarget] =
          startIndex <= endIndex ? [startRow, endRow] : [endRow, startRow];
      }
    } else {
      const startRoot =
        startTable
        ?? startNode?.closest<HTMLElement>('[data-preview-select-root="true"]')
        ?? null;
      const endRoot =
        endTable
        ?? endNode?.closest<HTMLElement>('[data-preview-select-root="true"]')
        ?? null;

      if (!startRoot || !endRoot || !container.contains(startRoot) || !container.contains(endRoot)) {
        return;
      }

      const roots = Array.from(container.querySelectorAll<HTMLElement>('[data-preview-select-root="true"]'));
      const startIndex = roots.indexOf(startRoot);
      const endIndex = roots.indexOf(endRoot);
      if (startIndex < 0 || endIndex < 0) {
        return;
      }

      [firstTarget, lastTarget] =
        startIndex <= endIndex ? [startRoot, endRoot] : [endRoot, startRoot];
    }

    if (!firstTarget || !lastTarget) {
      return;
    }

    const expandedRange = document.createRange();
    expandedRange.setStartBefore(firstTarget);
    expandedRange.setEndAfter(lastTarget);
    selection.removeAllRanges();
    selection.addRange(expandedRange);
  }

  return (
    <div
      ref={containerRef}
      className={`preview-pane react-markdown-pane ${selectionMode === 'line' ? 'preview-pane-line-mode' : ''} ${autoWrap ? '' : 'preview-pane-nowrap'}`.trim()}
      style={{ userSelect: 'text' }}
      onMouseDown={onMouseFocus}
      onWheel={onMouseFocus}
      onMouseUp={expandSelectionToLineTargets}
    >
      {markdownText.trim() ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ node, ...props }) => {
              const line = headingLines.find((item) => item.level === 1 && item.text === String(props.children ?? '').trim())?.lineNumber;
              return <h1 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
            },
            h2: ({ node, ...props }) => {
              const line = headingLines.find((item) => item.level === 2 && item.text === String(props.children ?? '').trim())?.lineNumber;
              return <h2 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
            },
            h3: ({ node, ...props }) => {
              const line = headingLines.find((item) => item.level === 3 && item.text === String(props.children ?? '').trim())?.lineNumber;
              return <h3 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
            },
            h4: ({ node, ...props }) => {
              const line = headingLines.find((item) => item.level === 4 && item.text === String(props.children ?? '').trim())?.lineNumber;
              return <h4 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
            },
            h5: ({ node, ...props }) => {
              const line = headingLines.find((item) => item.level === 5 && item.text === String(props.children ?? '').trim())?.lineNumber;
              return <h5 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
            },
            h6: ({ node, ...props }) => {
              const line = headingLines.find((item) => item.level === 6 && item.text === String(props.children ?? '').trim())?.lineNumber;
              return <h6 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
            },
            p: ({ node, ...props }) => <p className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" {...props} />,
            li: ({ node, ...props }) => <li className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" {...props} />,
            blockquote: ({ node, ...props }) => <blockquote className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" {...props} />,
            table: ({ node, ...props }) => <table data-preview-select-root="true" data-preview-table-root="true" {...props} />,
            tr: ({ node, ...props }) => <tr className="preview-line-target" data-preview-line-target="true" data-preview-table-row="true" {...props} />,
          }}
        >
          {markdownText}
        </ReactMarkdown>
      ) : (
        <div className="empty-stage">미리볼 내용이 없습니다.</div>
      )}
    </div>
  );
}

export const ReactMarkdownPane = memo(
  ReactMarkdownPaneComponent,
  (prev, next) =>
    prev.markdownText === next.markdownText
    && prev.autoWrap === next.autoWrap
    && prev.selectionMode === next.selectionMode
    && prev.syncScrollRatio === next.syncScrollRatio
    && prev.scrollRequest?.token === next.scrollRequest?.token
    && prev.scrollRequest?.line === next.scrollRequest?.line
    && prev.scrollRequest?.target === next.scrollRequest?.target,
);

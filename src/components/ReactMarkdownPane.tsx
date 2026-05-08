import { memo, useEffect, useMemo, useRef, useState, type ClipboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { HierarchyReviewPopover } from '@/components/preview/HierarchyReviewPopover';
import type { PreviewSelectionMode } from '@/App';
import { PreviewMarkdownContent } from '@/components/preview/PreviewMarkdownContent';
import { PreviewContextMenu } from '@/components/preview/PreviewContextMenu';
import { buildPreviewClipboardPayload } from '@/utils/previewClipboard';
import { writePreviewClipboard } from '@/utils/previewClipboardWrite';

const PREVIEW_CONTEXT_MENU_OPTIONS_STORAGE_KEY = 'edufixer-preview-context-menu-options';

function unwrapPreviewSearchMarks(container: HTMLElement) {
  const marks = Array.from(container.querySelectorAll<HTMLElement>('.preview-search-match'));
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  });
}

function highlightPreviewSearchText(target: HTMLElement, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return false;
  }

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.textContent?.trim()) {
      textNodes.push(currentNode as Text);
    }
    currentNode = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    const matchIndex = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());
    if (matchIndex < 0) {
      continue;
    }

    const range = document.createRange();
    range.setStart(textNode, matchIndex);
    range.setEnd(textNode, matchIndex + trimmedQuery.length);

    const mark = document.createElement('span');
    mark.className = 'preview-search-match';
    range.surroundContents(mark);
    return true;
  }

  return false;
}

function readPreviewSelection(container: HTMLDivElement | null) {
  const selection = window.getSelection();
  if (!selection || !container || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const startNode = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const endNode = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  if (!startNode || !endNode || !container.contains(startNode) || !container.contains(endNode)) {
    return null;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    return null;
  }

  const intersectedLines = Array.from(
    container.querySelectorAll<HTMLElement>('[data-preview-line-target="true"][data-render-line]'),
  )
    .filter((element) => {
      try {
        return range.intersectsNode(element);
      } catch {
        return false;
      }
    })
    .map((element) => Number(element.dataset.renderLine || 0))
    .filter((line) => Number.isFinite(line) && line > 0);

  const fallbackStartLine = Number(
    startNode.closest<HTMLElement>('[data-preview-line-target="true"]')?.dataset.renderLine || 0,
  );
  const fallbackEndLine = Number(
    endNode.closest<HTMLElement>('[data-preview-line-target="true"]')?.dataset.renderLine || 0,
  );
  const lineNumbers = intersectedLines.length
    ? intersectedLines
    : [fallbackStartLine, fallbackEndLine].filter((line) => Number.isFinite(line) && line > 0);
  if (!lineNumbers.length) {
    return null;
  }

  const line = Math.min(...lineNumbers);
  const resolvedEndLine = Math.max(...lineNumbers);
  return {
    line,
    endLine: resolvedEndLine,
    activeLine: line,
    label: resolvedEndLine > line ? `${line}-${resolvedEndLine}행 선택` : `${line}행 선택`,
    selectedText,
  };
}

type ReactMarkdownPaneProps = {
  markdownText: string;
  documentPath?: string | null;
  autoWrap?: boolean;
  selectionMode?: PreviewSelectionMode;
  searchSelection?: { lineNumber: number; start: number; end: number; query: string } | null;
  scrollRequest?: { line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number; target?: 'Edit' | 'Render' | 'Both' } | null;
  onActiveLineChange?: (line: number | null) => void;
  onMouseFocus?: () => void;
  onLocationTrigger?: (kind: 'scroll' | 'keyboard') => void;
  onScrollRatioChange?: (ratio: number) => void;
  syncScrollRatio?: number | null;
  onSelectedLineChange?: ((selection: { line: number; endLine?: number; activeLine?: number; label: string; selectedText?: string } | null) => void) | null;
  hierarchyPopoverSelectedRange?: { line: number; endLine?: number; selectedText?: string } | null;
  hierarchyPopoverItem?: HierarchyPatternReviewItem | null;
  onApproveHierarchyPopover?: ((item: HierarchyPatternReviewItem, finalLabel: string) => void) | null;
  onRejectHierarchyPopover?: ((item: HierarchyPatternReviewItem) => void) | null;
  onCloseHierarchyPopover?: (() => void) | null;
};

function ReactMarkdownPaneComponent({
  markdownText,
  documentPath = null,
  autoWrap = true,
  selectionMode = 'text',
  searchSelection = null,
  scrollRequest = null,
  onActiveLineChange,
  onMouseFocus,
  onLocationTrigger,
  onScrollRatioChange,
  syncScrollRatio = null,
  onSelectedLineChange = null,
  hierarchyPopoverSelectedRange = null,
  hierarchyPopoverItem = null,
  onApproveHierarchyPopover = null,
  onRejectHierarchyPopover = null,
  onCloseHierarchyPopover = null,
}: ReactMarkdownPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suppressScrollEmitRef = useRef(false);
  const lastEmittedScrollRatioRef = useRef(-1);
  const pendingScrollRatioRef = useRef<number | null>(null);
  const scrollEmitRafRef = useRef<number | null>(null);
  const autoCopyToastTimerRef = useRef<number | null>(null);
  const autoCopyScheduleRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [hierarchyPopoverPosition, setHierarchyPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const [autoCopyEnabled, setAutoCopyEnabled] = useState(() => {
    const raw = window.localStorage.getItem(PREVIEW_CONTEXT_MENU_OPTIONS_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    try {
      return JSON.parse(raw).autoCopyEnabled === true;
    } catch {
      return false;
    }
  });
  const [stripNumbersEnabled, setStripNumbersEnabled] = useState(() => {
    const raw = window.localStorage.getItem(PREVIEW_CONTEXT_MENU_OPTIONS_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    try {
      return JSON.parse(raw).stripNumbersEnabled === true;
    } catch {
      return false;
    }
  });
  const [stripLabelsEnabled, setStripLabelsEnabled] = useState(() => {
    const raw = window.localStorage.getItem(PREVIEW_CONTEXT_MENU_OPTIONS_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    try {
      return JSON.parse(raw).stripLabelsEnabled === true;
    } catch {
      return false;
    }
  });
  const [autoCopyToastVisible, setAutoCopyToastVisible] = useState(false);
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

    unwrapPreviewSearchMarks(container);

    if (!searchSelection?.query.trim()) {
      return;
    }

    const exactTarget = container.querySelector<HTMLElement>(`.preview-line-target[data-render-line="${searchSelection.lineNumber}"]`);
    const fallbackTarget = Array.from(container.querySelectorAll<HTMLElement>('.preview-line-target'))
      .find((element) => element.textContent?.includes(searchSelection.query));
    const target = exactTarget ?? fallbackTarget ?? null;
    if (!target) {
      return;
    }

    const highlighted = highlightPreviewSearchText(target, searchSelection.query);
    if (!highlighted) {
      target.classList.add('is-search-target');
    }

    return () => {
      unwrapPreviewSearchMarks(container);
      target.classList.remove('is-search-target');
    };
  }, [searchSelection]);

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
    if (!container || !hierarchyPopoverItem) {
      setHierarchyPopoverPosition(null);
      return;
    }

    const anchorLine = hierarchyPopoverItem.sampleLines[0] ?? null;
    const anchor = anchorLine
      ? container.querySelector<HTMLElement>(`[data-render-line="${anchorLine}"]`)
      : null;
    if (!anchor) {
      setHierarchyPopoverPosition({ top: 24, left: 24 });
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const popoverWidth = Math.min(400, window.innerWidth - 24);
    const popoverHeight = 260;
    const preferAbove = anchorRect.top >= (popoverHeight + 16);
    const top = preferAbove
      ? anchorRect.top - popoverHeight - 12
      : Math.min(window.innerHeight - popoverHeight - 12, anchorRect.bottom + 12);
    const left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, anchorRect.left));
    setHierarchyPopoverPosition({ top, left });
  }, [hierarchyPopoverItem, markdownText]);

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

  useEffect(() => {
    return () => {
      if (autoCopyToastTimerRef.current !== null) {
        window.clearTimeout(autoCopyToastTimerRef.current);
      }
      if (autoCopyScheduleRef.current !== null) {
        window.clearTimeout(autoCopyScheduleRef.current);
      }
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      PREVIEW_CONTEXT_MENU_OPTIONS_STORAGE_KEY,
      JSON.stringify({
        autoCopyEnabled,
        stripNumbersEnabled,
        stripLabelsEnabled,
      }),
    );
  }, [autoCopyEnabled, stripNumbersEnabled, stripLabelsEnabled]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  function showAutoCopyToast() {
    if (autoCopyToastTimerRef.current !== null) {
      window.clearTimeout(autoCopyToastTimerRef.current);
    }
    setAutoCopyToastVisible(true);
    autoCopyToastTimerRef.current = window.setTimeout(() => {
      setAutoCopyToastVisible(false);
      autoCopyToastTimerRef.current = null;
    }, 1400);
  }

  function logClipboardPayload(payload: { plain: string; html?: string }, source: 'auto' | 'manual') {
    console.log('[preview-copy]', {
      source,
      plain: payload.plain,
      html: payload.html ?? null,
      plainLength: payload.plain.length,
      htmlLength: payload.html?.length ?? 0,
      hasTableHtml: payload.html?.includes('<table') ?? false,
    });
  }

  function selectionBelongsToPreview(selection: Selection): boolean {
    const container = containerRef.current;
    if (!container || !selection.rangeCount) {
      return false;
    }

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const endNode = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
    return Boolean(startNode && endNode && container.contains(startNode) && container.contains(endNode));
  }

  async function copyCurrentSelection(showToast = false) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selectionBelongsToPreview(selection)) {
      return false;
    }

    const payload = buildPreviewClipboardPayload(selection, {
      stripNumbers: stripNumbersEnabled,
      stripLabels: stripLabelsEnabled,
    });
    if (!payload) {
      return false;
    }

    logClipboardPayload(payload, 'auto');
    const copied = await writePreviewClipboard(payload);
    if (copied && showToast) {
      showAutoCopyToast();
    }
    return copied;
  }

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
    const startElement =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement ?? null;
    const endElement =
      range.endContainer instanceof Element
        ? range.endContainer
        : range.endContainer.parentElement ?? null;
    if (!startElement || !endElement) {
      return;
    }
    const startLineTarget = startElement.closest<HTMLElement>('[data-preview-line-target="true"]');
    const endLineTarget = endElement.closest<HTMLElement>('[data-preview-line-target="true"]');
    if (!startLineTarget || !endLineTarget || !container.contains(startLineTarget) || !container.contains(endLineTarget)) {
      return;
    }
    if (startLineTarget === endLineTarget) {
      const childNodes = Array.from(startLineTarget.childNodes);
      const brIndexes = childNodes
        .map((node, index) => (node.nodeName === 'BR' ? index : -1))
        .filter((index) => index >= 0);
      if (brIndexes.length > 0) {
        const intervals: Array<{ start: number; end: number }> = [];
        let startOffset = 0;
        for (const brIndex of brIndexes) {
          if (startOffset < brIndex) {
            intervals.push({ start: startOffset, end: brIndex });
          }
          startOffset = brIndex + 1;
        }
        if (startOffset < childNodes.length) {
          intervals.push({ start: startOffset, end: childNodes.length });
        }
        if (intervals.length > 0) {
          const pointToIntervalIndex = (node: Node, offset: number) => {
            for (let i = 0; i < intervals.length; i += 1) {
              const interval = intervals[i]!;
              const rangeForLine = document.createRange();
              rangeForLine.setStart(startLineTarget, interval.start);
              rangeForLine.setEnd(startLineTarget, interval.end);
              try {
                if (rangeForLine.isPointInRange(node, offset)) {
                  return i;
                }
              } catch {
                // ignore out-of-scope point errors
              }
            }
            return -1;
          };
          const startInterval = pointToIntervalIndex(range.startContainer, range.startOffset);
          const endInterval = pointToIntervalIndex(range.endContainer, range.endOffset);
          if (startInterval >= 0 && endInterval >= 0) {
            const [fromIndex, toIndex] =
              startInterval <= endInterval ? [startInterval, endInterval] : [endInterval, startInterval];
            const firstInterval = intervals[fromIndex]!;
            const lastInterval = intervals[toIndex]!;
            const expandedRange = document.createRange();
            expandedRange.setStart(startLineTarget, firstInterval.start);
            expandedRange.setEnd(startLineTarget, lastInterval.end);
            selection.removeAllRanges();
            selection.addRange(expandedRange);
            return;
          }
        }
      }
    }
    const lineTargets = Array.from(container.querySelectorAll<HTMLElement>('[data-preview-line-target="true"]'));
    const startIndex = lineTargets.indexOf(startLineTarget);
    const endIndex = lineTargets.indexOf(endLineTarget);
    if (startIndex < 0 || endIndex < 0) {
      return;
    }
    const [fromIndex, toIndex] =
      startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const firstTarget = lineTargets[fromIndex] ?? null;
    const lastTarget = lineTargets[toIndex] ?? null;
    if (!firstTarget || !lastTarget) {
      return;
    }

    const expandedRange = document.createRange();
    expandedRange.setStartBefore(firstTarget);
    expandedRange.setEndAfter(lastTarget);
    selection.removeAllRanges();
    selection.addRange(expandedRange);
  }

  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const payload = buildPreviewClipboardPayload(selection, {
      stripNumbers: stripNumbersEnabled,
      stripLabels: stripLabelsEnabled,
    });
    if (!payload) {
      return;
    }

    logClipboardPayload(payload, 'manual');
    event.preventDefault();
    event.clipboardData?.setData('text/plain', payload.plain);
    if (payload.html) {
      event.clipboardData?.setData('text/html', payload.html);
    }
    void writePreviewClipboard(payload);
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    onMouseFocus?.();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

  function handleMouseUp() {
    expandSelectionToLineTargets();
    onSelectedLineChange?.(readPreviewSelection(containerRef.current));
    if (!autoCopyEnabled) {
      return;
    }
    if (autoCopyScheduleRef.current !== null) {
      window.clearTimeout(autoCopyScheduleRef.current);
    }
    autoCopyScheduleRef.current = window.setTimeout(() => {
      autoCopyScheduleRef.current = null;
      void copyCurrentSelection(true);
    }, 32);
  }

  useEffect(() => {
    function updateSelectionState() {
      const selection = window.getSelection();
      if (selection && !selectionBelongsToPreview(selection)) {
        return;
      }
      const nextSelection = readPreviewSelection(containerRef.current);
      if (nextSelection) {
        onSelectedLineChange?.(nextSelection);
      }
    }

    document.addEventListener('selectionchange', updateSelectionState);
    return () => document.removeEventListener('selectionchange', updateSelectionState);
  }, [onSelectedLineChange]);

  return (
    <>
      <div
        ref={containerRef}
        className={`preview-pane react-markdown-pane ${selectionMode === 'line' ? 'preview-pane-line-mode' : ''} ${autoWrap ? '' : 'preview-pane-nowrap'}`.trim()}
        style={{ userSelect: 'text' }}
        onMouseDown={onMouseFocus}
        onWheel={onMouseFocus}
        onMouseUp={handleMouseUp}
        onCopy={handleCopy}
        onContextMenu={handleContextMenu}
      >
        {markdownText.trim() ? (
          <PreviewMarkdownContent
            markdownText={markdownText}
            documentPath={documentPath}
            headingLines={headingLines}
            hideLabels={stripLabelsEnabled}
          />
        ) : (
          <div className="empty-stage">미리볼 내용이 없습니다.</div>
        )}
      </div>
      {hierarchyPopoverItem && hierarchyPopoverPosition ? (
        <HierarchyReviewPopover
          item={hierarchyPopoverItem}
          top={hierarchyPopoverPosition.top}
          left={hierarchyPopoverPosition.left}
          documentText={markdownText}
          selectedRange={hierarchyPopoverSelectedRange}
          onApprove={(finalLabel) => onApproveHierarchyPopover?.(hierarchyPopoverItem, finalLabel)}
          onReject={() => onRejectHierarchyPopover?.(hierarchyPopoverItem)}
          onClose={() => onCloseHierarchyPopover?.()}
        />
      ) : null}
      {contextMenu ? (
        <PreviewContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          autoCopy={autoCopyEnabled}
          stripNumbers={stripNumbersEnabled}
          stripLabels={stripLabelsEnabled}
          onCopy={() => {
            void copyCurrentSelection();
            setContextMenu(null);
          }}
          onToggleAutoCopy={() => setAutoCopyEnabled((value) => !value)}
          onToggleStripNumbers={() => setStripNumbersEnabled((value) => !value)}
          onToggleStripLabels={() => setStripLabelsEnabled((value) => !value)}
        />
      ) : null}
      <div className={`preview-copy-toast ${autoCopyToastVisible ? 'visible' : ''}`} role="status" aria-live="polite">
        클립보드에 저장되었습니다.
      </div>
    </>
  );
}

export const ReactMarkdownPane = memo(
  ReactMarkdownPaneComponent,
  (prev, next) =>
    prev.markdownText === next.markdownText
    && prev.documentPath === next.documentPath
    && prev.autoWrap === next.autoWrap
    && prev.selectionMode === next.selectionMode
    && prev.searchSelection?.lineNumber === next.searchSelection?.lineNumber
    && prev.searchSelection?.start === next.searchSelection?.start
    && prev.searchSelection?.end === next.searchSelection?.end
    && prev.searchSelection?.query === next.searchSelection?.query
    && prev.syncScrollRatio === next.syncScrollRatio
    && prev.scrollRequest?.token === next.scrollRequest?.token
    && prev.scrollRequest?.line === next.scrollRequest?.line
    && prev.scrollRequest?.target === next.scrollRequest?.target
    && prev.onSelectedLineChange === next.onSelectedLineChange
    && prev.hierarchyPopoverSelectedRange?.line === next.hierarchyPopoverSelectedRange?.line
    && prev.hierarchyPopoverSelectedRange?.endLine === next.hierarchyPopoverSelectedRange?.endLine
    && prev.hierarchyPopoverSelectedRange?.selectedText === next.hierarchyPopoverSelectedRange?.selectedText
    && prev.hierarchyPopoverItem?.id === next.hierarchyPopoverItem?.id,
);

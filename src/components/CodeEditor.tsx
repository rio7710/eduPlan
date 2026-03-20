import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { html as htmlLang } from '@codemirror/lang-html';
import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import { redo, undo } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { getHeadingSections } from '@/lib/headingSections';

interface CodeEditorProps {
  mode: 'markdown' | 'html';
  value: string;
  documentPath?: string | null;
  documentName?: string | null;
  themeMode?: 'dark' | 'light';
  autoWrap?: boolean;
  active?: boolean;
  scrollRequest?: { line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number; target?: 'Edit' | 'View' | 'Both' } | null;
  selectionRequest?: { line: number; token: number } | null;
  collapsedHeadingLines?: number[];
  onActiveLineChange?: (line: number | null) => void;
  onEditorInteraction?: () => void;
  onMouseFocus?: () => void;
  onScrollRatioChange?: (ratio: number) => void;
  syncScrollRatio?: number | null;
  onSelectionRequestApplied?: () => void;
  onLocationTrigger?: (kind: 'scroll' | 'keyboard') => void;
  onChange: (value: string) => void;
}

export function CodeEditor({
  mode,
  value,
  documentPath = null,
  documentName = null,
  themeMode = 'dark',
  autoWrap = true,
  active = true,
  scrollRequest = null,
  selectionRequest = null,
  collapsedHeadingLines = [],
  onActiveLineChange,
  onEditorInteraction,
  onMouseFocus,
  onScrollRatioChange,
  syncScrollRatio = null,
  onSelectionRequestApplied,
  onLocationTrigger,
  onChange,
}: CodeEditorProps) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const lastReportedLineRef = useRef<number | null>(null);
  const lastLoggedAtRef = useRef(0);
  const suppressScrollEmitRef = useRef(false);
  const lastEmittedScrollRatioRef = useRef(-1);
  const pendingScrollRatioRef = useRef<number | null>(null);
  const scrollEmitRafRef = useRef<number | null>(null);
  const reportEditorInteraction = useEffectEvent(() => {
    onEditorInteraction?.();
  });
  const reportActiveLine = useEffectEvent((lineNumber: number | null) => {
    if (lastReportedLineRef.current === lineNumber) {
      return;
    }
    lastReportedLineRef.current = lineNumber;
    onActiveLineChange?.(lineNumber);
  });

  function findScrollableAncestor(element: HTMLElement | null) {
    let cursor = element?.parentElement ?? null;
    while (cursor) {
      const style = window.getComputedStyle(cursor);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);
      if (canScrollY && cursor.scrollHeight > cursor.clientHeight + 2) {
        return cursor;
      }
      cursor = cursor.parentElement;
    }
    return null;
  }

  function resolveTopVisibleLine(view: EditorView, scroller: HTMLElement, outerScrollTarget?: HTMLElement | null) {
    const topLineBlock = view.lineBlockAtHeight(scroller.scrollTop + 1);
    const scrollerLine = view.state.doc.lineAt(topLineBlock.from).number;
    if (scroller.scrollTop > 0) {
      return { line: scrollerLine, source: 'cm-scroller' as const };
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const outerRect = outerScrollTarget?.getBoundingClientRect() ?? null;
    const visibleTop = outerRect ? Math.max(scrollerRect.top, outerRect.top) : scrollerRect.top;
    const visibleBottom = outerRect ? Math.min(scrollerRect.bottom, outerRect.bottom) : scrollerRect.bottom;
    const probeX = Math.round(scrollerRect.left + Math.min(Math.max(scrollerRect.width * 0.2, 28), 120));
    const probeY = Math.round(Math.min(visibleBottom - 4, visibleTop + 18));
    const pos = view.posAtCoords({ x: probeX, y: probeY });
    if (pos !== null) {
      return { line: view.state.doc.lineAt(pos).number, source: 'viewport-probe' as const };
    }

    return { line: scrollerLine, source: 'cm-scroller' as const };
  }

  const lineChangeListener = useMemo(() => {
    return EditorView.updateListener.of((update) => {
      if (update.viewportChanged) {
        const scroller = update.view.scrollDOM;
        const outer = findScrollableAncestor(scroller);
        const top = resolveTopVisibleLine(update.view, scroller, outer);
        reportActiveLine(top.line);
      }

      if (update.docChanged) {
        const now = Date.now();
        if (now - lastLoggedAtRef.current > 80) {
          const monitorPayload = buildJsMonitorPayload({
            mode,
            documentPath,
            documentName,
            update,
          });
          if (monitorPayload) {
            lastLoggedAtRef.current = now;
          }
        }
      }

      if (!update.view.hasFocus || !update.selectionSet) {
        return;
      }
      reportEditorInteraction();
      const lineNumber = update.state.doc.lineAt(update.state.selection.main.head).number;
      reportActiveLine(lineNumber);
    });
  }, [documentName, documentPath, mode, reportActiveLine, reportEditorInteraction]);

  const extensions = useMemo(() => {
    return [
      mode === 'markdown' ? markdown() : htmlLang(),
      ...(autoWrap ? [EditorView.lineWrapping] : []),
      lineChangeListener,
    ];
  }, [autoWrap, lineChangeListener, mode]);

  const basicSetup = useMemo(() => ({
    lineNumbers: true,
    foldGutter: true,
    drawSelection: true,
    highlightActiveLine: true,
    highlightActiveLineGutter: true,
    bracketMatching: true,
  }), []);

  useEffect(() => {
    if (!editorView || !active) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      editorView.requestMeasure();
    });

    return () => cancelAnimationFrame(frame);
  }, [editorView, active, value]);

  useEffect(() => {
    if (!editorView || !active) {
      return;
    }

    const dom = editorView.dom;
    const scroller = editorView.scrollDOM;
    const outerScrollTarget = findScrollableAncestor(scroller);
    const handleEditorInteraction = () => {
      reportEditorInteraction();
    };
    const handleKeyTrigger = () => {
      onLocationTrigger?.('keyboard');
    };
    const handleMouseFocus = () => {
      onMouseFocus?.();
      reportEditorInteraction();
    };
    const handleWheelFocus = () => {
      onMouseFocus?.();
      reportEditorInteraction();
      window.requestAnimationFrame(() => {
        const top = resolveTopVisibleLine(editorView, scroller, outerScrollTarget);
        reportActiveLine(top.line);
      });
      onLocationTrigger?.('scroll');
    };
    const handleScroll = () => {
      const top = resolveTopVisibleLine(editorView, scroller, outerScrollTarget);
      reportActiveLine(top.line);
      onLocationTrigger?.('scroll');

      if (suppressScrollEmitRef.current) {
        return;
      }
      const max = scroller.scrollHeight - scroller.clientHeight;
      const ratio = max > 0 ? scroller.scrollTop / max : 0;
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

    dom.addEventListener('focusin', handleEditorInteraction);
    dom.addEventListener('keydown', handleEditorInteraction, true);
    dom.addEventListener('keydown', handleKeyTrigger, true);
    dom.addEventListener('mousedown', handleMouseFocus, true);
    dom.addEventListener('wheel', handleWheelFocus, { passive: true });
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    outerScrollTarget?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      dom.removeEventListener('focusin', handleEditorInteraction);
      dom.removeEventListener('keydown', handleEditorInteraction, true);
      dom.removeEventListener('keydown', handleKeyTrigger, true);
      dom.removeEventListener('mousedown', handleMouseFocus, true);
      dom.removeEventListener('wheel', handleWheelFocus);
      scroller.removeEventListener('scroll', handleScroll);
      outerScrollTarget?.removeEventListener('scroll', handleScroll);
      if (scrollEmitRafRef.current !== null) {
        window.cancelAnimationFrame(scrollEmitRafRef.current);
        scrollEmitRafRef.current = null;
      }
    };
  }, [active, editorView, onLocationTrigger, onMouseFocus, onScrollRatioChange, reportEditorInteraction]);

  useEffect(() => {
    if (!editorView || syncScrollRatio === null || Number.isNaN(syncScrollRatio)) {
      return;
    }
    const scroller = editorView.scrollDOM;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const clamped = Math.max(0, Math.min(1, syncScrollRatio));
    const currentRatio = max > 0 ? scroller.scrollTop / max : 0;
    if (Math.abs(currentRatio - clamped) < 0.008) {
      return;
    }
    suppressScrollEmitRef.current = true;
    scroller.scrollTop = max > 0 ? max * clamped : 0;
    const timer = window.setTimeout(() => {
      suppressScrollEmitRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editorView, syncScrollRatio]);

  useEffect(() => {
    if (!editorView || !active) {
      return;
    }

    const handleEditorCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ command?: 'undo' | 'redo' }>).detail;
      if (!detail?.command) {
        return;
      }

      if (detail.command === 'undo') {
        undo(editorView);
        return;
      }
      if (detail.command === 'redo') {
        redo(editorView);
      }
    };

    window.addEventListener('edufixer-editor-command', handleEditorCommand as EventListener);
    return () => {
      window.removeEventListener('edufixer-editor-command', handleEditorCommand as EventListener);
    };
  }, [active, editorView]);

  useEffect(() => {
    if (!editorView || !scrollRequest) {
      return;
    }

    const line = editorView.state.doc.line(Math.min(scrollRequest.line, editorView.state.doc.lines));
    const endLineNumber = Math.min(scrollRequest.endLine ?? scrollRequest.line, editorView.state.doc.lines);
    const endLine = editorView.state.doc.line(endLineNumber);
    const hasExplicitSelection =
      typeof scrollRequest.startColumn === 'number' || typeof scrollRequest.endColumn === 'number';
    const anchor = Math.min(line.from + (scrollRequest.startColumn ?? 0), line.to);
    const head =
      endLineNumber === line.number
        ? Math.min(line.from + (scrollRequest.endColumn ?? scrollRequest.startColumn ?? 0), line.to)
        : endLine.to;

    if (hasExplicitSelection) {
      editorView.dispatch({
        selection: { anchor, head },
        effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 0 }),
      });
    } else {
      editorView.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 0 }),
      });
    }
    reportActiveLine(line.number);
  }, [editorView, reportActiveLine, scrollRequest]);

  useEffect(() => {
    if (!editorView || !selectionRequest) {
      return;
    }
    const line = editorView.state.doc.line(Math.min(selectionRequest.line, editorView.state.doc.lines));
    editorView.dispatch({
      selection: { anchor: line.from, head: line.from },
    });
    reportActiveLine(line.number);
    onSelectionRequestApplied?.();
  }, [editorView, onSelectionRequestApplied, reportActiveLine, selectionRequest]);

  useEffect(() => {
    if (!editorView || mode !== 'markdown') {
      return;
    }

    const sections = getHeadingSections(value);
    const desiredRanges = sections
      .filter((section) => collapsedHeadingLines.includes(section.lineNumber) && section.endLine > section.lineNumber)
      .map((section) => {
        const fromLine = editorView.state.doc.line(Math.min(section.lineNumber, editorView.state.doc.lines));
        const toLine = editorView.state.doc.line(Math.min(section.endLine, editorView.state.doc.lines));
        return { from: fromLine.to, to: toLine.to };
      })
      .filter((range) => range.to > range.from);

    const currentRanges: Array<{ from: number; to: number }> = [];
    foldedRanges(editorView.state).between(0, editorView.state.doc.length, (from, to) => {
      currentRanges.push({ from, to });
    });

    const effects = [
      ...currentRanges
        .filter((range) => !desiredRanges.some((target) => target.from === range.from && target.to === range.to))
        .map((range) => unfoldEffect.of(range)),
      ...desiredRanges
        .filter((range) => !currentRanges.some((current) => current.from === range.from && current.to === range.to))
        .map((range) => foldEffect.of(range)),
    ];

    if (effects.length) {
      editorView.dispatch({ effects });
    }
  }, [collapsedHeadingLines, editorView, mode, value]);

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={themeMode === 'dark' ? oneDark : undefined}
      onCreateEditor={setEditorView}
      extensions={extensions}
      basicSetup={basicSetup}
      onChange={onChange}
    />
  );
}

function buildJsMonitorPayload({
  mode,
  documentPath,
  documentName,
  update,
}: {
  mode: 'markdown' | 'html';
  documentPath: string | null;
  documentName: string | null;
  update: Parameters<NonNullable<typeof EditorView.updateListener.of>>[0] extends never ? never : any;
}) {
  if (!isUserEditUpdate(update)) {
    return null;
  }

  const changes: Array<{
    fromLine: number;
    toLine: number;
    insertedToLine: number;
    changeKind: 'insert' | 'delete' | 'replace' | 'merge' | 'split';
    beforeText: string;
    afterText: string;
    beforePreview: string;
    afterPreview: string;
    leftContext: string;
    rightContext: string;
    blankLineOnly: boolean;
    looksLikeHierarchy: boolean;
    headingMarkerAdded: boolean;
    headingMarkerRemoved: boolean;
  }> = [];

  update.changes.iterChanges((fromA: number, toA: number, _fromB: number, toB: number, inserted: { toString: () => string }) => {
    const beforeText = update.startState.doc.sliceString(fromA, toA);
    const afterText = inserted.toString();
    const fromLine = update.startState.doc.lineAt(Math.max(0, Math.min(fromA, update.startState.doc.length))).number;
    const toLine = update.startState.doc.lineAt(Math.max(0, Math.min(Math.max(fromA, toA), update.startState.doc.length))).number;
    const insertedToLine = update.state.doc.lineAt(Math.max(0, Math.min(Math.max(_fromB, toB), update.state.doc.length))).number;
    const leftContext = sliceContextWords(update.startState.doc.sliceString(Math.max(0, fromA - 80), fromA), false);
    const rightContext = sliceContextWords(update.state.doc.sliceString(toB, Math.min(update.state.doc.length, toB + 80)), true);
    const beforeTrimmed = beforeText.trim();
    const afterTrimmed = afterText.trim();
    const blankLineOnly = isBlankLike(beforeText) && isBlankLike(afterText);
    const mergeByLineJoin = beforeText.includes('\n') && afterText === '';
    const splitByLineBreak = beforeText === '' && afterText.includes('\n');
    const changeKind = mergeByLineJoin
      ? 'merge'
      : splitByLineBreak
        ? 'split'
        : beforeTrimmed && !afterTrimmed
      ? 'delete'
      : !beforeTrimmed && afterTrimmed
        ? 'insert'
        : 'replace';
    const headingMarkerAdded = !beforeTrimmed.startsWith('#') && afterTrimmed.startsWith('#');
    const headingMarkerRemoved = beforeTrimmed.startsWith('#') && !afterTrimmed.startsWith('#');
    const looksLikeHierarchy = headingMarkerAdded
      || headingMarkerRemoved
      || /^(#{1,6}\s+|\[[^\]]+\]|\d+\)|\(\d+\)|[①-⑳]\s+|[-*+]\s+)/.test(afterTrimmed || beforeTrimmed);

    if (blankLineOnly && !mergeByLineJoin && !splitByLineBreak) {
      return;
    }

    changes.push({
      fromLine,
      toLine,
      insertedToLine,
      changeKind,
      beforeText: clipLoggedText(beforeText),
      afterText: clipLoggedText(afterText),
      beforePreview: clipLoggedText(beforeTrimmed || '[empty]', 160),
      afterPreview: clipLoggedText(afterTrimmed || '[empty]', 160),
      leftContext,
      rightContext,
      blankLineOnly,
      looksLikeHierarchy,
      headingMarkerAdded,
      headingMarkerRemoved,
    });
  });

  if (!changes.length) {
    return null;
  }

  const primary = changes[0];
  return {
    task_type: 'editor_change_monitor',
    source: 'js',
    mode,
    document_path: documentPath ?? '',
    document_name: documentName ?? '',
    timestamp: new Date().toISOString(),
    recommendation_hint: primary.looksLikeHierarchy ? 'hierarchy_candidate' : 'sentence_candidate',
    changes,
  };
}

function isUserEditUpdate(update: any) {
  if (!update?.docChanged || !update?.view?.hasFocus) {
    return false;
  }

  const changeSetLength = Number(update.changes?.length ?? 0);
  const docLength = Number(update.state?.doc?.length ?? 0);
  if (docLength > 0 && changeSetLength > docLength * 0.6) {
    return false;
  }

  const transactions = Array.isArray(update?.transactions) ? update.transactions : [];
  if (!transactions.length) {
    return true;
  }

  return transactions.some((transaction: any) =>
    transaction.isUserEvent?.('input')
    || transaction.isUserEvent?.('delete')
    || transaction.isUserEvent?.('undo')
    || transaction.isUserEvent?.('redo')
    || transaction.isUserEvent?.('paste')
    || transaction.isUserEvent?.('cut'),
  );
}

function isBlankLike(value: string) {
  return String(value || '').replace(/\s+/g, '') === '';
}

function sliceContextWords(value: string, fromStart: boolean) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return '';
  }
  return fromStart ? words.slice(0, 5).join(' ') : words.slice(-5).join(' ');
}

function clipLoggedText(value: string, maxLength = 400) {
  const text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...[${text.length - maxLength} more chars]`;
}

import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { html as htmlLang } from '@codemirror/lang-html';
import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { getHeadingSections } from '@/lib/headingSections';

interface CodeEditorProps {
  mode: 'markdown' | 'html';
  value: string;
  themeMode?: 'dark' | 'light';
  autoWrap?: boolean;
  active?: boolean;
  scrollRequest?: { line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number } | null;
  collapsedHeadingLines?: number[];
  onActiveLineChange?: (line: number | null) => void;
  onChange: (value: string) => void;
}

export function CodeEditor({
  mode,
  value,
  themeMode = 'dark',
  autoWrap = true,
  active = true,
  scrollRequest = null,
  collapsedHeadingLines = [],
  onActiveLineChange,
  onChange,
}: CodeEditorProps) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const lastReportedLineRef = useRef<number | null>(null);
  const reportActiveLine = useEffectEvent((lineNumber: number | null) => {
    if (lastReportedLineRef.current === lineNumber) {
      return;
    }
    lastReportedLineRef.current = lineNumber;
    onActiveLineChange?.(lineNumber);
  });

  const lineChangeListener = useMemo(() => {
    return EditorView.updateListener.of((update) => {
      if (!update.view.hasFocus || !update.selectionSet) {
        return;
      }
      const lineNumber = update.state.doc.lineAt(update.state.selection.main.head).number;
      reportActiveLine(lineNumber);
    });
  }, [reportActiveLine]);

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
    highlightActiveLine: true,
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
    if (!editorView || !scrollRequest) {
      return;
    }

    const line = editorView.state.doc.line(Math.min(scrollRequest.line, editorView.state.doc.lines));
    const endLineNumber = Math.min(scrollRequest.endLine ?? scrollRequest.line, editorView.state.doc.lines);
    const endLine = editorView.state.doc.line(endLineNumber);
    const anchor = Math.min(line.from + (scrollRequest.startColumn ?? 0), line.to);
    const head =
      endLineNumber === line.number
        ? Math.min(line.from + (scrollRequest.endColumn ?? scrollRequest.startColumn ?? 0), line.to)
        : endLine.to;
    editorView.dispatch({
      selection: { anchor, head },
      effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 0 }),
    });
    reportActiveLine(line.number);
    editorView.focus();
  }, [editorView, reportActiveLine, scrollRequest]);

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

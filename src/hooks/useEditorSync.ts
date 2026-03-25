import { useRef, useState } from 'react';
import { getCollapsedHeadingOwnerLine } from '@/lib/headingSections';
import {
  normalizeLine,
  type EditorMode,
  type EditorSyncViewId,
  type LocationSurface,
  type ScrollRequest,
  type ScrollRequestTarget,
  type SelectedPreviewLine,
  type SelectionRequest,
  type SplitSurface,
} from './useEditorSync.types';
import { useEditorSyncEffects } from './useEditorSync.effects';
import { applyEditorModeTransition } from './useEditorSync.mode';
export type { EditorMode } from './useEditorSync.types';

type UseEditorSyncOptions = {
  activeView: EditorSyncViewId;
  currentDocument: ShellDocument | null;
};

export function useEditorSync({ activeView, currentDocument }: UseEditorSyncOptions) {
  const [editorMode, setEditorMode] = useState<EditorMode>('render');
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);
  const [selectionRequest, setSelectionRequest] = useState<SelectionRequest | null>(null);
  const [selectedPreviewLine, setSelectedPreviewLine] = useState<SelectedPreviewLine | null>(null);
  const [locationSurface, setLocationSurface] = useState<LocationSurface>('Render');
  const [currentEditorLine, setCurrentEditorLine] = useState<number | null>(null);
  const [currentPreviewLine, setCurrentPreviewLine] = useState<number | null>(null);
  const [currentRenderLocationLine, setCurrentRenderLocationLine] = useState<number | null>(null);
  const [currentRenderMenuLine, setCurrentRenderMenuLine] = useState<number | null>(null);
  const [renderSyncMode, setRenderSyncMode] = useState<'sync' | 'async'>('sync');
  const [collapsedHeadingLines, setCollapsedHeadingLines] = useState<number[]>([]);
  const splitSyncKeyRef = useRef<string>('');
  const locationTriggerRef = useRef<{ surface: SplitSurface; kind: 'scroll' | 'keyboard'; at: number } | null>(null);
  const splitStoredLinesRef = useRef<{ editorLine: number; previewLine: number }>({ editorLine: 1, previewLine: 1 });
  const splitStoreSignalRef = useRef<{ surface: SplitSurface; at: number } | null>(null);
  const renderSyncFrameRef = useRef<number | null>(null);

  function resolveLine(...candidates: Array<number | null | undefined>) {
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
        return normalizeLine(candidate);
      }
    }
    return 1;
  }

  function resolveSurfaceLine(surface: SplitSurface) {
    if (surface === 'Edit') {
      return resolveLine(currentEditorLine, splitStoredLinesRef.current.editorLine, currentPreviewLine);
    }
    return resolveLine(currentPreviewLine, splitStoredLinesRef.current.previewLine, currentEditorLine);
  }

  function resolveMenuLineFromSurface(surface: SplitSurface) {
    const base = resolveSurfaceLine(surface);
    const owner = getCollapsedHeadingOwnerLine(currentDocument?.content ?? '', base, collapsedHeadingLines);
    return resolveLine(owner, base);
  }

  function issueScrollSyncRequest(payload: {
    target: ScrollRequestTarget;
    line: number;
    editorLine?: number;
    previewLine?: number;
    startColumn?: number;
    endColumn?: number;
  }) {
    setScrollRequest({
      line: payload.line,
      token: Date.now() + Math.random(),
      target: payload.target,
      editorLine: payload.editorLine,
      previewLine: payload.previewLine,
      startColumn: payload.startColumn,
      endColumn: payload.endColumn,
    });
  }

  function changeEditorMode(nextMode: EditorMode) {
    applyEditorModeTransition({
      currentMode: editorMode,
      nextMode,
      resolveMenuLineFromSurface,
      splitStoredLinesRef,
      setCurrentPreviewLine,
      setCurrentEditorLine,
      issueScrollSyncRequest,
    });
    setEditorMode(nextMode);
  }

  function resetForOpenedDocument(initialLine: number) {
    const normalizedLine = normalizeLine(initialLine);
    setCollapsedHeadingLines([]);
    setScrollRequest({ line: normalizedLine, token: Date.now() + Math.random() });
    setSelectionRequest(null);
    setSelectedPreviewLine(null);
    setCurrentEditorLine(normalizedLine);
    setCurrentPreviewLine(normalizedLine);
    setCurrentRenderLocationLine(normalizedLine);
    setCurrentRenderMenuLine(normalizedLine);
    splitStoredLinesRef.current = { editorLine: normalizedLine, previewLine: normalizedLine };
  }

  useEditorSyncEffects({
    activeView,
    currentDocument,
    editorMode,
    locationSurface,
    currentEditorLine,
    currentPreviewLine,
    scrollRequest,
    selectionRequest,
    splitSyncKeyRef,
    locationTriggerRef,
    splitStoreSignalRef,
    splitStoredLinesRef,
    renderSyncFrameRef,
    resolveMenuLineFromSurface,
    setLocationSurface,
    setScrollRequest,
    setSelectionRequest,
  });

  return {
    changeEditorMode,
    collapsedHeadingLines,
    currentEditorLine,
    currentPreviewLine,
    currentRenderLocationLine,
    currentRenderMenuLine,
    editorMode,
    locationSurface,
    renderSyncMode,
    resetForOpenedDocument,
    scrollRequest,
    selectedPreviewLine,
    selectionRequest,
    setCollapsedHeadingLines,
    setCurrentEditorLine,
    setCurrentPreviewLine,
    setCurrentRenderLocationLine,
    setCurrentRenderMenuLine,
    setEditorMode,
    setLocationSurface,
    setRenderSyncMode,
    setSelectedPreviewLine,
    setSelectionRequest,
    setScrollRequest,
    splitStoredLinesRef,
    onEditorLocationTrigger: (kind: 'scroll' | 'keyboard') => {
      locationTriggerRef.current = { surface: 'Edit', kind, at: Date.now() };
      splitStoreSignalRef.current = { surface: 'Edit', at: Date.now() };
    },
    onPreviewLocationTrigger: (kind: 'scroll' | 'keyboard') => {
      locationTriggerRef.current = { surface: 'Render', kind, at: Date.now() };
      splitStoreSignalRef.current = { surface: 'Render', at: Date.now() };
    },
    onRenderActiveLineChange: (line: number | null) => {
      if (line === null) {
        return;
      }
      if (renderSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(renderSyncFrameRef.current);
        renderSyncFrameRef.current = null;
      }

      const applyRenderLine = () => {
        setCurrentRenderLocationLine((current) => (current === line ? current : line));
        setCurrentRenderMenuLine((current) => (current === line ? current : line));
      };

      if (renderSyncMode === 'async') {
        renderSyncFrameRef.current = window.requestAnimationFrame(() => {
          renderSyncFrameRef.current = null;
          applyRenderLine();
        });
        return;
      }

      applyRenderLine();
    },
    handleLocationSurfaceChange: (next: LocationSurface) => {
      setLocationSurface((current) => (current === next ? current : next));
    },
    toggleRenderSyncMode: () => {
      setRenderSyncMode((current) => (current === 'sync' ? 'async' : 'sync'));
    },
  };
}

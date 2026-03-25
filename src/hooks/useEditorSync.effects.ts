import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { normalizeLine, type EditorMode, type LocationSurface, type ScrollRequest, type SelectionRequest, type SplitSurface } from './useEditorSync.types';

type UseEditorSyncEffectsOptions = {
  activeView: 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings';
  currentDocument: ShellDocument | null;
  editorMode: EditorMode;
  locationSurface: LocationSurface;
  currentEditorLine: number | null;
  currentPreviewLine: number | null;
  scrollRequest: ScrollRequest | null;
  selectionRequest: SelectionRequest | null;
  splitSyncKeyRef: MutableRefObject<string>;
  locationTriggerRef: MutableRefObject<{ surface: SplitSurface; kind: 'scroll' | 'keyboard'; at: number } | null>;
  splitStoreSignalRef: MutableRefObject<{ surface: SplitSurface; at: number } | null>;
  splitStoredLinesRef: MutableRefObject<{ editorLine: number; previewLine: number }>;
  renderSyncFrameRef: MutableRefObject<number | null>;
  resolveMenuLineFromSurface: (surface: SplitSurface) => number;
  setLocationSurface: Dispatch<SetStateAction<LocationSurface>>;
  setScrollRequest: Dispatch<SetStateAction<ScrollRequest | null>>;
  setSelectionRequest: Dispatch<SetStateAction<SelectionRequest | null>>;
};

export function useEditorSyncEffects({
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
}: UseEditorSyncEffectsOptions) {
  useEffect(() => {
    return () => {
      if (renderSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(renderSyncFrameRef.current);
      }
    };
  }, [renderSyncFrameRef]);

  useEffect(() => {
    if (!scrollRequest) {
      return;
    }

    const token = scrollRequest.token;
    const timer = window.setTimeout(() => {
      setScrollRequest((current) => (current?.token === token ? null : current));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [scrollRequest, setScrollRequest]);

  useEffect(() => {
    if (!selectionRequest) {
      return;
    }

    const token = selectionRequest.token;
    const timer = window.setTimeout(() => {
      setSelectionRequest((current) => (current?.token === token ? null : current));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectionRequest, setSelectionRequest]);

  useEffect(() => {
    if (activeView !== 'editor' || editorMode !== 'split' || !currentDocument) {
      splitSyncKeyRef.current = '';
      return;
    }

    if (locationSurface !== 'Edit' && locationSurface !== 'Render') {
      return;
    }

    const trigger = locationTriggerRef.current;
    if (!trigger || trigger.surface !== locationSurface || Date.now() - trigger.at > 500) {
      return;
    }

    const sourceLine = resolveMenuLineFromSurface(locationSurface);
    if (!sourceLine || Number.isNaN(sourceLine)) {
      return;
    }

    const syncKey = `${currentDocument.id}:${locationSurface}:${sourceLine}`;
    if (splitSyncKeyRef.current === syncKey) {
      return;
    }
    splitSyncKeyRef.current = syncKey;
    setScrollRequest({
      line: sourceLine,
      token: Date.now() + Math.random(),
      target: locationSurface === 'Render' ? 'Edit' : 'Render',
    });
    locationTriggerRef.current = null;
  }, [
    activeView,
    currentDocument,
    currentEditorLine,
    currentPreviewLine,
    editorMode,
    locationSurface,
    locationTriggerRef,
    resolveMenuLineFromSurface,
    setScrollRequest,
    splitSyncKeyRef,
  ]);

  useEffect(() => {
    const signal = splitStoreSignalRef.current;
    if (!signal || Date.now() - signal.at > 700) {
      return;
    }
    if (signal.surface === 'Edit' && currentEditorLine) {
      splitStoredLinesRef.current.editorLine = normalizeLine(currentEditorLine);
      splitStoreSignalRef.current = null;
      return;
    }
    if (signal.surface === 'Render' && currentPreviewLine) {
      splitStoredLinesRef.current.previewLine = normalizeLine(currentPreviewLine);
      splitStoreSignalRef.current = null;
    }
  }, [currentEditorLine, currentPreviewLine, splitStoreSignalRef, splitStoredLinesRef]);

  useEffect(() => {
    if (editorMode === 'render') {
      setLocationSurface((current) => (current === 'Render' ? current : 'Render'));
      return;
    }
    if (editorMode === 'markdown' || editorMode === 'html' || editorMode === 'wysiwyg') {
      setLocationSurface((current) => (current === 'Edit' ? current : 'Edit'));
    }
  }, [editorMode, setLocationSurface]);
}

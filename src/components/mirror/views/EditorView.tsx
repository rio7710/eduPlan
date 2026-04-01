import type { EditorMode, PreviewSelectionMode } from '@/App';
import type { FocusOwner } from '@/lib/focusSync';
import TurndownService from 'turndown';
import { memo, useMemo, useState } from 'react';
import { CodeEditor } from '@/components/CodeEditor';
import { LocationBar } from '@/components/mirror/editor/LocationBar';
import { ModeToggleBar } from '@/components/mirror/editor/ModeToggleBar';
import { ReactMarkdownPane } from '@/components/ReactMarkdownPane';
import { WysiwygPane } from '@/components/WysiwygPane';
import { marked } from 'marked';

type Props = {
  editorMode: EditorMode;
  onChangeMode: (mode: EditorMode) => void;
  autoWrap: boolean;
  onToggleAutoWrap: () => void;
  previewSelectionMode: PreviewSelectionMode;
  onChangePreviewSelectionMode: (mode: PreviewSelectionMode) => void;
  locationSurface?: 'Edit' | 'Render' | 'Menu' | null;
  onLocationSurfaceChange?: (surface: 'Edit' | 'Render' | 'Menu' | null) => void;
  document: ShellDocument | null;
  theme: 'dark' | 'light';
  activeLine?: number | null;
  renderLocationLine?: number | null;
  scrollRequest?: { line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number; target?: 'Edit' | 'Render' | 'Both'; editorLine?: number; previewLine?: number } | null;
  selectionRequest?: { line: number; token: number } | null;
  onSelectionRequestApplied?: () => void;
  selectedPreviewLine?: { line: number; endLine?: number; activeLine?: number; label: string } | null;
  searchSelection?: { lineNumber: number; start: number; end: number; query: string } | null;
  collapsedHeadingLines?: number[];
  onToggleCollapsedHeading?: (lineNumber: number) => void;
  onSelectPreviewLine: (selection: { line: number; endLine?: number; activeLine?: number; label: string } | null) => void;
  onEditorActiveLineChange?: (line: number | null) => void;
  onPreviewActiveLineChange?: (line: number | null) => void;
  onRenderActiveLineChange?: (line: number | null) => void;
  onEditorLocationTrigger?: (kind: 'scroll' | 'keyboard') => void;
  onPreviewLocationTrigger?: (kind: 'scroll' | 'keyboard') => void;
  onPreviewInteraction?: () => void;
  onEditorInteraction?: () => void;
  focusOwner?: FocusOwner;
  splitSyncEnabled?: boolean;
  splitScrollSyncMode?: 'none' | 'preview-to-editor' | 'bidirectional';
  onChangeContent: (content: string) => void;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  actionDisabled?: boolean;
  renderSyncMode?: 'sync' | 'async';
  onToggleRenderSyncMode?: (() => void) | null;
};

const turndown = new TurndownService();

type SplitEditorPaneProps = {
  content: string;
  documentPath: string | null;
  documentName: string | null;
  theme: 'dark' | 'light';
  autoWrap: boolean;
  scrollRequest: Props['scrollRequest'];
  selectionRequest: Props['selectionRequest'];
  searchSelection: Props['searchSelection'];
  onSelectionRequestApplied?: () => void;
  collapsedHeadingLines: number[];
  onEditorActiveLineChange?: (line: number | null) => void;
  onEditorLocationTrigger?: (kind: 'scroll' | 'keyboard') => void;
  onEditorInteraction?: () => void;
  onMouseFocus?: () => void;
  onScrollRatioChange?: (ratio: number) => void;
  syncScrollRatio?: number | null;
  onChangeContent: (content: string) => void;
  onLocationSurfaceChange?: (surface: 'Edit' | 'Render' | 'Menu' | null) => void;
};

type SplitRenderPaneProps = {
  content: string;
  documentPath: string | null;
  autoWrap: boolean;
  selectionMode: PreviewSelectionMode;
  searchSelection: Props['searchSelection'];
  scrollRequest: Props['scrollRequest'];
  onPreviewActiveLineChange?: (line: number | null) => void;
  onPreviewLocationTrigger?: (kind: 'scroll' | 'keyboard') => void;
  onMouseFocus?: () => void;
  onScrollRatioChange?: (ratio: number) => void;
  syncScrollRatio?: number | null;
  onLocationSurfaceChange?: (surface: 'Edit' | 'Render' | 'Menu' | null) => void;
};

const SplitEditorPane = memo(function SplitEditorPane({
  content,
  documentPath,
  documentName,
  theme,
  autoWrap,
  scrollRequest,
  selectionRequest,
  searchSelection,
  onSelectionRequestApplied,
  collapsedHeadingLines,
  onEditorActiveLineChange,
  onEditorLocationTrigger,
  onEditorInteraction,
  onMouseFocus,
  onScrollRatioChange,
  syncScrollRatio = null,
  onChangeContent,
  onLocationSurfaceChange,
}: SplitEditorPaneProps) {
  return (
    <div
      className="editor-split-pane editor-split-pane-editor"
      onMouseDown={() => onLocationSurfaceChange?.('Edit')}
      onMouseEnter={() => onLocationSurfaceChange?.('Edit')}
    >
      <CodeEditor
        mode="markdown"
        value={content}
        documentPath={documentPath}
        documentName={documentName}
        themeMode={theme}
        autoWrap={autoWrap}
        active
        scrollRequest={scrollRequest}
        selectionRequest={selectionRequest}
        searchSelection={searchSelection}
        onSelectionRequestApplied={onSelectionRequestApplied}
        collapsedHeadingLines={collapsedHeadingLines}
        onActiveLineChange={onEditorActiveLineChange}
        onLocationTrigger={onEditorLocationTrigger}
        onEditorInteraction={onEditorInteraction}
        onMouseFocus={onMouseFocus}
        onScrollRatioChange={onScrollRatioChange}
        syncScrollRatio={syncScrollRatio}
        onChange={onChangeContent}
      />
    </div>
  );
}, (prev, next) =>
  prev.content === next.content
  && prev.documentPath === next.documentPath
  && prev.documentName === next.documentName
  && prev.theme === next.theme
  && prev.autoWrap === next.autoWrap
  && prev.syncScrollRatio === next.syncScrollRatio
  && prev.scrollRequest?.token === next.scrollRequest?.token
  && prev.scrollRequest?.line === next.scrollRequest?.line
  && prev.scrollRequest?.target === next.scrollRequest?.target
  && prev.selectionRequest?.token === next.selectionRequest?.token
  && prev.selectionRequest?.line === next.selectionRequest?.line
  && prev.searchSelection?.lineNumber === next.searchSelection?.lineNumber
  && prev.searchSelection?.start === next.searchSelection?.start
  && prev.searchSelection?.end === next.searchSelection?.end
  && prev.searchSelection?.query === next.searchSelection?.query
  && prev.collapsedHeadingLines.length === next.collapsedHeadingLines.length
  && prev.collapsedHeadingLines.every((line, index) => line === next.collapsedHeadingLines[index]),
);

const SplitRenderPane = memo(function SplitRenderPane({
  content,
  documentPath,
  autoWrap,
  selectionMode,
  searchSelection,
  scrollRequest,
  onPreviewActiveLineChange,
  onPreviewLocationTrigger,
  onMouseFocus,
  onScrollRatioChange,
  syncScrollRatio = null,
  onLocationSurfaceChange,
}: SplitRenderPaneProps) {
  return (
    <div
      className="editor-split-pane editor-split-pane-preview"
      onMouseDown={() => onLocationSurfaceChange?.('Render')}
      onMouseEnter={() => onLocationSurfaceChange?.('Render')}
    >
      <ReactMarkdownPane
        markdownText={content}
        documentPath={documentPath}
        autoWrap={autoWrap}
        selectionMode={selectionMode}
        searchSelection={searchSelection}
        scrollRequest={scrollRequest}
        onActiveLineChange={onPreviewActiveLineChange}
        onLocationTrigger={onPreviewLocationTrigger}
        onMouseFocus={onMouseFocus}
        onScrollRatioChange={onScrollRatioChange}
        syncScrollRatio={syncScrollRatio}
      />
    </div>
  );
}, (prev, next) =>
  prev.content === next.content
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
  && prev.scrollRequest?.target === next.scrollRequest?.target,
);

export function EditorView({
  editorMode,
  onChangeMode,
  autoWrap,
  onToggleAutoWrap,
  previewSelectionMode,
  onChangePreviewSelectionMode,
  locationSurface = null,
  onLocationSurfaceChange,
  document,
  theme,
  activeLine = null,
  renderLocationLine = null,
  scrollRequest = null,
  selectionRequest = null,
  onSelectionRequestApplied,
  selectedPreviewLine = null,
  searchSelection = null,
  collapsedHeadingLines = [],
  onToggleCollapsedHeading,
  onSelectPreviewLine,
  onEditorActiveLineChange,
  onPreviewActiveLineChange,
  onRenderActiveLineChange,
  onEditorLocationTrigger,
  onPreviewLocationTrigger,
  onPreviewInteraction,
  onEditorInteraction,
  focusOwner = 'none',
  splitSyncEnabled = true,
  splitScrollSyncMode = 'bidirectional',
  onChangeContent,
  actionLabel = null,
  onAction = null,
  actionDisabled = false,
  renderSyncMode = 'sync',
  onToggleRenderSyncMode = null,
}: Props) {
  const content = document?.content ?? '';
  const htmlContent = useMemo(() => {
    return content ? (marked.parse(content, { async: false }) as string) : '';
  }, [content]);
  const panelWrapperStyle = { display: 'flex', overflow: 'hidden', minHeight: 0, minWidth: 0, flex: 1 } as const;
  const splitLayoutStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
    gridTemplateRows: '1fr',
  } as const;
  const splitDividerStyle = {
    width: '1px',
    height: '100%',
  } as const;
  const [scrollLeader, setScrollLeader] = useState<'editor' | 'render' | null>(null);
  const [editorScrollRatio, setEditorScrollRatio] = useState(0);
  const [previewScrollRatio, setPreviewScrollRatio] = useState(0);
  const suppressPreviewActiveSync = splitSyncEnabled && editorMode === 'split' && focusOwner === 'editor';
  const isSplit = editorMode === 'split';
  const isPreviewToEditorSync = splitScrollSyncMode === 'preview-to-editor';
  const isBidirectionalSync = splitScrollSyncMode === 'bidirectional';
  const editorSyncScrollRatio =
    isSplit && (isPreviewToEditorSync || (isBidirectionalSync && scrollLeader === 'render'))
      ? previewScrollRatio
      : null;
  const previewSyncScrollRatio =
    isSplit && isBidirectionalSync && scrollLeader === 'editor'
      ? editorScrollRatio
      : null;
  const splitEditorScrollRequest =
    scrollRequest?.target === 'Render'
      ? null
      : scrollRequest?.target === 'Both' && typeof scrollRequest.editorLine === 'number'
        ? {
          ...scrollRequest,
          line: scrollRequest.editorLine,
          endLine: scrollRequest.editorLine,
          startColumn: undefined,
          endColumn: undefined,
        }
        : scrollRequest;
  const splitPreviewScrollRequest =
    scrollRequest?.target === 'Edit'
      ? null
      : scrollRequest?.target === 'Both' && typeof scrollRequest.previewLine === 'number'
        ? {
          ...scrollRequest,
          line: scrollRequest.previewLine,
          endLine: scrollRequest.previewLine,
          startColumn: undefined,
          endColumn: undefined,
        }
        : scrollRequest;

  return (
    <>
      <ModeToggleBar
        editorMode={editorMode}
        onChangeMode={onChangeMode}
        autoWrap={autoWrap}
        onToggleAutoWrap={onToggleAutoWrap}
        previewSelectionMode={previewSelectionMode}
        onChangePreviewSelectionMode={onChangePreviewSelectionMode}
        renderSelectionControls={editorMode === 'render' ? (
          <div className="preview-selection-switch render-selection-switch" role="tablist" aria-label="렌더 선택 방식">
            <button
              className={`mode-btn compact ${previewSelectionMode === 'text' ? 'active' : ''}`}
              onClick={() => onChangePreviewSelectionMode('text')}
            >
              문자 선택
            </button>
            <button
              className={`mode-btn compact ${previewSelectionMode === 'line' ? 'active' : ''}`}
              onClick={() => onChangePreviewSelectionMode('line')}
            >
              라인 선택
            </button>
          </div>
        ) : null}
      />
      <LocationBar
        document={document}
        activeLine={editorMode === 'render' ? renderLocationLine : activeLine}
        selectedPreviewLine={null}
        previewBlockCount={0}
        selectionMode={previewSelectionMode}
        surface={locationSurface}
        editorMode={editorMode}
        collapsedHeadingLines={collapsedHeadingLines}
        actionLabel={actionLabel}
        onAction={onAction}
        actionDisabled={actionDisabled}
        renderSyncMode={renderSyncMode}
        onToggleRenderSyncMode={onToggleRenderSyncMode}
      />
      {editorMode === 'wysiwyg' ? (
        <div
          style={panelWrapperStyle}
          onMouseDown={() => onLocationSurfaceChange?.('Edit')}
          onMouseEnter={() => onLocationSurfaceChange?.('Edit')}
        >
          <div className="editor-mode-panel active">
            <WysiwygPane content={content} scrollRequest={scrollRequest} onChange={onChangeContent} />
          </div>
        </div>
      ) : null}
      {editorMode === 'markdown' ? (
        <div
          style={panelWrapperStyle}
          onMouseDown={() => onLocationSurfaceChange?.('Edit')}
          onMouseEnter={() => onLocationSurfaceChange?.('Edit')}
        >
          <div className="editor-mode-panel active">
            <CodeEditor mode="markdown" value={content} documentPath={document?.filePath ?? null} documentName={document?.fileName ?? null} themeMode={theme} autoWrap={autoWrap} active scrollRequest={scrollRequest} selectionRequest={null} searchSelection={searchSelection} onSelectionRequestApplied={onSelectionRequestApplied} collapsedHeadingLines={collapsedHeadingLines} onActiveLineChange={onEditorActiveLineChange} onLocationTrigger={onEditorLocationTrigger} onEditorInteraction={onEditorInteraction} onChange={onChangeContent} />
          </div>
        </div>
      ) : null}
      {editorMode === 'html' ? (
        <div
          style={panelWrapperStyle}
          onMouseDown={() => onLocationSurfaceChange?.('Edit')}
          onMouseEnter={() => onLocationSurfaceChange?.('Edit')}
        >
          <div className="editor-mode-panel active">
            <CodeEditor mode="html" value={htmlContent} documentPath={document?.filePath ?? null} documentName={document?.fileName ?? null} themeMode={theme} autoWrap={autoWrap} active scrollRequest={scrollRequest} selectionRequest={null} onSelectionRequestApplied={onSelectionRequestApplied} onActiveLineChange={onEditorActiveLineChange} onLocationTrigger={onEditorLocationTrigger} onEditorInteraction={onEditorInteraction} onChange={(value) => onChangeContent(turndown.turndown(value))} />
          </div>
        </div>
      ) : null}
      {editorMode === 'render' ? (
        <div
          style={panelWrapperStyle}
          onMouseDown={() => onLocationSurfaceChange?.('Render')}
          onMouseEnter={() => onLocationSurfaceChange?.('Render')}
        >
          <div className="editor-mode-panel active">
            <ReactMarkdownPane
              markdownText={content}
              documentPath={document?.filePath ?? null}
              autoWrap={autoWrap}
              selectionMode={previewSelectionMode}
              searchSelection={searchSelection}
              scrollRequest={scrollRequest}
              onActiveLineChange={onRenderActiveLineChange}
            />
          </div>
        </div>
      ) : null}
      {editorMode === 'split' ? (
        <div style={panelWrapperStyle}>
          <div className="editor-mode-panel active editor-split-layout" style={splitLayoutStyle}>
            <SplitEditorPane
              content={content}
              documentPath={document?.filePath ?? null}
              documentName={document?.fileName ?? null}
              theme={theme}
              autoWrap={autoWrap}
              scrollRequest={splitEditorScrollRequest}
              selectionRequest={selectionRequest}
              searchSelection={searchSelection}
              onSelectionRequestApplied={onSelectionRequestApplied}
              collapsedHeadingLines={collapsedHeadingLines}
              onEditorActiveLineChange={onEditorActiveLineChange}
              onEditorLocationTrigger={onEditorLocationTrigger}
              onEditorInteraction={onEditorInteraction}
              onMouseFocus={isBidirectionalSync ? () => setScrollLeader('editor') : undefined}
              onScrollRatioChange={
                isBidirectionalSync
                  ? (ratio) => {
                    setScrollLeader('editor');
                    setEditorScrollRatio(ratio);
                  }
                  : undefined
              }
              syncScrollRatio={editorSyncScrollRatio}
              onChangeContent={onChangeContent}
              onLocationSurfaceChange={onLocationSurfaceChange}
            />
            <div className="editor-split-divider" aria-hidden="true" style={splitDividerStyle} />
            <SplitRenderPane
              content={content}
              documentPath={document?.filePath ?? null}
              autoWrap={autoWrap}
              selectionMode={previewSelectionMode}
              searchSelection={searchSelection}
              scrollRequest={splitPreviewScrollRequest}
              onPreviewActiveLineChange={onPreviewActiveLineChange}
              onPreviewLocationTrigger={onPreviewLocationTrigger}
              onMouseFocus={() => {
                onPreviewInteraction?.();
                if (isBidirectionalSync) {
                  setScrollLeader('render');
                }
              }}
              onScrollRatioChange={
                isPreviewToEditorSync || isBidirectionalSync
                  ? (ratio) => {
                    if (isBidirectionalSync) {
                      setScrollLeader('render');
                    }
                    setPreviewScrollRatio(ratio);
                  }
                  : undefined
              }
              syncScrollRatio={previewSyncScrollRatio}
              onLocationSurfaceChange={onLocationSurfaceChange}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

import type { EditorMode, PreviewSelectionMode } from '@/App';
import type { FocusOwner } from '@/lib/focusSync';
import TurndownService from 'turndown';
import { useMemo, useState } from 'react';
import { CodeEditor } from '@/components/CodeEditor';
import { LocationBar } from '@/components/mirror/editor/LocationBar';
import { ModeToggleBar } from '@/components/mirror/editor/ModeToggleBar';
import { PreviewPane } from '@/components/PreviewPane';
import { WysiwygPane } from '@/components/WysiwygPane';
import { marked } from 'marked';

type Props = {
  editorMode: EditorMode;
  onChangeMode: (mode: EditorMode) => void;
  autoWrap: boolean;
  onToggleAutoWrap: () => void;
  previewSelectionMode: PreviewSelectionMode;
  onChangePreviewSelectionMode: (mode: PreviewSelectionMode) => void;
  locationSurface?: 'Edit' | 'View' | 'Menu' | null;
  onLocationSurfaceChange?: (surface: 'Edit' | 'View' | 'Menu' | null) => void;
  document: ShellDocument | null;
  theme: 'dark' | 'light';
  activeLine?: number | null;
  scrollRequest?: { line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number } | null;
  selectionRequest?: { line: number; token: number } | null;
  onSelectionRequestApplied?: () => void;
  selectedPreviewLine?: { line: number; endLine?: number; activeLine?: number; label: string } | null;
  searchSelection?: { lineNumber: number; start: number; end: number; query: string } | null;
  collapsedHeadingLines?: number[];
  onToggleCollapsedHeading?: (lineNumber: number) => void;
  onSelectPreviewLine: (selection: { line: number; endLine?: number; activeLine?: number; label: string } | null) => void;
  onEditorActiveLineChange?: (line: number | null) => void;
  onPreviewActiveLineChange?: (line: number | null) => void;
  onPreviewInteraction?: () => void;
  onEditorInteraction?: () => void;
  focusOwner?: FocusOwner;
  splitSyncEnabled?: boolean;
  splitScrollSyncMode?: 'none' | 'preview-to-editor' | 'bidirectional';
  onChangeContent: (content: string) => void;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  actionDisabled?: boolean;
};

const turndown = new TurndownService();

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
  onPreviewInteraction,
  onEditorInteraction,
  focusOwner = 'none',
  splitSyncEnabled = true,
  splitScrollSyncMode = 'bidirectional',
  onChangeContent,
  actionLabel = null,
  onAction = null,
  actionDisabled = false,
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
  const [scrollLeader, setScrollLeader] = useState<'editor' | 'preview' | null>(null);
  const [editorScrollRatio, setEditorScrollRatio] = useState(0);
  const [previewScrollRatio, setPreviewScrollRatio] = useState(0);
  const suppressPreviewActiveSync = splitSyncEnabled && editorMode === 'split' && focusOwner === 'editor';
  const isSplit = editorMode === 'split';
  const isPreviewToEditorSync = splitScrollSyncMode === 'preview-to-editor';
  const isBidirectionalSync = splitScrollSyncMode === 'bidirectional';
  const editorSyncScrollRatio =
    isSplit && (isPreviewToEditorSync || (isBidirectionalSync && scrollLeader === 'preview'))
      ? previewScrollRatio
      : null;
  const previewSyncScrollRatio =
    isSplit && isBidirectionalSync && scrollLeader === 'editor'
      ? editorScrollRatio
      : null;

  return (
    <>
      <ModeToggleBar
        editorMode={editorMode}
        onChangeMode={onChangeMode}
        autoWrap={autoWrap}
        onToggleAutoWrap={onToggleAutoWrap}
        previewSelectionMode={previewSelectionMode}
        onChangePreviewSelectionMode={onChangePreviewSelectionMode}
      />
      <LocationBar
        document={document}
        activeLine={activeLine}
        selectedPreviewLine={null}
        previewBlockCount={0}
        selectionMode={previewSelectionMode}
        surface={locationSurface}
        collapsedHeadingLines={collapsedHeadingLines}
        actionLabel={actionLabel}
        onAction={onAction}
        actionDisabled={actionDisabled}
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
            <CodeEditor mode="markdown" value={content} documentPath={document?.filePath ?? null} documentName={document?.fileName ?? null} themeMode={theme} autoWrap={autoWrap} active scrollRequest={scrollRequest} selectionRequest={null} onSelectionRequestApplied={onSelectionRequestApplied} collapsedHeadingLines={collapsedHeadingLines} onActiveLineChange={onEditorActiveLineChange} onEditorInteraction={onEditorInteraction} onChange={onChangeContent} />
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
            <CodeEditor mode="html" value={htmlContent} documentPath={document?.filePath ?? null} documentName={document?.fileName ?? null} themeMode={theme} autoWrap={autoWrap} active scrollRequest={scrollRequest} selectionRequest={null} onSelectionRequestApplied={onSelectionRequestApplied} onActiveLineChange={onEditorActiveLineChange} onEditorInteraction={onEditorInteraction} onChange={(value) => onChangeContent(turndown.turndown(value))} />
          </div>
        </div>
      ) : null}
      {editorMode === 'preview' ? (
        <div
          style={panelWrapperStyle}
          onMouseDown={() => onLocationSurfaceChange?.('View')}
          onMouseEnter={() => onLocationSurfaceChange?.('View')}
        >
          <div className="editor-mode-panel active">
            <PreviewPane
              key={document?.id ?? 'preview'}
              markdownText={content}
              documentPath={document?.filePath ?? null}
              scrollRequest={scrollRequest}
              selectedLine={selectedPreviewLine?.line ?? null}
              selectedEndLine={selectedPreviewLine?.endLine ?? null}
              activeLine={activeLine}
              searchSelection={searchSelection}
              themeMode={theme}
              autoWrap={autoWrap}
              selectionMode={previewSelectionMode}
              collapsedHeadingLines={collapsedHeadingLines}
              onToggleCollapsedHeading={onToggleCollapsedHeading}
              onSelectLine={onSelectPreviewLine}
              onActiveLineChange={onPreviewActiveLineChange}
              suppressActiveLineSync={suppressPreviewActiveSync}
              onMouseFocus={onPreviewInteraction}
            />
          </div>
        </div>
      ) : null}
      {editorMode === 'split' ? (
        <div style={panelWrapperStyle}>
          <div className="editor-mode-panel active editor-split-layout" style={splitLayoutStyle}>
            <div
              className="editor-split-pane editor-split-pane-editor"
              onMouseDown={() => onLocationSurfaceChange?.('Edit')}
              onMouseEnter={() => onLocationSurfaceChange?.('Edit')}
            >
              <CodeEditor
                mode="markdown"
                value={content}
                documentPath={document?.filePath ?? null}
                documentName={document?.fileName ?? null}
                themeMode={theme}
                autoWrap={autoWrap}
                active
                scrollRequest={scrollRequest}
                selectionRequest={selectionRequest}
                onSelectionRequestApplied={onSelectionRequestApplied}
                collapsedHeadingLines={collapsedHeadingLines}
                onActiveLineChange={onEditorActiveLineChange}
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
                onChange={onChangeContent}
              />
            </div>
            <div className="editor-split-divider" aria-hidden="true" style={splitDividerStyle} />
            <div
              className="editor-split-pane editor-split-pane-preview"
              onMouseDown={() => onLocationSurfaceChange?.('View')}
              onMouseEnter={() => onLocationSurfaceChange?.('View')}
            >
              <PreviewPane
                key={`${document?.id ?? 'preview'}-split`}
                markdownText={content}
                documentPath={document?.filePath ?? null}
                scrollRequest={scrollRequest}
                selectedLine={selectedPreviewLine?.line ?? null}
                selectedEndLine={selectedPreviewLine?.endLine ?? null}
                activeLine={activeLine}
                searchSelection={searchSelection}
                themeMode={theme}
                autoWrap={autoWrap}
                selectionMode={previewSelectionMode}
                collapsedHeadingLines={collapsedHeadingLines}
                onToggleCollapsedHeading={onToggleCollapsedHeading}
                onSelectLine={onSelectPreviewLine}
                onActiveLineChange={onPreviewActiveLineChange}
                suppressActiveLineSync={suppressPreviewActiveSync}
                onMouseFocus={() => {
                  onPreviewInteraction?.();
                  if (isBidirectionalSync) {
                    setScrollLeader('preview');
                  }
                }}
                onScrollRatioChange={
                  isPreviewToEditorSync || isBidirectionalSync
                    ? (ratio) => {
                      if (isBidirectionalSync) {
                        setScrollLeader('preview');
                      }
                      setPreviewScrollRatio(ratio);
                    }
                    : undefined
                }
                syncScrollRatio={previewSyncScrollRatio}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

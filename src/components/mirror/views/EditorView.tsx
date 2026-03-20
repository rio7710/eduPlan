import type { EditorMode, PreviewSelectionMode } from '@/App';
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
  document: ShellDocument | null;
  theme: 'dark' | 'light';
  activeLine?: number | null;
  scrollRequest?: { line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number } | null;
  selectedPreviewLine?: { line: number; endLine?: number; activeLine?: number; label: string } | null;
  searchSelection?: { lineNumber: number; start: number; end: number; query: string } | null;
  collapsedHeadingLines?: number[];
  onToggleCollapsedHeading?: (lineNumber: number) => void;
  onSelectPreviewLine: (selection: { line: number; endLine?: number; activeLine?: number; label: string } | null) => void;
  onActiveLineChange?: (line: number | null) => void;
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
  document,
  theme,
  activeLine = null,
  scrollRequest = null,
  selectedPreviewLine = null,
  searchSelection = null,
  collapsedHeadingLines = [],
  onToggleCollapsedHeading,
  onSelectPreviewLine,
  onActiveLineChange,
  onChangeContent,
  actionLabel = null,
  onAction = null,
  actionDisabled = false,
}: Props) {
  const content = document?.content ?? '';
  const htmlContent = useMemo(() => {
    return content ? (marked.parse(content, { async: false }) as string) : '';
  }, [content]);
  const panelWrapperStyle = { display: 'flex', overflow: 'auto', minHeight: 0, flex: 1 } as const;
  const [previewBlockCount, setPreviewBlockCount] = useState(0);

  return (
    <>
      <ModeToggleBar
        editorMode={editorMode}
        onChangeMode={onChangeMode}
        autoWrap={autoWrap}
        onToggleAutoWrap={onToggleAutoWrap}
        previewSelectionMode={previewSelectionMode}
        onChangePreviewSelectionMode={onChangePreviewSelectionMode}
        document={document}
      />
      <LocationBar
        document={document}
        activeLine={activeLine}
        selectedPreviewLine={selectedPreviewLine}
        previewBlockCount={previewBlockCount}
        selectionMode={previewSelectionMode}
        collapsedHeadingLines={collapsedHeadingLines}
        actionLabel={actionLabel}
        onAction={onAction}
        actionDisabled={actionDisabled}
      />
      <div style={editorMode === 'wysiwyg' ? panelWrapperStyle : { display: 'none' }}>
        <div className="editor-mode-panel active">
          <WysiwygPane content={content} scrollRequest={scrollRequest} onChange={onChangeContent} />
        </div>
      </div>
      <div style={editorMode === 'markdown' ? panelWrapperStyle : { display: 'none' }}>
        <div className="editor-mode-panel active">
          <CodeEditor mode="markdown" value={content} themeMode={theme} autoWrap={autoWrap} active={editorMode === 'markdown'} scrollRequest={scrollRequest} collapsedHeadingLines={collapsedHeadingLines} onActiveLineChange={onActiveLineChange} onChange={onChangeContent} />
        </div>
      </div>
      <div style={editorMode === 'html' ? panelWrapperStyle : { display: 'none' }}>
        <div className="editor-mode-panel active">
          <CodeEditor mode="html" value={htmlContent} themeMode={theme} autoWrap={autoWrap} active={editorMode === 'html'} scrollRequest={scrollRequest} onActiveLineChange={onActiveLineChange} onChange={(value) => onChangeContent(turndown.turndown(value))} />
        </div>
      </div>
      <div style={editorMode === 'preview' ? panelWrapperStyle : { display: 'none' }}>
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
            onBlockCountChange={setPreviewBlockCount}
            onSelectLine={onSelectPreviewLine}
            onActiveLineChange={onActiveLineChange}
          />
        </div>
      </div>
    </>
  );
}

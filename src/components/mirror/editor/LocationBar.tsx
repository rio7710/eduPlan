import type { EditorMode, PreviewSelectionMode } from '@/App';
import { getCollapsedHeadingOwnerLine } from '@/lib/headingSections';
import { writePreviewClipboard } from '@/utils/previewClipboardWrite';
import { getFileIcon, getFileIconClass } from '@/utils/fileIcon';
import {
  collectSiblingGroup,
  collectSiblingHeadings,
  extractHeadings,
  getHeadingTrail,
  truncateLabel,
} from '@/components/mirror/editor/locationBarSections';
import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  document: ShellDocument | null;
  activeLine?: number | null;
  previewBlockCount?: number;
  selectionMode?: PreviewSelectionMode;
  surface?: 'Edit' | 'Render' | 'Menu' | null;
  editorMode?: EditorMode;
  selectedPreviewLine?: { line: number; endLine?: number; activeLine?: number; label: string } | null;
  collapsedHeadingLines?: number[];
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  actionDisabled?: boolean;
  renderSyncMode?: 'sync' | 'async';
  onToggleRenderSyncMode?: (() => void) | null;
  onSelectLocationLine?: ((lineNumber: number) => void) | null;
};

export function LocationBar({
  document,
  activeLine = null,
  previewBlockCount = 0,
  selectionMode = 'text',
  surface = null,
  editorMode = 'render',
  collapsedHeadingLines = [],
  actionLabel = null,
  onAction = null,
  actionDisabled = false,
  renderSyncMode = 'sync',
  onToggleRenderSyncMode = null,
  onSelectLocationLine = null,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; line: number } | null>(null);
  const fileName = document?.fileName ?? '문서 제목.md';
  const displayFileName = truncateLabel(fileName, 12);
  const headings = useMemo(() => extractHeadings(document?.content ?? ''), [document?.content]);
  const normalizedLine = getCollapsedHeadingOwnerLine(
    document?.content ?? '',
    activeLine ?? null,
    collapsedHeadingLines,
  );
  const headingTrail = getHeadingTrail(headings, normalizedLine);
  const surfaceLabel =
    surface === 'Render'
      ? 'Render'
      : (surface ?? 'Render');
  useEffect(() => {
    const handleWindowMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenLine(null);
        setContextMenu(null);
      }
    };
    window.addEventListener('mousedown', handleWindowMouseDown);
    return () => window.removeEventListener('mousedown', handleWindowMouseDown);
  }, []);

  return (
    <div className="location-bar" id="location-bar" ref={rootRef}>
      <span className="loc-item loc-doc" title={fileName}><span className={`breadcrumb-icon ${getFileIconClass(fileName)}`}>{getFileIcon(fileName)}</span> <span id="loc-doc-name">{displayFileName}</span></span>
      {headingTrail.map((heading, index) => (
        <span key={`${heading.lineNumber}-${heading.level}-${heading.text}-${index}`} style={{ display: 'contents' }}>
          <span className="loc-sep">›</span>
          <span className="loc-node-wrap">
            <button
              type="button"
              className={`loc-item loc-node ${index === headingTrail.length - 1 ? 'loc-block' : ''}`.trim()}
              style={{ color: `var(--preview-h${Math.min(heading.level, 6)}-color)` }}
              onClick={() => {
                const siblings = collectSiblingHeadings(headings, heading);
                if (!siblings.length) {
                  onSelectLocationLine?.(heading.lineNumber);
                  setOpenLine(null);
                  return;
                }
                setOpenLine((current) => (current === heading.lineNumber ? null : heading.lineNumber));
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setOpenLine(null);
                setContextMenu({ x: event.clientX, y: event.clientY, line: heading.lineNumber });
              }}
            >
              {heading.text}
            </button>
            {openLine === heading.lineNumber ? (
              <div className="loc-children-menu">
                {collectSiblingHeadings(headings, heading).map((sibling) => (
                  <button
                    key={`sibling-${sibling.lineNumber}`}
                    type="button"
                    className="loc-children-item"
                    onClick={() => {
                      onSelectLocationLine?.(sibling.lineNumber);
                      setOpenLine(null);
                    }}
                  >
                    {sibling.text}
                  </button>
                ))}
              </div>
            ) : null}
          </span>
        </span>
      ))}
      <span className="loc-sep">›</span>
      <span className="loc-item loc-surface-badge" id="loc-surface">{surfaceLabel}</span>
      {contextMenu ? (
        <div className="loc-context-menu" style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}>
          <button
            type="button"
            className="loc-context-item"
            onClick={() => {
              const target = headings.find((item) => item.lineNumber === contextMenu.line);
              if (!target) {
                setContextMenu(null);
                return;
              }
              const text = collectSiblingGroup(headings, target)
                .map((item) => item.text)
                .filter(Boolean)
                .join('\n');
              void writePreviewClipboard({ plain: text });
              setContextMenu(null);
            }}
          >
            타이틀 복사
          </button>
        </div>
      ) : null}
      <div className="loc-right">
        {editorMode === 'render' && onToggleRenderSyncMode ? (
          <button className="secondary-button location-inline-action location-sync-toggle" onClick={onToggleRenderSyncMode}>
            {renderSyncMode === 'sync' ? '동기' : '비동기'}
          </button>
        ) : null}
        {actionLabel && onAction ? (
          <button className="secondary-button location-inline-action" onClick={onAction} disabled={actionDisabled}>
            {actionLabel}
          </button>
        ) : null}
        <span className="loc-stat" id="loc-stat">
          {selectionMode === 'block' ? `문서 ${previewBlockCount}블록` : '헤더 기준'}
          {normalizedLine ? ` · ${normalizedLine}행` : ''}
        </span>
      </div>
    </div>
  );
}

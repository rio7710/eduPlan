import type { PreviewSelectionMode } from '@/App';
import { getCollapsedHeadingOwnerLine } from '@/lib/headingSections';
import { getFileIcon, getFileIconClass } from '@/utils/fileIcon';

type Props = {
  document: ShellDocument | null;
  activeLine?: number | null;
  previewBlockCount?: number;
  selectionMode?: PreviewSelectionMode;
  surface?: 'Edit' | 'View' | 'Menu' | null;
  selectedPreviewLine?: { line: number; endLine?: number; activeLine?: number; label: string } | null;
  collapsedHeadingLines?: number[];
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  actionDisabled?: boolean;
};

type HeadingItem = {
  level: number;
  text: string;
  lineNumber: number;
};

function extractHeadings(content: string) {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .map(({ line, index }) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) {
        return null;
      }
      return {
        level: match[1].length,
        text: match[2].trim(),
        lineNumber: index + 1,
      };
    })
    .filter((item): item is HeadingItem => Boolean(item));
}

function getHeadingTrail(content: string, activeLine: number | null) {
  if (!activeLine) {
    return [];
  }

  const headings = extractHeadings(content);
  const trail: HeadingItem[] = [];

  headings.forEach((heading) => {
    if (heading.lineNumber > activeLine) {
      return;
    }

    while (trail.length && trail[trail.length - 1]!.level >= heading.level) {
      trail.pop();
    }
    trail.push(heading);
  });

  return trail;
}

export function LocationBar({
  document,
  activeLine = null,
  previewBlockCount = 0,
  selectionMode = 'text',
  surface = null,
  selectedPreviewLine = null,
  collapsedHeadingLines = [],
  actionLabel = null,
  onAction = null,
  actionDisabled = false,
}: Props) {
  const fileName = document?.fileName ?? '문서 제목.md';
  const normalizedLine = getCollapsedHeadingOwnerLine(
    document?.content ?? '',
    activeLine ?? null,
    collapsedHeadingLines,
  );
  const headingTrail = getHeadingTrail(document?.content ?? '', normalizedLine);
  const displayTrail =
    headingTrail.length > 1 && headingTrail[0]?.level === 1
      ? headingTrail.slice(1)
      : headingTrail;

  return (
    <div className="location-bar" id="location-bar">
      <span className="loc-item loc-doc"><span className={`breadcrumb-icon ${getFileIconClass(fileName)}`}>{getFileIcon(fileName)}</span> <span id="loc-doc-name">{fileName}</span></span>
      {displayTrail.map((heading, index) => (
        <span key={`${heading.lineNumber}-${heading.level}-${heading.text}-${index}`} style={{ display: 'contents' }}>
          <span className="loc-sep">›</span>
          <span
            className={`loc-item ${index === displayTrail.length - 1 ? 'loc-block' : ''}`.trim()}
            style={{ color: `var(--preview-h${Math.min(heading.level, 6)}-color)` }}
          >
            {heading.text}
          </span>
        </span>
      ))}
      <span className="loc-sep">›</span>
      <span className="loc-item loc-surface-badge" id="loc-surface">{surface ?? 'View'}</span>
      <div className="loc-right">
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

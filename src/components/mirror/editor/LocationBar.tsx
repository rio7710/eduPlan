import type { PreviewSelectionMode } from '@/App';
import { getCollapsedHeadingOwnerLine } from '@/lib/headingSections';
import { getFileIcon, getFileIconClass } from '@/utils/fileIcon';

type Props = {
  document: ShellDocument | null;
  activeLine?: number | null;
  previewBlockCount?: number;
  selectionMode?: PreviewSelectionMode;
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
  selectionMode = 'block',
  selectedPreviewLine = null,
  collapsedHeadingLines = [],
  actionLabel = null,
  onAction = null,
  actionDisabled = false,
}: Props) {
  const fileName = document?.fileName ?? '문서 제목.md';
  const normalizedLine = getCollapsedHeadingOwnerLine(
    document?.content ?? '',
    activeLine ?? selectedPreviewLine?.activeLine ?? selectedPreviewLine?.line ?? null,
    collapsedHeadingLines,
  );
  const headingTrail = getHeadingTrail(document?.content ?? '', normalizedLine);
  const sectionHeading = headingTrail[0] ?? null;
  const blockHeading = headingTrail.length > 1 ? headingTrail[headingTrail.length - 1] ?? null : null;
  const sectionLabel = headingTrail[0]?.text ?? '—';
  const blockLabel = headingTrail.length > 1 ? headingTrail[headingTrail.length - 1]?.text ?? '—' : selectedPreviewLine?.label ?? (
    selectionMode === 'block'
      ? '구분선 블록 선택 안 됨'
      : selectionMode === 'line'
        ? '라인 선택 안 됨'
        : '문자 선택 모드'
  );
  const fallbackLabel =
    selectionMode === 'block'
      ? '구분선 블록 선택 안 됨'
      : selectionMode === 'line'
        ? '라인 선택 안 됨'
        : '문자 선택 모드';
  const activeLabel = blockLabel ?? fallbackLabel;
  const lineStat = selectedPreviewLine
    ? `${selectedPreviewLine.line}${selectedPreviewLine.endLine && selectedPreviewLine.endLine !== selectedPreviewLine.line ? `-${selectedPreviewLine.endLine}` : ''}행`
    : selectionMode === 'block'
      ? `문서 ${previewBlockCount}블록`
      : '자유 선택';

  return (
    <div className="location-bar" id="location-bar">
      <span className="loc-item loc-doc"><span className={`breadcrumb-icon ${getFileIconClass(fileName)}`}>{getFileIcon(fileName)}</span> <span id="loc-doc-name">{fileName}</span></span>
      <span className="loc-sep">›</span>
      <span className="loc-item" id="loc-section" style={sectionHeading ? { color: `var(--preview-h${Math.min(sectionHeading.level, 6)}-color)` } : undefined}>{sectionLabel}</span>
      <span className="loc-sep">›</span>
      <span className="loc-item loc-block" id="loc-block" style={blockHeading ? { color: `var(--preview-h${Math.min(blockHeading.level, 6)}-color)` } : undefined}>{activeLabel}</span>
      <div className="loc-right">
        {actionLabel && onAction ? (
          <button className="secondary-button location-inline-action" onClick={onAction} disabled={actionDisabled}>
            {actionLabel}
          </button>
        ) : null}
        <span className="loc-stat" id="loc-stat">{lineStat}</span>
        <span className="loc-sep">·</span>
        <span className="loc-stat" id="loc-chars">0자</span>
      </div>
    </div>
  );
}

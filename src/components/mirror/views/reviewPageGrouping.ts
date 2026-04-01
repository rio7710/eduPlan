export type ReviewPageOption = {
  key: string;
  label: string;
};

type PageRange = {
  page: number;
  startLine: number;
  endLine: number;
};

export function buildPageRanges(markdown: string): PageRange[] {
  const lines = markdown.split(/\r?\n/);
  const ranges: PageRange[] = [];
  let startLine = 1;
  let page = 1;

  lines.forEach((line, index) => {
    if (line.trim() !== '---') {
      return;
    }
    ranges.push({ page, startLine, endLine: index });
    page += 1;
    startLine = index + 2;
  });

  ranges.push({ page, startLine, endLine: lines.length || startLine });
  return ranges;
}

export function getReviewItemAnchorLine(item: ReviewItem): number | null {
  if (item.type === 'sentence_edit') {
    return item.lineStart;
  }
  if (item.type === 'hierarchy_pattern') {
    return item.sampleLines[0] ?? null;
  }
  return null;
}

export function resolvePageNumber(line: number | null, ranges: PageRange[]): number | null {
  if (!line) {
    return null;
  }
  const match = ranges.find((range) => line >= range.startLine && line <= range.endLine);
  return match?.page ?? null;
}

export function buildPageGroupKey(item: ReviewItem, pageNumber: number | null): string {
  return `${item.sourcePdfPath}::${pageNumber ?? 'ungrouped'}`;
}

export function buildPageOptionLabel(item: ReviewItem, pageNumber: number | null): string {
  const fileName = item.sourcePdfName;
  return pageNumber ? `${fileName} · p${pageNumber}` : `${fileName} · 기타`;
}

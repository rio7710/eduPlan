import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PreviewSelectionMode } from '@/App';
import { getCollapsedHeadingOwnerLine } from '@/lib/headingSections';

type PreviewPaneProps = {
  markdownText: string;
  documentPath?: string | null;
  scrollRequest?: { line: number; token: number } | null;
  selectedLine?: number | null;
  selectedEndLine?: number | null;
  activeLine?: number | null;
  searchSelection?: { lineNumber: number; start: number; end: number; query: string } | null;
  themeMode?: 'dark' | 'light';
  autoWrap?: boolean;
  selectionMode: PreviewSelectionMode;
  collapsedHeadingLines?: number[];
  onToggleCollapsedHeading?: (lineNumber: number) => void;
  onBlockCountChange?: (count: number) => void;
  onSelectLine?: (selection: { line: number; endLine?: number; activeLine?: number; label: string } | null) => void;
  onActiveLineChange?: (line: number | null) => void;
  suppressActiveLineSync?: boolean;
  onMouseFocus?: () => void;
  onScrollRatioChange?: (ratio: number) => void;
  syncScrollRatio?: number | null;
};

type PreviewBlock = {
  html: string;
  markdown: string;
  startLine: number;
  endLine: number;
  blockNumber: number;
};

const PREVIEW_AUTO_COPY_STORAGE_KEY = 'eduplan-preview-auto-copy';
const PREVIEW_COLON_BREAK_STORAGE_KEY = 'eduplan-preview-colon-break';
const PREVIEW_STRIP_NUMBER_COPY_STORAGE_KEY = 'eduplan-preview-strip-number-copy';
const IMAGE_REFERENCE_PATTERN = /^\[이미지\s+(\d+):\s+(.+)\]\s*$/;
const LIGHTWEIGHT_PREVIEW = true;
const STANDARD_MARKDOWN_VIEW = true;

function resolveDocumentRelativePath(documentPath: string | null | undefined, relativePath: string) {
  if (!documentPath) {
    return relativePath;
  }

  const normalizedDocumentPath = documentPath.replace(/\\/g, '/');
  const lastSlashIndex = normalizedDocumentPath.lastIndexOf('/');
  if (lastSlashIndex < 0) {
    return relativePath;
  }

  const baseDir = normalizedDocumentPath.slice(0, lastSlashIndex);
  const cleanRelative = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return `${baseDir}/${cleanRelative}`;
}

function cloneToken<T>(token: T): T {
  return structuredClone(token);
}

function renderInlineTokens(tokens: any[]) {
  return marked.Parser.parseInline(tokens) as string;
}

function splitTextTokenAtColon(token: any) {
  const text = typeof token.text === 'string' ? token.text : '';
  const colonIndex = text.indexOf(':');
  if (colonIndex < 0) {
    return null;
  }

  const beforeText = text.slice(0, colonIndex);
  const afterText = text.slice(colonIndex + 1).replace(/^\s+/, '');
  const beforeToken = beforeText ? { ...cloneToken(token), text: beforeText, raw: beforeText } : null;
  const afterToken = afterText ? { ...cloneToken(token), text: afterText, raw: afterText } : null;

  return {
    beforeTokens: beforeToken ? [beforeToken] : [],
    afterTokens: afterToken ? [afterToken] : [],
  };
}

function splitTokenAtColon(token: any): { beforeTokens: any[]; afterTokens: any[] } | null {
  if (token.type === 'text' || token.type === 'escape') {
    return splitTextTokenAtColon(token);
  }

  if (token.type === 'link' || token.type === 'image' || token.type === 'codespan' || token.type === 'html') {
    return null;
  }

  if (!Array.isArray(token.tokens)) {
    return null;
  }

  const nestedSplit = splitInlineTokensAtColon(token.tokens);
  if (!nestedSplit) {
    return null;
  }

  const beforeTokens = nestedSplit.before.length
    ? [{ ...cloneToken(token), tokens: nestedSplit.before, text: nestedSplit.before.map((child) => child.text ?? '').join('') }]
    : [];
  const afterTokens = nestedSplit.after.length
    ? [{ ...cloneToken(token), tokens: nestedSplit.after, text: nestedSplit.after.map((child) => child.text ?? '').join('') }]
    : [];

  return { beforeTokens, afterTokens };
}

function splitInlineTokensAtColon(tokens: any[]) {
  const before: any[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const split = splitTokenAtColon(token);
    if (!split) {
      before.push(cloneToken(token));
      continue;
    }

    const after = [
      ...split.afterTokens,
      ...tokens.slice(index + 1).map((restToken) => cloneToken(restToken)),
    ];

    return {
      before: [...before, ...split.beforeTokens],
      after,
    };
  }

  return null;
}

async function writeClipboardText(payload: { plain: string; html?: string }) {
  const { plain, html } = payload;
  if (!plain.trim()) {
    return;
  }

  try {
    if (window.eduFixerApi?.writeClipboard) {
      window.eduFixerApi.writeClipboard({ plain, html });
      return;
    }
  } catch {
    // fall through to browser clipboard
  }

  try {
    if (html && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([plain], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plain);
    }
  } catch {
    // no-op
  }
}

function stripLineBulletsForCopy(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line.replace(
        /^\s*(?:\d+(?:[.-]\d+)*(?:강|장|절|단원)?[.,)\-]?\s+|\(\d+\)\s+|[①-⑳]\s+|-\s+)/u,
        '',
      ),
    )
    .join('\n');
}

function stripPreviewComments(markdown: string) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\[\/\/\]:\s*#\s*\(.*\)\s*$/gm, '')
    .replace(/^\[comment\]:\s*#\s*\(.*\)\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeNumericRangeTildes(markdown: string) {
  return markdown.replace(/(\d)~(?=\d)/g, '$1\\~');
}

function attachHeadingLineAnchors(html: string, markdown: string, startLineOffset: number) {
  if (!html || !markdown) {
    return html;
  }

  const headingLines = markdown
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) {
        return null;
      }
      return { level: match[1].length, lineNumber: startLineOffset + index };
    })
    .filter((item): item is { level: number; lineNumber: number } => Boolean(item));

  if (!headingLines.length) {
    return html;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const headingElements = Array.from(wrapper.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));

  headingElements.forEach((headingElement, index) => {
    const headingInfo = headingLines[index];
    if (!headingInfo) {
      return;
    }
    headingElement.dataset.mdLine = String(headingInfo.lineNumber);
  });

  return wrapper.innerHTML;
}

function normalizePreviewText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function serializeSelectionText(selection: Selection, previewRoot: HTMLElement) {
  const text = selection.toString();
  if (!text.trim() || selection.rangeCount === 0) {
    return '';
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  const insidePreview = Boolean(
    anchorNode &&
    focusNode &&
    previewRoot.contains(anchorNode) &&
    previewRoot.contains(focusNode),
  );
  if (!insidePreview) {
    return '';
  }

  const fragment = selection.getRangeAt(0).cloneContents();
  const wrapper = document.createElement('div');
  wrapper.append(fragment);

  wrapper.querySelectorAll<HTMLElement>('.preview-colon-pair').forEach((pair) => {
    const label = normalizePreviewText(pair.querySelector<HTMLElement>('.preview-colon-label')?.textContent ?? '');
    const valueNode = pair.querySelector<HTMLElement>('.preview-colon-value');
    const bullet = valueNode?.querySelector<HTMLElement>('.preview-colon-bullet');
    if (bullet) {
      bullet.remove();
    }
    const value = normalizePreviewText(valueNode?.textContent ?? '');
    const replacement = [label, value ? `➡ ${value}` : ''].filter(Boolean).join('\n');
    pair.replaceWith(document.createTextNode(replacement));
  });

  return wrapper.innerText.trim() || text;
}

function applyColonLineBreak(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (
        trimmed.startsWith('#') ||
        trimmed.startsWith('>') ||
        trimmed.startsWith('|') ||
        trimmed.startsWith('```') ||
        /^[-*_]{3,}\s*$/.test(trimmed) ||
        /^!\[.*\]\(.*\)$/.test(trimmed) ||
        /^\[.*\]\(.*\)$/.test(trimmed)
      ) {
        return line;
      }

      const match = line.match(/^(\s*)([-*+]?\s*)?(.+)$/);
      if (!match) {
        return line;
      }

      const [, indent = '', bullet = '', content = ''] = match;
      if (content.includes('://')) {
        return line;
      }

      const inlineTokens = marked.Lexer.lexInline(escapeNumericRangeTildes(content.trim()));
      const split = splitInlineTokensAtColon(inlineTokens);
      if (!split || !split.before.length || !split.after.length) {
        return line;
      }

      const labelHtml = renderInlineTokens(split.before);
      const valueHtml = renderInlineTokens(split.after);
      const wrapperClass = bullet ? 'preview-colon-pair preview-colon-pair-list' : 'preview-colon-pair';
      const bulletPrefix = bullet ? `${indent}${bullet}` : indent;

      return `${bulletPrefix}<div class="${wrapperClass}"><div class="preview-colon-label">${labelHtml}</div><div class="preview-colon-value"><span class="preview-colon-bullet">➡</span><span>${valueHtml}</span></div></div>`;
    })
    .join('\n');
}

function isHrDelimiterLine(rawLine: string) {
  const trimmed = rawLine.trim().toLowerCase();
  if (trimmed === '<hr>' || trimmed === '<hr/>' || trimmed === '<hr />') {
    return true;
  }
  return /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(rawLine);
}

function getPreviewBlocks(markdownText: string, colonBreakEnabled: boolean, lightweightMode: boolean) {
  if (STANDARD_MARKDOWN_VIEW) {
    const rawLines = markdownText.split(/\r?\n/);
    const blocks: PreviewBlock[] = [];
    let startIndex: number | null = null;
    let blockNumber = 1;

    function pushStandardBlock(endIndex: number) {
      if (startIndex === null || endIndex < startIndex) {
        return;
      }
      const markdown = rawLines.slice(startIndex, endIndex + 1).join('\n');
      if (!markdown.trim()) {
        return;
      }
      const html = attachHeadingLineAnchors(
        DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string),
        markdown,
        startIndex + 1,
      );
      blocks.push({
        html,
        markdown,
        startLine: startIndex + 1,
        endLine: endIndex + 1,
        blockNumber,
      });
      blockNumber += 1;
    }

    rawLines.forEach((rawLine, index) => {
      if (isHrDelimiterLine(rawLine)) {
        pushStandardBlock(index - 1);
        startIndex = null;
        return;
      }
      if (startIndex === null && rawLine.trim()) {
        startIndex = index;
      }
    });
    pushStandardBlock(rawLines.length - 1);
    return blocks;
  }

  if (lightweightMode) {
    const lines = markdownText.split(/\r?\n/);
    const markdown = lines.join('\n');
    const previewMarkdownBase = stripPreviewComments(markdown);
    const previewMarkdownRaw = colonBreakEnabled ? applyColonLineBreak(previewMarkdownBase) : previewMarkdownBase;
    const previewMarkdown = escapeNumericRangeTildes(previewMarkdownRaw);
    const html = previewMarkdown
      ? attachHeadingLineAnchors(
          DOMPurify.sanitize(marked.parse(previewMarkdown, { async: false }) as string),
          markdown,
          1,
        )
      : '';
    return previewMarkdown
      ? [
          {
            html,
            markdown,
            startLine: 1,
            endLine: Math.max(1, lines.length),
            blockNumber: 1,
          } satisfies PreviewBlock,
        ]
      : [];
  }

  const rawLines = markdownText.split(/\r?\n/);
  const blocks: PreviewBlock[] = [];
  let startIndex: number | null = null;
  let blockNumber = 1;

  function pushBlock(endIndex: number) {
    if (startIndex === null || endIndex < startIndex) {
      return;
    }

    const markdown = rawLines.slice(startIndex, endIndex + 1).join('\n');
    const previewMarkdownBase = stripPreviewComments(markdown);
    const previewMarkdownRaw = colonBreakEnabled ? applyColonLineBreak(previewMarkdownBase) : previewMarkdownBase;
    const previewMarkdown = escapeNumericRangeTildes(previewMarkdownRaw);
    const html = previewMarkdown
      ? attachHeadingLineAnchors(
          DOMPurify.sanitize(marked.parse(previewMarkdown, { async: false }) as string),
          markdown,
          startIndex + 1,
        )
      : '';

    if (previewMarkdown) {
      blocks.push({
        html,
        markdown,
        startLine: startIndex + 1,
        endLine: endIndex + 1,
        blockNumber,
      });

      blockNumber += 1;
    }
  }

  rawLines.forEach((rawLine, index) => {
    const isBlank = !rawLine.trim();
    const isRule = isHrDelimiterLine(rawLine);

    if (isRule) {
      pushBlock(index - 1);
      startIndex = null;
      return;
    }

    if (!isBlank && startIndex === null) {
      startIndex = index;
    }

    if (startIndex === null) {
      return;
    }

    if (isBlank) {
      return;
    }

    const nextNonBlankIndex = (() => {
      for (let cursor = index + 1; cursor < rawLines.length; cursor += 1) {
        if (rawLines[cursor]?.trim()) {
          return cursor;
        }
      }
      return -1;
    })();

    const nextNonBlankLine = nextNonBlankIndex >= 0 ? rawLines[nextNonBlankIndex] ?? '' : '';
    const nextIsRule = nextNonBlankIndex >= 0 && /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(nextNonBlankLine);
    const endsBlock = nextNonBlankIndex === -1 || nextIsRule;

    if (!endsBlock) {
      return;
    }

    pushBlock(index);
    startIndex = null;
  });

  return blocks;
}

function extractImageReferencePaths(markdownText: string, documentPath?: string | null) {
  const paths = new Set<string>();
  markdownText.split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(IMAGE_REFERENCE_PATTERN);
    if (!match) {
      return;
    }

    const relativePath = match[2].trim();
    paths.add(resolveDocumentRelativePath(documentPath, relativePath));
  });
  return [...paths];
}

function transformImageReferenceMarkdown(markdownText: string, imageUrlMap: Record<string, string>, documentPath?: string | null) {
  return markdownText
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(IMAGE_REFERENCE_PATTERN);
      if (!match) {
        return line;
      }

      const imageNumber = match[1];
      const relativePath = match[2].trim();
      const resolvedPath = resolveDocumentRelativePath(documentPath, relativePath);
      const imageUrl = imageUrlMap[resolvedPath];
      if (!imageUrl) {
        return `<figure class="preview-inline-image preview-inline-image-missing"><figcaption>이미지 ${imageNumber} 로딩 중...</figcaption></figure>`;
      }

      return `<figure class="preview-inline-image"><img src="${imageUrl}" alt="이미지 ${imageNumber}" /><figcaption>이미지 ${imageNumber}</figcaption></figure>`;
    })
    .join('\n');
}

function findBlockForLine(blocks: PreviewBlock[], lineNumber: number) {
  return blocks.find((block) => lineNumber >= block.startLine && lineNumber <= block.endLine) ?? null;
}

function getBlockSearchOccurrence(block: PreviewBlock, selection: { lineNumber: number; start: number; query: string }) {
  const query = selection.query.toLowerCase();
  if (!query) {
    return 0;
  }

  const lines = block.markdown.split(/\r?\n/);
  let occurrence = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const absoluteLineNumber = block.startLine + index;
    const lowerLine = line.toLowerCase();
    let searchFrom = 0;

    while (searchFrom <= lowerLine.length) {
      const foundIndex = lowerLine.indexOf(query, searchFrom);
      if (foundIndex < 0) {
        break;
      }

      if (absoluteLineNumber === selection.lineNumber && foundIndex === selection.start) {
        return occurrence;
      }

      occurrence += 1;
      searchFrom = foundIndex + Math.max(query.length, 1);
    }
  }

  return occurrence;
}

function highlightNthOccurrenceInElement(root: HTMLElement, query: string, occurrence: number) {
  if (!query) {
    return null;
  }

  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let cursor = 0;
  let current = walker.nextNode() as Text | null;
  while (current) {
    const value = current.textContent ?? '';
    textNodes.push({ node: current, start: cursor, end: cursor + value.length });
    cursor += value.length;
    current = walker.nextNode() as Text | null;
  }

  const fullText = textNodes.map(({ node }) => node.textContent ?? '').join('');
  const lowerText = fullText.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let matchStart = -1;
  let searchFrom = 0;
  let foundCount = 0;

  while (searchFrom <= lowerText.length) {
    const index = lowerText.indexOf(lowerQuery, searchFrom);
    if (index < 0) {
      break;
    }
    if (foundCount === occurrence) {
      matchStart = index;
      break;
    }
    foundCount += 1;
    searchFrom = index + Math.max(lowerQuery.length, 1);
  }

  if (matchStart < 0) {
    return null;
  }

  const matchEnd = matchStart + query.length;
  const startRef = textNodes.find(({ start, end }) => matchStart >= start && matchStart < end);
  const endRef = textNodes.find(({ start, end }) => matchEnd > start && matchEnd <= end);

  if (!startRef || !endRef) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startRef.node, matchStart - startRef.start);
  range.setEnd(endRef.node, matchEnd - endRef.start);

  const mark = document.createElement('mark');
  mark.className = 'preview-search-match';
  try {
    range.surroundContents(mark);
    return mark;
  } catch {
    const fragment = range.extractContents();
    mark.append(fragment);
    range.insertNode(mark);
    return mark;
  }
}

function clearSearchMarks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.preview-search-match').forEach((element) => {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(element.textContent ?? ''), element);
    parent.normalize();
  });
}

function getHeadingLevel(element: HTMLElement) {
  const match = element.tagName.match(/^H([1-6])$/);
  return match ? Number(match[1]) : null;
}

function resolveHeadingLineFromClick(
  container: HTMLElement | null,
  target: HTMLElement | null,
  clientY: number,
) {
  if (!container) {
    return null;
  }

  const directLine = Number(target?.closest<HTMLElement>('[data-md-line]')?.dataset.mdLine || 0);
  if (directLine > 0) {
    return directLine;
  }

  const headingElements = Array.from(container.querySelectorAll<HTMLElement>('[data-md-line]')).filter(
    (element) => getHeadingLevel(element) !== null,
  );
  if (!headingElements.length) {
    return null;
  }

  let activeHeading: HTMLElement | null = null;
  headingElements.forEach((heading) => {
    const rect = heading.getBoundingClientRect();
    if (rect.top <= clientY + 1) {
      activeHeading = heading;
    }
  });

  const fallbackHeading = activeHeading ?? headingElements[0] ?? null;
  const fallbackLine = Number(fallbackHeading?.dataset.mdLine || 0);
  return fallbackLine > 0 ? fallbackLine : null;
}

function resolveSourceLineFromBlockPointer(target: HTMLElement | null, clientY: number) {
  const blockElement = target?.closest<HTMLElement>('[data-start-line][data-end-line]') ?? null;
  if (!blockElement) {
    return null;
  }

  const startLine = Number(blockElement.dataset.startLine || 0);
  const endLine = Number(blockElement.dataset.endLine || 0);
  if (startLine <= 0 || endLine < startLine) {
    return null;
  }

  const rect = blockElement.getBoundingClientRect();
  const span = Math.max(1, endLine - startLine + 1);
  if (rect.height <= 0) {
    return startLine;
  }

  const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  const offset = Math.round((span - 1) * ratio);
  return startLine + offset;
}

function resolveSourceLineFromPointer(container: HTMLElement | null, target: HTMLElement | null, clientY: number) {
  return resolveSourceLineFromBlockPointer(target, clientY) ?? resolveHeadingLineFromClick(container, target, clientY);
}

function findTextBoundaryInElement(element: HTMLElement, direction: 'start' | 'end') {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  if (direction === 'start') {
    const first = walker.nextNode() as Text | null;
    return first ? { node: first, offset: 0 } : null;
  }

  let last: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    last = current as Text;
    current = walker.nextNode();
  }
  return last ? { node: last, offset: last.textContent?.length ?? 0 } : null;
}

function expandSelectionToStructuralElements(selection: Selection) {
  if (!selection.rangeCount || selection.isCollapsed) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const structuralSelector = 'li, p, h1, h2, h3, h4, h5, h6';
  const startElement =
    range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement;
  const endElement =
    range.endContainer instanceof HTMLElement ? range.endContainer : range.endContainer.parentElement;
  const startNode = startElement?.closest<HTMLElement>(structuralSelector) ?? null;
  const endNode = endElement?.closest<HTMLElement>(structuralSelector) ?? null;
  if (!startNode || !endNode) {
    return false;
  }

  const ordered = startNode.compareDocumentPosition(endNode) & Node.DOCUMENT_POSITION_PRECEDING
    ? [endNode, startNode]
    : [startNode, endNode];
  const startBoundary = findTextBoundaryInElement(ordered[0], 'start');
  const endBoundary = findTextBoundaryInElement(ordered[1], 'end');
  if (!startBoundary || !endBoundary) {
    return false;
  }

  const nextRange = document.createRange();
  nextRange.setStart(startBoundary.node, startBoundary.offset);
  nextRange.setEnd(endBoundary.node, endBoundary.offset);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  return true;
}

export function PreviewPane({
  markdownText,
  documentPath = null,
  scrollRequest = null,
  selectedLine = null,
  selectedEndLine = null,
  activeLine = null,
  searchSelection = null,
  autoWrap = true,
  selectionMode: _selectionMode,
  collapsedHeadingLines: _collapsedHeadingLines = [],
  onToggleCollapsedHeading,
  onBlockCountChange,
  onSelectLine,
  onActiveLineChange,
  suppressActiveLineSync = false,
  onMouseFocus,
  onScrollRatioChange,
  syncScrollRatio = null,
}: PreviewPaneProps) {
  const [imageUrlMap, setImageUrlMap] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoCopyEnabled, setAutoCopyEnabled] = useState<boolean>(() => {
    return window.localStorage.getItem(PREVIEW_AUTO_COPY_STORAGE_KEY) === 'on';
  });
  const [colonBreakEnabled, setColonBreakEnabled] = useState<boolean>(() => {
    return window.localStorage.getItem(PREVIEW_COLON_BREAK_STORAGE_KEY) === 'on';
  });
  const [stripNumberCopyEnabled, setStripNumberCopyEnabled] = useState<boolean>(() => {
    return window.localStorage.getItem(PREVIEW_STRIP_NUMBER_COPY_STORAGE_KEY) === 'on';
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [clickedBlockSelection, setClickedBlockSelection] = useState<{ startLine: number; endLine: number } | null>(null);
  const suppressScrollEmitRef = useRef(false);
  const lineSelectionAnchorLineRef = useRef<number | null>(null);
  const lastEmittedScrollRatioRef = useRef(-1);
  const pendingScrollRatioRef = useRef<number | null>(null);
  const scrollEmitRafRef = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const imagePaths = extractImageReferencePaths(markdownText, documentPath);
    if (!imagePaths.length || !window.eduFixerApi?.readImageDataUrl) {
      setImageUrlMap({});
      return;
    }

    Promise.all(
      imagePaths.map(async (filePath) => {
        const dataUrl = await window.eduFixerApi?.readImageDataUrl?.(filePath);
        return [filePath, dataUrl] as const;
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      setImageUrlMap(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [markdownText, documentPath]);

  const previewMarkdownText = useMemo(
    () => (STANDARD_MARKDOWN_VIEW ? markdownText : transformImageReferenceMarkdown(markdownText, imageUrlMap, documentPath)),
    [markdownText, imageUrlMap, documentPath],
  );
  const isLightweightMode = LIGHTWEIGHT_PREVIEW && _selectionMode !== 'block';
  const blocks = useMemo(
    // Render blocks by --- in every mode for consistent preview shape.
    // Lightweight mode still only controls expensive sync/highlight behaviors.
    () => getPreviewBlocks(previewMarkdownText, colonBreakEnabled, false),
    [previewMarkdownText, colonBreakEnabled],
  );
  const normalizedScrollLine = getCollapsedHeadingOwnerLine(markdownText, scrollRequest?.line ?? null, _collapsedHeadingLines);

  useEffect(() => {
    setClickedBlockSelection(null);
  }, [_selectionMode, previewMarkdownText]);

  useEffect(() => {
    if (selectedLine !== null && selectedEndLine !== null) {
      // External selection sync has priority; drop stale local clicked range.
      setClickedBlockSelection(null);
    }
  }, [selectedLine, selectedEndLine]);

  const effectiveBlockSelection =
    selectedLine !== null && selectedEndLine !== null
      ? { startLine: selectedLine, endLine: selectedEndLine }
      : clickedBlockSelection;

  function updateActiveLineFromViewportTop() {
    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const rect = container.getBoundingClientRect();
    const probeY = rect.top + 18;
    const probeX = rect.left + Math.min(Math.max(rect.width * 0.18, 24), 96);
    const probeTarget = document.elementFromPoint(probeX, probeY) as HTMLElement | null;
    const pointerLine = resolveSourceLineFromPointer(container, probeTarget, probeY);
    if (pointerLine) {
      onActiveLineChange?.(pointerLine);
      return pointerLine;
    }

    const containerTop = container.getBoundingClientRect().top;
    const blockElements = Array.from(container.querySelectorAll<HTMLElement>('[data-block-number]'));
    const headingElements = Array.from(container.querySelectorAll<HTMLElement>('[data-md-line]')).filter(
      (element) => !element.classList.contains('preview-collapsed-hidden'),
    );

    let activeHeadingLine: number | null = null;
    for (const headingElement of headingElements) {
      const headingTop = headingElement.getBoundingClientRect().top;
      if (headingTop <= containerTop + 12) {
        const line = Number(headingElement.dataset.mdLine || 0);
        if (line) {
          activeHeadingLine = line;
        }
        continue;
      }
      break;
    }

    if (activeHeadingLine) {
      onActiveLineChange?.(activeHeadingLine);
      return activeHeadingLine;
    }

    if (!blockElements.length) {
      onActiveLineChange?.(null);
      return null;
    }

    let candidate = blockElements[0];
    for (const blockElement of blockElements) {
      const blockTop = blockElement.getBoundingClientRect().top;
      if (blockTop <= containerTop + 12) {
        candidate = blockElement;
        continue;
      }
      break;
    }

    const startLine = Number(candidate.dataset.startLine || 0);
    onActiveLineChange?.(startLine || null);
    return startLine || null;
  }

  function getSelectionDebugInfo(line: number, endLine?: number, renderText?: string) {
    const startLine = Math.max(1, line);
    const lastLine = Math.max(startLine, endLine ?? startLine);
    const normalizedText = (renderText ?? '').replace(/\r/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const startBlock = findBlockForLine(blocks, startLine);
    const endBlock = findBlockForLine(blocks, lastLine);
    const blockRange =
      startBlock && endBlock
        ? { startLine: startBlock.startLine, endLine: endBlock.endLine, blockStart: startBlock.blockNumber, blockEnd: endBlock.blockNumber }
        : null;
    return {
      sourceText: normalizedText,
      blockRange,
    };
  }

  function emitSelection(
    selection: { line: number; endLine?: number; activeLine?: number; label: string },
    reason: string,
    renderText?: string,
  ) {
    onSelectLine?.(selection);
    const debug = getSelectionDebugInfo(selection.line, selection.endLine, renderText);
    console.log('[PreviewPane] selected-range', {
      reason,
      mode: _selectionMode,
      line: selection.line,
      endLine: selection.endLine ?? selection.line,
      activeLine: selection.activeLine ?? selection.line,
      label: selection.label,
      renderText: debug.sourceText,
      blockRange: debug.blockRange,
    });
  }

  function normalizeClipboardText(text: string) {
    return stripNumberCopyEnabled ? stripLineBulletsForCopy(text) : text;
  }

  function buildClipboardPayload(text: string) {
    return { plain: normalizeClipboardText(text), html: undefined as string | undefined };
  }

  function findBlockContentBoundary(blockElement: HTMLElement, direction: 'start' | 'end') {
    const contentRoot = Array.from(blockElement.childNodes).find((node) => {
      return !(node instanceof HTMLElement && node.classList.contains('preview-html-meta'));
    });

    if (!contentRoot) {
      return null;
    }

    const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    if (direction === 'start') {
      const firstTextNode = walker.nextNode() as Text | null;
      if (!firstTextNode) {
        return null;
      }
      return { node: firstTextNode, offset: 0 };
    }

    let lastTextNode: Text | null = null;
    let current = walker.nextNode();
    while (current) {
      lastTextNode = current as Text;
      current = walker.nextNode();
    }

    if (!lastTextNode) {
      return null;
    }

    return { node: lastTextNode, offset: lastTextNode.textContent?.length ?? 0 };
  }

  function expandSelectionToBlockBoundaries() {
    if (_selectionMode !== 'block') {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    const startElement =
      range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement;
    const endElement =
      range.endContainer instanceof HTMLElement
        ? range.endContainer
        : range.endContainer.parentElement;

    const startBlock = startElement?.closest<HTMLElement>('[data-block-number]') ?? null;
    const endBlock = endElement?.closest<HTMLElement>('[data-block-number]') ?? null;
    if (!startBlock || !endBlock) {
      return;
    }

    const startNumber = Number(startBlock.dataset.blockNumber || 0);
    const endNumber = Number(endBlock.dataset.blockNumber || 0);
    if (!startNumber || !endNumber) {
      return;
    }

    const firstBlock = startNumber <= endNumber ? startBlock : endBlock;
    const lastBlock = startNumber <= endNumber ? endBlock : startBlock;
    const startBoundary = findBlockContentBoundary(firstBlock, 'start');
    const endBoundary = findBlockContentBoundary(lastBlock, 'end');
    if (!startBoundary || !endBoundary) {
      return;
    }

    const nextRange = document.createRange();
    nextRange.setStart(startBoundary.node, startBoundary.offset);
    nextRange.setEnd(endBoundary.node, endBoundary.offset);

    selection.removeAllRanges();
    selection.addRange(nextRange);
  }

  function extendSelectionStartToLineBoundary() {
    if (_selectionMode !== 'line') {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || typeof selection.modify !== 'function') {
      return;
    }

    const originalRange = selection.getRangeAt(0).cloneRange();
    const probeRange = originalRange.cloneRange();
    probeRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(probeRange);
    selection.modify('extend', 'backward', 'lineboundary');

    if (selection.rangeCount === 0) {
      selection.removeAllRanges();
      selection.addRange(originalRange);
      return;
    }

    const expandedStartRange = selection.getRangeAt(0).cloneRange();
    const nextRange = document.createRange();
    nextRange.setStart(expandedStartRange.startContainer, expandedStartRange.startOffset);
    nextRange.setEnd(originalRange.endContainer, originalRange.endOffset);

    selection.removeAllRanges();
    selection.addRange(nextRange);
  }

  function extendSelectionEndToLineBoundary() {
    if (_selectionMode !== 'line') {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || typeof selection.modify !== 'function') {
      return;
    }

    const originalRange = selection.getRangeAt(0).cloneRange();
    const probeRange = originalRange.cloneRange();
    probeRange.collapse(false);

    selection.removeAllRanges();
    selection.addRange(probeRange);
    selection.modify('extend', 'forward', 'lineboundary');

    if (selection.rangeCount === 0) {
      selection.removeAllRanges();
      selection.addRange(originalRange);
      return;
    }

    const expandedEndRange = selection.getRangeAt(0).cloneRange();
    const nextRange = document.createRange();
    nextRange.setStart(originalRange.startContainer, originalRange.startOffset);
    nextRange.setEnd(expandedEndRange.endContainer, expandedEndRange.endOffset);

    selection.removeAllRanges();
    selection.addRange(nextRange);
  }

  useLayoutEffect(() => {
    if (isLightweightMode) {
      return;
    }
    const root = containerRef.current;
    if (!root) {
      return;
    }

    root.querySelectorAll<HTMLElement>('.preview-collapsed-hidden').forEach((element) => {
      element.classList.remove('preview-collapsed-hidden');
    });
    root.querySelectorAll<HTMLElement>('.preview-collapsed-heading').forEach((element) => {
      element.classList.remove('preview-collapsed-heading');
    });

    if (!_collapsedHeadingLines.length) {
      return;
    }

    const contentElements = Array.from(root.querySelectorAll<HTMLElement>('.preview-html-block > .preview-html-content > *'));
    const headingElements = contentElements.filter((element) => element.matches('h1, h2, h3, h4, h5, h6'));

    headingElements.forEach((headingElement, index) => {
      const headingLine = Number(headingElement.dataset.mdLine || 0);
      if (!headingLine || !_collapsedHeadingLines.includes(headingLine)) {
        return;
      }

      headingElement.classList.add('preview-collapsed-heading');

      const headingLevel = getHeadingLevel(headingElement);
      if (!headingLevel) {
        return;
      }

      let cursor = contentElements.indexOf(headingElement) + 1;
      while (cursor < contentElements.length) {
        const element = contentElements[cursor];
        if (element.matches('h1, h2, h3, h4, h5, h6')) {
          const candidateLevel = getHeadingLevel(element);
          if (candidateLevel !== null && candidateLevel <= headingLevel) {
            break;
          }
        }
        element.classList.add('preview-collapsed-hidden');
        cursor += 1;
      }
    });
  }, [isLightweightMode, _collapsedHeadingLines]);

  useLayoutEffect(() => {
    if (isLightweightMode) {
      return;
    }
    const root = containerRef.current;
    if (!root) {
      return;
    }
    clearSearchMarks(root);

    if (!searchSelection?.query.trim()) {
      return;
    }

    const targetBlock = findBlockForLine(blocks, searchSelection.lineNumber);
    if (!targetBlock) {
      return;
    }
    const targetOccurrence = getBlockSearchOccurrence(targetBlock, searchSelection);

    const blockContent = root.querySelector<HTMLElement>(`[data-block-number="${targetBlock.blockNumber}"] .preview-html-content`);
    if (!blockContent) {
      return;
    }

    const query = searchSelection.query;
    highlightNthOccurrenceInElement(blockContent, query, targetOccurrence);
  }, [blocks, scrollRequest?.token, searchSelection, isLightweightMode]);

  useEffect(() => {
    onBlockCountChange?.(blocks.length);
  }, [blocks.length, onBlockCountChange]);

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_AUTO_COPY_STORAGE_KEY, autoCopyEnabled ? 'on' : 'off');
  }, [autoCopyEnabled]);

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_COLON_BREAK_STORAGE_KEY, colonBreakEnabled ? 'on' : 'off');
  }, [colonBreakEnabled]);

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_STRIP_NUMBER_COPY_STORAGE_KEY, stripNumberCopyEnabled ? 'on' : 'off');
  }, [stripNumberCopyEnabled]);

  useEffect(() => {
    if (!containerRef.current || !scrollRequest) {
      return;
    }

    if (searchSelection?.query.trim()) {
      const searchTarget = containerRef.current.querySelector<HTMLElement>('.preview-search-match');
      if (searchTarget) {
        searchTarget.scrollIntoView({ block: 'center', behavior: 'auto' });
        return;
      }
    }

    const headingTarget = containerRef.current.querySelector<HTMLElement>(`[data-md-line="${normalizedScrollLine}"]`);
    if (headingTarget) {
      headingTarget.scrollIntoView({ block: 'start', behavior: 'auto' });
      return;
    }

    const targetBlock = findBlockForLine(blocks, normalizedScrollLine ?? scrollRequest.line);
    if (!targetBlock) {
      return;
    }

    const blockElement = containerRef.current.querySelector<HTMLElement>(`[data-block-number="${targetBlock.blockNumber}"]`);
    blockElement?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [blocks, normalizedScrollLine, scrollRequest, searchSelection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || syncScrollRatio === null || Number.isNaN(syncScrollRatio)) {
      return;
    }
    const max = container.scrollHeight - container.clientHeight;
    const clamped = Math.max(0, Math.min(1, syncScrollRatio));
    const currentRatio = max > 0 ? container.scrollTop / max : 0;
    if (Math.abs(currentRatio - clamped) < 0.008) {
      return;
    }
    suppressScrollEmitRef.current = true;
    container.scrollTop = max > 0 ? max * clamped : 0;
    const timer = window.setTimeout(() => {
      suppressScrollEmitRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncScrollRatio]);

  useEffect(() => {
    if (isLightweightMode) {
      return;
    }
    const root = containerRef.current;
    if (!root) {
      return;
    }

    if (!suppressActiveLineSync || !activeLine || searchSelection?.query.trim()) {
      return;
    }

    const headingTarget = root.querySelector<HTMLElement>(`[data-md-line="${activeLine}"]`);
    if (headingTarget) {
      headingTarget.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      return;
    }

    const targetBlock = findBlockForLine(blocks, activeLine);
    if (!targetBlock) {
      return;
    }

    const blockElement = root.querySelector<HTMLElement>(`[data-block-number="${targetBlock.blockNumber}"]`);
    blockElement?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [activeLine, blocks, searchSelection, suppressActiveLineSync, isLightweightMode]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }
    if (searchSelection?.query.trim()) {
      return;
    }
    const container: HTMLDivElement = root;

    if (suppressActiveLineSync) {
      return;
    }
    updateActiveLineFromViewportTop();
    const handleLocationScroll = () => {
      const line = updateActiveLineFromViewportTop();
      console.log('[preview_scroll_location]', {
        line,
        scrollTop: container.scrollTop,
      });
    };
    const handleLocationResize = () => {
      updateActiveLineFromViewportTop();
    };
    container.addEventListener('scroll', handleLocationScroll, { passive: true });
    window.addEventListener('resize', handleLocationResize);
    return () => {
      container.removeEventListener('scroll', handleLocationScroll);
      window.removeEventListener('resize', handleLocationResize);
    };
  }, [blocks, onActiveLineChange, searchSelection, suppressActiveLineSync]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }
    const previewRoot = root;

    function getSelectedPreviewText() {
      const selection = window.getSelection();
      if (!selection) {
        return '';
      }

      return serializeSelectionText(selection, previewRoot);
    }

    function handleCopy(event: ClipboardEvent) {
      const text = getSelectedPreviewText();
      if (!text) {
        return;
      }

      const payload = buildClipboardPayload(text);
      event.preventDefault();
      event.clipboardData?.setData('text/plain', payload.plain);
      if (payload.html) {
        event.clipboardData?.setData('text/html', payload.html);
      }
      void writeClipboardText(payload);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') {
        return;
      }

      const text = getSelectedPreviewText();
      if (!text) {
        return;
      }

      const payload = buildClipboardPayload(text);
      event.preventDefault();
      void writeClipboardText(payload);
    }

      previewRoot.addEventListener('copy', handleCopy);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      previewRoot.removeEventListener('copy', handleCopy);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => {
      if (suppressScrollEmitRef.current) {
        return;
      }
      const max = container.scrollHeight - container.clientHeight;
      const ratio = max > 0 ? container.scrollTop / max : 0;
      const clamped = Math.max(0, Math.min(1, ratio));
      if (Math.abs(clamped - lastEmittedScrollRatioRef.current) < 0.008) {
        return;
      }
      pendingScrollRatioRef.current = clamped;
      if (scrollEmitRafRef.current !== null) {
        return;
      }
      scrollEmitRafRef.current = window.requestAnimationFrame(() => {
        scrollEmitRafRef.current = null;
        const next = pendingScrollRatioRef.current;
        if (next === null) {
          return;
        }
        pendingScrollRatioRef.current = null;
        lastEmittedScrollRatioRef.current = next;
        onScrollRatioChange?.(next);
      });
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollEmitRafRef.current !== null) {
        window.cancelAnimationFrame(scrollEmitRafRef.current);
        scrollEmitRafRef.current = null;
      }
    };
  }, [onScrollRatioChange]);

  useEffect(() => {
    function closeContextMenu() {
      setContextMenu(null);
    }

    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('resize', closeContextMenu);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
      window.removeEventListener('resize', closeContextMenu);
    };
  }, []);

  const selectionModeClass =
    _selectionMode === 'block'
      ? 'preview-pane-block-mode'
      : _selectionMode === 'line'
        ? 'preview-pane-line-mode'
        : 'preview-pane-text-mode';

  return (
    <div
      ref={containerRef}
      className={`preview-pane ${autoWrap ? '' : 'preview-pane-nowrap'} ${selectionModeClass}`.trim()}
      onMouseDown={(event) => {
        onMouseFocus?.();
        if (_selectionMode !== 'line') {
          return;
        }
        lineSelectionAnchorLineRef.current = resolveSourceLineFromPointer(
          containerRef.current,
          event.target as HTMLElement | null,
          event.clientY,
        );
      }}
      onWheel={() => {
        onMouseFocus?.();
        updateActiveLineFromViewportTop();
      }}
      onMouseEnter={() => {
        updateActiveLineFromViewportTop();
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        const heading = target?.closest<HTMLElement>('.preview-collapsed-heading');
        if (heading) {
          const lineNumber = Number(heading.dataset.mdLine || 0);
          if (lineNumber <= 0) {
            return;
          }
          onToggleCollapsedHeading?.(lineNumber);
          lineSelectionAnchorLineRef.current = null;
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onMouseUp={(event) => {
        const commitLocationAtClickEnd = () => {
          updateActiveLineFromViewportTop();
        };
        const anchorLine = lineSelectionAnchorLineRef.current;
        lineSelectionAnchorLineRef.current = null;
        const selection = window.getSelection();
        if (_selectionMode === 'line' && selection) {
          expandSelectionToStructuralElements(selection);
        }
        if (_selectionMode === 'block' && selection) {
          expandSelectionToBlockBoundaries();
          const nextSelection = window.getSelection();
          if (!nextSelection || !nextSelection.rangeCount || nextSelection.isCollapsed) {
            commitLocationAtClickEnd();
            return;
          }
          const range = nextSelection.getRangeAt(0);
          const startElement =
            range.startContainer instanceof HTMLElement
              ? range.startContainer
              : range.startContainer.parentElement;
          const endElement =
            range.endContainer instanceof HTMLElement
              ? range.endContainer
              : range.endContainer.parentElement;
          const startBlock = startElement?.closest<HTMLElement>('[data-block-number]') ?? null;
          const endBlock = endElement?.closest<HTMLElement>('[data-block-number]') ?? null;
          if (!startBlock || !endBlock) {
            commitLocationAtClickEnd();
            return;
          }
          const startNumber = Number(startBlock.dataset.blockNumber || 0);
          const endNumber = Number(endBlock.dataset.blockNumber || 0);
          if (!startNumber || !endNumber) {
            commitLocationAtClickEnd();
            return;
          }
          const firstNumber = Math.min(startNumber, endNumber);
          const lastNumber = Math.max(startNumber, endNumber);
          const firstBlock = blocks.find((item) => item.blockNumber === firstNumber) ?? null;
          const lastBlock = blocks.find((item) => item.blockNumber === lastNumber) ?? null;
          if (!firstBlock || !lastBlock) {
            commitLocationAtClickEnd();
            return;
          }
          emitSelection({
            line: firstBlock.startLine,
            endLine: lastBlock.endLine,
            activeLine: firstBlock.startLine,
            label: `${firstBlock.startLine}${lastBlock.endLine !== firstBlock.startLine ? `-${lastBlock.endLine}` : ''}행 선택`,
          }, 'block-boundary', nextSelection.toString().trim());
          commitLocationAtClickEnd();
          return;
        }
        const selectedText = selection?.toString().trim() ?? '';

        if (_selectionMode === 'line') {
          if (!selectedText) {
            commitLocationAtClickEnd();
            return;
          }
          const pointerLine = resolveSourceLineFromPointer(
            containerRef.current,
            event.target as HTMLElement | null,
            event.clientY,
          );

          const pointerStart = anchorLine ?? pointerLine;
          const pointerEnd = pointerLine ?? anchorLine;
          if (pointerStart && pointerEnd) {
            const startLine = Math.min(pointerStart, pointerEnd);
            const endLine = Math.max(pointerStart, pointerEnd);
            emitSelection({
              line: startLine,
              endLine,
              activeLine: startLine,
              label: `${startLine}${endLine !== startLine ? `-${endLine}` : ''}행 선택`,
            }, 'line-pointer', selectedText);
            commitLocationAtClickEnd();
            return;
          }
          commitLocationAtClickEnd();
          return;
        }

        if (!selectedText) {
          commitLocationAtClickEnd();
          return;
        }

        if (autoCopyEnabled) {
          void writeClipboardText(buildClipboardPayload(selectedText));
        }

        console.log('[PreviewPane] selection', {
          mode: _selectionMode,
          text: selectedText,
        });
        commitLocationAtClickEnd();
      }}
    >
      {blocks.length ? (
        blocks.map((block) => (
          <div
            key={`${block.startLine}-${block.endLine}-${block.blockNumber}`}
            className="preview-html-block"
            data-block-number={block.blockNumber}
            data-start-line={block.startLine}
            data-end-line={block.endLine}
            onClick={(event) => {
              if (_selectionMode !== 'block') {
                return;
              }
              const target = event.target as HTMLElement | null;
              if (target?.closest('.preview-collapsed-heading')) {
                return;
              }

              const blockElement = event.currentTarget as HTMLElement;
              const startBoundary = findTextBoundaryInElement(blockElement, 'start');
              const endBoundary = findTextBoundaryInElement(blockElement, 'end');
              if (!startBoundary || !endBoundary) {
                return;
              }

              const selection = window.getSelection();
              if (!selection) {
                return;
              }
              const range = document.createRange();
              range.setStart(startBoundary.node, startBoundary.offset);
              range.setEnd(endBoundary.node, endBoundary.offset);
              selection.removeAllRanges();
              selection.addRange(range);

              emitSelection({
                line: block.startLine,
                endLine: block.endLine,
                activeLine: block.startLine,
                label: `${block.startLine}${block.endLine !== block.startLine ? `-${block.endLine}` : ''}행 선택`,
              }, 'block-click', selection.toString().trim());
            }}
          >
            <div className="preview-html-content" dangerouslySetInnerHTML={{ __html: block.html }} />
          </div>
        ))
      ) : (
        <div className="empty-stage">미리볼 내용이 없습니다.</div>
      )}

      {contextMenu ? (
        <div
          className="preview-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="preview-context-menu-item"
            onClick={() => {
              setAutoCopyEnabled((current) => !current);
              setContextMenu(null);
            }}
          >
            자동 복사: {autoCopyEnabled ? '활성' : '비활성'}
            <span className={`preview-context-menu-switch ${autoCopyEnabled ? 'is-on' : 'is-off'}`} aria-hidden="true">
              <span className="preview-context-menu-switch-label">{autoCopyEnabled ? 'ON' : 'OFF'}</span>
              <span className="preview-context-menu-switch-thumb" />
            </span>
          </button>
          <button
            className="preview-context-menu-item"
            onClick={() => {
              setColonBreakEnabled((current) => !current);
              setContextMenu(null);
            }}
          >
            콜론 줄바꿈: {colonBreakEnabled ? '활성' : '비활성'}
            <span className={`preview-context-menu-switch ${colonBreakEnabled ? 'is-on' : 'is-off'}`} aria-hidden="true">
              <span className="preview-context-menu-switch-label">{colonBreakEnabled ? 'ON' : 'OFF'}</span>
              <span className="preview-context-menu-switch-thumb" />
            </span>
          </button>
          <button
            className="preview-context-menu-item"
            onClick={() => {
              setStripNumberCopyEnabled((current) => !current);
              setContextMenu(null);
            }}
          >
            숫자 제거 복사: {stripNumberCopyEnabled ? '활성' : '비활성'}
            <span className={`preview-context-menu-switch ${stripNumberCopyEnabled ? 'is-on' : 'is-off'}`} aria-hidden="true">
              <span className="preview-context-menu-switch-label">{stripNumberCopyEnabled ? 'ON' : 'OFF'}</span>
              <span className="preview-context-menu-switch-thumb" />
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

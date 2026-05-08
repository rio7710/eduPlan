export type PreviewClipboardOptions = {
  stripNumbers?: boolean;
  stripLabels?: boolean;
};

const LEADING_LABEL_RE = /^\s*(?:\[[^\]\r\n]+\]\s*)+/u;
const LABEL_STRIP_TARGET_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, figcaption';
const LEADING_BRACKET_LABEL_RE = /^\s*(?:\[[^\]\r\n]+\]|\([^) \r\n][^)\r\n]{0,40}\)|\{[^}\r\n]+\}|<[^>\r\n]+>|【[^】\r\n]+】|〈[^〉\r\n]+〉|《[^》\r\n]+》|「[^」\r\n]+」|『[^』\r\n]+』)\s*[:：]?\s*/u;

function resolveElement(node: Node | null): Element | null {
  if (!node) {
    return null;
  }
  return node instanceof Element ? node : node.parentElement;
}

function buildSelectedTableFragment(range: Range, table: HTMLTableElement): DocumentFragment | null {
  const selectedRows = Array.from(table.querySelectorAll('tr')).filter((row) => range.intersectsNode(row));
  if (!selectedRows.length) {
    return null;
  }

  const fragment = document.createDocumentFragment();
  const tableClone = table.cloneNode(false) as HTMLTableElement;

  for (const child of Array.from(table.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const tagName = child.tagName.toLowerCase();
    if (tagName === 'thead' || tagName === 'tbody' || tagName === 'tfoot') {
      const sectionRows = Array.from(child.querySelectorAll<HTMLTableRowElement>(':scope > tr')).filter((row) => selectedRows.includes(row));
      if (!sectionRows.length) {
        continue;
      }
      const sectionClone = child.cloneNode(false) as HTMLElement;
      for (const row of sectionRows) {
        sectionClone.appendChild(row.cloneNode(true));
      }
      tableClone.appendChild(sectionClone);
      continue;
    }

    if (tagName === 'tr' && selectedRows.includes(child as HTMLTableRowElement)) {
      tableClone.appendChild(child.cloneNode(true));
      continue;
    }

    if (tagName === 'caption' || tagName === 'colgroup') {
      tableClone.appendChild(child.cloneNode(true));
    }
  }

  fragment.appendChild(tableClone);
  return fragment;
}

function buildSelectedCellFragment(range: Range, cell: HTMLTableCellElement): DocumentFragment {
  const cellRange = document.createRange();
  cellRange.selectNodeContents(cell);
  const fragment = document.createDocumentFragment();
  if (!range.intersectsNode(cell)) {
    return fragment;
  }

  const intersection = document.createRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, cellRange) <= 0) {
    intersection.setStart(cellRange.startContainer, cellRange.startOffset);
  } else {
    intersection.setStart(range.startContainer, range.startOffset);
  }

  if (range.compareBoundaryPoints(Range.END_TO_END, cellRange) >= 0) {
    intersection.setEnd(cellRange.endContainer, cellRange.endOffset);
  } else {
    intersection.setEnd(range.endContainer, range.endOffset);
  }

  fragment.appendChild(intersection.cloneContents());
  return fragment;
}

function buildStructuredTableFragment(range: Range, table: HTMLTableElement): DocumentFragment | null {
  const selectedRows = Array.from(table.querySelectorAll('tr')).filter((row) => range.intersectsNode(row));
  if (!selectedRows.length) {
    return null;
  }

  const fragment = document.createDocumentFragment();
  const tableClone = table.cloneNode(false) as HTMLTableElement;

  for (const child of Array.from(table.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const tagName = child.tagName.toLowerCase();
    if (tagName === 'caption' || tagName === 'colgroup') {
      tableClone.appendChild(child.cloneNode(true));
      continue;
    }

    const sourceRows =
      tagName === 'thead' || tagName === 'tbody' || tagName === 'tfoot'
        ? Array.from(child.querySelectorAll<HTMLTableRowElement>(':scope > tr'))
        : tagName === 'tr'
          ? [child as HTMLTableRowElement]
          : [];
    const relevantRows = sourceRows.filter((row) => selectedRows.includes(row));
    if (!relevantRows.length) {
      continue;
    }

    const sectionClone =
      tagName === 'tr'
        ? null
        : child.cloneNode(false) as HTMLElement;

    for (const row of relevantRows) {
      const rowClone = row.cloneNode(false) as HTMLTableRowElement;
      const cells = Array.from(row.children).filter(
        (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
      );

      for (const cell of cells) {
        const cellClone = cell.cloneNode(false) as HTMLTableCellElement;
        if (range.intersectsNode(cell)) {
          cellClone.appendChild(buildSelectedCellFragment(range, cell));
        }
        rowClone.appendChild(cellClone);
      }

      if (sectionClone) {
        sectionClone.appendChild(rowClone);
      } else {
        tableClone.appendChild(rowClone);
      }
    }

    if (sectionClone) {
      tableClone.appendChild(sectionClone);
    }
  }

  fragment.appendChild(tableClone);
  return fragment;
}

function applyInlineTableCopyStyles(fragment: DocumentFragment): void {
  for (const table of Array.from(fragment.querySelectorAll('table'))) {
    table.setAttribute('style', 'display:table; width:100%; border-collapse:collapse; clear:both; margin:16px 0;');
  }

  for (const headerCell of Array.from(fragment.querySelectorAll('th'))) {
    headerCell.setAttribute('style', 'border:1px solid #4a4a4a; padding:10px 12px; vertical-align:top;');
  }

  for (const cell of Array.from(fragment.querySelectorAll('td'))) {
    cell.setAttribute('style', 'border:1px solid #4a4a4a; padding:10px 12px; vertical-align:top;');
  }
}

function normalizeCopiedBlockStyles(fragment: DocumentFragment): void {
  for (const element of Array.from(fragment.querySelectorAll<HTMLElement>('*'))) {
    for (const attributeName of Array.from(element.getAttributeNames())) {
      if (attributeName === 'style') {
        continue;
      }
      if (attributeName === 'class' || attributeName.startsWith('data-')) {
        element.removeAttribute(attributeName);
      }
    }
  }

  const blockStyle = 'display:block; width:100%; margin:0 0 12px 0; font-size:22px; line-height:1.55; font-weight:400; white-space:normal;';
  const headingStyle = 'display:block; width:100%; margin:0 0 12px 0; font-size:24px; line-height:1.45; font-weight:700; white-space:normal;';

  for (const selector of ['p', 'div', 'blockquote', 'li']) {
    for (const element of Array.from(fragment.querySelectorAll<HTMLElement>(selector))) {
      element.setAttribute('style', blockStyle);
    }
  }

  for (const selector of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    for (const element of Array.from(fragment.querySelectorAll<HTMLElement>(selector))) {
      element.setAttribute('style', headingStyle);
    }
  }

  for (const list of Array.from(fragment.querySelectorAll<HTMLElement>('ul, ol'))) {
    list.setAttribute('style', 'display:block; width:100%; margin:0 0 12px 24px; padding:0; white-space:normal;');
  }
}

function hasMixedTableAndTextContent(fragment: DocumentFragment): boolean {
  const childNodes = Array.from(fragment.childNodes);
  if (!childNodes.length) {
    return false;
  }

  const hasTable = childNodes.some((node) => node instanceof HTMLTableElement);
  const hasNonTable = childNodes.some((node) =>
    (node instanceof HTMLElement && node.tagName.toLowerCase() !== 'table')
    || (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0));

  return hasTable && hasNonTable;
}

function stripLeadingNumbers(text: string): string {
  const leadingMarkerRe = /^\s*(?:(?:[-*+]|[•·●○■□▶▷▸▹])|(?:[①-⑳㉑-㉟㊱-㊿])|(?:\(\d+\))|(?:\[\d+\])|(?:\d+[.)])|(?:\d+(?:[.-]\d+)+))\s+/u;
  return text
    .split('\n')
    .map((line) => {
      let normalized = line;
      while (leadingMarkerRe.test(normalized)) {
        normalized = normalized.replace(leadingMarkerRe, '');
      }
      return normalized;
    })
    .join('\n');
}

function stripLeadingLabelsInLine(line: string): string {
  let normalized = line;
  while (LEADING_LABEL_RE.test(normalized) || LEADING_BRACKET_LABEL_RE.test(normalized)) {
    normalized = normalized
      .replace(LEADING_LABEL_RE, '')
      .replace(LEADING_BRACKET_LABEL_RE, '');
  }
  return normalized;
}

function stripLeadingCopyPrefixes(text: string, options: PreviewClipboardOptions): string {
  return text
    .split('\n')
    .map((line) => {
      let normalized = line;
      while (true) {
        const next = options.stripNumbers
          ? stripLeadingNumbers(options.stripLabels ? stripLeadingLabelsInLine(normalized) : normalized)
          : options.stripLabels
            ? stripLeadingLabelsInLine(normalized)
            : normalized;
        if (next === normalized) {
          return normalized;
        }
        normalized = next;
      }
    })
    .join('\n');
}

function stripLeadingPrefixesFromElement(element: HTMLElement, options: PreviewClipboardOptions): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    const content = textNode.textContent ?? '';
    if (!content.trim()) {
      currentNode = walker.nextNode();
      continue;
    }

    const stripped = stripLeadingCopyPrefixes(content, options);
    if (stripped !== content) {
      textNode.textContent = stripped;
    }
    return;
  }
}

function stripLeadingPrefixesFromFragment(fragment: DocumentFragment, options: PreviewClipboardOptions): void {
  for (const node of Array.from(fragment.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = stripLeadingCopyPrefixes(node.textContent ?? '', options);
      continue;
    }
    if (node instanceof HTMLElement) {
      const targets = [
        ...(node.matches(LABEL_STRIP_TARGET_SELECTOR) ? [node] : []),
        ...Array.from(node.querySelectorAll<HTMLElement>(LABEL_STRIP_TARGET_SELECTOR)),
      ];
      if (targets.length) {
        targets.forEach((target) => stripLeadingPrefixesFromElement(target, options));
        continue;
      }
      stripLeadingPrefixesFromElement(node, options);
    }
  }
}

function stripTrailingTerminalPeriodFromFragment(fragment: DocumentFragment): void {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  let lastTextNode: Text | null = null;

  while (currentNode) {
    const textNode = currentNode as Text;
    if ((textNode.textContent ?? '').trim()) {
      lastTextNode = textNode;
    }
    currentNode = walker.nextNode();
  }

  if (!lastTextNode) {
    return;
  }

  const content = lastTextNode.textContent ?? '';
  const stripped = content.replace(/\.\s*$/u, '');
  if (stripped !== content) {
    lastTextNode.textContent = stripped;
  }
}

function normalizeTableSelection(range: Range, fragment: DocumentFragment): DocumentFragment {
  const startElement = resolveElement(range.startContainer);
  const endElement = resolveElement(range.endContainer);
  const startTable = startElement?.closest('table') as HTMLTableElement | null;
  const endTable = endElement?.closest('table') as HTMLTableElement | null;
  if (startTable && endTable && startTable === endTable) {
    return buildStructuredTableFragment(range, startTable) ?? fragment;
  }

  if (fragment.querySelector('table') || !fragment.querySelector('tr')) {
    return fragment;
  }

  if (!startTable || !endTable || startTable !== endTable) {
    return fragment;
  }

  return buildSelectedTableFragment(range, startTable) ?? fragment;
}

function serializeTablePlainText(table: HTMLTableElement): string {
  return Array.from(table.querySelectorAll('tr'))
    .map((row) =>
      Array.from(row.querySelectorAll('th, td'))
        .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
        .join('\t'))
    .filter(Boolean)
    .join('\n');
}

function serializeNodePlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  if (node.tagName.toLowerCase() === 'table') {
    return serializeTablePlainText(node as HTMLTableElement);
  }

  const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  const blockLikeTags = new Set([
    'p', 'div', 'section', 'article', 'blockquote', 'pre',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  ]);

  return blockLikeTags.has(node.tagName.toLowerCase()) ? text : text;
}

function serializeFragmentPlainText(fragment: DocumentFragment, fallbackPlain: string): string {
  const lines = Array.from(fragment.childNodes)
    .map((node) => serializeNodePlainText(node))
    .filter(Boolean);

  return lines.length ? lines.join('\n') : fallbackPlain.trim();
}

function extractRenderedPlainText(wrapper: HTMLDivElement, fallbackPlain: string): string {
  if (!document.body) {
    return fallbackPlain.trim();
  }

  const host = document.createElement('div');
  host.setAttribute(
    'style',
    'position:fixed; left:-10000px; top:0; width:1200px; opacity:0; pointer-events:none; white-space:normal;',
  );
  host.appendChild(wrapper.cloneNode(true));
  document.body.appendChild(host);

  try {
    const rendered = host.innerText || host.textContent || fallbackPlain;
    return rendered.replace(/\r\n?/g, '\n').trim();
  } finally {
    document.body.removeChild(host);
  }
}

export function buildPreviewClipboardPayload(
  selection: Selection,
  options: PreviewClipboardOptions = {},
): { plain: string; html?: string } | null {
  if (!selection.rangeCount || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const fragment = normalizeTableSelection(range, range.cloneContents());
  if (options.stripLabels || options.stripNumbers) {
    stripLeadingPrefixesFromFragment(fragment, options);
  }
  stripTrailingTerminalPeriodFromFragment(fragment);
  normalizeCopiedBlockStyles(fragment);
  const hasMixedTableContent = hasMixedTableAndTextContent(fragment);
  const hasTable = Boolean(fragment.querySelector('table'));
  if (hasTable && !hasMixedTableContent) {
    applyInlineTableCopyStyles(fragment);
  }
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment.cloneNode(true));

  const html = wrapper.innerHTML.trim();
  const serializedPlain = hasTable && !hasMixedTableContent
    ? serializeFragmentPlainText(fragment, selection.toString())
    : extractRenderedPlainText(wrapper, selection.toString());
  const plain = stripLeadingCopyPrefixes(serializedPlain, options);
  if (!plain && !html) {
    return null;
  }

  return {
    plain,
    html: hasTable ? html || undefined : undefined,
  };
}

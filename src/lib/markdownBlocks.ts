export type MarkdownBlockRange = {
  startLine: number;
  endLine: number;
};

function isRule(line: string) {
  return /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

export function getMarkdownBlocks(markdownText: string) {
  const rawLines = markdownText.split(/\r?\n/);
  const blocks: MarkdownBlockRange[] = [];
  let startIndex: number | null = null;

  function pushBlock(endIndex: number) {
    if (startIndex === null || endIndex < startIndex) {
      return;
    }

    const blockLines = rawLines.slice(startIndex, endIndex + 1);
    const hasVisibleContent = blockLines.some((line) => line.trim());
    if (!hasVisibleContent) {
      return;
    }

    blocks.push({
      startLine: startIndex + 1,
      endLine: endIndex + 1,
    });
  }

  rawLines.forEach((rawLine, index) => {
    const isBlank = !rawLine.trim();
    const lineIsRule = isRule(rawLine);

    if (lineIsRule) {
      pushBlock(index - 1);
      startIndex = null;
      return;
    }

    if (!isBlank && startIndex === null) {
      startIndex = index;
    }

    if (startIndex === null || isBlank) {
      return;
    }

    let nextNonBlankIndex = -1;
    for (let cursor = index + 1; cursor < rawLines.length; cursor += 1) {
      if (rawLines[cursor]?.trim()) {
        nextNonBlankIndex = cursor;
        break;
      }
    }

    const nextNonBlankLine = nextNonBlankIndex >= 0 ? rawLines[nextNonBlankIndex] ?? '' : '';
    const nextIsRule = nextNonBlankIndex >= 0 && isRule(nextNonBlankLine);
    const endsBlock = nextNonBlankIndex === -1 || nextIsRule;

    if (!endsBlock) {
      return;
    }

    pushBlock(index);
    startIndex = null;
  });

  return blocks;
}

export function getMarkdownBlockForLine(markdownText: string, lineNumber: number) {
  if (!lineNumber) {
    return null;
  }

  return getMarkdownBlocks(markdownText).find(
    (block) => lineNumber >= block.startLine && lineNumber <= block.endLine,
  ) ?? null;
}

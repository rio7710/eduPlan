export type HeadingItem = {
  id: string;
  level: number;
  text: string;
  lineNumber: number;
};

export type HeadingSection = HeadingItem & {
  endLine: number;
};

export function extractHeadings(content: string): HeadingItem[] {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .map(({ line, index }) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return null;
      return {
        id: `heading-${index}`,
        level: match[1].length,
        text: match[2].trim(),
        lineNumber: index + 1,
      };
    })
    .filter((item): item is HeadingItem => Boolean(item));
}

export function getHeadingSections(content: string): HeadingSection[] {
  const lines = content.split(/\r?\n/);
  const headings = extractHeadings(content);

  return headings.map((heading, index) => {
    let endLine = lines.length;
    for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
      const candidate = headings[cursor];
      if (candidate.level <= heading.level) {
        endLine = candidate.lineNumber - 1;
        break;
      }
    }

    return {
      ...heading,
      endLine,
    };
  });
}

export function getCollapsedHeadingOwnerLine(
  content: string,
  lineNumber: number | null | undefined,
  collapsedHeadingLines: number[],
) {
  if (!lineNumber || !collapsedHeadingLines.length) {
    return lineNumber ?? null;
  }

  const sections = getHeadingSections(content);
  const owner = sections.find(
    (section) =>
      collapsedHeadingLines.includes(section.lineNumber) &&
      lineNumber > section.lineNumber &&
      lineNumber <= section.endLine,
  );

  return owner?.lineNumber ?? lineNumber;
}

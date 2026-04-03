export type HeadingItem = {
  level: number;
  text: string;
  lineNumber: number;
};

export function extractHeadings(content: string) {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .map(({ line, index }) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return null;
      return { level: match[1].length, text: match[2].trim(), lineNumber: index + 1 };
    })
    .filter((item): item is HeadingItem => Boolean(item));
}

export function getHeadingTrail(headings: HeadingItem[], activeLine: number | null) {
  if (!activeLine) return [];
  const trail: HeadingItem[] = [];
  headings.forEach((heading) => {
    if (heading.lineNumber > activeLine) return;
    while (trail.length && trail[trail.length - 1]!.level >= heading.level) trail.pop();
    trail.push(heading);
  });
  return trail;
}

export function truncateLabel(value: string, limit = 12) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

export function collectSiblingHeadings(headings: HeadingItem[], target: HeadingItem) {
  const parentByLine = new Map<number, number | null>();
  const stack: HeadingItem[] = [];
  for (const heading of headings) {
    while (stack.length && stack[stack.length - 1]!.level >= heading.level) stack.pop();
    parentByLine.set(heading.lineNumber, stack.length ? stack[stack.length - 1]!.lineNumber : null);
    stack.push(heading);
  }
  const targetParent = parentByLine.get(target.lineNumber) ?? null;
  return headings.filter((heading) =>
    heading.level === target.level
    && heading.lineNumber !== target.lineNumber
    && (parentByLine.get(heading.lineNumber) ?? null) === targetParent);
}

export function collectSiblingGroup(headings: HeadingItem[], target: HeadingItem) {
  return [target, ...collectSiblingHeadings(headings, target)].sort((a, b) => a.lineNumber - b.lineNumber);
}

export function buildSectionText(lines: string[], headings: HeadingItem[], heading: HeadingItem) {
  const nextHeading = headings.find((item) => item.lineNumber > heading.lineNumber && item.level <= heading.level);
  const endLine = nextHeading ? nextHeading.lineNumber - 1 : lines.length;
  return lines.slice(heading.lineNumber - 1, endLine).join('\n').trim();
}

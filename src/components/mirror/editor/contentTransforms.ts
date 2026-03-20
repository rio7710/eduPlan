import { marked } from 'marked';

type SourceBlock = {
  number: number;
  badge: string;
  badgeClass: string;
  rows: number;
  value: string;
};

function classifyBlock(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) {
    return { badge: 'H', badgeClass: '' };
  }
  if (trimmed.startsWith('![')) {
    return { badge: 'I', badgeClass: 'img' };
  }
  if (trimmed.includes('|') && trimmed.split('\n').length > 1) {
    return { badge: 'TB', badgeClass: 'tbl' };
  }
  return { badge: 'T', badgeClass: '' };
}

export function toMarkdownBlocks(content: string): SourceBlock[] {
  const chunks = content
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (!chunks.length) {
    return [{ number: 1, badge: 'T', badgeClass: '', rows: 1, value: '' }];
  }

  return chunks.map((value, index) => {
    const { badge, badgeClass } = classifyBlock(value);
    return {
      number: index + 1,
      badge,
      badgeClass,
      rows: Math.max(value.split('\n').length, 1),
      value,
    };
  });
}

export function toHtmlBlocks(content: string): SourceBlock[] {
  const html = marked.parse(content, { async: false }) as string;
  return [
    {
      number: 1,
      badge: 'HTML',
      badgeClass: '',
      rows: Math.max(html.split('\n').length, 1),
      value: html.trim(),
    },
  ];
}


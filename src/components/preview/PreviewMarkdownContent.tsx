import { memo, useEffect, useMemo, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

const IMAGE_LABEL_RE = /^\[이미지\s+\d+:\s*([^\]]+)\]\s*$/;
const IMAGE_LABEL_CAPTURE_RE = /\[이미지\s+\d+:\s*([^\]]+)\]/g;
const NUMBER_HIERARCHY_LEADER_RE = /^(?:[①-⑳㉑-㉟㊱-㊿⓵-⓾]|\(?\d+\)?[.)])\s*/;
const LEADING_RENDER_LABEL_RE = /^\s*(?:\[[^\]\s\r\n][^\]\r\n]{0,40}\]|\([^) \r\n][^)\r\n]{0,40}\)|\{[^}\r\n]+\}|【[^】\r\n]+】|〈[^〉\r\n]+〉|《[^》\r\n]+》|「[^」\r\n]+」|『[^』\r\n]+』)\s*[:：]?\s*/u;
const LEADING_RENDER_LABEL_TOKEN_RE = /^(?:\[[^\]\s\r\n][^\]\r\n]{0,40}\]|\([^) \r\n][^)\r\n]{0,40}\)|\{[^}\r\n]+\}|【[^】\r\n]+】|〈[^〉\r\n]+〉|《[^》\r\n]+》|「[^」\r\n]+」|『[^』\r\n]+』)\s*[:：]?\s*/u;

type HeadingLine = {
  level: number;
  lineNumber: number;
  text: string;
};

type Props = {
  markdownText: string;
  documentPath: string | null;
  headingLines: HeadingLine[];
  hideLabels?: boolean;
};

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlText(value: string) {
  return escapeHtmlAttribute(value);
}

function extractImageLabelsFromLine(line: string): string[] {
  const normalized = line.trim().replace(/^[.\-*\u25CB○]+\s*/, '');
  const matches = [...normalized.matchAll(IMAGE_LABEL_CAPTURE_RE)];
  if (!matches.length) {
    return [];
  }
  const residue = normalized.replace(IMAGE_LABEL_CAPTURE_RE, '').trim();
  if (residue) {
    return [];
  }
  return matches.map((match) => match[1].trim()).filter(Boolean);
}

function normalizeLabelTone(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) {
    return 'neutral';
  }
  if (/(목표|학습목표|도달목표)/u.test(normalized)) {
    return 'goal';
  }
  if (/(흐름|순서|로드맵|과정|단계)/u.test(normalized)) {
    return 'flow';
  }
  if (/(배경|도입|맥락)/u.test(normalized)) {
    return 'context';
  }
  if (/(개념|정의|원리|핵심)/u.test(normalized)) {
    return 'concept';
  }
  if (/(예시|사례|적용|실전|실습)/u.test(normalized)) {
    return 'example';
  }
  if (/(질문|활동|탐구|토의|생각)/u.test(normalized)) {
    return 'question';
  }
  if (/(주의|오답|오해|오류|경고)/u.test(normalized)) {
    return 'warning';
  }
  if (/(출처|참고자료|참고|링크)/u.test(normalized)) {
    return 'source';
  }
  if (/(요약|정리|결론|연결)/u.test(normalized)) {
    return 'summary';
  }
  if (/(표준|기준|규칙|절차|체크)/u.test(normalized)) {
    return 'standard';
  }
  return 'neutral';
}

function unwrapLabelToken(token: string) {
  return token.slice(1, -1).trim();
}

function splitLeadingRenderLabelsFromLine(line: string) {
  let rest = line;
  let prefix = '';
  const labels: string[] = [];

  const indentMatch = rest.match(/^(\s*)(.*)$/);
  if (indentMatch) {
    prefix += indentMatch[1];
    rest = indentMatch[2];
  }

  const quoteMatch = rest.match(/^((?:>\s*)+)(.*)$/);
  if (quoteMatch) {
    prefix += quoteMatch[1];
    rest = quoteMatch[2];
  }

  const headingMatch = rest.match(/^(#{1,6}\s+)(.*)$/);
  if (headingMatch) {
    prefix += headingMatch[1];
    rest = headingMatch[2];
  } else {
    const listMatch = rest.match(/^((?:[-*+]|(?:\d+[.)])|(?:[①-⑳㉑-㉟㊱-㊿⓵-⓾]))\s+)(.*)$/u);
    if (listMatch) {
      prefix += listMatch[1];
      rest = listMatch[2];
    }
  }

  while (true) {
    const labelMatch = rest.match(LEADING_RENDER_LABEL_TOKEN_RE);
    if (!labelMatch) {
      break;
    }
    const token = labelMatch[0].trim().replace(/[:：]\s*$/u, '').trim();
    const label = unwrapLabelToken(token);
    if (!label) {
      break;
    }
    labels.push(label);
    rest = rest.slice(labelMatch[0].length);
  }

  return {
    prefix,
    labels,
    body: rest.trim(),
  };
}

function stripLeadingRenderLabels(text: string) {
  let normalized = text;
  while (LEADING_RENDER_LABEL_RE.test(normalized)) {
    normalized = normalized.replace(LEADING_RENDER_LABEL_RE, '');
  }
  return normalized;
}

function stripLeadingRenderLabelsFromLine(line: string) {
  const { prefix, labels, body } = splitLeadingRenderLabelsFromLine(line);
  const stripped = labels.length > 0 ? body : stripLeadingRenderLabels(line).trim();
  if (!stripped) {
    return '';
  }
  return prefix + stripped;
}

function renderLeadingRenderLabelsFromLine(line: string) {
  const { prefix, labels, body } = splitLeadingRenderLabelsFromLine(line);
  if (labels.length === 0) {
    return line;
  }
  const labelHtml = labels
    .map((label) => {
      const tone = normalizeLabelTone(label);
      return `<span class="preview-leading-label-pill tone-${tone}" data-preview-leading-label="${escapeHtmlAttribute(label)}">${escapeHtmlText(label)}</span>`;
    })
    .join('');
  const suffix = body ? ` ${body}` : '';
  return `${prefix}<span class="preview-leading-label-row">${labelHtml}</span>${suffix}`;
}

function buildPreviewMarkdownWithOptions(markdownText: string, hideLabels: boolean) {
  const lines = markdownText.split(/\r?\n/);
  const normalizedLines: string[] = [];
  let inTableBlock = false;
  let inCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isFenceLine = /^(```|~~~)/.test(trimmed);

    if (isFenceLine) {
      inCodeFence = !inCodeFence;
      normalizedLines.push(line);
      continue;
    }

    if (inCodeFence) {
      normalizedLines.push(line);
      continue;
    }

    if (trimmed.toLowerCase().startsWith('<table')) {
      inTableBlock = true;
    }

    if (inTableBlock) {
      if (trimmed) {
        normalizedLines.push(trimmed);
      }
      if (trimmed.toLowerCase().endsWith('</table>')) {
        inTableBlock = false;
      }
      continue;
    }

    const imageLabels = extractImageLabelsFromLine(line);
    if (imageLabels.length > 0) {
      normalizedLines.push(
        imageLabels
          .map((label, index) => {
            const escaped = escapeHtmlAttribute(label);
            return `<figure class="preview-inline-image"><img src="${escaped}" alt="${escaped}" style="max-width:100%;height:auto;border-radius:8px;" /><figcaption>[이미지 ${index + 1}: ${escaped}]</figcaption></figure>`;
          })
          .join('\n'),
      );
      continue;
    }

    const visibleLine = hideLabels ? stripLeadingRenderLabelsFromLine(line) : renderLeadingRenderLabelsFromLine(line);
    normalizedLines.push(visibleLine ? `${visibleLine}  ` : '');
  }

  return normalizedLines.join('\n');
}

function getNodeLine(node: { position?: { start?: { line?: number } } } | undefined) {
  return node?.position?.start?.line;
}

function resolveHeadingAnchorLevel(headingLines: HeadingLine[], lineNumber: number | undefined) {
  if (!lineNumber) {
    return null;
  }
  const match = [...headingLines].reverse().find((item) => item.lineNumber <= lineNumber);
  return match?.level ?? null;
}

function resolveHeadingIndentVar(level: number | null) {
  if (!level) {
    return '0px';
  }
  const normalized = Math.max(1, Math.min(6, level));
  return `var(--preview-h${normalized}-indent)`;
}

function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(flattenText).join('');
  }
  if (typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props?: { children?: ReactNode } }).props?.children ?? '');
  }
  return '';
}

function toFileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return encodeURI(`file:///${normalized}`);
}

function toWindowsPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return normalized.replace(/\//g, '\\');
  }
  return filePath;
}

function fromFileUrlToPath(fileUrl: string) {
  try {
    const parsed = new URL(fileUrl);
    let pathname = decodeURIComponent(parsed.pathname || '');
    if (/^\/[a-zA-Z]:\//.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return toWindowsPath(pathname);
  } catch {
    return '';
  }
}

function resolveImageSource(rawPath: string, documentPath: string | null) {
  const trimmed = rawPath.trim().replace(/^<|>$/g, '');
  const normalized = trimmed.replace(/\\/g, '/');

  if (/^file:\/\//i.test(normalized)) {
    return { src: encodeURI(normalized), filePath: fromFileUrlToPath(normalized) };
  }
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return { src: toFileUrl(normalized), filePath: toWindowsPath(normalized) };
  }
  if (normalized.startsWith('/')) {
    return { src: encodeURI(`file://${normalized}`), filePath: toWindowsPath(normalized) };
  }
  if (!documentPath) {
    return { src: normalized, filePath: '' };
  }

  const baseDir = documentPath.replace(/\\/g, '/').replace(/\/[^/]*$/, '');
  const absolute = `${baseDir}/${normalized}`;
  return { src: toFileUrl(absolute), filePath: toWindowsPath(absolute) };
}

function PreviewResolvedImage({
  rawPath,
  alt,
  documentPath,
  imgProps,
}: {
  rawPath: string;
  alt: string;
  documentPath: string | null;
  imgProps?: ImgHTMLAttributes<HTMLImageElement>;
}) {
  const resolved = useMemo(() => resolveImageSource(rawPath, documentPath), [rawPath, documentPath]);
  const [loadedImage, setLoadedImage] = useState<{ filePath: string; dataUrl: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!resolved.filePath || !window.eduFixerApi?.readImageDataUrl) {
      return () => {
        cancelled = true;
      };
    }
    void window.eduFixerApi.readImageDataUrl(resolved.filePath)
      .then((value) => {
        if (!cancelled && value) {
          setLoadedImage({ filePath: resolved.filePath, dataUrl: value });
        }
      })
      .catch(() => {
        // keep src fallback
      });
    return () => {
      cancelled = true;
    };
  }, [resolved.filePath]);

  const dataUrl = loadedImage?.filePath === resolved.filePath ? loadedImage.dataUrl : null;
  return <img {...imgProps} src={dataUrl ?? resolved.src} alt={alt} />;
}

export const PreviewMarkdownContent = memo(function PreviewMarkdownContent({
  markdownText,
  documentPath,
  headingLines,
  hideLabels = false,
}: Props) {
  const previewMarkdown = buildPreviewMarkdownWithOptions(markdownText, hideLabels);
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeRaw]}
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) => url}
      components={{
        h1: ({ node, ...props }) => {
          const line = getNodeLine(node) ?? headingLines.find((item) => item.level === 1 && item.text === String(props.children ?? '').trim())?.lineNumber;
          return <h1 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
        },
        h2: ({ node, ...props }) => {
          const line = getNodeLine(node) ?? headingLines.find((item) => item.level === 2 && item.text === String(props.children ?? '').trim())?.lineNumber;
          return <h2 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
        },
        h3: ({ node, ...props }) => {
          const line = getNodeLine(node) ?? headingLines.find((item) => item.level === 3 && item.text === String(props.children ?? '').trim())?.lineNumber;
          return <h3 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
        },
        h4: ({ node, ...props }) => {
          const line = getNodeLine(node) ?? headingLines.find((item) => item.level === 4 && item.text === String(props.children ?? '').trim())?.lineNumber;
          return <h4 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
        },
        h5: ({ node, ...props }) => {
          const line = getNodeLine(node) ?? headingLines.find((item) => item.level === 5 && item.text === String(props.children ?? '').trim())?.lineNumber;
          return <h5 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
        },
        h6: ({ node, ...props }) => {
          const line = getNodeLine(node) ?? headingLines.find((item) => item.level === 6 && item.text === String(props.children ?? '').trim())?.lineNumber;
          return <h6 className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} {...props} />;
        },
        p: ({ node, ...props }) => {
          const paragraphText = flattenText(props.children).trim();
          const normalizedParagraphText = paragraphText.replace(/^\s*[.]\s*/, '');
          const line = getNodeLine(node);
          const anchorLevel = resolveHeadingAnchorLevel(headingLines, line);
          const hierarchyAlignedStyle = NUMBER_HIERARCHY_LEADER_RE.test(normalizedParagraphText)
            ? { marginLeft: resolveHeadingIndentVar(anchorLevel) }
            : undefined;
          const imageMatch = normalizedParagraphText.match(IMAGE_LABEL_RE);
          if (imageMatch) {
            return (
              <figure className="preview-inline-image preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined}>
                <PreviewResolvedImage
                  rawPath={imageMatch[1]}
                  alt={normalizedParagraphText}
                  documentPath={documentPath}
                  imgProps={{ style: { maxWidth: '100%', height: 'auto', borderRadius: '8px' } }}
                />
                <figcaption>{normalizedParagraphText}</figcaption>
              </figure>
            );
          }
          const inlineLabelRe = /\[이미지\s+\d+:\s*([^\]]+)\]/g;
          const inlineMatches = [...normalizedParagraphText.matchAll(inlineLabelRe)];
          if (inlineMatches.length > 0) {
            const stripped = normalizedParagraphText.replace(/\[이미지\s+\d+:\s*([^\]]+)\]/g, '').trim();
            if (!stripped) {
              return (
                <>
                  {inlineMatches.map((match, index) => (
                    <figure
                      key={`${match[1]}-${index}`}
                      className="preview-inline-image preview-line-target"
                      data-preview-line-target="true"
                      data-preview-select-root="true"
                      data-render-line={line ?? undefined}
                    >
                      <PreviewResolvedImage
                        rawPath={match[1]}
                        alt={match[0]}
                        documentPath={documentPath}
                        imgProps={{ style: { maxWidth: '100%', height: 'auto', borderRadius: '8px' } }}
                      />
                      <figcaption>{match[0]}</figcaption>
                    </figure>
                  ))}
                </>
              );
            }
          }
          return <p className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={line ?? undefined} style={hierarchyAlignedStyle} {...props} />;
        },
        li: ({ node, ...props }) => <li className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={getNodeLine(node) ?? undefined} {...props} />,
        blockquote: ({ node, ...props }) => <blockquote className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={getNodeLine(node) ?? undefined} {...props} />,
        ul: ({ node, ...props }) => {
          const line = getNodeLine(node);
          const anchorLevel = resolveHeadingAnchorLevel(headingLines, line);
          return (
            <ul
              style={{
                marginLeft: resolveHeadingIndentVar(anchorLevel),
                paddingLeft: 'calc(1.45em + var(--preview-ul-indent))',
              }}
              {...props}
            />
          );
        },
        ol: ({ node, ...props }) => {
          const line = getNodeLine(node);
          const anchorLevel = resolveHeadingAnchorLevel(headingLines, line);
          return (
            <ol
              style={{
                marginLeft: resolveHeadingIndentVar(anchorLevel),
                paddingLeft: 'calc(1.45em + var(--preview-ol-indent))',
              }}
              {...props}
            />
          );
        },
        table: ({ ...props }) => <table data-preview-select-root="true" data-preview-table-root="true" {...props} />,
        tr: ({ node, ...props }) => <tr className="preview-line-target" data-preview-line-target="true" data-preview-table-row="true" data-render-line={getNodeLine(node) ?? undefined} {...props} />,
        img: ({ src, alt, ...props }) => {
          const safeAlt = typeof alt === 'string' ? alt : '';
          return <PreviewResolvedImage rawPath={String(src ?? '')} alt={safeAlt} documentPath={documentPath} imgProps={props} />;
        },
      }}
    >
      {previewMarkdown}
    </ReactMarkdown>
  );
}, (prev, next) =>
  prev.markdownText === next.markdownText
  && prev.documentPath === next.documentPath
  && prev.headingLines === next.headingLines
  && prev.hideLabels === next.hideLabels);

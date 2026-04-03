import { memo, useEffect, useMemo, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

const IMAGE_LABEL_RE = /^\[이미지\s+\d+:\s*([^\]]+)\]\s*$/;
const IMAGE_LABEL_CAPTURE_RE = /\[이미지\s+\d+:\s*([^\]]+)\]/g;
const NUMBER_HIERARCHY_LEADER_RE = /^(?:[①-⑳㉑-㉟㊱-㊿⓵-⓾]|\(?\d+\)?[.)])\s*/;

type HeadingLine = {
  level: number;
  lineNumber: number;
  text: string;
};

type Props = {
  markdownText: string;
  documentPath: string | null;
  headingLines: HeadingLine[];
};

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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

function buildPreviewMarkdown(markdownText: string) {
  return markdownText
    .split(/\r?\n/)
    .map((line) => {
      const imageLabels = extractImageLabelsFromLine(line);
      if (imageLabels.length > 0) {
        return imageLabels
          .map((label, index) => {
            const escaped = escapeHtmlAttribute(label);
            return `<figure class="preview-inline-image"><img src="${escaped}" alt="${escaped}" style="max-width:100%;height:auto;border-radius:8px;" /><figcaption>[이미지 ${index + 1}: ${escaped}]</figcaption></figure>`;
          })
          .join('\n');
      }
      return line ? `${line}  ` : '';
    })
    .join('\n');
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
}: Props) {
  const previewMarkdown = buildPreviewMarkdown(markdownText);
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
  && prev.headingLines === next.headingLines);

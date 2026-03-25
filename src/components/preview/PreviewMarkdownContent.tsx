import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type HeadingLine = {
  level: number;
  lineNumber: number;
  text: string;
};

type Props = {
  markdownText: string;
  headingLines: HeadingLine[];
};

function getNodeLine(node: { position?: { start?: { line?: number } } } | undefined) {
  return node?.position?.start?.line;
}

export const PreviewMarkdownContent = memo(function PreviewMarkdownContent({
  markdownText,
  headingLines,
}: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
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
        p: ({ node, ...props }) => <p className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={getNodeLine(node) ?? undefined} {...props} />,
        li: ({ node, ...props }) => <li className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={getNodeLine(node) ?? undefined} {...props} />,
        blockquote: ({ node, ...props }) => <blockquote className="preview-line-target" data-preview-line-target="true" data-preview-select-root="true" data-render-line={getNodeLine(node) ?? undefined} {...props} />,
        table: ({ node, ...props }) => <table data-preview-select-root="true" data-preview-table-root="true" {...props} />,
        tr: ({ node, ...props }) => <tr className="preview-line-target" data-preview-line-target="true" data-preview-table-row="true" data-render-line={getNodeLine(node) ?? undefined} {...props} />,
      }}
    >
      {markdownText}
    </ReactMarkdown>
  );
}, (prev, next) => prev.markdownText === next.markdownText && prev.headingLines === next.headingLines);

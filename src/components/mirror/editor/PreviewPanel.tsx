import DOMPurify from 'dompurify';
import { marked } from 'marked';

type Props = {
  document: ShellDocument | null;
};

export function PreviewPanel({ document }: Props) {
  const html = document?.content
    ? DOMPurify.sanitize(marked.parse(document.content, { async: false }) as string)
    : '<h1>2024학년도 1학기 수업 계획서</h1><p>본 수업 계획서는 2024학년도 1학기 동안 진행될 교육 과정의 전반적인 내용을 담고 있습니다.</p>';

  return (
    <div className="editor-mode-panel active" id="panel-mode-preview">
      <div className="preview-wrap">
        <div className="preview-page">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

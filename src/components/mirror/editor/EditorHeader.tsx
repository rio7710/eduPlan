type Props = {
  document: ShellDocument | null;
};

export function EditorHeader({ document }: Props) {
  const fileName = document?.fileName ?? '문서 제목.md';
  const confirmedName = fileName.replace(/\.[^.]+$/, '');

  return (
    <div className="editor-toolbar">
      <div className="toolbar-left">
        <div className="doc-title-stack">
          <span className="doc-title-display" id="editor-doc-title">{fileName}</span>
          <div className="doc-subline">
            <span className="doc-confirmed-name" id="editor-doc-confirmed">{`확정명: ${confirmedName}`}</span>
          </div>
        </div>
      </div>
      <div className="toolbar-right">
        <button className="btn btn-ghost btn-sm" title="되돌리기 (Ctrl+Z)">↩</button>
        <button className="btn btn-ghost btn-sm" title="다시실행 (Ctrl+Y)">↪</button>
        <div className="toolbar-sep"></div>
        <button className="btn btn-ghost btn-sm" title="MD 내보내기">⬇ MD</button>
        <button className="btn btn-primary btn-sm" id="btn-save" title="저장 (Ctrl+S)">💾 저장</button>
      </div>
    </div>
  );
}

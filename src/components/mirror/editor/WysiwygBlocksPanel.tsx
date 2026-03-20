import { wysiwygBlocks } from './editorData';

export function WysiwygBlocksPanel() {
  return (
    <div className="editor-mode-panel active" id="panel-mode-wysiwyg">
      <div className="block-editor" id="block-editor">
        {wysiwygBlocks.map((block) => (
          <div key={block.id} className="block-wrap" id={block.id}>
            <div className="source-block-gutter">
              <div className="sbg-line sbg-first">
                <span className="block-num">{block.number}</span>
                <span className={`block-type-badge ${block.badgeClass}`.trim()}>{block.badge}</span>
                <span className="sbg-lnum">1</span>
              </div>
            </div>
            <div className="block-drag-handle">⠿</div>
            <div className={`block-content ${block.contentClass}`.trim()}>
              {block.contentClass === 'image-block' ? (
                <div className="image-placeholder">
                  <span className="img-icon">🖼</span>
                  <span className="img-label">{block.content}</span>
                  <span className="img-meta">1200×800 · 245KB</span>
                </div>
              ) : block.contentClass === 'table-block' ? (
                <table className="block-table">
                  <thead>
                    <tr><th>주차</th><th>단원</th><th>학습 목표</th><th>평가</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>1주</td><td>오리엔테이션</td><td>학습 목표 및 계획 이해</td><td>-</td></tr>
                    <tr><td>2주</td><td>기초 개념</td><td>핵심 개념 파악</td><td>형성평가</td></tr>
                    <tr><td>3주</td><td>심화 학습</td><td>응용 능력 향상</td><td>수행평가</td></tr>
                    <tr><td>4주</td><td>정리 및 평가</td><td>전체 내용 정리</td><td>총괄평가</td></tr>
                  </tbody>
                </table>
              ) : (
                block.content
              )}
            </div>
            <div className="block-toolbar">
              <button className="btool">✂</button>
              <button className="btool">⊕</button>
              <button className="btool danger">🗑</button>
            </div>
          </div>
        ))}
        <div className="add-block-row">
          <button className="add-block-btn">+ 블록 추가</button>
        </div>
      </div>
    </div>
  );
}

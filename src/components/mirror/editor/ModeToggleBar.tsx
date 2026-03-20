import type { EditorMode, PreviewSelectionMode } from '@/App';
import { DelayedTooltip } from '@/components/ui/DelayedTooltip';

type Props = {
  editorMode: EditorMode;
  onChangeMode: (mode: EditorMode) => void;
  autoWrap: boolean;
  onToggleAutoWrap: () => void;
  previewSelectionMode: PreviewSelectionMode;
  onChangePreviewSelectionMode: (mode: PreviewSelectionMode) => void;
  document: ShellDocument | null;
};

export function ModeToggleBar({
  editorMode,
  onChangeMode,
  autoWrap,
  onToggleAutoWrap,
  previewSelectionMode,
  onChangePreviewSelectionMode,
  document,
}: Props) {
  const blockCount = document?.blockCount ?? 6;
  const selectionModeLabel =
    previewSelectionMode === 'block'
      ? '블록 선택'
      : previewSelectionMode === 'line'
        ? '라인 선택'
        : '문자 선택';

  return (
    <div className="mode-togglebar">
      <div className="mode-toggle-group">
        <div className="mode-pair">
          <DelayedTooltip content="Markdown 편집 모드">
            <button className={`mode-btn ${editorMode === 'markdown' ? 'active' : ''}`} id="mode-markdown" onClick={() => onChangeMode('markdown')}><span className="mode-icon">MD</span> Edit</button>
          </DelayedTooltip>
          <DelayedTooltip content="미리보기 모드">
            <button className={`mode-btn ${editorMode === 'preview' ? 'active' : ''}`} id="mode-preview" onClick={() => onChangeMode('preview')}><span className="mode-icon">👁</span> 보기</button>
          </DelayedTooltip>
        </div>
        <div className="mode-pair-sep"></div>
        <div className="mode-pair">
          <DelayedTooltip content="WYSIWYG 편집 모드">
            <button className={`mode-btn ${editorMode === 'wysiwyg' ? 'active' : ''}`} id="mode-wysiwyg" onClick={() => onChangeMode('wysiwyg')}><span className="mode-icon">✏️</span> WYSIWYG</button>
          </DelayedTooltip>
          <DelayedTooltip content="HTML 보기 모드">
            <button className={`mode-btn ${editorMode === 'html' ? 'active' : ''}`} id="mode-html" onClick={() => onChangeMode('html')}><span className="mode-icon">&lt;/&gt;</span> HTML</button>
          </DelayedTooltip>
          <DelayedTooltip content="자동 줄바꿈 전환">
            <button className={`mode-btn ${autoWrap ? 'active' : ''}`} id="mode-autowrap" onClick={onToggleAutoWrap}><span className="mode-icon">↵</span> 오토워프</button>
          </DelayedTooltip>
        </div>
      </div>
      <div className="mode-info" id="mode-info">
        {editorMode === 'preview' ? (
          <div className="preview-selection-switch" role="tablist" aria-label="보기 선택 방식">
            <DelayedTooltip content="구분선 블록 단위 선택">
              <button
                className={`mode-btn compact ${previewSelectionMode === 'block' ? 'active' : ''}`}
                onClick={() => onChangePreviewSelectionMode('block')}
              >
                블록 선택
              </button>
            </DelayedTooltip>
            <DelayedTooltip content="보이는 줄 단위 선택">
              <button
                className={`mode-btn compact ${previewSelectionMode === 'line' ? 'active' : ''}`}
                onClick={() => onChangePreviewSelectionMode('line')}
              >
                라인 선택
              </button>
            </DelayedTooltip>
            <DelayedTooltip content="일반 텍스트 드래그 선택">
              <button
                className={`mode-btn compact ${previewSelectionMode === 'text' ? 'active' : ''}`}
                onClick={() => onChangePreviewSelectionMode('text')}
              >
                문자 선택
              </button>
            </DelayedTooltip>
          </div>
        ) : null}
        <span className="mode-current-label" id="editor-doc-meta">
          {editorMode === 'preview' ? `현재: ${selectionModeLabel} · ` : ''}
          {`블록 ${blockCount}개 · 잠시대기`}
        </span>
      </div>
    </div>
  );
}

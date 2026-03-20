type Props = {
  onOpenUpload: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export function TitleBar({ onOpenUpload, onOpenFile, onOpenFolder, onSave, onSaveAs }: Props) {
  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <span className="titlebar-icon">📚</span>
        <span className="titlebar-title">eduPlan</span>
        <div className="titlebar-menubar">
          <div className="title-menu">
            <button className="title-menu-btn">파일(F)</button>
            <div className="title-menu-dropdown">
              <button className="title-menu-item" onClick={onOpenUpload}>새 문서</button>
              <button className="title-menu-item" onClick={onOpenFile}>파일 열기</button>
              <button className="title-menu-item" onClick={onOpenFolder}>폴더 열기</button>
              <div className="title-menu-separator"></div>
              <button className="title-menu-item" onClick={onSave}>저장 Ctrl+S</button>
              <button className="title-menu-item" onClick={onSaveAs}>다른 이름으로 저장 Ctrl+Shift+S</button>
            </div>
          </div>
          <div className="title-menu">
            <button className="title-menu-btn">편집(E)</button>
            <div className="title-menu-dropdown">
              <button className="title-menu-item">되돌리기</button>
              <button className="title-menu-item">다시 실행</button>
              <div className="title-menu-separator"></div>
              <button className="title-menu-item">찾기</button>
              <button className="title-menu-item">바꾸기</button>
            </div>
          </div>
        </div>
      </div>
      <div className="titlebar-center">eduPlan - 교육안 작성 도구</div>
      <div className="titlebar-right">
        <button
          type="button"
          className="win-btn"
          aria-label="최소화"
          onClick={() => window.eduFixerApi?.minimizeWindow()}
        >
          <span className="win-btn-icon minimize" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="win-btn"
          aria-label="최대화 또는 복원"
          onClick={() => window.eduFixerApi?.maximizeToggle()}
        >
          <span className="win-btn-icon maximize" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="win-btn close"
          aria-label="닫기"
          onClick={() => window.eduFixerApi?.closeWindow()}
        >
          <span className="win-btn-icon close" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

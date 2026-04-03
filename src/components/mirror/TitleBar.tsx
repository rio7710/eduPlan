import { useEffect, useRef, useState } from 'react';

type Props = {
  onOpenUpload: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFind: () => void;
  onReplace: () => void;
  canSave: boolean;
  canEdit: boolean;
};

export function TitleBar({
  onOpenUpload,
  onOpenFile,
  onOpenFolder,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onFind,
  onReplace,
  canSave,
  canEdit,
}: Props) {
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const runMenuAction = (action: () => void) => () => {
    setOpenMenu(null);
    action();
  };

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <span className="titlebar-icon">📚</span>
        <span className="titlebar-title">edufixer</span>
        <div className="titlebar-menubar" ref={menuRootRef}>
          <div className={`title-menu ${openMenu === 'file' ? 'is-open' : ''}`}>
            <button
              type="button"
              className="title-menu-btn"
              aria-expanded={openMenu === 'file'}
              onClick={() => setOpenMenu((prev) => (prev === 'file' ? null : 'file'))}
            >
              파일(F)
            </button>
            <div className="title-menu-dropdown">
              <button type="button" className="title-menu-item" onClick={runMenuAction(onOpenFile)}>
                <span>파일 열기</span>
                <span className="title-menu-shortcut">Ctrl+O</span>
              </button>
              <button type="button" className="title-menu-item" onClick={runMenuAction(onOpenFolder)}>
                <span>폴더 열기</span>
                <span className="title-menu-shortcut">Ctrl+Shift+O</span>
              </button>
              <div className="title-menu-separator"></div>
              <button type="button" className="title-menu-item" onClick={runMenuAction(onSave)} disabled={!canSave}>
                <span>저장</span>
                <span className="title-menu-shortcut">Ctrl+S</span>
              </button>
              <button type="button" className="title-menu-item" onClick={runMenuAction(onSaveAs)} disabled={!canSave}>
                <span>다른 이름으로 저장</span>
                <span className="title-menu-shortcut">Ctrl+Shift+S</span>
              </button>
            </div>
          </div>
          <div className={`title-menu ${openMenu === 'edit' ? 'is-open' : ''}`}>
            <button
              type="button"
              className="title-menu-btn"
              aria-expanded={openMenu === 'edit'}
              disabled={!canEdit}
              onClick={() => setOpenMenu((prev) => (prev === 'edit' ? null : 'edit'))}
            >
              편집(E)
            </button>
            <div className="title-menu-dropdown">
              <button type="button" className="title-menu-item" onClick={runMenuAction(onUndo)} disabled={!canEdit}>
                <span>되돌리기</span>
                <span className="title-menu-shortcut">Ctrl+Z</span>
              </button>
              <button type="button" className="title-menu-item" onClick={runMenuAction(onRedo)} disabled={!canEdit}>
                <span>다시 실행</span>
                <span className="title-menu-shortcut">Ctrl+Y</span>
              </button>
              <div className="title-menu-separator"></div>
              <button type="button" className="title-menu-item" onClick={runMenuAction(onFind)} disabled={!canEdit}>
                <span>찾기</span>
                <span className="title-menu-shortcut">Ctrl+F</span>
              </button>
              <button type="button" className="title-menu-item" onClick={runMenuAction(onReplace)} disabled={!canEdit}>
                <span>바꾸기</span>
                <span className="title-menu-shortcut">Ctrl+H</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="titlebar-center">eduFixer for enaru.net</div>
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

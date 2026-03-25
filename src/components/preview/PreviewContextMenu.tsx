type PreviewContextMenuProps = {
  x: number;
  y: number;
  autoCopy: boolean;
  stripNumbers: boolean;
  onCopy: () => void;
  onToggleAutoCopy: () => void;
  onToggleStripNumbers: () => void;
};

function Toggle({
  enabled,
}: {
  enabled: boolean;
}) {
  return (
    <span className={`preview-context-menu-switch ${enabled ? 'is-on' : 'is-off'}`}>
      <span className="preview-context-menu-switch-thumb" aria-hidden="true" />
      <span className="preview-context-menu-switch-label">{enabled ? 'ON' : 'OFF'}</span>
    </span>
  );
}

export function PreviewContextMenu({
  x,
  y,
  autoCopy,
  stripNumbers,
  onCopy,
  onToggleAutoCopy,
  onToggleStripNumbers,
}: PreviewContextMenuProps) {
  return (
    <div
      className="preview-context-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label="렌더 복사 메뉴"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" className="preview-context-menu-item" role="menuitem" onClick={onCopy}>
        <span>복사</span>
      </button>
      <div className="preview-context-menu-separator" aria-hidden="true" />
      <button type="button" className="preview-context-menu-item" role="menuitemcheckbox" aria-checked={autoCopy} onClick={onToggleAutoCopy}>
        <span>자동 복사</span>
        <Toggle enabled={autoCopy} />
      </button>
      <button type="button" className="preview-context-menu-item" role="menuitemcheckbox" aria-checked={stripNumbers} onClick={onToggleStripNumbers}>
        <span>숫자 제거</span>
        <Toggle enabled={stripNumbers} />
      </button>
    </div>
  );
}

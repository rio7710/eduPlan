type Props = {
  theme: 'dark' | 'light';
  focusOwnerLabel: string;
  selectionModeLabel: string;
  selectionStatusLabel: string;
  onToggleTheme: () => void;
};

export function StatusBar({ theme, focusOwnerLabel, selectionModeLabel, selectionStatusLabel, onToggleTheme }: Props) {
  return (
    <div className="statusbar">
      <div className="status-left">
        <span className="status-item sync-indicator" id="sync-indicator">
          <span className="status-dot synced" id="status-dot"></span>
          <span id="status-sync-text">동기화됨</span>
        </span>
        <span className="status-sep">|</span>
        <span className="status-item" id="status-model">🤖 로컬 (Ollama)</span>
      </div>
      <div className="status-right">
        <span className="status-item" id="status-doc-info">블록 0개</span>
        <span className="status-sep">|</span>
        <span className="status-item">{selectionModeLabel}</span>
        <span className="status-sep">|</span>
        <span className="status-item">{selectionStatusLabel}</span>
        <span className="status-sep">|</span>
        <span className="status-item status-focus-cell">포커스: {focusOwnerLabel}</span>
        <span className="status-sep">|</span>
        <button type="button" className="status-item status-toggle" onClick={onToggleTheme}>
          {theme === 'dark' ? '다크 모드' : '라이트 모드'}
        </button>
        <span className="status-sep">|</span>
        <span className="status-item">팀: 3명 접속 중</span>
        <span className="status-sep">|</span>
        <span className="status-item">UTF-8</span>
        <span className="status-sep">|</span>
        <span className="status-item lamp-indicator" id="status-lamp-indicator">
          <span className="status-dot lamp" id="status-lamp-dot"></span>
          <span id="status-lamp-text">램프 블럭 초기화(함수명)</span>
        </span>
      </div>
    </div>
  );
}

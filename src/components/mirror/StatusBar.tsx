export function StatusBar() {
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
        <span className="status-item">팀: 3명 접속 중</span>
        <span className="status-sep">|</span>
        <span className="status-item">UTF-8</span>
      </div>
    </div>
  );
}

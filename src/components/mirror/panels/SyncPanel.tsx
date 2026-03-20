type Props = {
  status: SyncStatus | null;
};

export function SyncPanel({ status }: Props) {
  return (
    <div className="panel active" id="panel-sync">
      <div className="panel-header"><span>동기화 상태</span></div>
      <div className="panel-body">
        <div className="sync-list">
          <div className="sync-item"><span className={`sync-dot ${status?.sqliteConnected ? 'ok' : 'muted'}`} />로컬 SQLite {status?.sqliteConnected ? '연결됨' : '대기'}</div>
          <div className="sync-item"><span className={`sync-dot ${(status?.pendingCount ?? 0) > 0 ? 'pending' : 'ok'}`} />대기 {status?.pendingCount ?? 0}건</div>
          <div className="sync-item"><span className={`sync-dot ${status?.ollamaAvailable ? 'ok' : 'muted'}`} />{status?.ollamaAvailable ? 'Ollama 사용 가능' : 'Ollama 미연결'}</div>
          <div className="sync-item"><span className={`sync-dot ${(status?.pendingCount ?? 0) > 0 ? 'pending' : 'muted'}`} />{status?.externalApiLabel ?? '외부 API 대기'}</div>
        </div>
      </div>
    </div>
  );
}

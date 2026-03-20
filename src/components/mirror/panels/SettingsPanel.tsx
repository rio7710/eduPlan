type Props = {
  onOpenSettings: () => void;
};

export function SettingsPanel({ onOpenSettings }: Props) {
  return (
    <div className="panel active" id="panel-settings">
      <div className="panel-header"><span>설정</span></div>
      <div className="panel-body">
        <div className="settings-list">
          <div className="settings-item"><span>기본 모델</span><strong>Ollama</strong></div>
          <div className="settings-item"><span>저장 방식</span><strong>로컬 + SQLite</strong></div>
          <div className="settings-item"><span>테마</span><strong>다크</strong></div>
        </div>
        <button className="btn btn-primary full-width mt8" onClick={onOpenSettings}>설정 화면 열기</button>
      </div>
    </div>
  );
}

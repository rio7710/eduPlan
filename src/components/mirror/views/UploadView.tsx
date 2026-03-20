import { useState } from 'react';

type SourceTabId = 'single' | 'folder' | 'drop';
type ModelId = 'local' | 'python' | 'claude' | 'gpt';
type InferenceEngineId = 'py_only' | 'py_lgbm';
type PythonSensitivityId = 'low' | 'default' | 'high';

const sourceTabs: Array<{ id: SourceTabId; label: string; icon: string }> = [
  { id: 'single', label: '파일 선택', icon: 'file' },
  { id: 'folder', label: '폴더 선택', icon: 'folder' },
  { id: 'drop', label: '드래그 & 드롭', icon: 'drop' },
];

const modelOptions: Array<{ id: ModelId; badge: string; label: string }> = [
  { id: 'python', badge: 'PYTHON', label: 'Python 파이프라인' },
  { id: 'local', badge: 'LOCAL', label: '로컬 모델 (Ollama)' },
  { id: 'claude', badge: 'CLAUDE', label: 'Claude API' },
  { id: 'gpt', badge: 'GPT', label: 'GPT API' },
];

type UploadSelection = {
  fileName: string;
  filePath: string;
  fileSize?: string | null;
};

type Props = {
  selectedFile?: UploadSelection | null;
  onStartSelectedFile?: (payload: { filePath: string; model: ModelId; inferenceEngine: InferenceEngineId; sensitivity: PythonSensitivityId }) => Promise<void> | void;
};

export function UploadView({ selectedFile = null, onStartSelectedFile }: Props) {
  const [activeTab, setActiveTab] = useState<SourceTabId>('single');
  const [selectedModel, setSelectedModel] = useState<ModelId>('python');
  const [selectedInferenceEngine, setSelectedInferenceEngine] = useState<InferenceEngineId>('py_lgbm');
  const [selectedSensitivity, setSelectedSensitivity] = useState<PythonSensitivityId>('default');
  const [isStarting, setIsStarting] = useState(false);

  async function handleStartSelectedFile() {
    if (!selectedFile?.filePath || !onStartSelectedFile || isStarting) {
      return;
    }

    setIsStarting(true);
    try {
      await onStartSelectedFile({
        filePath: selectedFile.filePath,
        model: selectedModel,
        inferenceEngine: selectedInferenceEngine,
        sensitivity: selectedSensitivity,
      });
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <>
      <div className="view-header">
        <span className="breadcrumb">새 문서 › 파일 가져오기</span>
        <div className="view-header-actions">
          <span className="platform-badge" id="platform-badge">Desktop 모드</span>
        </div>
      </div>

      <div className="upload-content">
        <div className="upload-implementation-note">미구현</div>

        <div className="source-tabs" role="tablist" aria-label="가져오기 방식 선택">
          {sourceTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`source-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={`source-tab-icon ${tab.icon}`} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className={`source-panel ${activeTab === 'single' ? 'active' : ''}`}>
          {selectedFile ? (
            <div className="selected-file-info">
              <div className="sfi-row">
                <span className="sfi-icon" aria-hidden="true">📄</span>
                <div className="sfi-body">
                  <div className="sfi-name">{selectedFile.fileName}</div>
                  <div className="sfi-meta">
                    {selectedFile.filePath}
                    {selectedFile.fileSize ? ` · ${selectedFile.fileSize}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary full-width mt8"
                onClick={handleStartSelectedFile}
                disabled={isStarting}
              >
                {isStarting ? '변환 중...' : '이 파일로 시작'}
              </button>
            </div>
          ) : null}

          <div className="file-access-row">
            <button type="button" className="file-access-card upload-surface-card">
              <div className="fac-icon fac-icon-shell file" aria-hidden="true">
                <span className="fac-icon-glyph" />
              </div>
              <div className="fac-body">
                <div className="fac-title">로컬 파일 선택</div>
                <div className="fac-desc">네이티브 탐색기로 PDF 파일 선택</div>
                <div className="fac-meta">
                  <span className="platform-note desktop-only">Electron: 네이티브 다이얼로그</span>
                  <span className="platform-note web-only">Web: File System Access API</span>
                </div>
              </div>
              <span className="fac-arrow" aria-hidden="true">›</span>
            </button>
          </div>
        </div>

        <div className={`source-panel ${activeTab === 'folder' ? 'active' : ''}`}>
          <div className="file-access-row">
            <button type="button" className="file-access-card upload-surface-card">
              <div className="fac-icon fac-icon-shell folder" aria-hidden="true">
                <span className="fac-icon-glyph" />
              </div>
              <div className="fac-body">
                <div className="fac-title">로컬 폴더 선택</div>
                <div className="fac-desc">폴더 안의 PDF 파일을 한 번에 불러옵니다</div>
                <div className="fac-meta">
                  <span className="platform-note desktop-only">Electron: dialog.showOpenDialog(openDirectory)</span>
                  <span className="platform-note web-only">Web: showDirectoryPicker()</span>
                </div>
              </div>
              <span className="fac-arrow" aria-hidden="true">›</span>
            </button>
          </div>
        </div>

        <div className={`source-panel ${activeTab === 'drop' ? 'active' : ''}`}>
          <button type="button" className="upload-dropzone upload-surface-card">
            <span className="dropzone-icon" aria-hidden="true" />
            <span className="dropzone-title">PDF 파일을 여기에 드롭하세요</span>
            <span className="dropzone-sub">단일 파일 또는 여러 파일을 한 번에 올릴 수 있습니다</span>
          </button>
        </div>

        <section className="upload-options">
          <div className="upload-section-title">AI 분절 모델</div>
          <div className="model-selector">
            {modelOptions.map((option) => {
              const checked = selectedModel === option.id;

              return (
                <div
                  key={option.id}
                  className={`model-option-stack ${checked ? 'selected' : ''}`}
                >
                  <label className={`model-option ${checked ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="model"
                      value={option.id}
                      checked={checked}
                      onChange={() => setSelectedModel(option.id)}
                    />
                    <span className={`model-badge ${option.id}`}>{option.badge}</span>
                    <span className="model-label">{option.label}</span>
                    {option.id === 'python' ? (
                      <span className="model-option-inline-control">
                        <span className="model-option-inline-label">민감도</span>
                        <select
                          className="settings-select"
                          value={selectedSensitivity}
                          onChange={(event) => setSelectedSensitivity(event.target.value as PythonSensitivityId)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <option value="low">낮음</option>
                          <option value="default">기본</option>
                          <option value="high">높음</option>
                        </select>
                      </span>
                    ) : null}
                  </label>

                  {option.id === 'python' && checked ? (
                    <div className="model-option-children">
                      <div className="model-option-subtitle">추론 엔진</div>
                      <div className="upload-inference-grid">
                        <label className={`model-option ${selectedInferenceEngine === 'py_only' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="inference-engine"
                            value="py_only"
                            checked={selectedInferenceEngine === 'py_only'}
                            onChange={() => setSelectedInferenceEngine('py_only')}
                          />
                          <span className="model-badge python">PY</span>
                          <span className="model-label">PY Only</span>
                        </label>
                        <label className={`model-option ${selectedInferenceEngine === 'py_lgbm' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="inference-engine"
                            value="py_lgbm"
                            checked={selectedInferenceEngine === 'py_lgbm'}
                            onChange={() => setSelectedInferenceEngine('py_lgbm')}
                          />
                          <span className="model-badge local">ML</span>
                          <span className="model-label">PY + LightGBM</span>
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

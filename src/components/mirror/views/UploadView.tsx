import { useState } from 'react';
import { UploadExtractDebugModal } from './UploadExtractDebugModal';
import { UploadStageOptions } from './UploadStageOptions';

type SourceTabId = 'single' | 'folder' | 'drop';
type ModelId = 'python';
type InferenceEngineId = 'py_only' | 'py_lgbm';
type PythonSensitivityId = 'low' | 'default' | 'high';

const sourceTabs: Array<{ id: SourceTabId; label: string; icon: string }> = [
  { id: 'single', label: '파일 선택', icon: 'file' },
  { id: 'folder', label: '폴더 선택', icon: 'folder' },
  { id: 'drop', label: '드래그 & 드롭', icon: 'drop' },
];

type UploadSelection = {
  fileName: string;
  filePath: string;
  fileSize?: string | null;
};

type Props = {
  selectedFile?: UploadSelection | null;
  progress?: PdfConvertProgress | null;
  onStartSelectedFile?: (payload: { filePath: string; model: ModelId; inferenceEngine: InferenceEngineId; sensitivity: PythonSensitivityId }) => Promise<void> | void;
};

export function UploadView({ selectedFile = null, progress = null, onStartSelectedFile }: Props) {
  const [activeTab, setActiveTab] = useState<SourceTabId>('single');
  const [selectedModel] = useState<ModelId>('python');
  const [selectedInferenceEngine, setSelectedInferenceEngine] = useState<InferenceEngineId>('py_lgbm');
  const [selectedSensitivity, setSelectedSensitivity] = useState<PythonSensitivityId>('default');
  const [isStarting, setIsStarting] = useState(false);
  const isConvertingByProgress = Boolean(progress && progress.stage !== 'done');

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
    <div className="upload-workspace">
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
              {isStarting && progress ? (
                <div className="model-option-children">
                  <div className="model-option-subtitle">{progress.message}</div>
                  <div className="model-option-subtitle">
                    {progress.total > 0 ? `${progress.current} / ${progress.total}` : progress.stage}
                  </div>
                  <div className="model-option-subtitle">
                    리플레이스 {progress.replaceMatched ?? 0}건 · 치환 이벤트 {progress.replaceDetected ?? 0}건
                  </div>
                  <div className="model-option-subtitle">
                    pair 추가 {progress.pairAdded ?? 0}/{progress.pairTotal ?? 0} · 자동 승인 {progress.autoApproved ?? 0}건
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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

        <UploadStageOptions
          selectedInferenceEngine={selectedInferenceEngine}
          selectedSensitivity={selectedSensitivity}
          onInferenceEngineChange={setSelectedInferenceEngine}
          onSensitivityChange={setSelectedSensitivity}
          progress={progress}
          isConverting={isStarting || isConvertingByProgress}
        />
        <UploadExtractDebugModal selectedFile={selectedFile} />
      </div>
    </div>
  );
}

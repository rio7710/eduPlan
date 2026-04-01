type InferenceEngineId = 'py_only' | 'py_lgbm';
type PythonSensitivityId = 'low' | 'default' | 'high';

type Props = {
  selectedInferenceEngine: InferenceEngineId;
  selectedSensitivity: PythonSensitivityId;
  onInferenceEngineChange: (value: InferenceEngineId) => void;
  onSensitivityChange: (value: PythonSensitivityId) => void;
  progress?: PdfConvertProgress | null;
  isConverting?: boolean;
};

const plannedAiOptions = ['로컬 AI', 'GPT', 'Gemini', 'Claude'];

export function UploadStageOptions({
  selectedInferenceEngine,
  selectedSensitivity,
  onInferenceEngineChange,
  onSensitivityChange,
  progress = null,
  isConverting = false,
}: Props) {
  const stage = progress?.stage ?? null;
  const pyDone = stage === 'review' || stage === 'done';
  const pyRunning = isConverting && !pyDone;
  const mlEnabled = selectedInferenceEngine === 'py_lgbm';
  const mlDone = mlEnabled && stage === 'done';
  const mlRunning = mlEnabled && isConverting && stage === 'review' && !mlDone;
  const s1Done = pyDone && (!mlEnabled || mlDone);
  const s1Running = isConverting && !s1Done;

  function getStateLabel(running: boolean, done: boolean) {
    if (done) {
      return '완료';
    }
    if (running) {
      return '진행 중';
    }
    return '대기';
  }

  return (
    <section className="upload-options">
      <div className="upload-section-title">변환 스테이지</div>

      <div className="model-selector">
        <div className="model-option-stack selected">
          <div className="model-option selected">
            <span className="model-badge python">S1</span>
            <span className="model-label">무누락 원문 데이터 수집</span>
            <span className={`processor-status ${s1Done ? 'done' : s1Running ? 'running' : 'idle'}`}>
              {s1Done ? '✓ ' : ''}{getStateLabel(s1Running, s1Done)}
            </span>
            <span className="model-option-inline-control">
              <span className="model-option-inline-label">추출 강도</span>
              <select
                className="settings-select"
                value={selectedSensitivity}
                onChange={(event) => onSensitivityChange(event.target.value as PythonSensitivityId)}
              >
                <option value="low">보수적</option>
                <option value="default">기본</option>
                <option value="high">강화</option>
              </select>
            </span>
          </div>
          <div className="model-option-children">
            <div className="model-option-subtitle">실제 적용 엔진</div>
            <div className="upload-inference-grid">
              <label className={`model-option ${selectedInferenceEngine === 'py_only' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="inference-engine"
                  value="py_only"
                  checked={selectedInferenceEngine === 'py_only'}
                  onChange={() => onInferenceEngineChange('py_only')}
                />
                <span className="model-badge python">PY</span>
                <span className="model-label">Python 스크립트</span>
                <span className={`processor-status ${pyDone ? 'done' : pyRunning ? 'running' : 'idle'}`}>
                  {pyDone ? '✓ ' : ''}{getStateLabel(pyRunning, pyDone)}
                </span>
              </label>
              <label className={`model-option ${selectedInferenceEngine === 'py_lgbm' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="inference-engine"
                  value="py_lgbm"
                  checked={selectedInferenceEngine === 'py_lgbm'}
                  onChange={() => onInferenceEngineChange('py_lgbm')}
                />
                <span className="model-badge local">ML</span>
                <span className="model-label">LightGBM 줄바꿈 복원</span>
                <span className={`processor-status ${mlDone ? 'done' : mlRunning ? 'running' : 'idle'}`}>
                  {mlEnabled ? (mlDone ? '✓ ' : '') : ''}
                  {mlEnabled ? getStateLabel(mlRunning, mlDone) : '비활성'}
                </span>
              </label>
            </div>
            <div className="model-option-subtitle">현재 범위: 텍스트, 이미지, 레이아웃, 박스 관계, 1차 누락 검증</div>
            <div className="model-option-subtitle">`py_lgbm` 선택 시 merged markdown에 줄바꿈 복원 ML 후처리를 적용합니다.</div>
          </div>
        </div>

        <div className="model-option-stack">
          <div className="model-option">
            <span className="model-badge local">S2</span>
            <span className="model-label">레이아웃 구조 해석</span>
            <span className="model-option-inline-label">별도 블럭 후보, 박스, 표, 읽기 순서 해석 예정</span>
          </div>
          <div className="model-option-children">
            <div className="model-option-subtitle">예정 모듈: `layout_tool`, `table_candidate_tool`, `asset_tool`</div>
            <div className="model-option-subtitle">예정 엔진: `Docling`, `PyMuPDF4LLM` fallback</div>
          </div>
        </div>

        <div className="model-option-stack">
          <div className="model-option">
            <span className="model-badge local">S3</span>
            <span className="model-label">노이즈 정리</span>
            <span className="model-option-inline-label">규칙 기반 예정</span>
          </div>
          <div className="model-option-children">
            <div className="model-option-subtitle">예정 모듈: `pdf-noise-cleanup`, `pdf-change-capture`</div>
          </div>
        </div>

        <div className="model-option-stack">
          <div className="model-option">
            <span className="model-badge claude">S4</span>
            <span className="model-label">문장 분절</span>
            <span className="model-option-inline-label">규칙 + ML 예정</span>
          </div>
          <div className="model-option-children">
            <div className="model-option-subtitle">예정 모듈: `korean-line-merge`, `sentence-segmentation`</div>
            <div className="model-option-subtitle">예정 ML: `LightGBM`</div>
          </div>
        </div>

        <div className="model-option-stack">
          <div className="model-option">
            <span className="model-badge gpt">S5</span>
            <span className="model-label">구조 라벨링</span>
            <span className="model-option-inline-label">규칙 + ML 예정</span>
          </div>
          <div className="model-option-children">
            <div className="model-option-subtitle">예정 모듈: `edu-structure-labeling`, `label-review-capture`</div>
            <div className="model-option-subtitle">예정 ML: `LightGBM`, `scikit-learn` baseline</div>
          </div>
        </div>

        <div className="model-option-stack">
          <div className="model-option">
            <span className="model-badge local">S6</span>
            <span className="model-label">AI 후처리</span>
            <span className="model-option-inline-label">사용자 선택 예정</span>
          </div>
          <div className="model-option-children">
            <div className="model-option-subtitle">예정 모듈: `document-ai-finalizer`, `ai-provider-routing`</div>
            <div className="model-option-subtitle">후보 엔진</div>
            <div className="upload-inference-grid">
              {plannedAiOptions.map((option) => (
                <div key={option} className="model-option">
                  <span className="model-badge local">AI</span>
                  <span className="model-label">{option}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

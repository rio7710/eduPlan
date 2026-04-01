import { useState } from 'react';

type UploadSelection = {
  fileName: string;
  filePath: string;
  fileSize?: string | null;
};

type StageId = 'inspect' | 'extract_text' | 'extract_images' | 'extract_layout' | 'validate';

type StageRunResult = {
  ok: boolean;
  error?: string;
  result?: {
    summary?: string;
    artifacts?: string[];
    warnings?: string[];
    pages?: Array<Record<string, unknown>>;
    pageCount?: number;
  };
};

type Props = {
  selectedFile?: UploadSelection | null;
};

const stages: Array<{ id: StageId; label: string }> = [
  { id: 'inspect', label: '1. PDF 확인' },
  { id: 'extract_text', label: '2. 텍스트 추출' },
  { id: 'extract_images', label: '3. 이미지 추출' },
  { id: 'extract_layout', label: '4. 레이아웃 추출' },
  { id: 'validate', label: '5. 누락 검증' },
];

export function UploadExtractDebugModal({ selectedFile = null }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [lastCompletedStage, setLastCompletedStage] = useState<StageId | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, StageRunResult>>({});

  async function runStage() {
    const currentStage = stages[currentIndex];
    if (!selectedFile?.filePath || isRunning || !currentStage) {
      return;
    }
    setIsRunning(true);
    setLogs((current) => [...current, `[run] ${currentStage.id}`]);
    try {
      const response = await (window.eduFixerApi as any)?.runPdfExtractStage?.(selectedFile.filePath, currentStage.id) as StageRunResult | undefined;
      if (!response?.ok) {
        setLogs((current) => [...current, `[error] ${currentStage.id} :: ${response?.error ?? '실패'}`]);
        return;
      }
      setResults((current) => ({ ...current, [currentStage.id]: response }));
      setLastCompletedStage(currentStage.id);
      setLogs((current) => [...current, `[done] ${currentStage.id} :: ${response.result?.summary ?? '완료'}`]);
      setCurrentIndex((current) => Math.min(current + 1, stages.length - 1));
    } finally {
      setIsRunning(false);
    }
  }

  const currentStage = stages[currentIndex];
  const currentResult = lastCompletedStage ? results[lastCompletedStage] : null;

  return (
    <>
      <section className="upload-options">
        <div className="upload-section-title">개발 추출 모드</div>
        <div className="model-selector">
          <div className="model-option">
            <span className="model-badge local">DEV</span>
            <span className="model-label">단계별 변환 로그 보기</span>
            <button type="button" className="panel-action" disabled={!selectedFile?.filePath} onClick={() => setIsOpen(true)}>
              단계 모달 열기
            </button>
          </div>
        </div>
      </section>

      {isOpen ? (
        <div className="font-color-modal-backdrop" onClick={() => setIsOpen(false)}>
          <div className="font-color-modal upload-progress-modal" onClick={(event) => event.stopPropagation()}>
            <div className="font-color-modal-header">
              <div className="modal-title">변환 단계 확인</div>
            </div>
            <div className="modal-body upload-progress-body">
              <div className="model-option-subtitle">{selectedFile?.fileName ?? '파일 없음'}</div>
              <div className="model-selector">
                {stages.map((stage, index) => {
                  const result = results[stage.id];
                  return (
                    <div key={stage.id} className="model-option">
                      <span className="model-badge python">{`S${index}`}</span>
                      <span className="model-label">{stage.label}</span>
                      <span className="model-option-inline-label">{result?.ok ? '완료' : index === currentIndex ? '대기' : '미실행'}</span>
                    </div>
                  );
                })}
              </div>
              {currentResult?.result ? (
                <div className="model-option-children">
                  <div className="model-option-subtitle">{currentResult.result.summary ?? '결과 요약'}</div>
                  <div className="model-option-subtitle">{`artifact: ${(currentResult.result.artifacts ?? []).join(', ') || '없음'}`}</div>
                  <div className="model-option-subtitle">{`warning: ${(currentResult.result.warnings ?? []).join(', ') || '없음'}`}</div>
                  <div className="model-option-subtitle">{`pages: ${currentResult.result.pages?.length ?? currentResult.result.pageCount ?? 0}`}</div>
                </div>
              ) : null}
              {logs.length ? (
                <div className="model-option-children">
                  {logs.map((line, index) => (
                    <div key={`${line}-${index}`} className="model-option-subtitle">{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setIsOpen(false)}>닫기</button>
              <button className="btn btn-primary" disabled={!selectedFile?.filePath || isRunning || !currentStage} onClick={runStage}>
                {isRunning ? '실행 중...' : currentStage ? `${currentStage.label} 실행` : '완료'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

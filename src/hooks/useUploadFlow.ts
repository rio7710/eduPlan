import { useState } from 'react';
import { buildUploadSelection, type UploadSelection } from './documentSessionUtils';

export type UploadModel = 'local' | 'python' | 'claude' | 'gpt';

type UseUploadFlowOptions = {
  onAfterConvert: () => Promise<void>;
  onOpenShellDocument: (doc: ShellDocument, options?: { initialLine?: number }) => void;
  onOpenView: (view: 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings', tabId?: string) => void;
  onSetActivePanel: (panel: 'explorer' | 'md-menu' | 'search' | 'review' | 'dataset' | 'settings') => void;
  onAppendLogoReviewItems: (items: LogoReviewItem[]) => void;
};

export function useUploadFlow({
  onAfterConvert,
  onOpenShellDocument,
  onOpenView,
  onSetActivePanel,
  onAppendLogoReviewItems,
}: UseUploadFlowOptions) {
  const [uploadSelection, setUploadSelection] = useState<UploadSelection | null>(null);

  function clearUploadSelection() {
    setUploadSelection(null);
  }

  function openUploadForPath(filePath: string, fileSize?: string | null) {
    setUploadSelection(buildUploadSelection(filePath, fileSize));
    onOpenView('upload');
  }

  async function handleStartSelectedUploadFile(payload: {
    filePath: string;
    model: UploadModel;
    inferenceEngine: 'py_only' | 'py_lgbm';
    sensitivity: 'low' | 'default' | 'high';
  }) {
    if (payload.model !== 'python') {
      return;
    }

    try {
      const result = await window.eduFixerApi?.convertPdfWithPython(
        payload.filePath,
        payload.inferenceEngine,
        payload.sensitivity,
      );
      if (result?.error) {
        window.alert(`Python 변환 실패\n\n${result.error}`);
        return;
      }
      if (!result?.doc) {
        window.alert('Python 변환 결과를 찾지 못했습니다.');
        return;
      }

      await onAfterConvert();
      onOpenShellDocument(result.doc);
      if (result.reviewItems.length) {
        onAppendLogoReviewItems(result.reviewItems);
        onSetActivePanel('review');
        onOpenView('review');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Python 변환 실패\n\n${message}`);
    }
  }

  return {
    clearUploadSelection,
    handleStartSelectedUploadFile,
    openUploadForPath,
    setUploadSelection,
    uploadSelection,
  };
}

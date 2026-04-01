import { useEffect, useState } from 'react';
import { buildUploadSelection, type UploadSelection } from './documentSessionUtils';

export type UploadModel = 'local' | 'python' | 'claude' | 'gpt';
const LATEST_REPORT_STORAGE_KEY = 'edufixer-latest-ml-report';
type LatestReportPage = {
  page: number;
  changed: boolean;
  similarity: number;
  imagePaths: string[];
  rawPreview: string[];
  referencePreview: string[];
};
type LatestReport = {
  fileName: string;
  path: string;
  preview: string[];
  txtReplaceCount?: number;
  changedPages?: number;
  pageCount?: number;
  avgSimilarity?: number;
  pages?: LatestReportPage[];
};

type UseUploadFlowOptions = {
  onAfterConvert: () => Promise<void>;
  onOpenShellDocument: (doc: ShellDocument, options?: { initialLine?: number }) => void;
  onOpenView: (view: 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings', tabId?: string) => void;
  onSetActivePanel: (panel: 'explorer' | 'md-menu' | 'search' | 'report' | 'review' | 'dataset' | 'settings') => void;
  onAppendReviewItems: (items: ReviewItem[]) => void;
};

export function useUploadFlow({
  onAfterConvert,
  onOpenShellDocument,
  onOpenView,
  onSetActivePanel,
  onAppendReviewItems,
}: UseUploadFlowOptions) {
  const [uploadSelection, setUploadSelection] = useState<UploadSelection | null>(null);
  const [convertProgress, setConvertProgress] = useState<PdfConvertProgress | null>(null);
  const [latestReport, setLatestReport] = useState<LatestReport | null>(() => {
    try {
      const raw = window.localStorage.getItem(LATEST_REPORT_STORAGE_KEY);
      return raw ? JSON.parse(raw) as LatestReport : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const unsubscribe = window.eduFixerApi?.onPdfConvertProgress?.((payload) => {
      setConvertProgress(payload);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    try {
      if (latestReport) {
        window.localStorage.setItem(LATEST_REPORT_STORAGE_KEY, JSON.stringify(latestReport));
      }
    } catch {
      // ignore storage failures
    }
  }, [latestReport]);

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
      setConvertProgress({ stage: 'prepare', current: 0, total: 0, message: '변환 시작' });
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
      const mlReportPath = String(result.mlReportPath || '').trim();
      const reportPath = String(result.reportPath || '').trim();
      const txtReplaceCount = Number(result.txtReplaceCount || 0);
      let hasVisibleReport = false;
      if (mlReportPath) {
        const mlReportText = await window.eduFixerApi?.readFile(mlReportPath).catch(() => '');
        if (mlReportText) {
          try {
            const parsed = JSON.parse(mlReportText) as {
              changedPages?: number;
              pageCount?: number;
              avgSimilarity?: number;
              pages?: LatestReportPage[];
            };
            setLatestReport({
              fileName: mlReportPath.split(/[\\/]/).pop() ?? 'ml_report.json',
              path: mlReportPath,
              preview: [
                `변경 페이지 ${parsed.changedPages ?? 0}/${parsed.pageCount ?? 0}`,
                `평균 유사도 ${Math.round((parsed.avgSimilarity ?? 0) * 100)}%`,
              ],
              txtReplaceCount,
              changedPages: parsed.changedPages ?? 0,
              pageCount: parsed.pageCount ?? 0,
              avgSimilarity: parsed.avgSimilarity ?? 0,
              pages: (parsed.pages ?? []).filter((page) => page.changed).slice(0, 6),
            });
            hasVisibleReport = true;
            onSetActivePanel('report');
          } catch {
            // fall back to markdown report below
          }
        }
      }
      const reportText = reportPath
        ? await window.eduFixerApi?.readFile(reportPath).catch(() => '')
        : '';
      if (reportText && !hasVisibleReport) {
        setLatestReport({
          fileName: reportPath.split(/[\\/]/).pop() ?? 'report.md',
          path: reportPath,
          preview: reportText.split(/\r?\n/).filter((line) => line.trim()).slice(0, 8),
          txtReplaceCount,
        });
        hasVisibleReport = true;
        onSetActivePanel('report');
      }
      if (!hasVisibleReport) {
        setLatestReport({
          fileName: result.doc.fileName,
          path: result.doc.filePath,
          preview: [`TXT 자동 승인 ${txtReplaceCount}건`, '리포트 파일을 불러오지 못해 최소 정보만 표시합니다.'],
          txtReplaceCount,
        });
        onSetActivePanel('report');
      }
      if (result.reviewItems.length) {
        onAppendReviewItems(result.reviewItems);
        onSetActivePanel('report');
        onOpenView('review');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Python 변환 실패\n\n${message}`);
    }
  }

  return {
    convertProgress,
    clearUploadSelection,
    handleStartSelectedUploadFile,
    latestReport,
    openUploadForPath,
    setUploadSelection,
    uploadSelection,
  };
}

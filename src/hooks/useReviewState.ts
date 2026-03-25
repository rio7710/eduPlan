import { useMemo, useState } from 'react';

type UseReviewStateOptions = {
  onAfterDatasetMutation: () => Promise<void>;
  onOpenView: (view: 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings', tabId?: string) => void;
  onSetActivePanel: (panel: 'explorer' | 'md-menu' | 'search' | 'review' | 'dataset' | 'settings') => void;
  onApplyUpdatedDocuments: (updatedDocs: ShellDocument[]) => void;
  onOpenShellDocument: (doc: ShellDocument, options?: { initialLine?: number }) => void;
  getOpenDocuments: () => Record<string, ShellDocument>;
};

export function useReviewState({
  onAfterDatasetMutation,
  onOpenView,
  onSetActivePanel,
  onApplyUpdatedDocuments,
  onOpenShellDocument,
  getOpenDocuments,
}: UseReviewStateOptions) {
  const [logoReviewItems, setLogoReviewItems] = useState<LogoReviewItem[]>([]);
  const [hierarchyReviewItems, setHierarchyReviewItems] = useState<HierarchyPatternReviewItem[]>([]);
  const [sentenceReviewItems, setSentenceReviewItems] = useState<SentenceEditReviewItem[]>([]);

  async function refreshPersistedLogoReviewItems() {
    const savedFolderPath = window.localStorage.getItem('eduplan-last-explorer-folder-path');
    if (!savedFolderPath || !window.eduFixerApi?.scanLogoReviewItems) {
      setLogoReviewItems([]);
      return;
    }

    const items = await window.eduFixerApi.scanLogoReviewItems(savedFolderPath, 'py_lgbm');
    setLogoReviewItems(items);
  }

  async function refreshSentenceReviewItems() {
    const items = await window.eduFixerApi?.getSentenceReviewItems();
    setSentenceReviewItems(items ?? []);
  }

  function mergeSavedReviewItems(items: ReviewItem[]) {
    if (!items.length) {
      return;
    }

    const hierarchyItems = items.filter(
      (item): item is HierarchyPatternReviewItem => item.type === 'hierarchy_pattern',
    );
    const sentenceItems = items.filter(
      (item): item is SentenceEditReviewItem => item.type === 'sentence_edit',
    );

    if (hierarchyItems.length) {
      setHierarchyReviewItems((current) => {
        const next = new Map(current.map((item) => [item.id, item]));
        hierarchyItems.forEach((item) => next.set(item.id, item));
        return [...next.values()];
      });
    }

    if (sentenceItems.length) {
      setSentenceReviewItems((current) => {
        const next = new Map(current.map((item) => [item.id, item]));
        sentenceItems.forEach((item) => next.set(item.id, item));
        return [...next.values()];
      });
    }
  }

  function appendLogoReviewItems(items: LogoReviewItem[]) {
    if (!items.length) {
      return;
    }
    setLogoReviewItems((current) => {
      const next = new Map(current.map((item) => [item.id, item]));
      items.forEach((item) => next.set(item.id, item));
      return [...next.values()];
    });
  }

  async function handleResolveLogoReviewItem(item: LogoReviewItem, action: 'approve' | 'reject') {
    const result = await window.eduFixerApi?.resolveLogoReviewItem({
      id: item.id,
      sourcePdfName: item.sourcePdfName,
      sourcePdfPath: item.sourcePdfPath,
      markdownPath: item.markdownPath,
      reviewDir: item.reviewDir,
      candidateCount: item.candidateCount,
      memberPaths: item.memberPaths,
      action,
    });
    if (!result?.ok) {
      return;
    }

    setLogoReviewItems((current) => {
      if (result.finalized) {
        return current.filter((entry) => entry.reviewDir !== item.reviewDir);
      }
      return current.filter((entry) => entry.id !== item.id);
    });

    if (result.finalized) {
      await onAfterDatasetMutation();
      await refreshPersistedLogoReviewItems();
      onSetActivePanel('dataset');
      onOpenView('dataset');
    }
  }

  async function handleResolveReviewItem(item: ReviewItem, action: 'approve' | 'reject') {
    if (item.type === 'hierarchy_pattern') {
      const result = await window.eduFixerApi?.resolveHierarchyReviewItem({
        id: item.id,
        markdownPath: item.markdownPath,
        patternKind: item.patternKind,
        candidateText: item.candidateText,
        recommendationLabel: item.recommendationLabel,
        finalLabel: item.finalLabel,
        sampleTexts: item.sampleTexts,
        sampleLines: item.sampleLines,
        action,
      });
      if (!result?.ok) {
        if (result?.error === 'final_label_required') {
          window.alert('적용할 위계 라벨을 먼저 선택하세요.');
        }
        return;
      }

      if (result.doc) {
        onApplyUpdatedDocuments([result.doc]);
      }
      setHierarchyReviewItems((current) => current.filter((entry) => entry.id !== item.id));
      return;
    }

    if (item.type === 'sentence_edit') {
      const result = await window.eduFixerApi?.resolveSentenceReviewItem({
        id: item.id,
        action,
      });
      if (!result?.ok) {
        return;
      }
      setSentenceReviewItems((current) => current.filter((entry) => entry.id !== item.id));
      return;
    }

    await handleResolveLogoReviewItem(item, action);
  }

  async function handleApproveAllReviewItems(items: ReviewItem[]) {
    for (const item of items) {
      if (item.status !== 'pending') {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await handleResolveReviewItem(item, 'approve');
    }
  }

  async function handleOpenEditorReviewItem(item: ReviewItem, navigateToDocumentLine: (lineNumber: number) => void) {
    if (item.type === 'logo_candidate') {
      return;
    }

    const filePath = item.markdownPath || item.sourcePdfPath;
    if (!filePath) {
      return;
    }

    const doc =
      Object.values(getOpenDocuments()).find((entry) => entry.filePath === filePath) ??
      (await window.eduFixerApi?.openRecent(filePath)) ??
      null;
    if (!doc) {
      return;
    }

    onOpenShellDocument(doc);
    const targetLine = item.type === 'sentence_edit' ? item.lineStart : item.sampleLines[0] ?? 1;

    setTimeout(() => {
      navigateToDocumentLine(targetLine);
    }, 0);
  }

  const reviewItems = useMemo<ReviewItem[]>(
    () => [...logoReviewItems, ...hierarchyReviewItems, ...sentenceReviewItems],
    [logoReviewItems, hierarchyReviewItems, sentenceReviewItems],
  );

  return {
    appendLogoReviewItems,
    handleApproveAllReviewItems,
    handleOpenEditorReviewItem,
    handleResolveReviewItem,
    hierarchyReviewItems,
    mergeSavedReviewItems,
    refreshPersistedLogoReviewItems,
    refreshSentenceReviewItems,
    reviewItems,
    sentenceReviewItems,
    setHierarchyReviewItems,
  };
}

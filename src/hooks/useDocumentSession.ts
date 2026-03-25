import { useState } from 'react';
import { isPdfPath } from '@/utils/textUtils';
import { buildUploadSelection, ensureDocumentTab, upsertRecentDocument, type UiTab, type UploadSelection } from './documentSessionUtils';

type ViewId = 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings';

type UseDocumentSessionOptions = {
  onOpenView: (view: ViewId, tabId?: string) => void;
  onActivateDocument: (doc: ShellDocument, options?: { initialLine?: number }) => void;
  onSelectUpload: (selection: UploadSelection) => void;
  onAfterSave: (saved: SaveDocumentResult, toastMessage: string) => Promise<void> | void;
};

export function useDocumentSession({
  onOpenView,
  onActivateDocument,
  onSelectUpload,
  onAfterSave,
}: UseDocumentSessionOptions) {
  const [activeTab, setActiveTab] = useState('welcome');
  const [recentDocuments, setRecentDocuments] = useState<ShellDocument[]>([]);
  const [currentDocument, setCurrentDocument] = useState<ShellDocument | null>(null);
  const [openDocuments, setOpenDocuments] = useState<Record<string, ShellDocument>>({});
  const [tabs, setTabs] = useState<UiTab[]>([{ id: 'welcome', label: '시작', icon: '🏠' }]);

  function openShellDocument(doc: ShellDocument, options?: { initialLine?: number }) {
    setOpenDocuments((current) => ({ ...current, [doc.id]: doc }));
    setCurrentDocument(doc);
    setRecentDocuments((current) => upsertRecentDocument(current, doc));
    setTabs((current) => ensureDocumentTab(current, doc));
    onActivateDocument(doc, options);
    onOpenView('editor', doc.id);
  }

  function selectTab(tabId: string) {
    setActiveTab(tabId);
    if (tabId === 'welcome') {
      setCurrentDocument(null);
      onOpenView('welcome', 'welcome');
      return;
    }

    const nextDoc =
      openDocuments[tabId] ??
      recentDocuments.find((doc) => doc.id === tabId) ??
      null;

    setCurrentDocument(nextDoc);
    onOpenView('editor', tabId);
  }

  function handleCloseTab(tabId: string) {
    if (tabId === 'welcome') {
      return;
    }

    setTabs((current) => {
      const closingIndex = current.findIndex((tab) => tab.id === tabId);
      if (closingIndex === -1) {
        return current;
      }

      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (activeTab === tabId) {
        const fallbackTab =
          nextTabs[closingIndex] ??
          nextTabs[closingIndex - 1] ??
          nextTabs[0] ??
          null;

        if (fallbackTab) {
          setActiveTab(fallbackTab.id);
          if (fallbackTab.id === 'welcome') {
            setCurrentDocument(null);
            onOpenView('welcome', 'welcome');
          } else {
            const fallbackDoc =
              openDocuments[fallbackTab.id] ??
              recentDocuments.find((doc) => doc.id === fallbackTab.id) ??
              null;
            setCurrentDocument(fallbackDoc);
            onOpenView('editor', fallbackTab.id);
          }
        }
      }

      return nextTabs.length ? nextTabs : [{ id: 'welcome', label: '시작', icon: '🏠' }];
    });

    setOpenDocuments((current) => {
      if (!(tabId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
  }

  async function handleOpenFile() {
    const doc = await window.eduFixerApi?.openFile();
    if (!doc) {
      return;
    }
    openShellDocument(doc);
  }

  async function handleOpenRecent(filePath: string) {
    if (isPdfPath(filePath)) {
      onSelectUpload(buildUploadSelection(filePath));
      onOpenView('upload', 'upload');
      return;
    }

    const doc = await window.eduFixerApi?.openRecent(filePath);
    if (!doc) {
      return;
    }
    openShellDocument(doc);
  }

  async function handleSaveCurrentDocument() {
    if (!currentDocument) {
      return;
    }

    const saved = await window.eduFixerApi?.saveDocument({
      filePath: currentDocument.filePath,
      fileName: currentDocument.fileName,
      content: currentDocument.content,
    });
    if (!saved?.doc) {
      return;
    }

    openShellDocument(saved.doc);
    await onAfterSave(saved, saved.editPatchCount > 0 ? `ML 데이터 패치 ${saved.editPatchCount}건 저장` : '저장됨');
  }

  async function handleSaveAsCurrentDocument() {
    if (!currentDocument) {
      return;
    }

    const saved = await window.eduFixerApi?.saveDocumentAs({
      filePath: currentDocument.filePath,
      fileName: currentDocument.fileName,
      content: currentDocument.content,
    });
    if (!saved?.doc) {
      return;
    }

    openShellDocument(saved.doc);
    await onAfterSave(saved, saved.editPatchCount > 0 ? `ML 데이터 패치 ${saved.editPatchCount}건 저장` : '다른 이름으로 저장됨');
  }

  function applyUpdatedDocuments(updatedDocs: ShellDocument[]) {
    if (!updatedDocs.length) {
      return;
    }

    const docByPath = new Map(
      updatedDocs
        .filter((doc) => Boolean(doc.filePath))
        .map((doc) => [doc.filePath, doc] as const),
    );

    setOpenDocuments((current) => Object.fromEntries(
      Object.entries(current).map(([key, doc]) => [key, docByPath.get(doc.filePath) ?? doc]),
    ));
    setRecentDocuments((current) => current.map((doc) => docByPath.get(doc.filePath) ?? doc));
    setCurrentDocument((current) => (current?.filePath ? (docByPath.get(current.filePath) ?? current) : current));
  }

  function hydrateRecentDocuments(nextRecentDocuments: ShellDocument[]) {
    setRecentDocuments(nextRecentDocuments);
  }

  function removeDocumentByPath(filePath: string) {
    setRecentDocuments((current) => current.filter((doc) => doc.filePath !== filePath));
    setOpenDocuments((current) => {
      const nextEntries = Object.entries(current).filter(([, doc]) => doc.filePath !== filePath);
      return Object.fromEntries(nextEntries);
    });
    setCurrentDocument((current) => (current?.filePath === filePath ? null : current));
  }

  function updateCurrentDocumentContent(content: string) {
    setCurrentDocument((current) => {
      if (!current) {
        return current;
      }

      const next = { ...current, content };
      setOpenDocuments((docs) => ({ ...docs, [next.id]: next }));
      return next;
    });
  }

  return {
    activeTab,
    hydrateRecentDocuments,
    currentDocument,
    openDocuments,
    recentDocuments,
    removeDocumentByPath,
    setActiveTab,
    setCurrentDocument,
    setOpenDocuments,
    setRecentDocuments,
    setTabs,
    tabs,
    applyUpdatedDocuments,
    handleCloseTab,
    handleOpenFile,
    handleOpenRecent,
    handleSaveAsCurrentDocument,
    handleSaveCurrentDocument,
    openShellDocument,
    selectTab,
    updateCurrentDocumentContent,
  };
}

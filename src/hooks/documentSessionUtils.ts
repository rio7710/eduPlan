import { getFileIcon } from '@/utils/fileIcon';

export type UiTab = {
  id: string;
  label: string;
  icon: string;
};

export type UploadSelection = {
  fileName: string;
  filePath: string;
  fileSize?: string | null;
};

export function buildUploadSelection(filePath: string, fileSize?: string | null): UploadSelection {
  return {
    fileName: filePath.split(/[\\/]/).pop() || filePath,
    filePath,
    fileSize,
  };
}

export function ensureDocumentTab(current: UiTab[], doc: ShellDocument) {
  if (current.some((item) => item.id === doc.id)) {
    return current;
  }

  return [...current, { id: doc.id, label: doc.fileName, icon: getFileIcon(doc.fileName) }];
}

export function upsertRecentDocument(current: ShellDocument[], doc: ShellDocument) {
  const existingIndex = current.findIndex((item) => item.id === doc.id);
  if (existingIndex === -1) {
    return [...current, doc].slice(-30);
  }

  return current.map((item) => (item.id === doc.id ? doc : item));
}

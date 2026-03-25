import { useEffect, useEffectEvent } from 'react';

type UseGlobalShortcutsParams = {
  activeView: string;
  hasCurrentDocument: boolean;
  onOpenUploadView: () => void;
  onOpenFile: () => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
  onUndo: () => void;
  onRedo: () => void;
  onFind: () => void;
  onReplace: () => void;
  onClearSelection?: () => void;
};

export function useGlobalShortcuts({
  activeView,
  hasCurrentDocument,
  onOpenUploadView,
  onOpenFile,
  onOpenFolder,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onFind,
  onReplace,
  onClearSelection,
}: UseGlobalShortcutsParams) {
  const handleKeyDownEvent = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClearSelection?.();
      return;
    }

    const isCommand = event.ctrlKey || event.metaKey;
    if (!isCommand) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 'n') {
      event.preventDefault();
      onOpenUploadView();
      return;
    }

    if (key === 'o') {
      event.preventDefault();
      if (event.shiftKey) {
        void onOpenFolder();
        return;
      }
      void onOpenFile();
      return;
    }

    if (activeView !== 'editor' || !hasCurrentDocument) {
      return;
    }

    if (key === 's') {
      event.preventDefault();
      if (event.shiftKey) {
        void onSaveAs();
        return;
      }
      void onSave();
      return;
    }

    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        onRedo();
        return;
      }
      onUndo();
      return;
    }

    if (key === 'y') {
      event.preventDefault();
      onRedo();
      return;
    }

    if (key === 'f') {
      event.preventDefault();
      onFind();
      return;
    }

    if (key === 'h') {
      event.preventDefault();
      onReplace();
    }
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyDownEvent(event);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}

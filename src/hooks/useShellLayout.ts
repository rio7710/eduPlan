import { useEffect, useState, type DragEvent } from 'react';
import { defaultFontSettings, readStoredFontSettings, resolveFontColor, type FontSettings } from '@/lib/fontSettings';

const SIDEBAR_WIDTH_STORAGE_KEY = 'eduplan-sidebar-width';

export function useShellLayout() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(saved) && saved >= 220 ? saved : 340;
  });
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = window.localStorage.getItem('eduplan-theme');
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
  });
  const [fontSettings, setFontSettings] = useState<FontSettings>(() => readStoredFontSettings());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isTrainingAccessOpen, setIsTrainingAccessOpen] = useState(false);
  const [isUnimplementedModalOpen, setIsUnimplementedModalOpen] = useState(false);
  const [isFileDragOverApp, setIsFileDragOverApp] = useState(false);
  const [trainingPassword, setTrainingPassword] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('light-theme', theme === 'light');
    window.localStorage.setItem('eduplan-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(sidebarWidth)));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isSidebarResizing) {
      document.body.classList.remove('is-resizing');
      return;
    }
    document.body.classList.add('is-resizing');

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.max(220, Math.min(620, event.clientX - 60));
      setSidebarWidth(nextWidth);
    };
    const handleMouseUp = () => setIsSidebarResizing(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.body.classList.remove('is-resizing');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSidebarResizing]);

  useEffect(() => {
    window.localStorage.setItem('eduplan-font-settings', JSON.stringify(fontSettings));

    const root = document.documentElement;
    const headingEntries = Object.entries(fontSettings.headings) as Array<[keyof FontSettings['headings'], FontSettings['headings'][keyof FontSettings['headings']]]>;
    headingEntries.forEach(([key, value]) => {
      root.style.setProperty(`--preview-${key}-font-family`, value.fontFamily);
      root.style.setProperty(`--preview-${key}-font-size`, `${value.fontSize}px`);
      root.style.setProperty(`--preview-${key}-color`, resolveFontColor(value.color, theme));
    });

    root.style.setProperty('--preview-ul-font-family', fontSettings.bullets.unordered.fontFamily);
    root.style.setProperty('--preview-ul-font-size', `${fontSettings.bullets.unordered.fontSize}px`);
    root.style.setProperty('--preview-ul-color', resolveFontColor(fontSettings.bullets.unordered.color, theme));
    root.style.setProperty('--preview-ol-font-family', fontSettings.bullets.ordered.fontFamily);
    root.style.setProperty('--preview-ol-font-size', `${fontSettings.bullets.ordered.fontSize}px`);
    root.style.setProperty('--preview-ol-color', resolveFontColor(fontSettings.bullets.ordered.color, theme));
  }, [fontSettings, theme]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  function parseDroppedFilePaths(event: DragEvent<HTMLDivElement>) {
    const fromFiles = Array.from(event.dataTransfer.files ?? [])
      .map((file) => (file as File & { path?: string }).path)
      .filter((value): value is string => Boolean(value));
    if (fromFiles.length) return fromFiles;

    const uriList = event.dataTransfer.getData('text/uri-list');
    if (!uriList) return [];

    return uriList
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item.startsWith('file://'))
      .map((item) => {
        try {
          return decodeURIComponent(item.replace(/^file:\/+/, '').replace(/\//g, '\\'));
        } catch {
          return '';
        }
      })
      .filter(Boolean);
  }

  function handleOpenTrainingAccess() {
    setTrainingPassword('');
    setIsTrainingAccessOpen(true);
  }

  function handleCloseTrainingAccess() {
    setTrainingPassword('');
    setIsTrainingAccessOpen(false);
  }

  function handleOpenUnimplementedModal() {
    setIsUnimplementedModalOpen(true);
  }

  function handleCloseUnimplementedModal() {
    setIsUnimplementedModalOpen(false);
  }

  return {
    defaultFontSettings,
    fontSettings,
    handleCloseTrainingAccess,
    handleCloseUnimplementedModal,
    handleOpenTrainingAccess,
    handleOpenUnimplementedModal,
    isFileDragOverApp,
    isSidebarResizing,
    isTrainingAccessOpen,
    isUnimplementedModalOpen,
    parseDroppedFilePaths,
    setFontSettings,
    setIsFileDragOverApp,
    setIsSidebarResizing,
    setTheme,
    setToastMessage,
    setTrainingPassword,
    sidebarWidth,
    theme,
    toastMessage,
    trainingPassword,
  };
}

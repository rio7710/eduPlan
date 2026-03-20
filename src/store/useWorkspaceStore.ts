import { create } from 'zustand';
import { sampleMarkdown } from '@/lib/sampleDocument';

export type EditorMode = 'markdown' | 'preview' | 'wysiwyg' | 'html';
export type ActivityPanel = 'explorer' | 'md-menu' | 'search' | 'review' | 'sync' | 'settings';

export type ViewType = 'document' | 'review' | 'welcome' | 'upload' | 'settings';

export interface DocTab {
  id: string;
  fileName: string;
  filePath: string;
  content: string;
  savedContent: string;
  blockCount: number;
  viewType?: ViewType;
}

interface WorkspaceState {
  isDesktop: boolean;
  tabs: DocTab[];
  activeTabId: string | null;
  activePanel: ActivityPanel;
  editorMode: EditorMode;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  searchMode: 'find' | 'replace';
  recentDocuments: ShellDocument[];
  setShellState: (payload: { isDesktop: boolean; recentDocuments: ShellDocument[] }) => void;
  openDocument: (doc: ShellDocument) => void;
  openSpecialTab: (tab: DocTab) => void;
  setContent: (tabId: string, content: string) => void;
  markSaved: (doc: ShellDocument) => void;
  setActiveTab: (tabId: string) => void;
  setActivePanel: (panel: ActivityPanel) => void;
  setEditorMode: (mode: EditorMode) => void;
  setSidebarWidth: (width: number) => void;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  setSearchMode: (mode: 'find' | 'replace') => void;
}

const initialDraft: DocTab = {
  id: 'view:welcome',
  fileName: '시작',
  filePath: '',
  content: sampleMarkdown,
  savedContent: sampleMarkdown,
  blockCount: 6,
  viewType: 'welcome',
};

function countBlocks(content: string) {
  return content
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean).length;
}

function toTab(doc: ShellDocument): DocTab {
  return {
    id: doc.id,
    fileName: doc.fileName,
    filePath: doc.filePath,
    content: doc.content,
    savedContent: doc.content,
    blockCount: doc.blockCount,
    viewType: 'document',
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  isDesktop: true,
  tabs: [initialDraft],
  activeTabId: initialDraft.id,
  activePanel: 'explorer',
  editorMode: 'markdown',
  sidebarWidth: 288,
  sidebarCollapsed: false,
  searchMode: 'find',
  recentDocuments: [],
  setShellState: ({ isDesktop, recentDocuments }) => set({ isDesktop, recentDocuments }),
  openDocument: (doc) =>
    set((state) => {
      const existing = state.tabs.find((tab) => tab.id === doc.id);
      const nextTabs = existing
        ? state.tabs.map((tab) => (tab.id === doc.id ? toTab(doc) : tab))
        : [...state.tabs, toTab(doc)];
      return {
        tabs: nextTabs,
        activeTabId: doc.id,
      };
    }),
  openSpecialTab: (tab) =>
    set((state) => {
      const existing = state.tabs.find((item) => item.id === tab.id);
      return {
        tabs: existing
          ? state.tabs.map((item) => (item.id === tab.id ? { ...item, ...tab } : item))
          : [...state.tabs, tab],
        activeTabId: tab.id,
      };
    }),
  setContent: (tabId, content) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              content,
              blockCount: countBlocks(content),
            }
          : tab,
      ),
    })),
  markSaved: (doc) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === doc.id || (tab.filePath === '' && doc.filePath && tab.fileName === doc.fileName)
          ? {
              ...tab,
              id: doc.id,
              fileName: doc.fileName,
              filePath: doc.filePath,
              content: doc.content,
              savedContent: doc.content,
              blockCount: doc.blockCount,
            }
          : tab,
      ),
      activeTabId: doc.id,
      recentDocuments: [doc, ...state.recentDocuments.filter((item) => item.id !== doc.id)].slice(0, 30),
    })),
  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  setActivePanel: (panel) => set({ activePanel: panel, sidebarCollapsed: false }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setSidebarWidth: (width) => set({ sidebarWidth: width, sidebarCollapsed: width === 0 }),
  collapseSidebar: () => set({ sidebarCollapsed: true, sidebarWidth: 0 }),
  expandSidebar: () => set((state) => ({ sidebarCollapsed: false, sidebarWidth: state.sidebarWidth || 288 })),
  setSearchMode: (mode) => set({ searchMode: mode }),
}));

export function useActiveTab() {
  return useWorkspaceStore((state) => state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0] ?? null);
}

export function isDirty(tab: DocTab | null) {
  return !!tab && tab.content !== tab.savedContent;
}

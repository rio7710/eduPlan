import { useEffect, useMemo, useState } from 'react';
import type { ViewId } from '@/App';
import { DelayedTooltip } from '@/components/ui/DelayedTooltip';
import { getFileIcon, getFileIconClass } from '@/utils/fileIcon';

type Props = {
  currentExplorerPath: string | null;
  onOpenView: (view: ViewId, tabId?: string) => void;
  onOpenFolder: () => void;
  onOpenExplorerFolderPath: (folderPath: string) => void;
  onOpenExplorerFile: (entry: FolderEntry | ShellDocument) => void;
  onOpenExplorerSubfolder: (folderPath: string) => void;
  onDeleteExplorerFile: (entry: FolderEntry | ShellDocument) => void;
  includeSubfolders: boolean;
  onToggleIncludeSubfolders: () => void;
  explorerFolder: OpenFolderResult | null;
  recentDocuments: ShellDocument[];
  activeDocumentId: string | null;
  activeDocumentPath: string | null;
  openDocumentIds: string[];
  openDocumentPaths: string[];
  onOpenUnimplementedModal: () => void;
};

type FolderTreeNode = {
  name: string;
  path: string;
  folders: FolderTreeNode[];
  files: FolderEntry[];
};

const EXPLORER_SORT_STORAGE_KEY = 'eduplan-explorer-sort';

function iconFolderOutline() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l1.8 2h7.2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function iconFolderOpenOutline() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3.5 8.5a2 2 0 0 1 2-2h4l1.8 2h7.2a2 2 0 0 1 1.94 2.5l-1.2 5a2 2 0 0 1-1.94 1.5h-12.8a2 2 0 0 1-1.94-2.5l1.2-5a2 2 0 0 1 1.94-1.5z" />
    </svg>
  );
}

function iconHomeOutline() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4.5 10.5 12 4l7.5 6.5" />
      <path d="M6.5 9.5v9h11v-9" />
      <path d="M10 18.5v-5h4v5" />
    </svg>
  );
}

function folderName(folderPath: string) {
  const normalized = folderPath.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

function normalizePath(value: string | null | undefined) {
  return String(value ?? '').replace(/\//g, '\\').replace(/[\\]+$/, '');
}

function sortEntries(files: FolderEntry[], sortBy: 'type' | 'name' | 'date') {
  return [...files].sort((a, b) => {
    if (sortBy === 'type') {
      return a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name, 'ko');
    }
    return a.name.localeCompare(b.name, 'ko');
  });
}

function sortTree(node: FolderTreeNode, sortBy: 'type' | 'name' | 'date'): FolderTreeNode {
  const folders = node.folders
    .map((child) => sortTree(child, sortBy))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return {
    ...node,
    folders,
    files: sortEntries(node.files, sortBy),
  };
}

function collectFolderPaths(node: FolderTreeNode): string[] {
  return [
    node.path,
    ...node.folders.flatMap((child) => collectFolderPaths(child)),
  ];
}

function findNodeByPath(node: FolderTreeNode, targetPath: string): FolderTreeNode | null {
  if (node.path === targetPath) {
    return node;
  }
  for (const child of node.folders) {
    const found = findNodeByPath(child, targetPath);
    if (found) {
      return found;
    }
  }
  return null;
}

function buildTree(rootPath: string, files: FolderEntry[]): FolderTreeNode {
  const normalizedRootPath = normalizePath(rootPath);
  const root: FolderTreeNode = {
    name: folderName(normalizedRootPath),
    path: normalizedRootPath,
    folders: [],
    files: [],
  };

  const folderMap = new Map<string, FolderTreeNode>([[normalizedRootPath, root]]);

  for (const file of files) {
    const normalizedRelativeName = file.name.replace(/\//g, '\\');
    const segments = normalizedRelativeName.split('\\').filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) {
      continue;
    }

    let parentPath = normalizedRootPath;
    let parentNode = folderMap.get(parentPath)!;

    for (const segment of segments) {
      const nextPath = `${parentPath}\\${segment}`;
      let nextNode = folderMap.get(nextPath);
      if (!nextNode) {
        nextNode = {
          name: segment,
          path: nextPath,
          folders: [],
          files: [],
        };
        folderMap.set(nextPath, nextNode);
        parentNode.folders.push(nextNode);
      }
      parentNode = nextNode;
      parentPath = nextPath;
    }

    parentNode.files.push(file);
  }

  return root;
}

export function ExplorerPanel({
  currentExplorerPath,
  onOpenView,
  onOpenFolder,
  onOpenExplorerFolderPath,
  onOpenExplorerFile,
  onOpenExplorerSubfolder,
  onDeleteExplorerFile,
  includeSubfolders,
  onToggleIncludeSubfolders,
  explorerFolder,
  recentDocuments,
  activeDocumentId,
  activeDocumentPath,
  openDocumentIds,
  openDocumentPaths,
  onOpenUnimplementedModal,
}: Props) {
  const [sortBy, setSortBy] = useState<'type' | 'name' | 'date'>(() => {
    const saved = window.localStorage.getItem(EXPLORER_SORT_STORAGE_KEY);
    return saved === 'type' || saved === 'name' || saved === 'date' ? saved : 'name';
  });
  useEffect(() => {
    window.localStorage.setItem(EXPLORER_SORT_STORAGE_KEY, sortBy);
  }, [sortBy]);

  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const normalizedRootPath = normalizePath(explorerFolder?.path);
  const normalizedCurrentPath = normalizePath(currentExplorerPath || explorerFolder?.path);
  const currentRelativePath = normalizedRootPath && normalizedCurrentPath.startsWith(normalizedRootPath)
    ? normalizedCurrentPath.slice(normalizedRootPath.length).replace(/^\\+/, '')
    : '';
  const rootFolderLabel = folderName(normalizedRootPath);

  const treeRoot = useMemo(() => {
    if (!explorerFolder?.path) {
      return null;
    }
    return sortTree(buildTree(explorerFolder.path, explorerFolder.files), sortBy);
  }, [explorerFolder, sortBy]);

  const allFolderPaths = useMemo(() => (treeRoot ? collectFolderPaths(treeRoot) : []), [treeRoot]);
  const currentNode = useMemo(
    () => (treeRoot && normalizedCurrentPath ? findNodeByPath(treeRoot, normalizedCurrentPath) : null),
    [normalizedCurrentPath, treeRoot],
  );

  useEffect(() => {
    if (!treeRoot) {
      setExpandedPaths(new Set());
      return;
    }

    setExpandedPaths((previous) => {
      if (includeSubfolders) {
        return new Set(allFolderPaths);
      }

      const next = new Set(
        [...previous].filter((path) => allFolderPaths.includes(path)),
      );
      next.add(treeRoot.path);

      return next;
    });
  }, [allFolderPaths, includeSubfolders, treeRoot]);

  const sortedRecentDocuments = useMemo(() => {
    return [...recentDocuments].sort((a, b) => {
      if (sortBy === 'type') {
        const aExt = a.fileName.split('.').pop()?.toLowerCase() ?? '';
        const bExt = b.fileName.split('.').pop()?.toLowerCase() ?? '';
        return aExt.localeCompare(bExt) || a.fileName.localeCompare(b.fileName, 'ko');
      }
      if (sortBy === 'date') {
        const aTime = new Date(a.lastOpenedAt ?? 0).getTime();
        const bTime = new Date(b.lastOpenedAt ?? 0).getTime();
        return bTime - aTime;
      }
      return a.fileName.localeCompare(b.fileName, 'ko');
    });
  }, [recentDocuments, sortBy]);

  function toggleExpanded(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function renderFolderNode(node: FolderTreeNode, depth = 0) {
    const isExpanded = expandedPaths.has(node.path);
    const isCurrent = normalizedCurrentPath === node.path;
    const hasChildren = node.folders.length > 0 || node.files.length > 0;

    return (
      <div key={node.path} className="explorer-tree-node">
        <div
          className={`tree-item explorer-tree-row ${isCurrent ? 'active' : ''}`}
          onFocus={() => setSelectedEntryPath(node.path)}
        >
          <button
            type="button"
            className={`tree-disclosure ${hasChildren ? 'expandable' : 'empty'}`}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) {
                toggleExpanded(node.path);
              }
            }}
            aria-label={isExpanded ? '폴더 접기' : '폴더 펼치기'}
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : ''}
          </button>
          <button
            type="button"
            className="explorer-tree-main"
            onClick={() => {
              if (hasChildren) {
                toggleExpanded(node.path);
              }
            }}
          >
          <span className="tree-node-icon">
            {isExpanded ? iconFolderOpenOutline() : iconFolderOutline()}
          </span>
          <DelayedTooltip content={node.path}>
            <span className="tree-label">{node.name}</span>
          </DelayedTooltip>
          {isCurrent ? <span className="tree-badge current">●</span> : null}
          </button>
        </div>
        {isExpanded ? (
          <>
            {node.folders.map((child) => renderFolderNode(child, depth + 1))}
            {node.files.map((file) => {
              const isOpen = openDocumentPaths.includes(file.path);
              const isActive = activeDocumentId === file.path || activeDocumentPath === file.path;
              return (
                <div
                  key={file.path}
                  className={`tree-item explorer-file-row is-nested ${isActive ? 'active' : ''}`}
                  data-id={file.path}
                  tabIndex={0}
                  onClick={() => onOpenExplorerFile(file)}
                  onFocus={() => setSelectedEntryPath(file.path)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedEntryPath(file.path);
                    onDeleteExplorerFile(file);
                  }}
                >
                  <span className={`tree-icon ${getFileIconClass(file.name)}`}>{getFileIcon(file.name)}</span>
                  <DelayedTooltip content={file.name}>
                    <span className="tree-label">{file.name.split(/[\\/]/).pop() ?? file.name}</span>
                  </DelayedTooltip>
                  {isOpen ? <span className="tree-badge synced">●</span> : null}
                </div>
              );
            })}
            {!hasChildren ? (
              <div className="tree-item explorer-tree-empty">
                <span className="tree-label">비어 있음</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="panel active"
      id="panel-explorer"
      onKeyDown={(event) => {
        if (event.key !== 'Delete' || !selectedEntryPath) {
          return;
        }

        const folderEntry = explorerFolder?.files.find((item) => item.path === selectedEntryPath);
        if (folderEntry) {
          event.preventDefault();
          onDeleteExplorerFile(folderEntry);
          return;
        }

        const recentEntry = sortedRecentDocuments.find((item) => item.filePath === selectedEntryPath);
        if (recentEntry) {
          event.preventDefault();
          onDeleteExplorerFile(recentEntry);
        }
      }}
    >
      <div className="panel-header">
        <div className="explorer-toolbar-row">
          <div className="panel-actions">
            <DelayedTooltip content="새 문서 (PDF 업로드)">
              <button className="icon-btn" onClick={() => onOpenView('upload')}>+</button>
            </DelayedTooltip>
            <DelayedTooltip content="폴더 열기">
              <button className="icon-btn" onClick={onOpenFolder}>{iconFolderOutline()}</button>
            </DelayedTooltip>
            <DelayedTooltip content="탐색기로 보기">
              <button className="icon-btn" onClick={() => normalizedCurrentPath && onOpenExplorerFolderPath(normalizedCurrentPath)} disabled={!normalizedCurrentPath}>↗</button>
            </DelayedTooltip>
          </div>
          <div className="explorer-tree-controls">
            <button
              type="button"
              className={`explorer-subfolder-switch ${includeSubfolders ? 'is-on' : 'is-off'}`}
              role="switch"
              aria-checked={includeSubfolders}
              aria-label="하위 폴더 자동 펼침"
              onClick={onToggleIncludeSubfolders}
              title={currentNode?.folders.length ? '현재 폴더 하위 트리 자동 펼침 전환' : '현재 폴더에 하위 폴더가 없습니다.'}
              disabled={!currentNode?.folders.length}
            >
              <span className="explorer-subfolder-switch-label">Sub</span>
              <span className="explorer-subfolder-switch-thumb" aria-hidden="true" />
            </button>
            <select
              className="explorer-sort-select"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as 'type' | 'name' | 'date')}
            >
              <option value="type">종류</option>
              <option value="name">이름</option>
              <option value="date">날짜</option>
            </select>
          </div>
        </div>
        <div className="explorer-header-main">
          <span className="tree-node-icon explorer-header-icon">
            {iconHomeOutline()}
          </span>
          <span className="panel-title-compact">{rootFolderLabel || '루트'}</span>
          {normalizedCurrentPath ? (
            <span className="explorer-current-path" title={normalizedCurrentPath}>
              {currentRelativePath ? `/${currentRelativePath.replace(/\\/g, '/')}` : '/'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="panel-body">
        <div className="tree-section">
          <div className="tree-items explorer-tree-items">
            {treeRoot ? (
              <div className="explorer-root-children">
                {treeRoot.folders.map((folder) => renderFolderNode(folder, 0))}
                {treeRoot.files.map((file) => {
                  const isOpen = openDocumentPaths.includes(file.path);
                  const isActive = activeDocumentId === file.path || activeDocumentPath === file.path;
                  return (
                    <div
                      key={file.path}
                      className={`tree-item explorer-file-row ${isActive ? 'active' : ''}`}
                      data-id={file.path}
                      tabIndex={0}
                      onClick={() => onOpenExplorerFile(file)}
                      onFocus={() => setSelectedEntryPath(file.path)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSelectedEntryPath(file.path);
                        onDeleteExplorerFile(file);
                      }}
                    >
                      <span className={`tree-icon ${getFileIconClass(file.name)}`}>{getFileIcon(file.name)}</span>
                      <DelayedTooltip content={file.name}>
                        <span className="tree-label">{file.name.split(/[\\/]/).pop() ?? file.name}</span>
                      </DelayedTooltip>
                      {isOpen ? <span className="tree-badge synced">●</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : recentDocuments.length ? (
              sortedRecentDocuments.map((doc, index) => {
                const isOpen = openDocumentIds.includes(doc.id) || (doc.filePath ? openDocumentPaths.includes(doc.filePath) : false);
                return (
                  <div
                    key={doc.id}
                    className={`tree-item ${activeDocumentId === doc.id || (index === 0 && !activeDocumentId) ? 'active' : ''}`}
                    data-id={doc.id}
                    tabIndex={0}
                    onClick={() => onOpenExplorerFile(doc)}
                    onFocus={() => setSelectedEntryPath(doc.filePath)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedEntryPath(doc.filePath);
                      onDeleteExplorerFile(doc);
                    }}
                  >
                    <span className={`tree-icon ${getFileIconClass(doc.fileName)}`}>{getFileIcon(doc.fileName)}</span>
                    <DelayedTooltip content={doc.fileName}>
                      <span className="tree-label">{doc.fileName}</span>
                    </DelayedTooltip>
                    {isOpen ? <span className="tree-badge synced">●</span> : null}
                  </div>
                );
              })
            ) : (
              <div className="tree-item">
                <span className="tree-label">문서가 없습니다</span>
              </div>
            )}
            {!treeRoot ? (
              <div className="tree-item">
                <span className="tree-label">폴더를 열면 프로젝트 트리를 탐색할 수 있습니다.</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="tree-section">
          <div className="tree-header">
            <span className="tree-arrow">▾</span> 미구현
          </div>
          <div className="tree-items">
            <div
              className="tree-item"
              role="button"
              tabIndex={0}
              onClick={onOpenUnimplementedModal}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onOpenUnimplementedModal();
                }
              }}
            >
              <span className="tree-label">AI 연결 후 구현 예정</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

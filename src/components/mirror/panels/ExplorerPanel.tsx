import { useEffect, useMemo, useState } from 'react';
import type { ViewId } from '@/App';
import { DelayedTooltip } from '@/components/ui/DelayedTooltip';
import { getFileIcon, getFileIconClass } from '@/utils/fileIcon';

type Props = {
  onOpenView: (view: ViewId, tabId?: string) => void;
  onOpenFolder: () => void;
  onOpenExplorerFolderPath: (folderPath: string) => void;
  onOpenExplorerFile: (entry: FolderEntry | ShellDocument) => void;
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

const EXPLORER_SORT_STORAGE_KEY = 'eduplan-explorer-sort';
function folderName(folderPath: string) {
  const normalized = folderPath.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

function isTopLevelEntry(name: string) {
  return !/[\\/]/.test(name);
}

function splitEntryPath(name: string) {
  const normalized = name.replace(/\\/g, '/');
  const lastSlashIndex = normalized.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return { prefix: '', fileName: name };
  }

  return {
    prefix: `${normalized.slice(0, lastSlashIndex + 1).replace(/\//g, '\\')}`,
    fileName: normalized.slice(lastSlashIndex + 1),
  };
}

export function ExplorerPanel({
  onOpenView,
  onOpenFolder,
  onOpenExplorerFolderPath,
  onOpenExplorerFile,
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

  const sortedFolderFiles = useMemo(() => {
    if (!explorerFolder) {
      return [];
    }
    const visibleFiles = includeSubfolders
      ? explorerFolder.files
      : explorerFolder.files.filter((file) => isTopLevelEntry(file.name));

    return [...visibleFiles].sort((a, b) => {
      if (sortBy === 'type') {
        return a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name, 'ko');
      }
      if (sortBy === 'date') {
        return a.name.localeCompare(b.name, 'ko');
      }
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [explorerFolder, includeSubfolders, sortBy]);

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

  function renderEntryLabel(name: string) {
    if (!includeSubfolders) {
      return <span className="tree-label">{name}</span>;
    }

    const { prefix, fileName } = splitEntryPath(name);
    return (
      <span className="tree-label">
        {prefix ? <span className="tree-path-prefix">{prefix}</span> : null}
        <span>{fileName}</span>
      </span>
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

        const folderEntry = sortedFolderFiles.find((item) => item.path === selectedEntryPath);
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
        <span className="panel-title-compact">File Explorer</span>
        <div className="panel-actions">
          <DelayedTooltip content="새 문서 (PDF 업로드)">
            <button className="icon-btn" onClick={() => onOpenView('upload')}>+</button>
          </DelayedTooltip>
          <DelayedTooltip content="폴더 열기">
            <button className="icon-btn" onClick={onOpenFolder}>📁</button>
          </DelayedTooltip>
          <DelayedTooltip content="탐색기로 보기">
            <button className="icon-btn" onClick={() => explorerFolder?.path && onOpenExplorerFolderPath(explorerFolder.path)} disabled={!explorerFolder?.path}>↗</button>
          </DelayedTooltip>
        </div>
      </div>
      <div className="panel-body">
        <div className="tree-section">
          <div className="tree-header explorer-tree-header">
            <span className="explorer-tree-title"><span className="tree-arrow">▾</span> 작업 중</span>
            <div className="explorer-tree-controls">
              <button
                type="button"
                className={`explorer-subfolder-switch ${includeSubfolders ? 'is-on' : 'is-off'}`}
                role="switch"
                aria-checked={includeSubfolders}
                aria-label="하위 폴더 표시"
                onClick={onToggleIncludeSubfolders}
                title={explorerFolder ? '하위 폴더 포함 표시 전환' : '폴더를 연 뒤 하위 폴더 표시를 전환할 수 있습니다.'}
                disabled={!explorerFolder}
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
          <div className="tree-items">
            {explorerFolder ? (
              <>
                <div className="tree-item tree-folder-item">
                  <span className="tree-icon">📁</span>
                  <DelayedTooltip content={folderName(explorerFolder.path)}>
                    <span className="tree-label">{folderName(explorerFolder.path)}</span>
                  </DelayedTooltip>
                </div>
                {sortedFolderFiles.map((file) => (
                  (() => {
                    const isOpen = openDocumentPaths.includes(file.path);
                    return (
                  <div
                    key={file.path}
                    className={`tree-item tree-child-item ${activeDocumentId === file.path || activeDocumentPath === file.path ? 'active' : ''}`}
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
                      {renderEntryLabel(file.name)}
                    </DelayedTooltip>
                    {isOpen ? <span className="tree-badge synced">●</span> : null}
                  </div>
                    );
                  })()
                ))}
              </>
            ) : recentDocuments.length ? (
              sortedRecentDocuments.map((doc, index) => (
                (() => {
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
                    {renderEntryLabel(doc.fileName)}
                  </DelayedTooltip>
                  {isOpen ? <span className="tree-badge synced">●</span> : null}
                </div>
                  );
                })()
              ))
            ) : (
              <div className="tree-item">
                <span className="tree-label">문서가 없습니다</span>
              </div>
            )}
            {!explorerFolder ? (
              <div className="tree-item">
                <span className="tree-label">폴더를 열면 하위 폴더 토글을 사용할 수 있습니다.</span>
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

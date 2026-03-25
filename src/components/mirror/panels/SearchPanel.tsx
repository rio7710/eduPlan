import { type SearchMatch, type SearchMode, type SearchScope, useSearchCommands } from '@/components/mirror/panels/useSearchCommands';
import {
  getDocumentResultHint,
  getFolderResultHint,
  getReplaceInputPlaceholder,
  getSearchInputPlaceholder,
} from '@/components/mirror/panels/searchPanelText';
export type { SearchMode, SearchScope };

type Props = {
  document: ShellDocument | null;
  folderPath: string | null;
  activeLine?: number | null;
  searchSelection?: { filePath?: string; lineNumber: number; start: number; end: number; query: string } | null;
  mode: SearchMode;
  scope: SearchScope;
  query: string;
  replaceValue: string;
  selectedIndex: number;
  onModeChange: (mode: SearchMode) => void;
  onScopeChange: (scope: SearchScope) => void;
  onQueryChange: (query: string) => void;
  onReplaceValueChange: (value: string) => void;
  onSelectedIndexChange: (index: number) => void;
  onSelectResult: (match: SearchMatch) => void;
  onSelectFolderResult: (match: FolderSearchMatch) => void;
  onReplaceContent: (content: string) => void;
  onApplyFolderReplace: (docs: ShellDocument[]) => void;
};

function renderHighlightedLine(lineText: string, start: number, end: number) {
  const before = lineText.slice(0, start);
  const target = lineText.slice(start, end);
  const after = lineText.slice(end);

  return (
    <span className="search-result-line">
      <span>{before}</span>
      <mark className="search-result-mark">{target}</mark>
      <span>{after}</span>
    </span>
  );
}

function isSearchSelectionMatch(
  searchSelection: { filePath?: string; lineNumber: number; start: number; end: number; query: string } | null,
  match: { lineNumber: number; start: number; end: number; filePath?: string },
) {
  if (!searchSelection?.query.trim()) {
    return false;
  }

  if (searchSelection.filePath && match.filePath && searchSelection.filePath !== match.filePath) {
    return false;
  }

  return (
    searchSelection.lineNumber === match.lineNumber
    && searchSelection.start === match.start
    && searchSelection.end === match.end
  );
}

export function SearchPanel({
  document,
  folderPath,
  searchSelection = null,
  mode,
  scope,
  query,
  replaceValue,
  selectedIndex,
  onModeChange,
  onScopeChange,
  onQueryChange,
  onReplaceValueChange,
  onSelectedIndexChange,
  onSelectResult,
  onSelectFolderResult,
  onReplaceContent,
  onApplyFolderReplace,
}: Props) {
  const {
    hasDocument,
    hasFolder,
    folderMatches,
    folderBusy,
    folderStatus,
    documentMatches,
    currentMatches,
    countLabel,
    moveSelection,
    replaceCurrentDocumentMatch,
    replaceAllDocumentMatches,
    replaceAllFolderMatches,
  } = useSearchCommands({
    document,
    folderPath,
    mode,
    scope,
    query,
    replaceValue,
    selectedIndex,
    onScopeChange,
    onSelectedIndexChange,
    onSelectResult,
    onSelectFolderResult,
    onReplaceContent,
    onApplyFolderReplace,
  });
  const inputPlaceholder = getSearchInputPlaceholder(scope, hasFolder, hasDocument);
  const replacePlaceholder = getReplaceInputPlaceholder(scope);
  const folderHint = getFolderResultHint(hasFolder, query, folderBusy, folderMatches.length);
  const documentHint = getDocumentResultHint(hasDocument, query, documentMatches.length);

  return (
    <div className="panel active" id="panel-search">
      <div className="panel-header panel-header-row search-header-row">
        <span>검색</span>
        <div className="search-header-scope">
          <button
            type="button"
            className={`search-scope-chip ${scope === 'document' ? 'active' : ''}`}
            disabled={!hasDocument}
            onClick={() => onScopeChange('document')}
          >
            현재 문서
          </button>
          <button
            type="button"
            className={`search-scope-chip ${scope === 'folder' ? 'active' : ''}`}
            disabled={!hasFolder}
            onClick={() => onScopeChange('folder')}
          >
            폴더 전체
          </button>
        </div>
      </div>
      <div className="panel-body search-panel-body">
        <div className="search-topbar">
          <div className="search-switch">
            <button type="button" className={mode === 'find' ? 'active' : ''} onClick={() => onModeChange('find')}>
              검색
            </button>
            <button type="button" className={mode === 'replace' ? 'active' : ''} onClick={() => onModeChange('replace')}>
              바꾸기
            </button>
          </div>

        </div>

        <div className="search-input-wrap">
          <input
            type="text"
            className="search-input panel-input"
            placeholder={inputPlaceholder}
            value={query}
            disabled={scope === 'folder' ? !hasFolder : !hasDocument}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && scope === 'document') {
                event.preventDefault();
                if (event.shiftKey) {
                  moveSelection(-1);
                  return;
                }
                moveSelection(1);
              }
            }}
          />
        </div>

        {mode === 'replace' ? (
          <div className="search-input-wrap">
            <input
              type="text"
              className="search-input panel-input"
              placeholder={replacePlaceholder}
              value={replaceValue}
              disabled={scope === 'folder' ? !hasFolder : !hasDocument}
              onChange={(event) => onReplaceValueChange(event.target.value)}
            />
          </div>
        ) : null}

        <div className="search-toolbar">
          <span className="search-count">{countLabel}</span>
          <div className="search-nav-buttons">
            {scope === 'document' ? (
              <>
                <button type="button" className="panel-action" disabled={!currentMatches.length} onClick={() => moveSelection(-1)}>
                  이전
                </button>
                <button type="button" className="panel-action" disabled={!currentMatches.length} onClick={() => moveSelection(1)}>
                  다음
                </button>
              </>
            ) : null}
            {mode === 'replace' && scope === 'document' ? (
              <>
                <button type="button" className="panel-action" disabled={!currentMatches.length} onClick={replaceCurrentDocumentMatch}>
                  현재 바꾸기
                </button>
                <button type="button" className="panel-action" disabled={!currentMatches.length} onClick={replaceAllDocumentMatches}>
                  모두 바꾸기
                </button>
              </>
            ) : null}
            {mode === 'replace' && scope === 'folder' ? (
              <button type="button" className="panel-action" disabled={!currentMatches.length || folderBusy} onClick={replaceAllFolderMatches}>
                폴더 전체 바꾸기
              </button>
            ) : null}
          </div>
        </div>

        {folderStatus ? <div className="search-status">{folderStatus}</div> : null}

        <div className="search-results">
          {scope === 'folder' ? (
            folderHint && query.trim() ? (
              <div className="search-hint">{folderHint}</div>
            ) : (
              folderMatches.map((match, index) => (
                <button
                  key={`${match.filePath}-${match.lineNumber}-${match.start}-${index}`}
                  type="button"
                  className={`search-result-item ${
                    isSearchSelectionMatch(searchSelection, { ...match, filePath: match.filePath })
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => {
                      onSelectedIndexChange(index);
                      onSelectFolderResult(match);
                  }}
                >
                  <span className="search-result-meta">{match.fileName}</span>
                  <span className="search-result-submeta">{match.lineNumber}행</span>
                  {renderHighlightedLine(match.lineText, match.start, match.end)}
                </button>
              ))
            )
          ) : documentHint && query.trim() ? (
            <div className="search-hint">{documentHint}</div>
          ) : (
            documentMatches.map((match, index) => (
              <button
                key={`${match.lineNumber}-${match.start}-${index}`}
                type="button"
                className={`search-result-item ${
                  isSearchSelectionMatch(searchSelection, match)
                    ? 'active'
                    : ''
                }`}
                onClick={() => {
                  onSelectedIndexChange(index);
                  onSelectResult(match);
                }}
              >
                <span className="search-result-meta">{match.lineNumber}행</span>
                {renderHighlightedLine(match.lineText, match.start, match.end)}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

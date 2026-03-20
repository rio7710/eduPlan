import { useEffect, useMemo, useState } from 'react';

export type SearchMode = 'find' | 'replace';
export type SearchScope = 'document' | 'folder';

type SearchMatch = {
  lineNumber: number;
  lineText: string;
  start: number;
  end: number;
};

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatches(content: string, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [] as SearchMatch[];
  }

  const matcher = new RegExp(escapeRegExp(trimmedQuery), 'gi');
  const lines = content.split(/\r?\n/);
  const matches: SearchMatch[] = [];

  lines.forEach((lineText, index) => {
    matcher.lastIndex = 0;
    let result = matcher.exec(lineText);
    while (result) {
      const matchedText = result[0] ?? '';
      matches.push({
        lineNumber: index + 1,
        lineText,
        start: result.index,
        end: result.index + matchedText.length,
      });
      if (!matchedText.length) {
        break;
      }
      result = matcher.exec(lineText);
    }
  });

  return matches;
}

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
  activeLine = null,
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
  const [folderMatches, setFolderMatches] = useState<FolderSearchMatch[]>([]);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderStatus, setFolderStatus] = useState('');

  const documentMatches = useMemo(() => buildMatches(document?.content ?? '', query), [document?.content, query]);
  const currentMatches = scope === 'folder' ? folderMatches : documentMatches;
  const hasDocument = Boolean(document);
  const hasFolder = Boolean(folderPath);

  useEffect(() => {
    if (!hasFolder && scope === 'folder') {
      onScopeChange('document');
    }
  }, [hasFolder, onScopeChange, scope]);

  useEffect(() => {
    if (!hasDocument && hasFolder && scope === 'document') {
      onScopeChange('folder');
    }
  }, [hasDocument, hasFolder, onScopeChange, scope]);

  useEffect(() => {
    onSelectedIndexChange(0);
    setFolderStatus('');
  }, [folderPath, mode, onSelectedIndexChange, query, scope]);

  useEffect(() => {
    let cancelled = false;

    async function runFolderSearch() {
      if (scope !== 'folder') {
        setFolderMatches([]);
        return;
      }

      if (!folderPath || !query.trim()) {
        setFolderMatches([]);
        return;
      }

      setFolderBusy(true);
      try {
        const results = await window.eduFixerApi?.searchInFolder({
          folderPath,
          query,
        });
        if (!cancelled) {
          setFolderMatches(results ?? []);
        }
      } catch {
        if (!cancelled) {
          setFolderMatches([]);
          setFolderStatus('폴더 검색 중 오류가 발생했습니다');
        }
      } finally {
        if (!cancelled) {
          setFolderBusy(false);
        }
      }
    }

    void runFolderSearch();

    return () => {
      cancelled = true;
    };
  }, [folderPath, query, scope]);

  function moveSelection(direction: 1 | -1) {
    if (!currentMatches.length) {
      return;
    }

    const nextIndex = (selectedIndex + direction + currentMatches.length) % currentMatches.length;
    const nextMatch = currentMatches[nextIndex];
    onSelectedIndexChange(nextIndex);

    if (scope === 'folder') {
      onSelectFolderResult(nextMatch as FolderSearchMatch);
      return;
    }

    onSelectResult(nextMatch as SearchMatch);
  }

  function replaceCurrentDocumentMatch() {
    if (!document || !query.trim() || scope !== 'document') {
      return;
    }

    const selectedMatch = currentMatches[selectedIndex] ?? null;
    const target = selectedMatch as SearchMatch | null;
    if (!target) {
      return;
    }

    const lines = document.content.split(/\r?\n/);
    const lineIndex = target.lineNumber - 1;
    const lineText = lines[lineIndex] ?? '';
    lines[lineIndex] = lineText.slice(0, target.start) + replaceValue + lineText.slice(target.end);
    onReplaceContent(lines.join('\n'));
  }

  function replaceAllDocumentMatches() {
    if (!document || !query.trim() || scope !== 'document') {
      return;
    }

    const matcher = new RegExp(escapeRegExp(query.trim()), 'gi');
    onReplaceContent(document.content.replace(matcher, replaceValue));
  }

  async function replaceAllFolderMatches() {
    if (!folderPath || !query.trim() || scope !== 'folder') {
      return;
    }

    setFolderBusy(true);
    setFolderStatus('');
    try {
      const result = await window.eduFixerApi?.replaceInFolder({
        folderPath,
        query,
        replaceValue,
      });

      if (!result) {
        setFolderStatus('폴더 일괄 바꾸기를 완료하지 못했습니다');
        return;
      }

      onApplyFolderReplace(result.changedFiles);
      setFolderStatus(`${result.changedFileCount}개 파일, ${result.replacementCount}건 바꿨습니다`);

      const refreshedResults = await window.eduFixerApi?.searchInFolder({
        folderPath,
        query,
      });
      setFolderMatches(refreshedResults ?? []);
      onSelectedIndexChange(0);
    } catch {
      setFolderStatus('폴더 일괄 바꾸기 중 오류가 발생했습니다');
    } finally {
      setFolderBusy(false);
    }
  }

  const countLabel = (() => {
    if (scope === 'folder') {
      if (!hasFolder) {
        return '열린 폴더 없음';
      }
      if (!query.trim()) {
        return '검색어를 입력하세요';
      }
      if (folderBusy) {
        return '폴더 검색 중...';
      }
      return `${folderMatches.length}개 결과`;
    }

    if (!hasDocument) {
      return '열린 문서 없음';
    }
    if (!query.trim()) {
      return '검색어를 입력하세요';
    }
    return `${documentMatches.length}개 결과`;
  })();

  return (
    <div className="panel active" id="panel-search">
      <div className="panel-header panel-header-row search-header-row">
        <span>검색</span>
        <div className="search-header-scope">
          <span className="search-header-label">{scope === 'folder' ? '폴더 전체' : '현재 문서'}</span>
          <button
            type="button"
            className={`search-scope-switch ${scope === 'folder' ? 'is-on' : 'is-off'}`}
            role="switch"
            aria-label="검색 범위 전환"
            aria-checked={scope === 'folder'}
            onClick={() => {
              if (scope === 'folder') {
                onScopeChange('document');
                return;
              }
              onScopeChange(hasDocument ? 'document' : 'folder');
            }}
          >
            <span className="search-scope-switch-thumb" aria-hidden="true" />
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
            placeholder={
              scope === 'folder'
                ? hasFolder
                  ? '열린 폴더 전체에서 검색...'
                  : '폴더를 먼저 열어주세요'
                : hasDocument
                  ? '현재 문서에서 검색...'
                  : hasFolder
                    ? '현재 문서가 없어 폴더 전체 검색으로 전환됩니다'
                    : '문서를 먼저 열어주세요'
            }
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
              placeholder={scope === 'folder' ? '폴더 전체에서 바꿀 내용...' : '현재 문서에서 바꿀 내용...'}
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
            !hasFolder ? (
              <div className="search-hint">현재 문서 기준 폴더를 찾을 수 없습니다</div>
            ) : !query.trim() ? (
              <div className="search-hint">검색어를 입력하세요</div>
            ) : folderBusy ? (
              <div className="search-hint">폴더 전체를 검색하고 있습니다</div>
            ) : !folderMatches.length ? (
              <div className="search-hint">일치하는 결과가 없습니다</div>
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
          ) : !hasDocument ? (
            <div className="search-hint">검색할 문서를 먼저 열어주세요</div>
          ) : !query.trim() ? (
            <div className="search-hint">검색어를 입력하세요</div>
          ) : !documentMatches.length ? (
            <div className="search-hint">일치하는 결과가 없습니다</div>
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

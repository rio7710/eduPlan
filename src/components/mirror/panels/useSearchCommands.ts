import { useEffect, useMemo, useState } from 'react';
import { getSearchCountLabel } from '@/components/mirror/panels/searchPanelText';

export type SearchMode = 'find' | 'replace';
export type SearchScope = 'document' | 'folder';

export type SearchMatch = {
  lineNumber: number;
  lineText: string;
  start: number;
  end: number;
};

type UseSearchCommandsParams = {
  document: ShellDocument | null;
  folderPath: string | null;
  mode: SearchMode;
  scope: SearchScope;
  query: string;
  replaceValue: string;
  selectedIndex: number;
  onScopeChange: (scope: SearchScope) => void;
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

export function useSearchCommands({
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
}: UseSearchCommandsParams) {
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
    return getSearchCountLabel({
      scope,
      hasDocument,
      hasFolder,
      query,
      folderBusy,
      folderMatchCount: folderMatches.length,
      documentMatchCount: documentMatches.length,
    });
  })();

  return {
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
  };
}

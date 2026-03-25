type SearchScope = 'document' | 'folder';

type CountLabelParams = {
  scope: SearchScope;
  hasDocument: boolean;
  hasFolder: boolean;
  query: string;
  folderBusy: boolean;
  folderMatchCount: number;
  documentMatchCount: number;
};

export function getSearchInputPlaceholder(scope: SearchScope, hasFolder: boolean, hasDocument: boolean) {
  if (scope === 'folder') {
    return hasFolder ? '열린 폴더 전체에서 검색...' : '폴더를 먼저 열어주세요';
  }
  if (hasDocument) {
    return '현재 문서에서 검색...';
  }
  return hasFolder ? '현재 문서가 없어 폴더 전체 검색으로 전환됩니다' : '문서를 먼저 열어주세요';
}

export function getReplaceInputPlaceholder(scope: SearchScope) {
  return scope === 'folder' ? '폴더 전체에서 바꿀 내용...' : '현재 문서에서 바꿀 내용...';
}

export function getSearchCountLabel({
  scope,
  hasDocument,
  hasFolder,
  query,
  folderBusy,
  folderMatchCount,
  documentMatchCount,
}: CountLabelParams) {
  if (scope === 'folder') {
    if (!hasFolder) return '열린 폴더 없음';
    if (!query.trim()) return '검색어를 입력하세요';
    if (folderBusy) return '폴더 검색 중...';
    return `${folderMatchCount}개 결과`;
  }
  if (!hasDocument) return '열린 문서 없음';
  if (!query.trim()) return '검색어를 입력하세요';
  return `${documentMatchCount}개 결과`;
}

export function getFolderResultHint(hasFolder: boolean, query: string, folderBusy: boolean, folderMatchCount: number) {
  if (!hasFolder) return '현재 문서 기준 폴더를 찾을 수 없습니다';
  if (!query.trim()) return '검색어를 입력하세요';
  if (folderBusy) return '폴더 전체를 검색하고 있습니다';
  if (!folderMatchCount) return '일치하는 결과가 없습니다';
  return null;
}

export function getDocumentResultHint(hasDocument: boolean, query: string, documentMatchCount: number) {
  if (!hasDocument) return '검색할 문서를 먼저 열어주세요';
  if (!query.trim()) return '검색어를 입력하세요';
  if (!documentMatchCount) return '일치하는 결과가 없습니다';
  return null;
}

/**
 * eduFixer 공통 텍스트 및 경로 처리 유틸리티
 */

/**
 * 파일 확장자 확인 (PDF 여부)
 */
export function isPdfPath(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  return filePath.toLowerCase().endsWith('.pdf');
}

/**
 * 텍스트 파일 여부 확인
 */
const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.srt', '.vtt', '.html', '.htm'];
export function isTextFilePath(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return TEXT_EXTENSIONS.includes(ext);
}

/**
 * 부모 폴더 경로 추출
 */
export function getParentFolderPath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const normalized = filePath.replace(/[\\/]+$/, '');
  const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (lastSeparator < 0) return null;
  return normalized.slice(0, lastSeparator);
}

/**
 * 문서 상대 경로를 절대 경로로 변환
 */
export function resolveRelativePath(basePath: string | null | undefined, relativePath: string): string {
  if (!basePath) return relativePath;
  const baseDir = getParentFolderPath(basePath);
  if (!baseDir) return relativePath;

  const cleanRelative = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return `${baseDir}/${cleanRelative}`.replace(/\//g, '\\'); // Windows 환경 우선
}

/**
 * 마크다운 텍스트 정규화 및 정제
 * @param options 상세 처리 옵션 (불렛 변환, 물결표 이스케이프 등)
 */
export function normalizeMarkdown(text: string, options: {
  stripComments?: boolean;
  normalizeBullets?: boolean;
  escapeTildes?: boolean;
} = {}): string {
  let result = text;

  // 1. 주석 제거
  if (options.stripComments) {
    result = result
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\[\/\/\]:\s*#\s*\(.*\)\s*$/gm, '')
      .replace(/^\[comment\]:\s*#\s*\(.*\)\s*$/gim, '');
  }

  // 2. 레거시 불렛(Word/PPT/PDF 유입) 변환
  if (options.normalizeBullets) {
    result = result.split(/\r?\n/).map(line => 
      line.replace(/^(\s*)(?:[\u2022\u25E6\u25AA\u25CF\u00B7\u2219\u2023\u2043\u25B8\u25B6\u25C6\u2713\u2714\u2717\u2718\u271A\u2611\u2610\uF000-\uF8FF])\s+/u, '$1- ')
    ).join('\n');
  }

  // 3. 숫자 사이 물결표 이스케이프 (마크다운 취소선 방지)
  if (options.escapeTildes) {
    result = result.replace(/(\d)~(?=\d)/g, '$1\\~');
  }

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 클립보드 복사용 텍스트 정제
 */
export function cleanTextForCopy(text: string, options: {
  stripBullets?: boolean;
  compactBreaks?: boolean;
} = {}): string {
  let result = text;

  // 1. 불렛 및 번호 제거 (순수 텍스트만 추출 시)
  if (options.stripBullets) {
    result = result.split(/\r?\n/).map(line => 
      line.replace(/^\s*(?:\d+(?:[.-]\d+)*(?:강|장|절|단원)?[.,)\-]?\s+|\(\d+\)\s+|[①-⑳]\s+|-\s+)/u, '')
    ).join('\n');
  }

  // 2. 줄바꿈 압축 및 공백 정리
  if (options.compactBreaks) {
    result = result
      .replace(/\r\n?/g, '\n')
      .replace(/\u00A0/g, ' ')
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      .replace(/\n[ \t]*\n+/g, '\n')
      .trim();
  }

  return result;
}

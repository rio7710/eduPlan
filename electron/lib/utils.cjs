const path = require('node:path');
const fs = require('node:fs/promises');

/**
 * PDF 파일 여부 확인
 */
function isPdfPath(filePath) {
  return path.extname(String(filePath || '')).toLowerCase() === '.pdf';
}

/**
 * ISO 형식의 현재 시간 반환
 */
function toIsoNow() {
  return new Date().toISOString();
}

/**
 * 마크다운 블록 개수 계산
 */
function countBlocks(content) {
  return content
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean).length;
}

/**
 * 단어 단위 토큰화
 */
function tokenizeWords(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 컨텍스트 윈도우 추출
 */
function takeContextWindow(text, fromStart = false, wordCount = 3) {
  const words = tokenizeWords(text);
  if (!words.length) {
    return '';
  }

  return fromStart
    ? words.slice(0, wordCount).join(' ')
    : words.slice(Math.max(0, words.length - wordCount)).join(' ');
}

/**
 * 윈도우 기반 변경 내역 추출
 */
function extractWindowedChange(oldText, newText) {
  const oldLines = String(oldText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const newLines = String(newText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const oldJoined = oldLines.join(' ').trim();
  const newJoined = newLines.join(' ').trim();

  const oldWords = tokenizeWords(oldJoined);
  const newWords = tokenizeWords(newJoined);
  const sharedPrefix = [];
  let cursor = 0;
  while (cursor < oldWords.length && cursor < newWords.length && oldWords[cursor] === newWords[cursor]) {
    sharedPrefix.push(oldWords[cursor]);
    cursor += 1;
  }

  return {
    originalWindow: oldJoined || oldText.trim(),
    editedWindow: newJoined || newText.trim(),
    contextBefore: sharedPrefix.slice(Math.max(0, sharedPrefix.length - 3)).join(' '),
  };
}

/**
 * 패치 타입 추론
 */
function inferEditPatchType(oldChunk, newChunk) {
  const oldCompact = oldChunk.replace(/\s+/g, '');
  const newCompact = newChunk.replace(/\s+/g, '');
  if (oldCompact === newCompact && oldChunk !== newChunk) {
    return 'spacing';
  }

  const oldLineCount = oldChunk.split(/\r?\n/).filter(Boolean).length;
  const newLineCount = newChunk.split(/\r?\n/).filter(Boolean).length;
  if (oldLineCount > 1 && newLineCount === 1) {
    return 'merge';
  }
  if (oldLineCount === 1 && newLineCount > 1) {
    return 'split';
  }
  return 'typo';
}

/**
 * 변경 전후의 텍스트 차이(Patch) 추출 (ML 학습용)
 */
function extractEditPatches(previousContent, nextContent) {
  const previousLines = String(previousContent || '').split(/\r?\n/);
  const nextLines = String(nextContent || '').split(/\r?\n/);
  const maxLength = Math.max(previousLines.length, nextLines.length);
  const changedLineIndexes = [];

  for (let index = 0; index < maxLength; index += 1) {
    if ((previousLines[index] ?? '') !== (nextLines[index] ?? '')) {
      changedLineIndexes.push(index);
    }
  }

  if (!changedLineIndexes.length) {
    return [];
  }

  const groups = [];
  let current = [changedLineIndexes[0]];
  for (let index = 1; index < changedLineIndexes.length; index += 1) {
    const lineIndex = changedLineIndexes[index];
    if (lineIndex - current[current.length - 1] <= 1) {
      current.push(lineIndex);
      continue;
    }
    groups.push(current);
    current = [lineIndex];
  }
  groups.push(current);

  return groups.map((group, groupIndex) => {
    const start = Math.max(0, group[0] - 1);
    const end = group[group.length - 1] + 1;
    const oldChunk = previousLines.slice(start, end + 1).join('\n').trim();
    const newChunk = nextLines.slice(start, end + 1).join('\n').trim();
    const { originalWindow, editedWindow, contextBefore } = extractWindowedChange(oldChunk, newChunk);
    const changeType = inferEditPatchType(oldChunk, newChunk);
    
    return {
      patchIndex: groupIndex + 1,
      lineStart: start + 1,
      lineEnd: end + 1,
      changeType,
      originalText: oldChunk,
      editedText: newChunk,
      originalWindow,
      editedWindow,
      diffSummary: `${contextBefore ? `[ctx] ${contextBefore}\n` : ''}- ${originalWindow || oldChunk}\n+ ${editedWindow || newChunk}`,
    };
  }).filter((patch) => patch.originalText !== patch.editedText);
}

/**
 * 재귀적 파일 탐색
 */
async function walkFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }
      return [fullPath];
    }),
  );
  return nested.flat();
}

/**
 * 직계 파일 목록 추출
 */
async function listDirectFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(rootPath, entry.name));
}

module.exports = {
  isPdfPath,
  toIsoNow,
  countBlocks,
  tokenizeWords,
  takeContextWindow,
  extractWindowedChange,
  inferEditPatchType,
  extractEditPatches,
  walkFiles,
  listDirectFiles,
};

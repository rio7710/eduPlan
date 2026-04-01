const path = require('node:path');

function isCandidateLine(line) {
  const text = String(line || '').trim();
  if (!text || text === '---') {
    return false;
  }
  if (/^!\[image/i.test(text) || /^-\s*\d+\s*-$/.test(text)) {
    return false;
  }
  if (/^[#>\-\*\[]/.test(text) || /^[0-9]+\./.test(text) || /^[①-⑳]/.test(text)) {
    return false;
  }
  return true;
}

function isSentenceLikeLine(line) {
  const text = String(line || '').trim();
  if (text.length < 8) {
    return false;
  }
  if (!text.includes(' ')) {
    return false;
  }
  return true;
}

function extractTrailingHangul(line) {
  const matched = String(line || '').match(/([가-힣]{1,2})$/);
  return matched ? matched[1] : '';
}

function extractLeadingHangul(line) {
  const matched = String(line || '').match(/^([가-힣]+)/);
  return matched ? matched[1] : '';
}

function buildSentenceReviewItems({ markdownPath, sourcePdfPath, markdownContent }) {
  const lines = String(markdownContent || '').split(/\r?\n/);
  const sourcePdfName = path.basename(String(sourcePdfPath || markdownPath || ''));
  const reviewItems = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index];
    if (!isCandidateLine(current) || !isSentenceLikeLine(current)) {
      continue;
    }
    let nextIndex = index + 1;
    while (nextIndex < lines.length && !String(lines[nextIndex] || '').trim()) {
      nextIndex += 1;
    }
    if (nextIndex >= lines.length || nextIndex - index > 2) {
      continue;
    }

    const next = lines[nextIndex];
    if (!isCandidateLine(next) || !isSentenceLikeLine(next)) {
      continue;
    }

    const trailing = extractTrailingHangul(current);
    const leading = extractLeadingHangul(next);
    if (!trailing || !leading) {
      continue;
    }

    if (/[.!?;:]$/.test(current.trim())) {
      continue;
    }

    const suggested = `${current}${next}`;
    reviewItems.push({
      id: `stage1:${markdownPath}:${index + 1}`,
      type: 'sentence_edit',
      sourcePdfName,
      sourcePdfPath,
      markdownPath,
      reviewDir: '',
      previewImagePath: '',
      candidateCount: 1,
      memberPaths: [],
      createdAt: new Date().toISOString(),
      status: 'pending',
      editType: 'line_break_merge_no_space',
      contentKind: 'line',
      action: 'modify',
      qualityScore: 0.86,
      lineStart: index + 1,
      lineEnd: nextIndex + 1,
      leftContext: lines[index - 1] || '',
      beforeFocus: `${current}\n${next}`,
      afterFocus: suggested,
      rightContext: lines[nextIndex + 1] || '',
      originalText: `${current}\n${next}`,
      editedText: suggested,
      originalWindow: `${lines[index - 1] || ''}\n${current}\n${next}\n${lines[nextIndex + 1] || ''}`.trim(),
      editedWindow: `${lines[index - 1] || ''}\n${suggested}\n${lines[nextIndex + 1] || ''}`.trim(),
      diffSummary: `merge broken line ${index + 1}-${nextIndex + 1} without space`,
    });

    index = nextIndex - 1;
  }

  return reviewItems;
}

module.exports = {
  buildSentenceReviewItems,
};

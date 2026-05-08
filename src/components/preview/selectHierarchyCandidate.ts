export function selectHierarchyCandidate(
  items: HierarchyPatternReviewItem[],
  focusLine: number,
  selectedText = '',
) {
  if (!items.length) {
    return null;
  }
  const normalizedSelectedText = selectedText.trim();
  const selectedRangeItem = items.find((item) =>
    item.id.includes(':selected_range:')
    || item.patternSummary === '선택 영역 직접 분석');
  if (normalizedSelectedText && selectedRangeItem) {
    return selectedRangeItem;
  }
  return items
    .slice()
    .sort((left, right) => {
      const leftText = left.sampleTexts.join(' ').trim();
      const rightText = right.sampleTexts.join(' ').trim();
      const leftTextMatch = normalizedSelectedText && (normalizedSelectedText.includes(leftText) || leftText.includes(normalizedSelectedText)) ? 1 : 0;
      const rightTextMatch = normalizedSelectedText && (normalizedSelectedText.includes(rightText) || rightText.includes(normalizedSelectedText)) ? 1 : 0;
      if (leftTextMatch !== rightTextMatch) {
        return rightTextMatch - leftTextMatch;
      }
      const leftDistance = Math.abs((left.sampleLines[0] ?? focusLine) - focusLine);
      const rightDistance = Math.abs((right.sampleLines[0] ?? focusLine) - focusLine);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return (left.sampleLines[0] ?? 0) - (right.sampleLines[0] ?? 0);
    })[0] ?? null;
}

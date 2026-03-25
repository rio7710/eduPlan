type ClipboardPayload = {
  plain: string;
  html?: string;
};

function canUseNavigatorClipboard(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.clipboard);
}

export async function writePreviewClipboard(payload: ClipboardPayload): Promise<boolean> {
  try {
    window.eduFixerApi?.writeClipboard(payload);
    return true;
  } catch (error) {
    console.warn('[preview-copy] electron clipboard bridge failed, falling back to navigator.clipboard', error);
  }

  if (!canUseNavigatorClipboard()) {
    return false;
  }

  try {
    if (payload.html && typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard.write === 'function') {
      try {
        const item = new ClipboardItem({
          'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
          'text/html': new Blob([payload.html], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
        return true;
      } catch (error) {
        console.warn('[preview-copy] html clipboard write failed, falling back to plain text only', error);
      }
    }

    await navigator.clipboard.writeText(payload.plain);
    return true;
  } catch (error) {
    console.error('[preview-copy] navigator clipboard fallback failed', error);
    return false;
  }
}

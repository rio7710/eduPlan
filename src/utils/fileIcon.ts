export function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();

  if (ext === 'md') return 'MD';
  if (ext === 'txt') return 'TXT';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'html') return 'HTML';

  return (ext ?? 'FILE').slice(0, 4).toUpperCase();
}

export function getFileIconClass(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? `file-badge-${ext}` : 'file-badge-file';
}

export function downloadBlobUrl(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function revokeBlobUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

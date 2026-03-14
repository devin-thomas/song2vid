import type { ClassifiedDrop, MediaKind, WidescreenSize } from './types';

export const AUDIO_EXTENSIONS = ['.wav', '.mp3'] as const;
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'] as const;

export const AUDIO_ACCEPT = AUDIO_EXTENSIONS.join(',');
export const IMAGE_ACCEPT = IMAGE_EXTENSIONS.join(',');

const AUDIO_SET = new Set<string>(AUDIO_EXTENSIONS);
const IMAGE_SET = new Set<string>(IMAGE_EXTENSIONS);

export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
}

export function detectMediaKind(file: Pick<File, 'name'>): MediaKind {
  const extension = getFileExtension(file.name);

  if (AUDIO_SET.has(extension)) {
    return 'audio';
  }

  if (IMAGE_SET.has(extension)) {
    return 'image';
  }

  return 'unsupported';
}

export function assertKind(file: File, expectedKind: Exclude<MediaKind, 'unsupported'>): void {
  const actualKind = detectMediaKind(file);

  if (actualKind !== expectedKind) {
    const supported = expectedKind === 'audio' ? AUDIO_EXTENSIONS.join(', ') : IMAGE_EXTENSIONS.join(', ');
    throw new Error(`Unsupported ${expectedKind} file "${file.name}". Supported ${expectedKind} types: ${supported}.`);
  }
}

export function classifyDroppedFiles(files: File[]): ClassifiedDrop {
  if (files.length === 0) {
    throw new Error('Drop at least one supported audio or image file.');
  }

  const unsupportedFiles = files.filter((file) => detectMediaKind(file) === 'unsupported');

  if (unsupportedFiles.length > 0) {
    const names = unsupportedFiles.map((file) => file.name).join(', ');
    throw new Error(
      `Unsupported file(s): ${names}. Supported audio: ${AUDIO_EXTENSIONS.join(', ')}. Supported images: ${IMAGE_EXTENSIONS.join(', ')}.`
    );
  }

  const audioFiles = files.filter((file) => detectMediaKind(file) === 'audio');
  const imageFiles = files.filter((file) => detectMediaKind(file) === 'image');

  if (audioFiles.length > 1) {
    throw new Error(`Drop only one audio file at a time. Received ${audioFiles.length} audio files.`);
  }

  if (imageFiles.length > 1) {
    throw new Error(`Drop only one image file at a time. Received ${imageFiles.length} image files.`);
  }

  return {
    audioFile: audioFiles[0] ?? null,
    imageFile: imageFiles[0] ?? null
  };
}

export function areSameFile(left: File | null, right: File | null): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.name === right.name &&
    left.size === right.size &&
    left.lastModified === right.lastModified &&
    left.type === right.type
  );
}

export function getFileStem(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');

  if (lastDot > 0) {
    return fileName.slice(0, lastDot);
  }

  return fileName;
}

export function sanitizeFilenameStem(stem: string): string {
  const sanitized = stem
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ');

  return sanitized || 'output';
}

export function getOutputFilename(audioFile: File | null): string {
  if (!audioFile) {
    return 'output.mp4';
  }

  return `${sanitizeFilenameStem(getFileStem(audioFile.name))}.mp4`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

export function parseWidescreenSize(size: WidescreenSize): { width: number; height: number } {
  const [width, height] = size.split('x').map((value) => Number(value));
  return { width, height };
}

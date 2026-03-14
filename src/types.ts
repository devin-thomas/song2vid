export type MediaKind = 'audio' | 'image' | 'unsupported';

export type OutputMode = 'match' | 'widescreen' | 'vertical';

export type WidescreenSize = '1920x1080' | '3840x2160';

export type FFmpegLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type LogLevel = 'info' | 'success' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export interface AppState {
  selectedAudio: File | null;
  selectedImage: File | null;
  busy: boolean;
  preferHardwareEncoding: boolean;
  selectedMode: OutputMode;
  widescreenSize: WidescreenSize;
  ffmpegState: FFmpegLoadState;
  logs: LogEntry[];
  progress: number | null;
  statusText: string;
  errorMessage: string | null;
  downloadUrl: string | null;
  downloadFilename: string | null;
  downloadSizeBytes: number | null;
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  sourceFileName: string;
  normalizedFileName: string;
}

export interface VideoPlan {
  outputWidth: number;
  outputHeight: number;
  filter: string;
  description: string;
}

export interface EncodeRequest {
  audioFile: File;
  image: PreparedImage;
  plan: VideoPlan;
}

export interface ClassifiedDrop {
  audioFile: File | null;
  imageFile: File | null;
}

export interface HardwareVideoResult {
  data: Uint8Array;
  codec: 'h264' | 'hevc';
  codecLabel: string;
  frameRate: number;
}

import type { AppState, FFmpegLoadState, LogEntry, LogLevel } from './types';

const MAX_LOG_ENTRIES = 80;

let nextLogId = 1;

type Listener = (state: AppState) => void;
type StatePatch = Partial<AppState> | ((state: AppState) => Partial<AppState>);

export function createInitialState(): AppState {
  return {
    selectedAudio: null,
    selectedImage: null,
    busy: false,
    preferHardwareEncoding: false,
    selectedMode: 'match',
    widescreenSize: '1920x1080',
    ffmpegState: 'idle',
    logs: [],
    progress: null,
    statusText: 'Select a song and optionally an image to get started.',
    errorMessage: null,
    downloadUrl: null,
    downloadFilename: null,
    downloadSizeBytes: null
  };
}

export class AppStore {
  private state: AppState = createInitialState();
  private listeners = new Set<Listener>();

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  setState(patch: StatePatch): void {
    const nextPatch = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = {
      ...this.state,
      ...nextPatch
    };

    this.emit();
  }

  addLog(level: LogLevel, message: string): void {
    const entry: LogEntry = {
      id: nextLogId++,
      level,
      message,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };

    this.setState((state) => ({
      logs: [entry, ...state.logs].slice(0, MAX_LOG_ENTRIES)
    }));
  }

  setFFmpegState(ffmpegState: FFmpegLoadState): void {
    this.setState({ ffmpegState });
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

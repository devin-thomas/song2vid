import { formatBytes, getOutputFilename } from './media';
import type { AppState, OutputMode } from './types';

export interface AppDom {
  audioInput: HTMLInputElement;
  imageInput: HTMLInputElement;
  dropZone: HTMLElement;
  pickAudioButton: HTMLButtonElement;
  pickImageButton: HTMLButtonElement;
  clearAudioButton: HTMLButtonElement;
  clearImageButton: HTMLButtonElement;
  createVideoButton: HTMLButtonElement;
  widescreenSelect: HTMLSelectElement;
  hardwareCheckbox: HTMLInputElement;
  modeInputs: Record<OutputMode, HTMLInputElement>;
  audioName: HTMLElement;
  audioMeta: HTMLElement;
  imageName: HTMLElement;
  imageMeta: HTMLElement;
  outputFilename: HTMLElement;
  statusText: HTMLElement;
  ffmpegBadge: HTMLElement;
  errorText: HTMLElement;
  progressBar: HTMLProgressElement;
  progressText: HTMLElement;
  downloadSection: HTMLElement;
  downloadLink: HTMLAnchorElement;
  downloadMeta: HTMLElement;
  logList: HTMLOListElement;
}

export function createAppDom(root: HTMLElement): AppDom {
  root.innerHTML = `
    <main class="app-shell">
      <section class="hero-panel panel">
        <div class="hero-copy">
          <p class="eyebrow">Song to video, simply</p>
          <h1>song2vid</h1>
          <p class="lede lede--subtitle">A Site to Easily Convert Songs to Videos</p>
          <p class="lede">
            Pick one <strong>WAV or MP3</strong>, optionally add a <strong>PNG, JPG, JPEG, GIF, or WEBP</strong>,
            then create an MP4 entirely in the browser with ffmpeg.wasm.
          </p>
        </div>
        <div class="hero-status">
          <span class="status-chip" data-ffmpeg-badge>Encoder idle</span>
          <p class="status-copy">GitHub Pages friendly static browser utility. No backend. No uploads.</p>
        </div>
      </section>

      <section class="workspace-grid">
        <section class="panel drop-panel">
          <div
            class="drop-zone"
            data-drop-zone
            tabindex="0"
            aria-label="Drag and drop one audio file, one image file, or both together."
          >
            <div class="drop-zone__inner">
              <p class="drop-zone__title">Drop files here</p>
              <p class="drop-zone__copy">
                Drop audio only, image only, or one of each. If no image is selected, song2vid generates a simple title card from the song name.
              </p>
              <p class="drop-zone__hint">Supported: WAV, MP3, PNG, JPG, JPEG, GIF, WEBP</p>
            </div>
          </div>

          <div class="actions-grid">
            <button type="button" class="button button--primary" data-pick-audio>Pick Audio</button>
            <button type="button" class="button button--primary" data-pick-image>Pick Image</button>
            <button type="button" class="button button--ghost" data-clear-audio>Clear Audio</button>
            <button type="button" class="button button--ghost" data-clear-image>Clear Image</button>
          </div>

          <div class="status-cards">
            <article class="status-card">
              <p class="status-card__label">Audio</p>
              <p class="status-card__name" data-audio-name>No audio selected</p>
              <p class="status-card__meta" data-audio-meta>Choose a single WAV or MP3 file.</p>
            </article>
            <article class="status-card">
              <p class="status-card__label">Image</p>
              <p class="status-card__name" data-image-name>No image selected</p>
              <p class="status-card__meta" data-image-meta>Optional: choose a single PNG, JPG, JPEG, GIF, or WEBP file.</p>
            </article>
          </div>
        </section>

        <section class="panel controls-panel">
          <div class="panel-heading">
            <h2>Output Settings</h2>
            <p>Use the song filename stem as the MP4 name and choose how the frame should be composed.</p>
          </div>

          <fieldset class="mode-group">
            <legend>Output mode</legend>

            <label class="mode-option">
              <input type="radio" name="output-mode" value="match" data-mode="match" checked />
              <span>
                <strong>Match Image</strong>
                <small>Keep the image size when possible, force even dimensions, and cap at 3840x2160.</small>
              </span>
            </label>

            <label class="mode-option">
              <input type="radio" name="output-mode" value="widescreen" data-mode="widescreen" />
              <span>
                <strong>16:9</strong>
                <small>Scale to fit and add black padding for a fixed widescreen frame.</small>
              </span>
            </label>

            <label class="mode-option">
              <input type="radio" name="output-mode" value="vertical" data-mode="vertical" />
              <span>
                <strong>9:16</strong>
                <small>Center-crop the image to vertical framing, then scale to 720x1280.</small>
              </span>
            </label>
          </fieldset>

          <label class="field">
            <span>16:9 frame size</span>
            <select data-widescreen-select>
              <option value="1920x1080">1920x1080</option>
              <option value="3840x2160">3840x2160</option>
            </select>
          </label>

          <label class="checkbox-field">
            <input type="checkbox" data-hardware-checkbox />
            <span>
              <strong>Prefer hardware encoding (experimental)</strong>
              <small>Tries browser hardware HEVC first, then H.264, then falls back to ffmpeg.wasm software encoding.</small>
            </span>
          </label>

          <div class="output-block">
            <p class="output-block__label">Output filename</p>
            <p class="output-block__value" data-output-filename>output.mp4</p>
          </div>

          <button type="button" class="button button--accent button--large" data-create-video>
            Create Video
          </button>

          <div class="feedback-stack">
            <p class="status-line" data-status-text>Select a song and optionally an image to get started.</p>
            <p class="error-line" data-error-text hidden></p>
            <div class="progress-block">
              <progress max="1" value="0" data-progress-bar></progress>
              <p class="progress-copy" data-progress-text>Idle</p>
            </div>
            <div class="download-block" data-download-section hidden>
              <a class="download-link" data-download-link href="#">Download latest MP4</a>
              <p class="download-meta" data-download-meta></p>
            </div>
          </div>
        </section>
      </section>

      <section class="panel log-panel">
        <div class="panel-heading">
          <h2>Status Log</h2>
          <p>Load and encode progress is reported here.</p>
        </div>
        <ol class="log-list" data-log-list aria-live="polite"></ol>
      </section>

      <input class="visually-hidden" type="file" accept=".wav,.mp3" data-audio-input />
      <input class="visually-hidden" type="file" accept=".png,.jpg,.jpeg,.gif,.webp" data-image-input />
    </main>
  `;

  return {
    audioInput: query('[data-audio-input]', root),
    imageInput: query('[data-image-input]', root),
    dropZone: query('[data-drop-zone]', root),
    pickAudioButton: query('[data-pick-audio]', root),
    pickImageButton: query('[data-pick-image]', root),
    clearAudioButton: query('[data-clear-audio]', root),
    clearImageButton: query('[data-clear-image]', root),
    createVideoButton: query('[data-create-video]', root),
    widescreenSelect: query('[data-widescreen-select]', root),
    hardwareCheckbox: query('[data-hardware-checkbox]', root),
    modeInputs: {
      match: query('[data-mode="match"]', root),
      widescreen: query('[data-mode="widescreen"]', root),
      vertical: query('[data-mode="vertical"]', root)
    },
    audioName: query('[data-audio-name]', root),
    audioMeta: query('[data-audio-meta]', root),
    imageName: query('[data-image-name]', root),
    imageMeta: query('[data-image-meta]', root),
    outputFilename: query('[data-output-filename]', root),
    statusText: query('[data-status-text]', root),
    ffmpegBadge: query('[data-ffmpeg-badge]', root),
    errorText: query('[data-error-text]', root),
    progressBar: query('[data-progress-bar]', root),
    progressText: query('[data-progress-text]', root),
    downloadSection: query('[data-download-section]', root),
    downloadLink: query('[data-download-link]', root),
    downloadMeta: query('[data-download-meta]', root),
    logList: query('[data-log-list]', root)
  };
}

export function renderApp(dom: AppDom, state: AppState): void {
  dom.audioName.textContent = state.selectedAudio?.name ?? 'No audio selected';
  dom.audioMeta.textContent = state.selectedAudio
    ? `${formatBytes(state.selectedAudio.size)} • ${state.selectedAudio.type || 'audio file'}`
    : 'Choose a single WAV or MP3 file.';

  dom.imageName.textContent = state.selectedImage?.name ?? 'No image selected';
  dom.imageMeta.textContent = state.selectedImage
    ? `${formatBytes(state.selectedImage.size)} • ${state.selectedImage.type || 'image file'}`
    : state.selectedAudio
      ? 'No image selected. song2vid will generate a black title card from the song name.'
      : 'Optional: choose a single PNG, JPG, JPEG, GIF, or WEBP file.';

  dom.outputFilename.textContent = getOutputFilename(state.selectedAudio);
  dom.statusText.textContent = state.statusText;

  dom.clearAudioButton.disabled = state.selectedAudio === null || state.busy;
  dom.clearImageButton.disabled = state.selectedImage === null || state.busy;
  dom.pickAudioButton.disabled = state.busy;
  dom.pickImageButton.disabled = state.busy;
  dom.widescreenSelect.disabled = state.busy || state.selectedMode !== 'widescreen';
  dom.hardwareCheckbox.disabled = state.busy;
  dom.hardwareCheckbox.checked = state.preferHardwareEncoding;
  dom.createVideoButton.disabled = !state.selectedAudio || state.busy;
  dom.createVideoButton.textContent = state.busy ? 'Creating Video...' : 'Create Video';

  dom.modeInputs.match.checked = state.selectedMode === 'match';
  dom.modeInputs.widescreen.checked = state.selectedMode === 'widescreen';
  dom.modeInputs.vertical.checked = state.selectedMode === 'vertical';
  dom.modeInputs.match.disabled = state.busy;
  dom.modeInputs.widescreen.disabled = state.busy;
  dom.modeInputs.vertical.disabled = state.busy;
  dom.widescreenSelect.value = state.widescreenSize;

  updateFfmpegBadge(dom.ffmpegBadge, state.ffmpegState);

  if (state.errorMessage) {
    dom.errorText.hidden = false;
    dom.errorText.textContent = state.errorMessage;
  } else {
    dom.errorText.hidden = true;
    dom.errorText.textContent = '';
  }

  dom.progressBar.hidden = state.progress === null;
  dom.progressBar.value = state.progress ?? 0;
  dom.progressText.textContent =
    state.progress === null ? 'Idle' : `${Math.round((state.progress ?? 0) * 100)}%`;

  const hasDownload = Boolean(state.downloadUrl && state.downloadFilename);
  dom.downloadSection.hidden = !hasDownload;
  dom.downloadLink.href = state.downloadUrl ?? '#';
  dom.downloadLink.download = state.downloadFilename ?? 'output.mp4';
  dom.downloadMeta.textContent =
    hasDownload && state.downloadSizeBytes
      ? `${state.downloadFilename} • ${formatBytes(state.downloadSizeBytes)}`
      : '';

  dom.logList.replaceChildren();

  if (state.logs.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'log-entry log-entry--empty';
    emptyItem.textContent = 'No messages yet.';
    dom.logList.append(emptyItem);
    return;
  }

  for (const entry of state.logs) {
    const item = document.createElement('li');
    item.className = `log-entry log-entry--${entry.level}`;

    const timestamp = document.createElement('span');
    timestamp.className = 'log-entry__time';
    timestamp.textContent = entry.timestamp;

    const message = document.createElement('span');
    message.className = 'log-entry__message';
    message.textContent = entry.message;

    item.append(timestamp, message);
    dom.logList.append(item);
  }
}

function updateFfmpegBadge(element: HTMLElement, state: AppState['ffmpegState']): void {
  const labels: Record<AppState['ffmpegState'], string> = {
    idle: 'Encoder idle',
    loading: 'Loading encoder',
    ready: 'Encoder ready',
    error: 'Encoder error'
  };

  element.textContent = labels[state];
  element.dataset.state = state;
}

function query<T extends Element>(selector: string, parent: ParentNode): T {
  const element = parent.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required DOM element: ${selector}`);
  }

  return element;
}

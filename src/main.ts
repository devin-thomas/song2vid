import './styles.css';

import { getAudioDurationSeconds } from './audio';
import { createAppDom, renderApp } from './dom';
import { downloadBlobUrl, revokeBlobUrl } from './download';
import { BrowserFFmpeg } from './ffmpeg';
import { buildVideoPlan, createDefaultTitleCard, prepareStillImage } from './image';
import { encodeStillImageWithHardware } from './hardware';
import { areSameFile, assertKind, classifyDroppedFiles, getFileStem, getOutputFilename } from './media';
import { AppStore } from './state';
import type { OutputMode } from './types';

const appRoot = document.querySelector<HTMLElement>('#app');

if (!appRoot) {
  throw new Error('Unable to find the app root element.');
}

const store = new AppStore();
const dom = createAppDom(appRoot);

const ffmpeg = new BrowserFFmpeg({
  onLoadStateChange: (state) => {
    store.setFFmpegState(state);

    if (state === 'ready') {
      store.addLog('success', 'ffmpeg.wasm is ready.');

      if (!store.getState().busy) {
        const currentState = store.getState();
        store.setState({
          statusText:
            currentState.selectedAudio
              ? 'Encoder ready. Ready to create video.'
              : 'Encoder ready. Select a song and optionally an image.',
          errorMessage: null
        });
      }
    }

    if (state === 'loading' && !store.getState().busy) {
      store.setState({
        statusText: 'Loading ffmpeg.wasm. The first run may take a moment.',
        errorMessage: null
      });
    }

    if (state === 'error') {
      store.addLog('error', 'Failed to load ffmpeg.wasm.');

      if (!store.getState().busy) {
        store.setState({
          statusText: 'Unable to load the browser encoder.',
          errorMessage: 'ffmpeg.wasm could not be loaded. Refresh the page and try again.'
        });
      }
    }
  },
  onProgress: (ratio) => {
    if (!store.getState().busy) {
      return;
    }

    store.setState({
      progress: ratio,
      statusText: `Encoding video... ${Math.round(ratio * 100)}%`
    });
  },
  onLog: (message) => {
    if (isImportantFfmpegMessage(message)) {
      store.addLog('info', `ffmpeg: ${message}`);
    }
  }
});

store.subscribe((state) => {
  renderApp(dom, state);
});

wireEvents();
warmEncoder();

function wireEvents(): void {
  dom.pickAudioButton.addEventListener('click', () => {
    dom.audioInput.click();
  });

  dom.pickImageButton.addEventListener('click', () => {
    dom.imageInput.click();
  });

  dom.audioInput.addEventListener('change', async () => {
    const file = dom.audioInput.files?.[0] ?? null;
    dom.audioInput.value = '';

    if (!file) {
      return;
    }

    await replaceSelection('audio', file, 'file picker');
  });

  dom.imageInput.addEventListener('change', async () => {
    const file = dom.imageInput.files?.[0] ?? null;
    dom.imageInput.value = '';

    if (!file) {
      return;
    }

    await replaceSelection('image', file, 'file picker');
  });

  dom.clearAudioButton.addEventListener('click', () => {
    clearSelection('audio');
  });

  dom.clearImageButton.addEventListener('click', () => {
    clearSelection('image');
  });

  dom.createVideoButton.addEventListener('click', async () => {
    await createVideo();
  });

  dom.widescreenSelect.addEventListener('change', () => {
    clearGeneratedOutput();
    store.setState({
      widescreenSize: dom.widescreenSelect.value as '1920x1080' | '3840x2160',
      errorMessage: null
    });
    store.addLog('info', `16:9 size set to ${dom.widescreenSelect.value}.`);
  });

  dom.hardwareCheckbox.addEventListener('change', () => {
    clearGeneratedOutput();
    store.setState({
      preferHardwareEncoding: dom.hardwareCheckbox.checked,
      errorMessage: null
    });
    store.addLog(
      'info',
      dom.hardwareCheckbox.checked
        ? 'Experimental hardware encoding enabled.'
        : 'Experimental hardware encoding disabled.'
    );
  });

  for (const [mode, input] of Object.entries(dom.modeInputs) as [OutputMode, HTMLInputElement][]) {
    input.addEventListener('change', () => {
      if (!input.checked) {
        return;
      }

      clearGeneratedOutput();
      store.setState({
        selectedMode: mode,
        errorMessage: null
      });
      store.addLog('info', `Output mode set to ${describeMode(mode)}.`);
    });
  }

  setupDragAndDrop();
}

function setupDragAndDrop(): void {
  let dragDepth = 0;

  const handleDragState = (active: boolean) => {
    dom.dropZone.classList.toggle('drop-zone--active', active);
  };

  dom.dropZone.addEventListener('dragenter', (event) => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepth += 1;
    handleDragState(true);
  });

  dom.dropZone.addEventListener('dragover', (event) => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    const { dataTransfer } = event;

    if (dataTransfer) {
      dataTransfer.dropEffect = 'copy';
    }

    handleDragState(true);
  });

  dom.dropZone.addEventListener('dragleave', (event) => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);

    if (dragDepth === 0) {
      handleDragState(false);
    }
  });

  dom.dropZone.addEventListener('drop', async (event) => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepth = 0;
    handleDragState(false);

    const files = Array.from(event.dataTransfer?.files ?? []);

    try {
      const classified = classifyDroppedFiles(files);

      if (!classified.audioFile && !classified.imageFile) {
        throw new Error('No supported audio or image files were dropped.');
      }

      if (classified.audioFile) {
        await replaceSelection('audio', classified.audioFile, 'drag and drop');
      }

      if (classified.imageFile) {
        await replaceSelection('image', classified.imageFile, 'drag and drop');
      }
    } catch (error) {
      reportError(error, 'The dropped files could not be accepted.');
    }
  });

  window.addEventListener('dragover', (event) => {
    if (hasFiles(event.dataTransfer)) {
      event.preventDefault();
    }
  });

  window.addEventListener('drop', (event) => {
    if (hasFiles(event.dataTransfer) && !dom.dropZone.contains(event.target as Node)) {
      event.preventDefault();
    }
  });
}

async function replaceSelection(kind: 'audio' | 'image', file: File, sourceLabel: string): Promise<void> {
  try {
    assertKind(file, kind);
  } catch (error) {
    reportError(error, `That ${kind} file is not supported.`);
    return;
  }

  const state = store.getState();
  const current = kind === 'audio' ? state.selectedAudio : state.selectedImage;

  if (areSameFile(current, file)) {
    store.setState({
      errorMessage: null,
      statusText: `${capitalize(kind)} already selected: ${file.name}`
    });
    store.addLog('info', `${capitalize(kind)} unchanged from ${sourceLabel}: ${file.name}.`);
    return;
  }

  if (current) {
    const confirmed = window.confirm(
      `Replace the current ${kind} file "${current.name}" with "${file.name}"?`
    );

    if (!confirmed) {
      store.addLog('info', `${capitalize(kind)} replacement canceled.`);
      store.setState({
        statusText: `${capitalize(kind)} kept: ${current.name}`,
        errorMessage: null
      });
      return;
    }
  }

  clearGeneratedOutput();

  if (kind === 'audio') {
    store.setState({
      selectedAudio: file,
      errorMessage: null,
      statusText: `Audio ready: ${file.name}`
    });
  } else {
    store.setState({
      selectedImage: file,
      errorMessage: null,
      statusText: `Image ready: ${file.name}`
    });
  }

  store.addLog('success', `${capitalize(kind)} selected from ${sourceLabel}: ${file.name}.`);
}

function clearSelection(kind: 'audio' | 'image'): void {
  const state = store.getState();
  const current = kind === 'audio' ? state.selectedAudio : state.selectedImage;

  if (!current) {
    return;
  }

  clearGeneratedOutput();

  if (kind === 'audio') {
    store.setState({
      selectedAudio: null,
      errorMessage: null,
      statusText: 'Audio cleared.'
    });
  } else {
    store.setState({
      selectedImage: null,
      errorMessage: null,
      statusText: 'Image cleared.'
    });
  }

  store.addLog('info', `${capitalize(kind)} cleared.`);
}

async function createVideo(): Promise<void> {
  const state = store.getState();

  if (state.busy || !state.selectedAudio) {
    return;
  }

  let created = false;

  store.setState({
    busy: true,
    errorMessage: null,
    progress: 0,
    statusText: state.selectedImage ? 'Preparing the still image...' : 'Generating the title card...'
  });

  store.addLog(
    'info',
    state.selectedImage
      ? `Preparing image from ${state.selectedImage.name}.`
      : `Generating a title card from "${getFileStem(state.selectedAudio.name)}".`
  );

  try {
    const preparedImage = state.selectedImage
      ? await prepareStillImage(state.selectedImage)
      : await createDefaultTitleCard(
          getFileStem(state.selectedAudio.name),
          state.selectedMode,
          state.widescreenSize
        );
    const plan = buildVideoPlan(
      state.selectedMode,
      state.widescreenSize,
      preparedImage.width,
      preparedImage.height
    );

    let videoData: Uint8Array;

    if (state.preferHardwareEncoding) {
      videoData = await tryHardwareThenFallback(state.selectedAudio, preparedImage, plan);
    } else {
      store.addLog('info', `Encoding ${plan.description}.`);
      store.setState({
        statusText: 'Encoding video...',
        progress: 0
      });

      videoData = await ffmpeg.createVideo({
        audioFile: state.selectedAudio,
        image: preparedImage,
        plan
      });
    }

    const blob = new Blob([new Uint8Array(videoData)], { type: 'video/mp4' });
    const filename = getOutputFilename(state.selectedAudio);
    const url = URL.createObjectURL(blob);

    clearGeneratedOutput();

    store.setState({
      downloadUrl: url,
      downloadFilename: filename,
      downloadSizeBytes: blob.size,
      errorMessage: null,
      progress: 1,
      statusText: 'Video ready for download.'
    });

    downloadBlobUrl(url, filename);
    store.addLog('success', `Created ${filename}.`);
    created = true;
  } catch (error) {
    reportError(error, 'Unable to create the video.');
  } finally {
    store.setState({
      busy: false,
      progress: created ? 1 : null
    });
  }
}

function clearGeneratedOutput(): void {
  const { downloadUrl, downloadFilename, downloadSizeBytes } = store.getState();

  if (!downloadUrl && !downloadFilename && !downloadSizeBytes) {
    return;
  }

  revokeBlobUrl(downloadUrl);

  store.setState({
    downloadUrl: null,
    downloadFilename: null,
    downloadSizeBytes: null
  });
}

async function tryHardwareThenFallback(
  audioFile: File,
  preparedImage: Awaited<ReturnType<typeof prepareStillImage>>,
  plan: ReturnType<typeof buildVideoPlan>
): Promise<Uint8Array> {
  store.addLog('info', `Encoding ${plan.description}.`);
  store.addLog('info', 'Experimental hardware encoding is enabled. Checking browser support.');

  try {
    const durationSeconds = await getAudioDurationSeconds(audioFile);

    store.setState({
      statusText: 'Checking browser hardware encoding support...',
      progress: 0
    });

    const hardwareVideo = await encodeStillImageWithHardware({
      image: preparedImage,
      mode: store.getState().selectedMode,
      widescreenSize: store.getState().widescreenSize,
      durationSeconds,
      onProgress: (ratio) => {
        store.setState({
          progress: ratio * 0.72,
          statusText: `Encoding video with browser hardware preference... ${Math.round(ratio * 100)}%`
        });
      }
    });

    store.addLog(
      'success',
      `Browser hardware-preferred path selected ${hardwareVideo.codecLabel}. Vendor acceleration is browser-managed and may vary by device.`
    );

    store.setState({
      progress: 0.76,
      statusText: 'Muxing audio and video into MP4...'
    });

    return await ffmpeg.muxEncodedVideoWithAudio(audioFile, hardwareVideo);
  } catch (error) {
    const fallbackMessage =
      error instanceof Error ? error.message : 'Hardware encoding was not available.';

    store.addLog(
      'info',
      `Hardware path unavailable or failed: ${fallbackMessage} Falling back to ffmpeg.wasm software encoding.`
    );
    store.setState({
      progress: 0,
      statusText: 'Falling back to software encoding...'
    });

    return ffmpeg.createVideo({
      audioFile,
      image: preparedImage,
      plan
    });
  }
}

function warmEncoder(): void {
  store.addLog('info', 'Loading ffmpeg.wasm in the background.');
  void ffmpeg.ensureLoaded().catch((error) => {
    reportError(error, 'The encoder could not be prepared.');
  });
}

function reportError(error: unknown, fallbackMessage: string): void {
  const message = error instanceof Error ? error.message : fallbackMessage;

  store.setState({
    busy: false,
    progress: null,
    statusText: fallbackMessage,
    errorMessage: message
  });

  store.addLog('error', message);
}

function hasFiles(dataTransfer: DataTransfer | null): boolean {
  return Array.from(dataTransfer?.types ?? []).includes('Files');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeMode(mode: OutputMode): string {
  if (mode === 'match') {
    return 'Match Image';
  }

  if (mode === 'widescreen') {
    return '16:9';
  }

  return '9:16';
}

function isImportantFfmpegMessage(message: string): boolean {
  return /(error|failed|invalid|duration|video:|audio:|muxing overhead)/i.test(message);
}

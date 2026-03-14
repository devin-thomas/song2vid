import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { FFmpeg } from '@ffmpeg/ffmpeg';

import { getFileExtension } from './media';
import type { EncodeRequest, FFmpegLoadState, HardwareVideoResult } from './types';

interface FFmpegHandlers {
  onLog?: (message: string) => void;
  onProgress?: (ratio: number) => void;
  onLoadStateChange?: (state: FFmpegLoadState) => void;
}

export class BrowserFFmpeg {
  private readonly ffmpeg = new FFmpeg();
  private loadPromise: Promise<void> | null = null;
  private handlers: FFmpegHandlers;

  constructor(handlers: FFmpegHandlers = {}) {
    this.handlers = handlers;

    this.ffmpeg.on('log', ({ message }) => {
      const trimmed = message.trim();

      if (trimmed) {
        this.handlers.onLog?.(trimmed);
      }
    });

    this.ffmpeg.on('progress', ({ progress }) => {
      this.handlers.onProgress?.(Math.max(0, Math.min(1, progress)));
    });
  }

  setHandlers(handlers: FFmpegHandlers): void {
    this.handlers = handlers;
  }

  async ensureLoaded(): Promise<void> {
    if (this.ffmpeg.loaded) {
      return;
    }

    if (!this.loadPromise) {
      this.handlers.onLoadStateChange?.('loading');

      this.loadPromise = this.ffmpeg
        .load({
          coreURL,
          wasmURL
        })
        .then(() => {
          this.handlers.onLoadStateChange?.('ready');
        })
        .catch((error: unknown) => {
          this.loadPromise = null;
          this.ffmpeg.terminate();
          this.handlers.onLoadStateChange?.('error');
          throw toError(error, 'Unable to load ffmpeg.wasm.');
        });
    }

    return this.loadPromise;
  }

  async createVideo(request: EncodeRequest): Promise<Uint8Array> {
    await this.ensureLoaded();

    const jobId = `job-${crypto.randomUUID()}`;
    const audioName = `${jobId}-audio${getFileExtension(request.audioFile.name) || '.bin'}`;
    const imageName = `${jobId}-${request.image.normalizedFileName}`;
    const outputName = `${jobId}-output.mp4`;

    try {
      await this.ffmpeg.writeFile(audioName, new Uint8Array(await request.audioFile.arrayBuffer()));
      await this.ffmpeg.writeFile(imageName, new Uint8Array(await request.image.blob.arrayBuffer()));

      const exitCode = await this.ffmpeg.exec([
        '-loop',
        '1',
        '-framerate',
        '30',
        '-i',
        imageName,
        '-i',
        audioName,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-vf',
        request.plan.filter,
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-tune',
        'stillimage',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-shortest',
        outputName
      ]);

      if (exitCode !== 0) {
        throw new Error(`ffmpeg exited with code ${exitCode}.`);
      }

      const outputData = await this.ffmpeg.readFile(outputName);

      if (!(outputData instanceof Uint8Array)) {
        throw new Error('ffmpeg returned an unexpected output type.');
      }

      return outputData;
    } finally {
      await Promise.allSettled([
        this.deleteIfPresent(audioName),
        this.deleteIfPresent(imageName),
        this.deleteIfPresent(outputName)
      ]);
    }
  }

  async muxEncodedVideoWithAudio(audioFile: File, video: HardwareVideoResult): Promise<Uint8Array> {
    await this.ensureLoaded();

    const jobId = `job-${crypto.randomUUID()}`;
    const audioName = `${jobId}-audio${getFileExtension(audioFile.name) || '.bin'}`;
    const videoName = `${jobId}-video.${video.codec === 'hevc' ? 'hevc' : 'h264'}`;
    const outputName = `${jobId}-output.mp4`;

    try {
      await this.ffmpeg.writeFile(audioName, new Uint8Array(await audioFile.arrayBuffer()));
      await this.ffmpeg.writeFile(videoName, new Uint8Array(video.data));

      const args = [
        '-framerate',
        String(video.frameRate),
        '-i',
        videoName,
        '-i',
        audioName,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-shortest'
      ];

      if (video.codec === 'hevc') {
        args.push('-tag:v', 'hvc1');
      }

      args.push(outputName);

      const exitCode = await this.ffmpeg.exec(args);

      if (exitCode !== 0) {
        throw new Error(`ffmpeg exited with code ${exitCode} while muxing hardware-encoded video.`);
      }

      const outputData = await this.ffmpeg.readFile(outputName);

      if (!(outputData instanceof Uint8Array)) {
        throw new Error('ffmpeg returned an unexpected muxed output type.');
      }

      return outputData;
    } finally {
      await Promise.allSettled([
        this.deleteIfPresent(audioName),
        this.deleteIfPresent(videoName),
        this.deleteIfPresent(outputName)
      ]);
    }
  }

  private async deleteIfPresent(path: string): Promise<void> {
    try {
      await this.ffmpeg.deleteFile(path);
    } catch {
      // no-op
    }
  }
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

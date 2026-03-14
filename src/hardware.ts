import { renderPreparedImageFrame } from './image';
import type { HardwareVideoResult, OutputMode, PreparedImage, WidescreenSize } from './types';

const FRAME_RATE = 30;

type ExtendedVideoEncoderConfig = VideoEncoderConfig & {
  hevc?: {
    format?: 'annexb';
  };
};

interface CodecCandidate {
  codec: 'h264' | 'hevc';
  codecLabel: string;
  config: ExtendedVideoEncoderConfig;
}

interface EncodeOptions {
  image: PreparedImage;
  mode: OutputMode;
  widescreenSize: WidescreenSize;
  durationSeconds: number;
  onProgress?: (ratio: number) => void;
}

export async function encodeStillImageWithHardware(options: EncodeOptions): Promise<HardwareVideoResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs video encoding is not available in this browser.');
  }

  const canvas = await renderPreparedImageFrame(options.image, options.mode, options.widescreenSize);
  const candidate = await findSupportedCandidate(canvas.width, canvas.height);

  if (!candidate) {
    throw new Error('No supported hardware-preferred WebCodecs configuration was found.');
  }

  const frameCount = Math.max(1, Math.ceil(options.durationSeconds * FRAME_RATE));
  const frameDuration = Math.round(1_000_000 / FRAME_RATE);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let fatalError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push(data);
      totalBytes += data.byteLength;
    },
    error: (error) => {
      fatalError = error instanceof Error ? error : new Error(String(error));
    }
  });

  try {
    encoder.configure(candidate.config);

    for (let index = 0; index < frameCount; index += 1) {
      if (fatalError) {
        throw fatalError;
      }

      const frame = new VideoFrame(canvas, {
        timestamp: index * frameDuration,
        duration: frameDuration
      });

      if (candidate.codec === 'h264') {
        encoder.encode(frame, {
          keyFrame: index === 0 || index % FRAME_RATE === 0
        });
      } else {
        encoder.encode(frame, {
          keyFrame: index === 0 || index % FRAME_RATE === 0
        });
      }

      frame.close();

      if (encoder.encodeQueueSize > 8) {
        await waitForQueueToDrain(encoder, 4);
      }

      options.onProgress?.((index + 1) / frameCount);
    }

    await encoder.flush();

    if (fatalError) {
      throw fatalError;
    }

    return {
      data: mergeChunks(chunks, totalBytes),
      codec: candidate.codec,
      codecLabel: candidate.codecLabel,
      frameRate: FRAME_RATE
    };
  } finally {
    encoder.close();
  }
}

async function findSupportedCandidate(width: number, height: number): Promise<CodecCandidate | null> {
  for (const candidate of buildCodecCandidates(width, height)) {
    try {
      const support = await VideoEncoder.isConfigSupported(candidate.config);

      if (support.supported) {
        return candidate;
      }
    } catch {
      // Keep probing other candidates.
    }
  }

  return null;
}

function buildCodecCandidates(width: number, height: number): CodecCandidate[] {
  const bitrate = estimateBitrate(width, height);

  const baseConfig = {
    width,
    height,
    framerate: FRAME_RATE,
    bitrate,
    bitrateMode: 'constant' as const,
    hardwareAcceleration: 'prefer-hardware' as const,
    alpha: 'discard' as const,
    latencyMode: 'quality' as const
  };

  const hevcCandidates = [
    'hev1.1.6.L120.B0',
    'hev1.1.6.L93.B0',
    'hvc1.1.6.L120.B0',
    'hvc1.1.6.L93.B0'
  ].map<CodecCandidate>((codecString) => ({
    codec: 'hevc',
    codecLabel: `HEVC (${codecString})`,
    config: {
      ...baseConfig,
      codec: codecString,
      hevc: {
        format: 'annexb'
      }
    }
  }));

  const avcCandidates = [
    'avc1.640028',
    'avc1.64001F',
    'avc1.4d4028',
    'avc1.4d401f'
  ].map<CodecCandidate>((codecString) => ({
    codec: 'h264',
    codecLabel: `H.264 (${codecString})`,
    config: {
      ...baseConfig,
      codec: codecString,
      avc: {
        format: 'annexb'
      }
    }
  }));

  return [...hevcCandidates, ...avcCandidates];
}

function estimateBitrate(width: number, height: number): number {
  return Math.max(2_000_000, Math.round(width * height * FRAME_RATE * 0.08));
}

async function waitForQueueToDrain(encoder: VideoEncoder, maxSize: number): Promise<void> {
  while (encoder.encodeQueueSize > maxSize) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }
}

function mergeChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

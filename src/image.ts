import { decompressFrames, parseGIF } from 'gifuct-js';

import { detectMediaKind, getFileStem, parseWidescreenSize, sanitizeFilenameStem } from './media';
import type { OutputMode, PreparedImage, VideoPlan, WidescreenSize } from './types';

const MATCH_MAX_WIDTH = 3840;
const MATCH_MAX_HEIGHT = 2160;
const VERTICAL_WIDTH = 720;
const VERTICAL_HEIGHT = 1280;
const VERTICAL_RATIO = VERTICAL_WIDTH / VERTICAL_HEIGHT;
const DEFAULT_TITLE_CARD = {
  width: 1920,
  height: 1080
} as const;

interface GifFramePatch {
  dims: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  disposalType?: number;
  patch?: Uint8ClampedArray;
}

export function forceEvenDimension(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : Math.max(2, rounded - 1);
}

export function getMatchImageSize(width: number, height: number): { width: number; height: number } {
  if (width <= MATCH_MAX_WIDTH && height <= MATCH_MAX_HEIGHT) {
    return {
      width: forceEvenDimension(width),
      height: forceEvenDimension(height)
    };
  }

  const scale = Math.min(MATCH_MAX_WIDTH / width, MATCH_MAX_HEIGHT / height);

  return {
    width: forceEvenDimension(width * scale),
    height: forceEvenDimension(height * scale)
  };
}

export function buildVideoPlan(
  mode: OutputMode,
  widescreenSize: WidescreenSize,
  sourceWidth: number,
  sourceHeight: number
): VideoPlan {
  switch (mode) {
    case 'match': {
      const target = getMatchImageSize(sourceWidth, sourceHeight);

      return {
        outputWidth: target.width,
        outputHeight: target.height,
        filter: `scale=${target.width}:${target.height}:flags=lanczos,setsar=1`,
        description: `Match Image ${target.width}x${target.height}`
      };
    }

    case 'widescreen': {
      const frame = parseWidescreenSize(widescreenSize);
      const scale = Math.min(frame.width / sourceWidth, frame.height / sourceHeight);
      const scaledWidth = clampDimension(Math.min(frame.width, sourceWidth * scale));
      const scaledHeight = clampDimension(Math.min(frame.height, sourceHeight * scale));
      const padX = Math.max(0, Math.floor((frame.width - scaledWidth) / 2));
      const padY = Math.max(0, Math.floor((frame.height - scaledHeight) / 2));

      return {
        outputWidth: frame.width,
        outputHeight: frame.height,
        filter: `scale=${scaledWidth}:${scaledHeight}:flags=lanczos,pad=${frame.width}:${frame.height}:${padX}:${padY}:color=black,setsar=1`,
        description: `16:9 ${frame.width}x${frame.height}`
      };
    }

    case 'vertical': {
      const crop = getVerticalCrop(sourceWidth, sourceHeight);

      return {
        outputWidth: VERTICAL_WIDTH,
        outputHeight: VERTICAL_HEIGHT,
        filter: `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:flags=lanczos,setsar=1`,
        description: `9:16 ${VERTICAL_WIDTH}x${VERTICAL_HEIGHT}`
      };
    }
  }
}

export async function prepareStillImage(file: File): Promise<PreparedImage> {
  const kind = detectMediaKind(file);

  if (kind !== 'image') {
    throw new Error(`"${file.name}" is not a supported image file.`);
  }

  if (file.name.toLowerCase().endsWith('.gif')) {
    return extractBestGifFrame(file);
  }

  return normalizeStillImage(file);
}

export async function createDefaultTitleCard(
  title: string,
  mode: OutputMode,
  widescreenSize: WidescreenSize
): Promise<PreparedImage> {
  const { width, height } = getTitleCardSize(mode, widescreenSize);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D rendering is not available in this browser.');
  }

  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);

  const safeTitle = title.trim() || 'Untitled';
  const maxTextWidth = width * 0.8;
  const maxTextHeight = height * 0.7;
  const lines = fitTitleText(context, safeTitle, maxTextWidth, maxTextHeight, width, height);
  const fontSize = getFontSizeFromContext(context);
  const lineHeight = Math.round(fontSize * 1.22);
  const totalTextHeight = lines.length * lineHeight;
  const startY = Math.round((height - totalTextHeight) / 2 + lineHeight / 2);

  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  lines.forEach((line, index) => {
    context.fillText(line, width / 2, startY + index * lineHeight);
  });

  return {
    blob: await canvasToBlob(canvas, 'image/png'),
    width,
    height,
    sourceFileName: `${safeTitle}.png`,
    normalizedFileName: `${sanitizeFilenameStem(safeTitle)}.png`
  };
}

export async function renderPreparedImageFrame(
  image: PreparedImage,
  mode: OutputMode,
  widescreenSize: WidescreenSize
): Promise<HTMLCanvasElement> {
  const source = await loadImageElement(image.blob);

  switch (mode) {
    case 'match': {
      const target = getMatchImageSize(image.width, image.height);
      const canvas = createCanvas(target.width, target.height);
      const context = getCanvasContext(canvas);
      context.drawImage(source, 0, 0, target.width, target.height);
      return canvas;
    }

    case 'widescreen': {
      const target = parseWidescreenSize(widescreenSize);
      const scale = Math.min(target.width / image.width, target.height / image.height);
      const drawWidth = clampDimension(Math.min(target.width, image.width * scale));
      const drawHeight = clampDimension(Math.min(target.height, image.height * scale));
      const drawX = Math.floor((target.width - drawWidth) / 2);
      const drawY = Math.floor((target.height - drawHeight) / 2);
      const canvas = createCanvas(target.width, target.height);
      const context = getCanvasContext(canvas);

      context.fillStyle = '#000000';
      context.fillRect(0, 0, target.width, target.height);
      context.drawImage(source, drawX, drawY, drawWidth, drawHeight);

      return canvas;
    }

    case 'vertical': {
      const crop = getVerticalCrop(image.width, image.height);
      const canvas = createCanvas(VERTICAL_WIDTH, VERTICAL_HEIGHT);
      const context = getCanvasContext(canvas);

      context.drawImage(
        source,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        VERTICAL_WIDTH,
        VERTICAL_HEIGHT
      );

      return canvas;
    }
  }
}

async function normalizeStillImage(file: File): Promise<PreparedImage> {
  const image = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D rendering is not available in this browser.');
  }

  context.drawImage(image, 0, 0);

  const blob = await canvasToBlob(canvas, 'image/png');
  const normalizedStem = sanitizeFilenameStem(getFileStem(file.name));

  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    sourceFileName: file.name,
    normalizedFileName: `${normalizedStem}.png`
  };
}

async function extractBestGifFrame(file: File): Promise<PreparedImage> {
  const image = await loadImageElement(file);
  const arrayBuffer = await file.arrayBuffer();
  const parsedGif = parseGIF(arrayBuffer);
  const frames = decompressFrames(parsedGif, true) as GifFramePatch[];

  if (frames.length === 0) {
    throw new Error(`Unable to decode any frames from "${file.name}".`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D rendering is not available in this browser.');
  }

  let previousDisposal = 0;
  let previousFrameBounds: GifFramePatch['dims'] | null = null;
  let previousCanvasSnapshot: ImageData | null = null;
  let firstFrameSnapshot: ImageData | null = null;

  for (const frame of frames) {
    applyGifDisposal(context, previousDisposal, previousFrameBounds, previousCanvasSnapshot);

    const snapshotBeforeFrame = frame.disposalType === 3 ? context.getImageData(0, 0, canvas.width, canvas.height) : null;

    drawGifFrame(context, frame);

    const compositedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    if (!firstFrameSnapshot) {
      firstFrameSnapshot = compositedFrame;
    }

    if (isMeaningfulFrame(compositedFrame.data)) {
      const blob = await canvasToBlob(canvas, 'image/png');
      const normalizedStem = sanitizeFilenameStem(getFileStem(file.name));

      return {
        blob,
        width: canvas.width,
        height: canvas.height,
        sourceFileName: file.name,
        normalizedFileName: `${normalizedStem}.png`
      };
    }

    previousDisposal = frame.disposalType ?? 0;
    previousFrameBounds = frame.dims;
    previousCanvasSnapshot = snapshotBeforeFrame;
  }

  if (!firstFrameSnapshot) {
    throw new Error(`Unable to recover the first frame from "${file.name}".`);
  }

  context.putImageData(firstFrameSnapshot, 0, 0);

  return {
    blob: await canvasToBlob(canvas, 'image/png'),
    width: canvas.width,
    height: canvas.height,
    sourceFileName: file.name,
    normalizedFileName: `${sanitizeFilenameStem(getFileStem(file.name))}.png`
  };
}

function clampDimension(value: number): number {
  const floored = Math.max(2, Math.floor(value));
  return floored % 2 === 0 ? floored : Math.max(2, floored - 1);
}

function getTitleCardSize(mode: OutputMode, widescreenSize: WidescreenSize): { width: number; height: number } {
  if (mode === 'vertical') {
    return { width: VERTICAL_WIDTH, height: VERTICAL_HEIGHT };
  }

  if (mode === 'widescreen') {
    return parseWidescreenSize(widescreenSize);
  }

  return { ...DEFAULT_TITLE_CARD };
}

function getVerticalCrop(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number; x: number; y: number } {
  const sourceRatio = sourceWidth / sourceHeight;

  if (sourceRatio > VERTICAL_RATIO) {
    const cropWidth = Math.max(2, Math.round(sourceHeight * VERTICAL_RATIO));
    const x = Math.max(0, Math.floor((sourceWidth - cropWidth) / 2));

    return {
      width: cropWidth,
      height: sourceHeight,
      x,
      y: 0
    };
  }

  const cropHeight = Math.max(2, Math.round(sourceWidth / VERTICAL_RATIO));
  const y = Math.max(0, Math.floor((sourceHeight - cropHeight) / 2));

  return {
    width: sourceWidth,
    height: cropHeight,
    x: 0,
    y
  };
}

function fitTitleText(
  context: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
  maxHeight: number,
  canvasWidth: number,
  canvasHeight: number
): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const fontFamily = 'Aptos, "Segoe UI", sans-serif';
  const initialSize = Math.max(40, Math.floor(Math.min(canvasWidth, canvasHeight) * 0.11));

  for (let fontSize = initialSize; fontSize >= 32; fontSize -= 4) {
    context.font = `700 ${fontSize}px ${fontFamily}`;
    const lines = wrapText(context, words, maxWidth);
    const lineHeight = fontSize * 1.22;

    if (lines.length * lineHeight <= maxHeight) {
      return lines;
    }
  }

  context.font = `700 32px ${fontFamily}`;
  return wrapText(context, words, maxWidth);
}

function wrapText(context: CanvasRenderingContext2D, words: string[], maxWidth: number): string[] {
  if (words.length === 0) {
    return ['Untitled'];
  }

  const lines: string[] = [];
  let currentLine = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const nextLine = `${currentLine} ${words[index]}`;

    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = words[index];
  }

  lines.push(currentLine);
  return lines;
}

function getFontSizeFromContext(context: CanvasRenderingContext2D): number {
  const match = context.font.match(/(\d+)px/);
  return match ? Number(match[1]) : 32;
}

function applyGifDisposal(
  context: CanvasRenderingContext2D,
  disposalType: number,
  bounds: GifFramePatch['dims'] | null,
  snapshot: ImageData | null
): void {
  if (disposalType === 2 && bounds) {
    context.clearRect(bounds.left, bounds.top, bounds.width, bounds.height);
  }

  if (disposalType === 3 && snapshot) {
    context.putImageData(snapshot, 0, 0);
  }
}

function drawGifFrame(context: CanvasRenderingContext2D, frame: GifFramePatch): void {
  if (!frame.patch) {
    return;
  }

  const patchCanvas = document.createElement('canvas');
  patchCanvas.width = frame.dims.width;
  patchCanvas.height = frame.dims.height;

  const patchContext = patchCanvas.getContext('2d');

  if (!patchContext) {
    throw new Error('Canvas 2D rendering is not available in this browser.');
  }

  patchContext.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height), 0, 0);
  context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
}

function isMeaningfulFrame(data: Uint8ClampedArray): boolean {
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];

    if (alpha === 0) {
      continue;
    }

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];

    if (red !== 0 || green !== 0 || blue !== 0) {
      return true;
    }
  }

  return false;
}

function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    image.onload = () => {
      cleanup();
      resolve(image);
    };

    image.onerror = () => {
      cleanup();
      reject(new Error('The selected image could not be decoded by the browser.'));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to export an image frame for encoding.'));
        return;
      }

      resolve(blob);
    }, type);
  });
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D rendering is not available in this browser.');
  }

  return context;
}

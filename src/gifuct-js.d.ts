declare module 'gifuct-js' {
  export interface GifFrame {
    dims: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
    delay?: number;
    disposalType?: number;
    transparentIndex?: number;
    patch?: Uint8ClampedArray;
  }

  export function parseGIF(data: ArrayBuffer): unknown;
  export function decompressFrames(parsedGif: unknown, buildImagePatches?: boolean): GifFrame[];
}

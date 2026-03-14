# song2vid

song2vid is a static web app for turning songs into downloadable MP4 videos directly in the browser.

Pick a supported audio file, optionally add artwork, choose an output mode, and generate a video where the image stays on screen for the full duration of the song. If you skip the image, song2vid creates a simple black title card with the song name in white text.

Everything runs client-side:

- No backend
- No uploads
- No API calls
- No authentication
- No database

## Features

- Choose a WAV or MP3 song
- Optionally add still artwork
- Generate a default title card automatically when no image is selected
- Export MP4 in Match Image, 16:9, or 9:16 layouts
- Optionally enable `Prefer hardware encoding (experimental)`

## Supported file types

Audio input:

- `.wav`
- `.mp3`

Image input:

- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webp`

## Supported output modes

- `Match Image`
  - Uses the image dimensions when practical
  - Forces even dimensions
  - Caps output at `3840x2160`
  - If no image is supplied, song2vid uses a generated `1920x1080` title card
- `16:9`
  - `1920x1080`
  - `3840x2160`
  - Preserves aspect ratio and pads with black bars
- `9:16`
  - Fixed `720x1280`
  - Center-crops the image to a vertical composition before scaling
  - If no image is supplied, song2vid generates the title card directly at `720x1280`

## How the fallback title card works

When you create a video without choosing an image:

- song2vid uses the audio filename without its extension
- it renders that title in white text
- it places the text on a solid black background
- it encodes that generated frame as the still image for the video

## Experimental hardware encoding

song2vid includes an optional `Prefer hardware encoding (experimental)` checkbox.

When enabled, the app will:

- ask the browser for hardware-preferred HEVC encoding first
- fall back to hardware-preferred H.264 if HEVC is unavailable
- fall back again to the existing ffmpeg.wasm software encode path if WebCodecs support is missing or fails

Important notes:

- the browser controls the actual acceleration backend
- the app cannot guarantee NVIDIA NVENC specifically
- codec support varies by browser, OS, GPU, and driver support

## Install

```bash
npm install
```

## npm scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - type-check and create a production build in `dist/`
- `npm run preview` - preview the production build locally

## Local development

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

The production-ready static output is written to `docs/`.

## GitHub Pages deployment

This project uses a relative Vite base path (`./`), so built asset URLs work under a GitHub Pages repository subpath.

GitHub Pages should not serve the raw repository root for this app, because the root `index.html` points to Vite/TypeScript source files. Instead, Pages should serve the built `docs/` output committed to the repository.

Recommended setup:

1. Run `npm run build` locally.
2. Commit the updated `docs/` folder.
3. Push the repository to GitHub.
4. In GitHub, open `Settings -> Pages`.
5. Under `Build and deployment`, choose `Deploy from a branch`.
6. Select branch `master` and folder `/docs`.
7. Save and wait for GitHub Pages to publish the site.

The build writes a `docs/.nojekyll` file automatically so GitHub Pages serves the compiled Vite output directly instead of trying to process it as a Jekyll site.

After that, future updates are:

1. Make your code changes.
2. Run `npm run build`.
3. Commit both the source changes and the refreshed `docs/` output.
4. Push to `master`.

## Browser compatibility notes

- Chromium-based browsers usually provide the best ffmpeg.wasm experience.
- Firefox generally works, but encoding may be slower.
- Safari may be more sensitive to memory usage and long encodes.
- The app depends on:
  - WebAssembly
  - Web Workers
  - Canvas image decoding
  - Blob downloads

## Known limitations

- ffmpeg.wasm is a large download, so first load can take a while.
- Browser-side encoding is slower than native ffmpeg.
- Large audio files and large images can use substantial memory.
- Long songs or very high-resolution inputs may fail on low-memory devices.
- GIF input is treated as a still source by selecting the first non-black frame when possible.

## Troubleshooting

If encoding feels slow:

- wait for ffmpeg.wasm to finish loading
- test with shorter audio files first
- prefer `1920x1080` over `3840x2160` for faster output

If the browser runs out of memory:

- reduce the input image size before importing it
- try a shorter audio file
- close other heavy tabs
- retry in a Chromium-based browser

If the download does not appear:

- check whether the browser blocked the download prompt
- use the in-app download link to trigger the file again
- review the log panel for ffmpeg loading or encode errors

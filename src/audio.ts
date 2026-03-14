export async function getAudioDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);

    const cleanup = () => {
      audio.src = '';
      URL.revokeObjectURL(url);
    };

    audio.preload = 'metadata';

    audio.onloadedmetadata = () => {
      const { duration } = audio;
      cleanup();

      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error(`Unable to read the duration of "${file.name}".`));
        return;
      }

      resolve(duration);
    };

    audio.onerror = () => {
      cleanup();
      reject(new Error(`The selected audio file "${file.name}" could not be read by the browser.`));
    };

    audio.src = url;
  });
}

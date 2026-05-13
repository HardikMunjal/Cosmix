import { removeBackground } from '@imgly/background-removal';

self.onmessage = async (event) => {
  const { arrayBuffer } = event.data;
  try {
    const blob = new Blob([arrayBuffer], { type: 'image/png' });
    const result = await removeBackground(blob, {
      device: 'cpu',
      debug: false,
      model: 'isnet_quint8',
      progress: (_key, current, total) => {
        if (!total) return;
        const percent = Math.max(1, Math.min(99, Math.round((current / total) * 100)));
        self.postMessage({ type: 'progress', percent });
      },
    });
    const resultBuffer = await result.arrayBuffer();
    self.postMessage({ type: 'done', arrayBuffer: resultBuffer }, [resultBuffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: (error && error.message) || 'Unknown error' });
  }
};

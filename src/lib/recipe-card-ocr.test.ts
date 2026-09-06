import { afterEach, describe, expect, it, vi } from 'vitest';

const terminate = vi.fn(async () => undefined);
const recognize = vi.fn(async () => ({
  data: { confidence: 84, text: 'Title\r\nIngredients\r\n1 cup flour\r\n' },
}));
const createWorker = vi.fn(async () => ({ recognize, terminate }));

vi.mock('tesseract.js', () => ({
  createWorker,
  OEM: { LSTM_ONLY: 1 },
}));

import { recognizeRecipeCard } from './recipe-card-ocr';

afterEach(() => {
  vi.clearAllMocks();
});

describe('recognizeRecipeCard', () => {
  it('uses only same-origin OCR assets and normalizes the result', async () => {
    const onProgress = vi.fn();
    const image = new File(['card'], 'recipe.png', { type: 'image/png' });

    const result = await recognizeRecipeCard(image, 'eng', { onProgress });

    expect(createWorker).toHaveBeenCalledWith(
      'eng',
      1,
      expect.objectContaining({
        corePath: '/ocr/tesseract-core-lstm.wasm.js',
        langPath: '/ocr',
        workerPath: '/ocr/worker.min.js',
        workerBlobURL: false,
      }),
    );
    expect(recognize).toHaveBeenCalledWith(image);
    expect(result).toEqual({
      confidence: 84,
      text: 'Title\nIngredients\n1 cup flour',
    });
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('stops before loading the OCR engine when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      recognizeRecipeCard(new File(['card'], 'recipe.png', { type: 'image/png' }), 'eng', {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('rejects promptly and terminates the worker when cancelled during recognition', async () => {
    recognize.mockImplementationOnce(
      () =>
        new Promise(() => {
          // The worker stops without settling its in-flight recognition.
        }),
    );
    const controller = new AbortController();
    const result = recognizeRecipeCard(
      new File(['card'], 'recipe.png', { type: 'image/png' }),
      'eng',
      { signal: controller.signal },
    );

    await vi.waitFor(() => expect(recognize).toHaveBeenCalledOnce());
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(terminate).toHaveBeenCalledOnce();
  });
});

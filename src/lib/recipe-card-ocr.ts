export const RECIPE_CARD_OCR_LANGUAGES = ['eng', 'spa', 'deu', 'ara'] as const;

export type RecipeCardOcrLanguage = (typeof RECIPE_CARD_OCR_LANGUAGES)[number];

export type RecipeCardOcrProgress = {
  progress: number;
  status: string;
};

export type RecipeCardOcrResult = {
  confidence: number;
  text: string;
};

type RecognizeRecipeCardOptions = {
  onProgress?: (progress: RecipeCardOcrProgress) => void;
  signal?: AbortSignal;
};

type TesseractWorker = {
  recognize: (image: File) => Promise<{
    data: { confidence: number; text: string };
  }>;
  terminate: () => Promise<unknown>;
};

export async function recognizeRecipeCard(
  image: File,
  language: RecipeCardOcrLanguage,
  { onProgress, signal }: RecognizeRecipeCardOptions = {},
): Promise<RecipeCardOcrResult> {
  if (signal?.aborted) {
    throw new DOMException('Recipe card scan cancelled.', 'AbortError');
  }

  let worker: TesseractWorker | undefined;
  let cancelled = false;
  let rejectForAbort: (reason?: unknown) => void = () => undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectForAbort = reject;
  });

  const terminate = () => {
    cancelled = true;
    const activeWorker = worker;
    worker = undefined;
    void activeWorker?.terminate();
    rejectForAbort(new DOMException('Recipe card scan cancelled.', 'AbortError'));
  };
  signal?.addEventListener('abort', terminate, { once: true });

  try {
    const { createWorker, OEM } = await Promise.race([import('tesseract.js'), abortPromise]);
    const workerPromise = createWorker(language, OEM.LSTM_ONLY, {
      corePath: '/ocr/tesseract-core-lstm.wasm.js',
      langPath: '/ocr',
      workerPath: '/ocr/worker.min.js',
      workerBlobURL: false,
      logger: ({ progress, status }) => {
        onProgress?.({
          progress: Number.isFinite(progress) ? progress : 0,
          status,
        });
      },
    });
    void workerPromise.then(
      (createdWorker) => {
        if (cancelled) void createdWorker.terminate();
      },
      () => undefined,
    );
    worker = await Promise.race([workerPromise, abortPromise]);

    if (cancelled) {
      throw new DOMException('Recipe card scan cancelled.', 'AbortError');
    }

    const {
      data: { confidence, text },
    } = await Promise.race([worker.recognize(image), abortPromise]);

    if (cancelled) {
      throw new DOMException('Recipe card scan cancelled.', 'AbortError');
    }

    return {
      confidence,
      text: text.replace(/\r\n?/g, '\n').trim(),
    };
  } finally {
    signal?.removeEventListener('abort', terminate);
    await worker?.terminate();
  }
}

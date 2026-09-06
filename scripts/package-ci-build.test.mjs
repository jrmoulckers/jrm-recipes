import { describe, expect, it } from 'vitest';

import { OCR_ASSETS, selectServiceWorkerAssets } from './package-ci-build.mjs';

describe('selectServiceWorkerAssets', () => {
  it('keeps generated Serwist assets and excludes unrelated public files', () => {
    expect(
      selectServiceWorkerAssets(['icon.png', 'swe-worker-runtime.js', 'sw.js.map', 'sw.js']),
    ).toEqual(['sw.js', 'sw.js.map', 'swe-worker-runtime.js']);
  });

  describe('OCR_ASSETS', () => {
    it('includes the worker, local core, and every supported language', () => {
      expect(OCR_ASSETS).toEqual([
        'ara.traineddata.gz',
        'deu.traineddata.gz',
        'eng.traineddata.gz',
        'spa.traineddata.gz',
        'tesseract-core-lstm.wasm.js',
        'worker.min.js',
      ]);
    });
  });

  it('rejects unsafe or similarly named files', () => {
    expect(
      selectServiceWorkerAssets(['swe-worker-../secret.js', 'swe-worker-runtime.css', 'sw.js.bak']),
    ).toEqual([]);
  });
});

export const DIETARY_MODEL = {
  id: 'onnx-community/paraphrase-multilingual-MiniLM-L12-v2-ONNX',
  revision: 'd4c06bf0d7680171ac30042a1387e1fdb7a90021',
  analyzerVersion: 'minilm-l12-v2-int8.d4c06bf0',
  cacheName: 'heirloom-dietary-model-v1',
  downloadBytes: 135_135_340,
  requiredFreeBytes: 250 * 1024 * 1024,
  assets: [
    {
      path: 'config.json',
      sha256: '376a54b28d37e8502389a87d6c8ff59247fc361cd8d980a47b36b6cae876de5e',
      bytes: 613,
    },
    {
      path: 'special_tokens_map.json',
      sha256: '8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835',
      bytes: 964,
    },
    {
      path: 'tokenizer.json',
      sha256: 'cad551d5600a84242d0973327029452a1e3672ba6313c2a3c3d69c4310e12719',
      bytes: 17_082_987,
    },
    {
      path: 'tokenizer_config.json',
      sha256: '3a8d9bef4da7fc3ac71da789f225b47dc7599a28cfdcc2140463771927dc0726',
      bytes: 1_457,
    },
    {
      path: 'onnx/model_int8.onnx',
      sha256: '0029fce9c82365d8a2bf20e03a476e84785a872d8d423c8bac0fd0f350df88dc',
      bytes: 118_049_319,
    },
  ],
} as const;

export const DIETARY_MODEL_CACHE_PREFIX = 'heirloom-dietary-model-';
export const DIETARY_MODEL_LOCAL_PREFIX = '/__dietary-model__/';
export const DIETARY_RUNTIME_PATH = '/dietary-runtime/';

export type DietaryRuntimeKind = 'webgpu' | 'wasm' | 'deterministic_only';

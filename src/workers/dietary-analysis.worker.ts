/// <reference lib="webworker" />

import {
  DIETARY_MODEL,
  DIETARY_MODEL_LOCAL_PREFIX,
  DIETARY_RUNTIME_PATH,
  type DietaryRuntimeKind,
} from '~/config/on-device-dietary';

type Candidate = { foodId: string; text: string };
type AnalyzeMessage = {
  type: 'analyze';
  requestId: string;
  ingredients: { ingredientId: string; text: string }[];
  candidates: Candidate[];
};
type WorkerResult =
  | {
      type: 'result';
      requestId: string;
      runtime: Exclude<DietaryRuntimeKind, 'deterministic_only'>;
      matches: { ingredientId: string; foodId: string }[];
    }
  | { type: 'error'; requestId: string; code: 'unsupported' | 'runtime_failed' };

declare const self: DedicatedWorkerGlobalScope;

const nativeFetch = self.fetch.bind(self);
let pipelinePromise:
  | Promise<
      (
        text: string | string[],
        options: { pooling: 'mean'; normalize: true },
      ) => Promise<{ tolist(): number[][] }>
    >
  | undefined;
let activeRuntime: Exclude<DietaryRuntimeKind, 'deterministic_only'> | undefined;

function installCacheOnlyFetch(): void {
  self.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) throw new TypeError('Remote inference fetch blocked.');
    if (url.pathname.startsWith(DIETARY_MODEL_LOCAL_PREFIX)) {
      const cached = await caches.open(DIETARY_MODEL.cacheName);
      const response = await cached.match(request.url);
      if (!response) throw new TypeError('Installed model asset is missing.');
      return response;
    }
    if (url.pathname.startsWith(DIETARY_RUNTIME_PATH)) return nativeFetch(request);
    throw new TypeError('Unexpected inference fetch blocked.');
  }) as typeof fetch;
}

async function createPipeline(device: 'webgpu' | 'wasm') {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = DIETARY_MODEL_LOCAL_PREFIX;
  if (!env.backends.onnx.wasm) throw new Error('ONNX WebAssembly backend unavailable.');
  env.backends.onnx.wasm.wasmPaths = DIETARY_RUNTIME_PATH;
  const extractor = await pipeline('feature-extraction', DIETARY_MODEL.id, {
    device,
    dtype: 'int8',
  });
  await extractor('tomato', { pooling: 'mean', normalize: true });
  activeRuntime = device;
  return extractor;
}

async function getPipeline() {
  if (!pipelinePromise) {
    installCacheOnlyFetch();
    pipelinePromise = createPipeline('webgpu').catch(() => createPipeline('wasm'));
  }
  return pipelinePromise;
}

function dot(left: number[], right: number[]): number {
  let total = 0;
  for (let index = 0; index < left.length; index++) total += left[index]! * right[index]!;
  return total;
}

self.addEventListener('message', (event: MessageEvent<AnalyzeMessage>) => {
  if (event.data.type !== 'analyze') return;
  const { requestId, ingredients, candidates } = event.data;
  void (async () => {
    try {
      const extractor = await getPipeline();
      const vectors = (
        await extractor(
          [
            ...ingredients.map((ingredient) => ingredient.text),
            ...candidates.map((item) => item.text),
          ],
          { pooling: 'mean', normalize: true },
        )
      ).tolist();
      const ingredientVectors = vectors.slice(0, ingredients.length);
      const candidateVectors = vectors.slice(ingredients.length);
      const matches = ingredientVectors.flatMap((vector, ingredientIndex) => {
        const ranked = candidateVectors
          .map((candidate, index) => ({ score: dot(vector, candidate), index }))
          .sort((left, right) => right.score - left.score);
        const best = ranked[0];
        const runnerUp = ranked[1];
        if (!best || best.score < 0.86 || (runnerUp && best.score - runnerUp.score < 0.08))
          return [];
        return [
          {
            ingredientId: ingredients[ingredientIndex]!.ingredientId,
            foodId: candidates[best.index]!.foodId,
          },
        ];
      });
      self.postMessage({
        type: 'result',
        requestId,
        runtime: activeRuntime ?? 'wasm',
        matches,
      } satisfies WorkerResult);
    } catch {
      self.postMessage({
        type: 'error',
        requestId,
        code: typeof WebAssembly === 'undefined' ? 'unsupported' : 'runtime_failed',
      } satisfies WorkerResult);
    }
  })();
});

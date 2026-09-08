'use client';

import { DIETARY_MODEL, type DietaryRuntimeKind } from '~/config/on-device-dietary';

export type DietaryAnalysisJob = {
  recipeId: string;
  ingredientFingerprint: string;
  rulesetVersion: string;
  ingredients: { ingredientId: string; text: string }[];
  candidates: {
    foodId: string;
    text: string;
    evidence: {
      ruleId: string;
      finding: 'present' | 'absent' | 'possible' | 'unresolved';
    }[];
  }[];
};

export type DietaryModelMatch = { ingredientId: string; foodId: string };

type WorkerReply =
  | {
      type: 'result';
      requestId: string;
      runtime: Exclude<DietaryRuntimeKind, 'deterministic_only'>;
      matches: DietaryModelMatch[];
    }
  | { type: 'error'; requestId: string; code: 'unsupported' | 'runtime_failed' };

let worker: Worker | undefined;

function getWorker(): Worker {
  worker ??= new Worker(new URL('../workers/dietary-analysis.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

export async function analyzeDietaryJobOnDevice(job: DietaryAnalysisJob): Promise<{
  matches: DietaryModelMatch[];
  runtime: Exclude<DietaryRuntimeKind, 'deterministic_only'>;
}> {
  const requestId = crypto.randomUUID();
  const activeWorker = getWorker();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      stopDietaryAnalysisWorker();
      reject(new Error('worker_failed'));
    }, 120_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      activeWorker.removeEventListener('message', onMessage);
      activeWorker.removeEventListener('error', onError);
    };
    const onMessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === 'error') reject(new Error(event.data.code));
      else resolve({ matches: event.data.matches, runtime: event.data.runtime });
    };
    const onError = () => {
      cleanup();
      stopDietaryAnalysisWorker();
      reject(new Error('worker_failed'));
    };
    activeWorker.addEventListener('message', onMessage);
    activeWorker.addEventListener('error', onError);
    activeWorker.postMessage({
      type: 'analyze',
      requestId,
      ingredients: job.ingredients,
      candidates: job.candidates,
      analyzerVersion: DIETARY_MODEL.analyzerVersion,
    });
  });
}

export function stopDietaryAnalysisWorker(): void {
  worker?.terminate();
  worker = undefined;
}

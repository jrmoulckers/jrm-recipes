'use client';

import { DIETARY_MODEL } from '~/config/on-device-dietary';
import { track } from '~/lib/analytics';
import { analyzeDietaryJobOnDevice, type DietaryAnalysisJob } from '~/lib/dietary-on-device';
import {
  getDietaryModelInstallation,
  hasCurrentDietaryAnalysis,
  markDietaryAnalysisCurrent,
} from '~/lib/dietary-model-storage';
import {
  getOnDeviceDietaryJobAction,
  saveOnDeviceDietaryAssessmentAction,
} from '~/server/dietary/actions';
import type { DietaryAnalysisTrigger } from '~/lib/analytics/dietary-events';

export async function analyzeRecipeOnDevice(
  recipeId: string,
  accountId: string,
  trigger: DietaryAnalysisTrigger,
): Promise<'completed' | 'already-current' | 'not-installed' | 'unavailable'> {
  const installation = await getDietaryModelInstallation(accountId);
  if (!installation?.enabled || installation.revision !== DIETARY_MODEL.revision) {
    return 'not-installed';
  }

  const result = await getOnDeviceDietaryJobAction(recipeId);
  if (!result.ok) return 'unavailable';
  const job = result.job satisfies DietaryAnalysisJob;
  if (await hasCurrentDietaryAnalysis(accountId, recipeId, job.ingredientFingerprint)) {
    return 'already-current';
  }
  if (job.ingredients.length === 0) {
    await markDietaryAnalysisCurrent(accountId, recipeId, job.ingredientFingerprint);
    return 'completed';
  }

  try {
    const analysis = await analyzeDietaryJobOnDevice(job);
    track('dietary_device_support_checked', { support: analysis.runtime });
    const candidates = new Map(job.candidates.map((candidate) => [candidate.foodId, candidate]));
    const evidence = analysis.matches.flatMap((match) => {
      const candidate = candidates.get(match.foodId);
      return candidate
        ? candidate.evidence.map((item) => ({
            ingredientId: match.ingredientId,
            foodId: match.foodId,
            ruleId: item.ruleId,
            finding: item.finding,
          }))
        : [];
    });
    const saved = await saveOnDeviceDietaryAssessmentAction({
      recipeId,
      ingredientFingerprint: job.ingredientFingerprint,
      analyzerVersion: DIETARY_MODEL.analyzerVersion,
      rulesetVersion: job.rulesetVersion,
      evidence,
    });
    if (!saved.ok) throw new Error('invalid_output');
    await markDietaryAnalysisCurrent(accountId, recipeId, job.ingredientFingerprint);
    track('dietary_analysis_finished', { outcome: 'succeeded', trigger, errorCode: 'none' });
    return 'completed';
  } catch (error) {
    const code =
      error instanceof Error && error.message === 'runtime_failed'
        ? 'runtime_initialization_failed'
        : 'worker_failed';
    track('dietary_analysis_finished', { outcome: 'failed', trigger, errorCode: code });
    return 'unavailable';
  }
}

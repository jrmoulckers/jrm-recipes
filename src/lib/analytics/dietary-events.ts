/**
 * Privacy boundary for dietary operational analytics (#1107).
 *
 * Dietary data is health-adjacent, so these events use a stricter contract than
 * the general analytics taxonomy: every event and property is allowlisted, all
 * values are bounded, and an invalid payload rejects the whole event.
 */

const DOWNLOAD_FAILURE_CODES = [
  'network_unavailable',
  'insufficient_storage',
  'integrity_check_failed',
  'cache_failed',
  'runtime_initialization_failed',
  'interrupted',
  'unknown',
] as const;

const ANALYSIS_FAILURE_CODES = [
  'device_unsupported',
  'runtime_initialization_failed',
  'worker_failed',
  'invalid_output',
  'stale_input',
  'cache_failed',
  'unknown',
] as const;

const DEVICE_SUPPORT_VALUES = ['webgpu', 'wasm', 'deterministic_only'] as const;

const ANALYSIS_TRIGGER_VALUES = ['recipe_open', 'recipe_save', 'library_scan'] as const;

export type DietaryDownloadErrorCode = 'none' | (typeof DOWNLOAD_FAILURE_CODES)[number];

export type DietaryAnalysisErrorCode = 'none' | (typeof ANALYSIS_FAILURE_CODES)[number];

export type DietaryDeviceSupport = (typeof DEVICE_SUPPORT_VALUES)[number];

export type DietaryAnalysisTrigger = (typeof ANALYSIS_TRIGGER_VALUES)[number];

export type DietaryDownloadResult =
  | { outcome: 'succeeded'; errorCode: 'none' }
  | {
      outcome: 'failed';
      errorCode: Exclude<DietaryDownloadErrorCode, 'none'>;
    };

export type DietaryAnalysisResult =
  | {
      outcome: 'succeeded';
      trigger: DietaryAnalysisTrigger;
      errorCode: 'none';
    }
  | {
      outcome: 'failed';
      trigger: DietaryAnalysisTrigger;
      errorCode: Exclude<DietaryAnalysisErrorCode, 'none'>;
    };

export interface DietaryEventProperties {
  dietary_analysis_enablement_changed: { enabled: boolean };
  dietary_model_download_finished: DietaryDownloadResult;
  dietary_device_support_checked: { support: DietaryDeviceSupport };
  dietary_analysis_finished: DietaryAnalysisResult;
}

export type DietaryAnalyticsEventName = keyof DietaryEventProperties;

function isPropertyBag(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactlyKeys(
  properties: unknown,
  keys: readonly string[],
): properties is Record<string, unknown> {
  if (!isPropertyBag(properties)) return false;
  const actualKeys = Object.keys(properties);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(properties, key))
  );
}

function isAllowedValue(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

/**
 * Return a copied, allowlisted dietary payload; `null` for a rejected dietary
 * event; or `undefined` when the event is outside the dietary namespace.
 */
export function sanitizeDietaryEventProperties(
  name: string,
  properties: unknown,
): Record<string, unknown> | null | undefined {
  if (!name.startsWith('dietary_')) return undefined;

  const dietaryName = name as DietaryAnalyticsEventName;
  switch (dietaryName) {
    case 'dietary_analysis_enablement_changed':
      return hasExactlyKeys(properties, ['enabled']) && typeof properties.enabled === 'boolean'
        ? { ...properties }
        : null;

    case 'dietary_model_download_finished':
      if (!hasExactlyKeys(properties, ['outcome', 'errorCode'])) return null;
      return (properties.outcome === 'succeeded' && properties.errorCode === 'none') ||
        (properties.outcome === 'failed' &&
          isAllowedValue(properties.errorCode, DOWNLOAD_FAILURE_CODES))
        ? { ...properties }
        : null;

    case 'dietary_device_support_checked':
      return hasExactlyKeys(properties, ['support']) &&
        isAllowedValue(properties.support, DEVICE_SUPPORT_VALUES)
        ? { ...properties }
        : null;

    case 'dietary_analysis_finished':
      if (
        !hasExactlyKeys(properties, ['outcome', 'trigger', 'errorCode']) ||
        !isAllowedValue(properties.trigger, ANALYSIS_TRIGGER_VALUES)
      ) {
        return null;
      }
      return (properties.outcome === 'succeeded' && properties.errorCode === 'none') ||
        (properties.outcome === 'failed' &&
          isAllowedValue(properties.errorCode, ANALYSIS_FAILURE_CODES))
        ? { ...properties }
        : null;

    default: {
      const exhaustiveName: never = dietaryName;
      void exhaustiveName;
      return null;
    }
  }
}

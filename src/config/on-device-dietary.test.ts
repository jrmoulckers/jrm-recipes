import { describe, expect, it } from 'vitest';

import { DIETARY_MODEL } from './on-device-dietary';
import {
  dietaryModelAssetUrl,
  isApprovedDietaryModelResponseUrl,
} from '~/lib/dietary-model-storage';

describe('on-device dietary model manifest', () => {
  it('pins one immutable revision and a digest for every required asset', () => {
    expect(DIETARY_MODEL.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(DIETARY_MODEL.assets.map((asset) => asset.path)).toEqual([
      'config.json',
      'special_tokens_map.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'onnx/model_int8.onnx',
    ]);
    for (const asset of DIETARY_MODEL.assets) {
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.bytes).toBeGreaterThan(0);
    }
  });

  it('builds metadata-only download URLs and rejects unapproved response origins', () => {
    const canary = 'CANARY shellfish allergy';
    for (const asset of DIETARY_MODEL.assets) {
      const url = dietaryModelAssetUrl(asset.path);
      expect(url).toContain(DIETARY_MODEL.revision);
      expect(url).not.toContain(canary);
    }
    expect(isApprovedDietaryModelResponseUrl('https://huggingface.co/model/config.json')).toBe(
      true,
    );
    expect(
      isApprovedDietaryModelResponseUrl('https://cas-bridge.xethub.hf.co/model/model.onnx'),
    ).toBe(true);
    expect(isApprovedDietaryModelResponseUrl('https://example.com/model.onnx')).toBe(false);
    expect(isApprovedDietaryModelResponseUrl('not a url')).toBe(false);
  });

  it('keeps the disclosed download within the approved setup storage budget', () => {
    const total = DIETARY_MODEL.assets.reduce((sum, asset) => sum + asset.bytes, 0);
    expect(DIETARY_MODEL.downloadBytes).toBe(total);
    expect(DIETARY_MODEL.requiredFreeBytes).toBeGreaterThan(total);
  });
});

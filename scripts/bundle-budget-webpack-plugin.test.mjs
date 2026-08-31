import { describe, expect, it } from 'vitest';

import { BundleBudgetWebpackPlugin } from './bundle-budget-webpack-plugin.mjs';

describe('BundleBudgetWebpackPlugin (issue #1011)', () => {
  it('emits page entrypoints with the shared App Router runtime', () => {
    let compilationHook;
    let processAssetsHook;
    let emitted;
    class RawSource {
      constructor(value) {
        this.value = value;
      }
    }
    const entrypoint = (...files) => ({ getFiles: () => files });
    const compilation = {
      entrypoints: new Map([
        ['main-app', entrypoint('static/runtime.js', 'static/runtime.css')],
        ['app/(main)/page', entrypoint('static/home.js', 'static/shared.js')],
        ['app/(main)/recipes/page', entrypoint('static/shared.js', 'static/recipes.js')],
        ['app/api/health/route', entrypoint('static/route-handler.js')],
      ]),
      hooks: {
        processAssets: {
          tap(_options, callback) {
            processAssetsHook = callback;
          },
        },
      },
      emitAsset(filename, source) {
        emitted = { filename, source };
      },
    };
    const compiler = {
      hooks: {
        thisCompilation: {
          tap(_name, callback) {
            compilationHook = callback;
          },
        },
      },
      webpack: {
        Compilation: { PROCESS_ASSETS_STAGE_REPORT: 5000 },
        sources: { RawSource },
      },
    };

    new BundleBudgetWebpackPlugin().apply(compiler);
    compilationHook(compilation);
    processAssetsHook();

    expect(emitted.filename).toBe('bundle-budget-manifest.json');
    expect(JSON.parse(emitted.source.value)).toEqual({
      pages: {
        '/(main)/page': ['static/home.js', 'static/runtime.js', 'static/shared.js'],
        '/(main)/recipes/page': ['static/recipes.js', 'static/runtime.js', 'static/shared.js'],
      },
    });
  });
});

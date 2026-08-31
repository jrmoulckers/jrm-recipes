const MANIFEST_FILENAME = 'bundle-budget-manifest.json';

/**
 * @typedef {{
 *   entrypoints: Map<string, { getFiles(): string[] }>,
 *   hooks: { processAssets: { tap(options: { name: string, stage: number }, callback: () => void): void } },
 *   emitAsset(filename: string, source: unknown): void,
 * }} Compilation
 *
 * @typedef {{
 *   hooks: { thisCompilation: { tap(name: string, callback: (compilation: Compilation) => void): void } },
 *   webpack: {
 *     Compilation: { PROCESS_ASSETS_STAGE_REPORT: number },
 *     sources: { RawSource: new (source: string) => unknown },
 *   },
 * }} Compiler
 */

export class BundleBudgetWebpackPlugin {
  /** @param {Compiler} compiler */
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('BundleBudgetWebpackPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'BundleBudgetWebpackPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
        },
        () => {
          const mainFiles = compilation.entrypoints.get('main-app')?.getFiles() ?? [];
          /** @type {Record<string, string[]>} */
          const pages = {};

          for (const [name, entrypoint] of compilation.entrypoints) {
            if (!name.startsWith('app/') || !name.endsWith('/page')) continue;
            const appPath = `/${name.slice('app/'.length)}`;
            pages[appPath] = [
              ...new Set(
                [...mainFiles, ...entrypoint.getFiles()]
                  .filter((file) => file.endsWith('.js'))
                  .sort(),
              ),
            ];
          }

          compilation.emitAsset(
            MANIFEST_FILENAME,
            new compiler.webpack.sources.RawSource(`${JSON.stringify({ pages }, null, 2)}\n`),
          );
        },
      );
    });
  }
}

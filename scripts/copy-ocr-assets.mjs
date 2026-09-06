import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(repoRoot, 'public', 'ocr');
const tesseractRoot = dirname(require.resolve('tesseract.js/package.json'));
const tesseractRequire = createRequire(require.resolve('tesseract.js/package.json'));
const coreRoot = dirname(tesseractRequire.resolve('tesseract.js-core/package.json'));

const languages = ['ara', 'deu', 'eng', 'spa'];
const files = [
  {
    source: join(tesseractRoot, 'dist', 'worker.min.js'),
    destination: 'worker.min.js',
  },
  {
    source: join(coreRoot, 'tesseract-core-lstm.wasm.js'),
    destination: 'tesseract-core-lstm.wasm.js',
  },
  ...languages.map((language) => {
    const packageRoot = dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));

    return {
      source: join(packageRoot, '4.0.0_best_int', `${language}.traineddata.gz`),
      destination: `${language}.traineddata.gz`,
    };
  }),
];

await mkdir(outputDir, { recursive: true });
await Promise.all(
  files.map(({ source, destination }) => copyFile(source, join(outputDir, destination))),
);

console.log(`Prepared ${files.length} local OCR assets.`);

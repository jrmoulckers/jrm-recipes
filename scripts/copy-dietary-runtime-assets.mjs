import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(repoRoot, 'public', 'dietary-runtime');
const transformersEntry = require.resolve('@huggingface/transformers');
const transformersRequire = createRequire(transformersEntry);
const onnxDist = dirname(transformersRequire.resolve('onnxruntime-web'));
const files = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jspi.mjs',
  'ort-wasm-simd-threaded.jspi.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];

await mkdir(outputDir, { recursive: true });
await Promise.all(files.map((file) => copyFile(join(onnxDist, file), join(outputDir, file))));

console.log(`Prepared ${files.length} local dietary runtime assets.`);

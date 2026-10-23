/**
 * Browser substitute for diskSinks.ts.
 *
 * diskSinks.ts imports fs/path/crypto/os, which have no browser equivalent.
 * src/main.ts reaches it only through `await import('./diskSinks')`, taken
 * only when the Node-only `outputPath` option is set -- so in the browser
 * build, rollup's `disk-sinks-browser-stub` plugin (see rollup.config.mjs)
 * resolves that specifier to this file instead of the real module. Every
 * export here throws rather than doing anything, since disk-backed output
 * is not supported outside Node.
 *
 * This file exists (rather than a template-string virtual module) so that
 * drift between the two modules' export lists becomes a compile error --
 * see the shape guard at the bottom.
 */

const unsupported = (): never => {
  throw new Error(
    'docx-templates: disk-backed output (the outputPath option) requires Node.js and is not available in the browser build.'
  );
};

export const lazyFileStream = unsupported;
export const makeRunDir = unsupported;
export const assertOutputDirExists = unsupported;
export const xmlSpoolPath = unsupported;
export const removeFile = unsupported;
export const cleanupRunDir = unsupported;
export const writeXml = unsupported;
export const storeImage = unsupported;
export const zipSetStream = unsupported;
export const zipSaveToFile = unsupported;

// Compile-time guard: this stub must structurally satisfy the real module.
// If an export is added to diskSinks.ts without being mirrored here, this
// fails to type-check -- which is the whole point of this file existing.
// `unsupported` returns `never`, which is assignable to any function
// signature, so one helper can stand in for every export regardless of its
// real parameter/return types. Consequently, signature drift (e.g.
// diskSinks.ts narrowing a parameter type) is deliberately NOT guarded here:
// every export in this file throws, so it has no real signature to keep in
// sync -- only the set of export names is load-bearing, and that is exactly
// what this guard checks.
const _shapeGuard: typeof import('./diskSinks') = {
  lazyFileStream,
  makeRunDir,
  assertOutputDirExists,
  xmlSpoolPath,
  removeFile,
  cleanupRunDir,
  writeXml,
  storeImage,
  zipSetStream,
  zipSaveToFile,
};
void _shapeGuard;

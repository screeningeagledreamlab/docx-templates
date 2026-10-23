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
export declare const lazyFileStream: () => never;
export declare const makeRunDir: () => never;
export declare const assertOutputDirExists: () => never;
export declare const xmlSpoolPath: () => never;
export declare const removeFile: () => never;
export declare const cleanupRunDir: () => never;
export declare const writeXml: () => never;
export declare const storeImage: () => never;
export declare const zipSetStream: () => never;
export declare const zipSaveToFile: () => never;

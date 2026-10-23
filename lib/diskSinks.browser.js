"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.zipSaveToFile = exports.zipSetStream = exports.storeImage = exports.writeXml = exports.cleanupRunDir = exports.removeFile = exports.xmlSpoolPath = exports.assertOutputDirExists = exports.makeRunDir = exports.lazyFileStream = void 0;
var unsupported = function () {
    throw new Error('docx-templates: disk-backed output (the outputPath option) requires Node.js and is not available in the browser build.');
};
exports.lazyFileStream = unsupported;
exports.makeRunDir = unsupported;
exports.assertOutputDirExists = unsupported;
exports.xmlSpoolPath = unsupported;
exports.removeFile = unsupported;
exports.cleanupRunDir = unsupported;
exports.writeXml = unsupported;
exports.storeImage = unsupported;
exports.zipSetStream = unsupported;
exports.zipSaveToFile = unsupported;
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
var _shapeGuard = {
    lazyFileStream: exports.lazyFileStream,
    makeRunDir: exports.makeRunDir,
    assertOutputDirExists: exports.assertOutputDirExists,
    xmlSpoolPath: exports.xmlSpoolPath,
    removeFile: exports.removeFile,
    cleanupRunDir: exports.cleanupRunDir,
    writeXml: exports.writeXml,
    storeImage: exports.storeImage,
    zipSetStream: exports.zipSetStream,
    zipSaveToFile: exports.zipSaveToFile,
};
void _shapeGuard;

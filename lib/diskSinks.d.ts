/// <reference types="node" />
import { Readable } from 'stream';
import JSZip from 'jszip';
import { Node, Image, SpooledImage } from './types';
import { XmlOptions } from './xml';
/**
 * A Readable that opens its file descriptor on first read, not on construction.
 *
 * Why this exists: JSZip's NodejsStreamInputAdapter binds the stream in its
 * constructor (at `zip.file()` time) and only calls `stream.pause()`. But a
 * paused fs.createReadStream has ALREADY opened its fd. Handing JSZip one
 * stream per image therefore opens every fd up front -- 8000 images against a
 * typical `ulimit -n` of 1024 is a hard EMFILE before a single byte is written.
 *
 * JSZip pulls entries strictly sequentially, so deferring the open to the first
 * _read() keeps the live fd count at ~1.
 *
 * This is safe because _bindStream calls pause() BEFORE attaching its 'data'
 * listener, and Node's on('data') only auto-resumes when readableFlowing is not
 * already false. So the stream is never read until JSZip resumes it.
 */
export declare function lazyFileStream(filePath: string): Readable;
/**
 * Create `<root>/<runId>/{media,xml}/` and return the run dir.
 *
 * The per-run directory is the unit of cleanup, which is what makes concurrent
 * createReport calls safe against a shared root.
 */
export declare function makeRunDir(workDir?: string): Promise<string>;
/**
 * Throw if the parent directory of `outputPath` does not exist.
 *
 * Deliberately synchronous: this is the one fail-fast check, run before any
 * template work happens, so a typo in the output path costs nothing.
 *
 * Lives here rather than in main.ts for the same reason zipSetStream does:
 * main.ts is on the browser import chain (browser.ts -> index.ts -> main.ts),
 * so a static `fs`/`path` import there would drag Node builtins into the
 * browser bundle. main.ts reaches this only through the dynamic import.
 */
export declare function assertOutputDirExists(outputPath: string): void;
/** Where a spooled XML part lives inside the run dir. */
export declare function xmlSpoolPath(runDir: string, name: string): string;
/**
 * Remove a file, swallowing any failure.
 *
 * Used by zipSaveToFile to drop a partial output file after a failed write: a
 * truncated .docx is worse than no file at all. It runs on an error path, so
 * it must never mask the error that got us there.
 */
export declare function removeFile(file: string): Promise<void>;
/**
 * Remove a run dir. Never throws: this runs in a `finally` and must not mask
 * the error that got us there. The caller-supplied root is never removed.
 */
export declare function cleanupRunDir(runDir: string | undefined): Promise<void>;
/**
 * Serialise a node tree straight to disk.
 *
 * Shares emitXml with buildXml, so output is byte-identical by construction.
 * Batches into ~64KB chunks and honours backpressure.
 *
 * emitXml is a Generator, and this project targets es5 without
 * downlevelIteration, so `for...of` over it does not type-check. A manual
 * iterator loop is used instead of `Array.from` so chunks are streamed to disk
 * rather than materialised in memory -- the whole point of this function.
 */
export declare function writeXml(node: Node, options: XmlOptions, dest: string): Promise<void>;
/**
 * Spool one image's bytes to the run dir, returning a file reference instead of
 * the bytes. Returns the image untouched when disk-backed mode is off.
 *
 * Base64 input is decoded here, which also sheds its 1.33x size overhead.
 */
export declare function storeImage(runDir: string | undefined, id: string, img: Image): Promise<Image | SpooledImage>;
/**
 * Add a zip entry whose content is read lazily from disk at generate time.
 *
 * Lives here rather than in zip.ts because zip.ts is on the browser import
 * chain: a static import of this module from there drags fs/path/crypto/os
 * into the browser bundle.
 *
 * `binary: true` is required — the spooled file already holds encoded bytes,
 * so JSZip must treat it as pre-encoded rather than re-encoding it.
 */
export declare const zipSetStream: (zip: JSZip, filename: string, filePath: string) => void;
/**
 * Stream the zip straight to disk, so the whole archive never exists in memory.
 *
 * `streamFiles: false` is deliberate. JSZip pipes the compress worker into
 * ZipFileWorker, so its per-entry accumulation holds POST-compression bytes --
 * one deflated entry at a time, which is small. Setting it to true would emit
 * ZIP data descriptors (GP bit 3), which some OOXML consumers handle poorly.
 */
export declare const zipSaveToFile: (zip: JSZip, outputPath: string, compressionLevel: number) => Promise<number>;

import {
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fsp,
} from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { stat } from 'fs/promises';
import { randomBytes } from 'crypto';
import os from 'os';
import path from 'path';
import { once } from 'events';
import JSZip from 'jszip';
import { Node, Image, SpooledImage } from './types';
import { emitXml, XmlOptions } from './xml';
import { ReportOutputError } from './errors';
import { logger } from './debug';

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
export function lazyFileStream(filePath: string): Readable {
  let inner: Readable | null = null;
  let stopped = false;

  const out = new Readable({
    read() {
      if (stopped) return;
      if (inner == null) {
        const src = createReadStream(filePath);
        inner = src;
        src.on('data', (chunk: Buffer) => {
          if (!out.push(chunk)) src.pause();
        });
        src.on('end', () => out.push(null));
        src.on('error', (err: Error) => out.destroy(err));
      } else {
        inner.resume();
      }
    },
    destroy(err, cb) {
      stopped = true;
      if (inner != null) inner.destroy();
      cb(err);
    },
  });

  return out;
}

const DEFAULT_WORK_ROOT = 'docx-templates';

/** Bytes buffered before a write is issued. Keeps syscall count sane. */
const WRITE_CHUNK_BYTES = 64 * 1024;

/**
 * Create `<root>/<runId>/{media,xml}/` and return the run dir.
 *
 * The per-run directory is the unit of cleanup, which is what makes concurrent
 * createReport calls safe against a shared root.
 */
export async function makeRunDir(workDir?: string): Promise<string> {
  const root = workDir ?? path.join(os.tmpdir(), DEFAULT_WORK_ROOT);
  const runDir = path.join(root, randomBytes(8).toString('hex'));
  try {
    await fsp.mkdir(path.join(runDir, 'media'), { recursive: true });
    await fsp.mkdir(path.join(runDir, 'xml'), { recursive: true });
  } catch (e) {
    throw new ReportOutputError(
      `Could not create work directory at ${runDir}`,
      e
    );
  }
  return runDir;
}

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
export function assertOutputDirExists(outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!existsSync(dir)) {
    throw new ReportOutputError(
      `The output directory ${dir} does not exist. Create it before calling createReport.`,
      undefined
    );
  }
}

/** Where a spooled XML part lives inside the run dir. */
export function xmlSpoolPath(runDir: string, name: string): string {
  return path.join(runDir, 'xml', name);
}

/**
 * Remove a file, swallowing any failure.
 *
 * Used by zipSaveToFile to drop a partial output file after a failed write: a
 * truncated .docx is worse than no file at all. It runs on an error path, so
 * it must never mask the error that got us there.
 */
export async function removeFile(file: string): Promise<void> {
  try {
    await fsp.rm(file, { force: true });
  } catch (e) {
    logger.debug(`Could not remove ${file}: ${String(e)}`);
  }
}

/**
 * Remove a run dir. Never throws: this runs in a `finally` and must not mask
 * the error that got us there. The caller-supplied root is never removed.
 */
export async function cleanupRunDir(runDir: string | undefined): Promise<void> {
  if (runDir == null) return;
  try {
    await fsp.rm(runDir, { recursive: true, force: true });
  } catch (e) {
    logger.debug(`Could not clean up work directory ${runDir}: ${String(e)}`);
  }
}

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
export async function writeXml(
  node: Node,
  options: XmlOptions,
  dest: string
): Promise<void> {
  const ws = createWriteStream(dest);
  try {
    let buffered = '';
    const it = emitXml(node, options);
    let r = it.next();
    while (!r.done) {
      buffered += r.value;
      if (buffered.length >= WRITE_CHUNK_BYTES) {
        if (!ws.write(buffered, 'utf-8')) await once(ws, 'drain');
        buffered = '';
      }
      r = it.next();
    }
    if (buffered.length > 0) {
      if (!ws.write(buffered, 'utf-8')) await once(ws, 'drain');
    }
    ws.end();
    // Wait for 'close', not 'finish'. 'finish' only means the data has been
    // flushed to the OS -- the underlying fs.close() (autoClose defaults to
    // true) happens after that, so `ws.closed` can still be false when
    // 'finish' fires. Callers (e.g. cleanupRunDir) rely on the fd actually
    // being closed by the time this promise resolves: on Windows a file with
    // an open fd cannot be deleted, so racing ahead on 'finish' could make
    // cleanup silently fail to remove the run directory. 'close' fires after
    // 'finish' and is emitted asynchronously, so attaching the listener here
    // (after ws.end()) cannot miss it; events.once still rejects if the
    // stream emits 'error' while we wait.
    await once(ws, 'close');
  } catch (e) {
    ws.destroy();
    throw new ReportOutputError(`Could not write XML to ${dest}`, e);
  }
}

/**
 * Spool one image's bytes to the run dir, returning a file reference instead of
 * the bytes. Returns the image untouched when disk-backed mode is off.
 *
 * Base64 input is decoded here, which also sheds its 1.33x size overhead.
 */
export async function storeImage(
  runDir: string | undefined,
  id: string,
  img: Image
): Promise<Image | SpooledImage> {
  if (runDir == null) return img;

  const bytes =
    typeof img.data === 'string'
      ? Buffer.from(img.data, 'base64')
      : Buffer.from(img.data as ArrayBuffer);

  const file = path.join(runDir, 'media', `${id}${img.extension}`);
  try {
    await fsp.writeFile(file, bytes);
  } catch (e) {
    throw new ReportOutputError(`Could not spool image ${id} to ${file}`, e);
  }
  return { extension: img.extension, file };
}

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
export const zipSetStream = (
  zip: JSZip,
  filename: string,
  filePath: string
) => {
  zip.file(filename, lazyFileStream(filePath), { binary: true });
};

/**
 * Stream the zip straight to disk, so the whole archive never exists in memory.
 *
 * `streamFiles: false` is deliberate. JSZip pipes the compress worker into
 * ZipFileWorker, so its per-entry accumulation holds POST-compression bytes --
 * one deflated entry at a time, which is small. Setting it to true would emit
 * ZIP data descriptors (GP bit 3), which some OOXML consumers handle poorly.
 */
export const zipSaveToFile = async (
  zip: JSZip,
  outputPath: string,
  compressionLevel: number
): Promise<number> => {
  // The write stream is created -- and its open awaited -- explicitly rather
  // than inlined into pipeline(), because whether the file was ever OPENED is
  // what decides who owns it on failure:
  //
  //   open succeeded -> fs truncated whatever was at outputPath at open time,
  //                     so the caller's previous report is already gone and a
  //                     partial .docx is strictly worse than none: remove it.
  //   open failed    -> we touched nothing (EISDIR, EACCES, ENOENT, ...). The
  //                     caller owns outputPath; leave what is there alone.
  //
  // Awaiting 'open' before starting the pipeline is what makes that a decision
  // rather than a race: a source error arriving while fs.open is still in
  // flight would otherwise leave us unable to tell the two cases apart.
  const ws = createWriteStream(outputPath);
  try {
    // 'open' is emitted asynchronously, so attaching here cannot miss it;
    // events.once rejects instead if the stream errors.
    await once(ws, 'open');
  } catch (e) {
    ws.destroy();
    throw new ReportOutputError(`Could not open ${outputPath} for writing`, e);
  }
  try {
    await pipeline(
      zip.generateNodeStream({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
        streamFiles: false,
      }),
      ws
    );
  } catch (e) {
    await removeFile(outputPath);
    throw new ReportOutputError(
      `Could not write the report to ${outputPath}`,
      e
    );
  }
  return (await stat(outputPath)).size;
};

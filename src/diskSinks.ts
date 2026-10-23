import { createReadStream, createWriteStream, promises as fsp } from 'fs';
import { Readable } from 'stream';
import { randomBytes } from 'crypto';
import os from 'os';
import path from 'path';
import { once } from 'events';
import { Node } from './types';
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
    await once(ws, 'finish');
  } catch (e) {
    ws.destroy();
    throw new ReportOutputError(`Could not write XML to ${dest}`, e);
  }
}

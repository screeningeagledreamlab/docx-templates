import { createReadStream } from 'fs';
import { Readable } from 'stream';

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

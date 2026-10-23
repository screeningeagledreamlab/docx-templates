/* eslint-env jest */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { lazyFileStream } from '../diskSinks';

const read = (s: NodeJS.ReadableStream): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on('data', c => chunks.push(Buffer.from(c)));
    s.on('end', () => resolve(Buffer.concat(chunks)));
    s.on('error', reject);
    // Once a stream has been explicitly paused (as the "survives being paused"
    // test below does, mirroring JSZip), Node's flowing flag is pinned to
    // `false`; merely attaching a 'data' listener only auto-resumes when
    // flowing is still unset (`null`). Real consumers either .pipe() (which
    // calls resume() internally) or, like JSZip's own pump loop, call
    // resume()/read() explicitly. This helper does the same so it behaves
    // like a real consumer rather than hanging forever on a paused stream.
    s.resume();
  });

describe('lazyFileStream', () => {
  let dir: string;
  let file: string;

  beforeAll(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lazy-test-'));
    file = path.join(dir, 'data.bin');
    await fs.promises.writeFile(file, Buffer.alloc(200000, 7));
  });

  afterAll(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('reads the full file contents', async () => {
    const buf = await read(lazyFileStream(file));
    expect(buf.length).toBe(200000);
    expect(buf.every(b => b === 7)).toBe(true);
  });

  it('does not touch the filesystem until first read', async () => {
    const missing = path.join(dir, 'does-not-exist.bin');
    const s = lazyFileStream(missing);
    const onError = jest.fn();
    s.on('error', onError);
    // Give the event loop several turns; an eager open would have errored.
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(onError).not.toHaveBeenCalled();
    // Now read, and the ENOENT must surface.
    await expect(read(s)).rejects.toThrow(/ENOENT/);
  });

  it('opens no file descriptors for thousands of unread streams', () => {
    // 5000 eager fs.createReadStream calls would exceed ulimit -n and throw
    // EMFILE. This is the regression guard for the whole design.
    const streams = Array.from({ length: 5000 }, () => lazyFileStream(file));
    expect(streams).toHaveLength(5000);
    streams.forEach(s => s.destroy());
  });

  it('survives being paused before it is ever read (JSZip does this)', async () => {
    const s = lazyFileStream(file);
    s.pause();
    await new Promise(r => setImmediate(r));
    const buf = await read(s);
    expect(buf.length).toBe(200000);
  });
});

/* eslint-env jest */
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import {
  lazyFileStream,
  makeRunDir,
  cleanupRunDir,
  writeXml,
  storeImage,
  zipSetStream,
  zipSaveToFile,
  assertOutputDirExists,
  xmlSpoolPath,
  removeFile,
} from '../diskSinks';
import { buildXml, parseXml } from '../xml';
import { Image, SpooledImage } from '../types';

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

describe('makeRunDir / cleanupRunDir', () => {
  it('creates a unique run dir with media/ and xml/ subdirs', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'runroot-'));
    const a = await makeRunDir(root);
    const b = await makeRunDir(root);
    expect(a).not.toBe(b);
    expect(fs.existsSync(path.join(a, 'media'))).toBe(true);
    expect(fs.existsSync(path.join(a, 'xml'))).toBe(true);
    await cleanupRunDir(a);
    await cleanupRunDir(b);
    // The caller-supplied root must SURVIVE cleanup.
    expect(fs.existsSync(root)).toBe(true);
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('creates the root itself when it does not exist', async () => {
    const root = path.join(os.tmpdir(), `runroot-missing-${Date.now()}`);
    const runDir = await makeRunDir(root);
    expect(fs.existsSync(runDir)).toBe(true);
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('cleanupRunDir never throws, even on a missing path', async () => {
    await expect(
      cleanupRunDir(path.join(os.tmpdir(), 'definitely-not-here-xyz'))
    ).resolves.toBeUndefined();
    await expect(cleanupRunDir(undefined)).resolves.toBeUndefined();
  });
});

describe('assertOutputDirExists', () => {
  it('passes when the parent directory exists', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aode-'));
    expect(() =>
      assertOutputDirExists(path.join(dir, 'report.docx'))
    ).not.toThrow();
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('throws naming the missing directory', () => {
    const missing = path.join(os.tmpdir(), 'definitely-not-here-xyz');
    expect(() =>
      assertOutputDirExists(path.join(missing, 'report.docx'))
    ).toThrow(/output directory/i);
  });
});

describe('xmlSpoolPath', () => {
  it('puts the part under <runDir>/xml', () => {
    expect(xmlSpoolPath(path.join('a', 'b'), 'document.xml')).toBe(
      path.join('a', 'b', 'xml', 'document.xml')
    );
  });
});

describe('removeFile', () => {
  it('removes an existing file', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rmf-'));
    const file = path.join(dir, 'partial.docx');
    await fs.promises.writeFile(file, 'junk');
    await removeFile(file);
    expect(fs.existsSync(file)).toBe(false);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('never throws, even when the path cannot be removed', async () => {
    // A directory: fsp.rm without `recursive` fails on it. removeFile runs on
    // an error path and must not mask the error that got us there.
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rmf-'));
    await expect(removeFile(dir)).resolves.toBeUndefined();
    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});

describe('writeXml', () => {
  const opts = { literalXmlDelimiter: '||', indentXml: false };

  it('produces bytes identical to buildXml', async () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<root a="1"><child>hello &amp; goodbye</child><empty/></root>';
    const node = await parseXml(xml);
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wx-'));
    const dest = path.join(dir, 'out.xml');

    await writeXml(node, opts, dest);

    const fromDisk = await fs.promises.readFile(dest);
    expect(fromDisk.equals(buildXml(node, opts))).toBe(true);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('round-trips non-ASCII text as UTF-8', async () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<r><t>café 漢字 “smart”</t></r>';
    const node = await parseXml(xml);
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wx-'));
    const dest = path.join(dir, 'out.xml');

    await writeXml(node, opts, dest);

    const fromDisk = await fs.promises.readFile(dest);
    expect(fromDisk.equals(buildXml(node, opts))).toBe(true);
    expect(fromDisk.toString('utf-8')).toContain('café 漢字');
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('handles a document larger than one write buffer', async () => {
    const children = Array.from(
      { length: 20000 },
      (_, i) => `<c i="${i}">text ${i}</c>`
    ).join('');
    const node = await parseXml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><r>${children}</r>`
    );
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wx-'));
    const dest = path.join(dir, 'big.xml');

    await writeXml(node, opts, dest);

    const fromDisk = await fs.promises.readFile(dest);
    expect(fromDisk.equals(buildXml(node, opts))).toBe(true);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('produces bytes identical to buildXml for non-ASCII content crossing the write-chunk threshold', async () => {
    // Many multi-byte children so the 64KB flush boundary falls in the middle
    // of the document multiple times, including potentially mid multi-byte
    // character territory from a naive byte-counting implementation.
    const children = Array.from(
      { length: 5000 },
      (_, i) => `<c i="${i}">café 漢字 — ü ${i}</c>`
    ).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><r>${children}</r>`;
    const node = await parseXml(xml);
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wx-'));
    const dest = path.join(dir, 'big-nonascii.xml');

    await writeXml(node, opts, dest);

    const fromDisk = await fs.promises.readFile(dest);
    const expected = buildXml(node, opts);
    expect(expected.length).toBeGreaterThan(64 * 1024 * 3);
    expect(fromDisk.equals(expected)).toBe(true);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});

describe('storeImage', () => {
  it('returns the image unchanged when there is no run dir', async () => {
    const img: Image = { extension: '.png', data: Buffer.from([1, 2, 3]) };
    const stored = await storeImage(undefined, 'img1', img);
    expect(stored).toBe(img);
  });

  it('spools binary data to <runDir>/media and returns a file reference', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'si-'));
    const runDir = await makeRunDir(root);
    const img: Image = { extension: '.png', data: Buffer.from([9, 8, 7]) };

    const stored = (await storeImage(runDir, 'img1', img)) as SpooledImage;

    expect(stored.extension).toBe('.png');
    expect(stored.file).toContain('media');
    expect(await fs.promises.readFile(stored.file)).toEqual(
      Buffer.from([9, 8, 7])
    );
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('decodes base64 input on the way to disk', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'si-'));
    const runDir = await makeRunDir(root);
    const img: Image = { extension: '.gif', data: 'bm90aGluZwo=' };

    const stored = (await storeImage(runDir, 'img2', img)) as SpooledImage;

    expect(await fs.promises.readFile(stored.file)).toEqual(
      Buffer.from('bm90aGluZwo=', 'base64')
    );
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('gives each image id a distinct file', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'si-'));
    const runDir = await makeRunDir(root);
    const a = (await storeImage(runDir, 'img1', {
      extension: '.png',
      data: Buffer.from([1]),
    })) as SpooledImage;
    const b = (await storeImage(runDir, 'img2', {
      extension: '.png',
      data: Buffer.from([2]),
    })) as SpooledImage;
    expect(a.file).not.toBe(b.file);
    await fs.promises.rm(root, { recursive: true, force: true });
  });
});

describe('zipSetStream', () => {
  it('adds a zip entry whose content is read lazily from the given file', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zss-'));
    const file = path.join(dir, 'img.bin');
    const bytes = Buffer.from([5, 6, 7, 8]);
    await fs.promises.writeFile(file, bytes);

    const zip = new JSZip();
    zipSetStream(zip, 'media/img.bin', file);
    const generated = await zip.generateAsync({ type: 'nodebuffer' });

    const reloaded = await JSZip.loadAsync(generated);
    const entry = reloaded.file('media/img.bin');
    expect(entry).not.toBeNull();
    const content = await entry!.async('nodebuffer');
    expect(content).toEqual(bytes);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});

describe('zip streaming helpers', () => {
  it('writes a zip to disk with stream entries intact', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zs-'));
    const src = path.join(dir, 'payload.bin');
    const payload = Buffer.from('café 漢字 payload', 'utf-8');
    await fs.promises.writeFile(src, payload);

    const zip = new JSZip();
    zip.file('inline.txt', 'plain content');
    zipSetStream(zip, 'streamed.bin', src);

    const out = path.join(dir, 'out.zip');
    const bytes = await zipSaveToFile(zip, out, 1);

    expect(bytes).toBeGreaterThan(0);
    expect((await fs.promises.stat(out)).size).toBe(bytes);

    const reloaded = await JSZip.loadAsync(await fs.promises.readFile(out));
    expect(await reloaded.file('inline.txt')!.async('text')).toBe(
      'plain content'
    );
    const roundTripped = await reloaded
      .file('streamed.bin')!
      .async('nodebuffer');
    expect(roundTripped.equals(payload)).toBe(true);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('does not emit data descriptors (GP bit 3 must be clear)', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zs-'));
    const src = path.join(dir, 'p.bin');
    await fs.promises.writeFile(src, Buffer.alloc(5000, 3));

    const zip = new JSZip();
    zipSetStream(zip, 'p.bin', src);
    const out = path.join(dir, 'out.zip');
    await zipSaveToFile(zip, out, 1);

    const buf = await fs.promises.readFile(out);
    // Local file header: signature PK\x03\x04, then version(2), then flags(2).
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    const flags = buf.readUInt16LE(6);
    expect(flags & 0x08).toBe(0);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('handles many stream entries without exhausting file descriptors', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zs-'));
    const zip = new JSZip();
    for (let i = 0; i < 1500; i++) {
      const f = path.join(dir, `e${i}.bin`);
      await fs.promises.writeFile(f, Buffer.alloc(64, i % 256));
      zipSetStream(zip, `e${i}.bin`, f);
    }
    const out = path.join(dir, 'many.zip');
    await expect(zipSaveToFile(zip, out, 1)).resolves.toBeGreaterThan(0);

    const reloaded = await JSZip.loadAsync(await fs.promises.readFile(out));
    expect(Object.keys(reloaded.files)).toHaveLength(1500);

    await fs.promises.rm(dir, { recursive: true, force: true });
  }, 60000);
});

// uid 0 bypasses the permission check that makes the read-only file below
// unopenable, so under root this suite would not test what it claims to.
const describeUnlessRoot =
  process.getuid == null || process.getuid() !== 0 ? describe : describe.skip;

describeUnlessRoot('zipSaveToFile when the output cannot be opened', () => {
  // A read-only FILE at outputPath is the case that discriminates. fs fails at
  // open (EACCES) having truncated nothing, yet unlinking still succeeds,
  // because on POSIX removing a file depends on the DIRECTORY's permissions,
  // not the file's -- so a blanket "remove the partial output" would delete
  // the caller's previous report. A directory at outputPath does not test
  // this: fsp.rm without `recursive` refuses to remove it anyway, so the
  // assertion would hold even with the bug present.
  //
  // Skipped under uid 0, which bypasses the permission check entirely.
  it('leaves outputPath alone when the write stream never opens', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zs-'));
    const outputPath = path.join(dir, 'report.docx');
    await fs.promises.writeFile(outputPath, 'the previous report');
    await fs.promises.chmod(outputPath, 0o444);

    const zip = new JSZip();
    zip.file('inline.txt', 'plain content');

    await expect(zipSaveToFile(zip, outputPath, 1)).rejects.toThrow(
      /Could not open/
    );
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(await fs.promises.readFile(outputPath, 'utf-8')).toBe(
      'the previous report'
    );

    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});

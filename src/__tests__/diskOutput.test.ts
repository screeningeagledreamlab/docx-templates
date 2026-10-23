/* eslint-env jest */
import path from 'path';
import fs from 'fs';
import os from 'os';
import JSZip from 'jszip';
import { createReport } from '../index';

const FIXTURES = path.join(__dirname, 'fixtures');

const mkOutDir = () => fs.promises.mkdtemp(path.join(os.tmpdir(), 'docx-out-'));

const injectImgContext = async () => ({
  injectImg: async () => ({
    width: 6,
    height: 6,
    data: await fs.promises.readFile(path.join(FIXTURES, 'sample.png')),
    extension: '.png' as const,
  }),
});

describe('disk-backed output', () => {
  it('writes a valid docx to outputPath and reports its size', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const dir = await mkOutDir();
    const outputPath = path.join(dir, 'report.docx');

    const result = await createReport({
      template,
      outputPath,
      data: {},
      additionalJsContext: await injectImgContext(),
    });

    expect(result.path).toBe(outputPath);
    expect(result.bytes).toBeGreaterThan(0);
    expect((await fs.promises.stat(outputPath)).size).toBe(result.bytes);

    // It must be a readable docx with a main document part.
    const zip = await JSZip.loadAsync(await fs.promises.readFile(outputPath));
    expect(zip.file('word/document.xml')).not.toBeNull();

    // The spooled image must have made it into the archive.
    const media = Object.keys(zip.files).filter(
      f => f.indexOf('word/media/') === 0 && !zip.files[f].dir
    );
    expect(media).toEqual(['word/media/template_document.xml_img1.png']);
    const imgBytes = await zip.files[media[0]].async('nodebuffer');
    const original = await fs.promises.readFile(
      path.join(FIXTURES, 'sample.png')
    );
    expect(imgBytes.equals(original)).toBe(true);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('removes the scratch run dir after a successful run', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const dir = await mkOutDir();
    const workDir = path.join(dir, 'work');
    await fs.promises.mkdir(workDir);

    await createReport({
      template,
      outputPath: path.join(dir, 'report.docx'),
      workDir,
      data: {},
      additionalJsContext: await injectImgContext(),
    });

    // The work root survives; everything the library created under it is gone.
    expect(await fs.promises.readdir(workDir)).toEqual([]);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('produces the same parts as the in-memory path, headers included', async () => {
    // imageHeader.docx puts the IMAGE command in word/header1.xml, so this
    // exercises the secondary-XML disk branch and secondary image spooling,
    // not just word/document.xml.
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageHeader.docx')
    );
    const opts = {
      template,
      data: {},
      additionalJsContext: {
        image: async () => ({
          width: 6,
          height: 6,
          data: await fs.promises.readFile(path.join(FIXTURES, 'sample.png')),
          extension: '.png' as const,
        }),
      },
    };

    const inMemory = await createReport(opts);

    const dir = await mkOutDir();
    const outputPath = path.join(dir, 'report.docx');
    await createReport({ ...opts, outputPath });

    const a = await JSZip.loadAsync(inMemory);
    const b = await JSZip.loadAsync(await fs.promises.readFile(outputPath));
    const names = (z: JSZip) =>
      Object.keys(z.files)
        .filter(n => !z.files[n].dir)
        .sort();
    expect(names(b)).toEqual(names(a));
    for (const name of names(a)) {
      const fromMemory = await a.files[name].async('nodebuffer');
      const fromDisk = await b.files[name].async('nodebuffer');
      expect([name, fromDisk.equals(fromMemory)]).toEqual([name, true]);
    }

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('still returns a Uint8Array when outputPath is absent', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const out = await createReport({
      template,
      data: {},
      additionalJsContext: await injectImgContext(),
    });
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it('throws when the output directory does not exist', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    await expect(
      createReport({
        template,
        outputPath: path.join(os.tmpdir(), 'no-such-dir-xyz', 'r.docx'),
        data: {},
        additionalJsContext: await injectImgContext(),
      })
    ).rejects.toThrow(/output directory/i);
  });

  it('cleans up the run dir and leaves no partial file when the report fails', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const dir = await mkOutDir();
    const workDir = path.join(dir, 'work');
    await fs.promises.mkdir(workDir);
    const outputPath = path.join(dir, 'report.docx');

    await expect(
      createReport({
        template,
        outputPath,
        workDir,
        data: {},
        additionalJsContext: {
          injectImg: async () => {
            throw new Error('boom');
          },
        },
      })
    ).rejects.toThrow();

    expect(await fs.promises.readdir(workDir)).toEqual([]);
    expect(fs.existsSync(outputPath)).toBe(false);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});

// uid 0 bypasses the permission check that makes the read-only file below
// unopenable, so under root this suite would not test what it claims to.
const describeUnlessRoot =
  process.getuid == null || process.getuid() !== 0 ? describe : describe.skip;

describeUnlessRoot('disk-backed output, unopenable outputPath', () => {
  // Regression guard for silent user-data loss: a failure to OPEN the output
  // truncates nothing, so the caller's previous report must survive. A
  // read-only file is the discriminating case -- unlinking it would succeed
  // (POSIX checks the directory's permissions, not the file's). Skipped under
  // uid 0, which bypasses the permission check.
  it('does not delete an outputPath it could never open', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const dir = await mkOutDir();
    const workDir = path.join(dir, 'work');
    await fs.promises.mkdir(workDir);
    const outputPath = path.join(dir, 'report.docx');
    await fs.promises.writeFile(outputPath, 'the previous report');
    await fs.promises.chmod(outputPath, 0o444);

    await expect(
      createReport({
        template,
        outputPath,
        workDir,
        data: {},
        additionalJsContext: await injectImgContext(),
      })
    ).rejects.toThrow();

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(await fs.promises.readFile(outputPath, 'utf-8')).toBe(
      'the previous report'
    );
    // The scratch dir still goes, as on any other failure.
    expect(await fs.promises.readdir(workDir)).toEqual([]);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});

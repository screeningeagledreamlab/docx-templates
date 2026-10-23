/* eslint-env jest */
import path from 'path';
import fs from 'fs';
import os from 'os';
import JSZip from 'jszip';
import QR from 'qrcode';
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

/**
 * Unzip a docx and return a sorted map of entry name -> decompressed bytes.
 *
 * We compare UNZIPPED ENTRIES, never raw zip bytes: JSZip stamps `new Date()`
 * on every entry it writes, so the DOS timestamps legitimately differ between
 * two runs even in the same mode. A raw byte comparison would be flaky and
 * would be testing the wrong thing.
 */
const entriesOf = async (data: Buffer | Uint8Array) => {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files)
    .filter(n => !zip.files[n].dir)
    .sort();
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    out[n] = await zip.files[n].async('nodebuffer');
  }
  return out;
};

/**
 * Assert that an in-memory docx and an on-disk docx contain the same entry
 * names and that every entry's decompressed bytes are identical.
 */
const expectEquivalent = async (
  inMemory: Buffer | Uint8Array,
  onDisk: string
): Promise<void> => {
  const a = await entriesOf(inMemory);
  const b = await entriesOf(await fs.promises.readFile(onDisk));

  expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
  const names = Object.keys(a);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    // Compare with a helpful message: a bare Buffer diff is unreadable.
    expect({ name, equal: b[name].equals(a[name]) }).toEqual({
      name,
      equal: true,
    });
  }
};

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

    await expectEquivalent(inMemory, outputPath);

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

describe('equivalence: disk-backed output matches in-memory output', () => {
  const png = () => fs.promises.readFile(path.join(FIXTURES, 'sample.png'));
  const svg = () => fs.promises.readFile(path.join(FIXTURES, 'sample.svg'));

  /**
   * Each case exercises a distinct risk area in the disk-backed path:
   *  - raster image            -> the plain spool + lazyFileStream path
   *  - raster + imageConcurrency -> images resolved through p-limit workers
   *                                  rather than inline
   *  - SVG + thumbnail         -> the two-entry branch (svg plus its own
   *                                thumbnail relId) in applyImageData
   *  - base64 image            -> the base64-decode branch inside storeImage
   *  - image caption           -> caption nodes appended to the tree AFTER
   *                                image resolution
   *  - non-ASCII text          -> UTF-8 encoding of the XML stream path,
   *                                with no images involved at all
   */
  const cases: Array<{
    name: string;
    fixture: string;
    options: () => Promise<Record<string, unknown>>;
  }> = [
    {
      name: 'raster image',
      fixture: 'imageSimple.docx',
      options: async () => ({
        data: {},
        additionalJsContext: {
          injectImg: async () => ({
            width: 6,
            height: 6,
            data: await png(),
            extension: '.png',
          }),
        },
      }),
    },
    {
      name: 'raster image with imageConcurrency set (parallel mode)',
      fixture: 'imageSimple.docx',
      options: async () => ({
        data: {},
        imageConcurrency: 4,
        additionalJsContext: {
          injectImg: async () => ({
            width: 6,
            height: 6,
            data: await png(),
            extension: '.png',
          }),
        },
      }),
    },
    {
      // imagesSVG.docx carries two IMAGE commands: svgImgFile() and
      // svgImgStr(). Both must be supplied, each with its own thumbnail, so
      // this exercises the two-entry (svg + thumbnail, separate relId) branch
      // twice over.
      name: 'SVG image with thumbnail',
      fixture: 'imagesSVG.docx',
      options: async () => {
        const thumbnail = { data: await png(), extension: '.png' };
        return {
          data: {},
          additionalJsContext: {
            svgImgFile: async () => ({
              width: 6,
              height: 6,
              data: await svg(),
              extension: '.svg',
              thumbnail,
            }),
            svgImgStr: async () => ({
              width: 6,
              height: 6,
              data: Buffer.from(
                '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>'
              ),
              extension: '.svg',
              thumbnail,
            }),
          },
        };
      },
    },
    {
      name: 'base64-encoded image',
      fixture: 'imageBase64.docx',
      options: async () => ({
        data: {},
        additionalJsContext: {
          qr: async (contents: string) => {
            const dataUrl = await QR.toDataURL(contents, { width: 500 });
            const data = dataUrl.slice('data:image/gif;base64,'.length);
            return { width: 6, height: 6, data, extension: '.gif' };
          },
        },
      }),
    },
    {
      name: 'image with caption',
      fixture: 'imageCaption.docx',
      options: async () => ({
        data: {},
        additionalJsContext: {
          injectImg: async (caption: boolean) => ({
            width: 6,
            height: 6,
            data: await png(),
            extension: '.png',
            caption: caption ? 'The image caption!' : undefined,
          }),
        },
      }),
    },
    {
      name: 'non-ASCII text, no images',
      fixture: 'for1.docx',
      options: async () => ({
        data: {
          companies: [
            { name: 'café' },
            { name: '漢字テスト' },
            { name: '“smart quotes” — em dash' },
            { name: 'Ωmega ß ü' },
          ],
        },
      }),
    },
  ];

  cases.forEach(({ name, fixture, options }) => {
    it(`produces identical entries for: ${name}`, async () => {
      const template = await fs.promises.readFile(path.join(FIXTURES, fixture));
      const base = await options();

      const inMemory = (await createReport({
        template,
        ...base,
      } as never)) as unknown as Uint8Array;

      const dir = await mkOutDir();
      const outputPath = path.join(dir, 'report.docx');
      await createReport({
        template,
        outputPath,
        ...base,
      } as never);

      await expectEquivalent(inMemory, outputPath);
      await fs.promises.rm(dir, { recursive: true, force: true });
    }, 20000);
  });
});

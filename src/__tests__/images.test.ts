/* eslint-env jest */

import path from 'path';
import fs from 'fs';
import { PNG } from 'pngjs';
import { createReport } from '../index';
import { Image, ImagePars } from '../types';
import { setDebugLogSink } from '../debug';
import JSZip from 'jszip';

if (process.env.DEBUG) setDebugLogSink(console.log);

it('001: Issue #61 Correctly renders an SVG image', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imagesSVG.docx')
  );

  // Use a random png file as a thumbnail
  const thumbnail: Image = {
    data: await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'sample.png')
    ),
    extension: '.png',
  };

  const opts = {
    template,
    data: {},
    additionalJsContext: {
      svgImgFile: async () => {
        const data = await fs.promises.readFile(
          path.join(__dirname, 'fixtures', 'sample.svg')
        );
        return {
          width: 6,
          height: 6,
          data,
          extension: '.svg',
          thumbnail,
        };
      },
      svgImgStr: () => {
        const data = Buffer.from(
          `<svg  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                                  <rect x="10" y="10" height="100" width="100" style="stroke:#ff0000; fill: #0000ff"/>
                              </svg>`,
          'utf-8'
        );
        return {
          width: 6,
          height: 6,
          data,
          extension: '.svg',
          thumbnail,
        };
      },
    },
  };

  const result = await createReport(opts, 'JS');
  expect(result).toMatchSnapshot();
});

it('002: throws when thumbnail is incorrectly provided when inserting an SVG', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imagesSVG.docx')
  );
  const thumbnail = {
    data: await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'sample.png')
    ),
    // extension: '.png', extension is not given
  };

  const opts = {
    template,
    data: {},
    additionalJsContext: {
      svgImgFile: async () => {
        const data = await fs.promises.readFile(
          path.join(__dirname, 'fixtures', 'sample.svg')
        );
        return {
          width: 6,
          height: 6,
          data,
          extension: '.svg',
          thumbnail,
        };
      },
      svgImgStr: () => {
        const data = Buffer.from(
          `<svg  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                                  <rect x="10" y="10" height="100" width="100" style="stroke:#ff0000; fill: #0000ff"/>
                              </svg>`,
          'utf-8'
        );
        return {
          width: 6,
          height: 6,
          data,
          extension: '.svg',
          thumbnail,
        };
      },
    },
  };

  return expect(createReport(opts)).rejects.toMatchSnapshot();
});

it('003: can inject an svg without a thumbnail', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imagesSVG.docx')
  );

  const opts = {
    template,
    data: {},
    additionalJsContext: {
      svgImgFile: async () => {
        const data = await fs.promises.readFile(
          path.join(__dirname, 'fixtures', 'sample.svg')
        );
        return {
          width: 6,
          height: 6,
          data,
          extension: '.svg',
        };
      },
      svgImgStr: () => {
        const data = Buffer.from(
          `<svg  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                                  <rect x="10" y="10" height="100" width="100" style="stroke:#ff0000; fill: #0000ff"/>
                              </svg>`,
          'utf-8'
        );
        return {
          width: 6,
          height: 6,
          data,
          extension: '.svg',
        };
      },
    },
  };
  const result = await createReport(opts, 'JS');
  expect(result).toMatchSnapshot();
});

it('004: can inject an image in the document header (regression test for #113)', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imageHeader.docx')
  );

  const opts = {
    template,
    data: {},
    additionalJsContext: {
      image: async () => {
        const data = await fs.promises.readFile(
          path.join(__dirname, 'fixtures', 'sample.png')
        );
        return {
          width: 6,
          height: 6,
          data,
          extension: '.png',
        };
      },
    },
  };

  // NOTE: bug does not happen when using debug probe arguments ('JS' or 'XML'),
  // as these exit before the headers are parsed.
  // TODO: build a snapshot test once _probe === 'XML' properly includes all document XMLs, not just
  // the main document
  expect(await createReport(opts)).toBeInstanceOf(Uint8Array);
});

it('005: can inject PNG files using ArrayBuffers without errors (related to issue #166)', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imageSimple.docx')
  );

  const buff = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'sample.png')
  );

  function toArrayBuffer(buf: Buffer): ArrayBuffer {
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
      view[i] = buf[i];
    }
    return ab;
  }

  const fromAB = await createReport({
    template,
    data: {},
    additionalJsContext: {
      injectImg: () => {
        return {
          width: 6,
          height: 6,
          data: toArrayBuffer(buff),
          extension: '.png',
        };
      },
    },
  });

  const fromB = await createReport({
    template,
    data: {},
    additionalJsContext: {
      injectImg: () => {
        return {
          width: 6,
          height: 6,
          data: buff,
          extension: '.png',
        };
      },
    },
  });
  expect(fromAB).toBeInstanceOf(Uint8Array);
  expect(fromB).toBeInstanceOf(Uint8Array);
  expect(fromAB).toStrictEqual(fromB);
});

it('006: can inject an image from the data instead of the additionalJsContext', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imageSimple.docx')
  );
  const buff = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'sample.png')
  );
  const reportA = await createReport({
    template,
    data: {
      injectImg: () => ({
        width: 6,
        height: 6,
        data: buff,
        extension: '.png',
      }),
    },
  });
  const reportB = await createReport({
    template,
    data: {},
    additionalJsContext: {
      injectImg: () => ({
        width: 6,
        height: 6,
        data: buff,
        extension: '.png',
      }),
    },
  });
  expect(reportA).toBeInstanceOf(Uint8Array);
  expect(reportB).toBeInstanceOf(Uint8Array);
  expect(reportA).toStrictEqual(reportB);

  // Ensure only one 'media' element (the image data as a png file) is added to the final docx file.
  // Regression test for #218
  const zip = await JSZip.loadAsync(reportA);
  expect(Object.keys(zip?.files ?? {})).toMatchInlineSnapshot(`
    [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/theme/theme1.xml",
      "word/settings.xml",
      "word/fontTable.xml",
      "word/webSettings.xml",
      "docProps/app.xml",
      "docProps/core.xml",
      "word/styles.xml",
      "word/",
      "word/media/",
      "word/media/template_document.xml_img1.png",
      "word/_rels/",
    ]
  `);
});

it('007: can inject an image in a document that already contains images (regression test for #144)', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imageExisting.docx')
  );
  const buff = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'sample.png')
  );
  expect(
    await createReport(
      {
        template,
        data: {
          cv: { ProfilePicture: { url: 'abc' } },
        },
        additionalJsContext: {
          getImage: () => ({
            width: 6,
            height: 6,
            data: buff,
            extension: '.png',
          }),
        },
      },
      'XML'
    )
  ).toMatchSnapshot();
});

it('008: can inject an image in a shape in the doc footer (regression test for #217)', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imageInShapeInFooter.docx')
  );
  const thumbnail_data = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'sample.png')
  );

  const report = await createReport(
    {
      template,
      data: {},
      additionalJsContext: {
        injectSvg: () => {
          const svg_data = Buffer.from(
            `<svg  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                                    <rect x="10" y="10" height="100" width="100" style="stroke:#ff0000; fill: #0000ff"/>
                                  </svg>`,
            'utf-8'
          );
          const thumbnail = {
            data: thumbnail_data,
            extension: '.png',
          };
          return {
            width: 6,
            height: 6,
            data: svg_data,
            extension: '.svg',
            thumbnail,
          };
        },
      },
    },
    'XML'
  );
  expect(report).toMatchSnapshot();
});

it('009 correctly rotate image', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imageRotation.docx')
  );
  const buff = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'sample.png')
  );
  const opts = {
    template,
    data: {},
    additionalJsContext: {
      getImage: (): ImagePars => ({
        width: 6,
        height: 6,
        data: buff,
        extension: '.png',
      }),
      getImage45: (): ImagePars => ({
        width: 6,
        height: 6,
        data: buff,
        extension: '.png',
        rotation: 45,
      }),
      getImage180: (): ImagePars => ({
        width: 6,
        height: 6,
        data: buff,
        extension: '.png',
        rotation: 180,
      }),
    },
  };
  expect(await createReport(opts, 'XML')).toMatchSnapshot();
});

it('010: can inject an image in a document that already contains images inserted during an earlier run by createReport (regression test for #259)', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imageMultiDelimiter.docx')
  );
  const buff = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'sample.png')
  );
  const reportA = await createReport({
    template,
    cmdDelimiter: '+++',
    data: {
      injectImg: () => ({
        width: 6,
        height: 6,
        data: buff,
        extension: '.png',
      }),
    },
  });

  expect(
    Object.keys((await JSZip.loadAsync(reportA))?.files ?? {}).filter(f =>
      f.includes('word/media')
    )
  ).toMatchInlineSnapshot(`
    [
      "word/media/",
      "word/media/template_document.xml_img1.png",
    ]
  `);

  const reportB = await createReport({
    template: reportA,
    cmdDelimiter: '---',
    data: {
      injectImg: () => ({
        width: 6,
        height: 6,
        data: buff,
        extension: '.png',
      }),
    },
  });

  expect(
    Object.keys((await JSZip.loadAsync(reportB))?.files ?? {}).filter(f =>
      f.includes('word/media')
    )
  ).toMatchInlineSnapshot(`
    [
      "word/media/",
      "word/media/template_document.xml_img1.png",
      "word/media/template_document.xml_img3.png",
    ]
  `);
});

it('011 correctly inserts the optional image caption', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'imageCaption.docx')
  );
  const buff = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'sample.png')
  );
  const opts = {
    template,
    data: {},
    additionalJsContext: {
      injectImg: (caption: boolean) => {
        return {
          width: 6,
          height: 6,
          data: buff,
          extension: '.png',
          caption: caption ? 'The image caption!' : undefined,
        };
      },
    },
  };
  expect(await createReport(opts, 'XML')).toMatchSnapshot();
});

it('can inject image in document that already contained image with same extension but uppercase', async () => {
  const template = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'existingUppercaseJPEGExtension.docx')
  );
  const buff = await fs.promises.readFile(
    path.join(__dirname, 'fixtures', 'sample.jpg')
  );

  const report = await createReport({
    template,
    cmdDelimiter: '+++',
    data: {
      injectImg: () => ({
        width: 6,
        height: 6,
        data: buff,
        extension: '.jpg',
      }),
    },
  });

  const jsZip = await JSZip.loadAsync(report);

  const contentType = await jsZip.file('[Content_Types].xml')?.async('string');

  expect(contentType).toBeDefined();
  expect(contentType).toMatchSnapshot();

  // For easy testing purpose
  // fs.writeFileSync('output.docx', report);
});

describe('012: Sequential vs Concurrent image processing', () => {
  const IMAGE_COUNT = 20;
  const IMAGE_DELAY_MS = 100;

  type ImageData = { width: number; height: number; data: Buffer };
  const imageCache: Map<string, ImageData> = new Map();

  async function loadBaseImage(filename: string): Promise<ImageData> {
    const cached = imageCache.get(filename);
    if (cached) return cached;

    const imagePath = path.join(__dirname, 'fixtures', filename);
    const imageBuffer = await fs.promises.readFile(imagePath);

    return new Promise((resolve, reject) => {
      new PNG().parse(imageBuffer, (err, png) => {
        if (err) return reject(err);
        const imageData: ImageData = {
          width: png.width,
          height: png.height,
          data: Buffer.from(png.data),
        };
        imageCache.set(filename, imageData);
        resolve(imageData);
      });
    });
  }

  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  async function createVariantImage(
    index: number,
    totalImages: number,
    baseFilename: string = 'cube.png'
  ): Promise<Buffer> {
    const baseImageData = await loadBaseImage(baseFilename);

    const png = new PNG({
      width: baseImageData.width,
      height: baseImageData.height,
    });
    baseImageData.data.copy(png.data);

    const hue = (index * 360) / totalImages;
    const saturation = 0.7 + (index % 3) * 0.1;
    const lightness = 0.4 + (index % 5) * 0.05;
    const [r, g, b] = hslToRgb(hue % 360, saturation, lightness);

    const squareSize = Math.floor(Math.min(png.width, png.height) * 0.3);
    const startX = Math.floor((png.width - squareSize) / 2);
    const startY = Math.floor((png.height - squareSize) / 2);

    for (let y = startY; y < startY + squareSize; y++) {
      for (let x = startX; x < startX + squareSize; x++) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      }
    }

    return PNG.sync.write(png);
  }

  it('produces identical output for sequential and concurrent processing', async () => {
    const template = await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'stress_test_template.docx')
    );

    const baseFilename = 'cube.png';
    await loadBaseImage(baseFilename);

    const images = Array.from({ length: IMAGE_COUNT }, (_, i) => i);
    const data = { images };

    const createGetImageFn = () => async (index: number) => {
      await new Promise(resolve => setTimeout(resolve, IMAGE_DELAY_MS));
      const imageBuffer = await createVariantImage(
        index,
        IMAGE_COUNT,
        baseFilename
      );
      return {
        width: 6,
        height: 6,
        data: imageBuffer,
        extension: '.png' as const,
      };
    };

    // Sequential execution
    const sequentialReport = await createReport({
      template,
      data,
      additionalJsContext: { getImage: createGetImageFn() },
      cmdDelimiter: ['{{', '}}'],
    });

    // Concurrent execution (imageConcurrency: 5 means process 5 at a time)
    const concurrentReport = await createReport({
      template,
      data,
      additionalJsContext: { getImage: createGetImageFn() },
      cmdDelimiter: ['{{', '}}'],
      imageConcurrency: 5,
    });

    // Both should produce valid output
    expect(sequentialReport).toBeInstanceOf(Uint8Array);
    expect(concurrentReport).toBeInstanceOf(Uint8Array);

    // Extract and compare document.xml from both
    const sequentialZip = await JSZip.loadAsync(sequentialReport);
    const concurrentZip = await JSZip.loadAsync(concurrentReport);

    const sequentialDoc = await sequentialZip
      .file('word/document.xml')
      ?.async('string');
    const concurrentDoc = await concurrentZip
      .file('word/document.xml')
      ?.async('string');

    // The document XML should be identical
    expect(sequentialDoc).toBeDefined();
    expect(concurrentDoc).toBeDefined();
    expect(sequentialDoc).toEqual(concurrentDoc);

    // Snapshot the document.xml
    expect(sequentialDoc).toMatchSnapshot('document.xml');

    // Verify media files count
    const sequentialMediaFiles = Object.keys(sequentialZip.files).filter(f =>
      f.startsWith('word/media/')
    );
    const concurrentMediaFiles = Object.keys(concurrentZip.files).filter(f =>
      f.startsWith('word/media/')
    );

    expect(sequentialMediaFiles.length).toBe(concurrentMediaFiles.length);
    expect(sequentialMediaFiles.length).toBeGreaterThanOrEqual(IMAGE_COUNT);

    // Snapshot the media files structure
    expect(sequentialMediaFiles.sort()).toMatchSnapshot('media-files');
  }, 120000);

  it('concurrent processing is faster than sequential', async () => {
    const template = await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'stress_test_template.docx')
    );

    const baseFilename = 'cube.png';
    await loadBaseImage(baseFilename);

    const images = Array.from({ length: IMAGE_COUNT }, (_, i) => i);
    const data = { images };

    const createGetImageFn = () => async (index: number) => {
      await new Promise(resolve => setTimeout(resolve, IMAGE_DELAY_MS));
      const imageBuffer = await createVariantImage(
        index,
        IMAGE_COUNT,
        baseFilename
      );
      return {
        width: 6,
        height: 6,
        data: imageBuffer,
        extension: '.png' as const,
      };
    };

    // Sequential execution
    const sequentialStart = Date.now();
    await createReport({
      template,
      data,
      additionalJsContext: { getImage: createGetImageFn() },
      cmdDelimiter: ['{{', '}}'],
    });
    const sequentialTime = Date.now() - sequentialStart;

    // Concurrent execution (imageConcurrency: 5 means process 5 at a time)
    const concurrentStart = Date.now();
    await createReport({
      template,
      data,
      additionalJsContext: { getImage: createGetImageFn() },
      cmdDelimiter: ['{{', '}}'],
      imageConcurrency: 5,
    });
    const concurrentTime = Date.now() - concurrentStart;

    // Concurrent should be faster than sequential
    expect(concurrentTime).toBeLessThan(sequentialTime);
  }, 60000);
});

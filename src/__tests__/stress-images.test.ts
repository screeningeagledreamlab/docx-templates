/* eslint-env jest */

/**
 * Stress test for generating a docx with 4000 unique images.
 * Run separately with: yarn test:stress
 */

import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { createReport } from '../index';
import { setDebugLogSink } from '../debug';

if (process.env.DEBUG) setDebugLogSink(console.log);

const IMAGE_COUNT = 4000;

/**
 * Convert HSL to RGB
 * h: 0-360, s: 0-1, l: 0-1
 * Returns [r, g, b] each 0-255
 */
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
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/**
 * Creates a simple unique PNG image buffer.
 * Each image has a unique color based on the index using HSL color space
 * for better visual distinction across all 4000 images.
 */
function createUniquePng(index: number, totalImages: number): Buffer {
  // Use HSL color space for better distribution of visually distinct colors
  // Vary hue across the full spectrum, with slight variations in saturation and lightness
  const hue = (index * 360) / totalImages; // Spread hues across full spectrum
  const saturation = 0.7 + (index % 3) * 0.1; // 0.7, 0.8, or 0.9
  const lightness = 0.4 + (index % 5) * 0.05; // 0.4 to 0.6

  const [r, g, b] = hslToRgb(hue % 360, saturation, lightness);

  // Create a minimal 1x1 PNG with the unique color
  // PNG structure: signature + IHDR + IDAT + IEND
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  // IHDR chunk (image header) - 1x1 pixel, 8-bit RGB
  const ihdrData = Buffer.from([
    0x00,
    0x00,
    0x00,
    0x01, // width: 1
    0x00,
    0x00,
    0x00,
    0x01, // height: 1
    0x08, // bit depth: 8
    0x02, // color type: RGB
    0x00, // compression: deflate
    0x00, // filter: adaptive
    0x00, // interlace: none
  ]);
  const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdr = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]), // length: 13
    Buffer.from('IHDR'),
    ihdrData,
    ihdrCrc,
  ]);

  // IDAT chunk (image data) - raw deflate of filter byte + RGB pixel
  // Using uncompressed deflate block for simplicity
  const rawPixel = Buffer.from([0x00, r, g, b]); // filter byte (0=none) + RGB
  const idatData = createUncompressedDeflate(rawPixel);
  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), idatData]));
  const idatLength = Buffer.alloc(4);
  idatLength.writeUInt32BE(idatData.length, 0);
  const idat = Buffer.concat([
    idatLength,
    Buffer.from('IDAT'),
    idatData,
    idatCrc,
  ]);

  // IEND chunk (image end)
  const iendCrc = crc32(Buffer.from('IEND'));
  const iend = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // length: 0
    Buffer.from('IEND'),
    iendCrc,
  ]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Creates an uncompressed deflate stream (zlib format)
 */
function createUncompressedDeflate(data: Buffer): Buffer {
  // Zlib header: CMF=0x78 (deflate, 32K window), FLG=0x01 (no dict, level 0)
  const header = Buffer.from([0x78, 0x01]);

  // Uncompressed deflate block
  const len = data.length;
  const nlen = len ^ 0xffff;
  const block = Buffer.concat([
    Buffer.from([0x01]), // BFINAL=1, BTYPE=00 (uncompressed)
    Buffer.from([len & 0xff, (len >> 8) & 0xff]),
    Buffer.from([nlen & 0xff, (nlen >> 8) & 0xff]),
    data,
  ]);

  // Adler-32 checksum
  const adler = adler32(data);

  return Buffer.concat([header, block, adler]);
}

/**
 * Compute Adler-32 checksum
 */
function adler32(data: Buffer): Buffer {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const result = Buffer.alloc(4);
  result.writeUInt32BE((b << 16) | a, 0);
  return result;
}

/**
 * CRC32 lookup table
 */
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

/**
 * Compute CRC32 checksum
 */
function crc32(data: Buffer): Buffer {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const result = Buffer.alloc(4);
  result.writeUInt32BE(crc, 0);
  return result;
}

/**
 * Creates a docx template with a FOR loop that inserts images
 */
async function createImageLoopTemplate(): Promise<Buffer> {
  const zip = new JSZip();

  // [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  // _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // word/_rels/document.xml.rels
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
  );

  // word/document.xml - Template with FOR loop and IMAGE command
  // Use $img.image directly - the image data is embedded in each item
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p><w:r><w:t>+++FOR img IN images+++</w:t></w:r></w:p>
    <w:p><w:r><w:t>+++IMAGE $img.image+++</w:t></w:r></w:p>
    <w:p><w:r><w:t>+++END-FOR img+++</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Stress test: 4000 images', () => {
  // Increase timeout for this large test
  jest.setTimeout(300000); // 5 minutes

  it('generates a docx with 4000 unique images', async () => {
    console.log(`Starting stress test with ${IMAGE_COUNT} images...`);
    const startTime = Date.now();

    // Create the template
    console.log('Creating template...');
    const template = await createImageLoopTemplate();

    // Pre-generate all unique images and embed them directly in the data
    console.log('Pre-generating unique images...');
    const imageGenerationStart = Date.now();
    const images = Array.from({ length: IMAGE_COUNT }, (_, i) => ({
      index: i,
      image: {
        width: 2,
        height: 2,
        data: createUniquePng(i, IMAGE_COUNT),
        extension: '.png' as const,
      },
    }));
    console.log(`Image generation took ${Date.now() - imageGenerationStart}ms`);

    // Create data with array containing image objects
    const data = { images };

    // Create report
    console.log('Creating report...');
    const reportStart = Date.now();
    const report = await createReport({
      template,
      data,
    });
    console.log(`Report generation took ${Date.now() - reportStart}ms`);

    // Verify the output
    expect(report).toBeInstanceOf(Uint8Array);

    // Check the generated file contains all images
    const outputZip = await JSZip.loadAsync(report);
    const mediaFiles = Object.keys(outputZip.files).filter(f =>
      f.startsWith('word/media/')
    );

    console.log(`Generated ${mediaFiles.length} media files`);
    console.log(`Total time: ${Date.now() - startTime}ms`);

    // We expect IMAGE_COUNT images (each unique)
    // Note: The actual count may vary based on how docx-templates handles duplicates
    expect(mediaFiles.length).toBeGreaterThanOrEqual(IMAGE_COUNT);

    // Optionally write output for manual inspection
    if (process.env.WRITE_OUTPUT) {
      const outputPath = path.join(
        __dirname,
        'fixtures',
        'stress-test-output.docx'
      );
      fs.writeFileSync(outputPath, report);
      console.log(`Output written to ${outputPath}`);
    }
  });
});

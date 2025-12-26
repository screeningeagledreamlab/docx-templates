/* eslint-env jest */

/**
 * Stress test for generating a docx with unique images.
 * Compares sequential vs concurrent image processing.
 * Run separately with: yarn test:stress
 */

import path from 'path';
import fs from 'fs';
import { PNG } from 'pngjs';
import { createReport } from '../index';
import { setDebugLogSink } from '../debug';

if (process.env.DEBUG) setDebugLogSink(console.log);

const IMAGE_COUNT = 20;
const IMAGE_DELAY_MS = 100;

let cachedCubeData: { width: number; height: number; data: Buffer } | null =
  null;

async function loadCubeImage(): Promise<{
  width: number;
  height: number;
  data: Buffer;
}> {
  if (cachedCubeData) return cachedCubeData;

  const cubePath = path.join(__dirname, 'fixtures', 'cube.png');
  const cubeBuffer = await fs.promises.readFile(cubePath);

  return new Promise((resolve, reject) => {
    new PNG().parse(cubeBuffer, (err, png) => {
      if (err) return reject(err);
      cachedCubeData = {
        width: png.width,
        height: png.height,
        data: Buffer.from(png.data),
      };
      resolve(cachedCubeData);
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

async function createUniqueImage(
  index: number,
  totalImages: number
): Promise<Buffer> {
  const cubeData = await loadCubeImage();

  const png = new PNG({ width: cubeData.width, height: cubeData.height });
  cubeData.data.copy(png.data);

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

describe('Stress test: Sequential vs Concurrent image processing', () => {
  jest.setTimeout(300000);

  it(`compares sequential vs concurrent processing with ${IMAGE_COUNT} images`, async () => {
    const templatePath = path.join(
      __dirname,
      'fixtures',
      'stress_test_template.docx'
    );
    const template = await fs.promises.readFile(templatePath);

    await loadCubeImage();

    const images = Array.from({ length: IMAGE_COUNT }, (_, i) => i);
    const data = { images };

    const createGetImageFn = () => async (index: number) => {
      await new Promise(resolve => setTimeout(resolve, IMAGE_DELAY_MS));
      const imageBuffer = await createUniqueImage(index, IMAGE_COUNT);
      return {
        width: 6,
        height: 6,
        data: imageBuffer,
        extension: '.png' as const,
      };
    };

    // Sequential execution
    const sequentialStart = Date.now();
    const sequentialReport = await createReport({
      template,
      data,
      additionalJsContext: { getImage: createGetImageFn() },
      cmdDelimiter: ['{{', '}}'],
    });
    const sequentialTime = Date.now() - sequentialStart;

    // Concurrent execution
    const concurrentStart = Date.now();
    const concurrentReport = await createReport({
      template,
      data,
      additionalJsContext: { getImage: createGetImageFn() },
      cmdDelimiter: ['{{', '}}'],
      imageConcurrency: 5,
    });
    const concurrentTime = Date.now() - concurrentStart;

    expect(sequentialReport).toBeInstanceOf(Uint8Array);
    expect(concurrentReport).toBeInstanceOf(Uint8Array);

    const JSZip = (await import('jszip')).default;

    const sequentialZip = await JSZip.loadAsync(sequentialReport);
    const sequentialMediaFiles = Object.keys(sequentialZip.files).filter(f =>
      f.startsWith('word/media/')
    );

    const concurrentZip = await JSZip.loadAsync(concurrentReport);
    const concurrentMediaFiles = Object.keys(concurrentZip.files).filter(f =>
      f.startsWith('word/media/')
    );

    expect(sequentialMediaFiles.length).toBeGreaterThanOrEqual(IMAGE_COUNT);
    expect(concurrentMediaFiles.length).toBeGreaterThanOrEqual(IMAGE_COUNT);
    expect(concurrentTime).toBeLessThan(sequentialTime);
  });
});

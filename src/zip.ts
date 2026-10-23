import JSZip from 'jszip';
import { lazyFileStream } from './diskSinks';

const zipLoad = (inputFile: ArrayBuffer) => JSZip.loadAsync(inputFile);
const zipGetText = (zip: JSZip, filename: string) => {
  const file_in_zip = zip.file(filename);
  if (!file_in_zip) return null;
  return file_in_zip.async('text');
};

const zipSetText = (zip: JSZip, filename: string, data: ArrayBuffer) =>
  zip.file(filename, data, { binary: false });

const zipSave = (zip: JSZip, compressionLevel: number) =>
  zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

/**
 * Add an entry whose content is read lazily from disk at generate time.
 *
 * `binary: true` is required: the spooled file already holds encoded bytes, so
 * JSZip must treat it as pre-encoded rather than re-encoding it.
 */
const zipSetStream = (zip: JSZip, filename: string, filePath: string) => {
  zip.file(filename, lazyFileStream(filePath), { binary: true });
};

// ==========================================
// Public API
// ==========================================
export { zipLoad, zipGetText, zipSetText, zipSave, zipSetStream };

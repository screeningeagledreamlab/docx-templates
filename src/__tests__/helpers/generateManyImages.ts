/**
 * Generates a report whose images total roughly `mbPerImage * <images served>`,
 * under whatever VIRTUAL-MEMORY ceiling the parent imposed via `ulimit -v`.
 *
 * Not `--max-old-space-size`. That flag bounds only V8's JS heap, and the
 * memory this script is built to stress is not on it: image bytes live in
 * `Buffer`/`ArrayBuffer`, whose backing stores come from the embedder's
 * ArrayBuffer allocator (plain malloc), entirely outside the old space.
 * Empirically, 500MB per image x 5 images under `--max-old-space-size=16`
 * still completed in the in-memory mode -- the flag never engages, so it
 * cannot discriminate the two modes at any setting. `ulimit -v` bounds the
 * whole address space and does. See the header of diskOutput.perf.test.ts.
 *
 * This file is compiled with `tsc` and executed directly with `node` by
 * `diskOutput.perf.test.ts` -- it is never imported from TypeScript, so it
 * carries no exports (see .eslintrc's import/no-unused-modules).
 *
 * Usage: ( ulimit -v N; node generateManyImages.js <mode> <mbPerImage> [outPath] )
 *   mode: 'memory' | 'disk'
 */
import path from 'path';
import fs from 'fs';
import { createReport } from '../../index';

async function main() {
  const [mode, mbRaw, outPath] = process.argv.slice(2);
  const mbPerImage = Number(mbRaw);
  // Resolved from process.cwd() (the repo root, set by the test runner)
  // rather than __dirname: this file is compiled to a scratch directory
  // outside src/ that does not carry the (binary, non-.ts) fixtures along
  // with it.
  const fixtures = path.join(process.cwd(), 'src', '__tests__', 'fixtures');
  const template = await fs.promises.readFile(
    path.join(fixtures, 'sandbox_loop_image_template.docx')
  );

  const items = [
    { name: 'apple' },
    { name: 'banana' },
    { name: 'cherry' },
    { name: 'date' },
    { name: 'elderberry' },
  ];
  const rows = [0, 1, 2];

  let served = 0;
  // A fresh buffer per call with distinct bytes: nothing can be deduplicated,
  // and each one must be independently resident (memory mode) or
  // independently spooled (disk mode).
  const getImage = (_itemName: string) => {
    const data = Buffer.alloc(mbPerImage * 1024 * 1024, served % 256);
    served += 1;
    return { width: 2, height: 2, data, extension: '.png' as const };
  };

  const opts: Record<string, unknown> = {
    template,
    data: { items, rows },
    additionalJsContext: { getImage },
    cmdDelimiter: ['{{', '}}'],
  };
  if (mode === 'disk') opts.outputPath = outPath;

  const t0 = Date.now();
  await createReport(opts as never);
  process.stdout.write(JSON.stringify({ ms: Date.now() - t0, images: served }));
}

main().catch(e => {
  process.stderr.write(String(e && e.stack ? e.stack : e));
  process.exit(1);
});

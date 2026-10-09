/* eslint-env jest */

// TEMP / SCRATCH — probe written while reviewing
// docs-local/bugs/parallel-image-snapshot-memory.md. Delete with the rest of
// the zz_* files once the review is closed out.
//
// Shows that parallel IMAGE mode already shares objects reached through `data`
// across deferred evaluations, exactly as documented at src/types.ts:179-188
// ("treat `data` and everything reachable from it as read-only"). The
// "object-deep per-iteration snapshot" only ever applied to values that did
// NOT come from data, which is the premise the memory proposal is weighed
// against.
//
// Template (data_obj_mutation_image_template.docx):
//   {{! cfg.index = -1; }}
//   {{FOR row in rows}}
//     {{! cfg.index = $row; }}
//     {{IMAGE getImage(cfg.index)}}
//   {{END-FOR row}}
//
// `cfg` is a top-level data key, so it is spread live into every frozen
// sandbox (processTemplate.ts, `...data`) and never cloned. All three deferred
// evaluations therefore read the final iteration's value.

import path from 'path';
import fs from 'fs';
import { createReport } from '../index';

describe('parallel IMAGE: objects from `data` are shared, not snapshotted', () => {
  const samplePng = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'sample.png')
  );

  let template: Buffer;
  beforeAll(async () => {
    template = await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'data_obj_mutation_image_template.docx')
    );
  });

  const run = async (
    imageConcurrency: number | undefined,
    noSandbox: boolean
  ) => {
    const received: number[] = [];
    await createReport({
      template,
      noSandbox,
      data: { rows: [0, 1, 2], cfg: { index: -1 } },
      additionalJsContext: {
        getImage: (index: number) => {
          received.push(index);
          return {
            width: 2,
            height: 2,
            data: samplePng,
            extension: '.png' as const,
          };
        },
      },
      cmdDelimiter: ['{{', '}}'] as [string, string],
      ...(imageConcurrency != null ? { imageConcurrency } : {}),
    });
    return received;
  };

  ['sandbox', 'noSandbox'].forEach(mode => {
    const noSandbox = mode === 'noSandbox';

    it(`${mode}: inline mode sees per-iteration state`, async () => {
      expect(await run(undefined, noSandbox)).toEqual([0, 1, 2]);
    });

    it(`${mode}: parallel mode sees the final iteration's state`, async () => {
      // Documented behaviour, not a regression: `cfg` comes from `data`.
      expect(await run(5, noSandbox)).toEqual([2, 2, 2]);
    });
  });
});

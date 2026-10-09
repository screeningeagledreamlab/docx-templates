/* eslint-env jest */

// TEMP / SCRATCH — probe written while reviewing
// docs-local/bugs/parallel-image-snapshot-memory.md. Delete with the rest of
// the zz_* files once the review is closed out.
//
// Guards the aliasing case that the memory proposal breaks when the
// shared-by-reference check is applied only to top-level snapshot entries.
//
// Template (alias_mixed_image_template.docx):
//   {{! $list = rows; }}
//   {{FOR row in rows}}
//     {{! $wrap = { head: $list[0] }; }}
//     {{IMAGE getImage($list, $wrap.head)}}
//   {{END-FOR row}}
//
// `$list` is data-reachable; `$wrap` is an EXEC-built container whose `head`
// is also data-reachable. A top-level-only check shares `$list` but still
// deep-clones `$wrap`, so `$wrap.head` stops being an element of `$list` and
// indexOf returns -1. Threading the shared set through cloneVal's recursion
// (and registering the identity in the `seen` map) keeps them aliased.
//
// The existing test at images.test.ts "parallel mode preserves aliasing
// between two sandbox values" does NOT cover this: both of its values are
// data-reachable, so they stay aliased either way.

import path from 'path';
import fs from 'fs';
import { createReport } from '../index';

describe('parallel IMAGE: aliasing across the data/EXEC boundary', () => {
  const samplePng = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'sample.png')
  );

  let template: Buffer;
  beforeAll(async () => {
    template = await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'alias_mixed_image_template.docx')
    );
  });

  const run = async (imageConcurrency?: number) => {
    const found: number[] = [];
    await createReport({
      template,
      noSandbox: false,
      data: { rows: [{ sku: 'A1' }, { sku: 'B2' }, { sku: 'C3' }] },
      additionalJsContext: {
        getImage: (list: any[], head: any) => {
          found.push(list.indexOf(head));
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
    return found;
  };

  it('inline mode keeps $wrap.head an element of $list', async () => {
    expect(await run()).toEqual([0, 0, 0]);
  });

  it('parallel mode keeps $wrap.head an element of $list', async () => {
    expect(await run(4)).toEqual([0, 0, 0]);
  });
});

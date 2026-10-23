# Problem: Peak Memory Is Bounded by Image Count

## Context

Target workload (from `docs/performance-optimization-notes.md`): ~8000 images,
1700 pages, AWS Lambda at 3GB. The parallel image work (SE-16507) fixed
*throughput*. It did not change *peak memory*, which is still proportional to
the number of images in the report.

## Where the memory goes today

Four terms are simultaneously live at the moment `zipSave` returns
(`main.ts:344`):

| Term | Est. @ 8000 img / 1700 pages | Scales with |
|---|---|---|
| Output XML node tree (`report1`) | 150-250 MB | pages |
| Raw image bytes: `ctx.images` handed to JSZip (`main.ts:533`) | **~400 MB** | **images** |
| `buildXml` result Buffer + recursive `Buffer.concat` garbage (`xml.ts:68-98`) | 40-80 MB | pages |
| `generateAsync({type:'uint8array'})` - the entire .docx in RAM | **~400 MB** | **images** |

Peak lands around **1.0-1.1 GB**.

Note that `delete images[imageId]` (`main.ts:547`) frees nothing. It drops our
reference only; JSZip holds the bytes from that point until `generateAsync`
completes.

## Why both halves must ship together

The two image-scaled terms are coupled. Fixing either alone is close to a no-op:

- Spool images to disk but keep `generateAsync` -> JSZip reads every temp file
  back and the output `Uint8Array` still holds all of it. Peak barely moves.
- Stream the output but keep images in memory -> the ~400 MB of raw image bytes
  is still resident for the whole generate.

So this is **one feature, not two options**.

## Expected outcome

| Term | Before | After |
|---|---|---|
| Output XML node tree | 150-250 MB | unchanged |
| Image bytes | ~400 MB | `imageConcurrency` x avg ~= 10 MB |
| `buildXml` Buffer + concat churn | 40-80 MB | ~0 (streamed) |
| Output .docx | ~400 MB | ~0 (streamed) |
| **Peak** | **~1.0-1.1 GB** | **~150-250 MB** |

The important structural change is not the ratio. It is that **the image-count
axis disappears entirely** - 8000 images costs the same as 80. What remains
scales with page count only.

## Answers to the originating questions

1. **Feasible?** Yes, with no new dependency. JSZip 3.10.1 already ships both
   halves: `NodejsStreamInputAdapter` (stream input to `zip.file()`) and
   `generateNodeStream()` (`object.js:376`). The current `generateAsync` routes
   through `StreamHelper.accumulate()`, which is the function materialising the
   400 MB output.
2. **Major changes?** A new `outputPath` option, a work-dir lifecycle, and
   three sinks rewired (images, `buildXml`, zip output). See `02-design.md`.
3. **Effective on peak?** Yes - it removes the two largest terms, and they are
   the only two that scale with image count. Not a wash.
4. **Time cost?** ~1-2%. Spooling and re-reading ~400 MB on local disk is 2-4 s
   against a 4-minute baseline. No extra compression work is introduced;
   `generateNodeStream` does the same sequential DEFLATE, it just does not
   retain the result.

## Out of scope

- **The XML node tree** (150-250 MB, now the dominant term). Reducing it needs
  streaming template evaluation, which is a fundamentally larger redesign.
- **Browser.** Explicitly excluded. See `04-risks-and-testing.md` for how the
  browser bundle is kept clean.
- **Media compression method (STORE vs DEFLATE).** Orthogonal to storage
  location, applies to both routes, and changing it would blunt the equivalence
  test. Deferred to its own follow-up - see `02-design.md`.
- **Letting users return `data: { path }` from IMAGE functions.** Considered and
  dropped: in parallel mode in-flight bytes are already bounded at
  `imageConcurrency x avg` ~= 10 MB, which does not justify a public API
  extension.

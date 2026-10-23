# Design: Disk-Backed Output

## Approach

**Keep JSZip. Rewire three sinks to disk.** No new dependency, and JSZip's
existing handling of every untouched template entry (theme, fonts, docProps,
embedded objects) keeps working for free.

### Rejected alternatives

**Swap the writer to `yazl`/`archiver`.** Purpose-built streaming zip with
better-tested backpressure, but we would have to copy every unchanged template
entry ourselves: decompress out of JSZip, re-deflate into yazl. More CPU, a new
dependency, a much larger diff - and JSZip is still needed to *read* the
template. Revisit only if JSZip streaming proves unreliable under load.

**Lazy per-image `Readable` that fetches from source on first read.** Zero disk
*and* zero memory, and it looks like the elegant answer. It is a trap: JSZip
generates entries strictly sequentially, so the fetches would serialise - 8000
back-to-back downloads, undoing SE-16507 entirely. It optimises the resource we
have spare and destroys the one we are short of.

## Public API

Opt-in is **the presence of `outputPath`**. No separate boolean: a flag and a
path can contradict each other, and a flag expresses nothing the path does not.

```ts
type UserOptions = {
  // ...existing
  /** Write the report here instead of returning it in memory. Enables disk-backed mode. */
  outputPath?: string;
  /** Root for the library's scratch files. Default: os.tmpdir()/docx-templates */
  workDir?: string;
};

type ReportFileResult = { path: string; bytes: number };
```

Overload ordering in `main.ts` gives callers the right return type with no casts
and no breaking change:

```ts
async function createReport(o: UserOptions & { outputPath: string }): Promise<ReportFileResult>;
async function createReport(o: UserOptions): Promise<Uint8Array>;   // unchanged
```

The `_probe: 'JS' | 'XML'` overloads are untouched - they return at
`main.ts:246` / `:250`, before any sink exists.

## Work-dir lifecycle

Each call gets `<root>/<runId>/` containing `media/` and `xml/`, with `runId`
from `randomBytes(8).toString('hex')`. The per-run directory is the unit of
cleanup, which makes concurrent `createReport` calls safe against a shared root.
This matters: it is a general-purpose library, and two requests may generate at
once.

| Path | Created by | Deleted by |
|---|---|---|
| `outputPath` | library | **caller** (library removes only a partial file on failure) |
| `<workDir>` root | caller, or implied `os.tmpdir()/docx-templates` | **never** - may be the caller's own dir, and is shared across concurrent runs |
| `<workDir>/<runId>/` | library | **library, always**, in a `finally` |

The rule: we clean up what we created, except the report.

### Decisions

- **If `outputPath`'s parent directory does not exist, throw.** Creating
  directories the caller never named is surprising for a library.
- **`workDir` root is created if missing** (`recursive: true`). Unlike
  `outputPath` it is ours by contract, and the `os.tmpdir()` default will not
  exist on first run.
- **`workDir` is inert without `outputPath`.** It configures the disk-backed
  mode's scratch root; in in-memory mode nothing is written, so it is ignored
  rather than validated or created.
- **No Lambda-specific branches.** `/tmp` sizing is an ops concern and is
  documented, not special-cased. Spooling ~400 MB needs ephemeral storage above
  Lambda's 512 MB default.

## Sink 1: images

The public `Image` type (`types.ts:298`) is what users' IMAGE functions return
and **does not change**. Only the internal store gains a variant:

```ts
type SpooledImage = { extension: ImageExtension; file: string };
type Images = { [id: string]: Image | SpooledImage };   // internal only
```

Spooling happens at the existing choke points - the `ctx.images[...] = imgData`
assignments in `applyImageData` (`processTemplate.ts:1300`, `:1328`) and
`imageToContext` (`:1113`) - all routed through one `storeImage(ctx, id, image)`.
Base64 input is decoded on the way to disk, shedding its 1.33x overhead as a
side effect.

`applyImageData` and `processImage` become `async`. Both call sites
(`processTemplate.ts:840` and inside `resolvePendingImages`) are already in
async scope. `main.ts:processImages` takes the stream branch when it sees a
`file` field.

## Sink 2: `buildXml`

The goal is to avoid two code paths that can drift apart. Extract a single
iterative emitter - explicit stack, no recursion, which also removes the
stack-depth ceiling on deeply nested documents:

```ts
function* emitXml(node, options): Generator<string>
```

Both consumers become thin wrappers, and are **byte-identical by construction**:

- `buildXml(node, opts)` - joins the generator. Still an improvement on today's
  per-node `Buffer.concat`.
- `writeXml(node, opts, dest)` - batches into ~64 KB chunks and honours
  backpressure: `if (!ws.write(chunk)) await once(ws, 'drain')`.

Only `main.ts:249` (main document) and `:284` (secondaries) use `writeXml`. The
rels and `[Content_Types].xml` call sites (`:339`, `:549`, `:580`, `:622`) stay
on `buildXml` - they are kilobytes.

### This sink is not opt-in

Note the asymmetry: sinks 1 and 3 only activate when `outputPath` is set, but
rewriting `buildXml` on top of `emitXml` changes the **default, in-memory path
for every existing caller**. Output is byte-identical (same emitter, verified by
the equivalence test) and the new implementation is strictly better - it drops
the per-node `Buffer.concat` and removes the recursion depth limit. But it is a
change to code every current user already runs, so it carries more regression
risk than the opt-in sinks and the equivalence test must cover the in-memory
mode on its own, not only as a comparison baseline.

The alternative - leaving the recursive `buildXml` in place and writing a second
implementation for `writeXml` - is worse: two code paths that drift apart is
exactly the failure this design is structured to prevent.

Generator overhead is roughly 1.8M yields (~0.15 s at this document size), cheap
against the `Buffer.concat` churn it removes.

## Sink 3: zip output

```ts
await pipeline(
  zip.generateNodeStream({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level },
    streamFiles: false,
  }),
  fs.createWriteStream(outputPath)
);
return { path: outputPath, bytes: (await fs.stat(outputPath)).size };
```

`stream/promises.pipeline` is used for error propagation and stream destruction.

**`streamFiles: false` is deliberate.** `generate/index.js:40` pipes the
*compress* worker into `ZipFileWorker`, so its `contentBuffer` accumulates
**post-compression** bytes - one deflated entry at a time. A 40 MB
`document.xml` accumulates as ~3-5 MB. We therefore get streaming output without
`streamFiles: true`, and avoid emitting ZIP data descriptors (GP bit 3), which
some OOXML consumers handle poorly.

### Ordering constraint

Every spooled file must still exist on disk when `generateNodeStream` runs.
This is why cleanup lives in the outer `finally` and never inline, and why the
existing `delete images[imageId]` (`main.ts:547`) must **not** become an
`unlink`.

## Adjacent, behind its own flag

Media entries are already-compressed PNG/JPEG; DEFLATE-ing them is wasted CPU.
`zip.file(..., { compression: 'STORE' })` is a cheap win on generation time, but
it makes the `.docx` larger - an output change, not a memory change. It goes
behind its own `storeMedia?: boolean` (default `false`) rather than being folded
silently into this feature.

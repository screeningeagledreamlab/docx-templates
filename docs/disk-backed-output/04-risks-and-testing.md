# Risks, Error Handling, Testing

## Risk 1: file-descriptor exhaustion (highest)

The obvious implementation - `zip.file(path, fs.createReadStream(tmp))` per
image - **fails at the target scale.**

`NodejsStreamInputAdapter._bindStream` runs in the constructor, i.e. at
`zip.file()` time, and only calls `stream.pause()`. But a paused
`fs.createReadStream` has **already opened its fd**. Verified:

```
$ node -e "const s=require('fs').createReadStream('package.json'); s.pause();
           setTimeout(()=>console.log('fd:',s.fd),50)"
fd: 17
```

8000 images therefore means 8000 open fds before a single byte is written,
against a typical `ulimit -n` of 1024. Hard `EMFILE`.

**Mitigation:** `lazyFileStream(path)` - a `Readable` that opens its fd in
`_read()`, on first read. JSZip pulls entries strictly sequentially, so fd count
stays at ~1.

This is safe because `_bindStream` calls `pause()` *before* attaching the
`'data'` listener, and Node's `on('data')` only auto-resumes when
`readableFlowing !== false`. Our stream is never read until JSZip resumes it.

Covered by a dedicated test (below).

## Risk 2: output divergence between modes

Two XML code paths would inevitably drift. Mitigated structurally: `buildXml`
and `writeXml` are both thin consumers of the single `emitXml` generator, so
they are byte-identical by construction - and the equivalence test verifies it
rather than trusting it.

## Risk 3: browser bundle contamination

A top-level `import fs from 'fs'` in `main.ts` would pull Node's fs into
`lib/browser.js` and break it.

**Mitigation, belt and braces:**
1. `await import('./diskSinks')` guarded by `if (options.outputPath)` - the
   browser never executes it.
2. A Rollup alias mapping `./diskSinks` -> `./diskSinks.browser`, because a
   dynamic import alone can still be statically pulled in by some bundlers.
3. A CI assertion: grep `lib/browser.js` for `require('fs')` / `node:fs` and
   fail the build if present.

## Risk 4: encoding of stream entries

`zipSetText` currently passes a `Buffer` with `{ binary: false }`
(`zip.ts:10`). JSZip applies UTF-8 encoding to *string* inputs only, so this
works today - but the flag is misleading, and stream entries must not inherit
it.

Our spooled XML is already UTF-8 bytes on disk, so JSZip must treat the stream
as pre-encoded binary. `zipSetStream` therefore uses the binary path explicitly.

This is exactly the kind of difference the equivalence test exists to catch;
documents containing non-ASCII text (accents, CJK, smart quotes) must be present
in the fixture slice, or a double-encoding bug would pass unnoticed.

## Error handling

The disk-backed path sits inside one `try/finally` opened at runDir creation:

```
try {
  runDir = await makeRunDir(workDir)
  ...three sinks...
} finally {
  await cleanupRunDir(runDir)
}
```

Two rules:

- **Cleanup never masks the original error.** The `finally` body is itself
  wrapped; failures inside it go to `logger.debug` and are swallowed. A failed
  `rm` must not replace a `TemplateParseError`.
- **Partial output is removed on failure.** A truncated `.docx` is worse than no
  file, and we created it. This is `zipSaveToFile`'s job, not the `finally`'s:
  only it knows whether the output file was ever opened.

**Resolved during implementation - the `finally` does NOT destroy unconsumed
lazy streams.** This draft originally required a third rule ("on a mid-generation
failure JSZip holds an open fd for the entry it was on, with more queued"). That
turned out to be unreachable with the implementation we shipped, and the code
deliberately omits it (see the comment on the `finally` in `main.ts`):

- `streamFiles: false` makes JSZip drain and close each entry's source
  completely before it starts the next, so at most one source stream is ever
  live, and it is already closed by the time a later entry fails.
- A `lazyFileStream` that was never resumed has not opened its fd at all - the
  deferred open is the whole point of Risk 1's mitigation - so a queue of
  unconsumed streams holds no descriptors by construction.

Verified empirically: 40 entries, an error injected mid-archive, 0 fds leaked.

Existing template errors (`main.ts:227`, `:265`) fire before any sink exists and
are already covered by the `finally`.

## Test plan

Each claim this design makes gets a test that would fail if the claim were false.

### 1. Equivalence (load-bearing)

Must include fixtures with non-ASCII text, SVG images with thumbnails, headers
and footers (the secondary-XML path), and HTML (`altChunk`) entries.

Run a large slice of the existing `templating.test.ts` / `images.test.ts`
fixtures through **both** modes. Unzip each result and compare the entry list
and every entry's bytes.

Compare *unzipped entries*, not raw zip bytes - raw comparison is flaky across
entry ordering and timestamps. This is what turns "byte-identical by
construction" into a verified property.

### 2. File descriptors

Generate 2000+ images under a lowered `ulimit -n`. Fails loudly against a naive
`fs.createReadStream` implementation; passes with `lazyFileStream`. This is the
regression guard for Risk 1.

### 3. Lifecycle

- runDir removed after success
- runDir removed after failure
- caller-supplied `workDir` root **not** removed
- partial `outputPath` removed on failure
- two concurrent `createReport` calls do not collide

### 4. Peak memory (answers the originating Q3)

Run generation in a child process under a memory ceiling the in-memory mode
provably cannot fit under, and assert the disk-backed mode completes.

A pass/fail on "fits in X MB" is far more durable than asserting a `heapUsed`
number, which drifts across Node versions and GC timing.

**Measure RSS, not heap.** This draft specified `--max-old-space-size` for the
ceiling. That does not work here, and the finding generalises to anyone
benchmarking this feature: the memory this change is about is **off the V8
heap**. Image bytes live in `Buffer`/`ArrayBuffer`, whose backing stores are
allocated by the embedder's ArrayBuffer allocator (plain malloc), outside the
old space that `--max-old-space-size` bounds. Empirically, 500MB per image x 5
images under `--max-old-space-size=16` still completed in the in-memory mode:
the flag never engages, so it cannot discriminate the two modes at any setting.

Consequences:

- The shipped guard constrains the process's virtual address space with
  `ulimit -v` instead (see `diskOutput.perf.test.ts`). Its ceiling is
  architecture-sensitive - tuned on Linux/aarch64, and to be re-verified on x64
  before the suite is wired into CI, which is why `testPerf` is a separate
  script rather than part of `yarn test`.
- Any before/after measurement of this feature (including the acceptance gate
  below) must watch **peak RSS**, not `process.memoryUsage().heapUsed`. Heap
  numbers will show almost none of the improvement this change delivers.

### 5. Generation time (answers the originating Q4)

Same fixture both modes; assert disk-backed <= 1.25x in-memory. Loose enough to
avoid CI flake, tight enough to catch a 2x regression.

### 6. Format sanity

Assert GP bit 3 is clear on all entries, confirming no ZIP data descriptors
slipped in (see `02-design.md` on `streamFiles: false`).

## Acceptance gate

The unit tests above do not close out Q3 and Q4 on their own. The real gate is a
**before/after run on the production 8000-image / 1700-page template**, recording
peak RSS and wall-clock for both modes.

Targets:
- peak memory: ~1.0-1.1 GB -> ~150-250 MB
- wall clock: within 125% of the current implementation

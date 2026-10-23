# Changes by File

## New modules

| File | Environment | Contents |
|---|---|---|
| `src/diskSinks.ts` | **node only** | `makeRunDir`, `cleanupRunDir`, `storeImage`, `writeXml`, `lazyFileStream` |
| `src/diskSinks.browser.ts` | browser stub | every export throws "disk-backed output is not supported in the browser" |

The split point is chosen so the *pure* part stays isomorphic: `emitXml` lives
in `xml.ts`, only the stream writer is Node-bound.

## `src/types.ts`

- Add `outputPath?: string` and `workDir?: string` to `UserOptions`.
- Add the same two to `CreateReportOptions`.
- Add `ReportFileResult = { path: string; bytes: number }` (exported).
- Add internal `SpooledImage = { extension: ImageExtension; file: string }`.
- Widen internal `Images` to `{ [id: string]: Image | SpooledImage }`.
- Add `runDir?: string` to `Context` so `storeImage` knows where to spool.
- **`Image` and `ImagePars` are unchanged** - they are the user-facing contract.

## `src/xml.ts`

- Extract `function* emitXml(node, options): Generator<string>` - iterative,
  explicit stack, no recursion.
- Reimplement `buildXml` as a thin consumer of `emitXml` (removes the per-node
  `Buffer.concat` at `xml.ts:68-98`).
- `sanitizeText` / `sanitizeAttr` are unchanged and shared.
- No Node imports here. This file stays isomorphic.

## `src/diskSinks.ts` (new)

- `makeRunDir(workDir?)` -> creates `<root>/<runId>/{media,xml}/`, returns the path.
- `cleanupRunDir(runDir)` -> `rm(recursive, force)`, never throws outward.
- `storeImage(ctx, id, image)` -> writes bytes (decoding base64 if needed) to
  `<runDir>/media/`, returns a `SpooledImage`.
- `writeXml(node, options, dest)` -> drives `emitXml` into a write stream with
  ~64 KB batching and `drain` backpressure.
- `lazyFileStream(path)` -> a `Readable` that opens its fd on first `_read()`.
  See `04-risks-and-testing.md` for why this is mandatory.

## `src/processTemplate.ts`

- Route the three `ctx.images[...] =` assignments (`:1113`, `:1300`, `:1328`)
  through a single `storeImage` call site.
- `applyImageData` becomes `async` (it now awaits the spool write).
- `processImage` becomes `async`; its caller at `:840` gains an `await`. Already
  in async scope.
- `resolvePendingImages` awaits the now-async `applyImageData`. The spool write
  happens inside the `p-limit` worker, so it stays concurrent in parallel mode.

## `src/main.ts`

- Accept and validate `outputPath` / `workDir`; thread them into
  `CreateReportOptions`.
- Add the `ReportFileResult` overload **above** the existing `Uint8Array` one.
- Wrap the sink region in `try/finally` (runDir creation -> cleanup).
- `processImages`: add the `lazyFileStream` branch for `SpooledImage` entries.
- Main document (`:249`) and secondaries (`:284`): use `writeXml` + a stream
  entry when disk-backed, `buildXml` + `zipSetText` otherwise.
- Replace the `zipSave` call (`:344`) with the `generateNodeStream` pipeline when
  disk-backed.
- Reach `diskSinks` via `await import('./diskSinks')`, guarded by
  `if (options.outputPath)`.

## `src/zip.ts`

- Add `zipSetStream(zip, filename, stream)`.
- Add `zipSaveToFile(zip, outputPath, compressionLevel)` wrapping
  `generateNodeStream` + `pipeline`.
- Existing `zipSave` is unchanged - the in-memory path keeps working untouched.

## `src/errors.ts`

- Add `ReportOutputError` (carries `cause`) so fs/stream failures surface as a
  library error rather than a bare `ENOSPC`, consistent with the existing error
  classes.

## `rollup.config.js`

- Alias `./diskSinks` -> `./diskSinks.browser` for the browser build.
- Keep the existing `vm`/`stream`/`util`/`events`/`Buffer` polyfill setup as is.

## `src/index.ts`

- Export the `ReportFileResult` type.

## Documentation

- README: new "Disk-backed output" section covering `outputPath`, `workDir`,
  cleanup ownership, and the `/tmp` sizing note for Lambda-style environments.

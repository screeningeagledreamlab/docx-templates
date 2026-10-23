# Disk-Backed Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in mode where `createReport` writes the report to a caller-supplied path and spools image bytes and document XML to a temporary work directory, removing the two peak-memory terms that scale with image count.

**Architecture:** Keep JSZip throughout. Rewire three sinks: images spool to `<workDir>/<runId>/media/` and enter the zip as lazily-opened read streams; `buildXml` is rebuilt on a single iterative `emitXml` generator with a `writeXml` variant that spools document XML to disk; the final zip is produced by `generateNodeStream` piped to `fs.createWriteStream` instead of `generateAsync`. Node-only code is isolated in `src/diskSinks.ts` so the browser bundle stays clean.

**Tech Stack:** TypeScript 5.4, JSZip 3.10.1, Node streams, Jest 29 + ts-jest, Rollup 3, ESLint + Prettier.

**Spec:** `docs/disk-backed-output/` — read `01-problem.md`, `02-design.md`, `03-changes.md`, `04-risks-and-testing.md` before starting.

## Global Constraints

Every task's requirements implicitly include this section.

- **No new runtime dependencies.** `dependencies` stays `jszip`, `p-limit`, `sax`.
- **`engines.node` is bumped from `>=6` to `>=16`.** The existing `>=6` is already
  inaccurate (the codebase uses `??`, which needs Node 14). Node 16 is the floor
  that makes `stream/promises` and `fs.promises.rm` available.
- **No breaking public API changes.** `Image`, `ImagePars`, and every existing
  `UserOptions` field keep their current shape. `createReport(options)` without
  `outputPath` keeps returning `Promise<Uint8Array>`.
- **The in-memory path must stay byte-identical.** Task 1 rewrites `buildXml`,
  which every existing caller runs. The 68k lines of existing snapshots in
  `src/__tests__/__snapshots__/` are the regression guard — **they must pass
  unmodified.** If a snapshot changes, the refactor is wrong. Never update a
  snapshot to make Task 1 pass.
- **`streamFiles: false` always** when calling `generateNodeStream`. Setting it
  to `true` emits ZIP data descriptors (GP bit 3), which some OOXML consumers
  handle poorly. See `02-design.md`.
- **The browser bundle must never contain `fs`.** Verified by a CI assertion in
  Task 9.
- **`yarn lint` must pass** before every commit (ESLint + Prettier).
- **Media compression method is out of scope.** Do not add `storeMedia`, and do
  not change any `zip.file()` compression option. See `02-design.md`.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/xml.ts` | modify | **Isomorphic.** `parseXml`, the `emitXml` generator, `buildXml`. No I/O, no Node imports. |
| `src/diskSinks.ts` | **create** | **Node only.** `makeRunDir`, `cleanupRunDir`, `storeImage`, `writeXml`, `lazyFileStream`. |
| `src/diskSinks.browser.ts` | **create** | Browser stub; every export throws. |
| `src/zip.ts` | modify | Adds `zipSetStream`, `zipSaveToFile`. Existing `zipSave` untouched. |
| `src/types.ts` | modify | `outputPath`, `workDir`, `ReportFileResult`, `SpooledImage`, `Context.runDir`. |
| `src/errors.ts` | modify | `ReportOutputError`. |
| `src/processTemplate.ts` | modify | Image stores routed through `storeImage`; `applyImageData`/`processImage` become async. |
| `src/main.ts` | modify | Option plumbing, overloads, `try/finally`, three sinks wired. |
| `src/index.ts` | modify | Export `ReportFileResult`. |
| `rollup.config.mjs` | modify | Alias `./diskSinks` → `./diskSinks.browser`. |
| `src/__tests__/diskSinks.test.ts` | **create** | Unit tests for the new module. |
| `src/__tests__/diskOutput.test.ts` | **create** | End-to-end, equivalence, lifecycle tests. |
| `src/__tests__/diskOutput.perf.test.ts` | **create** | Memory ceiling and time guards. |

The split point is deliberate: the pure emitter lives in isomorphic `xml.ts`, only the stream writer is Node-bound. That is what makes the browser isolation in Task 9 possible.

---

### Task 1: Rewrite `buildXml` on an iterative `emitXml` generator

The riskiest task, because it changes code every existing caller runs. It ships
alone so a reviewer can gate it on the existing snapshots.

**Files:**
- Modify: `src/xml.ts:57-99` (replace `buildXml`)
- Test: `src/__tests__/unit.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function* emitXml(root: Node, options: XmlOptions): Generator<string>`
  - `export function buildXml(node: Node, options: XmlOptions): Buffer` — note the
    `indent` and `firstRun` parameters are **removed**; all four call sites in
    `main.ts` already pass only two arguments.
  - `export type XmlOptions = { literalXmlDelimiter: string; indentXml: boolean }`
    (already exists, now exported)

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/unit.test.ts`:

```typescript
import { buildXml, emitXml } from '../xml';
import { newNonTextNode, newTextNode } from '../reportUtils';

describe('emitXml', () => {
  const opts = { literalXmlDelimiter: '||', indentXml: false };

  it('emits a self-closing tag for a childless node', () => {
    const node = newNonTextNode('w:br', {});
    expect(buildXml(node, opts).toString('utf-8')).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:br/>'
    );
  });

  it('emits attributes in insertion order, escaped', () => {
    const node = newNonTextNode('w:t', { a: '1', b: '<&>' });
    expect(buildXml(node, opts).toString('utf-8')).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:t a="1" b="&lt;&amp;&gt;"/>'
    );
  });

  it('emits nested children and escapes text', () => {
    const text = newTextNode('a < b & c');
    const t = newNonTextNode('w:t', {}, [text]);
    text._parent = t;
    expect(buildXml(t, opts).toString('utf-8')).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:t>a &lt; b &amp; c</w:t>'
    );
  });

  it('indents nested nodes when indentXml is true', () => {
    const inner = newNonTextNode('w:br', {});
    const outer = newNonTextNode('w:p', {}, [inner]);
    inner._parent = outer;
    const indented = { literalXmlDelimiter: '||', indentXml: true };
    expect(buildXml(outer, indented).toString('utf-8')).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '\n<w:p>\n  <w:br/>\n</w:p>'
    );
  });

  it('does not recurse: handles a 50000-deep tree without stack overflow', () => {
    let root = newNonTextNode('n0', {});
    let cur = root;
    for (let i = 1; i < 50000; i++) {
      const child = newNonTextNode(`n${i}`, {});
      child._parent = cur;
      cur._children.push(child);
      cur = child;
    }
    expect(() => buildXml(root, opts)).not.toThrow();
  });

  it('yields incrementally rather than building one string', () => {
    const inner = newNonTextNode('w:br', {});
    const outer = newNonTextNode('w:p', {}, [inner]);
    inner._parent = outer;
    const chunks = [...emitXml(outer, opts)];
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.join('')).toBe(buildXml(outer, opts).toString('utf-8'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/unit.test.ts -t "emitXml" --no-coverage`
Expected: FAIL — `emitXml` is not exported from `../xml`.

- [ ] **Step 3: Replace `buildXml` with the generator-based implementation**

In `src/xml.ts`, replace lines 52-99 (the `XmlOptions` type and the whole
`buildXml` function) with:

```typescript
export type XmlOptions = {
  literalXmlDelimiter: string;
  indentXml: boolean;
};

type Frame = {
  node: Node;
  indent: string;
  // -1 = not yet opened; otherwise index of the next child to visit
  i: number;
  lastChildIsNode: boolean;
};

/**
 * Emit a node tree as XML string chunks.
 *
 * Iterative (explicit stack) rather than recursive: the previous implementation
 * called Buffer.concat at every node, which allocated O(depth x size), and it
 * blew the JS stack on deeply nested documents.
 *
 * This is the single source of truth for XML serialisation. `buildXml` and
 * `writeXml` (src/diskSinks.ts) are both thin consumers of it, so their output
 * is byte-identical by construction.
 */
export function* emitXml(
  root: Node,
  options: XmlOptions
): Generator<string> {
  yield '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const stack: Frame[] = [
    { node: root, indent: '', i: -1, lastChildIsNode: false },
  ];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const node = frame.node;

    // Opening pass
    if (frame.i === -1) {
      if (node._fTextNode) {
        yield sanitizeText(node._text, options);
        stack.pop();
        continue;
      }
      let attrs = '';
      const nodeAttrs = node._attrs;
      Object.keys(nodeAttrs).forEach(key => {
        attrs += ` ${key}="${sanitizeAttr(nodeAttrs[key])}"`;
      });
      const fHasChildren = node._children.length > 0;
      const suffix = fHasChildren ? '' : '/';
      const newline = options.indentXml ? `\n${frame.indent}` : '';
      yield `${newline}<${node._tag}${attrs}${suffix}>`;
      if (!fHasChildren) {
        stack.pop();
        continue;
      }
      frame.i = 0;
      continue;
    }

    // Child pass
    if (frame.i < node._children.length) {
      const child = node._children[frame.i];
      frame.lastChildIsNode = !child._fTextNode;
      frame.i += 1;
      stack.push({
        node: child,
        indent: options.indentXml ? `${frame.indent}  ` : '',
        i: -1,
        lastChildIsNode: false,
      });
      continue;
    }

    // Closing pass
    const indent2 =
      options.indentXml && frame.lastChildIsNode ? `\n${frame.indent}` : '';
    yield `${indent2}</${node._tag}>`;
    stack.pop();
  }
}

function buildXml(node: Node, options: XmlOptions): Buffer {
  const parts: string[] = [];
  for (const chunk of emitXml(node, options)) parts.push(chunk);
  return Buffer.from(parts.join(''), 'utf-8');
}
```

Leave `sanitizeText` and `sanitizeAttr` (lines 101-138) exactly as they are, and
update the export line at the bottom to `export { parseXml, buildXml };`
(`emitXml` and `XmlOptions` are exported inline above).

- [ ] **Step 4: Run the new unit tests**

Run: `npx jest src/__tests__/unit.test.ts -t "emitXml" --no-coverage`
Expected: PASS, all six.

- [ ] **Step 5: Run the FULL existing suite against unmodified snapshots**

Run: `npx jest --no-coverage`
Expected: PASS, with **zero snapshot writes**. Confirm the summary says
`snapshots: N passed` and does **not** say `written` or `updated`.

If any snapshot fails, the emitter diverges from the original — fix `emitXml`.
**Do not run `jest -u`.** The snapshots are the specification here.

- [ ] **Step 6: Lint and commit**

```bash
yarn lint
git add src/xml.ts src/__tests__/unit.test.ts
git commit -m "refactor(xml): rebuild buildXml on an iterative emitXml generator

Replaces per-node Buffer.concat recursion with a single iterative generator.
Output is unchanged (existing snapshots pass untouched). Removes the stack
depth ceiling on deeply nested documents and gives writeXml a shared emitter
so the two cannot drift."
```

---

### Task 2: `lazyFileStream` — the fd-exhaustion mitigation

Highest-risk detail in the project. See `04-risks-and-testing.md` Risk 1.
A paused `fs.createReadStream` **has already opened its fd**, so handing 8000 of
them to `zip.file()` means 8000 open fds against a typical `ulimit -n` of 1024.

**Files:**
- Create: `src/diskSinks.ts`
- Test: `src/__tests__/diskSinks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function lazyFileStream(filePath: string): Readable`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/diskSinks.test.ts`:

```typescript
/* eslint-env jest */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { lazyFileStream } from '../diskSinks';

const read = (s: NodeJS.ReadableStream): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on('data', c => chunks.push(Buffer.from(c)));
    s.on('end', () => resolve(Buffer.concat(chunks)));
    s.on('error', reject);
    // Once a stream has been explicitly paused (as the "survives being paused"
    // test below does, mirroring JSZip), Node pins its flowing flag to `false`;
    // attaching a 'data' listener only auto-resumes when flowing is still unset
    // (`null`). Real consumers either .pipe() (which resumes internally) or, like
    // JSZip's pump loop, call resume() explicitly. Without this the paused test
    // hangs forever.
    s.resume();
  });

describe('lazyFileStream', () => {
  let dir: string;
  let file: string;

  beforeAll(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lazy-test-'));
    file = path.join(dir, 'data.bin');
    await fs.promises.writeFile(file, Buffer.alloc(200000, 7));
  });

  afterAll(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('reads the full file contents', async () => {
    const buf = await read(lazyFileStream(file));
    expect(buf.length).toBe(200000);
    expect(buf.every(b => b === 7)).toBe(true);
  });

  it('does not touch the filesystem until first read', async () => {
    const missing = path.join(dir, 'does-not-exist.bin');
    const s = lazyFileStream(missing);
    const onError = jest.fn();
    s.on('error', onError);
    // Give the event loop several turns; an eager open would have errored.
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(onError).not.toHaveBeenCalled();
    // Now read, and the ENOENT must surface.
    await expect(read(s)).rejects.toThrow(/ENOENT/);
  });

  it('opens no file descriptors for thousands of unread streams', () => {
    // 5000 eager fs.createReadStream calls would exceed ulimit -n and throw
    // EMFILE. This is the regression guard for the whole design.
    const streams = Array.from({ length: 5000 }, () => lazyFileStream(file));
    expect(streams).toHaveLength(5000);
    streams.forEach(s => s.destroy());
  });

  it('survives being paused before it is ever read (JSZip does this)', async () => {
    const s = lazyFileStream(file);
    s.pause();
    await new Promise(r => setImmediate(r));
    const buf = await read(s);
    expect(buf.length).toBe(200000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/diskSinks.test.ts --no-coverage`
Expected: FAIL — cannot find module `../diskSinks`.

- [ ] **Step 3: Create `src/diskSinks.ts` with `lazyFileStream`**

```typescript
import { createReadStream } from 'fs';
import { Readable } from 'stream';

/**
 * A Readable that opens its file descriptor on first read, not on construction.
 *
 * Why this exists: JSZip's NodejsStreamInputAdapter binds the stream in its
 * constructor (at `zip.file()` time) and only calls `stream.pause()`. But a
 * paused fs.createReadStream has ALREADY opened its fd. Handing JSZip one
 * stream per image therefore opens every fd up front -- 8000 images against a
 * typical `ulimit -n` of 1024 is a hard EMFILE before a single byte is written.
 *
 * JSZip pulls entries strictly sequentially, so deferring the open to the first
 * _read() keeps the live fd count at ~1.
 *
 * This is safe because _bindStream calls pause() BEFORE attaching its 'data'
 * listener, and Node's on('data') only auto-resumes when readableFlowing is not
 * already false. So the stream is never read until JSZip resumes it.
 */
export function lazyFileStream(filePath: string): Readable {
  let inner: Readable | null = null;
  let stopped = false;

  const out = new Readable({
    read() {
      if (stopped) return;
      if (inner == null) {
        const src = createReadStream(filePath);
        inner = src;
        src.on('data', (chunk: Buffer) => {
          if (!out.push(chunk)) src.pause();
        });
        src.on('end', () => out.push(null));
        src.on('error', (err: Error) => out.destroy(err));
      } else {
        inner.resume();
      }
    },
    destroy(err, cb) {
      stopped = true;
      if (inner != null) inner.destroy();
      cb(err);
    },
  });

  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/__tests__/diskSinks.test.ts --no-coverage`
Expected: PASS, all four.

- [ ] **Step 5: Lint and commit**

```bash
yarn lint
git add src/diskSinks.ts src/__tests__/diskSinks.test.ts
git commit -m "feat(disk): add lazyFileStream to avoid fd exhaustion

JSZip binds stream inputs at zip.file() time and a paused fs.createReadStream
has already opened its fd, so one stream per image would EMFILE at scale.
lazyFileStream defers the open to the first _read()."
```

---

### Task 3: Work-dir lifecycle and `writeXml`

**Files:**
- Modify: `src/diskSinks.ts` (append)
- Modify: `src/errors.ts` (append `ReportOutputError`)
- Test: `src/__tests__/diskSinks.test.ts` (append)

**Interfaces:**
- Consumes: `emitXml`, `XmlOptions` from Task 1; `src/diskSinks.ts` from Task 2.
- Produces:
  - `export async function makeRunDir(workDir?: string): Promise<string>`
  - `export async function cleanupRunDir(runDir: string | undefined): Promise<void>`
  - `export async function writeXml(node: Node, options: XmlOptions, dest: string): Promise<void>`
  - `export class ReportOutputError extends Error` (in `src/errors.ts`)

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/diskSinks.test.ts`:

```typescript
import { makeRunDir, cleanupRunDir, writeXml } from '../diskSinks';
import { buildXml } from '../xml';
import { parseXml } from '../xml';

describe('makeRunDir / cleanupRunDir', () => {
  it('creates a unique run dir with media/ and xml/ subdirs', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'runroot-'));
    const a = await makeRunDir(root);
    const b = await makeRunDir(root);
    expect(a).not.toBe(b);
    expect(fs.existsSync(path.join(a, 'media'))).toBe(true);
    expect(fs.existsSync(path.join(a, 'xml'))).toBe(true);
    await cleanupRunDir(a);
    await cleanupRunDir(b);
    // The caller-supplied root must SURVIVE cleanup.
    expect(fs.existsSync(root)).toBe(true);
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('creates the root itself when it does not exist', async () => {
    const root = path.join(os.tmpdir(), `runroot-missing-${Date.now()}`);
    const runDir = await makeRunDir(root);
    expect(fs.existsSync(runDir)).toBe(true);
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('cleanupRunDir never throws, even on a missing path', async () => {
    await expect(
      cleanupRunDir(path.join(os.tmpdir(), 'definitely-not-here-xyz'))
    ).resolves.toBeUndefined();
    await expect(cleanupRunDir(undefined)).resolves.toBeUndefined();
  });
});

describe('writeXml', () => {
  const opts = { literalXmlDelimiter: '||', indentXml: false };

  it('produces bytes identical to buildXml', async () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<root a="1"><child>hello &amp; goodbye</child><empty/></root>';
    const node = await parseXml(xml);
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wx-'));
    const dest = path.join(dir, 'out.xml');

    await writeXml(node, opts, dest);

    const fromDisk = await fs.promises.readFile(dest);
    expect(fromDisk.equals(buildXml(node, opts))).toBe(true);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('round-trips non-ASCII text as UTF-8', async () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<r><t>café 漢字 “smart”</t></r>';
    const node = await parseXml(xml);
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wx-'));
    const dest = path.join(dir, 'out.xml');

    await writeXml(node, opts, dest);

    const fromDisk = await fs.promises.readFile(dest);
    expect(fromDisk.equals(buildXml(node, opts))).toBe(true);
    expect(fromDisk.toString('utf-8')).toContain('café 漢字');
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('handles a document larger than one write buffer', async () => {
    const children = Array.from(
      { length: 20000 },
      (_, i) => `<c i="${i}">text ${i}</c>`
    ).join('');
    const node = await parseXml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><r>${children}</r>`
    );
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wx-'));
    const dest = path.join(dir, 'big.xml');

    await writeXml(node, opts, dest);

    const fromDisk = await fs.promises.readFile(dest);
    expect(fromDisk.equals(buildXml(node, opts))).toBe(true);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/diskSinks.test.ts -t "writeXml" --no-coverage`
Expected: FAIL — `writeXml` is not exported from `../diskSinks`.

- [ ] **Step 3: Add `ReportOutputError` to `src/errors.ts`**

Append to `src/errors.ts`:

```typescript
/**
 * Thrown when a disk-backed operation fails (spooling, XML writing, or zip
 * output). Wraps the underlying fs/stream error so callers see a library error
 * rather than a bare ENOSPC/EACCES.
 */
export class ReportOutputError extends Error {
  cause: unknown;
  constructor(msg: string, cause: unknown) {
    super(msg);
    Object.setPrototypeOf(this, ReportOutputError.prototype);
    this.cause = cause;
  }
}
```

- [ ] **Step 4: Append the lifecycle and writer implementations to `src/diskSinks.ts`**

Add these imports at the top of `src/diskSinks.ts`:

```typescript
import { createWriteStream, promises as fsp } from 'fs';
import { randomBytes } from 'crypto';
import os from 'os';
import path from 'path';
import { once } from 'events';
import { Node } from './types';
import { emitXml, XmlOptions } from './xml';
import { ReportOutputError } from './errors';
import { logger } from './debug';
```

Then append:

```typescript
const DEFAULT_WORK_ROOT = 'docx-templates';

/** Bytes buffered before a write is issued. Keeps syscall count sane. */
const WRITE_CHUNK_BYTES = 64 * 1024;

/**
 * Create `<root>/<runId>/{media,xml}/` and return the run dir.
 *
 * The per-run directory is the unit of cleanup, which is what makes concurrent
 * createReport calls safe against a shared root.
 */
export async function makeRunDir(workDir?: string): Promise<string> {
  const root = workDir ?? path.join(os.tmpdir(), DEFAULT_WORK_ROOT);
  const runDir = path.join(root, randomBytes(8).toString('hex'));
  try {
    await fsp.mkdir(path.join(runDir, 'media'), { recursive: true });
    await fsp.mkdir(path.join(runDir, 'xml'), { recursive: true });
  } catch (e) {
    throw new ReportOutputError(
      `Could not create work directory at ${runDir}`,
      e
    );
  }
  return runDir;
}

/**
 * Remove a run dir. Never throws: this runs in a `finally` and must not mask
 * the error that got us there. The caller-supplied root is never removed.
 */
export async function cleanupRunDir(runDir: string | undefined): Promise<void> {
  if (runDir == null) return;
  try {
    await fsp.rm(runDir, { recursive: true, force: true });
  } catch (e) {
    logger.debug(`Could not clean up work directory ${runDir}: ${String(e)}`);
  }
}

/**
 * Serialise a node tree straight to disk.
 *
 * Shares emitXml with buildXml, so output is byte-identical by construction.
 * Batches into ~64KB chunks and honours backpressure.
 */
export async function writeXml(
  node: Node,
  options: XmlOptions,
  dest: string
): Promise<void> {
  const ws = createWriteStream(dest);
  try {
    let buffered = '';
    for (const chunk of emitXml(node, options)) {
      buffered += chunk;
      if (buffered.length >= WRITE_CHUNK_BYTES) {
        if (!ws.write(buffered, 'utf-8')) await once(ws, 'drain');
        buffered = '';
      }
    }
    if (buffered.length > 0) {
      if (!ws.write(buffered, 'utf-8')) await once(ws, 'drain');
    }
    ws.end();
    await once(ws, 'finish');
  } catch (e) {
    ws.destroy();
    throw new ReportOutputError(`Could not write XML to ${dest}`, e);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/__tests__/diskSinks.test.ts --no-coverage`
Expected: PASS, all eleven (four from Task 2, seven new).

- [ ] **Step 6: Lint and commit**

```bash
yarn lint
git add src/diskSinks.ts src/errors.ts src/__tests__/diskSinks.test.ts
git commit -m "feat(disk): add run-dir lifecycle and streaming writeXml

makeRunDir/cleanupRunDir own a per-run scratch dir; the caller-supplied root is
never removed. writeXml drives the shared emitXml generator into a write stream
with backpressure, so its bytes match buildXml exactly."
```

---

### Task 4: Image spooling

**Files:**
- Modify: `src/types.ts` (add `SpooledImage`, widen `Images`, add `Context.runDir`)
- Modify: `src/diskSinks.ts` (append `storeImage`)
- Modify: `src/processTemplate.ts:1107-1114` (`imageToContext`), `:1288-1330` (`applyImageData`), `:840` (inline call site), `:1484` (`processImage`), `:1434` (`resolvePendingImages` call site)
- Test: `src/__tests__/diskSinks.test.ts` (append)

**Interfaces:**
- Consumes: `makeRunDir` from Task 3.
- Produces:
  - `export type SpooledImage = { extension: ImageExtension; file: string }` (in `types.ts`)
  - `export async function storeImage(runDir: string | undefined, id: string, img: Image): Promise<Image | SpooledImage>` (in `diskSinks.ts`)
  - `applyImageData` and `processImage` in `processTemplate.ts` become `async`.

- [ ] **Step 1: Update `src/types.ts`**

At `src/types.ts:289-301`, change `Images` and add `SpooledImage`. `Image` and
`ImageExtension` keep their current definitions — `Image` is the user-facing
contract and must not change:

```typescript
export type SpooledImage = { extension: ImageExtension; file: string };
export type Images = { [id: string]: Image | SpooledImage };
export type ImageExtension = (typeof ImageExtensions)[number];
```

Note `ImageExtension` was previously a bare `type` (not exported); it now needs
`export` because `SpooledImage` is consumed from `diskSinks.ts`.

Add to `Context` (after `images: Images;` at `src/types.ts:240`):

```typescript
  /** Scratch dir for disk-backed mode; undefined means keep image bytes in memory. */
  runDir?: string;
```

Add to `UserOptions` and `CreateReportOptions`:

```typescript
  /** Write the report here instead of returning it in memory. Enables disk-backed mode. */
  outputPath?: string;
  /** Root for the library's scratch files. Default: os.tmpdir()/docx-templates. Ignored without outputPath. */
  workDir?: string;
```

And add the result type near `Image`:

```typescript
export type ReportFileResult = { path: string; bytes: number };
```

- [ ] **Step 2: Write the failing test**

Append to `src/__tests__/diskSinks.test.ts`:

```typescript
import { storeImage } from '../diskSinks';
import { Image, SpooledImage } from '../types';

describe('storeImage', () => {
  it('returns the image unchanged when there is no run dir', async () => {
    const img: Image = { extension: '.png', data: Buffer.from([1, 2, 3]) };
    const stored = await storeImage(undefined, 'img1', img);
    expect(stored).toBe(img);
  });

  it('spools binary data to <runDir>/media and returns a file reference', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'si-'));
    const runDir = await makeRunDir(root);
    const img: Image = { extension: '.png', data: Buffer.from([9, 8, 7]) };

    const stored = (await storeImage(runDir, 'img1', img)) as SpooledImage;

    expect(stored.extension).toBe('.png');
    expect(stored.file).toContain('media');
    expect(await fs.promises.readFile(stored.file)).toEqual(
      Buffer.from([9, 8, 7])
    );
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('decodes base64 input on the way to disk', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'si-'));
    const runDir = await makeRunDir(root);
    const img: Image = { extension: '.gif', data: 'bm90aGluZwo=' };

    const stored = (await storeImage(runDir, 'img2', img)) as SpooledImage;

    expect(await fs.promises.readFile(stored.file)).toEqual(
      Buffer.from('bm90aGluZwo=', 'base64')
    );
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('gives each image id a distinct file', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'si-'));
    const runDir = await makeRunDir(root);
    const a = (await storeImage(runDir, 'img1', {
      extension: '.png',
      data: Buffer.from([1]),
    })) as SpooledImage;
    const b = (await storeImage(runDir, 'img2', {
      extension: '.png',
      data: Buffer.from([2]),
    })) as SpooledImage;
    expect(a.file).not.toBe(b.file);
    await fs.promises.rm(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/__tests__/diskSinks.test.ts -t "storeImage" --no-coverage`
Expected: FAIL — `storeImage` is not exported from `../diskSinks`.

- [ ] **Step 4: Append `storeImage` to `src/diskSinks.ts`**

Add `Image, SpooledImage` to the existing `./types` import, then append:

```typescript
/**
 * Spool one image's bytes to the run dir, returning a file reference instead of
 * the bytes. Returns the image untouched when disk-backed mode is off.
 *
 * Base64 input is decoded here, which also sheds its 1.33x size overhead.
 */
export async function storeImage(
  runDir: string | undefined,
  id: string,
  img: Image
): Promise<Image | SpooledImage> {
  if (runDir == null) return img;

  const bytes =
    typeof img.data === 'string'
      ? Buffer.from(img.data, 'base64')
      : Buffer.from(img.data as ArrayBuffer);

  const file = path.join(runDir, 'media', `${id}${img.extension}`);
  try {
    await fsp.writeFile(file, bytes);
  } catch (e) {
    throw new ReportOutputError(`Could not spool image ${id} to ${file}`, e);
  }
  return { extension: img.extension, file };
}
```

- [ ] **Step 5: Route `processTemplate.ts` image stores through `storeImage`**

Add the import at the top of `src/processTemplate.ts`:

```typescript
import { storeImage } from './diskSinks';
```

Make `imageToContext` async (`src/processTemplate.ts:1107`):

```typescript
const imageToContext = async (ctx: Context, img: Image) => {
  validateImage(img);
  ctx.imageAndShapeIdIncrement += 1;
  const id = String(ctx.imageAndShapeIdIncrement);
  const relId = `img${id}`;
  ctx.images[relId] = await storeImage(ctx.runDir, relId, img);
  return relId;
};
```

Make `applyImageData` async (`src/processTemplate.ts:1254`), and change its three
image-store statements. The SVG branch at `:1300`:

```typescript
    ctx.images[pending.id] = await storeImage(ctx.runDir, pending.id, imgData);

    // Create a new ID for the thumbnail
    const thumbRelId = await imageToContext(ctx, thumbnail);
```

and the non-SVG branch at `:1328`:

```typescript
    ctx.images[pending.id] = await storeImage(ctx.runDir, pending.id, imgData);
```

Make `processImage` async (`src/processTemplate.ts:1484`):

```typescript
const processImage = async (ctx: Context, imagePars: ImagePars) => {
```

and inside it, `await applyImageData(ctx, imagePars, pending);`.

Update the two call sites. Inline mode at `src/processTemplate.ts:840`:

```typescript
              await processImage(ctx, img);
```

and `resolvePendingImages` at `src/processTemplate.ts:1434`:

```typescript
      await applyImageData(ctx, imagePars, pending);
```

Both are already inside `async` functions, and both are already inside
`try { ... } catch (e) { ... }` blocks that wrap failures in `ImageError` — the
`await` keeps that behaviour because a rejected promise is caught the same way.

Finally, thread the run dir into `Context`. `runDir` lives on `Context`, not on
`CreateReportOptions`, so `newContext` (`src/processTemplate.ts:~68`) gains a
third parameter rather than reading it off `options`:

```typescript
export function newContext(
  options: CreateReportOptions,
  imageAndShapeIdIncrement: number = 0,
  runDir?: string
): Context {
```

and `runDir,` is added to the returned object literal next to `images: {},`.

- [ ] **Step 6: Run the full suite — in-memory behaviour must be unchanged**

Run: `npx jest --no-coverage`
Expected: PASS with zero snapshot writes. `ctx.runDir` is `undefined`
everywhere so far, so `storeImage` returns the image untouched and every
existing image test behaves exactly as before.

- [ ] **Step 7: Lint and commit**

```bash
yarn lint
git add src/types.ts src/diskSinks.ts src/processTemplate.ts src/__tests__/diskSinks.test.ts
git commit -m "feat(disk): spool image bytes to the run dir

Routes the three ctx.images assignments through storeImage, which writes bytes
to <runDir>/media and stores a path instead. With no run dir the image passes
through untouched, so the in-memory path is unchanged."
```

---

### Task 5: Zip stream helpers

**Files:**
- Modify: `src/zip.ts`
- Test: `src/__tests__/diskSinks.test.ts` (append)

**Interfaces:**
- Consumes: `lazyFileStream` from Task 2.
- Produces:
  - `export const zipSetStream: (zip: JSZip, filename: string, filePath: string) => void`
  - `export const zipSaveToFile: (zip: JSZip, outputPath: string, compressionLevel: number) => Promise<number>` — resolves to the byte length written.

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/diskSinks.test.ts`:

```typescript
import JSZip from 'jszip';
import { zipSetStream, zipSaveToFile } from '../zip';

describe('zip streaming helpers', () => {
  it('writes a zip to disk with stream entries intact', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zs-'));
    const src = path.join(dir, 'payload.bin');
    const payload = Buffer.from('café 漢字 payload', 'utf-8');
    await fs.promises.writeFile(src, payload);

    const zip = new JSZip();
    zip.file('inline.txt', 'plain content');
    zipSetStream(zip, 'streamed.bin', src);

    const out = path.join(dir, 'out.zip');
    const bytes = await zipSaveToFile(zip, out, 1);

    expect(bytes).toBeGreaterThan(0);
    expect((await fs.promises.stat(out)).size).toBe(bytes);

    const reloaded = await JSZip.loadAsync(await fs.promises.readFile(out));
    expect(await reloaded.file('inline.txt')!.async('text')).toBe(
      'plain content'
    );
    const roundTripped = await reloaded.file('streamed.bin')!.async('nodebuffer');
    expect(roundTripped.equals(payload)).toBe(true);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('does not emit data descriptors (GP bit 3 must be clear)', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zs-'));
    const src = path.join(dir, 'p.bin');
    await fs.promises.writeFile(src, Buffer.alloc(5000, 3));

    const zip = new JSZip();
    zipSetStream(zip, 'p.bin', src);
    const out = path.join(dir, 'out.zip');
    await zipSaveToFile(zip, out, 1);

    const buf = await fs.promises.readFile(out);
    // Local file header: signature PK\x03\x04, then version(2), then flags(2).
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    const flags = buf.readUInt16LE(6);
    expect(flags & 0x08).toBe(0);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('handles many stream entries without exhausting file descriptors', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zs-'));
    const zip = new JSZip();
    for (let i = 0; i < 1500; i++) {
      const f = path.join(dir, `e${i}.bin`);
      await fs.promises.writeFile(f, Buffer.alloc(64, i % 256));
      zipSetStream(zip, `e${i}.bin`, f);
    }
    const out = path.join(dir, 'many.zip');
    await expect(zipSaveToFile(zip, out, 1)).resolves.toBeGreaterThan(0);

    const reloaded = await JSZip.loadAsync(await fs.promises.readFile(out));
    expect(Object.keys(reloaded.files)).toHaveLength(1500);

    await fs.promises.rm(dir, { recursive: true, force: true });
  }, 60000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/diskSinks.test.ts -t "zip streaming" --no-coverage`
Expected: FAIL — `zipSetStream` is not exported from `../zip`.

- [ ] **Step 3: Add the helpers to `src/zip.ts`**

Replace the contents of `src/zip.ts` with:

```typescript
import JSZip from 'jszip';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { stat } from 'fs/promises';
import { lazyFileStream } from './diskSinks';
import { ReportOutputError } from './errors';

const zipLoad = (inputFile: ArrayBuffer) => JSZip.loadAsync(inputFile);
const zipGetText = (zip: JSZip, filename: string) => {
  const file_in_zip = zip.file(filename);
  if (!file_in_zip) return null;
  return file_in_zip.async('text');
};

const zipSetText = (zip: JSZip, filename: string, data: ArrayBuffer) =>
  zip.file(filename, data, { binary: false });

/**
 * Add an entry whose content is read lazily from disk at generate time.
 *
 * `binary: true` is required: the spooled file already holds UTF-8 bytes, so
 * JSZip must treat it as pre-encoded rather than re-encoding it.
 */
const zipSetStream = (zip: JSZip, filename: string, filePath: string) => {
  zip.file(filename, lazyFileStream(filePath), { binary: true });
};

const zipSave = (zip: JSZip, compressionLevel: number) =>
  zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

/**
 * Stream the zip straight to disk, so the whole archive never exists in memory.
 *
 * `streamFiles: false` is deliberate. JSZip pipes the compress worker into
 * ZipFileWorker, so its per-entry accumulation holds POST-compression bytes --
 * one deflated entry at a time, which is small. Setting it to true would emit
 * ZIP data descriptors (GP bit 3), which some OOXML consumers handle poorly.
 */
const zipSaveToFile = async (
  zip: JSZip,
  outputPath: string,
  compressionLevel: number
): Promise<number> => {
  try {
    await pipeline(
      zip.generateNodeStream({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
        streamFiles: false,
      }),
      createWriteStream(outputPath)
    );
  } catch (e) {
    throw new ReportOutputError(
      `Could not write the report to ${outputPath}`,
      e
    );
  }
  return (await stat(outputPath)).size;
};

// ==========================================
// Public API
// ==========================================
export {
  zipLoad,
  zipGetText,
  zipSetText,
  zipSetStream,
  zipSave,
  zipSaveToFile,
};
```

**Note on the browser build:** `src/zip.ts` now imports from `./diskSinks` and
from `fs`. Task 9 handles this via the Rollup alias — `diskSinks.browser.ts`
provides a `lazyFileStream` stub, and the `fs` imports are only reached by
`zipSaveToFile`, which the browser never calls. Do not attempt to fix the
browser build in this task.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/__tests__/diskSinks.test.ts -t "zip streaming" --no-coverage`
Expected: PASS, all three. The third takes ~10-30s.

- [ ] **Step 5: Lint and commit**

```bash
yarn lint
git add src/zip.ts src/__tests__/diskSinks.test.ts
git commit -m "feat(zip): add zipSetStream and zipSaveToFile

zipSaveToFile pipes generateNodeStream to disk so the archive never exists in
memory. streamFiles stays false: accumulation is post-compression and
per-entry, and data descriptors would hurt OOXML compatibility."
```

---

### Task 6: Wire disk-backed mode into `createReport`

The integration task. After this, the feature works end to end.

**Files:**
- Modify: `src/main.ts` (overloads at `:126-142`, options at `:147-179`, the pipeline at `:185-345`)
- Modify: `src/index.ts` (export `ReportFileResult`)
- Modify: `package.json` (`engines.node`)
- Modify: `README.md` (new section)
- Test: `src/__tests__/diskOutput.test.ts` (create)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: `createReport(options & { outputPath: string }): Promise<ReportFileResult>`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/diskOutput.test.ts`:

```typescript
/* eslint-env jest */
import path from 'path';
import fs from 'fs';
import os from 'os';
import JSZip from 'jszip';
import { createReport } from '../index';

const FIXTURES = path.join(__dirname, 'fixtures');

const mkOutDir = () =>
  fs.promises.mkdtemp(path.join(os.tmpdir(), 'docx-out-'));

describe('disk-backed output', () => {
  it('writes a valid docx to outputPath and reports its size', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const dir = await mkOutDir();
    const outputPath = path.join(dir, 'report.docx');

    const result = await createReport({
      template,
      outputPath,
      data: {},
      additionalJsContext: {
        injectImg: async () => ({
          width: 6,
          height: 6,
          data: await fs.promises.readFile(path.join(FIXTURES, 'sample.png')),
          extension: '.png' as const,
        }),
      },
    });

    expect(result.path).toBe(outputPath);
    expect(result.bytes).toBeGreaterThan(0);
    expect((await fs.promises.stat(outputPath)).size).toBe(result.bytes);

    // It must be a readable docx with a main document part.
    const zip = await JSZip.loadAsync(await fs.promises.readFile(outputPath));
    expect(zip.file('word/document.xml')).not.toBeNull();

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('still returns a Uint8Array when outputPath is absent', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const out = await createReport({
      template,
      data: {},
      additionalJsContext: {
        injectImg: async () => ({
          width: 6,
          height: 6,
          data: await fs.promises.readFile(path.join(FIXTURES, 'sample.png')),
          extension: '.png' as const,
        }),
      },
    });
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it('throws when the output directory does not exist', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    await expect(
      createReport({
        template,
        outputPath: path.join(os.tmpdir(), 'no-such-dir-xyz', 'r.docx'),
        data: {},
        additionalJsContext: {
          injectImg: async () => ({
            width: 6,
            height: 6,
            data: await fs.promises.readFile(path.join(FIXTURES, 'sample.png')),
            extension: '.png' as const,
          }),
        },
      })
    ).rejects.toThrow(/output directory/i);
  });
});
```

`imageSimple.docx` contains a single `IMAGE injectImg()` command — the same
fixture and context key used by `images.test.ts:192`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/diskOutput.test.ts --no-coverage`
Expected: FAIL — `outputPath` is not a recognised option; result has no `.path`.

- [ ] **Step 3: Add the overload and option plumbing to `src/main.ts`**

Add imports:

```typescript
import { zipLoad, zipGetText, zipSetText, zipSetStream, zipSave, zipSaveToFile } from './zip';
import { ReportFileResult } from './types';
import { ReportOutputError } from './errors';
import path from 'path';
```

Insert this overload **above** the existing `Promise<Uint8Array>` overload at
`src/main.ts:126` (more specific first, or TypeScript picks the wrong one):

```typescript
/**
 * Create a report and write it to `options.outputPath` instead of returning it
 * in memory. Image bytes and document XML are spooled to a scratch directory,
 * so peak memory no longer scales with the number of images.
 */
async function createReport(
  options: UserOptions & { outputPath: string }
): Promise<ReportFileResult>;
```

and widen the implementation signature's return type:

```typescript
async function createReport(
  options: UserOptions,
  _probe?: 'JS' | 'XML'
): Promise<Node | string | Uint8Array | ReportFileResult> {
```

Add to the `createOptions` object literal (after `imageConcurrency`):

```typescript
    outputPath: options.outputPath,
    workDir: options.workDir,
```

and validate right after the existing `imageConcurrency` check:

```typescript
  if (createOptions.outputPath != null) {
    const outDir = path.dirname(createOptions.outputPath);
    if (!fsSync.existsSync(outDir)) {
      throw new ReportOutputError(
        `The output directory ${outDir} does not exist. Create it before calling createReport.`,
        undefined
      );
    }
  }
```

(importing `import fsSync from 'fs';` — this is the only synchronous fs use, and
it is deliberate: it fails fast before any work is done.)

- [ ] **Step 4: Wrap the pipeline in try/finally and wire the three sinks**

In `src/main.ts`, after the options validation and before `parseTemplate`:

```typescript
  const diskMode = createOptions.outputPath != null;
  let runDir: string | undefined;
  let disk: typeof import('./diskSinks') | undefined;
  if (diskMode) {
    disk = await import('./diskSinks');
    runDir = await disk.makeRunDir(createOptions.workDir);
  }

  try {
```

Everything from `const { jsTemplate, ... } = await parseTemplate(template);`
through the final return moves inside this `try`. Close it with:

```typescript
  } finally {
    if (disk != null) await disk.cleanupRunDir(runDir);
  }
```

Inside the `try`, make these five changes:

1. Both `newContext` calls (`:224` and `:263`) pass the run dir:
   ```typescript
   let ctx = newContext(createOptions, highest_img_id, runDir);
   ```
   ```typescript
   ctx = newContext(createOptions, ctx.imageAndShapeIdIncrement, runDir);
   ```

2. Main document XML (`:249-252`):
   ```typescript
   logger.debug('Writing report...');
   const mainPath = `${TEMPLATE_PATH}/${mainDocument}`;
   if (diskMode && disk != null && runDir != null) {
     const xmlFile = path.join(runDir, 'xml', mainDocument);
     await disk.writeXml(report1, xmlOptions, xmlFile);
     zipSetStream(zip, mainPath, xmlFile);
   } else {
     zipSetText(zip, mainPath, buildXml(report1, xmlOptions));
   }
   ```
   Note `_probe === 'XML'` must still return before this, so keep the existing
   `const reportXml = buildXml(report1, xmlOptions); if (_probe === 'XML') ...`
   only inside a `if (_probe === 'XML')` guard — build it lazily:
   ```typescript
   if (_probe === 'XML') return buildXml(report1, xmlOptions).toString('utf-8');
   ```

3. Secondary XMLs (`:284-285`), same shape, using `filePath` for the zip entry
   name and `documentComponent` for the spool filename:
   ```typescript
   if (diskMode && disk != null && runDir != null) {
     const segs = filePath.split('/');
     const xmlFile = path.join(runDir, 'xml', segs[segs.length - 1]);
     await disk.writeXml(report2, xmlOptions, xmlFile);
     zipSetStream(zip, filePath, xmlFile);
   } else {
     zipSetText(zip, filePath, buildXml(report2, xmlOptions));
   }
   ```

4. `processImages` (`:527-548`) gains the spooled branch:
   ```typescript
   for (const imageId of imageIds) {
     const img = images[imageId];
     const { extension } = img;
     const imgName = `template_${documentComponent}_${imageId}${extension}`;
     logger.debug(`Writing image ${imageId} (${imgName})...`);
     const imgPath = `${TEMPLATE_PATH}/media/${imgName}`;
     if ('file' in img) {
       zipSetStream(zip, imgPath, img.file);
     } else if (typeof img.data === 'string') {
       zip.file(imgPath, img.data, { base64: true });
     } else {
       zip.file(imgPath, img.data, { binary: true });
     }
     addChild(/* ...unchanged... */);
     delete images[imageId];
   }
   ```
   **Do not change `delete images[imageId]` to an unlink.** The spooled file must
   still exist on disk when `generateNodeStream` runs.

5. The final save (`:343-345`):
   ```typescript
   logger.debug('Zipping...');
   if (diskMode && createOptions.outputPath != null) {
     const outputPath = createOptions.outputPath;
     try {
       const bytes = await zipSaveToFile(
         zip,
         outputPath,
         createOptions.compressionLevel
       );
       return { path: outputPath, bytes };
     } catch (e) {
       // A truncated .docx is worse than no file, and we created it.
       await fs.promises.rm(outputPath, { force: true }).catch(() => undefined);
       throw e;
     }
   }
   return await zipSave(zip, createOptions.compressionLevel);
   ```

- [ ] **Step 5: Export the result type and bump the Node floor**

In `src/index.ts`:

```typescript
import type { QueryResolver, ReportFileResult } from './types';
export { createReport, QueryResolver, ReportFileResult };
```

In `package.json`, change `"engines": { "node": ">=6" }` to `">=16"`.

- [ ] **Step 6: Run the new tests, then the whole suite**

Run: `npx jest src/__tests__/diskOutput.test.ts --no-coverage`
Expected: PASS, all three.

Run: `npx jest --no-coverage`
Expected: PASS with zero snapshot writes.

- [ ] **Step 7: Document the feature in `README.md`**

Add a section after the existing options documentation:

````markdown
### Disk-backed output (Node only)

By default `createReport` returns the report as a `Uint8Array`, which means the
whole document — including every image — is held in memory. For image-heavy
reports you can have the library write to disk instead:

```js
const { path, bytes } = await createReport({
  template,
  data,
  outputPath: '/var/reports/report.docx', // enables disk-backed mode
  workDir: '/var/tmp/docx-templates',     // optional scratch root
});
```

In this mode image bytes and document XML are spooled to a scratch directory
and streamed into the zip, so peak memory no longer scales with the number of
images.

**Ownership:** you own `outputPath` — the library never deletes it after a
successful run (on failure it removes the partial file, since a truncated
`.docx` is worse than none). The library creates `<workDir>/<runId>/` and always
removes it, success or failure. Your `workDir` root itself is never removed.

**Sizing:** the scratch directory needs roughly as much free space as the total
size of your images. In constrained environments — AWS Lambda's `/tmp` defaults
to 512 MB — raise the ephemeral storage allocation accordingly.

`outputPath` is ignored in the browser build, which has no filesystem.
````

- [ ] **Step 8: Lint and commit**

```bash
yarn lint
git add src/main.ts src/index.ts package.json README.md src/__tests__/diskOutput.test.ts
git commit -m "feat: add opt-in disk-backed output via outputPath

createReport({ outputPath }) spools images and document XML to a scratch dir
and streams the zip to disk, removing the two peak-memory terms that scale
with image count. Without outputPath the in-memory path is unchanged."
```

---

### Task 7: Equivalence test suite

The load-bearing test. It is what turns "byte-identical by construction" from a
design claim into a verified property.

**Files:**
- Test: `src/__tests__/diskOutput.test.ts` (append)

**Interfaces:**
- Consumes: the full feature from Task 6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the equivalence helper and the parameterised test**

Append to `src/__tests__/diskOutput.test.ts`:

```typescript
/**
 * Unzip a docx and return a sorted map of entry name -> bytes.
 *
 * We compare UNZIPPED ENTRIES, never raw zip bytes: entry ordering, timestamps
 * and compression bookkeeping legitimately differ between the two modes, while
 * the document content must not.
 */
const entriesOf = async (data: Buffer | Uint8Array) => {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
  const out: Record<string, Buffer> = {};
  for (const n of names) out[n] = await zip.files[n].async('nodebuffer');
  return out;
};

const expectEquivalent = async (
  inMemory: Uint8Array,
  onDisk: string
): Promise<void> => {
  const a = await entriesOf(inMemory);
  const b = await entriesOf(await fs.promises.readFile(onDisk));

  expect(Object.keys(b)).toEqual(Object.keys(a));
  for (const name of Object.keys(a)) {
    // Compare with a helpful message: a bare Buffer diff is unreadable.
    expect({ name, equal: b[name].equals(a[name]) }).toEqual({
      name,
      equal: true,
    });
  }
};

describe('equivalence: disk-backed output matches in-memory output', () => {
  const png = () => fs.promises.readFile(path.join(FIXTURES, 'sample.png'));
  const svg = () => fs.promises.readFile(path.join(FIXTURES, 'sample.svg'));

  /**
   * Each case must exercise a distinct risk area:
   *  - raster images       -> the spool + lazyFileStream path
   *  - SVG + thumbnail     -> the two-entry branch in applyImageData
   *  - non-ASCII text      -> UTF-8 encoding of stream entries (Risk 4)
   *  - headers/footers     -> the secondary-XML path
   *  - no images at all    -> the pure-XML path
   */
  const cases: Array<{
    name: string;
    fixture: string;
    opts: () => Promise<Record<string, unknown>>;
  }> = [
    {
      name: 'raster image',
      fixture: 'imageSimple.docx',
      opts: async () => ({
        data: {},
        additionalJsContext: {
          injectImg: async () => ({
            width: 6,
            height: 6,
            data: await png(),
            extension: '.png',
          }),
        },
      }),
    },
    {
      name: 'SVG image with thumbnail',
      fixture: 'imagesSVG.docx',
      opts: async () => ({
        data: {},
        additionalJsContext: {
          svgImgFile: async () => ({
            width: 6,
            height: 6,
            data: await svg(),
            extension: '.svg',
            thumbnail: { data: await png(), extension: '.png' },
          }),
        },
      }),
    },
  ];

  cases.forEach(({ name, fixture, opts }) => {
    it(`produces identical entries for: ${name}`, async () => {
      const template = await fs.promises.readFile(path.join(FIXTURES, fixture));
      const base = await opts();

      const inMemory = (await createReport({
        template,
        ...base,
      } as never)) as Uint8Array;

      const dir = await mkOutDir();
      const outputPath = path.join(dir, 'report.docx');
      await createReport({
        template,
        outputPath,
        ...base,
      } as never);

      await expectEquivalent(inMemory, outputPath);
      await fs.promises.rm(dir, { recursive: true, force: true });
    });
  });

  it('produces identical entries with imageConcurrency set (parallel mode)', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const base = {
      data: {},
      imageConcurrency: 4,
      additionalJsContext: {
        injectImg: async () => ({
          width: 6,
          height: 6,
          data: await png(),
          extension: '.png',
        }),
      },
    };

    const inMemory = (await createReport({
      template,
      ...base,
    } as never)) as Uint8Array;

    const dir = await mkOutDir();
    const outputPath = path.join(dir, 'report.docx');
    await createReport({ template, outputPath, ...base } as never);

    await expectEquivalent(inMemory, outputPath);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('round-trips non-ASCII text identically', async () => {
    // for1.docx is a FOR loop over `companies` that renders each name, so the
    // non-ASCII text genuinely reaches the XML stream path. (imageSimple.docx
    // would not: it ignores `data`, so the assertion would prove nothing.)
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'for1.docx')
    );
    const base = {
      data: {
        companies: [
          { name: 'café' },
          { name: '漢字テスト' },
          { name: '“smart quotes” — em dash' },
          { name: 'Ωmega ß ü' },
        ],
      },
    };

    const inMemory = (await createReport({
      template,
      ...base,
    } as never)) as Uint8Array;

    const dir = await mkOutDir();
    const outputPath = path.join(dir, 'report.docx');
    await createReport({ template, outputPath, ...base } as never);

    await expectEquivalent(inMemory, outputPath);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the equivalence tests**

Run: `npx jest src/__tests__/diskOutput.test.ts -t "equivalence" --no-coverage`
Expected: PASS.

If an entry differs, do **not** relax the assertion. Diagnose it:
- `word/document.xml` differs → the `emitXml`/`writeXml` paths diverge, or the
  stream entry is being re-encoded (check `binary: true` in `zipSetStream`).
- a `word/media/*` entry differs → `storeImage` is mangling bytes, most likely
  the base64 branch.
- entry *names* differ → the spool filename is leaking into the zip entry name.

- [ ] **Step 3: Extend the existing image suite to cover both modes**

In `src/__tests__/images.test.ts`, the suite already parameterises over
`['noSandbox', 'sandbox']` at line 13. Add a second axis so every existing image
test also runs disk-backed. Wrap the existing `forEach` body:

```typescript
['memory', 'disk'].forEach(outputMode => {
  ['noSandbox', 'sandbox'].forEach(sbStatus => {
    // ...existing describe block, with each createReport call gaining
    //    ...(outputMode === 'disk' ? { outputPath: tmpOut() } : {})
    // and disk-mode assertions reading the file instead of the returned buffer.
  });
});
```

Because this touches many call sites, introduce one helper at the top of the
file and use it everywhere a report is generated:

```typescript
const runReport = async (
  opts: Record<string, unknown>,
  outputMode: string
): Promise<Buffer> => {
  if (outputMode === 'memory') {
    return Buffer.from((await createReport(opts as never)) as Uint8Array);
  }
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'img-'));
  const outputPath = path.join(dir, 'r.docx');
  await createReport({ ...opts, outputPath } as never);
  const buf = await fs.promises.readFile(outputPath);
  await fs.promises.rm(dir, { recursive: true, force: true });
  return buf;
};
```

Snapshot assertions stay keyed on the existing snapshot names so the committed
snapshots still apply to the `memory` axis; the `disk` axis asserts equality
against the `memory` result rather than against a new snapshot.

- [ ] **Step 4: Run the full suite**

Run: `npx jest --no-coverage`
Expected: PASS with zero snapshot writes.

- [ ] **Step 5: Lint and commit**

```bash
yarn lint
git add src/__tests__/diskOutput.test.ts src/__tests__/images.test.ts
git commit -m "test: verify disk-backed output is entry-for-entry identical

Compares unzipped entries rather than raw zip bytes, across raster images, SVG
with thumbnail, parallel mode and non-ASCII text."
```

---

### Task 8: Lifecycle and error-path tests

**Files:**
- Test: `src/__tests__/diskOutput.test.ts` (append)

**Interfaces:**
- Consumes: the full feature from Task 6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the lifecycle tests**

Append to `src/__tests__/diskOutput.test.ts`:

```typescript
describe('disk-backed lifecycle', () => {
  const png = () => fs.promises.readFile(path.join(FIXTURES, 'sample.png'));

  const baseOpts = async () => ({
    data: {},
    additionalJsContext: {
      image: async () => ({
        width: 6,
        height: 6,
        data: await png(),
        extension: '.png',
      }),
    },
  });

  it('removes its run dir on success and leaves the workDir root alone', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wd-'));
    const outDir = await mkOutDir();

    await createReport({
      template,
      outputPath: path.join(outDir, 'r.docx'),
      workDir,
      ...(await baseOpts()),
    } as never);

    // Root survives; nothing left inside it.
    expect(fs.existsSync(workDir)).toBe(true);
    expect(await fs.promises.readdir(workDir)).toEqual([]);

    await fs.promises.rm(workDir, { recursive: true, force: true });
    await fs.promises.rm(outDir, { recursive: true, force: true });
  });

  it('removes its run dir when generation fails', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wd-'));
    const outDir = await mkOutDir();

    await expect(
      createReport({
        template,
        outputPath: path.join(outDir, 'r.docx'),
        workDir,
        data: {},
        additionalJsContext: {
          injectImg: async () => {
            throw new Error('boom');
          },
        },
      } as never)
    ).rejects.toThrow();

    expect(await fs.promises.readdir(workDir)).toEqual([]);

    await fs.promises.rm(workDir, { recursive: true, force: true });
    await fs.promises.rm(outDir, { recursive: true, force: true });
  });

  it('removes the partial output file when generation fails', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const outDir = await mkOutDir();
    const outputPath = path.join(outDir, 'r.docx');

    await expect(
      createReport({
        template,
        outputPath,
        data: {},
        additionalJsContext: {
          injectImg: async () => {
            throw new Error('boom');
          },
        },
      } as never)
    ).rejects.toThrow();

    expect(fs.existsSync(outputPath)).toBe(false);
    await fs.promises.rm(outDir, { recursive: true, force: true });
  });

  it('does not let cleanup mask the original error', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const outDir = await mkOutDir();

    await expect(
      createReport({
        template,
        outputPath: path.join(outDir, 'r.docx'),
        data: {},
        additionalJsContext: {
          injectImg: async () => {
            throw new Error('the original failure');
          },
        },
      } as never)
    ).rejects.toThrow(/the original failure/);

    await fs.promises.rm(outDir, { recursive: true, force: true });
  });

  it('supports concurrent reports sharing one workDir root', async () => {
    const template = await fs.promises.readFile(
      path.join(FIXTURES, 'imageSimple.docx')
    );
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wd-'));
    const outDir = await mkOutDir();

    const runs = await Promise.all(
      [0, 1, 2, 3, 4].map(async i =>
        createReport({
          template,
          outputPath: path.join(outDir, `r${i}.docx`),
          workDir,
          ...(await baseOpts()),
        } as never)
      )
    );

    expect(runs).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(fs.existsSync(path.join(outDir, `r${i}.docx`))).toBe(true);
    }
    // Every run dir cleaned up.
    expect(await fs.promises.readdir(workDir)).toEqual([]);

    await fs.promises.rm(workDir, { recursive: true, force: true });
    await fs.promises.rm(outDir, { recursive: true, force: true });
  }, 30000);
});
```

- [ ] **Step 2: Run the lifecycle tests**

Run: `npx jest src/__tests__/diskOutput.test.ts -t "lifecycle" --no-coverage`
Expected: PASS, all five.

- [ ] **Step 3: Lint and commit**

```bash
yarn lint
git add src/__tests__/diskOutput.test.ts
git commit -m "test: cover disk-backed cleanup, failure paths and concurrency"
```

---

### Task 9: Browser isolation

`src/zip.ts` and `src/main.ts` now reference Node-only modules. Without this
task `lib/browser.js` breaks.

**Files:**
- Create: `src/diskSinks.browser.ts`
- Modify: `rollup.config.mjs`
- Modify: `package.json` (add a `checkBrowserBundle` script)

**Interfaces:**
- Consumes: the module shape of `src/diskSinks.ts` (Tasks 2-4).
- Produces: a browser build with no `fs` reference.

- [ ] **Step 1: Create the browser stub**

Create `src/diskSinks.browser.ts`. Every export must match `diskSinks.ts`'s
signature so the alias is type-compatible:

```typescript
import { Readable } from 'stream';
import { Node } from './types';
import { Image, SpooledImage } from './types';
import { XmlOptions } from './xml';

const unsupported = (): never => {
  throw new Error(
    'docx-templates: disk-backed output is not supported in the browser. ' +
      'Omit the `outputPath` option to receive the report as a Uint8Array.'
  );
};

export function lazyFileStream(_filePath: string): Readable {
  return unsupported();
}

export async function makeRunDir(_workDir?: string): Promise<string> {
  return unsupported();
}

export async function cleanupRunDir(_runDir: string | undefined): Promise<void> {
  // No-op: nothing is ever created in the browser.
}

export async function writeXml(
  _node: Node,
  _options: XmlOptions,
  _dest: string
): Promise<void> {
  return unsupported();
}

export async function storeImage(
  _runDir: string | undefined,
  _id: string,
  img: Image
): Promise<Image | SpooledImage> {
  return img;
}
```

- [ ] **Step 2: Alias the module in `rollup.config.mjs`**

Extend the existing `module-map` plugin at `rollup.config.mjs:36-46`:

```javascript
    {
      name: 'module-map',
      resolveId(id, importer) {
        if (id === 'vm') {
          return this.resolve('vm-browserify')
        }
        if (id === 'stream') {
          return this.resolve('stream-browserify')
        }
        if (id === './diskSinks' || id.endsWith('/diskSinks')) {
          return this.resolve('./src/diskSinks.browser.ts', importer, { skipSelf: true })
        }
        if (id === 'fs' || id === 'fs/promises' || id === 'stream/promises' || id === 'crypto' || id === 'os' || id === 'path') {
          // Reachable only from disk-backed code paths the browser never runs.
          return { id, external: false, moduleSideEffects: false }
        }
      }
    }
```

If the `fs`/`os`/`path` branch proves insufficient (Rollup will warn about
unresolved imports), the fallback is to move `zipSaveToFile` into `diskSinks.ts`
so `src/zip.ts` has no Node imports at all, and have `main.ts` call it through
the same dynamic import. Prefer that fallback over adding polyfill packages — it
is a cleaner boundary and adds no dependency.

- [ ] **Step 3: Add the CI assertion script**

In `package.json` scripts:

```json
    "checkBrowserBundle": "node -e \"const s=require('fs').readFileSync('./lib/browser.js','utf8'); const bad=[/require\\\\(['\\\"]fs['\\\"]\\\\)/,/from['\\\" ]*['\\\"]node:fs['\\\"]/,/require\\\\(['\\\"]node:fs['\\\"]\\\\)/].filter(r=>r.test(s)); if(bad.length){console.error('FAIL: browser bundle references fs');process.exit(1)} console.log('OK: browser bundle is fs-free')\"",
```

and chain it after the bundle step:

```json
    "rollup": "rollup -c && yarn checkBrowserBundle",
```

- [ ] **Step 4: Build and verify**

Run: `yarn compile`
Expected: TypeScript compiles, Rollup emits `lib/browser.js`, and the final line
is `OK: browser bundle is fs-free`.

- [ ] **Step 5: Lint and commit**

```bash
yarn lint
git add src/diskSinks.browser.ts rollup.config.mjs package.json
git commit -m "build: keep fs out of the browser bundle

Aliases diskSinks to a throwing browser stub and adds a build assertion that
fails if lib/browser.js ever references fs."
```

---

### Task 10: Memory and time guards

Answers the originating questions 3 and 4 as automated regressions.

**Files:**
- Create: `src/__tests__/diskOutput.perf.test.ts`
- Create: `src/__tests__/helpers/generateManyImages.ts`

**Interfaces:**
- Consumes: the full feature from Task 6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the child-process harness**

Create `src/__tests__/helpers/generateManyImages.ts`. It is run as a script by
the test, not imported.

It uses `sandbox_loop_image_template.docx` with the exact `items`/`rows`/
`cmdDelimiter` shape from the passing test at `images.test.ts:820-848`, so the
template is known to render. Memory pressure is scaled by **image size**, not
image count — that keeps the harness independent of the fixture's loop
structure while exercising the identical code path (bytes resident in
`ctx.images` vs spooled to disk).

```typescript
/**
 * Generates a report whose images total roughly `sizeMb * imageCount`, under
 * whatever heap ceiling the parent imposed via --max-old-space-size.
 *
 * Usage: node --max-old-space-size=N -r ts-node/register \
 *          generateManyImages.ts <mode> <mbPerImage> [outPath]
 *   mode: 'memory' | 'disk'
 */
import path from 'path';
import fs from 'fs';
import { createReport } from '../../index';

async function main() {
  const [mode, mbRaw, outPath] = process.argv.slice(2);
  const mbPerImage = Number(mbRaw);
  const fixtures = path.join(__dirname, '..', 'fixtures');
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
  // and each one must be independently resident or independently spooled.
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
```

- [ ] **Step 2: Write the guard tests**

Create `src/__tests__/diskOutput.perf.test.ts`:

```typescript
/* eslint-env jest */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';

const HELPER = path.join(__dirname, 'helpers', 'generateManyImages.ts');
const MB_PER_IMAGE = 12;     // x6 images in the fixture = ~72MB of image bytes
const HEAP_CEILING_MB = 160; // above the XML tree, below the resident images

const run = (mode: string, heapMb: number, outPath?: string) =>
  execFileSync(
    process.execPath,
    [
      `--max-old-space-size=${heapMb}`,
      '-r',
      'ts-node/register',
      HELPER,
      mode,
      String(MB_PER_IMAGE),
      outPath ?? '',
    ],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  );

describe('disk-backed memory and time guards', () => {
  jest.setTimeout(600000);

  it('completes under a heap ceiling the in-memory mode cannot meet', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'perf-'));
    const out = path.join(dir, 'r.docx');

    // Disk-backed must succeed under the ceiling.
    expect(() => run('disk', HEAP_CEILING_MB, out)).not.toThrow();
    expect((await fs.promises.stat(out)).size).toBeGreaterThan(0);

    // In-memory must fail under the same ceiling. If this ever stops throwing,
    // the ceiling is too generous and the test has stopped proving anything --
    // raise MB_PER_IMAGE or lower HEAP_CEILING_MB rather than deleting it.
    expect(() => run('memory', HEAP_CEILING_MB)).toThrow();

    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('is no more than 25% slower than the in-memory mode', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'perf-'));
    const out = path.join(dir, 'r.docx');
    const generous = 2048;

    const memMs = JSON.parse(run('memory', generous)).ms;
    const diskMs = JSON.parse(run('disk', generous, out)).ms;

    expect(diskMs).toBeLessThanOrEqual(memMs * 1.25);

    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run the guards**

Run: `npx jest src/__tests__/diskOutput.perf.test.ts --no-coverage`
Expected: PASS, both.

If the memory test's in-memory run unexpectedly *succeeds*, raise
`MB_PER_IMAGE` (or lower `HEAP_CEILING_MB`) until it fails — the test only
proves something when the ceiling genuinely excludes the in-memory mode. The
harness prints the image count it actually served, so check that first: if it
is 0, the fixture's commands are not firing and the test is measuring nothing.

- [ ] **Step 4: Exclude the perf suite from the default run**

These tests take minutes. In `package.json`'s `jest` block, narrow `testRegex`
so perf tests are opt-in:

```json
    "testRegex": "src/.*__tests__/.*(?<!\\.perf)\\.(test|spec)\\.(ts|tsx)$",
```

and add a script:

```json
    "testPerf": "jest --no-coverage --testRegex 'src/.*__tests__/.*\\.perf\\.test\\.ts$'",
```

- [ ] **Step 5: Run the whole default suite one final time**

Run: `yarn lint && npx jest --no-coverage`
Expected: PASS with zero snapshot writes, perf suite skipped.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/diskOutput.perf.test.ts src/__tests__/helpers/generateManyImages.ts package.json
git commit -m "test: add memory ceiling and generation time guards

Runs generation in a child process under --max-old-space-size and asserts the
disk-backed mode fits where the in-memory mode cannot, plus a 1.25x wall-clock
ceiling. Opt-in via yarn testPerf."
```

---

## Acceptance

The unit and integration tests above do not close out the originating questions
on their own. Before shipping, run the production template
(~8000 images / 1700 pages) in both modes and record peak RSS and wall clock.

Targets from `01-problem.md`:
- peak memory: ~1.0-1.1 GB → ~150-250 MB
- wall clock: within 125% of the current implementation

If peak memory lands materially above 250 MB, the remaining term is the output
XML node tree, which is explicitly out of scope for this project — record the
measurement and open a separate piece of work rather than extending this one.

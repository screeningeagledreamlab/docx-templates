/* eslint-env jest */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';

const REPO_ROOT = path.join(__dirname, '..', '..');
const HELPER_RELATIVE = path.join('__tests__', 'helpers', 'generateManyImages');

// --- Why this guard uses `ulimit -v` instead of `--max-old-space-size` -----
//
// The brief for this test originally called for constraining the child
// process with `node --max-old-space-size=N`. That flag only bounds V8's own
// JS heap (the "old space"). Node's `Buffer.alloc`/`ArrayBuffer` backing
// stores are allocated through the embedder's ArrayBuffer allocator (plain
// malloc), which lives OUTSIDE that heap entirely. Empirically (see the task
// report), raising the per-image buffer size from 12MB up to 500MB per image
// (2.5GB total across the 5 images the fixture renders) under an
// `--max-old-space-size=16` ceiling still completed successfully in the
// in-memory mode -- the flag never engages for buffer-dominated memory, so it
// cannot discriminate the two modes no matter how it's tuned.
//
// What *does* bound total resident buffer memory is the process's virtual
// address space, so this guard constrains that instead via `ulimit -v`
// (POSIX, verified on Linux). The in-memory mode holds every image
// simultaneously resident until the final zip is generated; the disk-backed
// mode spools each one to disk as it is produced, so only ~one image's worth
// of buffer is ever resident at a time. Scaling image size exploits exactly
// that gap.
const VM_CEILING_KB = 2_000_000; // ~1.9 GiB of virtual address space
const MB_PER_IMAGE_CEILING = 300; // fixture renders 5 images => ~1.5GB if all resident at once

// The wall-clock guard doesn't need memory pressure, just the same code path,
// so it uses a much smaller (and faster) image size.
const MB_PER_IMAGE_TIMING = 12;

/**
 * Compiles the whole `src` tree (via the project's own tsconfig, so a type
 * error in the helper fails this exactly like ts-jest would) to a scratch
 * directory, so the helper can be executed directly with plain `node` --
 * no `ts-node` is a project dependency here, and installing one just for this
 * child process was avoidable by compiling once up front instead.
 */
function compileHelper(outDir: string): string {
  execFileSync(
    path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc'),
    ['--outDir', outDir, '--declaration', 'false', '--sourceMap', 'false'],
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return path.join(outDir, `${HELPER_RELATIVE}.js`);
}

let helperJs: string;
let scratchBuildDir: string;

// A failed memory allocation is a JS-catchable RangeError from V8 (via
// Buffer.alloc/getImage) or an OS-level "can't allocate" message, depending
// on exactly where in the pipeline the ulimit bites. Either way it must say
// something about memory -- this intentionally does NOT pin one exact string,
// so a differently-worded allocation failure still satisfies it, but an
// unrelated crash (broken NODE_PATH, a module-resolution error, a bug in the
// scratch build, or a future regression that makes the in-memory path throw
// for some other reason) does not.
const MEMORY_FAILURE_PATTERN =
  /Array buffer allocation failed|out of memory|Cannot allocate memory/i;

type ChildProcessError = Error & {
  stderr?: Buffer | string;
  status?: number | null;
};

/**
 * Runs `run(...)`, asserting that the child process fails, and returns its
 * captured stderr so the caller can assert on *why* it failed rather than
 * just that it did. A bare `.toThrow()` can't tell a genuine memory failure
 * apart from a broken test harness (bad NODE_PATH, a compile error, a module
 * that fails to resolve) -- all of those would also make the process exit
 * non-zero, and all of them would make this test pass while proving nothing.
 */
function runExpectingMemoryFailure(
  mode: 'memory' | 'disk',
  mbPerImage: number,
  outPath: string,
  vmCeilingKb: number
): string {
  let err: ChildProcessError;
  try {
    const result = run(mode, mbPerImage, outPath, vmCeilingKb);
    throw new Error(
      `Expected the '${mode}' run to fail under a ${vmCeilingKb}KB virtual-memory ` +
        `ceiling, but it completed successfully with: ${result}`
    );
  } catch (e) {
    err = e as ChildProcessError;
  }
  if (err.stderr == null) {
    // Not a child-process failure at all (e.g. our own throw above, or
    // execFileSync rejecting before it could even spawn) -- surface it as-is
    // rather than masking it as a stderr-pattern mismatch.
    throw err;
  }
  const stderr = err.stderr.toString();
  if (!MEMORY_FAILURE_PATTERN.test(stderr)) {
    throw new Error(
      `The '${mode}' run failed (as expected), but not with a recognizable ` +
        `memory-allocation failure (expected to match ${MEMORY_FAILURE_PATTERN}). ` +
        `This could mean the ceiling is failing the run for an unrelated reason ` +
        `(a broken NODE_PATH, a module-resolution error, a bug in the scratch ` +
        `build, or a regression in the in-memory path). Captured stderr:\n\n${stderr}`
    );
  }
  return stderr;
}

/**
 * Runs the compiled helper in a child process. When `vmCeilingKb` is given,
 * the child's virtual address space is capped with `ulimit -v` before `node`
 * is exec'd, via positional shell parameters (no string interpolation) so
 * paths need no manual quoting.
 */
function run(
  mode: 'memory' | 'disk',
  mbPerImage: number,
  outPath: string,
  vmCeilingKb?: number
): string {
  // NODE_PATH lets the scratch-compiled helper resolve dependencies like
  // jszip from the project's real node_modules, since it lives outside it.
  const env = {
    ...process.env,
    NODE_PATH: path.join(REPO_ROOT, 'node_modules'),
  };
  const nodeArgs = [helperJs, mode, String(mbPerImage), outPath];
  if (vmCeilingKb == null) {
    return execFileSync(process.execPath, nodeArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return execFileSync(
    'bash',
    [
      '-c',
      'ulimit -v "$1"; shift; exec "$@"',
      'bash',
      String(vmCeilingKb),
      process.execPath,
      ...nodeArgs,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
}

describe('disk-backed memory and time guards', () => {
  jest.setTimeout(600000);

  beforeAll(() => {
    scratchBuildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-build-'));
    helperJs = compileHelper(scratchBuildDir);
  });

  afterAll(() => {
    fs.rmSync(scratchBuildDir, { recursive: true, force: true });
  });

  it('completes under a virtual-memory ceiling the in-memory mode cannot meet', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
    const out = path.join(dir, 'r.docx');

    // Disk-backed must succeed under the ceiling.
    const diskResult = JSON.parse(
      run('disk', MB_PER_IMAGE_CEILING, out, VM_CEILING_KB)
    );
    // The fixture must actually have fired its IMAGE commands -- otherwise
    // both modes would trivially "pass" while measuring nothing.
    expect(diskResult.images).toBeGreaterThan(0);
    expect(fs.statSync(out).size).toBeGreaterThan(0);

    // In-memory must fail under the same ceiling, AND fail for the right
    // reason: a genuine memory-allocation failure, not an unrelated crash. If
    // this ever stops throwing, or starts throwing for some other reason, the
    // ceiling/image size no longer separates the two modes on the basis this
    // test claims -- raise MB_PER_IMAGE_CEILING or lower VM_CEILING_KB rather
    // than deleting this assertion.
    runExpectingMemoryFailure(
      'memory',
      MB_PER_IMAGE_CEILING,
      '',
      VM_CEILING_KB
    );

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is no more than 25% slower than the in-memory mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
    const out = path.join(dir, 'r.docx');

    const memResult = JSON.parse(run('memory', MB_PER_IMAGE_TIMING, ''));
    const diskResult = JSON.parse(run('disk', MB_PER_IMAGE_TIMING, out));

    expect(memResult.images).toBeGreaterThan(0);
    expect(diskResult.images).toBeGreaterThan(0);
    expect(diskResult.ms).toBeLessThanOrEqual(memResult.ms * 1.25);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

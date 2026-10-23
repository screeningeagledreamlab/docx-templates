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
function compileHelper(): string {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-build-'));
  execFileSync(
    path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc'),
    ['--outDir', outDir, '--declaration', 'false', '--sourceMap', 'false'],
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return path.join(outDir, `${HELPER_RELATIVE}.js`);
}

let helperJs: string;

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
    helperJs = compileHelper();
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

    // In-memory must fail under the same ceiling. If this ever stops
    // throwing, the ceiling/image size no longer separates the two modes --
    // raise MB_PER_IMAGE_CEILING or lower VM_CEILING_KB rather than deleting
    // this assertion.
    expect(() =>
      run('memory', MB_PER_IMAGE_CEILING, '', VM_CEILING_KB)
    ).toThrow();

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

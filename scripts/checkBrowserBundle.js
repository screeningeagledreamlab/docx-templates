#!/usr/bin/env node
/**
 * CI guard: fail the build if the browser bundle contains a reference to any
 * of the Node.js built-ins that src/diskSinks.ts imports.
 *
 * The browser build (src/browser.ts) must never pull in `fs`, `fs/promises`,
 * `stream/promises`, `crypto`, `os`, or `path` -- it reaches ./diskSinks only
 * through a dynamic import that rollup's disk-sinks-browser-stub plugin
 * redirects to src/diskSinks.browser.ts (see rollup.config.mjs), which throws
 * instead of touching any of them. If that redirection ever breaks -- a
 * config regression, a new static import of diskSinks.ts from a
 * browser-reachable module, a new Node builtin added to diskSinks.ts, etc. --
 * the bundle would silently pull one of these in, which has no browser
 * equivalent, and fail (or misbehave) at runtime in a browser. Catch that
 * here instead, at build time.
 *
 * Covers both CommonJS and ESM forms rollup/esbuild might emit, with or
 * without the `node:` protocol prefix, for bare and subpath specifiers alike:
 *   require('fs')              require("node:fs")
 *   require('fs/promises')     require("node:fs/promises")
 *   from 'stream/promises'     from "node:stream/promises"
 *   from 'crypto'              from "node:os"              etc.
 *
 * Anchored on the require(...)/from '...' syntax (not a bare word search) so
 * incidental occurrences of e.g. "os" or "path" inside identifiers or string
 * literals elsewhere in the bundle don't false-positive.
 */
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, '..', 'lib', 'browser.js');

// Every Node builtin src/diskSinks.ts imports. Longest-specifier-first so a
// human reading the list sees the subpath forms are deliberate, though the
// trailing quote in NODE_BUILTIN_REFERENCE makes match order irrelevant to
// correctness: "fs/promises" can never be matched by the "fs" alternative,
// since quote-fs(end) would need to immediately follow "fs", not "/".
const NODE_BUILTINS = ['fs/promises', 'stream/promises', 'fs', 'crypto', 'os', 'path'];

const NODE_BUILTIN_REFERENCE = new RegExp(
  `\\b(?:require\\(\\s*['"](?:node:)?(${NODE_BUILTINS.join(
    '|'
  )})['"]\\s*\\)|from\\s*['"](?:node:)?(${NODE_BUILTINS.join('|')})['"])`
);

function main() {
  let contents;
  try {
    contents = fs.readFileSync(target, 'utf-8');
  } catch (e) {
    console.error(`checkBrowserBundle: could not read ${target}: ${e.message}`);
    process.exit(1);
  }

  const match = NODE_BUILTIN_REFERENCE.exec(contents);
  if (match) {
    const builtin = match[1] || match[2];
    console.error(
      `checkBrowserBundle: found a reference to the Node.js "${builtin}" module ` +
        `in ${target}: ${JSON.stringify(match[0])}\n` +
        'The browser bundle must never depend on Node.js built-ins. Check that ' +
        "./diskSinks is still being redirected to src/diskSinks.browser.ts by the " +
        'disk-sinks-browser-stub plugin in rollup.config.mjs, and that every ' +
        'builtin diskSinks.ts imports is listed in NODE_BUILTINS above.'
    );
    process.exit(1);
  }

  console.log(`checkBrowserBundle: ${target} is clean of Node.js builtin references.`);
}

main();

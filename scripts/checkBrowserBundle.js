#!/usr/bin/env node
/**
 * CI guard: fail the build if the browser bundle contains a reference to the
 * Node.js `fs` module.
 *
 * The browser build (src/browser.ts) must never pull in `fs` -- it reaches
 * ./diskSinks only through a dynamic import that rollup's
 * disk-sinks-browser-stub plugin redirects to src/diskSinks.browser.ts (see
 * rollup.config.mjs), which throws instead of touching the filesystem. If
 * that redirection ever breaks -- a config regression, a new static import of
 * diskSinks.ts from a browser-reachable module, etc. -- the bundle would
 * silently pull in Node's `fs`, which has no browser equivalent, and fail (or
 * misbehave) at runtime in a browser. Catch that here instead, at build time.
 *
 * Covers both CommonJS and ESM forms rollup/esbuild might emit, with or
 * without the `node:` protocol prefix:
 *   require('fs')        require("fs")
 *   require('node:fs')    require("node:fs")
 *   from 'fs'             from "fs"
 *   from 'node:fs'         from "node:fs"
 */
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, '..', 'lib', 'browser.js');

const FS_REFERENCE =
  /\b(?:require\(\s*['"](?:node:)?fs['"]\s*\)|from\s*['"](?:node:)?fs['"])/;

function main() {
  let contents;
  try {
    contents = fs.readFileSync(target, 'utf-8');
  } catch (e) {
    console.error(`checkBrowserBundle: could not read ${target}: ${e.message}`);
    process.exit(1);
  }

  const match = FS_REFERENCE.exec(contents);
  if (match) {
    console.error(
      `checkBrowserBundle: found a reference to the "fs" module in ${target}: ${JSON.stringify(
        match[0]
      )}\n` +
        'The browser bundle must never depend on Node.js built-ins. Check that ' +
        "./diskSinks is still being redirected to src/diskSinks.browser.ts by the " +
        'disk-sinks-browser-stub plugin in rollup.config.mjs.'
    );
    process.exit(1);
  }

  console.log(`checkBrowserBundle: ${target} is clean of "fs" references.`);
}

main();

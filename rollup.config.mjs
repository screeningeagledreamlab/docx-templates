import replace from '@rollup/plugin-replace'
import esbuild from 'rollup-plugin-esbuild'
import node from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import dts from 'rollup-plugin-dts'
import { defineConfig } from 'rollup'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// src/main.ts reaches ./diskSinks through a dynamic import, taken only when the
// Node-only `outputPath` option is set. diskSinks.ts imports fs/path/crypto/os,
// which have no browser equivalent, so the browser build swaps in
// src/diskSinks.browser.ts -- a real, type-checked stub whose exports all throw
// -- if that code path is ever reached. Without this the bundle pulls in those
// Node builtins (unresolved) and the dynamic import also forces rollup to emit
// a second chunk, which `output.file` cannot express.
//
// The substitute is a real TS file (rather than a hand-maintained template
// string) with a compile-time shape guard against diskSinks.ts, so an export
// added to one without the other fails `tsc`, not just the browser bundle.
const DISK_SINKS_BROWSER_STUB = path.resolve(__dirname, 'src/diskSinks.browser.ts')

export default defineConfig([{
  input: './src/browser.ts',
  output: {
    file: './lib/browser.js',
    format: 'es',
    exports: 'named',
    sourcemap: true,
    // The stub above is the only dynamic import in the graph; inlining it keeps
    // the browser build a single file.
    inlineDynamicImports: true
  },
  plugins: [
    // Must come before node-resolve, which would otherwise resolve
    // './diskSinks' to the real module and pull Node builtins in with it.
    {
      name: 'disk-sinks-browser-stub',
      resolveId(id) {
        if (id === './diskSinks') {
          return DISK_SINKS_BROWSER_STUB
        }
      }
    },
    node({
      preferBuiltins: false
    }),
    commonjs(),
    // Set some node specific globals
    replace({
      preventAssignment: true,
      values: {
        'process.env.NODE_DEBUG': false,
        'process.pid': 42,
        'process.nextTick': 'setTimeout',
        'process.stdout': 'null',
        'process.stderr': 'null',
        'process.env.READABLE_STREAM': 'false',
        'process.browser': 'true',
        'process.env.NODE_ENV': '"production"',
        'process': 'undefined'
      }
    }),
    esbuild({
      target: 'es2017',
      minify: true
    }),
    // Map modules to polyfill
    {
      name: 'module-map',
      resolveId(id) {
        if (id === 'vm') {
          return this.resolve('vm-browserify')
        }
        if (id === 'stream') {
          return this.resolve('stream-browserify')
        }
      }
    }
  ]
}, {
  input: './lib/index.d.ts',
  output: { file: './lib/bundled.d.ts', format: 'es' },
  plugins: [
    dts({ respectExternal: true }),
    {
      renderChunk(code) {
        return 'type Buffer = ArrayBufferLike;\n'+ code.split('\n').slice(1).join('\n')
      }
    }
  ],
  external: (id) =>
    // To prevent warning. If `import ... from 'stream'` exists in bundled.d.ts this build has to be changed to remove it.
    id === 'stream' ||
    // Context.disk (types.ts) is typed as `typeof import('./diskSinks')`, a
    // type-only reference that is erased at runtime and not part of the
    // public API (Context itself is internal, and no exported symbol's type
    // depends on it). But rollup-plugin-dts still resolves it as a real
    // module edge, creating a types.d.ts <-> diskSinks.d.ts cycle that trips
    // a CJS-interop bug in this version of the plugin when it tries to inline
    // diskSinks.d.ts's own `import JSZip from 'jszip'`
    // (RollupError: "Invalid value false for option output.interop").
    // diskSinks.d.ts is never part of the public type surface, so excluding
    // it from the bundle entirely sidesteps the bug without changing what
    // bundled.d.ts declares.
    /diskSinks(\.browser)?\.d\.ts$/.test(id)
}])

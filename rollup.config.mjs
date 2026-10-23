import replace from '@rollup/plugin-replace'
import esbuild from 'rollup-plugin-esbuild'
import node from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import dts from 'rollup-plugin-dts'
import { defineConfig } from 'rollup'

// src/main.ts reaches ./diskSinks through a dynamic import, taken only when the
// Node-only `outputPath` option is set. diskSinks.ts imports fs/path/crypto/os,
// which have no browser equivalent, so the browser build swaps in a stub that
// throws if that code path is ever reached. Without this the bundle pulls in
// those Node builtins (unresolved) and the dynamic import also forces rollup to
// emit a second chunk, which `output.file` cannot express.
const DISK_SINKS_STUB = '\0docx-templates:disk-sinks-stub'

const DISK_SINKS_STUB_SOURCE = `
const unsupported = () => {
  throw new Error(
    'docx-templates: disk-backed output (the outputPath option) requires Node.js and is not available in the browser build.'
  )
}
export const lazyFileStream = unsupported
export const makeRunDir = unsupported
export const cleanupRunDir = unsupported
export const writeXml = unsupported
export const storeImage = unsupported
export const zipSetStream = unsupported
export const zipSaveToFile = unsupported
export const assertOutputDirExists = unsupported
export const xmlSpoolPath = unsupported
export const removeFile = unsupported
`

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
          return DISK_SINKS_STUB
        }
      },
      load(id) {
        if (id === DISK_SINKS_STUB) {
          return DISK_SINKS_STUB_SOURCE
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
  external: [
    // To prevent warning. If `import ... from 'stream'` exists in bundled.d.ts this build has to be changed to remove it.
    'stream'
  ]
}])

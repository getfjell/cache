import * as esbuild from 'esbuild'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'

const external = [
  // All @fjell packages explicitly
  '@fjell/client-api',
  '@fjell/core',
  '@fjell/http-api',
  '@fjell/logging',
  '@fjell/registry',
  // Node.js built-ins
  'path', 'fs', 'util', 'events', 'stream', 'crypto', 'url', 'querystring',
  'http', 'https', 'zlib', 'buffer', 'process', 'os', 'child_process',
  'cluster', 'dgram', 'dns', 'domain', 'module', 'net', 'readline', 'repl',
  'string_decoder', 'sys', 'timers', 'tls', 'tty', 'v8', 'vm', 'worker_threads'
]

const isWatch = process.argv.includes('--watch')

const buildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'node',
  outdir: 'dist',
  outExtension: { '.js': '.js' },
  external,
  sourcemap: true,
  preserveSymlinks: false,
  metafile: true,
}

async function generateTypes() {
  console.log('Generating TypeScript declarations...')

  // Create a temporary tsconfig for building types
  const tempTsConfig = {
    extends: './tsconfig.json',
    compilerOptions: {
      declaration: true,
      emitDeclarationOnly: true,
      outDir: './dist',
      rootDir: './src'
    },
    include: ['./src/**/*.ts'],
    exclude: ['./tests/**/*.ts', './examples/**/*.ts', './docs/**/*.ts']
  }

  writeFileSync('./tsconfig.build.json', JSON.stringify(tempTsConfig, null, 2))

  try {
    execSync('tsc --project tsconfig.build.json', { stdio: 'inherit' })
  } finally {
    // Clean up temp config
    execSync('rm -f tsconfig.build.json', { stdio: 'ignore' })
  }
}

async function build() {
  try {
    await generateTypes()

    if (isWatch) {
      console.log('Building in watch mode...')
      const ctx = await esbuild.context(buildOptions)
      await ctx.watch()
      console.log('Watching for changes...')
    } else {
      console.log('Building...')
      const result = await esbuild.build(buildOptions)
      console.log('Build complete!')

      if (result.metafile) {
        const analysis = await esbuild.analyzeMetafile(result.metafile)
        console.log(analysis)
      }
    }
  } catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
  }
}

build()

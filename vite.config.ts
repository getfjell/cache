// import { defineConfig } from 'vite';
import * as path from 'path';
import dts from 'vite-plugin-dts';
import { VitePluginNode } from 'vite-plugin-node';
import { defineConfig as defineVitestConfig } from 'vitest/config';

export default defineVitestConfig({
  server: {
    port: 3000
  },
  plugins: [
    ...VitePluginNode({
      adapter: 'express',
      appPath: './src/index.ts',
      exportName: 'viteNodeApp',
      tsCompiler: 'swc',
    }),
    // visualizer({
    //     template: 'network',
    //     filename: 'network.html',
    //     projectRoot: process.cwd(),
    // }),
    dts({
      entryRoot: 'src',
      outDir: 'dist',
      exclude: ['./tests/**/*.ts'],
      include: ['./src/**/*.ts'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    lib: {
      entry: './src/index.ts',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      input: 'src/index.ts',
      external: [
        // Fjell dependencies
        '@fjell/client-api',
        '@fjell/core',
        '@fjell/http-api',
        '@fjell/logging',
        // Node.js built-ins
        'path',
        'fs',
        'util',
        'events',
        'stream',
        'crypto',
        'url',
        'querystring',
        'http',
        'https',
        'zlib',
        'buffer',
        'process',
        'os',
        'child_process',
        'cluster',
        'dgram',
        'dns',
        'domain',
        'module',
        'net',
        'readline',
        'repl',
        'string_decoder',
        'sys',
        'timers',
        'tls',
        'tty',
        'v8',
        'vm',
        'worker_threads'
      ],
      output: [
        {
          format: 'esm',
          entryFileNames: '[name].es.js',
          preserveModules: true,
          exports: 'named',
          sourcemap: 'inline',
        },
        {
          format: 'cjs',
          entryFileNames: '[name].cjs.js',
          preserveModules: true,
          exports: 'named',
          sourcemap: 'inline',
        },
      ],
    },
    // Make sure Vite generates ESM-compatible code
    modulePreload: false,
    minify: false,
    sourcemap: true
  },
});
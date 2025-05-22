// import { defineConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';
import { VitePluginNode } from 'vite-plugin-node';
import dts from 'vite-plugin-dts';
import path from 'path';

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
  test: {
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'tests/',
        'src/index.ts',
      ],
      thresholds: {
        global: {
          branches: 75,
          functions: 89,
          lines: 89,
          statements: 89,
        },
      },
    },
    environment: 'node',
  },
});
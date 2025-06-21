import { defineConfig } from 'vitest/config'
import * as path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'src/index.ts',
        'eslint.config.mjs',
        'vite.config.ts',
        'vitest.config.ts',
        'dist',
      ],
      thresholds: {
        lines: 89,
        functions: 85,
        branches: 94,
        statements: 89,
      },
    },
    setupFiles: ['./tests/setup.ts'],
    deps: {
      inline: [/@fjell/],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: true,
  },
})
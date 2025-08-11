import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Re-enable LocalStorageCacheMap test after fixes
    // Using default threads pool for now until serialization issues are fully resolved
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'src/index.ts',
        'eslint.config.mjs',
        'vitest.config.ts',
        'build.js',
        'dist',
        'docs',
        'coverage',
        'fjell-cache/coverage',
      ],
      thresholds: {
        lines: 83,
        functions: 83,
        branches: 83,
        statements: 83,
      },
    },
    setupFiles: ['./tests/setup.ts'],
    server: {
      deps: {
        inline: [/@fjell/],
      },
    },
    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 15000,
  },
  build: {
    sourcemap: true,
  },
})

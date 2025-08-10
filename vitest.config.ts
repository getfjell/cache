import { defineConfig } from 'vitest/config'

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
        'vitest.config.ts',
        'build.js',
        'dist',
        'docs',
        'coverage',
        'fjell-cache/coverage',
      ],
      thresholds: {
        lines: 87,
        functions: 87,
        branches: 87,
        statements: 87,
      },
    },
    setupFiles: ['./tests/setup.ts'],
    server: {
      deps: {
        inline: [/@fjell/],
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
  },
  build: {
    sourcemap: true,
  },
})

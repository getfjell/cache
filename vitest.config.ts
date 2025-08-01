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
      ],
      thresholds: {
        lines: 89,
        functions: 85,
        branches: 92,
        statements: 89,
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

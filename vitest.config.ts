import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/browser/**/*.test.ts'], // Temporarily exclude browser tests due to Buffer serialization issues
    // Separate configurations for different test environments
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
        lines: 81,
        functions: 75,
        branches: 83,
        statements: 81,
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
    // Suppress stderr output for expected test errors
    silent: false,
    reporters: ['default'],
    // Filter out expected error messages from stderr
    onConsoleLog(log, type) {
      if (type === 'stderr' && (
        log.includes('Validating PK, Item is undefined') ||
        log.includes('api.httpGet is not a function')
      )) {
        return false; // Suppress these expected error messages
      }
      return true;
    }
  },
  build: {
    sourcemap: true,
  },
})

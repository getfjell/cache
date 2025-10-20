import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/browser/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 15000,
    silent: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'tests/**',
        'src/index.ts',
        '**/*.d.ts',
        'dist/**',
        'build.js',
        'docs/**',
        'coverage/**',
        'eslint.config.mjs',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 81,
        functions: 75,
        branches: 83,
        statements: 81,
      },
    },
    server: {
      deps: {
        inline: [/@fjell/],
      },
    },
    // Filter out expected error messages from stderr
    onConsoleLog(log, type) {
      if (type === 'stderr' && (
        log.includes('Validating PK, Item is undefined') ||
        log.includes('api.httpGet is not a function')
      )) {
        return false;
      }
      return true;
    },
  },
  build: {
    sourcemap: true,
  },
});

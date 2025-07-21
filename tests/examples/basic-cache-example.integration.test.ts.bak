import { afterEach, describe, expect, it } from 'vitest';
import {
  expectNoErrors,
  getLogOutput,
  restoreConsole,
  setupConsoleCapture
} from './test-helpers';
import { runBasicCacheExample } from '../../examples/basic-cache-example';

describe('Basic Cache Example Integration Tests', () => {
  const testConsole = setupConsoleCapture();

  afterEach(() => {
    restoreConsole(testConsole);
    // Clear captured logs for next test
    testConsole.logs.length = 0;
    testConsole.errors.length = 0;
  });

  describe('Basic Cache Operations Example', () => {
    it('should run basic cache example without errors', async () => {
      // Execute the actual example function
      await expect(runBasicCacheExample()).resolves.not.toThrow();

      // Verify expected output from the real example
      const logOutput = getLogOutput(testConsole);
      expect(logOutput).toContain('Fjell-Cache Basic Example');
      expect(logOutput).toContain('🚀');
      expect(logOutput).toContain('Cache creation with registry and instances');
      expect(logOutput).toContain('Basic Cache Example Complete!');

      // Should have no errors
      expectNoErrors(testConsole);
    });
  });
});

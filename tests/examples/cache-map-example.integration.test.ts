import { afterEach, describe, expect, it } from 'vitest';
import {
  expectNoErrors,
  getLogOutput,
  restoreConsole,
  setupConsoleCapture
} from './test-helpers';
import { runCacheMapExample } from '../../examples/cache-map-example';

describe('Cache Map Example Integration Tests', () => {
  const testConsole = setupConsoleCapture();

  afterEach(() => {
    restoreConsole(testConsole);
    // Clear captured logs for next test
    testConsole.logs.length = 0;
    testConsole.errors.length = 0;
  });

  describe('Direct Cache Map Operations Example', () => {
    it('should run cache map example without errors', async () => {
      // Execute the actual example function
      await expect(runCacheMapExample()).resolves.not.toThrow();

      // Verify expected output from the real example
      const logOutput = getLogOutput(testConsole);
      expect(logOutput).toContain('Fjell-Cache CacheMap Example');
      expect(logOutput).toContain('🚀');
      expect(logOutput).toContain('Direct CacheMap instantiation and management');
      expect(logOutput).toContain('CacheMap Example Complete!');

      // Should have no errors
      expectNoErrors(testConsole);
    });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import {
  expectNoErrors,
  getLogOutput,
  restoreConsole,
  setupConsoleCapture
} from './test-helpers';
import { runAggregatorExample } from '../../examples/aggregator-example';

describe('Aggregator Example Integration Tests', () => {
  const testConsole = setupConsoleCapture();

  afterEach(() => {
    restoreConsole(testConsole);
    // Clear captured logs for next test
    testConsole.logs.length = 0;
    testConsole.errors.length = 0;
  });

  describe('Advanced Aggregation Example', () => {
    it('should run aggregator example without errors', async () => {
      // Execute the actual example function
      await expect(runAggregatorExample()).resolves.not.toThrow();

      // Verify expected output from the real example
      const logOutput = getLogOutput(testConsole);
      expect(logOutput).toContain('Fjell-Cache Aggregator Example');
      expect(logOutput).toContain('🚀');
      expect(logOutput).toContain('Creating aggregated caches with entity relationships');
      expect(logOutput).toContain('Aggregator Example Complete!');

      // Should have no errors
      expectNoErrors(testConsole);
    });
  });
});

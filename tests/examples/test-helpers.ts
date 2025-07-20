/**
 * Test helpers for fjell-cache examples integration tests
 */

import { vi } from 'vitest';

export interface TestConsole {
  logs: string[];
  errors: string[];
  originalLog: typeof console.log;
  originalError: typeof console.error;
}

/**
 * Setup console capture for testing example output
 */
export const setupConsoleCapture = (): TestConsole => {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  // Mock console.log to capture output
  console.log = vi.fn((...args: any[]) => {
    logs.push(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
  });

  // Mock console.error to capture errors
  console.error = vi.fn((...args: any[]) => {
    errors.push(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
  });

  return { logs, errors, originalLog, originalError };
};

/**
 * Get captured log output as a single string
 */
export const getLogOutput = (testConsole: TestConsole): string => {
  return testConsole.logs.join('\n');
};

/**
 * Get captured error output as a single string
 */
export const getErrorOutput = (testConsole: TestConsole): string => {
  return testConsole.errors.join('\n');
};

/**
 * Restore original console methods
 */
export const restoreConsole = (testConsole: TestConsole): void => {
  console.log = testConsole.originalLog;
  console.error = testConsole.originalError;
};

/**
 * Assert that no errors were logged during execution
 */
export const expectNoErrors = (testConsole: TestConsole): void => {
  if (testConsole.errors.length > 0) {
    throw new Error(`Expected no errors, but got: ${testConsole.errors.join('; ')}`);
  }
};

/**
 * Assert that conceptual fjell-cache usage patterns are demonstrated
 */
export const expectConceptualUsage = (logOutput: string): void => {
  // Should demonstrate key cache concepts
  const requiredConcepts = [
    'cache',
    'registry',
    'instance'
  ];

  requiredConcepts.forEach(concept => {
    if (!logOutput.toLowerCase().includes(concept)) {
      throw new Error(`Expected to find cache concept '${concept}' in output`);
    }
  });
};

/**
 * Assert that cache operations are demonstrated
 */
export const expectCacheOperations = (logOutput: string): void => {
  const operations = [
    'cached',
    'retrieved',
    'stored'
  ];

  const foundOperations = operations.filter(op =>
    logOutput.toLowerCase().includes(op.toLowerCase())
  );

  if (foundOperations.length === 0) {
    throw new Error(`Expected to find cache operations (${operations.join(', ')}) in output`);
  }
};

/**
 * Assert that aggregation concepts are demonstrated
 */
export const expectAggregationUsage = (logOutput: string): void => {
  const aggregationConcepts = [
    'populate',
    'aggregat',
    'reference'
  ];

  const foundConcepts = aggregationConcepts.filter(concept =>
    logOutput.toLowerCase().includes(concept.toLowerCase())
  );

  if (foundConcepts.length === 0) {
    throw new Error(`Expected to find aggregation concepts (${aggregationConcepts.join(', ')}) in output`);
  }
};

/**
 * Assert that cache map operations are demonstrated
 */
export const expectCacheMapUsage = (logOutput: string): void => {
  const cacheMapConcepts = [
    'cachemap',
    'allIn',
    'keys',
    'values'
  ];

  const foundConcepts = cacheMapConcepts.filter(concept =>
    logOutput.toLowerCase().includes(concept.toLowerCase())
  );

  if (foundConcepts.length === 0) {
    throw new Error(`Expected to find cache map concepts (${cacheMapConcepts.join(', ')}) in output`);
  }
};

/**
 * Assert that performance characteristics are demonstrated
 */
export const expectPerformanceDemo = (logOutput: string): void => {
  const performanceConcepts = [
    'performance',
    'efficiency',
    'cache hit',
    'millisecond',
    'ms'
  ];

  const foundConcepts = performanceConcepts.filter(concept =>
    logOutput.toLowerCase().includes(concept.toLowerCase())
  );

  if (foundConcepts.length === 0) {
    throw new Error(`Expected to find performance concepts (${performanceConcepts.join(', ')}) in output`);
  }
};

/**
 * Assert that business model relationships are demonstrated
 */
export const expectBusinessRelationships = (logOutput: string): void => {
  const businessConcepts = [
    'customer',
    'order',
    'product',
    'ticket'
  ];

  const foundConcepts = businessConcepts.filter(concept =>
    logOutput.toLowerCase().includes(concept.toLowerCase())
  );

  if (foundConcepts.length < 2) {
    throw new Error(`Expected to find multiple business concepts (${businessConcepts.join(', ')}) in output`);
  }
};

import { describe, expect, it } from 'vitest';

describe('Cache Type Configurations Example Integration', () => {
  it('should import and execute cache type configurations example without errors', async () => {
    // Import the example
    const example = await import('../../examples/cache-type-configurations-example');

    // Verify the exported configurations
    expect(example.memoryOptions).toBeDefined();
    expect(example.memoryOptions.cacheType).toBe('memory');
    expect(example.memoryOptions.memoryConfig?.maxItems).toBe(1000);
    expect(example.memoryOptions.memoryConfig?.ttl).toBe(300000);

    expect(example.indexedDBOptions).toBeDefined();
    expect(example.indexedDBOptions.cacheType).toBe('asyncIndexedDB');
    expect(example.indexedDBOptions.indexedDBConfig?.dbName).toBe('UserAppCache');
    expect(example.indexedDBOptions.indexedDBConfig?.version).toBe(2);
    expect(example.indexedDBOptions.indexedDBConfig?.storeName).toBe('users');

    expect(example.localStorageOptions).toBeDefined();
    expect(example.localStorageOptions.cacheType).toBe('localStorage');
    expect(example.localStorageOptions.webStorageConfig?.keyPrefix).toBe('myapp:users:');
    expect(example.localStorageOptions.webStorageConfig?.compress).toBe(true);

    // Test the environment-based configuration function
    expect(example.createOptimalCacheConfiguration).toBeDefined();
    expect(typeof example.createOptimalCacheConfiguration).toBe('function');

    const optimalConfig = example.createOptimalCacheConfiguration();
    expect(optimalConfig).toBeDefined();
    expect(optimalConfig.cacheType).toBeDefined();

    // The runExamples function should be defined and executable
    expect(example.runExamples).toBeDefined();
    expect(typeof example.runExamples).toBe('function');
  });
});

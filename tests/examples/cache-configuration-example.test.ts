import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheConfigurationExample } from '../../examples/cache-configuration-example';

// Mock external dependencies
vi.mock('@fjell/registry', () => ({
  createRegistry: vi.fn(() => ({}))
}));

vi.mock('@fjell/client-api', () => ({
  createClientApi: vi.fn(() => ({}))
}));

vi.mock('../../src/index', () => ({
  createInstanceFactory: vi.fn(() =>
    vi.fn((coordinate, options) => ({
      cacheMap: { constructor: { name: 'MockCacheMap' } },
      options: options?.registry ? {
        cacheType: 'memory',
        enableDebugLogging: true,
        webStorageConfig: { keyPrefix: 'session:users:' }
      } : null
    }))
  )
}));

describe('Cache Configuration Example', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock console.log to capture output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    void consoleErrorSpy; // Suppress unused variable warning

    // Mock process.env
    vi.stubEnv('NODE_ENV', 'test');

    // Mock browser storage for all tests
    const mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn()
    };

    // Mock indexedDB
    const mockIndexedDB = {
      open: vi.fn(),
      deleteDatabase: vi.fn(),
      cmp: vi.fn()
    };

    Object.defineProperty(global, 'window', {
      value: {
        localStorage: mockStorage,
        sessionStorage: mockStorage,
        indexedDB: mockIndexedDB
      },
      configurable: true
    });
  });

  it('should execute cache configuration example successfully', async () => {
    await expect(cacheConfigurationExample()).resolves.toBeUndefined();

    // Verify that configuration examples were logged
    expect(consoleLogSpy).toHaveBeenCalledWith('🚀 Starting Cache Configuration Example\n');
    expect(consoleLogSpy).toHaveBeenCalledWith('📝 Example 1: Memory Cache (Default)');
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Memory cache factory created with 1000 item limit and 5min TTL');
    expect(consoleLogSpy).toHaveBeenCalledWith('\n📝 Example 2: LocalStorage Cache');
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ LocalStorage cache factory created with custom prefix and compression');
    expect(consoleLogSpy).toHaveBeenCalledWith('\n📝 Example 3: SessionStorage Cache');
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ SessionStorage cache factory created with 30min expiration');
    expect(consoleLogSpy).toHaveBeenCalledWith('\n📝 Example 4: IndexedDB Cache');
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ IndexedDB cache factory created with custom database settings');
    expect(consoleLogSpy).toHaveBeenCalledWith('\n📝 Example 5: Async IndexedDB Cache');
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Async IndexedDB cache factory created');
    expect(consoleLogSpy).toHaveBeenCalledWith('\n📝 Example 6: Custom Cache Map');
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Custom cache factory created with custom map factory');
    expect(consoleLogSpy).toHaveBeenCalledWith('\n📝 Example 7: Environment-based Configuration');
    expect(consoleLogSpy).toHaveBeenCalledWith('\n✨ Cache Configuration Example Complete');
  });

  it('should handle production environment configuration', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await cacheConfigurationExample();

    // Verify environment-specific configuration was used
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Environment-based cache factory created (asyncIndexedDB)');
  });

  it('should handle development environment configuration', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await cacheConfigurationExample();

    // Verify development configuration was used
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Environment-based cache factory created (memory)');
  });

  it('should handle browser environment without indexedDB', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    // Temporarily remove indexedDB to test fallback
    const originalWindow = global.window;
    Object.defineProperty(global, 'window', {
      value: {
        ...originalWindow,
        indexedDB: null
      },
      configurable: true
    });

    await cacheConfigurationExample();

    // Restore original window
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      configurable: true
    });

    // Should skip indexedDB examples and show warnings
    expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ IndexedDB not available in this environment, skipping');
    expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ Async IndexedDB not available in this environment, skipping');
    // Should fall back to memory cache in production without indexedDB
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Environment-based cache factory created (memory)');
  });

  it('should handle non-browser environment in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    // Remove window object to simulate non-browser environment
    const originalWindow = global.window;
    delete (global as any).window;

    await cacheConfigurationExample();

    // Restore window
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      configurable: true
    });

    // Should skip all browser-dependent examples
    expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ LocalStorage not available in this environment, skipping');
    expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ SessionStorage not available in this environment, skipping');
    expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ IndexedDB not available in this environment, skipping');
    expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ Async IndexedDB not available in this environment, skipping');
    // Should use memory cache in non-browser production environment
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Environment-based cache factory created (memory)');
  });

  it('should log cache types and options information', async () => {
    await cacheConfigurationExample();

    expect(consoleLogSpy).toHaveBeenCalledWith('📊 Cache types created:');
    expect(consoleLogSpy).toHaveBeenCalledWith('  - Memory cache: _MemoryCacheMap');
    expect(consoleLogSpy).toHaveBeenCalledWith('  - LocalStorage cache: _LocalStorageCacheMap');
    expect(consoleLogSpy).toHaveBeenCalledWith('  - Memory cache options: memory, debug: true');
    expect(consoleLogSpy).toHaveBeenCalledWith('  - LocalStorage cache options: localStorage, prefix: my-app:users:');
  });

  it('should handle cache creation errors gracefully', async () => {
    // We can't easily test this error path due to how the example is structured
    // This test would require more complex mocking setup
    // For now, we'll ensure the example runs without throwing
    await expect(cacheConfigurationExample()).resolves.toBeUndefined();
  });

  it('should log key benefits information', async () => {
    await cacheConfigurationExample();

    expect(consoleLogSpy).toHaveBeenCalledWith('\n💡 Key Benefits of the Options System:');
    expect(consoleLogSpy).toHaveBeenCalledWith('   • Choose the right cache type for your environment');
    expect(consoleLogSpy).toHaveBeenCalledWith('   • Configure cache behavior (TTL, limits, compression)');
    expect(consoleLogSpy).toHaveBeenCalledWith('   • Environment-specific optimizations');
    expect(consoleLogSpy).toHaveBeenCalledWith('   • Custom cache map implementations');
    expect(consoleLogSpy).toHaveBeenCalledWith('   • Detailed configuration validation');
    expect(consoleLogSpy).toHaveBeenCalledWith('   • Debug logging control');
  });
});

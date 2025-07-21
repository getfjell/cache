import { describe, expect, it, vi } from 'vitest';
import { createRegistry, createRegistryFactory } from '@/Registry';

// Mock the logger to avoid logging during tests
vi.mock('../src/logger', () => {
  const mockLogger = {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    emergency: vi.fn(),
    alert: vi.fn(),
    critical: vi.fn(),
    notice: vi.fn(),
    time: vi.fn().mockReturnThis(),
    end: vi.fn(),
    log: vi.fn(),
  };

  return {
    default: {
      get: vi.fn().mockReturnValue(mockLogger),
    }
  }
});

describe('Registry', () => {
  describe('createRegistry', () => {
    it('should create a registry with type "cache"', () => {
      const registry = createRegistry();

      expect(registry).toBeDefined();
      expect(registry.type).toBe('cache');
    });

    it('should create a registry with registryHub when provided', () => {
      const mockRegistryHub = { some: 'hub' } as any;
      const registry = createRegistry(mockRegistryHub);

      expect(registry).toBeDefined();
      expect(registry.type).toBe('cache');
    });
  });

  describe('createRegistryFactory', () => {
    it('should create a factory that returns a cache registry for "cache" type', () => {
      const factory = createRegistryFactory();
      const registry = factory('cache');

      expect(registry).toBeDefined();
      expect(registry.type).toBe('cache');
    });

    it('should create a factory that works with registryHub', () => {
      const factory = createRegistryFactory();
      const mockRegistryHub = { some: 'hub' } as any;
      const registry = factory('cache', mockRegistryHub);

      expect(registry).toBeDefined();
      expect(registry.type).toBe('cache');
    });

    it('should throw an error for non-cache types', () => {
      const factory = createRegistryFactory();

      expect(() => factory('invalid')).toThrow(
        'Cache registry factory can only create \'cache\' type registries, got: invalid'
      );
    });

    it('should throw an error for empty string type', () => {
      const factory = createRegistryFactory();

      expect(() => factory('')).toThrow(
        'Cache registry factory can only create \'cache\' type registries, got: '
      );
    });

    it('should throw an error for other common types', () => {
      const factory = createRegistryFactory();

      expect(() => factory('memory')).toThrow(
        'Cache registry factory can only create \'cache\' type registries, got: memory'
      );

      expect(() => factory('file')).toThrow(
        'Cache registry factory can only create \'cache\' type registries, got: file'
      );
    });
  });
});

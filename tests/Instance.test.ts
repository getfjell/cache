/* eslint-disable no-undefined */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createInstance, isInstance } from '@/Instance';
import { Cache } from '@/Cache';
import { Item } from '@fjell/core';
import { Coordinate, createInstance as createBaseInstance, createCoordinate, Registry } from '@fjell/registry';

// Mock the logger
vi.mock('@/logger', () => {
  const logger = {
    get: vi.fn().mockReturnThis(),
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
      get: () => logger,
    }
  }
});

// Mock @fjell/registry
vi.mock('@fjell/registry', async () => {
  const actual = await vi.importActual('@fjell/registry');
  return {
    ...actual,
    createInstance: vi.fn(),
  };
});

describe('Instance', () => {
  const mockRegistry: Registry = { type: 'cache' } as Registry;
  const mockCoordinate: Coordinate<'test', 'container'> = createCoordinate(['test', 'container'], []);

  const mockCache: Cache<Item<'test', 'container'>, 'test', 'container'> = {
    all: vi.fn(),
    one: vi.fn(),
    action: vi.fn(),
    allAction: vi.fn(),
    allFacet: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    retrieve: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    facet: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    reset: vi.fn(),
    set: vi.fn(),
    pkTypes: ['test', 'container'] as ['test', 'container'],
    cacheMap: {} as any
  };

  const mockBaseInstance = {
    coordinate: mockCoordinate,
    registry: mockRegistry,
  };

  describe('createInstance', () => {
    beforeEach(() => {
      vi.mocked(createBaseInstance).mockImplementation((registry, coordinate) => ({
        coordinate,
        registry,
      }) as any);
    });

    test('should create instance with cache, coordinate, and registry', () => {
      const instance = createInstance(mockRegistry, mockCoordinate, mockCache);

      expect(instance).toBeDefined();
      expect(instance.coordinate).toBe(mockCoordinate);
      expect(instance.registry).toBe(mockRegistry);
      expect(instance.cache).toBe(mockCache);
    });

    test('should call createBaseInstance with correct parameters', () => {
      createInstance(mockRegistry, mockCoordinate, mockCache);

      expect(createBaseInstance).toHaveBeenCalledWith(mockRegistry, mockCoordinate);
    });

    test('should extend base instance with cache property', () => {
      const instance = createInstance(mockRegistry, mockCoordinate, mockCache);

      // Should have all base instance properties
      expect(instance.coordinate).toBe(mockBaseInstance.coordinate);
      expect(instance.registry).toBe(mockBaseInstance.registry);

      // Should have cache property
      expect(instance.cache).toBe(mockCache);
    });

    test('should work with different generic type parameters', () => {
      const coordinate = createCoordinate(['user', 'org', 'dept'], []);
      const cache = mockCache as any; // Type cast for test simplicity

      const instance = createInstance(mockRegistry, coordinate, cache);

      expect(instance.coordinate).toBe(coordinate);
      expect(instance.cache).toBe(cache);
      expect(instance.registry).toBe(mockRegistry);
    });

    test('should handle minimal coordinate and cache', () => {
      const minimalCoordinate = createCoordinate(['minimal'], []);
      const minimalCache = {
        ...mockCache,
        pkTypes: ['minimal'] as ['minimal']
      } as any;

      const instance = createInstance(mockRegistry, minimalCoordinate, minimalCache);

      expect(instance.coordinate).toBe(minimalCoordinate);
      expect(instance.cache).toBe(minimalCache);
      expect(instance.registry).toBe(mockRegistry);
    });

    test('should preserve all base instance properties', () => {
      const customMethod = vi.fn();
      vi.mocked(createBaseInstance).mockReturnValue({
        coordinate: mockCoordinate,
        registry: mockRegistry,
        customProperty: 'test-value',
        customMethod
      } as any);

      const instance = createInstance(mockRegistry, mockCoordinate, mockCache);

      expect((instance as any).customProperty).toBe('test-value');
      expect((instance as any).customMethod).toBe(customMethod);
      expect(instance.cache).toBe(mockCache);
      expect(instance.coordinate).toBe(mockCoordinate);
      expect(instance.registry).toBe(mockRegistry);
    });
  });

  describe('isInstance', () => {
    test('should return true for valid instance', () => {
      const validInstance = {
        coordinate: mockCoordinate,
        cache: mockCache,
        registry: mockRegistry
      };

      expect(isInstance(validInstance)).toBe(true);
    });

    test('should return true for valid instance with additional properties', () => {
      const validInstance = {
        coordinate: mockCoordinate,
        cache: mockCache,
        registry: mockRegistry,
        extraProperty: 'extra',
        extraMethod: vi.fn()
      };

      expect(isInstance(validInstance)).toBe(true);
    });

    test('should return false for instance missing coordinate', () => {
      const invalidInstance = {
        cache: mockCache,
        registry: mockRegistry
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for instance missing cache', () => {
      const invalidInstance = {
        coordinate: mockCoordinate,
        registry: mockRegistry
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for instance missing registry', () => {
      const invalidInstance = {
        coordinate: mockCoordinate,
        cache: mockCache
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for instance with undefined coordinate', () => {
      const invalidInstance = {
        coordinate: undefined,
        cache: mockCache,
        registry: mockRegistry
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for instance with undefined cache', () => {
      const invalidInstance = {
        coordinate: mockCoordinate,
        cache: undefined,
        registry: mockRegistry
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for instance with undefined registry', () => {
      const invalidInstance = {
        coordinate: mockCoordinate,
        cache: mockCache,
        registry: undefined
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for null', () => {
      expect(isInstance(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isInstance(undefined)).toBe(false);
    });

    test('should return false for non-object values', () => {
      expect(isInstance('not an instance')).toBe(false);
      expect(isInstance(123)).toBe(false);
      expect(isInstance(true)).toBe(false);
      expect(isInstance([])).toBe(false);
    });

    test('should return false for empty object', () => {
      expect(isInstance({})).toBe(false);
    });
  });
});

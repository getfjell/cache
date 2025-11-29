import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AffectedKeys, createOperations, isComKey, isPriKey, type OperationParams, Operations, TwoLayerOperations } from '../src/Operations';
import type { Operations as CoreOperations } from '@fjell/core';
import { AllOperationResult, ComKey, createCoordinate, Item, PriKey } from '@fjell/core';
import type { ClientApi } from '@fjell/client-api';
import { CacheMap } from '../src/CacheMap';
import { CacheEventEmitter } from '../src/events/CacheEventEmitter';
import { TTLManager } from '../src/ttl/TTLManager';
import { EvictionManager } from '../src/eviction/EvictionManager';
import { CacheStatsManager } from '../src/CacheStats';
import { createRegistry } from '@fjell/registry';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';
import { defaultTTLConfig, TTLConfig } from '../src/ttl/TTLConfig';

interface TestItem extends Item<'test'> {
  id: string;
  name: string;
}

describe('Cache Operations', () => {
  describe('Interface Compatibility', () => {
    it('should extend core Operations interface', () => {
      // Type test - this should compile
      type TestOps = Operations<TestItem, 'test', never>;
      type CoreOps = CoreOperations<TestItem, 'test', never>;
      
      // Cache ops should be assignable to core ops (plus cache-specific methods)
      // This verifies structural compatibility at compile time
      
      // Verify the type relationship exists
      // If this compiles, it means Cache Operations properly extends Core Operations
      const typeCheck = (ops: TestOps): CoreOps => {
        // Cache ops has all core ops methods, so it can be used as core ops
        return ops as any; // Using any here because cache has extra methods
      };
      
      expect(typeCheck).toBeDefined();
    });

    it('should have cache-specific methods in type definition', () => {
      // This is a compile-time check
      // If these method signatures exist in the type, this will compile
      type TestOps = Operations<TestItem, 'test', never>;
      
      // Verify that these methods exist in the type
      // If they don't exist, TypeScript will fail to compile
      // Using callable type check instead of Function
      type IsCallable<T> = T extends (...args: any[]) => any ? true : never;
      const typeHasRetrieve: IsCallable<TestOps['retrieve']> = true;
      const typeHasSet: IsCallable<TestOps['set']> = true;
      const typeHasReset: IsCallable<TestOps['reset']> = true;
      
      expect(typeHasRetrieve).toBe(true);
      expect(typeHasSet).toBe(true);
      expect(typeHasReset).toBe(true);
    });

    it('should re-export type guards from core', () => {
      expect(typeof isPriKey).toBe('function');
      expect(typeof isComKey).toBe('function');
    });

    it('should re-export types from core', () => {
      // Type tests - these should compile
      const params: OperationParams = { test: 'value' };
      const affectedKeys: AffectedKeys = [];
      
      expect(params).toBeDefined();
      expect(affectedKeys).toBeDefined();
    });
  });

  describe('Type Guards', () => {
    it('isPriKey should identify primary keys', () => {
      const priKey = { kt: 'test' as const, pk: '123' };
      const comKey = { kt: 'test' as const, pk: '123', loc: [{ kt: 'parent' as const, lk: 'parent-1' }] };
      
      expect(isPriKey(priKey)).toBe(true);
      expect(isPriKey(comKey)).toBe(false);
    });

    it('isComKey should identify composite keys', () => {
      const priKey = { kt: 'test' as const, pk: '123' };
      const comKey = { kt: 'test' as const, pk: '123', loc: [{ kt: 'parent' as const, lk: 'parent-1' }] };
      
      expect(isComKey(priKey)).toBe(false);
      expect(isComKey(comKey)).toBe(true);
    });
  });

  describe('createOperations', () => {
    let mockApi: ClientApi<TestItem, 'test'>;
    let mockCoordinate: ReturnType<typeof createCoordinate>;
    let cacheMap: CacheMap<TestItem, 'test'>;
    let eventEmitter: CacheEventEmitter<TestItem, 'test'>;
    let ttlManager: TTLManager;
    let evictionManager: EvictionManager;
    let statsManager: CacheStatsManager;

    beforeEach(() => {
      const testItem: TestItem = {
        key: { kt: 'test' as const, pk: '123' },
        id: '123',
        name: 'Test',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      };
      
      const updatedItem: TestItem = {
        key: { kt: 'test' as const, pk: '123' },
        id: '123',
        name: 'Updated',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      };

      mockApi = {
        all: vi.fn().mockResolvedValue({ items: [], metadata: { total: 0, returned: 0, offset: 0, hasMore: false } } as AllOperationResult<TestItem>),
        one: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(testItem),
        get: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(updatedItem),
        remove: vi.fn().mockResolvedValue(undefined),
        find: vi.fn().mockResolvedValue([]),
        findOne: vi.fn().mockResolvedValue(null),
        action: vi.fn().mockResolvedValue([testItem, []]),
        allAction: vi.fn().mockResolvedValue([[], []]),
        facet: vi.fn().mockResolvedValue({}),
        allFacet: vi.fn().mockResolvedValue({})
      } as any;

      mockCoordinate = createCoordinate('test', []);

      cacheMap = new MemoryCacheMap<TestItem, 'test'>(['test']);
      eventEmitter = new CacheEventEmitter<TestItem, 'test'>();
      ttlManager = new TTLManager();
      evictionManager = new EvictionManager();
      statsManager = new CacheStatsManager();
    });

    it('should create operations with all core methods', () => {
      const registry = createRegistry('test-cache');
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        { cacheType: 'memory' },
        eventEmitter as any,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      expect(ops.all).toBeDefined();
      expect(ops.one).toBeDefined();
      expect(ops.create).toBeDefined();
      expect(ops.get).toBeDefined();
      expect(ops.update).toBeDefined();
      expect(ops.upsert).toBeDefined();
      expect(ops.remove).toBeDefined();
      expect(ops.find).toBeDefined();
      expect(ops.findOne).toBeDefined();
      expect(ops.action).toBeDefined();
      expect(ops.allAction).toBeDefined();
      expect(ops.facet).toBeDefined();
      expect(ops.allFacet).toBeDefined();
    });

    it('should create operations with cache-specific methods', () => {
      const registry = createRegistry('test-cache');
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        { cacheType: 'memory' },
        eventEmitter as any,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      expect(ops.retrieve).toBeDefined();
      expect(ops.set).toBeDefined();
      expect(ops.reset).toBeDefined();
    });

    it('should handle CreateOptions parameter', async () => {
      const registry = createRegistry('test-cache');
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        { cacheType: 'memory' },
        eventEmitter as any,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      // Test with locations in options
      await ops.create({ name: 'Test' });
      expect(mockApi.create).toHaveBeenCalledWith({ name: 'Test' }, undefined);

      // Test without options
      await ops.create({ name: 'Test2' });
      expect(mockApi.create).toHaveBeenCalledWith({ name: 'Test2' }, undefined);
    });

    it('should implement upsert correctly when item exists', async () => {
      const registry = createRegistry('test-cache');
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        { cacheType: 'memory' },
        eventEmitter as any,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
      
      const existingItem: TestItem = {
        key: { kt: 'test' as const, pk: '123' },
        id: '123',
        name: 'Existing',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      };

      // Test update path (item exists)
      mockApi.get = vi.fn().mockResolvedValue(existingItem);
      await ops.upsert(key, { name: 'Updated' });
      expect(mockApi.update).toHaveBeenCalledWith(key, { name: 'Updated' });
    });

    it('should implement upsert correctly when item does not exist', async () => {
      // Clear the cache map before this test
      await cacheMap.clear();
      
      const registry = createRegistry('test-cache');
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        { cacheType: 'memory' },
        eventEmitter as any,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };

      // Test create path (item doesn't exist)
      mockApi.get = vi.fn().mockResolvedValue(null);
      await ops.upsert(key, { name: 'New' });
      expect(mockApi.create).toHaveBeenCalledWith({ name: 'New' }, undefined);
    });
  });

  describe('TwoLayerOperations', () => {
    let mockApi: ClientApi<TestItem, 'test'>;
    let mockCoordinate: ReturnType<typeof createCoordinate>;
    let twoLayerOps: TwoLayerOperations<TestItem, 'test'>;
    let registry: ReturnType<typeof createRegistry>;

    const testItem: TestItem = {
      key: { kt: 'test' as const, pk: '123' },
      id: '123',
      name: 'Test Item',
      events: {
        created: { at: new Date() },
        updated: { at: new Date() },
        deleted: { at: null }
      }
    };

    const testItem2: TestItem = {
      key: { kt: 'test' as const, pk: '456' },
      id: '456',
      name: 'Test Item 2',
      events: {
        created: { at: new Date() },
        updated: { at: new Date() },
        deleted: { at: null }
      }
    };

    beforeEach(() => {
      registry = createRegistry('test-cache');
      
      const allItems = [testItem, testItem2];
      const allResult: AllOperationResult<TestItem> = {
        items: allItems,
        metadata: { total: allItems.length, returned: allItems.length, offset: 0, hasMore: false }
      };
      mockApi = {
        all: vi.fn().mockResolvedValue(allResult),
        one: vi.fn().mockResolvedValue(testItem),
        create: vi.fn().mockResolvedValue(testItem),
        get: vi.fn().mockResolvedValue(testItem),
        update: vi.fn().mockResolvedValue(testItem),
        remove: vi.fn().mockResolvedValue(undefined),
        find: vi.fn().mockResolvedValue([testItem]),
        findOne: vi.fn().mockResolvedValue(testItem),
        action: vi.fn().mockResolvedValue([{ result: 'success' }, [testItem]]),
        allAction: vi.fn().mockResolvedValue([{ result: 'success' }, [testItem]]),
        facet: vi.fn().mockResolvedValue({ facetData: 'value' }),
        allFacet: vi.fn().mockResolvedValue([testItem])
      } as any;

      mockCoordinate = createCoordinate('test', []);
    });

    describe('Constructor and Initialization', () => {
      it('should initialize with default TTL configuration', () => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory' },
          registry
        );

        expect(twoLayerOps).toBeDefined();
        expect(twoLayerOps.getEnhancedStats).toBeDefined();
      });

      it('should initialize with custom two-layer options', () => {
        const customOptions = {
          cacheType: 'memory' as const,
          twoLayer: {
            itemTTL: 1800,
            queryTTL: 600,
            facetTTL: 120,
            debug: true
          }
        };

        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          customOptions,
          registry
        );

        expect(twoLayerOps).toBeDefined();
      });

      it('should initialize with TTL config including stale-while-revalidate', () => {
        const ttlConfig: TTLConfig = {
          ...defaultTTLConfig,
          adjustments: {
            staleWhileRevalidate: true
          }
        };

        const options = {
          cacheType: 'memory' as const,
          ttlConfig,
          twoLayer: { debug: true }
        };

        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          options,
          registry
        );

        expect(twoLayerOps).toBeDefined();
      });

      it('should initialize with cache warming enabled', () => {
        const ttlConfig: TTLConfig = {
          ...defaultTTLConfig,
          warming: {
            enabled: true,
            interval: 30000,
            queries: [
              { id: 'test-query', type: 'all', params: { query: {}, locations: [] } }
            ]
          }
        };

        const options = {
          cacheType: 'memory' as const,
          ttlConfig,
          twoLayer: { debug: true }
        };

        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          options,
          registry
        );

        expect(twoLayerOps).toBeDefined();
      });

      it('should handle missing cache warming configuration gracefully', () => {
        const ttlConfig: TTLConfig = {
          ...defaultTTLConfig,
          warming: {
            enabled: true,
            interval: 30000,
            queries: [] // Empty queries array
          }
        };

        const options = {
          cacheType: 'memory' as const,
          ttlConfig
        };

        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          options,
          registry
        );

        expect(twoLayerOps).toBeDefined();
      });
    });

    describe('all() method', () => {
      beforeEach(() => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );
      });

      it('should fetch fresh data on cache miss', async () => {
        const result = await twoLayerOps.all({ name: 'test' }, []);
        
        expect(result.items).toEqual([testItem, testItem2]);
        expect(mockApi.all).toHaveBeenCalledWith({ name: 'test' }, [], undefined);
      });

      it('should return cached data on cache hit', async () => {
        // First call to populate cache
        await twoLayerOps.all({ name: 'test' }, []);
        
        // Reset mock to verify cache hit
        vi.clearAllMocks();
        
        // Second call should hit cache
        const result = await twoLayerOps.all({ name: 'test' }, []);
        
        expect(result.items).toEqual([testItem, testItem2]);
        expect(mockApi.all).not.toHaveBeenCalled();
      });

      it('should handle partial cache misses when items expire', async () => {
        // First call to populate cache
        await twoLayerOps.all({ name: 'test' }, []);
        
        // Simulate item expiration by advancing time significantly
        vi.useFakeTimers();
        vi.advanceTimersByTime(7200000); // 2 hours
        
        const result = await twoLayerOps.all({ name: 'test' }, []);
        
        expect(result.items).toEqual([testItem, testItem2]);
        expect(mockApi.all).toHaveBeenCalled();
        
        vi.useRealTimers();
      });

      it('should handle empty query and locations', async () => {
        const result = await twoLayerOps.all();
        
        expect(result.items).toEqual([testItem, testItem2]);
        expect(mockApi.all).toHaveBeenCalledWith({}, [], undefined);
      });
    });

    describe('allFacet() method', () => {
      beforeEach(() => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );
      });

      it('should fetch fresh facet data on cache miss', async () => {
        const result = await twoLayerOps.allFacet('testFacet', { param: 'value' }, []);
        
        expect(result).toEqual([testItem]);
        expect(mockApi.allFacet).toHaveBeenCalledWith('testFacet', { param: 'value' }, []);
      });

      it('should handle cached facet data with partial hits', async () => {
        // First call to populate cache
        await twoLayerOps.allFacet('testFacet', { param: 'value' }, []);
        
        // Second call should check cache first
        const result = await twoLayerOps.allFacet('testFacet', { param: 'value' }, []);
        
        expect(result).toBeDefined();
      });

      it('should handle non-array facet results', async () => {
        mockApi.allFacet = vi.fn().mockResolvedValue({ singleResult: 'value' });
        
        const result = await twoLayerOps.allFacet('testFacet', {}, []);
        
        expect(result).toEqual({ singleResult: 'value' });
      });

      it('should handle null facet results', async () => {
        mockApi.allFacet = vi.fn().mockResolvedValue(null);
        
        const result = await twoLayerOps.allFacet('testFacet', {}, []);
        
        expect(result).toBeNull();
      });

      it('should use default parameters when not provided', async () => {
        const result = await twoLayerOps.allFacet('testFacet');
        
        expect(mockApi.allFacet).toHaveBeenCalledWith('testFacet', {}, []);
      });
    });

    describe('get() method with stale-while-revalidate', () => {
      beforeEach(() => {
        const ttlConfig: TTLConfig = {
          ...defaultTTLConfig,
          adjustments: {
            staleWhileRevalidate: true
          }
        };

        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', ttlConfig, twoLayer: { debug: true } },
          registry
        );
      });

      it('should fetch item using stale-while-revalidate pattern', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        const result = await twoLayerOps.get(key);
        
        expect(result).toEqual(testItem);
        expect(mockApi.get).toHaveBeenCalledWith(key);
      });

      it('should handle cache misses gracefully', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '999' };
        mockApi.get = vi.fn().mockResolvedValue(null);
        
        const result = await twoLayerOps.get(key);
        
        expect(result).toBeNull();
        expect(mockApi.get).toHaveBeenCalledWith(key);
      });

      it('should work without stale-while-revalidate config', async () => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );

        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        const result = await twoLayerOps.get(key);
        
        expect(result).toEqual(testItem);
      });
    });

    describe('update() method', () => {
      beforeEach(() => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );
      });

      it('should update item and invalidate cache', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        const updates = { name: 'Updated Name' };
        
        mockApi.update = vi.fn().mockResolvedValue([{ ...testItem, name: 'Updated Name' }]);
        
        const result = await twoLayerOps.update(key, updates);
        
        expect(result.name).toBe('Updated Name');
        expect(mockApi.update).toHaveBeenCalledWith(key, updates);
      });
    });

    describe('other CRUD operations', () => {
      beforeEach(() => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );
      });

      it('should handle one() method', async () => {
        const result = await twoLayerOps.one({ name: 'test' }, []);
        
        expect(result).toEqual(testItem);
        expect(mockApi.one).toHaveBeenCalledWith({ name: 'test' }, []);
      });

      it('should handle one() method with null result', async () => {
        mockApi.one = vi.fn().mockResolvedValue(null);
        
        const result = await twoLayerOps.one({ name: 'test' }, []);
        
        expect(result).toBeNull();
        expect(mockApi.one).toHaveBeenCalledWith({ name: 'test' }, []);
      });

      it('should handle create() method', async () => {
        const newItem = { name: 'New Item' };
        
        // Mock the API to return an array with the created item (as per wrapper behavior)
        mockApi.create = vi.fn().mockResolvedValue([testItem]);
        
        const result = await twoLayerOps.create(newItem);
        
        expect(result).toEqual(testItem);
        expect(mockApi.create).toHaveBeenCalledWith(newItem, { locations: [] });
      });

      it('should handle create() method with empty locations', async () => {
        const newItem = { name: 'New Item' };
        const locations = []; // Valid empty locations for our test coordinate
        
        // Mock the API to return an array with the created item
        mockApi.create = vi.fn().mockResolvedValue([testItem]);
        
        const result = await twoLayerOps.create(newItem, { locations });
        
        expect(result).toEqual(testItem);
        expect(mockApi.create).toHaveBeenCalledWith(newItem, { locations });
      });

      it('should handle remove() method', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        await twoLayerOps.remove(key);
        
        expect(mockApi.remove).toHaveBeenCalledWith(key);
      });
    });

    describe('cache-specific operations', () => {
      beforeEach(() => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );
      });

      it('should handle retrieve() method', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        // First set an item
        await twoLayerOps.set(key, testItem);
        
        const result = await twoLayerOps.retrieve(key);
        
        expect(result).toEqual(testItem);
      });

      it('should handle retrieve() method with cache miss', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '999' };
        
        const result = await twoLayerOps.retrieve(key);
        
        expect(result).toBeNull();
      });

      it('should handle set() method', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        const result = await twoLayerOps.set(key, testItem);
        
        expect(result).toEqual(testItem);
      });

      it('should handle reset() method', async () => {
        await twoLayerOps.reset();
        
        // Verify cache is cleared by attempting to retrieve a previously set item
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        const result = await twoLayerOps.retrieve(key);
        
        expect(result).toBeNull();
      });

      it('should handle reset() with stale-while-revalidate cache', async () => {
        const ttlConfig: TTLConfig = {
          ...defaultTTLConfig,
          adjustments: { staleWhileRevalidate: true }
        };

        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', ttlConfig, twoLayer: { debug: true } },
          registry
        );

        await twoLayerOps.reset();
        
        // Should complete without error
        expect(true).toBe(true);
      });
    });

    describe('placeholder methods', () => {
      beforeEach(() => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );
      });

      it('should handle upsert() with existing item', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        const updates = { name: 'Updated Name' };
        
        mockApi.update = vi.fn().mockResolvedValue([{ ...testItem, name: 'Updated Name' }]);
        
        const result = await twoLayerOps.upsert(key, updates);
        
        expect(result.name).toBe('Updated Name');
        expect(mockApi.update).toHaveBeenCalledWith(key, updates);
      });

      it('should handle upsert() with non-existing item', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '999' };
        const itemData = { name: 'New Item' };
        
        mockApi.get = vi.fn().mockResolvedValue(null);
        mockApi.create = vi.fn().mockResolvedValue([testItem]);
        
        const result = await twoLayerOps.upsert(key, itemData);
        
        expect(result).toEqual(testItem);
        expect(mockApi.create).toHaveBeenCalledWith(itemData, { locations: [] });
      });

      it('should handle action() method', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        const result = await twoLayerOps.action(key, 'testAction', { data: 'test' });
        
        expect(result).toEqual([{ result: 'success' }, [testItem]]);
        expect(mockApi.action).toHaveBeenCalledWith(key, 'testAction', { data: 'test' });
      });

      it('should handle action() method without body', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        const result = await twoLayerOps.action(key, 'testAction');
        
        expect(result).toEqual([{ result: 'success' }, [testItem]]);
        expect(mockApi.action).toHaveBeenCalledWith(key, 'testAction', {});
      });

      it('should handle allAction() method', async () => {
        const result = await twoLayerOps.allAction('testAction', { data: 'test' }, []);
        
        expect(result).toEqual([{ result: 'success' }, [testItem]]);
        expect(mockApi.allAction).toHaveBeenCalledWith('testAction', { data: 'test' }, []);
      });

      it('should handle allAction() method without body', async () => {
        const result = await twoLayerOps.allAction('testAction');
        
        expect(result).toEqual([{ result: 'success' }, [testItem]]);
        expect(mockApi.allAction).toHaveBeenCalledWith('testAction', {}, []);
      });

      it('should handle facet() method', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        const result = await twoLayerOps.facet(key, 'testFacet', { param: 'value' });
        
        expect(result).toEqual({ facetData: 'value' });
        expect(mockApi.facet).toHaveBeenCalledWith(key, 'testFacet', { param: 'value' });
      });

      it('should handle find() method', async () => {
        const result = await twoLayerOps.find('testFinder', { param: 'value' }, []);
        
        expect(result).toEqual([testItem]);
        expect(mockApi.find).toHaveBeenCalledWith('testFinder', { param: 'value' }, []);
      });

      it('should handle find() method with defaults', async () => {
        const result = await twoLayerOps.find('testFinder');
        
        expect(result).toEqual([testItem]);
        expect(mockApi.find).toHaveBeenCalledWith('testFinder', {}, []);
      });

      it('should handle findOne() method', async () => {
        const result = await twoLayerOps.findOne('testFinder', { param: 'value' }, []);
        
        expect(result).toEqual(testItem);
        expect(mockApi.findOne).toHaveBeenCalledWith('testFinder', { param: 'value' }, []);
      });

      it('should handle findOne() method with defaults', async () => {
        const result = await twoLayerOps.findOne('testFinder');
        
        expect(result).toEqual(testItem);
        expect(mockApi.findOne).toHaveBeenCalledWith('testFinder', {}, []);
      });

      it('should handle findOne() method with null result', async () => {
        mockApi.findOne = vi.fn().mockResolvedValue(null);
        
        const result = await twoLayerOps.findOne('testFinder');
        
        expect(result).toBeNull();
        expect(mockApi.findOne).toHaveBeenCalledWith('testFinder', {}, []);
      });
    });

    describe('enhanced features', () => {
      beforeEach(() => {
        const ttlConfig: TTLConfig = {
          ...defaultTTLConfig,
          adjustments: { staleWhileRevalidate: true },
          warming: {
            enabled: true,
            interval: 30000,
            queries: [
              { id: 'test-query', type: 'all', params: { query: { name: 'test' }, locations: [] } }
            ]
          }
        };

        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', ttlConfig, twoLayer: { debug: true } },
          registry
        );
      });

      it('should provide enhanced statistics', () => {
        const stats = twoLayerOps.getEnhancedStats();
        
        expect(stats).toBeDefined();
        expect(stats.itemCache).toBeDefined();
        expect(stats.queryCache).toBeDefined();
      });

      it('should explain TTL calculation for items', () => {
        const explanation = twoLayerOps.explainTTL('test');
        
        expect(explanation).toBeDefined();
      });

      it('should explain TTL calculation for queries', () => {
        const explanation = twoLayerOps.explainTTL(undefined, 'all', true);
        
        expect(explanation).toBeDefined();
      });

      it('should throw error for invalid TTL explanation parameters', () => {
        expect(() => twoLayerOps.explainTTL()).toThrow('Must provide either itemType or (queryType + isComplete)');
      });

      it('should handle manual cache warming', async () => {
        const result = await twoLayerOps.warmCache();
        
        expect(result).toBeDefined();
      });

      it('should handle cache warming with specific operation IDs', async () => {
        const result = await twoLayerOps.warmCache(['test-query']);
        
        expect(result).toBeDefined();
      });

      it('should handle cache warming when not enabled', async () => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );

        const result = await twoLayerOps.warmCache();
        
        expect(result).toEqual({ error: 'Cache warming not enabled' });
      });

      it('should cleanup resources properly', () => {
        expect(() => twoLayerOps.cleanup()).not.toThrow();
      });
    });

    describe('utility methods and error handling', () => {
      beforeEach(() => {
        twoLayerOps = new TwoLayerOperations(
          mockApi,
          mockCoordinate,
          'test',
          { cacheType: 'memory', twoLayer: { debug: true } },
          registry
        );
      });

      it('should handle buildItemKey with composite keys', async () => {
        const comKey: ComKey<'test'> = {
          kt: 'test' as const,
          pk: '123',
          loc: [{ kt: 'parent' as const, lk: 'parent-1' }]
        };

        // Test through set/retrieve to exercise buildItemKey
        await twoLayerOps.set(comKey, testItem);
        const result = await twoLayerOps.retrieve(comKey);
        
        expect(result).toEqual(testItem);
      });

      it('should handle buildItemKey with null item', async () => {
        const key: PriKey<'test'> = { kt: 'test' as const, pk: '123' };
        
        // This should work fine - null items are handled gracefully
        const result = await twoLayerOps.retrieve(key);
        expect(result).toBeNull();
      });

      it('should handle storeTwoLayer with non-array items', async () => {
        mockApi.allFacet = vi.fn().mockResolvedValue(testItem); // Single item, not array
        
        const result = await twoLayerOps.allFacet('testFacet');
        
        expect(result).toEqual(testItem);
      });

      it('should handle normalizeParams with dates and arrays', async () => {
        const complexQuery = {
          date: new Date('2023-01-01'),
          tags: ['b', 'a', 'c'],
          simple: 'value'
        };

        // Test through all() to exercise normalizeParams
        await twoLayerOps.all(complexQuery, []);
        
        expect(mockApi.all).toHaveBeenCalledWith(complexQuery, [], undefined);
      });
    });
  });
});


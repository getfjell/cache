import { beforeEach, describe, expect, it, vi } from 'vitest';
import { facet } from '../../src/ops/facet';
import { type ComKey, type Item, type PriKey, type UUID } from '@fjell/types';
import { createCoordinate } from '@fjell/core';
import { CacheContext } from '../../src/CacheContext';

// Define test types
type TestItem = Item<'test', 'l1', 'l2'>;
type TestContext = CacheContext<TestItem, 'test', 'l1', 'l2'>;

describe('facet', () => {
  // Setup mock context
  const mockApi = {
    facet: vi.fn()
  };

  const context = {
    api: mockApi,
    coordinate: createCoordinate(['test', 'l1', 'l2'], [])
  } as unknown as TestContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call api.facet with composite key', async () => {
    const key: ComKey<'test', 'l1', 'l2'> = {
      kt: 'test',
      pk: '123' as UUID,
      loc: [
        { kt: 'l1', lk: 'l1-value' as UUID },
        { kt: 'l2', lk: 'l2-value' as UUID }
      ]
    };
    const facetName = 'testFacet';
    const params = { param1: 'value1' };
    const expectedResult = { count: 5 };

    mockApi.facet.mockResolvedValueOnce(expectedResult);

    const result = await facet(key, facetName, params, context);

    expect(mockApi.facet).toHaveBeenCalledWith(key, facetName, params);
    expect(result).toEqual(expectedResult);
  });

  it('should call api.facet with composite key', async () => {
    const key: ComKey<'test', 'l1', 'l2'> = {
      kt: 'test',
      pk: '123' as UUID,
      loc: [
        { kt: 'l1', lk: 'l1Value' as UUID },
        { kt: 'l2', lk: 'l2Value' as UUID }
      ]
    };
    const facetName = 'testFacet';
    const params = { param1: 'value1' };
    const expectedResult = { count: 5 };

    mockApi.facet.mockResolvedValueOnce(expectedResult);

    const result = await facet(key, facetName, params, context);

    expect(mockApi.facet).toHaveBeenCalledWith(key, facetName, params);
    expect(result).toEqual(expectedResult);
  });

  it('should handle empty params object', async () => {
    const key: ComKey<'test', 'l1', 'l2'> = {
      kt: 'test',
      pk: '123' as UUID,
      loc: [
        { kt: 'l1', lk: 'l1-value' as UUID },
        { kt: 'l2', lk: 'l2-value' as UUID }
      ]
    };
    const facetName = 'testFacet';
    const expectedResult = { count: 5 };

    mockApi.facet.mockResolvedValueOnce(expectedResult);

    const result = await facet(key, facetName, {}, context);

    expect(mockApi.facet).toHaveBeenCalledWith(key, facetName, {});
    expect(result).toEqual(expectedResult);
  });

  it('should handle complex parameter types', async () => {
    const key: ComKey<'test', 'l1', 'l2'> = {
      kt: 'test',
      pk: '123' as UUID,
      loc: [
        { kt: 'l1', lk: 'l1-value' as UUID },
        { kt: 'l2', lk: 'l2-value' as UUID }
      ]
    };
    const facetName = 'testFacet';
    const date = new Date();
    const params = {
      stringParam: 'test',
      numberParam: 123,
      booleanParam: true,
      dateParam: date,
      arrayParam: ['test', 123, true, date]
    };
    const expectedResult = { count: 5 };

    mockApi.facet.mockResolvedValueOnce(expectedResult);

    const result = await facet(key, facetName, params, context);

    expect(mockApi.facet).toHaveBeenCalledWith(key, facetName, params);
    expect(result).toEqual(expectedResult);
  });

  it('should handle api errors', async () => {
    const key: ComKey<'test', 'l1', 'l2'> = {
      kt: 'test',
      pk: '123' as UUID,
      loc: [
        { kt: 'l1', lk: 'l1-value' as UUID },
        { kt: 'l2', lk: 'l2-value' as UUID }
      ]
    };
    const facetName = 'testFacet';
    const error = new Error('API Error');

    mockApi.facet.mockRejectedValueOnce(error);

    await expect(facet(key, facetName, {}, context)).rejects.toThrow('API Error');
  });
});

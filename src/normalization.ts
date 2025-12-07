// Normalization utilities for cache keys
import { ItemQuery, LocKeyArray } from "@fjell/core";

// Normalize a key value to string for consistent comparison and hashing
export const normalizeKeyValue = (value: string | number): string => {
  return String(value);
};

// Helper function to create deterministic JSON string with sorted keys
const deterministicStringify = (obj: any): string => {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(deterministicStringify).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const keyValuePairs = sortedKeys.map(key => {
    return JSON.stringify(key) + ':' + deterministicStringify(obj[key]);
  });

  return '{' + keyValuePairs.join(',') + '}';
};

// Normalized hash function for Dictionary that converts pk/lk values to strings
export const createNormalizedHashFunction = <T>() => {
  return (key: T): string => {
    if (typeof key === 'object' && key !== null) {
      // Create a normalized version of the key with string values
      const normalizedKey = JSON.parse(JSON.stringify(key));

      // Normalize pk values
      if ('pk' in normalizedKey && normalizedKey.pk !== null) {
        normalizedKey.pk = normalizeKeyValue(normalizedKey.pk);
      }

      // Normalize lk values
      if ('lk' in normalizedKey && normalizedKey.lk !== null) {
        normalizedKey.lk = normalizeKeyValue(normalizedKey.lk);
      }

      // Normalize loc array lk values
      if ('loc' in normalizedKey && Array.isArray(normalizedKey.loc)) {
        normalizedKey.loc = normalizedKey.loc.map((locItem: any) => {
          if (typeof locItem === 'object' && locItem !== null && 'lk' in locItem && (locItem as any).lk !== null) {
            return { ...locItem, lk: normalizeKeyValue((locItem as any).lk) };
          }
          return locItem;
        });
      }

      // Use deterministic stringify to ensure consistent key ordering
      return deterministicStringify(normalizedKey);
    }
    return JSON.stringify(key);
  };
};

// Helper function to normalize and compare location key arrays
export const isLocKeyArrayEqual = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const normalizedA = normalizeLocKeyItem(a[i]);
    const normalizedB = normalizeLocKeyItem(b[i]);

    if (deterministicStringify(normalizedA) !== deterministicStringify(normalizedB)) {
      return false;
    }
  }

  return true;
};

// Helper function to normalize a location key item
export const normalizeLocKeyItem = (item: any): any => {
  if (typeof item === 'object' && item !== null) {
    const normalized = { ...item };

    if ('lk' in normalized && normalized.lk !== null) {
      normalized.lk = normalizeKeyValue(normalized.lk);
    }

    return normalized;
  }

  return item;
};

// Query result cache utilities

/**
 * Interface for storing query results
 */
export interface QueryCacheEntry {
  itemKeys: (any)[];
  metadata?: any; // Optional metadata for query expiration and completeness tracking
}

/**
 * Generate a safe hash for all/one query parameters
 */
export const createQueryHash = <
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    pkType: S,
    query: ItemQuery,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): string => {
  // Normalize the query object for consistent ordering
  const normalizedQuery = JSON.parse(JSON.stringify(query || {}));

  // Sort keys to ensure consistent hash
  const sortedQueryKeys = Object.keys(normalizedQuery).sort();
  const sortedQuery: Record<string, any> = {};
  sortedQueryKeys.forEach(key => {
    sortedQuery[key] = normalizedQuery[key];
  });

  // Normalize locations using existing utility - ensure locations is an array
  const locationsArray = Array.isArray(locations) ? locations : [];
  const normalizedLocations = locationsArray.map(normalizeLocKeyItem);

  // Create the hash input object
  const hashInput = {
    type: 'query',
    pkType,
    query: sortedQuery,
    locations: normalizedLocations
  };

  return deterministicStringify(hashInput);
};

/**
 * Generate a safe hash for find/findOne query parameters
 */
export const createFinderHash = <
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    finder: string,
    params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): string => {
  // Normalize the params object for consistent ordering
  const normalizedParams = JSON.parse(JSON.stringify(params || {}));

  // Sort keys to ensure consistent hash
  const sortedParamKeys = Object.keys(normalizedParams).sort();
  const sortedParams: Record<string, any> = {};
  sortedParamKeys.forEach(key => {
    sortedParams[key] = normalizedParams[key];
  });

  // Normalize locations using existing utility - ensure locations is an array
  const locationsArray = Array.isArray(locations) ? locations : [];
  const normalizedLocations = locationsArray.map(normalizeLocKeyItem);

  // Create the hash input object
  const hashInput = {
    type: 'finder',
    finder,
    params: sortedParams,
    locations: normalizedLocations
  };

  return deterministicStringify(hashInput);
};

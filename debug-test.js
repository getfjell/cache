import { MemoryCacheMap } from './dist/index.js';

// Test data types
const priKey1 = { kt: 'test', pk: '1' };
const comKey1 = {
  kt: 'test',
  pk: '3',
  loc: [{ kt: 'container', lk: 'container1' }]
};

// Create cache map
const cacheMap = new MemoryCacheMap(['test', 'container']);

// Add test items
await cacheMap.set(priKey1, { key: priKey1, id: '1', name: 'Item 1', value: 100 });
await cacheMap.set(comKey1, { key: comKey1, id: '3', name: 'Item 3', value: 300 });

// Set query result
const queryHash = 'test_query';
cacheMap.setQueryResult(queryHash, [priKey1, comKey1]);

console.log('Before invalidation:');
console.log('Query result exists:', await cacheMap.hasQueryResult(queryHash));
console.log('priKey1 exists:', await cacheMap.includesKey(priKey1));
console.log('comKey1 exists:', await cacheMap.includesKey(comKey1));

// Check the query result content
const queryResult = await cacheMap.getQueryResult(queryHash);
console.log('Query result content:', queryResult);

// Check the internal query result cache
console.log('Internal query result cache keys:', Object.keys(cacheMap.queryResultCache || {}));

// Invalidate location
const location = [{ kt: 'container', lk: 'container1' }];
console.log('\nInvalidating location:', location);

// Check what keys will be invalidated
const itemsInLocation = await cacheMap.allIn(location);
console.log('Items in location:', itemsInLocation);
const keysToInvalidate = itemsInLocation.map(item => item.key);
console.log('Keys to invalidate:', keysToInvalidate);

await cacheMap.invalidateLocation(location);

console.log('\nAfter invalidation:');
console.log('Query result exists:', await cacheMap.hasQueryResult(queryHash));
console.log('priKey1 exists:', await cacheMap.includesKey(priKey1));
console.log('comKey1 exists:', await cacheMap.includesKey(comKey1));

// Check what keys were actually invalidated
console.log('\nAll keys after invalidation:', await cacheMap.keys());

// Check if the query result was modified
const queryResultAfter = await cacheMap.getQueryResult(queryHash);
console.log('Query result content after:', queryResultAfter);

// Check the internal query result cache again
console.log('Internal query result cache keys after:', Object.keys(cacheMap.queryResultCache || {}));

// Try to manually delete the query result to see if that works
console.log('\nManually deleting query result...');
await cacheMap.deleteQueryResult(queryHash);
console.log('Query result exists after manual deletion:', await cacheMap.hasQueryResult(queryHash));

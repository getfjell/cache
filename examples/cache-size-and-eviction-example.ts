/**
 * Example demonstrating cache size limits and eviction policies
 *
 * This example shows how to configure cache size limits using both
 * byte-based and item count limits, and how different eviction policies
 * behave when limits are exceeded.
 */

import { EnhancedMemoryCacheMap, formatBytes } from '../src';
import { Item } from '@fjell/core';

// Define a sample data model
interface Product extends Item<'product'> {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
}

export function demonstrateCacheSizeLimits() {
  console.log('=== Cache Size Limits and Eviction Policies Demo ===\n');

  // Example 1: Item count limit with LRU eviction
  console.log('1. Item Count Limit with LRU Eviction');
  console.log('-------------------------------------');

  const lruCache = new EnhancedMemoryCacheMap<Product, 'product'>(
    ['product'],
    {
      maxItems: 3,
      evictionPolicy: 'lru'
    }
  );

  // Helper function to create products with proper Item structure
  const createProduct = (pk: string, name: string, description: string, price: number): Product => ({
    key: { kt: 'product', pk: pk as any },
    id: pk,
    name,
    description,
    price,
    category: 'Electronics',
    events: {} as any
  });

  // Add products beyond the limit
  const products = [
    createProduct('prod1', 'Laptop', 'Gaming laptop', 1200),
    createProduct('prod2', 'Mouse', 'Wireless mouse', 50),
    createProduct('prod3', 'Keyboard', 'Mechanical keyboard', 150),
    createProduct('prod4', 'Monitor', '4K monitor', 400)
  ];

  for (const product of products.slice(0, 3)) {
    lruCache.set(product.key, product);
    console.log(`Added: ${product.name}`);
  }

  console.log(`Cache stats: ${JSON.stringify(lruCache.getStats(), null, 2)}`);

  // Access prod1 to make it recently used
  lruCache.get(products[0].key);
  console.log('Accessed prod1 (making it recently used)');

  // Add prod4, should evict prod2 (least recently used)
  lruCache.set(products[3].key, products[3]);
  console.log('Added prod4 - this should evict the least recently used item');

  console.log('\nItems remaining in cache:');
  for (const product of products) {
    const cached = lruCache.get(product.key);
    console.log(`${product.name}: ${cached ? 'Present' : 'Evicted'}`);
  }

  console.log(`\nFinal cache stats: ${JSON.stringify(lruCache.getStats(), null, 2)}\n`);

  // Example 2: Byte-based size limit with different eviction policies
  console.log('2. Byte-based Size Limit with FIFO Eviction');
  console.log('------------------------------------------');

  const fifoCache = new EnhancedMemoryCacheMap<Product, 'product'>(
    ['product'],
    {
      maxSizeBytes: '2KB', // Very small limit for demonstration
      evictionPolicy: 'fifo'
    }
  );

  for (const product of products) {
    fifoCache.set(product.key, product);
    const stats = fifoCache.getStats();
    console.log(`Added ${product.name} - Size: ${formatBytes(stats.currentSizeBytes)} / ${formatBytes(stats.maxSizeBytes || 0)}`);

    if (stats.utilizationPercent?.bytes) {
      console.log(`Utilization: ${stats.utilizationPercent.bytes.toFixed(1)}%`);
    }
  }

  console.log('\nItems remaining in FIFO cache:');
  for (const product of products) {
    const cached = fifoCache.get(product.key);
    console.log(`${product.name}: ${cached ? 'Present' : 'Evicted'}`);
  }

  // Example 3: LFU (Least Frequently Used) eviction
  console.log('\n3. LFU (Least Frequently Used) Eviction');
  console.log('---------------------------------------');

  const lfuCache = new EnhancedMemoryCacheMap<Product, 'product'>(
    ['product'],
    {
      maxItems: 3,
      evictionPolicy: 'lfu'
    }
  );

  // Add initial items
  for (const product of products.slice(0, 3)) {
    lfuCache.set(product.key, product);
  }

  // Create different access patterns
  lfuCache.get(products[0].key); // Access 2 times total
  lfuCache.get(products[0].key);

  lfuCache.get(products[2].key); // Access 4 times total
  lfuCache.get(products[2].key);
  lfuCache.get(products[2].key);
  lfuCache.get(products[2].key);

  // prod2 has only 1 access (from set operation)

  console.log('Access pattern created:');
  console.log('- prod1: 2 accesses');
  console.log('- prod2: 1 access (least frequent)');
  console.log('- prod3: 4 accesses');

  // Add prod4, should evict prod2 (least frequently used)
  lfuCache.set(products[3].key, products[3]);
  console.log('\nAdded prod4 - should evict least frequently used (prod2)');

  console.log('\nItems remaining in LFU cache:');
  for (const product of products) {
    const cached = lfuCache.get(product.key);
    console.log(`${product.name}: ${cached ? 'Present' : 'Evicted'}`);
  }

  // Example 4: Combined size and item limits
  console.log('\n4. Combined Size and Item Limits');
  console.log('-------------------------------');

  const combinedCache = new EnhancedMemoryCacheMap<Product, 'product'>(
    ['product'],
    {
      maxItems: 5,
      maxSizeBytes: '1KB',
      evictionPolicy: 'lru'
    }
  );

  console.log('Cache configured with both item limit (5) and size limit (1KB)');

  for (const product of products) {
    combinedCache.set(product.key, product);
    const stats = combinedCache.getStats();
    console.log(`Added ${product.name}:`);
    console.log(`  Items: ${stats.currentItemCount}/${stats.maxItems}`);
    console.log(`  Size: ${formatBytes(stats.currentSizeBytes)}/${formatBytes(stats.maxSizeBytes || 0)}`);

    if (stats.utilizationPercent) {
      if (stats.utilizationPercent.items) {
        console.log(`  Item utilization: ${stats.utilizationPercent.items.toFixed(1)}%`);
      }
      if (stats.utilizationPercent.bytes) {
        console.log(`  Size utilization: ${stats.utilizationPercent.bytes.toFixed(1)}%`);
      }
    }
    console.log('');
  }

  console.log('Final items in combined cache:');
  for (const product of products) {
    const cached = combinedCache.get(product.key);
    console.log(`${product.name}: ${cached ? 'Present' : 'Evicted'}`);
  }

  // Example 5: Different size formats
  console.log('\n5. Different Size Format Examples');
  console.log('--------------------------------');

  const sizeFormats = [
    '500',      // 500 bytes
    '2KB',      // 2 kilobytes
    '1.5MB',    // 1.5 megabytes
    '1GiB',     // 1 gibibyte (binary)
    '512MiB'    // 512 mebibytes (binary)
  ];

  for (const sizeFormat of sizeFormats) {
    try {
      const cache = new EnhancedMemoryCacheMap<Product, 'product'>(
        ['product'],
        {
          maxSizeBytes: sizeFormat,
          evictionPolicy: 'lru'
        }
      );

      const stats = cache.getStats();
      console.log(`${sizeFormat} = ${formatBytes(stats.maxSizeBytes || 0)}`);
    } catch (error) {
      console.error(`Error with ${sizeFormat}: ${error}`);
    }
  }

  console.log('\n=== Demo Complete ===');
}

// Add a simple utility function that can be used to monitor cache performance
export function monitorCachePerformance<T extends { getStats(): any }>(
  cache: T,
  label: string = 'Cache'
): void {
  const stats = cache.getStats();
  console.log(`\n${label} Performance:`);
  console.log(`  Items: ${stats.currentItemCount}${stats.maxItems ? `/${stats.maxItems}` : ''}`);
  console.log(`  Size: ${formatBytes(stats.currentSizeBytes)}${stats.maxSizeBytes ? `/${formatBytes(stats.maxSizeBytes)}` : ''}`);

  if (stats.utilizationPercent) {
    if (stats.utilizationPercent.items != null) {
      console.log(`  Item Utilization: ${stats.utilizationPercent.items.toFixed(1)}%`);
    }
    if (stats.utilizationPercent.bytes != null) {
      console.log(`  Size Utilization: ${stats.utilizationPercent.bytes.toFixed(1)}%`);
    }
  }
}

// Run the demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateCacheSizeLimits();
}

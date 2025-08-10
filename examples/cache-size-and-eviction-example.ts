/**
 * Example demonstrating cache size limits and eviction policies
 *
 * This example shows how to monitor cache performance and provides
 * a simple utility function for displaying cache statistics.
 */

import { formatBytes } from '../src';

/**
 * Demonstrates basic cache statistics monitoring
 */
export function demonstrateCacheSizeLimits(): void {
  console.log('=== Cache Size Limits and Eviction Policies Demo ===\n');

  console.log('This is a placeholder demonstration.');
  console.log('For working examples, see the integration tests in the tests directory.');

  console.log('\n=== Demo Complete ===');
}

/**
 * Monitor cache performance and display statistics
 */
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

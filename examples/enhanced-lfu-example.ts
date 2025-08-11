import { createEvictionStrategy } from '../src/eviction/EvictionStrategyFactory';
import { CacheItemMetadata, CacheMapMetadataProvider } from '../src/eviction/EvictionStrategy';
import { LFUConfig } from '../src/eviction/EvictionStrategyConfig';

/**
 * Simple metadata provider for examples
 */

class SimpleMetadataProvider implements CacheMapMetadataProvider {
  private metadata = new Map<string, CacheItemMetadata>();

  async getMetadata(key: string): Promise<CacheItemMetadata | null> {
    return this.metadata.get(key) || null;
  }

  async setMetadata(key: string, metadata: CacheItemMetadata): Promise<void> {
    this.metadata.set(key, metadata);
  }

  async deleteMetadata(key: string): Promise<void> {
    this.metadata.delete(key);
  }

  async getAllMetadata(): Promise<Map<string, CacheItemMetadata>> {
    return new Map(this.metadata);
  }

  async clearMetadata(): Promise<void> {
    this.metadata.clear();
  }

  async getCurrentSize(): Promise<{ itemCount: number; sizeBytes: number }> {
    let sizeBytes = 0;
    for (const metadata of this.metadata.values()) {
      sizeBytes += metadata.estimatedSize;
    }
    return { itemCount: this.metadata.size, sizeBytes };
  }

  async getSizeLimits(): Promise<{ maxItems: number | null; maxSizeBytes: number | null }> {
    return { maxItems: null, maxSizeBytes: null };
  }
}

/**
 * Example demonstrating the enhanced LFU eviction strategy with frequency sketching and decay
 */
async function demonstrateEnhancedLFU() {
  console.log('=== Enhanced LFU Eviction Strategy Example ===\n');

  // Example 1: Traditional LFU (backwards compatible)
  console.log('1. Traditional LFU (no decay, simple counting):');
  const traditionalLFU = createEvictionStrategy('lfu');
  await demonstrateStrategy(traditionalLFU, 'Traditional LFU');

  // Example 2: LFU with frequency sketching (more memory efficient)
  console.log('\n2. LFU with Count-Min Sketch (probabilistic counting):');
  const sketchConfig: LFUConfig = {
    type: 'lfu',
    useProbabilisticCounting: true,
    sketchWidth: 64,  // Smaller for demonstration
    sketchDepth: 3,
    decayFactor: 0    // No decay
  };
  const sketchLFU = createEvictionStrategy('lfu', 1000, sketchConfig);
  await demonstrateStrategy(sketchLFU, 'Sketch-based LFU');

  // Example 3: LFU with time-based decay
  console.log('\n3. LFU with frequency decay over time:');
  const decayConfig: LFUConfig = {
    type: 'lfu',
    useProbabilisticCounting: false,
    decayFactor: 0.1,        // 10% decay
    decayInterval: 30000,    // Every 30 seconds
    minFrequencyThreshold: 1
  };
  const decayLFU = createEvictionStrategy('lfu', 1000, decayConfig);
  demonstrateDecayStrategy(decayLFU, 'Decay-based LFU');

  // Example 4: Combined approach - sketching with decay
  console.log('\n4. Combined: Count-Min Sketch with frequency decay:');
  const combinedConfig: LFUConfig = {
    type: 'lfu',
    useProbabilisticCounting: true,
    sketchWidth: 128,
    sketchDepth: 4,
    decayFactor: 0.05,       // 5% decay
    decayInterval: 60000,    // Every minute
    minFrequencyThreshold: 1.0
  };
  const combinedLFU = createEvictionStrategy('lfu', 1000, combinedConfig);
  await demonstrateStrategy(combinedLFU, 'Combined Sketch+Decay LFU');
}

async function demonstrateStrategy(strategy: any, name: string) {
  const metadataProvider = new SimpleMetadataProvider();

  // Create some cache items
  const itemData = [
    { key: 'user:123', accessCount: 10 },
    { key: 'post:456', accessCount: 3 },
    { key: 'config:app', accessCount: 50 },
    { key: 'temp:data', accessCount: 1 }
  ];

  itemData.forEach(async ({ key, accessCount }) => {
    const metadata: CacheItemMetadata = {
      key,
      addedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 1,
      estimatedSize: 1024
    };

    // Add item through metadata provider
    await metadataProvider.setMetadata(key, metadata);
    strategy.onItemAdded(key, metadata.estimatedSize, metadataProvider);

    // Simulate accesses
    for (let i = 1; i < accessCount; i++) {
      metadata.accessCount++;
      metadata.lastAccessedAt = Date.now();
      await metadataProvider.setMetadata(key, metadata);
      strategy.onItemAccessed(key, metadataProvider);
    }
  });

  // Show eviction selection
  const context = {
    currentSize: metadataProvider.getCurrentSize(),
    limits: metadataProvider.getSizeLimits()
  };
  const evictKey = strategy.selectForEviction(metadataProvider, context);
  console.log(`  ${name} would evict: ${evictKey}`);

  // Show frequency information
  console.log('  Frequency data:');
  const allMetadata = await metadataProvider.getAllMetadata();
  for (const [key, metadata] of allMetadata) {
    const freq = metadata.rawFrequency || metadata.accessCount;
    const score = metadata.frequencyScore ? ` (score: ${metadata.frequencyScore.toFixed(2)})` : '';
    console.log(`    ${key}: ${freq} accesses${score}`);
  }
}

async function demonstrateDecayStrategy(strategy: any, name: string) {
  const metadataProvider = new SimpleMetadataProvider();

  // Create items with different ages
  const oldTime = Date.now() - 120000; // 2 minutes ago
  const newTime = Date.now() - 10000;  // 10 seconds ago

  const itemData = [
    { key: 'old-frequent', accessCount: 20, addedAt: oldTime },
    { key: 'new-frequent', accessCount: 15, addedAt: newTime },
    { key: 'old-rare', accessCount: 5, addedAt: oldTime },
    { key: 'new-rare', accessCount: 3, addedAt: newTime }
  ];

  itemData.forEach(async ({ key, accessCount, addedAt }) => {
    const metadata: CacheItemMetadata = {
      key,
      addedAt,
      lastAccessedAt: addedAt,
      accessCount: 1,
      estimatedSize: 1024
    };

    // Add item through metadata provider
    await metadataProvider.setMetadata(key, metadata);
    strategy.onItemAdded(key, metadata.estimatedSize, metadataProvider);

    // Simulate accesses
    for (let i = 1; i < accessCount; i++) {
      metadata.accessCount++;
      metadata.lastAccessedAt = Date.now();
      await metadataProvider.setMetadata(key, metadata);
      strategy.onItemAccessed(key, metadataProvider);
    }
  });

  // Show eviction selection
  const context = {
    currentSize: metadataProvider.getCurrentSize(),
    limits: metadataProvider.getSizeLimits()
  };
  const evictKey = strategy.selectForEviction(metadataProvider, context);
  console.log(`  ${name} would evict: ${evictKey}`);

  // Show frequency scores with decay
  console.log('  Decay-adjusted frequency scores:');
  const allMetadata = await metadataProvider.getAllMetadata();
  for (const [key, metadata] of allMetadata) {
    const score = metadata.frequencyScore || metadata.rawFrequency || metadata.accessCount;
    const age = Math.round((Date.now() - metadata.addedAt) / 1000);
    console.log(`    ${key}: ${score.toFixed(2)} (${age}s old)`);
  }
}

// Performance comparison
function performanceComparison() {
  console.log('\n=== Performance Characteristics ===\n');

  console.log('Memory Usage:');
  console.log('• Traditional LFU: O(n) where n = number of cache items');
  console.log('• Count-Min Sketch: O(w×d) where w=width, d=depth (constant, independent of cache size)');
  console.log('• Example: 1M items vs 128×4 sketch = ~240KB vs ~8MB metadata\n');

  console.log('Frequency Accuracy:');
  console.log('• Traditional LFU: 100% accurate frequency counts');
  console.log('• Count-Min Sketch: ~95-99% accurate with small overestimation bias');
  console.log('• Decay-based: Weights recent activity higher than old activity\n');

  console.log('Use Cases:');
  console.log('• Traditional: Small to medium caches, exact frequency needed');
  console.log('• Sketching: Large caches, memory-constrained environments');
  console.log('• Decay: Workloads with changing access patterns');
  console.log('• Combined: Large caches with evolving access patterns');
}

// Configuration examples
function configurationExamples() {
  console.log('\n=== Configuration Examples ===\n');

  const examples = [
    {
      name: 'High-Memory Server',
      config: { type: 'lfu' as const, useProbabilisticCounting: false, decayFactor: 0 },
      description: 'Traditional LFU for maximum accuracy'
    },
    {
      name: 'Memory-Constrained Mobile',
      config: {
        type: 'lfu' as const,
        useProbabilisticCounting: true,
        sketchWidth: 32,
        sketchDepth: 2,
        decayFactor: 0
      },
      description: 'Small sketch to minimize memory usage'
    },
    {
      name: 'Web Application Cache',
      config: {
        type: 'lfu' as const,
        useProbabilisticCounting: true,
        sketchWidth: 256,
        sketchDepth: 4,
        decayFactor: 0.1,
        decayInterval: 300000 // 5 minutes
      },
      description: 'Balanced sketch with gradual decay for web traffic patterns'
    },
    {
      name: 'Real-time Analytics',
      config: {
        type: 'lfu' as const,
        useProbabilisticCounting: true,
        sketchWidth: 512,
        sketchDepth: 6,
        decayFactor: 0.2,
        decayInterval: 60000, // 1 minute
        minFrequencyThreshold: 1
      },
      description: 'Aggressive decay for rapidly changing data patterns'
    }
  ];

  examples.forEach(({ name, config, description }) => {
    console.log(`${name}:`);
    console.log(`  ${description}`);
    console.log(`  Config: ${JSON.stringify(config, null, 2)}\n`);
  });
}

// Run the examples
if (require.main === module) {
  demonstrateEnhancedLFU();
  performanceComparison();
  configurationExamples();
}

export { demonstrateEnhancedLFU, performanceComparison, configurationExamples };

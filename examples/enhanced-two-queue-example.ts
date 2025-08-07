import { createEvictionStrategy } from '../src/eviction/EvictionStrategyFactory';
import { CacheItemMetadata } from '../src/eviction/EvictionStrategy';
import { TwoQueueConfig } from '../src/eviction/EvictionStrategyConfig';

/**
 * Example demonstrating the enhanced 2Q eviction strategy with frequency-based enhancements
 */
function demonstrateEnhanced2Q() {
  console.log('=== Enhanced 2Q (Two-Queue) Eviction Strategy Example ===\n');

  // Example 1: Traditional 2Q behavior
  console.log('1. Traditional 2Q (simple promotion on second access):');
  const traditional2Q = createEvictionStrategy('2q', 100);
  demonstrate2QStrategy(traditional2Q, 'Traditional 2Q');

  // Example 2: 2Q with frequency-based promotion
  console.log('\n2. 2Q with frequency-based promotion:');
  const frequencyConfig: TwoQueueConfig = {
    type: '2q',
    maxCacheSize: 100,
    useFrequencyPromotion: true,
    promotionThreshold: 3,      // Require 3 accesses to promote
    useFrequencyWeightedLRU: true
  };
  const frequency2Q = createEvictionStrategy('2q', 100, frequencyConfig);
  demonstrate2QStrategy(frequency2Q, 'Frequency-Enhanced 2Q');

  // Example 3: 2Q with frequency decay
  console.log('\n3. 2Q with frequency decay in hot queue:');
  const decayConfig: TwoQueueConfig = {
    type: '2q',
    maxCacheSize: 100,
    useFrequencyPromotion: true,
    promotionThreshold: 2,
    useFrequencyWeightedLRU: true,
    hotQueueDecayFactor: 0.1,    // 10% decay
    hotQueueDecayInterval: 300000 // 5 minutes
  };
  const decay2Q = createEvictionStrategy('2q', 100, decayConfig);
  demonstrateDecay2Q(decay2Q, 'Decay-Enhanced 2Q');

  // Example 4: Custom aggressive configuration
  console.log('\n4. Aggressive frequency tracking:');
  const aggressiveConfig: TwoQueueConfig = {
    type: '2q',
    maxCacheSize: 100,
    useFrequencyPromotion: true,
    promotionThreshold: 5,       // High threshold for promotion
    useFrequencyWeightedLRU: true,
    hotQueueDecayFactor: 0.15,   // Faster decay
    hotQueueDecayInterval: 120000 // 2 minutes
  };
  const aggressive2Q = createEvictionStrategy('2q', 100, aggressiveConfig);
  demonstrate2QStrategy(aggressive2Q, 'Aggressive 2Q');
}

function demonstrate2QStrategy(strategy: any, name: string) {
  const items = new Map<string, CacheItemMetadata>();

  // Create items with different access patterns
  const itemData = [
    { key: 'recent:page1', accessCount: 1, type: 'recent' },
    { key: 'recent:page2', accessCount: 1, type: 'recent' },
    { key: 'hot:user123', accessCount: 8, type: 'hot' },
    { key: 'hot:config', accessCount: 12, type: 'hot' },
    { key: 'warm:session', accessCount: 3, type: 'warm' }
  ];

  itemData.forEach(({ key, accessCount, type }) => {
    const metadata: CacheItemMetadata = {
      key,
      addedAt: Date.now() - (type === 'hot' ? 300000 : 60000), // Hot items are older
      lastAccessedAt: Date.now() - 1000,
      accessCount: 1,
      estimatedSize: 1024
    };

    // Add item to cache
    strategy.onItemAdded(key, metadata);

    // Simulate accesses
    for (let i = 1; i < accessCount; i++) {
      strategy.onItemAccessed(key, metadata);
    }

    items.set(key, metadata);
  });

  // Show eviction selection
  const evictKey = strategy.selectForEviction(items);
  console.log(`  ${name} would evict: ${evictKey}`);

  // Show item details
  console.log('  Item details:');
  for (const [key, metadata] of items) {
    const freq = metadata.rawFrequency || metadata.accessCount;
    const score = metadata.frequencyScore ? ` (score: ${metadata.frequencyScore.toFixed(2)})` : '';
    const type = key.includes('recent') ? 'Recent' : key.includes('hot') ? 'Hot' : 'Warm';
    console.log(`    ${key}: ${freq} accesses${score} [${type} Queue]`);
  }
}

function demonstrateDecay2Q(strategy: any, name: string) {
  const items = new Map<string, CacheItemMetadata>();

  // Create items with different ages to show decay effect
  const oldTime = Date.now() - 600000; // 10 minutes ago
  const newTime = Date.now() - 30000;  // 30 seconds ago

  const itemData = [
    { key: 'old-frequent', accessCount: 15, addedAt: oldTime },
    { key: 'new-frequent', accessCount: 8, addedAt: newTime },
    { key: 'old-moderate', accessCount: 6, addedAt: oldTime },
    { key: 'new-moderate', accessCount: 4, addedAt: newTime }
  ];

  itemData.forEach(({ key, accessCount, addedAt }) => {
    const metadata: CacheItemMetadata = {
      key,
      addedAt,
      lastAccessedAt: addedAt,
      accessCount: 1,
      estimatedSize: 1024
    };

    strategy.onItemAdded(key, metadata);

    // Simulate accesses over time
    for (let i = 1; i < accessCount; i++) {
      strategy.onItemAccessed(key, metadata);
    }

    items.set(key, metadata);
  });

  // Show eviction selection
  const evictKey = strategy.selectForEviction(items);
  console.log(`  ${name} would evict: ${evictKey}`);

  // Show decay-adjusted scores
  console.log('  Decay-adjusted frequency analysis:');
  for (const [key, metadata] of items) {
    const rawFreq = metadata.rawFrequency || metadata.accessCount;
    const effectiveScore = metadata.frequencyScore || rawFreq;
    const age = Math.round((Date.now() - metadata.addedAt) / 60000); // Age in minutes
    console.log(`    ${key}: raw=${rawFreq}, effective=${effectiveScore.toFixed(2)} (${age}min old)`);
  }
}

// Algorithm comparison
function algorithmComparison() {
  console.log('\n=== 2Q Algorithm Enhancements ===\n');

  console.log('Traditional 2Q Algorithm:');
  console.log('• Recent Queue (A1): New items, evicted first');
  console.log('• Hot Queue (Am): Items accessed ≥2 times, uses LRU');
  console.log('• Ghost Queue: Tracks recently evicted items for re-promotion');
  console.log('• Simple promotion: Move to hot queue on second access\n');

  console.log('Enhanced 2Q Algorithm:');
  console.log('• Frequency-based promotion: Configurable threshold (not just ≥2)');
  console.log('• Frequency-weighted LRU: Considers both recency AND frequency in hot queue');
  console.log('• Decay mechanism: Old frequent items lose priority over time');
  console.log('• Configurable parameters: Fine-tune for specific workloads\n');

  console.log('Key Improvements:');
  console.log('1. Better promotion decisions based on actual usage patterns');
  console.log('2. More sophisticated eviction from hot queue');
  console.log('3. Adaptive behavior for changing access patterns');
  console.log('4. Configurable thresholds for different cache workloads');
}

// Use case scenarios
function useCaseScenarios() {
  console.log('\n=== Use Case Scenarios ===\n');

  const scenarios = [
    {
      name: 'Web Page Caching',
      config: {
        type: '2q' as const,
        useFrequencyPromotion: true,
        promotionThreshold: 2,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.05,
        hotQueueDecayInterval: 1800000 // 30 minutes
      },
      description: 'Moderate promotion threshold with slow decay for web content'
    },
    {
      name: 'Database Query Cache',
      config: {
        type: '2q' as const,
        useFrequencyPromotion: true,
        promotionThreshold: 3,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.1,
        hotQueueDecayInterval: 600000 // 10 minutes
      },
      description: 'Higher threshold and faster decay for dynamic query patterns'
    },
    {
      name: 'Real-time Analytics',
      config: {
        type: '2q' as const,
        useFrequencyPromotion: true,
        promotionThreshold: 5,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.2,
        hotQueueDecayInterval: 300000 // 5 minutes
      },
      description: 'High threshold and aggressive decay for rapidly changing data'
    },
    {
      name: 'Static Asset Cache',
      config: {
        type: '2q' as const,
        useFrequencyPromotion: false, // Traditional behavior
        useFrequencyWeightedLRU: false,
        hotQueueDecayFactor: 0
      },
      description: 'Traditional 2Q for stable, predictable access patterns'
    }
  ];

  scenarios.forEach(({ name, config, description }) => {
    console.log(`${name}:`);
    console.log(`  ${description}`);
    console.log(`  Key settings: promotion=${config.promotionThreshold || 2}, decay=${config.hotQueueDecayFactor || 0}\n`);
  });
}

// Run the examples
if (require.main === module) {
  demonstrateEnhanced2Q();
  algorithmComparison();
  useCaseScenarios();
}

export { demonstrateEnhanced2Q, algorithmComparison, useCaseScenarios };

import { createEvictionStrategy } from '../src/eviction/EvictionStrategyFactory';
import { CacheItemMetadata } from '../src/eviction/EvictionStrategy';
import { ARCConfig } from '../src/eviction/EvictionStrategyConfig';

/**
 * Example demonstrating the enhanced ARC eviction strategy with sophisticated frequency tracking
 */
function demonstrateEnhancedARC() {
  console.log('=== Enhanced ARC (Adaptive Replacement Cache) Eviction Strategy Example ===\n');

  // Example 1: Traditional ARC behavior
  console.log('1. Traditional ARC (simple recent vs frequent classification):');
  const traditionalConfig: ARCConfig = {
    type: 'arc',
    maxCacheSize: 100,
    useEnhancedFrequency: false,
    useFrequencyWeightedSelection: false
  };
  const traditionalARC = createEvictionStrategy('arc', 100, traditionalConfig);
  demonstrateARCStrategy(traditionalARC, 'Traditional ARC');

  // Example 2: ARC with enhanced frequency tracking
  console.log('\n2. ARC with enhanced frequency tracking:');
  const enhancedConfig: ARCConfig = {
    type: 'arc',
    maxCacheSize: 100,
    frequencyThreshold: 3,
    useEnhancedFrequency: true,
    useFrequencyWeightedSelection: true,
    frequencyDecayFactor: 0
  };
  const enhancedARC = createEvictionStrategy('arc', 100, enhancedConfig);
  demonstrateARCStrategy(enhancedARC, 'Enhanced ARC');

  // Example 3: ARC with frequency decay
  console.log('\n3. ARC with frequency decay and adaptive learning:');
  const decayConfig: ARCConfig = {
    type: 'arc',
    maxCacheSize: 100,
    frequencyThreshold: 2,
    useEnhancedFrequency: true,
    useFrequencyWeightedSelection: true,
    frequencyDecayFactor: 0.1,
    frequencyDecayInterval: 600000, // 10 minutes
    adaptiveLearningRate: 1.5
  };
  const decayARC = createEvictionStrategy('arc', 100, decayConfig);
  demonstrateDecayARC(decayARC, 'Decay-Enhanced ARC');

  // Example 4: Aggressive adaptation configuration
  console.log('\n4. Aggressive adaptive ARC:');
  const aggressiveConfig: ARCConfig = {
    type: 'arc',
    maxCacheSize: 100,
    frequencyThreshold: 4,
    useEnhancedFrequency: true,
    useFrequencyWeightedSelection: true,
    frequencyDecayFactor: 0.2,
    frequencyDecayInterval: 300000, // 5 minutes
    adaptiveLearningRate: 2.0
  };
  const aggressiveARC = createEvictionStrategy('arc', 100, aggressiveConfig);
  demonstrateARCStrategy(aggressiveARC, 'Aggressive Adaptive ARC');
}

function demonstrateARCStrategy(strategy: any, name: string) {
  const items = new Map<string, CacheItemMetadata>();

  // Create items representing different access patterns
  const itemData = [
    { key: 'recent:session1', accessCount: 1, type: 'recent', age: 1000 },
    { key: 'recent:temp', accessCount: 2, type: 'recent', age: 2000 },
    { key: 'frequent:user123', accessCount: 8, type: 'frequent', age: 30000 },
    { key: 'frequent:config', accessCount: 15, type: 'frequent', age: 60000 },
    { key: 'balanced:cache', accessCount: 4, type: 'balanced', age: 15000 }
  ];

  itemData.forEach(({ key, accessCount, age }) => {
    const metadata: CacheItemMetadata = {
      key,
      addedAt: Date.now() - age,
      lastAccessedAt: Date.now() - (age / 2), // Accessed halfway through its lifetime
      accessCount: 1,
      estimatedSize: 1024
    };

    // Add item to ARC
    strategy.onItemAdded(key, metadata);

    // Simulate access pattern
    for (let i = 1; i < accessCount; i++) {
      strategy.onItemAccessed(key, metadata);
    }

    items.set(key, metadata);
  });

  // Show eviction decision
  const evictKey = strategy.selectForEviction(items);
  console.log(`  ${name} would evict: ${evictKey}`);

  // Show adaptive state
  if (strategy.getAdaptiveState) {
    const state = strategy.getAdaptiveState();
    console.log(`  Adaptive state: target=${state.targetRecentSize}, ghosts=${state.recentGhostSize}+${state.frequentGhostSize}`);
  }

  // Show item classification and scores
  console.log('  Item analysis:');
  for (const [key, metadata] of items) {
    const freq = metadata.rawFrequency || metadata.accessCount;
    const score = metadata.frequencyScore ? ` (score: ${metadata.frequencyScore.toFixed(2)})` : '';
    const age = Math.round((Date.now() - metadata.addedAt) / 1000);
    const classification = key.includes('recent') ? 'Recent' : key.includes('frequent') ? 'Frequent' : 'Balanced';
    console.log(`    ${key}: ${freq} accesses${score}, ${age}s old [${classification}]`);
  }
}

function demonstrateDecayARC(strategy: any, name: string) {
  const items = new Map<string, CacheItemMetadata>();

  // Create items with different temporal patterns to show adaptive behavior
  const oldTime = Date.now() - 1800000; // 30 minutes ago
  const medTime = Date.now() - 900000;  // 15 minutes ago
  const newTime = Date.now() - 60000;   // 1 minute ago

  const itemData = [
    { key: 'old-very-frequent', accessCount: 20, addedAt: oldTime },
    { key: 'med-frequent', accessCount: 10, addedAt: medTime },
    { key: 'new-moderate', accessCount: 5, addedAt: newTime },
    { key: 'new-fresh', accessCount: 2, addedAt: newTime }
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

    // Simulate access pattern over time
    for (let i = 1; i < accessCount; i++) {
      strategy.onItemAccessed(key, metadata);
    }

    items.set(key, metadata);
  });

  // Show adaptive eviction decision
  const evictKey = strategy.selectForEviction(items);
  console.log(`  ${name} would evict: ${evictKey}`);

  // Show how decay affects frequency analysis
  console.log('  Decay-adjusted frequency analysis:');
  for (const [key, metadata] of items) {
    const rawFreq = metadata.rawFrequency || metadata.accessCount;
    const effectiveScore = metadata.frequencyScore || rawFreq;
    const age = Math.round((Date.now() - metadata.addedAt) / 60000); // Age in minutes
    const lastAccess = Math.round((Date.now() - metadata.lastAccessedAt) / 60000);
    console.log(`    ${key}: raw=${rawFreq}, effective=${effectiveScore.toFixed(2)}, age=${age}min, last=${lastAccess}min`);
  }

  // Show adaptive learning state
  if (strategy.getAdaptiveState) {
    const state = strategy.getAdaptiveState();
    console.log(`  ARC adaptation: recent_target=${state.targetRecentSize}, recent_ghosts=${state.recentGhostSize}, frequent_ghosts=${state.frequentGhostSize}`);
  }
}

// Algorithm explanation
function algorithmExplanation() {
  console.log('\n=== ARC Algorithm Enhancements ===\n');

  console.log('Traditional ARC Algorithm:');
  console.log('• T1 (Recent): Items accessed only once');
  console.log('• T2 (Frequent): Items accessed more than once');
  console.log('• Ghost lists: Track recently evicted items for adaptive learning');
  console.log('• Adaptive target: Adjusts T1/T2 balance based on ghost hits\n');

  console.log('Enhanced ARC Algorithm:');
  console.log('• Configurable frequency threshold: Not just >1 access');
  console.log('• Frequency decay: Old frequent items lose priority over time');
  console.log('• Frequency-weighted selection: Better eviction within T1/T2');
  console.log('• Adaptive learning rate: Faster/slower adaptation to workload changes');
  console.log('• Enhanced classification: More sophisticated recent vs frequent logic\n');

  console.log('Key Improvements:');
  console.log('1. Better frequency detection with configurable thresholds');
  console.log('2. Time-based decay for evolving access patterns');
  console.log('3. More sophisticated eviction decisions within lists');
  console.log('4. Configurable adaptation speed for different workloads');
  console.log('5. Maintains ARC\'s core adaptive properties while improving accuracy');
}

// Use cases and configurations
function useCaseConfigurations() {
  console.log('\n=== ARC Configuration Use Cases ===\n');

  const configurations = [
    {
      name: 'Web Content Cache',
      config: {
        type: 'arc' as const,
        frequencyThreshold: 2,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0.05,
        frequencyDecayInterval: 1800000, // 30 minutes
        adaptiveLearningRate: 1.0
      },
      description: 'Balanced adaptation for mixed web content with moderate decay'
    },
    {
      name: 'Database Buffer Pool',
      config: {
        type: 'arc' as const,
        frequencyThreshold: 3,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0.1,
        frequencyDecayInterval: 600000, // 10 minutes
        adaptiveLearningRate: 1.5
      },
      description: 'Higher threshold with faster adaptation for database query patterns'
    },
    {
      name: 'Real-time Analytics',
      config: {
        type: 'arc' as const,
        frequencyThreshold: 4,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0.2,
        frequencyDecayInterval: 300000, // 5 minutes
        adaptiveLearningRate: 2.0
      },
      description: 'Aggressive decay and fast adaptation for rapidly changing data'
    },
    {
      name: 'File System Cache',
      config: {
        type: 'arc' as const,
        frequencyThreshold: 2,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0.01, // Very slow decay
        frequencyDecayInterval: 3600000, // 1 hour
        adaptiveLearningRate: 0.5 // Slow adaptation
      },
      description: 'Conservative decay for stable file access patterns'
    },
    {
      name: 'Legacy/Traditional',
      config: {
        type: 'arc' as const,
        useEnhancedFrequency: false,
        useFrequencyWeightedSelection: false
      },
      description: 'Original ARC behavior for compatibility or simple use cases'
    }
  ];

  configurations.forEach(({ name, config, description }) => {
    console.log(`${name}:`);
    console.log(`  ${description}`);
    console.log(`  Key settings: threshold=${config.frequencyThreshold || 'simple'}, decay=${config.frequencyDecayFactor || 0}, learning=${config.adaptiveLearningRate || 'N/A'}\n`);
  });
}

// ARC vs other strategies comparison
function strategyComparison() {
  console.log('\n=== Enhanced Eviction Strategy Comparison ===\n');

  console.log('Enhanced LFU:');
  console.log('• Focus: Pure frequency with optional sketching');
  console.log('• Best for: Workloads with clear frequency patterns');
  console.log('• Memory: O(n) or O(sketch_size) with Count-Min Sketch\n');

  console.log('Enhanced 2Q:');
  console.log('• Focus: Two-tier frequency classification');
  console.log('• Best for: Mixed workloads with recent vs frequent distinction');
  console.log('• Memory: O(n) with fixed queue allocation\n');

  console.log('Enhanced ARC:');
  console.log('• Focus: Adaptive balance between recency and frequency');
  console.log('• Best for: Dynamic workloads with changing patterns');
  console.log('• Memory: O(n) with adaptive ghost list management');
  console.log('• Advantage: Self-tuning balance, excellent for unpredictable workloads\n');

  console.log('Choosing the Right Strategy:');
  console.log('• Predictable frequency patterns → Enhanced LFU');
  console.log('• Clear recent/frequent tiers → Enhanced 2Q');
  console.log('• Unpredictable or changing patterns → Enhanced ARC');
  console.log('• Memory constraints → LFU with sketching');
  console.log('• Need self-adaptation → ARC');
}

// Run the examples
if (require.main === module) {
  demonstrateEnhancedARC();
  algorithmExplanation();
  useCaseConfigurations();
  strategyComparison();
}

export { demonstrateEnhancedARC, algorithmExplanation, useCaseConfigurations, strategyComparison };

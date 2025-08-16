import { beforeEach, describe, expect, it } from 'vitest';
import { CacheStats, CacheStatsManager } from '../src/CacheStats';

describe('CacheStats Interface', () => {
  it('should define all required properties', () => {
    const stats: CacheStats = {
      numRequests: 0,
      numMisses: 0,
      numHits: 0,
      numSubscriptions: 0,
      numUnsubscriptions: 0,
      activeSubscriptions: 0
    };

    expect(stats.numRequests).toBe(0);
    expect(stats.numMisses).toBe(0);
    expect(stats.numHits).toBe(0);
    expect(stats.numSubscriptions).toBe(0);
    expect(stats.numUnsubscriptions).toBe(0);
    expect(stats.activeSubscriptions).toBe(0);
  });

  it('should allow positive values for all properties', () => {
    const stats: CacheStats = {
      numRequests: 100,
      numMisses: 25,
      numHits: 75,
      numSubscriptions: 10,
      numUnsubscriptions: 5,
      activeSubscriptions: 5
    };

    expect(stats.numRequests).toBe(100);
    expect(stats.numMisses).toBe(25);
    expect(stats.numHits).toBe(75);
    expect(stats.numSubscriptions).toBe(10);
    expect(stats.numUnsubscriptions).toBe(5);
    expect(stats.activeSubscriptions).toBe(5);
  });
});

describe('CacheStatsManager', () => {
  let statsManager: CacheStatsManager;

  beforeEach(() => {
    statsManager = new CacheStatsManager();
  });

  describe('Initialization', () => {
    it('should initialize with zero values', () => {
      const stats = statsManager.getStats();

      expect(stats.numRequests).toBe(0);
      expect(stats.numMisses).toBe(0);
      expect(stats.numHits).toBe(0);
      expect(stats.numSubscriptions).toBe(0);
      expect(stats.numUnsubscriptions).toBe(0);
      expect(stats.activeSubscriptions).toBe(0);
    });

    it('should return a copy of stats, not the original object', () => {
      const stats1 = statsManager.getStats();
      const stats2 = statsManager.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('Request Tracking', () => {
    it('should increment request counter', () => {
      expect(statsManager.getStats().numRequests).toBe(0);

      statsManager.incrementRequests();
      expect(statsManager.getStats().numRequests).toBe(1);

      statsManager.incrementRequests();
      expect(statsManager.getStats().numRequests).toBe(2);
    });

    it('should handle multiple rapid increments', () => {
      for (let i = 0; i < 100; i++) {
        statsManager.incrementRequests();
      }

      expect(statsManager.getStats().numRequests).toBe(100);
    });
  });

  describe('Hit Tracking', () => {
    it('should increment hit counter', () => {
      expect(statsManager.getStats().numHits).toBe(0);

      statsManager.incrementHits();
      expect(statsManager.getStats().numHits).toBe(1);

      statsManager.incrementHits();
      expect(statsManager.getStats().numHits).toBe(2);
    });

    it('should handle multiple rapid increments', () => {
      for (let i = 0; i < 50; i++) {
        statsManager.incrementHits();
      }

      expect(statsManager.getStats().numHits).toBe(50);
    });
  });

  describe('Miss Tracking', () => {
    it('should increment miss counter', () => {
      expect(statsManager.getStats().numMisses).toBe(0);

      statsManager.incrementMisses();
      expect(statsManager.getStats().numMisses).toBe(1);

      statsManager.incrementMisses();
      expect(statsManager.getStats().numMisses).toBe(2);
    });

    it('should handle multiple rapid increments', () => {
      for (let i = 0; i < 25; i++) {
        statsManager.incrementMisses();
      }

      expect(statsManager.getStats().numMisses).toBe(25);
    });
  });

  describe('Subscription Tracking', () => {
    it('should increment subscription counters', () => {
      expect(statsManager.getStats().numSubscriptions).toBe(0);
      expect(statsManager.getStats().activeSubscriptions).toBe(0);

      statsManager.incrementSubscriptions();
      expect(statsManager.getStats().numSubscriptions).toBe(1);
      expect(statsManager.getStats().activeSubscriptions).toBe(1);

      statsManager.incrementSubscriptions();
      expect(statsManager.getStats().numSubscriptions).toBe(2);
      expect(statsManager.getStats().activeSubscriptions).toBe(2);
    });

    it('should handle multiple rapid subscription increments', () => {
      for (let i = 0; i < 10; i++) {
        statsManager.incrementSubscriptions();
      }

      expect(statsManager.getStats().numSubscriptions).toBe(10);
      expect(statsManager.getStats().activeSubscriptions).toBe(10);
    });
  });

  describe('Unsubscription Tracking', () => {
    it('should increment unsubscription counter and decrease active subscriptions', () => {
      // Set up some active subscriptions first
      statsManager.incrementSubscriptions();
      statsManager.incrementSubscriptions();
      statsManager.incrementSubscriptions();

      expect(statsManager.getStats().numSubscriptions).toBe(3);
      expect(statsManager.getStats().activeSubscriptions).toBe(3);
      expect(statsManager.getStats().numUnsubscriptions).toBe(0);

      // Unsubscribe one
      statsManager.incrementUnsubscriptions();
      expect(statsManager.getStats().numSubscriptions).toBe(3); // Total doesn't decrease
      expect(statsManager.getStats().activeSubscriptions).toBe(2);
      expect(statsManager.getStats().numUnsubscriptions).toBe(1);

      // Unsubscribe another
      statsManager.incrementUnsubscriptions();
      expect(statsManager.getStats().numSubscriptions).toBe(3);
      expect(statsManager.getStats().activeSubscriptions).toBe(1);
      expect(statsManager.getStats().numUnsubscriptions).toBe(2);
    });

    it('should not allow active subscriptions to go below zero', () => {
      expect(statsManager.getStats().activeSubscriptions).toBe(0);

      // Try to unsubscribe when no active subscriptions
      statsManager.incrementUnsubscriptions();
      expect(statsManager.getStats().activeSubscriptions).toBe(0);
      expect(statsManager.getStats().numUnsubscriptions).toBe(1);

      // Add a subscription and then unsubscribe twice
      statsManager.incrementSubscriptions();
      expect(statsManager.getStats().activeSubscriptions).toBe(1);

      statsManager.incrementUnsubscriptions();
      expect(statsManager.getStats().activeSubscriptions).toBe(0);

      statsManager.incrementUnsubscriptions();
      expect(statsManager.getStats().activeSubscriptions).toBe(0); // Should not go below 0
    });

    it('should handle multiple rapid unsubscriptions', () => {
      // Set up 100 active subscriptions
      for (let i = 0; i < 100; i++) {
        statsManager.incrementSubscriptions();
      }

      expect(statsManager.getStats().activeSubscriptions).toBe(100);

      // Unsubscribe 75 of them
      for (let i = 0; i < 75; i++) {
        statsManager.incrementUnsubscriptions();
      }

      expect(statsManager.getStats().activeSubscriptions).toBe(25);
      expect(statsManager.getStats().numUnsubscriptions).toBe(75);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all counters to zero', () => {
      // Set up some data
      statsManager.incrementRequests();
      statsManager.incrementHits();
      statsManager.incrementMisses();
      statsManager.incrementSubscriptions();
      statsManager.incrementUnsubscriptions();

      // Verify data exists
      const statsBefore = statsManager.getStats();
      expect(statsBefore.numRequests).toBe(1);
      expect(statsBefore.numHits).toBe(1);
      expect(statsBefore.numMisses).toBe(1);
      expect(statsBefore.numSubscriptions).toBe(1);
      expect(statsBefore.numUnsubscriptions).toBe(1);
      expect(statsBefore.activeSubscriptions).toBe(0); // 1 subscription - 1 unsubscription

      // Reset
      statsManager.reset();

      // Verify all counters are zero
      const statsAfter = statsManager.getStats();
      expect(statsAfter.numRequests).toBe(0);
      expect(statsAfter.numMisses).toBe(0);
      expect(statsAfter.numHits).toBe(0);
      expect(statsAfter.numSubscriptions).toBe(0);
      expect(statsAfter.numUnsubscriptions).toBe(0);
      expect(statsAfter.activeSubscriptions).toBe(0);
    });

    it('should reset after complex operations', () => {
      // Perform a complex sequence of operations
      for (let i = 0; i < 100; i++) {
        statsManager.incrementRequests();
        if (i % 3 === 0) {
          statsManager.incrementHits();
        } else {
          statsManager.incrementMisses();
        }
      }

      for (let i = 0; i < 20; i++) {
        statsManager.incrementSubscriptions();
      }

      for (let i = 0; i < 15; i++) {
        statsManager.incrementUnsubscriptions();
      }

      // Verify we have data
      const statsBefore = statsManager.getStats();
      expect(statsBefore.numRequests).toBe(100);
      expect(statsBefore.numHits).toBe(34); // 34 hits (every 3rd request)
      expect(statsBefore.numMisses).toBe(66); // 66 misses
      expect(statsBefore.numSubscriptions).toBe(20);
      expect(statsBefore.numUnsubscriptions).toBe(15);
      expect(statsBefore.activeSubscriptions).toBe(5); // 20 - 15

      // Reset
      statsManager.reset();

      // Verify all are zero
      const statsAfter = statsManager.getStats();
      expect(statsAfter.numRequests).toBe(0);
      expect(statsAfter.numHits).toBe(0);
      expect(statsAfter.numMisses).toBe(0);
      expect(statsAfter.numSubscriptions).toBe(0);
      expect(statsAfter.numUnsubscriptions).toBe(0);
      expect(statsAfter.activeSubscriptions).toBe(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle realistic cache usage patterns', () => {
      // Simulate a realistic cache usage scenario

      // Initial state
      expect(statsManager.getStats().numRequests).toBe(0);
      expect(statsManager.getStats().numHits).toBe(0);
      expect(statsManager.getStats().numMisses).toBe(0);

      // Simulate 1000 requests with 70% hit rate
      for (let i = 0; i < 1000; i++) {
        statsManager.incrementRequests();
        if (i < 700) {
          statsManager.incrementHits();
        } else {
          statsManager.incrementMisses();
        }
      }

      // Simulate subscription lifecycle
      for (let i = 0; i < 50; i++) {
        statsManager.incrementSubscriptions();
      }

      for (let i = 0; i < 30; i++) {
        statsManager.incrementUnsubscriptions();
      }

      // Verify final state
      const finalStats = statsManager.getStats();
      expect(finalStats.numRequests).toBe(1000);
      expect(finalStats.numHits).toBe(700);
      expect(finalStats.numMisses).toBe(300);
      expect(finalStats.numSubscriptions).toBe(50);
      expect(finalStats.numUnsubscriptions).toBe(30);
      expect(finalStats.activeSubscriptions).toBe(20);

      // Verify hit rate calculation would be correct
      const hitRate = (finalStats.numHits / finalStats.numRequests) * 100;
      expect(hitRate).toBe(70);
    });

    it('should handle edge case with no requests', () => {
      // Don't make any requests, just subscriptions
      statsManager.incrementSubscriptions();
      statsManager.incrementSubscriptions();
      statsManager.incrementUnsubscriptions();

      const stats = statsManager.getStats();
      expect(stats.numRequests).toBe(0);
      expect(stats.numHits).toBe(0);
      expect(stats.numMisses).toBe(0);
      expect(stats.numSubscriptions).toBe(2);
      expect(stats.numUnsubscriptions).toBe(1);
      expect(stats.activeSubscriptions).toBe(1);

      // Hit rate should be 0 when no requests
      const hitRate = stats.numRequests > 0 ? (stats.numHits / stats.numRequests) * 100 : 0;
      expect(hitRate).toBe(0);
    });

    it('should handle edge case with all misses', () => {
      // All requests are misses
      for (let i = 0; i < 100; i++) {
        statsManager.incrementRequests();
        statsManager.incrementMisses();
      }

      const stats = statsManager.getStats();
      expect(stats.numRequests).toBe(100);
      expect(stats.numHits).toBe(0);
      expect(stats.numMisses).toBe(100);

      // Hit rate should be 0
      const hitRate = (stats.numHits / stats.numRequests) * 100;
      expect(hitRate).toBe(0);
    });

    it('should handle edge case with all hits', () => {
      // All requests are hits
      for (let i = 0; i < 100; i++) {
        statsManager.incrementRequests();
        statsManager.incrementHits();
      }

      const stats = statsManager.getStats();
      expect(stats.numRequests).toBe(100);
      expect(stats.numHits).toBe(100);
      expect(stats.numMisses).toBe(0);

      // Hit rate should be 100
      const hitRate = (stats.numHits / stats.numRequests) * 100;
      expect(hitRate).toBe(100);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain consistency between total requests and hits + misses', () => {
      // Perform various operations
      for (let i = 0; i < 100; i++) {
        statsManager.incrementRequests();
        if (i % 2 === 0) {
          statsManager.incrementHits();
        } else {
          statsManager.incrementMisses();
        }
      }

      const stats = statsManager.getStats();
      expect(stats.numRequests).toBe(100);
      expect(stats.numHits).toBe(50);
      expect(stats.numMisses).toBe(50);
      expect(stats.numHits + stats.numMisses).toBe(stats.numRequests);
    });

    it('should maintain consistency in subscription tracking', () => {
      // Add and remove subscriptions
      for (let i = 0; i < 10; i++) {
        statsManager.incrementSubscriptions();
      }

      for (let i = 0; i < 7; i++) {
        statsManager.incrementUnsubscriptions();
      }

      const stats = statsManager.getStats();
      expect(stats.numSubscriptions).toBe(10);
      expect(stats.numUnsubscriptions).toBe(7);
      expect(stats.activeSubscriptions).toBe(3);
      expect(stats.activeSubscriptions).toBe(stats.numSubscriptions - stats.numUnsubscriptions);
    });

    it('should handle multiple resets correctly', () => {
      // Add some data
      statsManager.incrementRequests();
      statsManager.incrementHits();
      statsManager.incrementSubscriptions();

      // Reset
      statsManager.reset();
      expect(statsManager.getStats().numRequests).toBe(0);

      // Add more data
      statsManager.incrementRequests();
      statsManager.incrementMisses();
      statsManager.incrementSubscriptions();
      statsManager.incrementUnsubscriptions();

      // Reset again
      statsManager.reset();
      expect(statsManager.getStats().numRequests).toBe(0);
      expect(statsManager.getStats().numHits).toBe(0);
      expect(statsManager.getStats().numMisses).toBe(0);
      expect(statsManager.getStats().numSubscriptions).toBe(0);
      expect(statsManager.getStats().numUnsubscriptions).toBe(0);
      expect(statsManager.getStats().activeSubscriptions).toBe(0);
    });
  });
});

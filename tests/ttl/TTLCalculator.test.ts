/**
 * TTL Calculator Tests
 *
 * Tests the smart TTL calculation logic with various scenarios
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TTLCalculator } from '../../src/ttl/TTLCalculator.js';
import { defaultTTLConfig, TTLConfig } from '../../src/ttl/TTLConfig.js';

describe('TTLCalculator', () => {
  let calculator: TTLCalculator;
  let testConfig: TTLConfig;

  beforeEach(() => {
    testConfig = {
      item: {
        default: 3600, // 1 hour
        byType: {
          'orderPhase': 1800, // 30 minutes
          'customer': 7200,   // 2 hours
        }
      },
      query: {
        complete: 300, // 5 minutes
        faceted: 60,   // 1 minute
        byFacet: {
          'report': 30,   // 30 seconds
          'search': 120,  // 2 minutes
        }
      },
      adjustments: {
        peakHours: {
          start: 9,
          end: 17,
          multiplier: 0.5
        },
        staleWhileRevalidate: true
      }
    };

    calculator = new TTLCalculator(testConfig);
  });

  describe('Item TTL Calculation', () => {
    it('should use default TTL for unknown item types', () => {
      // Use a timestamp outside peak hours to avoid adjustments
      const nonPeakTime = new Date('2024-01-15T20:00:00'); // 8 PM
      const result = calculator.calculateItemTTL('unknown', { timestamp: nonPeakTime });
      
      expect(result.ttl).toBe(3600);
      expect(result.baseTTL).toBe(3600);
      expect(result.staleThreshold).toBe(2880); // 80% of 3600
    });

    it('should use type-specific TTL when available', () => {
      // Use a timestamp outside peak hours to avoid adjustments
      const nonPeakTime = new Date('2024-01-15T20:00:00'); // 8 PM
      const result = calculator.calculateItemTTL('orderPhase', { timestamp: nonPeakTime });
      
      expect(result.baseTTL).toBe(1800);
      expect(result.staleThreshold).toBe(1440); // 80% of 1800
    });

    it('should apply peak hours adjustment', () => {
      // 2 PM on a weekday (peak hours)
      const peakTime = new Date('2024-01-15T14:00:00');
      
      const result = calculator.calculateItemTTL('customer', { timestamp: peakTime });
      
      expect(result.baseTTL).toBe(7200);
      expect(result.ttl).toBe(3600); // 50% of 7200 during peak hours
      expect(result.adjustments.peakHours?.applied).toBe(true);
      expect(result.adjustments.peakHours?.multiplier).toBe(0.5);
    });

    it('should not apply peak hours adjustment outside business hours', () => {
      // 8 PM (after hours)
      const afterHours = new Date('2024-01-15T20:00:00');
      
      const result = calculator.calculateItemTTL('customer', { timestamp: afterHours });
      
      expect(result.baseTTL).toBe(7200);
      expect(result.ttl).toBe(7200); // No adjustment
      expect(result.adjustments.peakHours?.applied).toBe(false);
    });
  });

  describe('Query TTL Calculation', () => {
    it('should use complete query TTL for complete queries', () => {
      // Use a timestamp outside peak hours to avoid adjustments
      const nonPeakTime = new Date('2024-01-15T20:00:00'); // 8 PM
      const result = calculator.calculateQueryTTL('all', true, { timestamp: nonPeakTime });
      
      expect(result.baseTTL).toBe(300);
      expect(result.ttl).toBe(300);
    });

    it('should use faceted query TTL for incomplete queries', () => {
      // Use a timestamp outside peak hours to avoid adjustments
      const nonPeakTime = new Date('2024-01-15T20:00:00'); // 8 PM
      const result = calculator.calculateQueryTTL('unknown', false, { timestamp: nonPeakTime });
      
      expect(result.baseTTL).toBe(60);
      expect(result.ttl).toBe(60);
    });

    it('should use facet-specific TTL when available', () => {
      // Use a timestamp outside peak hours to avoid adjustments
      const nonPeakTime = new Date('2024-01-15T20:00:00'); // 8 PM
      const result = calculator.calculateQueryTTL('report', false, { timestamp: nonPeakTime });
      
      expect(result.baseTTL).toBe(30);
      expect(result.ttl).toBe(30);
    });

    it('should apply peak hours to query TTL', () => {
      const peakTime = new Date('2024-01-15T12:00:00');
      
      const result = calculator.calculateQueryTTL('search', false, { timestamp: peakTime });
      
      expect(result.baseTTL).toBe(120);
      expect(result.ttl).toBe(60); // 50% during peak hours
      expect(result.adjustments.peakHours?.applied).toBe(true);
    });
  });

  describe('Stale Detection', () => {
    it('should detect stale data at 80% of TTL', () => {
      const createdAt = new Date('2024-01-15T10:00:00');
      const checkTime = new Date('2024-01-15T10:49:00'); // 49 minutes later
      const ttl = 3600; // 1 hour
      
      const isStale = calculator.isStale(createdAt, ttl, checkTime);
      
      expect(isStale).toBe(true); // 49 minutes > 80% of 60 minutes (48 minutes)
    });

    it('should not detect fresh data as stale', () => {
      const createdAt = new Date('2024-01-15T10:00:00');
      const checkTime = new Date('2024-01-15T10:30:00'); // 30 minutes later
      const ttl = 3600; // 1 hour
      
      const isStale = calculator.isStale(createdAt, ttl, checkTime);
      
      expect(isStale).toBe(false); // 30 minutes < 80% of 60 minutes
    });
  });

  describe('Expiration Detection', () => {
    it('should detect expired data', () => {
      const createdAt = new Date('2024-01-15T10:00:00');
      const checkTime = new Date('2024-01-15T11:30:00'); // 90 minutes later
      const ttl = 3600; // 1 hour
      
      const isExpired = calculator.isExpired(createdAt, ttl, checkTime);
      
      expect(isExpired).toBe(true);
    });

    it('should not detect non-expired data', () => {
      const createdAt = new Date('2024-01-15T10:00:00');
      const checkTime = new Date('2024-01-15T10:30:00'); // 30 minutes later
      const ttl = 3600; // 1 hour
      
      const isExpired = calculator.isExpired(createdAt, ttl, checkTime);
      
      expect(isExpired).toBe(false);
    });
  });

  describe('Peak Hours with Wrap-Around', () => {
    beforeEach(() => {
      // Night shift: 10 PM to 6 AM
      testConfig.adjustments!.peakHours = {
        start: 22,  // 10 PM
        end: 6,     // 6 AM
        multiplier: 0.3
      };
      calculator = new TTLCalculator(testConfig);
    });

    it('should handle peak hours wrap-around (late night)', () => {
      const lateNight = new Date('2024-01-15T23:00:00'); // 11 PM
      
      const result = calculator.calculateItemTTL('customer', { timestamp: lateNight });
      
      expect(result.ttl).toBe(2160); // 30% of 7200
      expect(result.adjustments.peakHours?.applied).toBe(true);
    });

    it('should handle peak hours wrap-around (early morning)', () => {
      const earlyMorning = new Date('2024-01-15T05:00:00'); // 5 AM
      
      const result = calculator.calculateItemTTL('customer', { timestamp: earlyMorning });
      
      expect(result.ttl).toBe(2160); // 30% of 7200
      expect(result.adjustments.peakHours?.applied).toBe(true);
    });

    it('should not apply adjustment outside wrap-around hours', () => {
      const afternoon = new Date('2024-01-15T14:00:00'); // 2 PM
      
      const result = calculator.calculateItemTTL('customer', { timestamp: afternoon });
      
      expect(result.ttl).toBe(7200); // No adjustment
      expect(result.adjustments.peakHours?.applied).toBe(false);
    });
  });

  describe('Contextual TTL Calculation', () => {
    it('should calculate item TTL with context', () => {
      const result = calculator.calculateContextualTTL({
        itemType: 'orderPhase'
      });
      
      expect(result.baseTTL).toBe(1800);
    });

    it('should calculate query TTL with context', () => {
      const result = calculator.calculateContextualTTL({
        queryType: 'report',
        isComplete: false
      });
      
      expect(result.baseTTL).toBe(30);
    });

    it('should throw error for invalid context', () => {
      expect(() => {
        calculator.calculateContextualTTL({});
      }).toThrow('Context must specify either itemType or (queryType + isComplete)');
    });
  });

  describe('Time Calculations', () => {
    it('should calculate stale time correctly', () => {
      const createdAt = new Date('2024-01-15T10:00:00');
      const ttl = 3600; // 1 hour
      
      const staleTime = calculator.calculateStaleTime(createdAt, ttl);
      
      expect(staleTime.getTime()).toBe(
        createdAt.getTime() + (2880 * 1000) // 48 minutes (80% of 1 hour)
      );
    });

    it('should calculate expiration time correctly', () => {
      const createdAt = new Date('2024-01-15T10:00:00');
      const ttl = 3600; // 1 hour
      
      const expirationTime = calculator.calculateExpirationTime(createdAt, ttl);
      
      expect(expirationTime.getTime()).toBe(
        createdAt.getTime() + (ttl * 1000)
      );
    });
  });

  describe('Adaptive TTL', () => {
    it('should reduce TTL for very volatile data', () => {
      const adaptiveTTL = calculator.calculateAdaptiveTTL('customer', 15); // 15 changes/hour
      
      expect(adaptiveTTL).toBe(1800); // 25% of 7200
    });

    it('should use moderate reduction for somewhat volatile data', () => {
      const adaptiveTTL = calculator.calculateAdaptiveTTL('customer', 3); // 3 changes/hour
      
      expect(adaptiveTTL).toBe(5400); // 75% of 7200
    });

    it('should use full TTL for stable data', () => {
      const adaptiveTTL = calculator.calculateAdaptiveTTL('customer', 0.5); // 0.5 changes/hour
      
      expect(adaptiveTTL).toBe(7200); // Full TTL
    });
  });

  describe('TTL Explanation', () => {
    it('should provide detailed explanation for item TTL', () => {
      const { result, explanation } = calculator.explainTTLCalculation({
        itemType: 'orderPhase'
      });
      
      expect(result.baseTTL).toBe(1800);
      expect(explanation).toContain('Item type: orderPhase');
      expect(explanation).toContain('Type-specific TTL: 1800s');
    });

    it('should explain peak hours adjustment', () => {
      const peakTime = new Date('2024-01-15T12:00:00');
      
      const { result, explanation } = calculator.explainTTLCalculation({
        itemType: 'customer',
        timestamp: peakTime
      });
      
      expect(explanation).toContain('Peak hours adjustment: 0.5x = 3600s');
    });
  });

  describe('Recommended TTL Scenarios', () => {
    it('should provide realtime scenario TTLs', () => {
      const recommended = calculator.getRecommendedTTL('realtime');
      
      expect(recommended.item).toBe(300); // 5 minutes
      expect(recommended.query.complete).toBe(60); // 1 minute
      expect(recommended.query.faceted).toBe(15); // 15 seconds
    });

    it('should provide normal scenario TTLs', () => {
      const recommended = calculator.getRecommendedTTL('normal');
      
      expect(recommended.item).toBe(3600); // 1 hour
      expect(recommended.query.complete).toBe(300); // 5 minutes
      expect(recommended.query.faceted).toBe(60); // 1 minute
    });

    it('should provide static scenario TTLs', () => {
      const recommended = calculator.getRecommendedTTL('static');
      
      expect(recommended.item).toBe(14400); // 4 hours
      expect(recommended.query.complete).toBe(1800); // 30 minutes
      expect(recommended.query.faceted).toBe(300); // 5 minutes
    });
  });
});

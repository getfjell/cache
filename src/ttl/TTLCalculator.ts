/**
 * TTL Calculator - Smart TTL calculation with context awareness
 *
 * Calculates appropriate TTLs based on:
 * - Item/query types
 * - Peak hours adjustments
 * - Stale-while-revalidate thresholds
 */

import { TTLConfig } from './TTLConfig.js';

export interface TTLCalculationContext {
  /** Item type for item-level TTL calculation */
  itemType?: string;
  /** Query type for query-level TTL calculation */
  queryType?: string;
  /** Whether this is a complete data set */
  isComplete?: boolean;
  /** Override timestamp for calculation (useful for testing) */
  timestamp?: Date;
}

export interface TTLResult {
  /** Calculated TTL in seconds */
  ttl: number;
  /** Original base TTL before adjustments */
  baseTTL: number;
  /** Applied adjustments */
  adjustments: {
    peakHours?: {
      applied: boolean;
      multiplier: number;
    };
  };
  /** Stale threshold in seconds (80% of TTL) */
  staleThreshold: number;
}

export class TTLCalculator {
  constructor(private config: TTLConfig) {}

  /**
   * Calculate TTL for an individual item
   */
  calculateItemTTL(itemType: string, context?: TTLCalculationContext): TTLResult {
    const baseTTL = this.config.item.byType?.[itemType] || this.config.item.default;
    const adjustedTTL = this.applyAdjustments(baseTTL, context?.timestamp);

    return {
      ttl: adjustedTTL.ttl,
      baseTTL,
      adjustments: adjustedTTL.adjustments,
      staleThreshold: Math.floor(adjustedTTL.ttl * 0.8)
    };
  }

  /**
   * Calculate TTL for a query result
   */
  calculateQueryTTL(
    queryType: string,
    isComplete: boolean,
    context?: TTLCalculationContext
  ): TTLResult {
    let baseTTL: number;

    if (isComplete) {
      baseTTL = this.config.query.complete;
    } else {
      // Check for facet-specific TTL
      baseTTL = this.config.query.byFacet?.[queryType] || this.config.query.faceted;
    }

    const adjustedTTL = this.applyAdjustments(baseTTL, context?.timestamp);

    return {
      ttl: adjustedTTL.ttl,
      baseTTL,
      adjustments: adjustedTTL.adjustments,
      staleThreshold: Math.floor(adjustedTTL.ttl * 0.8)
    };
  }

  /**
   * Calculate TTL with full context
   */
  calculateContextualTTL(context: TTLCalculationContext): TTLResult {
    if (context.itemType && !context.queryType) {
      return this.calculateItemTTL(context.itemType, context);
    }

    if (context.queryType && context.isComplete !== undefined) {
      return this.calculateQueryTTL(context.queryType, context.isComplete, context);
    }

    throw new Error(
      'Context must specify either itemType or (queryType + isComplete)'
    );
  }

  /**
   * Check if cached data is stale (but not expired)
   */
  isStale(createdAt: Date, ttl: number, timestamp?: Date): boolean {
    const now = timestamp || new Date();
    const age = now.getTime() - createdAt.getTime();
    const ageInSeconds = Math.floor(age / 1000);
    const staleThreshold = Math.floor(ttl * 0.8); // Stale at 80% of TTL

    return ageInSeconds > staleThreshold;
  }

  /**
   * Check if cached data is expired
   */
  isExpired(createdAt: Date, ttl: number, timestamp?: Date): boolean {
    const now = timestamp || new Date();
    const age = now.getTime() - createdAt.getTime();
    const ageInSeconds = Math.floor(age / 1000);

    return ageInSeconds >= ttl;
  }

  /**
   * Calculate when data will become stale
   */
  calculateStaleTime(createdAt: Date, ttl: number): Date {
    const staleThreshold = Math.floor(ttl * 0.8);
    return new Date(createdAt.getTime() + staleThreshold * 1000);
  }

  /**
   * Calculate when data will expire
   */
  calculateExpirationTime(createdAt: Date, ttl: number): Date {
    return new Date(createdAt.getTime() + ttl * 1000);
  }

  /**
   * Apply dynamic adjustments to base TTL
   */
  private applyAdjustments(baseTTL: number, timestamp?: Date): {
    ttl: number;
    adjustments: {
      peakHours?: {
        applied: boolean;
        multiplier: number;
      };
    };
  } {
    let ttl = baseTTL;
    const adjustments: any = {};

    // Apply peak hours adjustment
    if (this.config.adjustments?.peakHours) {
      const peakResult = this.applyPeakHoursAdjustment(ttl, timestamp);
      ttl = peakResult.ttl;
      adjustments.peakHours = peakResult.adjustment;
    }

    return { ttl, adjustments };
  }

  /**
   * Apply peak hours TTL reduction
   */
  private applyPeakHoursAdjustment(baseTTL: number, timestamp?: Date): {
    ttl: number;
    adjustment: {
      applied: boolean;
      multiplier: number;
    };
  } {
    const peakHours = this.config.adjustments?.peakHours;
    if (!peakHours) {
      return {
        ttl: baseTTL,
        adjustment: { applied: false, multiplier: 1 }
      };
    }

    const now = timestamp || new Date();
    const hour = now.getHours();
    const { start, end, multiplier } = peakHours;

    // Handle day wrap-around (e.g., start: 22, end: 6)
    const isPeakHours = start <= end
      ? hour >= start && hour < end  // Normal case: 9-17
      : hour >= start || hour < end; // Wrap case: 22-6

    if (isPeakHours) {
      return {
        ttl: Math.floor(baseTTL * multiplier),
        adjustment: { applied: true, multiplier }
      };
    }

    return {
      ttl: baseTTL,
      adjustment: { applied: false, multiplier }
    };
  }

  /**
   * Get recommended TTL for common scenarios
   */
  getRecommendedTTL(scenario: 'realtime' | 'normal' | 'static'): {
    item: number;
    query: { complete: number; faceted: number };
  } {
    switch (scenario) {
      case 'realtime':
        return {
          item: 300,    // 5 minutes
          query: { complete: 60, faceted: 15 } // 1 min / 15 sec
        };
      case 'normal':
        return {
          item: 3600,   // 1 hour
          query: { complete: 300, faceted: 60 } // 5 min / 1 min
        };
      case 'static':
        return {
          item: 14400,  // 4 hours
          query: { complete: 1800, faceted: 300 } // 30 min / 5 min
        };
      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }
  }

  /**
   * Calculate optimal TTL based on data volatility
   */
  calculateAdaptiveTTL(
    baseType: string,
    recentChangeFrequency: number // changes per hour
  ): number {
    const baseTTL = this.config.item.byType?.[baseType] || this.config.item.default;

    // Reduce TTL based on change frequency
    // High frequency = shorter TTL
    if (recentChangeFrequency > 10) {
      return Math.floor(baseTTL * 0.25); // Very volatile: 25% of base TTL
    } else if (recentChangeFrequency > 5) {
      return Math.floor(baseTTL * 0.5);  // Volatile: 50% of base TTL
    } else if (recentChangeFrequency > 1) {
      return Math.floor(baseTTL * 0.75); // Moderate: 75% of base TTL
    }

    return baseTTL; // Stable: full TTL
  }

  /**
   * Debug information about TTL calculation
   */
  explainTTLCalculation(context: TTLCalculationContext): {
    result: TTLResult;
    explanation: string[];
  } {
    const result = this.calculateContextualTTL(context);
    const explanation: string[] = [];

    if (context.itemType) {
      explanation.push(`Item type: ${context.itemType}`);
      const typeSpecific = this.config.item.byType?.[context.itemType];
      if (typeSpecific) {
        explanation.push(`Type-specific TTL: ${typeSpecific}s`);
      } else {
        explanation.push(`Default item TTL: ${this.config.item.default}s`);
      }
    }

    if (context.queryType) {
      explanation.push(`Query type: ${context.queryType} (${context.isComplete ? 'complete' : 'faceted'})`);
      if (context.isComplete) {
        explanation.push(`Complete query TTL: ${this.config.query.complete}s`);
      } else {
        const facetSpecific = this.config.query.byFacet?.[context.queryType];
        if (facetSpecific) {
          explanation.push(`Facet-specific TTL: ${facetSpecific}s`);
        } else {
          explanation.push(`Default faceted TTL: ${this.config.query.faceted}s`);
        }
      }
    }

    if (result.adjustments.peakHours?.applied) {
      explanation.push(
        `Peak hours adjustment: ${result.adjustments.peakHours.multiplier}x = ${result.ttl}s`
      );
    }

    explanation.push(`Stale threshold: ${result.staleThreshold}s`);

    return { result, explanation };
  }
}

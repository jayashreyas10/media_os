import { NextResponse } from "next/server";
import { AuditService } from "../services/audit-service";
import prisma from "../db/prisma";

export type RateLimitCategory =
  | "AUTH"
  | "RESEARCH"
  | "GENERATION"
  | "PUBLISHING"
  | "METRICS_INGESTION"
  | "ANALYTICS_SYNC"
  | "GENERAL";

export interface RateLimitConfig {
  capacity: number;
  refillPerMinute: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSeconds: number;
}

interface BucketState {
  tokens: number;
  lastRefillTimestamp: number;
}

export const DEFAULT_RATE_LIMITS: Record<RateLimitCategory, RateLimitConfig> = {
  AUTH: { capacity: 10, refillPerMinute: 10 },
  RESEARCH: { capacity: 20, refillPerMinute: 20 },
  GENERATION: { capacity: 15, refillPerMinute: 15 },
  PUBLISHING: { capacity: 10, refillPerMinute: 10 },
  METRICS_INGESTION: { capacity: 30, refillPerMinute: 30 },
  ANALYTICS_SYNC: { capacity: 10, refillPerMinute: 10 },
  GENERAL: { capacity: 60, refillPerMinute: 60 },
};

export class RateLimiter {
  private static buckets: Map<string, BucketState> = new Map();
  private static customConfigs: Map<RateLimitCategory, RateLimitConfig> = new Map();

  /**
   * Set custom rate limit configuration for a category (useful for tests or environment tuning).
   */
  static setCategoryConfig(category: RateLimitCategory, config: RateLimitConfig) {
    this.customConfigs.set(category, config);
  }

  /**
   * Get effective configuration for a category.
   */
  static getConfig(category: RateLimitCategory): RateLimitConfig {
    return this.customConfigs.get(category) || DEFAULT_RATE_LIMITS[category] || DEFAULT_RATE_LIMITS.GENERAL;
  }

  /**
   * Consume tokens from the tenant's bucket for a specific category.
   *
   * @param tenantId - Workspace ID or IP/User ID if unauthenticated
   * @param category - Action category (AUTH, RESEARCH, etc.)
   * @param cost - Number of tokens to consume (default: 1)
   */
  static consume(tenantId: string, category: RateLimitCategory = "GENERAL", cost: number = 1): RateLimitResult {
    const config = this.getConfig(category);
    const bucketKey = `${tenantId}:${category}`;
    const now = Date.now();

    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        tokens: config.capacity,
        lastRefillTimestamp: now,
      };
      this.buckets.set(bucketKey, bucket);
    } else {
      // Calculate token refill based on elapsed time
      const elapsedMs = now - bucket.lastRefillTimestamp;
      const tokensToAdd = (elapsedMs / 60000) * config.refillPerMinute;
      bucket.tokens = Math.min(config.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefillTimestamp = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      const timeToFullRefillMs = Math.ceil(((config.capacity - bucket.tokens) / config.refillPerMinute) * 60000);
      return {
        allowed: true,
        limit: config.capacity,
        remaining: Math.floor(bucket.tokens),
        resetMs: timeToFullRefillMs,
        retryAfterSeconds: 0,
      };
    }

    // Rate limit exceeded
    const tokensNeeded = cost - bucket.tokens;
    const waitTimeMs = Math.ceil((tokensNeeded / config.refillPerMinute) * 60000);
    const retryAfterSeconds = Math.max(1, Math.ceil(waitTimeMs / 1000));

    return {
      allowed: false,
      limit: config.capacity,
      remaining: Math.floor(bucket.tokens),
      resetMs: waitTimeMs,
      retryAfterSeconds,
    };
  }

  /**
   * Reset rate limit state. Can reset all buckets or a specific tenant/category.
   */
  static reset(tenantId?: string, category?: RateLimitCategory) {
    if (!tenantId) {
      this.buckets.clear();
      this.customConfigs.clear();
      return;
    }

    if (category) {
      this.buckets.delete(`${tenantId}:${category}`);
    } else {
      for (const key of Array.from(this.buckets.keys())) {
        if (key.startsWith(`${tenantId}:`)) {
          this.buckets.delete(key);
        }
      }
    }
  }

  /**
   * Log an audit violation when rate limits are breached.
   */
  static async logRateLimitViolation(
    workspaceId: string,
    userId: string | null,
    category: RateLimitCategory,
    details?: Record<string, unknown>
  ) {
    try {
      let resolvedUserId: string | null = null;
      if (userId && !userId.startsWith("AI_") && userId !== "system" && userId !== "anonymous") {
        const user = await prisma.user.findFirst({
          where: { OR: [{ id: userId }, { email: userId }] },
          select: { id: true },
        });
        resolvedUserId = user?.id || null;
      }

      await AuditService.log({
        workspaceId,
        userId: resolvedUserId,
        action: "RATE_LIMIT_EXCEEDED",
        entityType: "RateLimiter",
        details: {
          category,
          ...details,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Audit failure must not throw
    }
  }

  /**
   * Helper to generate a standardized HTTP 429 response.
   */
  static createResponse(result: RateLimitResult, message = "Rate limit exceeded. Please try again later."): NextResponse {
    return NextResponse.json(
      {
        error: message,
        code: "RATE_LIMIT_EXCEEDED",
        limit: result.limit,
        remaining: result.remaining,
        retryAfter: result.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": result.retryAfterSeconds.toString(),
          "X-RateLimit-Limit": result.limit.toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": Math.ceil(result.resetMs / 1000).toString(),
        },
      }
    );
  }
}

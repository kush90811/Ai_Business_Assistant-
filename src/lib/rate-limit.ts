/**
 * In-memory sliding-window rate limiter.
 *
 * Keyed by an arbitrary string (typically `clientId:IP` or just `IP`).
 * Designed behind a clean interface so it can be swapped for
 * @upstash/ratelimit + @upstash/redis later without touching route handlers.
 *
 * Limitations of in-memory approach:
 * - State is lost on server restart (acceptable: briefly allows a burst).
 * - Not shared across multiple server instances (acceptable for single-instance deployment).
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent unbounded memory growth
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
let lastCleanup = Date.now();

function cleanupStaleEntries(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - windowMs * 2; // Keep a generous buffer
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
}

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * @param key       Unique identifier for the rate-limit bucket (e.g. `clientId:ip`)
 * @param limit     Maximum number of requests allowed in the window
 * @param windowMs  Sliding window duration in milliseconds (default: 60_000 = 1 minute)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Lazy cleanup
  cleanupStaleEntries(windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= limit) {
    // Oldest timestamp in window determines when the next slot opens
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 1000),
    };
  }

  // Allow and record this request
  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    retryAfterMs: null,
  };
}

/**
 * Build a rate-limit key from the request.
 * Uses `clientId:IP` when clientId is available, falls back to IP alone.
 */
export function buildRateLimitKey(request: Request, clientId?: string): string {
  // Next.js forwards client IP in x-forwarded-for or x-real-ip
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";

  return clientId ? `${clientId}:${ip}` : `anon:${ip}`;
}

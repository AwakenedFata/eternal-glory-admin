import crypto from "crypto";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
const redis = REDIS_URL ? new Redis(REDIS_URL) : null;

// In-memory fallback
const rateLimitStore = new Map();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // per IP per window
const INVALID_THROTTLE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const INVALID_THROTTLE_MAX = 15; // max invalid attempts per IP

if (!redis) {
  // Clean up stale entries every 5 minutes if using memory
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore) {
      if (now - value.windowStart > INVALID_THROTTLE_WINDOW_MS) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export function hashIP(ip) {
  return crypto.createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 16);
}

export async function checkRateLimit(ipHash) {
  const key = `rate:${ipHash}`;

  if (redis) {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.pexpire(key, RATE_LIMIT_WINDOW_MS);
    }
    return {
      allowed: current <= RATE_LIMIT_MAX_REQUESTS,
      remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - current)
    };
  }

  // In-memory fallback
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

export async function checkInvalidThrottle(ipHash) {
  const key = `invalid:${ipHash}`;

  if (redis) {
    const count = parseInt(await redis.get(key) || "0", 10);
    return { blocked: count >= INVALID_THROTTLE_MAX };
  }

  // In-memory fallback
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > INVALID_THROTTLE_WINDOW_MS) {
    return { blocked: false };
  }

  return { blocked: entry.count >= INVALID_THROTTLE_MAX };
}

export async function recordInvalidAttempt(ipHash) {
  const key = `invalid:${ipHash}`;

  if (redis) {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.pexpire(key, INVALID_THROTTLE_WINDOW_MS);
    }
    return;
  }

  // In-memory fallback
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > INVALID_THROTTLE_WINDOW_MS) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
  } else {
    entry.count++;
  }
}

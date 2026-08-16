/**
 * In-memory, single-instance rate limiter. Good enough for a demo/prototype
 * deployed as one server process; does not survive multi-instance/serverless
 * scale-out. Swap for a shared store (e.g. Upstash Redis) before production.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

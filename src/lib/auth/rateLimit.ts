const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Bucket = {
  attempts: number[];
};

const buckets = new Map<string, Bucket>();

function prune(attempts: number[], now: number) {
  return attempts.filter((ts) => now - ts < WINDOW_MS);
}

export function consumeRateLimit(key: string, now = Date.now()) {
  const bucket = buckets.get(key) ?? { attempts: [] };
  bucket.attempts = prune(bucket.attempts, now);
  bucket.attempts.push(now);
  buckets.set(key, bucket);

  if (bucket.attempts.length <= MAX_ATTEMPTS) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, MAX_ATTEMPTS - bucket.attempts.length),
    };
  }

  const oldest = bucket.attempts[0];
  const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));

  return {
    allowed: false,
    retryAfterSeconds,
    remaining: 0,
  };
}

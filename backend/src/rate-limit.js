export class SlidingWindowLimiter {
  constructor({ windowMs, limit }) {
    this.windowMs = windowMs;
    this.limit = limit;
    this.entries = new Map();
  }

  consume(key, now = Date.now()) {
    const cutoff = now - this.windowMs;
    const recent = (this.entries.get(key) || []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.limit) {
      const retryAfterMs = Math.max(1000, recent[0] + this.windowMs - now);
      this.entries.set(key, recent);
      return { allowed: false, retryAfterMs };
    }
    recent.push(now);
    this.entries.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  }

  prune(now = Date.now()) {
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.entries) {
      const recent = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recent.length) {
        this.entries.set(key, recent);
      } else {
        this.entries.delete(key);
      }
    }
  }
}


class RateLimiter {
  constructor({ windowMs, maxRequests }) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  allow(key) {
    const now = Date.now();
    const recentRequests = (this.requests.get(key) || []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (recentRequests.length >= this.maxRequests) {
      this.requests.set(key, recentRequests);
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.requests) {
      const recentRequests = timestamps.filter(
        (timestamp) => now - timestamp < this.windowMs,
      );
      if (recentRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recentRequests);
      }
    }
  }
}

class ConcurrencyLimiter {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.active = 0;
    this.waiting = [];
  }

  async run(task) {
    if (this.active >= this.maxConcurrent) {
      await new Promise((resolve) => this.waiting.push(resolve));
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.waiting.shift();
      if (next) {
        next();
      }
    }
  }
}

module.exports = { RateLimiter, ConcurrencyLimiter };

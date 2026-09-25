const test = require('node:test');
const assert = require('node:assert/strict');

const { RateLimiter, ConcurrencyLimiter } = require('../src/limiter');

test('rate limiter allows only the configured number of requests', () => {
  const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 2 });

  assert.equal(limiter.allow('user-1'), true);
  assert.equal(limiter.allow('user-1'), true);
  assert.equal(limiter.allow('user-1'), false);
  assert.equal(limiter.allow('user-2'), true);
});

test('concurrency limiter runs queued tasks after an active task finishes', async () => {
  const limiter = new ConcurrencyLimiter(1);
  const events = [];

  const first = limiter.run(async () => {
    events.push('first-start');
    await new Promise((resolve) => setTimeout(resolve, 10));
    events.push('first-end');
  });
  const second = limiter.run(async () => events.push('second'));

  await Promise.all([first, second]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

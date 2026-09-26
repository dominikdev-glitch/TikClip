const test = require('node:test');
const assert = require('node:assert/strict');

const { createYouTubePublisher } = require('../src/youtube-publish');

test('creates a YouTube OAuth URL with upload scope and state', () => {
  const publisher = createYouTubePublisher({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://example.com/auth/youtube/callback',
    requestTimeout: 1_000,
  });

  const authorizationUrl = publisher.getAuthorizationUrl(42);
  const parsedUrl = new URL(authorizationUrl);

  assert.equal(parsedUrl.hostname, 'accounts.google.com');
  assert.equal(parsedUrl.searchParams.get('client_id'), 'client-id');
  assert.match(parsedUrl.searchParams.get('scope'), /youtube\.upload/);
  assert.equal(parsedUrl.searchParams.get('state').length, 64);
});

test('rejects OAuth URL generation when YouTube is not configured', () => {
  const publisher = createYouTubePublisher({
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    requestTimeout: 1_000,
  });

  assert.throws(() => publisher.getAuthorizationUrl(42), /not configured/);
});

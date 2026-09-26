const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createYouTubePublisher,
  getActualPrivacyStatus,
  getYouTubeCaption,
} = require('../src/youtube-publish');

test('defaults YouTube uploads to public visibility', () => {
  const publisher = createYouTubePublisher({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://example.com/auth/youtube/callback',
  });

  assert.equal(publisher.privacyStatus, 'public');
});

test('accepts private and unlisted visibility overrides', () => {
  for (const privacyStatus of ['private', 'unlisted']) {
    const publisher = createYouTubePublisher({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://example.com/auth/youtube/callback',
      privacyStatus,
    });
    assert.equal(publisher.privacyStatus, privacyStatus);
  }
});

test('rejects unsupported YouTube privacy settings', () => {
  assert.throws(
    () => createYouTubePublisher({ privacyStatus: 'friends-only' }),
    /YOUTUBE_PRIVACY_STATUS/,
  );
});

test('keeps the TikTok caption and hashtags intact', () => {
  const caption = 'New clip #music #dance';
  assert.equal(getYouTubeCaption({ title: caption }), caption);
  assert.equal(getYouTubeCaption({ title: '  ' }), 'TikClip video');
});

test('uses actual YouTube visibility when the API returns it', () => {
  assert.equal(
    getActualPrivacyStatus({ privacyStatus: 'private' }, 'public'),
    'private',
  );
  assert.equal(getActualPrivacyStatus(undefined, 'public'), 'public');
});

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

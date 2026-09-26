const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadYouTubeCredentials } = require('../src/youtube-credentials');

function makeCredentialsFile(t, contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tikclip-oauth-'));
  const credentialsPath = path.join(directory, 'secret.json');
  fs.writeFileSync(credentialsPath, JSON.stringify(contents));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return credentialsPath;
}

test('loads Google web OAuth credentials and its callback URI', (t) => {
  const credentialsPath = makeCredentialsFile(t, {
    web: {
      client_id: 'fixture-client-id',
      client_secret: 'fixture-client-secret',
      redirect_uris: ['https://example.test/auth/youtube/callback'],
    },
  });

  assert.deepEqual(loadYouTubeCredentials({ env: {}, credentialsPath }), {
    clientId: 'fixture-client-id',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'https://example.test/auth/youtube/callback',
  });
});

test('environment variables override credentials from the file', (t) => {
  const credentialsPath = makeCredentialsFile(t, {
    installed: {
      client_id: 'file-client-id',
      client_secret: 'file-client-secret',
    },
  });

  assert.deepEqual(
    loadYouTubeCredentials({
      env: {
        YOUTUBE_CLIENT_ID: 'env-client-id',
        YOUTUBE_CLIENT_SECRET: 'env-client-secret',
        YOUTUBE_REDIRECT_URI: 'https://env.test/auth/youtube/callback',
        PUBLIC_URL: 'https://env.test',
      },
      credentialsPath,
    }),
    {
      clientId: 'env-client-id',
      clientSecret: 'env-client-secret',
      redirectUri: 'https://env.test/auth/youtube/callback',
    },
  );
});

test('loads the full Google OAuth JSON from an environment variable', () => {
  const credentials = loadYouTubeCredentials({
    env: {
      YOUTUBE_CLIENT_JSON: JSON.stringify({
        web: {
          client_id: 'render-client-id',
          client_secret: 'render-client-secret',
          redirect_uris: ['https://render.example/auth/youtube/callback'],
        },
      }),
    },
    credentialsPath: 'missing-secret.json',
  });

  assert.deepEqual(credentials, {
    clientId: 'render-client-id',
    clientSecret: 'render-client-secret',
    redirectUri: 'https://render.example/auth/youtube/callback',
  });
});

test('rejects malformed Google OAuth JSON without echoing its value', () => {
  assert.throws(
    () =>
      loadYouTubeCredentials({
        env: { YOUTUBE_CLIENT_JSON: 'not-json-secret-content' },
        credentialsPath: 'missing-secret.json',
      }),
    /YOUTUBE_CLIENT_JSON must contain valid Google OAuth JSON/,
  );
});

test('uses the public URL callback when the file has no web redirect', (t) => {
  const credentialsPath = makeCredentialsFile(t, {
    installed: {
      client_id: 'fixture-client-id',
      client_secret: 'fixture-client-secret',
    },
  });

  assert.equal(
    loadYouTubeCredentials({
      env: { PUBLIC_URL: 'https://local.example' },
      credentialsPath,
    }).redirectUri,
    'https://local.example/auth/youtube/callback',
  );
});

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PUBLIC_URL = 'https://tikclip-bot.onrender.com';

function loadYouTubeCredentials({
  env = process.env,
  credentialsPath = path.resolve(__dirname, '../secret.json'),
} = {}) {
  let credentials = {};

  if (env.YOUTUBE_CLIENT_JSON) {
    try {
      credentials = JSON.parse(env.YOUTUBE_CLIENT_JSON);
    } catch {
      throw new Error(
        'YOUTUBE_CLIENT_JSON must contain valid Google OAuth JSON.',
      );
    }
  } else {
    try {
      credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(
          `Unable to read Google OAuth credentials from ${path.basename(credentialsPath)}.`,
        );
      }
    }
  }

  const oauthClient = credentials.web || credentials.installed || credentials;
  const credentialRedirectUri = credentials.web?.redirect_uris?.find((uri) =>
    uri.endsWith('/auth/youtube/callback'),
  );
  const publicUrl = env.PUBLIC_URL || DEFAULT_PUBLIC_URL;

  return {
    clientId: env.YOUTUBE_CLIENT_ID || oauthClient.client_id || '',
    clientSecret: env.YOUTUBE_CLIENT_SECRET || oauthClient.client_secret || '',
    redirectUri:
      env.YOUTUBE_REDIRECT_URI ||
      credentialRedirectUri ||
      new URL('/auth/youtube/callback', publicUrl).toString(),
  };
}

module.exports = { loadYouTubeCredentials };

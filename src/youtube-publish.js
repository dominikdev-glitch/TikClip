const axios = require('axios');
const crypto = require('node:crypto');
const { google } = require('googleapis');
const { Readable } = require('node:stream');

const PRIVACY_STATUSES = new Set(['private', 'unlisted', 'public']);

function getYouTubeCaption(video) {
  return String(video?.title || '').trim() || 'TikClip video';
}

function getActualPrivacyStatus(status, requestedStatus) {
  return status?.privacyStatus || requestedStatus;
}

function createYouTubePublisher(options) {
  const pendingStates = new Map();
  const clients = new Map();
  const privacyStatus = options.privacyStatus || 'public';

  if (!PRIVACY_STATUSES.has(privacyStatus)) {
    throw new Error(
      'YOUTUBE_PRIVACY_STATUS must be private, unlisted, or public.',
    );
  }

  function isConfigured() {
    return Boolean(
      options.clientId && options.clientSecret && options.redirectUri,
    );
  }

  function createClient() {
    return new google.auth.OAuth2(
      options.clientId,
      options.clientSecret,
      options.redirectUri,
    );
  }

  function getAuthorizationUrl(userId) {
    if (!isConfigured()) {
      throw new Error('YouTube OAuth is not configured on the server.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    pendingStates.set(state, {
      userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const client = createClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/youtube.upload'],
      state,
    });
  }

  async function exchangeCode(code, state) {
    const pending = pendingStates.get(state);
    pendingStates.delete(state);

    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error(
        'The YouTube authorization link expired. Please try again.',
      );
    }

    const client = createClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) {
      throw new Error('Google did not return a YouTube access token.');
    }

    client.setCredentials(tokens);
    clients.set(String(pending.userId), client);
    return pending.userId;
  }

  function getClient(userId) {
    const client = clients.get(String(userId));
    if (!client?.credentials?.access_token) {
      return null;
    }
    return client;
  }

  async function uploadVideo(userId, videoBuffer, title, description) {
    const client = getClient(userId);
    if (!client) {
      throw new Error(
        'Connect your YouTube account first with /connect-youtube.',
      );
    }

    const youtube = google.youtube({ version: 'v3', auth: client });
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: title.slice(0, 100),
          description: description.slice(0, 5_000),
          categoryId: '22',
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body: Readable.from(videoBuffer),
      },
    });

    return {
      id: response.data?.id,
      privacyStatus: getActualPrivacyStatus(
        response.data?.status,
        privacyStatus,
      ),
    };
  }

  async function checkUrl(url) {
    const response = await axios.head(url, {
      timeout: options.requestTimeout,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    return response.status >= 200 && response.status < 400;
  }

  return {
    checkUrl,
    exchangeCode,
    getAuthorizationUrl,
    isConfigured,
    privacyStatus,
    uploadVideo,
  };
}

module.exports = {
  createYouTubePublisher,
  getActualPrivacyStatus,
  getYouTubeCaption,
};

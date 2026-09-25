const axios = require('axios');
const crypto = require('node:crypto');

const authorizationUrl = 'https://www.tiktok.com/v2/auth/authorize/';
const tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';
const apiBaseUrl = 'https://open.tiktokapis.com/v2';

function createTikTokPublisher(options) {
  const pendingStates = new Map();
  const tokens = new Map();

  function isConfigured() {
    return Boolean(
      options.clientKey && options.clientSecret && options.redirectUri,
    );
  }

  function getAuthorizationUrl(userId) {
    if (!isConfigured()) {
      throw new Error('TikTok OAuth is not configured on the server.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    pendingStates.set(state, {
      userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_key: options.clientKey,
      response_type: 'code',
      scope: 'video.publish',
      redirect_uri: options.redirectUri,
      state,
    });
    return `${authorizationUrl}?${params}`;
  }

  async function exchangeCode(code, state) {
    const pending = pendingStates.get(state);
    pendingStates.delete(state);

    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error(
        'The TikTok authorization link expired. Please try /connect again.',
      );
    }

    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        client_key: options.clientKey,
        client_secret: options.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: options.redirectUri,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: options.requestTimeout,
      },
    );

    const data = response.data;
    if (!data?.access_token) {
      throw new Error(
        data?.error_description ||
          data?.message ||
          'TikTok did not return an access token.',
      );
    }

    tokens.set(String(pending.userId), {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Number(data.expires_in || 86_400) * 1000,
    });
    return pending.userId;
  }

  function getAccessToken(userId) {
    const token = tokens.get(String(userId));
    if (!token || token.expiresAt <= Date.now()) {
      return null;
    }
    return token.accessToken;
  }

  async function publishVideo(userId, videoBuffer, title) {
    const accessToken = getAccessToken(userId);
    if (!accessToken) {
      throw new Error('Connect your TikTok account first with /connect.');
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    const creatorResponse = await axios.post(
      `${apiBaseUrl}/post/publish/creator_info/query/`,
      {},
      { headers, timeout: options.requestTimeout },
    );
    const creator = creatorResponse.data?.data;
    const privacyLevel = creator?.privacy_level_options?.includes('SELF_ONLY')
      ? 'SELF_ONLY'
      : creator?.privacy_level_options?.[0];

    if (!privacyLevel || !creator?.max_video_post_duration_sec) {
      throw new Error(
        'TikTok did not return valid creator publishing settings.',
      );
    }

    const initResponse = await axios.post(
      `${apiBaseUrl}/post/publish/video/init/`,
      {
        post_info: {
          title: title.slice(0, 150),
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoBuffer.length,
          chunk_size: videoBuffer.length,
          total_chunk_count: 1,
        },
      },
      { headers, timeout: options.requestTimeout },
    );

    const publishId = initResponse.data?.data?.publish_id;
    const uploadUrl = initResponse.data?.data?.upload_url;
    if (!publishId || !uploadUrl) {
      throw new Error('TikTok did not provide an upload URL.');
    }

    await axios.put(uploadUrl, videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBuffer.length,
        'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
      },
      timeout: options.requestTimeout,
      maxBodyLength: options.maxVideoSizeBytes,
    });

    return publishId;
  }

  async function getPublishStatus(userId, publishId) {
    const accessToken = getAccessToken(userId);
    if (!accessToken) {
      throw new Error(
        'TikTok authorization expired. Please use /connect again.',
      );
    }

    const response = await axios.post(
      `${apiBaseUrl}/post/publish/status/fetch/`,
      { publish_id: publishId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: options.requestTimeout,
      },
    );
    return (
      response.data?.data?.status ||
      response.data?.status ||
      'PROCESSING_UPLOAD'
    );
  }

  return {
    exchangeCode,
    getAccessToken,
    getAuthorizationUrl,
    getPublishStatus,
    isConfigured,
    publishVideo,
  };
}

module.exports = { createTikTokPublisher };

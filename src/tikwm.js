const axios = require('axios');

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableError(error) {
  return (
    !error.response ||
    error.response.status === 429 ||
    error.response.status >= 500
  );
}

function getMediaUrl(video) {
  const videoUrl = video?.hdplay || video?.play;

  if (!videoUrl || !/^https:\/\//i.test(videoUrl)) {
    throw new Error('TikWM returned an invalid video URL.');
  }

  return videoUrl;
}

async function fetchVideo(tikTokUrl, options) {
  let lastError;

  for (let attempt = 0; attempt <= options.apiRetries; attempt += 1) {
    try {
      const response = await axios.get(options.tikwmApiUrl, {
        params: { url: tikTokUrl, hd: 1 },
        timeout: options.requestTimeout,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      const result = response.data;
      const video = result?.data;

      if (result?.code !== 0 || !video) {
        throw new Error(
          result?.msg || 'TikWM did not return a downloadable video.',
        );
      }

      getMediaUrl(video);
      return video;
    } catch (error) {
      lastError = error;
      if (attempt === options.apiRetries || !isRetryableError(error)) {
        break;
      }
      await sleep(500 * 2 ** attempt);
    }
  }

  throw lastError;
}

async function getContentLength(videoUrl, requestTimeout) {
  try {
    const response = await axios.head(videoUrl, {
      timeout: requestTimeout,
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const contentLength = Number.parseInt(
      response.headers['content-length'],
      10,
    );
    return Number.isFinite(contentLength) ? contentLength : null;
  } catch {
    return null;
  }
}

async function downloadVideo(videoUrl, options) {
  const response = await axios.get(videoUrl, {
    responseType: 'arraybuffer',
    timeout: options.requestTimeout,
    maxContentLength: options.maxVideoSizeBytes,
    maxBodyLength: options.maxVideoSizeBytes,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  return Buffer.from(response.data);
}

module.exports = { downloadVideo, fetchVideo, getContentLength, getMediaUrl };

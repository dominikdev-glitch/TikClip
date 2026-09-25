require('dotenv').config();

function getPositiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] || fallback, 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  throw new Error(
    'TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and add your bot token.',
  );
}

module.exports = {
  botToken,
  tikwmApiUrl: process.env.TIKWM_API_URL || 'https://www.tikwm.com/api/',
  requestTimeout: getPositiveInteger('REQUEST_TIMEOUT_MS', 30_000),
  apiRetries: getPositiveInteger('API_RETRIES', 2),
  rateLimitWindow: getPositiveInteger('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMaxRequests: getPositiveInteger('RATE_LIMIT_MAX_REQUESTS', 5),
  maxConcurrentDownloads: getPositiveInteger('MAX_CONCURRENT_DOWNLOADS', 2),
  maxVideoSizeBytes: getPositiveInteger('MAX_VIDEO_SIZE_MB', 50) * 1024 * 1024,
  publicUrl: process.env.PUBLIC_URL || 'https://tikclip-bot.onrender.com',
  tikTokClientKey: process.env.TIKTOK_CLIENT_KEY || '',
  tikTokClientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
  tikTokRedirectUri:
    process.env.TIKTOK_REDIRECT_URI ||
    'https://tikclip-bot.onrender.com/auth/tiktok/callback',
};

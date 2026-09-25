const http = require('node:http');
const { Bot } = require('grammy');

const config = require('./src/config');
const { RateLimiter, ConcurrencyLimiter } = require('./src/limiter');
const { extractTikTokUrl } = require('./src/url-utils');
const { fetchVideo, getContentLength, getMediaUrl } = require('./src/tikwm');

const bot = new Bot(config.botToken);
const rateLimiter = new RateLimiter({
  windowMs: config.rateLimitWindow,
  maxRequests: config.rateLimitMaxRequests,
});
const concurrencyLimiter = new ConcurrencyLimiter(
  config.maxConcurrentDownloads,
);
const activeUrls = new Set();
const telegramCaptionLimit = 1_024;

const rateLimitCleanup = setInterval(
  () => rateLimiter.cleanup(),
  config.rateLimitWindow,
);
rateLimitCleanup.unref();

const healthServer = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  response.writeHead(404);
  response.end();
});

healthServer.listen(Number(process.env.PORT || 10_000), '0.0.0.0');

function log(level, message, details = {}) {
  const entry = { time: new Date().toISOString(), level, message, ...details };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

function getVideoCaption(video) {
  const title = String(video.title || 'TikTok video')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  const nickname = String(
    video.author?.nickname || video.author?.unique_id || 'Unknown author',
  )
    .replace(/[\r\n]+/g, ' ')
    .trim();
  const caption = `${title}\n\nBy: ${nickname}`;
  return caption.length > telegramCaptionLimit
    ? `${caption.slice(0, telegramCaptionLimit - 3)}...`
    : caption;
}

async function updateStatusWithError(ctx, statusMessage, message) {
  try {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      message,
    );
  } catch (error) {
    log('error', 'Could not update status message', { error: error.message });
  }
}

async function handleTikTokMessage(ctx, tikTokUrl) {
  const chatId = ctx.chat.id;
  const duplicateKey = `${chatId}:${tikTokUrl}`;

  if (activeUrls.has(duplicateKey)) {
    await ctx.reply(
      'This video is already being fetched. Please wait for the current request to finish.',
    );
    return;
  }

  if (!rateLimiter.allow(String(ctx.from.id))) {
    await ctx.reply(
      'You have made too many requests. Please wait a minute and try again.',
    );
    return;
  }

  activeUrls.add(duplicateKey);
  const statusMessage = await ctx.reply(
    '⏳ Fetching high-quality video without watermark...',
  );

  try {
    await concurrencyLimiter.run(async () => {
      const video = await fetchVideo(tikTokUrl, config);
      const videoUrl = getMediaUrl(video);
      const contentLength = await getContentLength(
        videoUrl,
        config.requestTimeout,
      );

      if (contentLength && contentLength > config.maxVideoSizeBytes) {
        throw new Error('The video is too large to send through Telegram.');
      }

      await ctx.replyWithVideo(videoUrl, { caption: getVideoCaption(video) });
    });

    await ctx.api.deleteMessage(chatId, statusMessage.message_id);
    log('log', 'Video sent', { chatId, userId: ctx.from.id });
  } catch (error) {
    log('error', 'TikTok download failed', { chatId, error: error.message });
    await updateStatusWithError(
      ctx,
      statusMessage,
      'Sorry, I could not retrieve that video. It may be unavailable, too large, or temporarily unsupported.',
    );
  } finally {
    activeUrls.delete(duplicateKey);
  }
}

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Welcome! Send me a TikTok video link and I will retrieve a high-quality video without a watermark.\n\nUse /help for more information.',
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Send a TikTok video URL and I will fetch the highest-quality watermark-free version available.\n\nSupported links: tiktok.com, vm.tiktok.com, and vt.tiktok.com.\n\nPlease only download content you have permission to use.',
  );
});

bot.command('about', async (ctx) => {
  await ctx.reply(
    'This bot uses the TikWM API to retrieve TikTok videos. No videos or user messages are stored by this bot.',
  );
});

bot.command('privacy', async (ctx) => {
  await ctx.reply(
    'The bot processes your message only to retrieve the requested video. It does not intentionally store your messages, links, or downloaded media.',
  );
});

bot.on('message:text', async (ctx) => {
  const tikTokUrl = extractTikTokUrl(ctx.message.text);
  if (tikTokUrl) {
    await handleTikTokMessage(ctx, tikTokUrl);
  }
});

bot.catch((error) => {
  log('error', 'Unhandled bot error', { error: error.stack || error.message });
});

const shutdown = (signal) => {
  log('log', 'Stopping bot', { signal });
  bot.stop();
  healthServer.close();
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('uncaughtException', (error) => {
  log('error', 'Uncaught exception', { error: error.stack || error.message });
  shutdown('uncaughtException');
});
process.once('unhandledRejection', (error) => {
  log('error', 'Unhandled rejection', { error: error.stack || String(error) });
});

bot.start({
  onStart: (botInfo) =>
    log('log', 'Bot started', { username: botInfo.username }),
});

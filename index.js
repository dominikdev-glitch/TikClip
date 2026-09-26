const http = require('node:http');
const { Bot, InlineKeyboard } = require('grammy');

const config = require('./src/config');
const { RateLimiter, ConcurrencyLimiter } = require('./src/limiter');
const { extractTikTokUrl } = require('./src/url-utils');
const {
  downloadVideo,
  fetchVideo,
  getContentLength,
  getMediaUrl,
} = require('./src/tikwm');
const { handleWebRequest } = require('./src/web');
const { createTikTokPublisher } = require('./src/tiktok-publish');
const { createYouTubePublisher } = require('./src/youtube-publish');

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
const acceptedUsers = new Set();
const pendingActions = new Map();
const tikTokPublisher = createTikTokPublisher({
  clientKey: config.tikTokClientKey,
  clientSecret: config.tikTokClientSecret,
  redirectUri: config.tikTokRedirectUri,
  requestTimeout: config.requestTimeout,
  maxVideoSizeBytes: config.maxVideoSizeBytes,
});
const youtubePublisher = createYouTubePublisher({
  clientId: config.youtubeClientId,
  clientSecret: config.youtubeClientSecret,
  redirectUri: config.youtubeRedirectUri,
  requestTimeout: config.requestTimeout,
});

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

  if (request.url.startsWith('/auth/tiktok/callback')) {
    const callbackUrl = new URL(request.url, config.publicUrl);
    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');
    const error =
      callbackUrl.searchParams.get('error_description') ||
      callbackUrl.searchParams.get('error');

    if (error) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        '<h1>TikTok connection cancelled</h1><p>You can close this window and try /connect again in Telegram.</p>',
      );
      return;
    }

    if (!code || !state) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        '<h1>Invalid TikTok callback</h1><p>The authorization response was incomplete.</p>',
      );
      return;
    }

    tikTokPublisher
      .exchangeCode(code, state)
      .then(() => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          '<h1>TikTok connected</h1><p>You can close this window and use /post followed by a TikTok URL in Telegram.</p>',
        );
      })
      .catch((callbackError) => {
        log('error', 'TikTok OAuth callback failed', {
          error: callbackError.message,
        });
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          '<h1>TikTok connection failed</h1><p>The authorization could not be completed. Try /connect again.</p>',
        );
      });
    return;
  }

  if (request.url.startsWith('/auth/youtube/callback')) {
    const callbackUrl = new URL(request.url, config.publicUrl);
    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');
    const error = callbackUrl.searchParams.get('error');

    if (error || !code || !state) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        '<h1>YouTube connection cancelled</h1><p>You can close this window and try again in Telegram.</p>',
      );
      return;
    }

    youtubePublisher
      .exchangeCode(code, state)
      .then(() => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          '<h1>YouTube connected</h1><p>You can close this window and use the Upload to YouTube button in Telegram.</p>',
        );
      })
      .catch((callbackError) => {
        log('error', 'YouTube OAuth callback failed', {
          error: callbackError.message,
        });
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          '<h1>YouTube connection failed</h1><p>Try the connection button again in Telegram.</p>',
        );
      });
    return;
  }

  handleWebRequest(request, response);
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

function menuKeyboard() {
  return new InlineKeyboard()
    .text('Download video', 'action:download')
    .row()
    .text('Connect TikTok', 'action:connect-tiktok')
    .text('Post to TikTok', 'action:post-tiktok')
    .row()
    .text('Connect YouTube', 'action:connect-youtube')
    .text('Upload to YouTube', 'action:post-youtube')
    .row()
    .text('Help', 'action:help');
}

function hasAccepted(userId) {
  return acceptedUsers.has(String(userId));
}

async function requireAccepted(ctx) {
  if (hasAccepted(ctx.from.id)) return true;
  await ctx.reply(
    'Before using TikClip, please accept that you will only download and publish content you have permission to use.',
    {
      reply_markup: new InlineKeyboard().text(
        'Accept and continue',
        'action:accept',
      ),
    },
  );
  return false;
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

async function handleTikTokPost(ctx, tikTokUrl) {
  const statusMessage = await ctx.reply('⏳ Preparing your TikTok post...');
  try {
    const video = await fetchVideo(tikTokUrl, config);
    const videoBuffer = await downloadVideo(getMediaUrl(video), config);
    const publishId = await tikTokPublisher.publishVideo(
      ctx.from.id,
      videoBuffer,
      String(video.title || 'TikClip video'),
    );
    const status = await tikTokPublisher.getPublishStatus(
      ctx.from.id,
      publishId,
    );
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      `TikTok upload started.\nStatus: ${status}`,
    );
  } catch (error) {
    log('error', 'TikTok publish failed', {
      userId: ctx.from.id,
      error: error.message,
    });
    await updateStatusWithError(
      ctx,
      statusMessage,
      `TikTok posting failed: ${error.message}`,
    );
  }
}

async function handleYouTubePost(ctx, tikTokUrl) {
  const statusMessage = await ctx.reply(
    '⏳ Preparing your private YouTube upload...',
  );
  try {
    const video = await fetchVideo(tikTokUrl, config);
    const videoBuffer = await downloadVideo(getMediaUrl(video), config);
    const videoId = await youtubePublisher.uploadVideo(
      ctx.from.id,
      videoBuffer,
      String(video.title || 'TikClip video'),
      `Downloaded with TikClip. Original creator: ${video.author?.nickname || 'Unknown'}`,
    );
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      `YouTube upload complete and set to private.\nhttps://youtu.be/${videoId}`,
    );
  } catch (error) {
    log('error', 'YouTube upload failed', {
      userId: ctx.from.id,
      error: error.message,
    });
    await updateStatusWithError(
      ctx,
      statusMessage,
      `YouTube upload failed: ${error.message}`,
    );
  }
}

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Welcome to TikClip. Choose an action below, then follow the prompts.',
    { reply_markup: menuKeyboard() },
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Send a TikTok video URL and I will fetch the highest-quality watermark-free version available.\n\nSupported links: tiktok.com, vm.tiktok.com, and vt.tiktok.com.\n\nUse /connect to authorize TikTok posting, then /post followed by a TikTok URL.\n\nPlease only download content you have permission to use.',
    { reply_markup: menuKeyboard() },
  );
});

bot.command('about', async (ctx) => {
  await ctx.reply(
    'This bot uses the TikWM API to retrieve TikTok videos. No videos or user messages are stored by this bot.',
  );
});

bot.command('menu', async (ctx) => {
  await ctx.reply('Choose an action:', { reply_markup: menuKeyboard() });
});

bot.command('privacy', async (ctx) => {
  await ctx.reply(
    'The bot processes your message only to retrieve the requested video. It does not intentionally store your messages, links, or downloaded media.',
  );
});

bot.command('connect', async (ctx) => {
  try {
    await ctx.reply('Connect TikTok for posting:', {
      reply_markup: new InlineKeyboard().url(
        'Authorize TikTok',
        tikTokPublisher.getAuthorizationUrl(ctx.from.id),
      ),
    });
  } catch (error) {
    await ctx.reply(
      'TikTok posting is not configured yet. Please try again after the administrator adds the TikTok credentials.',
    );
    log('error', 'Could not create TikTok authorization URL', {
      error: error.message,
    });
  }
});

bot.command('connect-youtube', async (ctx) => {
  try {
    await ctx.reply('Connect YouTube for uploads:', {
      reply_markup: new InlineKeyboard().url(
        'Authorize YouTube',
        youtubePublisher.getAuthorizationUrl(ctx.from.id),
      ),
    });
  } catch (error) {
    await ctx.reply('YouTube uploading is not configured yet.');
    log('error', 'Could not create YouTube authorization URL', {
      error: error.message,
    });
  }
});

bot.command('post', async (ctx) => {
  const tikTokUrl = extractTikTokUrl(ctx.match || '');
  if (!tikTokUrl) {
    await ctx.reply('Usage: /post https://www.tiktok.com/@creator/video/123');
    return;
  }

  const statusMessage = await ctx.reply(
    '⏳ Downloading the video and preparing your TikTok post...',
  );
  try {
    const video = await fetchVideo(tikTokUrl, config);
    const videoUrl = getMediaUrl(video);
    const videoBuffer = await downloadVideo(videoUrl, config);
    const publishId = await tikTokPublisher.publishVideo(
      ctx.from.id,
      videoBuffer,
      String(video.title || 'TikClip video'),
    );
    const status = await tikTokPublisher.getPublishStatus(
      ctx.from.id,
      publishId,
    );
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      `TikTok upload started.\nStatus: ${status}\nPublish ID: ${publishId}`,
    );
  } catch (error) {
    log('error', 'TikTok publish failed', {
      userId: ctx.from.id,
      error: error.message,
    });
    await updateStatusWithError(
      ctx,
      statusMessage,
      `TikTok posting failed: ${error.message}`,
    );
  }
});

bot.on('callback_query:data', async (ctx) => {
  const action = ctx.callbackQuery.data.replace('action:', '');
  await ctx.answerCallbackQuery();

  if (action === 'accept') {
    acceptedUsers.add(String(ctx.from.id));
    await ctx.editMessageText('You are all set. Choose what you want to do:', {
      reply_markup: menuKeyboard(),
    });
    return;
  }

  if (!(await requireAccepted(ctx))) return;

  if (action === 'help') {
    await ctx.reply(
      'Tap Download video to retrieve a clip. Connect a platform once, then tap its upload button and send a TikTok link.',
    );
    return;
  }

  if (action === 'download') {
    pendingActions.set(String(ctx.from.id), 'download');
    await ctx.reply('Send the TikTok link you want to download.');
    return;
  }

  if (action === 'connect-tiktok') {
    try {
      await ctx.reply('Connect TikTok for posting:', {
        reply_markup: new InlineKeyboard().url(
          'Authorize TikTok',
          tikTokPublisher.getAuthorizationUrl(ctx.from.id),
        ),
      });
    } catch (error) {
      await ctx.reply('TikTok posting is not configured yet.');
      log('error', 'Could not create TikTok authorization URL', {
        error: error.message,
      });
    }
    return;
  }

  if (action === 'connect-youtube') {
    try {
      await ctx.reply('Connect YouTube for uploads:', {
        reply_markup: new InlineKeyboard().url(
          'Authorize YouTube',
          youtubePublisher.getAuthorizationUrl(ctx.from.id),
        ),
      });
    } catch (error) {
      await ctx.reply('YouTube uploading is not configured yet.');
      log('error', 'Could not create YouTube authorization URL', {
        error: error.message,
      });
    }
    return;
  }

  if (action === 'post-tiktok' || action === 'post-youtube') {
    pendingActions.set(String(ctx.from.id), action);
    await ctx.reply(
      action === 'post-tiktok'
        ? 'Send the TikTok link to publish on TikTok.'
        : 'Send the TikTok link to upload privately to YouTube.',
    );
  }
});

bot.on('message:text', async (ctx) => {
  const tikTokUrl = extractTikTokUrl(ctx.message.text);
  if (!tikTokUrl) return;
  if (!(await requireAccepted(ctx))) return;

  const action = pendingActions.get(String(ctx.from.id)) || 'download';
  pendingActions.delete(String(ctx.from.id));
  if (action === 'post-tiktok') return handleTikTokPost(ctx, tikTokUrl);
  if (action === 'post-youtube') return handleYouTubePost(ctx, tikTokUrl);
  return handleTikTokMessage(ctx, tikTokUrl);
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

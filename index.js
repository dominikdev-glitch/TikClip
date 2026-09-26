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
const {
  createYouTubePublisher,
  getYouTubeCaption,
} = require('./src/youtube-publish');
const {
  menuKeyboard,
  onboardingKeyboard,
  videoActionKeyboard,
} = require('./src/keyboard');
const { createLocalChatbot } = require('./src/chatbot');
const { createTinyTransformerClient } = require('./src/tiny-transformer');
const { verifyLoginPin } = require('./src/login-pin');

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
const authenticatedUsers = new Set();
const awaitingLoginPin = new Set();
const onboardingUsers = new Set();
const pendingActions = new Map();
const loginPinLimiter = new RateLimiter({
  windowMs: config.rateLimitWindow,
  maxRequests: config.rateLimitMaxRequests,
});
const youtubePublisher = createYouTubePublisher({
  clientId: config.youtubeClientId,
  clientSecret: config.youtubeClientSecret,
  redirectUri: config.youtubeRedirectUri,
  privacyStatus: config.youtubePrivacyStatus,
  requestTimeout: config.requestTimeout,
});
const localChatbot = createLocalChatbot({
  memoryFile: './data/chatbot-memory.json',
});
const tinyTransformer = createTinyTransformerClient({
  onError: (error) =>
    log('warn', 'Tiny transformer unavailable', { error: error.message }),
});
tinyTransformer.reply('hello').then((reply) => {
  log(
    reply ? 'log' : 'warn',
    reply
      ? 'Tiny transformer ready'
      : 'Tiny transformer unavailable; chatbot fallback is active',
  );
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

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId === undefined) return next();

  const userKey = String(userId);
  const messageText = ctx.message?.text || '';
  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(messageText)) return next();

  if (!authenticatedUsers.has(userKey)) {
    if (
      awaitingLoginPin.has(userKey) &&
      messageText &&
      !messageText.startsWith('/')
    ) {
      return next();
    }
    await ctx.reply('Please use /start and enter the access PIN to continue.');
    return;
  }

  if (onboardingUsers.has(userKey)) {
    const allowedActions = new Set([
      'action:connect-youtube',
      'action:onboarding-skip',
    ]);
    if (allowedActions.has(ctx.callbackQuery?.data)) return next();
    await ctx.reply(
      'Choose a platform to connect, or tap Nevermind to continue.',
    );
    return;
  }

  return next();
});

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

      await ctx.replyWithVideo(videoUrl, {
        caption: getVideoCaption(video),
        reply_markup: videoActionKeyboard(),
      });
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

async function handleYouTubePost(ctx, tikTokUrl) {
  const statusMessage = await ctx.reply(
    '⏳ Preparing your private YouTube upload...',
  );
  try {
    const video = await fetchVideo(tikTokUrl, config);
    const videoBuffer = await downloadVideo(getMediaUrl(video), config);
    const sourceCaption = getYouTubeCaption(video);
    const videoId = await youtubePublisher.uploadVideo(
      ctx.from.id,
      videoBuffer,
      sourceCaption,
      sourceCaption,
    );
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      `YouTube upload complete and set to ${youtubePublisher.privacyStatus}.\nhttps://youtu.be/${videoId}`,
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
  const userKey = String(ctx.from.id);
  authenticatedUsers.delete(userKey);
  onboardingUsers.delete(userKey);

  if (!config.loginPin) {
    awaitingLoginPin.delete(userKey);
    await ctx.reply(
      'Bot login is not configured. Set BOT_LOGIN_PIN in the environment.',
    );
    return;
  }

  awaitingLoginPin.add(userKey);
  await ctx.reply('Welcome to TikClip. Enter the access PIN to continue.');
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Send a TikTok video URL to download it, or connect YouTube and choose Upload to YouTube.\n\nSupported links: tiktok.com, vm.tiktok.com, and vt.tiktok.com.\n\nPlease only download content you have permission to use.',
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

  if (action === 'onboarding-skip') {
    onboardingUsers.delete(String(ctx.from.id));
    await ctx.editMessageText(
      'Welcome to TikClip. Choose an action below, then follow the prompts.',
      { reply_markup: menuKeyboard() },
    );
    return;
  }

  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  if (
    onboardingUsers.has(String(ctx.from.id)) &&
    action === 'connect-youtube'
  ) {
    onboardingUsers.delete(String(ctx.from.id));
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

  if (!(await requireAccepted(ctx))) return;

  if (action === 'help') {
    await ctx.reply(
      'Send a TikTok link to download it. Connect YouTube once, then tap Upload to YouTube and send a TikTok link to publish it.',
    );
    return;
  }

  if (action === 'download') {
    pendingActions.set(String(ctx.from.id), 'download');
    await ctx.reply('Send the TikTok link you want to download.');
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

  if (action === 'post-youtube') {
    pendingActions.set(String(ctx.from.id), action);
    await ctx.reply('Send the TikTok link to upload to YouTube.');
  }
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text || '';
  const userKey = String(ctx.from.id);
  const tikTokUrl = extractTikTokUrl(text);

  if (text.startsWith('/')) return;

  if (awaitingLoginPin.has(userKey)) {
    if (!loginPinLimiter.allow(userKey)) {
      await ctx.reply(
        'Too many PIN attempts. Please wait a minute and try again.',
      );
      return;
    }

    if (!verifyLoginPin(config.loginPin, text)) {
      await ctx.reply('That PIN is not correct. Please try again.');
      return;
    }

    awaitingLoginPin.delete(userKey);
    authenticatedUsers.add(userKey);
    onboardingUsers.add(userKey);
    await ctx.reply('PIN accepted. Connect YouTube now, or choose Nevermind.', {
      reply_markup: onboardingKeyboard(),
    });
    return;
  }

  if (tikTokUrl) {
    if (!(await requireAccepted(ctx))) return;

    const action = pendingActions.get(String(ctx.from.id)) || 'download';
    pendingActions.delete(String(ctx.from.id));
    if (action === 'post-youtube') return handleYouTubePost(ctx, tikTokUrl);
    return handleTikTokMessage(ctx, tikTokUrl);
  }

  if (!(await requireAccepted(ctx))) return;

  const response = await localChatbot.replyWithModel(
    text,
    String(ctx.from.id),
    tinyTransformer.reply,
  );
  await ctx.reply(response);
});

bot.catch((error) => {
  log('error', 'Unhandled bot error', { error: error.stack || error.message });
});

const shutdown = (signal) => {
  log('log', 'Stopping bot', { signal });
  tinyTransformer.close();
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

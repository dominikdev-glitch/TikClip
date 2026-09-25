# TikTok Telegram Bot

A Telegram bot that accepts TikTok links and sends back high-quality videos without watermarks using the TikWM API. It uses Telegram long polling, so it can run on a local machine, VPS, or container without a public webhook endpoint.

## Requirements

- Node.js 18 or newer
- A Telegram bot token from BotFather

## Local Setup

1. Create a bot with [BotFather](https://t.me/BotFather) in Telegram. Use `/newbot`, follow the prompts, and copy the token it gives you.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and add the BotFather token. The other values have safe defaults, but can be adjusted for your deployment:

   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TIKWM_API_URL=https://www.tikwm.com/api/
   ```

4. Start the bot locally:

   ```bash
   npm start
   ```

Send `/start` to the bot, then send a TikTok video URL.

Use `/help`, `/about`, or `/privacy` in Telegram. The bot accepts standard `tiktok.com` URLs and `vm.tiktok.com` or `vt.tiktok.com` shortlinks.

The bot limits each user to five requests per minute, processes up to two downloads concurrently, retries temporary TikWM failures, rejects media larger than Telegram’s configured limit, and avoids duplicate requests in the same chat.

## Development Checks

```bash
npm run check
npm test
npm run lint
npm run format:check
npm audit --omit=dev
```

GitHub Actions runs the same checks for pushes and pull requests.

## Docker Deployment

Build the image:

```bash
docker build -t tik-telegram-bot .
```

Run one bot instance with the token supplied at runtime:

```bash
docker run -d \
   --name tik-telegram-bot \
   --restart unless-stopped \
   --env TELEGRAM_BOT_TOKEN=your_bot_token_here \
   tik-telegram-bot
```

View logs with:

```bash
docker logs -f tik-telegram-bot
```

Or use Docker Compose:

```bash
docker compose up -d --build
docker compose logs -f
```

Run only one polling instance for a bot token. Multiple polling instances compete for Telegram updates and can cause conflicts.

## Notes

- TikTok downloads depend on the availability and response format of the TikWM API.
- The bot requests HD media first and falls back to the standard watermark-free URL when HD media is unavailable.
- Keep the bot token private and never commit `.env`. The file is ignored by Git.
- Download only content you have permission to use and comply with TikTok’s terms and applicable law.

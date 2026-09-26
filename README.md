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

3. Copy `.env.example` to `.env`, add the BotFather token, and choose a private `BOT_LOGIN_PIN`:

   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   BOT_LOGIN_PIN=choose_a_private_pin
   TIKWM_API_URL=https://www.tikwm.com/api/
   ```

4. Start the bot locally:

   ```bash
   npm start
   ```

Send `/start` and enter your `BOT_LOGIN_PIN`. Then connect TikTok or YouTube, or tap **Nevermind** to open the usual bot menu. PIN attempts are rate-limited. Set the same variable in Render's environment for deployed use.

Use the inline buttons after `/start`; `/menu` opens them again. The bot accepts standard `tiktok.com` URLs and `vm.tiktok.com` or `vt.tiktok.com` shortlinks. Slash commands such as `/connect`, `/post`, and `/connect-youtube` remain available as fallbacks.

To publish an authorized video to TikTok, use `/connect` and complete TikTok authorization in your browser. Then send `/post` followed by a TikTok URL. TikTok must approve the `video.publish` scope for the app; unaudited apps may be limited to private posts. TikTok access tokens are currently held in memory, so users must reconnect after a service restart.

To upload a downloaded video to YouTube, use the **Connect YouTube** button and complete Google OAuth, then use **Upload to YouTube** and send a TikTok link. YouTube uploads are created as private videos by default. Create OAuth credentials for a Web application in Google Cloud Console and enable YouTube Data API v3. Locally, put Google's downloaded OAuth client JSON in the workspace root as `secret.json`; the bot reads `web` or `installed` credentials and supports flat `client_id`/`client_secret` fields. Environment variables override file values. Register `https://tikclip-bot.onrender.com/auth/youtube/callback` as an authorized redirect URI. On Render, paste the full downloaded JSON into the secret `YOUTUBE_CLIENT_JSON` environment variable, or use `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` separately.

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

## Optional Local Transformer

The bot can use a small, local PyTorch transformer to answer chat messages that do not match a learned reply. The included model has 83,840 parameters and is trained only on the bot-focused example dialogue; it is experimental, not a general-purpose assistant. Learned replies and `teach me: question | answer` take precedence over generated text.

Create a Python 3.11 virtual environment, install `requirements.txt`, then train the checkpoint:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe llm\tiny_transformer.py --train
```

The Node bot detects the local checkpoint and starts one persistent inference worker automatically. Set `TINY_LLM_PYTHON` if Python is not at `.venv`. Without a usable Python environment or trained checkpoint, the bot continues using its existing memory-based fallback. The Render blueprint is Node-only, so the transformer is not enabled there by default.

## Render Deployment

The repository includes [render.yaml](render.yaml) for a free Render **Web Service** deployment. The bot keeps Telegram long polling active and exposes a small `/health` endpoint so Render can monitor the process.

The same service also hosts the public TikClip site at `https://tikclip-bot.onrender.com`, including `/privacy` and `/terms` pages for app review. Set the TikTok Developer Portal OAuth redirect URI to `https://tikclip-bot.onrender.com/auth/tiktok/callback`.

1. Sign in to [Render](https://dashboard.render.com/).
2. Select **New**, then **Blueprint**.
3. Connect `dominikdev-glitch/TikClip` and choose the `main` branch.
4. Review the `tikclip-bot` Web Service and create the Blueprint.
5. Enter your Telegram BotFather token when Render prompts for the secret `TELEGRAM_BOT_TOKEN`.
6. Enter the TikTok `TIKTOK_CLIENT_KEY` and regenerated `TIKTOK_CLIENT_SECRET` secrets.
7. Enter the YouTube `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` secrets after enabling YouTube Data API v3 in Google Cloud.
8. Open the service logs and confirm that it reports `Bot started`.

The Blueprint enables automatic deploys for new commits. Only run one Render service for this bot token, because multiple long-polling processes compete for Telegram updates. Render’s free Web Services can spin down after inactivity, so the bot may need a short wake-up period before responding. A paid instance avoids that sleep behavior.

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

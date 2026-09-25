const siteUrl = process.env.PUBLIC_URL || 'https://tikclip-bot.onrender.com';
const botUrl = 'https://t.me/tikclip_bot';

const styles = `
  :root {
    color-scheme: dark;
    --ink: #f7f7f2;
    --muted: #a5aaa3;
    --line: rgba(247, 247, 242, .14);
    --paper: #101311;
    --panel: #171b18;
    --lime: #d8ff49;
    --coral: #ff6b57;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: Georgia, 'Times New Roman', serif; }
  body::before { content: ''; position: fixed; inset: 0; pointer-events: none; opacity: .2; background-image: radial-gradient(rgba(255,255,255,.18) .6px, transparent .6px); background-size: 7px 7px; mask-image: linear-gradient(to bottom, black, transparent 70%); }
  a { color: inherit; }
  .shell { position: relative; width: min(1120px, calc(100% - 40px)); margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 28px 0; border-bottom: 1px solid var(--line); font-family: Arial, sans-serif; }
  .brand { display: flex; gap: 10px; align-items: center; font-size: 15px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .mark { display: grid; place-items: center; width: 30px; height: 30px; background: var(--lime); color: #111; border-radius: 50%; font-size: 14px; }
  nav { display: flex; gap: 22px; color: var(--muted); font-size: 13px; }
  nav a { text-decoration: none; }
  nav a:hover { color: var(--lime); }
  main { padding: 88px 0 100px; }
  .eyebrow { color: var(--lime); font: 700 12px Arial, sans-serif; letter-spacing: .16em; text-transform: uppercase; }
  h1 { max-width: 780px; margin: 20px 0 24px; font-size: clamp(52px, 9vw, 112px); font-weight: 400; line-height: .9; letter-spacing: -.055em; }
  h1 em { color: var(--coral); font-style: normal; }
  .intro { max-width: 570px; color: var(--muted); font: 18px/1.6 Arial, sans-serif; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; }
  .button { display: inline-flex; align-items: center; gap: 10px; padding: 15px 20px; border: 1px solid var(--lime); background: var(--lime); color: #111; font: 700 13px Arial, sans-serif; text-decoration: none; }
  .button.secondary { border-color: var(--line); background: transparent; color: var(--ink); }
  .button:hover { transform: translateY(-2px); }
  .strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin-top: 110px; background: var(--line); border: 1px solid var(--line); }
  .feature { min-height: 180px; padding: 25px; background: var(--panel); }
  .number { color: var(--coral); font: 700 12px Arial, sans-serif; }
  h2 { margin: 35px 0 10px; font-size: 25px; font-weight: 400; }
  .feature p { margin: 0; color: var(--muted); font: 14px/1.55 Arial, sans-serif; }
  .note { max-width: 700px; margin-top: 80px; padding-top: 25px; border-top: 1px solid var(--line); color: var(--muted); font: 13px/1.6 Arial, sans-serif; }
  footer { display: flex; justify-content: space-between; gap: 20px; padding: 24px 0 35px; border-top: 1px solid var(--line); color: var(--muted); font: 12px Arial, sans-serif; }
  footer a { margin-left: 18px; text-decoration: none; }
  .legal { max-width: 760px; padding: 80px 0 110px; }
  .legal h1 { font-size: clamp(48px, 8vw, 86px); }
  .legal h2 { margin-top: 42px; font-size: 26px; }
  .legal p, .legal li { color: var(--muted); font: 16px/1.7 Arial, sans-serif; }
  @media (max-width: 650px) { .shell { width: min(100% - 28px, 1120px); } header { padding: 20px 0; } nav { gap: 11px; font-size: 11px; } main { padding-top: 65px; } .strip { grid-template-columns: 1fr; margin-top: 70px; } footer { display: block; } footer div + div { margin-top: 15px; } footer a { margin: 0 15px 0 0; } }
`;

function layout(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="TikClip retrieves high-quality TikTok videos through Telegram."><title>${title} | TikClip</title><style>${styles}</style></head><body><div class="shell"><header><a class="brand" href="/"><span class="mark">T</span> TikClip</a><nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="${botUrl}">Open bot ↗</a></nav></header>${content}<footer><div>© 2026 TikClip</div><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="${botUrl}">Telegram ↗</a></div></footer></div></body></html>`;
}

function homePage() {
  return layout(
    'Download without the watermark',
    `<main><div class="eyebrow">A cleaner way to keep your clips</div><h1>TikTok in.<br><em>Good video</em> out.</h1><p class="intro">TikClip turns a TikTok link into a high-quality, watermark-free video delivered directly in Telegram. No dashboard. No clutter. Just send the link.</p><div class="actions"><a class="button" href="${botUrl}">Open TikClip on Telegram <span>↗</span></a><a class="button secondary" href="/privacy">How we handle data</a></div><div class="strip"><article class="feature"><span class="number">01 / SIMPLE</span><h2>Drop a link</h2><p>Send a standard TikTok URL or a vm.tiktok.com shortlink to the bot.</p></article><article class="feature"><span class="number">02 / QUALITY</span><h2>HD first</h2><p>We request the highest-quality watermark-free source available.</p></article><article class="feature"><span class="number">03 / DIRECT</span><h2>Back in chat</h2><p>Your video comes back to the same Telegram conversation, ready to save.</p></article></div><p class="note">TikClip is an independent utility and is not affiliated with TikTok. Please only download content you have permission to use.</p></main>`,
  );
}

function privacyPage() {
  return layout(
    'Privacy Policy',
    '<main class="legal"><div class="eyebrow">Privacy</div><h1>Less data.<br><em>More clarity.</em></h1><p>Last updated: September 25, 2026</p><h2>What TikClip processes</h2><p>When you message the TikClip Telegram bot, we process the Telegram message, your chat identifier, and the TikTok URL you provide only to retrieve and send the requested video.</p><h2>What we store</h2><p>TikClip does not intentionally store your messages, TikTok links, downloaded videos, or media files. The service may keep short-lived in-memory request state while a download is being processed.</p><h2>Service providers</h2><p>Video requests are sent to the TikWM API to resolve a downloadable video URL. Telegram processes messages and delivers the bot response. These services have their own policies.</p><h2>Contact</h2><p>For privacy questions, contact the project owner through the GitHub repository linked from the project deployment.</p></main>',
  );
}

function termsPage() {
  return layout(
    'Terms of Service',
    '<main class="legal"><div class="eyebrow">Terms</div><h1>Use it<br><em>responsibly.</em></h1><p>Last updated: September 25, 2026</p><h2>Acceptable use</h2><p>You may use TikClip only for lawful purposes and only to download content you have permission to use. Do not use the service to infringe copyrights, evade access controls, or distribute harmful content.</p><h2>Availability</h2><p>TikClip is provided as-is. Video retrieval depends on Telegram, TikWM, TikTok, network availability, and the source video. We do not guarantee that every link will work or remain available.</p><h2>Third-party services</h2><p>TikClip is independent and is not affiliated with TikTok. You are responsible for following TikTok\'s terms, copyright rules, and any applicable laws.</p><h2>Changes</h2><p>These terms may change as the service evolves. Continued use after an update means you accept the revised terms.</p></main>',
  );
}

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(body);
}

function handleWebRequest(request, response) {
  const path = new URL(request.url, siteUrl).pathname;
  if (path === '/') return sendHtml(response, 200, homePage());
  if (path === '/privacy') return sendHtml(response, 200, privacyPage());
  if (path === '/terms') return sendHtml(response, 200, termsPage());
  sendHtml(
    response,
    404,
    layout(
      'Not found',
      '<main class="legal"><div class="eyebrow">404</div><h1>Page not found.</h1><a class="button" href="/">Back home</a></main>',
    ),
  );
}

module.exports = { handleWebRequest };

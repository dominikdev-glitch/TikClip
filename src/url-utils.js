const supportedHosts = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
]);
const tikTokUrlRegex = /https?:\/\/[^\s<>'"]+/gi;

function isSupportedTikTokUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return (
      (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
      supportedHosts.has(parsedUrl.hostname.toLowerCase()) &&
      parsedUrl.pathname !== '/'
    );
  } catch {
    return false;
  }
}

function normalizeUrl(value) {
  return value.replace(/[),.!?;:]+$/, '');
}

function extractTikTokUrl(text) {
  const candidates = text.match(tikTokUrlRegex) || [];
  const candidate = candidates.map(normalizeUrl).find(isSupportedTikTokUrl);
  return candidate || null;
}

module.exports = {
  extractTikTokUrl,
  isSupportedTikTokUrl,
  normalizeUrl,
};

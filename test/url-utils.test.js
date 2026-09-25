const test = require('node:test');
const assert = require('node:assert/strict');

const { extractTikTokUrl, isSupportedTikTokUrl } = require('../src/url-utils');

test('extracts standard TikTok URLs with punctuation', () => {
  assert.equal(
    extractTikTokUrl(
      'Download this https://www.tiktok.com/@creator/video/12345.',
    ),
    'https://www.tiktok.com/@creator/video/12345',
  );
});

test('extracts supported TikTok shortlinks', () => {
  assert.equal(
    extractTikTokUrl('https://vm.tiktok.com/ZMabc123/'),
    'https://vm.tiktok.com/ZMabc123/',
  );
  assert.equal(
    extractTikTokUrl('https://vt.tiktok.com/ZSabc123/?lang=en'),
    'https://vt.tiktok.com/ZSabc123/?lang=en',
  );
});

test('rejects unsupported or incomplete URLs', () => {
  assert.equal(extractTikTokUrl('https://example.com/video/123'), null);
  assert.equal(isSupportedTikTokUrl('https://tiktok.com/'), false);
  assert.equal(isSupportedTikTokUrl('javascript:alert(1)'), false);
});

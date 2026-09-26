const test = require('node:test');
const assert = require('node:assert/strict');

const { downloadTelegramVideo } = require('../src/telegram-video');

test('downloads the Telegram video file by file id', async () => {
  let requestedUrl;
  const video = await downloadTelegramVideo({
    getFile: async (fileId) => {
      assert.equal(fileId, 'telegram-file-id');
      return { file_path: 'videos/clip.mp4', file_size: 4 };
    },
    fetchFile: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.responseType, 'arraybuffer');
      return { data: Buffer.from('clip') };
    },
    fileId: 'telegram-file-id',
    botToken: 'test-token',
    maxBytes: 10,
    requestTimeout: 1_000,
  });

  assert.equal(
    requestedUrl,
    'https://api.telegram.org/file/bottest-token/videos/clip.mp4',
  );
  assert.equal(video.toString(), 'clip');
});

test('rejects Telegram videos over the configured size limit', async () => {
  await assert.rejects(
    downloadTelegramVideo({
      getFile: async () => ({ file_path: 'videos/large.mp4', file_size: 11 }),
      fileId: 'large-video',
      botToken: 'test-token',
      maxBytes: 10,
      requestTimeout: 1_000,
    }),
    /too large/,
  );
});

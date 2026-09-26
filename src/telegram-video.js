const axios = require('axios');

async function downloadTelegramVideo({
  getFile,
  fetchFile = axios.get,
  fileId,
  botToken,
  maxBytes,
  requestTimeout,
}) {
  let file;
  try {
    file = await getFile(fileId);
  } catch {
    throw new Error('Telegram could not locate the selected video.');
  }

  if (file.file_size && file.file_size > maxBytes) {
    throw new Error('The selected video is too large to upload to YouTube.');
  }
  if (!file.file_path) {
    throw new Error('Telegram did not provide a download path for the video.');
  }

  let response;
  try {
    response = await fetchFile(
      `https://api.telegram.org/file/bot${botToken}/${file.file_path}`,
      {
        responseType: 'arraybuffer',
        timeout: requestTimeout,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
      },
    );
  } catch {
    throw new Error('Telegram could not download the selected video.');
  }

  const videoBuffer = Buffer.from(response.data);
  if (videoBuffer.length > maxBytes) {
    throw new Error('The selected video is too large to upload to YouTube.');
  }

  return videoBuffer;
}

module.exports = { downloadTelegramVideo };

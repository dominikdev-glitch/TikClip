const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { handleWebRequest } = require('../src/web');

test('serves the public site and legal pages', async () => {
  const server = http.createServer(handleWebRequest);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    for (const [path, expectedText] of [
      ['/', 'TikTok in.'],
      ['/privacy', 'Privacy'],
      ['/terms', 'Terms'],
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, new RegExp(expectedText));
    }

    const missingResponse = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missingResponse.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

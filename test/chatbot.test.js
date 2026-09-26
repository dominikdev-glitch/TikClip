const test = require('node:test');
const assert = require('node:assert/strict');

const { createLocalChatbot } = require('../src/chatbot');

test('learns a user input and recalls a matching reply', () => {
  const chatbot = createLocalChatbot({ memoryFile: 'test/.chatbot-memory-1.json' });

  chatbot.learn('hello there', 'hello friend!');
  chatbot.learn('how are you', 'i am doing well, thanks for asking');

  const reply = chatbot.reply('hello there');
  assert.match(reply.toLowerCase(), /hello|friend/);
});

test('keeps user-specific memory separate', () => {
  const chatbot = createLocalChatbot({ memoryFile: 'test/.chatbot-memory-2.json' });

  chatbot.learn('hello', 'hi from alice', 'alice');
  chatbot.learn('hello', 'hi from bob', 'bob');

  assert.match(chatbot.reply('hello', 'alice').toLowerCase(), /alice/);
  assert.match(chatbot.reply('hello', 'bob').toLowerCase(), /bob/);
});

test('answers with useful default help about the bot', () => {
  const chatbot = createLocalChatbot({ memoryFile: 'test/.chatbot-memory-3.json' });

  const reply = chatbot.reply('what can you do');
  assert.match(reply.toLowerCase(), /download|tiktok|youtube|help|bot/i);
});

test('responds with a safe fallback when no match is found', () => {
  const chatbot = createLocalChatbot({ memoryFile: 'test/.chatbot-memory-4.json' });

  const reply = chatbot.reply('what is the meaning of life');
  assert.ok(typeof reply === 'string');
  assert.ok(reply.length > 0);
  assert.match(reply.toLowerCase(), /learning|teach me|question|answer|help/i);
});

test('uses transformer output only when local memory has no reply', async () => {
  const chatbot = createLocalChatbot({ memoryFile: 'test/.chatbot-memory-5.json' });
  let modelCalls = 0;

  chatbot.learn('favorite color', 'blue', 'alice');
  const remembered = await chatbot.replyWithModel('favorite color', 'alice', async () => {
    modelCalls += 1;
    return 'generated answer';
  });
  const generated = await chatbot.replyWithModel('an unknown question', 'alice', async () => {
    modelCalls += 1;
    return 'generated answer';
  });

  assert.equal(remembered, 'blue');
  assert.equal(generated, 'generated answer');
  assert.equal(modelCalls, 1);
});

test('falls back cleanly when the transformer is unavailable', async () => {
  const chatbot = createLocalChatbot({ memoryFile: 'test/.chatbot-memory-6.json' });
  const fallback = chatbot.reply('an unknown question', 'alice');

  assert.equal(
    await chatbot.replyWithModel('an unknown question', 'alice', async () => null),
    fallback,
  );
});

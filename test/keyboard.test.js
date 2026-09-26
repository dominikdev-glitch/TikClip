const test = require('node:test');
const assert = require('node:assert/strict');

const {
  menuKeyboard,
  onboardingKeyboard,
  videoActionKeyboard,
} = require('../src/keyboard');

test('creates the main menu keyboard', () => {
  const keyboard = menuKeyboard();

  assert.ok(keyboard);
  assert.ok(Array.isArray(keyboard.inline_keyboard));
  assert.ok(keyboard.inline_keyboard.length >= 4);
});

test('creates a two-button video action keyboard', () => {
  const keyboard = videoActionKeyboard();

  assert.ok(Array.isArray(keyboard.inline_keyboard));
  assert.equal(keyboard.inline_keyboard.length, 1);
  assert.deepEqual(
    keyboard.inline_keyboard[0].map((button) => button.callback_data),
    ['action:post-tiktok', 'action:post-youtube'],
  );
});

test('creates onboarding choices for both platforms and skipping', () => {
  const keyboard = onboardingKeyboard();
  const actions = keyboard.inline_keyboard
    .flat()
    .map((button) => button.callback_data);

  assert.deepEqual(actions, [
    'action:connect-tiktok',
    'action:connect-youtube',
    'action:onboarding-skip',
  ]);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  menuKeyboard,
  onboardingKeyboard,
  videoActionKeyboard,
} = require('../src/keyboard');

test('creates the main menu keyboard', () => {
  const keyboard = menuKeyboard();
  const actions = keyboard.inline_keyboard
    .flat()
    .map((button) => button.callback_data);

  assert.ok(keyboard);
  assert.ok(Array.isArray(keyboard.inline_keyboard));
  assert.deepEqual(actions, [
    'action:download',
    'action:connect-youtube',
    'action:post-youtube',
    'action:help',
  ]);
});

test('creates a YouTube upload action for downloaded videos', () => {
  const keyboard = videoActionKeyboard();

  assert.ok(Array.isArray(keyboard.inline_keyboard));
  assert.equal(keyboard.inline_keyboard.length, 1);
  assert.deepEqual(
    keyboard.inline_keyboard[0].map((button) => button.callback_data),
    ['action:post-youtube'],
  );
});

test('creates YouTube onboarding choice and skipping', () => {
  const keyboard = onboardingKeyboard();
  const actions = keyboard.inline_keyboard
    .flat()
    .map((button) => button.callback_data);

  assert.deepEqual(actions, [
    'action:connect-youtube',
    'action:onboarding-skip',
  ]);
});

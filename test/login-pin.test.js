const test = require('node:test');
const assert = require('node:assert/strict');

const { verifyLoginPin } = require('../src/login-pin');

test('accepts a matching PIN and surrounding whitespace', () => {
  assert.equal(verifyLoginPin('0824', ' 0824 '), true);
});

test('rejects an incorrect PIN and an unset PIN', () => {
  assert.equal(verifyLoginPin('0824', '0825'), false);
  assert.equal(verifyLoginPin('', '0824'), false);
});

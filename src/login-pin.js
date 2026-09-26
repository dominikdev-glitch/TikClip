const crypto = require('node:crypto');

function verifyLoginPin(expectedPin, providedPin) {
  if (!expectedPin || typeof providedPin !== 'string') return false;

  const expected = Buffer.from(expectedPin);
  const provided = Buffer.from(providedPin.trim());
  return (
    expected.length === provided.length &&
    crypto.timingSafeEqual(expected, provided)
  );
}

module.exports = { verifyLoginPin };

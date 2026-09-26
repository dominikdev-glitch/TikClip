const { InlineKeyboard } = require('grammy');

function menuKeyboard() {
  return new InlineKeyboard()
    .text('Download video', 'action:download')
    .row()
    .text('Connect TikTok', 'action:connect-tiktok')
    .text('Post to TikTok', 'action:post-tiktok')
    .row()
    .text('Connect YouTube', 'action:connect-youtube')
    .text('Upload to YouTube', 'action:post-youtube')
    .row()
    .text('Help', 'action:help');
}

function videoActionKeyboard() {
  return new InlineKeyboard()
    .text('Upload TikTok', 'action:post-tiktok')
    .text('Upload YouTube', 'action:post-youtube');
}

function onboardingKeyboard() {
  return new InlineKeyboard()
    .text('Connect TikTok', 'action:connect-tiktok')
    .row()
    .text('Connect YouTube', 'action:connect-youtube')
    .row()
    .text('Nevermind', 'action:onboarding-skip');
}

module.exports = {
  menuKeyboard,
  onboardingKeyboard,
  videoActionKeyboard,
};

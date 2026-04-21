// background.js — service worker
// Relays messages from content.js back to the popup (which can't receive
// messages from content scripts directly in MV3)

// ── Open separate popup window to prevent closing on focus lost ─────────────

chrome.action.onClicked.addListener((tab) => {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 450,
    height: 700
  });
});

// ── Message relay ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "jobDone" || message.action === "jobProgress") {
    // Forward to all extension views (the popup)
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup may have closed; that's fine
    });
    return false;
  }
});

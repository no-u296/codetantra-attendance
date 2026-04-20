// background.js — service worker
// Relays messages from content.js back to the popup (which can't receive
// messages from content scripts directly in MV3), and handles alarms.

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

// ── Periodic attendance notifications ─────────────────────────────────────────

chrome.alarms.create('attendanceCheck', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'attendanceCheck') return;

  const stored = await chrome.storage.local.get(['lastResults', 'ctThreshold', 'ctNotif']);
  if (!stored.lastResults || stored.ctNotif === false) return;

  const data      = stored.lastResults;
  const threshold = stored.ctThreshold || 75;
  const danger    = [];
  const warning   = [];

  Object.entries(data).forEach(([subject, stats]) => {
    if (stats.total === 0) return;
    const pct       = (stats.attended / stats.total) * 100;
    const shortName = subject.split('/')[0].trim();
    if (pct < threshold)      danger.push(`${shortName}: ${pct.toFixed(1)}%`);
    else if (pct < threshold + 5) warning.push(`${shortName}: ${pct.toFixed(1)}%`);
  });

  if (danger.length > 0) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon.png',
      title: '⚠️ Attendance Critical',
      message: `Below ${threshold}%: ${danger.join(', ')}`,
      priority: 2
    });
  } else if (warning.length > 0) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon.png',
      title: '📊 Attendance Warning',
      message: `Getting close to ${threshold}%: ${warning.join(', ')}`,
      priority: 1
    });
  }
});

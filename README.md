# CT Attendance

A Chrome extension that tracks attendance on [CodeTantra](https://iiitb.codetantra.com) — the learning platform used at IIIT Bangalore — and surfaces it in a clean, actionable popup.

> **Built as a self-learning project** through vibecoding: iteratively prompting, reading, breaking, and fixing — using AI as a tool to explore browser extension development, Chrome APIs, and frontend engineering.

---

## What it does

CodeTantra shows attendance buried inside individual class pages. This extension pulls all of it together in one place.

- **Calculates attendance** across a custom date range or preset (this month / full semester)
- **Auto-groups subjects by course code** — `CSE102 / Section A` and `CSE102 by Prof. X` become one combined `CSE102` entry
- **Shows per-subject stats**: attended, total, percentage, and missed dates
- **What-if predictor**: adjust future class counts to see how your percentage changes
- **Can-skip / must-attend calculator** based on a configurable threshold (default 75%)
- **Periodic notifications** (every hour) if any subject is below or near the threshold
- Tracks any student by user ID, not just yourself

---

## Screenshots

> *(Add screenshots here — popup with results, progress bar, expanded card with predictor)*

---

## Installation

This extension is not on the Chrome Web Store. Load it manually:

1. Clone or download this repository
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder
5. Open any [CodeTantra](https://iiitb.codetantra.com) page while logged in
6. Click the extension icon and hit **Calculate**

---

## How it works

### Architecture

Chrome extensions in Manifest V3 have three isolated execution contexts. This project uses all three:

```
popup.html / popup.js          ← UI, user interaction, rendering
      ↕ chrome.runtime.sendMessage
background.js (service worker) ← message relay, alarm-based notifications
      ↕ chrome.tabs.sendMessage
content.js                     ← runs on codetantra.com, makes fetch() calls
```

The popup can't directly call `fetch()` on CodeTantra (CORS), and content scripts can't hold long-lived message channels with the popup (MV3 limitation). The background service worker bridges them.

### Data flow

1. User picks a date range and clicks **Calculate**
2. Popup sends a `calculate` message to the content script via `chrome.tabs.sendMessage`
3. Content script POSTs to `https://iiitb.codetantra.com/secure/rest/dd/mf` with the date range — this returns a list of all classes in that window
4. For each ended class, it fetches the meeting detail page and parses the embedded `im.init(...)` JSON to check if the user appears in the attendees list
5. Progress is streamed back through the background relay (`jobProgress` → `jobDone`)
6. Popup renders results; data is also saved to `chrome.storage.local` so it persists across popup closes

### Subject auto-merging

CodeTantra names the same course inconsistently across sessions (e.g. `CSE102`, `CSE102 / Lab`, `CSE102 by Badri`). The extension extracts the leading course code with a regex and merges all matching subjects:

```js
function extractCourseCode(subject) {
  const m = subject.match(/^([A-Z]{2,6}\s*\d{0,3}[A-Z]?)/i);
  if (m) return m[1].replace(/\s+/g, '').toUpperCase();
  return null;
}
```

Attended counts and missed dates are summed/deduped across all entries sharing the same code.

---

## Tech

- **Manifest V3** Chrome Extension API
- Vanilla JS — no build step, no bundler, no dependencies
- `chrome.storage.local` for persistence
- `chrome.alarms` for background scheduling
- `chrome.notifications` for OS-level alerts
- `chrome.scripting` for dynamic content script injection
- CSS custom properties + `@keyframes` for the UI

---

## Project structure

```
├── manifest.json      # Extension config — permissions, content scripts, service worker
├── background.js      # Service worker: message relay + alarm-triggered notifications
├── content.js         # Core logic: fetches class list, checks attendance per meeting
├── popup.html         # Extension popup markup
├── popup.css          # All styles — dark theme, cards, animations, predictor UI
├── popup.js           # UI logic: rendering, predictor, settings, storage
└── icon.png           # Extension icon
```

---

## What I learned

This started as a practical problem — checking attendance on CodeTantra is tedious — and became an exercise in reading documentation and understanding how the browser extension model actually works.

Key things picked up along the way:

- **MV3 service worker constraints** — no persistent background page; service workers are ephemeral and can't hold open message channels, which required routing messages through the relay pattern
- **Content script isolation** — content scripts share the DOM but not the JS context with the page; fetching with `credentials: include` is what makes the authenticated API calls work
- **Async messaging patterns** — `sendResponse` has a 5-minute timeout; for long jobs (large class lists), acknowledging immediately and using a separate `sendMessage` for the result avoids silent failures
- **Chrome storage API** — `chrome.storage.local` vs `localStorage`; the former works across extension contexts
- **DOM-less rendering** — building a UI entirely in a constrained 380px popup with no framework
- **Reading undocumented APIs** — the attendance data comes from parsing `im.init(...)` embedded in HTML, not a documented endpoint; figuring that out required reading page source

---

## Potential improvements

- [ ] Export attendance to CSV
- [ ] Sort subjects by percentage (ascending/descending)
- [ ] Cache invalidation — detect when the stored result is stale
- [ ] Support for multiple CodeTantra accounts
- [ ] Onboarding flow for first-time users

---

## Acknowledgements

Original attendance-fetching logic by **Surya Kiran**. UI and extension architecture built on top of that foundation.

---

## License

MIT

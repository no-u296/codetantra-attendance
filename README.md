# CodeTantra Attendance Calculator

A browser extension that automatically calculates your CodeTantra attendance over custom date ranges.

## Downloads
![Total Downloads](https://img.shields.io/github/downloads/no-u296/codetantra-attendance/total)

## Features
### From [@no-u296]()
* **Accurate Calculation:** Parses native JSON data under the hood to completely avoid CodeTantra's mobile-only UI blocks.
* **Date Range Filtering:** Check your attendance for specific weeks, months, or the entire semester.
* **Stalk a Friend:** Search for a specific Roll Number  to check a friend's attendance for a shared class.
* **Missed Classes Tracker:** Visually flags the exact dates you were marked absent beneath your total percentages.
* **Security:** Runs 100% locally in your browser.


### (From [@AadamAftab](https://github.com/AadamAftab/) )
* **UI Improvements:** Enhanced popup and UI.
* **Per-Subject Thresholds:** Configurable attendance thresholds per subject to calculate must-attend and can-skip classes.
* **Can-skip / must-attend calculator:** See how many classes you need to attend or can skip based on threshold (Default 75%)
* **Auto-groups subjects by course code**  CSE102 / Section A and CSE102 by Prof. X become one combined CSE102 entry (The name of course is determined by longest entry)
* **Storage:** Latest Result is stored for faster access times.


Note: Features such as hourly reminder , notification system , What if predictor was not merged from new features PR which can be found on this [repo](https://github.com/AadamAftab/attendance-tracker-extension-iiitb).


## Installation

### For Google Chrome, Edge, and Brave (Unpacked Zip)
1. Go to the [Releases](https://github.com/no-u296/codetantra-attendance/releases/download/6.7.1/CodeTantra-Attendance.zip) page and download the `CodeTantra-Attendance.zip` file.
2. Unzip the folder to a permanent location on your computer.
3. Open your browser and navigate to `chrome://extensions/`.
4. Turn on **Developer mode** (usually a toggle in the top right corner).
5. Click the **Load unpacked** button in the top left.
6. Select the unzipped folder. The extension is now installed!

### For Firefox Desktop & Android (.xpi File)
1. Go to the [Releases](https://github.com/no-u296/codetantra-attendance/releases/download/6.7.1/CodeTantra-Attendance.xpi) page and download the `CodeTantra-Attendance.xpi` file.
2. Open Firefox and navigate to `about:addons`.
3. Click the gear icon ⚙️ in the top right corner and select **Install Add-on From File...**
4. Select the downloaded `.xpi` file and click **Add** when prompted.
*(Note: You can also install this directly on the Firefox for Android mobile browser!)*

### For Safari Users
Who tf uses Safari?

## 🛠️ How to Use
1. Log in to your [CodeTantra portal](https://iiitb.codetantra.com).
2. Click the extension icon in your browser toolbar. It will automatically open a dedicated calculator tab.
3. Select your Start and End dates.
4. *(Optional)* Enter a target User ID to check someone else's attendance.
5. Click **Calculate Attendance**.

## 👨‍💻 Technical Details
The extension injects a content script into the CodeTantra portal to natively fetch the `/mf` (calendar) and `/mi.jsp` (meeting info) endpoints. Rather than relying on DOM scraping or using iframes, it uses Regex to extract the `im.init` JSON payload directly from the raw HTML. This guarantees flawless attendance tracking regardless of client-side device checks or User-Agent restrictions.




### Subject Auto-Merging
CodeTantra names the same course inconsistently across sessions (e.g. `CSE102`, `CSE102 / Lab`, `CSE102 by X`). The extension extracts the leading course code with a regex and merges all matching subjects:

```js
function extractCourseCode(subject) {
  const m = subject.match(/^([A-Z]{2,6}\s*\d{0,3}[A-Z]?)/i);
  if (m) return m[1].replace(/\s+/g, '').toUpperCase();
  return null;
}
```

Attended counts and missed dates are summed/deduped across all entries sharing the same code.


## Credits
- Original project by Surya Kiran(me lol).
- UI changes and improvements contributed by [@AadamAftab](https://github.com/AadamAftab/).

## Project Structure
```
├── manifest.json          # Chrome extension config
├── masnifest-firefox.json # Firefox extension config
├── background.js          # Service worker: message relay
├── content.js             # Core logic: fetches class list, checks attendance per meeting
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic and rendering
├── popup.css              # Styles for the popup
├── memory.md              # Project memory and notes
└── README.md              # This file
```

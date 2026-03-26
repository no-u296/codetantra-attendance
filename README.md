# CodeTantra Attendance Calculator

A extension that automatically calculates your CodeTantra attendance over custom date ranges.

## Features
* **Accurate Calculation:** Parses native JSON data under the hood to completely avoid CodeTantra's mobile-only UI blocks.
* **Date Range Filtering:** Check your attendance for specific weeks, months, or the entire semester
* **Stalk a friend** Search for a specific User ID to check a friend's attendance for a shared class.
* **Missed Classes Tracker:** Visually flags the exact dates you were marked absent beneath your total percentages.
* **Security:** Runs 100% locally in your browser.

##  Installation

### For Google Chrome, Edge, and Brave (Unpacked Zip)
1. Go to the [Releases](https://github.com/no-u296/codetantra-attendance/releases/download/6.7/CodeTantra-Attendance.zip) page and download the `CodeTantra-Attendance.zip` file.
2. Unzip the folder to a permanent location on your computer.
3. Open your browser and navigate to `chrome://extensions/`.
4. Turn on **Developer mode** (usually a toggle in the top right corner).
5. Click the **Load unpacked** button in the top left.
6. Select the unzipped folder. The extension is now installed!

### For Firefox Desktop & Android (.xpi File)[easy]
1. Go to the [Releases](https://github.com/no-u296/codetantra-attendance/releases/download/6.7/CodeTantra-Attendance.xpi) page and download the `CodeTantra-Attendance.xpi` file.
2. Open Firefox and navigate to `about:addons`.
3. Click the gear icon ⚙️ in the top right corner and select **Install Add-on From File...**
4. Select the downloaded `.xpi` file and click **Add** when prompted. 
*(Note: You can also install this directly on the Firefox for Android mobile browser!)*

### For Safari users
1. who tf uses safari

## 🛠️ How to Use
1. Log in to your [CodeTantra portal](https://iiitb.codetantra.com).
2. Click the extension icon in your browser toolbar. It will automatically open a dedicated calculator tab.
3. Select your Start and End dates.
4. *(Optional)* Enter a target User ID to check someone else's attendance.
5. Click **Calculate Attendance**. 

## 👨‍💻 Technical Details
 The extension injects a content script into the CodeTantra portal to natively fetch the `/mf` (calendar) and `/mi.jsp` (meeting info) endpoints. Rather than relying on  DOM scraping or using iframes, it uses Regex to extract the `im.init` JSON payload directly from the raw HTML. This guarantees flawless attendance tracking regardless of client-side device checks or User-Agent restrictions.

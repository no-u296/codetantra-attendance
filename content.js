// content.js — core attendance fetching logic
// Original logic by Surya Kiran, UI enhancements by extension v2/v3

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "pong" });
    return false;
  }

  if (request.action === "calculate") {
    const [sYear, sMonth, sDay] = request.start.split('-');
    const startTs = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0).getTime();
    const [eYear, eMonth, eDay] = request.end.split('-');
    const endTs = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999).getTime();
    const targetUserId = request.targetUserId || null;

    // Acknowledge immediately — avoids the 5-minute sendResponse timeout
    // on large class lists. Results come back via a separate sendMessage.
    sendResponse({ status: "started" });

    calculateOverallAttendance(startTs, endTs, targetUserId, request.jobId)
      .then(results => {
        chrome.storage.local.set({ lastResults: results, lastTargetUser: targetUserId });
        chrome.runtime.sendMessage({
          action: "jobDone",
          jobId: request.jobId,
          status: "success",
          data: results,
          targetUser: targetUserId
        });
      })
      .catch(error => {
        chrome.runtime.sendMessage({
          action: "jobDone",
          jobId: request.jobId,
          status: "error",
          message: error.message || error.toString()
        });
      });

    return false;
  }
});

async function calculateOverallAttendance(startDateTs, endDateTs, targetUserId, jobId) {
  const payload = {
    minDate: startDateTs,
    maxDate: endDateTs,
    filters: { showSelf: true, status: "started,ended,scheduled" }
  };

  let response;
  try {
    response = await fetch("https://iiitb.codetantra.com/secure/rest/dd/mf", {
      method: "POST",
      credentials: "include",
      mode: "cors",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    throw new Error(`Network error: ${e.message}. Make sure you are logged in to CodeTantra.`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Not authenticated (HTTP ${response.status}). Please log in to CodeTantra and try again.`);
  }
  if (!response.ok) {
    throw new Error(`Server error (HTTP ${response.status}) while fetching class list.`);
  }

  let calendarData;
  try {
    calendarData = await response.json();
  } catch (e) {
    throw new Error("Could not parse server response — you may have been logged out.");
  }

  if (!calendarData.ref || calendarData.ref.length === 0) {
    return { error: "No classes found in this date range." };
  }

  const ended = calendarData.ref.filter(m => m.type === "class" && m.status === "ended");
  if (ended.length === 0) {
    return { error: "No ended classes found in this date range." };
  }

  const finalScores = {};
  let processed = 0;

  for (const meeting of ended) {
    const subjectName = meeting.title.split(" - ")[0].trim();
    const meetingUrl  = `https://iiitb.codetantra.com/secure/tla/mi.jsp?s=m&m=${meeting._id}`;

    await new Promise(r => setTimeout(r, 150));

    const status = await checkMyAttendance(meetingUrl, targetUserId);
    processed++;

    // Live progress to popup (ignore if popup is closed)
    chrome.runtime.sendMessage({
      action: "jobProgress",
      jobId,
      processed,
      total: ended.length
    }).catch(() => {});

    if (!finalScores[subjectName]) {
      finalScores[subjectName] = { attended: 0, total: 0, missedDates: [] };
    }

    if (status !== "Unknown" && status !== "Error") {
      finalScores[subjectName].total++;
      if (status === "Present") {
        finalScores[subjectName].attended++;
      } else {
        const dateObj = new Date(meeting.startTime);
        const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        if (!finalScores[subjectName].missedDates.includes(dateStr)) {
          finalScores[subjectName].missedDates.push(dateStr);
        }
      }
    }
  }

  return finalScores;
}

async function checkMyAttendance(meetingUrl, targetUserId) {
  try {
    const response = await fetch(meetingUrl, { credentials: "include" });
    const htmlText  = await response.text();
    const match     = htmlText.match(/im\.init\(([\s\S]*?)\);/);

    if (match && match[1]) {
      try {
        const pageData      = JSON.parse(match[1]);
        const searchId      = targetUserId || pageData.currUserId;
        const attendeesList = pageData.meetingInfo?.attendees;
        if (searchId && attendeesList) {
          return JSON.stringify(attendeesList).includes(searchId) ? "Present" : "Absent";
        }
      } catch (e) {
        console.error(`Failed to parse JSON for ${meetingUrl}:`, e);
      }
    }
    return "Absent";
  } catch (error) {
    console.error(`Network error for ${meetingUrl}:`, error);
    return "Error";
  }
}

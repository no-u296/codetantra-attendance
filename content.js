chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "calculate") {
        
        
        const [sYear, sMonth, sDay] = request.start.split('-');
        const startTs = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0).getTime(); // 00:00:00.000 local
        
        const [eYear, eMonth, eDay] = request.end.split('-');
        const endTs = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999).getTime(); // 23:59:59.999 local
        
        
        const targetUserId = request.targetUserId || null;
        
        calculateOverallAttendance(startTs, endTs, targetUserId).then(results => {
            sendResponse({ status: "success", data: results });
        }).catch(error => {
            sendResponse({ status: "error", message: error.toString() });
        });
        
        return true; 
    }
});

async function calculateOverallAttendance(startDateTs, endDateTs, targetUserId) {
    const payload = {
        minDate: startDateTs,
        maxDate: endDateTs,
        filters: {
            showSelf: true,
            status: "started,ended,scheduled"
        }
    };

    try {
        const response = await fetch("https://iiitb.codetantra.com/secure/rest/dd/mf", {
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

        if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
        
        const calendarData = await response.json();
        let finalScores = {};

        if (!calendarData.ref || calendarData.ref.length === 0) return { error: "No classes found." };

        for (const meeting of calendarData.ref) {
            if (meeting.type === "class" && meeting.status === "ended") {
                const subjectName = meeting.title.split(" - ")[0].trim();
                const meetingUrl = `https://iiitb.codetantra.com/secure/tla/mi.jsp?s=m&m=${meeting._id}`;
                
                await new Promise(r => setTimeout(r, 150)); 
                
            
                const status = await checkMyAttendance(meetingUrl, targetUserId);

                if (!finalScores[subjectName]) {
                    finalScores[subjectName] = { attended: 0, total: 0, missedDates: [] };
                }

                if (status !== "Unknown" && status !== "Error") {
                    finalScores[subjectName].total++;
                    
                    if (status === "Present") {
                        finalScores[subjectName].attended++;
                    } else if (status === "Absent") {
                        
                        const dateObj = new Date(meeting.startTime);
                        const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                        
                        // Prevent duplicate dates 
                        if (!finalScores[subjectName].missedDates.includes(dateStr)) {
                            finalScores[subjectName].missedDates.push(dateStr);
                        }
                    }
                }
            }
        }
        return finalScores;
    } catch (error) {
        throw new Error(error.message); 
    }
}


async function checkMyAttendance(meetingUrl, targetUserId) {
    try {
        const response = await fetch(meetingUrl, { credentials: "include" });
        const htmlText = await response.text();
        
        const match = htmlText.match(/im\.init\(([\s\S]*?)\);/); // regex
        
        if (match && match[1]) {
            try {
                const pageData = JSON.parse(match[1]);
                
                
                const searchId = targetUserId || pageData.currUserId;
                const attendeesList = pageData.meetingInfo?.attendees;
                
                if (searchId && attendeesList) {
                    const attendeesString = JSON.stringify(attendeesList);
                    if (attendeesString.includes(searchId)) {
                        return "Present";
                    } else {
                        return "Absent";
                    }
                }
            } catch (e) {
                console.error(`Failed to parse CodeTantra JSON for ${meetingUrl}:`, e);
            }
        }
        return "Absent";
        
    } catch (error) {
        console.error(`Network error fetching ${meetingUrl}:`, error);
        return "Error";
    }
}
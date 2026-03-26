document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
    document.getElementById('startDate').value = firstDay.toISOString().split('T')[0];
});

document.getElementById('calcBtn').addEventListener('click', () => {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const targetUserId = document.getElementById('targetUserId').value.trim();  
    const btn = document.getElementById('calcBtn');
    const loading = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');

    if (!startDate || !endDate) {
        resultsDiv.innerHTML = '<p class="error-msg">Please select both dates.</p>';
        return;
    }

    btn.disabled = true;
    loading.classList.remove('hidden');
    resultsDiv.innerHTML = '';

    
    chrome.tabs.query({ url: "*://*.codetantra.com/*" }, function(tabs) {
        if (tabs.length === 0) {
            btn.disabled = false;
            loading.classList.add('hidden');
            resultsDiv.innerHTML = '<p class="error-msg">Please open your CodeTantra portal in another tab first.</p>';
            return;
        }

        
        const ctTab = tabs[0];
        chrome.tabs.sendMessage(ctTab.id, {
            action: "calculate",
            start: startDate,
            end: endDate,
            targetUserId: targetUserId
        }, (response) => {
            btn.disabled = false;
            loading.classList.add('hidden');

            if (chrome.runtime.lastError) {
                resultsDiv.innerHTML = '<p class="error-msg">Please refresh your CodeTantra tab and try again.</p>';
                return;
            }

            if (response && response.status === "success") {
                displayResults(response.data);
            } else {
                resultsDiv.innerHTML = `<p class="error-msg">Error: ${response ? response.message : "Failed to fetch."}</p>`;
            }
        });
    });
});

function displayResults(data) {
    const resultsDiv = document.getElementById('results');
    
    if (data.error) {
        resultsDiv.innerHTML = `<p class="error-msg">${data.error}</p>`;
        return;
    }

    const subjects = Object.keys(data);
    if (subjects.length === 0) {
        resultsDiv.innerHTML = '<p>No classes found in this date range.</p>';
        return;
    }

    let html = '';
    subjects.forEach(subject => {
        const stats = data[subject];
        const percentage = stats.total > 0 ? ((stats.attended / stats.total) * 100).toFixed(2) : 0;
        
        
        let missedHtml = '';
        if (stats.missedDates && stats.missedDates.length > 0) {
            missedHtml = `<div class="missed-dates"><strong>Missed:</strong> ${stats.missedDates.join(', ')}</div>`;
        }
        
        html += `
            <div class="subject-card">
                <div class="subject-title">${subject}</div>
                <div class="subject-stats">
                    Attended: ${stats.attended} / ${stats.total} <br>
                    <strong>Percentage: ${percentage}%</strong>
                    ${missedHtml}
                </div>
            </div>
        `;
    });

    resultsDiv.innerHTML = html;
}
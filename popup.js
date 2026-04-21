// popup.js — CT Attendance 

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const today    = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById('endDate').value   = today.toISOString().split('T')[0];
  document.getElementById('startDate').value = firstDay.toISOString().split('T')[0];

  const stored    = await chrome.storage.local.get(['subjectThresholds', 'lastResults', 'prefixGrouping', 'lastTargetUser']);
  window.subjectThresholds = stored.subjectThresholds || {};
  const prefixOn  = stored['prefixGrouping'] !== false;

  document.getElementById('prefixGrouping').checked   = prefixOn;

  if (stored.lastTargetUser) {
    document.getElementById('targetUserId').value = stored.lastTargetUser;
    document.getElementById('currentUserBadge').textContent = stored.lastTargetUser;
  } else {
    document.getElementById('currentUserBadge').textContent = 'Self';
  }

  if (stored.lastResults && typeof stored.lastResults === 'object' && !stored.lastResults.error) {
    renderResults(mergeByCourseCode(stored.lastResults), prefixOn);
  }
});

// ── Listen for messages from background (relayed from content script) ─────────

let activeJobId = null;

chrome.runtime.onMessage.addListener((message) => {
  if (!activeJobId || message.jobId !== activeJobId) return;

  if (message.action === "jobProgress") {
    const pct = Math.round((message.processed / message.total) * 100);
    document.getElementById('progressFill').style.width = Math.min(pct, 95) + '%';
    document.getElementById('fetchStatus').textContent  =
      `Checked ${message.processed} / ${message.total} classes… (Milan is really fast)`;
    return;
  }

  if (message.action === "jobDone") {
    activeJobId = null;
    finishCalculation(message);
  }
});

// ── Preset dates ──────────────────────────────────────────────────────────────

document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const preset      = btn.dataset.preset;
    const today       = new Date();
    const customDates = document.getElementById('customDates');

    if (preset === 'month') {
      customDates.classList.add('hidden');
      document.getElementById('startDate').value = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      document.getElementById('endDate').value   = today.toISOString().split('T')[0];
    } else if (preset === 'semester') {
      customDates.classList.add('hidden');
      const m        = today.getMonth();
      const semStart = m >= 7
        ? new Date(today.getFullYear(), 7, 1)
        : new Date(today.getFullYear(), 0, 1);
      document.getElementById('startDate').value = semStart.toISOString().split('T')[0];
      document.getElementById('endDate').value   = today.toISOString().split('T')[0];
    } else {
      customDates.classList.remove('hidden');
    }
  });
});

// ── Settings toggles ──────────────────────────────────────────────────────────

document.getElementById('settingsToggle').addEventListener('click', () => {
  document.getElementById('settingsPanel').classList.toggle('hidden');
  document.getElementById('settingsToggle').classList.toggle('active');
});

document.getElementById('prefixGrouping').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ prefixGrouping: e.target.checked });
});

// ── Auto-merge by course code ─────────────────────────────────────────────────

function extractCourseCode(subject) {
  const m = subject.match(/^([A-Z]{2,6}\s*\d{0,3}[A-Z]?)/i);
  if (m) return m[1].replace(/\s+/g, '').toUpperCase();
  return null;
}

function mergeByCourseCode(rawData) {
  const result = {};
  Object.entries(rawData).forEach(([subject, stats]) => {
    const code = extractCourseCode(subject);
    const key  = code || subject; 
    if (!result[key]) result[key] = { attended: 0, total: 0, missedDates: [], names: [] };
    result[key].attended   += stats.attended;
    result[key].total      += stats.total;
    result[key].missedDates = [
      ...result[key].missedDates,
      ...(stats.missedDates || [])
    ].filter((v, i, a) => a.indexOf(v) === i);
    result[key].names.push(subject);
  });

  Object.entries(result).forEach(([key, data]) => {
    let bestName = data.names[0];
    for (let name of data.names) {
      if (name.includes('/') && !bestName.includes('/')) {
         bestName = name;
      } else if (name.includes('/') === bestName.includes('/') && name.length > bestName.length) {
         bestName = name;
      }
    }
    data.displayName = bestName;
  });

  return result;
}

// ── Calculate ─────────────────────────────────────────────────────────────────

document.getElementById('calcBtn').addEventListener('click', async () => {
  const startDate    = document.getElementById('startDate').value;
  const endDate      = document.getElementById('endDate').value;
  const targetUserId = document.getElementById('targetUserId').value.trim().toUpperCase();
  const resultsDiv   = document.getElementById('results');

  if (!startDate || !endDate) {
    resultsDiv.innerHTML = '<p class="error-msg">Please select both dates.</p>';
    return;
  }

  setLoadingState(true);
  resultsDiv.innerHTML = '';

  const tabs = await chrome.tabs.query({ url: "*://*.codetantra.com/*" });
  if (tabs.length === 0) {
    setLoadingState(false);
    resultsDiv.innerHTML = '<p class="error-msg">Please open CodeTantra in a tab first, then try again.</p>';
    return;
  }

  const tab = tabs[0];

  let alive = false;
  try {
    const pong = await chrome.tabs.sendMessage(tab.id, { action: "ping" });
    alive = pong?.status === "pong";
  } catch (_) {}

  if (!alive) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 300));
      const pong2 = await chrome.tabs.sendMessage(tab.id, { action: "ping" }).catch(() => null);
      alive = pong2?.status === "pong";
    } catch (e) {
      console.warn("Could not inject content script:", e);
    }
  }

  if (!alive) {
    setLoadingState(false);
    resultsDiv.innerHTML = `
      <p class="error-msg">
        Content script not responding.<br>
        Please <b>refresh your CodeTantra tab</b> and try again.
      </p>`;
    return;
  }

  const stored    = await chrome.storage.local.get(['prefixGrouping']);
  const prefixOn  = stored['prefixGrouping'] !== false;

  activeJobId = Date.now().toString();

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: "calculate",
      start: startDate,
      end: endDate,
      targetUserId,
      jobId: activeJobId
    });
    document.getElementById('fetchStatus').textContent = 'Fetching class list…';
  } catch (e) {
    activeJobId = null;
    setLoadingState(false);
    resultsDiv.innerHTML = `<p class="error-msg">Could not contact CodeTantra tab: ${e.message}</p>`;
  }

  window._pendingPrefixOn  = prefixOn;
});

function finishCalculation(message) {
  document.getElementById('progressFill').style.width = '100%';

  setTimeout(() => {
    setLoadingState(false);

    if (message.status === "success") {
      document.getElementById('currentUserBadge').textContent = message.targetUser || 'Self';
      const merged = mergeByCourseCode(message.data);
      renderResults(merged, window._pendingPrefixOn !== false);
    } else {
      document.getElementById('results').innerHTML =
        `<p class="error-msg">${message.message || "Failed to fetch attendance data."}</p>`;
    }

    document.getElementById('progressFill').style.width = '0%';
  }, 300);
}

function setLoadingState(on) {
  const btn        = document.getElementById('calcBtn');
  const btnText    = document.getElementById('btnText');
  const btnLoader  = document.getElementById('btnLoader');
  const progressWrap = document.getElementById('fetchProgress');

  btn.disabled = on;
  btnText.classList.toggle('hidden', on);
  btnLoader.classList.toggle('hidden', !on);
  progressWrap.classList.toggle('hidden', !on);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderResults(data, prefixGrouping) {
  const resultsDiv = document.getElementById('results');

  if (data.error) {
    resultsDiv.innerHTML = `<p class="error-msg">${data.error}</p>`;
    return;
  }

  const subjects = Object.entries(data).filter(([, s]) => s.total > 0);
  if (subjects.length === 0) {
    resultsDiv.innerHTML = '<div class="empty-state">No ended classes found in this date range.</div>';
    return;
  }

  const groups = prefixGrouping ? groupByPrefix(subjects) : { 'All Subjects': subjects };

  let html      = '';

  Object.entries(groups).forEach(([groupName, groupSubjects]) => {
    const showGroupLabel = prefixGrouping && Object.keys(groups).length > 1;
    if (showGroupLabel) html += `<div class="group-label">${groupName}</div>`;

    groupSubjects.forEach(([subjectKey, stats]) => {
      const threshold = window.subjectThresholds[subjectKey] || 75;
      const pct        = (stats.attended / stats.total) * 100;
      const colorClass = pct >= threshold ? 'green' : pct >= threshold - 10 ? 'yellow' : 'red';
      const tFrac      = threshold / 100;

      const needToAttend = pct < threshold
        ? Math.ceil((tFrac * stats.total - stats.attended) / (1 - tFrac))
        : 0;
      const canSkip = pct >= threshold
        ? Math.max(0, Math.floor(stats.attended / tFrac - stats.total))
        : 0;

      const displayName = stats.displayName || subjectKey;
      const R      = 15;
      const C      = 2 * Math.PI * R;
      const offset = C - (Math.min(pct, 100) / 100) * C;

      html += `
        <div class="subject-card ${colorClass}" data-key="${subjectKey}">
          <div class="card-main">
            <div class="arc-wrap">
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle class="arc-bg" cx="18" cy="18" r="${R}"/>
                <circle class="arc-fill" cx="18" cy="18" r="${R}"
                  stroke-dasharray="${C.toFixed(2)}"
                  stroke-dashoffset="${offset.toFixed(2)}"/>
              </svg>
            </div>
            <div class="card-info">
              <div class="card-name" title="${displayName}">${displayName}</div>
              <div class="card-stats">${stats.attended}/${stats.total} classes</div>
            </div>
            <div class="card-right">
              <div class="pct-badge">${pct.toFixed(1)}%</div>
            </div>
            <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          <div class="card-expand hidden">
            <div class="expand-row">
              <div class="expand-box ${canSkip > 0 ? 'safe' : 'neutral'}">
                <div class="expand-box-label">Can skip</div>
                <div class="expand-box-val skip-val">${canSkip > 0 ? canSkip : '—'}</div>
              </div>
              <div class="expand-box ${needToAttend > 0 ? 'need' : 'neutral'}">
                <div class="expand-box-label">Must attend</div>
                <div class="expand-box-val need-val">${needToAttend > 0 ? needToAttend : '—'}</div>
              </div>
              <div class="expand-box proj">
                <div class="expand-box-label">Target</div>
                <div class="expand-box-val val-threshold">${threshold}%</div>
              </div>
            </div>

            <div class="threshold-slider-wrap">
               <label class="thresh-label">Custom threshold (%)</label>
               <input type="number" class="subject-threshold-input" min="0" max="100" step="1" value="${threshold}" data-key="${subjectKey}" data-attended="${stats.attended}" data-total="${stats.total}">
            </div>

            ${stats.missedDates?.length > 0 ? `
            <div class="missed-section">
              <div class="missed-label">Missed classes</div>
              <div class="missed-chips">
                ${stats.missedDates.map(d => `<span class="missed-chip">${d}</span>`).join('')}
              </div>
            </div>` : ''}
          </div>
        </div>
      `;
    });
  });

  resultsDiv.innerHTML = html;

  // Toggle expand
  document.querySelectorAll('.card-main').forEach(main => {
    main.addEventListener('click', () => {
      const card   = main.closest('.subject-card');
      const expand = card.querySelector('.card-expand');
      const isOpen = !expand.classList.contains('hidden');
      expand.classList.toggle('hidden', isOpen);
      card.classList.toggle('expanded', !isOpen);
    });
  });

  // Threshold inputs
  document.querySelectorAll('.subject-threshold-input').forEach(input => {
    input.addEventListener('input', (e) => {
      let val = parseInt(e.target.value);
      if (isNaN(val)) val = 0;
      val = Math.max(0, Math.min(100, val));
      const key = e.target.dataset.key;
      const attended = parseInt(e.target.dataset.attended);
      const total = parseInt(e.target.dataset.total);
      const card = e.target.closest('.subject-card');
      
      card.querySelector('.val-threshold').textContent = val + '%';

      const tFrac = val / 100;
      const pct = (attended / total) * 100;

      const needToAttend = pct < val
        ? Math.ceil((tFrac * total - attended) / (1 - tFrac))
        : 0;
      const canSkip = pct >= val
        ? Math.max(0, Math.floor(attended / tFrac - total))
        : 0;

      const skipBox = card.querySelector('.expand-box:nth-child(1)');
      const needBox = card.querySelector('.expand-box:nth-child(2)');
      
      skipBox.className = 'expand-box ' + (canSkip > 0 ? 'safe' : 'neutral');
      needBox.className = 'expand-box ' + (needToAttend > 0 ? 'need' : 'neutral');

      card.querySelector('.skip-val').textContent = canSkip > 0 ? canSkip : '—';
      card.querySelector('.need-val').textContent = needToAttend > 0 ? needToAttend : '—';

      // Update color class of the card
      card.classList.remove('green', 'yellow', 'red');
      const colorClass = pct >= val ? 'green' : pct >= val - 10 ? 'yellow' : 'red';
      card.classList.add(colorClass);

      // Save to storage
      window.subjectThresholds[key] = val;
      chrome.storage.local.set({ subjectThresholds: window.subjectThresholds });
    });
  });
}

// ── Prefix grouping ───────────────────────────────────────────────────────────

function groupByPrefix(subjects) {
  const groups = {};
  subjects.forEach(([subjectKey, stats]) => {
    // Determine prefix based on displayName instead of key to make it intuitive
    const nameToSplit = stats.displayName || subjectKey;
    let prefix = nameToSplit.split(/\s*[\/]\s*/)[0].trim();
    prefix = prefix.replace(/\s+\d+$/, '').trim();
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push([subjectKey, stats]);
  });
  const allSingle = Object.values(groups).every(g => g.length === 1);
  if (allSingle) return { 'All Subjects': subjects };
  return groups;
}
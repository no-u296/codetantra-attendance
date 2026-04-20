// popup.js — CT Attendance v3

const THRESHOLD_KEY = 'ctThreshold';
const NOTIF_KEY     = 'ctNotif';

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const today    = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById('endDate').value   = today.toISOString().split('T')[0];
  document.getElementById('startDate').value = firstDay.toISOString().split('T')[0];

  const stored    = await chrome.storage.local.get([THRESHOLD_KEY, NOTIF_KEY, 'lastResults', 'prefixGrouping']);
  const threshold = stored[THRESHOLD_KEY] || 75;
  const notifOn   = stored[NOTIF_KEY] !== false;
  const prefixOn  = stored['prefixGrouping'] !== false;

  document.getElementById('thresholdSlider').value   = threshold;
  document.getElementById('thresholdVal').textContent = threshold + '%';
  document.getElementById('prefixGrouping').checked   = prefixOn;

  if (notifOn) document.getElementById('notifToggle').classList.add('active');

  if (stored.lastResults && typeof stored.lastResults === 'object' && !stored.lastResults.error) {
    renderResults(mergeByCourseCode(stored.lastResults), threshold, prefixOn);
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
      `Checked ${message.processed} / ${message.total} classes…`;
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

document.getElementById('notifToggle').addEventListener('click', async () => {
  const isOn = document.getElementById('notifToggle').classList.toggle('active');
  await chrome.storage.local.set({ [NOTIF_KEY]: isOn });
});

document.getElementById('thresholdSlider').addEventListener('input', async (e) => {
  const val = e.target.value;
  document.getElementById('thresholdVal').textContent = val + '%';
  await chrome.storage.local.set({ [THRESHOLD_KEY]: parseInt(val) });
});

document.getElementById('prefixGrouping').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ prefixGrouping: e.target.checked });
});

// ── Auto-merge by course code ─────────────────────────────────────────────────
// Extracts leading course code (e.g. "CSE102", "DHS", "MA101") from a subject
// name and merges all subjects sharing the same code.

function extractCourseCode(subject) {
  // Match patterns like: CSE102, DHS, MA101, ECE303, CS101, IDS etc.
  // Handles optional spaces and separators like " - ", " / ", " by "
  const m = subject.match(/^([A-Z]{2,6}\s*\d{0,3}[A-Z]?)/i);
  if (m) return m[1].replace(/\s+/g, '').toUpperCase();
  return null;
}

function mergeByCourseCode(rawData) {
  const result = {};
  Object.entries(rawData).forEach(([subject, stats]) => {
    const code = extractCourseCode(subject);
    const key  = code || subject; // fall back to full name if no code found
    if (!result[key]) result[key] = { attended: 0, total: 0, missedDates: [] };
    result[key].attended   += stats.attended;
    result[key].total      += stats.total;
    result[key].missedDates = [
      ...result[key].missedDates,
      ...(stats.missedDates || [])
    ].filter((v, i, a) => a.indexOf(v) === i);
  });
  return result;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ── Calculate ─────────────────────────────────────────────────────────────────

document.getElementById('calcBtn').addEventListener('click', async () => {
  const startDate    = document.getElementById('startDate').value;
  const endDate      = document.getElementById('endDate').value;
  const targetUserId = document.getElementById('targetUserId').value.trim();
  const resultsDiv   = document.getElementById('results');
  const summaryBar   = document.getElementById('summaryBar');

  if (!startDate || !endDate) {
    resultsDiv.innerHTML = '<p class="error-msg">Please select both dates.</p>';
    return;
  }

  setLoadingState(true);
  resultsDiv.innerHTML = '';
  summaryBar.classList.add('hidden');

  // Find a CodeTantra tab
  const tabs = await chrome.tabs.query({ url: "*://*.codetantra.com/*" });
  if (tabs.length === 0) {
    setLoadingState(false);
    resultsDiv.innerHTML = '<p class="error-msg">Please open CodeTantra in a tab first, then try again.</p>';
    return;
  }

  const tab = tabs[0];

  // Ping the content script first to make sure it's alive
  let alive = false;
  try {
    const pong = await chrome.tabs.sendMessage(tab.id, { action: "ping" });
    alive = pong?.status === "pong";
  } catch (_) {}

  if (!alive) {
    // Try to inject the content script on the fly (works if host_permissions match)
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      // Brief pause to let it register
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

  const stored    = await chrome.storage.local.get([THRESHOLD_KEY, 'prefixGrouping']);
  const threshold = stored[THRESHOLD_KEY] || 75;
  const prefixOn  = stored['prefixGrouping'] !== false;

  // Generate a unique job ID so we can match async responses
  activeJobId = Date.now().toString();

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: "calculate",
      start: startDate,
      end: endDate,
      targetUserId,
      jobId: activeJobId
    });
    // "started" ack received — results will come via jobDone message
    document.getElementById('fetchStatus').textContent = 'Fetching class list…';
  } catch (e) {
    activeJobId = null;
    setLoadingState(false);
    resultsDiv.innerHTML = `<p class="error-msg">Could not contact CodeTantra tab: ${e.message}</p>`;
  }

  // Store these for finishCalculation
  window._pendingThreshold = threshold;
  window._pendingPrefixOn  = prefixOn;
});

function finishCalculation(message) {
  document.getElementById('progressFill').style.width = '100%';

  setTimeout(() => {
    setLoadingState(false);

    if (message.status === "success") {
      const merged = mergeByCourseCode(message.data);
      renderResults(merged, window._pendingThreshold || 75, window._pendingPrefixOn !== false);
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

function renderResults(data, threshold, prefixGrouping) {
  const resultsDiv = document.getElementById('results');
  const summaryBar = document.getElementById('summaryBar');

  if (data.error) {
    resultsDiv.innerHTML = `<p class="error-msg">${data.error}</p>`;
    summaryBar.classList.add('hidden');
    return;
  }

  const subjects = Object.entries(data).filter(([, s]) => s.total > 0);
  if (subjects.length === 0) {
    resultsDiv.innerHTML = '<div class="empty-state">No ended classes found in this date range.</div>';
    summaryBar.classList.add('hidden');
    return;
  }

  const totalClasses  = subjects.reduce((a, [, s]) => a + s.total, 0);
  const totalAttended = subjects.reduce((a, [, s]) => a + s.attended, 0);
  const overallPct    = totalClasses > 0 ? ((totalAttended / totalClasses) * 100).toFixed(1) : 0;
  document.getElementById('sumTotal').textContent    = totalClasses;
  document.getElementById('sumAttended').textContent = totalAttended;
  document.getElementById('sumPct').textContent      = overallPct + '%';
  summaryBar.classList.remove('hidden');

  const groups = prefixGrouping ? groupByPrefix(subjects) : { 'All Subjects': subjects };

  let html      = '';
  let cardIndex = 0;

  Object.entries(groups).forEach(([groupName, groupSubjects]) => {
    const showGroupLabel = prefixGrouping && Object.keys(groups).length > 1;
    if (showGroupLabel) html += `<div class="group-label">${groupName}</div>`;

    groupSubjects.forEach(([subject, stats]) => {
      const pct        = (stats.attended / stats.total) * 100;
      const colorClass = pct >= threshold ? 'green' : pct >= threshold - 10 ? 'yellow' : 'red';
      const tFrac      = threshold / 100;

      const needToAttend = pct < threshold
        ? Math.ceil((tFrac * stats.total - stats.attended) / (1 - tFrac))
        : 0;
      const canSkip = pct >= threshold
        ? Math.max(0, Math.floor(stats.attended / tFrac - stats.total))
        : 0;

      const displayName = subject; // subject is already the course code after auto-merge
      const R      = 15;
      const C      = 2 * Math.PI * R;
      const offset = C - (Math.min(pct, 100) / 100) * C;

      html += `
        <div class="subject-card ${colorClass}" data-idx="${cardIndex}">
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
              <div class="card-name" title="${subject}">${displayName}</div>
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
                <div class="expand-box-val">${canSkip > 0 ? canSkip : '—'}</div>
              </div>
              <div class="expand-box ${needToAttend > 0 ? 'need' : 'neutral'}">
                <div class="expand-box-label">Must attend</div>
                <div class="expand-box-val">${needToAttend > 0 ? needToAttend : '—'}</div>
              </div>
              <div class="expand-box proj">
                <div class="expand-box-label">Target</div>
                <div class="expand-box-val">${threshold}%</div>
              </div>
            </div>

            <div class="proj-section">
              <div class="proj-label">What-if predictor</div>
              <div class="predictor-grid">
                <div class="pred-col">
                  <label class="pred-lbl">Future classes</label>
                  <div class="pred-stepper">
                    <button class="step-btn step-down" data-target="future-${cardIndex}">−</button>
                    <input type="number" id="future-${cardIndex}" class="proj-num pred-future"
                      min="0" max="200" value="10"
                      data-attended="${stats.attended}" data-total="${stats.total}" data-threshold="${threshold}">
                    <button class="step-btn step-up" data-target="future-${cardIndex}">+</button>
                  </div>
                </div>
                <div class="pred-col">
                  <label class="pred-lbl">I will attend</label>
                  <div class="pred-stepper">
                    <button class="step-btn step-down" data-target="attend-${cardIndex}">−</button>
                    <input type="number" id="attend-${cardIndex}" class="proj-num pred-attend"
                      min="0" max="200" value="10"
                      data-attended="${stats.attended}" data-total="${stats.total}" data-threshold="${threshold}">
                    <button class="step-btn step-up" data-target="attend-${cardIndex}">+</button>
                  </div>
                </div>
              </div>
              <div class="proj-outcome">
                <div class="outcome-bar-track">
                  <div class="outcome-bar-fill" id="obar-${cardIndex}"></div>
                  <div class="outcome-bar-thresh" id="othresh-${cardIndex}"></div>
                </div>
                <div class="outcome-label" id="olabel-${cardIndex}">—</div>
              </div>
              <div class="pred-hint" id="hint-${cardIndex}"></div>
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
      cardIndex++;
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
      if (!isOpen) card.querySelector('.pred-future')?.dispatchEvent(new Event('input'));
    });
  });

  // Stepper buttons
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const delta  = btn.classList.contains('step-up') ? 1 : -1;
      target.value = Math.max(0, (parseInt(target.value) || 0) + delta);
      target.dispatchEvent(new Event('input'));
    });
  });

  // Predictor
  document.querySelectorAll('.pred-future, .pred-attend').forEach(input => {
    input.addEventListener('input', () => {
      const card        = input.closest('.subject-card');
      const idx         = card.dataset.idx;
      const futureInput = card.querySelector('.pred-future');
      const attendInput = card.querySelector('.pred-attend');

      const futureTotal  = Math.max(0, parseInt(futureInput.value) || 0);
      const attended     = parseInt(futureInput.dataset.attended);
      const total        = parseInt(futureInput.dataset.total);
      const threshold    = parseInt(futureInput.dataset.threshold);
      const tFrac        = threshold / 100;

      let futureAttend = Math.max(0, Math.min(parseInt(attendInput.value) || 0, futureTotal));
      attendInput.value = futureAttend;

      const newAttended = attended + futureAttend;
      const newTotal    = total + futureTotal;
      const newPct      = newTotal > 0 ? (newAttended / newTotal) * 100 : 0;

      const obar    = document.getElementById(`obar-${idx}`);
      const othresh = document.getElementById(`othresh-${idx}`);
      const olabel  = document.getElementById(`olabel-${idx}`);
      const hintEl  = document.getElementById(`hint-${idx}`);

      if (obar) {
        obar.style.width   = Math.min(newPct, 100).toFixed(1) + '%';
        othresh.style.left = Math.min(threshold, 99) + '%';
        const color = newPct >= threshold ? 'var(--green)' : newPct >= threshold - 10 ? 'var(--yellow)' : 'var(--red)';
        obar.style.background = color;
        olabel.style.color    = color;
        olabel.textContent    = `${newPct.toFixed(1)}%  (${newAttended}/${newTotal})`;
      }

      if (hintEl) {
        if (futureTotal === 0) {
          hintEl.textContent = '';
        } else {
          const minAttend = Math.max(0, Math.min(Math.ceil(tFrac * (total + futureTotal) - attended), futureTotal));
          const maxSkip   = futureTotal - minAttend;
          if (newPct >= threshold) {
            hintEl.innerHTML = `<span class="hint-good">✓ You can skip up to <b>${maxSkip}</b> of these ${futureTotal} and stay above ${threshold}%</span>`;
          } else {
            hintEl.innerHTML = `<span class="hint-warn">Attend at least <b>${minAttend}</b> of these ${futureTotal} classes to reach ${threshold}%</span>`;
          }
        }
      }
    });
  });
}

// ── Prefix grouping ───────────────────────────────────────────────────────────

function groupByPrefix(subjects) {
  const groups = {};
  subjects.forEach(([subject, stats]) => {
    let prefix = subject.split(/\s*[\/]\s*/)[0].trim();
    prefix = prefix.replace(/\s+\d+$/, '').trim();
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push([subject, stats]);
  });
  const allSingle = Object.values(groups).every(g => g.length === 1);
  if (allSingle) return { 'All Subjects': subjects };
  return groups;
}

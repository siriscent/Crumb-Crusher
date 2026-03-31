/**
 * Popup Script
 */

(async () => {
  const mainToggle = document.getElementById("mainToggle");
  const toggleLabel = document.getElementById("toggleLabel");
  const hostnameEl = document.getElementById("hostname");
  const blockBtn = document.getElementById("blockBtn");
  const pageCountEl = document.getElementById("pageCount");
  const totalCountEl = document.getElementById("totalCount");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const disabledOverlay = document.getElementById("disabledOverlay");

  // ── Get current tab ─────────────────────────────────────────────────────
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = tab ? new URL(tab.url).hostname : null;

  if (hostname) {
    hostnameEl.textContent = hostname;
  } else {
    hostnameEl.textContent = "N/A";
    blockBtn.disabled = true;
  }

  // ── Load state ──────────────────────────────────────────────────────────
  const data = await chrome.storage.sync.get(["enabled", "blocklist", "totalHandled"]);
  const enabled = data.enabled !== false;
  const blocklist = data.blocklist || [];
  const totalHandled = data.totalHandled || 0;
  const isSiteBlocked = hostname && blocklist.includes(hostname);

  // Set initial UI state
  mainToggle.checked = enabled;
  updateToggleUI(enabled);

  totalCountEl.textContent = totalHandled;

  if (isSiteBlocked) {
    blockBtn.textContent = "Unblock";
    blockBtn.classList.add("active");
  }

  // ── Page count from badge ────────────────────────────────────────────────
  if (tab?.id) {
    const badge = await chrome.action.getBadgeText({ tabId: tab.id });
    pageCountEl.textContent = badge || "0";
  }

  // ── Event: Main toggle ───────────────────────────────────────────────────
  mainToggle.addEventListener("change", () => {
    const val = mainToggle.checked;
    chrome.storage.sync.set({ enabled: val });
    updateToggleUI(val);
  });

  // ── Event: Block/Unblock site ────────────────────────────────────────────
  blockBtn.addEventListener("click", async () => {
    if (!hostname) return;
    const d = await chrome.storage.sync.get(["blocklist"]);
    let bl = d.blocklist || [];
    const isBlocked = bl.includes(hostname);

    if (isBlocked) {
      bl = bl.filter((h) => h !== hostname);
      blockBtn.textContent = "Block";
      blockBtn.classList.remove("active");
    } else {
      bl.push(hostname);
      blockBtn.textContent = "Unblock";
      blockBtn.classList.add("active");
    }

    chrome.storage.sync.set({ blocklist: bl });
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  function updateToggleUI(on) {
    toggleLabel.textContent = on ? "ON" : "OFF";
    statusDot.className = "status-dot" + (on ? "" : " off");
    statusText.textContent = on ? "Active" : "Paused";
    disabledOverlay.style.display = on ? "none" : "flex";
  }
})();

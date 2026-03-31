/**
 * Background Service Worker
 * Handles badge counter and extension state.
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ enabled: true, blocklist: [], totalHandled: 0 });
  chrome.action.setBadgeBackgroundColor({ color: "#2d7a3a" });
});

// Track how many banners handled per tab
const tabCounts = {};

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "COOKIE_HANDLED") {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    tabCounts[tabId] = (tabCounts[tabId] || 0) + 1;
    const count = tabCounts[tabId];

    chrome.action.setBadgeText({ text: String(count), tabId });

    // Increment total lifetime counter
    chrome.storage.sync.get(["totalHandled"], (data) => {
      chrome.storage.sync.set({ totalHandled: (data.totalHandled || 0) + 1 });
    });
  }
});

// Clean up tab state when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabCounts[tabId];
});

// Clear badge when navigating away
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    delete tabCounts[tabId];
    chrome.action.setBadgeText({ text: "", tabId });
  }
});

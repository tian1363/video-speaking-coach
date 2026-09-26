import { parseYouTubeVideo } from "./core.mjs";

async function syncVideo(tab) {
  if (!tab?.active) return;
  const video = parseYouTubeVideo(tab.url || "", tab.title || "");
  await chrome.storage.session.set({ selectedVideo: video });
  if (video) await chrome.storage.local.set({ lastVideo: video });
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  const video = parseYouTubeVideo(tab.url || "", tab.title || "");
  // Chrome requires sidePanel.open() to run directly from the click gesture.
  // The panel listens for the storage update if it opens before the write finishes.
  const opening = chrome.sidePanel.open({ windowId: tab.windowId });
  void chrome.storage.session.set({ selectedVideo: video }).catch(console.error);
  if (video) void chrome.storage.local.set({ lastVideo: video }).catch(console.error);
  void opening.catch(console.error);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then(syncVideo).catch(console.error);
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!tab.active || (!changeInfo.url && !changeInfo.title && changeInfo.status !== "complete")) return;
  void syncVideo(tab).catch(console.error);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void chrome.tabs.query({ active: true, windowId }).then(([tab]) => syncVideo(tab)).catch(console.error);
});

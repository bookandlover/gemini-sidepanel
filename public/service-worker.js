// service-worker.js

// Open the side panel by clicking the action toolbar icon
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Optional: specific logic when tab updates
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!tab.url) return;
    const url = new URL(tab.url);
    // Define when to enable the side panel if needed
    // For now, it's enabled everywhere by default permissions
});

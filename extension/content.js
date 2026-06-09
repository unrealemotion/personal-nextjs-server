// Expose extension presence to the page
document.documentElement.setAttribute("data-surge-extension-active", "true");

// Listen for messages from the page context
window.addEventListener("message", (event) => {
  // Ensure the message is from the page itself
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.source !== "surge-page") return;

  // Safety check for extension context invalidation (e.g. after reloading extension)
  if (!chrome.runtime || !chrome.runtime.id) {
    console.warn("Surge API Helper Extension context is invalidated. Please reload the page to reconnect.");
    window.postMessage({
      source: "surge-extension",
      requestId: data.requestId,
      payload: { success: false, error: "Extension reloaded. Please refresh the page to reconnect." }
    }, "*");
    return;
  }

  // Relay to extension background worker
  try {
    chrome.runtime.sendMessage(data.payload, (response) => {
      // Send response back to the page
      window.postMessage({
        source: "surge-extension",
        requestId: data.requestId,
        payload: response || { success: false, error: "No response from background" }
      }, "*");
    });
  } catch (err) {
    console.error("Relaying message to background worker failed:", err);
    window.postMessage({
      source: "surge-extension",
      requestId: data.requestId,
      payload: { success: false, error: err.message || "Failed to communicate with background" }
    }, "*");
  }
});

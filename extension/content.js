// Expose extension presence to the page
document.documentElement.setAttribute("data-surge-extension-active", "true");
try {
  document.documentElement.setAttribute("data-surge-extension-version", chrome.runtime.getManifest().version);
} catch (e) {
  console.warn("Failed to set extension version:", e);
}

// Map of active request IDs to resolve responses from the background script
const pendingRequests = new Map();

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
      payload: { success: false, error: "Extension reloaded. Please refresh the page to reconnect." },
      relay: true
    }, "*");
    return;
  }

  // Handle direct version check
  if (data.payload && data.payload.action === "getVersion") {
    try {
      window.postMessage({
        source: "surge-extension",
        requestId: data.requestId,
        payload: { success: true, version: chrome.runtime.getManifest().version },
        relay: true
      }, "*");
    } catch (err) {
      console.error("Failed to respond to getVersion query:", err);
      window.postMessage({
        source: "surge-extension",
        requestId: data.requestId,
        payload: { success: false, error: err.message || String(err) },
        relay: true
      }, "*");
    }
    return;
  }

  console.log("[content.js] received window message data:", data);

  // Handle fetchProxy action using tab-relayed two-way communication
  if (data.payload && data.payload.action === "fetchProxy") {
    console.log("[content.js] matched fetchProxy! requestId:", data.requestId);
    pendingRequests.set(data.requestId, data.requestId);

    try {
      chrome.runtime.sendMessage({
        source: "surge-content",
        requestId: data.requestId,
        payload: data.payload
      });
    } catch (err) {
      console.error("Relaying fetchProxy to background worker failed:", err);
      pendingRequests.delete(data.requestId);
      window.postMessage({
        source: "surge-extension",
        requestId: data.requestId,
        payload: { success: false, error: err.message || "Failed to communicate with background" },
        relay: true
      }, "*");
    }
    return;
  }

  // Relay other requests to extension background worker (with callback)
  try {
    chrome.runtime.sendMessage(data.payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[content.js] sendMessage callback error:", chrome.runtime.lastError.message);
        const isInvalidated = chrome.runtime.lastError.message.includes("invalidated");
        window.postMessage({
          source: "surge-extension",
          requestId: data.requestId,
          payload: {
            success: false,
            error: isInvalidated
              ? "Extension reloaded. Please refresh the page to reconnect."
              : chrome.runtime.lastError.message
          },
          relay: true
        }, "*");
        return;
      }
      // Send response back to the page
      window.postMessage({
        source: "surge-extension",
        requestId: data.requestId,
        payload: response || { success: false, error: "No response from background" },
        relay: true
      }, "*");
    });
  } catch (err) {
    console.error("Relaying message to background worker failed:", err);
    window.postMessage({
      source: "surge-extension",
      requestId: data.requestId,
      payload: { success: false, error: err.message || "Failed to communicate with background" },
      relay: true
    }, "*");
  }
});

// Listen for response messages from the background script
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.source === "surge-background" && pendingRequests.has(message.requestId)) {
    pendingRequests.delete(message.requestId);
    window.postMessage({
      source: "surge-extension",
      requestId: message.requestId,
      payload: message.payload,
      relay: true
    }, "*");
  }
  return false;
});

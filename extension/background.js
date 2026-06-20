function resolveLocalhost(url) {
  if (url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.toLowerCase() === "localhost") {
        urlObj.hostname = "127.0.0.1";
        return urlObj.toString();
      }
    } catch {}
  }
  return url;
}

async function performProxyFetch(url, options, contextLabel) {
  try {
    if (!url) {
      throw new Error("URL is empty or undefined.");
    }
    const res = await fetch(url, options);
    const text = await res.text();
    const headers = {};
    res.headers.forEach((val, key) => {
      headers[key] = val;
    });
    return {
      success: true,
      status: res.status,
      statusText: res.statusText,
      headers: headers,
      body: text
    };
  } catch (err) {
    console.error(`[${contextLabel}] fetch failed:`, err);
    return {
      success: false,
      error: err.message || String(err)
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "setupRequestRules") {
    const { urlFilter, headers, initiatorOrigin } = message;

    chrome.declarativeNetRequest.getSessionRules((existingRules) => {
      // Find the maximum ID currently in use to avoid ID collision after Service Worker restart
      const maxId = existingRules.reduce((max, r) => Math.max(max, r.id), 0);
      const ruleId = maxId + 1;

      const requestHeaders = [];
      if (headers && headers.length > 0) {
        headers.forEach(h => {
          // Set/overwrite custom headers (e.g., Cookie, Host)
          requestHeaders.push({ header: h.name, operation: "set", value: h.value });
        });
      }

      // Headers to bypass CORS
      const responseHeaders = [
        { header: "Access-Control-Allow-Origin", operation: "set", value: initiatorOrigin },
        { header: "Access-Control-Allow-Credentials", operation: "set", value: "true" },
        { header: "Access-Control-Allow-Methods", operation: "set", value: "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD" },
        { header: "Access-Control-Allow-Headers", operation: "set", value: "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cookie, *" }
      ];

      const condition = {
        resourceTypes: ["xmlhttprequest"]
      };

      // If urlFilter is '*' or empty, omit it so it matches all requests (safe since rule is short-lived)
      if (urlFilter && urlFilter !== "*") {
        condition.urlFilter = urlFilter;
      }

      const action = {
        type: "modifyHeaders",
        responseHeaders: responseHeaders
      };

      if (requestHeaders.length > 0) {
        action.requestHeaders = requestHeaders;
      }

      const rule = {
        id: ruleId,
        priority: 1,
        action: action,
        condition: condition
      };

      // Apply rule as session rule
      chrome.declarativeNetRequest.updateSessionRules({
        addRules: [rule],
        removeRuleIds: []
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error setting session rules:", chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          // Log active session rules for validation
          chrome.declarativeNetRequest.getSessionRules((rules) => {
            console.log("Active session rules after setup:", rules);
          });
          sendResponse({ success: true, ruleId: ruleId });
        }
      });
    });

    return true; // async reply
  }

  // Handle fetchProxy from content script (two-way message relay)
  if (message.source === "surge-content" && message.payload && message.payload.action === "fetchProxy") {
    const requestId = message.requestId;
    const tabId = sender.tab ? sender.tab.id : null;
    const url = resolveLocalhost(message.payload.url);
    const { options } = message.payload;

    console.log("[fetchProxy] URL:", url, "options:", options);

    const runFetch = async () => {
      const responsePayload = await performProxyFetch(url, options, "fetchProxy");

      // Send the response back to the specific tab that initiated the request
      if (tabId !== null) {
        try {
          chrome.tabs.sendMessage(tabId, {
            source: "surge-background",
            requestId: requestId,
            payload: responsePayload
          });
        } catch (sendErr) {
          console.error("[fetchProxy] failed to send message back to tab:", sendErr);
        }
      }
    };

    runFetch();
    return false; // No callback needed for this action
  }

  // Handle fetchProxy direct callback fallback (e.g. from old content script)
  if (message.action === "fetchProxy") {
    const url = resolveLocalhost(message.url);
    const { options } = message;

    console.log("[fetchProxy callback fallback] URL:", url, "options:", options);

    const runFetchFallback = async () => {
      const responsePayload = await performProxyFetch(url, options, "fetchProxy callback fallback");
      sendResponse(responsePayload);
    };

    runFetchFallback();
    return true; // Keep message channel open for sendResponse
  }

  if (message.action === "clearRequestRules") {
    const { ruleId } = message;

    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId]
    }, () => {
      chrome.declarativeNetRequest.getSessionRules((rules) => {
        console.log("Active session rules after cleanup:", rules);
      });
      sendResponse({ success: true });
    });

    return true;
  }
});
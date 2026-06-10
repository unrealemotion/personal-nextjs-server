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

      const condition = {};

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

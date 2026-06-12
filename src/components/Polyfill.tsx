"use client";

if (typeof window !== "undefined") {
    (function() {
        // 1. matchMedia polyfill for privacy/anti-fingerprinting browsers or environments that return undefined
        const safeMatchMedia = function(query: string) {
            return {
                matches: false,
                media: query,
                onchange: null,
                addListener: function() {},
                removeListener: function() {},
                addEventListener: function() {},
                removeEventListener: function() {},
                dispatchEvent: function() { return false; }
            };
        };

        try {
            if (!window.matchMedia) {
                window.matchMedia = safeMatchMedia as any;
            } else {
                const testResult = window.matchMedia("(prefers-color-scheme: dark)");
                if (!testResult || typeof testResult.addListener !== "function") {
                    const originalMatchMedia = window.matchMedia;
                    window.matchMedia = function(query: string) {
                        try {
                            const res = originalMatchMedia.call(window, query);
                            if (res && typeof res.addListener === "function") return res;
                        } catch (e) {}
                        return safeMatchMedia(query) as any;
                    };
                }
            }
        } catch (e) {
            window.matchMedia = safeMatchMedia as any;
        }

        // 2. Suppress Monaco Editor's internal "Canceled" promise rejections and browser extension errors
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

        window.addEventListener("error", function(event) {
            const error = event.error;
            const filename = event.filename || "";
            const message = event.message || (error && error.message) || "";
            const stack = (error && error.stack) || "";

            const isExtension =
                filename.indexOf("extension") !== -1 ||
                filename.indexOf("15bf9991-da51-4aa5-9517-f45f5a550730") !== -1 ||
                stack.indexOf("extension") !== -1 ||
                stack.indexOf("15bf9991-da51-4aa5-9517-f45f5a550730") !== -1 ||
                uuidRegex.test(filename) ||
                uuidRegex.test(stack) ||
                message.indexOf("extension") !== -1 ||
                message.indexOf("addListener") !== -1;

            if (isExtension) {
                event.preventDefault();
                event.stopImmediatePropagation();
                console.warn("Interceded and suppressed browser extension/external error:", message);
            }
        }, true);

        window.addEventListener("unhandledrejection", function(event) {
            const reason = event.reason;
            if (!reason) return;

            // Monaco Editor cancellation
            const isMonacoCancel =
                reason.name === "Canceled" ||
                reason.message === "Canceled" ||
                reason.type === "cancelation" ||
                (typeof reason === "object" && reason.message === "Canceled");

            if (isMonacoCancel) {
                event.preventDefault();
                event.stopImmediatePropagation();
                console.warn("Interceded and suppressed Monaco Canceled rejection.");
                return;
            }

            const filename = "";
            let message = "";
            let stack = "";

            if (reason instanceof Error) {
                message = reason.message || "";
                stack = reason.stack || "";
            } else if (typeof reason === "object") {
                message = reason.message || "";
                stack = reason.stack || "";
            } else if (typeof reason === "string") {
                message = reason;
            }

            const isExtension =
                filename.indexOf("extension") !== -1 ||
                filename.indexOf("15bf9991-da51-4aa5-9517-f45f5a550730") !== -1 ||
                stack.indexOf("extension") !== -1 ||
                stack.indexOf("15bf9991-da51-4aa5-9517-f45f5a550730") !== -1 ||
                uuidRegex.test(filename) ||
                uuidRegex.test(stack) ||
                message.indexOf("extension") !== -1 ||
                message.indexOf("chrome.runtime") !== -1;

            if (isExtension) {
                event.preventDefault();
                event.stopImmediatePropagation();
                console.warn("Interceded and suppressed browser extension rejection:", message);
            }
        }, true);
    })();
}

export function Polyfill() {
    return null;
}


export function sendToExtension(payload: any, timeoutMs: number = 2000): Promise<any> {
    return new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve({ success: false, error: "Not in window context" });
            return;
        }

        const requestId = Math.random().toString(36).substring(2, 15);
        
        const timeout = setTimeout(() => {
            window.removeEventListener("message", handler);
            resolve({ success: false, error: "Extension timeout" });
        }, timeoutMs);

        const handler = (event: MessageEvent) => {
            if (event.source !== window) return;
            const data = event.data;
            if (data && data.source === "surge-extension" && data.requestId === requestId) {
                // If this is a fetchProxy request, we ONLY accept messages that are verified by the new relay pattern (relay: true).
                // This prevents zombie event listeners from older content script instances (which lack this flag)
                // from immediately resolving the promise with a generic failure.
                if (payload && payload.action === "fetchProxy" && !data.relay) {
                    console.warn("[extension.ts] Ignored non-relayed response from zombie/older content script listener.");
                    return;
                }
                clearTimeout(timeout);
                window.removeEventListener("message", handler);
                resolve(data.payload);
            }
        };
        
        window.addEventListener("message", handler);
        window.postMessage({
            source: "surge-page",
            requestId,
            payload
        }, "*");
    });
}

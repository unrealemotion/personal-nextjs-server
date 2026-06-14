export function sendToExtension(payload: any, timeoutMs: number = 0, abortSignal?: AbortSignal): Promise<any> {
    return new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve({ success: false, error: "Not in window context" });
            return;
        }

        if (abortSignal?.aborted) {
            resolve({ success: false, error: "aborted" });
            return;
        }

        const requestId = Math.random().toString(36).substring(2, 15);
        
        let timeout: NodeJS.Timeout | null = null;
        if (timeoutMs > 0 && timeoutMs !== Infinity) {
            timeout = setTimeout(() => {
                cleanUp();
                resolve({ success: false, error: "Extension timeout" });
            }, timeoutMs);
        }

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
                cleanUp();
                resolve(data.payload);
            }
        };

        const onAbort = () => {
            cleanUp();
            resolve({ success: false, error: "aborted" });
        };

        const cleanUp = () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            window.removeEventListener("message", handler);
            if (abortSignal) {
                abortSignal.removeEventListener("abort", onAbort);
            }
        };

        window.addEventListener("message", handler);
        if (abortSignal) {
            abortSignal.addEventListener("abort", onAbort);
        }

        window.postMessage({
            source: "surge-page",
            requestId,
            payload
        }, "*");
    });
}

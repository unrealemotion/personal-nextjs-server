export function sendToExtension(payload: any): Promise<any> {
    return new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve({ success: false, error: "Not in window context" });
            return;
        }

        const requestId = Math.random().toString(36).substring(2, 15);
        
        const timeout = setTimeout(() => {
            window.removeEventListener("message", handler);
            resolve({ success: false, error: "Extension timeout" });
        }, 2000);

        const handler = (event: MessageEvent) => {
            if (event.source !== window) return;
            const data = event.data;
            if (data && data.source === "surge-extension" && data.requestId === requestId) {
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

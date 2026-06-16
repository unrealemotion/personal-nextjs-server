import initWasm, { parse_spreadsheet } from "../../public/wasm/surge_wasm.js";

let wasmInitialized = false;
let wasmInitPromise: Promise<boolean> | null = null;

async function ensureWasmInitialized(): Promise<boolean> {
    if (wasmInitialized) return true;
    if (wasmInitPromise) return wasmInitPromise;

    wasmInitPromise = (async () => {
        try {
            if (typeof window === "undefined" && typeof self !== "undefined" && typeof self.location !== "undefined" && "postMessage" in self) {
                // In Web Worker
                await initWasm(`${self.location.origin}/wasm/surge_wasm_bg.wasm`);
            } else if (typeof window !== "undefined") {
                // Main thread
                await initWasm("/wasm/surge_wasm_bg.wasm");
            }
            wasmInitialized = true;
            return true;
        } catch (e) {
            console.warn("WASM parser failed to initialize inside parser.worker:", e);
            return false;
        }
    })();
    return wasmInitPromise;
}

self.onmessage = async (e: MessageEvent) => {
    const { fileBytes, extension } = e.data;
    try {
        const initialized = await ensureWasmInitialized();
        if (!initialized) {
            throw new Error("Failed to initialize WASM parser module");
        }
        
        // Call the rust compiled parser
        const parsedData = parse_spreadsheet(fileBytes, extension);
        
        self.postMessage({ type: "SUCCESS", data: parsedData });
    } catch (err: any) {
        self.postMessage({ type: "ERROR", error: err?.message || String(err) });
    }
};

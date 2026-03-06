import pLimit from "p-limit";
import { store, setResults } from "./store";
import { ExecutionResult, RequestTemplate } from "./schema";

function interpolate(str: string, data: Record<string, any>): string {
    if (!str) return str;
    return str.replace(/\{\{(.+?)\}\}/g, (_, key) => {
        const value = data[key.trim()];
        return value !== undefined ? String(value) : "";
    });
}

function processBodyInterpolation(bodyString: string, data: Record<string, any>) {
    if (!bodyString) return null;
    // If the body is JSON, we interpolate as string then parse back,
    // or we just interpolate string representations.
    const interpolatedString = interpolate(bodyString, data);
    try {
        return JSON.parse(interpolatedString);
    } catch (e) {
        return interpolatedString;
    }
}

export async function runBulkExecution(
    concurrencyLimit: number,
    onProgress?: (completed: number, total: number) => void,
    singleRowIndex?: number,
    abortSignal?: AbortSignal
) {
    const state = store.state;
    const { fileData, template } = state;

    // Determine target rows
    const rowsToProcess = singleRowIndex !== undefined
        ? (fileData[singleRowIndex] ? [{ row: fileData[singleRowIndex], index: singleRowIndex }] : [])
        : fileData.map((row, index) => ({ row, index }));

    const total = rowsToProcess.length;
    let completed = 0;

    if (total === 0) return;

    // Pre-initialize results tracking as pending
    const initialResults: ExecutionResult[] = rowsToProcess.map(({ index }) => ({
        rowId: index,
        status: "pending",
        statusCode: 0,
        responseTimeMs: 0,
        requestBody: null,
        responseBody: null
    }));
    setResults(initialResults);

    const limit = pLimit(concurrencyLimit);

    const tasks = rowsToProcess.map(({ row, index }) => limit(async () => {
        if (abortSignal?.aborted) {
            // Instantly clear out pending state if it never ran
            import("./store").then(({ updateResultByRowId }) => {
                updateResultByRowId(index, { status: "error", error: "Cancelled before execution" });
            });
            completed++;
            if (onProgress) onProgress(completed, total);
            return;
        }

        let url = interpolate(template.url, row);

        if (template.params && template.params.length > 0) {
            try {
                const urlObj = new URL(url);
                template.params.forEach(p => {
                    if (p.key) {
                        urlObj.searchParams.append(p.key, interpolate(p.value, row));
                    }
                });
                url = urlObj.toString();
            } catch (e) {
                const queryString = template.params
                    .filter(p => p.key)
                    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(interpolate(p.value, row))}`)
                    .join("&");
                if (queryString) {
                    url += (url.includes('?') ? '&' : '?') + queryString;
                }
            }
        }

        const headers = new Headers();

        // Add default JSON headers if not present
        let hasContentType = false;
        template.headers.forEach(h => {
            if (h.key) {
                headers.append(h.key, interpolate(h.value, row));
                if (h.key.toLowerCase() === "content-type") hasContentType = true;
            }
        });

        const interpolatedBody = processBodyInterpolation(template.body || "", row);

        if (interpolatedBody && typeof interpolatedBody === "object" && !hasContentType) {
            headers.append("Content-Type", "application/json");
        }

        const startTime = performance.now();
        const resultPayload: Partial<ExecutionResult> = {
            requestBody: interpolatedBody,
            responseBody: null,
            status: "success"
        };

        try {
            if (!url) throw new Error("URL is empty after interpolation.");

            let fetchOpts: RequestInit = {
                method: template.method,
                headers,
                signal: abortSignal
            };

            if (template.method !== "GET" && interpolatedBody) {
                fetchOpts.body = typeof interpolatedBody === "object"
                    ? JSON.stringify(interpolatedBody)
                    : String(interpolatedBody);
            }

            const response = await fetch(url, fetchOpts);
            resultPayload.statusCode = response.status;

            if (!response.ok) {
                resultPayload.status = "error";
            }

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                resultPayload.responseBody = await response.json();
            } else {
                resultPayload.responseBody = await response.text();
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                resultPayload.status = "error";
                resultPayload.error = "Execution Cancelled by User";
            } else {
                resultPayload.status = "error";
                resultPayload.error = error.message || String(error);
            }
        } finally {
            resultPayload.responseTimeMs = Math.round(performance.now() - startTime);
        }

        import("./store").then(({ updateResultByRowId }) => {
            updateResultByRowId(index, resultPayload);
        });

        completed++;
        if (onProgress) {
            onProgress(completed, total);
        }
    }));

    await Promise.all(tasks);
}

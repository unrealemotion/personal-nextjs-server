import pLimit from "p-limit";
import { type RequestTemplate, type StepResult } from "./schema";

function interpolate(str: string, data: Record<string, any>): string {
    if (!str) return str;
    return str.replace(/\{\{(.+?)\}\}/g, (_, key) => {
        const value = data[key.trim()];
        return value !== undefined ? String(value) : "";
    });
}

function stripJsonComments(str: string): string {
    if (!str) return str;
    return str.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
}

function processBodyInterpolation(bodyString: string, data: Record<string, any>) {
    if (!bodyString || typeof bodyString !== 'string') return null;
    const strippedString = stripJsonComments(bodyString);
    const interpolatedString = interpolate(strippedString, data);
    try {
        return JSON.parse(interpolatedString);
    } catch (e) {
        return interpolatedString.trim();
    }
}

async function executeOneStep(
    template: RequestTemplate,
    row: Record<string, any>,
    abortSignal?: AbortSignal
): Promise<StepResult> {
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
    const stepResult: StepResult = {
        stepId: template.id,
        stepName: template.name,
        statusCode: 0,
        responseTimeMs: 0,
        requestBody: interpolatedBody,
        responseBody: null,
    };

    try {
        if (!url) throw new Error("URL is empty after interpolation.");

        const fetchOpts: RequestInit = {
            method: template.method,
            headers,
            signal: abortSignal,
        };

        if (template.method !== "GET" && interpolatedBody) {
            fetchOpts.body = typeof interpolatedBody === "object"
                ? JSON.stringify(interpolatedBody)
                : String(interpolatedBody);
        }

        const response = await fetch(url, fetchOpts);
        stepResult.statusCode = response.status;

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            stepResult.responseBody = await response.json();
        } else {
            stepResult.responseBody = await response.text();
        }

        if (!response.ok) {
            stepResult.error = `HTTP ${response.status}`;
        }
    } catch (error: any) {
        if (error.name === 'AbortError') {
            stepResult.error = "Execution Cancelled by User";
        } else {
            stepResult.error = error.message || String(error);
        }
    } finally {
        stepResult.responseTimeMs = Math.round(performance.now() - startTime);
    }

    return stepResult;
}

let abortController: AbortController | null = null;

self.onmessage = async (e: MessageEvent) => {
    const { type } = e.data;

    if (type === "START") {
        const { fileData, templates, concurrencyLimit, singleRowIndex } = e.data;
        abortController = new AbortController();
        const signal = abortController.signal;

        const rowsToProcess = singleRowIndex !== undefined
            ? (fileData[singleRowIndex] ? [{ row: fileData[singleRowIndex], index: singleRowIndex }] : [])
            : fileData.map((row: any, index: number) => ({ row, index }));

        const total = rowsToProcess.length;
        let completed = 0;

        if (total === 0) {
            self.postMessage({ type: "COMPLETE" });
            return;
        }

        const limit = pLimit(concurrencyLimit);

        const tasks = rowsToProcess.map(({ row, index }: any) => limit(async () => {
            if (signal.aborted) {
                return;
            }

            const steps: StepResult[] = [];
            let chainFailed = false;
            const chainStartTime = performance.now();

            for (const tmpl of templates) {
                if (signal.aborted) {
                    steps.push({
                        stepId: tmpl.id,
                        stepName: tmpl.name,
                        statusCode: 0,
                        responseTimeMs: 0,
                        requestBody: null,
                        responseBody: null,
                        error: "Cancelled",
                    });
                    chainFailed = true;
                    continue;
                }

                const stepResult = await executeOneStep(tmpl, row, signal);
                steps.push(stepResult);

                if (stepResult.error) {
                    chainFailed = true;
                }
            }

            const totalTime = Math.round(performance.now() - chainStartTime);
            const lastStep = steps[steps.length - 1];

            const resultPayload = {
                status: chainFailed ? "error" : "success",
                statusCode: lastStep?.statusCode || 0,
                responseTimeMs: totalTime,
                requestBody: steps[0]?.requestBody || null,
                responseBody: lastStep?.responseBody || null,
                steps,
                error: chainFailed ? steps.filter(s => s.error).map(s => s.error).join("; ") : undefined,
            };

            completed++;
            self.postMessage({
                type: "PROGRESS",
                index,
                resultPayload,
                completed,
                total
            });
        }));

        try {
            await Promise.all(tasks);
        } catch (err) {
            // Silence aborted errors in concurrent execution promise
        }

        self.postMessage({ type: "COMPLETE" });
    } else if (type === "ABORT") {
        if (abortController) {
            abortController.abort();
        }
    }
};

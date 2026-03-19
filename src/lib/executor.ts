import pLimit from "p-limit";
import { store, setResults } from "./store";
import { ExecutionResult, RequestTemplate, StepResult } from "./schema";
import { stripJsonComments } from "./utils";

function interpolate(str: string, data: Record<string, any>): string {
    if (!str) return str;
    return str.replace(/\{\{(.+?)\}\}/g, (_, key) => {
        const value = data[key.trim()];
        return value !== undefined ? String(value) : "";
    });
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

        let fetchOpts: RequestInit = {
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

export async function runBulkExecution(
    concurrencyLimit: number,
    onProgress?: (completed: number, total: number) => void,
    singleRowIndex?: number,
    abortSignal?: AbortSignal
) {
    const state = store.state;
    const { fileData, templates } = state;

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
        responseBody: null,
        steps: [],
    }));
    setResults(initialResults);

    const limit = pLimit(concurrencyLimit);

    const tasks = rowsToProcess.map(({ row, index }) => limit(async () => {
        if (abortSignal?.aborted) {
            return;
        }

        const steps: StepResult[] = [];
        let chainFailed = false;
        const chainStartTime = performance.now();

        // Execute each template step sequentially
        for (const tmpl of templates) {
            if (abortSignal?.aborted) {
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

            const stepResult = await executeOneStep(tmpl, row, abortSignal);
            steps.push(stepResult);

            if (stepResult.error) {
                chainFailed = true;
            }
        }

        const totalTime = Math.round(performance.now() - chainStartTime);
        const lastStep = steps[steps.length - 1];

        const resultPayload: Partial<ExecutionResult> = {
            status: chainFailed ? "error" : "success",
            statusCode: lastStep?.statusCode || 0,
            responseTimeMs: totalTime,
            requestBody: steps[0]?.requestBody || null,
            responseBody: lastStep?.responseBody || null,
            steps,
            error: chainFailed ? steps.filter(s => s.error).map(s => s.error).join("; ") : undefined,
        };

        import("./store").then(({ updateResultByRowId }) => {
            updateResultByRowId(index, resultPayload);
        });

        completed++;
        if (onProgress) {
            onProgress(completed, total);
        }
    }));

    await Promise.all(tasks);

    if (abortSignal?.aborted) {
        import("./store").then(({ store }) => {
            store.setState(state => ({
                ...state,
                results: state.results.map(r => 
                    r.status === "pending" 
                        ? { ...r, status: "error", error: "Execution Cancelled" }
                        : r
                )
            }));
        });
    }
}

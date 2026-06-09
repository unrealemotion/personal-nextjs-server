import { store, setResults, updateResultByRowId } from "./store";
import { ExecutionResult } from "./schema";
import { sendToExtension } from "./extension";

export async function runBulkExecution(
    concurrencyLimit: number,
    onProgress?: (completed: number, total: number) => void,
    singleRowIndex?: number,
    abortSignal?: AbortSignal
): Promise<void> {
    const state = store.state;
    const { fileData, templates, rowIterations = 1 } = state;

    // Determine target rows
    const rowsToProcess = singleRowIndex !== undefined
        ? (fileData[singleRowIndex] ? [{ row: fileData[singleRowIndex], index: singleRowIndex }] : [])
        : fileData.map((row, index) => ({ row, index }));

    if (rowsToProcess.length === 0) return;

    // Pre-initialize results tracking as pending for all iterations
    const initialResults: ExecutionResult[] = [];
    rowsToProcess.forEach(({ index }) => {
        for (let iter = 1; iter <= rowIterations; iter++) {
            initialResults.push({
                rowId: index,
                iteration: iter,
                status: "pending",
                statusCode: 0,
                responseTimeMs: 0,
                requestBody: null,
                responseBody: null,
                steps: [],
                timestamp: new Date().toISOString(),
                active: true,
            });
        }
    });

    if (singleRowIndex !== undefined) {
        for (let iter = 1; iter <= rowIterations; iter++) {
            updateResultByRowId(singleRowIndex, {
                status: "pending",
                statusCode: 0,
                responseTimeMs: 0,
                requestBody: null,
                responseBody: null,
                steps: [],
                error: undefined,
                timestamp: new Date().toISOString(),
                active: true,
            }, iter);
        }
    } else {
        setResults(initialResults);
    }

    // Setup helper extension rules if active
    const isExtensionActive = typeof document !== "undefined" &&
        document.documentElement.getAttribute("data-surge-extension-active") === "true";

    const extensionRuleIds: number[] = [];

    if (isExtensionActive) {
        try {
            // Reconstruct first row context
            const firstRow = fileData[0] || {};
            const activeEnv = state.environments?.find(e => e.id === state.activeEnvironmentId);
            const envVars: Record<string, string> = {};
            if (activeEnv) {
                activeEnv.variables.forEach(v => {
                    if (v.enabled) envVars[v.key] = v.value;
                });
            }
            const globalsEnv = state.environments?.find(
                e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
            );
            const globalVars: Record<string, string> = {};
            if (globalsEnv) {
                globalsEnv.variables.forEach(v => {
                    if (v.enabled) globalVars[v.key] = v.value;
                });
            }
            const collectionVars: Record<string, string> = {};
            if (state.collections) {
                state.collections.forEach(col => {
                    if (col.variables) {
                        col.variables.forEach(v => {
                            if (v.enabled !== false) collectionVars[v.key] = v.value;
                        });
                    }
                });
            }

            const context = { ...firstRow, ...collectionVars, ...globalVars, ...envVars };

            const interpolateString = (str: string) => {
                if (!str) return str;
                return str.replace(/\{\{(.+?)\}\}/g, (_, key) => {
                    const trimmedKey = key.trim();
                    const value = context[trimmedKey];
                    return value !== undefined ? String(value) : `{{${trimmedKey}}}`;
                });
            };

            // Group by hostname
            const hostnameRules: Record<string, Array<{ name: string; value: string }>> = {};

            templates.forEach(template => {
                const resolvedUrl = interpolateString(template.url);
                let hostname = "*";
                try {
                    let urlStr = resolvedUrl.trim();
                    if (!/^https?:\/\//i.test(urlStr)) {
                        urlStr = "http://" + urlStr;
                    }
                    const parsed = new URL(urlStr);
                    hostname = parsed.hostname;
                } catch (e) {}

                if (!hostnameRules[hostname]) {
                    hostnameRules[hostname] = [];
                }

                (template.headers || []).forEach(h => {
                    if (h.key) {
                        const name = interpolateString(h.key);
                        const value = interpolateString(h.value);
                        // Avoid duplicates for the same hostname
                        const existingIdx = hostnameRules[hostname].findIndex(item => item.name.toLowerCase() === name.toLowerCase());
                        if (existingIdx !== -1) {
                            hostnameRules[hostname][existingIdx] = { name, value };
                        } else {
                            hostnameRules[hostname].push({ name, value });
                        }
                    }
                });
            });

            // Register rules for all hostnames
            for (const [urlFilter, headers] of Object.entries(hostnameRules)) {
                const res = await sendToExtension({
                    action: "setupRequestRules",
                    urlFilter,
                    headers,
                    initiatorOrigin: window.location.origin
                });
                if (res && res.success) {
                    extensionRuleIds.push(res.ruleId);
                } else if (res && res.error) {
                    console.warn(`Failed to set rules for ${urlFilter}:`, res.error);
                }
            }
        } catch (e) {
            console.warn("Failed to setup extension rules in advance:", e);
        }
    }

    const clearRules = async () => {
        if (extensionRuleIds.length > 0) {
            for (const ruleId of extensionRuleIds) {
                try {
                    await sendToExtension({
                        action: "clearRequestRules",
                        ruleId
                    });
                } catch (e) {
                    console.warn("Failed to clear extension rules:", e);
                }
            }
        }
    };

    // Create the Web Worker instance
    const worker = new Worker(new URL("./executor.worker.ts", import.meta.url));

    try {
        await new Promise<void>((resolve, reject) => {
            let updateBuffer: Array<{ type: string; index: number; payload: any }> = [];
            let throttleTimeout: NodeJS.Timeout | null = null;

            const flushUpdates = () => {
                if (updateBuffer.length === 0) return;

                store.setState((state) => {
                    const newResults = [...state.results];
                    updateBuffer.forEach(({ type, index, payload }) => {
                        const { iteration } = payload;
                        const rIdx = newResults.findIndex((r) => r.rowId === index && (r.iteration ?? 1) === (iteration ?? 1));
                        if (rIdx !== -1) {
                            if (type === "PROGRESS") {
                                newResults[rIdx] = { ...newResults[rIdx], ...payload };
                            } else if (type === "STEP_PROGRESS") {
                                const { stepResult, stepIndex } = payload;
                                const currentSteps = [...(newResults[rIdx].steps || [])];
                                currentSteps[stepIndex] = stepResult;
                                newResults[rIdx] = {
                                    ...newResults[rIdx],
                                    steps: currentSteps,
                                };
                            }
                        }
                    });
                    return { ...state, results: newResults };
                });

                const lastProgress = updateBuffer.filter(u => u.type === "PROGRESS").pop();
                if (lastProgress && onProgress) {
                    const { completed, total } = lastProgress.payload;
                    onProgress(completed, total);
                }

                updateBuffer = [];
                throttleTimeout = null;
            };

            const queueUpdate = (type: string, index: number, payload: any) => {
                updateBuffer.push({ type, index, payload });
                if (!throttleTimeout) {
                    throttleTimeout = setTimeout(flushUpdates, 150);
                }
            };

            const handleAbort = () => {
                if (throttleTimeout) {
                    clearTimeout(throttleTimeout);
                }
                worker.terminate();

                // Set all pending results to "Execution Cancelled"
                store.setState(s => ({
                    ...s,
                    results: s.results.map(r =>
                        r.status === "pending"
                            ? { ...r, status: "error", error: "Execution Cancelled" }
                            : r
                    )
                }));
                resolve();
            };

            if (abortSignal?.aborted) {
                handleAbort();
                return;
            }

            abortSignal?.addEventListener("abort", handleAbort);

            worker.onmessage = (e: MessageEvent) => {
                const { type, index } = e.data;

                if (type === "PROGRESS") {
                    const { resultPayload, completed, total, iteration } = e.data;
                    queueUpdate("PROGRESS", index, { ...resultPayload, completed, total, iteration });
                } else if (type === "STEP_PROGRESS") {
                    const { stepResult, stepIndex, iteration } = e.data;
                    queueUpdate("STEP_PROGRESS", index, { stepResult, stepIndex, iteration });
                } else if (type === "COMPLETE") {
                    if (throttleTimeout) {
                        clearTimeout(throttleTimeout);
                    }
                    flushUpdates();
                    abortSignal?.removeEventListener("abort", handleAbort);
                    worker.terminate();
                    resolve();
                }
            };

            worker.onerror = (errEvent) => {
                if (throttleTimeout) {
                    clearTimeout(throttleTimeout);
                }
                flushUpdates();
                abortSignal?.removeEventListener("abort", handleAbort);
                worker.terminate();
                const errMsg = errEvent.message || "Unknown worker error";
                reject(new Error(`Worker Error: ${errMsg} (at ${errEvent.filename || 'unknown'}:${errEvent.lineno || 0})`));
            };

            // Start execution
            worker.postMessage({
                type: "START",
                fileData,
                templates,
                concurrencyLimit,
                singleRowIndex,
                maxRetries: state.maxRetries ?? 0,
                retryStatusCodes: state.retryStatusCodes || "",
                stopOnFailure: state.stopOnFailure ?? false,
                throttleDelayMs: state.throttleDelayMs ?? 0,
                rowIterations
            });
        });
    } finally {
        await clearRules();
    }
}

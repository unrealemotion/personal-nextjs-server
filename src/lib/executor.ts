import { store, setResults, updateResultByRowId } from "./store";
import { ExecutionResult } from "./schema";

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

    // Create the Web Worker instance
    const worker = new Worker(new URL("./executor.worker.ts", import.meta.url));

    return new Promise<void>((resolve, reject) => {
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
}

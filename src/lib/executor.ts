import { store, setResults, updateResultByRowId } from "./store";
import { ExecutionResult } from "./schema";

export async function runBulkExecution(
    concurrencyLimit: number,
    onProgress?: (completed: number, total: number) => void,
    singleRowIndex?: number,
    abortSignal?: AbortSignal
): Promise<void> {
    const state = store.state;
    const { fileData, templates } = state;

    // Determine target rows
    const rowsToProcess = singleRowIndex !== undefined
        ? (fileData[singleRowIndex] ? [{ row: fileData[singleRowIndex], index: singleRowIndex }] : [])
        : fileData.map((row, index) => ({ row, index }));

    if (rowsToProcess.length === 0) return;

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

    // Create the Web Worker instance
    const worker = new Worker(new URL("./executor.worker.ts", import.meta.url));

    return new Promise<void>((resolve, reject) => {
        const handleAbort = () => {
            worker.postMessage({ type: "ABORT" });
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
            const { type, index, resultPayload, completed, total } = e.data;

            if (type === "PROGRESS") {
                updateResultByRowId(index, resultPayload);
                if (onProgress) {
                    onProgress(completed, total);
                }
            } else if (type === "COMPLETE") {
                abortSignal?.removeEventListener("abort", handleAbort);
                worker.terminate();
                resolve();
            }
        };

        worker.onerror = (err) => {
            abortSignal?.removeEventListener("abort", handleAbort);
            worker.terminate();
            reject(err);
        };

        // Start execution
        worker.postMessage({
            type: "START",
            fileData,
            templates,
            concurrencyLimit,
            singleRowIndex
        });
    });
}

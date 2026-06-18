import { type RequestTemplate, type StepResult } from "./schema";
import { executeStep, populateExecutionContext, createCancelledOrSkippedStep, ensureWasmInitialized, RustExecutionContext, type ExecutionCtx } from "./executor-utils";

let isPaused = false;
const resumeListeners: (() => void)[] = [];


let abortController: AbortController | null = null;

// RPC message passing helpers
let nextRequestId = 0;
const pendingRequests = new Map<number, (val: any) => void>();

function requestFromMainThread(payload: any): Promise<any> {
    return new Promise((resolve) => {
        const reqId = nextRequestId++;
        pendingRequests.set(reqId, resolve);
        self.postMessage({
            type: "REQUEST_MAIN_THREAD",
            reqId,
            payload
        });
    });
}

const setupExtensionRulesCallback = async (url: string, headers: Record<string, string>): Promise<number | null> => {
    const res = await requestFromMainThread({
        action: "setupRequestRules",
        url,
        headers
    });
    return res && res.success ? res.ruleId : null;
};

const clearExtensionRulesCallback = async (ruleId: number): Promise<void> => {
    await requestFromMainThread({
        action: "clearRequestRules",
        ruleId
    });
};

async function executeRowSteps(
    rowCtx: ExecutionCtx,
    templates: RequestTemplate[],
    maxRetries: number,
    retryStatusCodes: string,
    stopOnFailure: boolean,
    index: number,
    iter: number,
    signal: AbortSignal,
    setupExtensionRulesCallback?: (url: string, headers: Record<string, string>) => Promise<number | null>,
    clearExtensionRulesCallback?: (ruleId: number) => Promise<void>
): Promise<{ steps: StepResult[]; chainFailed: boolean; totalTime: number }> {
    const steps: StepResult[] = [];
    let chainFailed = false;
    const chainStartTime = performance.now();
    
    const executionContext = rowCtx;

    try {
        for (const tmpl of templates) {
            if (isPaused) {
                await new Promise<void>(resolveResume => {
                    const onResume = () => {
                        resolveResume();
                    };
                    resumeListeners.push(onResume);
                });
            }
            if (signal.aborted) {
                steps.push(createCancelledOrSkippedStep(tmpl.id, tmpl.name, "Cancelled"));
                chainFailed = true;
                continue;
            }

            if (chainFailed && stopOnFailure) {
                steps.push(createCancelledOrSkippedStep(tmpl.id, tmpl.name, "Skipped (Previous Step Failed)"));
                continue;
            }

            const stepResult = await executeStep(
                tmpl,
                executionContext,
                maxRetries,
                retryStatusCodes,
                signal,
                setupExtensionRulesCallback,
                clearExtensionRulesCallback
            );
            steps.push(stepResult);

            self.postMessage({
                type: "STEP_PROGRESS",
                index,
                iteration: iter,
                stepResult,
                stepIndex: steps.length - 1
            });

            if (stepResult.error) {
                chainFailed = true;
            }

            const idx = steps.length;
            populateExecutionContext(tmpl, stepResult, idx, executionContext);
        }
    } finally {
        // Free Rust WASM memory if instantiated to prevent memory leaks
        if (executionContext.rustCtx) {
            try {
                executionContext.rustCtx.free();
            } catch (e) {
                console.warn("Error freeing RustExecutionContext:", e);
            }
        }
    }

    const totalTime = Math.round(performance.now() - chainStartTime);
    return { steps, chainFailed, totalTime };
}

function buildChainResultPayload(steps: StepResult[], totalTime: number, chainFailed: boolean) {
    const lastStep = steps[steps.length - 1];
    return {
        status: chainFailed ? "error" : "success",
        statusCode: lastStep?.statusCode || 0,
        responseTimeMs: totalTime,
        requestUrl: steps[0]?.requestUrl || null,
        requestMethod: steps[0]?.requestMethod || null,
        requestHeaders: steps[0]?.requestHeaders || null,
        requestParams: steps[0]?.requestParams || null,
        requestBody: steps[0]?.requestBody || null,
        responseBody: lastStep?.responseBody || null,
        responseHeaders: lastStep?.responseHeaders || null,
        responseType: lastStep?.responseType || null,
        responseRedirected: lastStep?.responseRedirected || null,
        responseStatusText: lastStep?.responseStatusText || null,
        ipAddress: lastStep?.ipAddress || null,
        steps,
        error: chainFailed ? steps.filter(s => s.error).map(s => s.error).join("; ") : undefined,
    };
}

self.onmessage = async (e: MessageEvent) => {
    const { type } = e.data;

    if (type === "START") {
        const { taskItems, total, initialCompleted, templates, concurrencyLimit, singleRowIndex, maxRetries, retryStatusCodes, stopOnFailure, throttleDelayMs } = e.data;
        isPaused = false;
        resumeListeners.length = 0;
        abortController = new AbortController();
        const signal = abortController.signal;

        const hasWasm = await ensureWasmInitialized();

        let completed = initialCompleted || 0;

        if (taskItems.length === 0) {
            self.postMessage({ type: "COMPLETE" });
            return;
        }

        let nextTaskIndex = 0;
        let nextAvailableStartTime = Date.now();

        const runWorker = async () => {
            while (nextTaskIndex < taskItems.length) {
                if (signal.aborted) {
                    break;
                }

                const task = taskItems[nextTaskIndex++];
                if (!task) break;

                const { row, index, iter } = task;

                // Throttling / Rate Limiting (Token Bucket)
                if (throttleDelayMs > 0 && singleRowIndex === undefined) {
                    const now = Date.now();
                    const startTime = Math.max(now, nextAvailableStartTime);
                    nextAvailableStartTime = startTime + throttleDelayMs;

                    const delay = startTime - now;
                    if (delay > 0) {
                        let timerResolve: () => void;
                        const timerPromise = new Promise<void>(resolve => {
                            timerResolve = resolve;
                        });
                        const timeoutId = setTimeout(timerResolve!, delay);

                        const onAbort = () => {
                            clearTimeout(timeoutId);
                            timerResolve!();
                        };
                        signal.addEventListener("abort", onAbort);

                        await timerPromise;

                        signal.removeEventListener("abort", onAbort);
                        if (signal.aborted) {
                            break;
                        }
                    }
                }

                // Check paused state
                if (isPaused) {
                    await new Promise<void>(resolveResume => {
                        const onResume = () => {
                            resolveResume();
                        };
                        resumeListeners.push(onResume);
                    });
                }

                if (signal.aborted) {
                    break;
                }

                const executionContext: ExecutionCtx = {
                    jsCtx: { ...row }
                };
                if (hasWasm) {
                    try {
                        const rustCtx = new RustExecutionContext();
                        rustCtx.insert_val_flat("", row);
                        executionContext.rustCtx = rustCtx;
                    } catch (e) {
                        console.warn("Failed to create RustExecutionContext inside worker:", e);
                    }
                }

                const { steps, chainFailed, totalTime } = await executeRowSteps(
                    executionContext,
                    templates,
                    maxRetries,
                    retryStatusCodes,
                    stopOnFailure,
                    index,
                    iter,
                    signal,
                    setupExtensionRulesCallback,
                    clearExtensionRulesCallback
                );

                const resultPayload = buildChainResultPayload(steps, totalTime, chainFailed);

                completed++;
                self.postMessage({
                    type: "PROGRESS",
                    index,
                    iteration: iter,
                    resultPayload,
                    completed,
                    total
                });
            }
        };

        const workerPromises: Array<Promise<void>> = [];
        const actualConcurrency = Math.min(concurrencyLimit, taskItems.length);
        for (let c = 0; c < actualConcurrency; c++) {
            workerPromises.push(runWorker());
        }

        try {
            await Promise.all(workerPromises);
        } catch {
            // Silence errors
        }

        self.postMessage({ type: "COMPLETE" });
    } else if (type === "ABORT") {
        if (abortController) {
            abortController.abort();
        }
    } else if (type === "PAUSE") {
        isPaused = true;
    } else if (type === "RESUME") {
        if (isPaused) {
            isPaused = false;
            const listeners = [...resumeListeners];
            resumeListeners.length = 0;
            listeners.forEach(listener => listener());
        }
    } else if (type === "RESPONSE_MAIN_THREAD") {
        const { reqId, response } = e.data;
        const resolve = pendingRequests.get(reqId);
        if (resolve) {
            pendingRequests.delete(reqId);
            resolve(response);
        }
    }
};

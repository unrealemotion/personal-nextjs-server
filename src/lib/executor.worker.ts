import { type RequestTemplate, type StepResult } from "./schema";
import { resolveHostnameIp } from "./dns";
import { executeStep, populateExecutionContext, createCancelledOrSkippedStep } from "./executor-utils";

let isPaused = false;
const resumeListeners: (() => void)[] = [];

function pLimit(concurrency: number) {
    const queue: Array<() => Promise<any>> = [];
    let activeCount = 0;

    const next = () => {
        if (isPaused) {
            const onResume = () => {
                next();
            };
            resumeListeners.push(onResume);
            return;
        }
        if (activeCount < concurrency && queue.length > 0) {
            activeCount++;
            const fn = queue.shift()!;
            fn().finally(() => {
                activeCount--;
                next();
            });
        }
    };

    return <T>(fn: () => Promise<T>): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
            queue.push(async () => {
                try {
                    const res = await fn();
                    resolve(res);
                } catch (err) {
                    reject(err);
                }
            });
            next();
        });
    };
}



let abortController: AbortController | null = null;

async function executeRowSteps(
    row: any,
    templates: RequestTemplate[],
    maxRetries: number,
    retryStatusCodes: string,
    stopOnFailure: boolean,
    index: number,
    iter: number,
    signal: AbortSignal
): Promise<{ steps: StepResult[]; chainFailed: boolean; totalTime: number }> {
    const steps: StepResult[] = [];
    let chainFailed = false;
    const chainStartTime = performance.now();
    
    const executionContext = { ...row };

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

        const stepResult = await executeStep(tmpl, executionContext, maxRetries, retryStatusCodes, signal);
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
        const { fileData, templates, concurrencyLimit, singleRowIndex, maxRetries, retryStatusCodes, stopOnFailure, throttleDelayMs, rowIterations = 1 } = e.data;
        isPaused = false;
        resumeListeners.length = 0;
        abortController = new AbortController();
        const signal = abortController.signal;

        const rowsToProcess = singleRowIndex !== undefined
            ? (fileData[singleRowIndex] ? [{ row: fileData[singleRowIndex], index: singleRowIndex }] : [])
            : fileData.map((row: any, index: number) => ({ row, index }));

        const total = rowsToProcess.length * rowIterations;
        let completed = 0;

        if (total === 0) {
            self.postMessage({ type: "COMPLETE" });
            return;
        }

        const limit = pLimit(concurrencyLimit);

        const tasks: Array<Promise<void>> = [];
        rowsToProcess.forEach(({ row, index }: any) => {
            for (let iter = 1; iter <= rowIterations; iter++) {
                const flatIdx = index * rowIterations + iter - 1;
                const runTask = async () => {
                    if (signal.aborted) {
                        return;
                    }
                    if (throttleDelayMs > 0 && singleRowIndex === undefined) {
                        await new Promise(resolve => setTimeout(resolve, flatIdx * throttleDelayMs));
                    }
                    if (signal.aborted) {
                        return;
                    }
                    await limit(async () => {
                        if (signal.aborted) {
                            return;
                        }

                        const { steps, chainFailed, totalTime } = await executeRowSteps(
                            row,
                            templates,
                            maxRetries,
                            retryStatusCodes,
                            stopOnFailure,
                            index,
                            iter,
                            signal
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
                    });
                };
                tasks.push(runTask());
            }
        });

        try {
            await Promise.all(tasks);
        } catch {
            // Silence aborted errors in concurrent execution promise
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
    }
};

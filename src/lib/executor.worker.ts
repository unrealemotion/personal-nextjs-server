import { type RequestTemplate, type StepResult } from "./schema";
import { resolveHostnameIp } from "./dns";
import {
    interpolate,
    stripJsonComments,
    processBodyInterpolation,
    isStatusInRanges,
    flattenObject
} from "./executor-utils";

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

function prepareFetchBody(
    template: RequestTemplate,
    row: Record<string, any>,
    headers: Headers,
    requestHeaders: Record<string, string>,
    hasContentType: boolean
): { fetchBody: any; requestBodyForLog: any } {
    let fetchBody: any = null;
    let requestBodyForLog: any = null;
    let updatedHasContentType = hasContentType;

    if (template.body && template.method !== "GET" && (template.method as string) !== "HEAD") {
        if (typeof template.body === "string") {
            const parsed = processBodyInterpolation(template.body, row);
            fetchBody = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
            requestBodyForLog = parsed;
            if (parsed && typeof parsed === "object" && !updatedHasContentType) {
                headers.append("Content-Type", "application/json");
                requestHeaders["Content-Type"] = "application/json";
                updatedHasContentType = true;
            }
        } else {
            const mode = template.body.mode || "none";
            if (mode === "raw" && template.body.raw) {
                const rawBody = interpolate(template.body.raw, row);
                fetchBody = rawBody;
                requestBodyForLog = rawBody;

                const lang = template.body.rawLanguage || "json";
                let contentType = "application/json";
                if (lang === "text") contentType = "text/plain";
                else if (lang === "javascript") contentType = "application/javascript";
                else if (lang === "html") contentType = "text/html";
                else if (lang === "xml") contentType = "application/xml";

                if (!updatedHasContentType) {
                    headers.append("Content-Type", contentType);
                    requestHeaders["Content-Type"] = contentType;
                    updatedHasContentType = true;
                }

                if (lang === "json") {
                    const cleanJson = stripJsonComments(rawBody);
                    fetchBody = cleanJson;
                    try {
                        requestBodyForLog = JSON.parse(cleanJson);
                    } catch {}
                }
            } else if (mode === "graphql" && template.body.graphql) {
                const query = interpolate(template.body.graphql.query || "", row);
                const varsStr = interpolate(template.body.graphql.variables || "{}", row);
                let variables = {};
                try {
                    variables = JSON.parse(stripJsonComments(varsStr));
                } catch {}
                const gBody = JSON.stringify({ query, variables });
                fetchBody = gBody;
                requestBodyForLog = { query, variables };

                if (!updatedHasContentType) {
                    headers.append("Content-Type", "application/json");
                    requestHeaders["Content-Type"] = "application/json";
                    updatedHasContentType = true;
                }
            } else if (mode === "urlencoded" && template.body.urlencoded) {
                const formParams = new URLSearchParams();
                const logObj: Record<string, string> = {};
                template.body.urlencoded.forEach((p: any) => {
                    if (p.enabled !== false && p.key) {
                        const rKey = interpolate(p.key, row);
                        const rVal = interpolate(p.value, row);
                        formParams.append(rKey, rVal);
                        logObj[rKey] = rVal;
                    }
                });
                fetchBody = formParams.toString();
                requestBodyForLog = logObj;

                if (!updatedHasContentType) {
                    headers.append("Content-Type", "application/x-www-form-urlencoded");
                    requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
                    updatedHasContentType = true;
                }
            } else if (mode === "formdata" && template.body.formdata) {
                const fd = new FormData();
                const logObj: Record<string, string> = {};
                template.body.formdata.forEach((p: any) => {
                    if (p.enabled !== false && p.key) {
                        const rKey = interpolate(p.key, row);
                        const rVal = interpolate(p.value, row);
                        fd.append(rKey, rVal);
                        logObj[rKey] = rVal;
                    }
                });
                fetchBody = fd;
                requestBodyForLog = logObj;
            } else if (mode === "binary" && template.body.binary) {
                const binaryBody = interpolate(template.body.binary, row);
                fetchBody = binaryBody;
                requestBodyForLog = "<Binary Data>";

                if (!updatedHasContentType) {
                    headers.append("Content-Type", "application/octet-stream");
                    requestHeaders["Content-Type"] = "application/octet-stream";
                    updatedHasContentType = true;
                }
            }
        }
    }

    return { fetchBody, requestBodyForLog };
}

function populateExecutionContext(
    tmpl: RequestTemplate,
    stepResult: StepResult,
    idx: number,
    executionContext: Record<string, any>
) {
    const cleanName = tmpl.name.trim();

    const storeFields = (prefix: string) => {
        executionContext[`${prefix}.status`] = stepResult.statusCode;
        executionContext[`${prefix}.response_time`] = stepResult.responseTimeMs;
        if (stepResult.error) {
            executionContext[`${prefix}.error`] = stepResult.error;
        }
        if (stepResult.responseBody !== undefined && stepResult.responseBody !== null) {
            flattenObject(stepResult.responseBody, `${prefix}.response`, executionContext);
        }
        if (stepResult.requestBody !== undefined && stepResult.requestBody !== null) {
            flattenObject(stepResult.requestBody, `${prefix}.request.body`, executionContext);
        }
        if (stepResult.requestParams) {
            Object.entries(stepResult.requestParams).forEach(([k, v]) => {
                executionContext[`${prefix}.request.params.${k}`] = v;
            });
        }
        if (stepResult.requestHeaders) {
            Object.entries(stepResult.requestHeaders).forEach(([k, v]) => {
                executionContext[`${prefix}.request.headers.${k}`] = v;
            });
        }
        if (stepResult.responseHeaders) {
            Object.entries(stepResult.responseHeaders).forEach(([k, v]) => {
                executionContext[`${prefix}.response.headers.${k}`] = v;
            });
        }
    };

    storeFields(`Step ${idx}`);
    if (cleanName) {
        storeFields(cleanName);
    }
}

async function executeOneStep(
    template: RequestTemplate,
    row: Record<string, any>,
    maxRetries: number,
    retryStatusCodes: string,
    abortSignal?: AbortSignal
): Promise<StepResult> {
    let url = interpolate(template.url, row);

    const requestParams: Record<string, string> = {};
    if (template.params && template.params.length > 0) {
        template.params.forEach(p => {
            if (p.key) {
                const rKey = interpolate(p.key, row);
                requestParams[rKey] = interpolate(p.value, row);
            }
        });

        try {
            const urlObj = new URL(url);
            template.params.forEach(p => {
                if (p.key) {
                    const rKey = interpolate(p.key, row);
                    urlObj.searchParams.append(rKey, requestParams[rKey]);
                }
            });
            url = urlObj.toString();
        } catch {
            const queryString = template.params
                .filter(p => p.key)
                .map(p => {
                    const rKey = interpolate(p.key, row);
                    return `${encodeURIComponent(rKey)}=${encodeURIComponent(requestParams[rKey])}`;
                })
                .join("&");
            if (queryString) {
                url += (url.includes('?') ? '&' : '?') + queryString;
            }
        }
    }

    // Parse all query parameters from the final url (including raw ones in the URL string)
    try {
        const urlObj = new URL(url);
        urlObj.searchParams.forEach((val, key) => {
            requestParams[key] = val;
        });
    } catch {
        const qIndex = url.indexOf('?');
        if (qIndex !== -1) {
            const search = url.slice(qIndex + 1);
            const pairs = search.split('&');
            pairs.forEach(pair => {
                const [k, v] = pair.split('=');
                if (k) {
                    try {
                        requestParams[decodeURIComponent(k)] = decodeURIComponent(v || '');
                    } catch {
                        requestParams[k] = v || '';
                    }
                }
            });
        }
    }

    const headers = new Headers();
    const requestHeaders: Record<string, string> = {};
    let hasContentType = false;
    template.headers.forEach(h => {
        if (h.key) {
            const rKey = interpolate(h.key, row);
            const val = interpolate(h.value, row);
            headers.append(rKey, val);
            requestHeaders[rKey] = val;
            if (rKey.toLowerCase() === "content-type") hasContentType = true;
        }
    });

    const { fetchBody, requestBodyForLog } = prepareFetchBody(template, row, headers, requestHeaders, hasContentType);

    const retryRanges = retryStatusCodes || "";
    let attempts = 0;
    const stepResult: StepResult = {
        stepId: template.id,
        stepName: template.name,
        statusCode: 0,
        responseTimeMs: 0,
        requestUrl: url,
        requestMethod: template.method,
        requestHeaders,
        requestParams,
        requestBody: requestBodyForLog,
        responseBody: null,
    };

    while (true) {
        const startTime = performance.now();
        stepResult.statusCode = 0;
        stepResult.responseBody = null;
        stepResult.error = undefined;

        try {
            if (!url) throw new Error("URL is empty after interpolation.");

            const fetchOpts: RequestInit = {
                method: template.method,
                headers,
                signal: abortSignal,
            };

            if (template.method !== "GET" && fetchBody !== null && fetchBody !== undefined) {
                fetchOpts.body = fetchBody;
            }

            const response = await fetch(url, fetchOpts);
            stepResult.statusCode = response.status;
            stepResult.responseType = response.type;
            stepResult.responseRedirected = response.redirected;
            stepResult.responseStatusText = response.statusText;

            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((val, key) => {
                responseHeaders[key] = val;
            });
            stepResult.responseHeaders = responseHeaders;

            try {
                stepResult.ipAddress = await resolveHostnameIp(url);
            } catch {
                // ignore
            }

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

        if (
            abortSignal?.aborted || 
            attempts >= maxRetries || 
            !isStatusInRanges(stepResult.statusCode, retryRanges)
        ) {
            break;
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    return stepResult;
}

let abortController: AbortController | null = null;

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

                        const steps: StepResult[] = [];
                        let chainFailed = false;
                        const chainStartTime = performance.now();
                        
                        // Build dynamic context for step-to-step variable interpolation
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

                            // Stop chain on step failure if configured
                            if (chainFailed && stopOnFailure) {
                                steps.push({
                                    stepId: tmpl.id,
                                    stepName: tmpl.name,
                                    statusCode: 0,
                                    responseTimeMs: 0,
                                    requestBody: null,
                                    responseBody: null,
                                    error: "Skipped (Previous Step Failed)",
                                });
                                continue;
                            }

                            const stepResult = await executeOneStep(tmpl, executionContext, maxRetries, retryStatusCodes, signal);
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

                            // Populate executionContext with step outputs for variables usage
                            const idx = steps.length; // 1-based step order
                            populateExecutionContext(tmpl, stepResult, idx, executionContext);
                        }

                        const totalTime = Math.round(performance.now() - chainStartTime);
                        const lastStep = steps[steps.length - 1];

                        const resultPayload = {
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

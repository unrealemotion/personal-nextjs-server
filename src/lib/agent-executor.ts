import { type RequestTemplate, type StepResult } from "./schema";
import { sendToExtension } from "./extension";
import { resolveHostnameIp } from "./dns";
import {
    interpolate,
    stripJsonComments,
    processBodyInterpolation,
    isStatusInRanges,
    flattenObject
} from "./executor-utils";

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

async function executeSimulatedStep(
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

    // If extension is active, we setup extension rules for CORS bypass and headers injection
    const isExtensionActive = typeof document !== "undefined" &&
        document.documentElement.getAttribute("data-surge-extension-active") === "true";
    let extensionRuleId: number | null = null;

    if (isExtensionActive) {
        try {
            let hostname = "*";
            try {
                let urlStr = url.trim();
                if (!/^https?:\/\//i.test(urlStr)) {
                    urlStr = "http://" + urlStr;
                }
                const parsed = new URL(urlStr);
                hostname = parsed.hostname;
            } catch {}

            const headersToRegister: Array<{ name: string; value: string }> = [];
            Object.entries(requestHeaders).forEach(([name, value]) => {
                headersToRegister.push({ name, value });
            });

            const res = await sendToExtension({
                action: "setupRequestRules",
                urlFilter: hostname,
                headers: headersToRegister,
                initiatorOrigin: window.location.origin
            });
            if (res && res.success) {
                extensionRuleId = res.ruleId;
            }
        } catch (e) {
            console.warn("Agent simulation failed to setup extension rules:", e);
        }
    }

    try {
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
                } catch {}

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
    } finally {
        if (extensionRuleId !== null) {
            try {
                await sendToExtension({
                    action: "clearRequestRules",
                    ruleId: extensionRuleId
                });
            } catch (e) {
                console.warn("Agent simulation failed to clear extension rules:", e);
            }
        }
    }

    return stepResult;
}

export async function simulateRowExecutionChain(
    row: Record<string, any>,
    templates: RequestTemplate[],
    maxRetries: number = 0,
    retryStatusCodes: string = "",
    stopOnFailure: boolean = false,
    abortSignal?: AbortSignal
): Promise<StepResult[]> {
    const steps: StepResult[] = [];
    const executionContext = { ...row };
    let chainFailed = false;

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
            continue;
        }

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

        const stepResult = await executeSimulatedStep(tmpl, executionContext, maxRetries, retryStatusCodes, abortSignal);
        steps.push(stepResult);

        if (stepResult.error) {
            chainFailed = true;
        }

        // Populate executionContext with step outputs
        const idx = steps.length;
        populateExecutionContext(tmpl, stepResult, idx, executionContext);
    }

    return steps;
}

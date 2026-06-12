import { type RequestTemplate, type StepResult } from "./schema";
import { sendToExtension } from "./extension";

function normalizeKey(key: string): string {
    let k = key.trim();
    if (k.startsWith("{{") && k.endsWith("}}")) {
        k = k.slice(2, -2).trim();
    }
    return k;
}

function interpolate(str: string, data: Record<string, any>): string {
    if (!str) return str;
    return str.replace(/\{\{(.+?)\}\}/g, (_, key) => {
        const targetNorm = normalizeKey(key);
        const matchedKey = Object.keys(data).find(k => normalizeKey(k) === targetNorm);
        if (matchedKey !== undefined) {
            const value = data[matchedKey];
            return value !== undefined ? String(value) : "";
        }
        return "";
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

function isStatusInRanges(status: number, rangesStr: string): boolean {
    if (!rangesStr || !rangesStr.trim()) return false;
    const parts = rangesStr.split(",");
    for (let part of parts) {
        part = part.trim();
        if (!part) continue;
        if (part.includes("-")) {
            const [startStr, endStr] = part.split("-");
            const start = parseInt(startStr.trim());
            const end = parseInt(endStr.trim());
            if (!isNaN(start) && !isNaN(end) && status >= start && status <= end) {
                return true;
            }
        } else {
            const val = parseInt(part);
            if (!isNaN(val) && status === val) {
                return true;
            }
        }
    }
    return false;
}

async function resolveHostnameIp(urlStr: string): Promise<string | null> {
    try {
        const urlObj = new URL(urlStr);
        const hostname = urlObj.hostname;
        if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname === "localhost" || hostname.endsWith(".local")) {
            return null;
        }
        const dnsUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
        const res = await fetch(dnsUrl, {
            headers: { "accept": "application/dns-json" }
        });
        if (res.ok) {
            const dnsData = await res.json();
            if (dnsData.Answer && dnsData.Answer.length > 0) {
                const aRecord = dnsData.Answer.find((ans: any) => ans.type === 1);
                if (aRecord) {
                    return aRecord.data;
                }
            }
        }
    } catch (e) {
        // silence
    }
    return null;
}

function flattenObject(obj: any, prefix: string, res: Record<string, any> = {}): Record<string, any> {
    if (obj === null || obj === undefined) {
        res[prefix] = "";
        return res;
    }
    if (typeof obj !== "object") {
        res[prefix] = obj;
        return res;
    }

    res[prefix] = JSON.stringify(obj);

    if (Array.isArray(obj)) {
        obj.forEach((val, i) => {
            flattenObject(val, `${prefix}.${i}`, res);
        });
    } else {
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            flattenObject(obj[key], `${prefix}.${key}`, res);
        }
    }
    return res;
}

export async function executeSimulatedStep(
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
        } catch (e) {
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
    } catch (e) {
        const qIndex = url.indexOf('?');
        if (qIndex !== -1) {
            const search = url.slice(qIndex + 1);
            const pairs = search.split('&');
            pairs.forEach(pair => {
                const [k, v] = pair.split('=');
                if (k) {
                    try {
                        requestParams[decodeURIComponent(k)] = decodeURIComponent(v || '');
                    } catch (err) {
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

    let fetchBody: any = null;
    let requestBodyForLog: any = null;

    if (template.body && template.method !== "GET" && (template.method as string) !== "HEAD") {
        if (typeof template.body === "string") {
            const parsed = processBodyInterpolation(template.body, row);
            fetchBody = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
            requestBodyForLog = parsed;
            if (parsed && typeof parsed === "object" && !hasContentType) {
                headers.append("Content-Type", "application/json");
                requestHeaders["Content-Type"] = "application/json";
                hasContentType = true;
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

                if (!hasContentType) {
                    headers.append("Content-Type", contentType);
                    requestHeaders["Content-Type"] = contentType;
                    hasContentType = true;
                }

                if (lang === "json") {
                    const cleanJson = stripJsonComments(rawBody);
                    fetchBody = cleanJson;
                    try {
                        requestBodyForLog = JSON.parse(cleanJson);
                    } catch (e) {}
                }
            } else if (mode === "graphql" && template.body.graphql) {
                const query = interpolate(template.body.graphql.query || "", row);
                const varsStr = interpolate(template.body.graphql.variables || "{}", row);
                let variables = {};
                try {
                    variables = JSON.parse(stripJsonComments(varsStr));
                } catch (e) {}
                const gBody = JSON.stringify({ query, variables });
                fetchBody = gBody;
                requestBodyForLog = { query, variables };

                if (!hasContentType) {
                    headers.append("Content-Type", "application/json");
                    requestHeaders["Content-Type"] = "application/json";
                    hasContentType = true;
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

                if (!hasContentType) {
                    headers.append("Content-Type", "application/x-www-form-urlencoded");
                    requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
                    hasContentType = true;
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

                if (!hasContentType) {
                    headers.append("Content-Type", "application/octet-stream");
                    requestHeaders["Content-Type"] = "application/octet-stream";
                    hasContentType = true;
                }
            }
        }
    }

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
            } catch (e) {}

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
                } catch (e) {}

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
        const cleanName = tmpl.name.trim();

        // 1. Index-based paths
        executionContext[`Step ${idx}.status`] = stepResult.statusCode;
        executionContext[`Step ${idx}.response_time`] = stepResult.responseTimeMs;
        if (stepResult.error) {
            executionContext[`Step ${idx}.error`] = stepResult.error;
        }
        if (stepResult.responseBody !== undefined && stepResult.responseBody !== null) {
            flattenObject(stepResult.responseBody, `Step ${idx}.response`, executionContext);
        }
        if (stepResult.requestBody !== undefined && stepResult.requestBody !== null) {
            flattenObject(stepResult.requestBody, `Step ${idx}.request.body`, executionContext);
        }
        if (stepResult.requestParams) {
            Object.keys(stepResult.requestParams).forEach(k => {
                executionContext[`Step ${idx}.request.params.${k}`] = stepResult.requestParams![k];
            });
        }
        if (stepResult.requestHeaders) {
            Object.keys(stepResult.requestHeaders).forEach(k => {
                executionContext[`Step ${idx}.request.headers.${k}`] = stepResult.requestHeaders![k];
            });
        }
        if (stepResult.responseHeaders) {
            Object.keys(stepResult.responseHeaders).forEach(k => {
                executionContext[`Step ${idx}.response.headers.${k}`] = stepResult.responseHeaders![k];
            });
        }

        // 2. Name-based paths
        if (cleanName) {
            executionContext[`${cleanName}.status`] = stepResult.statusCode;
            executionContext[`${cleanName}.response_time`] = stepResult.responseTimeMs;
            if (stepResult.error) {
                executionContext[`${cleanName}.error`] = stepResult.error;
            }
            if (stepResult.responseBody !== undefined && stepResult.responseBody !== null) {
                flattenObject(stepResult.responseBody, `${cleanName}.response`, executionContext);
            }
            if (stepResult.requestBody !== undefined && stepResult.requestBody !== null) {
                flattenObject(stepResult.requestBody, `${cleanName}.request.body`, executionContext);
            }
            if (stepResult.requestParams) {
                Object.keys(stepResult.requestParams).forEach(k => {
                    executionContext[`${cleanName}.request.params.${k}`] = stepResult.requestParams![k];
                });
            }
            if (stepResult.requestHeaders) {
                Object.keys(stepResult.requestHeaders).forEach(k => {
                    executionContext[`${cleanName}.request.headers.${k}`] = stepResult.requestHeaders![k];
                });
            }
            if (stepResult.responseHeaders) {
                Object.keys(stepResult.responseHeaders).forEach(k => {
                    executionContext[`${cleanName}.response.headers.${k}`] = stepResult.responseHeaders![k];
                });
            }
        }
    }

    return steps;
}

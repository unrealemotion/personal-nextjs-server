import { store } from "./store";
import { runPreRequestScript, runTestScript, resolveVariables } from "./sandbox";
import { setupExtensionRules, clearExtensionRules, sendToExtension } from "./extension";
import { stripJsonComments } from "./executor-utils";
import { type ApiRequest, type KeyValuePair, type ApiCollection, type Environment } from "./schema";
import { findParentCollection, getRawLanguageContentType } from "./utils";

export interface RequestResponse {
    status: number;
    statusText: string;
    timeMs: number;
    sizeBytes: number;
    body: string;
    headers: Record<string, string>;
    testResults?: any[];
}

function gatherVariables(requestId: string | null | undefined, collections: ApiCollection[]): KeyValuePair[] {
    let collectionVars: KeyValuePair[] = [];
    if (requestId) {
        const parentCol = findParentCollection(collections, requestId);
        if (parentCol && parentCol.variables) {
            collectionVars = parentCol.variables;
        }
    }
    return collectionVars;
}

function executePreRequestScripts(
    script: string | undefined,
    environments: Environment[],
    activeEnvironmentId: string | null,
    collectionVars: KeyValuePair[]
): { finalEnvironments: Environment[]; addedHeaders: { key: string; value: string }[] } {
    let finalEnvironments = environments;
    let addedHeaders: { key: string; value: string }[] = [];

    if (script) {
        const scriptRes = runPreRequestScript(
            script,
            environments,
            activeEnvironmentId,
            collectionVars
        );
        finalEnvironments = scriptRes.updatedEnvironments;
        addedHeaders = scriptRes.addedHeaders;

        store.setState(s => ({ ...s, environments: finalEnvironments }));
    }
    return { finalEnvironments, addedHeaders };
}

function buildHeaders(
    requestHeaders: KeyValuePair[] | undefined,
    addedHeaders: { key: string; value: string }[],
    finalEnvironments: Environment[],
    activeEnvironmentId: string | null,
    collectionVars: KeyValuePair[]
): { headers: Headers; rawHeadersMap: Record<string, string> } {
    const headers = new Headers();
    const rawHeadersMap: Record<string, string> = {};

    (requestHeaders || []).forEach(h => {
        if (h.enabled !== false && h.key) {
            const resolvedKey = resolveVariables(h.key, finalEnvironments, activeEnvironmentId, collectionVars);
            const resolvedVal = resolveVariables(h.value, finalEnvironments, activeEnvironmentId, collectionVars);
            headers.append(resolvedKey, resolvedVal);
            rawHeadersMap[resolvedKey] = resolvedVal;
        }
    });

    addedHeaders.forEach(h => {
        headers.append(h.key, h.value);
        rawHeadersMap[h.key] = h.value;
    });

    return { headers, rawHeadersMap };
}

function buildRequestBody(
    body: ApiRequest["body"],
    method: string,
    finalEnvironments: Environment[],
    activeEnvironmentId: string | null,
    collectionVars: KeyValuePair[],
    headers: Headers,
    rawHeadersMap: Record<string, string>
): any {
    let fetchBody: any = null;
    const mode = body?.mode || "none";

    if (method !== "GET" && method !== "HEAD") {
        if (mode === "raw" && body?.raw) {
            const rawBodyResolved = resolveVariables(body.raw, finalEnvironments, activeEnvironmentId, collectionVars);
            const lang = body.rawLanguage || "json";
            if (lang === "json") {
                fetchBody = stripJsonComments(rawBodyResolved);
            } else {
                fetchBody = rawBodyResolved;
            }
            const contentType = getRawLanguageContentType(lang);

            if (!headers.has("Content-Type")) {
                headers.append("Content-Type", contentType);
                rawHeadersMap["Content-Type"] = contentType;
            }
        } else if (mode === "graphql" && body?.graphql) {
            const query = resolveVariables(body.graphql.query || "", finalEnvironments, activeEnvironmentId, collectionVars);
            const varsStr = resolveVariables(body.graphql.variables || "{}", finalEnvironments, activeEnvironmentId, collectionVars);
            let variables = {};
            try {
                variables = JSON.parse(stripJsonComments(varsStr));
            } catch {}
            fetchBody = JSON.stringify({ query, variables });
            if (!headers.has("Content-Type")) {
                headers.append("Content-Type", "application/json");
                rawHeadersMap["Content-Type"] = "application/json";
            }
        } else if (mode === "urlencoded" && body?.urlencoded) {
            const formParams = new URLSearchParams();
            body.urlencoded.forEach(p => {
                if (p.enabled !== false && p.key) {
                    const rKey = resolveVariables(p.key, finalEnvironments, activeEnvironmentId, collectionVars);
                    const rVal = resolveVariables(p.value, finalEnvironments, activeEnvironmentId, collectionVars);
                    formParams.append(rKey, rVal);
                }
            });
            fetchBody = formParams.toString();
            if (!headers.has("Content-Type")) {
                headers.append("Content-Type", "application/x-www-form-urlencoded");
                rawHeadersMap["Content-Type"] = "application/x-www-form-urlencoded";
            }
        } else if (mode === "formdata" && body?.formdata) {
            const fd = new FormData();
            body.formdata.forEach(p => {
                if (p.enabled !== false && p.key) {
                    const rKey = resolveVariables(p.key, finalEnvironments, activeEnvironmentId, collectionVars);
                    const rVal = resolveVariables(p.value, finalEnvironments, activeEnvironmentId, collectionVars);
                    fd.append(rKey, rVal);
                }
            });
            fetchBody = fd;
        } else if (mode === "binary" && body?.binary) {
            fetchBody = resolveVariables(body.binary, finalEnvironments, activeEnvironmentId, collectionVars);
            if (!headers.has("Content-Type")) {
                headers.append("Content-Type", "application/octet-stream");
                rawHeadersMap["Content-Type"] = "application/octet-stream";
            }
        }
    }
    return fetchBody;
}

function executeTestScripts(
    script: string | undefined,
    responsePayload: any,
    environments: Environment[],
    activeEnvironmentId: string | null,
    collectionVars: KeyValuePair[]
): { testResults: any[] } {
    let testResults: any[] = [];
    if (script) {
        const testRes = runTestScript(
            script,
            responsePayload,
            environments,
            activeEnvironmentId,
            collectionVars
        );
        testResults = testRes.testResults;
        store.setState(s => ({ ...s, environments: testRes.updatedEnvironments }));
    }
    return { testResults };
}

export async function executeFrontendRequest(
    request: ApiRequest,
    requestId: string | null | undefined,
    environments: Environment[],
    activeEnvironmentId: string | null,
    collections: ApiCollection[],
    abortSignal?: AbortSignal
): Promise<RequestResponse> {
    try {
        const collectionVars = gatherVariables(requestId, collections);

        const { finalEnvironments, addedHeaders } = executePreRequestScripts(
            request.preRequestScript,
            environments,
            activeEnvironmentId,
            collectionVars
        );

        const interpolatedUrl = resolveVariables(request.url, finalEnvironments, activeEnvironmentId, collectionVars);

        const { headers, rawHeadersMap } = buildHeaders(
            request.headers,
            addedHeaders,
            finalEnvironments,
            activeEnvironmentId,
            collectionVars
        );

        const fetchBody = buildRequestBody(
            request.body,
            request.method,
            finalEnvironments,
            activeEnvironmentId,
            collectionVars,
            headers,
            rawHeadersMap
        );

        if (!interpolatedUrl) {
            throw new Error("URL is empty.");
        }

        const isExtensionActive = typeof document !== "undefined" &&
            document.documentElement.getAttribute("data-surge-extension-active") === "true";

        let extensionRuleId: number | null = null;
        if (isExtensionActive) {
            extensionRuleId = await setupExtensionRules(interpolatedUrl, rawHeadersMap);
        }

        const startTime = performance.now();
        let fetchRes: Response | undefined;
        let isProxied = false;
        let proxyResult: any = null;
        try {
            fetchRes = await fetch(interpolatedUrl, {
                method: request.method,
                headers,
                body: fetchBody,
                mode: "cors",
                signal: abortSignal
            });
        } catch (fetchErr: any) {
            if (fetchErr.name === "AbortError") {
                throw fetchErr;
            }
            if (isExtensionActive) {
                console.warn("Standard fetch failed. Retrying via extension fetchProxy...", fetchErr);
                const headersObj: Record<string, string> = {};
                headers.forEach((val, key) => {
                    headersObj[key] = val;
                });
                const proxyOpts: any = {
                    method: request.method,
                    headers: headersObj,
                };
                if (request.method !== "GET" && request.method !== "HEAD" && fetchBody !== null && fetchBody !== undefined) {
                    proxyOpts.body = typeof fetchBody === "string" ? fetchBody : fetchBody;
                }
                const proxyRes = await sendToExtension({
                    action: "fetchProxy",
                    url: interpolatedUrl,
                    options: proxyOpts
                }, 15000, abortSignal);
                if (proxyRes && proxyRes.success) {
                    isProxied = true;
                    proxyResult = proxyRes;
                } else {
                    throw new Error(proxyRes?.error || "Extension proxy fetch failed.");
                }
            } else {
                throw fetchErr;
            }
        } finally {
            if (extensionRuleId !== null) {
                await clearExtensionRules(extensionRuleId);
            }
        }
        const endTime = performance.now();

        let initialResponse;
        if (isProxied && proxyResult) {
            initialResponse = {
                status: proxyResult.status,
                statusText: proxyResult.statusText || ("HTTP " + proxyResult.status),
                timeMs: Math.round(endTime - startTime),
                sizeBytes: proxyResult.body ? proxyResult.body.length : 0,
                body: proxyResult.body || "",
                headers: proxyResult.headers || {},
            };
        } else {
            const text = await fetchRes!.text();
            const resHeadersMap: Record<string, string> = {};
            fetchRes!.headers.forEach((val, key) => {
                resHeadersMap[key] = val;
            });
            initialResponse = {
                status: fetchRes!.status,
                statusText: fetchRes!.statusText,
                timeMs: Math.round(endTime - startTime),
                sizeBytes: text.length,
                body: text,
                headers: resHeadersMap,
            };
        }

        const { testResults } = executeTestScripts(
            request.testScript,
            initialResponse,
            finalEnvironments,
            activeEnvironmentId,
            collectionVars
        );

        return {
            ...initialResponse,
            testResults
        };

    } catch (err: any) {
        if (err.name === "AbortError") {
            return {
                status: 0,
                statusText: "Cancelled",
                timeMs: 0,
                sizeBytes: 0,
                body: "Request cancelled by user.",
                headers: {},
                testResults: []
            };
        }

        console.error(err);
        return {
            status: 0,
            statusText: "Error",
            timeMs: 0,
            sizeBytes: 0,
            body: `Error: ${err.message || String(err)}\n\nThis could be caused by CORS block restrictions on the endpoint or an invalid domain name. Check developer tools console logs.`,
            headers: {},
            testResults: [{ name: "Request completed", passed: false, error: err.message }]
        };
    }
}
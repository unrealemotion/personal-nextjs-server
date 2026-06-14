import { store } from "./store";
import { runPreRequestScript, runTestScript, resolveVariables } from "./sandbox";
import { setupExtensionRules, clearExtensionRules } from "./extension";
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

export async function executeFrontendRequest(
    request: ApiRequest,
    requestId: string | null | undefined,
    environments: Environment[],
    activeEnvironmentId: string | null,
    collections: ApiCollection[],
    abortSignal?: AbortSignal
): Promise<RequestResponse> {
    try {
        // 1. Gather variables from active environment & collection
        let collectionVars: KeyValuePair[] = [];
        if (requestId) {
            const parentCol = findParentCollection(collections, requestId);
            if (parentCol && parentCol.variables) {
                collectionVars = parentCol.variables;
            }
        }

        // 2. Pre-request Script Execution
        let finalEnvironments = environments;
        let addedHeaders: { key: string; value: string }[] = [];

        if (request.preRequestScript) {
            const scriptRes = runPreRequestScript(
                request.preRequestScript,
                environments,
                activeEnvironmentId,
                collectionVars
            );
            finalEnvironments = scriptRes.updatedEnvironments;
            addedHeaders = scriptRes.addedHeaders;

            // Sync environments state back to store
            store.setState(s => ({ ...s, environments: finalEnvironments }));
        }

        // 3. Variable Interpolation
        const interpolatedUrl = resolveVariables(request.url, finalEnvironments, activeEnvironmentId, collectionVars);
        
        // Build Headers
        const headers = new Headers();
        const rawHeadersMap: Record<string, string> = {};

        // User-defined headers
        (request.headers || []).forEach(h => {
            if (h.enabled !== false && h.key) {
                const resolvedKey = resolveVariables(h.key, finalEnvironments, activeEnvironmentId, collectionVars);
                const resolvedVal = resolveVariables(h.value, finalEnvironments, activeEnvironmentId, collectionVars);
                headers.append(resolvedKey, resolvedVal);
                rawHeadersMap[resolvedKey] = resolvedVal;
            }
        });

        // Headers added dynamically via pre-request scripts
        addedHeaders.forEach(h => {
            headers.append(h.key, h.value);
            rawHeadersMap[h.key] = h.value;
        });

        // Build Body
        let fetchBody: any = null;
        const mode = request.body?.mode || "none";

        if (request.method !== "GET" && request.method !== "HEAD") {
            if (mode === "raw" && request.body?.raw) {
                const rawBodyResolved = resolveVariables(request.body.raw, finalEnvironments, activeEnvironmentId, collectionVars);
                const lang = request.body.rawLanguage || "json";
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
            } else if (mode === "graphql" && request.body?.graphql) {
                const query = resolveVariables(request.body.graphql.query || "", finalEnvironments, activeEnvironmentId, collectionVars);
                const varsStr = resolveVariables(request.body.graphql.variables || "{}", finalEnvironments, activeEnvironmentId, collectionVars);
                let variables = {};
                try {
                    variables = JSON.parse(stripJsonComments(varsStr));
                } catch {}
                fetchBody = JSON.stringify({ query, variables });
                if (!headers.has("Content-Type")) {
                    headers.append("Content-Type", "application/json");
                    rawHeadersMap["Content-Type"] = "application/json";
                }
            } else if (mode === "urlencoded" && request.body?.urlencoded) {
                const formParams = new URLSearchParams();
                request.body.urlencoded.forEach(p => {
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
            } else if (mode === "formdata" && request.body?.formdata) {
                const fd = new FormData();
                request.body.formdata.forEach(p => {
                    if (p.enabled !== false && p.key) {
                        const rKey = resolveVariables(p.key, finalEnvironments, activeEnvironmentId, collectionVars);
                        const rVal = resolveVariables(p.value, finalEnvironments, activeEnvironmentId, collectionVars);
                        fd.append(rKey, rVal);
                    }
                });
                fetchBody = fd;
            } else if (mode === "binary" && request.body?.binary) {
                fetchBody = resolveVariables(request.body.binary, finalEnvironments, activeEnvironmentId, collectionVars);
                if (!headers.has("Content-Type")) {
                    headers.append("Content-Type", "application/octet-stream");
                    rawHeadersMap["Content-Type"] = "application/octet-stream";
                }
            }
        }

        // 4. Send network request
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
        let fetchRes;
        try {
            fetchRes = await fetch(interpolatedUrl, {
                method: request.method,
                headers,
                body: fetchBody,
                mode: "cors",
                signal: abortSignal
            });
        } finally {
            if (extensionRuleId !== null) {
                await clearExtensionRules(extensionRuleId);
            }
        }
        const endTime = performance.now();

        const text = await fetchRes.text();
        const resHeadersMap: Record<string, string> = {};
        fetchRes.headers.forEach((val, key) => {
            resHeadersMap[key] = val;
        });

        const initialResponse = {
            status: fetchRes.status,
            statusText: fetchRes.statusText,
            timeMs: Math.round(endTime - startTime),
            sizeBytes: text.length,
            body: text,
            headers: resHeadersMap,
        };

        // 5. Test Script Execution
        let testResults: any[] = [];
        if (request.testScript) {
            const testRes = runTestScript(
                request.testScript,
                initialResponse,
                finalEnvironments,
                activeEnvironmentId,
                collectionVars
            );
            testResults = testRes.testResults;
            // Sync environments state back to store
            store.setState(s => ({ ...s, environments: testRes.updatedEnvironments }));
        }

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

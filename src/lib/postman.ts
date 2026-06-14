import { generateId } from "./store";
import { type ApiCollection, type ApiFolder, type ApiRequest } from "./schema";
import { parseQueryParams } from "./utils";

function parseExecScript(events: any[], phase: "prerequest" | "test"): string {
    if (!events || !Array.isArray(events)) return "";
    const event = events.find(e => e.listen === phase);
    if (event && event.script && event.script.exec) {
        if (Array.isArray(event.script.exec)) {
            return event.script.exec.join("\n");
        } else if (typeof event.script.exec === "string") {
            return event.script.exec;
        }
    }
    return "";
}

function parseUrl(urlObj: any): string {
    if (!urlObj) return "";
    if (typeof urlObj === "string") return urlObj;
    if (urlObj.raw) return urlObj.raw;
    
    // Fallback assembly
    const protocol = urlObj.protocol ? `${urlObj.protocol}://` : "";
    const host = Array.isArray(urlObj.host) ? urlObj.host.join(".") : (urlObj.host || "");
    
    let path = "";
    if (urlObj.path) {
        if (Array.isArray(urlObj.path)) {
            path = "/" + urlObj.path.join("/");
        } else {
            path = typeof urlObj.path === "string" && !urlObj.path.startsWith("/") 
                ? "/" + urlObj.path 
                : urlObj.path;
        }
    }

    let queryStr = "";
    if (Array.isArray(urlObj.query) && urlObj.query.length > 0) {
        queryStr = "?" + urlObj.query
            .filter((q: any) => q.key)
            .map((q: any) => `${q.key}=${q.value || ""}`)
            .join("&");
    }

    return `${protocol}${host}${path}${queryStr}`;
}

function parsePostmanItem(pmItem: any): ApiFolder | ApiRequest {
    const id = generateId();
    const name = pmItem.name || "Untitled Item";

    // If it has "item", it is a Folder
    if (pmItem.item && Array.isArray(pmItem.item)) {
        const folder: ApiFolder = {
            id,
            name,
            items: pmItem.item.map((child: any) => parsePostmanItem(child)),
        };
        return folder;
    }

    // Otherwise, it is a Request
    const requestIsString = typeof pmItem.request === "string";
    const pmReq = requestIsString ? { url: pmItem.request, method: "GET" } : (pmItem.request || {});
    const method = pmReq.method || "GET";
    const url = parseUrl(pmReq.url);

    // Headers
    const headers = Array.isArray(pmReq.header)
        ? pmReq.header.map((h: any) => ({
              key: h.key || "",
              value: h.value || "",
              enabled: h.disabled !== true,
              description: h.description || "",
          }))
        : [];

    // Query parameters
    let params: { key: string; value: string; enabled: boolean; description?: string }[] = [];
    if (pmReq.url && pmReq.url.query && Array.isArray(pmReq.url.query)) {
        params = pmReq.url.query.map((q: any) => ({
            key: q.key || "",
            value: q.value || "",
            enabled: q.disabled !== true,
            description: q.description || "",
        }));
    } else if (url) {
        params = parseQueryParams(url);
    }

    // Body
    let bodyMode: "none" | "raw" | "formdata" | "urlencoded" = "none";
    let bodyRaw = "";
    let rawLanguage = "json";
    let bodyFormdata: any[] = [];
    let bodyUrlencoded: any[] = [];

    if (pmReq.body) {
        const pmBody = pmReq.body;
        const mode = pmBody.mode;
        if (mode === "raw") {
            bodyMode = "raw";
            bodyRaw = pmBody.raw || "";
            if (pmBody.options?.raw?.language) {
                rawLanguage = pmBody.options.raw.language.toLowerCase();
            }
        } else if (mode === "formdata") {
            bodyMode = "formdata";
            bodyFormdata = Array.isArray(pmBody.formdata)
                ? pmBody.formdata.map((f: any) => ({
                      key: f.key || "",
                      value: f.value || "",
                      enabled: f.disabled !== true,
                      type: f.type === "file" ? "file" : "text",
                  }))
                : [];
        } else if (mode === "urlencoded") {
            bodyMode = "urlencoded";
            bodyUrlencoded = Array.isArray(pmBody.urlencoded)
                ? pmBody.urlencoded.map((u: any) => ({
                      key: u.key || "",
                      value: u.value || "",
                      enabled: u.disabled !== true,
                  }))
                : [];
        }
    }

    // Scripts
    const preRequestScript = parseExecScript(pmItem.event, "prerequest");
    const testScript = parseExecScript(pmItem.event, "test");

    const requestItem: ApiRequest = {
        id,
        name,
        method,
        url,
        params,
        headers,
        body: {
            mode: bodyMode,
            raw: bodyRaw,
            rawLanguage,
            formdata: bodyFormdata,
            urlencoded: bodyUrlencoded,
        },
        preRequestScript,
        testScript,
    };

    return requestItem;
}

export function importPostmanCollection(jsonStr: string): ApiCollection {
    const raw = JSON.parse(jsonStr);
    const info = raw.info || {};
    const name = info.name || "Imported Collection";
    const rawItems = raw.item || [];

    const items = rawItems.map((item: any) => parsePostmanItem(item));

    // Handle collection variables
    const variables = Array.isArray(raw.variable)
        ? raw.variable.map((v: any) => ({
              key: v.key || "",
              value: v.value || "",
              enabled: true,
              description: v.description || "",
          }))
        : [];

    return {
        id: generateId(),
        name,
        items,
        variables,
    };
}

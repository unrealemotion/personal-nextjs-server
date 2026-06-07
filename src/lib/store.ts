import { Store } from "@tanstack/react-store";
import {
    type RequestTemplate,
    type ExecutionResult,
    type ColumnMapping,
    type TableFilterConfig,
    type ApiCollection,
    type Environment,
    type RequestTab,
    type ApiRequest,
    type ApiFolder
} from "./schema";

export type VariableType = "string" | "number" | "boolean";

export function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

function createDefaultTemplate(name?: string): RequestTemplate {
    return {
        id: generateId(),
        name: name || "Request 1",
        method: "GET",
        url: "",
        params: [],
        headers: [],
        body: {
            mode: "none",
            raw: "{\n  \n}",
            formdata: [],
            urlencoded: [],
        },
    };
}

export function createDefaultApiRequest(name = "Untitled Request"): ApiRequest {
    return {
        id: generateId(),
        name,
        method: "GET",
        url: "",
        params: [],
        headers: [],
        body: {
            mode: "none",
            raw: "{\n  \n}",
            formdata: [],
            urlencoded: [],
        },
        preRequestScript: "",
        testScript: "",
    };
}

export function createDefaultTab(name = "Untitled Request", request?: ApiRequest): RequestTab {
    const req = request || createDefaultApiRequest(name);
    return {
        id: generateId(),
        name: req.name,
        isDirty: false,
        request: req,
        requestId: request ? req.id : undefined,
        response: null,
        loading: false,
    };
}

export type AppState = {
    originalData: Array<Record<string, any>>;
    fileData: Array<Record<string, any>>;
    headers: string[];
    headerTypes: Record<string, VariableType>;
    templates: RequestTemplate[];
    activeTemplateId: string;
    results: ExecutionResult[];
    maxRetries: number;
    retryStatusCodes: string;
    stopOnFailure: boolean;
    throttleDelayMs: number;
    rowIterations: number;
    columnMappings: ColumnMapping[];
    tableFilterConfig: TableFilterConfig;
    fileName: string;

    // API Client state
    currentView: "bulk" | "api_client";
    collections: ApiCollection[];
    environments: Environment[];
    activeEnvironmentId: string | null;
    apiTabs: RequestTab[];
    activeTabId: string | null;
};

const LOCAL_STORAGE_KEY = "surge_api_workspace";

const initialTemplate = createDefaultTemplate();

const defaultState: AppState = {
    originalData: [
        {
            paramName: "test_param",
            paramValue: "world",
            headerName: "X-Test-Header",
            headerValue: "hello"
        }
    ],
    fileData: [
        {
            paramName: "test_param",
            paramValue: "world",
            headerName: "X-Test-Header",
            headerValue: "hello"
        }
    ],
    headers: ["paramName", "paramValue", "headerName", "headerValue"],
    headerTypes: {
        paramName: "string",
        paramValue: "string",
        headerName: "string",
        headerValue: "string"
    },
    templates: [initialTemplate],
    activeTemplateId: initialTemplate.id,
    results: [],
    maxRetries: 0,
    retryStatusCodes: "",
    stopOnFailure: false,
    throttleDelayMs: 0,
    rowIterations: 1,
    columnMappings: [
        { name: "Status Code", source: "status", path: "" },
        { name: "Error", source: "error", path: "" },
    ],
    tableFilterConfig: {
        searchQuery: "",
        isRegex: false,
        columnFilters: {},
        sortBy: null,
        sortOrder: null,
    },
    fileName: "test.csv",
    currentView: "bulk",
    collections: [],
    environments: [],
    activeEnvironmentId: null,
    apiTabs: [],
    activeTabId: null,
};


// --- Hydration & Persistence ---
export const store = new Store<AppState>(defaultState);

export const hydrateStore = () => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        store.setState(() => ({ ...defaultState, ...parsed }));
    } catch (e) {
        console.error("Failed to hydrate state:", e);
    }
};

// --- Persistence ---
if (typeof window !== "undefined") {
    store.subscribe(() => {
        const state = store.state;
        try {
            // Strip response bodies/payloads before persisting to keep storage minimal
            const sanitizedState = {
                ...state,
                apiTabs: state.apiTabs.map(tab => ({
                    ...tab,
                    response: null // Response data is transient and shouldn't fill localstorage
                }))
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitizedState));
        } catch (e) {
            console.warn("Storage limit reached, results might not be saved.", e);
        }
    });
}

// --- Helpers ---

const castValue = (val: any, type: VariableType): any => {
    if (val === undefined || val === null || val === "") return val;

    if (type === "string") return String(val);

    if (type === "number") {
        const parsed = Number(val);
        return isNaN(parsed) ? val : parsed;
    }

    if (type === "boolean") {
        if (typeof val === "string") {
            const low = val.toLowerCase();
            return low === "true" || low === "1";
        }
        return Boolean(val);
    }

    return val;
};

const applyTypes = (data: Array<Record<string, any>>, types: Record<string, VariableType>): Array<Record<string, any>> => {
    return data.map(row => {
        const newRow = { ...row };
        Object.keys(types).forEach(header => {
            newRow[header] = castValue(row[header], types[header]);
        });
        return newRow;
    });
};

// --- Workspace actions ---

export const resetStore = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    const currentView = store.state.currentView;
    store.setState(() => ({ ...defaultState, currentView }));
};

export const exportState = () => {
    const state = store.state;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const pad = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const timeStamp = `${yyyy}${mm}${dd}_${hh}${min}${ss}`;

    a.download = `surge_workspace_${timeStamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

export const importState = (json: string) => {
    try {
        const parsed = JSON.parse(json);
        // Basic validation: ensure it has templates
        if (!parsed.templates || !Array.isArray(parsed.templates)) {
            throw new Error("Invalid workspace file");
        }
        const currentView = store.state.currentView;
        store.setState(() => ({
            ...defaultState, // Start with default to ensure all keys are present
            ...parsed,
            currentView
        }));
    } catch (e) {
        alert("Failed to import: " + (e instanceof Error ? e.message : "Unknown error"));
    }
};

// --- File data actions ---

export const setFileData = (data: Array<Record<string, any>>, headers: string[], fileName?: string) => {
    const headerTypes: Record<string, VariableType> = {};
    headers.forEach(h => {
        const val = data.length > 0 ? data[0][h] : undefined;
        if (typeof val === "number") headerTypes[h] = "number";
        else if (typeof val === "boolean") headerTypes[h] = "boolean";
        else headerTypes[h] = "string";
    });

    store.setState((state) => ({
        ...state,
        originalData: data,
        fileData: applyTypes(data, headerTypes),
        headers,
        headerTypes,
        results: [],
        fileName: fileName || "",
    }));
};

export const setHeaderType = (header: string, type: VariableType) => {
    store.setState((state) => {
        const newTypes = { ...state.headerTypes, [header]: type };
        const newData = applyTypes(state.originalData, newTypes);
        return { ...state, headerTypes: newTypes, fileData: newData };
    });
};

// --- Template CRUD actions ---

export const setActiveTemplate = (id: string) => {
    store.setState((state) => ({ ...state, activeTemplateId: id }));
};

export const addTemplate = () => {
    store.setState((state) => {
        const newTmpl = createDefaultTemplate(`Request ${state.templates.length + 1}`);
        return {
            ...state,
            templates: [...state.templates, newTmpl],
            activeTemplateId: newTmpl.id,
        };
    });
};

export const removeTemplate = (id: string) => {
    store.setState((state) => {
        if (state.templates.length <= 1) return state; // Keep at least one
        const newTemplates = state.templates.filter(t => t.id !== id);
        const newActiveId = state.activeTemplateId === id
            ? newTemplates[0].id
            : state.activeTemplateId;
        return { ...state, templates: newTemplates, activeTemplateId: newActiveId };
    });
};

export const updateTemplateById = (id: string, updates: Partial<RequestTemplate>) => {
    store.setState((state) => ({
        ...state,
        templates: state.templates.map(t =>
            t.id === id ? { ...t, ...updates } : t
        ),
    }));
};

export const reorderTemplates = (fromIndex: number, toIndex: number) => {
    store.setState((state) => {
        const newTemplates = [...state.templates];
        const [moved] = newTemplates.splice(fromIndex, 1);
        newTemplates.splice(toIndex, 0, moved);
        return { ...state, templates: newTemplates };
    });
};

// Backward-compat helper: update the currently active template
export const updateTemplate = (updates: Partial<RequestTemplate>) => {
    const { activeTemplateId } = store.state;
    updateTemplateById(activeTemplateId, updates);
};

export const setMaxRetries = (val: number) => {
    store.setState((state) => ({ ...state, maxRetries: val }));
};

export const setRetryStatusCodes = (val: string) => {
    store.setState((state) => ({ ...state, retryStatusCodes: val }));
};

// --- Results actions ---

export const setResults = (results: ExecutionResult[]) => {
    store.setState((state) => ({
        ...state,
        results,
    }));
};

export const updateResultByRowId = (rowId: number, resultUpdate: Partial<ExecutionResult>, iteration = 1) => {
    store.setState((state) => {
        const newResults = [...state.results];
        const idx = newResults.findIndex((r) => r.rowId === rowId && (r.iteration ?? 1) === iteration);
        if (idx !== -1) {
            newResults[idx] = { ...newResults[idx], ...resultUpdate };
        } else {
            newResults.push({
                rowId,
                iteration,
                status: "success",
                statusCode: 0,
                responseTimeMs: 0,
                requestBody: null,
                responseBody: null,
                steps: [],
                ...resultUpdate
            } as ExecutionResult);
            newResults.sort((a, b) => {
                if (a.rowId !== b.rowId) return a.rowId - b.rowId;
                return (a.iteration ?? 1) - (b.iteration ?? 1);
            });
        }
        return { ...state, results: newResults };
    });
};

export const setColumnMappings = (mappings: ColumnMapping[]) => {
    store.setState((state) => ({ ...state, columnMappings: mappings }));
};

export const setTableFilterConfig = (updates: Partial<TableFilterConfig>) => {
    store.setState((state) => ({
        ...state,
        tableFilterConfig: { ...state.tableFilterConfig, ...updates },
    }));
};

export const setStopOnFailure = (val: boolean) => {
    store.setState((state) => ({ ...state, stopOnFailure: val }));
};

export const setThrottleDelayMs = (val: number) => {
    store.setState((state) => ({ ...state, throttleDelayMs: val }));
};

export const setRowIterations = (val: number) => {
    store.setState((state) => ({ ...state, rowIterations: val }));
};

// --- API Client Actions ---

export const setCurrentView = (view: "bulk" | "api_client") => {
    store.setState((state) => ({ ...state, currentView: view }));
};

export const setCollections = (collections: ApiCollection[]) => {
    store.setState((state) => ({ ...state, collections }));
};

export const addCollection = (collection: ApiCollection) => {
    store.setState((state) => ({
        ...state,
        collections: [...state.collections, collection],
    }));
};

export const deleteCollection = (id: string) => {
    store.setState((state) => ({
        ...state,
        collections: state.collections.filter((c) => c.id !== id),
    }));
};

export const updateCollection = (id: string, updates: Partial<ApiCollection>) => {
    store.setState((state) => ({
        ...state,
        collections: state.collections.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
};

export const setEnvironments = (environments: Environment[]) => {
    store.setState((state) => ({ ...state, environments }));
};

export const addEnvironment = (env: Environment) => {
    store.setState((state) => ({
        ...state,
        environments: [...state.environments, env],
    }));
};

export const deleteEnvironment = (id: string) => {
    store.setState((state) => ({
        ...state,
        environments: state.environments.filter((e) => e.id !== id),
        activeEnvironmentId: state.activeEnvironmentId === id ? null : state.activeEnvironmentId,
    }));
};

export const updateEnvironment = (id: string, updates: Partial<Environment>) => {
    store.setState((state) => ({
        ...state,
        environments: state.environments.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
};

export const setActiveEnvironmentId = (id: string | null) => {
    store.setState((state) => ({ ...state, activeEnvironmentId: id }));
};

export const openRequestInTab = (request: ApiRequest, requestId?: string) => {
    store.setState((state) => {
        if (requestId) {
            const existingTab = state.apiTabs.find((t) => t.requestId === requestId);
            if (existingTab) {
                return { ...state, activeTabId: existingTab.id };
            }
        }
        const newTab = createDefaultTab(request.name, request);
        newTab.requestId = requestId;
        return {
            ...state,
            apiTabs: [...state.apiTabs, newTab],
            activeTabId: newTab.id,
        };
    });
};

export const addApiTab = () => {
    store.setState((state) => {
        const newTab = createDefaultTab();
        return {
            ...state,
            apiTabs: [...state.apiTabs, newTab],
            activeTabId: newTab.id,
        };
    });
};

export const closeApiTab = (id: string) => {
    store.setState((state) => {
        const newTabs = state.apiTabs.filter((t) => t.id !== id);
        let newActiveId = state.activeTabId;
        if (state.activeTabId === id) {
            newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
        }
        return {
            ...state,
            apiTabs: newTabs,
            activeTabId: newActiveId,
        };
    });
};

export const setActiveTabId = (id: string | null) => {
    store.setState((state) => ({ ...state, activeTabId: id }));
};

export const updateActiveTabRequest = (updates: Partial<ApiRequest>) => {
    store.setState((state) => {
        if (!state.activeTabId) return state;
        const newTabs = state.apiTabs.map((t) => {
            if (t.id === state.activeTabId) {
                const req = { ...t.request, ...updates };
                return {
                    ...t,
                    name: updates.name !== undefined ? updates.name : t.name,
                    request: req,
                    isDirty: true,
                };
            }
            return t;
        });
        return { ...state, apiTabs: newTabs };
    });
};

export const markActiveTabClean = () => {
    store.setState((state) => {
        if (!state.activeTabId) return state;
        const newTabs = state.apiTabs.map((t) => {
            if (t.id === state.activeTabId) {
                return { ...t, isDirty: false };
            }
            return t;
        });
        return { ...state, apiTabs: newTabs };
    });
};

export const updateTabResponse = (tabId: string, response: RequestTab["response"]) => {
    store.setState((state) => {
        const newTabs = state.apiTabs.map((t) => {
            if (t.id === tabId) {
                return { ...t, response, loading: false };
            }
            return t;
        });
        return { ...state, apiTabs: newTabs };
    });
};

export const updateTabLoading = (tabId: string, loading: boolean) => {
    store.setState((state) => {
        const newTabs = state.apiTabs.map((t) => {
            if (t.id === tabId) {
                return { ...t, loading };
            }
            return t;
        });
        return { ...state, apiTabs: newTabs };
    });
};

function updateRequestInTree(items: (ApiFolder | ApiRequest)[], id: string, updates: Partial<ApiRequest>): boolean {
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if ('method' in item) {
            if (item.id === id) {
                items[i] = { ...item, ...updates } as ApiRequest;
                return true;
            }
        } else {
            const updated = updateRequestInTree(item.items, id, updates);
            if (updated) return true;
        }
    }
    return false;
}

export const saveCollectionRequest = (requestId: string, updates: Partial<ApiRequest>) => {
    store.setState((state) => {
        const newCollections = state.collections.map((col) => {
            const itemsCopy = JSON.parse(JSON.stringify(col.items));
            const updated = updateRequestInTree(itemsCopy, requestId, updates);
            if (updated) {
                return { ...col, items: itemsCopy };
            }
            return col;
        });
        return { ...state, collections: newCollections };
    });
};





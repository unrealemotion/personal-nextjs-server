import { Store } from "@tanstack/react-store";
import {
    type RequestTemplate,
    type ExecutionResult,
    type StepResult,
    type ColumnMapping,
    type TableFilterConfig,
    type ApiCollection,
    type Environment,
    type RequestTab,
    type ApiRequest,
    type ApiFolder,
    type AgentProfile,
    type Message
} from "./schema";
import { WELCOME_MESSAGE } from "../components/agent/agent-prompts";


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
    concurrency: number;
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

    // Agent state
    agentProfiles: AgentProfile[];
    activeAgentProfileId: string | null;
    agentChatMessages: Message[];
    agentPanelPosition: { x: number; y: number } | null;
    agentPanelSize?: { width: number; height: number } | null;
    exportExcelTrigger?: { onlyFiltered: boolean } | null;
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
    concurrency: 2,
    columnMappings: [
        { id: "col_status", name: "Status Code", source: "status", path: "" },
        { id: "col_error", name: "Error", source: "error", path: "" },
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
    agentProfiles: [
        {
            id: "default-gemini",
            name: "Gemini 2.5 Flash",
            provider: "gemini",
            apiKey: "",
            endpoint: "https://generativelanguage.googleapis.com/v1beta/models/",
            model: "gemini-2.5-flash"
        }
    ],
    activeAgentProfileId: "default-gemini",
    agentChatMessages: [
        {
            id: "welcome",
            role: "assistant",
            content: WELCOME_MESSAGE
        }
    ],
    agentPanelPosition: null,
    agentPanelSize: null,
    exportExcelTrigger: null,
};


// --- Hydration & Persistence ---
const DB_NAME = "SurgeWorkspaceDB";
const STORE_NAME = "stateStore";
const DB_KEY = "workspaceState";

let dbInstance: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("Browser environment required for IndexedDB"));
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => {
            dbInstance = request.result;
            dbInstance.onversionchange = () => {
                dbInstance?.close();
                dbInstance = null;
            };
            resolve(dbInstance);
        };
        request.onerror = () => reject(request.error);
    });
}

function saveToDB(value: any, key: string = DB_KEY): Promise<void> {
    return getDB().then((db) => {
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

function loadFromDB(key: string = DB_KEY): Promise<any> {
    return getDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }).catch((e) => {
        console.warn(`Failed to load key ${key} from IndexedDB:`, e);
        return null;
    });
}

function deleteFromDB(key: string): Promise<void> {
    return getDB().then((db) => {
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

function clearDB(): Promise<void> {
    return getDB().then((db) => {
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

const globalForStore = globalThis as unknown as {
    store: Store<AppState> | undefined;
    isHydrated: boolean | undefined;
};

export const store = globalForStore.store || new Store<AppState>(defaultState);

if (process.env.NODE_ENV !== "production") {
    globalForStore.store = store;
}

let isHydrated = globalForStore.isHydrated || false;
let prevConfigState: any = null;
let prevDataState: any = null;
let prevResultsState: any = null;

export const hydrateStore = async () => {
    if (typeof window === "undefined") return;
    try {
        let config = null;
        let data = null;
        let results = null;

        const backupConfigStr = localStorage.getItem("surge_backup_config");
        if (backupConfigStr) {
            try {
                config = JSON.parse(backupConfigStr);
                localStorage.removeItem("surge_backup_config");
                saveToDB(config, "workspaceConfig").catch(e => console.error("Failed to persist backup config:", e));
            } catch (err) {}
        }
        if (!config) {
            config = await loadFromDB("workspaceConfig");
        }

        const backupDataStr = localStorage.getItem("surge_backup_data");
        if (backupDataStr) {
            try {
                data = JSON.parse(backupDataStr);
                localStorage.removeItem("surge_backup_data");
                saveToDB(data, "workspaceData").catch(e => console.error("Failed to persist backup data:", e));
            } catch (err) {}
        }
        if (!data) {
            data = await loadFromDB("workspaceData");
        }

        const backupResultsStr = localStorage.getItem("surge_backup_results");
        if (backupResultsStr) {
            try {
                results = JSON.parse(backupResultsStr);
                localStorage.removeItem("surge_backup_results");
                saveToDB(results, "workspaceResults").catch(e => console.error("Failed to persist backup results:", e));
            } catch (err) {}
        }
        if (!results) {
            results = await loadFromDB("workspaceResults");
        }

        let parsed: any = null;

        if (config || data || results) {
            parsed = {
                ...(config || {}),
                ...(data || {}),
                results: results || []
            };
        } else {
            // Fallback: load old unified state from DB
            const legacyState = await loadFromDB("workspaceState");
            if (legacyState) {
                parsed = legacyState;
                await saveToDB(parsed, "workspaceConfig");
                await saveToDB(parsed, "workspaceData");
                await saveToDB(parsed.results || [], "workspaceResults");
                await deleteFromDB("workspaceState");
            } else {
                // Fallback: load from localStorage
                const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (saved) {
                    try {
                        parsed = JSON.parse(saved);
                        await saveToDB(parsed, "workspaceConfig");
                        await saveToDB(parsed, "workspaceData");
                        await saveToDB(parsed.results || [], "workspaceResults");
                        localStorage.removeItem(LOCAL_STORAGE_KEY);
                    } catch (err) {
                        console.error("Failed to parse state from localStorage:", err);
                    }
                }
            }
        }

        // Migrate legacy single agent configuration if any
        let migratedProfiles: AgentProfile[] = [];
        let migratedActiveId: string | null = null;
        const savedAgent = localStorage.getItem("surge_agent_config");
        if (savedAgent) {
            try {
                const oldAgent = JSON.parse(savedAgent);
                if (oldAgent.apiKey || oldAgent.model) {
                    migratedActiveId = "migrated-default";
                    migratedProfiles = [
                        {
                            id: "migrated-default",
                            name: "Migrated Settings",
                            provider: oldAgent.provider || "gemini",
                            apiKey: oldAgent.apiKey || "",
                            endpoint: oldAgent.endpoint || "",
                            model: oldAgent.model || ""
                        }
                    ];
                }
                localStorage.removeItem("surge_agent_config");
            } catch (err) {}
        }

        if (parsed) {
            const apiTabs = Array.isArray(parsed.apiTabs) ? parsed.apiTabs : [];
            let resultsList = Array.isArray(parsed.results) ? parsed.results : [];
            const nowMs = Date.now();
            resultsList = resultsList.map((r: any, idx: number) => ({
                ...r,
                timestamp: r.timestamp || new Date(nowMs - (resultsList.length - idx) * 1000).toISOString(),
                active: r.active !== undefined ? r.active : true
            }));

            const importedFilterConfig = parsed.tableFilterConfig || {};
            const tableFilterConfig = {
                ...defaultState.tableFilterConfig,
                ...importedFilterConfig,
                columnFilters: {
                    ...defaultState.tableFilterConfig.columnFilters,
                    ...(importedFilterConfig.columnFilters || {})
                }
            };

            let columnMappings = parsed.columnMappings || defaultState.columnMappings;
            columnMappings = columnMappings.map((col: any) => ({
                ...col,
                id: col.id || `col_${generateId()}`
            }));

            let agentProfiles = parsed.agentProfiles || defaultState.agentProfiles;
            let activeAgentProfileId = parsed.activeAgentProfileId || defaultState.activeAgentProfileId;
            let agentChatMessages = parsed.agentChatMessages || defaultState.agentChatMessages;
            if (Array.isArray(agentChatMessages)) {
                agentChatMessages = agentChatMessages.map((m: any) =>
                    m.id === "welcome" ? { ...m, content: WELCOME_MESSAGE } : m
                );
            }
            let agentPanelPosition = parsed.agentPanelPosition !== undefined ? parsed.agentPanelPosition : defaultState.agentPanelPosition;
            let agentPanelSize = parsed.agentPanelSize !== undefined ? parsed.agentPanelSize : defaultState.agentPanelSize;

            if ((!parsed.agentProfiles || parsed.agentProfiles.length === 0) && migratedProfiles.length > 0) {
                agentProfiles = migratedProfiles;
                activeAgentProfileId = migratedActiveId;
            }

            store.setState(() => ({
                ...defaultState,
                ...parsed,
                columnMappings,
                tableFilterConfig,
                results: resultsList,
                apiTabs,
                agentProfiles,
                activeAgentProfileId,
                agentChatMessages,
                agentPanelPosition,
                agentPanelSize
            }));

            // Initialize prevStates
            prevConfigState = {
                templates: parsed.templates || defaultState.templates,
                activeTemplateId: parsed.activeTemplateId || defaultState.activeTemplateId,
                maxRetries: parsed.maxRetries || defaultState.maxRetries,
                retryStatusCodes: parsed.retryStatusCodes || defaultState.retryStatusCodes,
                stopOnFailure: parsed.stopOnFailure || defaultState.stopOnFailure,
                throttleDelayMs: parsed.throttleDelayMs || defaultState.throttleDelayMs,
                rowIterations: parsed.rowIterations || defaultState.rowIterations,
                concurrency: parsed.concurrency || defaultState.concurrency,
                columnMappings,
                tableFilterConfig,
                currentView: parsed.currentView || defaultState.currentView,
                collections: parsed.collections || defaultState.collections,
                environments: parsed.environments || defaultState.environments,
                activeEnvironmentId: parsed.activeEnvironmentId || defaultState.activeEnvironmentId,
                apiTabs,
                activeTabId: parsed.activeTabId || defaultState.activeTabId,
                agentProfiles,
                activeAgentProfileId,
                agentChatMessages,
                agentPanelPosition,
                agentPanelSize
            };

            prevDataState = {
                fileData: parsed.fileData || defaultState.fileData,
                originalData: parsed.originalData || defaultState.originalData,
                headers: parsed.headers || defaultState.headers,
                headerTypes: parsed.headerTypes || defaultState.headerTypes,
                fileName: parsed.fileName || defaultState.fileName
            };

            prevResultsState = {
                results: resultsList
            };
        } else if (migratedProfiles.length > 0) {
            // Apply migrated settings to default state
            store.setState(s => ({
                ...s,
                agentProfiles: migratedProfiles,
                activeAgentProfileId: migratedActiveId
            }));
        }
    } catch (e) {
        console.error("Failed to hydrate state from IndexedDB:", e);
    } finally {
        isHydrated = true;
        globalForStore.isHydrated = true;
    }
};

// --- Persistence ---
let configTimeout: NodeJS.Timeout | null = null;
const saveConfigDebounced = () => {
    if (configTimeout) clearTimeout(configTimeout);
    configTimeout = setTimeout(async () => {
        try {
            const state = store.state;
            const config = {
                templates: state.templates,
                activeTemplateId: state.activeTemplateId,
                maxRetries: state.maxRetries,
                retryStatusCodes: state.retryStatusCodes,
                stopOnFailure: state.stopOnFailure,
                throttleDelayMs: state.throttleDelayMs,
                rowIterations: state.rowIterations,
                concurrency: state.concurrency,
                columnMappings: state.columnMappings,
                tableFilterConfig: state.tableFilterConfig,
                currentView: state.currentView,
                collections: state.collections,
                environments: state.environments,
                activeEnvironmentId: state.activeEnvironmentId,
                apiTabs: (state.apiTabs || []).map(tab => ({
                    ...tab,
                    response: null
                })),
                activeTabId: state.activeTabId,
                agentProfiles: state.agentProfiles,
                activeAgentProfileId: state.activeAgentProfileId,
                agentChatMessages: state.agentChatMessages,
                agentPanelPosition: state.agentPanelPosition,
                agentPanelSize: state.agentPanelSize
            };
            await saveToDB(config, "workspaceConfig");
        } catch (e) {
            console.error("Failed to save config to IndexedDB:", e);
        }
    }, 500);
};

let dataTimeout: NodeJS.Timeout | null = null;
const saveDataDebounced = () => {
    if (dataTimeout) clearTimeout(dataTimeout);
    dataTimeout = setTimeout(async () => {
        try {
            const state = store.state;
            const data = {
                fileData: state.fileData,
                originalData: state.originalData,
                headers: state.headers,
                headerTypes: state.headerTypes,
                fileName: state.fileName
            };
            await saveToDB(data, "workspaceData");
        } catch (e) {
            console.error("Failed to save data to IndexedDB:", e);
        }
    }, 500);
};

let resultsTimeout: NodeJS.Timeout | null = null;
const saveResultsDebounced = () => {
    if (resultsTimeout) clearTimeout(resultsTimeout);
    resultsTimeout = setTimeout(async () => {
        try {
            const state = store.state;
            await saveToDB(state.results, "workspaceResults");
        } catch (e) {
            console.error("Failed to save results to IndexedDB:", e);
        }
    }, 500);
};

if (typeof window !== "undefined") {
    // Synchronously back up unsaved/pending state edits to localStorage on reload/navigation
    window.addEventListener("beforeunload", () => {
        if (isHydrated) {
            try {
                const state = store.state;
                const config = {
                    templates: state.templates,
                    activeTemplateId: state.activeTemplateId,
                    maxRetries: state.maxRetries,
                    retryStatusCodes: state.retryStatusCodes,
                    stopOnFailure: state.stopOnFailure,
                    throttleDelayMs: state.throttleDelayMs,
                    rowIterations: state.rowIterations,
                    concurrency: state.concurrency,
                    columnMappings: state.columnMappings,
                    tableFilterConfig: state.tableFilterConfig,
                    currentView: state.currentView,
                    collections: state.collections,
                    environments: state.environments,
                    activeEnvironmentId: state.activeEnvironmentId,
                    apiTabs: (state.apiTabs || []).map(tab => ({ ...tab, response: null })),
                    activeTabId: state.activeTabId,
                    agentProfiles: state.agentProfiles,
                    activeAgentProfileId: state.activeAgentProfileId,
                    agentChatMessages: state.agentChatMessages,
                    agentPanelPosition: state.agentPanelPosition,
                    agentPanelSize: state.agentPanelSize
                };
                const data = {
                    fileData: state.fileData,
                    originalData: state.originalData,
                    headers: state.headers,
                    headerTypes: state.headerTypes,
                    fileName: state.fileName
                };
                localStorage.setItem("surge_backup_config", JSON.stringify(config));
                localStorage.setItem("surge_backup_data", JSON.stringify(data));
                localStorage.setItem("surge_backup_results", JSON.stringify(state.results));
            } catch (err) {
                console.warn("Failed to write beforeunload backup to localStorage:", err);
            }
        }
    });

    store.subscribe(() => {
        if (!isHydrated) return;
        
        const state = store.state;

        // 1. Check if Config changed
        const hasConfigChanged = 
            !prevConfigState ||
            state.templates !== prevConfigState.templates ||
            state.activeTemplateId !== prevConfigState.activeTemplateId ||
            state.maxRetries !== prevConfigState.maxRetries ||
            state.retryStatusCodes !== prevConfigState.retryStatusCodes ||
            state.stopOnFailure !== prevConfigState.stopOnFailure ||
            state.throttleDelayMs !== prevConfigState.throttleDelayMs ||
            state.rowIterations !== prevConfigState.rowIterations ||
            state.concurrency !== prevConfigState.concurrency ||
            state.columnMappings !== prevConfigState.columnMappings ||
            state.tableFilterConfig !== prevConfigState.tableFilterConfig ||
            state.currentView !== prevConfigState.currentView ||
            state.collections !== prevConfigState.collections ||
            state.environments !== prevConfigState.environments ||
            state.activeEnvironmentId !== prevConfigState.activeEnvironmentId ||
            state.apiTabs !== prevConfigState.apiTabs ||
            state.activeTabId !== prevConfigState.activeTabId ||
            state.agentProfiles !== prevConfigState.agentProfiles ||
            state.activeAgentProfileId !== prevConfigState.activeAgentProfileId ||
            state.agentChatMessages !== prevConfigState.agentChatMessages ||
            state.agentPanelPosition !== prevConfigState.agentPanelPosition ||
            state.agentPanelSize !== prevConfigState.agentPanelSize;

        // 2. Check if Data changed
        const hasDataChanged =
            !prevDataState ||
            state.fileData !== prevDataState.fileData ||
            state.originalData !== prevDataState.originalData ||
            state.headers !== prevDataState.headers ||
            state.headerTypes !== prevDataState.headerTypes ||
            state.fileName !== prevDataState.fileName;

        // 3. Check if Results changed
        const hasResultsChanged =
            !prevResultsState ||
            state.results !== prevResultsState.results;

        if (hasConfigChanged) {
            prevConfigState = {
                templates: state.templates,
                activeTemplateId: state.activeTemplateId,
                maxRetries: state.maxRetries,
                retryStatusCodes: state.retryStatusCodes,
                stopOnFailure: state.stopOnFailure,
                throttleDelayMs: state.throttleDelayMs,
                rowIterations: state.rowIterations,
                concurrency: state.concurrency,
                columnMappings: state.columnMappings,
                tableFilterConfig: state.tableFilterConfig,
                currentView: state.currentView,
                collections: state.collections,
                environments: state.environments,
                activeEnvironmentId: state.activeEnvironmentId,
                apiTabs: state.apiTabs,
                activeTabId: state.activeTabId,
                agentProfiles: state.agentProfiles,
                activeAgentProfileId: state.activeAgentProfileId,
                agentChatMessages: state.agentChatMessages,
                agentPanelPosition: state.agentPanelPosition,
                agentPanelSize: state.agentPanelSize
            };
            saveConfigDebounced();
        }

        if (hasDataChanged) {
            prevDataState = {
                fileData: state.fileData,
                originalData: state.originalData,
                headers: state.headers,
                headerTypes: state.headerTypes,
                fileName: state.fileName
            };
            saveDataDebounced();
        }

        if (hasResultsChanged) {
            prevResultsState = {
                results: state.results
            };
            saveResultsDebounced();
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

export const resetStore = async () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    await clearDB().catch((e) => console.error("Failed to clear DB on reset:", e));
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
        const importedFilterConfig = parsed.tableFilterConfig || {};
        const tableFilterConfig = {
            ...defaultState.tableFilterConfig,
            ...importedFilterConfig,
            columnFilters: {
                ...defaultState.tableFilterConfig.columnFilters,
                ...(importedFilterConfig.columnFilters || {})
            }
        };

        let columnMappings = parsed.columnMappings || defaultState.columnMappings;
        columnMappings = columnMappings.map((col: any) => ({
            ...col,
            id: col.id || `col_${generateId()}`
        }));

        const currentView = store.state.currentView;
        
        // Let import override all data (including agent configurations) with the imported file's data or defaults
        const agentProfiles = parsed.agentProfiles || defaultState.agentProfiles;
        const activeAgentProfileId = parsed.activeAgentProfileId || defaultState.activeAgentProfileId;
        const agentChatMessages = parsed.agentChatMessages || defaultState.agentChatMessages;
        const agentPanelPosition = parsed.agentPanelPosition !== undefined ? parsed.agentPanelPosition : defaultState.agentPanelPosition;
        const agentPanelSize = parsed.agentPanelSize !== undefined ? parsed.agentPanelSize : defaultState.agentPanelSize;

        store.setState(() => ({
            ...defaultState, // Start with default to ensure all keys are present
            ...parsed,
            columnMappings,
            tableFilterConfig,
            currentView,
            agentProfiles,
            activeAgentProfileId,
            agentChatMessages,
            agentPanelPosition,
            agentPanelSize
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
        let idx = newResults.findIndex((r) => r.rowId === rowId && (r.iteration ?? 1) === iteration && r.active !== false);
        if (idx === -1) {
            idx = newResults.findIndex((r) => r.rowId === rowId && (r.iteration ?? 1) === iteration);
        }
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
                active: true,
                timestamp: new Date().toISOString(),
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

export const setActiveResultInstance = (rowId: number, iteration: number, timestamp: string) => {
    store.setState((state) => {
        const matchingIndices = state.results
            .map((r, idx) => ({ r, idx }))
            .filter(({ r }) => r.rowId === rowId && (r.iteration ?? 1) === iteration);
            
        const newResults = [...state.results];
        matchingIndices.forEach(({ r, idx }, index) => {
            const rTimestamp = r.timestamp || `temp_${index}`;
            newResults[idx] = { ...r, active: rTimestamp === timestamp };
        });
        return { ...state, results: newResults };
    });
};

export const duplicateResultAsNewRow = (rowId: number, result: ExecutionResult, targetRowIndex?: number) => {
    store.setState((state) => {
        const insertIndex = targetRowIndex !== undefined ? targetRowIndex : state.fileData.length;
        
        const newFileData = [...state.fileData];
        const rowToCopy = state.fileData[rowId] ? { ...state.fileData[rowId] } : {};
        newFileData.splice(insertIndex, 0, rowToCopy);
        
        const newOriginalData = [...state.originalData];
        const originalRowToCopy = state.originalData[rowId] ? { ...state.originalData[rowId] } : {};
        newOriginalData.splice(insertIndex, 0, originalRowToCopy);
        
        const newResults = state.results.map((r) => {
            if (r.rowId >= insertIndex) {
                return { ...r, rowId: r.rowId + 1 };
            }
            return r;
        });
        
        const newResult: ExecutionResult = {
            ...result,
            rowId: insertIndex,
            iteration: 1,
            active: true,
            timestamp: new Date().toISOString()
        };
        
        return {
            ...state,
            fileData: newFileData,
            originalData: newOriginalData,
            results: [...newResults, newResult]
        };
    });
};

export const saveRerunResult = (
    rowId: number,
    iteration: number,
    stepId: string,
    updatedStepResult: StepResult,
    newTimestamp: string
) => {
    store.setState((state) => {
        const matching = state.results.filter(r => r.rowId === rowId && (r.iteration ?? 1) === iteration);
        const baseResult = matching.find(r => r.active) || matching[matching.length - 1];
        
        if (!baseResult) return state;
        
        const updatedSteps = baseResult.steps.map(s => {
            if (s.stepId === stepId || (stepId === "legacy" && baseResult.steps.length === 0)) {
                return updatedStepResult;
            }
            return s;
        });
        
        const chainFailed = updatedSteps.some(s => s.error);
        const lastStep = updatedSteps[updatedSteps.length - 1];
        const totalTime = updatedSteps.reduce((acc, s) => acc + s.responseTimeMs, 0);
        
        const newResult: ExecutionResult = {
            ...baseResult,
            status: chainFailed ? "error" : "success",
            statusCode: lastStep?.statusCode ?? updatedStepResult.statusCode,
            responseTimeMs: totalTime || updatedStepResult.responseTimeMs,
            requestUrl: updatedSteps[0]?.requestUrl ?? updatedStepResult.requestUrl,
            requestMethod: updatedSteps[0]?.requestMethod ?? updatedStepResult.requestMethod,
            requestHeaders: updatedSteps[0]?.requestHeaders ?? updatedStepResult.requestHeaders,
            requestParams: updatedSteps[0]?.requestParams ?? updatedStepResult.requestParams,
            requestBody: updatedSteps[0]?.requestBody ?? updatedStepResult.requestBody,
            responseBody: lastStep?.responseBody ?? updatedStepResult.responseBody,
            responseHeaders: lastStep?.responseHeaders ?? updatedStepResult.responseHeaders,
            responseType: lastStep?.responseType ?? updatedStepResult.responseType,
            responseRedirected: lastStep?.responseRedirected ?? updatedStepResult.responseRedirected,
            responseStatusText: lastStep?.responseStatusText ?? updatedStepResult.responseStatusText,
            ipAddress: lastStep?.ipAddress ?? updatedStepResult.ipAddress,
            error: chainFailed ? updatedSteps.filter(s => s.error).map(s => s.error).join("; ") : undefined,
            steps: updatedSteps,
            timestamp: newTimestamp,
            active: true
        };
        
        const newResults = state.results.map((r) => {
            if (r.rowId === rowId && (r.iteration ?? 1) === iteration) {
                return { ...r, active: false };
            }
            return r;
        });
        
        return {
            ...state,
            results: [...newResults, newResult]
        };
    });
};

export const setColumnMappings = (mappings: ColumnMapping[]) => {
    const sanitizedMappings = mappings.map((col) => ({
        ...col,
        id: col.id || `col_${generateId()}`
    }));
    store.setState((state) => {
        const activeIds = new Set(sanitizedMappings.map((col) => col.id!));
        const newFilters = { ...state.tableFilterConfig.columnFilters };
        let filtersChanged = false;
        Object.keys(newFilters).forEach(key => {
            if (!activeIds.has(key)) {
                delete newFilters[key];
                filtersChanged = true;
            }
        });
        
        let newSortBy = state.tableFilterConfig.sortBy;
        if (newSortBy && !activeIds.has(newSortBy)) {
            newSortBy = null;
        }

        return {
            ...state,
            columnMappings: sanitizedMappings,
            tableFilterConfig: {
                ...state.tableFilterConfig,
                columnFilters: newFilters,
                sortBy: newSortBy
            }
        };
    });
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

export const setConcurrencyLimit = (val: number) => {
    store.setState((state) => ({ ...state, concurrency: val }));
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

export const saveAgentProfiles = (profiles: AgentProfile[], activeId: string) => {
    store.setState((state) => ({
        ...state,
        agentProfiles: profiles,
        activeAgentProfileId: activeId
    }));
};

export const setActiveAgentProfileId = (activeId: string) => {
    store.setState((state) => ({
        ...state,
        activeAgentProfileId: activeId
    }));
};

export const setAgentChatMessages = (messages: Message[] | ((prev: Message[]) => Message[])) => {
    store.setState((state) => ({
        ...state,
        agentChatMessages: typeof messages === "function" ? messages(state.agentChatMessages) : messages
    }));
};

export const setAgentPanelPosition = (pos: { x: number; y: number } | null) => {
    store.setState((state) => ({
        ...state,
        agentPanelPosition: pos
    }));
};

export const setAgentPanelSize = (size: { width: number; height: number } | null) => {
    store.setState((state) => ({
        ...state,
        agentPanelSize: size
    }));
};

export const saveCheckpoint = async (messageId: string, stateSnapshot: any) => {
    await saveToDB(stateSnapshot, `checkpoint_${messageId}`);
};

export const loadCheckpoint = async (messageId: string) => {
    return await loadFromDB(`checkpoint_${messageId}`);
};

export const deleteCheckpoint = async (messageId: string) => {
    await deleteFromDB(`checkpoint_${messageId}`);
};






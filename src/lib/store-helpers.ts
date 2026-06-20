import {
    type RequestTemplate,
    type ExecutionResult,
    type ColumnMapping,
    type TableFilterConfig,
    type ApiCollection,
    type Environment,
    type RequestTab,
    type ApiRequest,
    type AgentProfile,
    type Message
} from "./schema";

export type VariableType = "string" | "number" | "boolean";

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

export function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

export function createDefaultTemplate(name?: string, id?: string): RequestTemplate {
    return {
        id: id || generateId(),
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
        enabled: true,
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
        activeSubTab: "params",
    };
}

export function resolveTableFilterConfig(defaultState: AppState, imported?: any): TableFilterConfig {
    const importedFilterConfig = imported || {};
    return {
        ...defaultState.tableFilterConfig,
        ...importedFilterConfig,
        columnFilters: {
            ...defaultState.tableFilterConfig.columnFilters,
            ...(importedFilterConfig.columnFilters || {})
        }
    };
}

export function resolveColumnMappings(defaultState: AppState, columnMappings?: any[]): ColumnMapping[] {
    const list = columnMappings || defaultState.columnMappings;
    return list.map((col: any) => ({
        ...col,
        id: col.id || `col_${generateId()}`
    }));
}

export const getConfigStateSnapshot = (state: AppState, resetResponse = false) => ({
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
    apiTabs: resetResponse
        ? (state.apiTabs || []).map(tab => ({ ...tab, response: null }))
        : state.apiTabs,
    activeTabId: state.activeTabId,
    agentProfiles: state.agentProfiles,
    activeAgentProfileId: state.activeAgentProfileId,
    agentChatMessages: state.agentChatMessages,
    agentPanelPosition: state.agentPanelPosition,
    agentPanelSize: state.agentPanelSize
});

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

export const applyTypes = (data: Array<Record<string, any>>, types: Record<string, VariableType>): Array<Record<string, any>> => {
    return data.map(row => {
        const newRow = { ...row };
        Object.keys(types).forEach(header => {
            newRow[header] = castValue(row[header], types[header]);
        });
        return newRow;
    });
};

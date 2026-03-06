import { Store } from "@tanstack/react-store";
import { type RequestTemplate, type ExecutionResult } from "./schema";

export type VariableType = "string" | "number" | "boolean";

function generateId(): string {
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
        body: "{\n  \n}",
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
};

const LOCAL_STORAGE_KEY = "surge_api_workspace";

const initialTemplate = createDefaultTemplate();

const defaultState: AppState = {
    originalData: [],
    fileData: [],
    headers: [],
    headerTypes: {},
    templates: [initialTemplate],
    activeTemplateId: initialTemplate.id,
    results: [],
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
        // Don't persist large results for now to keep localStorage small, or persist everything?
        // Let's persist everything but be mindful of limits.
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn("Storage limit reached, results might not be saved.");
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
    store.setState(() => defaultState);
};

export const exportState = () => {
    const state = store.state;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `surge-workspace-${new Date().toISOString().split('T')[0]}.json`;
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
        store.setState(() => ({
            ...defaultState, // Start with default to ensure all keys are present
            ...parsed
        }));
    } catch (e) {
        alert("Failed to import: " + (e instanceof Error ? e.message : "Unknown error"));
    }
};

// --- File data actions ---

export const setFileData = (data: Array<Record<string, any>>, headers: string[]) => {
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

// --- Results actions ---

export const setResults = (results: ExecutionResult[]) => {
    store.setState((state) => ({
        ...state,
        results,
    }));
};

export const updateResultByRowId = (rowId: number, resultUpdate: Partial<ExecutionResult>) => {
    store.setState((state) => {
        const newResults = [...state.results];
        const idx = newResults.findIndex((r) => r.rowId === rowId);
        if (idx !== -1) {
            newResults[idx] = { ...newResults[idx], ...resultUpdate };
        } else {
            newResults.push({
                rowId,
                status: "success",
                statusCode: 0,
                responseTimeMs: 0,
                requestBody: null,
                responseBody: null,
                steps: [],
                ...resultUpdate
            } as ExecutionResult);
            newResults.sort((a, b) => a.rowId - b.rowId);
        }
        return { ...state, results: newResults };
    });
};

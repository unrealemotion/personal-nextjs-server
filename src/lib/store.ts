import { Store } from "@tanstack/react-store";
import { type RequestTemplate, type ExecutionResult } from "./schema";

export type VariableType = "string" | "number" | "boolean";

export type AppState = {
    fileData: Array<Record<string, any>>;
    headers: string[];
    headerTypes: Record<string, VariableType>;
    template: RequestTemplate;
    results: ExecutionResult[];
};

export const store = new Store<AppState>({
    fileData: [],
    headers: [],
    headerTypes: {},
    template: {
        method: "GET",
        url: "",
        params: [],
        headers: [],
        body: "{\n  \n}",
    },
    results: [],
});

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
        fileData: data,
        headers,
        headerTypes,
        results: [], // reset results on new upload
    }));
};

export const setHeaderType = (header: string, type: VariableType) => {
    store.setState((state) => {
        const newTypes = { ...state.headerTypes, [header]: type };

        // Recast all data rows for that column globally
        const newData = state.fileData.map(row => {
            const newRow = { ...row };
            const val = newRow[header];
            if (val !== undefined && val !== null && val !== "") {
                if (type === "string") {
                    newRow[header] = String(val);
                } else if (type === "number") {
                    const parsed = Number(val);
                    if (!isNaN(parsed)) newRow[header] = parsed;
                } else if (type === "boolean") {
                    if (typeof val === "string") {
                        const low = val.toLowerCase();
                        newRow[header] = low === "true" || low === "1";
                    } else {
                        newRow[header] = Boolean(val);
                    }
                }
            }
            return newRow;
        });

        return { ...state, headerTypes: newTypes, fileData: newData };
    });
};

export const updateTemplate = (updates: Partial<RequestTemplate>) => {
    store.setState((state) => ({
        ...state,
        template: {
            ...state.template,
            ...updates,
        },
    }));
};

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
                ...resultUpdate
            } as ExecutionResult);
            newResults.sort((a, b) => a.rowId - b.rowId);
        }
        return { ...state, results: newResults };
    });
};

import { useState, useEffect, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { 
    store, 
    saveAgentProfiles, 
    setActiveAgentProfileId, 
    setActiveEnvironmentId,
    setActiveTabId,
    setActiveSubTab,
    setAgentChatMessages, 
    setColumnMappings, 
    setTableFilterConfig,
    saveCheckpoint,
    loadCheckpoint,
    deleteCheckpoint,
    generateId,
    createDefaultApiRequest,
    addEnvironment,
    updateEnvironment,
    saveCollectionRequest,
    openRequestInTab,
    exportState,
    updateCollection,
    addCollection,
    deleteCollection,
    closeApiTab,
    updateTabResponse,
    updateTabLoading,
    setAgentPanelSize
} from "@/lib/store";
import { addItemToCollectionTree, stripJsonComments } from "@/lib/utils";
import { simulateRowExecutionChain } from "@/lib/agent-executor";
import { runBulkExecution } from "@/lib/executor";
import { toast } from "sonner";
import { callLLM } from "./agent-adapters";
import { type AgentProfile, type Message, type KeyValuePair } from "@/lib/schema";
import { WELCOME_MESSAGE } from "./agent-prompts";
import { getAgentTools } from "./tools";
import { resolveVariables, runPreRequestScript, runTestScript } from "@/lib/sandbox";
import { sendToExtension } from "@/lib/extension";

export function useAgent() {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<"chat" | "settings">("chat");
    const messages = useStore(store, (state) => state.agentChatMessages || []);
    const setMessages = setAgentChatMessages;
    const agentPanelPosition = useStore(store, (state) => state.agentPanelPosition);
    const agentPanelSize = useStore(store, (state) => state.agentPanelSize);
    const [revertTargetId, setRevertTargetId] = useState<string | null>(null);
    const [hasCheckpoint, setHasCheckpoint] = useState(false);
    const [revertCheckpointData, setRevertCheckpointData] = useState<any | null>(null);
    const [shouldRevertModification, setShouldRevertModification] = useState(true);
    const [input, setInput] = useState("");
    const [messageQueue, setMessageQueue] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeToolName, setActiveToolName] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const isClearingChatRef = useRef(false);

    // Load state store variables for conditional prompt suggestions
    const fileData = useStore(store, (state) => state.fileData);
    const results = useStore(store, (state) => state.results);

    // Load profiles from tanstack store
    const storeProfiles = useStore(store, (state) => state.agentProfiles);
    const storeActiveProfileId = useStore(store, (state) => state.activeAgentProfileId);

    const activeProfile = storeProfiles.find(p => p.id === storeActiveProfileId) || storeProfiles[0];

    // Local editing state for settings staging
    const [tempProfiles, setTempProfiles] = useState<AgentProfile[]>([]);
    const [tempActiveProfileId, setTempActiveProfileId] = useState<string | null>(null);
    const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const handleActiveProfileIdChange = (id: string | null) => {
        setTempActiveProfileId(id);
        if (id && storeProfiles.some(p => p.id === id)) {
            setActiveAgentProfileId(id);
        }
    };

    // Debounced check for unsaved edits
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsDirty(!areProfilesEqual(tempProfiles, storeProfiles));
        }, 150);
        return () => clearTimeout(timer);
    }, [tempProfiles, storeProfiles]);

    // Sync store configuration to local state when view switches to settings or when global store is updated (e.g. clear/import)
    useEffect(() => {
        if (view === "settings") {
            setTempProfiles(storeProfiles);
            setTempActiveProfileId(storeActiveProfileId);
            setEditingProfileId(storeActiveProfileId);
            setIsDirty(false);
        }
    }, [view, storeProfiles, storeActiveProfileId]); // Runs on transitions OR on global clear/import updates

    // Sync active profile selection to staging state when in chat view (e.g. from header selector)
    useEffect(() => {
        if (view === "chat") {
            setTempActiveProfileId(storeActiveProfileId);
        }
    }, [view, storeActiveProfileId]);

    // Mount initializer removed (welcome message is now defined in defaultState in store.ts to enable conversation persistence)

    // Save configurations to TanStack store
    const saveConfig = (newProfiles: AgentProfile[], activeId: string) => {
        saveAgentProfiles(newProfiles, activeId);
        const savedProfile = newProfiles.find(p => p.id === activeId);
        if (savedProfile) {
            toast.success(`Configuration saved for profile: ${savedProfile.name}`);
        } else {
            toast.success("Agent configuration saved successfully");
        }
    };

    // Unified client-side local tools execution runner
    const runToolHandler = async (name: string, args: any): Promise<any> => {
        setActiveToolName(name);
        try {
            const currentView = store.state.currentView || "bulk";
            const allowedTools = getAgentTools(currentView);
            
            if (!allowedTools.some(t => t.function.name === name)) {
                return { error: `Tool '${name}' is not permitted in the current '${currentView === "api_client" ? "API Client" : "Bulk Runner"}' tab. Please instruct the user to switch tabs if they need you to perform this action.` };
            }

            switch (name) {
                case "get_row_status": {
                    const rowId = Number(args.rowId);
                    if (isNaN(rowId)) return { error: "rowId must be a valid integer." };
                    const rowResults = results.filter(r => r.rowId === rowId && r.active !== false);
                    if (rowResults.length === 0) {
                        return { error: `Row ${rowId} has not been executed yet or has no active results.` };
                    }
                    return rowResults.map(r => ({
                        rowId: r.rowId,
                        status: r.status,
                        statusCode: r.statusCode,
                        responseTimeMs: r.responseTimeMs,
                        error: r.error,
                        steps: r.steps?.map(s => ({
                            stepId: s.stepId,
                            stepName: s.stepName,
                            statusCode: s.statusCode,
                            responseTimeMs: s.responseTimeMs,
                            error: s.error,
                            responseBodyPreview: typeof s.responseBody === 'object' 
                                ? JSON.stringify(s.responseBody).substring(0, 250) 
                                : String(s.responseBody || '').substring(0, 250)
                        }))
                    }));
                }
                case "search_data": {
                    const query = String(args.query || "").toLowerCase();
                    if (!query) return { error: "Query is required for search." };
                    const matches = [];
                    for (let i = 0; i < fileData.length; i++) {
                        const row = fileData[i];
                        const rowStr = JSON.stringify(row).toLowerCase();
                        if (rowStr.includes(query)) {
                            matches.push({ rowId: i, row });
                            if (matches.length >= 10) break; // cap search preview size
                        }
                    }
                    return { matchesCount: matches.length, totalRows: fileData.length, matches };
                }
                case "read_row_data": {
                    const rowId = Number(args.rowId);
                    if (isNaN(rowId)) return { error: "rowId must be a valid integer." };
                    if (rowId < 0 || rowId >= fileData.length) {
                        return { error: `Row ID ${rowId} is out of bounds (0 to ${fileData.length - 1}).` };
                    }
                    return { rowId, data: fileData[rowId] };
                }
                case "inspect_input_data": {
                    const startRow = args.startRow !== undefined ? Number(args.startRow) : 0;
                    const endRow = args.endRow !== undefined ? Number(args.endRow) : (startRow + 49);
                    const columns: string[] = Array.isArray(args.columns) ? args.columns : [];

                    if (isNaN(startRow) || startRow < 0) {
                        return { error: "startRow must be a non-negative integer." };
                    }
                    if (isNaN(endRow) || endRow < 0) {
                        return { error: "endRow must be a non-negative integer." };
                    }
                    if (startRow > endRow) {
                        return { error: "startRow cannot be greater than endRow." };
                    }

                    const state = store.state;
                    const totalRows = state.fileData.length;
                    const headers = state.headers || [];

                    // Adjust range to bounds
                    const finalStart = Math.min(startRow, Math.max(0, totalRows - 1));
                    const finalEnd = Math.min(endRow, Math.max(0, totalRows - 1));

                    const rows = [];
                    if (totalRows > 0) {
                        for (let i = finalStart; i <= finalEnd; i++) {
                            const originalRow = state.fileData[i];
                            if (!originalRow) continue;

                            let rowData: Record<string, any> = {};
                            if (columns.length > 0) {
                                columns.forEach(col => {
                                    if (originalRow[col] !== undefined) {
                                        rowData[col] = originalRow[col];
                                    }
                                });
                            } else {
                                rowData = { ...originalRow };
                            }
                            rows.push({
                                rowId: i,
                                data: rowData
                            });
                        }
                    }

                    return {
                        totalRows,
                        headers,
                        retrievedStartRow: finalStart,
                        retrievedEndRow: finalEnd,
                        rowCount: rows.length,
                        rows
                    };
                }
                case "get_execution_config": {
                    const state = store.state;
                    const validated = validateTemplateVariables(state.templates, state);
                    return {
                        maxRetries: state.maxRetries,
                        retryStatusCodes: state.retryStatusCodes,
                        stopOnFailure: state.stopOnFailure,
                        throttleDelayMs: state.throttleDelayMs,
                        rowIterations: state.rowIterations,
                        concurrency: state.concurrency ?? 2,
                        templates: state.templates.map(t => {
                            const valInfo = validated.find(v => v.id === t.id);
                            return {
                                id: t.id,
                                name: t.name,
                                method: t.method,
                                url: t.url,
                                headers: t.headers.filter(h => h.key),
                                params: t.params?.filter(p => p.key),
                                bodyMode: t.body?.mode || "none",
                                bodyRaw: t.body?.raw || "",
                                invalidVariables: valInfo?.invalidVariables
                            };
                        })
                    };
                }
                case "simulate_row_execution": {
                    const rowId = Number(args.rowId);
                    if (isNaN(rowId)) return { error: "rowId must be a valid integer." };
                    if (rowId < 0 || rowId >= fileData.length) {
                        return { error: `Row ID ${rowId} is out of bounds.` };
                    }
                    const row = fileData[rowId];
                    const state = store.state;
                    const templates = state.templates;
                    if (templates.length === 0) {
                        return { error: "No request templates defined in the workspace." };
                    }

                    const steps = await simulateRowExecutionChain(
                        row,
                        templates,
                        state.maxRetries,
                        state.retryStatusCodes,
                        state.stopOnFailure
                    );

                    return {
                        rowId,
                        status: steps.some(s => s.error) ? "error" : "success",
                        steps: steps.map(s => ({
                            stepName: s.stepName,
                            statusCode: s.statusCode,
                            responseTimeMs: s.responseTimeMs,
                            requestUrl: s.requestUrl,
                            requestMethod: s.requestMethod,
                            requestHeaders: s.requestHeaders,
                            requestBody: s.requestBody,
                            responseHeaders: s.responseHeaders,
                            responseBody: typeof s.responseBody === 'object'
                                ? JSON.stringify(s.responseBody).substring(0, 500)
                                : String(s.responseBody || '').substring(0, 500),
                            error: s.error
                        }))
                    };
                }
                case "check_extension_connection": {
                    const active = typeof document !== "undefined" && 
                        document.documentElement.getAttribute("data-surge-extension-active") === "true";
                    return {
                        connected: active,
                        installationUrl: "https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf",
                        message: active 
                            ? "The Surge API Request Helper chrome extension is connected and active. You can run requests without CORS issues!"
                            : "The extension is NOT connected or inactive. To install it, go to the [Chrome Web Store](https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf). If already installed, open browser extensions settings (chrome://extensions/), locate the Surge API Request Helper extension, verify that it says \"Enabled\" and not blocked (check if browser settings/policies customize allowed/blocking extensions), and reload the page tab to activate it."
                    };
                }
                case "read_console_logs": {
                    const limit = args.limit !== undefined ? Number(args.limit) : 100;
                    const level = args.level || "all";
                    
                    if (isNaN(limit) || limit <= 0) {
                        return { error: "limit must be a positive integer." };
                    }
                    
                    const logs = (typeof window !== "undefined" ? (window as any).__SURGE_CONSOLE_LOGS__ : []) || [];
                    const filteredLogs = level === "all" 
                        ? logs 
                        : logs.filter((l: any) => l.type === level);
                        
                    // Slice the most recent logs
                    const slicedLogs = filteredLogs.slice(-limit);
                    return {
                        totalCaptured: logs.length,
                        returnedCount: slicedLogs.length,
                        levelFilter: level,
                        limitRequested: limit,
                        logs: slicedLogs
                    };
                }
                case "switch_tab": {
                    const tab = args.tab;
                    if (tab !== "bulk" && tab !== "api_client") {
                        return { error: "Invalid tab specified. Must be 'bulk' or 'api_client'." };
                    }
                    store.setState(s => ({ ...s, currentView: tab }));
                    return { success: true, message: `Switched tab to ${tab === 'api_client' ? 'API Client' : 'Bulk Runner'} successfully.` };
                }
                case "select_active_item": {
                    const results: string[] = [];
                    let targetTabIdForSubTab = args.tabId || store.state.activeTabId;

                    if (args.environmentId !== undefined) {
                        const envId = (args.environmentId === "null" || args.environmentId === null || args.environmentId === "") ? null : args.environmentId;
                        setActiveEnvironmentId(envId);
                        results.push(`Environment active profile set to ${envId ? `'${envId}'` : 'none'}.`);
                    }
                    if (args.tabId !== undefined && args.tabId !== null) {
                        const tab = store.state.apiTabs.find(t => t.id === args.tabId);
                        if (!tab) {
                            return { error: `Tab '${args.tabId}' not found.` };
                        }
                        setActiveTabId(args.tabId);
                        results.push(`Active tab switched to '${args.tabId}' (${tab.name}).`);
                    }
                    if (args.requestId !== undefined && args.requestId !== null) {
                        let foundRequest: any = null;
                        for (const col of store.state.collections) {
                            const search = (items: any[]): any => {
                                for (const item of items) {
                                    if (item.id === args.requestId) return item;
                                    if (item.items) {
                                        const found = search(item.items);
                                        if (found) return found;
                                    }
                                }
                                return null;
                            };
                            foundRequest = search(col.items);
                            if (foundRequest) break;
                        }
                        if (!foundRequest) {
                            return { error: `Request '${args.requestId}' not found in collections.` };
                        }
                        openRequestInTab(foundRequest, foundRequest.id);
                        const openedTab = store.state.apiTabs.find(t => t.requestId === args.requestId);
                        if (openedTab) {
                            targetTabIdForSubTab = openedTab.id;
                        }
                        results.push(`Request '${foundRequest.name}' (${args.requestId}) opened in active tab.`);
                    }
                    if (args.activeSubTab !== undefined && args.activeSubTab !== null) {
                        const targetId = targetTabIdForSubTab || store.state.activeTabId;
                        if (targetId) {
                            setActiveSubTab(targetId, args.activeSubTab);
                            results.push(`Sub-tab switched to '${args.activeSubTab}'.`);
                        } else {
                            results.push(`Could not switch sub-tab because no active tab was resolved.`);
                        }
                    }
                    if (results.length === 0) {
                        return { error: "No selection parameters provided. Please provide environmentId, tabId, requestId, or activeSubTab." };
                    }
                    return { success: true, message: results.join(" ") };
                }
                case "get_collections": {
                    return store.state.collections;
                }
                case "modify_collections": {
                    const operations = args.operations;
                    if (!Array.isArray(operations) || operations.length === 0) {
                        return { error: "operations must be a non-empty array." };
                    }
                    
                    const deleteItemFromTree = (items: any[], itemId: string): { success: boolean; newItems: any[] } => {
                        let found = false;
                        const updated = items.filter(item => {
                            if (item.id === itemId) {
                                found = true;
                                return false;
                            }
                            return true;
                        }).map(item => {
                            if (item.items) {
                                const res = deleteItemFromTree(item.items, itemId);
                                if (res.success) {
                                    found = true;
                                    return { ...item, items: res.newItems };
                                }
                            }
                            return item;
                        });
                        return { success: found, newItems: updated };
                    };

                    const findAndRemoveItem = (collections: any[], itemId: string): { foundItem: any; newCollections: any[] } => {
                        let foundItem: any = null;
                        const newCollections = collections.map(col => {
                            const searchAndRemove = (items: any[]): { success: boolean; newItems: any[] } => {
                                let found = false;
                                const filtered = items.filter(item => {
                                    if (item.id === itemId) {
                                        found = true;
                                        foundItem = item;
                                        return false;
                                    }
                                    return true;
                                });
                                if (found) {
                                    return { success: true, newItems: filtered };
                                }
                                
                                const mapped = items.map(item => {
                                    if (item.items) {
                                        const res = searchAndRemove(item.items);
                                        if (res.success) {
                                            found = true;
                                            return { ...item, items: res.newItems };
                                        }
                                    }
                                    return item;
                                });
                                return { success: found, newItems: mapped };
                            };
                            
                            const res = searchAndRemove(col.items);
                            if (res.success) {
                                return { ...col, items: res.newItems };
                            }
                            return col;
                        });
                        return { foundItem, newCollections };
                    };

                    const results: any[] = [];
                    for (let i = 0; i < operations.length; i++) {
                        const op = operations[i];
                        try {
                            if (op.action === "create_collection") {
                                if (!op.collectionName) {
                                    results.push({ index: i, success: false, error: "collectionName is required to create a collection." });
                                    continue;
                                }
                                const colId = op.collectionId || generateId();
                                const newCol = {
                                    id: colId,
                                    name: op.collectionName,
                                    items: [],
                                    variables: []
                                };
                                addCollection(newCol);
                                results.push({ index: i, success: true, message: `Collection '${op.collectionName}' created.`, collectionId: colId });
                            } else if (op.action === "delete_collection") {
                                if (!op.collectionId) {
                                    results.push({ index: i, success: false, error: "collectionId is required to delete a collection." });
                                    continue;
                                }
                                deleteCollection(op.collectionId);
                                results.push({ index: i, success: true, message: `Collection '${op.collectionId}' deleted.` });
                            } else if (op.action === "update_collection") {
                                if (!op.collectionId || !op.collectionName) {
                                    results.push({ index: i, success: false, error: "collectionId and collectionName are required to rename/update a collection." });
                                    continue;
                                }
                                updateCollection(op.collectionId, { name: op.collectionName });
                                results.push({ index: i, success: true, message: `Collection renamed to '${op.collectionName}'.` });
                            } else if (op.action === "create_folder") {
                                const folderName = op.folderName || "New Folder";
                                const folderId = generateId();
                                const newFolder = {
                                    id: folderId,
                                    name: folderName,
                                    items: []
                                };
                                const targetParentId = op.folderId || op.collectionId;
                                if (!targetParentId) {
                                    results.push({ index: i, success: false, error: "collectionId or folderId is required to create a folder." });
                                    continue;
                                }
                                
                                const col = store.state.collections.find(c => c.id === targetParentId);
                                if (col) {
                                    updateCollection(targetParentId, { items: [...col.items, newFolder] });
                                    results.push({ index: i, success: true, message: `Folder '${folderName}' created in collection '${col.name}'.`, folderId });
                                } else {
                                    let inserted = false;
                                    store.setState(s => {
                                        const newCols = s.collections.map(c => {
                                            const res = addItemToCollectionTree(c.items, targetParentId, newFolder);
                                            if (res.success) {
                                                inserted = true;
                                                return { ...c, items: res.newItems };
                                            }
                                            return c;
                                        });
                                        return { ...s, collections: newCols };
                                    });
                                    if (inserted) {
                                        results.push({ index: i, success: true, message: `Folder '${folderName}' created inside parent folder '${targetParentId}'.`, folderId });
                                    } else {
                                        results.push({ index: i, success: false, error: `Parent folder or collection '${targetParentId}' not found.` });
                                    }
                                }
                            } else if (op.action === "update_folder") {
                                if (!op.folderId || !op.folderName) {
                                    results.push({ index: i, success: false, error: "folderId and folderName are required to update/rename a folder." });
                                    continue;
                                }
                                let renamed = false;
                                store.setState(s => {
                                    const renameInTree = (items: any[]): any[] => {
                                        return items.map(item => {
                                            if (item.id === op.folderId) {
                                                renamed = true;
                                                return { ...item, name: op.folderName };
                                            }
                                            if (item.items) {
                                                return { ...item, items: renameInTree(item.items) };
                                            }
                                            return item;
                                        });
                                    };
                                    return {
                                        ...s,
                                        collections: s.collections.map(c => ({
                                            ...c,
                                            items: renameInTree(c.items)
                                        }))
                                    };
                                });
                                if (renamed) {
                                    results.push({ index: i, success: true, message: `Folder renamed to '${op.folderName}'.` });
                                } else {
                                    results.push({ index: i, success: false, error: `Folder '${op.folderId}' not found.` });
                                }
                            } else if (op.action === "delete_folder" || op.action === "delete_request") {
                                const itemId = op.folderId || op.requestId;
                                if (!itemId) {
                                    results.push({ index: i, success: false, error: "folderId or requestId is required to delete." });
                                    continue;
                                }
                                let deleted = false;
                                store.setState(s => {
                                    const newCols = s.collections.map(c => {
                                        const res = deleteItemFromTree(c.items, itemId);
                                        if (res.success) {
                                            deleted = true;
                                            return { ...c, items: res.newItems };
                                        }
                                        return c;
                                    });
                                    return { ...s, collections: newCols };
                                });
                                if (deleted) {
                                    results.push({ index: i, success: true, message: `Item '${itemId}' successfully deleted.` });
                                } else {
                                    results.push({ index: i, success: false, error: `Item '${itemId}' not found in collections.` });
                                }
                            } else if (op.action === "move_item") {
                                if (!op.itemId || !op.targetParentId) {
                                    results.push({ index: i, success: false, error: "itemId and targetParentId are required to move an item." });
                                    continue;
                                }
                                const { foundItem, newCollections } = findAndRemoveItem(store.state.collections, op.itemId);
                                if (!foundItem) {
                                    results.push({ index: i, success: false, error: `Item '${op.itemId}' not found to move.` });
                                    continue;
                                }
                                
                                // Check if target is a collection root
                                const targetCol = newCollections.find(c => c.id === op.targetParentId);
                                if (targetCol) {
                                    const updated = newCollections.map(c => {
                                        if (c.id === op.targetParentId) {
                                            return { ...c, items: [...c.items, foundItem] };
                                        }
                                        return c;
                                    });
                                    store.setState(s => ({ ...s, collections: updated }));
                                    results.push({ index: i, success: true, message: `Item moved to collection '${targetCol.name}' root.` });
                                } else {
                                    // Target must be a folder
                                    let inserted = false;
                                    const updated = newCollections.map(c => {
                                        const res = addItemToCollectionTree(c.items, op.targetParentId!, foundItem);
                                        if (res.success) {
                                            inserted = true;
                                            return { ...c, items: res.newItems };
                                        }
                                        return c;
                                    });
                                    if (inserted) {
                                        store.setState(s => ({ ...s, collections: updated }));
                                        results.push({ index: i, success: true, message: `Item moved inside folder '${op.targetParentId}'.` });
                                    } else {
                                        results.push({ index: i, success: false, error: `Target collection or folder '${op.targetParentId}' not found.` });
                                    }
                                }
                            } else {
                                results.push({ index: i, success: false, error: `Invalid action '${op.action}'.` });
                            }
                        } catch (err: any) {
                            results.push({ index: i, success: false, error: err.message || "Unknown error occurred." });
                        }
                    }
                    return results;
                }
                case "get_open_tabs": {
                    return store.state.apiTabs.map(t => ({
                        id: t.id,
                        name: t.name,
                        method: t.request.method,
                        url: t.request.url,
                        isDirty: t.isDirty
                    }));
                }
                case "save_requests": {
                    const requests = args.requests;
                    if (!Array.isArray(requests) || requests.length === 0) {
                        return { error: "requests must be a non-empty array." };
                    }
                    const results: any[] = [];
                    for (let i = 0; i < requests.length; i++) {
                        const reqArgs = requests[i];
                        try {
                            if (reqArgs.action === "create") {
                                const req = createDefaultApiRequest(reqArgs.name || "New Request");
                                req.method = reqArgs.method || "GET";
                                req.url = reqArgs.url || "";
                                if (reqArgs.preRequestScript !== undefined) req.preRequestScript = reqArgs.preRequestScript;
                                if (reqArgs.testScript !== undefined) req.testScript = reqArgs.testScript;
                                openRequestInTab(req, req.id);
                                if (reqArgs.activeSubTab !== undefined) {
                                    const createdTab = store.state.apiTabs.find(t => t.requestId === req.id);
                                    if (createdTab) {
                                        setActiveSubTab(createdTab.id, reqArgs.activeSubTab);
                                    }
                                }
                                results.push({ index: i, success: true, message: `Request '${req.name}' created and opened in a new tab.` });
                            } else if (reqArgs.action === "update") {
                                if (!reqArgs.requestId) {
                                    results.push({ index: i, success: false, error: "requestId is required for update action." });
                                    continue;
                                }
                                const updates: any = {};
                                if (reqArgs.name !== undefined) updates.name = reqArgs.name;
                                if (reqArgs.method !== undefined) updates.method = reqArgs.method;
                                if (reqArgs.url !== undefined) updates.url = reqArgs.url;
                                if (reqArgs.headers !== undefined) updates.headers = reqArgs.headers;
                                if (reqArgs.params !== undefined) updates.params = reqArgs.params;
                                if (reqArgs.bodyMode !== undefined || reqArgs.bodyRaw !== undefined) {
                                    updates.body = { mode: reqArgs.bodyMode || "none", raw: reqArgs.bodyRaw || "" };
                                }
                                if (reqArgs.preRequestScript !== undefined) updates.preRequestScript = reqArgs.preRequestScript;
                                if (reqArgs.testScript !== undefined) updates.testScript = reqArgs.testScript;
                                saveCollectionRequest(reqArgs.requestId, updates);
                                store.setState(s => {
                                    const newTabs = s.apiTabs.map(t => {
                                        if (t.requestId === reqArgs.requestId || t.id === reqArgs.requestId) {
                                            return {
                                                ...t,
                                                name: updates.name !== undefined ? updates.name : t.name,
                                                request: { ...t.request, ...updates }
                                            };
                                        }
                                        return t;
                                    });
                                    return { ...s, apiTabs: newTabs };
                                });
                                
                                let targetTab = store.state.apiTabs.find(t => t.requestId === reqArgs.requestId || t.id === reqArgs.requestId);
                                if (!targetTab && (reqArgs.activateTab || reqArgs.activeSubTab !== undefined)) {
                                    let foundRequest: any = null;
                                    for (const col of store.state.collections) {
                                        const search = (items: any[]): any => {
                                            for (const item of items) {
                                                if (item.id === reqArgs.requestId) return item;
                                                if (item.items) {
                                                    const found = search(item.items);
                                                    if (found) return found;
                                                }
                                            }
                                            return null;
                                        };
                                        foundRequest = search(col.items);
                                        if (foundRequest) break;
                                    }
                                    if (foundRequest) {
                                        openRequestInTab(foundRequest, foundRequest.id);
                                        targetTab = store.state.apiTabs.find(t => t.requestId === reqArgs.requestId);
                                    }
                                }
                                
                                if (targetTab) {
                                    if (reqArgs.activateTab || reqArgs.activeSubTab !== undefined) {
                                        setActiveTabId(targetTab.id);
                                    }
                                    if (reqArgs.activeSubTab !== undefined) {
                                        setActiveSubTab(targetTab.id, reqArgs.activeSubTab);
                                    }
                                }
                                results.push({ index: i, success: true, message: `Request '${reqArgs.requestId}' updated in collection.` });
                            } else if (reqArgs.action === "save_tab") {
                                if (!reqArgs.tabId) {
                                    results.push({ index: i, success: false, error: "tabId is required for save_tab action." });
                                    continue;
                                }
                                const tab = store.state.apiTabs.find(t => t.id === reqArgs.tabId);
                                if (!tab) {
                                    results.push({ index: i, success: false, error: `Tab '${reqArgs.tabId}' not found.` });
                                    continue;
                                }

                                const exists = tab.requestId && store.state.collections.some(col => {
                                    const search = (items: any[]): boolean => {
                                        return items.some(item => {
                                            if (item.id === tab.requestId) return true;
                                            if (item.items) return search(item.items);
                                            return false;
                                        });
                                    };
                                    return search(col.items);
                                });
                                const isNew = !tab.requestId || !exists;

                                if (!isNew) {
                                    saveCollectionRequest(tab.requestId!, tab.request);
                                    store.setState(s => {
                                        const newTabs = s.apiTabs.map(t => {
                                            if (t.id === reqArgs.tabId) {
                                                return { ...t, isDirty: false };
                                            }
                                            return t;
                                        });
                                        return { ...s, apiTabs: newTabs };
                                    });
                                    results.push({ index: i, success: true, message: `Request '${tab.requestId}' saved.` });
                                } else {
                                    let targetColId = reqArgs.collectionId;
                                    if (targetColId && !store.state.collections.some(c => c.id === targetColId)) {
                                        targetColId = undefined;
                                    }

                                    const newReqId = tab.requestId || generateId();
                                    const requestName = reqArgs.name || tab.name;
                                    const newRequest = {
                                        ...tab.request,
                                        id: newReqId,
                                        name: requestName
                                    };

                                    if (reqArgs.newCollectionName) {
                                        const newColId = generateId();
                                        const newlyCreatedCol = {
                                            id: newColId,
                                            name: reqArgs.newCollectionName,
                                            items: [newRequest],
                                            variables: []
                                        };
                                        addCollection(newlyCreatedCol);
                                        
                                        store.setState(s => {
                                            const newTabs = s.apiTabs.map(t => {
                                                if (t.id === reqArgs.tabId) {
                                                    return { ...t, requestId: newReqId, name: requestName, isDirty: false };
                                                }
                                                return t;
                                            });
                                            return { ...s, apiTabs: newTabs };
                                        });

                                        results.push({ index: i, success: true, message: `Request saved as '${requestName}' in new collection '${reqArgs.newCollectionName}'.` });
                                    } else {
                                        if (!targetColId) {
                                            if (store.state.collections.length > 0) {
                                                targetColId = store.state.collections[0].id;
                                            } else {
                                                const newColId = generateId();
                                                const newlyCreatedCol = {
                                                    id: newColId,
                                                    name: "Default Collection",
                                                    items: [newRequest],
                                                    variables: []
                                                };
                                                addCollection(newlyCreatedCol);
                                                
                                                store.setState(s => {
                                                    const newTabs = s.apiTabs.map(t => {
                                                        if (t.id === reqArgs.tabId) {
                                                            return { ...t, requestId: newReqId, name: requestName, isDirty: false };
                                                        }
                                                        return t;
                                                    });
                                                    return { ...s, apiTabs: newTabs };
                                                });

                                                results.push({ index: i, success: true, message: `Request saved as '${requestName}' in new collection 'Default Collection'.` });
                                                continue;
                                            }
                                        }

                                        const col = store.state.collections.find(c => c.id === targetColId) || store.state.collections[store.state.collections.length - 1];
                                        if (!col) {
                                            results.push({ index: i, success: false, error: `Collection '${targetColId}' not found.` });
                                            continue;
                                        }

                                        let updatedItems = [];
                                        const targetFolderId = reqArgs.folderId || targetColId;

                                        if (targetFolderId === targetColId) {
                                            updatedItems = [...col.items, newRequest];
                                        } else {
                                            const res = addItemToCollectionTree(col.items, targetFolderId, newRequest);
                                            if (res.success) {
                                                updatedItems = res.newItems;
                                            } else {
                                                updatedItems = [...col.items, newRequest];
                                            }
                                        }

                                        updateCollection(targetColId, { items: updatedItems });

                                        store.setState(s => {
                                            const newTabs = s.apiTabs.map(t => {
                                                if (t.id === reqArgs.tabId) {
                                                    return { ...t, requestId: newReqId, name: requestName, isDirty: false };
                                                }
                                                return t;
                                            });
                                            return { ...s, apiTabs: newTabs };
                                        });

                                        results.push({ index: i, success: true, message: `Request saved as '${requestName}' in collection '${col.name}'.` });
                                    }
                                }
                                if (reqArgs.activateTab || reqArgs.activeSubTab !== undefined) {
                                    setActiveTabId(reqArgs.tabId);
                                }
                                if (reqArgs.activeSubTab !== undefined) {
                                    setActiveSubTab(reqArgs.tabId, reqArgs.activeSubTab);
                                }
                            } else if (reqArgs.action === "close_tab") {
                                if (!reqArgs.tabId) {
                                    results.push({ index: i, success: false, error: "tabId is required for close_tab action." });
                                    continue;
                                }
                                const tab = store.state.apiTabs.find(t => t.id === reqArgs.tabId);
                                if (!tab) {
                                    results.push({ index: i, success: false, error: `Tab '${reqArgs.tabId}' not found.` });
                                    continue;
                                }
                                closeApiTab(reqArgs.tabId);
                                results.push({ index: i, success: true, message: `Tab '${reqArgs.tabId}' closed.` });
                            }
                        } catch (err: any) {
                            results.push({ index: i, success: false, error: err.message || "Unknown error occurred." });
                        }
                    }
                    return results;
                }
                case "send_request": {
                    const tabId = args.tabId || store.state.activeTabId;
                    if (!tabId) return { error: "No open tab specified or active." };
                    
                    const tab = store.state.apiTabs.find(t => t.id === tabId);
                    if (!tab) return { error: `Tab '${tabId}' not found.` };
                    
                    const request = tab.request;
                    const requestId = tab.requestId;
                    
                    updateTabLoading(tabId, true);
                    const controller = new AbortController();
                    
                    try {
                        let collectionVars: KeyValuePair[] = [];
                        if (requestId) {
                            const parentCol = store.state.collections.find(c => {
                                const findInItems = (items: any[]): boolean => {
                                    return items.some(item => {
                                        if (item.id === requestId) return true;
                                        if (item.items) return findInItems(item.items);
                                        return false;
                                    });
                                };
                                return findInItems(c.items);
                            });
                            if (parentCol && parentCol.variables) {
                                collectionVars = parentCol.variables;
                            }
                        }
                        
                        let finalEnvironments = store.state.environments;
                        let addedHeaders: { key: string; value: string }[] = [];
                        
                        if (request.preRequestScript) {
                            const scriptRes = runPreRequestScript(
                                request.preRequestScript,
                                store.state.environments,
                                store.state.activeEnvironmentId,
                                collectionVars
                            );
                            finalEnvironments = scriptRes.updatedEnvironments;
                            addedHeaders = scriptRes.addedHeaders;
                            store.setState(s => ({ ...s, environments: finalEnvironments }));
                        }
                        
                        const interpolatedUrl = resolveVariables(
                            request.url,
                            finalEnvironments,
                            store.state.activeEnvironmentId,
                            collectionVars
                        );
                        
                        const headers = new Headers();
                        const rawHeadersMap: Record<string, string> = {};
                        
                        (request.headers || []).forEach(h => {
                            if (h.enabled !== false && h.key) {
                                const resolvedKey = resolveVariables(h.key, finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                const resolvedVal = resolveVariables(h.value, finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                headers.append(resolvedKey, resolvedVal);
                                rawHeadersMap[resolvedKey] = resolvedVal;
                            }
                        });
                        
                        addedHeaders.forEach(h => {
                            headers.append(h.key, h.value);
                            rawHeadersMap[h.key] = h.value;
                        });
                        
                        let fetchBody: any = null;
                        const mode = request.body?.mode || "none";
                        
                        if (request.method !== "GET" && request.method !== "HEAD") {
                            if (mode === "raw" && request.body?.raw) {
                                const rawBodyResolved = resolveVariables(request.body.raw, finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                const lang = request.body.rawLanguage || "json";
                                if (lang === "json") {
                                    fetchBody = stripJsonComments(rawBodyResolved);
                                } else {
                                    fetchBody = rawBodyResolved;
                                }
                                let contentType = "application/json";
                                if (lang === "text") contentType = "text/plain";
                                else if (lang === "javascript") contentType = "application/javascript";
                                else if (lang === "html") contentType = "text/html";
                                else if (lang === "xml") contentType = "application/xml";
                                
                                if (!headers.has("Content-Type")) {
                                    headers.append("Content-Type", contentType);
                                    rawHeadersMap["Content-Type"] = contentType;
                                }
                            } else if (mode === "graphql" && request.body?.graphql) {
                                const query = resolveVariables(request.body.graphql.query || "", finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                const varsStr = resolveVariables(request.body.graphql.variables || "{}", finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                let variables = {};
                                try {
                                    variables = JSON.parse(stripJsonComments(varsStr));
                                } catch (e) {}
                                fetchBody = JSON.stringify({ query, variables });
                                if (!headers.has("Content-Type")) {
                                    headers.append("Content-Type", "application/json");
                                    rawHeadersMap["Content-Type"] = "application/json";
                                }
                            } else if (mode === "urlencoded" && request.body?.urlencoded) {
                                const formParams = new URLSearchParams();
                                request.body.urlencoded.forEach(p => {
                                    if (p.enabled !== false && p.key) {
                                        const rKey = resolveVariables(p.key, finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                        const rVal = resolveVariables(p.value, finalEnvironments, store.state.activeEnvironmentId, collectionVars);
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
                                        const rKey = resolveVariables(p.key, finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                        const rVal = resolveVariables(p.value, finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                        fd.append(rKey, rVal);
                                    }
                                });
                                fetchBody = fd;
                            } else if (mode === "binary" && request.body?.binary) {
                                fetchBody = resolveVariables(request.body.binary, finalEnvironments, store.state.activeEnvironmentId, collectionVars);
                                if (!headers.has("Content-Type")) {
                                    headers.append("Content-Type", "application/octet-stream");
                                    rawHeadersMap["Content-Type"] = "application/octet-stream";
                                }
                            }
                        }
                        
                        if (!interpolatedUrl) {
                            throw new Error("URL is empty.");
                        }
                        
                        const isExtensionActive = typeof document !== "undefined" &&
                            document.documentElement.getAttribute("data-surge-extension-active") === "true";
                        
                        let extensionRuleId: number | null = null;
                        if (isExtensionActive) {
                            try {
                                let urlFilter = "*";
                                try {
                                    let urlStr = interpolatedUrl.trim();
                                    if (!/^https?:\/\//i.test(urlStr)) {
                                        urlStr = "http://" + urlStr;
                                    }
                                    const parsed = new URL(urlStr);
                                    urlFilter = parsed.hostname;
                                } catch (e) {}
                                
                                const extHeaders = Object.entries(rawHeadersMap).map(([key, value]) => ({
                                    name: key,
                                    value: value
                                }));
                                
                                const res = await sendToExtension({
                                    action: "setupRequestRules",
                                    urlFilter,
                                    headers: extHeaders,
                                    initiatorOrigin: window.location.origin
                                });
                                if (res && res.success) {
                                    extensionRuleId = res.ruleId;
                                }
                            } catch (e) {
                                console.warn("Failed to setup extension rules in agent:", e);
                            }
                        }
                        
                        const startTime = performance.now();
                        let fetchRes;
                        try {
                            fetchRes = await fetch(interpolatedUrl, {
                                method: request.method,
                                headers,
                                body: fetchBody,
                                mode: "cors",
                                signal: controller.signal
                            });
                        } finally {
                            if (extensionRuleId !== null) {
                                try {
                                    await sendToExtension({
                                        action: "clearRequestRules",
                                        ruleId: extensionRuleId
                                    });
                                } catch (e) {
                                    console.warn("Failed to clear extension rules in agent:", e);
                                }
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
                        
                        let testResults: any[] = [];
                        if (request.testScript) {
                            const testRes = runTestScript(
                                request.testScript,
                                initialResponse,
                                finalEnvironments,
                                store.state.activeEnvironmentId,
                                collectionVars
                            );
                            testResults = testRes.testResults;
                            store.setState(s => ({ ...s, environments: testRes.updatedEnvironments }));
                        }
                        
                        const finalResponse = {
                            ...initialResponse,
                            testResults
                        };
                        
                        updateTabResponse(tabId, finalResponse);
                        return { success: true, response: finalResponse };
                        
                    } catch (err: any) {
                        const errorResponse = {
                            status: 0,
                            statusText: "Error",
                            timeMs: 0,
                            sizeBytes: 0,
                            body: `Error: ${err.message || String(err)}`,
                            headers: {},
                            testResults: [{ name: "Request completed", passed: false, error: err.message }]
                        };
                        updateTabResponse(tabId, errorResponse);
                        return { error: err.message || String(err), response: errorResponse };
                    }
                }
                case "get_environments": {
                    return {
                        environments: store.state.environments,
                        activeEnvironmentId: store.state.activeEnvironmentId
                    };
                }
                case "create_environment": {
                    const newEnv = {
                        id: generateId(),
                        name: args.name,
                        variables: []
                    };
                    addEnvironment(newEnv);
                    return { success: true, environment: newEnv, message: `Environment '${args.name}' created.` };
                }
                case "update_environment": {
                    const updates: any = {};
                    if (args.name !== undefined) updates.name = args.name;
                    if (args.variables !== undefined) updates.variables = args.variables;
                    updateEnvironment(args.environmentId, updates);
                    return { success: true, message: `Environment updated.` };
                }
                case "update_execution_config": {
                    const { maxRetries, retryStatusCodes, stopOnFailure, throttleDelayMs, rowIterations, concurrency, templateUpdates } = args;
                    store.setState(s => {
                        const newState = { ...s };
                        if (maxRetries !== undefined) newState.maxRetries = maxRetries;
                        if (retryStatusCodes !== undefined) newState.retryStatusCodes = retryStatusCodes;
                        if (stopOnFailure !== undefined) newState.stopOnFailure = stopOnFailure;
                        if (throttleDelayMs !== undefined) newState.throttleDelayMs = throttleDelayMs;
                        if (rowIterations !== undefined) newState.rowIterations = rowIterations;
                        if (concurrency !== undefined) newState.concurrency = concurrency;
                        
                        if (templateUpdates && Array.isArray(templateUpdates)) {
                            const updatedTemplates = newState.templates.map(t => {
                                const update = templateUpdates.find((tu: any) => tu.id === t.id);
                                if (update) {
                                    const merged = { ...t };
                                    if (update.name !== undefined) merged.name = update.name;
                                    if (update.method !== undefined) merged.method = update.method;
                                    if (update.url !== undefined) merged.url = update.url;
                                    if (update.headers !== undefined) merged.headers = update.headers;
                                    if (update.params !== undefined) merged.params = update.params;
                                    if (update.bodyMode !== undefined) merged.body = { ...merged.body, mode: update.bodyMode };
                                    if (update.bodyRaw !== undefined) merged.body = { ...merged.body, raw: update.bodyRaw };
                                    return merged;
                                }
                                return t;
                            });

                            // For any template updates whose IDs do NOT match any existing templates, append them as new templates!
                            const newTemplatesToAdd: any[] = [];
                            templateUpdates.forEach((update: any) => {
                                const exists = newState.templates.some(t => t.id === update.id);
                                if (!exists) {
                                    const newTmpl = {
                                        id: update.id || generateId(),
                                        name: update.name || `Request ${newState.templates.length + newTemplatesToAdd.length + 1}`,
                                        method: update.method || "GET",
                                        url: update.url || "",
                                        params: update.params || [],
                                        headers: update.headers || [],
                                        body: {
                                            mode: update.bodyMode || "none",
                                            raw: update.bodyRaw || "{\n  \n}",
                                            formdata: [],
                                            urlencoded: []
                                        }
                                    };
                                    newTemplatesToAdd.push(newTmpl);
                                }
                            });

                            newState.templates = [...updatedTemplates, ...newTemplatesToAdd];

                            // Set activeTemplateId to the first template if activeTemplateId is invalid/empty or points to a deleted template
                            if (!newState.activeTemplateId || !newState.templates.some(t => t.id === newState.activeTemplateId)) {
                                if (newState.templates.length > 0) {
                                    newState.activeTemplateId = newState.templates[0].id;
                                }
                            }
                        }
                        
                        return newState;
                    });
                    return { success: true, message: "Execution config updated successfully." };
                }
                case "export_results_to_excel": {
                    store.setState(s => ({ ...s, exportExcelTrigger: { onlyFiltered: !!args.onlyFiltered } }));
                    return { success: true, message: "Excel export triggered successfully." };
                }
                case "export_workspace": {
                    exportState();
                    return { success: true, message: "Workspace export triggered successfully. The JSON file is downloading." };
                }
                case "run_bulk_engine": {
                    const concurrency = Math.max(1, store.state.concurrency || 2);
                    runBulkExecution(concurrency).catch(e => console.error("Agent triggered bulk run failed:", e));
                    return { success: true, message: "Bulk execution engine started successfully in the background." };
                }
                case "update_row_data": {
                    const rowId = Number(args.rowId);
                    if (isNaN(rowId)) return { error: "rowId must be a valid integer." };
                    const updates = args.updates || {};
                    const state = store.state;
                    if (rowId < 0 || rowId >= state.fileData.length) {
                        return { error: `Row ID ${rowId} is out of bounds.` };
                    }
                    store.setState(s => {
                        const newFileData = [...s.fileData];
                        newFileData[rowId] = { ...newFileData[rowId], ...updates };
                        const newOriginalData = [...s.originalData];
                        newOriginalData[rowId] = { ...newOriginalData[rowId], ...updates };
                        return { ...s, fileData: newFileData, originalData: newOriginalData };
                    });
                    return { success: true, rowId, message: "Row data updated successfully." };
                }
                case "get_available_variables": {
                    const state = store.state;
                    const excelVariables = state.headers || [];
                    
                    const activeEnv = state.environments.find(e => e.id === state.activeEnvironmentId);
                    const activeEnvVars = activeEnv ? activeEnv.variables.filter(v => v.enabled).map(v => ({ key: v.key, value: v.value })) : [];
                    
                    const globalsEnv = state.environments.find(
                        e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
                    );
                    const globalVars = globalsEnv ? globalsEnv.variables.filter(v => v.enabled).map(v => ({ key: v.key, value: v.value })) : [];
                    
                    const stepResponseVariables = state.templates.map((t, idx) => {
                        const stepNum = idx + 1;
                        return {
                            templateId: t.id,
                            templateName: t.name,
                            stepNumber: stepNum,
                            suggestions: [
                                `{{Step ${stepNum}.statusCode}}`,
                                `{{Step ${stepNum}.responseTimeMs}}`,
                                `{{Step ${stepNum}.response.[json_path]}}`,
                                `{{${t.name}.statusCode}}`,
                                `{{${t.name}.responseTimeMs}}`,
                                `{{${t.name}.response.[json_path]}}`
                            ]
                        };
                    });

                    return {
                        excelVariables,
                        activeEnvironment: activeEnv ? {
                            id: activeEnv.id,
                            name: activeEnv.name,
                            variables: activeEnvVars
                        } : null,
                        globals: globalVars,
                        stepResponseVariables
                    };
                }
                case "get_column_mappings": {
                    return store.state.columnMappings || [];
                }
                case "update_column_mappings": {
                    const mappings = args.mappings;
                    if (!Array.isArray(mappings)) {
                        return { error: "mappings must be a valid array." };
                    }
                    setColumnMappings(mappings);
                    return { success: true, message: "Column mappings updated successfully." };
                }
                case "get_table_filters": {
                    return store.state.tableFilterConfig;
                }
                case "update_table_filters": {
                    const { searchQuery, isRegex, columnFilters, sortBy, sortOrder } = args;
                    const updates: any = {};
                    if (searchQuery !== undefined) updates.searchQuery = searchQuery;
                    if (isRegex !== undefined) updates.isRegex = isRegex;
                    if (columnFilters !== undefined) updates.columnFilters = columnFilters;
                    if (sortBy !== undefined) updates.sortBy = sortBy;
                    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
                    
                    setTableFilterConfig(updates);
                    return { success: true, message: "Table filter settings updated successfully." };
                }
                case "export_results_to_excel": {
                    const onlyFiltered = !!args.onlyFiltered;
                    store.setState(s => ({
                        ...s,
                        currentView: "bulk",
                        exportExcelTrigger: { onlyFiltered }
                    }));
                    return { success: true, message: `Results view opened and Excel export triggered ${onlyFiltered ? "with filters" : "without filters"}.` };
                }
                case "get_all_results": {
                    const activeResults = results.filter(r => r.active !== false);
                    return activeResults.map(r => ({
                        rowId: r.rowId,
                        iteration: r.iteration ?? 1,
                        status: r.status,
                        statusCode: r.statusCode,
                        responseTimeMs: r.responseTimeMs,
                        error: r.error || undefined
                    }));
                }
                default:
                    return { error: `Tool ${name} not found.` };
            }
        } catch (e: any) {
            return { error: `Execution error in ${name}: ${e.message || String(e)}` };
        } finally {
            setActiveToolName(null);
        }
    };

    // Chat Message execution loop
    const handleSend = async (userText: string = input) => {
        if (!userText.trim()) return;

        if (isLoading) {
            handleQueueMessage(userText);
            setInput("");
            return;
        }

        if (!activeProfile) {
            toast.error("No active agent profile found. Please configure settings.");
            setView("settings");
            return;
        }

        const { apiKey, provider } = activeProfile;
        if (!apiKey && provider !== "custom") {
            toast.error("API Key is missing. Please set it up in Settings first!");
            setView("settings");
            return;
        }

        const state = store.state;
        const snapshot = JSON.parse(JSON.stringify({
            // Bulk Runner state
            templates: state.templates,
            maxRetries: state.maxRetries,
            retryStatusCodes: state.retryStatusCodes,
            stopOnFailure: state.stopOnFailure,
            throttleDelayMs: state.throttleDelayMs,
            rowIterations: state.rowIterations,
            concurrency: state.concurrency,
            columnMappings: state.columnMappings,
            tableFilterConfig: state.tableFilterConfig,
            fileData: state.fileData,
            originalData: state.originalData,
            results: state.results,
            fileName: state.fileName,
            activeTemplateId: state.activeTemplateId,

            // API Client state
            currentView: state.currentView,
            collections: state.collections,
            environments: state.environments,
            activeEnvironmentId: state.activeEnvironmentId,
            apiTabs: state.apiTabs,
            activeTabId: state.activeTabId,
        }));

        const newUserMessage: Message = {
            id: `msg_${Date.now()}`,
            role: "user",
            content: userText
        };

        const updatedHistory = [...messages, newUserMessage];
        setMessages(updatedHistory);
        setInput("");
        setIsLoading(true);

        const activeHistory = [...updatedHistory];
        let maxIterations = activeProfile.maxExecutionLimit !== undefined ? activeProfile.maxExecutionLimit : 6;
        const isInfinite = maxIterations === 0;

        // Instantiate AbortController for cancellation
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        try {
            while (isInfinite || maxIterations > 0) {
                if (signal.aborted) {
                    throw new DOMException("The user aborted a request.", "AbortError");
                }

                const response = await callLLM(activeHistory, activeProfile, signal);
                
                if (response.toolCalls && response.toolCalls.length > 0) {
                    // LLM generated a tool call
                    const assistantMessage: Message = {
                        id: `msg_${Date.now()}_assistant`,
                        role: "assistant",
                        content: response.text || "Executing tools...",
                        tool_calls: response.toolCalls,
                        geminiParts: response.geminiParts
                    };

                    activeHistory.push(assistantMessage);
                    // Update state immediately so the tool calling UI shows up
                    setMessages([...activeHistory]);
                    
                    for (const tc of response.toolCalls) {
                        if (signal.aborted) {
                            throw new DOMException("The user aborted a request.", "AbortError");
                        }

                        const toolArgs = JSON.parse(tc.function.arguments || "{}");
                        const toolName = tc.function.name;
                        
                        const toolResult = await runToolHandler(toolName, toolArgs);

                        if (signal.aborted) {
                            throw new DOMException("The user aborted a request.", "AbortError");
                        }

                        const toolMsg: Message = {
                            id: `tool_${Date.now()}_${tc.id}`,
                            role: "tool",
                            name: toolName,
                            tool_call_id: tc.id,
                            content: JSON.stringify(toolResult)
                        };

                        activeHistory.push(toolMsg);
                        // Update state in real-time as each tool completes execution
                        setMessages([...activeHistory]);
                    }

                    if (!isInfinite) {
                        maxIterations--;
                    }
                } else {
                    // LLM produced a final text answer
                    const assistantMessage: Message = {
                        id: `msg_${Date.now()}_assistant`,
                        role: "assistant",
                        content: response.text,
                        geminiParts: response.geminiParts
                    };
                    activeHistory.push(assistantMessage);
                    setMessages([...activeHistory]);
                    break;
                }
            }

            if (!isInfinite && maxIterations === 0) {
                toast.warning("Agent loop hit maximum function execution limit.");
            }
        } catch (e: any) {
            console.error(e);
            let errMsg = e.message || String(e);

            if (e.name === "AbortError" || errMsg.includes("aborted") || errMsg.includes("AbortError")) {
                if (!isClearingChatRef.current) {
                    activeHistory.push({
                        id: `msg_${Date.now()}_error`,
                        role: "assistant",
                        content: "⚠️ Execution stopped by user."
                    });
                    setMessages([...activeHistory]);
                }
            } else {
                if (errMsg === "Failed to fetch") {
                    errMsg = "Failed to fetch. This is usually caused by: \n" +
                             "1. Network disconnection or incorrect API Endpoint URL.\n" +
                             "2. CORS policy restrictions. Note: OpenAI's official API endpoint blocks browser-direct calls due to CORS rules to prevent exposing API keys. If you are using OpenAI/Custom, please ensure you use a proxy, local endpoint with CORS enabled (like Ollama), or verify that the Surge Chrome Extension is installed and active to bypass CORS.";
                }
                activeHistory.push({
                    id: `msg_${Date.now()}_error`,
                    role: "assistant",
                    content: `⚠️ Error executing agent request: ${errMsg}`
                });
                setMessages([...activeHistory]);
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;

            if (isClearingChatRef.current) {
                isClearingChatRef.current = false;
                return;
            }

            // Detect if the workspace state was modified during this prompt execution
            const finalState = store.state;
            const hasModified = 
                finalState.templates !== snapshot.templates ||
                finalState.maxRetries !== snapshot.maxRetries ||
                finalState.retryStatusCodes !== snapshot.retryStatusCodes ||
                finalState.stopOnFailure !== snapshot.stopOnFailure ||
                finalState.throttleDelayMs !== snapshot.throttleDelayMs ||
                finalState.rowIterations !== snapshot.rowIterations ||
                finalState.concurrency !== snapshot.concurrency ||
                finalState.columnMappings !== snapshot.columnMappings ||
                finalState.tableFilterConfig !== snapshot.tableFilterConfig ||
                finalState.fileData !== snapshot.fileData ||
                finalState.originalData !== snapshot.originalData ||
                finalState.results !== snapshot.results ||
                finalState.fileName !== snapshot.fileName ||
                finalState.activeTemplateId !== snapshot.activeTemplateId ||
                finalState.collections !== snapshot.collections ||
                finalState.environments !== snapshot.environments ||
                finalState.activeEnvironmentId !== snapshot.activeEnvironmentId ||
                finalState.apiTabs !== snapshot.apiTabs ||
                finalState.activeTabId !== snapshot.activeTabId ||
                finalState.currentView !== snapshot.currentView;

            if (hasModified) {
                saveCheckpoint(newUserMessage.id, snapshot).catch(err => {
                    console.error("Failed to save checkpoint:", err);
                });
            }
        }
    };

    const handleQueueMessage = (text: string) => {
        if (!text.trim()) return;
        setMessageQueue(prev => [...prev, text]);
    };

    const handleRemoveQueuedMessage = (index: number) => {
        setMessageQueue(prev => prev.filter((_, i) => i !== index));
        toast.success("Prompt removed from queue");
    };

    const handleMergeQueuedMessage = (index: number) => {
        if (index <= 0) return;
        setMessageQueue(prev => {
            if (prev.length <= index) return prev;
            const nextToSend = prev[0];
            const merged = `${nextToSend}\n${prev[index]}`;
            const newQueue = [...prev];
            newQueue[0] = merged;
            newQueue.splice(index, 1);
            return newQueue;
        });
        toast.success("Prompt merged with 'Next to send'");
    };

    // Auto-process next queued message when loading finishes
    useEffect(() => {
        if (!isLoading && messageQueue.length > 0) {
            const nextPrompt = messageQueue[0];
            setMessageQueue(prev => prev.slice(1));
            handleSend(nextPrompt);
        }
    }, [isLoading, messageQueue]);

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            toast.info("Agent execution stopped.");
        }
    };

    const handleClearChat = async () => {
        if (abortControllerRef.current) {
            isClearingChatRef.current = true;
            abortControllerRef.current.abort();
        }

        setMessageQueue([]);

        const userMessageIds = messages.filter(m => m.role === "user").map(m => m.id);
        setMessages([
            {
                id: "welcome",
                role: "assistant",
                content: WELCOME_MESSAGE
            }
        ]);
        toast.info("Chat history cleared");
        
        // Clean up checkpoints asynchronously
        Promise.all(userMessageIds.map(id => deleteCheckpoint(id)))
            .catch(err => console.error("Failed to clean up checkpoints on chat clear:", err));
    };

    const handleRevert = async (messageId: string) => {
        setRevertTargetId(messageId);
        setShouldRevertModification(true); // default to revert changes if checked
        try {
            const checkpoint = await loadCheckpoint(messageId);
            if (checkpoint) {
                setRevertCheckpointData(checkpoint);
                const hasDiscrepancy = hasStateDiscrepancy(store.state, checkpoint);
                setHasCheckpoint(hasDiscrepancy);
            } else {
                setRevertCheckpointData(null);
                setHasCheckpoint(false);
            }
        } catch (err) {
            console.error("Failed to load checkpoint", err);
            setRevertCheckpointData(null);
            setHasCheckpoint(false);
        }
    };

    const confirmRevert = async () => {
        if (!revertTargetId) return;
        const targetIdx = messages.findIndex(m => m.id === revertTargetId);
        if (targetIdx !== -1) {
            const targetMessage = messages[targetIdx];
            
            // Revert workspace modifications if selected and available
            if (shouldRevertModification && revertCheckpointData) {
                store.setState(s => ({
                    ...s,
                    // Bulk Runner state
                    templates: revertCheckpointData.templates,
                    maxRetries: revertCheckpointData.maxRetries,
                    retryStatusCodes: revertCheckpointData.retryStatusCodes,
                    stopOnFailure: revertCheckpointData.stopOnFailure,
                    throttleDelayMs: revertCheckpointData.throttleDelayMs,
                    rowIterations: revertCheckpointData.rowIterations,
                    concurrency: revertCheckpointData.concurrency,
                    columnMappings: revertCheckpointData.columnMappings,
                    tableFilterConfig: revertCheckpointData.tableFilterConfig,
                    fileData: revertCheckpointData.fileData,
                    originalData: revertCheckpointData.originalData,
                    results: revertCheckpointData.results,
                    fileName: revertCheckpointData.fileName !== undefined ? revertCheckpointData.fileName : s.fileName,
                    activeTemplateId: revertCheckpointData.activeTemplateId !== undefined ? revertCheckpointData.activeTemplateId : s.activeTemplateId,

                    // API Client state
                    currentView: revertCheckpointData.currentView !== undefined ? revertCheckpointData.currentView : s.currentView,
                    collections: revertCheckpointData.collections !== undefined ? revertCheckpointData.collections : s.collections,
                    environments: revertCheckpointData.environments !== undefined ? revertCheckpointData.environments : s.environments,
                    activeEnvironmentId: revertCheckpointData.activeEnvironmentId !== undefined ? revertCheckpointData.activeEnvironmentId : s.activeEnvironmentId,
                    apiTabs: revertCheckpointData.apiTabs !== undefined ? revertCheckpointData.apiTabs : s.apiTabs,
                    activeTabId: revertCheckpointData.activeTabId !== undefined ? revertCheckpointData.activeTabId : s.activeTabId,
                }));
                toast.success("Workspace state reverted to checkpoint");
            }

            const truncated = messages.slice(0, targetIdx);
            setMessages(truncated);
            setInput(prev => prev ? `${targetMessage.content}\n${prev}` : targetMessage.content);
            toast.success("Message loaded back into input field");

            // Delete checkpoints for any messages that are being truncated from history
            const deletedMessages = messages.slice(targetIdx);
            Promise.all(deletedMessages.filter(m => m.role === "user").map(m => deleteCheckpoint(m.id)))
                .catch(err => console.error("Error deleting checkpoints during revert:", err));
        }
        setRevertTargetId(null);
        setRevertCheckpointData(null);
        setHasCheckpoint(false);
    };

    return {
        isOpen,
        setIsOpen,
        view,
        setView,
        messages,
        setMessages,
        revertTargetId,
        setRevertTargetId,
        hasCheckpoint,
        shouldRevertModification,
        setShouldRevertModification,
        input,
        setInput,
        messageQueue,
        handleRemoveQueuedMessage,
        isLoading,
        activeToolName,
        tempProfiles,
        setTempProfiles,
        tempActiveProfileId,
        setTempActiveProfileId: handleActiveProfileIdChange,
        editingProfileId,
        setEditingProfileId,
        activeProfile,
        agentProfiles: storeProfiles,
        agentPanelPosition,
        agentPanelSize,
        setAgentPanelSize,
        fileData,
        results,
        saveConfig,
        handleSend,
        handleClearChat,
        handleRevert,
        confirmRevert,
        isDirty,
        handleStop,
        handleMergeQueuedMessage
    };
}

function hasStateDiscrepancy(currentState: any, checkpoint: any): boolean {
    if (!checkpoint) return false;
    
    const isDifferent = (a: any, b: any) => {
        if (a === b) return false;
        if (!a !== !b) return true;
        try {
            return JSON.stringify(a) !== JSON.stringify(b);
        } catch (e) {
            return true;
        }
    };

    return (
        isDifferent(currentState.templates, checkpoint.templates) ||
        currentState.maxRetries !== checkpoint.maxRetries ||
        currentState.retryStatusCodes !== checkpoint.retryStatusCodes ||
        currentState.stopOnFailure !== checkpoint.stopOnFailure ||
        currentState.throttleDelayMs !== checkpoint.throttleDelayMs ||
        currentState.rowIterations !== checkpoint.rowIterations ||
        currentState.concurrency !== checkpoint.concurrency ||
        isDifferent(currentState.columnMappings, checkpoint.columnMappings) ||
        isDifferent(currentState.tableFilterConfig, checkpoint.tableFilterConfig) ||
        isDifferent(currentState.fileData, checkpoint.fileData) ||
        isDifferent(currentState.originalData, checkpoint.originalData) ||
        isDifferent(currentState.results, checkpoint.results) ||
        currentState.fileName !== checkpoint.fileName ||
        currentState.activeTemplateId !== checkpoint.activeTemplateId ||
        isDifferent(currentState.collections, checkpoint.collections) ||
        isDifferent(currentState.environments, checkpoint.environments) ||
        currentState.activeEnvironmentId !== checkpoint.activeEnvironmentId ||
        isDifferent(currentState.apiTabs, checkpoint.apiTabs) ||
        currentState.activeTabId !== checkpoint.activeTabId ||
        currentState.currentView !== checkpoint.currentView
    );
}

function areProfilesEqual(a: AgentProfile[], b: AgentProfile[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const pa = a[i];
        const pb = b[i];
        if (
            pa.id !== pb.id ||
            pa.name !== pb.name ||
            pa.provider !== pb.provider ||
            pa.apiKey !== pb.apiKey ||
            pa.endpoint !== pb.endpoint ||
            pa.model !== pb.model ||
            pa.enableJsonFallback !== pb.enableJsonFallback ||
            pa.bypassCorsWithExtension !== pb.bypassCorsWithExtension ||
            pa.maxExecutionLimit !== pb.maxExecutionLimit
        ) {
            return false;
        }
    }
    return true;
}

function getTemplateVariables(t: any): string[] {
    const vars = new Set<string>();
    const extract = (str: string | null | undefined) => {
        if (!str || typeof str !== "string") return;
        const matches = str.match(/\{\{(.+?)\}\}/g);
        if (matches) {
            matches.forEach(m => {
                const key = m.slice(2, -2).trim();
                if (key) vars.add(key);
            });
        }
    };

    extract(t.url);
    if (Array.isArray(t.headers)) {
        t.headers.forEach((h: any) => {
            extract(h.key);
            extract(h.value);
        });
    }
    if (Array.isArray(t.params)) {
        t.params.forEach((p: any) => {
            extract(p.key);
            extract(p.value);
        });
    }

    if (t.body) {
        if (typeof t.body === "string") {
            extract(t.body);
        } else {
            const mode = t.body.mode;
            if (mode === "raw") {
                extract(t.body.raw);
            } else if (mode === "graphql" && t.body.graphql) {
                extract(t.body.graphql.query);
                extract(t.body.graphql.variables);
            } else if (mode === "urlencoded" && Array.isArray(t.body.urlencoded)) {
                t.body.urlencoded.forEach((p: any) => {
                    extract(p.key);
                    extract(p.value);
                });
            } else if (mode === "formdata" && Array.isArray(t.body.formdata)) {
                t.body.formdata.forEach((p: any) => {
                    extract(p.key);
                    extract(p.value);
                });
            } else if (mode === "binary") {
                extract(t.body.binary);
            }
        }
    }

    return Array.from(vars);
}

function validateTemplateVariables(templates: any[], state: any) {
    const activeEnv = state.environments?.find((e: any) => e.id === state.activeEnvironmentId);
    const activeEnvVars = new Set(
        (activeEnv?.variables || [])
            .filter((v: any) => v.enabled)
            .map((v: any) => v.key.trim().toLowerCase())
    );
    
    const globalsEnv = state.environments?.find(
        (e: any) => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
    );
    const globalVars = new Set(
        (globalsEnv?.variables || [])
            .filter((v: any) => v.enabled)
            .map((v: any) => v.key.trim().toLowerCase())
    );

    const excelHeaders = new Set((state.headers || []).map((h: string) => h.trim().toLowerCase()));

    return templates.map((t, idx) => {
        const variables = getTemplateVariables(t);
        const invalidVariables: string[] = [];

        // Prior templates: step numbers 1 to idx
        const validStepPrefixes = new Set<string>();
        for (let stepNum = 1; stepNum <= idx; stepNum++) {
            const priorTmpl = templates[stepNum - 1];
            validStepPrefixes.add(`step ${stepNum}.`);
            if (priorTmpl.name?.trim()) {
                validStepPrefixes.add(`${priorTmpl.name.trim().toLowerCase()}.`);
            }
        }

        variables.forEach(vKey => {
            const trimmed = vKey.trim();
            const lowerKey = trimmed.toLowerCase();
            
            // Check Excel headers
            if (excelHeaders.has(lowerKey)) return;
            // Check active env
            if (activeEnvVars.has(lowerKey)) return;
            // Check global env
            if (globalVars.has(lowerKey)) return;

            // Check if it matches a valid prior step response reference
            let isStepRef = false;
            for (const prefix of validStepPrefixes) {
                if (lowerKey.startsWith(prefix)) {
                    isStepRef = true;
                    break;
                }
            }
            if (isStepRef) return;

            // Otherwise, it is invalid
            invalidVariables.push(vKey);
        });

        return {
            id: t.id,
            name: t.name,
            invalidVariables: invalidVariables.length > 0 ? invalidVariables : undefined
        };
    });
}

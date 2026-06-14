import React from "react";
import { 
    store, 
    setActiveEnvironmentId,
    setActiveTabId,
    setActiveSubTab,
    setColumnMappings, 
    setTableFilterConfig,
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
    linkTabToRequest
} from "@/lib/store";
import { addItemToCollectionTree, findItemInCollections } from "@/lib/utils";
import { stripJsonComments } from "@/lib/executor-utils";
import { simulateRowExecutionChain } from "@/lib/agent-executor";
import { runBulkExecution } from "@/lib/executor";
import { executeFrontendRequest } from "@/lib/frontend-executor";
import { resolveVariables } from "@/lib/sandbox";

import { GLOBAL_TOOLS } from "./tools/global";
import { BULK_RUNNER_TOOLS } from "./tools/bulk-runner";
import { API_CLIENT_TOOLS } from "./tools/api-client";
import { getToolDisplayName } from "./tools/index";
import { type ToolDefinition } from "./standalone/types";
import { type KeyValuePair } from "@/lib/schema";

export function useSurgeAgentTools() {
    const rawTools = React.useMemo(() => {
        return [...GLOBAL_TOOLS, ...BULK_RUNNER_TOOLS, ...API_CLIENT_TOOLS];
    }, []);

    const surgeTools = React.useMemo<ToolDefinition[]>(() => {
        return rawTools.map((t: any) => {
            const name = t.function.name;
            const category = GLOBAL_TOOLS.some(gt => gt.function.name === name) 
                ? "Global Operations" 
                : BULK_RUNNER_TOOLS.some(bt => bt.function.name === name) 
                    ? "Bulk Runner" 
                    : "API Client";

            const handler = async (args: any): Promise<any> => {
                switch (name) {
                    case "get_row_status": {
                        const rowId = Number(args.rowId);
                        if (isNaN(rowId)) return { error: "rowId must be a valid integer." };
                        const rowResults = store.state.results.filter(r => r.rowId === rowId && r.active !== false);
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
                        const fileData = store.state.fileData || [];
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
                        const { rowId, error } = getRowIdOrError(args.rowId);
                        if (error) return { error };
                        const fileData = store.state.fileData || [];
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
                        const { rowId, error } = getRowIdOrError(args.rowId);
                        if (error) return { error };
                        const fileData = store.state.fileData || [];
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
                            const foundRequest = findItemInCollections(store.state.collections, args.requestId);
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

                        const modifyResults: any[] = [];
                        for (let i = 0; i < operations.length; i++) {
                            const op = operations[i];
                            try {
                                if (op.action === "create_collection") {
                                    if (!op.collectionName) {
                                        modifyResults.push({ index: i, success: false, error: "collectionName is required to create a collection." });
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
                                    modifyResults.push({ index: i, success: true, message: `Collection '${op.collectionName}' created.`, collectionId: colId });
                                } else if (op.action === "delete_collection") {
                                    if (!op.collectionId) {
                                        modifyResults.push({ index: i, success: false, error: "collectionId is required to delete a collection." });
                                        continue;
                                    }
                                    deleteCollection(op.collectionId);
                                    modifyResults.push({ index: i, success: true, message: `Collection '${op.collectionId}' deleted.` });
                                } else if (op.action === "update_collection") {
                                    if (!op.collectionId || !op.collectionName) {
                                        modifyResults.push({ index: i, success: false, error: "collectionId and collectionName are required to rename/update a collection." });
                                        continue;
                                    }
                                    updateCollection(op.collectionId, { name: op.collectionName });
                                    modifyResults.push({ index: i, success: true, message: `Collection renamed to '${op.collectionName}'.` });
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
                                        modifyResults.push({ index: i, success: false, error: "collectionId or folderId is required to create a folder." });
                                        continue;
                                    }
                                    
                                    const col = store.state.collections.find(c => c.id === targetParentId);
                                    if (col) {
                                        updateCollection(targetParentId, { items: [...col.items, newFolder] });
                                        modifyResults.push({ index: i, success: true, message: `Folder '${folderName}' created in collection '${col.name}'.`, folderId });
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
                                            modifyResults.push({ index: i, success: true, message: `Folder '${folderName}' created inside parent folder '${targetParentId}'.`, folderId });
                                        } else {
                                            modifyResults.push({ index: i, success: false, error: `Parent folder or collection '${targetParentId}' not found.` });
                                        }
                                    }
                                } else if (op.action === "update_folder") {
                                    if (!op.folderId || !op.folderName) {
                                        modifyResults.push({ index: i, success: false, error: "folderId and folderName are required to update/rename a folder." });
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
                                        modifyResults.push({ index: i, success: true, message: `Folder renamed to '${op.folderName}'.` });
                                    } else {
                                        modifyResults.push({ index: i, success: false, error: `Folder '${op.folderId}' not found.` });
                                    }
                                } else if (op.action === "delete_folder" || op.action === "delete_request") {
                                    const itemId = op.folderId || op.requestId;
                                    if (!itemId) {
                                        modifyResults.push({ index: i, success: false, error: "folderId or requestId is required to delete." });
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
                                        modifyResults.push({ index: i, success: true, message: `Item '${itemId}' successfully deleted.` });
                                    } else {
                                        modifyResults.push({ index: i, success: false, error: `Item '${itemId}' not found in collections.` });
                                    }
                                } else if (op.action === "move_item") {
                                    if (!op.itemId || !op.targetParentId) {
                                        modifyResults.push({ index: i, success: false, error: "itemId and targetParentId are required to move an item." });
                                        continue;
                                    }
                                    const { foundItem, newCollections } = findAndRemoveItem(store.state.collections, op.itemId);
                                    if (!foundItem) {
                                        modifyResults.push({ index: i, success: false, error: `Item '${op.itemId}' not found to move.` });
                                        continue;
                                    }
                                    
                                    const targetCol = newCollections.find(c => c.id === op.targetParentId);
                                    if (targetCol) {
                                        const updated = newCollections.map(c => {
                                            if (c.id === op.targetParentId) {
                                                return { ...c, items: [...c.items, foundItem] };
                                            }
                                            return c;
                                        });
                                        store.setState(s => ({ ...s, collections: updated }));
                                        modifyResults.push({ index: i, success: true, message: `Item moved to collection '${targetCol.name}' root.` });
                                    } else {
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
                                            modifyResults.push({ index: i, success: true, message: `Item moved inside folder '${op.targetParentId}'.` });
                                        } else {
                                            modifyResults.push({ index: i, success: false, error: `Target collection or folder '${op.targetParentId}' not found.` });
                                        }
                                    }
                                } else {
                                    modifyResults.push({ index: i, success: false, error: `Invalid action '${op.action}'.` });
                                }
                            } catch (err: any) {
                                modifyResults.push({ index: i, success: false, error: err.message || "Unknown error occurred." });
                            }
                        }
                        return modifyResults;
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
                        const saveResults: any[] = [];
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
                                    saveResults.push({ index: i, success: true, message: `Request '${req.name}' created and opened in a new tab.` });
                                } else if (reqArgs.action === "update") {
                                    if (!reqArgs.requestId) {
                                        saveResults.push({ index: i, success: false, error: "requestId is required for update action." });
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
                                        const foundRequest = findItemInCollections(store.state.collections, reqArgs.requestId);
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
                                    saveResults.push({ index: i, success: true, message: `Request '${reqArgs.requestId}' updated in collection.` });
                                } else if (reqArgs.action === "save_tab") {
                                    const { tab, error } = validateTabId(reqArgs.tabId, "save_tab");
                                    if (error) {
                                        saveResults.push({ index: i, success: false, error });
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
                                        saveResults.push({ index: i, success: true, message: `Request '${tab.requestId}' saved.` });
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
                                            
                                            linkTabToRequest(reqArgs.tabId, newReqId, requestName);

                                            saveResults.push({ index: i, success: true, message: `Request saved as '${requestName}' in new collection '${reqArgs.newCollectionName}'.` });
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
                                                    
                                                    linkTabToRequest(reqArgs.tabId, newReqId, requestName);

                                                    saveResults.push({ index: i, success: true, message: `Request saved as '${requestName}' in new collection 'Default Collection'.` });
                                                    continue;
                                                }
                                            }

                                            const col = store.state.collections.find(c => c.id === targetColId) || store.state.collections[store.state.collections.length - 1];
                                            if (!col) {
                                                saveResults.push({ index: i, success: false, error: `Collection '${targetColId}' not found.` });
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

                                            linkTabToRequest(reqArgs.tabId, newReqId, requestName);

                                            saveResults.push({ index: i, success: true, message: `Request saved as '${requestName}' in collection '${col.name}'.` });
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
                                        saveResults.push({ index: i, success: false, error: "tabId is required for close_tab action." });
                                        continue;
                                    }
                                    const tab = store.state.apiTabs.find(t => t.id === reqArgs.tabId);
                                    if (!tab) {
                                        saveResults.push({ index: i, success: false, error: `Tab '${reqArgs.tabId}' not found.` });
                                        continue;
                                    }
                                    closeApiTab(reqArgs.tabId);
                                    saveResults.push({ index: i, success: true, message: `Tab '${reqArgs.tabId}' closed.` });
                                }
                        } catch (err: any) {
                            saveResults.push({ index: i, success: false, error: err.message || "Unknown error occurred." });
                        }
                    }
                    return saveResults;
                    }
                    case "send_request": {
                        const tabId = args.tabId || store.state.activeTabId;
                        if (!tabId) return { error: "No open tab specified or active." };
                        
                        const tab = store.state.apiTabs.find(t => t.id === tabId);
                        if (!tab) return { error: `Tab '${tabId}' not found.` };
                        
                        const request = tab.request;
                        const requestId = tab.requestId;
                        
                        updateTabLoading(tabId, true);
                        
                        const response = await executeFrontendRequest(
                            request,
                            requestId,
                            store.state.environments,
                            store.state.activeEnvironmentId,
                            store.state.collections
                        );
                        
                        updateTabResponse(tabId, response);
                        
                        if (response.status === 0 && response.statusText === "Error") {
                            return { error: response.body, response };
                        }
                        
                        return { success: true, response };
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
                        const onlyFiltered = !!args.onlyFiltered;
                        store.setState(s => ({
                            ...s,
                            exportExcelTrigger: { onlyFiltered }
                        }));
                        return { success: true, message: `Excel export triggered ${onlyFiltered ? "with filters" : "without filters"}.` };
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
                        
                        const activeEnv = state.environments.find((e: any) => e.id === state.activeEnvironmentId);
                        const activeEnvVars = activeEnv ? activeEnv.variables.filter((v: any) => v.enabled).map((v: any) => ({ key: v.key, value: v.value })) : [];
                        
                        const globalsEnv = state.environments.find(
                            (e: any) => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
                        );
                        const globalVars = globalsEnv ? globalsEnv.variables.filter((v: any) => v.enabled).map((v: any) => ({ key: v.key, value: v.value })) : [];
                        
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
                    case "get_all_results": {
                        const activeResults = store.state.results.filter(r => r.active !== false);
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
            };

            return {
                function: t.function,
                displayName: getToolDisplayName(name),
                category,
                handler
            };
        });
    }, [rawTools]);

    return surgeTools;
}

// Validation helpers
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
    const activeEnvVars = new Set(getLowercasedEnabledKeys(activeEnv?.variables));
    
    const globalsEnv = state.environments?.find(
        (e: any) => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
    );
    const globalVars = new Set(getLowercasedEnabledKeys(globalsEnv?.variables));

    const excelHeaders = new Set((state.headers || []).map((h: string) => h.trim().toLowerCase()));

    return templates.map((t, idx) => {
        const variables = getTemplateVariables(t);
        const invalidVariables: string[] = [];

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
            
            if (excelHeaders.has(lowerKey)) return;
            if (activeEnvVars.has(lowerKey)) return;
            if (globalVars.has(lowerKey)) return;

            let isStepRef = false;
            for (const prefix of validStepPrefixes) {
                if (lowerKey.startsWith(prefix)) {
                    isStepRef = true;
                    break;
                }
            }
            if (isStepRef) return;

            invalidVariables.push(vKey);
        });

        return {
            id: t.id,
            name: t.name,
            invalidVariables: invalidVariables.length > 0 ? invalidVariables : undefined
        };
    });
}

function getRowIdOrError(rowIdVal: any): { rowId: number; error?: string } {
    const rowId = Number(rowIdVal);
    if (isNaN(rowId)) return { rowId: -1, error: "rowId must be a valid integer." };
    const fileData = store.state.fileData || [];
    if (rowId < 0 || rowId >= fileData.length) {
        return { rowId: -1, error: `Row ID ${rowId} is out of bounds (0 to ${fileData.length - 1}).` };
    }
    return { rowId };
}

function validateTabId(tabId: any, actionName: string): { tab?: any; error?: string } {
    if (!tabId) {
        return { error: `tabId is required for ${actionName} action.` };
    }
    const tab = store.state.apiTabs.find(t => t.id === tabId);
    if (!tab) {
        return { error: `Tab '${tabId}' not found.` };
    }
    return { tab };
}

function getLowercasedEnabledKeys(variables?: any[]): string[] {
    return (variables || [])
        .filter((v: any) => v.enabled)
        .map((v: any) => v.key.trim().toLowerCase());
}

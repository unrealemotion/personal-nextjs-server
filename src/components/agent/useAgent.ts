import { useState, useEffect, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { 
    store, 
    saveAgentProfiles, 
    setActiveAgentProfileId, 
    setAgentChatMessages, 
    setColumnMappings, 
    setTableFilterConfig,
    saveCheckpoint,
    loadCheckpoint,
    deleteCheckpoint
} from "@/lib/store";
import { simulateRowExecutionChain } from "@/lib/agent-executor";
import { toast } from "sonner";
import { callLLM } from "./agent-adapters";
import { type AgentProfile, type Message } from "@/lib/schema";
import { WELCOME_MESSAGE } from "./agent-prompts";


export function useAgent() {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<"chat" | "settings">("chat");
    const messages = useStore(store, (state) => state.agentChatMessages || []);
    const setMessages = setAgentChatMessages;
    const agentPanelPosition = useStore(store, (state) => state.agentPanelPosition);
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
                            newState.templates = newState.templates.map(t => {
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
                        }
                        
                        return newState;
                    });
                    return { success: true, message: "Execution config updated successfully." };
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
        const snapshot = {
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
            results: state.results
        };

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
        let maxIterations = 6;

        // Instantiate AbortController for cancellation
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        try {
            while (maxIterations > 0) {
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

                    maxIterations--;
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

            if (maxIterations === 0) {
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
                finalState.results !== snapshot.results;

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
                setHasCheckpoint(true);
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
                    results: revertCheckpointData.results
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
            pa.model !== pb.model
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

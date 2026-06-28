"use client";

import React from "react";
import { useStore } from "@tanstack/react-store";
import { 
    store, 
    saveAgentProfiles, 
    setActiveAgentProfileId,
    saveCheckpoint,
    loadCheckpoint,
    deleteCheckpoint,
    setAgentPanelPosition,
    setAgentPanelSize,
    WELCOME_MESSAGE
} from "@/lib/store";
import { sendToExtension } from "@/lib/extension";
import { toast as sonnerToast } from "@/components/ui/toast-provider";

import { AgentProvider } from "./standalone/AgentContext";
import { AgentChatPanel as StandaloneAgentChatPanel } from "./standalone/AgentChatPanel";
import { useSurgeAgentTools } from "./useSurgeAgentTools";
import { getAgentSystemPrompt } from "./agent-prompts";
import { type CheckpointProvider } from "./standalone/types";

export function AgentChatPanel() {
    const storeProfiles = useStore(store, (state) => state.agentProfiles || []);
    const storeActiveProfileId = useStore(store, (state) => state.activeAgentProfileId);
    const currentView = useStore(store, (state) => state.currentView || "bulk");
    
    const fileData = useStore(store, (state) => state.fileData || []);
    const results = useStore(store, (state) => state.results || []);

    const agentPanelPosition = useStore(store, (state) => state.agentPanelPosition);
    const agentPanelSize = useStore(store, (state) => state.agentPanelSize);

    const surgeTools = useSurgeAgentTools();

    // Map fetchProxy to send LLM requests through Surge extension
    const fetchProxy = React.useMemo(() => {
        return async (url: string, options: any, abortSignal?: AbortSignal) => {
            const res = await sendToExtension({
                action: "fetchProxy",
                url,
                options
            }, 0, abortSignal);
            if (res && res.success) {
                return {
                    success: true,
                    status: res.status,
                    body: res.body
                };
            } else {
                return {
                    success: false,
                    status: res?.status || 500,
                    body: "",
                    error: res?.error || "Extension proxy failed"
                };
            }
        };
    }, []);

    // Map checkpointProvider callbacks
    const checkpointProvider = React.useMemo<CheckpointProvider>(() => {
        return {
            getCheckpointState: () => {
                const state = store.state;
                return JSON.parse(JSON.stringify({
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
                    currentView: state.currentView,
                    collections: state.collections,
                    environments: state.environments,
                    activeEnvironmentId: state.activeEnvironmentId,
                    apiTabs: state.apiTabs,
                    activeTabId: state.activeTabId,
                }));
            },
            saveCheckpoint: async (messageId: string, stateSnapshot: any) => {
                await saveCheckpoint(messageId, stateSnapshot);
            },
            loadCheckpoint: async (messageId: string) => {
                return await loadCheckpoint(messageId);
            },
            deleteCheckpoint: async (messageId: string) => {
                await deleteCheckpoint(messageId);
            },
            hasStateDiscrepancy: (currentState: any, checkpointState: any) => {
                return hasStateDiscrepancy(currentState || store.state, checkpointState);
            },
            revertWorkspaceState: async (checkpointState: any) => {
                store.setState(s => ({
                    ...s,
                    // Bulk Runner state
                    templates: checkpointState.templates,
                    maxRetries: checkpointState.maxRetries,
                    retryStatusCodes: checkpointState.retryStatusCodes,
                    stopOnFailure: checkpointState.stopOnFailure,
                    throttleDelayMs: checkpointState.throttleDelayMs,
                    rowIterations: checkpointState.rowIterations,
                    concurrency: checkpointState.concurrency,
                    columnMappings: checkpointState.columnMappings,
                    tableFilterConfig: checkpointState.tableFilterConfig,
                    fileData: checkpointState.fileData,
                    originalData: checkpointState.originalData,
                    results: checkpointState.results,
                    fileName: checkpointState.fileName !== undefined ? checkpointState.fileName : s.fileName,
                    activeTemplateId: checkpointState.activeTemplateId !== undefined ? checkpointState.activeTemplateId : s.activeTemplateId,

                    // API Client state
                    currentView: checkpointState.currentView !== undefined ? checkpointState.currentView : s.currentView,
                    collections: checkpointState.collections !== undefined ? checkpointState.collections : s.collections,
                    environments: checkpointState.environments !== undefined ? checkpointState.environments : s.environments,
                    activeEnvironmentId: checkpointState.activeEnvironmentId !== undefined ? checkpointState.activeEnvironmentId : s.activeEnvironmentId,
                    apiTabs: checkpointState.apiTabs !== undefined ? checkpointState.apiTabs : s.apiTabs,
                    activeTabId: checkpointState.activeTabId !== undefined ? checkpointState.activeTabId : s.activeTabId,
                }));
            }
        };
    }, []);

    // Save configurations back to TanStack store
    const onSaveProfiles = React.useCallback((newProfiles: any[], activeId: string) => {
        saveAgentProfiles(newProfiles, activeId);
    }, []);

    // Custom welcome prompts presets based on data availability
    const presets = React.useMemo(() => {
        if (fileData.length === 0) return [];
        const list = [
            { label: "Describe Columns", prompt: "Describe the columns in the dataset" },
            { label: "Check Engine Settings", prompt: "What is the current execution engine config?" }
        ];
        if (results.length > 0) {
            list.push({ label: "Troubleshoot Row 0", prompt: "Troubleshoot Row 0 template run" });
        }
        return list;
    }, [fileData.length, results.length]);

    // System prompt changes reactively with active tab
    const systemPrompt = React.useMemo(() => {
        return getAgentSystemPrompt(currentView);
    }, [currentView]);

    const toastBridge = React.useMemo(() => ({
        success: (msg: string) => sonnerToast.success(msg),
        error: (msg: string) => sonnerToast.error(msg),
        info: (msg: string) => sonnerToast.info(msg),
        warning: (msg: string) => sonnerToast.warning(msg)
    }), []);

    // Preset permissions options for Settings view
    const settingsPresetPermissions = React.useMemo(() => {
        const globalToolNames = ["check_extension_connection", "switch_tab", "read_console_logs"];
        const bulkToolNames = [
            "get_row_status",
            "search_data",
            "read_row_data",
            "inspect_input_data",
            "get_execution_config",
            "simulate_row_execution",
            "update_execution_config",
            "update_row_data",
            "get_available_variables",
            "get_column_mappings",
            "update_column_mappings",
            "get_table_filters",
            "update_table_filters",
            "export_results_to_excel",
            "get_all_results",
            "export_workspace",
            "run_bulk_engine"
        ];
        const apiClientToolNames = [
            "get_collections",
            "save_requests",
            "get_environments",
            "create_environment",
            "update_environment",
            "get_open_tabs",
            "send_request",
            "select_active_item",
            "modify_collections"
        ];
        const allTools = [...globalToolNames, ...bulkToolNames, ...apiClientToolNames];
        const readOnlyTools = [
            "check_extension_connection",
            "switch_tab",
            "read_console_logs",
            "get_row_status",
            "read_row_data",
            "inspect_input_data",
            "get_execution_config",
            "get_available_variables",
            "get_column_mappings",
            "get_table_filters",
            "get_all_results",
            "get_collections",
            "get_environments",
            "get_open_tabs"
        ];
        const readModifyTools = allTools.filter(name => name !== "modify_collections");

        return [
            { name: "all", label: "All (Default)", toolNames: allTools, colorClass: "bg-indigo-600 border-indigo-400 shadow-indigo-600/50" },
            { name: "read_only", label: "ReadOnly", toolNames: readOnlyTools, colorClass: "bg-emerald-600 border-emerald-400 shadow-emerald-600/50" },
            { name: "read_modify", label: "Read & Modify (No Delete)", toolNames: readModifyTools, colorClass: "bg-amber-600 border-amber-400 shadow-amber-600/50" }
        ];
    }, []);

    // Revert state callback for checkpoint restoration
    const onStateChange = React.useCallback(() => {
        // Can be used to notify other parts of Surge of state updates if required
    }, []);

    const onActiveProfileIdChange = React.useCallback((id: string) => {
        setActiveAgentProfileId(id);
    }, []);

    return (
        <AgentProvider
            tools={surgeTools}
            initialProfiles={storeProfiles}
            initialActiveProfileId={storeActiveProfileId}
            welcomeMessage={WELCOME_MESSAGE}
            systemPrompt={systemPrompt}
            onSaveProfiles={onSaveProfiles}
            onStateChange={onStateChange}
            checkpointProvider={checkpointProvider}
            fetchProxy={fetchProxy}
            initialPanelPosition={agentPanelPosition || undefined}
            initialPanelSize={agentPanelSize || undefined}
            onPanelPositionChange={(pos) => setAgentPanelPosition(pos)}
            onPanelSizeChange={(size) => setAgentPanelSize(size)}
            toast={toastBridge}
            currentView={currentView}
            onActiveProfileIdChange={onActiveProfileIdChange}
        >
            <StandaloneAgentChatPanel
                title="Splurge"
                presets={presets}
                settingsPresetPermissions={settingsPresetPermissions}
            />
        </AgentProvider>
    );
}

// Helper: Discrepancy detector for checkpoint reversion
function hasStateDiscrepancy(currentState: any, checkpoint: any): boolean {
    if (!checkpoint) return false;
    
    const isDifferent = (a: any, b: any) => {
        if (a === b) return false;
        if (!a !== !b) return true;
        try {
            return JSON.stringify(a) !== JSON.stringify(b);
        } catch {
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

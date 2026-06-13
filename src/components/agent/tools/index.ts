import { GLOBAL_TOOLS, GLOBAL_TOOLS_PROMPT } from "./global";
import { BULK_RUNNER_TOOLS, BULK_RUNNER_TOOLS_PROMPT } from "./bulk-runner";
import { API_CLIENT_TOOLS, API_CLIENT_TOOLS_PROMPT } from "./api-client";
import { store } from "@/lib/store";

function filterToolPrompts(prompt: string): string {
    const state = store.state;
    const activeProfile = state.agentProfiles?.find(p => p.id === state.activeAgentProfileId) || state.agentProfiles?.[0];
    if (!activeProfile?.allowedTools) return prompt;
    
    const allowedNames = activeProfile.allowedTools;
    const lines = prompt.split("\n");
    const filteredLines: string[] = [];
    let keeping = true;
    
    for (const line of lines) {
        const trimmed = line.trim();
        const isHeader = /^[a-z_]+$/.test(trimmed) && trimmed.length > 0;
        
        if (isHeader) {
            keeping = allowedNames.includes(trimmed);
        }
        
        if (keeping) {
            filteredLines.push(line);
        }
    }
    
    return filteredLines.join("\n");
}

export function getAgentTools(currentView: "bulk" | "api_client") {
    const tools: any[] = [...GLOBAL_TOOLS];
    
    if (currentView === "bulk") {
        tools.push(...BULK_RUNNER_TOOLS);
    } else if (currentView === "api_client") {
        tools.push(...API_CLIENT_TOOLS);
    }
    
    const state = store.state;
    const activeProfile = state.agentProfiles?.find(p => p.id === state.activeAgentProfileId) || state.agentProfiles?.[0];
    if (activeProfile?.allowedTools) {
        return tools.filter(t => activeProfile.allowedTools!.includes(t.function.name));
    }
    
    return tools;
}

export function getAgentToolsPrompt(currentView: "bulk" | "api_client"): string {
    let prompt = GLOBAL_TOOLS_PROMPT;
    
    if (currentView === "bulk") {
        prompt += "\n" + BULK_RUNNER_TOOLS_PROMPT;
    } else if (currentView === "api_client") {
        prompt += "\n" + API_CLIENT_TOOLS_PROMPT;
    }
    
    return filterToolPrompts(prompt);
}

export function getToolDisplayName(name: string): string {
    const names: Record<string, string> = {
        check_extension_connection: "Check Extension Connection",
        switch_tab: "Switch Tab",
        read_console_logs: "Read Console Logs",
        get_row_status: "Get Row Execution Status",
        search_data: "Search Input Dataset",
        read_row_data: "Read Row Data",
        inspect_input_data: "Inspect Input Dataset",
        get_execution_config: "Get Execution Config",
        simulate_row_execution: "Simulate Row Execution",
        update_execution_config: "Update Execution Config",
        update_row_data: "Update Row Data",
        get_available_variables: "Get Available Variables",
        get_column_mappings: "Get Column Mappings",
        update_column_mappings: "Update Column Mappings",
        get_table_filters: "Get Table Filters",
        update_table_filters: "Update Table Filters",
        export_results_to_excel: "Export Results to Excel",
        get_all_results: "Get All Execution Results",
        export_workspace: "Export Workspace",
        run_bulk_engine: "Run Bulk Engine",
        get_collections: "Get Collections List",
        save_requests: "Save/Update Requests",
        get_environments: "Get Environments List",
        create_environment: "Create Environment",
        update_environment: "Update Environment",
        get_open_tabs: "Get Open Tabs",
        send_request: "Send API Request",
        select_active_item: "Select Active Item",
        modify_collections: "Modify Collection Structure"
    };
    return names[name] || name;
}

export function getAllAgentTools() {
    const tools = [...GLOBAL_TOOLS, ...BULK_RUNNER_TOOLS, ...API_CLIENT_TOOLS];
    const state = store.state;
    const activeProfile = state.agentProfiles?.find(p => p.id === state.activeAgentProfileId) || state.agentProfiles?.[0];
    if (activeProfile?.allowedTools) {
        return tools.filter(t => activeProfile.allowedTools!.includes(t.function.name));
    }
    return tools;
}

export function getAllAgentToolsPrompt(): string {
    return filterToolPrompts(GLOBAL_TOOLS_PROMPT + "\n" + BULK_RUNNER_TOOLS_PROMPT + "\n" + API_CLIENT_TOOLS_PROMPT);
}

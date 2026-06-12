import { GLOBAL_TOOLS, GLOBAL_TOOLS_PROMPT } from "./global";
import { BULK_RUNNER_TOOLS, BULK_RUNNER_TOOLS_PROMPT } from "./bulk-runner";
import { API_CLIENT_TOOLS, API_CLIENT_TOOLS_PROMPT } from "./api-client";

export function getAgentTools(currentView: "bulk" | "api_client") {
    const tools: any[] = [...GLOBAL_TOOLS];
    
    if (currentView === "bulk") {
        tools.push(...BULK_RUNNER_TOOLS);
    } else if (currentView === "api_client") {
        tools.push(...API_CLIENT_TOOLS);
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
    
    return prompt;
}

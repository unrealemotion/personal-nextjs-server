import { SURGE_DOCUMENTATION } from "@/lib/surge-docs";
import { getAgentToolsPrompt } from "./tools";

export const DEFAULT_CONFIGS: Record<"gemini" | "openai" | "custom", { endpoint: string; model: string }> = {
    gemini: {
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/",
        model: "gemini-2.5-flash"
    },
    openai: {
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o-mini"
    },
    custom: {
        endpoint: "http://localhost:11434/v1",
        model: "llama3"
    }
};

export const WELCOME_MESSAGE = `👋 Hello! I am your Surge AI agent. I can help you manage and troubleshoot your bulk API workflows.

Here is what I can do:
- **Troubleshoot Failures**: Diagnose errors and run test requests to inspect server responses.
- **Adjust Requests & Settings**: Update URLs, headers, concurrency, retries, and rate limits.
- **Manage Data & Variables**: Search your CSV/Excel dataset, correct typos, and map variables.
- **Configure & Export Grid**: Set table columns, apply filters, and export results to Excel.
- **Verify Extension**: Ensure the [Chrome Extension Helper](https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf) is active to bypass CORS rules.

How can I help you today?`;

export const AGENT_SYSTEM_PROMPT = `You are a helpful AI Agent for Surge API Workspace, a browser-based bulk API orchestrator.
You help users inspect dataset rows, examine execution configurations, troubleshoot failed API runs, map variables, configure result columns, filter/sort results, and export them to Excel.

You have access to the following tools. For each tool, here are its capabilities, scenarios where you must use it, and best practices for combining them:

{{TOOL_PROMPTS}}

Provide direct, short, actionable suggestions. Code blocks and Markdown are fully supported.

---
SURGE API WORKSPACE DOCUMENTATION & REFERENCE MANUAL:
${SURGE_DOCUMENTATION}
`;

export function getAgentSystemPrompt(currentView: "bulk" | "api_client"): string {
    const tabName = currentView === "api_client" ? "API Client" : "Bulk Runner";
    const tabContext = `
---
CURRENT WORKSPACE TAB:
You are currently on the "${tabName}" tab.

IMPORTANT:
- If the user asks you to perform an action that requires tools from a different tab (e.g., bulk operations while on the API Client tab), you must use the 'switch_tab' tool to switch to the correct tab first. After switching, the required tools will become available to you, and you can continue fulfilling the user's request.
`;

    const toolPrompts = getAgentToolsPrompt(currentView);
    const finalSystemPrompt = AGENT_SYSTEM_PROMPT.replace("{{TOOL_PROMPTS}}", toolPrompts);

    return `${finalSystemPrompt}\n${tabContext}`;
}

